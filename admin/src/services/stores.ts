import { fetchStores, fetchStoreActivityCounts, type StoreSummary } from '@app/services/users'
import { getSupabaseClient, supabaseEnabled } from '@app/services/supabase'
import type { AdminListingRow } from '@admin/services/listings'
import { fetchAdminListings } from '@admin/services/listings'

export interface AdminStore extends StoreSummary {
  activeListings: number
  storeViews7d: number
  storeViews30d: number
  storeViews90d: number
  listingViews7d: number
  listingViews30d: number
  listingViews90d: number
  waClicks7d: number
  waClicks30d: number
  waClicks90d: number
}

export async function fetchAdminStores(): Promise<AdminStore[]> {
  const [stores, counts] = await Promise.all([
    fetchStores(),
    fetchStoreActivityCounts(),
  ])

  const engagementMap = await fetchStoreEngagementMetrics(stores.map((store) => store.id))

  return stores.map((store) => {
    const metrics = engagementMap.get(store.id)
    return {
      ...store,
      activeListings: counts[store.id] ?? 0,
      storeViews7d: metrics?.storeViews7d ?? 0,
      storeViews30d: metrics?.storeViews30d ?? 0,
      storeViews90d: metrics?.storeViews90d ?? 0,
      listingViews7d: metrics?.listingViews7d ?? 0,
      listingViews30d: metrics?.listingViews30d ?? 0,
      listingViews90d: metrics?.listingViews90d ?? 0,
      waClicks7d: metrics?.waClicks7d ?? 0,
      waClicks30d: metrics?.waClicks30d ?? 0,
      waClicks90d: metrics?.waClicks90d ?? 0,
    }
  })
}

interface StoreEngagement {
  storeViews7d: number
  storeViews30d: number
  storeViews90d: number
  listingViews7d: number
  listingViews30d: number
  listingViews90d: number
  waClicks7d: number
  waClicks30d: number
  waClicks90d: number
}

async function fetchStoreEngagementMetrics(storeIds: string[]): Promise<Map<string, StoreEngagement>> {
  if (!supabaseEnabled || storeIds.length === 0) return new Map()
  const supabase = getSupabaseClient()
  try {
    const { data, error } = await supabase
      .from('admin_store_engagement_summary')
      .select('store_user_id, store_views_7d, store_views_30d, store_views_90d, listing_views_7d, listing_views_30d, listing_views_90d, wa_clicks_7d, wa_clicks_30d, wa_clicks_90d')
      .in('store_user_id', storeIds)
    if (error || !Array.isArray(data)) {
      if (error) console.warn('[admin-stores] engagement fetch failed', error)
      return new Map()
    }
    const map = new Map<string, StoreEngagement>()
    for (const row of data as any[]) {
      const id = String(row.store_user_id || '')
      if (!id) continue
      map.set(id, {
        storeViews7d: Number(row.store_views_7d ?? 0),
        storeViews30d: Number(row.store_views_30d ?? 0),
        storeViews90d: Number(row.store_views_90d ?? 0),
        listingViews7d: Number(row.listing_views_7d ?? 0),
        listingViews30d: Number(row.listing_views_30d ?? 0),
        listingViews90d: Number(row.listing_views_90d ?? 0),
        waClicks7d: Number(row.wa_clicks_7d ?? 0),
        waClicks30d: Number(row.wa_clicks_30d ?? 0),
        waClicks90d: Number(row.wa_clicks_90d ?? 0),
      })
    }
    return map
  } catch (err) {
    console.warn('[admin-stores] engagement fetch unexpected', err)
    return new Map()
  }
}

export interface AdminStoreDetail {
  store: AdminStore | null
  listings: AdminListingRow[]
  checkouts30d: number
  checkoutsPrev30d: number
}

