import { supabaseEnabled } from './supabase'

const API_BASE = (import.meta.env.VITE_API_BASE_URL || '').trim()

export type ReviewRecord = {
  id: string
  seller_id: string
  buyer_id: string
  listing_id?: string | null
  rating: number // 1-5
  tags?: string[] | null // ['atencion','respetuoso','buen_vendedor','compro']
  comment?: string | null
  created_at: string
  buyer_name?: string
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
    const data = await res.json()
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
    if (!res.ok) return { allowed: false }
    return await res.json()
  } catch (err) {
    console.warn('[reviews] canUserReviewSeller failed', err)
    return { allowed: false }
  }
}

export async function submitReview(payload: { sellerId: string; buyerId: string; listingId?: string | null; rating: number; tags?: string[]; comment?: string }) {
  const endpoint = API_BASE ? `${API_BASE}/api/reviews/submit` : '/api/reviews/submit'
  const res = await fetch(endpoint, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(payload),
  })
  if (!res.ok) {
    const text = await res.text()
    throw new Error(text || 'No pudimos enviar la reseña')
  }
  return await res.json()
}
