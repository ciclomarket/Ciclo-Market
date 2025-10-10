import { getSupabaseClient, supabaseEnabled } from './supabase'
import type { ListingQuestion } from '../types'

type ListingQuestionRow = {
  id: string
  listing_id: string
  question_body: string
  asker_id: string
  asker_full_name?: string | null
  asker_name?: string | null
  answer_body?: string | null
  answerer_id?: string | null
  answerer_full_name?: string | null
  answerer_name?: string | null
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
    asker_full_name,
    asker_name,
    answer_body,
    answerer_id,
    answerer_full_name,
    answerer_name,
    created_at,
    answered_at,
  } = row

  return {
    id,
    listingId: listing_id,
    questionerId: asker_id,
    questionBody: question_body,
    createdAt: created_at ? Date.parse(created_at) : Date.now(),
    questionerName: asker_full_name || asker_name || null,
    answerBody: answer_body || null,
    answerAuthorId: answerer_id || null,
    answerAuthorName: answerer_full_name || answerer_name || null,
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
        'id, listing_id, question_body, asker_id, asker_full_name, asker_name, answer_body, answerer_id, answerer_full_name, answerer_name, created_at, answered_at'
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
      'id, listing_id, question_body, asker_id, asker_full_name, asker_name, answer_body, answerer_id, answerer_full_name, answerer_name, created_at, answered_at'
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
    .select(
      'id, listing_id, question_body, asker_id, asker_full_name, asker_name, answer_body, answerer_id, answerer_full_name, answerer_name, created_at, answered_at'
    )
    .maybeSingle()

  if (error) {
    console.warn('[listing-questions] answer failed', error)
    throw error
  }

  return data ? normalizeQuestion(data as ListingQuestionRow) : null
}

