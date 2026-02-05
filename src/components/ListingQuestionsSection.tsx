import { useCallback, useEffect, useMemo, useRef, useState } from 'react'
import Button from './Button'
import { useAuth } from '../context/AuthContext'
import { getSupabaseClient, supabaseEnabled } from '../services/supabase'
import {
  answerListingQuestion,
  deleteListingQuestion,
  clearListingAnswer,
  askListingQuestion,
  fetchListingQuestions,
  notifyListingQuestionEvent,
} from '../services/listingQuestions'
import type { Listing, ListingQuestion } from '../types'
import { useToast } from '../context/ToastContext'
import { formatNameWithInitial } from '../utils/user'
import { fetchUserDisplayNames } from '../services/users'
import { containsPhoneLike } from '../utils/moderation'

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
  const { user, isModerator } = useAuth()
  const { show: showToast } = useToast()
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
  const [moderating, setModerating] = useState<Record<string, boolean>>({})

  const isSeller = user?.id === listing.sellerId
  const canAsk = Boolean(user && !isSeller && !listingUnavailable && supabaseEnabled)
  const requiresLoginToAsk = !user && supabaseEnabled && !listingUnavailable
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
    if (!supabaseEnabled) {
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
  }, [ensureUserNames, listing.id])

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
    if (!supabaseEnabled) return
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
  }, [listing.id, loadQuestions])

  const handleAsk = async (event: React.FormEvent) => {
    event.preventDefault()
    if (!supabaseEnabled) return
    if (!user) {
      setQuestionError('Necesitás iniciar sesión para preguntar.')
      return
    }
    const text = questionDraft.trim()
    if (text.length < MIN_QUESTION_LENGTH) {
      setQuestionError('Escribí una consulta un poco más detallada.')
      return
    }
    if (containsPhoneLike(text)) {
      setQuestionError('No publiques teléfonos ni WhatsApp. Usá los botones de contacto del aviso.')
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
        showToast('Consulta enviada')
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
    if (containsPhoneLike(text)) {
      setAnswerErrors((prev) => ({ ...prev, [questionId]: 'No compartas teléfonos. Usá los botones de contacto.' }))
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
        showToast('Respuesta publicada')
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

  const handleModeratorDeleteQuestion = async (questionId: string) => {
    if (!supabaseEnabled) return
    const proceed = window.confirm('¿Eliminar definitivamente esta consulta?')
    if (!proceed) return
    setModerating((p) => ({ ...p, [questionId]: true }))
    try {
      // Notificar antes de borrar, y esperar para evitar 404 en el backend
      await notifyListingQuestionEvent(questionId, 'moderator_deleted_question')
      await deleteListingQuestion(questionId)
      setQuestions((prev) => prev.filter((q) => q.id !== questionId))
    } catch (err) {
      console.warn('[listing-questions] moderator delete failed', err)
    } finally {
      setModerating((p) => ({ ...p, [questionId]: false }))
    }
  }

  const handleModeratorClearAnswer = async (questionId: string) => {
    if (!supabaseEnabled) return
    const proceed = window.confirm('¿Eliminar la respuesta del vendedor para esta consulta?')
    if (!proceed) return
    setModerating((p) => ({ ...p, [questionId]: true }))
    try {
      const updated = await clearListingAnswer(questionId)
      if (updated) {
        setQuestions((prev) => prev.map((q) => (q.id === questionId ? updated : q)))
      }
      void notifyListingQuestionEvent(questionId, 'moderator_cleared_answer')
    } catch (err) {
      console.warn('[listing-questions] moderator clear answer failed', err)
    } finally {
      setModerating((p) => ({ ...p, [questionId]: false }))
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
    <section className="rounded-2xl border border-gray-200 bg-white p-6">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <h2 className="text-lg font-semibold text-gray-900">Consultas sobre esta bici</h2>
        {supabaseEnabled && (
          <span className="text-xs font-medium uppercase tracking-wide text-gray-500">
            Responde el vendedor
          </span>
        )}
      </div>

      {!supabaseEnabled && (
        <p className="mt-4 text-sm text-gray-600">
          Pronto vas a poder dejar consultas públicas para el vendedor. Mientras tanto, usá el
          botón de WhatsApp o correo para contactarlo.
        </p>
      )}

      {supabaseEnabled && (
        <>
          <div className="mt-4 space-y-3">
            {canAsk && (
              <form onSubmit={handleAsk} className="space-y-3">
                <label className="text-sm font-medium text-gray-900">¿Tenés una duda?</label>
                <textarea
                  className="input h-28 resize-none"
                  placeholder="Preguntale al vendedor (no compartas teléfonos; usá los botones de contacto)"
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
                  <span className="text-xs text-gray-500">
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

            {!canAsk && requiresLoginToAsk && (
              <div className="rounded-xl border border-gray-200 bg-gray-50 p-4 text-sm text-gray-700">
                <p className="font-semibold text-gray-900">Iniciá sesión para preguntar</p>
                <p className="mt-1">Crear una cuenta es gratis y podés preguntar sin compartir tu teléfono.</p>
                <div className="mt-3 flex gap-2">
                  <Button to="/login" variant="secondary" className="px-3 py-1 text-sm">Ingresar</Button>
                  <Button to="/register" className="px-3 py-1 text-sm">Crear cuenta</Button>
                </div>
              </div>
            )}

            {/* Aviso de login unificado más abajo (para ver y hacer consultas) */}

            {askingDisabledReason && (
              <div className="rounded-xl border border-gray-200 bg-white p-3 text-sm text-gray-600">
                {askingDisabledReason}
              </div>
            )}
          </div>

          {supabaseEnabled && (
	          <div className="mt-6 space-y-6">
	            {loading && <p className="text-sm text-gray-500">Cargando consultas…</p>}

	            {!loading && sortedQuestions.length === 0 && (
	              <p className="text-sm text-gray-500">
	                Todavía no hay consultas públicas. ¡Sé el primero en preguntar!
	              </p>
	            )}

            {pendingQuestions.length > 0 && (
              <div className="space-y-4">
                {pendingQuestions.map((question) => {
                  const questionerFullName = resolveFullName(question.questionerId, question.questionerName ?? null)
	                  return (
	                    <div key={question.id} className="rounded-2xl bg-gray-100 p-4">
	                      <p className="text-xs font-semibold text-gray-900">
	                        {displayQuestionerName(questionerFullName)}
	                        <span className="ml-2 text-xs font-normal text-gray-500">
	                          {relativeTimeFromNow(question.createdAt)}
	                        </span>
	                      </p>
	                      <p className="mt-2 whitespace-pre-wrap text-sm text-gray-700">
	                        {question.questionBody}
	                      </p>
	                      {isSeller ? (
	                        <div className="mt-3 space-y-2 rounded-2xl border border-gray-200 bg-white p-3">
	                          <textarea
	                            className="input h-24 resize-none"
	                            placeholder="Escribí tu respuesta pública (no compartas teléfonos; usá los botones de contacto)"
                            value={answerDrafts[question.id] ?? ''}
                            onChange={(event) => handleAnswerChange(question.id, event.target.value)}
                            maxLength={600}
                            disabled={answerSubmitting[question.id]}
                          />
	                          {answerErrors[question.id] && (
	                            <p className="text-sm text-red-600">{answerErrors[question.id]}</p>
	                          )}
	                          <div className="flex items-center justify-end gap-3">
	                            <span className="text-xs text-gray-500">
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
	                        <p className="mt-3 text-xs text-gray-500">
	                          El vendedor responderá en esta sección.
	                        </p>
	                      )}
                      {isModerator && (
                        <div className="mt-3 flex items-center justify-end gap-2">
                          <Button
                            type="button"
                            variant="secondary"
                            className="px-3 py-1 text-xs"
                            disabled={moderating[question.id]}
                            onClick={() => void handleModeratorDeleteQuestion(question.id)}
                          >
                            Eliminar consulta
                          </Button>
                        </div>
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
	                    <div key={question.id} className="space-y-2">
	                      <div className="rounded-2xl bg-gray-100 p-4">
	                        <p className="text-xs font-semibold text-gray-900">
	                          {displayQuestionerName(questionerFullName)}
	                          <span className="ml-2 text-xs font-normal text-gray-500">
	                            {relativeTimeFromNow(question.createdAt)}
	                          </span>
	                        </p>
	                        <p className="mt-2 whitespace-pre-wrap text-sm text-gray-700">
	                          {question.questionBody}
	                        </p>
	                      </div>
	                      <div className="rounded-2xl border border-gray-200 bg-white p-4">
	                        <div className="flex flex-wrap items-center justify-between gap-2">
	                          <p className="text-xs font-semibold uppercase tracking-wide text-gray-600">
	                            Respuesta del vendedor
	                          </p>
	                          <p className="text-xs text-gray-500">
	                            {relativeTimeFromNow(question.answeredAt)}
	                          </p>
	                        </div>
	                        <p className="mt-2 whitespace-pre-wrap text-sm text-gray-800">
	                          {question.answerBody}
	                        </p>
	                        <p className="mt-2 text-xs text-gray-500">
	                          {displayAnswerAuthor(answerFullName, listing.sellerName)}
	                        </p>
	                        {isModerator && (
	                          <div className="mt-2 flex items-center justify-end gap-2">
	                            <Button
	                              type="button"
	                              variant="secondary"
	                              className="px-3 py-1 text-xs"
	                              disabled={moderating[question.id]}
	                              onClick={() => void handleModeratorClearAnswer(question.id)}
	                            >
	                              Eliminar respuesta
	                            </Button>
	                            <Button
	                              type="button"
	                              variant="secondary"
	                              className="px-3 py-1 text-xs text-red-700"
	                              disabled={moderating[question.id]}
	                              onClick={() => void handleModeratorDeleteQuestion(question.id)}
	                            >
	                              Eliminar consulta
	                            </Button>
	                          </div>
	                        )}
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
