import { getSupabaseClient, supabaseEnabled } from '@app/services/supabase'

export interface AdminListingRow {
  id: string
  title: string
  category: string | null
  price: number | null
  priceCurrency: string | null
  status: string | null
  sellerId: string | null
  sellerName: string | null
  sellerEmail: string | null
  sellerPlan: string | null
  createdAt: string | null
  expiresAt: string | null
  views7d: number
  views30d: number
  views90d: number
  waClicks7d: number
  waClicks30d: number
  waClicks90d: number
}

export interface FetchAdminListingsParams {
  status?: string
  limit?: number
  plan?: string
  sellerId?: string
  createdFrom?: string
  createdTo?: string
}

export async function fetchAdminListings(params: FetchAdminListingsParams = {}): Promise<AdminListingRow[]> {
  if (!supabaseEnabled) return []

  const { status, limit = 80, plan, sellerId, createdFrom, createdTo } = params
  const supabase = getSupabaseClient()
  let query = supabase
    .from('listings')
    .select('id, title, category, price, price_currency, status, seller_id, seller_name, seller_email, seller_plan, plan, plan_code, created_at, expires_at')
    .order('created_at', { ascending: false })
    .limit(limit)

  if (status && status !== 'all') {
    query = query.eq('status', status)
  }
  if (plan && plan !== 'all') {
    const clean = plan.trim().toLowerCase()
    if (clean) {
      query = query.or(`plan.eq.${clean},plan_code.eq.${clean},seller_plan.eq.${clean}`)
    }
  }
  if (sellerId) {
    query = query.eq('seller_id', sellerId)
  }
  if (createdFrom) {
    query = query.gte('created_at', createdFrom)
  }
  if (createdTo) {
    query = query.lte('created_at', createdTo)
  }

  const { data, error } = await query
  if (error || !Array.isArray(data)) {
    console.warn('[admin-listings] fetch failed', error)
    return []
  }

  const rows = data.map((row: any) => ({
    id: String(row.id ?? ''),
    title: String(row.title ?? 'Sin título'),
    category: row.category ?? null,
    price: typeof row.price === 'number' ? row.price : (row.price ? Number(row.price) : null),
    priceCurrency: row.price_currency ?? null,
    status: row.status ?? null,
    sellerId: row.seller_id ?? null,
    sellerName: row.seller_name ?? null,
    sellerEmail: row.seller_email ?? null,
    sellerPlan: row.seller_plan ?? row.plan ?? row.plan_code ?? null,
    createdAt: row.created_at ?? null,
    expiresAt: row.expires_at ?? null,
    views7d: 0,
    views30d: 0,
    views90d: 0,
    waClicks7d: 0,
    waClicks30d: 0,
    waClicks90d: 0,
  }))

  if (!rows.length) return rows

  try {
    const metricsQuery = await supabase
      .from('admin_listing_engagement_summary')
      .select('listing_id, views_7d, views_30d, views_90d, wa_clicks_7d, wa_clicks_30d, wa_clicks_90d')
      .in('listing_id', rows.map((r) => r.id))
    if (!metricsQuery.error && Array.isArray(metricsQuery.data)) {
      const metricsMap = new Map<string, any>()
      for (const entry of metricsQuery.data as any[]) {
        metricsMap.set(String(entry.listing_id), entry)
      }
      return rows.map((row) => {
        const metrics = metricsMap.get(row.id)
        if (!metrics) return row
        return {
          ...row,
          views7d: Number(metrics.views_7d ?? 0),
          views30d: Number(metrics.views_30d ?? 0),
          views90d: Number(metrics.views_90d ?? 0),
          waClicks7d: Number(metrics.wa_clicks_7d ?? 0),
          waClicks30d: Number(metrics.wa_clicks_30d ?? 0),
          waClicks90d: Number(metrics.wa_clicks_90d ?? 0),
        }
      })
    }
  } catch (err) {
    console.warn('[admin-listings] engagement metrics failed', err)
  }

  return rows
}
