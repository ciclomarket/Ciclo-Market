const { createUpgradeToken } = require('../mercadopagoCheckout')

const CAMPAIGN = 'upgrade_comparison'
const PRIORITY = 2

function isFreePlan(row) {
  return String(row?.plan || '').toLowerCase() === 'free'
}

function isPaidPlan(row) {
  const plan = String(row?.plan || '').toLowerCase()
  return plan === 'premium' || plan === 'pro'
}

function buildIdempotencyKey(userId, listingId, isoYear, isoWeek) {
  return `${CAMPAIGN}:${userId}:${listingId}:${isoYear}-${isoWeek}`
}

async function fetchTargetsFreeListings(supabase) {
  const { data, error } = await supabase
    .from('listings')
    .select('id,seller_id,title,slug,price,price_currency,category,images,created_at,updated_at,status,plan')
    .in('status', ['active', 'published'])
    .eq('plan', 'free')
    .order('created_at', { ascending: true })
    .limit(1200)
  if (error) {
    console.warn(`[${CAMPAIGN}] listings error`, error.message)
    return []
  }
  return (data || []).filter(isFreePlan).filter((l) => l.seller_id)
}

async function fetchBenchmarkListingsPaid(supabase) {
  const { data, error } = await supabase
    .from('listings')
    .select('id,seller_id,title,slug,price,price_currency,category,images,created_at,updated_at,status,plan')
    .in('status', ['active', 'published'])
    .in('plan', ['premium', 'pro'])
    .order('created_at', { ascending: false })
    .limit(2000)
  if (error) {
    console.warn(`[${CAMPAIGN}] benchmark listings error`, error.message)
    return []
  }
  return (data || []).filter(isPaidPlan).filter((l) => l.seller_id)
}

async function fetchEngagementMap(supabase, listingIds) {
  if (!listingIds.length) return new Map()
  try {
    const { data, error } = await supabase
      .from('admin_listing_engagement_summary')
      .select('listing_id,views_7d,wa_clicks_7d')
      .in('listing_id', listingIds)
    if (error) return new Map()
    const map = new Map()
    for (const row of data || []) {
      map.set(String(row.listing_id), {
        views7d: Number(row.views_7d || 0),
        waClicks7d: Number(row.wa_clicks_7d || 0),
      })
    }
    return map
  } catch {
    return new Map()
  }
}

async function fetchContacts7dMap(supabase, listingIds, sinceIso) {
  if (!listingIds.length) return new Map()
  const { data } = await supabase
    .from('contact_events')
    .select('listing_id')
    .in('listing_id', listingIds)
    .gte('created_at', sinceIso)
  const counts = new Map()
  for (const row of data || []) {
    const key = String(row.listing_id)
    counts.set(key, (counts.get(key) || 0) + 1)
  }
  return counts
}

async function fetchUsers(supabase, userIds) {
  if (!userIds.length) return new Map()
  const { data } = await supabase
    .from('users')
    .select('id,email,full_name')
    .in('id', userIds)
  const map = new Map()
  for (const row of data || []) {
    if (!row?.id || !row?.email) continue
    map.set(String(row.id), { email: row.email, fullName: row.full_name || 'Ciclista' })
  }
  return map
}

function pickLowPerformer(listings, engagementMap, contactsMap) {
  const withMetrics = listings.map((l) => {
    const e = engagementMap.get(String(l.id)) || { views7d: 0, waClicks7d: 0 }
    const contacts7d = Number(contactsMap.get(String(l.id)) || 0)
    return { ...l, views7d: e.views7d, waClicks7d: e.waClicks7d, contacts7d }
  })

  withMetrics.sort((a, b) => {
    const scoreA = (a.views7d * 1) + (a.contacts7d * 3) + (a.waClicks7d * 2)
    const scoreB = (b.views7d * 1) + (b.contacts7d * 3) + (b.waClicks7d * 2)
    if (scoreA !== scoreB) return scoreA - scoreB
    return new Date(a.updated_at || a.created_at || 0).getTime() - new Date(b.updated_at || b.created_at || 0).getTime()
  })

  return withMetrics[0] || null
}

