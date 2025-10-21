type TrackType = 'site_view' | 'listing_view' | 'store_view' | 'wa_click'

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

export async function track(type: TrackType, payload: Record<string, any> = {}): Promise<void> {
  try {
    if (typeof window === 'undefined') return
    const ref = document.referrer || ''
    const path = window.location.pathname + window.location.search
    const body = {
      type,
      anon_id: getAnonId(),
      referrer: ref.slice(0, 512),
      path: path.slice(0, 512),
      ...payload,
    }
    await fetch('/api/track', {
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

