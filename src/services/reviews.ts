import { getSupabaseClient } from './supabase'

function resolveApiBaseUrl() {
  const explicit = String(import.meta.env.VITE_API_BASE_URL || '').trim().replace(/\/$/, '')
  if (explicit) return explicit

  const fallback = String(import.meta.env.VITE_API_FALLBACK_URL || '').trim().replace(/\/$/, '')
  if (fallback) return fallback

  // Production safety net: when the web runs on Firebase Hosting, `/api/*` can be
  // rewritten to `index.html` (200 OK, HTML), breaking JSON fetches for reviews.
  // If no explicit API base is configured and we are on the main domain, default
  // to the Render API origin.
  if (typeof window !== 'undefined') {
    const host = window.location?.hostname || ''
    if (host === 'ciclomarket.ar' || host === 'www.ciclomarket.ar') return 'https://ciclo-market.onrender.com'
  }

  // Default: same-origin `/api/*` (dev proxy, monolith setups, etc.)
  return ''
}

const API_BASE = resolveApiBaseUrl()

async function parseJsonOrThrow(res: Response) {
  const contentType = (res.headers.get('content-type') || '').toLowerCase()
  if (!contentType.includes('application/json')) {
    const text = await res.text().catch(() => '')
    const err = new Error('non_json_response')
    ;(err as any).details = text.slice(0, 200)
    throw err
  }
  return await res.json()
}

export type ReviewRecord = {
  id: string
  seller_id: string
  buyer_id: string
  listing_id?: string | null
  rating: number // 1-5
  is_verified_sale?: boolean | null
  tags?: string[] | null // ['atencion','respetuoso','buen_vendedor','compro']
  comment?: string | null
  created_at: string
  buyer_name?: string
  buyer_avatar_url?: string | null
}

export type ReviewsSummary = {
  sellerId: string
  count: number
  avgRating: number
  dist?: Record<number, number>
  tagsCount?: Record<string, number>
}

export async function logContactEvent(payload: { sellerId: string; listingId?: string | null; buyerId?: string | null; type: 'whatsapp' | 'email' }) {
  try {
    const endpoint = API_BASE ? `${API_BASE}/api/contacts/log` : '/api/contacts/log'
    const body = JSON.stringify(payload)
    // Intento 1: sendBeacon (fiable cuando la página navega o abre nueva pestaña)
    try {
      if (typeof navigator !== 'undefined' && typeof navigator.sendBeacon === 'function') {
        const ok = navigator.sendBeacon(endpoint, new Blob([body], { type: 'application/json' }))
        if (ok) return
      }
    } catch { /* ignore and fallback */ }
    // Intento 2: fetch con keepalive
    await fetch(endpoint, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body,
      // keepalive ayuda si el navegador cambia de página o pestaña
      // soportado en la mayoría de navegadores modernos
      keepalive: true as any,
    })
  } catch (err) {
    console.warn('[reviews] logContactEvent failed', err)
  }
}

export async function fetchSellerReviews(sellerId: string): Promise<{ reviews: ReviewRecord[]; summary: ReviewsSummary } | null> {
  try {
    const endpoint = API_BASE ? `${API_BASE}/api/reviews/${encodeURIComponent(sellerId)}` : `/api/reviews/${encodeURIComponent(sellerId)}`
    const res = await fetch(endpoint)
    if (!res.ok) return null
    const data = await parseJsonOrThrow(res)
    return data
  } catch (err) {
    console.warn('[reviews] fetchSellerReviews failed', err)
    return null
  }
}

export async function canUserReviewSeller(buyerId: string, sellerId: string): Promise<{ allowed: boolean; reason?: string }> {
  try {
    const endpoint = API_BASE ? `${API_BASE}/api/reviews/can-review?sellerId=${encodeURIComponent(sellerId)}&buyerId=${encodeURIComponent(buyerId)}` : `/api/reviews/can-review?sellerId=${encodeURIComponent(sellerId)}&buyerId=${encodeURIComponent(buyerId)}`
    const res = await fetch(endpoint)
    if (!res.ok) return { allowed: false, reason: 'api_unavailable' }
    return await parseJsonOrThrow(res)
  } catch (err) {
    console.warn('[reviews] canUserReviewSeller failed', err)
    return { allowed: false, reason: 'api_unavailable' }
  }
}

export async function submitReview(payload: { sellerId: string; buyerId: string; listingId?: string | null; rating: number; isVerifiedSale?: boolean; tags?: string[]; comment?: string }) {
  const endpoint = API_BASE ? `${API_BASE}/api/reviews/submit` : '/api/reviews/submit'
  let token: string | null = null
  try {
    const supabase = getSupabaseClient()
    const { data } = await supabase.auth.getSession()
    token = data.session?.access_token || null
  } catch { /* noop */ }
  if (!token) throw new Error('not_authenticated')
  const res = await fetch(endpoint, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${token}` },
    body: JSON.stringify(payload),
  })
  if (!res.ok) {
    const text = await res.text()
    throw new Error(text || 'No pudimos enviar la reseña')
  }
  return await parseJsonOrThrow(res)
}
