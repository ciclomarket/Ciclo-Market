import { Link, useNavigate } from 'react-router-dom'
import { useEffect, useMemo, useRef, useState } from 'react'
import { createPortal } from 'react-dom'
import { KEYWORDS } from '../data/keywords'
import { useAuth } from '../context/AuthContext'
import { getSupabaseClient, supabaseEnabled, setAuthPersistence } from '../services/supabase'
import { fetchStores, type StoreSummary } from '../services/users'
import { SocialAuthButtons } from './SocialAuthButtons'

type MegaCol = { title: string; links: Array<{ label: string; to: string }> }
type MegaItem = { label: string; cols: MegaCol[] }

const MEGA: MegaItem[] = [
  {
    label: 'Ruta & Gravel',
    cols: [
      {
        title: 'Categorías',
        links: [
          { label: 'Bicicletas de Ruta', to: '/marketplace?cat=Ruta' },
          { label: 'Gravel', to: '/marketplace?cat=Gravel' },
          { label: 'Triatlón / TT', to: '/marketplace?cat=Ruta&q=triatlón%20tt' },
          { label: 'Vintage / Acero', to: '/marketplace?cat=Ruta&q=vintage%20acero' },
        ],
      },
      {
        title: 'Marcas destacadas',
        links: [
          { label: 'Trek', to: '/marketplace?brand=Trek' },
          { label: 'Specialized', to: '/marketplace?brand=Specialized' },
          { label: 'Canyon', to: '/marketplace?brand=Canyon' },
          { label: 'Cervélo', to: '/marketplace?brand=Cervelo' },
          { label: 'BMC', to: '/marketplace?brand=BMC' },
        ],
      },
      {
        title: 'Rango de precio',
        links: [
          { label: 'Ofertas', to: '/marketplace?deal=1' },
          { label: 'Hasta USD 1.500', to: '/marketplace?price_max=1500' },
          { label: 'USD 1.500–3.000', to: '/marketplace?price_min=1500&price_max=3000' },
          { label: 'USD 3.000–5.000', to: '/marketplace?price_min=3000&price_max=5000' },
          { label: 'Premium (+USD 5.000)', to: '/marketplace?price_min=5000' },
        ],
      },
    ],
  },
  {
    label: 'MTB',
    cols: [
      {
        title: 'Categorías',
        links: [
          { label: 'Cross Country', to: '/marketplace?cat=MTB&q=cross%20country%20xc' },
          { label: 'Trail', to: '/marketplace?cat=MTB&q=trail' },
          { label: 'Enduro', to: '/marketplace?cat=MTB&q=enduro' },
          { label: 'Downhill', to: '/marketplace?cat=MTB&q=downhill%20dh' },
        ],
      },
      {
        title: 'Marcas destacadas',
        links: [
          { label: 'Trek MTB', to: '/marketplace?brand=Trek&cat=MTB' },
          { label: 'Scott MTB', to: '/marketplace?brand=Scott&cat=MTB' },
          { label: 'Cannondale MTB', to: '/marketplace?brand=Cannondale&cat=MTB' },
          { label: 'Giant MTB', to: '/marketplace?brand=Giant&cat=MTB' },
        ],
      },
      {
        title: 'Rango de precio',
        links: [
          { label: 'Hot Deals', to: '/marketplace?deal=1&cat=MTB' },
          { label: 'Budget (≤ USD 1.500)', to: '/marketplace?cat=MTB&price_max=1500' },
          { label: 'Mid (USD 1.500–3.000)', to: '/marketplace?cat=MTB&price_min=1500&price_max=3000' },
          { label: 'Performance (USD 3.000–5.000)', to: '/marketplace?cat=MTB&price_min=3000&price_max=5000' },
        ],
      },
    ],
  },
  {
    label: 'Urbana & Fixie',
    cols: [
      {
        title: 'Categorías',
        links: [
          { label: 'Urbana', to: '/marketplace?cat=Urbana' },
          { label: 'Fixie', to: '/marketplace?cat=Fixie' },
          { label: 'Single Speed', to: '/marketplace?cat=Fixie&q=single%20speed' },
        ],
      },
      {
        title: 'Rango de precio',
        links: [
          { label: 'Ofertas', to: '/marketplace?deal=1&cat=Urbana' },
          { label: 'Hasta USD 800', to: '/marketplace?cat=Urbana&max=800' },
          { label: 'USD 800–1.500', to: '/marketplace?cat=Urbana&min=800&max=1500' },
        ],
      },
    ],
  },
  {
    label: 'Partes',
    cols: [
      {
        title: 'Componentes',
        links: [
          { label: 'Ruedas', to: '/marketplace?cat=Accesorios&q=ruedas%20cubiertas' },
          { label: 'Grupos', to: '/marketplace?cat=Accesorios&q=grupos' },
          { label: 'Cockpits', to: '/marketplace?cat=Accesorios&q=cockpit%20manubrio%20stem' },
          { label: 'Sillines', to: '/marketplace?cat=Accesorios&q=sillín%20sillin' },
        ],
      },
      {
        title: 'Neumáticos',
        links: [
          { label: 'Ruta 23–28', to: '/marketplace?cat=Accesorios&q=cubiertas%20ruta' },
          { label: 'Gravel 35–50', to: '/marketplace?cat=Accesorios&q=cubiertas%20gravel' },
          { label: 'MTB 2.2–2.6', to: '/marketplace?cat=Accesorios&q=cubiertas%20mtb' },
        ],
      },
      {
        title: 'Ofertas',
        links: [
          { label: 'Liquidación', to: '/marketplace?cat=Accesorios&deal=1' },
          { label: 'Outlet ruedas', to: '/marketplace?cat=Accesorios&deal=1&q=ruedas' },
        ],
      },
    ],
  },
  {
    label: 'Accesorios',
    cols: [
      {
        title: 'Electrónica',
        links: [
          { label: 'Ciclocomputadoras', to: '/marketplace?cat=Accesorios&q=gps%20ciclocomputadora' },
          { label: 'Rodillos', to: '/marketplace?cat=Accesorios&q=rodillo' },
          { label: 'Luces', to: '/marketplace?cat=Accesorios&q=luces' },
        ],
      },
      {
        title: 'Hidratación y porta',
        links: [
          { label: 'Caramagnolas', to: '/marketplace?cat=Accesorios&q=caramañola%20caramagnola' },
          { label: 'Porta caramañola', to: '/marketplace?cat=Accesorios&q=porta%20caramañola' },
        ],
      },
      {
        title: 'Seguridad',
        links: [
          { label: 'Cascos', to: '/marketplace?cat=Indumentaria&q=casco' },
          { label: 'Cámaras & Tubeless', to: '/marketplace?cat=Accesorios&q=camaras%20tubeless' },
        ],
      },
    ],
  },
  {
    label: 'Indumentaria',
    cols: [
      {
        title: 'Para rodar',
        links: [
          { label: 'Maillots', to: '/marketplace?cat=Indumentaria&q=jersey%20maillot' },
          { label: 'Baberos / Shorts', to: '/marketplace?cat=Indumentaria&q=babero%20short' },
          { label: 'Guantes', to: '/marketplace?cat=Indumentaria&q=guantes' },
        ],
      },
      {
        title: 'Zapatillas',
        links: [
          { label: 'Ruta (3 pernos)', to: '/marketplace?cat=Indumentaria&q=zapatillas%20ruta' },
          { label: 'MTB (2 pernos)', to: '/marketplace?cat=Indumentaria&q=zapatillas%20mtb' },
        ],
      },
      {
        title: 'Ofertas',
        links: [
          { label: 'Outlet Indumentaria', to: '/marketplace?deal=1&cat=Indumentaria' },
        ],
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
  const [loginEmail, setLoginEmail] = useState('')
  const [loginPassword, setLoginPassword] = useState('')
  const [rememberMe, setRememberMe] = useState(true)
  const [loginError, setLoginError] = useState<string | null>(null)
  const [loginLoading, setLoginLoading] = useState(false)
  const navigate = useNavigate()
  const hoverTimer = useRef<number | null>(null)
  const [stores, setStores] = useState<StoreSummary[]>([])
  const [storesOpen, setStoresOpen] = useState(false)

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
    hoverTimer.current = window.setTimeout(() => setOpenIdx(null), 120)
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

  const megaItems: MegaItem[] = useMemo(() => {
    if (!stores || stores.length === 0) return MEGA
    const top = stores.slice(0, 9)
    const cols: MegaCol[] = []
    for (let i = 0; i < 3; i++) {
      const chunk = top.slice(i * 3, i * 3 + 3)
      cols.push({
        title: i === 0 ? 'Tiendas oficiales' : '',
        links: chunk.map((s) => ({ label: (s.store_name || s.store_slug).toString(), to: `/tienda/${s.store_slug}` }))
      })
    }
    return [...MEGA, { label: 'Tiendas oficiales', cols }]
  }, [stores])

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
      const { data, error } = await supabase.auth.signInWithOAuth({
        provider: 'google',
        options: {
          redirectTo: `${window.location.origin}/dashboard`
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
      const { data, error } = await supabase.auth.signInWithOAuth({
        provider: 'facebook',
        options: {
          redirectTo: `${window.location.origin}/dashboard`,
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

  const header = (
    <header className="sticky top-0 z-40 bg-white/95 backdrop-blur supports-[backdrop-filter]:bg-white/70">
      <div className="max-w-6xl mx-auto px-4 py-4 flex items-center gap-3 md:gap-6">
        <Link to="/" className="flex items-center gap-2 shrink-0" aria-label="Ir al inicio">
          <img
            src="/site-logo.png"
            alt="Ciclo Market"
            className="h-12 md:h-16 w-auto block transform scale-[0.8] md:scale-[0.96] origin-left"
            width={200}
            height={80}
            loading="eager"
            decoding="async"
          />
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
              className="inline-flex h-9 w-9 items-center justify-center rounded-full border border-black/10 hover:border-black/20 text-sm"
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
            </Link>
          ) : (
            <div className="relative">
              <button
                type="button"
                className="h-9 px-3 rounded-full border border-black/10 hover:border-black/20 text-sm"
                onClick={() => setLoginOpen((prev) => !prev)}
              >
                Ingresar
              </button>
              {loginOpen && !isMobileViewport && (
                <div className="absolute right-0 mt-2 w-80 rounded-2xl border border-white/10 bg-[#0c1723] text-white shadow-2xl p-5 z-50">
                  <div className="space-y-4">
                    <div className="text-center">
                      <h2 className="text-lg font-semibold text-white">Ingresar</h2>
                      <p className="mt-1 text-xs text-white/70">Elegí tu método preferido.</p>
                    </div>
                    <SocialAuthButtons
                      buttons={[
                        {
                          id: 'google',
                          label: 'Continuar con Google',
                          loading: loginLoading,
                          onClick: handleGoogleLogin,
                        },
                        {
                          id: 'facebook',
                          label: 'Continuar con Facebook',
                          loading: loginLoading,
                          onClick: handleFacebookLogin,
                        },
                      ]}
                    />
                    <div className="relative flex items-center gap-3 text-[10px] font-semibold uppercase tracking-[0.3em] text-white/40">
                      <span className="h-px flex-1 bg-white/10" />
                      <span>o con email</span>
                      <span className="h-px flex-1 bg-white/10" />
                    </div>
                    <form className="space-y-3" onSubmit={handleLogin}>
                      <label className="text-[11px] font-semibold uppercase tracking-[0.28em] text-white/60">
                        Email
                        <input
                          className="input mt-1 w-full border border-white/20 bg-white text-[#14212e] placeholder:text-black/60 focus:border-white/60"
                          type="email"
                          value={loginEmail}
                          onChange={(e) => setLoginEmail(e.target.value)}
                          placeholder="tu@email.com"
                        />
                      </label>
                      <label className="text-[11px] font-semibold uppercase tracking-[0.28em] text-white/60">
                        Contraseña
                        <input
                          className="input mt-1 w-full border border-white/20 bg-white text-[#14212e] placeholder:text-black/60 focus:border-white/60"
                          type="password"
                          value={loginPassword}
                          onChange={(e) => setLoginPassword(e.target.value)}
                          placeholder="••••••••"
                        />
                      </label>
                      <label className="flex items-center gap-2 text-[11px] text-white/70">
                        <input
                          type="checkbox"
                          className="accent-mb-primary"
                          checked={rememberMe}
                          onChange={(e) => setRememberMe(e.target.checked)}
                        />
                        Mantenerme conectado
                      </label>
                      {loginError && <p className="text-xs text-red-300">{loginError}</p>}
                      <button type="submit" className="w-full rounded-2xl bg-white py-2 text-sm font-semibold text-[#14212e] hover:bg-white/90" disabled={loginLoading}>
                        {loginLoading ? 'Ingresando…' : 'Ingresar con email'}
                      </button>
                      <p className="text-center text-[11px] text-white/50">
                        ¿Aún no tenés cuenta?{' '}
                        <Link to="/register" className="underline" onClick={() => setLoginOpen(false)}>
                          Registrate
                        </Link>
                      </p>
                    </form>
                  </div>
                </div>
              )}
            </div>
          )}
          <Link to="/publicar" className="h-9 px-4 rounded-full bg-mb-primary text-white text-sm grid place-content-center">
            Vender
          </Link>
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
          className="max-w-6xl mx-auto px-4 flex items-center gap-6 text-sm font-medium"
          onMouseEnter={cancelCloseMega}
          onMouseLeave={() => { scheduleCloseMega(); setStoresOpen(false) }}
        >
          {MEGA.map((item, idx) => (
            <button
              key={item.label}
              type="button"
              className={`py-3 border-b-2 transition ${openIdx === idx ? 'border-mb-primary text-mb-primary' : 'border-transparent text-black/70 hover:text-black'}`}
              onMouseEnter={() => openMega(idx)}
            >
              {item.label}
            </button>
          ))}
          <Link to="/marketplace" className="ml-auto py-3 text-black/70 hover:text-black">
            Marketplace
          </Link>
          <Link to="/como-publicar" className="py-3 text-black/70 hover:text-black">
            Cómo publicar
          </Link>
          <Link
            to="/tiendas"
            className={`py-3 border-b-2 transition ${storesOpen ? 'border-mb-primary text-mb-primary' : 'border-transparent text-black/70 hover:text-black'}`}
            onMouseEnter={() => { setOpenIdx(null); setStoresOpen(true) }}
          >
            Tiendas oficiales
          </Link>
        </div>

        {openIdx !== null && (
          <div className="absolute inset-x-0 top-full bg-white border-b border-black/10 shadow-lg" onMouseEnter={cancelCloseMega} onMouseLeave={() => { scheduleCloseMega(); setStoresOpen(false) }}>
            <div className="max-w-6xl mx-auto px-6 py-6 grid grid-cols-1 sm:grid-cols-3 gap-6">
              {MEGA[openIdx].cols.map((col, i) => (
                <div key={i}>
                  <h4 className="text-xs uppercase tracking-wide text-black/50 mb-3">{col.title}</h4>
                  <ul className="space-y-2">
                    {col.links.map((link, j) => (
                      <li key={j}>
                        <Link to={link.to} className="text-sm text-black/70 hover:text-mb-primary" onClick={() => setOpenIdx(null)}>
                          {link.label}
                        </Link>
                      </li>
                    ))}
                  </ul>
                </div>
              ))}
            </div>
          </div>
        )}

        {storesOpen && (
          <div className="absolute inset-x-0 top-full bg-white border-b border-black/10 shadow-lg" onMouseEnter={cancelCloseMega} onMouseLeave={() => { scheduleCloseMega(); setStoresOpen(false) }}>
            <div className="max-w-6xl mx-auto px-6 py-6 grid grid-cols-1 sm:grid-cols-3 gap-6">
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
              <div className="max-w-6xl mx-auto px-6 pb-5 -mt-3">
                <Link to="/tiendas" className="inline-flex items-center gap-2 text-sm text-black/70 hover:text-mb-primary" onClick={() => setStoresOpen(false)}>
                  Ver más tiendas
                  <svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24" className="h-4 w-4" fill="none" stroke="currentColor" strokeWidth={1.8}>
                    <path strokeLinecap="round" strokeLinejoin="round" d="M9 5l7 7-7 7" />
                  </svg>
                </Link>
              </div>
            )}
          </div>
        )}
      </div>

    </header>
  )

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

            <div className="px-4 py-3 space-y-4">
              {/* Bloque destacado (primeras filas) */}
              <div className="rounded-2xl bg-[#0c1723] text-white p-4">
                {user ? (
                  <div className="grid grid-cols-2 gap-2 text-sm">
                    <Link to="/dashboard" className="btn bg-white text-[#14212e] hover:bg-white/90" onClick={closeMobileMenu}>Mi cuenta</Link>
                    <Link to="/publicar" className="btn bg-gradient-to-r from-[#0ea5e9] via-[#2563eb] to-[#1d4ed8] text-white hover:brightness-110" onClick={closeMobileMenu}>Vender</Link>
                    <Link to="/marketplace" className="btn border border-white/30 bg-transparent text-white hover:bg-white/10" onClick={closeMobileMenu}>Marketplace</Link>
                    <Link to={`/dashboard?tab=${encodeURIComponent('Cerrar sesión')}`} className="btn border border-white/30 bg-transparent text-white hover:bg-white/10" onClick={closeMobileMenu}>Cerrar sesión</Link>
                  </div>
                ) : (
                  <div className="grid grid-cols-2 gap-2 text-sm">
                    <button type="button" className="btn bg-white text-[#14212e] hover:bg-white/90" onClick={() => { setLoginOpen(true); closeMobileMenu() }}>Ingresar</button>
                    <Link to="/register" className="btn border border-white/30 bg-transparent text-white hover:bg-white/10" onClick={closeMobileMenu}>Crear cuenta</Link>
                    <Link to="/marketplace" className="btn border border-white/30 bg-transparent text-white hover:bg-white/10" onClick={closeMobileMenu}>Marketplace</Link>
                    <Link to="/publicar" className="btn bg-gradient-to-r from-[#0ea5e9] via-[#2563eb] to-[#1d4ed8] text-white hover:brightness-110" onClick={closeMobileMenu}>Vender</Link>
                  </div>
                )}
              </div>

              <div className="grid gap-2">
                {MEGA.map((item, idx) => {
                  const opened = mobileCategoryOpen === idx
                  return (
                    <div key={idx} className="rounded-xl border border-black/10 overflow-hidden">
                      <button
                        type="button"
                        className="w-full flex items-center justify-between px-3 py-3 text-sm font-semibold"
                        onClick={() => toggleMobileCategory(idx)}
                      >
                        <span>{item.label}</span>
                        <svg
                          xmlns="http://www.w3.org/2000/svg"
                          viewBox="0 0 20 20"
                          className={`h-4 w-4 transition-transform ${opened ? 'rotate-180' : 'rotate-0'}`}
                          fill="none"
                          stroke="currentColor"
                          strokeWidth={1.5}
                        >
                          <path strokeLinecap="round" strokeLinejoin="round" d="m6 8 4 4 4-4" />
                        </svg>
                      </button>
                      {opened && (
                        <div className="border-t border-black/10 bg-black/5 px-3 py-2 grid gap-1">
                          {item.cols.flatMap((col) => col.links).map((link, linkIdx) => (
                            <Link
                              key={`${item.label}-${linkIdx}`}
                              to={link.to}
                              className="text-sm text-black/70 hover:text-mb-primary"
                              onClick={closeMobileMenu}
                            >
                              {link.label}
                            </Link>
                          ))}
                        </div>
                      )}
                    </div>
                  )
                })}
              </div>

              <div className="grid gap-2 text-sm">
                <Link
                  to="/tiendas"
                  onClick={closeMobileMenu}
                  className="inline-flex items-center justify-center gap-2 rounded-full border border-black/10 bg-white px-4 py-2 text-sm font-semibold text-[#14212e] shadow hover:bg-white/90"
                >
                  <svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24" className="h-4 w-4" fill="none" stroke="currentColor" strokeWidth={1.8}>
                    <path strokeLinecap="round" strokeLinejoin="round" d="M3 9h18l-2 11H5L3 9Zm1-3 2-3h12l2 3" />
                  </svg>
                  Tiendas oficiales
                </Link>
                <Link
                  to="/como-publicar"
                  onClick={closeMobileMenu}
                  className="inline-flex items-center justify-center gap-2 rounded-full border border-black/10 bg-white px-4 py-2 text-sm font-semibold text-[#14212e] shadow hover:bg-white/90"
                >
                  <svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24" className="h-4 w-4" fill="none" stroke="currentColor" strokeWidth={1.8}>
                    <path strokeLinecap="round" strokeLinejoin="round" d="M4 4h12v16H4zM8 4v16M4 8h12" />
                  </svg>
                  Cómo publicar
                </Link>
              </div>
            </div>
          </div>
        </div>,
        document.body
      )
    : null

  const loginOverlay = mounted && isMobileViewport && loginOpen && !user
    ? createPortal(
        <div className="md:hidden fixed inset-0 z-[60] bg-black/70" onClick={() => setLoginOpen(false)}>
          <div
            className="absolute inset-x-0 bottom-0 top-24 rounded-t-3xl border border-white/10 bg-[#0c1723] p-5 text-white shadow-2xl overflow-y-auto"
            onClick={(e) => e.stopPropagation()}
          >
            <div className="space-y-4">
              <div className="mx-auto mt-1 h-1.5 w-12 rounded-full bg-white/20" aria-hidden="true" />
              <div className="flex items-start justify-between">
                <div>
                  <h2 className="text-lg font-semibold text-white">Ingresar</h2>
                  <p className="text-xs text-white/70">Elegí tu método preferido.</p>
                </div>
                <button type="button" aria-label="Cerrar" onClick={() => setLoginOpen(false)}>
                  <svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24" className="h-6 w-6" stroke="currentColor" fill="none" strokeWidth={1.5}>
                    <path strokeLinecap="round" strokeLinejoin="round" d="m6 6 12 12M6 18 18 6" />
                  </svg>
                </button>
              </div>

              <SocialAuthButtons
                buttons={[
                  {
                    id: 'google',
                    label: 'Continuar con Google',
                    loading: loginLoading,
                    onClick: handleGoogleLogin,
                  },
                  {
                    id: 'facebook',
                    label: 'Continuar con Facebook',
                    loading: loginLoading,
                    onClick: handleFacebookLogin,
                  },
                ]}
              />

              <div className="relative flex items-center gap-3 text-[10px] font-semibold uppercase tracking-[0.3em] text-white/40">
                <span className="h-px flex-1 bg-white/10" />
                <span>o con email</span>
                <span className="h-px flex-1 bg-white/10" />
              </div>

              <form className="space-y-3" onSubmit={handleLogin}>
                <label className="text-[11px] font-semibold uppercase tracking-[0.28em] text-white/60">
                  Email
                  <input
                    className="input mt-1 w-full border border-white/20 bg-white text-[#14212e] placeholder:text-black/60 focus:border-white/60"
                    type="email"
                    value={loginEmail}
                    onChange={(e) => setLoginEmail(e.target.value)}
                    placeholder="tu@email.com"
                  />
                </label>
                <label className="text-[11px] font-semibold uppercase tracking-[0.28em] text-white/60">
                  Contraseña
                  <input
                    className="input mt-1 w-full border border-white/20 bg-white text-[#14212e] placeholder:text-black/60 focus:border-white/60"
                    type="password"
                    value={loginPassword}
                    onChange={(e) => setLoginPassword(e.target.value)}
                    placeholder="••••••••"
                  />
                </label>
                <label className="flex items-center gap-2 text-[11px] text-white/70">
                  <input type="checkbox" className="accent-mb-primary" checked={rememberMe} onChange={(e) => setRememberMe(e.target.checked)} />
                  Mantenerme conectado
                </label>
                {loginError && <p className="text-xs text-red-300">{loginError}</p>}
                <button type="submit" className="btn btn-primary w-full" disabled={loginLoading}>
                  {loginLoading ? 'Ingresando…' : 'Ingresar'}
                </button>
                <p className="text-xs text-white/60 text-center">
                  ¿Aún no tenés cuenta?{' '}
                  <Link to="/register" className="underline" onClick={() => setLoginOpen(false)}>
                    Registrate
                  </Link>
                </p>
              </form>
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
      {loginOverlay}
    </>
  )
}
