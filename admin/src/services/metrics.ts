import { getSupabaseClient, supabaseEnabled } from '@app/services/supabase'
import { cacheGet, cacheSet } from '@admin/services/memoryCache'

export interface SummaryMetrics {
  totalUsers: number | null
  verifiedUsers: number | null
  officialStores: number | null
  totalListings: number | null
  activeListings: number | null
  pausedListings: number | null
  draftListings: number | null
}

async function count(query: any): Promise<number | null> {
  try {
    const { count } = await query
    return typeof count === 'number' ? count : null
  } catch (err) {
    console.warn('[admin-metrics] count query failed', err)
    return null
  }
}

export async function fetchSummaryMetrics(): Promise<SummaryMetrics> {
  if (!supabaseEnabled) {
    return {
      totalUsers: null,
      verifiedUsers: null,
      officialStores: null,
      totalListings: null,
      activeListings: null,
      pausedListings: null,
      draftListings: null,
    }
  }

  const cached = cacheGet<SummaryMetrics>('metrics:summary')
  if (cached) return cached

  const supabase = getSupabaseClient()

  const [
    totalUsers,
    verifiedUsers,
    officialStores,
    totalListings,
    activeListings,
    pausedListings,
    draftListings,
  ] = await Promise.all([
    count(
      supabase
        .from('users')
        .select('id', { head: true, count: 'exact' })
    ),
    count(
      supabase
        .from('users')
        .select('id', { head: true, count: 'exact' })
        .eq('verified', true)
    ),
    count(
      supabase
        .from('users')
        .select('id', { head: true, count: 'exact' })
        .eq('store_enabled', true)
    ),
    count(
      supabase
        .from('listings')
        .select('id', { head: true, count: 'exact' })
    ),
    count(
      supabase
        .from('listings')
        .select('id', { head: true, count: 'exact' })
        .eq('status', 'active')
    ),
    count(
      supabase
        .from('listings')
        .select('id', { head: true, count: 'exact' })
        .eq('status', 'paused')
    ),
    count(
      supabase
        .from('listings')
        .select('id', { head: true, count: 'exact' })
        .eq('status', 'draft')
    ),
  ])

  const result = {
    totalUsers,
    verifiedUsers,
    officialStores,
    totalListings,
    activeListings,
    pausedListings,
    draftListings,
  }
  cacheSet('metrics:summary', result, 60_000)
  return result
}

/* ----------------------------- Payments (simple) -------------------------- */
export type PaymentRow = { created_at: string; amount: number; currency: string; status: string; plan_code?: string | null }

export interface PaymentsSummary {
  count: number
  totalByCurrency: Record<string, number>
  totalByPlan: Record<string, number>
  byDay: Array<{ day: string; total: number; count: number; currency: string }>
}

export async function fetchRecentPayments(days = 90, maxRows = 1000): Promise<PaymentRow[]> {
  if (!supabaseEnabled) return []
  const supabase = getSupabaseClient()
  const since = new Date(Date.now() - days * 24 * 60 * 60 * 1000).toISOString()
  const { data, error } = await supabase
    .from('admin_payments_enriched')
    .select('created_at, amount, currency, payment_status, credit_plan_code')
    .eq('payment_status', 'succeeded')
    .gte('created_at', since)
    .order('created_at', { ascending: false })
    .limit(maxRows)
  if (error || !Array.isArray(data)) return []
  return (data as any[]).map((row) => ({
    created_at: row.created_at,
    amount: typeof row.amount === 'number' ? row.amount : (row.amount ? Number(row.amount) : 0),
    currency: String(row.currency || 'ARS'),
    status: String(row.payment_status || 'succeeded'),
    plan_code: row.credit_plan_code ?? null,
  }))
}

export async function summarizeRecentPayments(days = 90): Promise<PaymentsSummary> {
  const safeDays = Math.max(1, Math.min(365, Math.floor(days)))
  const cacheKey = `metrics:payments:${safeDays}`
  const cached = cacheGet<PaymentsSummary>(cacheKey)
  if (cached) return cached

  const rows = await fetchRecentPayments(safeDays)
  const totalByCurrency: Record<string, number> = {}
  const totalByPlan: Record<string, number> = {}
  const byDayKey: Record<string, number> = {}
  const byDayCount: Record<string, number> = {}
  for (const r of rows) {
    const c = (r.currency || 'ARS').toUpperCase()
    totalByCurrency[c] = (totalByCurrency[c] || 0) + (typeof r.amount === 'number' ? r.amount : 0)
    const day = r.created_at ? r.created_at.slice(0, 10) : ''
    if (day) {
      byDayKey[day] = (byDayKey[day] || 0) + (typeof r.amount === 'number' ? r.amount : 0)
      byDayCount[day] = (byDayCount[day] || 0) + 1
    }
    const plan = (r.plan_code ? String(r.plan_code) : 'sin_plan').toLowerCase()
    totalByPlan[plan] = (totalByPlan[plan] || 0) + (typeof r.amount === 'number' ? r.amount : 0)
  }
  const byDay = Object.entries(byDayKey)
    .sort(([a], [b]) => (a > b ? 1 : -1))
    .map(([day, total]) => ({ day, total, count: byDayCount[day] || 0, currency: 'ARS' }))
  const result = { count: rows.length, totalByCurrency, totalByPlan, byDay }
  cacheSet(cacheKey, result, 60_000)
  return result
}

