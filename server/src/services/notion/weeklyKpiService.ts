import { getServerSupabaseClient } from '../../lib/supabaseClient'

const PAGE_SIZE = 1000
const CONTACT_MEDIAN_WINDOW_DAYS = 14
const LISTINGS_NO_CONTACT_AGE_DAYS = 7

type ListingRow = {
  id: string
  title: string | null
  created_at: string | null
  status?: string | null
  archived_at?: string | null
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
  priceDrops7d: number
  medianHoursToFirstContact: number | null
  listingsNoContact7dplus: number
  bikeOfWeek: { listingId: string; title: string; views: number } | null
  topListingsByViews: Array<{ listingId: string; title: string; views: number }>
  top3ListingsByViews: Array<{ listingId: string; title: string; views: number }>
  raw: {
    listingViewsCount: number
    listingsCount: number
    contactEventsCount: number
    priceAdjustmentsDropCount: number
    noContactPoolSize: number
    medianWindowListingsCount: number
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

async function fetchContactsForListingIds(supabase: any, listingIds: string[]): Promise<EventRow[]> {
  if (!listingIds.length) return []

  const rows: EventRow[] = []
  const chunkSize = 500
  for (let i = 0; i < listingIds.length; i += chunkSize) {
    const chunk = listingIds.slice(i, i + chunkSize)
    const { data, error } = await supabase
      .from('contact_events')
      .select('listing_id,created_at')
      .in('listing_id', chunk)
      .order('created_at', { ascending: true })

    if (error) throw error
    rows.push(...((data || []) as EventRow[]))
  }

  return rows
}

function getTopListingsByViews(
  listingViewsRows: EventRow[],
  listingMetaMap: Map<string, ListingRow>,
  limit = 10
): Array<{ listingId: string; title: string; views: number }> {
  const viewsByListing = new Map<string, number>()

  for (const row of listingViewsRows) {
    const listingId = String(row?.listing_id || '')
    if (!listingId) continue
    viewsByListing.set(listingId, (viewsByListing.get(listingId) || 0) + 1)
  }

  return Array.from(viewsByListing.entries())
    .map(([listingId, views]) => ({
      listingId,
      views,
      title: listingMetaMap.get(listingId)?.title || `Listing ${listingId.slice(0, 8)}`,
    }))
    .sort((a, b) => b.views - a.views)
    .slice(0, limit)
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

  const [listings7d, listingViews7d, contactEvents7d, priceAdjustments7d] = await Promise.all([
    fetchAllRows<ListingRow>(() =>
      supabase
        .from('listings')
        .select('id,title,created_at,status,archived_at')
        .gte('created_at', periodStartIso)
        .lte('created_at', periodEndIso)
        .order('created_at', { ascending: false })
    ),
    fetchAllRows<EventRow>(() =>
      supabase
        .from('listing_views')
        .select('listing_id,created_at')
        .gte('created_at', periodStartIso)
        .lte('created_at', periodEndIso)
    ),
    fetchAllRows<EventRow>(() =>
      supabase
        .from('contact_events')
        .select('listing_id,created_at,type')
        .gte('created_at', periodStartIso)
        .lte('created_at', periodEndIso)
    ),
    fetchAllRows<{ old_price: number; new_price: number }>(() =>
      supabase
        .from('price_adjustments')
        .select('old_price,new_price,changed_at')
        .gte('changed_at', periodStartIso)
        .lte('changed_at', periodEndIso)
    ),
  ])

  const priceDropsOnly = priceAdjustments7d.filter((row) => Number(row.new_price) < Number(row.old_price))

  const listingIdsFromViews = Array.from(new Set(listingViews7d.map((v) => String(v.listing_id || '')).filter(Boolean)))
  const listingMetaMap = new Map<string, ListingRow>()

  if (listingIdsFromViews.length) {
    const listingMetaRows = await fetchAllRows<ListingRow>(() =>
      supabase
        .from('listings')
        .select('id,title,created_at')
        .in('id', listingIdsFromViews)
    )
    for (const row of listingMetaRows) listingMetaMap.set(String(row.id), row)
  }

  const topListingsByViews = getTopListingsByViews(listingViews7d, listingMetaMap, 10)
  const bikeOfWeek = topListingsByViews[0] || null
  const top3ListingsByViews = topListingsByViews.slice(0, 3)

  const medianWindowStart = addDays(periodEnd, -CONTACT_MEDIAN_WINDOW_DAYS).toISOString()
  const listingsMedianWindow = await fetchAllRows<ListingRow>(() =>
    supabase
      .from('listings')
      .select('id,created_at')
      .gte('created_at', medianWindowStart)
      .lte('created_at', periodEndIso)
  )

  const medianWindowListingIds = listingsMedianWindow.map((row) => String(row.id))
  const contactsForMedian = await fetchContactsForListingIds(supabase, medianWindowListingIds)

  const firstContactByListing = new Map<string, string>()
  for (const row of contactsForMedian) {
    const listingId = String(row?.listing_id || '')
    if (!listingId || firstContactByListing.has(listingId) || !row.created_at) continue
    firstContactByListing.set(listingId, row.created_at)
  }

  const diffsInHours: number[] = []
  for (const listing of listingsMedianWindow) {
    const firstContactAt = firstContactByListing.get(String(listing.id))
    if (!firstContactAt || !listing.created_at) continue
    const diffMs = new Date(firstContactAt).getTime() - new Date(listing.created_at).getTime()
    if (!Number.isFinite(diffMs) || diffMs < 0) continue
    diffsInHours.push(diffMs / 36e5)
  }
  const medianHoursToFirstContact = median(diffsInHours)

  const noContactCutoffIso = addDays(periodEnd, -LISTINGS_NO_CONTACT_AGE_DAYS).toISOString()
  const oldActiveListings = await fetchAllRows<{ id: string }>(() =>
    supabase
      .from('listings')
      .select('id')
      .lte('created_at', noContactCutoffIso)
      .is('archived_at', null)
      .in('status', ['active', 'published'])
  )

  const oldListingIds = oldActiveListings.map((row) => String(row.id))
  const contactsForOldListings = await fetchContactsForListingIds(supabase, oldListingIds)
  const listingsWithContact = new Set(contactsForOldListings.map((row) => String(row?.listing_id || '')).filter(Boolean))
  const listingsNoContact7dplus = oldListingIds.filter((id) => !listingsWithContact.has(id)).length

  return {
    weekKey,
    weekStart: toIsoDate(periodStart),
    weekEnd: toIsoDate(periodEnd),
    newListings7d: listings7d.length,
    contacts7d: contactEvents7d.length,
    priceDrops7d: priceDropsOnly.length,
    medianHoursToFirstContact,
    listingsNoContact7dplus,
    bikeOfWeek,
    topListingsByViews,
    top3ListingsByViews,
    raw: {
      listingViewsCount: listingViews7d.length,
      listingsCount: listings7d.length,
      contactEventsCount: contactEvents7d.length,
      priceAdjustmentsDropCount: priceDropsOnly.length,
      noContactPoolSize: oldListingIds.length,
      medianWindowListingsCount: medianWindowListingIds.length,
    },
  }
}
