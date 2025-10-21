import { getSupabaseClient, supabaseEnabled } from '@app/services/supabase'

export type DailyPoint = { day: string; total: number }

export interface DailyEventsByType {
  site: DailyPoint[]
  listing: DailyPoint[]
  store: DailyPoint[]
}

export async function fetchDailyEvents(days = 30): Promise<DailyEventsByType> {
  if (!supabaseEnabled) return { site: [], listing: [], store: [] }
  const supabase = getSupabaseClient()
  const sinceIso = new Date(Date.now() - days * 86400000).toISOString().slice(0, 10)
  const { data, error } = await supabase
    .from('admin_events_daily')
    .select('day, type, total')
  if (error || !Array.isArray(data)) return { site: [], listing: [], store: [] }
  const rows = (data as any[]).map((r) => ({ day: String(r.day).slice(0, 10), type: String(r.type), total: Number(r.total) || 0 }))
  const filtered = rows.filter((r) => r.day >= sinceIso)
  const site = filtered.filter((r) => r.type === 'site_view').map((r) => ({ day: r.day, total: r.total }))
  const listing = filtered.filter((r) => r.type === 'listing_view').map((r) => ({ day: r.day, total: r.total }))
  const store = filtered.filter((r) => r.type === 'store_view').map((r) => ({ day: r.day, total: r.total }))
  // Ordenar por día
  const cmp = (a: DailyPoint, b: DailyPoint) => (a.day < b.day ? -1 : 1)
  return { site: site.sort(cmp), listing: listing.sort(cmp), store: store.sort(cmp) }
}

async function aggregateByListing(view: 'admin_listing_views_daily' | 'admin_wa_clicks_daily', days = 30): Promise<Array<{ listing_id: string; total: number }>> {
  if (!supabaseEnabled) return []
  const supabase = getSupabaseClient()
  const sinceIso = new Date(Date.now() - days * 86400000).toISOString().slice(0, 10)
  const { data, error } = await supabase.from(view).select('day, listing_id, total')
  if (error || !Array.isArray(data)) return []
  const filtered = (data as any[]).filter((r) => r.day && String(r.day).slice(0, 10) >= sinceIso)
  const map = new Map<string, number>()
  for (const r of filtered) {
    const id = String(r.listing_id || '')
    if (!id) continue
    map.set(id, (map.get(id) || 0) + (Number(r.total) || 0))
  }
  return Array.from(map.entries()).map(([listing_id, total]) => ({ listing_id, total })).sort((a, b) => b.total - a.total)
}

export async function fetchTopListingsByViews(days = 30, limit = 10): Promise<Array<{ id: string; title: string; total: number }>> {
  const agg = await aggregateByListing('admin_listing_views_daily', days)
  const top = agg.slice(0, limit)
  if (top.length === 0 || !supabaseEnabled) return []
  const supabase = getSupabaseClient()
  const ids = top.map((t) => t.listing_id)
  const { data } = await supabase.from('listings').select('id,title').in('id', ids)
  const titleById = new Map<string, string>((data || []).map((r: any) => [String(r.id), String(r.title || 'Sin título')]))
  return top.map((t) => ({ id: t.listing_id, title: titleById.get(t.listing_id) || 'Sin título', total: t.total }))
}

export async function fetchTopListingsByWaClicks(days = 30, limit = 10): Promise<Array<{ id: string; title: string; total: number }>> {
  const agg = await aggregateByListing('admin_wa_clicks_daily', days)
  const top = agg.slice(0, limit)
  if (top.length === 0 || !supabaseEnabled) return []
  const supabase = getSupabaseClient()
  const ids = top.map((t) => t.listing_id)
  const { data } = await supabase.from('listings').select('id,title').in('id', ids)
  const titleById = new Map<string, string>((data || []).map((r: any) => [String(r.id), String(r.title || 'Sin título')]))
  return top.map((t) => ({ id: t.listing_id, title: titleById.get(t.listing_id) || 'Sin título', total: t.total }))
}

