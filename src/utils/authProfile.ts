import type { User } from '@supabase/supabase-js'
import { getSupabaseClient, supabaseEnabled } from '../services/supabase'
import { createUserProfile, upsertUserProfile, type UserProfileInput } from '../services/users'
import { deriveProfileSlug, pickDiscipline } from './user'

type Metadata = Record<string, any>

function extractAvatar(metadata: Metadata): string | null {
  const candidates = [
    metadata?.avatar_url,
    metadata?.picture,
    metadata?.avatar,
    metadata?.avatarUrl,
    metadata?.photoURL,
    metadata?.photo_url,
  ]

  for (const url of candidates) {
    if (typeof url === 'string' && url.trim().length > 0) return url
  }
  return null
}

function extractFullName(metadata: Metadata, email?: string | null): string {
  const candidates = [
    metadata?.full_name,
    metadata?.name,
    metadata?.fullName,
    metadata?.display_name,
    metadata?.given_name && metadata?.family_name ? `${metadata.given_name} ${metadata.family_name}` : undefined,
    metadata?.given_name,
  ]
  for (const name of candidates) {
    if (typeof name === 'string' && name.trim().length > 1) return name.trim()
  }
  if (email) {
    const local = email.split('@')[0] ?? ''
    if (local) return local
  }
  return 'Ciclista'
}

export async function syncProfileFromAuthUser(user: User | null): Promise<void> {
  if (!supabaseEnabled || !user) return
  try {
    const client = getSupabaseClient()
    const { data: existing } = await client
      .from('users')
      .select('id, avatar_url, full_name, province, city, profile_slug, bike_preferences')
      .eq('id', user.id)
      .maybeSingle()

    const metadata: Metadata = user.user_metadata ?? {}
    const avatarUrl = extractAvatar(metadata)
    const fullName = extractFullName(metadata, user.email)
    const discipline = pickDiscipline(
      Array.isArray(metadata?.bike_preferences) ? metadata.bike_preferences : []
    )
    const fallback = user.email?.split('@')[0] ?? user.id.substring(0, 6)
    const profileSlug =
      existing?.profile_slug ??
      deriveProfileSlug({
        fullName,
        discipline,
        fallback,
      })

    if (existing) {
      const updates: Partial<UserProfileInput> & { id: string } = { id: user.id }
      let shouldUpdate = false
      if (!existing.full_name && fullName) {
        updates.fullName = fullName
        shouldUpdate = true
      }
      if (avatarUrl && avatarUrl !== existing.avatar_url) {
        updates.avatarUrl = avatarUrl
        shouldUpdate = true
      }
      if (!existing.profile_slug && profileSlug) {
        updates.profileSlug = profileSlug
        shouldUpdate = true
      }
      if (
        Array.isArray(metadata?.bike_preferences) &&
        (!Array.isArray(existing.bike_preferences) ||
          metadata.bike_preferences.join(',') !== existing.bike_preferences.join(','))
      ) {
        updates.bikePreferences = metadata.bike_preferences
        shouldUpdate = true
      }
      if (shouldUpdate) {
        await upsertUserProfile(updates)
      }
      return
    }

    if (!user.email) return

    await createUserProfile({
      id: user.id,
      email: user.email,
      fullName,
      province: metadata?.province ?? '',
      city: metadata?.city ?? '',
      bikePreferences: Array.isArray(metadata?.bike_preferences) ? metadata.bike_preferences : [],
      avatarUrl: avatarUrl ?? undefined,
      profileSlug,
      preferredBike: metadata?.preferred_bike ?? null,
      instagramHandle: metadata?.instagram_handle ?? null,
      facebookHandle: metadata?.facebook_handle ?? null,
      websiteUrl: metadata?.website_url ?? null,
      whatsapp: metadata?.whatsapp_number ?? metadata?.whatsapp ?? null,
      verified: Boolean(metadata?.verified),
    })
  } catch (err) {
    console.warn('[auth] syncProfileFromAuthUser failed', err)
  }
}
