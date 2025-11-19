const API_BASE = (import.meta.env.VITE_API_BASE_URL || '').replace(/\/$/, '')
import { getSupabaseClient, supabaseEnabled } from './supabase'

function guessApiBase(): string | '' {
  if (typeof window === 'undefined') return ''
  return window.location?.origin?.replace(/\/$/, '') || ''
}

export type MarketSearchParams = {
  cat?: string
  q?: string
  deal?: boolean
  store?: boolean
  sort?: 'relevance' | 'newest' | 'asc' | 'desc'
  priceCur?: 'USD' | 'ARS'
  priceMin?: number
  priceMax?: number
  fx?: number
  subcat?: string
  brand?: string[]
  material?: string[]
  frameSize?: string[]
  wheelSize?: string[]
  drivetrain?: string[]
  condition?: string[]
  brake?: string[]
  year?: string[]
  size?: string[]
  location?: string[]
  transmissionType?: string[]
  limit?: number
  offset?: number
}

export async function fetchMarket(params: MarketSearchParams): Promise<{ items: any[]; total?: number }> {
  const base = API_BASE || guessApiBase()
  const endpoint = base ? `${base}/api/market/search` : '/api/market/search'
  const url = new URL(endpoint, window.location.origin)
  const set = (k: string, v: any) => { if (v !== undefined && v !== null && v !== '') url.searchParams.set(k, String(v)) }
  set('limit', params.limit ?? 300)
  set('offset', params.offset ?? 0)
  if (params.cat) set('cat', params.cat)
  if (params.q) set('q', params.q)
  if (params.deal) set('deal', '1')
  if (params.store) set('store', '1')
  if (params.sort) set('sort', params.sort)
  if (params.priceCur) set('price_cur', params.priceCur)
  if (typeof params.priceMin === 'number') set('price_min', params.priceMin)
  if (typeof params.priceMax === 'number') set('price_max', params.priceMax)
  if (typeof params.fx === 'number' && params.fx > 0) set('fx', params.fx)
  if (params.subcat) set('subcat', params.subcat)
  const appendAll = (key: string, arr?: string[]) => {
    if (Array.isArray(arr)) arr.filter(Boolean).forEach((v) => url.searchParams.append(key, v))
  }
  appendAll('brand', params.brand)
  appendAll('material', params.material)
  appendAll('frameSize', params.frameSize)
  appendAll('wheelSize', params.wheelSize)
  appendAll('drivetrain', params.drivetrain)
  appendAll('condition', params.condition)
  appendAll('brake', params.brake)
  appendAll('year', params.year)
  appendAll('size', params.size)
  appendAll('location', params.location)
  appendAll('transmissionType', params.transmissionType)

  let headers: Record<string, string> | undefined
  if (supabaseEnabled) {
    try {
      const client = getSupabaseClient()
      const { data } = await client.auth.getSession()
      const token = data.session?.access_token || null
      if (token) headers = { Authorization: `Bearer ${token}` }
    } catch { /* noop */ }
  }
  const res = await fetch(url.toString(), { headers })
  if (!res.ok) throw new Error(`market_search_http_${res.status}`)
  const ct = (res.headers.get('content-type') || '').toLowerCase()
  if (!ct.includes('application/json')) throw new Error('market_search_not_json')
  const data = await res.json()
  const items = Array.isArray(data?.items) ? data.items : (() => { throw new Error('market_search_invalid_payload') })()
  const total = typeof data?.total === 'number' ? data.total : undefined
  return { items, total }
}
