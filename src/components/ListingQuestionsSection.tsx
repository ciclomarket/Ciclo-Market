import { useCallback, useEffect, useMemo, useRef, useState } from 'react'
import Button from './Button'
import { useAuth } from '../context/AuthContext'
import { getSupabaseClient, supabaseEnabled } from '../services/supabase'
import {
  answerListingQuestion,
  askListingQuestion,
  fetchListingQuestions,
  notifyListingQuestionEvent,
} from '../services/listingQuestions'
import type { Listing, ListingQuestion } from '../types'
import { formatNameWithInitial } from '../utils/user'
import { fetchUserDisplayNames } from '../services/users'

type Props = {
  listing: Listing
  listingUnavailable?: boolean
}

const MIN_QUESTION_LENGTH = 5
const MIN_ANSWER_LENGTH = 2

function relativeTimeFromNow(timestamp?: number | null): string {
  if (!timestamp) return ''
  const now = Date.now()
  const diffMs = now - timestamp
  if (diffMs < 0) return 'recién'
  const diffMinutes = Math.round(diffMs / 60000)
  if (diffMinutes < 1) return 'recién'
  if (diffMinutes < 60) return `hace ${diffMinutes} min`
  const diffHours = Math.round(diffMinutes / 60)
  if (diffHours < 24) return `hace ${diffHours} h`
  const diffDays = Math.round(diffHours / 24)
  if (diffDays === 1) return 'ayer'
  if (diffDays < 30) return `hace ${diffDays} días`
  const diffMonths = Math.round(diffDays / 30)
  if (diffMonths < 12) return `hace ${diffMonths} meses`
  const diffYears = Math.round(diffMonths / 12)
  return `hace ${diffYears} años`
}

function displayQuestionerName(fullName?: string | null): string {
  if (fullName && fullName.trim()) {
    return formatNameWithInitial(fullName, null)
  }
  return 'Comprador'
}

function displayAnswerAuthor(fullName?: string | null, fallback?: string | null): string {
  const base = (fullName && fullName.trim()) || (fallback && fallback.trim()) || ''
  if (!base) return 'Vendedor'
  return formatNameWithInitial(base, null)
}

