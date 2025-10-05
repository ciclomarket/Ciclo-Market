import { supabase, supabaseAvatarBucket, supabaseEnabled } from './supabase'

function sanitizeFileName(name: string): string {
  return name.replace(/[^a-zA-Z0-9_.-]/g, '_')
}

export async function uploadAvatar(file: File, userId: string): Promise<string | null> {
  if (!supabaseEnabled || !supabase) return null
  const safeName = sanitizeFileName(file.name)
  const key = `${userId}/${Date.now()}_${safeName}`
  const storage = supabase.storage.from(supabaseAvatarBucket)
  const { error: uploadError } = await storage.upload(key, file, {
    cacheControl: '3600',
    contentType: file.type || 'image/jpeg',
    upsert: true
  })
  if (uploadError) throw uploadError
  const { data } = storage.getPublicUrl(key)
  return data?.publicUrl ?? null
}
