
import { getSupabaseClient, supabaseEnabled } from './supabase'
import type { Listing } from '../types'
import type { SupabaseClient } from '@supabase/supabase-js'
import { extractListingId, slugify } from '../utils/slug'

type ListingRow = {
  id: string
  title: string
  brand: string
  model: string
  year?: number | null
  category: string
  price: number
  price_currency?: 'USD' | 'ARS' | null
  original_price?: number | null
  location: string | null
  description?: string | null
  images?: string[] | null
  seller_id: string
  seller_name?: string | null
  seller_plan?: string | null
  seller_plan_expires?: string | null
  seller_location?: string | null
  seller_whatsapp?: string | null
  seller_avatar?: string | null
  material?: string | null
  frame_size?: string | null
  drivetrain?: string | null
  drivetrain_detail?: string | null
  wheelset?: string | null
  wheel_size?: string | null
  extras?: string | null
  plan?: string | null
  plan_code?: string | null
  status?: string | null
  expires_at?: string | null
  renewal_notified_at?: string | null
  created_at?: string | null
  slug?: string | null
}

const normalizeListing = (row: ListingRow): Listing => ({
  id: row.id,
  slug: row.slug ?? undefined,
  title: row.title,
  brand: row.brand,
  model: row.model,
  year: row.year ?? undefined,
  category: row.category as Listing['category'],
  price: row.price,
  priceCurrency: (row.price_currency ?? undefined) as Listing['priceCurrency'],
  originalPrice: row.original_price ?? undefined,
  location: row.location ?? '',
  description: row.description ?? '',
  images: row.images ?? [],
  sellerId: row.seller_id,
  sellerName: row.seller_name ?? undefined,
  sellerPlan: (row.seller_plan ?? undefined) as Listing['sellerPlan'],
  sellerPlanExpires: row.seller_plan_expires ? Date.parse(row.seller_plan_expires) : undefined,
  sellerLocation: row.seller_location ?? undefined,
  sellerWhatsapp: row.seller_whatsapp ?? undefined,
  sellerAvatar: row.seller_avatar ?? undefined,
  material: row.material ?? undefined,
  frameSize: row.frame_size ?? undefined,
  drivetrain: row.drivetrain ?? undefined,
  drivetrainDetail: row.drivetrain_detail ?? undefined,
  wheelset: row.wheelset ?? undefined,
  wheelSize: row.wheel_size ?? undefined,
  extras: row.extras ?? undefined,
  plan: (row.plan ?? row.plan_code ?? undefined) as Listing['plan'],
  status: (row.status ?? undefined) as Listing['status'],
  expiresAt: row.expires_at ? Date.parse(row.expires_at) : null,
  renewalNotifiedAt: row.renewal_notified_at ? Date.parse(row.renewal_notified_at) : null,
  createdAt: row.created_at ? Date.parse(row.created_at) : Date.now()
})

export async function fetchListings(): Promise<Listing[]> {
  if (!supabaseEnabled) return []
  try {
    const supabase = getSupabaseClient()
    const { data, error } = await supabase
      .from('listings')
      .select('*')
      .order('created_at', { ascending: false })
    if (error || !data) return []
    return data.map((row: any) => normalizeListing(row as ListingRow))
  } catch {
    return []
  }
}

export async function fetchListing(identifier: string): Promise<Listing | null> {
  if (!supabaseEnabled) return null
  try {
    const supabase = getSupabaseClient()
    const { data: bySlug, error: slugError } = await supabase
      .from('listings')
      .select('*')
      .eq('slug', identifier)
      .maybeSingle()

    if (bySlug) return normalizeListing(bySlug as ListingRow)
    if (slugError && slugError.code && slugError.code !== 'PGRST116') return null

    const lookupId = extractListingId(identifier)
    const { data: byId, error: idError } = await supabase
      .from('listings')
      .select('*')
      .eq('id', lookupId)
      .maybeSingle()
    if (idError || !byId) return null
    return normalizeListing(byId as ListingRow)
  } catch {
    return null
  }
}

export async function fetchListingsByIds(ids: string[]): Promise<Listing[]> {
  if (!supabaseEnabled || ids.length === 0) return []
  try {
    const supabase = getSupabaseClient()
    const { data, error } = await supabase
      .from('listings')
      .select('*')
      .in('id', ids)
    if (error || !data) return []
    return data.map((row: any) => normalizeListing(row as ListingRow))
  } catch {
    return []
  }
}

export async function fetchListingsBySeller(sellerId: string): Promise<Listing[]> {
  if (!supabaseEnabled) return []
  try {
    const supabase = getSupabaseClient()
    const { data, error } = await supabase
      .from('listings')
      .select('*')
      .eq('seller_id', sellerId)
      .order('created_at', { ascending: false })
    if (error || !data) return []
    return data.map((row: any) => normalizeListing(row as ListingRow))
  } catch {
    return []
  }
}

async function ensureUniqueSlug(title: string, supabase: SupabaseClient): Promise<string> {
  const base = slugify(title) || 'listing'
  let candidate = base
  let counter = 2
  while (true) {
    const { data, error } = await supabase
      .from('listings')
      .select('id')
      .eq('slug', candidate)
      .limit(1)
    if (error) throw error
    if (!data || data.length === 0) return candidate
    candidate = `${base}-${counter++}`
  }
}

export async function createListing(payload: Omit<Listing, 'id' | 'createdAt'>): Promise<{ id: string; slug: string } | null> {
  if (!supabaseEnabled) return null
  try {
    const supabase = getSupabaseClient()
    const slug = await ensureUniqueSlug(payload.title, supabase)
    const expiresAt = payload.expiresAt ? new Date(payload.expiresAt).toISOString() : null
    const toInsert = {
      title: payload.title,
      brand: payload.brand,
      model: payload.model,
      year: payload.year ?? null,
      category: payload.category,
      price: payload.price,
      price_currency: payload.priceCurrency ?? null,
      original_price: payload.originalPrice ?? null,
      location: payload.location,
      description: payload.description,
      images: payload.images,
      seller_id: payload.sellerId,
      seller_name: payload.sellerName ?? null,
      seller_plan: payload.sellerPlan ?? null,
      seller_plan_expires: payload.sellerPlanExpires ? new Date(payload.sellerPlanExpires).toISOString() : null,
      seller_location: payload.sellerLocation ?? null,
      seller_whatsapp: payload.sellerWhatsapp ?? null,
      seller_avatar: payload.sellerAvatar ?? null,
      material: payload.material ?? null,
      frame_size: payload.frameSize ?? null,
      drivetrain: payload.drivetrain ?? null,
      drivetrain_detail: payload.drivetrainDetail ?? null,
      wheelset: payload.wheelset ?? null,
      wheel_size: payload.wheelSize ?? null,
      extras: payload.extras ?? null,
      plan: payload.plan ?? null,
      plan_code: payload.plan ?? null,
      status: payload.status ?? 'active',
      expires_at: expiresAt,
      renewal_notified_at: payload.renewalNotifiedAt ? new Date(payload.renewalNotifiedAt).toISOString() : null,
      slug
    }
    const { data, error } = await supabase
      .from('listings')
      .insert([toInsert])
      .select('id, slug')
      .maybeSingle()
    if (error || !data) return null
    return { id: data.id as string, slug: data.slug as string }
  } catch {
    return null
  }
}
