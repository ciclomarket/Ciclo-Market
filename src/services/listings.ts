
import { getSupabaseClient, supabaseEnabled } from './supabase'
import type { Listing } from '../types'
import type { SupabaseClient } from '@supabase/supabase-js'
import { extractListingId, slugify } from '../utils/slug'
import { canonicalPlanCode } from '../utils/planCodes'

const API_BASE = (import.meta.env.VITE_API_BASE_URL || '').replace(/\/$/, '')

type ListingRow = {
  id: string
  title: string
  brand: string
  model: string
  year?: number | null
  category: string
  subcategory?: string | null
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
  highlight_expires?: string | null
  seller_location?: string | null
  seller_whatsapp?: string | null
  seller_email?: string | null
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
  contact_methods?: string[] | null
}

const normalizeListing = (row: ListingRow): Listing => {
  const normalizedSellerPlan = canonicalPlanCode((row.seller_plan ?? row.plan ?? row.plan_code ?? null) as string | null) ?? undefined
  const normalizedPlan = canonicalPlanCode((row.plan ?? row.plan_code ?? row.seller_plan ?? null) as string | null)
  const rawStatus = typeof row.status === 'string' ? row.status.trim().toLowerCase() : undefined

  return {
    id: row.id,
    slug: row.slug ?? undefined,
    title: row.title,
    brand: row.brand,
    model: row.model,
    year: row.year ?? undefined,
    category: row.category as Listing['category'],
    subcategory: row.subcategory ?? undefined,
    price: row.price,
    priceCurrency: (row.price_currency ?? undefined) as Listing['priceCurrency'],
    originalPrice: row.original_price ?? undefined,
    location: row.location ?? '',
    description: row.description ?? '',
    images: row.images ?? [],
    sellerId: row.seller_id,
    sellerName: row.seller_name ?? undefined,
    sellerPlan: normalizedSellerPlan as Listing['sellerPlan'],
    plan: (normalizedPlan ?? row.plan ?? row.plan_code ?? undefined) as Listing['plan'],
    sellerPlanExpires: row.seller_plan_expires ? Date.parse(row.seller_plan_expires) : undefined,
    highlightExpires: row.highlight_expires ? Date.parse(row.highlight_expires) : undefined,
    sellerLocation: row.seller_location ?? undefined,
    sellerWhatsapp: row.seller_whatsapp ?? undefined,
    sellerEmail: row.seller_email ?? undefined,
    sellerAvatar: row.seller_avatar ?? undefined,
    material: row.material ?? undefined,
    frameSize: row.frame_size ?? undefined,
    drivetrain: row.drivetrain ?? undefined,
    drivetrainDetail: row.drivetrain_detail ?? undefined,
    wheelset: row.wheelset ?? undefined,
    wheelSize: row.wheel_size ?? undefined,
    extras: row.extras ?? undefined,
    status: (rawStatus ?? undefined) as Listing['status'],
    expiresAt: row.expires_at ? Date.parse(row.expires_at) : null,
    renewalNotifiedAt: row.renewal_notified_at ? Date.parse(row.renewal_notified_at) : null,
    createdAt: row.created_at ? Date.parse(row.created_at) : Date.now()
  }
}

const PHONE_REGEX = /\d+/g

const normalizeWhatsappForStorage = (raw: string | null | undefined): string | null => {
  if (!raw) return null
  const digits = String(raw).match(PHONE_REGEX)
  if (!digits) return null
  let normalized = digits.join('')
  normalized = normalized.replace(/^00+/, '')
  normalized = normalized.replace(/^0+/, '')
  if (!normalized) return null
  if (!normalized.startsWith('54')) normalized = `54${normalized}`
  return normalized
}

const ensureWhatsappInMethods = (methods: unknown): string[] => {
  const base = Array.isArray(methods) ? methods.filter(Boolean).map((m) => String(m)) : []
  const set = new Set(base)
  if (!set.has('email')) set.add('email')
  if (!set.has('chat')) set.add('chat')
  set.add('whatsapp')
  return Array.from(set)
}

