// src/pages/StoreOnboarding.tsx
import { useCallback, useEffect, useRef, useState, type ReactNode } from 'react'
import { Link } from 'react-router-dom'
import { ArrowRight, BadgeCheck, Building2, ChevronLeft, Globe, Image, Mail, Phone, Sparkles, Store, Tag } from 'lucide-react'
import { useAuth } from '../context/AuthContext'
import { getSupabaseClient, supabaseEnabled } from '../services/supabase'
import { uploadStoreAvatar, uploadStoreBanner } from '../services/storage'
import { syncProfileFromAuthUser } from '../utils/authProfile'
import { PROVINCES, OTHER_CITY_OPTION } from '../constants/locations'
import Button from '../components/Button'
import Container from '../components/Container'

const BASE = import.meta.env.VITE_API_BASE_URL || ''

const MONTHLY_PRICE = 30000
const YEARLY_PRICE = 300000
const YEARLY_FULL = MONTHLY_PRICE * 12
const YEARLY_SAVING = YEARLY_FULL - YEARLY_PRICE

const COUNTRY_CODES = [
  { cc: 'AR', dial: '54', label: 'Argentina', flag: '🇦🇷' },
  { cc: 'PY', dial: '595', label: 'Paraguay', flag: '🇵🇾' },
  { cc: 'BR', dial: '55', label: 'Brasil', flag: '🇧🇷' },
  { cc: 'CL', dial: '56', label: 'Chile', flag: '🇨🇱' },
  { cc: 'UY', dial: '598', label: 'Uruguay', flag: '🇺🇾' },
  { cc: 'PE', dial: '51', label: 'Perú', flag: '🇵🇪' },
  { cc: 'VE', dial: '58', label: 'Venezuela', flag: '🇻🇪' },
  { cc: 'US', dial: '1', label: 'Estados Unidos', flag: '🇺🇸' },
] as const

function formatARS(n: number) {
  return '$' + n.toLocaleString('es-AR')
}

function slugify(str: string) {
  return str
    .toLowerCase()
    .normalize('NFD')
    .replace(/[̀-ͯ]/g, '')
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/(^-+|-+$)/g, '')
}

// ─── Step indicator ───────────────────────────────────────────────────────────

function StepDot({ n, active, done }: { n: number; active: boolean; done: boolean }) {
  return (
    <div className="flex flex-col items-center gap-1">
      <div
        className={`flex h-8 w-8 items-center justify-center rounded-full text-sm font-semibold transition-colors ${
          done
            ? 'bg-emerald-500 text-white'
            : active
            ? 'bg-[#14212e] text-white'
            : 'bg-gray-200 text-gray-500'
        }`}
      >
        {done ? <BadgeCheck className="h-4 w-4" /> : n}
      </div>
    </div>
  )
}

