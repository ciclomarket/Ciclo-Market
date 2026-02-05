import { Link, useNavigate, useLocation } from 'react-router-dom'
import { useEffect, useMemo, useRef, useState } from 'react'
import { createPortal } from 'react-dom'
import { KEYWORDS } from '../data/keywords'
import { BIKE_CATEGORIES } from '../constants/catalog'
import { OTHER_CITY_OPTION, PROVINCES } from '../constants/locations'
import { useAuth } from '../context/AuthContext'
import { getSupabaseClient, supabaseEnabled, setAuthPersistence } from '../services/supabase'
import { createUserProfile, fetchStores, type StoreSummary } from '../services/users'
import { fetchListings } from '../services/listings'
import { fetchMyCredits } from '../services/credits'
import { useToast } from '../context/ToastContext'
import { SocialAuthButtons } from './SocialAuthButtons'
import { deriveProfileSlug, pickDiscipline } from '../utils/user'

type MegaCol = { title: string; links: Array<{ label: string; to: string }> }
type MegaItem = { label: string; cols: MegaCol[] }

const BIKE_CATEGORY_LINKS: Array<{ label: string; to: string }> = (() => {
  const base = Array.from(BIKE_CATEGORIES).map((c) => ({ label: c, to: `/marketplace?cat=${encodeURIComponent(c)}` }))
  return base
})()

const MEGA: MegaItem[] = [
  {
    label: 'Bicicletas',
    cols: [
      {
        title: 'Categorías',
        links: [
          { label: 'Ver todas las bicicletas', to: '/marketplace?bikes=1' },
          ...BIKE_CATEGORY_LINKS,
        ],
      },
      {
        title: 'Filtros especiales',
        links: [
          { label: 'Bicicletas de carbono', to: '/marketplace?bikes=1&material=Carbono' },
          { label: 'Bicicletas de aluminio', to: '/marketplace?bikes=1&material=Aluminio' },
          { label: 'Transmisión electrónica', to: '/marketplace?bikes=1&transmissionType=Electr%C3%B3nica' },
          { label: 'Transmisión mecánica', to: '/marketplace?bikes=1&transmissionType=Mec%C3%A1nica' },
          { label: 'Bicicletas < 2000 USD', to: '/marketplace?bikes=1&price_cur=USD&price_max=2000' },
          { label: 'Bicicletas nuevas', to: '/marketplace?bikes=1&condition=Nuevo' },
          { label: 'Bicicletas en oferta', to: '/marketplace?bikes=1&deal=1' },
        ],
      },
      {
        title: 'Marcas destacadas',
        links: [
          { label: 'Specialized', to: '/marketplace?bikes=1&brand=Specialized' },
          { label: 'Trek', to: '/marketplace?bikes=1&brand=Trek' },
          { label: 'Canyon', to: '/marketplace?bikes=1&brand=Canyon' },
          { label: 'Scott', to: '/marketplace?bikes=1&brand=Scott' },
          { label: 'Giant', to: '/marketplace?bikes=1&brand=Giant' },
          { label: 'Orbea', to: '/marketplace?bikes=1&brand=Orbea' },
          { label: 'Cervélo', to: '/marketplace?bikes=1&brand=Cervelo' },
          { label: 'Pinarello', to: '/marketplace?bikes=1&brand=Pinarello' },
          { label: 'BH', to: '/marketplace?bikes=1&brand=BH' },
          { label: 'Aurum', to: '/marketplace?bikes=1&brand=Aurum' },
        ],
      },
    ],
  },
  {
    label: 'Accesorios',
    cols: [
      { title: 'Componentes y partes', links: [ { label: 'Ver componentes', to: '/marketplace?cat=Accesorios&subcat=Componentes%20y%20partes' } ] },
      { title: 'Ruedas y cubiertas', links: [ { label: 'Ver ruedas/cubiertas', to: '/marketplace?cat=Accesorios&subcat=Ruedas%20y%20cubiertas' } ] },
      { title: 'Herramientas y mantenimiento', links: [ { label: 'Ver herramientas', to: '/marketplace?cat=Accesorios&subcat=Herramientas%20y%20mantenimiento' } ] },
      { title: 'Electrónica y sensores', links: [ { label: 'Ver electrónica', to: '/marketplace?cat=Accesorios&subcat=Electr%C3%B3nica%20y%20sensores' } ] },
      { title: 'Bikepacking y transporte', links: [ { label: 'Ver bikepacking', to: '/marketplace?cat=Accesorios&subcat=Bikepacking%20y%20transporte' } ] },
      { title: 'Lubricantes y limpieza', links: [ { label: 'Ver limpieza', to: '/marketplace?cat=Accesorios&subcat=Lubricantes%20y%20limpieza' } ] },
    ],
  },
  {
    label: 'Indumentaria',
    cols: [
      { title: 'Indumentaria (toda) →', links: [ { label: 'Ver toda', to: '/marketplace?cat=Indumentaria' } ] },
      { title: 'Jerseys / Maillots', links: [ { label: 'Ver jerseys', to: '/marketplace?cat=Indumentaria&subcat=Jerseys' } ] },
      { title: 'Bibs / Culotte', links: [ { label: 'Ver bibs/culotte', to: '/marketplace?cat=Indumentaria&subcat=Bibs%20%2F%20Culotte' } ] },
      { title: 'Cascos', links: [ { label: 'Ver cascos', to: '/marketplace?cat=Indumentaria&subcat=Cascos' } ] },
      { title: 'Zapatillas', links: [ { label: 'Ver zapatillas', to: '/marketplace?cat=Indumentaria&subcat=Zapatillas' } ] },
      { title: 'Guantes', links: [ { label: 'Ver guantes', to: '/marketplace?cat=Indumentaria&subcat=Guantes' } ] },
    ],
  },
  {
    label: 'Nutrición',
    cols: [
      {
        title: 'Categorías',
        links: [
          { label: 'Geles', to: '/marketplace?cat=Nutrici%C3%B3n&subcat=Geles' },
          { label: 'Hidratación', to: '/marketplace?cat=Nutrici%C3%B3n&subcat=Hidrataci%C3%B3n' },
          { label: 'Suplementación', to: '/marketplace?cat=Nutrici%C3%B3n&subcat=Suplementaci%C3%B3n' },
          { label: 'Barras y snacks', to: '/marketplace?cat=Nutrici%C3%B3n&subcat=Barras%20y%20snacks' },
          { label: 'Ver todo Nutrición', to: '/marketplace?cat=Nutrici%C3%B3n' },
        ],
      },
      {
        title: 'Dietas / atributos',
        links: [
          { label: 'Sin cafeína', to: '/marketplace?cat=Nutrici%C3%B3n&q=sin%20cafe%C3%ADna' },
          { label: 'Cafeína < 50 mg', to: '/marketplace?cat=Nutrici%C3%B3n&q=cafe%C3%ADna%20%3C%2050' },
          { label: 'Vegano', to: '/marketplace?cat=Nutrici%C3%B3n&q=vegano' },
          { label: 'Sin gluten', to: '/marketplace?cat=Nutrici%C3%B3n&q=sin%20gluten' },
        ],
      },
      {
        title: 'Marcas',
        links: [],
      },
    ],
  },
]

