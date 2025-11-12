import { createClient } from '@supabase/supabase-js'

// Project-scoped public client (no auth needed for public URLs)
const SUPABASE_URL = 'https://jmtsgywgeysagnfgdovr.supabase.co'
const SUPABASE_ANON = import.meta.env.VITE_SUPABASE_ANON_KEY as string | undefined

// Create a lightweight client just for storage URL resolution
const supabase = createClient(SUPABASE_URL, SUPABASE_ANON || '')

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
    const { data } = supabase.storage.from('listings').getPublicUrl(raw)
    return withOgTransform(data.publicUrl || fallback)
  } catch {
    return fallback
  }
}

