import { buildSupabaseSrc, buildSupabaseSrcSet, shouldTranscodeToWebp, SUPABASE_RECOMMENDED_QUALITY, type TransformOpts } from '../utils/supabaseImage'

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
    // avoid letterbox; background not needed for cover
    quality: 75,
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

  const baseTransform: TransformOpts = {
    height: overrides.height ?? config.height,
    resize: overrides.resize ?? config.resize,
    background: background ? background.replace(/^#/, '') : undefined,
    quality: overrides.quality ?? config.quality,
  }

  let desiredFormat = overrides.format ?? config.format
  if (desiredFormat === 'auto') desiredFormat = undefined

  if (!desiredFormat || desiredFormat === 'webp') {
    if (shouldTranscodeToWebp(url)) {
      desiredFormat = 'webp'
    } else if (desiredFormat === 'webp') {
      desiredFormat = undefined
    }
  }

  const transform: TransformOpts = { ...baseTransform, format: desiredFormat }
  const targetWidth = typeof baseWidth === 'number' ? baseWidth : undefined

  const src = targetWidth ? buildSupabaseSrc(url, targetWidth, transform) : buildSupabaseSrc(url, undefined, transform)
  const srcSet = widths && widths.length ? buildSupabaseSrcSet(url, widths, transform) : undefined

  return {
    src,
    srcSet,
    sizes: options.sizes ?? config.sizes,
  }
}

export { CARD_BACKGROUND }
