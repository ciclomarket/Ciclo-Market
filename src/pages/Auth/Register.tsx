
import Container from '../../components/Container'
import Button from '../../components/Button'
import { SocialAuthButtons } from '../../components/SocialAuthButtons'
import { useEffect, useMemo, useState, type ReactNode } from 'react'
import { useNavigate, Link, useLocation } from 'react-router-dom'
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

type OAuthProvider = 'google' | 'facebook'
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
  const nav = useNavigate()
  const loc = useLocation() as any
  const { enabled } = useAuth()
  const { show: showToast } = useToast()
  const [inApp, setInApp] = useState<{ isInApp: boolean; agent: string | null }>({ isInApp: false, agent: null })
  useEffect(() => { setInApp(detectInAppBrowser()) }, [])

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

  const loginWithProvider = async (provider: OAuthProvider) => {
    if (!canUseOAuthInContext()) {
      setError('Abrí este enlace en Chrome o Safari para continuar con Google/Facebook.')
      return
    }
    setError(null)
    const providerName = provider === 'google' ? 'Google' : 'Facebook'
    if (!enabled || !supabaseEnabled) {
      setError(`Login con ${providerName} deshabilitado: configurá Supabase en .env`)
      return
    }
    try {
      setProviderLoading(provider, true)
      const supabase = getSupabaseClient()
      const scopes = provider === 'facebook'
        ? 'public_profile,email'
        : undefined
      const fromState = loc?.state?.from
      const redirect = fromState
        ? `${window.location.origin}${fromState.pathname || ''}${fromState.search || ''}`
        : `${window.location.origin}/dashboard`
      const { data, error } = await supabase.auth.signInWithOAuth({
        provider,
        options: {
          redirectTo: redirect,
          scopes
        }
      })
      if (error) throw error
      if (data?.url) {
        // Guardamos intención para enviar eventos al volver del OAuth
        try { sessionStorage.setItem('mb_oauth_signup_intent', provider) } catch { /* noop */ }
        window.location.href = data.url
      }
    } catch (err: any) {
      console.error('Error login OAuth:', err)
      const message =
        err instanceof Error ? err.message : `No pudimos conectar con ${providerName}. Intentá nuevamente.`
      setError(message)
    } finally {
      setProviderLoading(provider, false)
    }
  }

  const cityOptions = province ? PROVINCES.find((p) => p.name === province)?.cities ?? [] : []
  const fieldClass = 'input mt-1 bg-white text-[#14212e] placeholder:text-black/60 border border-white/20 focus:border-white/60'
  const selectClass = 'select mt-1 bg-white text-[#14212e] border border-white/20 focus:border-white/60'
  return (
    <div className="relative isolate min-h-[calc(100vh-140px)] overflow-hidden bg-[#09121b] py-14 text-white">
      {inApp.isInApp && (
        <InAppBrowserWarning />
      )}
      <div className="absolute inset-0 -z-10 bg-[radial-gradient(1100px_520px_at_-10%_0%,rgba(255,255,255,0.14),transparent_70%)] opacity-70" />
      <div className="absolute inset-0 -z-20 bg-[radial-gradient(960px_540px_at_120%_15%,rgba(17,30,44,0.3),transparent_75%)]" />
      <Container>
        <div className="mx-auto grid max-w-6xl items-start gap-12 lg:grid-cols-[1.1fr_minmax(0,1fr)]">
          <div className="space-y-6">
            <span className="inline-flex items-center gap-2 rounded-full border border-white/10 bg-white/10 px-3 py-1 text-xs uppercase tracking-[0.35em] text-white/60">
              Sumate a la comunidad
            </span>
            <h1 className="text-3xl font-bold text-white sm:text-4xl">
              Publicá, comprá y seguí tu pasión en una plataforma pensada para ciclistas.
            </h1>
            <p className="max-w-xl text-base text-white/75">
              Creá tu perfil gratuito, elegí tus disciplinas favoritas y accedé a beneficios exclusivos.
              Validamos vendedores, protegemos pagos y te acompañamos en cada intercambio.
            </p>
            {/* Removed: anuncio de crédito gratuito de bienvenida */}
            <ul className="space-y-3 text-sm text-white/75">
              <li className="flex items-start gap-3">
                <span className="mt-1 h-2 w-2 rounded-full bg-mb-primary" />
                <span>Publicaciones verificadas y métricas para tus futuras ventas.</span>
              </li>
              <li className="flex items-start gap-3">
                <span className="mt-1 h-2 w-2 rounded-full bg-mb-primary" />
                <span>Consultas públicas, ofertas y seguimiento de operaciones en un solo lugar.</span>
              </li>
              <li className="flex items-start gap-3">
                <span className="mt-1 h-2 w-2 rounded-full bg-mb-primary" />
                <span>Soporte humano para ayudarte en logística, pagos y postventa.</span>
              </li>
            </ul>
            <p className="text-xs text-white/40">
              ¿Ya tenés cuenta?{' '}
              <Link to="/login" className="font-semibold text-white hover:text-white/80">
                Ingresá acá
              </Link>
            </p>
          </div>

          <div className="relative overflow-hidden rounded-[32px] border border-white/10 bg-white/10 p-8 text-white shadow-[0_25px_60px_rgba(9,18,27,0.45)] backdrop-blur">
            <div className="absolute inset-0 -z-10 bg-[linear-gradient(180deg,rgba(255,255,255,0.08),transparent)]" />
            <div className="space-y-6">
              <div>
                <h2 className="text-2xl font-bold text-white">Crear cuenta</h2>
                <p className="mt-1 text-sm text-white/70">
                  Elegí cómo querés registrarte. Podés modificar tus datos cuando quieras.
                </p>
              </div>

              {error && (
                <div className="rounded-lg border border-red-200 bg-red-50 px-3 py-2 text-sm text-red-600">
                  {error}
                </div>
              )}
              {success && (
                <div className="rounded-lg border border-green-200 bg-green-50 px-3 py-2 text-sm text-green-700">
                  <p>
                    Te enviamos un correo a <b>{email}</b>. Por favor, revisá tu bandeja (y spam) y verificá tu cuenta para continuar.
                  </p>
                  <div className="mt-2">
                    <Link to="/verificar-email" className="font-semibold text-green-700 underline hover:text-green-800">
                      Ver instrucciones y reenviar correo
                    </Link>
                  </div>
                </div>
              )}

              <SocialAuthButtons
                buttons={[
                  {
                    id: 'google',
                    label: 'Registrarme con Google',
                    loading: Boolean(socialLoading.google),
                    onClick: () => void loginWithProvider('google')
                  },
                  {
                    id: 'facebook',
                    label: 'Registrarme con Facebook',
                    loading: Boolean(socialLoading.facebook),
                    onClick: () => void loginWithProvider('facebook')
                  },
                ]}
              />

              <div className="relative flex items-center gap-3 text-[11px] font-semibold uppercase tracking-[0.35em] text-white/40">
                <span className="h-px flex-1 bg-white/15" />
                <span>o completá el formulario</span>
                <span className="h-px flex-1 bg-white/15" />
              </div>

              <div className="space-y-5">
                <label className="label !text-white">
                  Nombre completo
                  <input
                    className={fieldClass}
                    value={fullName}
                    onChange={(e) => setFullName(e.target.value)}
                    placeholder="Ej: Ana Pérez"
                  />
                </label>

                <label className="label !text-white">
                  Email
                  <input
                    className={fieldClass}
                    type="email"
                    value={email}
                    onChange={(e) => setEmail(e.target.value)}
                    placeholder="tu@email.com"
                  />
                </label>

                <div>
                  <label className="label !text-white">Contraseña</label>
                  <input
                    className={fieldClass}
                    type="password"
                    value={password}
                    onChange={(e) => setPassword(e.target.value)}
                    placeholder="Ingresá una contraseña segura"
                  />
                  <div className="mt-2 space-y-1 text-xs">
                    <PasswordHint ok={passwordChecks.length}>Al menos 8 caracteres</PasswordHint>
                    <PasswordHint ok={passwordChecks.upper}>Una letra mayúscula</PasswordHint>
                    <PasswordHint ok={passwordChecks.lower}>Una letra minúscula</PasswordHint>
                    <PasswordHint ok={passwordChecks.number}>Al menos un número</PasswordHint>
                  </div>
                </div>

                <label className="label !text-white">
                  Repetí la contraseña
                  <input
                    className={fieldClass}
                    type="password"
                    value={confirmPassword}
                    onChange={(e) => setConfirmPassword(e.target.value)}
                    placeholder="Confirmá la contraseña"
                  />
                </label>

                <div className="grid gap-4 md:grid-cols-2">
                  <label className="label !text-white">
                    Provincia
                    <select
                      className={selectClass}
                      value={province}
                      onChange={(e) => onProvinceChange(e.target.value)}
                    >
                      <option value="">Seleccionar provincia</option>
                      {PROVINCES.map((prov) => (
                        <option key={prov.name} value={prov.name}>
                          {prov.name}
                        </option>
                      ))}
                    </select>
                  </label>
                  <label className="label !text-white">
                    Ciudad
                    <select
                      className={selectClass}
                      value={city}
                      onChange={(e) => setCity(e.target.value)}
                      disabled={!province}
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
                  <label className="label !text-white">
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
                  <div className="label !text-white">¿Qué bici te interesa?</div>
                  {/* Mobile: selector para agregar preferencias de a una */}
                  <div className="sm:hidden">
                    <select
                      className="select"
                      value=""
                      onChange={(e) => { const v = e.target.value as (typeof BIKE_CATEGORIES)[number] | ''; if (v) toggleBikePref(v) }}
                    >
                      <option value="">Agregar categoría…</option>
                      {BIKE_CATEGORIES.map((cat) => (
                        <option key={cat} value={cat}>{cat}</option>
                      ))}
                    </select>
                    {bikePrefs.length > 0 && (
                      <div className="mt-2 flex flex-wrap gap-2">
                        {bikePrefs.map((cat) => (
                          <span key={cat} className="badge">
                            {cat}
                            <button type="button" className="ml-1" onClick={() => toggleBikePref(cat)}>✕</button>
                          </span>
                        ))}
                      </div>
                    )}
                  </div>
                  {/* Desktop/Tablet: grilla de checkboxes */}
                  <div className="mt-2 hidden gap-2 sm:grid sm:grid-cols-2">
                    {BIKE_CATEGORIES.map((cat) => {
                      const checked = bikePrefs.includes(cat)
                      return (
                        <label
                          key={cat}
                          className={`flex items-center gap-2 rounded-xl border px-3 py-2 text-sm transition ${
                            checked
                              ? 'border-mb-primary bg-mb-primary/10 text-mb-primary'
                              : 'border-white/15 text-white/80 hover:border-mb-primary/40'
                          }`}
                        >
                          <input
                            type="checkbox"
                            className="accent-mb-primary"
                            checked={checked}
                            onChange={() => toggleBikePref(cat)}
                          />
                          <span>{cat}</span>
                        </label>
                      )
                    })}
                  </div>
                  <p className="mt-1 text-xs text-white/70">Podés elegir varias categorías.</p>
                </div>

                <label className="flex items-start gap-2 rounded-xl border border-white/15 bg-white/5 px-3 py-3 text-sm text-white">
                  <input
                    type="checkbox"
                    className="mt-1 accent-mb-primary"
                    checked={acceptedTerms}
                    onChange={(e) => setAcceptedTerms(e.target.checked)}
                  />
                  <span>
                    Acepto los{' '}
                    <Link to="/terminos" className="font-semibold underline text-white" target="_blank" rel="noopener noreferrer">
                      términos y condiciones
                    </Link>
                    .
                  </span>
                </label>

                <label className="flex items-start gap-2 rounded-xl border border-white/15 bg-white/5 px-3 py-3 text-sm text-white">
                  <input
                    type="checkbox"
                    className="mt-1 accent-mb-primary"
                    checked={newsletterOptIn}
                    onChange={(e) => setNewsletterOptIn(e.target.checked)}
                  />
                  <span>
                    Quiero recibir novedades por mail (ofertas y lanzamientos).
                  </span>
                </label>

                <Button onClick={register} className="w-full" disabled={loading}>
                  {loading ? 'Creando cuenta…' : 'Crear cuenta'}
                </Button>
              </div>
            </div>
          </div>
        </div>
      </Container>
    </div>
  )
}

function PasswordHint({ ok, children }: { ok: boolean; children: ReactNode }) {
  return (
    <div className={`flex items-center gap-2 ${ok ? 'text-green-500' : 'text-white/60'}`}>
      <span className={`inline-flex h-4 w-4 items-center justify-center rounded-full border text-[10px] font-semibold ${ok ? 'border-green-500 bg-green-500 text-white' : 'border-white/30 text-white/70'}`}>
        {ok ? '✓' : ''}
      </span>
      <span>{children}</span>
    </div>
  )
}
