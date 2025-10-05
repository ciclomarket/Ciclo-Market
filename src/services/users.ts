import { getSupabaseClient, supabaseEnabled } from './supabase'

export interface UserProfileInput {
  id: string
  email: string
  username: string
  fullName: string
  province: string
  city: string
  bikePreferences: string[]
  avatarUrl?: string
}

export interface UserProfileRecord {
  id: string
  email: string
  username: string
  full_name?: string | null
  province?: string | null
  city?: string | null
  bike_preferences?: string[] | null
  created_at?: string | null
  avatar_url?: string | null
}

export async function createUserProfile(payload: UserProfileInput): Promise<boolean> {
  if (!supabaseEnabled) return false
  try {
    const supabase = getSupabaseClient()
    const { error } = await supabase.from('users').insert({
      id: payload.id,
      email: payload.email,
      username: payload.username,
      full_name: payload.fullName,
      province: payload.province,
      city: payload.city,
      bike_preferences: payload.bikePreferences,
      avatar_url: payload.avatarUrl ?? null,
      created_at: new Date().toISOString()
    })
    return !error
  } catch {
    return false
  }
}

export async function upsertUserProfile(payload: Partial<UserProfileInput> & { id: string }): Promise<boolean> {
  if (!supabaseEnabled) return false
  try {
    const supabase = getSupabaseClient()
    const updates: Record<string, any> = {
      updated_at: new Date().toISOString()
    }
    if (payload.email !== undefined) updates.email = payload.email
    if (payload.username !== undefined) updates.username = payload.username
    if (payload.fullName !== undefined) updates.full_name = payload.fullName
    if (payload.province !== undefined) updates.province = payload.province
    if (payload.city !== undefined) updates.city = payload.city
    if (payload.bikePreferences !== undefined) updates.bike_preferences = payload.bikePreferences
    if (payload.avatarUrl !== undefined) updates.avatar_url = payload.avatarUrl

    const { data, error } = await supabase
      .from('users')
      .update(updates)
      .eq('id', payload.id)
      .select('id')

    if (error) return false
    if (data && data.length > 0) return true

    if (!payload.email || !payload.username || !payload.fullName || !payload.province || !payload.city) {
      // Not enough info to create a new profile
      return false
    }

    const insertPayload = {
      id: payload.id,
      email: payload.email,
      username: payload.username,
      full_name: payload.fullName,
      province: payload.province,
      city: payload.city,
      bike_preferences: payload.bikePreferences ?? [],
      avatar_url: payload.avatarUrl ?? null,
      created_at: new Date().toISOString()
    }
    const { error: insertError } = await supabase.from('users').insert(insertPayload)
    return !insertError
  } catch {
    return false
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
