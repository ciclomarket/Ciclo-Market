export type TransformOpts = {
  width?: number
  height?: number
  quality?: number
  format?: 'avif' | 'webp' | 'jpeg' | 'png'
}

/**
 * Build an optimized URL for a Supabase public object.
 * - Si VITE_SUPABASE_IMG_TRANSFORM === 'true', usa el endpoint nativo de Supabase
 *   /storage/v1/render/image/public/... con width/quality/format.
 * - En caso contrario, devuelve la URL original sin pasar por el proxy /api/img.
 * Si la URL no es de Supabase storage público, devuelve la original.
 */
const API_BASE = String(import.meta.env.VITE_API_BASE_URL || '').replace(/\/$/, '')
const USE_SUPABASE_TRANSFORM = String(import.meta.env.VITE_SUPABASE_IMG_TRANSFORM || '').toLowerCase() === 'true'

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
    const { width, quality, format } = opts
    if (USE_SUPABASE_TRANSFORM) {
      // Construye: /storage/v1/render/image/public/<bucket>/<path>?width=&quality=&format=
      const parts = u.pathname.split('/storage/v1/object/public/')[1]
      const render = new URL(`/storage/v1/render/image/public/${parts}`, `${u.protocol}//${u.host}`)
      if (width) render.searchParams.set('width', String(width))
      const autoQ = typeof quality === 'number'
        ? quality
        : (width
            ? (width <= 480 ? 50 : width <= 640 ? 55 : 60)
            : 60)
      if (autoQ) render.searchParams.set('quality', String(autoQ))
      const preferred = (format || (supportsAvif() ? 'avif' : 'webp')).toLowerCase()
      render.searchParams.set('format', preferred)
      return render.toString()
    }
    // Sin transformaciones: devolver URL original (sin proxy /api/img)
    return url
  } catch {
    return url
  }
}