function StepBar({ step }: { step: number }) {
  const labels = ['Tu tienda', 'Tu imagen', 'Elegí tu plan']
  return (
    <div className="flex items-start justify-center gap-0">
      {labels.map((label, i) => (
        <div key={i} className="flex items-center">
          <div className="flex flex-col items-center gap-1">
            <StepDot n={i + 1} active={step === i + 1} done={step > i + 1} />
            <span
              className={`text-xs font-medium ${
                step === i + 1 ? 'text-[#14212e]' : step > i + 1 ? 'text-emerald-600' : 'text-gray-400'
              }`}
            >
              {label}
            </span>
          </div>
          {i < labels.length - 1 && (
            <div
              className={`mx-3 mb-4 h-0.5 w-12 transition-colors ${
                step > i + 1 ? 'bg-emerald-400' : 'bg-gray-200'
              }`}
            />
          )}
        </div>
      ))}
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

// ─── Image drop zone ──────────────────────────────────────────────────────────

interface DropZoneProps {
  label: string
  hint: string
  previewUrl: string | null
  uploading: boolean
  aspectClass: string
  onFile: (file: File) => void
}

function DropZone({ label, hint, previewUrl, uploading, aspectClass, onFile }: DropZoneProps) {
  const inputRef = useRef<HTMLInputElement>(null)
  const [dragging, setDragging] = useState(false)

  const handleDrop = (e: React.DragEvent) => {
    e.preventDefault()
    setDragging(false)
    const file = e.dataTransfer.files?.[0]
    if (file?.type.startsWith('image/')) onFile(file)
  }

  return (
    <div>
      <p className="mb-1.5 text-sm font-medium text-gray-700">{label}</p>
      <div
        className={`relative ${aspectClass} w-full cursor-pointer overflow-hidden rounded-xl border-2 transition-colors ${
          dragging ? 'border-[#14212e] bg-blue-50' : 'border-dashed border-gray-300 bg-gray-50 hover:border-gray-400'
        }`}
        onClick={() => inputRef.current?.click()}
        onDragOver={(e) => { e.preventDefault(); setDragging(true) }}
        onDragLeave={() => setDragging(false)}
        onDrop={handleDrop}
      >
        {previewUrl ? (
          <img src={previewUrl} alt="" className="h-full w-full object-cover" />
        ) : (
          <div className="flex h-full flex-col items-center justify-center gap-2 p-4 text-center">
            <Image className="h-8 w-8 text-gray-400" />
            <p className="text-sm text-gray-500">{uploading ? 'Subiendo…' : 'Arrastrá o hacé clic para subir'}</p>
            <p className="text-xs text-gray-400">{hint}</p>
          </div>
        )}
        {uploading && (
          <div className="absolute inset-0 flex items-center justify-center bg-white/70">
            <div className="h-6 w-6 animate-spin rounded-full border-2 border-[#14212e] border-t-transparent" />
          </div>
        )}
      </div>
      <input ref={inputRef} type="file" accept="image/*" className="hidden" onChange={(e) => {
        const f = e.target.files?.[0]
        if (f) onFile(f)
      }} />
      {previewUrl && (
        <button
          type="button"
          className="mt-1 text-xs text-gray-400 hover:text-red-500"
          onClick={(e) => { e.stopPropagation(); onFile(null as unknown as File) }}
        >
          Quitar imagen
        </button>
      )}
    </div>
  )
}

// ─── Plan card ────────────────────────────────────────────────────────────────

interface PlanCardProps {
  planType: 'monthly' | 'yearly'
  loading: boolean
  onSelect: (plan: 'monthly' | 'yearly') => void
}

function PlanCard({ planType, loading, onSelect }: PlanCardProps) {
  const isYearly = planType === 'yearly'
  return (
    <div
      className={`relative flex flex-col rounded-2xl border-2 p-6 transition-shadow hover:shadow-md ${
        isYearly ? 'border-[#14212e] bg-[#14212e] text-white' : 'border-gray-200 bg-white text-gray-900'
      }`}
    >
      {isYearly && (
        <div className="absolute -top-3 left-1/2 -translate-x-1/2">
          <span className="flex items-center gap-1 rounded-full bg-amber-400 px-3 py-0.5 text-xs font-bold text-amber-900">
            <Sparkles className="h-3 w-3" /> PROMO – 2 meses gratis
          </span>
        </div>
      )}

      <p className={`text-sm font-semibold uppercase tracking-wide ${isYearly ? 'text-white/70' : 'text-gray-500'}`}>
        {isYearly ? 'Anual' : 'Mensual'}
      </p>
      <div className="mt-2 flex items-end gap-1">
        <span className="text-4xl font-bold">{formatARS(isYearly ? YEARLY_PRICE : MONTHLY_PRICE)}</span>
        <span className={`mb-1 text-sm ${isYearly ? 'text-white/60' : 'text-gray-400'}`}>
          /{isYearly ? 'año' : 'mes'}
        </span>
      </div>
      {isYearly && (
        <p className="mt-1 text-sm text-amber-300">
          Ahorrás {formatARS(YEARLY_SAVING)} vs mensual
        </p>
      )}
      {!isYearly && (
        <p className={`mt-1 text-sm ${isYearly ? 'text-white/60' : 'text-gray-400'}`}>
          Sin permanencia
        </p>
      )}

      <ul className={`mt-4 space-y-2 text-sm ${isYearly ? 'text-white/80' : 'text-gray-600'}`}>
        {[
          'Publicaciones ilimitadas',
          'Plan PRO en todos tus productos',
          'WhatsApp directo en cada publicación',
          'Tienda verificada con badge oficial',
          'Difusión en redes de Ciclo Market',
        ].map((f) => (
          <li key={f} className="flex items-start gap-2">
            <BadgeCheck className={`mt-0.5 h-4 w-4 flex-shrink-0 ${isYearly ? 'text-amber-400' : 'text-emerald-500'}`} />
            {f}
          </li>
        ))}
      </ul>

      <Button
        className={`mt-6 w-full ${
          isYearly
            ? 'bg-amber-400 text-amber-900 hover:bg-amber-300'
            : 'bg-[#14212e] text-white hover:bg-[#1b2f3f]'
        }`}
        disabled={loading}
        onClick={() => onSelect(planType)}
      >
        {loading ? (
          <span className="flex items-center justify-center gap-2">
            <span className="h-4 w-4 animate-spin rounded-full border-2 border-current border-t-transparent" />
            Redirigiendo…
          </span>
        ) : (
          <span className="flex items-center justify-center gap-1">
            {isYearly ? 'Empezar anual' : 'Empezar mensual'}
            <ArrowRight className="h-4 w-4" />
          </span>
        )}
      </Button>
    </div>
  )
}

// ─── Form data type ───────────────────────────────────────────────────────────

interface FormData {
  storeName: string
  storeDescription: string
  province: string
  city: string
  cityOther: string
  whatsappLocal: string
  storeWebsite: string
  storeInstagram: string
  storeAvatarUrl: string
  storeBannerUrl: string
}

// ─── Main component ───────────────────────────────────────────────────────────

export default function StoreOnboarding() {
  const { user, loading: authLoading } = useAuth()

  const [step, setStep] = useState(1)
  const [whatsappDial, setWhatsappDial] = useState('54')
  const [form, setForm] = useState<FormData>({
    storeName: '',
    storeDescription: '',
    province: '',
    city: '',
    cityOther: '',
    whatsappLocal: '',
    storeWebsite: '',
    storeInstagram: '',
    storeAvatarUrl: '',
    storeBannerUrl: '',
  })
  const [avatarUploading, setAvatarUploading] = useState(false)
  const [bannerUploading, setBannerUploading] = useState(false)
  const [submitting, setSubmitting] = useState(false)
  const [error, setError] = useState<string | null>(null)

  // ── Cuenta (solo para visitantes sin sesión) ─────────────────────────────────
  const [accountMode, setAccountMode] = useState<'signup' | 'login'>('signup')
  const [accountFullName, setAccountFullName] = useState('')
  const [accountEmail, setAccountEmail] = useState('')
  const [accountPassword, setAccountPassword] = useState('')
  const [accountConfirmPassword, setAccountConfirmPassword] = useState('')
  const [acceptedTerms, setAcceptedTerms] = useState(false)
  const [accountError, setAccountError] = useState<string | null>(null)
  const [accountSubmitting, setAccountSubmitting] = useState(false)
  const [googleLoading, setGoogleLoading] = useState(false)
  const [awaitingEmailConfirmation, setAwaitingEmailConfirmation] = useState(false)
  const [resendingEmail, setResendingEmail] = useState(false)

  const passwordChecks = {
    length: accountPassword.length >= 8,
    upper: /[A-Z]/.test(accountPassword),
    lower: /[a-z]/.test(accountPassword),
    number: /\d/.test(accountPassword),
  }
  const passwordValid = Object.values(passwordChecks).every(Boolean)

  const set = useCallback((key: keyof FormData, value: string) => {
    setForm((prev) => ({ ...prev, [key]: value }))
  }, [])

  // Cuando el usuario recién se autentica (signup/login/Google/link de email),
  // sincronizamos su perfil una vez. No hace falta restaurar ningún borrador:
  // la cuenta se crea ANTES de que exista cualquier dato de tienda cargado.
  useEffect(() => {
    if (!user) return
    setAwaitingEmailConfirmation(false)
    void syncProfileFromAuthUser(user)
  }, [user])

  const slugPreview = slugify(form.storeName)

  // ── Image uploads ────────────────────────────────────────────────────────────

  const handleAvatarFile = async (file: File | null) => {
    if (!file) { set('storeAvatarUrl', ''); return }
    if (!user) return
    setAvatarUploading(true)
    try {
      const url = await uploadStoreAvatar(file, user.id)
      if (url) set('storeAvatarUrl', url)
    } catch {
      setError('No se pudo subir el logo.')
    } finally {
      setAvatarUploading(false)
    }
  }

  const handleBannerFile = async (file: File | null) => {
    if (!file) { set('storeBannerUrl', ''); return }
    if (!user) return
    setBannerUploading(true)
    try {
      const url = await uploadStoreBanner(file, user.id)
      if (url) set('storeBannerUrl', url)
    } catch {
      setError('No se pudo subir la imagen de portada.')
    } finally {
      setBannerUploading(false)
    }
  }

  // ── Cuenta: gate de login/registro previo al formulario de tienda ───────────

  const handleAuthSubmit = async () => {
    if (!supabaseEnabled) { setAccountError('Registro deshabilitado: configurá Supabase.'); return }
    setAccountError(null)
    const supabase = getSupabaseClient()

    if (accountMode === 'login') {
      if (!accountEmail.trim() || !accountPassword) {
        setAccountError('Completá tu email y contraseña.')
        return
      }
      setAccountSubmitting(true)
      try {
        const { error: signInError } = await supabase.auth.signInWithPassword({
          email: accountEmail.trim(),
          password: accountPassword,
        })
        if (signInError) setAccountError('Email o contraseña incorrectos.')
        // Si no hubo error, useAuth() detecta la nueva sesión y este
        // componente re-renderiza directo al formulario de tienda.
      } catch {
        setAccountError('Error de conexión. Intentá de nuevo.')
      } finally {
        setAccountSubmitting(false)
      }
      return
    }

    // Modo signup
    if (!accountFullName.trim()) { setAccountError('Ingresá tu nombre completo.'); return }
    if (!accountEmail.trim() || !accountEmail.includes('@')) { setAccountError('Ingresá un email válido.'); return }
    if (!passwordValid) { setAccountError('La contraseña debe cumplir con los requisitos de seguridad.'); return }
    if (accountPassword !== accountConfirmPassword) { setAccountError('Las contraseñas no coinciden.'); return }
    if (!acceptedTerms) { setAccountError('Debés aceptar los términos y condiciones.'); return }

    setAccountSubmitting(true)
    try {
      const { data, error: signUpError } = await supabase.auth.signUp({
        email: accountEmail.trim(),
        password: accountPassword,
        options: {
          data: { full_name: accountFullName.trim() },
          emailRedirectTo: `${window.location.origin}/tienda/nueva`,
        },
      })

      if (signUpError) {
        if (/already registered|already exists/i.test(signUpError.message || '')) {
          setAccountMode('login')
          setAccountError('Ya existe una cuenta con este email. Iniciá sesión para continuar.')
        } else {
          setAccountError(signUpError.message || 'No pudimos crear tu cuenta.')
        }
        return
      }

      // Supabase devuelve un user con identities vacío cuando el email ya existe
      // (para no filtrar qué emails están registrados).
      if (data.user && Array.isArray(data.user.identities) && data.user.identities.length === 0) {
        setAccountMode('login')
        setAccountError('Ya existe una cuenta con este email. Iniciá sesión para continuar.')
        return
      }

      if (!data.session) {
        // Confirmación de email requerida: pausamos hasta que confirme y
        // vuelva a esta misma página (todavía no hay datos de tienda que perder).
        setAwaitingEmailConfirmation(true)
        return
      }
      // Con sesión activa, useAuth() se actualiza y este componente
      // re-renderiza directo al formulario de tienda.
    } catch (e: any) {
      setAccountError(e?.message || 'Error de conexión. Intentá de nuevo.')
    } finally {
      setAccountSubmitting(false)
    }
  }

  const handleGoogleContinue = async () => {
    if (!supabaseEnabled) { setAccountError('Login deshabilitado: configurá Supabase.'); return }
    setAccountError(null)
    setGoogleLoading(true)
    try {
      const supabase = getSupabaseClient()
      const { error: oauthError } = await supabase.auth.signInWithOAuth({
        provider: 'google',
        options: { redirectTo: `${window.location.origin}/tienda/nueva` },
      })
      if (oauthError) {
        setAccountError(oauthError.message || 'No pudimos conectar con Google.')
        setGoogleLoading(false)
      }
      // Si no hay error, el navegador redirige a Google — no hay más que hacer acá.
    } catch (e: any) {
      setAccountError(e?.message || 'No pudimos conectar con Google.')
      setGoogleLoading(false)
    }
  }

  const handleResendConfirmation = async () => {
    if (!supabaseEnabled || !accountEmail.trim()) return
    setResendingEmail(true)
    try {
      const supabase = getSupabaseClient()
      await supabase.auth.resend({ type: 'signup', email: accountEmail.trim() })
    } catch { /* noop */ }
    finally {
      setResendingEmail(false)
    }
  }

  // ── Plan selection → pago ────────────────────────────────────────────────────

  const handleSelectPlan = async (planType: 'monthly' | 'yearly') => {
    if (!user) { setError('Tu sesión expiró. Volvé al Paso 1 para iniciar sesión de nuevo.'); return }
    setSubmitting(true)
    setError(null)
    try {
      const supabase = supabaseEnabled ? getSupabaseClient() : null
      const session = supabase ? (await supabase.auth.getSession()).data.session : null
      const token = session?.access_token

      const res = await fetch(`${BASE}/api/store/subscribe`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          ...(token ? { Authorization: `Bearer ${token}` } : {}),
        },
        body: JSON.stringify({
          planType,
          storeData: {
            storeName: form.storeName,
            province: form.province,
            city: form.city === OTHER_CITY_OPTION ? form.cityOther : form.city,
            whatsappNumber: form.whatsappLocal ? `${whatsappDial}${form.whatsappLocal.replace(/\D/g, '')}` : null,
            storeWebsite: form.storeWebsite,
            storeInstagram: form.storeInstagram,
            storeAvatarUrl: form.storeAvatarUrl,
            storeBannerUrl: form.storeBannerUrl,
          },
        }),
      })

      const data = await res.json()
      if (!data.ok || !data.url) {
        setError('No se pudo iniciar el pago. Intentá de nuevo.')
        return
      }

      window.location.href = data.url
    } catch {
      setError('Error de conexión. Verificá tu internet e intentá de nuevo.')
    } finally {
      setSubmitting(false)
    }
  }

  // ── Validation ───────────────────────────────────────────────────────────────

  const cityOptions = form.province
    ? (PROVINCES.find(p => p.name === form.province)?.cities ?? [])
    : []

  const step1Valid =
    form.storeName.trim().length >= 2 &&
    form.whatsappLocal.replace(/\D/g, '').length >= 8

  const accountFieldsValid = accountMode === 'login'
    ? accountEmail.trim().length > 0 && accountPassword.length > 0
    : accountFullName.trim().length > 0 &&
      accountEmail.trim().includes('@') &&
      passwordValid &&
      accountPassword === accountConfirmPassword &&
      acceptedTerms

  // ── Render ───────────────────────────────────────────────────────────────────

  if (authLoading) {
    return (
      <div className="flex min-h-[calc(100vh-64px)] items-center justify-center bg-[#f4f6f8]">
        <div className="h-8 w-8 animate-spin rounded-full border-2 border-[#14212e] border-t-transparent" />
      </div>
    )
  }

  // Sin sesión: gate de login/registro. El formulario de tienda recién se
  // muestra una vez autenticado (evita perder datos de tienda cargados antes
  // de un redirect completo de página, como el de Google OAuth).
  if (!user) {
    return (
      <div className="min-h-[calc(100vh-64px)] bg-[#f4f6f8] py-10">
        <Container>
          <div className="mx-auto max-w-md">
            <div className="mb-8 text-center">
              <div className="mb-3 flex justify-center">
                <div className="flex h-14 w-14 items-center justify-center rounded-2xl bg-[#14212e]">
                  <Store className="h-7 w-7 text-white" />
                </div>
              </div>
              <h1 className="text-2xl font-bold text-gray-900">Abrí tu tienda en Ciclo Market</h1>
              <p className="mt-1 text-gray-500">Primero, iniciá sesión o creá tu cuenta</p>
            </div>

            <div className="rounded-2xl bg-white p-6 shadow-sm ring-1 ring-gray-100">
              {awaitingEmailConfirmation ? (
                <div className="space-y-4 text-center">
                  <div className="mx-auto flex h-14 w-14 items-center justify-center rounded-2xl bg-blue-50">
                    <Mail className="h-7 w-7 text-[#14212e]" />
                  </div>
                  <h2 className="text-lg font-semibold text-gray-900">Confirmá tu cuenta</h2>
                  <p className="text-sm text-gray-600">
                    Te enviamos un link a <span className="font-medium text-gray-900">{accountEmail.trim()}</span>.
                    Abrilo desde este mismo dispositivo para volver acá y seguir con tu tienda.
                  </p>
                  {accountError && (
                    <div className="rounded-lg bg-red-50 px-4 py-3 text-sm text-red-700">{accountError}</div>
                  )}
                  <button
                    type="button"
                    disabled={resendingEmail}
                    onClick={handleResendConfirmation}
                    className="text-sm font-medium text-[#14212e] underline-offset-2 hover:underline disabled:opacity-60"
                  >
                    {resendingEmail ? 'Reenviando…' : '¿No te llegó? Reenviar email'}
                  </button>
                  <div>
                    <button
                      type="button"
                      onClick={() => setAwaitingEmailConfirmation(false)}
                      className="text-sm text-gray-400 hover:text-gray-600"
                    >
                      Volver
                    </button>
                  </div>
                </div>
              ) : (
                <div className="space-y-4">
                  <h2 className="text-lg font-semibold text-gray-900">
                    {accountMode === 'signup' ? 'Creá tu cuenta' : 'Iniciá sesión'}
                  </h2>

                  <button
                    type="button"
                    disabled={googleLoading}
                    onClick={handleGoogleContinue}
                    className="flex w-full items-center justify-center gap-2 rounded-lg border border-gray-300 bg-white px-4 py-2.5 text-sm font-medium text-gray-700 hover:bg-gray-50 disabled:opacity-60"
                  >
                    <svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 48 48" className="h-4 w-4" aria-hidden="true"><path fill="#FFC107" d="M43.6 20.5H42V20H24v8h11.3C34.5 31.9 30.7 35 26 35c-6.1 0-11-4.9-11-11s4.9-11 11-11c2.8 0 5.4 1.1 7.4 2.9l5.7-5.7C35.6 7 30.9 5 26 5 14.4 5 5 14.4 5 26s9.4 21 21 21 21-9.4 21-21c0-1.2-.1-2.3-.4-3.5z"/><path fill="#FF3D00" d="m6.3 14.7 6.6 4.8C14.5 15.3 19.8 12 26 12c2.8 0 5.4 1.1 7.4 2.9l5.7-5.7C35.6 7 30.9 5 26 5 17 5 9.1 9.7 6.3 14.7z"/><path fill="#4CAF50" d="M26 47c4.7 0 9-1.8 12.3-4.7l-5.7-5.7C30.7 37.9 28.4 39 26 39c-4.6 0-8.4-3.1-9.8-7.3l-6.6 5.1C12.3 42.5 18.7 47 26 47z"/><path fill="#1976D2" d="M43.6 20.5H42V20H24v8h11.3c-1.1 3.1-3.6 5.5-6.6 6.7l5.7 5.7C34.1 41.2 39 38 42 33c1.8-2.8 2.8-6.1 2.8-9.5 0-1.2-.1-2.3-.4-3.5z"/></svg>
                    {googleLoading ? 'Conectando…' : 'Continuar con Google'}
                  </button>

                  <div className="flex items-center gap-3 text-xs text-gray-400">
                    <div className="h-px flex-1 bg-gray-200" />
                    o con email
                    <div className="h-px flex-1 bg-gray-200" />
                  </div>

                  {accountMode === 'signup' && (
                    <div>
                      <label className="mb-1 block text-sm font-medium text-gray-700">Nombre completo</label>
                      <input
                        type="text"
                        value={accountFullName}
                        onChange={(e) => setAccountFullName(e.target.value)}
                        placeholder="Ej: Ana Pérez"
                        autoComplete="name"
                        className="w-full rounded-lg border border-gray-300 px-3 py-2.5 text-sm focus:border-[#14212e] focus:outline-none focus:ring-1 focus:ring-[#14212e]"
                      />
                    </div>
                  )}

                  <div>
                    <label className="mb-1 block text-sm font-medium text-gray-700">Email</label>
                    <input
                      type="email"
                      value={accountEmail}
                      onChange={(e) => setAccountEmail(e.target.value)}
                      placeholder="tu@email.com"
                      autoComplete="email"
                      className="w-full rounded-lg border border-gray-300 px-3 py-2.5 text-sm focus:border-[#14212e] focus:outline-none focus:ring-1 focus:ring-[#14212e]"
                    />
                  </div>

                  <div>
                    <label className="mb-1 block text-sm font-medium text-gray-700">Contraseña</label>
                    <input
                      type="password"
                      value={accountPassword}
                      onChange={(e) => setAccountPassword(e.target.value)}
                      placeholder={accountMode === 'signup' ? 'Ingresá una contraseña segura' : 'Tu contraseña'}
                      autoComplete={accountMode === 'signup' ? 'new-password' : 'current-password'}
                      className="w-full rounded-lg border border-gray-300 px-3 py-2.5 text-sm focus:border-[#14212e] focus:outline-none focus:ring-1 focus:ring-[#14212e]"
                    />
                    {accountMode === 'signup' && (
                      <div className="mt-2 space-y-1 text-xs">
                        <PasswordHint ok={passwordChecks.length}>Al menos 8 caracteres</PasswordHint>
                        <PasswordHint ok={passwordChecks.upper}>Una letra mayúscula</PasswordHint>
                        <PasswordHint ok={passwordChecks.lower}>Una letra minúscula</PasswordHint>
                        <PasswordHint ok={passwordChecks.number}>Al menos un número</PasswordHint>
                      </div>
                    )}
                  </div>

                  {accountMode === 'signup' && (
                    <div>
                      <label className="mb-1 block text-sm font-medium text-gray-700">Repetí la contraseña</label>
                      <input
                        type="password"
                        value={accountConfirmPassword}
                        onChange={(e) => setAccountConfirmPassword(e.target.value)}
                        placeholder="Confirmá la contraseña"
                        autoComplete="new-password"
                        className="w-full rounded-lg border border-gray-300 px-3 py-2.5 text-sm focus:border-[#14212e] focus:outline-none focus:ring-1 focus:ring-[#14212e]"
                      />
                    </div>
                  )}

                  {accountMode === 'signup' && (
                    <label className="flex items-start gap-2 rounded-xl border border-gray-200 bg-gray-50 px-3 py-3 text-sm text-gray-700">
                      <input
                        type="checkbox"
                        checked={acceptedTerms}
                        onChange={(e) => setAcceptedTerms(e.target.checked)}
                        className="mt-1 h-4 w-4 rounded border-gray-300 text-[#14212e] focus:ring-[#14212e]"
                      />
                      <span>
                        Acepto los{' '}
                        <Link to="/terminos" target="_blank" rel="noopener noreferrer" className="font-semibold text-gray-900 underline">
                          términos y condiciones
                        </Link>
                        .
                      </span>
                    </label>
                  )}

                  {accountError && (
                    <div className="rounded-lg bg-red-50 px-4 py-3 text-sm text-red-700">{accountError}</div>
                  )}

                  <Button
                    className="w-full bg-[#14212e] text-white hover:bg-[#1b2f3f]"
                    disabled={!accountFieldsValid || accountSubmitting}
                    onClick={handleAuthSubmit}
                  >
                    {accountSubmitting ? (
                      <span className="flex items-center justify-center gap-2">
                        <span className="h-4 w-4 animate-spin rounded-full border-2 border-current border-t-transparent" />
                        {accountMode === 'signup' ? 'Creando cuenta…' : 'Ingresando…'}
                      </span>
                    ) : (
                      <span className="flex items-center justify-center gap-1">
                        {accountMode === 'signup' ? 'Crear cuenta y continuar' : 'Ingresar'}
                        <ArrowRight className="ml-1 h-4 w-4" />
                      </span>
                    )}
                  </Button>

                  <button
                    type="button"
                    onClick={() => { setAccountMode(accountMode === 'signup' ? 'login' : 'signup'); setAccountError(null) }}
                    className="w-full text-center text-sm text-gray-500 hover:text-gray-700"
                  >
                    {accountMode === 'signup' ? '¿Ya tenés cuenta? Iniciá sesión' : '¿Todavía no tenés cuenta? Registrate'}
                  </button>
                </div>
              )}
            </div>
          </div>
        </Container>
      </div>
    )
  }

  return (
    <div className="min-h-[calc(100vh-64px)] bg-[#f4f6f8] py-10">
      <Container>
        <div className="mx-auto max-w-xl">
          {/* Header */}
          <div className="mb-8 text-center">
            <div className="mb-3 flex justify-center">
              <div className="flex h-14 w-14 items-center justify-center rounded-2xl bg-[#14212e]">
                <Store className="h-7 w-7 text-white" />
              </div>
            </div>
            <h1 className="text-2xl font-bold text-gray-900">Abrí tu tienda en Ciclo Market</h1>
            <p className="mt-1 text-gray-500">Solo te lleva unos minutos</p>
          </div>

          {/* Step bar */}
          <StepBar step={step} />

          {/* Card */}
          <div className="mt-8 rounded-2xl bg-white p-6 shadow-sm ring-1 ring-gray-100">

            {/* ── PASO 1 ── */}
            {step === 1 && (
              <div className="space-y-4">
                <h2 className="flex items-center gap-2 text-lg font-semibold text-gray-900">
                  <Building2 className="h-5 w-5 text-gray-500" /> Tu tienda
                </h2>

                {/* Nombre */}
                <div>
                  <label className="mb-1 block text-sm font-medium text-gray-700">
                    Nombre de la tienda <span className="text-red-500">*</span>
                  </label>
                  <input
                    type="text"
                    value={form.storeName}
                    onChange={(e) => set('storeName', e.target.value)}
                    placeholder="Ej: BiciWorld Rosario"
                    maxLength={60}
                    className="w-full rounded-lg border border-gray-300 px-3 py-2.5 text-sm focus:border-[#14212e] focus:outline-none focus:ring-1 focus:ring-[#14212e]"
                  />
                  {slugPreview && (
                    <p className="mt-1 text-xs text-gray-400">
                      Tu URL: <span className="font-medium text-gray-600">ciclomarket.ar/tienda/{slugPreview}</span>
                    </p>
                  )}
                </div>

                {/* Descripción */}
                <div>
                  <label className="mb-1 block text-sm font-medium text-gray-700">
                    Descripción corta
                    <span className="ml-1 font-normal text-gray-400">({form.storeDescription.length}/200)</span>
                  </label>
                  <textarea
                    value={form.storeDescription}
                    onChange={(e) => set('storeDescription', e.target.value)}
                    placeholder="Contá brevemente qué hacés y dónde estás"
                    maxLength={200}
                    rows={3}
                    className="w-full resize-none rounded-lg border border-gray-300 px-3 py-2.5 text-sm focus:border-[#14212e] focus:outline-none focus:ring-1 focus:ring-[#14212e]"
                  />
                </div>

                {/* Provincia y ciudad */}
                <div className="grid grid-cols-2 gap-3">
                  <div>
                    <label className="mb-1 block text-sm font-medium text-gray-700">Provincia</label>
                    <select
                      value={form.province}
                      onChange={(e) => { set('province', e.target.value); set('city', ''); set('cityOther', '') }}
                      className="w-full rounded-lg border border-gray-300 px-3 py-2.5 text-sm focus:border-[#14212e] focus:outline-none focus:ring-1 focus:ring-[#14212e]"
                    >
                      <option value="">Seleccioná</option>
                      {PROVINCES.map((p) => <option key={p.name} value={p.name}>{p.name}</option>)}
                    </select>
                  </div>
                  <div>
                    <label className="mb-1 block text-sm font-medium text-gray-700">Ciudad</label>
                    <select
                      value={form.city}
                      onChange={(e) => set('city', e.target.value)}
                      disabled={!form.province}
                      className="w-full rounded-lg border border-gray-300 px-3 py-2.5 text-sm focus:border-[#14212e] focus:outline-none focus:ring-1 focus:ring-[#14212e] disabled:bg-gray-50 disabled:text-gray-400"
                    >
                      <option value="">{form.province ? 'Seleccioná' : 'Elegí provincia primero'}</option>
                      {cityOptions.map((c) => <option key={c} value={c}>{c}</option>)}
                    </select>
                  </div>
                </div>
                {form.city === OTHER_CITY_OPTION && (
                  <input
                    type="text"
                    value={form.cityOther}
                    onChange={(e) => set('cityOther', e.target.value)}
                    placeholder="Ingresá tu ciudad"
                    className="w-full rounded-lg border border-gray-300 px-3 py-2.5 text-sm focus:border-[#14212e] focus:outline-none focus:ring-1 focus:ring-[#14212e]"
                  />
                )}

                {/* WhatsApp */}
                <div>
                  <label className="mb-1 flex items-center gap-1 text-sm font-medium text-gray-700">
                    <Phone className="h-3.5 w-3.5" />
                    WhatsApp de la tienda <span className="text-red-500">*</span>
                  </label>
                  <div className="flex gap-2">
                    <select
                      value={whatsappDial}
                      onChange={(e) => setWhatsappDial(e.target.value)}
                      className="w-28 flex-shrink-0 rounded-lg border border-gray-300 px-2 py-2.5 text-sm focus:border-[#14212e] focus:outline-none focus:ring-1 focus:ring-[#14212e]"
                    >
                      {COUNTRY_CODES.map((c) => (
                        <option key={c.cc} value={c.dial}>
                          {c.flag} +{c.dial}
                        </option>
                      ))}
                    </select>
                    <input
                      type="tel"
                      value={form.whatsappLocal}
                      onChange={(e) => set('whatsappLocal', e.target.value)}
                      placeholder="11 1234-5678"
                      className="min-w-0 flex-1 rounded-lg border border-gray-300 px-3 py-2.5 text-sm focus:border-[#14212e] focus:outline-none focus:ring-1 focus:ring-[#14212e]"
                    />
                  </div>
                  <p className="mt-1 text-xs text-gray-400">Sin el 0 ni el 15. Ej: 11 1234-5678</p>
                </div>

                {/* Instagram */}
                <div>
                  <label className="mb-1 flex items-center gap-1 text-sm font-medium text-gray-700">
                    <Tag className="h-3.5 w-3.5" />
                    Instagram (sin @)
                  </label>
                  <input
                    type="text"
                    value={form.storeInstagram}
                    onChange={(e) => set('storeInstagram', e.target.value)}
                    placeholder="tutienda"
                    className="w-full rounded-lg border border-gray-300 px-3 py-2.5 text-sm focus:border-[#14212e] focus:outline-none focus:ring-1 focus:ring-[#14212e]"
                  />
                </div>

                {/* Sitio web */}
                <div>
                  <label className="mb-1 flex items-center gap-1 text-sm font-medium text-gray-700">
                    <Globe className="h-3.5 w-3.5" />
                    Sitio web (opcional)
                  </label>
                  <input
                    type="url"
                    value={form.storeWebsite}
                    onChange={(e) => set('storeWebsite', e.target.value)}
                    placeholder="https://tutienda.com.ar"
                    className="w-full rounded-lg border border-gray-300 px-3 py-2.5 text-sm focus:border-[#14212e] focus:outline-none focus:ring-1 focus:ring-[#14212e]"
                  />
                </div>

                <Button
                  className="mt-2 w-full bg-[#14212e] text-white hover:bg-[#1b2f3f]"
                  disabled={!step1Valid}
                  onClick={() => setStep(2)}
                >
                  Siguiente <ArrowRight className="ml-1 h-4 w-4" />
                </Button>
              </div>
            )}

            {/* ── PASO 2 ── */}
            {step === 2 && (
              <div className="space-y-5">
                <div className="flex items-center gap-2">
                  <button
                    onClick={() => setStep(1)}
                    className="flex items-center gap-1 text-sm text-gray-400 hover:text-gray-700"
                  >
                    <ChevronLeft className="h-4 w-4" />
                  </button>
                  <h2 className="text-lg font-semibold text-gray-900">Tu imagen</h2>
                </div>

                <DropZone
                  label="Logo de la tienda"
                  hint="Formato cuadrado recomendado · JPG, PNG o WebP"
                  previewUrl={form.storeAvatarUrl || null}
                  uploading={avatarUploading}
                  aspectClass="aspect-square max-w-[180px]"
                  onFile={handleAvatarFile}
                />

                <DropZone
                  label="Imagen de portada (opcional)"
                  hint="Formato panorámico recomendado · mín. 1200px de ancho"
                  previewUrl={form.storeBannerUrl || null}
                  uploading={bannerUploading}
                  aspectClass="aspect-[3/1]"
                  onFile={handleBannerFile}
                />

                <p className="text-xs text-gray-400">
                  Podés subir las imágenes ahora o completarlas después desde tu Dashboard.
                </p>

                <div className="flex gap-3">
                  <Button variant="ghost" onClick={() => setStep(1)} className="flex-1">
                    Atrás
                  </Button>
                  <Button
                    className="flex-1 bg-[#14212e] text-white hover:bg-[#1b2f3f]"
                    onClick={() => setStep(3)}
                  >
                    Siguiente <ArrowRight className="ml-1 h-4 w-4" />
                  </Button>
                </div>
              </div>
            )}

            {/* ── PASO 3 ── */}
            {step === 3 && (
              <div className="space-y-4">
                <div className="flex items-center gap-2">
                  <button
                    onClick={() => setStep(2)}
                    className="flex items-center gap-1 text-sm text-gray-400 hover:text-gray-700"
                  >
                    <ChevronLeft className="h-4 w-4" />
                  </button>
                  <h2 className="text-lg font-semibold text-gray-900">Elegí tu plan</h2>
                </div>

                {error && (
                  <div className="rounded-lg bg-red-50 px-4 py-3 text-sm text-red-700">
                    {error}
                  </div>
                )}

                <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
                  <PlanCard planType="monthly" loading={submitting} onSelect={handleSelectPlan} />
                  <PlanCard planType="yearly" loading={submitting} onSelect={handleSelectPlan} />
                </div>

                <p className="text-center text-xs text-gray-400">
                  El pago es procesado de forma segura por MercadoPago.
                  Podés cancelar en cualquier momento.
                </p>
              </div>
            )}
          </div>

          {/* Demo link */}
          <p className="mt-6 text-center text-sm text-gray-400">
            ¿Preferís hablar primero?{' '}
            <a
              href="https://wa.me/5493764748459?text=Hola%2C+me+interesa+abrir+mi+tienda+en+Ciclo+Market.+%C2%BFPodemos+coordinar+una+demo%3F"
              target="_blank"
              rel="noopener noreferrer"
              className="text-[#14212e] underline-offset-2 hover:underline"
            >
              Solicitá una demo por WhatsApp
            </a>
          </p>
        </div>
      </Container>
    </div>
  )
}
