const { resolvePlanPrice } = require('../mercadopagoCheckout')

const CAMPAIGN = 'free_listing_upgrade_reminder'
const PRIORITY = 8
// Resend account is rate-limited to 100 sends/day; leave headroom for other campaigns
// that may fire the same run (payment_abandon_20off, upgrade_comparison, weekly digests).
const DAILY_SEND_LIMIT = Number(process.env.FREE_LISTING_REMINDER_DAILY_LIMIT) || 80

function buildIdempotencyKeyForUser(email) {
  return `free_listing_upgrade_user:${email}:${new Date().toISOString().split('T')[0]}`
}

function buildFeatureChecklist() {
  return [
    'WhatsApp habilitado para contacto directo',
    'Más visibilidad en resultados del marketplace',
    'Tu anuncio aparece más arriba',
    'Destaque visual y mejor confianza',
  ]
}

async function fetchFreeActiveListings(supabase) {
  const { data, error } = await supabase
    .from('listings')
    .select('id,slug,seller_id,title,images,price,price_currency,plan_code,status,is_demo_listing,created_at')
    .eq('plan_code', 'free')
    .in('status', ['active', 'published'])
    .eq('is_demo_listing', false)
    .order('created_at', { ascending: false })
    .limit(1000)

  if (error) {
    console.warn(`[${CAMPAIGN}] listings fetch error`, error.message)
    return []
  }
  return data || []
}

async function buildCandidates({ supabase, baseFront, serverBase }) {
  const listings = await fetchFreeActiveListings(supabase)
  if (!listings.length) return []

  const sellerIds = [...new Set(listings.map((l) => l.seller_id).filter(Boolean))]
  if (!sellerIds.length) return []

  const { data: users } = await supabase.from('users').select('id,email,full_name').in('id', sellerIds)
  const usersMap = new Map((users || []).map((u) => [String(u.id), u]))

  const listingsBySeller = new Map()
  for (const listing of listings) {
    if (!listing.seller_id) continue
    if (!listingsBySeller.has(listing.seller_id)) listingsBySeller.set(listing.seller_id, [])
    listingsBySeller.get(listing.seller_id).push(listing)
  }

  // Prioritize sellers whose newest listing is most recent, so a hard daily send cap
  // (Resend rate limit) favors newer ads over ones that have been sitting free for a while.
  const sellersByRecency = [...listingsBySeller.entries()]
    .sort(([, a], [, b]) => {
      const aNewest = Math.max(...a.map((l) => new Date(l.created_at || 0).getTime()))
      const bNewest = Math.max(...b.map((l) => new Date(l.created_at || 0).getTime()))
      return bNewest - aNewest
    })
    .slice(0, DAILY_SEND_LIMIT)

  const premiumPrice = resolvePlanPrice('premium')
  const proPrice = resolvePlanPrice('pro')

  const candidates = []

  for (const [sellerId, sellerListings] of sellersByRecency) {
    const user = usersMap.get(String(sellerId))
    const email = String(user?.email || '').trim().toLowerCase()
    if (!email) continue

    const cards = sellerListings.slice(0, 8).map((listing) => ({
      id: listing.id,
      slug: listing.slug,
      title: listing.title,
      image: listing.images?.[0],
      price: listing.price,
      price_currency: listing.price_currency,
      link: `${baseFront}/listing/${encodeURIComponent(listing.slug || listing.id)}`,
      planBadge: 'Free',
    }))

    const isMulti = sellerListings.length > 1
    const dashboardLink = isMulti
      ? `${baseFront}/dashboard`
      : `${baseFront}/dashboard?listing=${encodeURIComponent(sellerListings[0].id)}&plan=premium`

    const planOffers = [
      { planCode: 'premium', title: 'Plan Premium', discountPrice: premiumPrice, url: dashboardLink, highlighted: true },
      { planCode: 'pro', title: 'Plan Pro', discountPrice: proPrice, url: dashboardLink },
    ]

    candidates.push({
      campaign: CAMPAIGN,
      priority: PRIORITY,
      userId: sellerId,
      listingId: sellerListings[0].id,
      email,
      idempotencyKey: buildIdempotencyKeyForUser(email),
      payload: {
        subject: isMulti
          ? `Tenés ${sellerListings.length} publicaciones en plan Free`
          : 'Mejorá tu publicación con un upgrade de plan',
        title: isMulti
          ? `Tenés ${sellerListings.length} publicaciones en plan Free`
          : 'Tu publicación está en plan Free',
        subtitle: 'Pasate a Pro o Premium y conseguí más visibilidad y contacto directo con compradores.',
        intro: 'Vimos que todavía tenés publicaciones activas en el plan gratuito. Un upgrade te da más alcance y más chances de vender rápido.',
        cards,
        features: buildFeatureChecklist(),
        recommendedActions: [
          '¿Vendiste tu bicicleta? Marcá como vendida en tu perfil para dejar de recibir ofertas.',
        ],
        planOffers,
        isBundle: false,
        ctas: [],
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