export async function fetchListings(): Promise<Listing[]> {
  if (!supabaseEnabled) return []
  try {
    const supabase = getSupabaseClient()
    const { data, error } = await supabase
      .from('listings')
      .select('*')
      .order('created_at', { ascending: false })
    if (error || !data) return []
    const now = Date.now()
    const filtered = data.filter((row: any) => {
      const status = typeof row?.status === 'string' ? row.status.trim().toLowerCase() : 'active'
      if (status === 'draft' || status === 'deleted' || status === 'archived' || status === 'expired') return false
      const expiresAt = row?.expires_at ? Date.parse(row.expires_at) : null
      if (typeof expiresAt === 'number' && !Number.isNaN(expiresAt) && expiresAt > 0 && expiresAt < now) return false
      return true
    })
    return filtered.map((row: any) => normalizeListing(row as ListingRow))
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

    if (bySlug) {
      const status = typeof (bySlug as any)?.status === 'string' ? (bySlug as any).status.trim().toLowerCase() : undefined
      if (status === 'deleted') return null
      return normalizeListing(bySlug as ListingRow)
    }
    if (slugError && slugError.code && slugError.code !== 'PGRST116') return null

    const lookupId = extractListingId(identifier)
    const { data: byId, error: idError } = await supabase
      .from('listings')
      .select('*')
      .eq('id', lookupId)
      .maybeSingle()
    if (idError || !byId) return null
    const status = typeof (byId as any)?.status === 'string' ? (byId as any).status.trim().toLowerCase() : undefined
    if (status === 'deleted') return null
    // Backfill slug si falta: usar título + modelo + año y asegurar unicidad
    if (!(byId as any).slug) {
      try {
        const title = String((byId as any).title || '')
        const model = String((byId as any).model || '')
        const year = (byId as any).year ? String((byId as any).year) : ''
        const baseForSlug = [title, model, year].filter((v) => v && v.trim()).join(' ') || title
        const newSlug = await ensureUniqueSlug(baseForSlug, supabase)
        const { data: updated } = await supabase
          .from('listings')
          .update({ slug: newSlug })
          .eq('id', (byId as any).id)
          .select('*')
          .maybeSingle()
        if (updated) return normalizeListing(updated as ListingRow)
      } catch { void 0 }
    }
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
    const filtered = data.filter((row: any) => {
      const status = typeof row?.status === 'string' ? row.status.trim().toLowerCase() : ''
      return status !== 'deleted'
    })
    return filtered.map((row: any) => normalizeListing(row as ListingRow))
  } catch {
    return []
  }
}

export async function fetchListingsBySeller(
  sellerId: string,
  options?: { includeArchived?: boolean }
): Promise<Listing[]> {
  if (!supabaseEnabled) return []
  try {
    const supabase = getSupabaseClient()
    const { data, error } = await supabase
      .from('listings')
      .select('*')
      .eq('seller_id', sellerId)
      .order('created_at', { ascending: false })
    if (error || !data) return []
    const includeArchived = options?.includeArchived ?? false
    const filtered = data.filter((row: any) => {
      const status = typeof row?.status === 'string' ? row.status.trim().toLowerCase() : ''
      if (status === 'deleted') return false
      if (!includeArchived && status === 'archived') return false
      return true
    })
    return filtered.map((row: any) => normalizeListing(row as ListingRow))
  } catch {
    return []
  }
}

export async function updateListingPlan(options: { id: string; plan: Listing['sellerPlan'] | null; durationDays: number | null }): Promise<Listing | null> {
  if (!supabaseEnabled) return null
  const supabase = getSupabaseClient()
  const expiresIso = options.durationDays && options.durationDays > 0
    ? new Date(Date.now() + options.durationDays * 24 * 60 * 60 * 1000).toISOString()
    : null
  const { data, error } = await supabase
    .from('listings')
    .update({
      seller_plan: options.plan,
      seller_plan_expires: expiresIso
    })
    .eq('id', options.id)
    .select('*')
    .maybeSingle()
  if (error) {
    console.warn('[listings] updateListingPlan error', error)
    return null
  }
  return data ? normalizeListing(data as ListingRow) : null
}

export async function archiveListing(id: string): Promise<boolean> {
  if (!supabaseEnabled) return false
  try {
    const supabase = getSupabaseClient()
    const { error } = await supabase
      .from('listings')
      .update({ status: 'archived', archived_at: new Date().toISOString() })
      .eq('id', id)
    return !error
  } catch (err) {
    console.warn('[listings] archive error', err)
    return false
  }
}

