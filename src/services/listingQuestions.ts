import { getSupabaseClient, supabaseEnabled } from './supabase'
import type { ListingQuestion } from '../types'

const API_BASE = (import.meta.env.VITE_API_BASE_URL || '').replace(/\/$/, '')

type ListingQuestionRow = {
  id: string
  listing_id: string
  question_body: string
  asker_id: string
  answer_body?: string | null
  answerer_id?: string | null
  created_at?: string | null
  answered_at?: string | null
  updated_at?: string | null
}

function normalizeQuestion(row: ListingQuestionRow): ListingQuestion {
  const {
    id,
    listing_id,
    question_body,
    asker_id,
    answer_body,
    answerer_id,
    created_at,
    answered_at,
  } = row

  return {
    id,
    listingId: listing_id,
    questionerId: asker_id,
    questionBody: question_body,
    createdAt: created_at ? Date.parse(created_at) : Date.now(),
    questionerName: null,
    answerBody: answer_body || null,
    answerAuthorId: answerer_id || null,
    answerAuthorName: null,
    answeredAt: answered_at ? Date.parse(answered_at) : null,
  }
}

function sortQuestions(list: ListingQuestion[]): ListingQuestion[] {
  return [...list].sort((a, b) => a.createdAt - b.createdAt)
}

export async function fetchListingQuestions(listingId: string): Promise<ListingQuestion[]> {
  if (!supabaseEnabled) return []
  if (!listingId) return []
  try {
    const supabase = getSupabaseClient()
    const { data, error } = await supabase
      .from('listing_questions')
      .select(
        'id, listing_id, question_body, asker_id, answer_body, answerer_id, created_at, answered_at'
      )
      .eq('listing_id', listingId)
      .order('created_at', { ascending: true })

    if (error || !data) return []
    return sortQuestions((data as ListingQuestionRow[]).map(normalizeQuestion))
  } catch (err) {
    console.warn('[listing-questions] fetch failed', err)
    return []
  }
}

export async function askListingQuestion(listingId: string, body: string): Promise<ListingQuestion | null> {
  if (!supabaseEnabled) throw new Error('Supabase no habilitado')
  const supabase = getSupabaseClient()
  const payload = {
    listing_id: listingId,
    question_body: body.trim(),
  }
  const { data, error } = await supabase
    .from('listing_questions')
    .insert(payload)
    .select(
      'id, listing_id, question_body, asker_id, answer_body, answerer_id, created_at, answered_at'
    )
    .maybeSingle()

  if (error) {
    console.warn('[listing-questions] ask failed', error)
    throw error
  }

  return data ? normalizeQuestion(data as ListingQuestionRow) : null
}

export async function answerListingQuestion(questionId: string, body: string): Promise<ListingQuestion | null> {
  if (!supabaseEnabled) throw new Error('Supabase no habilitado')
  const supabase = getSupabaseClient()
  const payload = {
    answer_body: body.trim(),
    answered_at: new Date().toISOString(),
  }

  const { data, error } = await supabase
    .from('listing_questions')
    .update(payload)
    .eq('id', questionId)
    .is('answer_body', null)
    .select(
      'id, listing_id, question_body, asker_id, answer_body, answerer_id, created_at, answered_at'
    )
    .maybeSingle()

  if (error) {
    console.warn('[listing-questions] answer failed', error)
    throw error
  }

  if (!data) {
    throw new Error('Esta consulta ya fue respondida.')
  }

  return normalizeQuestion(data as ListingQuestionRow)
}

export async function deleteListingQuestion(questionId: string): Promise<boolean> {
  if (!supabaseEnabled) throw new Error('Supabase no habilitado')
  const supabase = getSupabaseClient()
  const { error } = await supabase
    .from('listing_questions')
    .delete()
    .eq('id', questionId)
  if (error) {
    console.warn('[listing-questions] delete failed', error)
    throw error
  }
  return true
}

export async function clearListingAnswer(questionId: string): Promise<ListingQuestion | null> {
  if (!supabaseEnabled) throw new Error('Supabase no habilitado')
  const supabase = getSupabaseClient()
  const payload = { answer_body: null, answered_at: null, answerer_id: null }
  const { data, error } = await supabase
    .from('listing_questions')
    .update(payload)
    .eq('id', questionId)
    .select(
      'id, listing_id, question_body, asker_id, answer_body, answerer_id, created_at, answered_at'
    )
    .maybeSingle()
  if (error) {
    console.warn('[listing-questions] clear answer failed', error)
    throw error
  }
  return data ? normalizeQuestion(data as any) : null
}

export type ListingQuestionEvent = 'asked' | 'answered' | 'moderator_deleted_question' | 'moderator_cleared_answer'

export async function notifyListingQuestionEvent(questionId: string, event: ListingQuestionEvent): Promise<void> {
  if (!questionId) return
  const endpoint = API_BASE ? `${API_BASE}/api/questions/notify` : '/api/questions/notify'
  try {
    const response = await fetch(endpoint, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ questionId, event }),
    })
    if (response.status === 404) {
      // El backend puede no tener el endpoint (deploy viejo). Ignoramos silenciosamente.
      return
    }
    if (!response.ok) {
      const data = await response.json().catch(() => ({}))
      const message = data?.error || 'No se pudo enviar la notificación.'
      throw new Error(message)
    }
  } catch (error) {
    console.warn('[listing-questions] notify failed', error)
  }
}
