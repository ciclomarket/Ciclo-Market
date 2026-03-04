import { getServerSupabaseClient } from '../../lib/supabaseClient'

const PAGE_SIZE = 1000

type ListingRow = {
  id: string
  title: string | null
  brand: string | null
  model: string | null
  created_at: string | null
}

type EventRow = {
  listing_id: string | null
  created_at: string | null
}

export type WeeklyKpis = {
  weekKey: string
  weekStart: string
  weekEnd: string
  newListings7d: number
  contacts7d: number
  topListingsByViews: Array<{ listingId: string; title: string; views: number }>
  topModelsByLikes: Array<{ model: string; likes: number }>
  priceDrops7d: number
  medianHoursToFirstContact: number | null
  raw: {
    listingViewsCount: number
    listingLikesCount: number
    listingsCount: number
    contactEventsCount: number
    priceAdjustmentsDropCount: number
  }
}

function addDays(date: Date, days: number): Date {
  const copy = new Date(date.getTime())
  copy.setUTCDate(copy.getUTCDate() + days)
  return copy
}

function toIsoDate(date: Date): string {
  return date.toISOString().slice(0, 10)
}

function getIsoWeekParts(inputDate: Date): { isoYear: number; isoWeek: number } {
  const date = new Date(Date.UTC(inputDate.getUTCFullYear(), inputDate.getUTCMonth(), inputDate.getUTCDate()))
  const dayNum = date.getUTCDay() || 7
  date.setUTCDate(date.getUTCDate() + 4 - dayNum)
  const yearStart = new Date(Date.UTC(date.getUTCFullYear(), 0, 1))
  const weekNo = Math.ceil((((date.getTime() - yearStart.getTime()) / 86400000) + 1) / 7)
  return { isoYear: date.getUTCFullYear(), isoWeek: weekNo }
}

export function getWeekKey(inputDate: Date): string {
  const { isoYear, isoWeek } = getIsoWeekParts(inputDate)
  return `${isoYear}W${String(isoWeek).padStart(2, '0')}`
}

async function fetchAllRows<T>(queryFactory: () => any, pageSize = PAGE_SIZE): Promise<T[]> {
  let from = 0
  const rows: T[] = []

  while (true) {
    const to = from + pageSize - 1
    const { data, error } = await queryFactory().range(from, to)
    if (error) throw error

    const batch: T[] = (data || []) as T[]
    rows.push(...batch)
    if (batch.length < pageSize) break

    from += pageSize
  }

  return rows
}

function median(values: number[]): number | null {
  if (!values.length) return null
  const sorted = [...values].sort((a, b) => a - b)
  const middle = Math.floor(sorted.length / 2)
  if (sorted.length % 2 === 0) return (sorted[middle - 1] + sorted[middle]) / 2
  return sorted[middle]
}

export async function getWeeklyKpis(options: {
  now?: string | Date
  periodStart?: string | Date
  periodEnd?: string | Date
} = {}): Promise<WeeklyKpis> {
  const now = options.now ? new Date(options.now) : new Date()
  const periodEnd = options.periodEnd ? new Date(options.periodEnd) : now
  const periodStart = options.periodStart ? new Date(options.periodStart) : addDays(periodEnd, -7)

  const periodStartIso = periodStart.toISOString()
  const periodEndIso = periodEnd.toISOString()
  const weekKey = getWeekKey(periodEnd)

  const supabase = getServerSupabaseClient()

  const listings7d = await fetchAllRows<ListingRow>(() =>
    supabase
      .from('listings')
      .select('id,title,brand,model,created_at')
      .gte('created_at', periodStartIso)
      .lte('created_at', periodEndIso)
      .order('created_at', { ascending: false })
  )

  const contactEvents7d = await fetchAllRows<EventRow>(() =>
    supabase
      .from('contact_events')
      .select('listing_id,created_at')
      .gte('created_at', periodStartIso)
      .lte('created_at', periodEndIso)
  )

  const listingViews7d = await fetchAllRows<EventRow>(() =>
    supabase
      .from('listing_views')
      .select('listing_id,created_at')
      .gte('created_at', periodStartIso)
      .lte('created_at', periodEndIso)
  )

  const listingLikes7d = await fetchAllRows<EventRow>(() =>
    supabase
      .from('listing_likes')
      .select('listing_id,created_at')
      .gte('created_at', periodStartIso)
      .lte('created_at', periodEndIso)
  )

  const priceAdjustments7d = await fetchAllRows<{ old_price: number; new_price: number }>(() =>
    supabase
      .from('price_adjustments')
      .select('old_price,new_price,changed_at')
      .gte('changed_at', periodStartIso)
      .lte('changed_at', periodEndIso)
  )
  const priceDropsOnly = priceAdjustments7d.filter((row) => Number(row.new_price) < Number(row.old_price))

  const listingIdsFromViews = Array.from(new Set(listingViews7d.map((v) => String(v.listing_id || '')).filter(Boolean)))
  const listingIdsFromLikes = Array.from(new Set(listingLikes7d.map((v) => String(v.listing_id || '')).filter(Boolean)))
  const listingIdsNeeded = Array.from(new Set([...listingIdsFromViews, ...listingIdsFromLikes, ...listings7d.map((l) => String(l.id))]))

  const listingMeta = new Map<string, ListingRow>()
  if (listingIdsNeeded.length) {
    const rows = await fetchAllRows<ListingRow>(() =>
      supabase
        .from('listings')
        .select('id,title,brand,model,created_at')
        .in('id', listingIdsNeeded)
    )
    for (const row of rows) listingMeta.set(String(row.id), row)
  }

  const viewCounts = new Map<string, number>()
  for (const row of listingViews7d) {
    const id = String(row.listing_id || '')
    if (!id) continue
    viewCounts.set(id, (viewCounts.get(id) || 0) + 1)
  }

  const topListingsByViews = Array.from(viewCounts.entries())
    .map(([listingId, views]) => ({
      listingId,
      views,
      title: listingMeta.get(listingId)?.title || `Listing ${listingId.slice(0, 8)}`,
    }))
    .sort((a, b) => b.views - a.views)
    .slice(0, 10)

  const likesByModel = new Map<string, number>()
  for (const row of listingLikes7d) {
    const listingId = String(row.listing_id || '')
    const meta = listingMeta.get(listingId)
    if (!meta) continue
    const key = `${String(meta.brand || '').trim()} ${String(meta.model || '').trim()}`.trim() || 'Unknown model'
    likesByModel.set(key, (likesByModel.get(key) || 0) + 1)
  }

  const topModelsByLikes = Array.from(likesByModel.entries())
    .map(([model, likes]) => ({ model, likes }))
    .sort((a, b) => b.likes - a.likes)
    .slice(0, 10)

  let medianHoursToFirstContact: number | null = null
  const listingIdsForMedian = listings7d.map((l) => String(l.id))

  if (listingIdsForMedian.length) {
    const contactsForListings = await fetchAllRows<EventRow>(() =>
      supabase
        .from('contact_events')
        .select('listing_id,created_at')
        .in('listing_id', listingIdsForMedian)
        .order('created_at', { ascending: true })
    )

    const firstContactByListing = new Map<string, string>()
    for (const row of contactsForListings) {
      const listingId = String(row.listing_id || '')
      if (!listingId || firstContactByListing.has(listingId) || !row.created_at) continue
      firstContactByListing.set(listingId, row.created_at)
    }

    const diffsInHours: number[] = []
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