function useIsMobile(maxWidth = 768) {
  const [isMobile, setIsMobile] = useState<boolean>(() =>
    typeof window !== 'undefined' ? window.innerWidth < maxWidth : false
  )

  useEffect(() => {
    if (typeof window === 'undefined') return
    const mq = window.matchMedia(`(max-width: ${maxWidth - 1}px)`)
    const update = () => setIsMobile(mq.matches)
    update()
    mq.addEventListener('change', update)
    return () => mq.removeEventListener('change', update)
  }, [maxWidth])

  return isMobile
}

function SearchBar() {
  const [q, setQ] = useState('')
  const [open, setOpen] = useState(false)
  const [idx, setIdx] = useState(0)
  const nav = useNavigate()

  const stripAccents = (s: string) => s.normalize('NFD').replace(/[\u0300-\u036f]/g, '').toLowerCase()

  const suggestions = useMemo(() => {
    const t = q.trim()
    if (!t) return []
    const k = stripAccents(t)
    const starts = KEYWORDS.filter((w) => stripAccents(w).startsWith(k))
    const contains = KEYWORDS.filter((w) => !stripAccents(w).startsWith(k) && stripAccents(w).includes(k))
    return [...starts, ...contains].slice(0, 8)
  }, [q])

  const goSearch = (term: string) => {
    nav(`/marketplace?q=${encodeURIComponent(term)}`)
    setOpen(false)
  }

  const onSubmit = (e?: React.FormEvent) => {
    e?.preventDefault()
    const term = open && suggestions[idx] ? suggestions[idx] : q
    goSearch(term || '')
  }

  const onKeyDown: React.KeyboardEventHandler<HTMLInputElement> = (e) => {
    if (!open && (e.key === 'ArrowDown' || e.key === 'ArrowUp')) setOpen(true)
    if (!suggestions.length) return
    if (e.key === 'ArrowDown') {
      e.preventDefault()
      setIdx((i) => (i + 1) % suggestions.length)
    } else if (e.key === 'ArrowUp') {
      e.preventDefault()
      setIdx((i) => (i - 1 + suggestions.length) % suggestions.length)
    } else if (e.key === 'Enter') onSubmit()
    else if (e.key === 'Escape') setOpen(false)
  }

  return (
    <form onSubmit={onSubmit} className="relative flex-1 max-w-xl min-w-[220px]" role="search">
      <div className="relative">
        <input
          value={q}
          onChange={(e) => {
            setQ(e.target.value)
            setOpen(true)
            setIdx(0)
          }}
          onFocus={() => setOpen(true)}
          onKeyDown={onKeyDown}
          placeholder="Buscá tu próxima bicicleta..."
          aria-label="Buscar"
          aria-autocomplete="list"
          aria-expanded={open}
          id="header-search"
          name="search"
          className="w-full h-10 rounded-full border border-black/10 pl-5 pr-11 bg-white/95 outline-none focus:ring-2 focus:ring-mb-primary/30"
        />
        <button
          type="submit"
          aria-label="Buscar"
          className="absolute right-1.5 top-1/2 -translate-y-1/2 h-8 w-8 rounded-full bg-mb-primary text-white flex items-center justify-center"
        >
          <svg
            aria-hidden="true"
            focusable="false"
            xmlns="http://www.w3.org/2000/svg"
            viewBox="0 0 20 20"
            className="h-4 w-4"
            fill="none"
          >
            <path
              d="m17.5 17.5-4-4m1-3.5a5.5 5.5 0 1 1-11 0 5.5 5.5 0 0 1 11 0Z"
              stroke="currentColor"
              strokeWidth="1.5"
              strokeLinecap="round"
              strokeLinejoin="round"
            />
          </svg>
        </button>
      </div>

      {open && suggestions.length > 0 && (
        <div
          className="absolute z-40 mt-2 w-full rounded-xl border border-black/10 bg-white shadow-lg overflow-hidden"
          role="listbox"
          onMouseLeave={() => setOpen(false)}
        >
          {suggestions.map((s, i) => (
            <button
              type="button"
              key={s}
              role="option"
              aria-selected={i === idx}
              className={`w-full text-left px-3 py-2 hover:bg-black/5 ${i === idx ? 'bg-black/5' : ''}`}
              onMouseEnter={() => setIdx(i)}
              onClick={() => goSearch(s)}
            >
              <div className="text-sm">Buscar <b>{s}</b></div>
              <div className="text-xs text-black/60">Sugerencia</div>
            </button>
          ))}
          <div className="border-t border-black/10 px-3 py-2 text-xs text-black/60">
            Enter para buscar “{q}”
          </div>
        </div>
      )}
    </form>
  )
}

