export type TransformOpts = {
  width?: number
  height?: number
  quality?: number
  format?: 'avif' | 'webp' | 'jpeg' | 'png'
}

const USE_SUPABASE_TRANSFORM = String(import.meta.env.VITE_SUPABASE_IMG_TRANSFORM || '').toLowerCase() === 'true'
const PUBLIC_PATH = '/storage/v1/object/public/'
const RENDER_PATH = '/storage/v1/render/image/public/'

function clampQuality(value?: number): number | null {
  if (typeof value !== 'number' || Number.isNaN(value)) return null
  return Math.min(100, Math.max(1, Math.round(value)))
}

const applyOpts = (renderUrl: URL, opts: TransformOpts) => {
  const { width, height, quality, format } = opts
  if (typeof width === 'number' && width > 0) renderUrl.searchParams.set('width', String(Math.floor(width)))
  if (typeof height === 'number' && height > 0) renderUrl.searchParams.set('height', String(Math.floor(height)))
  const q = clampQuality(quality)
  if (q !== null) renderUrl.searchParams.set('quality', String(q))
  if (format) renderUrl.searchParams.set('format', format.toLowerCase())
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

export function buildSupabaseSrcSet(url: string, widths: number[], opts: Omit<TransformOpts, 'width'> = {}): string | undefined {
  if (!Array.isArray(widths) || !widths.length) return undefined
  const seen = new Set<number>()
  const entries = widths
    .map((w) => Math.floor(w))
    .filter((w) => Number.isFinite(w) && w > 0 && !seen.has(w) && seen.add(w))
    .map((w) => `${transformSupabasePublicUrl(url, { ...opts, width: w })} ${w}w`)
  return entries.length ? entries.join(', ') : undefined
}

export function buildSupabaseSrc(url: string, width?: number, opts: Omit<TransformOpts, 'width'> = {}): string {
  if (typeof width === 'number') {
    return transformSupabasePublicUrl(url, { ...opts, width })
  }
  return transformSupabasePublicUrl(url, opts)
}

export const SUPABASE_RECOMMENDED_QUALITY = 70
