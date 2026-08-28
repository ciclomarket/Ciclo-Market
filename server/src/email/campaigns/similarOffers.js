/**
 * Campaña — Ofertas similares
 * ---------------------------
 * Cuando un comprador consulta por una publicación (email o WhatsApp) y
 * aceptó el checkbox de marketing, le mandamos un email con bicicletas
 * similares (misma categoría + mismo talle de cuadro):
 * - Primer envío: ~15 minutos después de la consulta.
 * - Repite cada 7 días desde entonces, mientras no se dé de baja.
 *
 * No depende de shouldRunAt por hora fija — se evalúa en cada corrida del
 * orquestador, por eso EMAIL_ENGINE_CRON corre cada 15 minutos.
 */

const CAMPAIGN = 'similar_offers'
const PRIORITY = 4

const FIRST_TOUCH_MINUTES = 15
const REPEAT_DAYS = 7
const MAX_LOOKBACK_DAYS = Number(process.env.SIMILAR_OFFERS_LOOKBACK_DAYS) || 180
const MAX_CANDIDATES = Number(process.env.SIMILAR_OFFERS_DAILY_LIMIT) || 500

function buildIdempotencyKey(inquiryId, slot) {
  return `${CAMPAIGN}:${inquiryId}:${slot}`
}

// slot 0 = primer touch (15min-7d). slot N (N>=1) = repeticiones semanales.
function computeSlot(minutesElapsed) {
  if (minutesElapsed < FIRST_TOUCH_MINUTES) return null
  const daysElapsed = minutesElapsed / (24 * 60)
  if (daysElapsed < REPEAT_DAYS) return 0
  return Math.floor(daysElapsed / REPEAT_DAYS)
}

async function fetchOptedInInquiries(supabase, sinceIso) {
  const { data, error } = await supabase
    .from('listing_inquiries')
    .select('id, listing_id, full_name, email, buyer_id, created_at, marketing_opt_in')
    .eq('marketing_opt_in', true)
    .gte('created_at', sinceIso)
    .order('created_at', { ascending: false })
    .limit(MAX_CANDIDATES)

  if (error) {
    console.warn(`[${CAMPAIGN}] listing_inquiries error`, error.message)
    return []
  }
  return data || []
}

async function fetchSimilarListings(supabase, sourceListing, excludeId) {
  let query = supabase
    .from('listings')
    .select('id,slug,title,images,price,price_currency,category,frame_size,created_at')
    .in('status', ['active', 'published'])
    .eq('category', sourceListing.category)
    .neq('id', excludeId)
    .order('created_at', { ascending: false })
    .limit(6)

  if (sourceListing.frame_size) query = query.eq('frame_size', sourceListing.frame_size)

  const { data, error } = await query
  if (error) {
    console.warn(`[${CAMPAIGN}] similar listings error`, error.message)
    return []
  }
  return data || []
}

async function buildCandidates({ supabase, dateCtx, baseFront }) {
  const sinceIso = new Date(dateCtx.now.getTime() - MAX_LOOKBACK_DAYS * 24 * 60 * 60 * 1000).toISOString()
  const inquiries = await fetchOptedInInquiries(supabase, sinceIso)
  if (!inquiries.length) return []

  const listingIds = [...new Set(inquiries.map((i) => i.listing_id).filter(Boolean))]
  if (!listingIds.length) return []

  const { data: sourceListings } = await supabase
    .from('listings')
    .select('id,title,category,frame_size')
    .in('id', listingIds)
  const listingMap = new Map((sourceListings || []).map((l) => [String(l.id), l]))

  const candidates = []

  for (const inquiry of inquiries) {
    const sourceListing = listingMap.get(String(inquiry.listing_id))
    if (!sourceListing?.category) continue

    const minutesElapsed = (dateCtx.now.getTime() - new Date(inquiry.created_at).getTime()) / 60000
    const slot = computeSlot(minutesElapsed)
    if (slot === null) continue

    const email = String(inquiry.email || '').trim().toLowerCase()
    if (!email) continue

    // eslint-disable-next-line no-await-in-loop
    const similar = await fetchSimilarListings(supabase, sourceListing, inquiry.listing_id)
    if (!similar.length) continue

    const cards = similar.map((l) => ({
      id: l.id,
      slug: l.slug,
      title: l.title,
      image: l.images?.[0],
      price: l.price,
      price_currency: l.price_currency,
      link: `${baseFront}/listing/${encodeURIComponent(l.slug || l.id)}`,
    }))

    candidates.push({
      campaign: CAMPAIGN,
      priority: PRIORITY,
      userId: inquiry.buyer_id || null,
      leadEmail: email,
      email,
      listingId: inquiry.listing_id,
      idempotencyKey: buildIdempotencyKey(inquiry.id, slot),
      payload: {
        subject: `Otras opciones como "${sourceListing.title}"`,
        title: 'Bicicletas similares a la que consultaste',
        subtitle: sourceListing.title,
        intro: `Encontramos ${cards.length} publicaciones parecidas a la que preguntaste. Puede que alguna te interese más.`,
        cards,
        ctas: [{ text: 'Ver más bicicletas', url: `${baseFront}/marketplace` }],
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
