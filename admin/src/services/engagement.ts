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

function resolveSuffix(days: number): '7d' | '30d' | '90d' {
  if (days <= 7) return '7d'
  if (days <= 30) return '30d'
  return '90d'
}

export interface ListingEngagementTop {
  id: string
  title: string
  sellerId: string | null
  views: number
  waClicks: number
  ctr: number
}

async function fetchListingTop(period: number, limit: number, sortBy: 'views' | 'wa'): Promise<ListingEngagementTop[]> {
  if (!supabaseEnabled) return []
  const supabase = getSupabaseClient()
  const suffix = resolveSuffix(period)
  const viewsField = `views_${suffix}`
  const waField = `wa_clicks_${suffix}`
  const orderField = sortBy === 'views' ? viewsField : waField
  const { data, error } = await supabase
    .from('admin_listing_engagement_summary')
    .select(`listing_id, title, seller_id, ${viewsField}, ${waField}`)
    .order(orderField, { ascending: false })
    .limit(limit * 2)
  if (error || !Array.isArray(data)) {
    if (error) console.warn('[engagement] listing top fetch failed', error)
    return []
  }
  const rows = (data as any[])
    .map((row) => {
      const views = Number(row[viewsField] ?? 0)
      const waClicks = Number(row[waField] ?? 0)
      const ctr = views > 0 ? (waClicks / views) * 100 : 0
      return {
        id: String(row.listing_id ?? ''),
        title: String(row.title ?? 'Sin título'),
        sellerId: row.seller_id ? String(row.seller_id) : null,
        views,
        waClicks,
        ctr,
      }
    })
    .filter((row) => row.id)
  return rows
    .sort((a, b) => (sortBy === 'views' ? b.views - a.views : b.waClicks - a.waClicks))
    .slice(0, limit)
}

export async function fetchTopListingsByViews(days = 30, limit = 10): Promise<ListingEngagementTop[]> {
  return fetchListingTop(days, limit, 'views')
}

export async function fetchTopListingsByWaClicks(days = 30, limit = 10): Promise<ListingEngagementTop[]> {
  return fetchListingTop(days, limit, 'wa')
}

export interface StoreEngagementTop {
  id: string
  name: string
  storeViews: number
  listingViews: number
  waClicks: number
  ctr: number
}

async function fetchStoreEngagementAll(period: number, limit = 200): Promise<StoreEngagementTop[]> {
  if (!supabaseEnabled) return []
  const supabase = getSupabaseClient()
  const suffix = resolveSuffix(period)
  const storeField = `store_views_${suffix}`
  const listingField = `listing_views_${suffix}`
  const waField = `wa_clicks_${suffix}`
  const { data, error } = await supabase
    .from('admin_store_engagement_summary')
    .select(`store_user_id, store_name, ${storeField}, ${listingField}, ${waField}`)
    .order(listingField, { ascending: false })
    .limit(limit)
  if (error || !Array.isArray(data)) {
    if (error) console.warn('[engagement] store engagement fetch failed', error)
    return []
  }
  return (data as any[])
    .map((row) => {
      const storeViews = Number(row[storeField] ?? 0)
      const listingViews = Number(row[listingField] ?? 0)
      const waClicks = Number(row[waField] ?? 0)
      const ctr = listingViews > 0 ? (waClicks / listingViews) * 100 : 0
      return {
        id: String(row.store_user_id ?? ''),
        name: String(row.store_name ?? 'Tienda'),
        storeViews,
        listingViews,
        waClicks,
        ctr,
      }
    })
    .filter((row) => row.id)
}

export async function fetchTopStoresByViews(days = 30, limit = 10): Promise<StoreEngagementTop[]> {
  const rows = await fetchStoreEngagementAll(days, limit * 2)
  return rows.sort((a, b) => b.storeViews - a.storeViews).slice(0, limit)
}

export async function fetchStoreEngagementSummary(days = 30, limit = 50): Promise<StoreEngagementTop[]> {
  const rows = await fetchStoreEngagementAll(days, limit)
  return rows
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
