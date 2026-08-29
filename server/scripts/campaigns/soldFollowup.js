#!/usr/bin/env node
/**
 * "¿Aún tenés tu bicicleta en venta?"
 * Cada 30 días desde la publicación, mientras siga activa. Un solo envío
 * por publicación por período de 30 días (idempotency_key incluye el
 * período, no la fecha del día — así una corrida diaria no genera keys
 * nuevas para la misma publicación dentro del mismo período).
 *
 * Disparo: Render Cron Job, diario ~10:00 ART.
 *   node scripts/campaigns/soldFollowup.js
 */
require('dotenv').config({ path: require('path').join(__dirname, '..', '..', '.env') })

const { createUnsubscribeToken } = require('../../src/email/unsubscribe')
const { resolveBaseFront, buildLayout, buildListingCardHtml, runCampaign } = require('./_shared')

const CAMPAIGN = 'sold_followup'
const PERIOD_DAYS = 30
const RUN_LIMIT = Number(process.env.SOLD_FOLLOWUP_RUN_LIMIT) || 80
const TOKEN_TTL_MS = 45 * 24 * 60 * 60 * 1000 // más largo que el período, para que el link no expire antes de tiempo

function daysSince(createdAt, now) {
  const d = new Date(createdAt)
  if (!Number.isFinite(d.getTime())) return null
  return Math.floor((now.getTime() - d.getTime()) / (24 * 60 * 60 * 1000))
}

async function fetchActiveListings(supabase) {
  const { data, error } = await supabase
    .from('listings')
    .select('id,slug,seller_id,title,images,price,price_currency,status,is_demo_listing,created_at')
    .in('status', ['active', 'published'])
    .eq('is_demo_listing', false)
    .order('created_at', { ascending: true })
    .limit(2000)
  if (error) {
    console.warn(`[${CAMPAIGN}] listings error`, error.message)
    return []
  }
  return (data || []).filter((l) => l.seller_id)
}

async function buildCandidates(supabase) {
  const now = new Date()
  const baseFront = resolveBaseFront()
  const serverBase = String(process.env.SERVER_BASE_URL || process.env.PUBLIC_BASE_URL || 'https://ciclo-market.onrender.com').replace(/\/$/, '')

  const listings = await fetchActiveListings(supabase)
  if (!listings.length) return []

  const eligible = []
  for (const l of listings) {
    const days = daysSince(l.created_at, now)
    if (days === null || days < PERIOD_DAYS) continue
    eligible.push({ listing: l, period: Math.floor(days / PERIOD_DAYS) })
  }
  if (!eligible.length) return []

  const sellerIds = [...new Set(eligible.map((e) => e.listing.seller_id))]
  const { data: users } = await supabase.from('users').select('id,email,full_name').in('id', sellerIds)
  const usersMap = new Map((users || []).map((u) => [String(u.id), u]))

  const candidates = []
  for (const { listing: l, period } of eligible.slice(0, RUN_LIMIT)) {
    const user = usersMap.get(String(l.seller_id))
    const email = String(user?.email || '').trim().toLowerCase()
    if (!email) continue

    const listingUrl = `${baseFront}/listing/${encodeURIComponent(l.slug || l.id)}`
    const token = createUnsubscribeToken({
      type: 'sold_followup',
      email,
      userId: l.seller_id,
      listingId: l.id,
      exp: Date.now() + TOKEN_TTL_MS,
    })
    const unsubscribeToken = createUnsubscribeToken({ email, userId: l.seller_id, exp: Date.now() + 180 * 24 * 60 * 60 * 1000 })

    const bodyHtml = `
${buildListingCardHtml(l, baseFront)}
<div style="text-align:center;margin-top:18px">
  <a href="${serverBase}/api/email-actions/sold-followup?token=${encodeURIComponent(token)}&action=still_selling"
     style="display:inline-block;padding:11px 20px;background:#14212e;color:#fff;text-decoration:none;border-radius:999px;font-weight:600;font-size:14px;margin:4px">
    Sí, sigue en venta
  </a>
  <a href="${serverBase}/api/email-actions/sold-followup?token=${encodeURIComponent(token)}&action=sold"
     style="display:inline-block;padding:11px 20px;background:#f1f5f9;color:#14212e;text-decoration:none;border-radius:999px;font-weight:600;font-size:14px;margin:4px">
    Ya la vendí
  </a>
</div>
<p style="font-size:12px;color:#94a3b8;text-align:center;margin-top:16px">
  <a href="${serverBase}/unsubscribe?token=${encodeURIComponent(unsubscribeToken)}" style="color:#94a3b8">Dejar de recibir estos recordatorios</a>
</p>`

    const html = buildLayout({
      baseFront,
      title: '¿Seguís vendiendo esta bicicleta?',
      introHtml: 'Hace un tiempo publicaste esta bicicleta en Ciclo Market. Si ya la vendiste, marcala como vendida para que deje de recibir consultas.',
      bodyHtml,
    })
    const text = `¿Seguís vendiendo "${l.title}"? Confirmá o marcá como vendida: ${listingUrl}`

    candidates.push({
      idempotencyKey: `${CAMPAIGN}:${l.id}:${period}`,
      email,
      userId: l.seller_id,
      listingId: l.id,
      subject: '¿Aún tenés tu bicicleta en venta?',
      html,
      text,
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
