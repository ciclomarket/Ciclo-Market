import { useEffect, useState, useCallback, useMemo } from 'react'
import { fetchListingsByCategory } from '../services/listings'
import { getSupabaseClient, supabaseEnabled } from '../services/supabase'
import type { Listing } from '../types'

interface UseCategoryListingsResult {
  listings: Listing[]
  count: number | null
  loading: boolean
  error: Error | null
  hasMore: boolean
  loadMore: () => void
}

const PAGE_SIZE = 12

/**
 * Hook para obtener listings por categoría con conteo real desde Supabase.
 * Muestra datos reales (no inventados) del marketplace.
 */
export function useCategoryListings(
  category: string,
  options?: { limit?: number; enabled?: boolean }
): UseCategoryListingsResult {
  const [listings, setListings] = useState<Listing[]>([])
  const [count, setCount] = useState<number | null>(null)
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<Error | null>(null)
  const [displayLimit, setDisplayLimit] = useState(options?.limit ?? PAGE_SIZE)

  const enabled = options?.enabled !== false

  // Fetch del conteo exacto desde Supabase
  const fetchCount = useCallback(async () => {
    if (!supabaseEnabled || !enabled) return
    try {
      const supabase = getSupabaseClient()
      const now = new Date().toISOString()
      
      const { count: exactCount, error: countError } = await supabase
        .from('listings')
        .select('*', { count: 'exact', head: true })
        .eq('category', category)
        .neq('status', 'deleted')
        .neq('status', 'draft')
        .neq('status', 'archived')
        .neq('status', 'expired')
        .or(`expires_at.is.null,expires_at.gte.${now}`)

      if (!countError && typeof exactCount === 'number') {
        setCount(exactCount)
      }
    } catch {
      // Silenciar error de conteo, no es crítico
    }
  }, [category, enabled])

  // Fetch de listings
  const fetchData = useCallback(async () => {
    if (!supabaseEnabled || !enabled) {
      setLoading(false)
      return
    }

    setLoading(true)
    setError(null)

    try {
      // Primero obtener conteo
      await fetchCount()

      // Luego obtener listings
      const data = await fetchListingsByCategory(category as Listing['category'], null, {
        limit: 100, // Traemos más para paginación client-side
      })

      setListings(data)
    } catch (err) {
      setError(err instanceof Error ? err : new Error('Error cargando listings'))
    } finally {
      setLoading(false)
    }
  }, [category, enabled, fetchCount])

  useEffect(() => {
    fetchData()
  }, [fetchData])

  const paginatedListings = useMemo(() => {
    return listings.slice(0, displayLimit)
  }, [listings, displayLimit])

  const hasMore = listings.length > displayLimit

  const loadMore = useCallback(() => {
    setDisplayLimit(prev => prev + PAGE_SIZE)
  }, [])

  return {
    listings: paginatedListings,
    count,
    loading,
    error,
    hasMore,
    loadMore,
  }
}

/**
 * Hook para obtener el conteo exacto de listings por categoría.
 * Útil para mostrar "+X bicis disponibles" en landings.
 */
export function useCategoryCount(category: string): number | null {
  const [count, setCount] = useState<number | null>(null)

  useEffect(() => {
    if (!supabaseEnabled) return

    const fetchCount = async () => {
      try {
        const supabase = getSupabaseClient()
        const now = new Date().toISOString()

        const { count: exactCount, error } = await supabase
          .from('listings')
          .select('*', { count: 'exact', head: true })
          .eq('category', category)
          .neq('status', 'deleted')
          .neq('status', 'draft')
          .neq('status', 'archived')
          .neq('status', 'expired')
          .or(`expires_at.is.null,expires_at.gte.${now}`)

        if (!error && typeof exactCount === 'number') {
          setCount(exactCount)
        }
      } catch {
        // Silenciar error
      }
    }

    fetchCount()
  }, [category])

  return count
}