export default function ListingQuestionsSection({ listing, listingUnavailable }: Props) {
  const { user } = useAuth()
  const [questions, setQuestions] = useState<ListingQuestion[]>([])
  const [loading, setLoading] = useState(true)
  const [questionDraft, setQuestionDraft] = useState('')
  const [questionError, setQuestionError] = useState<string | null>(null)
  const [questionSubmitting, setQuestionSubmitting] = useState(false)
  const [answerDrafts, setAnswerDrafts] = useState<Record<string, string>>({})
  const [answerSubmitting, setAnswerSubmitting] = useState<Record<string, boolean>>({})
  const [answerErrors, setAnswerErrors] = useState<Record<string, string | null>>({})
  const [userNames, setUserNames] = useState<Record<string, string>>({})
  const userNamesRef = useRef<Record<string, string>>({})

  const isSeller = user?.id === listing.sellerId
  const canAsk = Boolean(user && !isSeller && !listingUnavailable && supabaseEnabled)
  const canViewQuestions = Boolean(user && supabaseEnabled)
  const requiresLoginToView = !user && supabaseEnabled
  const askingDisabledReason = useMemo(() => {
    if (listingUnavailable) return 'La publicación ya no está activa.'
    if (!supabaseEnabled) return 'Las consultas estarán disponibles pronto.'
    return null
  }, [listingUnavailable, supabaseEnabled])

  const sortedQuestions = useMemo(
    () => [...questions].sort((a, b) => a.createdAt - b.createdAt),
    [questions]
  )

  const ensureUserNames = useCallback(
    async (ids: Array<string | null | undefined>) => {
      if (!supabaseEnabled) return
      const lookup = userNamesRef.current
      const missing = Array.from(
        new Set(
          ids
            .filter((id): id is string => Boolean(id))
        )
      ).filter((id) => !lookup[id])
      if (!missing.length) return
      const fetched = await fetchUserDisplayNames(missing)
      if (Object.keys(fetched).length > 0) {
        setUserNames((prev) => ({ ...prev, ...fetched }))
      }
    },
    []
  )

  const loadQuestions = useCallback(async () => {
    if (!supabaseEnabled || !user) {
      setQuestions([])
      setLoading(false)
      return
    }
    setLoading(true)
    try {
      const data = await fetchListingQuestions(listing.id)
      setQuestions(data)
      const ids = data.flatMap((item) =>
        [item.questionerId, item.answerAuthorId].filter((id): id is string => Boolean(id))
      )
      if (ids.length) {
        void ensureUserNames(ids)
      }
    } finally {
      setLoading(false)
    }
  }, [ensureUserNames, listing.id, !!user])

  useEffect(() => {
    void loadQuestions()
  }, [loadQuestions])

  useEffect(() => {
    if (!listing?.sellerId) return
    if (!listing.sellerName) return
    setUserNames((prev) => {
      if (prev[listing.sellerId]) return prev
      return { ...prev, [listing.sellerId]: listing.sellerName ?? '' }
    })
  }, [listing?.sellerId, listing?.sellerName])

  const resolveFullName = useCallback(
    (id?: string | null, fallback?: string | null) => {
      if (!id) return fallback ?? null
      const stored = userNamesRef.current[id]
      if (stored && stored.trim()) return stored
      return fallback ?? null
    },
    []
  )

  useEffect(() => {
    if (!supabaseEnabled || !user) return
    const supabase = getSupabaseClient()
    const channel = supabase
      .channel(`listing-questions-${listing.id}`)
      .on(
        'postgres_changes',
        { event: '*', schema: 'public', table: 'listing_questions', filter: `listing_id=eq.${listing.id}` },
        () => {
          void loadQuestions()
        }
      )
      .subscribe()

    return () => {
      void supabase.removeChannel(channel)
    }
  }, [listing.id, loadQuestions, !!user])

  const handleAsk = async (event: React.FormEvent) => {
    event.preventDefault()
    if (!supabaseEnabled) return
    const text = questionDraft.trim()
    if (text.length < MIN_QUESTION_LENGTH) {
      setQuestionError('Escribí una consulta un poco más detallada.')
      return
    }
    setQuestionSubmitting(true)
    setQuestionError(null)
    try {
      const created = await askListingQuestion(listing.id, text)
      if (created) {
        const rawUserName =
          (typeof user?.user_metadata?.full_name === 'string' && user.user_metadata.full_name.trim()) ||
          (typeof user?.user_metadata?.name === 'string' && user.user_metadata.name.trim()) ||
          null
        const enriched: ListingQuestion = {
          ...created,
          questionerName: rawUserName ?? created.questionerName ?? null,
        }
        setQuestions((prev) => (prev.some((q) => q.id === enriched.id) ? prev : [...prev, enriched]))
        if (user?.id && rawUserName) {
          setUserNames((prev) => (prev[user.id] ? prev : { ...prev, [user.id]: rawUserName }))
        }
        setQuestionDraft('')
        void notifyListingQuestionEvent(created.id, 'asked')
        const idsToEnsure = [created.questionerId, created.answerAuthorId].filter(
          (id): id is string => Boolean(id)
        )
        if (idsToEnsure.length) {
          void ensureUserNames(idsToEnsure)
        }
      }
    } catch (error: any) {
      console.warn('[listing-questions] ask error', error)
      const message =
        typeof error?.message === 'string' && error.message.trim()
          ? error.message.trim()
          : 'No pudimos enviar tu consulta. Intentá nuevamente.'
      setQuestionError(message)
    } finally {
      setQuestionSubmitting(false)
    }
  }

  const handleAnswerChange = (questionId: string, value: string) => {
    setAnswerDrafts((prev) => ({ ...prev, [questionId]: value }))
    setAnswerErrors((prev) => ({ ...prev, [questionId]: null }))
  }

  const handleAnswerSubmit = async (questionId: string) => {
    if (!supabaseEnabled) return
    const text = (answerDrafts[questionId] ?? '').trim()
    if (text.length < MIN_ANSWER_LENGTH) {
      setAnswerErrors((prev) => ({ ...prev, [questionId]: 'Escribí una respuesta.' }))
      return
    }
    setAnswerSubmitting((prev) => ({ ...prev, [questionId]: true }))
    setAnswerErrors((prev) => ({ ...prev, [questionId]: null }))
    try {
      const updated = await answerListingQuestion(questionId, text)
      if (updated) {
        const enriched: ListingQuestion = {
          ...updated,
          answerAuthorName: resolveFullName(updated.answerAuthorId, listing.sellerName ?? null),
        }
        setQuestions((prev) => prev.map((item) => (item.id === questionId ? enriched : item)))
        if (updated.answerAuthorId && listing.sellerName) {
          const authorId: string = updated.answerAuthorId as string
          const sellerName: string = listing.sellerName as string
          setUserNames((prev) => (prev[authorId] ? prev : { ...prev, [authorId]: sellerName }))
        }
        setAnswerDrafts((prev) => ({ ...prev, [questionId]: '' }))
        void notifyListingQuestionEvent(updated.id, 'answered')
        const idsToEnsure = [updated.answerAuthorId].filter((id): id is string => Boolean(id))
        if (idsToEnsure.length) {
          void ensureUserNames(idsToEnsure)
        }
      }
    } catch (error: any) {
      console.warn('[listing-questions] answer error', error)
      const message =
        typeof error?.message === 'string' && error.message.trim()
          ? error.message.trim()
          : 'No pudimos publicar la respuesta. Intentá nuevamente.'
      setAnswerErrors((prev) => ({
        ...prev,
        [questionId]: message,
      }))
    } finally {
      setAnswerSubmitting((prev) => ({ ...prev, [questionId]: false }))
    }
  }

  const pendingQuestions = useMemo(
    () => sortedQuestions.filter((item) => !item.answerBody),
    [sortedQuestions]
  )

  const answeredQuestions = useMemo(
    () => sortedQuestions.filter((item) => Boolean(item.answerBody)),
    [sortedQuestions]
  )

  useEffect(() => {
    userNamesRef.current = userNames
  }, [userNames])

  return (
    <section className="card p-6">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <h2 className="text-lg font-semibold text-[#14212e]">Consultas sobre esta bici</h2>
        {supabaseEnabled && (
          <span className="text-xs font-medium uppercase tracking-wide text-[#14212e]/50">
            Responde el vendedor
          </span>
        )}
      </div>

      {!supabaseEnabled && (
        <p className="mt-4 text-sm text-[#14212e]/70">
          Pronto vas a poder dejar consultas públicas para el vendedor. Mientras tanto, usá el
          botón de WhatsApp o correo para contactarlo.
        </p>
      )}

      {supabaseEnabled && (
        <>
          <div className="mt-4 space-y-3">
            {canAsk && (
              <form onSubmit={handleAsk} className="space-y-3">
                <label className="text-sm font-medium text-[#14212e]">¿Tenés una duda?</label>
                <textarea
                  className="input h-28 resize-none"
                  placeholder="Preguntale al vendedor sobre el estado, componentes, envío, etc."
                  value={questionDraft}
                  onChange={(event) => {
                    setQuestionDraft(event.target.value)
                    if (questionError) setQuestionError(null)
                  }}
                  maxLength={400}
                  disabled={questionSubmitting}
                />
                {questionError && <p className="text-sm text-red-600">{questionError}</p>}
                <div className="flex items-center justify-end gap-3">
                  <span className="text-xs text-[#14212e]/50">
                    {questionDraft.trim().length}/{400}
                  </span>
                  <Button
                    type="submit"
                    disabled={questionSubmitting || questionDraft.trim().length < MIN_QUESTION_LENGTH}
                    className="px-4 py-2"
                  >
                    {questionSubmitting ? 'Enviando…' : 'Publicar consulta'}
                  </Button>
                </div>
              </form>
            )}

            {/* Aviso de login unificado más abajo (para ver y hacer consultas) */}

            {askingDisabledReason && (
              <div className="rounded-xl border border-[#14212e]/10 bg-white/80 p-3 text-sm text-[#14212e]/60">
                {askingDisabledReason}
              </div>
            )}
          </div>

          {requiresLoginToView && (
            <div className="mt-6">
              <div className="rounded-xl border border-[#14212e]/10 bg-[#f4f7fb] p-4 text-sm text-[#14212e]/70">
                <p className="font-medium text-[#14212e]">Ingresá o registrate para ver y hacer consultas</p>
                <p className="mt-1">Para ver o hacer una consulta, iniciá sesión o creá una cuenta.</p>
                <div className="mt-3 flex gap-2">
                  <Button to="/login" variant="secondary" className="px-3 py-1 text-sm">Iniciar sesión</Button>
                  <Button to="/register" className="px-3 py-1 text-sm">Crear cuenta</Button>
                </div>
              </div>
              <div className="relative mt-4">
                <div className="space-y-4 filter blur-sm pointer-events-none select-none">
                  {Array.from({ length: 3 }).map((_, i) => (
                    <div key={i} className="rounded-2xl border border-[#14212e]/10 bg-white p-4">
                      <div className="flex items-center gap-2">
                        <div className="h-3 w-28 rounded bg-[#14212e]/10" />
                        <div className="h-3 w-12 rounded bg-[#14212e]/10" />
                      </div>
                      <div className="mt-2 h-4 w-3/4 rounded bg-[#14212e]/10" />
                      <div className="mt-2 h-16 w-full rounded bg-[#14212e]/10" />
                    </div>
                  ))}
                </div>
                <div className="pointer-events-none absolute inset-0 flex items-center justify-center">
                  <div className="rounded-lg border border-[#14212e]/10 bg-white/80 px-3 py-1 text-xs text-[#14212e]/70">
                    Ingresá o registrate para ver las consultas completas
                  </div>
                </div>
              </div>
            </div>
          )}

          {canViewQuestions && (
          <div className="mt-6 space-y-6">
            {loading && <p className="text-sm text-[#14212e]/60">Cargando consultas…</p>}

            {!loading && sortedQuestions.length === 0 && (
              <p className="text-sm text-[#14212e]/60">
                Todavía no hay consultas públicas. ¡Sé el primero en preguntar!
              </p>
            )}

            {pendingQuestions.length > 0 && (
              <div className="space-y-4">
                {pendingQuestions.map((question) => {
                  const questionerFullName = resolveFullName(question.questionerId, question.questionerName ?? null)
                  return (
                    <div key={question.id} className="rounded-2xl border border-[#14212e]/10 bg-white/90 p-4">
                      <p className="text-sm font-semibold text-[#14212e]">
                        {displayQuestionerName(questionerFullName)}
                        <span className="ml-2 text-xs font-normal text-[#14212e]/50">
                          {relativeTimeFromNow(question.createdAt)}
                        </span>
                      </p>
                      <p className="mt-2 whitespace-pre-wrap text-sm text-[#14212e]/80">
                        {question.questionBody}
                      </p>
                      {isSeller ? (
                        <div className="mt-3 space-y-2">
                          <textarea
                            className="input h-24 resize-none"
                            placeholder="Escribí tu respuesta pública"
                            value={answerDrafts[question.id] ?? ''}
                            onChange={(event) => handleAnswerChange(question.id, event.target.value)}
                            maxLength={600}
                            disabled={answerSubmitting[question.id]}
                          />
                          {answerErrors[question.id] && (
                            <p className="text-sm text-red-600">{answerErrors[question.id]}</p>
                          )}
                          <div className="flex items-center justify-end gap-3">
                            <span className="text-xs text-[#14212e]/50">
                              {(answerDrafts[question.id] ?? '').trim().length}/{600}
                            </span>
                            <Button
                              type="button"
                              onClick={() => void handleAnswerSubmit(question.id)}
                              disabled={
                                answerSubmitting[question.id] ||
                                (answerDrafts[question.id] ?? '').trim().length < MIN_ANSWER_LENGTH
                              }
                              className="px-4 py-2"
                            >
                              {answerSubmitting[question.id] ? 'Publicando…' : 'Responder'}
                            </Button>
                          </div>
                        </div>
                      ) : (
                        <p className="mt-3 text-xs text-[#14212e]/50">
                          El vendedor responderá en esta sección.
                        </p>
                      )}
                    </div>
                  )
                })}
              </div>
            )}

            {answeredQuestions.length > 0 && (
              <div className="space-y-4">
                {answeredQuestions.map((question) => {
                  const questionerFullName = resolveFullName(question.questionerId, question.questionerName ?? null)
                  const answerFullName = resolveFullName(
                    question.answerAuthorId,
                    question.answerAuthorName ?? listing.sellerName ?? null
                  )
                  return (
                    <div key={question.id} className="rounded-2xl border border-[#14212e]/10 bg-white p-4">
                      <p className="text-sm font-semibold text-[#14212e]">
                        {displayQuestionerName(questionerFullName)}
                        <span className="ml-2 text-xs font-normal text-[#14212e]/50">
                          {relativeTimeFromNow(question.createdAt)}
                        </span>
                      </p>
                      <p className="mt-2 whitespace-pre-wrap text-sm text-[#14212e]/80">
                        {question.questionBody}
                      </p>
                      <div className="mt-3 rounded-2xl bg-[#14212e]/5 p-3">
                        <p className="text-xs font-semibold uppercase tracking-wide text-[#14212e]/70">
                          Respuesta del vendedor · {relativeTimeFromNow(question.answeredAt)}
                        </p>
                        <p className="mt-2 whitespace-pre-wrap text-sm text-[#14212e]/90">
                          {question.answerBody}
                        </p>
                        <p className="mt-2 text-xs text-[#14212e]/50">
                          {displayAnswerAuthor(answerFullName, listing.sellerName)}
                        </p>
                      </div>
                    </div>
                  )
                })}
              </div>
            )}
          </div>
          )}
        </>
      )}
    </section>
  )
}
