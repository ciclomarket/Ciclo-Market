import { buildSupabaseSrc, buildSupabaseSrcSet, shouldTranscodeToWebp, SUPABASE_RECOMMENDED_QUALITY, inferImageFormat, type TransformOpts } from '../utils/supabaseImage'

export type ImageProfile = 'card' | 'thumb' | 'og' | 'full'

type ProfileConfig = {
  width?: number
  height?: number
  resize?: TransformOpts['resize']
  background?: string
  quality?: number
  format?: TransformOpts['format'] | 'auto'
  widths?: number[]
  sizes?: string
}

type BuildImageSourceOptions = {
  profile: ImageProfile
  width?: number
  widths?: number[]
  sizes?: string
  overrides?: Partial<TransformOpts>
}

export type ImageSource = {
  src: string
  srcSet?: string
  sizes?: string
}

const CARD_BACKGROUND = '#0B1220'

const PROFILE_DEFAULTS: Record<ImageProfile, ProfileConfig> = {
  card: {
    width: 1200,
    height: 800,
    resize: 'cover',
    // stronger compression for cards
    quality: 45,
    format: 'auto',
    widths: [600, 800, 1000, 1200, 1400],
    sizes: '(max-width: 1279px) 50vw, 33vw',
  },
  thumb: {
    width: 320,
    height: 240,
    resize: 'contain',
    background: CARD_BACKGROUND,
    quality: SUPABASE_RECOMMENDED_QUALITY,
    format: 'auto',
    widths: [160, 240, 320, 480],
    sizes: '160px',
  },
  og: {
    width: 1200,
    height: 630,
    resize: 'cover',
    background: CARD_BACKGROUND,
    quality: 80,
    format: 'jpeg',
    widths: [1200],
    sizes: '1200px',
  },
  full: {
    width: 1600,
    resize: 'inside',
    quality: 80,
    format: 'auto',
    widths: [800, 1200, 1600, 1920],
    sizes: '100vw',
  },
}

export function buildImageSource(url: string | undefined | null, options: BuildImageSourceOptions): ImageSource | null {
  if (!url) return null
  const config = PROFILE_DEFAULTS[options.profile]
  const widths = options.widths ?? config.widths
  const baseWidth = options.width ?? config.width ?? (Array.isArray(widths) ? widths[widths.length - 1] : undefined)

  const overrides = options.overrides ?? {}
  const background = overrides.background ?? config.background
  const effectiveResize = overrides.resize ?? config.resize
  const aspectRatio = config.width && config.height ? (config.height / config.width) : undefined
  const heightFor = (w?: number): number | undefined => {
    // Evitar height cuando usamos 'contain' para prevenir 400 del render
    if (effectiveResize === 'contain') return undefined
    if (typeof overrides.height === 'number') return overrides.height
    if (typeof w === 'number' && aspectRatio) return Math.round(w * aspectRatio)
    return undefined
  }

  const baseTransform: TransformOpts = {
    resize: effectiveResize,
    background: background ? background.replace(/^#/, '') : undefined,
    quality: overrides.quality ?? config.quality,
  }

  let desiredFormat = overrides.format ?? config.format
  if (desiredFormat === 'auto') desiredFormat = undefined

  // Avoid WebP for PNG when using contain (+background) as Supabase may return 400
  const origExt = inferImageFormat(url)
  const avoidWebp = (effectiveResize === 'contain') && (origExt === 'png')

  if (!desiredFormat || desiredFormat === 'webp') {
    if (!avoidWebp && shouldTranscodeToWebp(url)) {
      desiredFormat = 'webp'
    } else if (desiredFormat === 'webp') {
      desiredFormat = undefined
    }
  }
  // Do not force JPEG; keep original format unless explicitly transcoding

  const targetWidth = typeof baseWidth === 'number' ? baseWidth : undefined
  const transformBase: Omit<TransformOpts, 'width' | 'height'> = { ...baseTransform, format: desiredFormat }

  const src = targetWidth
    ? buildSupabaseSrc(url, targetWidth, { ...transformBase, height: heightFor(targetWidth) })
    : buildSupabaseSrc(url, undefined, transformBase)

  const srcSet = (widths && widths.length)
    ? widths.map((w) => {
        const tw = Math.floor(w)
        return `${buildSupabaseSrc(url, tw, { ...transformBase, height: heightFor(tw) })} ${tw}w`
      }).join(', ')
    : undefined

  return {
    src,
    srcSet,
    sizes: options.sizes ?? config.sizes,
  }
}

export { CARD_BACKGROUND }
