import { getSupabaseClient, supabaseEnabled } from './supabase'

export type StoreSummary30d = {
  store_user_id: string
  store_views: number
  listing_views: number
  wa_clicks: number
}

export type StoreListingSummary30d = {
  listing_id: string
  store_user_id: string
  views: number
  wa_clicks: number
  ctr: number
}

export type StoreMetricDaily = {
  day: string
  type: 'store_view' | 'listing_view' | 'wa_click' | 'site_view'
  listing_id: string | null
  store_user_id: string
  total: number
}

export async function fetchStoreSummary30d(storeUserId?: string): Promise<StoreSummary30d | null> {
  if (!supabaseEnabled) return null
  const supabase = getSupabaseClient()
  let query = supabase.from('store_summary_30d').select('*')
  if (storeUserId) query = query.eq('store_user_id', storeUserId)
  const { data, error } = await query.maybeSingle()
  if (error) return null
  return (data as unknown) as StoreSummary30d
}

export async function fetchStoreListingSummary30d(limit = 20, storeUserId?: string): Promise<StoreListingSummary30d[]> {
  if (!supabaseEnabled) return []
  const supabase = getSupabaseClient()
  let query = supabase.from('store_listing_summary_30d').select('*')
  if (storeUserId) query = query.eq('store_user_id', storeUserId)
  const { data, error } = await query
    .order('wa_clicks', { ascending: false, nullsFirst: false })
    .order('views', { ascending: false, nullsFirst: false })
    .limit(limit)
  if (error || !data) return []
  return data as unknown as StoreListingSummary30d[]
}

export async function fetchStoreMetricsDaily(storeUserId?: string): Promise<StoreMetricDaily[]> {
  if (!supabaseEnabled) return []
  const supabase = getSupabaseClient()
  let query = supabase.from('store_metrics_daily').select('*')
  if (storeUserId) query = query.eq('store_user_id', storeUserId)
  const { data, error } = await query
  if (error || !data) return []
  return data as unknown as StoreMetricDaily[]
}
