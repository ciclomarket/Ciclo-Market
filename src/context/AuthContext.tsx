// src/context/AuthContext.tsx
import { createContext, useContext, useEffect, useState } from 'react'
import type { User } from '@supabase/supabase-js'
import { supabase, supabaseEnabled, getSupabaseClient } from '../services/supabase'

interface Ctx {
  user: User | null
  loading: boolean
  logout: () => Promise<void>
  enabled: boolean
  role: 'user' | 'moderator' | 'admin'
  isModerator: boolean
}

const AuthContext = createContext<Ctx>({
  user: null,
  loading: true,
  logout: async () => {},
  enabled: supabaseEnabled,
  role: 'user',
  isModerator: false
})

export function AuthProvider({ children }: { children: React.ReactNode }) {
  const [user, setUser] = useState<User | null>(null)
  const [loading, setLoading] = useState(true)
  const [role, setRole] = useState<'user' | 'moderator' | 'admin'>('user')
  const [roleLoading, setRoleLoading] = useState(true)

  const loadRole = async (userId: string | null) => {
    if (!supabaseEnabled || !supabase) {
      setRole('user')
      setRoleLoading(false)
      return
    }
    if (!userId) {
      setRole('user')
      setRoleLoading(false)
      return
    }
    try {
      setRoleLoading(true)
      const client = getSupabaseClient()
      const { data, error } = await client
        .from('user_roles')
        .select('role')
        .eq('user_id', userId)
        .maybeSingle()
      if (error) {
        console.warn('[auth] role fetch error', error)
        setRole('user')
        setRoleLoading(false)
        return
      }
      if (data?.role === 'moderator' || data?.role === 'admin') {
        setRole(data.role)
      } else {
        setRole('user')
      }
    } catch (err) {
      console.warn('[auth] role fetch failed', err)
      setRole('user')
    } finally {
      setRoleLoading(false)
    }
  }

  useEffect(() => {
    if (!supabaseEnabled || !supabase) {
      setLoading(false)
      setRole('user')
      setRoleLoading(false)
      return
    }
    const client = supabase
    const init = async () => {
      const { data } = await client.auth.getSession()
      const sessionUser = data.session?.user ?? null
      setUser(sessionUser)
      await loadRole(sessionUser?.id ?? null)
      setLoading(false)
    }
    init()

    const { data } = client.auth.onAuthStateChange((_event, session) => {
      const newUser = session?.user ?? null
      setUser(newUser)
      setLoading(false)
      void loadRole(newUser?.id ?? null)
    })
    return () => {
      data.subscription.unsubscribe()
    }
  }, [])

  const logout = async () => {
    if (supabaseEnabled && supabase) {
      await supabase.auth.signOut()
      setUser(null)
      setRole('user')
    }
  }

  return (
    <AuthContext.Provider
      value={{
        user,
        loading: loading || roleLoading,
        logout,
        enabled: supabaseEnabled,
        role,
        isModerator: role === 'moderator' || role === 'admin'
      }}
    >
      {children}
    </AuthContext.Provider>
  )
}

export const useAuth = () => useContext(AuthContext)
