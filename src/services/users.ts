import { getSupabaseClient, supabaseEnabled } from './supabase'

export interface UserProfileInput {
  id: string
  email: string
  fullName: string
  province: string
  city: string
  bikePreferences: string[]
  avatarUrl?: string
  profileSlug: string
  preferredBike?: string | null
  instagramHandle?: string | null
  facebookHandle?: string | null
  websiteUrl?: string | null
  verified?: boolean
  whatsapp?: string | null
  // Store (official shop) optional fields
  storeEnabled?: boolean
  storeName?: string | null
  storeSlug?: string | null
  storeAddress?: string | null
  storePhone?: string | null
  storeInstagram?: string | null
  storeFacebook?: string | null
  storeWebsite?: string | null
  storeBannerUrl?: string | null
  storeAvatarUrl?: string | null
  storeBannerPositionY?: number | null
}

export interface UserProfileRecord {
  id: string
  email: string
  full_name?: string | null
  province?: string | null
  city?: string | null
  bike_preferences?: string[] | null
  profile_slug?: string | null
  created_at?: string | null
  avatar_url?: string | null
  preferred_bike?: string | null
  instagram_handle?: string | null
  facebook_handle?: string | null
  website_url?: string | null
  verified?: boolean | null
  whatsapp_number?: string | null
  // Store fields (nullable if not enabled)
  store_enabled?: boolean | null
  store_name?: string | null
  store_slug?: string | null
  store_address?: string | null
  store_phone?: string | null
  store_instagram?: string | null
  store_facebook?: string | null
  store_website?: string | null
  store_banner_url?: string | null
  store_avatar_url?: string | null
  store_banner_position_y?: number | null
}

export async function createUserProfile(payload: UserProfileInput): Promise<boolean> {
  if (!supabaseEnabled) return false
  try {
    const supabase = getSupabaseClient()
    const { error } = await supabase.from('users').insert({
      id: payload.id,
      email: payload.email,
      full_name: payload.fullName,
      province: payload.province,
      city: payload.city,
      bike_preferences: payload.bikePreferences,
      profile_slug: payload.profileSlug,
      avatar_url: payload.avatarUrl ?? null,
      preferred_bike: payload.preferredBike ?? null,
      instagram_handle: payload.instagramHandle ?? null,
      facebook_handle: payload.facebookHandle ?? null,
      website_url: payload.websiteUrl ?? null,
      verified: payload.verified ?? false,
      // Renombrá a whatsapp si tu tabla no tiene whatsapp_number
      whatsapp_number: payload.whatsapp ?? null,
      store_enabled: payload.storeEnabled ?? null,
      store_name: payload.storeName ?? null,
      store_slug: payload.storeSlug ?? null,
      store_address: payload.storeAddress ?? null,
      store_phone: payload.storePhone ?? null,
      store_instagram: payload.storeInstagram ?? null,
      store_facebook: payload.storeFacebook ?? null,
      store_website: payload.storeWebsite ?? null,
      store_banner_url: payload.storeBannerUrl ?? null,
      store_banner_position_y: payload.storeBannerPositionY ?? null,
      store_avatar_url: payload.storeAvatarUrl ?? null,
      created_at: new Date().toISOString()
    })
    return !error
  } catch {
    return false
  }
}

export interface UpsertProfileResult {
  success: boolean
  error?: string
}

