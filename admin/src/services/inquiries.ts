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
  channel: 'email' | 'whatsapp'
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
  channel,
}: {
  limit?: number
  listingId?: string
  sellerId?: string
  channel?: 'email' | 'whatsapp'
} = {}): Promise<ListingInquiryRow[]> {
  if (!supabaseEnabled) return []
  const supabase = getSupabaseClient()

  let query = supabase
    .from('listing_inquiries')
    .select(
      `id, listing_id, seller_id, buyer_id, full_name, email, phone, message, channel, email_status, email_sent_at, email_last_error, created_at,
       listing:listings(title, slug)`,
    )
    .order('created_at', { ascending: false })
    .limit(limit)

  if (listingId) query = query.eq('listing_id', listingId)
  if (sellerId) query = query.eq('seller_id', sellerId)
  if (channel) query = query.eq('channel', channel)

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
    channel: row.channel || 'email',
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

export type WhatsappReachRow = {
  listing_id: string
  listing_title: string | null
  listing_slug: string | null
  brand: string | null
  model: string | null
  price: number | null
  seller_full_name: string | null
  clicks: number
  leads: number
}

/**
 * Alcance de WhatsApp por publicación en una ventana de N días, aunque no
 * tengamos nombre/contacto del comprador: los clicks se loguean siempre en
 * `events` (type='wa_click'); los leads con nombre/email/teléfono son los
 * que efectivamente completaron el form nuevo (listing_inquiries.channel='whatsapp').
 */
export async function fetchWhatsappReach({ days = 30 }: { days?: number } = {}): Promise<WhatsappReachRow[]> {
  if (!supabaseEnabled) return []
  const supabase = getSupabaseClient()
  const since = new Date(Date.now() - days * 24 * 60 * 60 * 1000).toISOString()

  const [{ data: clickEvents, error: clickErr }, { data: leadRows, error: leadErr }] = await Promise.all([
    supabase.from('events').select('listing_id').eq('type', 'wa_click').gte('created_at', since).not('listing_id', 'is', null),
    supabase.from('listing_inquiries').select('listing_id').eq('channel', 'whatsapp').gte('created_at', since),
  ])

  if (clickErr) console.warn('[admin] wa_click events fetch failed', clickErr)
  if (leadErr) console.warn('[admin] whatsapp leads fetch failed', leadErr)

  const clickCounts = new Map<string, number>()
  for (const row of (clickEvents as any[]) || []) {
    if (!row.listing_id) continue
    clickCounts.set(row.listing_id, (clickCounts.get(row.listing_id) || 0) + 1)
  }

  const leadCounts = new Map<string, number>()
  for (const row of (leadRows as any[]) || []) {
    if (!row.listing_id) continue
    leadCounts.set(row.listing_id, (leadCounts.get(row.listing_id) || 0) + 1)
  }

  const listingIds = Array.from(new Set([...clickCounts.keys(), ...leadCounts.keys()]))
  if (!listingIds.length) return []

  const { data: listings } = await supabase
    .from('listings')
    .select('id, title, slug, brand, model, price, seller_id')
    .in('id', listingIds)

  const sellerIds = Array.from(new Set(((listings as any[]) || []).map((l) => l.seller_id).filter(Boolean)))
  const sellerMap: Record<string, string | null> = {}
  if (sellerIds.length) {
    const { data: sellers } = await supabase.from('users').select('id, full_name').in('id', sellerIds)
    for (const seller of (sellers as any[]) || []) sellerMap[seller.id] = seller.full_name ?? null
  }

  const listingMap = new Map(((listings as any[]) || []).map((l) => [l.id, l]))

  return listingIds
    .map((id) => {
      const l = listingMap.get(id)
      return {
        listing_id: id,
        listing_title: l?.title ?? null,
        listing_slug: l?.slug ?? null,
        brand: l?.brand ?? null,
        model: l?.model ?? null,
        price: l?.price ?? null,
        seller_full_name: l?.seller_id ? sellerMap[l.seller_id] ?? null : null,
        clicks: clickCounts.get(id) || 0,
        leads: leadCounts.get(id) || 0,
      }
    })
    .sort((a, b) => b.clicks - a.clicks)
}
