import { useEffect, useState } from 'react'
import { Navigate, useLocation } from 'react-router-dom'
import { useAuth } from '../context/AuthContext'
import { getSupabaseClient, supabaseEnabled } from '../services/supabase'

export default function ProtectedRoute({ children }: { children: JSX.Element }) {
  const { user, loading, enabled } = useAuth()
  const loc = useLocation()
  const [checking, setChecking] = useState(false)
  const [emailVerified, setEmailVerified] = useState<boolean | null>(null)

  const isUserVerified = (maybeUser: typeof user): boolean => {
    if (!maybeUser) return false
    if (maybeUser.email_confirmed_at) return true
    // Algunos providers devuelven confirmed_at en lugar de email_confirmed_at
    if ((maybeUser as any).confirmed_at) return true

    const provider = maybeUser.app_metadata?.provider
    const providers = maybeUser.app_metadata?.providers

    if (provider && provider !== 'email') return true
    if (Array.isArray(providers) && providers.some((p) => p && p !== 'email')) return true

    return false
  }

  useEffect(() => {
    let active = true
    const verify = async () => {
      if (!enabled) {
        setEmailVerified(true)
        return
      }
      if (!user) {
        setEmailVerified(false)
        return
      }
      if (isUserVerified(user)) {
        setEmailVerified(true)
        return
      }
      if (!supabaseEnabled) {
        setEmailVerified(false)
        return
      }
      try {
        setChecking(true)
        const supabase = getSupabaseClient()
        const { data, error } = await supabase.auth.getUser()
        if (!active) return
        if (error) throw error
        const verified = isUserVerified(data.user as typeof user)
        setEmailVerified(verified)
      } catch {
        if (active) setEmailVerified(false)
      } finally {
        if (active) setChecking(false)
      }
    }
    verify()
    return () => { active = false }
  }, [user])

  if (loading) return <div className="container py-10">Cargando…</div>
  if (!enabled) return children
  if (!user) return <Navigate to="/login" state={{ from: loc }} replace />
  if (checking || emailVerified === null) return <div className="container py-10">Verificando cuenta…</div>
  if (!emailVerified) return <Navigate to="/verificar-email" state={{ from: loc }} replace />
  return children
}
