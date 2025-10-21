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
}

export interface FetchAdminListingsParams {
  status?: string
  limit?: number
}

export async function fetchAdminListings(params: FetchAdminListingsParams = {}): Promise<AdminListingRow[]> {
  if (!supabaseEnabled) return []

  const { status, limit = 80 } = params
  const supabase = getSupabaseClient()
  let query = supabase
    .from('listings')
    .select('id, title, category, price, price_currency, status, seller_id, seller_name, seller_email, seller_plan, plan, plan_code, created_at, expires_at')
    .order('created_at', { ascending: false })
    .limit(limit)

  if (status && status !== 'all') {
    query = query.eq('status', status)
  }

  const { data, error } = await query
  if (error || !Array.isArray(data)) {
    console.warn('[admin-listings] fetch failed', error)
    return []
  }

  return data.map((row: any) => ({
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
  }))
}
