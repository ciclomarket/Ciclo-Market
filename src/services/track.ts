type TrackType = 'site_view' | 'listing_view' | 'store_view' | 'wa_click'

export type TrackPayload = {
  listing_id?: string | null
  store_user_id?: string | null
  user_id?: string | null
  source?: string | null
  meta?: Record<string, any>
  [key: string]: any
}

function getAnonId(): string {
  if (typeof window === 'undefined') return ''
  const KEY = 'mb_anon_id'
  let id = window.localStorage.getItem(KEY)
  if (!id) {
    id = (crypto?.randomUUID?.() || Math.random().toString(36).slice(2)) + String(Date.now()).slice(-6)
    window.localStorage.setItem(KEY, id)
  }
  return id
}

const appScope = (import.meta.env.VITE_APP_SCOPE || 'web').toLowerCase()

export async function track(type: TrackType, payload: TrackPayload = {}): Promise<void> {
  try {
    if (typeof window === 'undefined') return
    const ref = document.referrer || ''
    const path = window.location.pathname + window.location.search
    const BASE = (import.meta.env.VITE_API_BASE_URL || '').replace(/\/$/, '')
    const body: Record<string, any> = {
      type,
      anon_id: getAnonId(),
      referrer: ref.slice(0, 512),
      path: path.slice(0, 512),
      source: (payload.source || appScope || 'web').slice(0, 32),
    }

    if ('user_id' in payload) body.user_id = payload.user_id || null
    if ('listing_id' in payload) body.listing_id = payload.listing_id || null
    if ('store_user_id' in payload) body.store_user_id = payload.store_user_id || null
    if ('meta' in payload && payload.meta && typeof payload.meta === 'object') {
      body.meta = payload.meta
    }
    for (const [key, value] of Object.entries(payload)) {
      if (value === undefined) continue
      if (key === 'user_id' || key === 'listing_id' || key === 'store_user_id' || key === 'source' || key === 'meta') continue
      body[key] = value
    }
    await fetch(BASE ? `${BASE}/api/track` : '/api/track', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(body),
      keepalive: true,
    })
  } catch {
    // no-op
  }
}

export function trackOncePerSession(key: string, fn: () => void) {
  if (typeof window === 'undefined') return
  const storageKey = `mb_once_${key}`
  if (sessionStorage.getItem(storageKey) === '1') return
  sessionStorage.setItem(storageKey, '1')
  fn()
}
