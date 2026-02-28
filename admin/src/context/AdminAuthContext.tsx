import { createContext, useCallback, useContext, useEffect, useMemo, useRef, useState } from 'react'
import type { User } from '@supabase/supabase-js'
import { getSupabaseClient, supabaseEnabled } from '@app/services/supabase'

type AdminRole = 'user' | 'moderator' | 'admin'
type RoleStatus = 'unknown' | 'known' | 'error'

interface AdminAuthContextValue {
  user: User | null
  loading: boolean
  role: AdminRole
  roleStatus: RoleStatus
  isModerator: boolean
  refreshRole: () => Promise<void>
  signIn: (email: string, password: string) => Promise<void>
  signOut: () => Promise<void>
  error: string | null
}

const AdminAuthContext = createContext<AdminAuthContextValue | undefined>(undefined)
const ROLE_CACHE_KEY = 'mb_admin_role_cache_v1'

type RoleCache = {
  userId: string
  role: AdminRole
  ts: number
}

async function withTimeout<T>(promise: Promise<T>, ms: number): Promise<T> {
  let timeoutId: ReturnType<typeof setTimeout>
  const timeoutPromise = new Promise<never>((_, reject) => {
    timeoutId = setTimeout(() => reject(new Error('timeout')), ms)
  })
  try {
    return await Promise.race([promise, timeoutPromise])
  } finally {
    clearTimeout(timeoutId!)
  }
}

function sleep(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms))
}

function readRoleCache(userId: string): AdminRole | null {
  if (typeof window === 'undefined') return null
  try {
    const raw = window.localStorage.getItem(ROLE_CACHE_KEY)
    if (!raw) return null
    const parsed = JSON.parse(raw) as Partial<RoleCache>
    if (!parsed || typeof parsed !== 'object') return null
    if (parsed.userId !== userId) return null
    const role = String(parsed.role || '').toLowerCase()
    return role === 'admin' || role === 'moderator' ? (role as AdminRole) : 'user'
  } catch {
    return null
  }
}

function writeRoleCache(userId: string, role: AdminRole) {
  if (typeof window === 'undefined') return
  try {
    const payload: RoleCache = { userId, role, ts: Date.now() }
    window.localStorage.setItem(ROLE_CACHE_KEY, JSON.stringify(payload))
  } catch { /* noop */ }
}

async function fetchRole(user: User | null, signal?: AbortSignal): Promise<AdminRole> {
  if (!user || !supabaseEnabled) return 'user'
  
  // Usar cache inmediatamente si existe
  const cached = readRoleCache(user.id)
  
  try {
    const client = getSupabaseClient()
    
    // Timeout más agresivo: 4 segundos máximo
    const roleResponse = await withTimeout(
      client.rpc('admin_get_my_role') as unknown as Promise<{ data: string | null; error: { message?: string } | null }>,
      4000
    )
    
    if (signal?.aborted) return cached ?? 'user'
    
    if (!roleResponse.error && roleResponse.data) {
      const role = String(roleResponse.data).toLowerCase()
      return role === 'admin' || role === 'moderator' ? (role as AdminRole) : 'user'
    }
  } catch (err) {
    if (import.meta.env.DEV) {
      console.warn('[admin-auth] role fetch failed, using cache', err)
    }
  }
  
  // Fallback a cache o 'user'
  return cached ?? 'user'
}

