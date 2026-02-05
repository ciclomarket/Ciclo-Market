import { useEffect, useMemo, useState, type ReactNode } from 'react'
import { Link, useLocation } from 'react-router-dom'
import { useAuth } from '../../context/AuthContext'
import { PROVINCES, OTHER_CITY_OPTION } from '../../constants/locations'
import { BIKE_CATEGORIES } from '../../constants/catalog'
import { getSupabaseClient, supabaseEnabled } from '../../services/supabase'
import { createUserProfile } from '../../services/users'
import { deriveProfileSlug, pickDiscipline } from '../../utils/user'
import { useToast } from '../../context/ToastContext'
import { trackMetaPixel } from '../../lib/metaPixel'
import { detectInAppBrowser, canUseOAuthInContext } from '../../utils/inAppBrowser'
import InAppBrowserWarning from '../../components/InAppBrowserWarning'

type OAuthProvider = 'google'
export default function Register() {
  const [email, setEmail] = useState('')
  const [password, setPassword] = useState('')
  const [confirmPassword, setConfirmPassword] = useState('')
  const [fullName, setFullName] = useState('')
  const [province, setProvince] = useState('')
  const [city, setCity] = useState('')
  const [cityOther, setCityOther] = useState('')
  const [bikePrefs, setBikePrefs] = useState<string[]>([])
  const [acceptedTerms, setAcceptedTerms] = useState(false)
  const [newsletterOptIn, setNewsletterOptIn] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [loading, setLoading] = useState(false)
  const [success, setSuccess] = useState(false)
  const [socialLoading, setSocialLoading] = useState<Partial<Record<OAuthProvider, boolean>>>({})
  const loc = useLocation() as any
  const { enabled } = useAuth()
  const { show: showToast } = useToast()
  const [inApp, setInApp] = useState<{ isInApp: boolean; agent: string | null }>({ isInApp: false, agent: null })
  useEffect(() => { setInApp(detectInAppBrowser()) }, [])

  const redirectParam = useMemo(() => {
    try {
      const sp = new URLSearchParams(loc?.search || '')
      const raw = (sp.get('redirect') || '').trim()
      if (!raw) return null
      if (!raw.startsWith('/')) return null
      if (raw.startsWith('//')) return null
      if (raw.includes('://')) return null
      return raw
    } catch {
      return null
    }
  }, [loc?.search])

  const setProviderLoading = (provider: OAuthProvider, value: boolean) => {
    setSocialLoading((prev) => ({ ...prev, [provider]: value }))
  }

  const passwordChecks = useMemo(() => {
    const value = password
    return {
      length: value.length >= 8,
      upper: /[A-Z]/.test(value),
      lower: /[a-z]/.test(value),
      number: /\d/.test(value)
    }
  }, [password])

  const passwordValid = Object.values(passwordChecks).every(Boolean)

  const register = async () => {
    setError(null)
    if (!enabled || !supabaseEnabled) { setError('Registro deshabilitado: configurá Supabase en .env'); return }
    if (!email.trim()) { setError('Ingresá un email válido'); return }
    if (!passwordValid) { setError('La contraseña debe cumplir con los requisitos de seguridad'); return }
    if (password !== confirmPassword) { setError('Las contraseñas no coinciden'); return }
    if (!fullName.trim()) { setError('Ingresá tu nombre completo'); return }
    if (!province) { setError('Seleccioná una provincia'); return }
    if (!city) { setError('Seleccioná una ciudad'); return }
    if (city === OTHER_CITY_OPTION && !cityOther.trim()) { setError('Indicá la ciudad'); return }
    if (!acceptedTerms) { setError('Debés aceptar los términos y condiciones'); return }

    try {
      setLoading(true)
      const location = city === OTHER_CITY_OPTION ? cityOther.trim() : city
      const supabase = getSupabaseClient()
      const discipline = pickDiscipline(bikePrefs)
      const profileSlug = deriveProfileSlug({
        fullName: fullName.trim(),
        discipline,
        fallback: email.trim().split('@')[0] ?? 'usuario'
      })
      const { data, error: signUpError } = await supabase.auth.signUp({
        email: email.trim(),
        password,
        options: {
          data: {
            full_name: fullName.trim(),
            province,
            city: location,
            bike_preferences: bikePrefs,
            profile_slug: profileSlug,
            discipline,
          }
        }
      })
      if (signUpError) throw signUpError

      if (data.user?.id) {
        await createUserProfile({
          id: data.user.id,
          email: email.trim(),
          fullName: fullName.trim(),
          province,
          city: location,
          bikePreferences: bikePrefs,
          profileSlug,
        })
        // Newsletter opt-in (Resend audience)
        if (newsletterOptIn) {
          try {
            const { subscribeNewsletter } = await import('../../services/newsletter')
            await subscribeNewsletter({ email: email.trim(), name: fullName.trim(), audienceId: 'e38e76f3-6904-443f-a1de-77a1e142440a' })
          } catch { void 0 }
        }
      }

      setSuccess(true)
      showToast(`Te enviamos un correo a ${email.trim()}. Revisá tu bandeja y verificá tu cuenta.`)
      // Pixel: registrar SignUp y CompleteRegistration (email)
      try {
        trackMetaPixel('SignUp', { method: 'email' })
        trackMetaPixel('CompleteRegistration', { method: 'email' })
      } catch { /* noop */ }
      // Permanecé en esta pantalla; el usuario verá el aviso y podrá revisar su mail
    } catch (err: any) {
      console.error('Error en registro Supabase:', err)
      if (err instanceof Error) {
        setError(err.message)
      } else if (typeof err === 'object' && err !== null && 'message' in err) {
        setError(String((err as { message: unknown }).message))
      } else {
        setError('Ocurrió un error desconocido. Intentá nuevamente.')
      }
    } finally {
      setLoading(false)
    }

  }

  const onProvinceChange = (value: string) => {
    setProvince(value)
    setCity('')
    setCityOther('')
  }

  const toggleBikePref = (cat: string) => {
    setBikePrefs((prev) => prev.includes(cat) ? prev.filter((c) => c !== cat) : [...prev, cat])
  }

  const loginWithGoogle = async () => {
    if (!canUseOAuthInContext()) {
      setError('Abrí este enlace en Chrome o Safari para continuar con Google.')
      return
    }
    setError(null)
    if (!enabled || !supabaseEnabled) {
      setError('Login con Google deshabilitado: configurá Supabase en .env')
      return
    }
    try {
      setProviderLoading('google', true)
      const supabase = getSupabaseClient()
      const fromState = loc?.state?.from as { pathname?: string; search?: string } | undefined
      const nextPath = fromState?.pathname
        ? `${fromState.pathname || ''}${fromState.search || ''}`
        : redirectParam
      const redirect = nextPath
        ? `${window.location.origin}${nextPath}`
        : `${window.location.origin}/dashboard`
      const { data, error } = await supabase.auth.signInWithOAuth({
        provider: 'google',
        options: {
          redirectTo: redirect,
        }
      })
      if (error) throw error
      if (data?.url) {
        // Guardamos intención para enviar eventos al volver del OAuth
        try { sessionStorage.setItem('mb_oauth_signup_intent', 'google') } catch { /* noop */ }
        window.location.href = data.url
      }
    } catch (err: any) {
      console.error('Error login OAuth:', err)
      const message =
        err instanceof Error ? err.message : 'No pudimos conectar con Google. Intentá nuevamente.'
      setError(message)
    } finally {
      setProviderLoading('google', false)
    }
  }

  const cityOptions = province ? PROVINCES.find((p) => p.name === province)?.cities ?? [] : []
  const fieldClass =
    'mt-1 block w-full rounded-xl border border-gray-300 bg-white px-4 py-3 text-gray-900 shadow-sm focus:border-mb-primary focus:ring-1 focus:ring-mb-primary'
  const selectClass =
    'mt-1 block w-full rounded-xl border border-gray-300 bg-white px-4 py-3 text-gray-900 shadow-sm focus:border-mb-primary focus:ring-1 focus:ring-mb-primary'
  return (
    <div className="relative flex min-h-screen lg:flex-row">
      <div className="absolute inset-0 z-0 lg:relative lg:inset-auto lg:z-auto lg:order-2 lg:w-1/2">
        <picture className="h-full w-full">
          <source srcSet="/bicicletas-home.webp" type="image/webp" />
          <img src="/bicicletas-home.jpg" alt="Ciclismo" className="h-full w-full object-cover" />
        </picture>
        <div className="absolute inset-0 bg-black/40 lg:hidden" />
      </div>

      <div className="relative z-10 flex w-full items-center justify-center p-4 lg:order-1 lg:w-1/2 lg:bg-white lg:p-0">
        <div className="w-full max-w-md rounded-2xl bg-white p-8 shadow-2xl lg:rounded-none lg:bg-transparent lg:p-12 lg:shadow-none">
          <h1 className="text-3xl font-bold tracking-tight text-mb-ink">Crear cuenta</h1>
          <p className="mt-2 text-sm text-gray-500">
            Registrate gratis en menos de 1 minuto. Podés editar tu perfil cuando quieras.
          </p>

          {inApp.isInApp && (
            <div className="mt-6">
              <InAppBrowserWarning />
            </div>
          )}

          <div className="mt-8 space-y-4">
            {error && (
              <div className="rounded-xl border border-red-200 bg-red-50 px-3 py-2 text-sm text-red-600">
                {error}
              </div>
            )}
            {success && (
              <div className="rounded-xl border border-green-200 bg-green-50 px-3 py-2 text-sm text-green-700">
                <p>
                  Te enviamos un correo a <b>{email}</b>. Revisá tu bandeja (y spam) y verificá tu cuenta para continuar.
                </p>
                <div className="mt-2">
                  <Link to="/verificar-email" className="font-semibold text-green-700 underline hover:text-green-800">
                    Ver instrucciones y reenviar correo
                  </Link>
                </div>
              </div>
            )}

            <button
              type="button"
              onClick={() => void loginWithGoogle()}
              disabled={Boolean(socialLoading.google)}
              className="flex h-12 w-full items-center justify-center gap-3 rounded-xl border border-gray-300 bg-white font-medium text-gray-700 shadow-sm transition-colors hover:bg-gray-50 disabled:cursor-not-allowed disabled:opacity-60"
            >
              <svg viewBox="0 0 48 48" className="h-5 w-5" aria-hidden="true">
                <path fill="#FFC107" d="M43.611 20.083H42V20H24v8h11.303C33.648 32.657 29.164 36 24 36c-6.627 0-12-5.373-12-12s5.373-12 12-12c3.059 0 5.842 1.154 7.962 3.038l5.657-5.657C34.047 6.053 29.239 4 24 4 12.955 4 4 12.955 4 24s8.955 20 20 20 20-8.955 20-20c0-1.341-.138-2.65-.389-3.917z" />
                <path fill="#FF3D00" d="M6.306 14.691l6.571 4.819C14.655 16.108 18.961 12 24 12c3.059 0 5.842 1.154 7.962 3.038l5.657-5.657C34.047 6.053 29.239 4 24 4 16.318 4 9.656 8.337 6.306 14.691z" />
                <path fill="#4CAF50" d="M24 44c5.134 0 9.86-1.979 13.409-5.197l-6.192-5.238C29.173 35.091 26.715 36 24 36c-5.143 0-9.61-3.317-11.268-7.946l-6.52 5.025C9.52 39.556 16.227 44 24 44z" />
                <path fill="#1976D2" d="M43.611 20.083H42V20H24v8h11.303a12.07 12.07 0 0 1-4.087 5.565h.003l6.192 5.238C36.973 39.205 44 34 44 24c0-1.341-.138-2.65-.389-3.917z" />
              </svg>
              {socialLoading.google ? 'Conectando…' : 'Continuar con Google'}
            </button>

            <div className="relative flex items-center">
              <div className="flex-grow border-t border-gray-200" />
              <span className="mx-4 flex-shrink text-xs font-medium text-gray-400">O continuá con email</span>
              <div className="flex-grow border-t border-gray-200" />
            </div>

            <form
              className="space-y-5"
              onSubmit={(e) => {
                e.preventDefault()
                void register()
              }}
            >
              <label className="block text-sm font-medium text-gray-700">
                Nombre completo
                <input
                  className={fieldClass}
                  value={fullName}
                  onChange={(e) => setFullName(e.target.value)}
                  placeholder="Ej: Ana Pérez"
                  autoComplete="name"
                />
              </label>

              <label className="block text-sm font-medium text-gray-700">
                Email
                <input
                  className={fieldClass}
                  type="email"
                  value={email}
                  onChange={(e) => setEmail(e.target.value)}
                  placeholder="tu@email.com"
                  autoComplete="email"
                />
              </label>

              <div>
                <label className="block text-sm font-medium text-gray-700">Contraseña</label>
                <input
                  className={fieldClass}
                  type="password"
                  value={password}
                  onChange={(e) => setPassword(e.target.value)}
                  placeholder="Ingresá una contraseña segura"
                  autoComplete="new-password"
                />
                <div className="mt-2 space-y-1 text-xs">
                  <PasswordHint ok={passwordChecks.length}>Al menos 8 caracteres</PasswordHint>
                  <PasswordHint ok={passwordChecks.upper}>Una letra mayúscula</PasswordHint>
                  <PasswordHint ok={passwordChecks.lower}>Una letra minúscula</PasswordHint>
                  <PasswordHint ok={passwordChecks.number}>Al menos un número</PasswordHint>
                </div>
              </div>

              <label className="block text-sm font-medium text-gray-700">
                Repetí la contraseña
                <input
                  className={fieldClass}
                  type="password"
                  value={confirmPassword}
                  onChange={(e) => setConfirmPassword(e.target.value)}
                  placeholder="Confirmá la contraseña"
                  autoComplete="new-password"
                />
              </label>

              <div className="grid gap-4 md:grid-cols-2">
                <label className="block text-sm font-medium text-gray-700">
                  Provincia
                  <select
                    className={selectClass}
                    value={province}
                    onChange={(e) => onProvinceChange(e.target.value)}
                    autoComplete="address-level1"
                  >
                    <option value="">Seleccionar provincia</option>
                    {PROVINCES.map((prov) => (
                      <option key={prov.name} value={prov.name}>
                        {prov.name}
                      </option>
                    ))}
                  </select>
                </label>
                <label className="block text-sm font-medium text-gray-700">
                  Ciudad
                  <select
                    className={selectClass}
                    value={city}
                    onChange={(e) => setCity(e.target.value)}
                    disabled={!province}
                    autoComplete="address-level2"
                  >
                    <option value="">{province ? 'Seleccioná ciudad' : 'Elegí provincia primero'}</option>
                    {cityOptions.map((c) => (
                      <option key={c} value={c}>
                        {c}
                      </option>
                    ))}
                    <option value={OTHER_CITY_OPTION}>Otra ciudad</option>
                  </select>
                </label>
              </div>
              {city === OTHER_CITY_OPTION && (
                <label className="block text-sm font-medium text-gray-700">
                  Ciudad (especificar)
                  <input
                    className={fieldClass}
                    value={cityOther}
                    onChange={(e) => setCityOther(e.target.value)}
                    placeholder="Ingresá la ciudad"
                  />
                </label>
              )}

              <div>
                <div className="block text-sm font-medium text-gray-700">¿Qué bici te interesa?</div>
                <div className="sm:hidden">
                  <select
                    className={selectClass}
                    value=""
                    onChange={(e) => {
                      const value = e.target.value as (typeof BIKE_CATEGORIES)[number] | ''
                      if (value) toggleBikePref(value)
                    }}
                  >
                    <option value="">Agregar categoría…</option>
                    {BIKE_CATEGORIES.map((cat) => (
                      <option key={cat} value={cat}>
                        {cat}
                      </option>
                    ))}
                  </select>
                  {bikePrefs.length > 0 && (
                    <div className="mt-2 flex flex-wrap gap-2">
                      {bikePrefs.map((cat) => (
                        <span
                          key={cat}
                          className="inline-flex items-center gap-2 rounded-full border border-gray-200 bg-gray-50 px-3 py-1 text-xs font-medium text-gray-700"
                        >
                          {cat}
                          <button
                            type="button"
                            className="text-gray-500 hover:text-gray-900"
                            onClick={() => toggleBikePref(cat)}
                            aria-label={`Quitar ${cat}`}
                          >
                            ✕
                          </button>
                        </span>
                      ))}
                    </div>
                  )}
                </div>

                <div className="mt-2 hidden gap-2 sm:grid sm:grid-cols-2">
                  {BIKE_CATEGORIES.map((cat) => {
                    const checked = bikePrefs.includes(cat)
                    return (
                      <label
                        key={cat}
                        className={`flex items-center gap-2 rounded-xl border px-3 py-2 text-sm transition ${
                          checked
                            ? 'border-mb-primary bg-mb-primary/10 text-mb-primary'
                            : 'border-gray-200 text-gray-700 hover:border-gray-300'
                        }`}
                      >
                        <input
                          type="checkbox"
                          className="h-4 w-4 rounded border-gray-300 text-mb-primary focus:ring-mb-primary"
                          checked={checked}
                          onChange={() => toggleBikePref(cat)}
                        />
                        <span>{cat}</span>
                      </label>
                    )
                  })}
                </div>
                <p className="mt-1 text-xs text-gray-500">Podés elegir varias categorías.</p>
              </div>

              <label className="flex items-start gap-2 rounded-xl border border-gray-200 bg-gray-50 px-3 py-3 text-sm text-gray-700">
                <input
                  type="checkbox"
                  className="mt-1 h-4 w-4 rounded border-gray-300 text-mb-primary focus:ring-mb-primary"
                  checked={acceptedTerms}
                  onChange={(e) => setAcceptedTerms(e.target.checked)}
                />
                <span>
                  Acepto los{' '}
                  <Link to="/terminos" className="font-semibold text-gray-900 underline" target="_blank" rel="noopener noreferrer">
                    términos y condiciones
                  </Link>
                  .
                </span>
              </label>

              <label className="flex items-start gap-2 rounded-xl border border-gray-200 bg-gray-50 px-3 py-3 text-sm text-gray-700">
                <input
                  type="checkbox"
                  className="mt-1 h-4 w-4 rounded border-gray-300 text-mb-primary focus:ring-mb-primary"
                  checked={newsletterOptIn}
                  onChange={(e) => setNewsletterOptIn(e.target.checked)}
                />
                <span>Quiero recibir novedades por mail (ofertas y lanzamientos).</span>
              </label>

              <button
                type="submit"
                disabled={loading}
                className="flex w-full justify-center rounded-xl border border-transparent bg-mb-primary px-4 py-3 text-sm font-bold text-white shadow-sm transition-colors hover:bg-mb-primary/90 disabled:cursor-not-allowed disabled:opacity-60"
              >
                {loading ? 'Creando cuenta…' : 'Crear cuenta'}
              </button>
            </form>

            <p className="text-sm text-gray-600">
              ¿Ya tenés cuenta?{' '}
              <Link
                to={redirectParam ? `/login?redirect=${encodeURIComponent(redirectParam)}` : '/login'}
                className="font-semibold text-mb-primary hover:text-mb-primary/90"
              >
                Ingresá acá
              </Link>
            </p>
          </div>
        </div>
      </div>
    </div>
  )
}

function PasswordHint({ ok, children }: { ok: boolean; children: ReactNode }) {
  return (
    <div className={`flex items-center gap-2 ${ok ? 'text-emerald-600' : 'text-gray-500'}`}>
      <span className={`inline-flex h-4 w-4 items-center justify-center rounded-full border text-[10px] font-semibold ${ok ? 'border-emerald-500 bg-emerald-500 text-white' : 'border-gray-200 text-gray-400'}`}>
        {ok ? '✓' : ''}
      </span>
      <span>{children}</span>
    </div>
  )
}