export async function updateListingStatus(id: string, status: Listing['status']): Promise<Listing | null> {
  if (!supabaseEnabled) return null
  try {
    const supabase = getSupabaseClient()
    const { data, error } = await supabase
      .from('listings')
      .update({ status })
      .eq('id', id)
      .select('*')
      .maybeSingle()
    if (error) {
      console.warn('[listings] update status error', error)
      return null
    }
    return data ? normalizeListing(data as ListingRow) : null
  } catch (err) {
    console.warn('[listings] update status exception', err)
    return null
  }
}

export async function deleteListing(id: string): Promise<boolean> {
  if (!supabaseEnabled) return false
  try {
    const supabase = getSupabaseClient()
    const { error } = await supabase
      .from('listings')
      .update({ status: 'deleted' })
      .eq('id', id)
    if (error) {
      console.warn('[listings] delete error', error)
      return false
    }
    // Intentar limpiar imágenes en el backend (best-effort)
    try {
      const endpoint = API_BASE ? `${API_BASE}/api/listings/${id}/cleanup-images` : `/api/listings/${id}/cleanup-images`
      await fetch(endpoint, { method: 'POST' })
    } catch (e) {
      // no bloquea el borrado
      console.warn('[listings] cleanup images call failed', (e as any)?.message)
    }
    return true
  } catch (err) {
    console.warn('[listings] delete exception', err)
    return false
  }
}

export async function extendListingExpiryDays(id: string, days: number): Promise<Listing | null> {
  if (!supabaseEnabled) return null
  try {
    const supabase = getSupabaseClient()
    // Fetch current expires_at
    const { data: row } = await supabase.from('listings').select('expires_at').eq('id', id).maybeSingle()
    const base = row?.expires_at ? new Date(row.expires_at) : new Date()
    base.setDate(base.getDate() + days)
    const nextIso = base.toISOString()
    const { data, error } = await supabase
      .from('listings')
      .update({ expires_at: nextIso })
      .eq('id', id)
      .select('*')
      .maybeSingle()
    if (error) {
      console.warn('[listings] extend expiry error', error)
      return null
    }
    return data ? normalizeListing(data as ListingRow) : null
  } catch (err) {
    console.warn('[listings] extend expiry exception', err)
    return null
  }
}

export async function setListingHighlightDays(id: string, days: number | null): Promise<Listing | null> {
  if (!supabaseEnabled) return null
  try {
    const supabase = getSupabaseClient()
    let nextIso: string | null = null
    if (typeof days === 'number' && days > 0) {
      const { data: row } = await supabase.from('listings').select('highlight_expires').eq('id', id).maybeSingle()
      const now = Date.now()
      const baseMs = row?.highlight_expires ? Math.max(new Date(row.highlight_expires).getTime(), now) : now
      nextIso = new Date(baseMs + days * 24 * 60 * 60 * 1000).toISOString()
    }
    const { data, error } = await supabase
      .from('listings')
      .update({ highlight_expires: nextIso })
      .eq('id', id)
      .select('*')
      .maybeSingle()
    if (error) {
      console.warn('[listings] set highlight error', error)
      return null
    }
    return data ? normalizeListing(data as ListingRow) : null
  } catch (err) {
    console.warn('[listings] set highlight exception', err)
    return null
  }
}

export async function updateListingFields(id: string, patch: Partial<Listing>): Promise<Listing | null> {
  if (!supabaseEnabled) return null
  try {
    const supabase = getSupabaseClient()
    const updates: Record<string, any> = {}
    if (patch.title !== undefined) updates.title = patch.title
    if (patch.description !== undefined) updates.description = patch.description
    if (patch.brand !== undefined) updates.brand = patch.brand
    if (patch.model !== undefined) updates.model = patch.model
    if (patch.year !== undefined) updates.year = patch.year
    if (patch.material !== undefined) updates.material = patch.material
    if (patch.frameSize !== undefined) updates.frame_size = patch.frameSize
    if (patch.drivetrain !== undefined) updates.drivetrain = patch.drivetrain
    if (patch.drivetrainDetail !== undefined) updates.drivetrain_detail = patch.drivetrainDetail
    if (patch.wheelset !== undefined) updates.wheelset = patch.wheelset
    if (patch.wheelSize !== undefined) updates.wheel_size = patch.wheelSize
    if (patch.extras !== undefined) updates.extras = patch.extras
    if (patch.location !== undefined) updates.location = patch.location
    if (patch.price !== undefined) updates.price = patch.price
    if (patch.priceCurrency !== undefined) updates.price_currency = patch.priceCurrency

    if (Object.keys(updates).length === 0) return null

    const { data, error } = await supabase
      .from('listings')
      .update(updates)
      .eq('id', id)
      .select('*')
      .maybeSingle()
    if (error) {
      console.warn('[listings] update fields error', error)
      return null
    }
    return data ? normalizeListing(data as ListingRow) : null
  } catch (err) {
    console.warn('[listings] update fields exception', err)
    return null
  }
}

