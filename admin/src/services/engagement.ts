import { getSupabaseClient, supabaseEnabled } from '@app/services/supabase'

export type DailyPoint = { day: string; total: number }

export interface DailyEventsByType {
  site: DailyPoint[]
  listing: DailyPoint[]
  store: DailyPoint[]
  wa: DailyPoint[]
}

export async function fetchDailyEvents(days = 30): Promise<DailyEventsByType> {
  if (!supabaseEnabled) return { site: [], listing: [], store: [], wa: [] }
  const supabase = getSupabaseClient()
  const sinceIso = new Date(Date.now() - days * 86400000).toISOString().slice(0, 10)
  const { data, error } = await supabase
    .from('admin_events_daily')
    .select('day, type, total')
  if (error || !Array.isArray(data)) return { site: [], listing: [], store: [], wa: [] }
  const rows = (data as any[]).map((r) => ({ day: String(r.day).slice(0, 10), type: String(r.type), total: Number(r.total) || 0 }))
  const filtered = rows.filter((r) => r.day >= sinceIso)
  const site = filtered.filter((r) => r.type === 'site_view').map((r) => ({ day: r.day, total: r.total }))
  const listing = filtered.filter((r) => r.type === 'listing_view').map((r) => ({ day: r.day, total: r.total }))
  const store = filtered.filter((r) => r.type === 'store_view').map((r) => ({ day: r.day, total: r.total }))
  const wa = filtered.filter((r) => r.type === 'wa_click').map((r) => ({ day: r.day, total: r.total }))
  // Ordenar por día
  const cmp = (a: DailyPoint, b: DailyPoint) => (a.day < b.day ? -1 : 1)
  return { site: site.sort(cmp), listing: listing.sort(cmp), store: store.sort(cmp), wa: wa.sort(cmp) }
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

export async function fetchTopStoresByViews(days = 30, limit = 10): Promise<Array<{ id: string; name: string; total: number }>> {
  if (!supabaseEnabled) return []
  const supabase = getSupabaseClient()
  const sinceIso = new Date(Date.now() - days * 86400000).toISOString().slice(0, 10)
  const { data, error } = await supabase.from('admin_store_views_daily').select('day, store_user_id, total')
  if (error || !Array.isArray(data)) return []
  const filtered = (data as any[]).filter((r) => r.day && String(r.day).slice(0, 10) >= sinceIso)
  const map = new Map<string, number>()
  for (const r of filtered) {
    const id = String(r.store_user_id || '')
    if (!id) continue
    map.set(id, (map.get(id) || 0) + (Number(r.total) || 0))
  }
  const agg = Array.from(map.entries()).map(([id, total]) => ({ id, total })).sort((a, b) => b.total - a.total).slice(0, limit)
  if (!agg.length) return []
  const ids = agg.map((x) => x.id)
  const { data: stores } = await supabase.from('users').select('id, store_name').in('id', ids)
  const nameById = new Map<string, string>((stores || []).map((r: any) => [String(r.id), String(r.store_name || 'Tienda')]))
  return agg.map((x) => ({ id: x.id, name: nameById.get(x.id) || 'Tienda', total: x.total }))
}

export type Comparative = { current: number; previous: number; delta: number; pct: number }
export interface Comparatives {
  site: Comparative
  listing: Comparative
  store: Comparative
  wa: Comparative
}

export function computeComparatives(series: DailyEventsByType, period: number): Comparatives {
  const sumLast = (arr: DailyPoint[]) => arr.slice(-period).reduce((a, b) => a + b.total, 0)
  const sumPrev = (arr: DailyPoint[]) => arr.slice(-period * 2, -period).reduce((a, b) => a + b.total, 0)
  const build = (arr: DailyPoint[]): Comparative => {
    const current = sumLast(arr)
    const previous = sumPrev(arr)
    const delta = current - previous
    const pct = previous > 0 ? (delta / previous) * 100 : (current > 0 ? 100 : 0)
    return { current, previous, delta, pct }
  }
  return {
    site: build(series.site),
    listing: build(series.listing),
    store: build(series.store),
    wa: build(series.wa),
  }
}