export async function upsertUserProfile(payload: Partial<UserProfileInput> & { id: string }): Promise<UpsertProfileResult> {
  if (!supabaseEnabled) return { success: false, error: 'Supabase no habilitado' }
  try {
    const supabase = getSupabaseClient()
    const updates: Record<string, any> = {}
    if (payload.email !== undefined) updates.email = payload.email
    if (payload.fullName !== undefined) updates.full_name = payload.fullName
    if (payload.province !== undefined) updates.province = payload.province
    if (payload.city !== undefined) updates.city = payload.city
    if (payload.bikePreferences !== undefined) updates.bike_preferences = payload.bikePreferences
    if (payload.avatarUrl !== undefined) updates.avatar_url = payload.avatarUrl
    if (payload.profileSlug !== undefined) updates.profile_slug = payload.profileSlug
    if (payload.preferredBike !== undefined) updates.preferred_bike = payload.preferredBike
    if (payload.instagramHandle !== undefined) updates.instagram_handle = payload.instagramHandle
    if (payload.facebookHandle !== undefined) updates.facebook_handle = payload.facebookHandle
    if (payload.websiteUrl !== undefined) updates.website_url = payload.websiteUrl
    if (payload.verified !== undefined) updates.verified = payload.verified
    if (payload.whatsapp !== undefined) updates.whatsapp_number = payload.whatsapp
    if (payload.storeEnabled !== undefined) updates.store_enabled = payload.storeEnabled
    if (payload.storeName !== undefined) updates.store_name = payload.storeName
    if (payload.storeSlug !== undefined) updates.store_slug = payload.storeSlug
    if (payload.storeAddress !== undefined) updates.store_address = payload.storeAddress
    if (payload.storePhone !== undefined) updates.store_phone = payload.storePhone
    if (payload.storeInstagram !== undefined) updates.store_instagram = payload.storeInstagram
    if (payload.storeFacebook !== undefined) updates.store_facebook = payload.storeFacebook
    if (payload.storeWebsite !== undefined) updates.store_website = payload.storeWebsite
    if (payload.storeBannerUrl !== undefined) updates.store_banner_url = payload.storeBannerUrl
    if (payload.storeBannerPositionY !== undefined) updates.store_banner_position_y = payload.storeBannerPositionY
    if (payload.storeAvatarUrl !== undefined) updates.store_avatar_url = payload.storeAvatarUrl

    const { data, error } = await supabase
      .from('users')
      .update(updates)
      .eq('id', payload.id)
      .select('id')

    if (error) return { success: false, error: error.message }
    if (data && data.length > 0) return { success: true }

    if (!payload.email || !payload.fullName || !payload.province || !payload.city) {
      // Not enough info to create a new profile
      return { success: false, error: 'Faltan datos para crear el perfil' }
    }

    const insertPayload = {
      id: payload.id,
      email: payload.email,
      full_name: payload.fullName,
      province: payload.province,
      city: payload.city,
      bike_preferences: payload.bikePreferences ?? [],
      profile_slug: payload.profileSlug ?? null,
      avatar_url: payload.avatarUrl ?? null,
      preferred_bike: payload.preferredBike ?? null,
      instagram_handle: payload.instagramHandle ?? null,
      facebook_handle: payload.facebookHandle ?? null,
      website_url: payload.websiteUrl ?? null,
      verified: payload.verified ?? false,
      whatsapp_number: payload.whatsapp ?? null,
      store_enabled: payload.storeEnabled ?? null,
      store_name: payload.storeName ?? null,
      store_slug: payload.storeSlug ?? null,
      store_address: payload.storeAddress ?? null,
      store_phone: payload.storePhone ?? null,
      store_instagram: payload.storeInstagram ?? null,
      store_facebook: payload.storeFacebook ?? null,
      store_website: payload.storeWebsite ?? null,
      store_banner_url: payload.storeBannerUrl ?? null,
      store_banner_position_y: payload.storeBannerPositionY ?? null,
      store_avatar_url: payload.storeAvatarUrl ?? null,
      created_at: new Date().toISOString()
    }
    const { error: insertError } = await supabase.from('users').insert(insertPayload)
    if (insertError) return { success: false, error: insertError.message }
    return { success: true }
  } catch (err: any) {
    return { success: false, error: err?.message ?? 'Error desconocido al guardar el perfil' }
  }
}

export async function fetchUserProfile(id: string): Promise<UserProfileRecord | null> {
  if (!supabaseEnabled) return null
  try {
    const supabase = getSupabaseClient()
    const { data, error } = await supabase.from('users').select('*').eq('id', id).maybeSingle()
    if (error || !data) return null
    return data as UserProfileRecord
  } catch {
    return null
  }
}

export async function fetchStoreProfileBySlug(slug: string): Promise<UserProfileRecord | null> {
  if (!supabaseEnabled) return null
  try {
    const supabase = getSupabaseClient()
    const { data, error } = await supabase
      .from('users')
      .select('*')
      .eq('store_slug', slug.toLowerCase())
      .eq('store_enabled', true)
      .maybeSingle()
    if (error || !data) return null
    return data as UserProfileRecord
  } catch {
    return null
  }
}

const API_BASE = (import.meta.env.VITE_API_BASE_URL || '').replace(/\/$/, '')

export async function fetchUserContactEmail(userId: string): Promise<string | null> {
  if (!userId) return null
  const endpoint = API_BASE ? `${API_BASE}/api/users/${userId}/contact-email` : `/api/users/${userId}/contact-email`
  const response = await fetch(endpoint)
  if (!response.ok) return null
  const data = await response.json().catch(() => null)
  const email = typeof data?.email === 'string' ? data.email.trim() : ''
  return email || null
}

export async function setUserVerificationStatus(id: string, verified: boolean): Promise<boolean> {
  if (!supabaseEnabled) return false
  try {
    const supabase = getSupabaseClient()
    const { error } = await supabase.from('users').update({ verified }).eq('id', id)
    return !error
  } catch (error) {
    console.warn('[users] setUserVerificationStatus failed', error)
    return false
  }
}

export async function fetchUserDisplayNames(userIds: string[]): Promise<Record<string, string>> {
  if (!supabaseEnabled) return {}
  const uniqueIds = Array.from(new Set(userIds.filter((id): id is string => Boolean(id))))
  if (uniqueIds.length === 0) return {}
  try {
    const supabase = getSupabaseClient()
    const { data, error } = await supabase
      .from('users')
      .select('id, full_name')
      .in('id', uniqueIds)

    if (error || !data) return {}

    return data.reduce<Record<string, string>>((acc, row: any) => {
      if (row?.id && typeof row.full_name === 'string' && row.full_name.trim()) {
        acc[row.id] = row.full_name.trim()
      }
      return acc
    }, {})
  } catch (err) {
    console.warn('[users] fetchUserDisplayNames failed', err)
    return {}
  }
}
