const CAMPAIGN = 'buyer_interest_weekly'
const PRIORITY = 4

function shouldRunToday(dateCtx) {
  return dateCtx.dayOfWeek === 1 // lunes
}

function buildIdempotencyKey(userId, category, isoYear, isoWeek) {
  return `${CAMPAIGN}:${userId}:${category}:${isoYear}-${isoWeek}`
}

async function buildInterestMap(supabase, sinceIso) {
  const { data, error } = await supabase
    .from('contact_events')
    .select('buyer_id,listing_id,created_at')
    .gte('created_at', sinceIso)
    .limit(4000)

  if (error || !data?.length) return new Map()

  const listingIds = [...new Set(data.map((r) => r.listing_id).filter(Boolean))]
  const { data: listings } = await supabase
    .from('listings')
    .select('id,category')
    .in('id', listingIds)

  const catByListing = new Map((listings || []).map((l) => [String(l.id), String(l.category || '').trim()]))

  const map = new Map()
  for (const row of data) {
    const buyerId = String(row.buyer_id || '').trim()
    const category = catByListing.get(String(row.listing_id || ''))
    if (!buyerId || !category) continue
    const key = `${buyerId}::${category}`
    map.set(key, (map.get(key) || 0) + 1)
  }

  return map
}

async function upsertInterests(supabase, map) {
  const now = new Date().toISOString()
  const rows = []
  for (const [key, score] of map.entries()) {
    const [userId, category] = key.split('::')
    rows.push({ user_id: userId, category, score, source: 'contact_events', last_seen_at: now, updated_at: now })
  }
  if (!rows.length) return

  await supabase
    .from('user_interests')
    .upsert(rows, { onConflict: 'user_id,category,source' })
}

async function fetchListingsForCategory(supabase, category, sinceIso) {
  const { data } = await supabase
    .from('listings')
    .select('id,slug,title,images,price,price_currency,category,created_at')
    .in('status', ['active', 'published'])
    .eq('category', category)
    .gte('created_at', sinceIso)
    .order('created_at', { ascending: false })
    .limit(12)
  return data || []
}

async function buildCandidates({ supabase, dateCtx, baseFront, forceWeekly = false }) {
  if (!forceWeekly && !shouldRunToday(dateCtx)) return []

  const interestMap = await buildInterestMap(supabase, dateCtx.since30d)
  if (!interestMap.size) return []
  await upsertInterests(supabase, interestMap)

  const userIds = [...new Set(Array.from(interestMap.keys()).map((k) => k.split('::')[0]))]
  const { data: users } = await supabase
    .from('users')
    .select('id,email')
    .in('id', userIds)

  const userMap = new Map((users || []).map((u) => [String(u.id), u]))
  const candidates = []

  for (const [key] of interestMap.entries()) {
    const [userId, category] = key.split('::')
    const user = userMap.get(String(userId))
    if (!user?.email) continue
    const listings = await fetchListingsForCategory(supabase, category, dateCtx.since7d)
    if (!listings.length) continue

    candidates.push({
      campaign: CAMPAIGN,
      priority: PRIORITY,
      userId,
      email: user.email,
      idempotencyKey: buildIdempotencyKey(userId, category, dateCtx.isoYear, dateCtx.isoWeek),
      payload: {
        subject: 'Bicis nuevas según tu interés',
        title: 'Bicis nuevas según tu interés',
        subtitle: 'Basado en las bicis con las que te contactaste.',
        cards: listings.map((l) => ({
          id: l.id,
          slug: l.slug,
          title: l.title,
          image: l.images?.[0],
          price: l.price,
          price_currency: l.price_currency,
          link: `${baseFront}/listing/${encodeURIComponent(l.slug || l.id)}`,
        })),
        ctas: [{ text: 'Ver más de esta categoría', url: `${baseFront}/marketplace?cat=${encodeURIComponent(category)}` }],
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
