import { getSupabaseClient, supabaseEnabled } from '@app/services/supabase'

export type ListingInquiryRow = {
  id: string
  listing_id: string
  seller_id: string
  buyer_id: string | null
  full_name: string
  email: string
  phone: string | null
  message: string
  email_status: 'pending' | 'sent' | 'failed'
  email_sent_at: string | null
  email_last_error: string | null
  created_at: string
  listing_title: string | null
  listing_slug: string | null
  seller_email: string | null
  seller_full_name: string | null
}

export async function fetchListingInquiries({
  limit = 100,
  listingId,
  sellerId,
}: {
  limit?: number
  listingId?: string
  sellerId?: string
} = {}): Promise<ListingInquiryRow[]> {
  if (!supabaseEnabled) return []
  const supabase = getSupabaseClient()

  let query = supabase
    .from('listing_inquiries')
    .select(
      `id, listing_id, seller_id, buyer_id, full_name, email, phone, message, email_status, email_sent_at, email_last_error, created_at,
       listing:listings(title, slug)`,
    )
    .order('created_at', { ascending: false })
    .limit(limit)

  if (listingId) query = query.eq('listing_id', listingId)
  if (sellerId) query = query.eq('seller_id', sellerId)

  const { data, error } = await query
  if (error || !Array.isArray(data)) {
    console.warn('[admin] fetchListingInquiries failed', error)
    return []
  }

  const rows = data as any[]
  // listing_inquiries.seller_id FK's a auth.users, no a public.users — no se
  // puede embeber ese join con la sintaxis de FK de PostgREST, así que
  // resolvemos los vendedores en una segunda query y los mergeamos acá.
  const sellerIds = Array.from(new Set(rows.map((r) => r.seller_id).filter(Boolean)))
  const sellerMap: Record<string, { email: string | null; full_name: string | null }> = {}
  if (sellerIds.length) {
    const { data: sellers } = await supabase
      .from('users')
      .select('id, email, full_name')
      .in('id', sellerIds)
    for (const seller of (sellers as any[]) || []) {
      sellerMap[seller.id] = { email: seller.email ?? null, full_name: seller.full_name ?? null }
    }
  }

  return rows.map((row) => ({
    id: row.id,
    listing_id: row.listing_id,
    seller_id: row.seller_id,
    buyer_id: row.buyer_id,
    full_name: row.full_name,
    email: row.email,
    phone: row.phone,
    message: row.message,
    email_status: row.email_status,
    email_sent_at: row.email_sent_at,
    email_last_error: row.email_last_error,
    created_at: row.created_at,
    listing_title: row.listing?.title ?? null,
    listing_slug: row.listing?.slug ?? null,
    seller_email: sellerMap[row.seller_id]?.email ?? null,
    seller_full_name: sellerMap[row.seller_id]?.full_name ?? null,
  }))
}
