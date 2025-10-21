import { createContext, useCallback, useContext, useEffect, useMemo, useState } from 'react'
import type { User } from '@supabase/supabase-js'
import { getSupabaseClient, setAuthPersistence, supabaseEnabled } from '@app/services/supabase'

type AdminRole = 'user' | 'moderator' | 'admin'

interface AdminAuthContextValue {
  user: User | null
  loading: boolean
  role: AdminRole
  isModerator: boolean
  signIn: (email: string, password: string) => Promise<void>
  signOut: () => Promise<void>
  error: string | null
}

const AdminAuthContext = createContext<AdminAuthContextValue | undefined>(undefined)

async function fetchRole(user: User | null): Promise<AdminRole> {
  if (!user || !supabaseEnabled) return 'user'
  try {
    const client = getSupabaseClient()
    const { data, error } = await client
      .from('user_roles')
      .select('role')
      .eq('user_id', user.id)
      .maybeSingle()
    if (error) {
      console.warn('[admin-auth] role lookup failed', error)
      return 'user'
    }
    if (data?.role === 'moderator' || data?.role === 'admin') {
      return data.role
    }
    return 'user'
  } catch (err) {
    console.warn('[admin-auth] role fetch exception', err)
    return 'user'
  }
}

export function AdminAuthProvider({ children }: { children: React.ReactNode }) {
  const [user, setUser] = useState<User | null>(null)
  const [loading, setLoading] = useState(true)
  const [role, setRole] = useState<AdminRole>('user')
  const [error, setError] = useState<string | null>(null)

  useEffect(() => {
    if (!supabaseEnabled) {
      setLoading(false)
      setRole('user')
      return
    }
    const client = getSupabaseClient()
    let mounted = true

    const init = async () => {
      try {
        const { data } = await client.auth.getSession()
        const sessionUser = data.session?.user ?? null
        if (!mounted) return
        setUser(sessionUser)
        const fetchedRole = await fetchRole(sessionUser)
        if (!mounted) return
        setRole(fetchedRole)
      } finally {
        if (mounted) setLoading(false)
      }
    }

    void init()

    const { data } = client.auth.onAuthStateChange(async (_event, session) => {
      const nextUser = session?.user ?? null
      setUser(nextUser)
      // Esperar a tener el rol antes de marcar loading=false para evitar rebotes
      setLoading(true)
      const fetchedRole = await fetchRole(nextUser)
      setRole(fetchedRole)
      setLoading(false)
    })

    return () => {
      mounted = false
      data.subscription.unsubscribe()
    }
  }, [])

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
    isModerator: role === 'moderator' || role === 'admin',
    signIn,
    signOut,
    error,
  }), [user, loading, role, signIn, signOut, error])

  return <AdminAuthContext.Provider value={value}>{children}</AdminAuthContext.Provider>
}

export function useAdminAuth(): AdminAuthContextValue {
  const ctx = useContext(AdminAuthContext)
  if (!ctx) {
    throw new Error('useAdminAuth debe usarse dentro de un AdminAuthProvider')
  }
  return ctx
}
