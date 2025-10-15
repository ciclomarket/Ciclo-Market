export type TransformOpts = {
  width?: number
  height?: number
  quality?: number
  format?: 'webp' | 'jpeg' | 'png'
}

/**
 * Given a Supabase public object URL, return the render/image URL with transforms.
 * If the URL is not a Supabase storage public URL, returns the original URL.
 */
export function transformSupabasePublicUrl(url: string, opts: TransformOpts = {}): string {
  try {
    if (!url || typeof url !== 'string') return url
    const u = new URL(url)
    // Expected pattern: /storage/v1/object/public/<bucket>/<path>
    if (!u.pathname.includes('/storage/v1/object/public/')) return url
    const pathAfterPublic = u.pathname.split('/storage/v1/object/public/')[1]
    if (!pathAfterPublic) return url
    const renderPath = `/storage/v1/render/image/public/${pathAfterPublic}`
    const transformed = new URL(u.origin + renderPath)
    const { width, height, quality, format } = opts
    if (width) transformed.searchParams.set('width', String(width))
    if (height) transformed.searchParams.set('height', String(height))
    if (quality) transformed.searchParams.set('quality', String(quality))
    if (format) transformed.searchParams.set('format', format)
    // Default format webp if not specified
    if (!format) transformed.searchParams.set('format', 'webp')
    return transformed.toString()
  } catch {
    return url
  }
}

