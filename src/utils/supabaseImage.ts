export type TransformOpts = {
  width?: number
  height?: number
  quality?: number
  format?: 'avif' | 'webp' | 'jpeg' | 'png'
}

/**
 * Build an optimized URL for a Supabase public object using our API proxy.
 * If the URL is not a Supabase storage public URL, returns the original URL.
 */
const API_BASE = String(import.meta.env.VITE_API_BASE_URL || '').replace(/\/$/, '')

// Lightweight runtime detection for AVIF support (cached per session)
let AVIF_SUPPORTED: boolean | null = null
function supportsAvif(): boolean {
  if (AVIF_SUPPORTED !== null) return AVIF_SUPPORTED
  try {
    if (typeof document === 'undefined') return (AVIF_SUPPORTED = false)
    const canvas = document.createElement('canvas')
    if (!canvas.getContext) return (AVIF_SUPPORTED = false)
    const data = canvas.toDataURL('image/avif')
    AVIF_SUPPORTED = data.indexOf('image/avif') !== -1
    return AVIF_SUPPORTED
  } catch {
    AVIF_SUPPORTED = false
    return AVIF_SUPPORTED
  }
}

export function transformSupabasePublicUrl(url: string, opts: TransformOpts = {}): string {
  try {
    if (!url || typeof url !== 'string') return url
    const u = new URL(url)
    // Expected pattern: /storage/v1/object/public/<bucket>/<path>
    if (!u.pathname.includes('/storage/v1/object/public/')) return url
    // Use API proxy to resize/compress since Supabase transforms are disabled
    const { width, quality, format } = opts
    // Build base URL: prefer absolute API_BASE else relative /api (works on same origin setups)
    const base = API_BASE || ''
    const proxy = new URL((base ? base : '') + '/api/img', base || window.location.origin)
    proxy.searchParams.set('url', u.toString())
    if (width) proxy.searchParams.set('w', String(width))
    const autoQ = typeof quality === 'number'
      ? quality
      : (width
          ? (width <= 480 ? 50 : width <= 640 ? 55 : 60)
          : 60)
    if (autoQ) proxy.searchParams.set('q', String(autoQ))
    const preferred = format || (supportsAvif() ? 'avif' : 'webp')
    proxy.searchParams.set('f', preferred)
    return proxy.toString()
  } catch {
    return url
  }
}
