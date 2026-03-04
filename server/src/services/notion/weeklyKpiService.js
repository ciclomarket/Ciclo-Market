const { getServerSupabaseClient } = require('../../lib/supabaseClient')

const PAGE_SIZE = 1000

function addDays(date, days) {
  const copy = new Date(date.getTime())
  copy.setUTCDate(copy.getUTCDate() + days)
  return copy
}

function toIsoDate(date) {
  return date.toISOString().slice(0, 10)
}

function getIsoWeekParts(inputDate) {
  const date = new Date(Date.UTC(inputDate.getUTCFullYear(), inputDate.getUTCMonth(), inputDate.getUTCDate()))
  const dayNum = date.getUTCDay() || 7
  date.setUTCDate(date.getUTCDate() + 4 - dayNum)
  const yearStart = new Date(Date.UTC(date.getUTCFullYear(), 0, 1))
  const weekNo = Math.ceil((((date - yearStart) / 86400000) + 1) / 7)
  return { isoYear: date.getUTCFullYear(), isoWeek: weekNo }
}

function getWeekKey(inputDate) {
  const { isoYear, isoWeek } = getIsoWeekParts(inputDate)
  return `${isoYear}W${String(isoWeek).padStart(2, '0')}`
}

async function fetchAllRows(queryFactory, pageSize = PAGE_SIZE) {
  let from = 0
  const rows = []

  while (true) {
    const to = from + pageSize - 1
    const query = queryFactory().range(from, to)
    const { data, error } = await query
    if (error) throw error

    const batch = data || []
    rows.push(...batch)
    if (batch.length < pageSize) break

    from += pageSize
  }

  return rows
}

function median(values) {
  if (!values.length) return null
  const sorted = [...values].sort((a, b) => a - b)
  const middle = Math.floor(sorted.length / 2)
  if (sorted.length % 2 === 0) {
    return (sorted[middle - 1] + sorted[middle]) / 2
  }
  return sorted[middle]
}

async function getWeeklyKpis(options = {}) {
  const now = options.now ? new Date(options.now) : new Date()
  const periodEnd = options.periodEnd ? new Date(options.periodEnd) : now
  const periodStart = options.periodStart ? new Date(options.periodStart) : addDays(periodEnd, -7)

  const periodStartIso = periodStart.toISOString()
  const periodEndIso = periodEnd.toISOString()
  const weekKey = getWeekKey(periodEnd)

  const supabase = getServerSupabaseClient()

  const listings7d = await fetchAllRows(() =>
    supabase
      .from('listings')
      .select('id,title,brand,model,created_at')
      .gte('created_at', periodStartIso)
      .lte('created_at', periodEndIso)
      .order('created_at', { ascending: false })
  )

  const contactEvents7d = await fetchAllRows(() =>
    supabase
      .from('contact_events')
      .select('listing_id,created_at,type')
      .gte('created_at', periodStartIso)
      .lte('created_at', periodEndIso)
      .order('created_at', { ascending: false })
  )

  const listingViews7d = await fetchAllRows(() =>
    supabase
      .from('listing_views')
      .select('listing_id,created_at')
      .gte('created_at', periodStartIso)
      .lte('created_at', periodEndIso)
  )

  const listingLikes7d = await fetchAllRows(() =>
    supabase
      .from('listing_likes')
      .select('listing_id,created_at')
      .gte('created_at', periodStartIso)
      .lte('created_at', periodEndIso)
  )

  const priceDrops7d = await fetchAllRows(() =>
    supabase
      .from('price_adjustments')
      .select('old_price,new_price,changed_at')
      .gte('changed_at', periodStartIso)
      .lte('changed_at', periodEndIso)
  )
  const priceDropsOnly = priceDrops7d.filter((row) => Number(row?.new_price) < Number(row?.old_price))

  const listingIdsFromViews = Array.from(new Set(listingViews7d.map((v) => String(v.listing_id)).filter(Boolean)))
  const listingIdsFromLikes = Array.from(new Set(listingLikes7d.map((l) => String(l.listing_id)).filter(Boolean)))
  const listingIdsNeeded = Array.from(new Set([...listingIdsFromViews, ...listingIdsFromLikes, ...listings7d.map((l) => String(l.id))]))

  const listingMeta = new Map()
  if (listingIdsNeeded.length) {
    const rows = await fetchAllRows(() =>
      supabase
        .from('listings')
        .select('id,title,brand,model,created_at')
        .in('id', listingIdsNeeded)
    )

    for (const row of rows) {
      listingMeta.set(String(row.id), row)
    }
  }

  const viewCounts = new Map()
  for (const row of listingViews7d) {
    const listingId = String(row.listing_id || '')
    if (!listingId) continue
    viewCounts.set(listingId, (viewCounts.get(listingId) || 0) + 1)
  }

  const topListingsByViews = Array.from(viewCounts.entries())
    .map(([listingId, views]) => ({
      listingId,
      views,
      title: listingMeta.get(listingId)?.title || `Listing ${listingId.slice(0, 8)}`,
    }))
    .sort((a, b) => b.views - a.views)
    .slice(0, 10)

  const likesByModel = new Map()
  for (const row of listingLikes7d) {
    const listingId = String(row.listing_id || '')
    const meta = listingMeta.get(listingId)
    if (!meta) continue

    const brand = String(meta.brand || '').trim()
    const model = String(meta.model || '').trim()
    const key = `${brand} ${model}`.trim() || model || brand || 'Unknown model'
    likesByModel.set(key, (likesByModel.get(key) || 0) + 1)
  }

  const topModelsByLikes = Array.from(likesByModel.entries())
    .map(([model, likes]) => ({ model, likes }))
    .sort((a, b) => b.likes - a.likes)
    .slice(0, 10)

  const listingIdsForContactMedian = listings7d.map((l) => String(l.id))
  let medianHoursToFirstContact = null

  if (listingIdsForContactMedian.length) {
    const contactsForListings = await fetchAllRows(() =>
      supabase
        .from('contact_events')
        .select('listing_id,created_at')
        .in('listing_id', listingIdsForContactMedian)
        .order('created_at', { ascending: true })
    )

    const firstContactByListing = new Map()
    for (const row of contactsForListings) {
      const listingId = String(row.listing_id || '')
      if (!listingId || firstContactByListing.has(listingId)) continue
      firstContactByListing.set(listingId, row.created_at)
    }

    const diffsInHours = []
    for (const listing of listings7d) {
      const firstContactAt = firstContactByListing.get(String(listing.id))
      if (!firstContactAt || !listing.created_at) continue
      const diffMs = new Date(firstContactAt).getTime() - new Date(listing.created_at).getTime()
      if (!Number.isFinite(diffMs) || diffMs < 0) continue
      diffsInHours.push(diffMs / 36e5)
    }

    medianHoursToFirstContact = median(diffsInHours)
  }

  return {
    weekKey,
    weekStart: toIsoDate(periodStart),
    weekEnd: toIsoDate(periodEnd),
    newListings7d: listings7d.length,
    contacts7d: contactEvents7d.length,
    topListingsByViews,
    topModelsByLikes,
    priceDrops7d: priceDropsOnly.length,
    medianHoursToFirstContact,
    raw: {
      listingViewsCount: listingViews7d.length,
      listingLikesCount: listingLikes7d.length,
      listingsCount: listings7d.length,
      contactEventsCount: contactEvents7d.length,
      priceAdjustmentsDropCount: priceDropsOnly.length,
    },
  }
}

module.exports = {
  getWeeklyKpis,
  getWeekKey,
}
