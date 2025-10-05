import { getSupabaseClient, supabaseEnabled } from './supabase'

export interface MarketingInterestPayload {
  email: string
  category: string
  size?: string
}

export async function subscribeToMarketingInterests(payload: MarketingInterestPayload) {
  if (!supabaseEnabled) return false
  try {
    const supabase = getSupabaseClient()
    const { error } = await supabase.from('marketing_interests').insert({
      email: payload.email.trim(),
      category: payload.category,
      size: payload.size ?? null,
      created_at: new Date().toISOString(),
    })
    return !error
  } catch {
    return false
  }
}