export function AdminAuthProvider({ children }: { children: React.ReactNode }) {
  const [user, setUser] = useState<User | null>(null)
  const [loading, setLoading] = useState(true)
  const [role, setRole] = useState<AdminRole>('user')
  const [roleStatus, setRoleStatus] = useState<RoleStatus>('unknown')
  const [error, setError] = useState<string | null>(null)
  const userRef = useRef<User | null>(null)

  useEffect(() => {
    userRef.current = user
  }, [user])

  useEffect(() => {
    if (!supabaseEnabled) {
      setLoading(false)
      setRole('user')
      setRoleStatus('known')
      return
    }
    const client = getSupabaseClient()
    let mounted = true

    const refreshRole = async (sessionUser: User | null, useCache = false) => {
      if (!sessionUser) {
        setRole('user')
        setRoleStatus('known')
        return
      }
      
      // Si hay cache y se permite usarlo, aplicarlo inmediatamente
      if (useCache) {
        const cached = readRoleCache(sessionUser.id)
        if (cached) {
          setRole(cached)
          setRoleStatus('known')
        }
      }
      
      try {
        const fetchedRole = await fetchRole(sessionUser)
        if (!mounted) return
        setRole(fetchedRole)
        setRoleStatus('known')
        writeRoleCache(sessionUser.id, fetchedRole)
      } catch (err) {
        if (!mounted) return
        console.warn('[admin-auth] refresh role failed', err)
        // No marcar como error si tenemos cache
        const cached = readRoleCache(sessionUser.id)
        if (!cached) setRoleStatus('error')
      }
    }

    const init = async () => {
      try {
        const sessionResponse = await client.auth.getSession()
        const { data, error } = sessionResponse as Awaited<ReturnType<typeof client.auth.getSession>>
        const sessionUser = data.session?.user ?? null
        if (!mounted) return
        setUser(sessionUser)
        
        if (sessionUser) {
          const cached = readRoleCache(sessionUser.id)
          if (cached) {
            // ✅ Cache hit: mostrar panel INMEDIATAMENTE
            setRole(cached)
            setRoleStatus('known')
          } else {
            // Sin cache: provisionalmente 'user', refrescar en background
            setRole('user')
            setRoleStatus('unknown')
          }
        } else {
          setRole('user')
          setRoleStatus('known')
        }
        
        if (error) {
          setError('No pudimos validar la sesión. Verificá la conexión a Supabase.')
        }
      } catch (err) {
        console.warn('[admin-auth] session init failed', err)
        setError('No pudimos validar la sesión. Verificá la conexión a Supabase.')
        setRoleStatus('error')
      } finally {
        // 🔥 Importante: siempre dejar de cargar rápido
        if (mounted) setLoading(false)
      }
    }

    void init()
    // Refresh role in background; never block the whole Admin on this.
    void client.auth.getSession()
      .then((sessionResponse) => {
        const sessionUser = (sessionResponse as Awaited<ReturnType<typeof client.auth.getSession>>).data.session?.user ?? null
        // useCache=true para no bloquear si ya tenemos datos
        return refreshRole(sessionUser, true)
      })
      .catch(() => {})

    const { data } = client.auth.onAuthStateChange(async (event, session) => {
      const nextUser = session?.user ?? null
      const prevUser = userRef.current
      setUser(nextUser)

      const userChanged = (prevUser?.id ?? null) !== (nextUser?.id ?? null)
      // Ignore noisy auth events (TOKEN_REFRESHED, USER_UPDATED) to avoid global "Cargando panel…"
      // flashes when the tab regains focus or Supabase refreshes tokens in the background.
      if (!userChanged && (event === 'TOKEN_REFRESHED' || event === 'USER_UPDATED')) {
        return
      }
      if (!userChanged) {
        return
      }

      if (userChanged) {
        setLoading(true)
      }

      setRoleStatus(nextUser ? 'unknown' : 'known')
      if (nextUser) {
        const cached = readRoleCache(nextUser.id)
        if (cached) {
          setRole(cached)
          setRoleStatus('known')
        } else {
          setRole('user')
        }
      } else {
        setRole('user')
      }
      await refreshRole(nextUser)
      if (userChanged) setLoading(false)
    })

    const maybeRefresh = async () => {
      if (!mounted) return
      if (typeof document !== 'undefined' && document.visibilityState !== 'visible') return
      try {
        const sessionResponse = await client.auth.getSession()
        const sessionUser = (sessionResponse as Awaited<ReturnType<typeof client.auth.getSession>>).data.session?.user ?? null
        if (!mounted) return
        if (!sessionUser) return
        await refreshRole(sessionUser)
      } catch { /* noop */ }
    }

    window.addEventListener('focus', maybeRefresh)
    document.addEventListener('visibilitychange', maybeRefresh)

    return () => {
      mounted = false
      window.removeEventListener('focus', maybeRefresh)
      document.removeEventListener('visibilitychange', maybeRefresh)
      data.subscription.unsubscribe()
    }
  }, [])

  const refreshRole = useCallback(async () => {
    if (!supabaseEnabled) return
    // No cambiar a 'unknown' para no mostrar loading
    const fetchedRole = await fetchRole(user)
    setRole(fetchedRole)
    setRoleStatus('known')
    if (user) writeRoleCache(user.id, fetchedRole)
  }, [user])

  const signIn = useCallback(async (email: string, password: string) => {
    if (!supabaseEnabled) throw new Error('Supabase no está configurado')
    const client = getSupabaseClient()
    setError(null)
    // Para el admin, persistimos siempre en localStorage sin recrear el cliente
    if (typeof window !== 'undefined') window.localStorage.setItem('mb_auth_persist', 'local')
    const op = client.auth.signInWithPassword({ email: email.trim(), password })
    // Timeout defensivo para evitar quedarse en “Ingresando…” si hay problemas de red/CORS
    const { error: authError } = await Promise.race([
      op,
      new Promise<{ error: { message: string } }>((resolve) =>
        setTimeout(() => resolve({ error: { message: 'timeout_auth' } }), 15000)
      ),
    ])
    if (authError) {
      const message = authError.message === 'timeout_auth'
        ? 'No pudimos contactar Supabase. Verificá tu conexión y la configuración de URLs.'
        : (authError.message ?? 'No pudimos iniciar sesión')
      setError(message)
      throw authError
    }

    // Best-effort: warm role cache immediately after login to avoid later gating flicker.
    try {
      const sessionResponse = await client.auth.getSession()
      const sessionUser = (sessionResponse as Awaited<ReturnType<typeof client.auth.getSession>>).data.session?.user ?? null
      if (sessionUser) {
        const fetchedRole = await fetchRole(sessionUser)
        writeRoleCache(sessionUser.id, fetchedRole)
      }
    } catch { /* noop */ }
  }, [])

  const signOut = useCallback(async () => {
    if (!supabaseEnabled) return
    const client = getSupabaseClient()
    await client.auth.signOut()
    setUser(null)
    setRole('user')
  }, [])

  const value = useMemo<AdminAuthContextValue>(() => ({
    user,
    loading,
    role,
    roleStatus,
    isModerator: role === 'moderator' || role === 'admin',
    refreshRole,
    signIn,
    signOut,
    error,
  }), [user, loading, role, roleStatus, refreshRole, signIn, signOut, error])

  return <AdminAuthContext.Provider value={value}>{children}</AdminAuthContext.Provider>
}

export function useAdminAuth(): AdminAuthContextValue {
  const ctx = useContext(AdminAuthContext)
  if (!ctx) {
    throw new Error('useAdminAuth debe usarse dentro de un AdminAuthProvider')
  }
  return ctx
}
