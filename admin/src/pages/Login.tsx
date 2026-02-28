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
        background: 'linear-gradient(135deg, #f1f5f9 0%, #e2e8f0 100%)',
        padding: '2rem',
      }}
    >
      <form
        onSubmit={onSubmit}
        style={{
          width: '100%',
          maxWidth: '420px',
          background: 'var(--admin-surface)',
          borderRadius: 'var(--radius-2xl)',
          padding: '2.5rem',
          boxShadow: 'var(--shadow-xl)',
          border: '1px solid var(--admin-border)',
        }}
      >
        <div style={{ textAlign: 'center', marginBottom: '2rem' }}>
          <div
            style={{
              width: 64,
              height: 64,
              background: 'linear-gradient(135deg, var(--cm-primary), var(--cm-primary-light))',
              borderRadius: 'var(--radius-xl)',
              display: 'grid',
              placeItems: 'center',
              color: 'white',
              fontWeight: 700,
              fontSize: '1.5rem',
              margin: '0 auto 1.5rem',
            }}
          >
            CM
          </div>
          <p
            style={{
              textTransform: 'uppercase',
              letterSpacing: '0.2em',
              fontSize: '0.6875rem',
              fontWeight: 600,
              color: 'var(--cm-accent)',
              marginBottom: '0.5rem',
            }}
          >
            CicloMarket
          </p>
          <h1
            style={{
              margin: 0,
              fontSize: '1.5rem',
              fontWeight: 700,
              color: 'var(--admin-text)',
            }}
          >
            Panel de Control
          </h1>
          <p
            style={{
              color: 'var(--admin-text-muted)',
              fontSize: '0.875rem',
              margin: '0.5rem 0 0',
            }}
          >
            Accedé con tu cuenta de moderador o administrador
          </p>
        </div>

        <div style={{ display: 'grid', gap: '1.25rem' }}>
          <div>
            <label
              style={{
                display: 'block',
                fontSize: '0.75rem',
                fontWeight: 600,
                color: 'var(--admin-text-muted)',
                textTransform: 'uppercase',
                letterSpacing: '0.05em',
                marginBottom: '0.5rem',
              }}
            >
              Email
            </label>
            <input
              value={email}
              onChange={(e) => setEmail(e.target.value)}
              type="email"
              placeholder="admin@ciclomarket.ar"
              style={{
                width: '100%',
                padding: '0.75rem 1rem',
                borderRadius: 'var(--radius-lg)',
                border: '1px solid var(--admin-border)',
                backgroundColor: 'var(--admin-surface)',
                color: 'var(--admin-text)',
                fontSize: '0.9375rem',
                transition: 'border-color 200ms, box-shadow 200ms',
              }}
              onFocus={(e) => {
                e.target.style.borderColor = 'var(--cm-accent)'
                e.target.style.boxShadow = '0 0 0 3px rgba(59, 130, 246, 0.1)'
              }}
              onBlur={(e) => {
                e.target.style.borderColor = 'var(--admin-border)'
                e.target.style.boxShadow = 'none'
              }}
              autoComplete="email"
            />
          </div>

          <div>
            <label
              style={{
                display: 'block',
                fontSize: '0.75rem',
                fontWeight: 600,
                color: 'var(--admin-text-muted)',
                textTransform: 'uppercase',
                letterSpacing: '0.05em',
                marginBottom: '0.5rem',
              }}
            >
              Contraseña
            </label>
            <input
              value={password}
              onChange={(e) => setPassword(e.target.value)}
              type="password"
              placeholder="••••••••"
              style={{
                width: '100%',
                padding: '0.75rem 1rem',
                borderRadius: 'var(--radius-lg)',
                border: '1px solid var(--admin-border)',
                backgroundColor: 'var(--admin-surface)',
                color: 'var(--admin-text)',
                fontSize: '0.9375rem',
                transition: 'border-color 200ms, box-shadow 200ms',
              }}
              onFocus={(e) => {
                e.target.style.borderColor = 'var(--cm-accent)'
                e.target.style.boxShadow = '0 0 0 3px rgba(59, 130, 246, 0.1)'
              }}
              onBlur={(e) => {
                e.target.style.borderColor = 'var(--admin-border)'
                e.target.style.boxShadow = 'none'
              }}
              autoComplete="current-password"
            />
          </div>
        </div>

        {(localError || error) && (
          <div
            style={{
              marginTop: '1.25rem',
              padding: '0.875rem 1rem',
              borderRadius: 'var(--radius-lg)',
              backgroundColor: '#fef2f2',
              color: 'var(--cm-danger)',
              fontSize: '0.875rem',
              display: 'flex',
              alignItems: 'center',
              gap: '0.5rem',
            }}
          >
            <span>⚠</span>
            <span>{localError ?? error}</span>
          </div>
        )}

        <button
          type="submit"
          disabled={submitting}
          className="btn btn-primary"
          style={{
            width: '100%',
            marginTop: '1.5rem',
            padding: '0.875rem 1.5rem',
            fontSize: '0.9375rem',
            fontWeight: 600,
          }}
        >
          {submitting ? (
            <>
              <span className="admin-spinner" style={{ width: 16, height: 16, borderWidth: 2 }} />
              <span>Ingresando…</span>
            </>
          ) : (
            'Ingresar al Panel'
          )}
        </button>
      </form>
    </div>
  )
}
