import { useCallback, useEffect, useMemo, useState } from 'react'
import Button from './Button'
import { useAuth } from '../context/AuthContext'
import { getSupabaseClient, supabaseEnabled } from '../services/supabase'
import {
  answerListingQuestion,
  askListingQuestion,
  fetchListingQuestions,
} from '../services/listingQuestions'
import type { Listing, ListingQuestion } from '../types'
import { formatNameWithInitial } from '../utils/user'

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

function displayQuestionerName(question: ListingQuestion): string {
  if (question.questionerName && question.questionerName.trim()) {
    return formatNameWithInitial(question.questionerName, null)
  }
  return 'Comprador'
}

function displayAnswerAuthor(question: ListingQuestion, fallback?: string): string {
  if (question.answerAuthorName && question.answerAuthorName.trim()) {
    return formatNameWithInitial(question.answerAuthorName, null)
  }
  if (fallback && fallback.trim()) {
    return formatNameWithInitial(fallback, null)
  }
  return 'Vendedor'
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

  const isSeller = user?.id === listing.sellerId
  const canAsk = Boolean(user && !isSeller && !listingUnavailable && supabaseEnabled)
  const requiresLoginToAsk = !user && !listingUnavailable && supabaseEnabled
  const askingDisabledReason = useMemo(() => {
    if (listingUnavailable) return 'La publicación ya no está activa.'
    if (!supabaseEnabled) return 'Las consultas estarán disponibles pronto.'
    return null
  }, [listingUnavailable])

  const sortedQuestions = useMemo(
    () => [...questions].sort((a, b) => a.createdAt - b.createdAt),
    [questions]
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
    } finally {
      setLoading(false)
    }
  }, [listing.id])

  useEffect(() => {
    void loadQuestions()
  }, [loadQuestions])

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
        setQuestions((prev) => [...prev, created])
        setQuestionDraft('')
      }
    } catch (error: any) {
      console.warn('[listing-questions] ask error', error)
      setQuestionError('No pudimos enviar tu consulta. Intentá nuevamente.')
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
        setQuestions((prev) => prev.map((item) => (item.id === questionId ? updated : item)))
        setAnswerDrafts((prev) => ({ ...prev, [questionId]: '' }))
      }
    } catch (error: any) {
      console.warn('[listing-questions] answer error', error)
      setAnswerErrors((prev) => ({
        ...prev,
        [questionId]: 'No pudimos publicar la respuesta. Intentá nuevamente.',
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

            {requiresLoginToAsk && (
              <div className="rounded-xl border border-[#14212e]/10 bg-[#f4f7fb] p-4 text-sm text-[#14212e]/70">
                <p className="font-medium text-[#14212e]">Ingresá para preguntar</p>
                <p className="mt-1">
                  Iniciá sesión o registrate para dejar una consulta al vendedor.
                </p>
                <div className="mt-3 flex gap-2">
                  <Button to="/login" variant="secondary" className="px-3 py-1 text-sm">
                    Iniciar sesión
                  </Button>
                  <Button to="/register" className="px-3 py-1 text-sm">
                    Crear cuenta
                  </Button>
                </div>
              </div>
            )}

            {askingDisabledReason && (
              <div className="rounded-xl border border-[#14212e]/10 bg-white/80 p-3 text-sm text-[#14212e]/60">
                {askingDisabledReason}
              </div>
            )}
          </div>

          <div className="mt-6 space-y-6">
            {loading && <p className="text-sm text-[#14212e]/60">Cargando consultas…</p>}

            {!loading && sortedQuestions.length === 0 && (
              <p className="text-sm text-[#14212e]/60">
                Todavía no hay consultas públicas. ¡Sé el primero en preguntar!
              </p>
            )}

            {pendingQuestions.length > 0 && (
              <div className="space-y-4">
                {pendingQuestions.map((question) => (
                  <div key={question.id} className="rounded-2xl border border-[#14212e]/10 bg-white/90 p-4">
                    <p className="text-sm font-semibold text-[#14212e]">
                      {displayQuestionerName(question)}
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
                ))}
              </div>
            )}

            {answeredQuestions.length > 0 && (
              <div className="space-y-4">
                {answeredQuestions.map((question) => (
                  <div key={question.id} className="rounded-2xl border border-[#14212e]/10 bg-white p-4">
                    <p className="text-sm font-semibold text-[#14212e]">
                      {displayQuestionerName(question)}
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
                        {displayAnswerAuthor(question, listing.sellerName)}
                      </p>
                    </div>
                  </div>
                ))}
              </div>
            )}
          </div>
        </>
      )}
    </section>
  )
}

