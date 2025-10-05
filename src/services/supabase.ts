import { createClient, type SupabaseClient } from '@supabase/supabase-js'

const supabaseUrl = import.meta.env.VITE_SUPABASE_URL || ''
const supabaseAnonKey = import.meta.env.VITE_SUPABASE_ANON_KEY || ''

export const supabaseEnabled = Boolean(supabaseUrl && supabaseAnonKey)

export const supabase: SupabaseClient | null = supabaseEnabled
  ? createClient(supabaseUrl, supabaseAnonKey, {
      auth: {
        persistSession: true,
        detectSessionInUrl: true
      }
    })
  : null

export const supabaseStorageBucket = import.meta.env.VITE_SUPABASE_STORAGE_BUCKET || 'listings'
export const supabaseAvatarBucket = import.meta.env.VITE_SUPABASE_AVATAR_BUCKET || 'avatars'

export function getSupabaseClient(): SupabaseClient {
  if (!supabaseEnabled || !supabase) {
    throw new Error('Supabase no configurado. Definí VITE_SUPABASE_URL y VITE_SUPABASE_ANON_KEY en .env.local')
  }
  return supabase
}
