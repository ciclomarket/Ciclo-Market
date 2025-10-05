import { Link, useNavigate } from 'react-router-dom'
import { useEffect, useMemo, useRef, useState } from 'react'
import { createPortal } from 'react-dom'
import { KEYWORDS } from '../data/keywords'
import { useAuth } from '../context/AuthContext'
import { getSupabaseClient, supabaseEnabled } from '../services/supabase'

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
          { label: 'Triatlón / TT', to: '/marketplace?cat=Ruta&sub=TT' },
          { label: 'Vintage / Acero', to: '/marketplace?cat=Ruta&sub=Vintage' },
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
          { label: 'Hasta USD 1.500', to: '/marketplace?max=1500' },
          { label: 'USD 1.500–3.000', to: '/marketplace?min=1500&max=3000' },
          { label: 'USD 3.000–5.000', to: '/marketplace?min=3000&max=5000' },
          { label: 'Premium (+USD 5.000)', to: '/marketplace?min=5000' },
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
          { label: 'Cross Country', to: '/marketplace?cat=MTB&sub=XC' },
          { label: 'Trail', to: '/marketplace?cat=MTB&sub=Trail' },
          { label: 'Enduro', to: '/marketplace?cat=MTB&sub=Enduro' },
          { label: 'Downhill', to: '/marketplace?cat=MTB&sub=DH' },
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
          { label: 'Budget (≤ USD 1.500)', to: '/marketplace?cat=MTB&max=1500' },
          { label: 'Mid (USD 1.500–3.000)', to: '/marketplace?cat=MTB&min=1500&max=3000' },
          { label: 'Performance (USD 3.000–5.000)', to: '/marketplace?cat=MTB&min=3000&max=5000' },
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
          { label: 'Ruedas', to: '/marketplace?cat=Accesorios&sub=Ruedas' },
          { label: 'Grupos', to: '/marketplace?cat=Accesorios&sub=Grupos' },
          { label: 'Cockpits', to: '/marketplace?cat=Accesorios&sub=Cockpit' },
          { label: 'Sillines', to: '/marketplace?cat=Accesorios&sub=Sillin' },
        ],
      },
      {
        title: 'Neumáticos',
        links: [
          { label: 'Ruta 23–28', to: '/marketplace?cat=Accesorios&sub=Cubiertas%20Ruta' },
          { label: 'Gravel 35–50', to: '/marketplace?cat=Accesorios&sub=Cubiertas%20Gravel' },
          { label: 'MTB 2.2–2.6', to: '/marketplace?cat=Accesorios&sub=Cubiertas%20MTB' },
        ],
      },
      {
        title: 'Ofertas',
        links: [
          { label: 'Liquidación', to: '/marketplace?cat=Accesorios&deal=1' },
          { label: 'Outlet ruedas', to: '/marketplace?cat=Accesorios&sub=Ruedas&deal=1' },
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
          { label: 'Ciclocomputadoras', to: '/marketplace?cat=Accesorios&sub=GPS' },
          { label: 'Rodillos', to: '/marketplace?cat=Accesorios&sub=Rodillo' },
          { label: 'Luces', to: '/marketplace?cat=Accesorios&sub=Luces' },
        ],
      },
      {
        title: 'Hidratación y porta',
        links: [
          { label: 'Caramagnolas', to: '/marketplace?cat=Accesorios&sub=Caramañola' },
          { label: 'Porta caramañola', to: '/marketplace?cat=Accesorios&sub=Porta' },
        ],
      },
      {
        title: 'Seguridad',
        links: [
          { label: 'Cascos', to: '/marketplace?cat=Accesorios&sub=Casco' },
          { label: 'Cámaras & Tubeless', to: '/marketplace?cat=Accesorios&sub=Camaras' },
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
          { label: 'Maillots', to: '/marketplace?cat=Accesorios&sub=Jersey' },
          { label: 'Baberos / Shorts', to: '/marketplace?cat=Accesorios&sub=Babero' },
          { label: 'Guantes', to: '/marketplace?cat=Accesorios&sub=Guantes' },
        ],
      },
      {
        title: 'Zapatillas',
        links: [
          { label: 'Ruta (3 pernos)', to: '/marketplace?cat=Accesorios&sub=Zapatillas%20Ruta' },
          { label: 'MTB (2 pernos)', to: '/marketplace?cat=Accesorios&sub=Zapatillas%20MTB' },
        ],
      },
      {
        title: 'Ofertas',
        links: [
          { label: 'Outlet Indumentaria', to: '/marketplace?deal=1&cat=Accesorios&sub=Ropa' },
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
  const { user, enabled, logout } = useAuth()
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
  const promoMessages = useMemo(
    () => [
      '🔥 Seguinos en Instagram y obtené una publicación premium gratis! 🔥',
      'Escribinos para ayudarte a cotizar tu bicicleta',
    ],
    []
  )
  const [promoIndex, setPromoIndex] = useState(0)

  useEffect(() => {
    if (user) {
      setLoginOpen(false)
      setLoginEmail('')
      setLoginPassword('')
      setLoginError(null)
    }
  }, [user])

  useEffect(() => {
    if (promoMessages.length <= 1) return
    const timer = window.setInterval(() => {
      setPromoIndex((idx) => (idx + 1) % promoMessages.length)
    }, 6000)
    return () => window.clearInterval(timer)
  }, [promoMessages])

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

  const isMobileViewport = useIsMobile()
  const [mounted, setMounted] = useState(false)

  useEffect(() => {
    setMounted(true)
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
      const supabase = getSupabaseClient()
      const { error } = await supabase.auth.signInWithPassword({
        email: loginEmail.trim(),
        password: loginPassword
      })
      if (error) throw error
      setLoginOpen(false)
      navigate('/dashboard')
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

  const header = (
    <header className="sticky top-0 z-40 bg-white/95 backdrop-blur supports-[backdrop-filter]:bg-white/70">
      <div className="hidden md:block bg-black text-white text-xs">
        <div className="max-w-6xl mx-auto px-4 py-2 flex items-center gap-6">
          <span className="uppercase tracking-[0.4em] text-white/70">Marketplace de bicicletas</span>
         <div className="flex-1 flex items-center justify-center">
            <span key={promoIndex} className="text-white text-sm font-medium transition-opacity duration-500">
              {promoMessages[promoIndex]}
            </span>
          </div>
          <div className="flex items-center gap-4 text-white/70">
            <Link to="/faq" className="hover:text-white">Centro de ayuda</Link>
            <Link to="/publicar" className="hover:text-white">Publicar bici</Link>
          </div>
        </div>
      </div>

      <div className="md:hidden bg-black text-white text-xs text-center py-2">
        {promoMessages[promoIndex]}
      </div>

      <div className="max-w-6xl mx-auto px-4 py-4 flex items-center gap-3">
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

        <Link to="/" className="flex items-center gap-2 shrink-0" aria-label="Ir al inicio">
          <img
            src="/site-logo.png"
            alt="Ciclo Market"
            className="h-16 w-auto block"
            width={200}
            height={80}
            loading="eager"
            decoding="async"
          />
        </Link>

        <div className="hidden md:flex flex-1 justify-center">
          <SearchBar />
        </div>

        <div className="ml-auto flex items-center gap-2">
          {user ? (
            <>
              <Link to="/dashboard" className="h-9 px-3 rounded-full border border-black/10 hover:border-black/20 text-sm grid place-content-center">
                Mi cuenta
              </Link>
              <button
                type="button"
                className="h-9 px-3 rounded-full border border-black/10 hover:border-black/20 text-sm"
                onClick={() => logout()}
              >
                Salir
              </button>
            </>
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
                <div className="absolute right-0 mt-2 w-80 rounded-xl border border-black/10 bg-white shadow-xl p-5 z-50">
                  <form className="space-y-3" onSubmit={handleLogin}>
                    <div>
                      <label className="text-xs font-semibold text-black/60">Email</label>
                      <input
                        className="input mt-1"
                        type="email"
                        value={loginEmail}
                        onChange={(e) => setLoginEmail(e.target.value)}
                      />
                    </div>
                    <div>
                      <label className="text-xs font-semibold text-black/60">Contraseña</label>
                      <input
                        className="input mt-1"
                        type="password"
                        value={loginPassword}
                        onChange={(e) => setLoginPassword(e.target.value)}
                      />
                    </div>
                    <label className="flex items-center gap-2 text-xs text-black/70">
                      <input
                        type="checkbox"
                        className="accent-mb-primary"
                        checked={rememberMe}
                        onChange={(e) => setRememberMe(e.target.checked)}
                      />
                      Mantenerme conectado
                    </label>
                    {loginError && <p className="text-xs text-red-600">{loginError}</p>}
                    <button type="submit" className="btn btn-primary w-full" disabled={loginLoading}>
                      {loginLoading ? 'Ingresando…' : 'Ingresar'}
                    </button>
                    <button type="button" className="btn btn-ghost w-full" disabled={loginLoading} onClick={handleGoogleLogin}>
                      Ingresar con Google
                    </button>
                    <p className="text-xs text-black/60 text-center">
                      ¿Aún no tenés cuenta?{' '}
                      <Link to="/register" className="underline" onClick={() => setLoginOpen(false)}>
                        Registrate
                      </Link>
                    </p>
                  </form>
                </div>
              )}
            </div>
          )}
          <Link to="/publicar" className="h-9 px-4 rounded-full bg-mb-primary text-white text-sm grid place-content-center">
            Vender
          </Link>
        </div>
      </div>

      <div className="md:hidden">
        <div className="max-w-6xl mx-auto px-4 py-3">
          <SearchBar />
        </div>
      </div>

      <div className="hidden md:block relative">
        <div
          className="max-w-6xl mx-auto px-4 flex items-center gap-6 text-sm font-medium"
          onMouseEnter={cancelCloseMega}
          onMouseLeave={scheduleCloseMega}
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
          <Link to="/marketplace?deal=1" className="py-3 text-mb-primary font-semibold">
            Ofertas
          </Link>
          <Link to="/ayuda" className="py-3 text-black/70 hover:text-black">
            Ayuda
          </Link>
          <Link to="/tienda-oficial" className="py-3 text-black/70 hover:text-black">
            Tienda oficial
          </Link>
        </div>

        {openIdx !== null && (
          <div className="absolute inset-x-0 top-full bg-white border-b border-black/10 shadow-lg" onMouseEnter={cancelCloseMega} onMouseLeave={scheduleCloseMega}>
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
      </div>

    </header>
  )

  const mobileMenuOverlay = mounted && isMobileViewport && mobileMenuOpen
    ? createPortal(
        <div className="md:hidden fixed inset-0 z-50 bg-black/60" onClick={closeMobileMenu}>
          <div className="absolute inset-y-0 left-0 w-[85%] max-w-sm bg-white shadow-xl overflow-y-auto" onClick={(e) => e.stopPropagation()}>
            <div className="px-4 py-4 flex items-center justify-between border-b border-black/10">
              <span className="font-semibold">Menú</span>
              <button type="button" aria-label="Cerrar" onClick={closeMobileMenu}>
                <svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24" className="h-6 w-6" stroke="currentColor" fill="none" strokeWidth={1.5}>
                  <path strokeLinecap="round" strokeLinejoin="round" d="m6 6 12 12M6 18 18 6" />
                </svg>
              </button>
            </div>

            <div className="px-4 py-3 space-y-4">
              {user ? (
                <div className="rounded-xl border border-black/10 bg-black/5 px-3 py-3 text-sm">
                  <div className="font-semibold">Hola, {user.user_metadata?.full_name || user.email}</div>
                  <div className="mt-2 grid gap-2">
                    <Link to="/dashboard" className="underline" onClick={closeMobileMenu}>
                      Ir a mi cuenta
                    </Link>
                    <button type="button" className="text-left underline" onClick={() => { closeMobileMenu(); logout() }}>
                      Salir
                    </button>
                  </div>
                </div>
              ) : (
                <div className="grid gap-2 text-sm">
                  <button
                    type="button"
                    className="btn btn-primary"
                    onClick={() => {
                      setLoginOpen(true)
                      closeMobileMenu()
                    }}
                  >
                    Ingresar
                  </button>
                  <Link to="/register" className="btn btn-ghost" onClick={closeMobileMenu}>
                    Crear cuenta
                  </Link>
                </div>
              )}

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
                <Link to="/marketplace" className="underline" onClick={closeMobileMenu}>
                  Marketplace
                </Link>
                <Link to="/marketplace?deal=1" className="text-mb-primary font-semibold" onClick={closeMobileMenu}>
                  Ofertas
                </Link>
                <Link to="/ayuda" className="underline" onClick={closeMobileMenu}>
                  Ayuda
                </Link>
                <Link to="/tienda-oficial" className="underline" onClick={closeMobileMenu}>
                  Tienda oficial
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
            className="absolute inset-x-0 bottom-0 top-24 rounded-t-3xl bg-white p-6 overflow-y-auto"
            onClick={(e) => e.stopPropagation()}
          >
            <div className="mx-auto max-w-sm">
              <div className="flex items-center justify-between">
                <h2 className="text-lg font-semibold text-[#14212e]">Ingresar</h2>
                <button type="button" aria-label="Cerrar" onClick={() => setLoginOpen(false)}>
                  <svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24" className="h-6 w-6" stroke="currentColor" fill="none" strokeWidth={1.5}>
                    <path strokeLinecap="round" strokeLinejoin="round" d="m6 6 12 12M6 18 18 6" />
                  </svg>
                </button>
              </div>
              <form className="mt-4 space-y-4" onSubmit={handleLogin}>
                <div>
                  <label className="text-xs font-semibold text-black/60">Email</label>
                  <input
                    className="input mt-1"
                    type="email"
                    value={loginEmail}
                    onChange={(e) => setLoginEmail(e.target.value)}
                  />
                </div>
                <div>
                  <label className="text-xs font-semibold text-black/60">Contraseña</label>
                  <input
                    className="input mt-1"
                    type="password"
                    value={loginPassword}
                    onChange={(e) => setLoginPassword(e.target.value)}
                  />
                </div>
                <label className="flex items-center gap-2 text-xs text-black/70">
                  <input
                    type="checkbox"
                    className="accent-mb-primary"
                    checked={rememberMe}
                    onChange={(e) => setRememberMe(e.target.checked)}
                  />
                  Mantenerme conectado
                </label>
                {loginError && <p className="text-xs text-red-600">{loginError}</p>}
                <button type="submit" className="btn btn-primary w-full" disabled={loginLoading}>
                  {loginLoading ? 'Ingresando…' : 'Ingresar'}
                </button>
                <button type="button" className="btn btn-ghost w-full" disabled={loginLoading} onClick={handleGoogleLogin}>
                  Ingresar con Google
                </button>
                <p className="text-xs text-black/60 text-center">
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