export async function fetchAdminStoreDetail(storeId: string): Promise<AdminStoreDetail> {
  const [storeSummary] = await Promise.all([
    fetchAdminStoresByIds([storeId]),
  ])
  const store = storeSummary[0] ?? null
  const listings = await fetchAdminListings({ sellerId: storeId, limit: 200 })
  const listingIds = listings.map((l) => l.id).filter(Boolean)
  let checkouts30d = 0
  let checkoutsPrev30d = 0
  if (supabaseEnabled && listingIds.length > 0) {
    const supabase = getSupabaseClient()
    const now = new Date()
    const since30 = new Date(now.getTime() - 30 * 86400000).toISOString()
    const prevStart = new Date(now.getTime() - 60 * 86400000).toISOString()
    try {
      const [{ count: current }, { count: previous }] = await Promise.all([
        supabase
          .from('payments')
          .select('id', { head: true, count: 'exact' })
          .eq('status', 'succeeded')
          .in('listing_id', listingIds)
          .gte('created_at', since30),
        supabase
          .from('payments')
          .select('id', { head: true, count: 'exact' })
          .eq('status', 'succeeded')
          .in('listing_id', listingIds)
          .gte('created_at', prevStart)
          .lt('created_at', since30),
      ])
      checkouts30d = typeof current === 'number' ? current : 0
      checkoutsPrev30d = typeof previous === 'number' ? previous : 0
    } catch (err) {
      console.warn('[admin-stores] fetch checkouts failed', err)
    }
  }
  return { store, listings, checkouts30d, checkoutsPrev30d }
}

async function fetchAdminStoresByIds(ids: string[]): Promise<AdminStore[]> {
  if (ids.length === 0) return []
  const [stores, counts, engagement] = await Promise.all([
    fetchStoresByIds(ids),
    fetchStoreActivityCounts(),
    fetchStoreEngagementMetrics(ids),
  ])
  return stores.map((store) => {
    const metrics = engagement.get(store.id)
    return {
      ...store,
      activeListings: counts[store.id] ?? 0,
      storeViews7d: metrics?.storeViews7d ?? 0,
      storeViews30d: metrics?.storeViews30d ?? 0,
      storeViews90d: metrics?.storeViews90d ?? 0,
      listingViews7d: metrics?.listingViews7d ?? 0,
      listingViews30d: metrics?.listingViews30d ?? 0,
      listingViews90d: metrics?.listingViews90d ?? 0,
      waClicks7d: metrics?.waClicks7d ?? 0,
      waClicks30d: metrics?.waClicks30d ?? 0,
      waClicks90d: metrics?.waClicks90d ?? 0,
    }
  })
}

async function fetchStoresByIds(ids: string[]): Promise<StoreSummary[]> {
  if (!supabaseEnabled) return []
  const supabase = getSupabaseClient()
  const { data, error } = await supabase
    .from('users')
    .select('id, store_slug, store_name, store_avatar_url, store_banner_url, city, province, store_address, store_lat, store_lon, store_phone, store_website')
    .eq('store_enabled', true)
    .in('id', ids)
  if (error || !Array.isArray(data)) {
    if (error) console.warn('[admin-stores] fetch by ids failed', error)
    return []
  }
  return (data as any[])
    .filter((r) => r.store_slug)
    .map((r: any) => ({
    id: String(r.id),
    store_slug: String(r.store_slug ?? ''),
    store_name: r.store_name ?? null,
    store_avatar_url: r.store_avatar_url ?? null,
    store_banner_url: r.store_banner_url ?? null,
    city: r.city ?? null,
    province: r.province ?? null,
    store_address: r.store_address ?? null,
    store_lat: typeof r.store_lat === 'number' ? r.store_lat : (r.store_lat ? Number(r.store_lat) : null),
    store_lon: typeof r.store_lon === 'number' ? r.store_lon : (r.store_lon ? Number(r.store_lon) : null),
    store_phone: r.store_phone ?? null,
    store_website: r.store_website ?? null,
  }))
}