/* ----------------------------- Listings active per day -------------------- */
export async function fetchActiveListingsSeries(days = 30): Promise<Array<{ day: string; total: number }>> {
  if (!supabaseEnabled) return []
  const supabase = getSupabaseClient()
  // La vista debe existir: admin_listings_active_by_day (ver scripts/supabase_admin_metrics.sql)
  const { data, error } = await supabase
    .from('admin_listings_active_by_day')
    .select('*')
  if (error || !Array.isArray(data)) return []
  const rows = (data as any[])
    .map((r) => ({ day: String(r.day).slice(0, 10), total: Number(r.active) || 0 }))
    .sort((a, b) => (a.day < b.day ? -1 : 1))
    .slice(-days)
  return rows
}

/* ----------------------------- Export CSV (payments) ---------------------- */
export async function exportPaymentsCsv(days = 90): Promise<void> {
  const rows = await fetchRecentPayments(days)
  const header = ['created_at', 'amount', 'currency', 'status']
  const csvLines = [header.join(',')]
  for (const r of rows) {
    const line = [r.created_at, String(r.amount ?? ''), r.currency || '', r.status || ''].map((v) => {
      const s = String(v ?? '')
      return /[",\n]/.test(s) ? '"' + s.replace(/"/g, '""') + '"' : s
    }).join(',')
    csvLines.push(line)
  }
  const csv = csvLines.join('\n')
  const blob = new Blob([csv], { type: 'text/csv;charset=utf-8' })
  const url = URL.createObjectURL(blob)
  const a = document.createElement('a')
  a.href = url
  a.download = `payments_${new Date().toISOString().slice(0,10)}.csv`
  document.body.appendChild(a)
  a.click()
  a.remove()
  URL.revokeObjectURL(url)
}

/* ----------------------------- User growth -------------------------------- */
export interface UserGrowthSummary {
  users7d: number
  usersPrev7d: number
  users30d: number
  usersPrev30d: number
  users90d: number
  usersPrev90d: number
}

const zeroGrowth: UserGrowthSummary = {
  users7d: 0,
  usersPrev7d: 0,
  users30d: 0,
  usersPrev30d: 0,
  users90d: 0,
  usersPrev90d: 0,
}

export async function fetchUserGrowthSummary(): Promise<UserGrowthSummary> {
  if (!supabaseEnabled) return zeroGrowth
  const cached = cacheGet<UserGrowthSummary>('metrics:userGrowth')
  if (cached) return cached
  try {
    const supabase = getSupabaseClient()
    const { data, error } = await supabase
      .from('admin_user_growth_summary')
      .select('*')
      .maybeSingle()
    if (error || !data) {
      console.warn('[admin-metrics] user growth fetch failed', error)
      return zeroGrowth
    }
    const row = data as Record<string, number | null>
    const result = {
      users7d: Number(row.users_7d ?? 0),
      usersPrev7d: Number(row.users_prev_7d ?? 0),
      users30d: Number(row.users_30d ?? 0),
      usersPrev30d: Number(row.users_prev_30d ?? 0),
      users90d: Number(row.users_90d ?? 0),
      usersPrev90d: Number(row.users_prev_90d ?? 0),
    }
    cacheSet('metrics:userGrowth', result, 60_000)
    return result
  } catch (err) {
    console.warn('[admin-metrics] user growth unexpected', err)
    return zeroGrowth
  }
}

/* ----------------------------- Listing activity --------------------------- */
export interface ListingActivitySummary {
  created7d: number
  createdPrev7d: number
  created30d: number
  createdPrev30d: number
  paused7d: number
  pausedPrev7d: number
  paused30d: number
  pausedPrev30d: number
}

const zeroListingActivity: ListingActivitySummary = {
  created7d: 0,
  createdPrev7d: 0,
  created30d: 0,
  createdPrev30d: 0,
  paused7d: 0,
  pausedPrev7d: 0,
  paused30d: 0,
  pausedPrev30d: 0,
}

export async function fetchListingActivitySummary(): Promise<ListingActivitySummary> {
  if (!supabaseEnabled) return zeroListingActivity
  const cached = cacheGet<ListingActivitySummary>('metrics:listingActivity')
  if (cached) return cached
  try {
    const supabase = getSupabaseClient()
    const { data, error } = await supabase
      .from('admin_listing_activity_summary')
      .select('*')
      .maybeSingle()
    if (error || !data) {
      console.warn('[admin-metrics] listing activity fetch failed', error)
      return zeroListingActivity
    }
    const row = data as Record<string, number | null>
    const result = {
      created7d: Number(row.listings_created_7d ?? 0),
      createdPrev7d: Number(row.listings_created_prev_7d ?? 0),
      created30d: Number(row.listings_created_30d ?? 0),
      createdPrev30d: Number(row.listings_created_prev_30d ?? 0),
      paused7d: Number(row.listings_paused_7d ?? 0),
      pausedPrev7d: Number(row.listings_paused_prev_7d ?? 0),
      paused30d: Number(row.listings_paused_30d ?? 0),
      pausedPrev30d: Number(row.listings_paused_prev_30d ?? 0),
    }
    cacheSet('metrics:listingActivity', result, 60_000)
    return result
  } catch (err) {
    console.warn('[admin-metrics] listing activity unexpected', err)
    return zeroListingActivity
  }
}

/* ----------------------------- Funnel counts ------------------------------ */
export interface FunnelStepCounts {
  current: number
  previous: number
}

export interface FunnelCounts {
  periodDays: number
  site: FunnelStepCounts
  listing: FunnelStepCounts
  contactIntent: FunnelStepCounts
  contactLogged: FunnelStepCounts
  saleConfirmed: FunnelStepCounts
}

export async function fetchFunnelCounts(periodDays = 30): Promise<FunnelCounts> {
  if (!supabaseEnabled) {
    return {
      periodDays,
      site: { current: 0, previous: 0 },
      listing: { current: 0, previous: 0 },
      contactIntent: { current: 0, previous: 0 },
      contactLogged: { current: 0, previous: 0 },
      saleConfirmed: { current: 0, previous: 0 },
    }
  }

  const window = Math.max(1, periodDays)
  const cacheKey = `metrics:funnel:${window}`
  const cached = cacheGet<FunnelCounts>(cacheKey)
  if (cached) return cached

  const supabase = getSupabaseClient()
  const { data, error } = await supabase.rpc('admin_funnel_counts_compare', { p_days: window })
  if (error || !Array.isArray(data) || !data[0]) {
    console.warn('[admin-metrics] funnel rpc failed', error)
    return {
      periodDays: window,
      site: { current: 0, previous: 0 },
      listing: { current: 0, previous: 0 },
      contactIntent: { current: 0, previous: 0 },
      contactLogged: { current: 0, previous: 0 },
      saleConfirmed: { current: 0, previous: 0 },
    }
  }
  const row = data[0] as Record<string, number | null>
  const result: FunnelCounts = {
    periodDays: window,
    site: { current: Number(row.site_views_current ?? 0), previous: Number(row.site_views_prev ?? 0) },
    listing: { current: Number(row.listing_views_current ?? 0), previous: Number(row.listing_views_prev ?? 0) },
    contactIntent: { current: Number(row.contact_intent_current ?? 0), previous: Number(row.contact_intent_prev ?? 0) },
    contactLogged: { current: Number(row.contact_logged_current ?? 0), previous: Number(row.contact_logged_prev ?? 0) },
    saleConfirmed: { current: Number(row.sale_confirmed_current ?? 0), previous: Number(row.sale_confirmed_prev ?? 0) },
  }
  cacheSet(cacheKey, result, 60_000)
  return result

  // unreachable
}

/* ----------------------------- Listing quality ---------------------------- */
export interface ListingQualityMetrics {
  listingsTracked: number
  avgViews30d: number
  avgWaClicks30d: number
}

const emptyListingQuality: ListingQualityMetrics = {
  listingsTracked: 0,
  avgViews30d: 0,
  avgWaClicks30d: 0,
}

export async function fetchListingQualityMetrics(): Promise<ListingQualityMetrics> {
  if (!supabaseEnabled) return emptyListingQuality
  try {
    const supabase = getSupabaseClient()
    const { data, error } = await supabase
      .from('admin_listing_engagement_stats')
      .select('*')
      .maybeSingle()
    if (error || !data) {
      if (error) console.warn('[admin-metrics] listing quality fetch failed', error)
      return emptyListingQuality
    }
    const row = data as Record<string, number | null>
    return {
      listingsTracked: Number(row.listings_total ?? 0),
      avgViews30d: Number(row.avg_views_30d ?? 0),
      avgWaClicks30d: Number(row.avg_wa_clicks_30d ?? 0),
    }
  } catch (err) {
    console.warn('[admin-metrics] listing quality unexpected', err)
    return emptyListingQuality
  }
}