export async function setListingWhatsapp(id: string, value: string | null): Promise<Listing | null> {
  if (!supabaseEnabled) return null
  try {
    const supabase = getSupabaseClient()
    const { data, error } = await supabase
      .from('listings')
      .update({ seller_whatsapp: value })
      .eq('id', id)
      .select('*')
      .maybeSingle()
    if (error) {
      console.warn('[listings] set whatsapp error', error)
      return null
    }
    return data ? normalizeListing(data as ListingRow) : null
  } catch (err) {
    console.warn('[listings] set whatsapp exception', err)
    return null
  }
}

type UpgradeParams = {
  id: string
  planCode: 'basic' | 'premium'
  useCredit?: boolean
  allowClientFallback?: boolean
}

export async function upgradeListingPlan({ id, planCode, useCredit = false, allowClientFallback = false }: UpgradeParams): Promise<{ ok: boolean; listing?: Listing; error?: string }> {
  if (!supabaseEnabled) return { ok: false, error: 'supabase_disabled' }
  try {
    const supabase = getSupabaseClient()
    const { data } = await supabase.auth.getSession()
    const token = data.session?.access_token || null
    if (!token) return { ok: false, error: 'not_authenticated' }
    const path = `/api/listings/${encodeURIComponent(id)}/upgrade`
    const endpoints = API_BASE ? [path, `${API_BASE}${path}`] : [path]
    let lastError: string | undefined
    for (let index = 0; index < endpoints.length; index += 1) {
      const endpoint = endpoints[index]
      try {
        const res = await fetch(endpoint, {
          method: 'POST',
          headers: {
            'Content-Type': 'application/json',
            Authorization: `Bearer ${token}`,
          },
          body: JSON.stringify({ planCode, useCredit }),
        })
        const payload = await res.json().catch(() => ({}))
        if (!res.ok || !payload?.ok) {
          lastError = payload?.error || `upgrade_failed_${res.status}`
          if (index < endpoints.length - 1) continue
          break
        }
        const listing = payload?.listing ? normalizeListing(payload.listing as ListingRow) : undefined
        return { ok: true, listing }
      } catch (err) {
        lastError = (err as Error)?.message || 'network_error'
        if (index < endpoints.length - 1) continue
        break
      }
    }
    if (allowClientFallback && !useCredit) {
      const fallback = await tryClientModeratorUpgrade({ supabase, id, planCode })
      if (fallback.ok) return fallback
      if (fallback.error) return fallback
    }
    if (lastError) console.warn('[listings] upgrade endpoints failed', lastError)
    return { ok: false, error: lastError || 'network_error' }
  } catch (err) {
    console.warn('[listings] upgrade failed', err)
    return { ok: false, error: 'network_error' }
  }
}

const DAY_MS = 24 * 60 * 60 * 1000

