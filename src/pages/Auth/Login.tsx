import { useEffect, useState } from 'react'
import { Link, useLocation } from 'react-router-dom'
import { useAuth } from '../../context/AuthContext'
import { getSupabaseClient, supabaseEnabled, setAuthPersistence } from '../../services/supabase'
import { trackMetaPixel } from '../../lib/metaPixel'
import { detectInAppBrowser, canUseOAuthInContext } from '../../utils/inAppBrowser'
import InAppBrowserWarning from '../../components/InAppBrowserWarning'
import { useToast } from '../../context/ToastContext'

type OAuthProvider = 'google'

export default function Login() {
  const [email, setEmail] = useState('')
  const [password, setPassword] = useState('')
  const [rememberMe, setRememberMe] = useState(true)
  const [loadingProvider, setLoadingProvider] = useState<Partial<Record<OAuthProvider, boolean>>>({})
  const location = useLocation() as any
  const { enabled } = useAuth()
  const [inApp, setInApp] = useState<{ isInApp: boolean; agent: string | null }>({ isInApp: false, agent: null })
  const { show: showToast } = useToast()
  const [sendingReset, setSendingReset] = useState(false)
  useEffect(() => { setInApp(detectInAppBrowser()) }, [])
  // (Promo next removido)

  const redirectParam = (() => {
    try {
      const sp = new URLSearchParams(location?.search || '')
      const raw = (sp.get('redirect') || '').trim()
      if (!raw) return null
      if (!raw.startsWith('/')) return null
      if (raw.startsWith('//')) return null
      if (raw.includes('://')) return null
      return raw
    } catch {
      return null
    }
  })()

  const setProviderLoading = (provider: OAuthProvider, value: boolean) => {
    setLoadingProvider((prev) => ({ ...prev, [provider]: value }))
  }

  const inputClass =
    'mt-1 block w-full rounded-xl border border-gray-300 bg-white px-4 py-3 text-gray-900 shadow-sm focus:border-mb-primary focus:ring-1 focus:ring-mb-primary'

  // Cargar preferencia previa
  useEffect(() => {
    if (typeof window === 'undefined') return
    const prev = window.localStorage.getItem('mb_auth_persist')
    setRememberMe(prev !== 'session')
  }, [])

  const loginEmail = async () => {
    if (!enabled || !supabaseEnabled) return alert('Login deshabilitado: configurá Supabase en .env')
    try {
      setAuthPersistence(Boolean(rememberMe))
      const supabase = getSupabaseClient()
      const { error } = await supabase.auth.signInWithPassword({
        email: email.trim(),
        password
      })
      if (error) throw error
      // Marca de intención para asegurar el evento luego de redirigir
      try { sessionStorage.setItem('mb_oauth_login_intent', 'email') } catch { /* noop */ }
      try { trackMetaPixel('Login', { method: 'email' }) } catch { /* noop */ }
      if (typeof window !== 'undefined') {
        const from = location?.state?.from as { pathname?: string; search?: string } | undefined
        const nextPath = from?.pathname
          ? `${from.pathname}${from.search || ''}`
          : redirectParam
        if (nextPath) {
          window.location.assign(nextPath)
        } else {
          window.location.assign('/dashboard')
        }
      }
    } catch (err: any) {
      const message = err instanceof Error ? err.message : 'No pudimos iniciar sesión. Intentá nuevamente.'
      alert(message)
    }
  }

  const loginWithGoogle = async () => {
    if (!canUseOAuthInContext()) {
      alert('Para continuar con Google, abrí este link en Chrome o Safari (no dentro de Instagram/Messenger).')
      return
    }
    if (!enabled || !supabaseEnabled) {
      alert('Login con Google deshabilitado: configurá Supabase en .env')
      return
    }
    try {
      setProviderLoading('google', true)
      setAuthPersistence(Boolean(rememberMe))
      const supabase = getSupabaseClient()
      const from = (location?.state?.from as { pathname?: string; search?: string } | undefined)
      const nextPath = from?.pathname ? `${from.pathname}${from.search || ''}` : redirectParam
      const redirectBase = `${window.location.origin}/dashboard`
      const redirect = nextPath ? `${redirectBase}?next=${encodeURIComponent(nextPath)}` : redirectBase
      const { data, error } = await supabase.auth.signInWithOAuth({
        provider: 'google',
        options: {
          redirectTo: redirect,
        }
      })
      if (error) throw error
      if (data?.url) {
        // Guardamos intención para enviar evento al volver del OAuth
        try { sessionStorage.setItem('mb_oauth_login_intent', 'google') } catch { /* noop */ }
        window.location.href = data.url
      }
    } catch (err: any) {
      const message =
        err instanceof Error ? err.message : 'No pudimos iniciar sesión con Google.'
      alert(message)
    } finally {
      setProviderLoading('google', false)
    }
  }

  const handlePasswordReset = async () => {
    if (!enabled || !supabaseEnabled) {
      showToast('Recuperar contraseña está deshabilitado: configurá Supabase en .env', { variant: 'error' })
      return
    }
    if (!email.trim()) {
      showToast('Ingresá el email con el que te registraste para recuperar tu contraseña.', { variant: 'info' })
      return
    }
    try {
      setSendingReset(true)
      const supabase = getSupabaseClient()
      const redirectTo = `${window.location.origin}/recuperar-clave`
      const { error } = await supabase.auth.resetPasswordForEmail(email.trim(), { redirectTo })
      if (error) throw error
      showToast(`Te enviamos un enlace de recuperación a ${email.trim()}. Revisá tu bandeja de entrada y spam.`, { variant: 'info' })
    } catch (err: any) {
      console.error('Error enviando email de recuperación:', err)
      const message = err instanceof Error ? err.message : 'No pudimos enviar el correo de recuperación. Intentá nuevamente.'
      showToast(message, { variant: 'error' })
    } finally {
      setSendingReset(false)
    }
  }

  return (
    <div className="relative flex min-h-[calc(100vh-var(--header-h))] lg:flex-row">
      <div className="absolute inset-0 z-0 lg:relative lg:inset-auto lg:z-auto lg:order-2 lg:flex lg:w-1/2 lg:items-center lg:justify-center lg:bg-gray-50 lg:p-8">
        <div className="relative h-full w-full lg:h-[min(780px,calc(100vh-var(--header-h)-64px))] lg:max-w-2xl lg:overflow-hidden lg:rounded-2xl lg:shadow-2xl">
          <picture className="h-full w-full">
            <source srcSet="/bicicletas-home.webp" type="image/webp" />
            <img src="/bicicletas-home.jpg" alt="Ciclismo" className="h-full w-full object-cover" />
          </picture>
          <div className="absolute inset-0 bg-black/40 lg:hidden" />
        </div>
      </div>

      <div className="relative z-10 flex w-full items-start justify-center px-4 pt-6 pb-6 lg:order-1 lg:w-1/2 lg:bg-white lg:px-0 lg:pt-10 lg:pb-10">
        <div className="w-full max-w-md rounded-2xl bg-white px-8 py-3 shadow-2xl lg:rounded-none lg:bg-transparent lg:px-12 lg:py-4 lg:shadow-none">
          <h1 className="text-3xl font-bold tracking-tight text-mb-ink">Bienvenido</h1>
          <p className="mt-2 text-sm text-gray-500">
            Iniciá sesión con Google o con tu email para acceder a tu dashboard.
          </p>

          {inApp.isInApp && (
            <div className="mt-6">
              <InAppBrowserWarning />
            </div>
          )}

          <div className="mt-8 space-y-4">
            <button
              type="button"
              onClick={() => void loginWithGoogle()}
              disabled={Boolean(loadingProvider.google)}
              className="flex h-12 w-full items-center justify-center gap-3 rounded-xl border border-gray-300 bg-white font-medium text-gray-700 shadow-sm transition-colors hover:bg-gray-50 disabled:cursor-not-allowed disabled:opacity-60"
            >
              <svg viewBox="0 0 48 48" className="h-5 w-5" aria-hidden="true">
                <path fill="#FFC107" d="M43.611 20.083H42V20H24v8h11.303C33.648 32.657 29.164 36 24 36c-6.627 0-12-5.373-12-12s5.373-12 12-12c3.059 0 5.842 1.154 7.962 3.038l5.657-5.657C34.047 6.053 29.239 4 24 4 12.955 4 4 12.955 4 24s8.955 20 20 20 20-8.955 20-20c0-1.341-.138-2.65-.389-3.917z" />
                <path fill="#FF3D00" d="M6.306 14.691l6.571 4.819C14.655 16.108 18.961 12 24 12c3.059 0 5.842 1.154 7.962 3.038l5.657-5.657C34.047 6.053 29.239 4 24 4 16.318 4 9.656 8.337 6.306 14.691z" />
                <path fill="#4CAF50" d="M24 44c5.134 0 9.86-1.979 13.409-5.197l-6.192-5.238C29.173 35.091 26.715 36 24 36c-5.143 0-9.61-3.317-11.268-7.946l-6.52 5.025C9.52 39.556 16.227 44 24 44z" />
                <path fill="#1976D2" d="M43.611 20.083H42V20H24v8h11.303a12.07 12.07 0 0 1-4.087 5.565h.003l6.192 5.238C36.973 39.205 44 34 44 24c0-1.341-.138-2.65-.389-3.917z" />
              </svg>
              {loadingProvider.google ? 'Conectando…' : 'Continuar con Google'}
            </button>

            <div className="relative flex items-center">
              <div className="flex-grow border-t border-gray-200" />
              <span className="mx-4 flex-shrink text-xs font-medium text-gray-400">O continuá con email</span>
              <div className="flex-grow border-t border-gray-200" />
            </div>

            <form
              className="space-y-4"
              onSubmit={(e) => {
                e.preventDefault()
                void loginEmail()
              }}
            >
              <label className="block text-sm font-medium text-gray-700">
                Email
                <input
                  className={inputClass}
                  value={email}
                  onChange={(e) => setEmail(e.target.value)}
                  type="email"
                  placeholder="tu@email.com"
                  autoComplete="email"
                />
              </label>

              <label className="block text-sm font-medium text-gray-700">
                Contraseña
                <input
                  className={inputClass}
                  type="password"
                  value={password}
                  onChange={(e) => setPassword(e.target.value)}
                  placeholder="••••••••"
                  autoComplete="current-password"
                />
              </label>

              <label className="flex items-center gap-2 text-sm text-gray-600">
                <input
                  type="checkbox"
                  className="h-4 w-4 rounded border-gray-300 text-mb-primary focus:ring-mb-primary"
                  checked={rememberMe}
                  onChange={(e) => setRememberMe(e.target.checked)}
                />
                Mantenerme conectado
              </label>

              <button
                type="submit"
                className="flex w-full justify-center rounded-xl border border-transparent bg-mb-primary px-4 py-3 text-sm font-bold text-white shadow-sm transition-colors hover:bg-mb-primary/90"
              >
                Ingresar
              </button>

              <button
                type="button"
                onClick={() => void handlePasswordReset()}
                className="w-full text-center text-sm font-medium text-gray-600 underline-offset-4 hover:text-gray-900 hover:underline disabled:cursor-not-allowed disabled:opacity-60"
                disabled={sendingReset}
              >
                {sendingReset ? 'Enviando correo de recuperación…' : '¿Olvidaste tu contraseña?'}
              </button>
            </form>

            <p className="text-xs text-gray-500">
              Al continuar aceptás nuestros{' '}
              <a href="/terminos" className="font-medium text-gray-700 underline-offset-4 hover:underline">
                Términos y condiciones
              </a>
              .
            </p>

            <p className="text-sm text-gray-600">
              ¿Aún no tenés cuenta?{' '}
              <Link
                to={redirectParam ? `/register?redirect=${encodeURIComponent(redirectParam)}` : '/register'}
                className="font-semibold text-mb-primary hover:text-mb-primary/90"
              >
                Crear cuenta
              </Link>
            </p>
          </div>
        </div>
      </div>
    </div>
  )
}
