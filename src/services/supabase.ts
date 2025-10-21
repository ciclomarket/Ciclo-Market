import { createClient, type SupabaseClient } from '@supabase/supabase-js'

const supabaseUrl = import.meta.env.VITE_SUPABASE_URL || ''
const supabaseAnonKey = import.meta.env.VITE_SUPABASE_ANON_KEY || ''
const appScope = import.meta.env.VITE_APP_SCOPE || 'web'
const AUTH_STORAGE_KEY = appScope === 'admin' ? 'mb_admin_auth' : 'mb_web_auth'

export const supabaseEnabled = Boolean(supabaseUrl && supabaseAnonKey)

// Persist preference key. 'local' means localStorage (mantenerme conectado), 'session' means sessionStorage
const PERSIST_KEY = 'mb_auth_persist'
type PersistMode = 'local' | 'session'

function getPersistMode(): PersistMode {
  if (typeof window === 'undefined') return 'local'
  const v = window.localStorage.getItem(PERSIST_KEY)
  return v === 'session' ? 'session' : 'local'
}

function resolveStorage(): Storage {
  if (typeof window === 'undefined') {
    // Fallback in non-browser contexts (e.g. SSR) con un storage en memoria
    const mem = new Map<string, string>()
    const fallbackStorage: Storage = {
      get length() {
        return mem.size
      },
      clear() {
        mem.clear()
      },
      getItem(key) {
        return mem.has(key) ? (mem.get(key) as string) : null
      },
      key(index) {
        return Array.from(mem.keys())[index] ?? null
      },
      removeItem(key) {
        mem.delete(key)
      },
      setItem(key, value) {
        mem.set(key, value)
      },
    }
    return fallbackStorage
  }
  return getPersistMode() === 'session' ? window.sessionStorage : window.localStorage
}

let supabase: SupabaseClient | null = null

function createSupabase(): SupabaseClient {
  return createClient(supabaseUrl, supabaseAnonKey, {
    auth: {
      persistSession: true,
      autoRefreshToken: true,
      detectSessionInUrl: true,
      storageKey: AUTH_STORAGE_KEY,
      storage: resolveStorage(),
    },
  })
}

// Initialize immediately if enabled
if (supabaseEnabled) {
  supabase = createSupabase()
}

export const supabaseStorageBucket = import.meta.env.VITE_SUPABASE_STORAGE_BUCKET || 'listings'
export const supabaseAvatarBucket = import.meta.env.VITE_SUPABASE_AVATAR_BUCKET || 'avatars'

export function getSupabaseClient(): SupabaseClient {
  if (!supabaseEnabled || !supabase) {
    throw new Error('Supabase no configurado. Definí VITE_SUPABASE_URL y VITE_SUPABASE_ANON_KEY en .env.local')
  }
  return supabase
}

/**
 * Define la persistencia de la sesión: true = localStorage (persistente), false = sessionStorage (hasta cerrar navegador)
 * Debe llamarse ANTES de iniciar sesión (email/contraseña o OAuth) para que se aplique al almacenamiento del token.
 */
export function setAuthPersistence(remember: boolean): void {
  if (typeof window === 'undefined') return
  const mode: PersistMode = remember ? 'local' : 'session'
  window.localStorage.setItem(PERSIST_KEY, mode)
  // En el panel admin evitamos recrear el cliente para no generar múltiples GoTrueClient en el mismo contexto
  if (import.meta.env.VITE_APP_SCOPE === 'admin') return
  if (supabaseEnabled) supabase = createSupabase()
}

export { supabase }
