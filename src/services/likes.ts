import { getSupabaseClient, supabaseEnabled } from './supabase'

const TABLE = 'listing_likes'

export async function fetchUserLikedIds(userId: string): Promise<string[]> {
  if (!supabaseEnabled || !userId) return []
  const supabase = getSupabaseClient()
  const { data, error } = await supabase
    .from(TABLE)
    .select('listing_id')
    .eq('user_id', userId)
  if (error) return []
  return (data || []).map((r: any) => String(r.listing_id))
}

export async function fetchLikeCount(listingId: string): Promise<number> {
  if (!supabaseEnabled || !listingId) return 0
  const supabase = getSupabaseClient()
  const { count } = await supabase
    .from(TABLE)
    .select('listing_id', { head: true, count: 'exact' })
    .eq('listing_id', listingId)
  return count || 0
}

export async function fetchLikeCounts(listingIds: string[]): Promise<Record<string, number>> {
  const out: Record<string, number> = {}
  if (!supabaseEnabled || !listingIds.length) return out
  const supabase = getSupabaseClient()
  const unique = Array.from(new Set(listingIds))
  const { data, error } = await supabase
    .from(TABLE)
    .select('listing_id')
    .in('listing_id', unique)
  if (error) return out
  for (const row of data || []) {
    const id = String(row.listing_id)
    out[id] = (out[id] || 0) + 1
  }
  return out
}

export async function hasUserLike(userId: string, listingId: string): Promise<boolean> {
  if (!supabaseEnabled || !userId || !listingId) return false
  const supabase = getSupabaseClient()
  const { data } = await supabase
    .from(TABLE)
    .select('listing_id')
    .eq('user_id', userId)
    .eq('listing_id', listingId)
    .maybeSingle()
  return Boolean(data)
}

export async function addLike(userId: string, listingId: string): Promise<boolean> {
  if (!supabaseEnabled || !userId || !listingId) return false
  const supabase = getSupabaseClient()
  const { error } = await supabase
    .from(TABLE)
    .insert({ user_id: userId, listing_id: listingId })
  return !error
}

export async function removeLike(userId: string, listingId: string): Promise<boolean> {
  if (!supabaseEnabled || !userId || !listingId) return false
  const supabase = getSupabaseClient()
  const { error } = await supabase
    .from(TABLE)
    .delete()
    .eq('user_id', userId)
    .eq('listing_id', listingId)
  return !error
}
