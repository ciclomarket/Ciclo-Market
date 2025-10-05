// src/context/AuthContext.tsx
import { createContext, useContext, useEffect, useState } from 'react'
import type { User } from '@supabase/supabase-js'
import { supabase, supabaseEnabled } from '../services/supabase'

interface Ctx {
  user: User | null
  loading: boolean
  logout: () => Promise<void>
  enabled: boolean
}

const AuthContext = createContext<Ctx>({
  user: null,
  loading: true,
  logout: async () => {},
  enabled: supabaseEnabled
})

export function AuthProvider({ children }: { children: React.ReactNode }) {
  const [user, setUser] = useState<User | null>(null)
  const [loading, setLoading] = useState(true)

  useEffect(() => {
    if (!supabaseEnabled || !supabase) {
      setLoading(false)
      return
    }
    const client = supabase
    const init = async () => {
      const { data } = await client.auth.getSession()
      setUser(data.session?.user ?? null)
      setLoading(false)
    }
    init()

    const { data } = client.auth.onAuthStateChange((_event, session) => {
      setUser(session?.user ?? null)
      setLoading(false)
    })
    return () => {
      data.subscription.unsubscribe()
    }
  }, [])

  const logout = async () => {
    if (supabaseEnabled && supabase) {
      await supabase.auth.signOut()
      setUser(null)
    }
  }

  return (
    <AuthContext.Provider value={{ user, loading, logout, enabled: supabaseEnabled }}>
      {children}
    </AuthContext.Provider>
  )
}

export const useAuth = () => useContext(AuthContext)
