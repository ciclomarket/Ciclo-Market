import { getSupabaseClient, supabaseEnabled } from '@app/services/supabase'

export interface SummaryMetrics {
  totalUsers: number | null
  verifiedUsers: number | null
  officialStores: number | null
  totalListings: number | null
  activeListings: number | null
  pausedListings: number | null
  draftListings: number | null
}

async function count(query: Promise<{ count: number | null }>): Promise<number | null> {
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

  return {
    totalUsers,
    verifiedUsers,
    officialStores,
    totalListings,
    activeListings,
    pausedListings,
    draftListings,
  }
}

/* ----------------------------- Payments (simple) -------------------------- */
export type PaymentRow = { created_at: string; amount: number; currency: string; status: string }

export interface PaymentsSummary {
  count: number
  totalByCurrency: Record<string, number>
  byDay: Array<{ day: string; total: number; currency: string }>
}

export async function fetchRecentPayments(days = 90, maxRows = 1000): Promise<PaymentRow[]> {
  if (!supabaseEnabled) return []
  const supabase = getSupabaseClient()
  const since = new Date(Date.now() - days * 24 * 60 * 60 * 1000).toISOString()
  const { data, error } = await supabase
    .from('payments')
    .select('created_at, amount, currency, status')
    .eq('status', 'succeeded')
    .gte('created_at', since)
    .order('created_at', { ascending: false })
    .limit(maxRows)
  if (error || !Array.isArray(data)) return []
  return data as PaymentRow[]
}

export async function summarizeRecentPayments(days = 90): Promise<PaymentsSummary> {
  const rows = await fetchRecentPayments(days)
  const totalByCurrency: Record<string, number> = {}
  const byDayKey: Record<string, number> = {}
  for (const r of rows) {
    const c = (r.currency || 'ARS').toUpperCase()
    totalByCurrency[c] = (totalByCurrency[c] || 0) + (typeof r.amount === 'number' ? r.amount : 0)
    const day = r.created_at ? r.created_at.slice(0, 10) : ''
    if (day) byDayKey[day] = (byDayKey[day] || 0) + (typeof r.amount === 'number' ? r.amount : 0)
  }
  const byDay = Object.entries(byDayKey)
    .sort(([a], [b]) => (a < b ? 1 : -1))
    .slice(0, 14)
    .map(([day, total]) => ({ day, total, currency: 'ARS' }))
  return { count: rows.length, totalByCurrency, byDay }
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