function pickBenchmark(target, allListings, engagementMap, contactsMap) {
  const targetEngagement = engagementMap.get(String(target.id)) || { views7d: 0, waClicks7d: 0 }
  const targetContacts = Number(contactsMap.get(String(target.id)) || 0)
  const targetScore = (targetEngagement.views7d * 1) + (targetContacts * 3) + (targetEngagement.waClicks7d * 2)

  const minPrice = Number(target.price || 0) * 0.85
  const maxPrice = Number(target.price || 0) * 1.15
  const sameCategoryPaid = allListings.filter((l) => {
    if (String(l.id) === String(target.id)) return false
    const categoryMatch = String(l.category || '').toLowerCase() === String(target.category || '').toLowerCase()
    const price = Number(l.price || 0)
    const priceMatch = Number.isFinite(price) && price >= minPrice && price <= maxPrice
    return categoryMatch && priceMatch && isPaidPlan(l)
  })

  const sameCategoryAnyPaid = allListings.filter((l) => {
    if (String(l.id) === String(target.id)) return false
    const categoryMatch = String(l.category || '').toLowerCase() === String(target.category || '').toLowerCase()
    return categoryMatch && isPaidPlan(l)
  })

  const anyPaid = allListings.filter((l) => {
    if (String(l.id) === String(target.id)) return false
    return isPaidPlan(l)
  })

  const pool = sameCategoryPaid.length
    ? sameCategoryPaid
    : (sameCategoryAnyPaid.length ? sameCategoryAnyPaid : anyPaid)
  if (!pool.length) return null

  const scored = pool.map((l) => {
    const e = engagementMap.get(String(l.id)) || { views7d: 0, waClicks7d: 0 }
    const contacts7d = Number(contactsMap.get(String(l.id)) || 0)
    const score = (e.views7d * 1) + (contacts7d * 3) + (e.waClicks7d * 2)
    return { ...l, views7d: e.views7d, contacts7d, waClicks7d: e.waClicks7d, score }
  })
    .filter((candidate) => candidate.views7d > Number(targetEngagement.views7d || 0))
    .filter((candidate) => candidate.score > targetScore)
    .sort((a, b) => {
      if (b.views7d !== a.views7d) return b.views7d - a.views7d
      return b.score - a.score
    })

  return scored[0] || null
}

async function buildCandidates({ supabase, dateCtx, baseFront, serverBase }) {
  const targets = await fetchTargetsFreeListings(supabase)
  if (!targets.length) return []
  const benchmarkPool = await fetchBenchmarkListingsPaid(supabase)
  if (!benchmarkPool.length) return []

  const listingIds = [...new Set([...targets, ...benchmarkPool].map((l) => l.id))]
  const sellers = [...new Set(targets.map((l) => String(l.seller_id)))]

  const [engagementMap, contactsMap, usersMap] = await Promise.all([
    fetchEngagementMap(supabase, listingIds),
    fetchContacts7dMap(supabase, listingIds, dateCtx.since7d),
    fetchUsers(supabase, sellers),
  ])

  const bySeller = new Map()
  for (const row of targets) {
    const key = String(row.seller_id)
    if (!bySeller.has(key)) bySeller.set(key, [])
    bySeller.get(key).push(row)
  }

  const candidates = []
  for (const [sellerId, listings] of bySeller.entries()) {
    const user = usersMap.get(sellerId)
    if (!user?.email) continue

    const target = pickLowPerformer(listings, engagementMap, contactsMap)
    if (!target) continue

    const benchmark = pickBenchmark(target, benchmarkPool, engagementMap, contactsMap)
    if (!benchmark) continue
    if (String(target.plan || '').toLowerCase() !== 'free') continue

    const premiumToken = createUpgradeToken({ userId: sellerId, listingId: target.id, planCode: 'premium', campaign: CAMPAIGN, exp: Date.now() + 7 * 24 * 60 * 60 * 1000 })
    const proToken = createUpgradeToken({ userId: sellerId, listingId: target.id, planCode: 'pro', campaign: CAMPAIGN, exp: Date.now() + 7 * 24 * 60 * 60 * 1000 })

    candidates.push({
      campaign: CAMPAIGN,
      priority: PRIORITY,
      userId: sellerId,
      email: user.email,
      listingId: target.id,
      idempotencyKey: buildIdempotencyKey(sellerId, target.id, dateCtx.isoYear, dateCtx.isoWeek),
      payload: {
        subject: 'Estás dejando clicks sobre la mesa',
        title: 'Estás dejando clicks sobre la mesa',
        subtitle: 'Podrías recibir más visitas y contactos con Premium o Pro.',
        comparison: {
          current: {
            id: target.id,
            slug: target.slug,
            title: target.title,
            image: target.images?.[0],
            price: target.price,
            price_currency: target.price_currency,
            views7d: Number((engagementMap.get(String(target.id)) || {}).views7d || 0),
            contacts7d: Number(contactsMap.get(String(target.id)) || 0),
            waClicks7d: Number((engagementMap.get(String(target.id)) || {}).waClicks7d || 0),
            link: `${baseFront}/listing/${encodeURIComponent(target.slug || target.id)}`,
          },
          benchmark: {
            id: benchmark.id,
            slug: benchmark.slug,
            title: benchmark.title,
            image: benchmark.images?.[0],
            price: benchmark.price,
            price_currency: benchmark.price_currency,
            views7d: Number(benchmark.views7d || 0),
            contacts7d: Number(benchmark.contacts7d || 0),
            waClicks7d: Number(benchmark.waClicks7d || 0),
            link: `${baseFront}/listing/${encodeURIComponent(benchmark.slug || benchmark.id)}`,
          },
        },
        ctas: [
          { text: 'Hacer upgrade a Premium', url: `${serverBase}/api/checkout/listing-upgrade?token=${encodeURIComponent(premiumToken)}` },
          { text: 'Hacer upgrade a Pro', url: `${serverBase}/api/checkout/listing-upgrade?token=${encodeURIComponent(proToken)}` },
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
