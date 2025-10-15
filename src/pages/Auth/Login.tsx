import { useState } from 'react'
import { Link, useNavigate } from 'react-router-dom'
import Container from '../../components/Container'
import Button from '../../components/Button'
import { SocialAuthButtons } from '../../components/SocialAuthButtons'
import { useAuth } from '../../context/AuthContext'
import { getSupabaseClient, supabaseEnabled } from '../../services/supabase'

type OAuthProvider = 'google' | 'facebook'

export default function Login() {
  const [email, setEmail] = useState('')
  const [password, setPassword] = useState('')
  const [loadingProvider, setLoadingProvider] = useState<Partial<Record<OAuthProvider, boolean>>>({})
  const navigate = useNavigate()
  const { enabled } = useAuth()

  const setProviderLoading = (provider: OAuthProvider, value: boolean) => {
    setLoadingProvider((prev) => ({ ...prev, [provider]: value }))
  }

  const loginEmail = async () => {
    if (!enabled || !supabaseEnabled) return alert('Login deshabilitado: configurá Supabase en .env')
    try {
      const supabase = getSupabaseClient()
      const { error } = await supabase.auth.signInWithPassword({
        email: email.trim(),
        password
      })
      if (error) throw error
      navigate('/dashboard')
    } catch (err: any) {
      const message = err instanceof Error ? err.message : 'No pudimos iniciar sesión. Intentá nuevamente.'
      alert(message)
    }
  }

  const buildOAuthHandler = (provider: OAuthProvider) => async () => {
    const providerName = provider === 'google' ? 'Google' : 'Facebook'
    if (!enabled || !supabaseEnabled) {
      alert(`Login con ${providerName} deshabilitado: configurá Supabase en .env`)
      return
    }
    try {
      setProviderLoading(provider, true)
      const supabase = getSupabaseClient()
      const scopes = provider === 'facebook'
        ? 'public_profile,email,user_photos,user_hometown'
        : undefined
      const { data, error } = await supabase.auth.signInWithOAuth({
        provider,
        options: {
          redirectTo: `${window.location.origin}/dashboard`,
          scopes
        }
      })
      if (error) throw error
      if (data?.url) {
        window.location.href = data.url
      }
    } catch (err: any) {
      const message =
        err instanceof Error ? err.message : `No pudimos iniciar sesión con ${providerName}.`
      alert(message)
    } finally {
      setProviderLoading(provider, false)
    }
  }

  return (
    <div className="relative isolate min-h-[calc(100vh-140px)] overflow-hidden bg-[#0c1723] py-14 text-white">
      <div className="absolute inset-0 -z-10 bg-[radial-gradient(1200px_520px_at_-10%_0%,rgba(255,255,255,0.12),transparent_70%)] opacity-70" />
      <div className="absolute inset-0 -z-20 bg-[radial-gradient(900px_520px_at_110%_20%,rgba(14,26,38,0.26),transparent_75%)]" />
      <Container>
        <div className="mx-auto grid max-w-6xl items-center gap-12 lg:grid-cols-[1.1fr_minmax(0,1fr)]">
          <div className="space-y-6 text-sm text-white/80">
            <span className="inline-flex items-center gap-2 rounded-full border border-white/10 bg-white/10 px-3 py-1 text-xs uppercase tracking-[0.35em] text-white/60">
              Bienvenido de vuelta
            </span>
            <h1 className="text-3xl font-bold text-white sm:text-4xl">
              Entrá al marketplace más seguro para ciclistas en Argentina.
            </h1>
            <p className="max-w-xl text-base">
              Guardamos tus conversaciones, avisos y favoritos para que sigas donde lo dejaste. Iniciá
              sesión con Google o con tu email.
            </p>
            <div className="flex flex-wrap gap-4 text-xs uppercase tracking-[0.3em] text-white/50">
              <span>Pagos protegidos</span>
              <span>Verificación de usuarios</span>
              <span>Soporte humano</span>
            </div>
            <p className="text-xs text-white/40">
              ¿Aún no tenés cuenta?{' '}
              <Link to="/register" className="font-semibold text-white hover:text-white/80">
                Crear cuenta
              </Link>
            </p>
          </div>
          <div className="relative overflow-hidden rounded-[32px] border border-white/10 bg-white/10 p-8 backdrop-blur">
            <div className="absolute inset-0 -z-10 bg-[linear-gradient(180deg,rgba(255,255,255,0.08),transparent)]" />
            <div className="space-y-6">
              <div className="text-center">
                <h2 className="text-2xl font-semibold text-white">Ingresar</h2>
                <p className="mt-1 text-sm text-white/70">
                  Elegí tu método preferido. Nunca compartimos tu información personal.
                </p>
              </div>
              <SocialAuthButtons
                buttons={[
                  {
                    id: 'google',
                    label: 'Continuar con Google',
                    loading: Boolean(loadingProvider.google),
                    onClick: buildOAuthHandler('google')
                  },
                  {
                    id: 'facebook',
                    label: 'Continuar con Facebook',
                    loading: Boolean(loadingProvider.facebook),
                    onClick: buildOAuthHandler('facebook')
                  },
                ]}
              />
              <div className="relative flex items-center gap-4 text-[11px] font-semibold uppercase tracking-[0.35em] text-white/40">
                <span className="h-px flex-1 bg-white/10" />
                <span>o con email</span>
                <span className="h-px flex-1 bg-white/10" />
              </div>
              <div className="space-y-3">
                <label className="text-xs font-semibold uppercase tracking-[0.28em] text-white/60">
                  Email
                  <input
                    className="input mt-2 w-full border border-white/20 bg-white text-[#14212e] placeholder:text-black/60 focus:border-white/60"
                    value={email}
                    onChange={(e) => setEmail(e.target.value)}
                    type="email"
                    placeholder="tu@email.com"
                  />
                </label>
                <label className="text-xs font-semibold uppercase tracking-[0.28em] text-white/60">
                  Contraseña
                  <input
                    className="input mt-2 w-full border border-white/20 bg-white text-[#14212e] placeholder:text-black/60 focus:border-white/60"
                    type="password"
                    value={password}
                    onChange={(e) => setPassword(e.target.value)}
                    placeholder="••••••••"
                  />
                </label>
              </div>
              <Button
                onClick={loginEmail}
                className="w-full rounded-2xl bg-white text-[#14212e] hover:bg-white/90"
              >
                Ingresar con email
              </Button>
              <p className="text-center text-xs text-white/50">
                Al continuar aceptás nuestros{' '}
                <a href="/terminos" className="underline hover:text-white">
                  Términos y condiciones
                </a>
                .
              </p>
            </div>
          </div>
        </div>
      </Container>
    </div>
  )
}
