import { useEffect, useState, useCallback, useMemo } from 'react'
import { fetchListingsByBrand } from '../services/listings'
import { getSupabaseClient, supabaseEnabled } from '../services/supabase'
import type { Listing } from '../types'

const PAGE_SIZE = 12

interface UseBrandListingsResult {
  listings: Listing[]
  count: number | null
  loading: boolean
  hasMore: boolean
  loadMore: () => void
}

export function useBrandListings(
  brandName: string,
  options?: { initialLimit?: number }
): UseBrandListingsResult {
  const [allListings, setAllListings] = useState<Listing[]>([])
  const [count, setCount] = useState<number | null>(null)
  const [loading, setLoading] = useState(true)
  const [displayLimit, setDisplayLimit] = useState(options?.initialLimit ?? PAGE_SIZE)

  const fetchCount = useCallback(async () => {
    if (!supabaseEnabled) return
    try {
      const supabase = getSupabaseClient()
      const now = new Date().toISOString()
      const { count: exactCount, error } = await supabase
        .from('listings')
        .select('*', { count: 'exact', head: true })
        .ilike('brand', brandName)
        .neq('status', 'deleted')
        .neq('status', 'draft')
        .neq('status', 'archived')
        .neq('status', 'expired')
        .or(`expires_at.is.null,expires_at.gte.${now}`)
      if (!error && typeof exactCount === 'number') setCount(exactCount)
    } catch {
      // non-critical
    }
  }, [brandName])

  const fetchData = useCallback(async () => {
    setLoading(true)
    try {
      await fetchCount()
      const data = await fetchListingsByBrand(brandName, { limit: 100 })
      setAllListings(data)
    } finally {
      setLoading(false)
    }
  }, [brandName, fetchCount])

  useEffect(() => { fetchData() }, [fetchData])

  const listings = useMemo(() => allListings.slice(0, displayLimit), [allListings, displayLimit])
  const hasMore = allListings.length > displayLimit
  const loadMore = useCallback(() => setDisplayLimit(prev => prev + PAGE_SIZE), [])

  return { listings, count, loading, hasMore, loadMore }
}
