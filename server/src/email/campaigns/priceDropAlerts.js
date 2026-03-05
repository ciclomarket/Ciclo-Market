const CAMPAIGN = 'price_drop_alert'
const PRIORITY = 3

function buildIdempotencyKey(userId, listingId, isoYear, isoWeek) {
  return `price_drop:${userId}:${listingId}:${isoYear}-${isoWeek}`
}

async function fetchPriceDrops(supabase, sinceIso) {
  const { data, error } = await supabase
    .from('price_adjustments')
    .select('listing_id,old_price,new_price,created_at')
    .lt('new_price', 'old_price')
    .gte('created_at', sinceIso)
    .order('created_at', { ascending: false })
    .limit(500)

  if (error) return []
  return data || []
}

async function fetchInterestedUsers(supabase, listingId, sinceIso) {
  const users = new Set()

  try {
    const { data: views } = await supabase
      .from('listing_views')
      .select('user_id')
      .eq('listing_id', listingId)
      .gte('created_at', sinceIso)
      .limit(1000)
    for (const row of views || []) {
      if (row?.user_id) users.add(String(row.user_id))
    }
  } catch {}

  try {
    const { data: likes } = await supabase
      .from('listing_likes')
      .select('user_id')
      .eq('listing_id', listingId)
      .limit(1000)
    for (const row of likes || []) {
      if (row?.user_id) users.add(String(row.user_id))
    }
  } catch {}

  return [...users]
}

async function buildCandidates({ supabase, dateCtx, baseFront }) {
  const drops = await fetchPriceDrops(supabase, dateCtx.since7d)
  if (!drops.length) return []

  const listingIds = [...new Set(drops.map((d) => d.listing_id).filter(Boolean))]
  const { data: listings } = await supabase
    .from('listings')
    .select('id,slug,title,images,price,price_currency,status')
    .in('id', listingIds)

  const listingMap = new Map((listings || []).map((l) => [String(l.id), l]))

  const allUsers = new Set()
  const byListingUsers = new Map()
  for (const listingId of listingIds) {
    const interested = await fetchInterestedUsers(supabase, listingId, dateCtx.since30d)
    byListingUsers.set(String(listingId), interested)
    for (const userId of interested) allUsers.add(userId)
  }

  if (!allUsers.size) return []

  const { data: users } = await supabase
    .from('users')
    .select('id,email')
    .in('id', [...allUsers])

  const userMap = new Map((users || []).map((u) => [String(u.id), u.email]))

  const candidates = []
  for (const drop of drops) {
    const listing = listingMap.get(String(drop.listing_id))
    if (!listing) continue
    const interestedUsers = byListingUsers.get(String(drop.listing_id)) || []

    for (const userId of interestedUsers) {
      const email = userMap.get(String(userId))
      if (!email) continue
      candidates.push({
        campaign: CAMPAIGN,
        priority: PRIORITY,
        userId,
        email,
        listingId: drop.listing_id,
        idempotencyKey: buildIdempotencyKey(userId, drop.listing_id, dateCtx.isoYear, dateCtx.isoWeek),
        payload: {
          subject: 'Una bici que viste bajó de precio',
          title: 'Una bici que viste bajó de precio',
          subtitle: `Aprovechá la oferta: bajó de ${Number(drop.old_price || 0)} a ${Number(drop.new_price || 0)}.`,
          cards: [{
            id: listing.id,
            slug: listing.slug,
            title: listing.title,
            image: listing.images?.[0],
            price: drop.new_price,
            price_currency: listing.price_currency,
            link: `${baseFront}/listing/${encodeURIComponent(listing.slug || listing.id)}`,
          }],
          ctas: [{ text: 'Ver oferta', url: `${baseFront}/listing/${encodeURIComponent(listing.slug || listing.id)}` }],
        },
      })
    }
  }

  return candidates
}

module.exports = {
  CAMPAIGN,
  PRIORITY,
  buildCandidates,
}
