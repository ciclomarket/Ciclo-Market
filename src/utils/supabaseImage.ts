export type TransformOpts = {
  width?: number
  height?: number
  quality?: number
  format?: 'avif' | 'webp' | 'jpeg' | 'png'
  resize?: 'contain' | 'cover' | 'fill' | 'inside' | 'outside'
  background?: string
}

const USE_SUPABASE_TRANSFORM = String(import.meta.env.VITE_SUPABASE_IMG_TRANSFORM || '').toLowerCase() === 'true'
const PUBLIC_PATH = '/storage/v1/object/public/'
const RENDER_PATH = '/storage/v1/render/image/public/'

function clampQuality(value?: number): number | null {
  if (typeof value !== 'number' || Number.isNaN(value)) return null
  return Math.min(100, Math.max(1, Math.round(value)))
}

const applyOpts = (renderUrl: URL, opts: TransformOpts) => {
  const { width, height, quality, format, resize, background } = opts
  if (typeof width === 'number' && width > 0) renderUrl.searchParams.set('width', String(Math.floor(width)))
  if (typeof height === 'number' && height > 0) renderUrl.searchParams.set('height', String(Math.floor(height)))
  const q = clampQuality(quality)
  if (q !== null) renderUrl.searchParams.set('quality', String(q))
  if (format) renderUrl.searchParams.set('format', format.toLowerCase())
  if (resize) renderUrl.searchParams.set('resize', resize)
  if (background) renderUrl.searchParams.set('background', background)
  return renderUrl
}

function buildRenderUrl(u: URL, opts: TransformOpts): string {
  const parts = u.pathname.split(PUBLIC_PATH)[1]
  if (!parts) return u.toString()
  const render = new URL(`${RENDER_PATH}${parts}`, `${u.protocol}//${u.host}`)
  return applyOpts(render, opts).toString()
}

export function transformSupabasePublicUrl(url: string, opts: TransformOpts = {}): string {
  if (!url || typeof url !== 'string') return url
  try {
    const parsed = new URL(url)
    if (!parsed.pathname.includes(PUBLIC_PATH)) return url
    if (!USE_SUPABASE_TRANSFORM) {
      return parsed.toString()
    }
    return buildRenderUrl(parsed, opts)
  } catch {
    return url
  }
}

/**
 * Fuerza el uso del endpoint de render de Supabase para imágenes públicas, sin depender de `VITE_SUPABASE_IMG_TRANSFORM`.
 * Útil para casos donde querés garantizar transformaciones (p.ej. LCP en mobile).
 */
export function forceTransformSupabasePublicUrl(url: string, opts: TransformOpts = {}): string {
  if (!url || typeof url !== 'string') return url
  try {
    const parsed = new URL(url)
    if (parsed.pathname.includes(RENDER_PATH)) {
      return applyOpts(parsed, opts).toString()
    }
    if (!parsed.pathname.includes(PUBLIC_PATH)) return url
    return buildRenderUrl(parsed, opts)
  } catch {
    return url
  }
}

export function buildSupabaseSrcSet(url: string, widths: number[], opts: Omit<TransformOpts, 'width'> = {}): string | undefined {
  if (!Array.isArray(widths) || !widths.length) return undefined
  const seen = new Set<number>()
  const baseOpts = normalizeTransformOpts(url, opts as TransformOpts)
  const entries = widths
    .map((w) => Math.floor(w))
    .filter((w) => Number.isFinite(w) && w > 0 && !seen.has(w) && seen.add(w))
    .map((w) => `${transformSupabasePublicUrl(url, { ...baseOpts, width: w })} ${w}w`)
  return entries.length ? entries.join(', ') : undefined
}

export function buildSupabaseSrc(url: string, width?: number, opts: Omit<TransformOpts, 'width'> = {}): string {
  const normalized = normalizeTransformOpts(url, opts as TransformOpts)
  if (typeof width === 'number') {
    return transformSupabasePublicUrl(url, { ...normalized, width })
  }
  return transformSupabasePublicUrl(url, normalized)
}

export const SUPABASE_RECOMMENDED_QUALITY = 70

let SAFARI_DETECTED: boolean | null = null
function isSafariLike(): boolean {
  if (SAFARI_DETECTED !== null) return SAFARI_DETECTED
  if (typeof navigator === 'undefined') return (SAFARI_DETECTED = false)
  const ua = navigator.userAgent || ''
  const isSafari = /Safari/i.test(ua) && !/Chrome|CriOS|FxiOS|EdgiOS/i.test(ua)
  const isIOSWebView = /iP(hone|od|ad).+AppleWebKit(?!.*Safari)/i.test(ua)
  SAFARI_DETECTED = isSafari || isIOSWebView
  return SAFARI_DETECTED
}

export function inferImageFormat(value: string | undefined | null): string | null {
  if (!value) return null
  try {
    const pathname = value.startsWith('http') ? new URL(value).pathname : value
    const match = pathname.match(/\.([a-z0-9]+)(?:$|\?)/i)
    return match ? match[1].toLowerCase() : null
  } catch {
    return null
  }
}

export function shouldTranscodeToWebp(url: string | undefined | null): boolean {
  const ext = inferImageFormat(url)
  if (isSafariLike()) return false
  if (!ext) return true
  if (ext === 'webp') return false
  if (ext === 'jpg' || ext === 'jpeg') return false
  return true
}

function normalizeTransformOpts(url: string, opts: TransformOpts = {}): TransformOpts {
  const normalized: TransformOpts = { ...opts }
  const ext = inferImageFormat(url)
  if (!normalized.format && ext && (ext === 'heic' || ext === 'heif')) {
    normalized.format = 'jpeg'
    if (typeof normalized.quality !== 'number') normalized.quality = 80
  }
  if (normalized.background) normalized.background = normalized.background.replace(/^#/, '').toLowerCase()
  return normalized
}
