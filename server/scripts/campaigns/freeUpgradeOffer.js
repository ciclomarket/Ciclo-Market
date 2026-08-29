#!/usr/bin/env node
/**
 * "Mejorá tu publicación con un upgrade de plan"
 * Vendedores en plan Free sin pago asociado. Un solo envío por vendedor,
 * para siempre (idempotency_key = campaign:email, sin período).
 *
 * A diferencia del sistema viejo, NO genera un token de checkout con
 * descuento propio — linkea directo al panel, que ya tiene el flujo real
 * de upgrade (services/paymentService.js). Menos superficie, un solo
 * camino de pago en todo el producto.
 *
 * Disparo: Render Cron Job, diario ~20:00 ART.
 *   node scripts/campaigns/freeUpgradeOffer.js
 */
require('dotenv').config({ path: require('path').join(__dirname, '..', '..', '.env') })

const { createUnsubscribeToken } = require('../../src/email/unsubscribe')
const { resolveBaseFront, buildLayout, buildListingCardHtml, runCampaign } = require('./_shared')

const CAMPAIGN = 'free_upgrade_offer'
const RUN_LIMIT = Number(process.env.FREE_UPGRADE_OFFER_RUN_LIMIT) || 80

function isFreePlan(listing) {
  const plan = String(listing?.plan || '').toLowerCase()
  const planCode = String(listing?.plan_code || '').toLowerCase()
  const sellerPlan = String(listing?.seller_plan || '').toLowerCase()
  if (plan && plan !== 'free') return false
  if (planCode && planCode !== 'free') return false
  if (sellerPlan && sellerPlan !== 'free') return false
  return plan === 'free' || planCode === 'free' || sellerPlan === 'free'
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

  const ids = free.map((l) => l.id)
  const { data: payments } = await supabase.from('payments').select('listing_id').in('listing_id', ids)
  const paidIds = new Set((payments || []).map((p) => p.listing_id))
  return free.filter((l) => !paidIds.has(l.id))
}

async function buildCandidates(supabase) {
  const baseFront = resolveBaseFront()
  const serverBase = String(process.env.SERVER_BASE_URL || process.env.PUBLIC_BASE_URL || 'https://ciclo-market.onrender.com').replace(/\/$/, '')

  const listings = await fetchFreeListingsWithoutPayment(supabase)
  if (!listings.length) return []

  const bySeller = new Map()
  for (const l of listings) {
    if (!bySeller.has(l.seller_id)) bySeller.set(l.seller_id, [])
    bySeller.get(l.seller_id).push(l)
  }

  const sellers = [...bySeller.entries()]
    .sort(([, a], [, b]) => Math.max(...b.map((l) => new Date(l.created_at || 0).getTime())) - Math.max(...a.map((l) => new Date(l.created_at || 0).getTime())))
    .slice(0, RUN_LIMIT)

  const sellerIds = sellers.map(([id]) => id)
  const { data: users } = await supabase.from('users').select('id,email').in('id', sellerIds)
  const usersMap = new Map((users || []).map((u) => [String(u.id), u]))

  const candidates = []
  for (const [sellerId, sellerListings] of sellers) {
    const email = String(usersMap.get(String(sellerId))?.email || '').trim().toLowerCase()
    if (!email) continue

    const isBundle = sellerListings.length >= 2
    const subject = isBundle ? `Tenés ${sellerListings.length} publicaciones en plan Free` : 'Mejorá tu publicación con un upgrade de plan'
    const dashboardUrl = `${baseFront}/dashboard?tab=${encodeURIComponent('Publicaciones')}`
    const unsubscribeToken = createUnsubscribeToken({ email, userId: sellerId, exp: Date.now() + 180 * 24 * 60 * 60 * 1000 })

    const cardsHtml = sellerListings.slice(0, 6).map((l) => buildListingCardHtml(l, baseFront)).join('')
    const bodyHtml = `
${cardsHtml}
<div style="text-align:center;margin-top:18px">
  <a href="${dashboardUrl}" style="display:inline-block;padding:12px 22px;background:#14212e;color:#fff;text-decoration:none;border-radius:999px;font-weight:600;font-size:14px">
    Ver planes en mi panel
  </a>
</div>
<p style="font-size:12px;color:#94a3b8;text-align:center;margin-top:16px">
  <a href="${baseFront}/unsubscribe?token=${encodeURIComponent(unsubscribeToken)}" style="color:#94a3b8">Dejar de recibir estos avisos</a>
</p>`

    const html = buildLayout({
      baseFront,
      title: isBundle ? `Tenés ${sellerListings.length} publicaciones en plan Free` : 'Tu publicación está en plan Free',
      introHtml: 'Pasate a Premium o Pro y conseguí más visibilidad, WhatsApp habilitado y contacto directo con compradores.',
      bodyHtml,
    })

    candidates.push({
      idempotencyKey: `${CAMPAIGN}:${email}`,
      email,
      userId: sellerId,
      listingId: sellerListings[0].id,
      subject,
      html,
      text: `Mejorá tu publicación con un upgrade de plan: ${dashboardUrl}`,
    })
  }
  return candidates
}

if (require.main === module) {
  runCampaign(CAMPAIGN, buildCandidates)
    .then(() => process.exit(0))
    .catch((err) => {
      console.error(`[${CAMPAIGN}] error fatal`, err)
      process.exit(1)
    })
}

module.exports = { buildCandidates }
