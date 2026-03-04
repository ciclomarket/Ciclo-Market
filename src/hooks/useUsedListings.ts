import { useEffect, useState, useCallback, useMemo } from 'react'
import { fetchListings } from '../services/listings'
import { getSupabaseClient, supabaseEnabled } from '../services/supabase'
import type { Listing } from '../types'

interface UseUsedListingsResult {
  listings: Listing[]
  count: number | null
  loading: boolean
  error: Error | null
  hasMore: boolean
  loadMore: () => void
}

const PAGE_SIZE = 12

/**
 * Hook para obtener listings de bicicletas usadas (condición = Usada).
 * Filtra de todas las categorías de bicicletas (excluye accesorios/indumentaria).
 */
export function useUsedListings(
  options?: { limit?: number; enabled?: boolean }
): UseUsedListingsResult {
  const [allListings, setAllListings] = useState<Listing[]>([])
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

      // Contar todas las bicicletas (no accesorios/indumentaria/nutrición)
      const bikeCategories = ['Ruta', 'MTB', 'Gravel', 'Urbana', 'Fixie', 'E-Bike', 'Niños', 'Pista', 'Triatlón']
      
      const { count: exactCount, error: countError } = await supabase
        .from('listings')
        .select('*', { count: 'exact', head: true })
        .in('category', bikeCategories)
        .neq('status', 'deleted')
        .neq('status', 'draft')
        .neq('status', 'archived')
        .neq('status', 'expired')
        .or(`expires_at.is.null,expires_at.gte.${now}`)

      if (!countError && typeof exactCount === 'number') {
        setCount(exactCount)
      }
    } catch {
      // Silenciar error
    }
  }, [enabled])

  // Fetch de listings
  const fetchData = useCallback(async () => {
    if (!supabaseEnabled || !enabled) {
      setLoading(false)
      return
    }

    setLoading(true)
    setError(null)

    try {
      // Obtener conteo
      await fetchCount()

      // Obtener todas las listings
      const data = await fetchListings()

      // Filtrar solo bicicletas (no accesorios/indumentaria/nutrición)
      const bikeCategories = ['Ruta', 'MTB', 'Gravel', 'Urbana', 'Fixie', 'E-Bike', 'Niños', 'Pista', 'Triatlón']
      const bikesOnly = data.filter(l => bikeCategories.includes(l.category))

      setAllListings(bikesOnly)
    } catch (err) {
      setError(err instanceof Error ? err : new Error('Error cargando listings'))
    } finally {
      setLoading(false)
    }
  }, [enabled, fetchCount])

  useEffect(() => {
    fetchData()
  }, [fetchData])

  const paginatedListings = useMemo(() => {
    return allListings.slice(0, displayLimit)
  }, [allListings, displayLimit])

  const hasMore = allListings.length > displayLimit

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
