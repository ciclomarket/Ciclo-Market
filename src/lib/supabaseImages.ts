import { getSupabaseClient, supabaseEnabled } from '../services/supabase'

// Base URL fallback for public object URLs when Supabase client is disabled
const SUPABASE_URL = (import.meta.env.VITE_SUPABASE_URL as string | undefined) || 'https://jmtsgywgeysagnfgdovr.supabase.co'

function buildPublicObjectUrl(bucket: string, objectPath: string): string {
  const clean = String(objectPath).replace(/^\/+/, '')
  if (supabaseEnabled) {
    try {
      const { data } = getSupabaseClient().storage.from(bucket).getPublicUrl(clean)
      if (data?.publicUrl) return data.publicUrl
    } catch {
      /* fall through to manual build */
    }
  }
  return `${SUPABASE_URL}/storage/v1/object/public/${bucket}/${clean}`
}

const isUrl = (s?: string | null) => !!s && /^https?:\/\//i.test(s)

const withOgTransform = (url: string) => {
  try {
    const u = new URL(url)
    // If Supabase Image Transform is active, these params are recognized.
    u.searchParams.set('width', '1200')
    u.searchParams.set('height', '630')
    u.searchParams.set('fit', 'crop')
    return u.toString()
  } catch {
    return url
  }
}

export type MinimalListing = { images?: Array<string | { url: string }> }

export function getOgImageUrlFromFirst(listing: MinimalListing | null | undefined): string {
  const fallback = 'https://www.ciclomarket.ar/site-og-default.webp'
  const first = listing?.images?.[0]
  if (!first) return fallback

  const raw = typeof first === 'string' ? first : first?.url
  if (!raw) return fallback

  // If already absolute, apply transform params and return
  if (isUrl(raw)) return withOgTransform(raw)

  // Else, treat as path inside the root of the public bucket 'listings'
  try {
    const url = buildPublicObjectUrl('listings', raw)
    return withOgTransform(url || fallback)
  } catch {
    return fallback
  }
}

// Safe, deterministic card image URL builder (no transform)
// - If the input is already absolute, return as-is
// - Else, normalize path and build a public object URL from the 'listings' bucket
export function buildCardImageUrlSafe(raw: string | null | undefined): string | null {
  const fallback = null
  if (!raw) return fallback
  try {
    if (/^https?:\/\//i.test(raw)) return raw
    const clean = String(raw).replace(/^\/+/, '').replace(/^listings\//, '')
    const url = buildPublicObjectUrl('listings', clean)
    return url || fallback
  } catch {
    return fallback
  }
}

// Optional: cover transform for cards. Use only after verifying all images load with the safe URL.
export function buildCardImageUrlTransform(raw: string | null | undefined): string | null {
  const base = buildCardImageUrlSafe(raw)
  if (!base) return base
  try {
    const u = new URL(base)
    u.searchParams.set('width', '1200')
    u.searchParams.set('height', '800')
    u.searchParams.set('resize', 'cover')
    // format set only if not already webp
    if (!/\.webp(?:$|\?)/i.test(u.pathname)) u.searchParams.set('format', 'webp')
    u.searchParams.set('quality', '80')
    return u.toString()
  } catch {
    return base
  }
}

// Generic public URL builder (no transform) that infiere el bucket desde el path si no es absoluto.
// Acepta rutas del tipo "listings/2025/.." o "avatars/user-.." y arma la URL pública.
export function buildPublicUrlSafe(raw: string | null | undefined): string | null {
  if (!raw) return null
  try {
    if (/^https?:\/\//i.test(raw)) return raw
    const clean = String(raw).replace(/^\/+/, '')
    const [bucket, ...rest] = clean.split('/')
    if (!bucket || !rest.length) return null
    const objectPath = rest.join('/')
    return buildPublicObjectUrl(bucket, objectPath)
  } catch {
    return null
  }
}
