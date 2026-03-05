const { createUpgradeToken } = require('../mercadopagoCheckout')

const CAMPAIGN = 'payment_abandon_20off'
const PRIORITY = 1

function inferSellerId(payment) {
  return String(
    payment?.user_id ||
    payment?.seller_id ||
    payment?.metadata?.userId ||
    payment?.metadata?.sellerId ||
    ''
  ).trim() || null
}

function inferListingId(payment) {
  return String(payment?.listing_id || payment?.metadata?.listingId || '').trim() || null
}

function inferPlanCode(payment) {
  const raw = String(payment?.plan || payment?.plan_code || payment?.metadata?.planCode || payment?.metadata?.plan_code || 'premium').toLowerCase()
  if (['premium', 'pro', 'basic'].includes(raw)) return raw
  return 'premium'
}

function buildIdempotencyKey(email, paymentId) {
  return `payment_abandon:${email}:${paymentId}`
}

async function buildCandidates({ supabase, dateCtx, serverBase }) {
  const min = new Date(dateCtx.now.getTime() - (24 * 60 * 60 * 1000)).toISOString()
  const max = new Date(dateCtx.now.getTime() - (30 * 60 * 1000)).toISOString()

  const { data, error } = await supabase
    .from('payments')
    .select('id,user_id,seller_id,email,listing_id,plan,plan_code,status,created_at,metadata,amount,currency')
    .eq('status', 'pending')
    .gte('created_at', min)
    .lte('created_at', max)
    .order('created_at', { ascending: false })
    .limit(500)

  if (error) {
    console.warn(`[${CAMPAIGN}] payments error`, error.message)
    return []
  }

  const rows = data || []
  if (!rows.length) return []

  const userIds = [...new Set(rows.map(inferSellerId).filter(Boolean))]
  const { data: users } = await supabase
    .from('users')
    .select('id,email,full_name')
    .in('id', userIds)

  const usersMap = new Map((users || []).map((u) => [String(u.id), u]))

  const listingIds = [...new Set(rows.map(inferListingId).filter(Boolean))]
  let listingMap = new Map()
  if (listingIds.length) {
    const { data: listings } = await supabase
      .from('listings')
      .select('id,slug,title,images,price,price_currency')
      .in('id', listingIds)
    listingMap = new Map((listings || []).map((l) => [String(l.id), l]))
  }

  const candidates = []
  for (const payment of rows) {
    const sellerId = inferSellerId(payment)
    if (!sellerId) continue
    const user = usersMap.get(String(sellerId))
    const email = String(user?.email || payment.email || '').trim()
    if (!email) continue

    const listingId = inferListingId(payment)
    const planCode = inferPlanCode(payment)
    const listing = listingMap.get(String(listingId || ''))
    const token = createUpgradeToken({
      userId: sellerId,
      listingId,
      planCode,
      campaign: CAMPAIGN,
      discountPct: 20,
      paymentId: payment.id,
      exp: Date.now() + 48 * 60 * 60 * 1000,
    })

    candidates.push({
      campaign: CAMPAIGN,
      priority: PRIORITY,
      userId: sellerId,
      paymentId: payment.id,
      listingId: listingId || null,
      email,
      idempotencyKey: buildIdempotencyKey(email, payment.id),
      payload: {
        subject: 'Tu upgrade quedó a un paso',
        title: 'Tu upgrade quedó a un paso',
        subtitle: 'Completalo hoy con 20% OFF.',
        cards: listing ? [{
          id: listing.id,
          slug: listing.slug,
          title: listing.title,
          image: listing.images?.[0],
          price: listing.price,
          price_currency: listing.price_currency,
          link: `${serverBase.replace('/api', '')}/listing/${encodeURIComponent(listing.slug || listing.id)}`,
        }] : [],
        ctas: [
          { text: 'Finalizar upgrade con 20% OFF', url: `${serverBase}/api/checkout/listing-upgrade?token=${encodeURIComponent(token)}` },
        ],
      },
    })
  }

  return candidates
}

module.exports = {
  CAMPAIGN,
  PRIORITY,
  buildCandidates,
}
