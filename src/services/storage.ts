import { supabase, supabaseAvatarBucket, supabaseEnabled } from './supabase'
import { compressToWebp } from '../utils/image'

function sanitizeFileName(name: string): string {
  return name.replace(/[^a-zA-Z0-9_.-]/g, '_')
}

export async function uploadAvatar(file: File, userId: string): Promise<string | null> {
  if (!supabaseEnabled || !supabase) return null
  // Avatar pequeño, WebP con buen balance
  const webp = await compressToWebp(file, { maxWidth: 512, maxHeight: 512, quality: 0.82 })
  const safeName = sanitizeFileName(webp.name)
  const key = `${userId}/${Date.now()}_${safeName}`
  const storage = supabase.storage.from(supabaseAvatarBucket)
  const { error: uploadError } = await storage.upload(key, webp, {
    cacheControl: '31536000',
    contentType: webp.type || file.type || 'image/webp',
    upsert: true
  })
  if (uploadError) throw uploadError
  const { data } = storage.getPublicUrl(key)
  return data?.publicUrl ?? null
}

export async function uploadStoreBanner(file: File, userId: string): Promise<string | null> {
  if (!supabaseEnabled || !supabase) return null
  // Banner ancho, WebP 1600px
  const webp = await compressToWebp(file, { maxWidth: 1600, maxHeight: 1600, quality: 0.8 })
  const safeName = sanitizeFileName(webp.name)
  const key = `banners/${userId}/${Date.now()}_${safeName}`
  const storage = supabase.storage.from(supabaseAvatarBucket)
  const { error: uploadError } = await storage.upload(key, webp, {
    cacheControl: '31536000',
    contentType: webp.type || file.type || 'image/webp',
    upsert: true
  })
  if (uploadError) throw uploadError
  const { data } = storage.getPublicUrl(key)
  return data?.publicUrl ?? null
}

export async function uploadStoreAvatar(file: File, userId: string): Promise<string | null> {
  if (!supabaseEnabled || !supabase) return null
  // Logo/Avatar tienda, cuadrado 512px WebP
  const webp = await compressToWebp(file, { maxWidth: 512, maxHeight: 512, quality: 0.85 })
  const safeName = sanitizeFileName(webp.name)
  const key = `stores/${userId}/avatar_${Date.now()}_${safeName}`
  const storage = supabase.storage.from(supabaseAvatarBucket)
  const { error: uploadError } = await storage.upload(key, webp, {
    cacheControl: '31536000',
    contentType: webp.type || file.type || 'image/webp',
    upsert: true
  })
  if (uploadError) throw uploadError
  const { data } = storage.getPublicUrl(key)
  return data?.publicUrl ?? null
}