async function tryClientModeratorUpgrade({
  supabase,
  id,
  planCode
}: {
  supabase: SupabaseClient
  id: string
  planCode: 'basic' | 'premium'
}): Promise<{ ok: boolean; listing?: Listing; error?: string }> {
  try {
    const { data: listing, error } = await supabase
      .from('listings')
      .select('id,seller_id,plan,plan_code,seller_plan,seller_whatsapp,contact_methods,expires_at,highlight_expires')
      .eq('id', id)
      .maybeSingle()

    if (error || !listing || !listing?.seller_id) {
      if (error) console.warn('[listings] moderator fallback fetch error', error)
      return { ok: false, error: 'not_found' }
    }

    const ownerId = String(listing.seller_id)

    const { data: planRow } = await supabase
      .from('plans')
      .select('code,listing_duration_days,period_days,featured_days,featured_slots')
      .eq('code', planCode)
      .maybeSingle()

    const defaultDuration = planCode === 'premium' ? 60 : 60
    const listingDays = Number(planRow?.listing_duration_days ?? planRow?.period_days ?? defaultDuration) || defaultDuration
    const defaultHighlight = planCode === 'premium' ? 14 : 7
    const includedHighlightDays = Number(planRow?.featured_days ?? planRow?.featured_slots ?? defaultHighlight) || 0

    const now = Date.now()
    const nextExpires = new Date(now + listingDays * DAY_MS).toISOString()

    let nextHighlightIso: string | null = listing.highlight_expires ?? null
    if (includedHighlightDays > 0) {
      const base = listing.highlight_expires ? Math.max(new Date(listing.highlight_expires).getTime(), now) : now
      nextHighlightIso = new Date(base + includedHighlightDays * DAY_MS).toISOString()
    }

    let sellerWhatsapp = normalizeWhatsappForStorage((listing as any).seller_whatsapp || '')
    if (!sellerWhatsapp) {
      const { data: profile } = await supabase
        .from('users')
        .select('whatsapp_number,store_phone')
        .eq('id', ownerId)
        .maybeSingle()
      const candidate = profile?.whatsapp_number || profile?.store_phone || ''
      sellerWhatsapp = normalizeWhatsappForStorage(candidate)
    }

    if (!sellerWhatsapp) {
      return { ok: false, error: 'missing_whatsapp' }
    }

    const contactMethods = ensureWhatsappInMethods((listing as any).contact_methods)

    const { data: updated, error: updateErr } = await supabase
      .from('listings')
      .update({
        plan: planCode,
        plan_code: planCode,
        seller_plan: planCode,
        seller_whatsapp: sellerWhatsapp,
        contact_methods: contactMethods,
        expires_at: nextExpires,
        highlight_expires: nextHighlightIso,
        status: 'active'
      })
      .eq('id', id)
      .select('*')
      .maybeSingle()

    if (updateErr || !updated) {
      if (updateErr) console.warn('[listings] moderator fallback update error', updateErr)
      else console.warn('[listings] moderator fallback update empty response')
      return { ok: false, error: 'update_failed' }
    }

    return { ok: true, listing: normalizeListing(updated as ListingRow) }
  } catch (err) {
    console.warn('[listings] moderator upgrade fallback failed', err)
    return { ok: false, error: 'network_error' }
  }
}

export async function reduceListingPrice({
  id,
  newPrice,
  currentPrice,
  originalPrice
}: {
  id: string
  newPrice: number
  currentPrice: number
  originalPrice?: number
}): Promise<Listing | null> {
  if (!supabaseEnabled) return null
  try {
    const supabase = getSupabaseClient()
    const nextOriginal = typeof originalPrice === 'number' && originalPrice > 0 ? originalPrice : currentPrice
    const { data, error } = await supabase
      .from('listings')
      .update({
        price: newPrice,
        original_price: nextOriginal
      })
      .eq('id', id)
      .select('*')
      .maybeSingle()

    if (error) {
      console.warn('[listings] reduce price error', error)
      return null
    }
    return data ? normalizeListing(data as ListingRow) : null
  } catch (err) {
    console.warn('[listings] reduce price exception', err)
    return null
  }
}

async function ensureUniqueSlug(title: string, supabase: SupabaseClient): Promise<string> {
  const base = slugify(title) || 'listing'
  let candidate = base
  let counter = 2
  let available = false
  while (!available) {
    const { data, error } = await supabase
      .from('listings')
      .select('id')
      .eq('slug', candidate)
      .limit(1)
    if (error) throw error
    if (!data || data.length === 0) {
      available = true
    } else {
      candidate = `${base}-${counter++}`
    }
  }
  return candidate
}

export async function createListing(payload: Omit<Listing, 'id' | 'createdAt'>): Promise<{ id: string; slug: string } | null> {
  if (!supabaseEnabled) return null
  try {
    const supabase = getSupabaseClient()
    // Slug base: título + modelo + año (cuando están disponibles)
    const baseForSlug = [payload.title, payload.model, payload.year ? String(payload.year) : null]
      .filter((v) => typeof v === 'string' && (v as string).trim())
      .join(' ') || payload.title
    const slug = await ensureUniqueSlug(baseForSlug, supabase)
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
      seller_plan: payload.sellerPlan ?? payload.plan ?? null,
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
