/**
 * Campaña 1 — Free Upgrade Offer
 * --------------------------------
 * Usuarios que publicaron en plan FREE y nunca pagaron un upgrade.
 * - Corrida: todos los días 20:00 (hora Argentina).
 * - Oferta: descuento vía MercadoPago (20% OFF individual / 50% OFF bundle).
 * - Dedupe: UNA sola vez por publicación (nunca más se reenvía).
 */

const {
  createUpgradeToken,
  createBundleUpgradeToken,
  resolvePlanPrice,
} = require('../mercadopagoCheckout')

const CAMPAIGN = 'free_upgrade_offer'
const PRIORITY = 1

// Límite diario (con Brevo ~300/día, dejar margen para el resto del run).
const DAILY_SEND_LIMIT = Number(process.env.FREE_UPGRADE_OFFER_DAILY_LIMIT) || 250
const DISCOUNT_PCT = 20 // 20% OFF individual
const BUNDLE_DISCOUNT_PCT = 50 // 50% OFF si tiene 2+ publicaciones
const TOKEN_TTL_MS = 7 * 24 * 60 * 60 * 1000 // 7 días

function shouldRunAt(dateCtx) {
  return dateCtx.hourInTz === 20 // 8PM Argentina
}

// Una vez enviado a este usuario, no se vuelve a mandar nunca más.
function buildIdempotencyKey(email) {
  return `${CAMPAIGN}:${email}`
}

function isFreePlan(listing) {
  const plan = String(listing?.plan || '').toLowerCase()
  const planCode = String(listing?.plan_code || '').toLowerCase()
  const sellerPlan = String(listing?.seller_plan || '').toLowerCase()
  if (plan && plan !== 'free') return false
  if (planCode && planCode !== 'free') return false
  if (sellerPlan && sellerPlan !== 'free') return false
  return plan === 'free' || planCode === 'free' || sellerPlan === 'free'
}

function buildFeatureChecklist() {
  return [
    'WhatsApp habilitado para contacto directo',
    'Más visibilidad en resultados del marketplace',
    'Tu anuncio aparece más arriba',
    'Destaque visual y mejor confianza',
  ]
}

async function fetchFreeListingsWithoutPayment(supabase) {
  const { data, error } = await supabase
    .from('listings')
    .select('id,slug,seller_id,title,images,price,price_currency,plan,plan_code,seller_plan,status,is_demo_listing,created_at')
    .in('status', ['active', 'published'])
    .eq('is_demo_listing', false)
    .order('created_at', { ascending: false })
    .limit(1500)

  if (error) {
    console.warn(`[${CAMPAIGN}] listings error`, error.message)
    return []
  }

  const free = (data || []).filter(isFreePlan).filter((l) => l.seller_id)
  if (!free.length) return []

  // "Subieron y no pagaron": excluir publicaciones que ya tienen un pago asociado.
  const ids = free.map((l) => l.id)
  const { data: payments } = await supabase
    .from('payments')
    .select('listing_id')
    .in('listing_id', ids)
  const paidIds = new Set((payments || []).map((p) => p.listing_id))

  return free.filter((l) => !paidIds.has(l.id))
}

