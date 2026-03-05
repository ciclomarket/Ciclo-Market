const CAMPAIGN = 'seller_weekly_performance'
const PRIORITY = 6

function shouldRunToday(dateCtx) {
  return dateCtx.dayOfWeek === 1 // lunes
}

function buildIdempotencyKey(userId, isoYear, isoWeek) {
  return `seller_weekly:${userId}:${isoYear}-${isoWeek}`
}

async function fetchSellerListings(supabase) {
  const { data, error } = await supabase
    .from('listings')
    .select('id,seller_id,title,slug,images,price,price_currency,status,location,seller_location')
    .in('status', ['active', 'published'])
    .limit(2000)
  if (error) return []
  return data || []
}

async function fetchEngagement(supabase, listingIds, sinceIso) {
  const viewsMap = new Map()
  const contactsMap = new Map()
  const likesMap = new Map()

  try {
    const { data: views } = await supabase
      .from('listing_views')
      .select('listing_id')
      .in('listing_id', listingIds)
      .gte('created_at', sinceIso)
    for (const row of views || []) {
      const key = String(row.listing_id)
      viewsMap.set(key, (viewsMap.get(key) || 0) + 1)
    }
  } catch {}

  try {
    const { data: contacts } = await supabase
      .from('contact_events')
      .select('listing_id')
      .in('listing_id', listingIds)
      .gte('created_at', sinceIso)
    for (const row of contacts || []) {
      const key = String(row.listing_id)
      contactsMap.set(key, (contactsMap.get(key) || 0) + 1)
    }
  } catch {}

  try {
    const { data: likes } = await supabase
      .from('listing_likes')
      .select('listing_id')
      .in('listing_id', listingIds)
      .gte('created_at', sinceIso)
    for (const row of likes || []) {
      const key = String(row.listing_id)
      likesMap.set(key, (likesMap.get(key) || 0) + 1)
    }
  } catch {}

  return { viewsMap, contactsMap, likesMap }
}

async function buildCandidates({ supabase, dateCtx, baseFront, forceWeekly = false }) {
  if (!forceWeekly && !shouldRunToday(dateCtx)) return []

  const listings = await fetchSellerListings(supabase)
  if (!listings.length) return []

  const listingIds = listings.map((l) => l.id)
  const { viewsMap, contactsMap, likesMap } = await fetchEngagement(supabase, listingIds, dateCtx.since7d)

  const bySeller = new Map()
  for (const listing of listings) {
    const sellerId = String(listing.seller_id || '')
    if (!sellerId) continue
    if (!bySeller.has(sellerId)) bySeller.set(sellerId, [])
    bySeller.get(sellerId).push(listing)
  }

  const sellerIds = [...bySeller.keys()]
  const { data: users } = await supabase
    .from('users')
    .select('id,email,full_name')
    .in('id', sellerIds)

  const userMap = new Map((users || []).map((u) => [String(u.id), u]))
  const candidates = []

  for (const sellerId of sellerIds) {
    const user = userMap.get(String(sellerId))
    if (!user?.email) continue
    const rows = bySeller.get(String(sellerId)) || []

    const enriched = rows.map((l) => ({
      ...l,
      views7d: Number(viewsMap.get(String(l.id)) || 0),
      contacts7d: Number(contactsMap.get(String(l.id)) || 0),
      likes7d: Number(likesMap.get(String(l.id)) || 0),
    })).sort((a, b) => (b.views7d + b.contacts7d * 2 + b.likes7d) - (a.views7d + a.contacts7d * 2 + a.likes7d))

    const totals = enriched.reduce((acc, item) => {
      acc.views += item.views7d
      acc.contacts += item.contacts7d
      acc.likes += item.likes7d
      return acc
    }, { views: 0, contacts: 0, likes: 0 })

    const recommendedActions = []
    if (totals.views < 20) recommendedActions.push('Mejorá fotos y portada para aumentar clics')
    if (totals.contacts < 3) recommendedActions.push('Completá descripción y especificaciones clave')
    if (enriched.some((x) => Number(x.likes7d || 0) > 0 && Number(x.contacts7d || 0) === 0)) {
      recommendedActions.push('Revisá el precio para convertir favoritos en consultas')
    }
    if (!recommendedActions.length) recommendedActions.push('Mantené tus publicaciones actualizadas para sostener el rendimiento')

    candidates.push({
      campaign: CAMPAIGN,
      priority: PRIORITY,
      userId: sellerId,
      email: user.email,
      idempotencyKey: buildIdempotencyKey(sellerId, dateCtx.isoYear, dateCtx.isoWeek),
      payload: {
        subject: 'Resumen semanal de tus publicaciones',
        title: 'Tu semana en Ciclo Market',
        subtitle: `Lograste ${totals.views} visitas, ${totals.contacts} contactos y ${totals.likes} favoritos en 7 días.`,
        intro: 'Mirá tus publicaciones con mejor rendimiento y aplicá mejoras rápidas desde el dashboard.',
        cards: enriched.slice(0, 4).map((l) => ({
          id: l.id,
          slug: l.slug,
          title: l.title,
          image: l.images?.[0],
          price: l.price,
          price_currency: l.price_currency,
          location: l.location || l.seller_location || null,
          views7d: l.views7d,
          likes7d: l.likes7d,
          statsLabel: 'Vistas últimos 7 días',
          link: `${baseFront}/listing/${encodeURIComponent(l.slug || l.id)}`,
        })),
        recommendedActions,
        ctas: [
          { text: 'Ir a mi dashboard', url: `${baseFront}/dashboard` },
          { text: 'Editar publicación', url: `${baseFront}/dashboard?tab=listings` },
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
