/**
 * Campaña 2 — Sold Follow-up
 * --------------------------
 * "¿Aún tenés tu bicicleta en venta?"
 * - Corrida: todos los días 10:00 (hora Argentina).
 * - Cadencia: cada 30 días desde la fecha de publicación (mientras siga activa).
 * - Botones: "Sí, sigue en venta" (confirma) | "Ya la vendí" (marca vendida).
 */

const { createUpgradeToken } = require('../mercadopagoCheckout')

const CAMPAIGN = 'sold_followup'
const PRIORITY = 2

const PERIOD_DAYS = 30
const DAILY_SEND_LIMIT = Number(process.env.SOLD_FOLLOWUP_DAILY_LIMIT) || 250
const TOKEN_TTL_MS = 45 * 24 * 60 * 60 * 1000 // el token dura más que el período de 30 días

function shouldRunAt(dateCtx) {
  return dateCtx.hourInTz === 10 // 10AM Argentina
}

// Un envío por publicación por cada período de 30 días (período 1 = días 30-59, etc.).
function buildIdempotencyKey(listingId, period) {
  return `${CAMPAIGN}:${listingId}:${period}`
}

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
    .order('created_at', { ascending: true }) // las más antiguas primero (cumplen 30 días antes)
    .limit(2000)

  if (error) {
    console.warn(`[${CAMPAIGN}] listings error`, error.message)
    return []
  }

  return (data || []).filter((l) => l.seller_id)
}

async function buildCandidates({ supabase, dateCtx, baseFront, serverBase, forceWeekly = false }) {
  if (!forceWeekly && !shouldRunAt(dateCtx)) return []

  const listings = await fetchActiveListings(supabase)
  if (!listings.length) return []

  const sellerIds = [...new Set(listings.map((l) => l.seller_id).filter(Boolean))]
  if (!sellerIds.length) return []

  const { data: users } = await supabase.from('users').select('id,email,full_name').in('id', sellerIds)
  const usersMap = new Map((users || []).map((u) => [String(u.id), u]))

  const candidates = []
  let sent = 0

  for (const l of listings) {
    if (sent >= DAILY_SEND_LIMIT) break

    const days = daysSince(l.created_at, dateCtx.now)
    if (days === null || days < PERIOD_DAYS) continue
    const period = Math.floor(days / PERIOD_DAYS)

    const user = usersMap.get(String(l.seller_id))
    const email = String(user?.email || '').trim().toLowerCase()
    if (!email) continue

    const listingUrl = `${baseFront}/listing/${encodeURIComponent(l.slug || l.id)}`
    const token = createUpgradeToken({
      type: 'sold_followup',
      userId: l.seller_id,
      listingId: l.id,
      exp: Date.now() + TOKEN_TTL_MS,
    })

    candidates.push({
      campaign: CAMPAIGN,
      priority: PRIORITY,
      userId: l.seller_id,
      listingId: l.id,
      email,
      idempotencyKey: buildIdempotencyKey(l.id, period),
      payload: {
        subject: '¿Aún tenés tu bicicleta en venta?',
        title: '¿Seguís vendiendo esta bicicleta?',
        subtitle: 'Ayudanos a mantener el marketplace actualizado.',
        intro: 'Hace un tiempo publicaste esta bicicleta en Ciclo Market. Si ya la vendiste, marcala como vendida para que deje de recibir consultas.',
        cards: [{
          id: l.id,
          slug: l.slug,
          title: l.title,
          image: l.images?.[0],
          price: l.price,
          price_currency: l.price_currency,
          link: listingUrl,
        }],
        ctas: [
          { text: 'Sí, sigue en venta', url: `${serverBase}/api/email/sold-followup?token=${encodeURIComponent(token)}&action=still_selling` },
          { text: 'Ya la vendí', url: `${serverBase}/api/email/sold-followup?token=${encodeURIComponent(token)}&action=sold`, secondary: true },
        ],
      },
    })
    sent += 1
  }

  return candidates
}

module.exports = {
  CAMPAIGN,
  PRIORITY,
  buildCandidates,
}
