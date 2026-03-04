/**
 * Pricing API Service
 * Cliente para el sistema de pricing de Ciclo Market
 */

import { supabase } from './supabase'

const API_BASE = import.meta.env.VITE_API_BASE_URL || ''

export interface PriceSuggestion {
  bike_model_id: string
  model: {
    brand: string
    model: string
    year: number
    category?: string
  }
  suggestion: {
    confidence: 'high' | 'medium' | 'low'
    price_ars: number | null
    price_usd: number | null
    currency: string
    range: {
      low: number
      mid: number
      high: number
    }
    sample_size: number
    calculated_at: string
  } | null
  sources: Record<string, { count: number; avg_price: number }>
  samples: Array<{
    source: string
    price: number
    condition: string
    province: string
    listed_at: string
  }>
  alternatives?: {
    message: string
    actions: string[]
  }
}

export interface PricingCoverage {
  totals: {
    listings: number
    active: number
    unique_models: number
  }
  by_source: Array<{
    name: string
    display_name: string
    is_reliable: boolean
    total: number
    active: number
    unique_models: number
    avg_price: number
  }>
  last_24h: {
    new_listings: number
    price_changes: number
  }
}

export interface BikeModelWithPrice {
  id: string
  brand: string
  model: string
  category?: string
  year_released?: number
  prices: Record<string, {
    median: number
    currency: string
    samples: number
    updated: string
  }>
}

/**
 * Obtiene sugerencia de precio para un modelo
 */
export async function getPriceSuggestion(params: {
  brand: string
  model: string
  year: number
  condition?: 'new' | 'like_new' | 'used' | 'good' | 'fair' | 'poor'
  currency?: string
}): Promise<PriceSuggestion> {
  const searchParams = new URLSearchParams({
    brand: params.brand,
    model: params.model,
    year: params.year.toString(),
    condition: params.condition || 'used',
    currency: params.currency || 'ARS'
  })

  const response = await fetch(`${API_BASE}/api/v1/pricing/suggest?${searchParams}`)
  
  if (!response.ok) {
    const error = await response.json()
    throw new Error(error.error || 'Failed to get price suggestion')
  }

  return response.json()
}

/**
 * Obtiene estadísticas de cobertura del pricing
 */
export async function getPricingCoverage(): Promise<PricingCoverage> {
  const response = await fetch(`${API_BASE}/api/v1/pricing/coverage`)
  
  if (!response.ok) {
    throw new Error('Failed to get pricing coverage')
  }

  return response.json()
}

/**
 * Lista modelos disponibles con precios
 */
export async function getModels(params?: {
  brand?: string
  category?: string
  search?: string
  limit?: number
  offset?: number
}): Promise<{ models: BikeModelWithPrice[]; pagination: { limit: number; offset: number } }> {
  const searchParams = new URLSearchParams()
  
  if (params?.brand) searchParams.set('brand', params.brand)
  if (params?.category) searchParams.set('category', params.category)
  if (params?.search) searchParams.set('search', params.search)
  if (params?.limit) searchParams.set('limit', params.limit.toString())
  if (params?.offset) searchParams.set('offset', params.offset.toString())

  const response = await fetch(`${API_BASE}/api/v1/pricing/models?${searchParams}`)
  
  if (!response.ok) {
    throw new Error('Failed to get models')
  }

  return response.json()
}

/**
 * Obtiene precios de mercado directamente desde Supabase
 * Útil para mostrar en tiempo real
 */
export async function getMarketPrices(params: {
  bikeModelId?: string
  condition?: string
  year?: number
  currency?: string
}) {
  let query = supabase
    .from('market_prices')
    .select('*')
    .order('calculated_at', { ascending: false })

  if (params.bikeModelId) {
    query = query.eq('bike_model_id', params.bikeModelId)
  }
  if (params.condition) {
    query = query.eq('condition', params.condition)
  }
  if (params.year) {
    query = query.eq('year', params.year)
  }
  if (params.currency) {
    query = query.eq('currency', params.currency)
  }

  const { data, error } = await query.limit(100)

  if (error) throw error
  return data
}

/**
 * Obtiene listings individuales para mostrar muestras
 */
export async function getPriceListings(params: {
  bikeModelId?: string
  source?: string
  condition?: string
  status?: string
  limit?: number
}) {
  let query = supabase
    .from('price_listings')
    .select('*')
    .order('scraped_at', { ascending: false })

  if (params.bikeModelId) {
    query = query.eq('bike_model_id', params.bikeModelId)
  }
  if (params.source) {
    query = query.eq('source', params.source)
  }
  if (params.condition) {
    query = query.eq('condition', params.condition)
  }
  if (params.status) {
    query = query.eq('status', params.status)
  }

  const { data, error } = await query.limit(params.limit || 50)

  if (error) throw error
  return data
}

/**
 * Busca modelos por texto (para autocomplete)
 */
export async function searchBikeModels(query: string, limit = 10) {
  const { data, error } = await supabase
    .from('bike_models')
    .select('id, brand, model, category, year_released')
    .or(`brand.ilike.%${query}%,model.ilike.%${query}%`)
    .order('brand')
    .limit(limit)

  if (error) throw error
  return data
}

/**
 * Hook helper para React: usePriceSuggestion
 * Ejemplo de uso:
 * 
 * const { suggestion, loading, error } = usePriceSuggestion({
 *   brand: 'Specialized',
 *   model: 'Tarmac',
 *   year: 2024,
 *   condition: 'new'
 * })
 */
export function formatPriceRange(suggestion: PriceSuggestion['suggestion']): string {
  if (!suggestion) return 'Precio no disponible'
  
  const { range, currency } = suggestion
  const formatter = new Intl.NumberFormat('es-AR', {
    style: 'currency',
    currency: currency,
    maximumFractionDigits: 0
  })
  
  return `${formatter.format(range.low)} - ${formatter.format(range.high)}`
}

export function getConfidenceLabel(confidence: string): { text: string; color: string } {
  switch (confidence) {
    case 'high':
      return { text: 'Alta confianza', color: 'text-green-600' }
    case 'medium':
      return { text: 'Confianza media', color: 'text-yellow-600' }
    case 'low':
      return { text: 'Baja confianza', color: 'text-red-600' }
    default:
      return { text: 'Desconocida', color: 'text-gray-600' }
  }
}

export function getConfidenceDescription(confidence: string, sampleSize: number): string {
  switch (confidence) {
    case 'high':
      return `Basado en ${sampleSize} publicaciones similares`
    case 'medium':
      return `Basado en ${sampleSize} publicaciones de modelos similares`
    case 'low':
      return 'Datos insuficientes. Revisa publicaciones activas.'
    default:
      return ''
  }
}
