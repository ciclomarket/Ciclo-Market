const { createUpgradeToken, resolvePlanPrice } = require('../mercadopagoCheckout')

const CAMPAIGN = 'payment_abandon_20off'
const PRIORITY = 1

const SUBJECT_POOL = [
  'Tu publicación está lista para destacar',
  'Un último paso para activar tu anuncio',
  'Activá WhatsApp y mejorá tu visibilidad',
  'Optimizá tu publicación en 1 minuto',
  'Tu anuncio puede rendir mejor',
]
const ACTIVE_SUBJECTS = SUBJECT_POOL.slice(0, 2)

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
  const raw = String(payment?.plan_code || payment?.plan || payment?.metadata?.planCode || payment?.metadata?.plan_code || '').toLowerCase()
  if (raw === 'premium' || raw === 'pro') return raw
  return null
}

function isListingFreeStrict(listing) {
  const plan = String(listing?.plan || '').toLowerCase()
  const planCode = String(listing?.plan_code || '').toLowerCase()
  const sellerPlan = String(listing?.seller_plan || '').toLowerCase()
  if (plan && plan !== 'free') return false
  if (planCode && planCode !== 'free') return false
  if (sellerPlan && sellerPlan !== 'free') return false
  return plan === 'free' || planCode === 'free' || sellerPlan === 'free'
}

function buildIdempotencyKey(email, paymentId) {
  return `payment_abandon:${email}:${paymentId}`
}

function selectSubject(paymentId) {
  const base = String(paymentId || '')
  let hash = 0
  for (let i = 0; i < base.length; i += 1) hash = ((hash << 5) - hash) + base.charCodeAt(i)
  const idx = Math.abs(hash) % ACTIVE_SUBJECTS.length
  return ACTIVE_SUBJECTS[idx]
}

function buildFeatureChecklist() {
  return [
    'WhatsApp habilitado para contacto directo',
    'Más visibilidad en resultados del marketplace',
    'Tu anuncio aparece más arriba',
    'Más chances de venta con un flujo constante',
    'Destaque visual y mejor confianza',
  ]
}

async function buildCandidates({ supabase, dateCtx, baseFront, serverBase }) {
  const min = new Date(dateCtx.now.getTime() - (24 * 60 * 60 * 1000)).toISOString()
  const max = new Date(dateCtx.now.getTime() - (10 * 60 * 1000)).toISOString()

  const { data, error } = await supabase
    .from('payments')
    .select('*')
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
  const listingIds = [...new Set(rows.map(inferListingId).filter(Boolean))]

  const [{ data: users }, { data: listings }] = await Promise.all([
    userIds.length
      ? supabase.from('users').select('id,email,full_name').in('id', userIds)
      : Promise.resolve({ data: [] }),
    listingIds.length
      ? supabase.from('listings').select('id,slug,seller_id,title,images,price,price_currency,plan,plan_code,seller_plan,status').in('id', listingIds)
      : Promise.resolve({ data: [] }),
  ])

  const usersMap = new Map((users || []).map((u) => [String(u.id), u]))
  const listingMap = new Map((listings || []).map((l) => [String(l.id), l]))
  const candidates = []

  for (const payment of rows) {
    const sellerId = inferSellerId(payment)
    const listingId = inferListingId(payment)
    if (!sellerId || !listingId) continue

    const listing = listingMap.get(String(listingId))
    if (!listing) continue
    if (!['active', 'published'].includes(String(listing.status || '').toLowerCase())) continue
    if (!isListingFreeStrict(listing)) continue

    const user = usersMap.get(String(sellerId))
    const email = String(user?.email || payment?.email || '').trim().toLowerCase()
    if (!email) continue

    const preferredPlan = inferPlanCode(payment) || 'premium'
    const subject = selectSubject(payment.id)
    const features = buildFeatureChecklist()

    const plans = ['premium', 'pro'].map((planCode) => {
      const original = resolvePlanPrice(planCode)
      const discounted = Math.round(original * 0.8)
      const token = createUpgradeToken({
        userId: sellerId,
        listingId: listing.id,
        planCode,
        campaign: CAMPAIGN,
        discountPct: 20,
        paymentId: payment.id,
        exp: Date.now() + 48 * 60 * 60 * 1000,
      })
      return {
        planCode,
        title: planCode === 'pro' ? 'Plan Pro' : 'Plan Premium',
        originalPrice: original,
        discountPrice: discounted,
        highlighted: planCode === preferredPlan,
        url: `${serverBase}/api/checkout/listing-upgrade?token=${encodeURIComponent(token)}`,
      }
    })

    candidates.push({
      campaign: CAMPAIGN,
      priority: PRIORITY,
      userId: sellerId,
      paymentId: payment.id,
      listingId: listing.id,
      email,
      idempotencyKey: buildIdempotencyKey(email, payment.id),
      payload: {
        subject,
        title: 'Un último paso para activar tu anuncio',
        subtitle: 'Podés activarlo ahora con mejores beneficios para vender más rápido.',
        intro: 'Esta mejora te da más visibilidad y contacto directo con compradores reales.',
        cards: [{
          id: listing.id,
          slug: listing.slug,
          title: listing.title,
          image: listing.images?.[0],
          price: listing.price,
          price_currency: listing.price_currency,
          link: `${baseFront}/listing/${encodeURIComponent(listing.slug || listing.id)}`,
          planBadge: 'Free',
        }],
        features,
        planOffers: plans,
        ctas: [],
      },
    })
  }

  return candidates
}

module.exports = {
  CAMPAIGN,
  PRIORITY,
  SUBJECT_POOL,
  ACTIVE_SUBJECTS,
  buildCandidates,
}
