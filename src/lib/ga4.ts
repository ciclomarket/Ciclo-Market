// Lightweight GA4 event helper — mirrors lib/metaPixel.ts. The gtag loader
// and consent wiring already live in index.html / CookieConsent.tsx; this
// just sends events through whatever gtag is (or isn't) there yet.
export function trackGA4Event(name: string, params?: Record<string, any>) {
  if (typeof window === 'undefined') return
  try {
    const gtag = (window as any).gtag as ((...args: any[]) => void) | undefined
    gtag?.('event', name, params || {})
  } catch {
    // noop
  }
}
