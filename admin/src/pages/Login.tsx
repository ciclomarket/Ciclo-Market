import { FormEvent, useEffect, useState } from 'react'
import { useLocation, useNavigate } from 'react-router-dom'
import { useAdminAuth } from '@admin/context/AdminAuthContext'
import { supabaseEnabled } from '@app/services/supabase'
import { FullScreenMessage } from '@admin/components/FullScreenMessage'

export default function LoginPage() {
  const { user, isModerator, signIn, error } = useAdminAuth()
  const [email, setEmail] = useState('')
  const [password, setPassword] = useState('')
  const [submitting, setSubmitting] = useState(false)
  const [localError, setLocalError] = useState<string | null>(null)
  const navigate = useNavigate()
  const location = useLocation() as { state?: { from?: Location } }

  const redirectTo = location.state?.from ? (location.state.from as any).pathname ?? '/' : '/'

  useEffect(() => {
    if (supabaseEnabled && user && isModerator) {
      navigate(redirectTo, { replace: true })
    }
  }, [user, isModerator, redirectTo, navigate])

  if (!supabaseEnabled) {
    return (
      <FullScreenMessage
        title="Panel deshabilitado"
        message="Definí las variables VITE_SUPABASE_URL y VITE_SUPABASE_ANON_KEY para activar el acceso."
      />
    )
  }

  const onSubmit = async (event: FormEvent) => {
    event.preventDefault()
    setLocalError(null)
    if (!email.trim() || !password) {
      setLocalError('Ingresá email y contraseña')
      return
    }
    try {
      setSubmitting(true)
      await signIn(email, password)
      navigate(redirectTo, { replace: true })
    } catch (err: any) {
      const message = err?.message ?? 'No pudimos iniciar sesión'
      setLocalError(message)
    } finally {
      setSubmitting(false)
    }
  }

  return (
    <div
      style={{
        minHeight: '100vh',
        display: 'grid',
        placeItems: 'center',
        background: 'radial-gradient(circle at 20% 20%, rgba(97,223,255,0.18), transparent 55%), #06101b',
        padding: '2rem',
      }}
    >
      <form
        onSubmit={onSubmit}
        style={{
          width: '100%',
          maxWidth: '420px',
          background: 'rgba(12, 23, 35, 0.9)',
          borderRadius: '28px',
          padding: '2.5rem',
          boxShadow: '0 22px 65px rgba(4, 9, 15, 0.55)',
          border: '1px solid rgba(255,255,255,0.08)',
        }}
      >
        <div style={{ marginBottom: '1.75rem' }}>
          <p style={{ textTransform: 'uppercase', letterSpacing: '0.4em', fontSize: '0.68rem', color: '#6fbff5' }}>
            CicloMarket
          </p>
          <h1 style={{ margin: '0.3rem 0', fontSize: '1.8rem', color: '#f2f6fb' }}>Panel moderador</h1>
          <p style={{ color: '#8ea0b3', fontSize: '0.92rem', lineHeight: 1.55 }}>
            Accedé con tu cuenta de moderador o administrador para gestionar el marketplace.
          </p>
        </div>

        <label style={{ display: 'block', marginBottom: '1.1rem' }}>
          <span style={{ fontSize: '0.75rem', fontWeight: 600, color: '#9fb3c9', letterSpacing: '0.12em' }}>Email</span>
          <input
            value={email}
            onChange={(e) => setEmail(e.target.value)}
            type="email"
            placeholder="moderador@ciclomarket.ar"
            style={{
              width: '100%',
              marginTop: '0.5rem',
              padding: '0.75rem 0.9rem',
              borderRadius: '14px',
              border: '1px solid rgba(255,255,255,0.08)',
              backgroundColor: 'rgba(19,35,55,0.55)',
              color: '#f2f6fb',
            }}
            autoComplete="email"
          />
        </label>

        <label style={{ display: 'block', marginBottom: '1.25rem' }}>
          <span style={{ fontSize: '0.75rem', fontWeight: 600, color: '#9fb3c9', letterSpacing: '0.12em' }}>Contraseña</span>
          <input
            value={password}
            onChange={(e) => setPassword(e.target.value)}
            type="password"
            placeholder="••••••••"
            style={{
              width: '100%',
              marginTop: '0.5rem',
              padding: '0.75rem 0.9rem',
              borderRadius: '14px',
              border: '1px solid rgba(255,255,255,0.08)',
              backgroundColor: 'rgba(19,35,55,0.55)',
              color: '#f2f6fb',
            }}
            autoComplete="current-password"
          />
        </label>

        {(localError || error) && (
          <div
            style={{
              marginBottom: '1rem',
              padding: '0.75rem',
              borderRadius: '12px',
              backgroundColor: 'rgba(255, 107, 107, 0.12)',
              color: '#ff8f8f',
              fontSize: '0.85rem',
            }}
          >
            {localError ?? error}
          </div>
        )}

        <button
          type="submit"
          disabled={submitting}
          style={{
            width: '100%',
            padding: '0.85rem 1rem',
            borderRadius: '16px',
            border: 'none',
            background: submitting
              ? 'linear-gradient(135deg, #3a566f, #25394b)'
              : 'linear-gradient(135deg, #61dfff, #4985ff)',
            color: '#041226',
            fontWeight: 700,
            fontSize: '0.95rem',
            cursor: submitting ? 'wait' : 'pointer',
            transition: 'transform 0.15s ease, box-shadow 0.15s ease',
            boxShadow: submitting ? 'none' : '0 10px 32px rgba(73, 133, 255, 0.35)',
          }}
        >
          {submitting ? 'Ingresando…' : 'Ingresar'}
        </button>
      </form>
    </div>
  )
}