export default function Header() {
  const { user, enabled } = useAuth()
  const [openIdx, setOpenIdx] = useState<number | null>(null)
  const [mobileMenuOpen, setMobileMenuOpen] = useState(false)
  const [mobileCategoryOpen, setMobileCategoryOpen] = useState<number | null>(null)
  const [loginOpen, setLoginOpen] = useState(false)
  const [authMode, setAuthMode] = useState<'login' | 'register'>('login')
  const [loginEmail, setLoginEmail] = useState('')
  const [loginPassword, setLoginPassword] = useState('')
  const [rememberMe, setRememberMe] = useState(true)
  const [loginError, setLoginError] = useState<string | null>(null)
  const [loginLoading, setLoginLoading] = useState(false)
  const [registerFullName, setRegisterFullName] = useState('')
  const [registerProvince, setRegisterProvince] = useState('')
  const [registerCity, setRegisterCity] = useState('')
  const [registerCityOther, setRegisterCityOther] = useState('')
  const [registerEmail, setRegisterEmail] = useState('')
  const [registerPassword, setRegisterPassword] = useState('')
  const [registerConfirm, setRegisterConfirm] = useState('')
  const [registerAcceptedTerms, setRegisterAcceptedTerms] = useState(false)
  const [registerError, setRegisterError] = useState<string | null>(null)
  const [registerLoading, setRegisterLoading] = useState(false)
  const [registerSuccess, setRegisterSuccess] = useState(false)
  const navigate = useNavigate()
  const hoverTimer = useRef<number | null>(null)
  const [stores, setStores] = useState<StoreSummary[]>([])
  const [storesOpen, setStoresOpen] = useState(false)
  const [creditCount, setCreditCount] = useState<number>(0)

  const openAuth = (mode: 'login' | 'register') => {
    setAuthMode(mode)
    setLoginError(null)
    setRegisterError(null)
    setRegisterSuccess(false)
    setLoginOpen(true)
  }
  const [nutritionBrands, setNutritionBrands] = useState<string[]>([])
  const { show: showToast } = useToast()
  const publishLink = '/publicar'

  useEffect(() => {
    if (user) {
      setLoginOpen(false)
      setLoginEmail('')
      setLoginPassword('')
      setLoginError(null)
    }
  }, [user])

  useEffect(() => {
    if (mobileMenuOpen) setOpenIdx(null)
  }, [mobileMenuOpen])

  const toggleMobileMenu = () => setMobileMenuOpen((prev) => !prev)
  const closeMobileMenu = () => {
    setMobileMenuOpen(false)
    setMobileCategoryOpen(null)
  }

  const toggleMobileCategory = (idx: number) => {
    setMobileCategoryOpen((prev) => (prev === idx ? null : idx))
  }

  const openMega = (idx: number) => {
    if (hoverTimer.current) window.clearTimeout(hoverTimer.current)
    setOpenIdx(idx)
  }

  const scheduleCloseMega = () => {
    if (hoverTimer.current) window.clearTimeout(hoverTimer.current)
    hoverTimer.current = window.setTimeout(() => { setOpenIdx(null); setStoresOpen(false) }, 280)
  }

  const cancelCloseMega = () => {
    if (hoverTimer.current) window.clearTimeout(hoverTimer.current)
  }

  // Cargar tiendas oficiales para mega menú dinámico
  useEffect(() => {
    let mounted = true
    ;(async () => {
      try {
        if (!supabaseEnabled) return
        const rows = await fetchStores()
        if (mounted) setStores(rows)
      } catch { /* noop */ }
    })()
    return () => { mounted = false }
  }, [])

  // Cargar marcas existentes de Nutrición (máximo 5) para mega menú
  useEffect(() => {
    let active = true
    ;(async () => {
      try {
        if (!supabaseEnabled) return
        const all = await fetchListings()
        if (!active || !Array.isArray(all)) return
        const map = new Map<string, { name: string; count: number }>()
        for (const l of all) {
          if ((l.category || '') !== 'Nutrición') continue
          const raw = (l.brand || '').trim()
          if (!raw) continue
          const key = raw.toLowerCase()
          const prev = map.get(key)
          if (prev) { prev.count += 1; continue }
          map.set(key, { name: raw, count: 1 })
        }
        const top = Array.from(map.values())
          .sort((a, b) => b.count - a.count)
          .map((v) => v.name)
          .slice(0, 5)
        setNutritionBrands(top)
      } catch { /* noop */ }
    })()
    return () => { active = false }
  }, [])

  // Cargar créditos disponibles para badge en header (con refresco tras evento global)
  useEffect(() => {
    let active = true
    const load = async () => {
      try {
        if (!user?.id) { if (active) setCreditCount(0); return }
        const credits = await fetchMyCredits(user.id)
        if (active) setCreditCount(Array.isArray(credits) ? credits.length : 0)
      } catch {
        if (active) setCreditCount(0)
      }
    }
    void load()
    const onUpdated = () => { void load() }
    window.addEventListener('mb_credits_updated', onUpdated as any)
    // Retry breve por si el grant tarda en materializarse
    const retry = window.setTimeout(() => { void load() }, 800)
    return () => { active = false; window.removeEventListener('mb_credits_updated', onUpdated as any); window.clearTimeout(retry) }
  }, [user?.id])

  // Toast al actualizar créditos (bienvenida) — se muestra una vez por sesión
  useEffect(() => {
    const key = 'mb_toast_welcome_shown'
    const handler = () => {
      try {
        if (!sessionStorage.getItem(key)) {
          showToast('Crédito disponible en tu cuenta 🎉', { variant: 'success' })
          sessionStorage.setItem(key, '1')
        }
      } catch { /* noop */ }
    }
    window.addEventListener('mb_credits_updated', handler as any)
    return () => window.removeEventListener('mb_credits_updated', handler as any)
  }, [showToast])

  const megaItems: MegaItem[] = useMemo(() => {
    // Base items, with dynamic Nutrition brands injected
    const base: MegaItem[] = MEGA.map((it) => ({ label: it.label, cols: it.cols.map((c) => ({ title: c.title, links: [...c.links] })) }))
    const nut = base.find((m) => m.label === 'Nutrición')
    if (nut && nutritionBrands.length) {
      const brandsCol = nut.cols.find((c) => c.title === 'Marcas')
      if (brandsCol) {
        brandsCol.links = nutritionBrands.slice(0, 5).map((brand) => ({ label: brand, to: `/marketplace?cat=Nutrici%C3%B3n&brand=${encodeURIComponent(brand)}` }))
      }
    }

    if (!stores || stores.length === 0) return base
    const top = stores.slice(0, 9)
    const cols: MegaCol[] = []
    for (let i = 0; i < 3; i++) {
      const chunk = top.slice(i * 3, i * 3 + 3)
      cols.push({
        title: i === 0 ? 'Tiendas oficiales' : '',
        links: chunk.map((s) => ({ label: (s.store_name || s.store_slug).toString(), to: `/tienda/${s.store_slug}` }))
      })
    }
    return [...base, { label: 'Tiendas oficiales', cols }]
  }, [stores, nutritionBrands])

  const isMobileViewport = useIsMobile()
  const [mounted, setMounted] = useState(false)

  useEffect(() => {
    setMounted(true)
  }, [])

  // Inicializar el estado del checkbox desde la preferencia guardada
  useEffect(() => {
    if (typeof window === 'undefined') return
    const prev = window.localStorage.getItem('mb_auth_persist')
    setRememberMe(prev !== 'session')
  }, [])

  useEffect(() => {
    if (!isMobileViewport) return
    const shouldLock = mobileMenuOpen || (loginOpen && !user)
    const originalOverflow = document.body.style.overflow
    if (shouldLock) document.body.style.overflow = 'hidden'
    return () => {
      document.body.style.overflow = originalOverflow
    }
  }, [isMobileViewport, mobileMenuOpen, loginOpen, user])

  const handleLogin: React.FormEventHandler<HTMLFormElement> = async (e) => {
    e.preventDefault()
    if (!enabled || !supabaseEnabled) {
      setLoginError('Login deshabilitado: configurá Supabase en .env')
      return
    }
    if (!loginEmail.trim() || !loginPassword) {
      setLoginError('Completá email y contraseña')
      return
    }
    try {
      setLoginLoading(true)
      setLoginError(null)
      // Aplicar preferencia de persistencia antes de iniciar sesión
      setAuthPersistence(Boolean(rememberMe))
      const supabase = getSupabaseClient()
      const { error } = await supabase.auth.signInWithPassword({
        email: loginEmail.trim(),
        password: loginPassword
      })
      if (error) throw error
      setLoginOpen(false)
      if (typeof window !== 'undefined') window.location.assign('/dashboard')
    } catch (err: any) {
      const msg = err?.message ?? 'No pudimos iniciar sesión. Intentá nuevamente.'
      setLoginError(msg)
    } finally {
      setLoginLoading(false)
    }
  }

  const handleGoogleLogin = async () => {
    if (!enabled || !supabaseEnabled) {
      setLoginError('Login con Google deshabilitado: configurá Supabase en .env')
      return
    }
    try {
      setLoginLoading(true)
      setLoginError(null)
      // Aplicar preferencia de persistencia antes de iniciar sesión
      setAuthPersistence(Boolean(rememberMe))
      const supabase = getSupabaseClient()
      const redirect = `${window.location.origin}/dashboard`
      const { data, error } = await supabase.auth.signInWithOAuth({
        provider: 'google',
        options: {
          redirectTo: redirect
        }
      })
      if (error) throw error
      if (data?.url) {
        window.location.href = data.url
        return
      }
      setLoginOpen(false)
      navigate('/dashboard')
    } catch (err: any) {
      const msg = err?.message ?? 'No pudimos iniciar sesión con Google.'
      setLoginError(msg)
    } finally {
      setLoginLoading(false)
    }
  }

  const handleFacebookLogin = async () => {
    if (!enabled || !supabaseEnabled) {
      setLoginError('Login con Facebook deshabilitado: configurá Supabase en .env')
      return
    }
    try {
      setLoginLoading(true)
      setLoginError(null)
      // Aplicar preferencia de persistencia antes de iniciar sesión
      setAuthPersistence(Boolean(rememberMe))
      const supabase = getSupabaseClient()
      const redirect = `${window.location.origin}/dashboard`
      const { data, error } = await supabase.auth.signInWithOAuth({
        provider: 'facebook',
        options: {
          redirectTo: redirect,
          scopes: 'public_profile,email'
        }
      })
      if (error) throw error
      if (data?.url) window.location.href = data.url
    } catch (err: any) {
      const msg = err?.message ?? 'No pudimos iniciar sesión con Facebook. Intentá nuevamente.'
      setLoginError(msg)
    } finally {
      setLoginLoading(false)
    }
  }

  const handleRegister: React.FormEventHandler<HTMLFormElement> = async (e) => {
    e.preventDefault()
    if (!enabled || !supabaseEnabled) {
      setRegisterError('Registro deshabilitado: configurá Supabase en .env')
      return
    }
    const email = registerEmail.trim()
    const password = registerPassword
    const fullName = registerFullName.trim()
    const province = registerProvince
    const city = registerCity === OTHER_CITY_OPTION ? registerCityOther.trim() : registerCity

    if (!email) { setRegisterError('Ingresá un email válido'); return }
    if (password.length < 8) { setRegisterError('La contraseña debe tener al menos 8 caracteres'); return }
    if (password !== registerConfirm) { setRegisterError('Las contraseñas no coinciden'); return }
    if (!fullName) { setRegisterError('Ingresá tu nombre completo'); return }
    if (!province) { setRegisterError('Seleccioná una provincia'); return }
    if (!registerCity) { setRegisterError('Seleccioná una ciudad'); return }
    if (registerCity === OTHER_CITY_OPTION && !registerCityOther.trim()) { setRegisterError('Indicá tu ciudad'); return }
    if (!registerAcceptedTerms) { setRegisterError('Debés aceptar los términos y condiciones'); return }

    try {
      setRegisterLoading(true)
      setRegisterError(null)
      setAuthPersistence(Boolean(rememberMe))
      const supabase = getSupabaseClient()
      const bikePrefs: string[] = []
      const discipline = pickDiscipline(bikePrefs)
      const profileSlug = deriveProfileSlug({
        fullName,
        discipline,
        fallback: email.split('@')[0] ?? 'usuario',
      })
      const { data, error } = await supabase.auth.signUp({
        email,
        password,
        options: {
          data: {
            full_name: fullName,
            province,
            city,
            bike_preferences: bikePrefs,
            profile_slug: profileSlug,
            discipline,
          }
        }
      })
      if (error) throw error

      if (data.user?.id) {
        await createUserProfile({
          id: data.user.id,
          email,
          fullName,
          province,
          city,
          bikePreferences: bikePrefs,
          profileSlug,
        })
      }
      setRegisterSuccess(true)
    } catch (err: any) {
      const msg = err?.message ?? 'No pudimos registrarte. Intentá nuevamente.'
      setRegisterError(msg)
      setRegisterSuccess(false)
    } finally {
      setRegisterLoading(false)
    }
  }

  // Measure header height and expose via CSS var for sticky offsets
  const headerRef = useRef<HTMLElement | null>(null)
  useEffect(() => {
    const root = document.documentElement
    let raf = 0
    const updateNow = () => {
      const h = headerRef.current?.getBoundingClientRect().height || 0
      root.style.setProperty('--header-h', `${Math.max(0, Math.round(h))}px`)
    }
    const schedule = () => {
      if (raf) cancelAnimationFrame(raf)
      raf = requestAnimationFrame(updateNow)
    }
    schedule()
    // Prefer ResizeObserver to avoid layout thrash on window resize
    const el = headerRef.current
    let ro: ResizeObserver | null = null
    if (typeof ResizeObserver !== 'undefined' && el) {
      ro = new ResizeObserver(() => schedule())
      ro.observe(el)
    } else {
      window.addEventListener('resize', schedule)
    }
    return () => {
      if (raf) cancelAnimationFrame(raf)
      if (ro && el) ro.unobserve(el)
      window.removeEventListener('resize', schedule)
    }
  }, [])

  const header = (
    <header ref={headerRef} className="sticky top-0 z-40 bg-white border-b border-neutral-200 shadow-sm">
      <div className="max-w-6xl mx-auto px-4 py-4 flex items-center gap-4 md:gap-6">
        <Link to="/" className="flex items-center gap-2 shrink-0" aria-label="Ir al inicio">
          <picture>
            <source srcSet="/site-logo.webp" type="image/webp" />
            <img
              src="/site-logo.png"
              alt="Ciclo Market"
              className="h-12 md:h-16 w-auto block transform scale-[0.8] md:scale-[0.96] origin-left"
              width={200}
              height={80}
              fetchPriority="low"
              decoding="async"
            />
          </picture>
        </Link>

        {/* Search también visible en mobile */}
        <div className="flex-1 px-1 md:flex md:justify-center">
          <SearchBar />
        </div>

        <div className="ml-auto hidden md:flex items-center gap-2">
          {user ? (
            <Link
		              to="/dashboard"
		              aria-label="Ir a mi cuenta"
		              className="relative inline-flex h-9 w-9 items-center justify-center rounded-full border border-black/10 hover:border-black/20 text-sm"
		            >
              <span className="sr-only">Mi cuenta</span>
              <svg
                xmlns="http://www.w3.org/2000/svg"
                viewBox="0 0 24 24"
                className="h-5 w-5"
                stroke="currentColor"
                fill="none"
                strokeWidth={1.5}
              >
                <path strokeLinecap="round" strokeLinejoin="round" d="M12 12a4 4 0 1 0-4-4 4 4 0 0 0 4 4Zm0 2c-3.1 0-6 1.57-6 4v.25a.75.75 0 0 0 .75.75h10.5a.75.75 0 0 0 .75-.75V18c0-2.43-2.9-4-6-4Z" />
              </svg>
              {creditCount > 0 && (
                <span className="absolute -top-1 -right-1 min-w-[18px] h-[18px] rounded-full bg-emerald-500 px-1 text-center text-[10px] font-bold leading-[18px] text-white">
                  {creditCount > 9 ? '9+' : creditCount}
                </span>
              )}
            </Link>
	          ) : (
	            <div className="relative flex items-center gap-2">
	              <Link
	                to="/login"
	                className="inline-flex h-9 items-center justify-center rounded-full border border-black/10 px-3 text-sm hover:border-black/20"
	              >
	                Ingresar
	              </Link>
	            </div>
	          )}
          <div className="relative">
            <Link
              to={publishLink}
              className="px-4 py-2 rounded-2xl bg-gradient-to-r from-[#0ea5e9] via-[#2563eb] to-[#1d4ed8] text-white text-sm font-semibold shadow-[0_10px_28px_rgba(37,99,235,0.28)] hover:brightness-110"
              title={creditCount > 0 && user ? 'Tenés un crédito disponible. Publicá gratis.' : undefined}
            >
              Vender
            </Link>
            {creditCount > 0 && (
              <span
                className="absolute -top-1 -right-1 inline-flex h-[14px] w-[14px] items-center justify-center rounded-full bg-emerald-500 text-[10px] text-white"
                aria-label="Crédito disponible"
                title="Tenés un crédito disponible. Publicá gratis."
              >
                
              </span>
            )}
          </div>
        </div>

        {/* Hamburguesa a la derecha (solo mobile) */}
		        <button
		          type="button"
		          aria-label="Abrir menú"
		          className="md:hidden h-10 w-10 grid place-content-center rounded-full border border-black/10 hover:border-black/20"
		          onClick={toggleMobileMenu}
		        >
          <svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24" className="h-6 w-6" stroke="currentColor" fill="none" strokeWidth={1.5}>
            <path strokeLinecap="round" strokeLinejoin="round" d="M3.75 6.75h16.5M3.75 12h16.5M3.75 17.25h16.5" />
          </svg>
        </button>
      </div>

      <div className="hidden md:block relative">
        <div
          className="max-w-6xl mx-auto px-4 flex items-center gap-7 text-base font-semibold tracking-[0.01em]"
          onMouseEnter={cancelCloseMega}
          onMouseLeave={() => { scheduleCloseMega() }}
        >
	          <Link
	            to="/marketplace"
	            className="py-2 px-5 rounded-full bg-mb-primary text-white font-bold shadow-sm hover:shadow-md hover:brightness-110 hover:scale-[1.01] transition-all"
	            onMouseEnter={() => { setOpenIdx(null); setStoresOpen(false) }}
	          >
	            Marketplace
	          </Link>
          {MEGA.map((item, idx) => {
            const primary: Record<string, string> = {
              'Bicicletas': '/marketplace?bikes=1',
              'Accesorios': '/marketplace?cat=Accesorios',
              'Indumentaria': '/marketplace?cat=Indumentaria',
              'Nutrición': '/marketplace?cat=Nutrici%C3%B3n',
            }
            const first = primary[item.label] || item.cols?.[0]?.links?.[0]?.to || '/marketplace'
	            return (
	              <Link
	                key={item.label}
	                to={first}
	                className={`py-3 border-b-2 transition-all ${openIdx === idx ? 'border-b-[3px] border-[#14212e] text-[#14212e]' : 'border-transparent text-[#14212e]/80 hover:text-[#14212e] hover:border-[#14212e]'}`}
	                onMouseEnter={() => openMega(idx)}
	              >
	                {item.label}
	              </Link>
		            )
		          })}
	          <Link to="/como-publicar" className="py-3 text-[#14212e]/80 hover:text-[#14212e] border-b-2 border-transparent hover:border-[#14212e] transition-all" onMouseEnter={() => { setOpenIdx(null); setStoresOpen(false) }}>
	            Cómo publicar
	          </Link>
	          <Link to="/blog" className="py-3 text-[#14212e]/80 hover:text-[#14212e] border-b-2 border-transparent hover:border-[#14212e] transition-all" onMouseEnter={() => { setOpenIdx(null); setStoresOpen(false) }}>
	            Blog
	          </Link>
	          <Link
	            to="/tiendas"
	            className={`py-3 border-b-2 transition-all ${storesOpen ? 'border-b-[3px] border-[#14212e] text-[#14212e]' : 'border-transparent text-[#14212e]/80 hover:text-[#14212e] hover:border-[#14212e]'}`}
	            onMouseEnter={() => { setOpenIdx(null); setStoresOpen(true) }}
	          >
	            Tiendas oficiales
	          </Link>
        </div>

        {openIdx !== null && (
          <div className="absolute inset-x-0 top-full z-40 pointer-events-none">
            <div className="max-w-6xl mx-auto px-6 pointer-events-auto" onMouseEnter={cancelCloseMega} onMouseLeave={() => { scheduleCloseMega() }}>
              <div className="mt-1 rounded-2xl border border-black/10 bg-white shadow-xl">
                <div className="grid grid-cols-1 md:grid-cols-3 gap-x-12 gap-y-6 p-6 items-stretch min-h-[360px]">
                  {(() => {
                    const item = megaItems[openIdx]
                    const cols = item?.cols || []
                    // Group columns for Accesorios/Indumentaria so each column has top+bottom blocks aligned
                    const needsPairing = (item.label === 'Accesorios' || item.label === 'Indumentaria') && cols.length >= 6
                    const columns = needsPairing
                      ? [
                          [cols[0], cols[3]],
                          [cols[1], cols[4]],
                          [cols[2], cols[5]],
                        ]
                      : cols.map((c) => [c])
                    return columns.map((sections, i) => (
                      <div key={`col-${i}`} className={`h-full ${i > 0 ? 'border-l border-gray-200 pl-8 ml-8' : ''}`}>
                        {sections.map((section, sIdx) => (
                          <div key={`sec-${i}-${sIdx}`} className={sIdx > 0 ? 'mt-6' : ''}>
                            <h3 className="mb-3 text-sm font-semibold text-gray-800">{section.title}</h3>
                            <ul className="space-y-2">
                              {(section.links || []).map((link, j) => (
                                <li key={`lnk-${i}-${sIdx}-${j}`}>
                                  <Link to={link.to} className="text-sm text-black/70 hover:text-mb-primary" onClick={() => setOpenIdx(null)}>
                                    {link.label}
                                  </Link>
                                </li>
                              ))}
                            </ul>
                          </div>
                        ))}
                      </div>
                    ))
                  })()}
                </div>
              </div>
            </div>
          </div>
        )}

        {storesOpen && (
          <div className="absolute inset-x-0 top-full z-40 pointer-events-none">
            <div className="max-w-6xl mx-auto px-6 pointer-events-auto" onMouseEnter={cancelCloseMega} onMouseLeave={() => { scheduleCloseMega() }}>
              <div className="mt-1 rounded-2xl border border-black/10 bg-white shadow-xl">
                <div className="grid grid-cols-1 sm:grid-cols-3 gap-6 p-6 min-h-[360px]">
                  {[0,1,2].map((colIdx) => {
                    const items = stores.slice(0, 9).slice(colIdx * 3, colIdx * 3 + 3)
                    return (
                      <div key={`stores-col-${colIdx}`}>
                        <h4 className="text-xs uppercase tracking-wide text-black/50 mb-3">{colIdx === 0 ? 'Tiendas oficiales' : '\u00A0'}</h4>
                        <ul className="space-y-2">
                          {items.map((s) => (
                            <li key={s.store_slug}>
                              <Link to={`/tienda/${s.store_slug}`} className="text-sm text-black/70 hover:text-mb-primary" onClick={() => setStoresOpen(false)}>
                                {s.store_name || s.store_slug}
                              </Link>
                            </li>
                          ))}
                        </ul>
                      </div>
                    )
                  })}
                </div>
                {stores.length > 9 && (
                  <div className="px-6 pb-5 -mt-3">
                    <Link to="/tiendas" className="inline-flex items-center gap-2 text-sm text-black/70 hover:text-mb-primary" onClick={() => setStoresOpen(false)}>
                      Ver más tiendas
                      <svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24" className="h-4 w-4" fill="none" stroke="currentColor" strokeWidth={1.8}>
                        <path strokeLinecap="round" strokeLinejoin="round" d="M9 5l7 7-7 7" />
                      </svg>
                    </Link>
                  </div>
                )}
              </div>
            </div>
          </div>
        )}
      </div>

    </header>
  )

  const [mobileSectionOpen, setMobileSectionOpen] = useState<Record<string, boolean>>({})
  const toggleSection = (key: string) => setMobileSectionOpen((prev) => ({ ...prev, [key]: !prev[key] }))
  const [mobileBikeGroupsOpen, setMobileBikeGroupsOpen] = useState<Record<string, boolean>>({})
  const toggleBikeGroup = (key: string) => setMobileBikeGroupsOpen((prev) => ({ ...prev, [key]: !prev[key] }))

  const bikesMega = MEGA.find((m) => m.label === 'Bicicletas')
  const accesoriosMega = MEGA.find((m) => m.label === 'Accesorios')
  const indumentariaMega = MEGA.find((m) => m.label === 'Indumentaria')
  const nutricionMega = MEGA.find((m) => m.label === 'Nutrición')

  const mobileMenuOverlay = mounted && isMobileViewport && mobileMenuOpen
    ? createPortal(
        <div className="md:hidden fixed inset-0 z-50 bg-black/60" onClick={closeMobileMenu}>
          <div className="absolute inset-y-0 right-0 w-[85%] max-w-sm bg-white shadow-xl overflow-y-auto" onClick={(e) => e.stopPropagation()}>
            <div className="px-4 py-4 flex items-center justify-between border-b border-black/10">
              <span className="font-semibold">Menú</span>
              <button type="button" aria-label="Cerrar" onClick={closeMobileMenu}>
                <svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24" className="h-6 w-6" stroke="currentColor" fill="none" strokeWidth={1.5}>
                  <path strokeLinecap="round" strokeLinejoin="round" d="m6 6 12 12M6 18 18 6" />
                </svg>
              </button>
            </div>

            <div className="px-4 py-4 space-y-4">
              {/* 1) Primary actions */}
              <div className="space-y-2">
                <Link to="/marketplace" className="w-full inline-flex items-center justify-center rounded-full bg-[#14212e] px-4 py-3 text-base font-semibold text-white shadow hover:shadow-md hover:brightness-110 transition" onClick={closeMobileMenu}>Marketplace</Link>
                {user ? (
                  <Link
                    to={publishLink}
                    className="w-full inline-flex items-center justify-center rounded-2xl bg-gradient-to-r from-[#0ea5e9] via-[#2563eb] to-[#1d4ed8] px-4 py-3 text-base font-semibold text-white shadow-[0_10px_28px_rgba(37,99,235,0.28)] hover:brightness-110"
                    onClick={closeMobileMenu}
                  >
                    Vender
                  </Link>
	                ) : (
	                  <Link
	                    to="/login"
	                    className="w-full inline-flex items-center justify-center rounded-full border border-black/10 bg-white px-4 py-3 text-base font-semibold text-[#14212e] shadow hover:bg-white/90"
	                    onClick={closeMobileMenu}
	                  >
	                    Ingresar
	                  </Link>
	                )}
              </div>

              {/* 2) Tiendas oficiales (row) */}
              <div className="border-b border-neutral-200">
                <Link to="/tiendas" className="flex items-center justify-between py-3 text-base font-medium text-[#14212e]" onClick={closeMobileMenu}>
                  <span>Tiendas oficiales</span>
                  <svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24" className="h-5 w-5" fill="none" stroke="currentColor" strokeWidth={1.8}>
                    <path strokeLinecap="round" strokeLinejoin="round" d="M9 5l7 7-7 7" />
                  </svg>
                </Link>
              </div>

              {/* 3) Main navigation accordions */}
              <div className="divide-y divide-neutral-200">
                {/* Bicicletas */}
                <div>
                  <button type="button" className="w-full flex items-center justify-between py-3 text-base font-semibold text-[#14212e]" onClick={() => toggleSection('Bicicletas')} aria-expanded={!!mobileSectionOpen['Bicicletas']} aria-controls="m-bikes">
                    <span>Bicicletas</span>
                    <svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 20 20" className={`h-5 w-5 transition-transform ${mobileSectionOpen['Bicicletas'] ? 'rotate-180' : 'rotate-0'}`} fill="none" stroke="currentColor" strokeWidth={1.5}><path strokeLinecap="round" strokeLinejoin="round" d="m6 8 4 4 4-4" /></svg>
                  </button>
                  <div id="m-bikes" className={`overflow-hidden transition-all ${mobileSectionOpen['Bicicletas'] ? 'max-h-[1200px] pb-2' : 'max-h-0'}`}>
                    {/* Second level groups */}
                    {bikesMega?.cols?.map((group) => (
                      <div key={group.title} className="pl-3">
                        <button type="button" className="w-full flex items-center justify-between py-2 text-sm font-semibold text-[#14212e]" onClick={() => toggleBikeGroup(group.title)} aria-expanded={!!mobileBikeGroupsOpen[group.title]} aria-controls={`m-bikes-${group.title}`}>
                          <span>{group.title}</span>
                          <svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 20 20" className={`h-4 w-4 transition-transform ${mobileBikeGroupsOpen[group.title] ? 'rotate-180' : 'rotate-0'}`} fill="none" stroke="currentColor" strokeWidth={1.5}><path strokeLinecap="round" strokeLinejoin="round" d="m6 8 4 4 4-4" /></svg>
                        </button>
                        <div id={`m-bikes-${group.title}`} className={`overflow-hidden transition-all ${mobileBikeGroupsOpen[group.title] ? 'max-h-[800px]' : 'max-h-0'}`}>
                          <ul className="mb-2 space-y-1 pl-3">
                            {(group.links || []).map((link) => (
                              <li key={link.label}>
                                <Link to={link.to} className="block py-1 text-sm text-[#14212e]/80 hover:text-[#14212e]" onClick={closeMobileMenu}>{link.label}</Link>
                              </li>
                            ))}
                          </ul>
                        </div>
                      </div>
                    ))}
                  </div>
                </div>

                {/* Accesorios */}
                <div>
                  <button type="button" className="w-full flex items-center justify-between py-3 text-base font-semibold text-[#14212e]" onClick={() => toggleSection('Accesorios')} aria-expanded={!!mobileSectionOpen['Accesorios']} aria-controls="m-acc">
                    <span>Accesorios</span>
                    <svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 20 20" className={`h-5 w-5 transition-transform ${mobileSectionOpen['Accesorios'] ? 'rotate-180' : 'rotate-0'}`} fill="none" stroke="currentColor" strokeWidth={1.5}><path strokeLinecap="round" strokeLinejoin="round" d="m6 8 4 4 4-4" /></svg>
                  </button>
                  <div id="m-acc" className={`overflow-hidden transition-all ${mobileSectionOpen['Accesorios'] ? 'max-h-[1200px] pb-2' : 'max-h-0'}`}>
                    <ul className="pl-3 space-y-1">
                      {(accesoriosMega?.cols || []).flatMap((c) => c.links).map((link) => (
                        <li key={`acc-${link.label}`}>
                          <Link to={link.to} className="block py-1 text-sm text-[#14212e]/80 hover:text-[#14212e]" onClick={closeMobileMenu}>{link.label}</Link>
                        </li>
                      ))}
                    </ul>
                  </div>
                </div>

                {/* Indumentaria */}
                <div>
                  <button type="button" className="w-full flex items-center justify-between py-3 text-base font-semibold text-[#14212e]" onClick={() => toggleSection('Indumentaria')} aria-expanded={!!mobileSectionOpen['Indumentaria']} aria-controls="m-ind">
                    <span>Indumentaria</span>
                    <svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 20 20" className={`h-5 w-5 transition-transform ${mobileSectionOpen['Indumentaria'] ? 'rotate-180' : 'rotate-0'}`} fill="none" stroke="currentColor" strokeWidth={1.5}><path strokeLinecap="round" strokeLinejoin="round" d="m6 8 4 4 4-4" /></svg>
                  </button>
                  <div id="m-ind" className={`overflow-hidden transition-all ${mobileSectionOpen['Indumentaria'] ? 'max-h-[1200px] pb-2' : 'max-h-0'}`}>
                    <ul className="pl-3 space-y-1">
                      {(indumentariaMega?.cols || []).flatMap((c) => c.links).map((link) => (
                        <li key={`ind-${link.label}`}>
                          <Link to={link.to} className="block py-1 text-sm text-[#14212e]/80 hover:text-[#14212e]" onClick={closeMobileMenu}>{link.label}</Link>
                        </li>
                      ))}
                    </ul>
                  </div>
                </div>

                {/* Nutrición */}
                <div>
                  <button type="button" className="w-full flex items-center justify-between py-3 text-base font-semibold text-[#14212e]" onClick={() => toggleSection('Nutrición')} aria-expanded={!!mobileSectionOpen['Nutrición']} aria-controls="m-nut">
                    <span>Nutrición</span>
                    <svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 20 20" className={`h-5 w-5 transition-transform ${mobileSectionOpen['Nutrición'] ? 'rotate-180' : 'rotate-0'}`} fill="none" stroke="currentColor" strokeWidth={1.5}><path strokeLinecap="round" strokeLinejoin="round" d="m6 8 4 4 4-4" /></svg>
                  </button>
                  <div id="m-nut" className={`overflow-hidden transition-all ${mobileSectionOpen['Nutrición'] ? 'max-h-[1200px] pb-2' : 'max-h-0'}`}>
                    <ul className="pl-3 space-y-1">
                      {(nutricionMega?.cols || []).flatMap((c) => c.links).map((link) => (
                        <li key={`nut-${link.label}`}>
                          <Link to={link.to} className="block py-1 text-sm text-[#14212e]/80 hover:text-[#14212e]" onClick={closeMobileMenu}>{link.label}</Link>
                        </li>
                      ))}
                    </ul>
                  </div>
                </div>

                {/* Cómo publicar (direct) */}
                <div>
                  <Link to="/como-publicar" className="flex items-center justify-between py-3 text-base font-semibold text-[#14212e]" onClick={closeMobileMenu}>
                    <span>Cómo publicar</span>
                    <svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24" className="h-5 w-5" fill="none" stroke="currentColor" strokeWidth={1.8}><path strokeLinecap="round" strokeLinejoin="round" d="M9 5l7 7-7 7" /></svg>
                  </Link>
                  <Link to="/blog" className="flex items-center justify-between py-3 text-base font-semibold text-[#14212e]" onClick={closeMobileMenu}>
                    <span>Blog</span>
                    <svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24" className="h-5 w-5" fill="none" stroke="currentColor" strokeWidth={1.8}><path strokeLinecap="round" strokeLinejoin="round" d="M9 5l7 7-7 7" /></svg>
                  </Link>
                </div>
              </div>

              {/* 4) Separator */}
              <div className="border-t border-neutral-200" />

              {/* 5) Account / secondary */}
              <div className="divide-y divide-neutral-200">
                {user ? (
                  <>
                    <Link to="/dashboard" className="flex items-center justify-between py-3 text-sm font-medium text-[#14212e]" onClick={closeMobileMenu}>
                      <span>Mi cuenta</span>
                      <svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24" className="h-5 w-5" fill="none" stroke="currentColor" strokeWidth={1.8}><path strokeLinecap="round" strokeLinejoin="round" d="M9 5l7 7-7 7" /></svg>
                    </Link>
                    <Link to={`/dashboard?tab=${encodeURIComponent('Cerrar sesión')}`} className="flex items-center justify-between py-3 text-sm font-medium text-[#14212e]" onClick={closeMobileMenu}>
                      <span>Cerrar sesión</span>
                      <svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24" className="h-5 w-5" fill="none" stroke="currentColor" strokeWidth={1.8}><path strokeLinecap="round" strokeLinejoin="round" d="M9 5l7 7-7 7" /></svg>
                    </Link>
                  </>
	                ) : (
	                  <Link to="/login" className="flex items-center justify-between py-3 text-sm font-medium text-[#14212e]" onClick={closeMobileMenu}>
	                    <span>Ingresar</span>
	                    <svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24" className="h-5 w-5" fill="none" stroke="currentColor" strokeWidth={1.8}><path strokeLinecap="round" strokeLinejoin="round" d="M9 5l7 7-7 7" /></svg>
	                  </Link>
	                )}
                <Link to="/ayuda" className="flex items-center justify-between py-3 text-sm font-medium text-[#14212e]" onClick={closeMobileMenu}>
                  <span>Ayuda</span>
                  <svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24" className="h-5 w-5" fill="none" stroke="currentColor" strokeWidth={1.8}><path strokeLinecap="round" strokeLinejoin="round" d="M9 5l7 7-7 7" /></svg>
                </Link>
              </div>
            </div>
          </div>
        </div>,
        document.body
      )
    : null

  return (
    <>
      {header}
      {mobileMenuOverlay}
    </>
  )
}
