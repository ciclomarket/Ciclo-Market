declare global {
  interface Window {
    dataLayer: any[]
    gtag?: (...args: any[]) => void
  }
}

let initialized = false
let measurementId: string | null = null

function resolveMeasurementId(): string | null {
  const id =
    import.meta.env.VITE_GA_MEASUREMENT_ID ||
    import.meta.env.VITE_GA_ID ||
    null
  return id && id.trim() ? id.trim() : null
}

export function initAnalytics() {
  if (typeof window === 'undefined' || typeof document === 'undefined') return
  if (initialized) return
  const id = resolveMeasurementId()
  if (!id) return

  measurementId = id

  if (!document.getElementById('ga-gtag')) {
    const script = document.createElement('script')
    script.id = 'ga-gtag'
    script.async = true
    script.src = `https://www.googletagmanager.com/gtag/js?id=${id}`
    document.head.appendChild(script)
  }

  window.dataLayer = window.dataLayer || []
  function gtag(...args: any[]) {
    window.dataLayer.push(args)
  }
  window.gtag = gtag

  gtag('js', new Date())
  // Avoid double page_view; we handle SPA navigation manually
  gtag('config', id, { send_page_view: false })

  initialized = true
}

export function trackPageView(path: string) {
  if (!initialized || !measurementId) return
  if (typeof window === 'undefined') return
  const gtag = window.gtag
  if (typeof gtag !== 'function') return
  const pagePath = path || window.location.pathname + window.location.search + window.location.hash
  gtag('event', 'page_view', {
    page_path: pagePath,
    page_location: `${window.location.origin}${pagePath}`
  })
}
