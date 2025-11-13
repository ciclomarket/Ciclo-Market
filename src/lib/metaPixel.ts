// Lightweight Meta Pixel helper. Safe to call in any environment.
declare global {
  interface Window { fbq?: (...args: any[]) => void }
}

let initialized = false
let pendingInit = false

export function initMetaPixel(pixelId?: string | null): boolean {
  if (typeof window === 'undefined') return false
  const id = (pixelId || import.meta.env.VITE_META_PIXEL_ID || '').toString().trim()
  if (!id || initialized) return initialized

  // Avoid injecting duplicate versions if another tag manager loads Pixel
  const hasExistingScript = Array.from(document.getElementsByTagName('script')).some((s) => /connect\.facebook\.net\/.*fbevents\.js/i.test(s.src))
  if (!window.fbq && !hasExistingScript) {
    const n = function fbq(this: any, ...args: any[]) {
      (window.fbq as any).callMethod ? (window.fbq as any).callMethod.apply(null, args) : (window.fbq as any).queue.push(args)
    } as any
    ;(window.fbq as any) = n
    ;(window.fbq as any).push = (window.fbq as any)
    ;(window.fbq as any).loaded = false
    ;(window.fbq as any).version = '2.0'
    ;(window.fbq as any).queue = []
    const s = document.createElement('script')
    s.async = true
    s.src = 'https://connect.facebook.net/en_US/fbevents.js'
    const x = document.getElementsByTagName('script')[0]
    x?.parentNode?.insertBefore(s, x)
  }

  const tryInit = () => {
    try {
      if (typeof window.fbq === 'function') {
        window.fbq('init', id)
        initialized = true
        pendingInit = false
        return true
      }
    } catch {
      // ignore
    }
    return false
  }

  if (!tryInit()) {
    // If another loader will attach fbq soon, retry briefly to avoid injecting a second copy
    pendingInit = true
    setTimeout(() => { if (!initialized && pendingInit) tryInit() }, 600)
  }
  return initialized
}

export function trackMetaPixel(event: string, params?: Record<string, any>) {
  if (typeof window === 'undefined') return
  try { window.fbq?.('track', event, params || {}) } catch { /* noop */ }
}

export function trackMetaPixelCustom(event: string, params?: Record<string, any>) {
  if (typeof window === 'undefined') return
  try { window.fbq?.('trackCustom', event, params || {}) } catch { /* noop */ }
}

export function setMetaPixelConsent(granted: boolean) {
  if (typeof window === 'undefined') return
  try { window.fbq?.('consent', granted ? 'grant' : 'revoke') } catch { /* noop */ }
}

export function isMetaPixelInitialized(): boolean { return initialized }
