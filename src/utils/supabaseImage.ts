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

function toRenderUrl(u: URL, opts: TransformOpts): string {
  // Build /storage/v1/render/image/public/<bucket>/<encoded path>
  const before = '/storage/v1/object/public/'
  const idx = u.pathname.indexOf(before)
  const rest = u.pathname.slice(idx + before.length) // bucket + path
  // Encode each segment to avoid spaces or unicode issues
  const encodedPath = rest
    .split('/')
    .map((seg) => encodeURIComponent(decodeURIComponent(seg)))
    .join('/')
  const render = new URL(`/storage/v1/render/image/public/${encodedPath}`, `${u.protocol}//${u.host}`)
  if (opts.width) render.searchParams.set('width', String(opts.width))
  if (typeof opts.quality === 'number') render.searchParams.set('quality', String(opts.quality))
  const preferred = (opts.format || (supportsAvif() ? 'avif' : 'webp')).toLowerCase()
  render.searchParams.set('format', preferred)
  return render.toString()
}

export function transformSupabasePublicUrl(url: string, opts: TransformOpts = {}): string {
  try {
    if (!url || typeof url !== 'string') return url
    const u = new URL(url)
    // Sólo aplicar a objetos públicos
    if (!u.pathname.includes('/storage/v1/object/public/')) return url
    // Si el proxy está habilitado, enrutar por /api/img del backend (garantiza compresión)
    const USE_PROXY = String(import.meta.env.VITE_USE_IMAGE_PROXY || '').toLowerCase() === 'true'
    if (USE_PROXY) {
      const base = '/api/img'
      const params = new URLSearchParams()
      params.set('src', u.toString())
      if (opts.width) params.set('w', String(opts.width))
      if (typeof opts.quality === 'number') params.set('q', String(opts.quality))
      if (opts.format) params.set('fmt', String(opts.format))
      return `${base}?${params.toString()}`
    }
    // Preferir endpoint /render cuando las transformaciones estén activas
    if (USE_SUPABASE_TRANSFORM) {
      return toRenderUrl(u, opts)
    }
    // Fallback: aplicar parámetros sobre /object (en algunos proyectos funciona)
    const { width, quality, format } = opts
    if (width) u.searchParams.set('width', String(width))
    if (typeof quality === 'number') u.searchParams.set('quality', String(quality))
    if (format) {
      const preferred = (format || (supportsAvif() ? 'avif' : 'webp')).toLowerCase()
      u.searchParams.set('format', preferred)
    }
    return u.toString()
  } catch {
    return url
  }
}
