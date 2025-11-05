export type TransformOpts = {
  width?: number
  height?: number
  quality?: number
  format?: 'webp' | 'jpeg' | 'png'
}

/**
 * Build an optimized URL for a Supabase public object using our API proxy.
 * If the URL is not a Supabase storage public URL, returns the original URL.
 */
const API_BASE = String(import.meta.env.VITE_API_BASE_URL || '').replace(/\/$/, '')

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
    if (quality) proxy.searchParams.set('q', String(quality))
    proxy.searchParams.set('f', (format || 'webp'))
    return proxy.toString()
  } catch {
    return url
  }
}