async function buildCandidates({ supabase, dateCtx, baseFront, serverBase, forceWeekly = false }) {
  if (!forceWeekly && !shouldRunAt(dateCtx)) return []

  const listings = await fetchFreeListingsWithoutPayment(supabase)
  if (!listings.length) return []

  const sellerIds = [...new Set(listings.map((l) => l.seller_id).filter(Boolean))]
  if (!sellerIds.length) return []

  const { data: users } = await supabase.from('users').select('id,email,full_name').in('id', sellerIds)
  const usersMap = new Map((users || []).map((u) => [String(u.id), u]))

  const bySeller = new Map()
  for (const l of listings) {
    if (!bySeller.has(l.seller_id)) bySeller.set(l.seller_id, [])
    bySeller.get(l.seller_id).push(l)
  }

  // Priorizar vendedores con publicaciones más recientes (respetar límite diario).
  const sellers = [...bySeller.entries()]
    .sort(([, a], [, b]) => {
      const aNew = Math.max(...a.map((l) => new Date(l.created_at || 0).getTime()))
      const bNew = Math.max(...b.map((l) => new Date(l.created_at || 0).getTime()))
      return bNew - aNew
    })
    .slice(0, DAILY_SEND_LIMIT)

  const candidates = []

  for (const [sellerId, sellerListings] of sellers) {
    const user = usersMap.get(String(sellerId))
    const email = String(user?.email || '').trim().toLowerCase()
    if (!email) continue

    const primary = sellerListings[0]

    const cards = sellerListings.slice(0, 8).map((l) => ({
      id: l.id,
      slug: l.slug,
      title: l.title,
      image: l.images?.[0],
      price: l.price,
      price_currency: l.price_currency,
      link: `${baseFront}/listing/${encodeURIComponent(l.slug || l.id)}`,
      planBadge: 'Free',
    }))

    let planOffers
    let isBundle = false
    let subject
    let title

    if (sellerListings.length >= 2) {
      // Bundle 50% OFF en el total de las publicaciones del vendedor.
      isBundle = true
      const count = sellerListings.length
      const listingIds = sellerListings.map((l) => l.id)
      const unitPricePremium = resolvePlanPrice('premium')
      const unitPricePro = resolvePlanPrice('pro')

      planOffers = ['premium', 'pro'].map((planCode) => {
        const unitPrice = planCode === 'pro' ? unitPricePro : unitPricePremium
        const original = unitPrice * count
        const token = createBundleUpgradeToken({
          userId: sellerId,
          listingIds,
          planCode,
          campaign: CAMPAIGN,
          discountPct: BUNDLE_DISCOUNT_PCT,
          exp: Date.now() + TOKEN_TTL_MS,
        })
        return {
          planCode,
          title: planCode === 'pro' ? 'Plan Pro Bundle' : 'Plan Premium Bundle',
          subtitle: `${count} publicaciones · ${BUNDLE_DISCOUNT_PCT}% OFF`,
          originalPrice: original,
          discountPrice: Math.round(original * (1 - BUNDLE_DISCOUNT_PCT / 100)),
          highlighted: planCode === 'premium',
          url: `${serverBase}/api/checkout/bundle-upgrade?token=${encodeURIComponent(token)}`,
          bundle: true,
          count,
          unitPrice,
        }
      })

      subject = `Tenés ${count} publicaciones en plan Free`
      title = `Tenés ${count} publicaciones en plan Free`
    } else {
      // Individual 20% OFF vía MercadoPago (mismo flujo de checkout que el resto del engine).
      planOffers = [{
        listingId: primary.id,
        listingTitle: primary.title,
        plans: ['premium', 'pro'].map((planCode) => {
          const original = resolvePlanPrice(planCode)
          const discounted = Math.round(original * (1 - DISCOUNT_PCT / 100))
          const token = createUpgradeToken({
            userId: sellerId,
            listingId: primary.id,
            planCode,
            campaign: CAMPAIGN,
            discountPct: DISCOUNT_PCT,
            exp: Date.now() + TOKEN_TTL_MS,
          })
          return {
            planCode,
            title: planCode === 'pro' ? 'Plan Pro' : 'Plan Premium',
            originalPrice: original,
            discountPrice: discounted,
            highlighted: planCode === 'premium',
            url: `${serverBase}/api/checkout/listing-upgrade?token=${encodeURIComponent(token)}`,
            listingId: primary.id,
          }
        }),
      }]

      subject = 'Mejorá tu publicación con un upgrade de plan'
      title = 'Tu publicación está en plan Free'
    }

    candidates.push({
      campaign: CAMPAIGN,
      priority: PRIORITY,
      userId: sellerId,
      listingId: primary.id,
      email,
      idempotencyKey: buildIdempotencyKey(email),
      payload: {
        subject,
        title,
        subtitle: 'Pasate a Premium o Pro con descuento y conseguí más visibilidad y contacto directo con compradores.',
        intro: 'Vimos que publicaste en el plan gratuito y todavía no activaste el upgrade. Aprovechá este descuento por tiempo limitado y vendé más rápido.',
        cards,
        features: buildFeatureChecklist(),
        planOffers,
        isBundle,
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
