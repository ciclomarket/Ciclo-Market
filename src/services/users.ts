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
