/**
 * Campaña 4 — WhatsApp Upsell
 * ---------------------------
 * Publicaciones free que NO tienen el botón de WhatsApp activado.
 * - Corrida: todos los días 20:00 (hora Argentina).
 * - Etapas: día 15 desde publicación (mail 1) y día 40 (mail 2).
 * - Cada etapa se envía UNA sola vez por publicación.
 */

const CAMPAIGN = 'whatsapp_upsell'
const PRIORITY = 3

const STAGE_15_DAYS = 15
const STAGE_40_DAYS = 40
const DAILY_SEND_LIMIT = Number(process.env.WHATSAPP_UPSELL_DAILY_LIMIT) || 60

function shouldRunAt(dateCtx) {
  return dateCtx.hourInTz === 20 // 8PM Argentina
}

// Un envío por publicación por etapa (15 y 40 días).
function buildIdempotencyKey(listingId, stage) {
  return `${CAMPAIGN}:${listingId}:${stage}`
}

function daysSince(createdAt, now) {
  const d = new Date(createdAt)
  if (!Number.isFinite(d.getTime())) return null
  return Math.floor((now.getTime() - d.getTime()) / (24 * 60 * 60 * 1000))
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

async function fetchTargets(supabase) {
  const { data, error } = await supabase
    .from('listings')
    .select('id,slug,seller_id,title,images,price,price_currency,plan,plan_code,seller_plan,status,is_demo_listing,whatsapp_enabled,whatsapp_user_disabled,created_at')
    .in('status', ['active', 'published'])
    .eq('is_demo_listing', false)
    .or('whatsapp_enabled.is.null,whatsapp_enabled.eq.false')
    .order('created_at', { ascending: false })
    .limit(2000)

  if (error) {
    console.warn(`[${CAMPAIGN}] listings error`, error.message)
    return []
  }

  return (data || [])
    .filter(isFreePlan)
    .filter((l) => !l.whatsapp_user_disabled) // si el usuario lo desactivó a propósito, no insistir
    .filter((l) => l.seller_id)
}

async function buildCandidates({ supabase, dateCtx, baseFront, forceWeekly = false }) {
  if (!forceWeekly && !shouldRunAt(dateCtx)) return []

  const listings = await fetchTargets(supabase)
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
    if (days === null || days < STAGE_15_DAYS) continue
    const stage = days >= STAGE_40_DAYS ? STAGE_40_DAYS : STAGE_15_DAYS

    const user = usersMap.get(String(l.seller_id))
    const email = String(user?.email || '').trim().toLowerCase()
    if (!email) continue

    candidates.push({
      campaign: CAMPAIGN,
      priority: PRIORITY,
      userId: l.seller_id,
      listingId: l.id,
      email,
      idempotencyKey: buildIdempotencyKey(l.id, stage),
      payload: {
        subject: stage === STAGE_40_DAYS
          ? '¿Sabías que WhatsApp aumenta tus ventas un 70%?'
          : 'Activá WhatsApp y vendé más rápido',
        title: 'El botón de WhatsApp aumenta tus ventas',
        subtitle: 'Detectamos que tu publicación no tiene WhatsApp activado.',
        intro: '¿Sabías que el simple hecho de tener el botón de WhatsApp aumenta las ventas un 70%? Detectamos un abandono del 70% comparado a usuarios que se contactan mediante WhatsApp.',
        cards: [{
          id: l.id,
          slug: l.slug,
          title: l.title,
          image: l.images?.[0],
          price: l.price,
          price_currency: l.price_currency,
          link: `${baseFront}/listing/${encodeURIComponent(l.slug || l.id)}`,
        }],
        ctas: [
          { text: 'Activar WhatsApp', url: `${baseFront}/dashboard?tab=Publicaciones` },
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
