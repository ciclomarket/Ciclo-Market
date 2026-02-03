import { Link, useNavigate, useSearchParams } from 'react-router-dom'
import { useEffect } from 'react'
import { useAuth } from '../../context/AuthContext'
import Container from '../../components/Container'
import Button from '../../components/Button'

function IconBike() {
  return (
    <svg viewBox="0 0 24 24" className="h-6 w-6 text-white" fill="none" stroke="currentColor" strokeWidth={1.6}>
      <circle cx="6.5" cy="16.5" r="3.5" />
      <circle cx="17.5" cy="16.5" r="3.5" />
      <path d="M9.5 6.5h3.8l3.2 5.5" strokeLinecap="round" strokeLinejoin="round" />
      <path d="M10.5 10.5 9 6.5" strokeLinecap="round" />
      <path d="M10.5 10.5h4.5l-3.2 6" strokeLinecap="round" strokeLinejoin="round" />
    </svg>
  )
}
function IconCog() {
  return (
    <svg viewBox="0 0 24 24" className="h-6 w-6 text-white" fill="none" stroke="currentColor" strokeWidth={1.6}>
      <circle cx="12" cy="12" r="3.5" />
      <path d="M19 12a7 7 0 0 0-.3-2l2-1.2-1.4-2.4-2.2.6a7 7 0 0 0-1.7-1l.1-2.3h-2.8l.1 2.3a7 7 0 0 0-1.7 1l-2.2-.6L3.3 8.8 5.3 10a7 7 0 0 0 0 4l-2 1.2 1.4 2.4 2.2-.6a7 7 0 0 0 1.7 1l-.1 2.3h2.8l-.1-2.3a7 7 0 0 0 1.7-1l2.2.6 1.4-2.4-2-1.2c.2-.7.3-1.3.3-2z" strokeLinecap="round" />
    </svg>
  )
}
function IconJersey() {
  return (
    <svg viewBox="0 0 24 24" className="h-6 w-6 text-white" fill="none" stroke="currentColor" strokeWidth={1.6}>
      <path d="M9 4.5 12 6l3-1.5 2.5 2.5L16 9h-1v9a1 1 0 0 1-1 1H10a1 1 0 0 1-1-1V9H8L5.5 7z" strokeLinecap="round" strokeLinejoin="round" />
      <path d="M9 12h6" strokeLinecap="round" />
    </svg>
  )
}

function IconBolt() {
  return (
    <svg viewBox="0 0 24 24" className="h-5 w-5 text-white" fill="none" stroke="currentColor" strokeWidth={2}>
      <path d="M13 2 3 14h7v8l11-14h-7l-1-6z" strokeLinecap="round" strokeLinejoin="round" />
    </svg>
  )
}
function IconCamera() {
  return (
    <svg viewBox="0 0 24 24" className="h-5 w-5" fill="none" stroke="currentColor" strokeWidth={2}>
      <path d="M4 7h3l2-2h6l2 2h3a2 2 0 0 1 2 2v8a2 2 0 0 1-2 2H4a2 2 0 0 1-2-2V9a2 2 0 0 1 2-2Z" />
      <circle cx="12" cy="13" r="4" />
    </svg>
  )
}
function IconWhatsApp() {
  return (
    <svg viewBox="0 0 24 24" className="h-5 w-5" fill="none" stroke="currentColor" strokeWidth={2}>
      <path d="M20 11.5A8.5 8.5 0 1 1 11.5 3 8.5 8.5 0 0 1 20 11.5Z" />
      <path d="m6 19-1 3 3-1" />
      <path d="M8.5 9.5c0 3.3 2.7 6 6 6 .6 0 1.2-.1 1.7-.3.2-.1.4-.3.5-.6.1-.3 0-.6-.2-.9l-1-1.2c-.2-.3-.6-.4-.9-.2-.4.2-.8.3-1.3.3-1.3 0-2.4-1.1-2.4-2.4 0-.4.1-.9.3-1.3.2-.3.1-.7-.2-.9L10.9 6c-.2-.2-.6-.3-.9-.2-.3.1-.5.3-.6.5-.2.5-.3 1.1-.3 1.7Z" />
    </svg>
  )
}

function AutoNav({ to }: { to: string }) {
  const navigate = useNavigate()
  // Navigate once after mount
  useEffect(() => { navigate(to, { replace: true }) }, [navigate, to])
  return null
}

export default function ChooseType() {
  const { user } = useAuth()
  const [searchParams] = useSearchParams()
  const navigate = useNavigate()
  const currentUrl = typeof window !== 'undefined' ? window.location.pathname + window.location.search : '/publicar'
  const items = [
    {
      type: 'bike',
      title: 'Bicicleta',
      desc: 'Vendé tu bici lista para rodar.',
      href: '/publicar/nueva?type=bike',
      img: '/design/Banners-Mobile/1.webp',
    },
    {
      type: 'accessory',
      title: 'Accesorios',
      desc: 'Ruedas, componentes y electrónica.',
      href: '/publicar/nueva?type=accessory',
      img: '/design/Banners-Mobile/2.webp',
    },
    {
      type: 'apparel',
      title: 'Indumentaria',
      desc: 'Jerseys, cascos y zapatillas.',
      href: '/publicar/nueva?type=apparel',
      img: '/design/Banners-Mobile/3.webp',
    },
    {
      type: 'nutrition',
      title: 'Nutrición',
      desc: 'Gels, barritas y suplementos.',
      href: '/publicar/nueva?type=nutrition',
      img: '/design/Banners-Mobile/4.webp',
    },
  ]

  const handleSelect = (href: string) => {
    if (!user) {
      navigate(`/login?redirect=${encodeURIComponent(href)}`)
      return
    }
    navigate(href)
  }

  // Auto redirect if /publicar?type=... is provided
  const t = (searchParams.get('type') || '').toLowerCase()
  if (t === 'bike' || t === 'accessory' || t === 'apparel' || t === 'nutrition') {
    const next = new URLSearchParams(Array.from(searchParams.entries()))
    const target = `/publicar/nueva?${next.toString()}`
    if (!user) {
      return <AutoNav to={`/login?redirect=${encodeURIComponent(target)}`} />
    }
    return <AutoNav to={target} />
  }

  return (
    <div className="min-h-screen bg-[#14212E] text-white py-12 px-4">
      <div className="max-w-5xl mx-auto space-y-14">
        {/* Section A: Category Selection */}
        <section>
          <h1 className="text-3xl font-bold text-center mb-2">Qué querés publicar hoy?</h1>
          <p className="text-center text-gray-400 mb-10">Elegí una categoría. Publicás en Gratis sin vencimiento y podés mejorar después.</p>
          <div className="grid gap-3 grid-cols-2 lg:grid-cols-4">
            {items.map((it) => (
              <div
                key={it.type}
                role="link"
                tabIndex={0}
                onClick={() => handleSelect(it.href)}
                onKeyDown={(e) => { if (e.key === 'Enter' || e.key === ' ') { e.preventDefault(); handleSelect(it.href) } }}
                className="group relative overflow-hidden rounded-xl border border-gray-700 h-64 cursor-pointer transition-all hover:border-blue-500 hover:shadow-[0_0_15px_rgba(59,130,246,0.2)] hover:-translate-y-1 active:scale-[0.99] focus:outline-none focus-visible:ring-2 focus-visible:ring-white"
                aria-label={`Seleccionar ${it.title}`}
              >
                {/* Background image */}
                <img src={it.img} alt={it.title}
                  className="absolute inset-0 w-full h-full object-cover transition-transform duration-500 group-hover:scale-105" />
                {/* Overlay gradient for legibility */}
                <div className="absolute inset-0 bg-gradient-to-t from-black/90 via-black/50 to-black/30" />
                {/* Content */}
                <div className="absolute inset-0 z-10 p-5 flex flex-col justify-end">
                  <div className="text-base font-semibold text-white">{it.title}</div>
                  <p className="mt-1 text-sm text-gray-300">{it.desc}</p>
                  <div className="hidden md:block">
                    <Button
                      to={it.href}
                      variant="ghost"
                      className="relative z-20 mt-4 w-full py-2.5 rounded-lg border border-white/40 bg-white/10 backdrop-blur-md !text-white font-bold tracking-wide transition-all duration-300 md:opacity-0 md:translate-y-1 md:pointer-events-none group-hover:opacity-100 group-hover:translate-y-0 group-hover:pointer-events-auto hover:!bg-blue-600 hover:!border-blue-600 hover:!text-white"
                      aria-label={`Seleccionar ${it.title}`}
                    >
                      Publicar
                    </Button>
                  </div>
                </div>
              </div>
            ))}
          </div>
        </section>

        {/* Section B: Plans Comparison (Modern SaaS) */}
        {(() => {
          const TIERS = [
            {
              name: 'Inicial',
              id: 'free',
              price: 'Sin costo',
              description: 'Ideal para tu primera venta.',
              cta: 'Publicar Gratis',
              mostPopular: false,
              features: [
                { name: 'Hasta 4 fotos', included: true },
                { name: 'Publicación activa ilimitada', included: true },
                { name: 'Contacto vía Email', included: true },
                { name: 'Contacto vía WhatsApp', included: false },
                { name: 'Posicionamiento Estándar', included: true },
                { name: 'Boost de visibilidad', included: false },
              ],
            },
            {
              name: 'Premium',
              id: 'premium',
              price: '$9.000',
              description: 'Vendé más rápido con contacto directo.',
              cta: 'Quiero destacar',
              mostPopular: true,
              features: [
                { name: 'Hasta 8 fotos', included: true },
                { name: 'Publicación activa ilimitada', included: true },
                { name: 'Contacto vía Email', included: true },
                { name: 'WhatsApp Directo habilitado', included: true },
                { name: 'Posicionamiento Alto', included: true },
                { name: 'Boost x 90 días', included: true },
              ],
            },
            {
              name: 'Pro',
              id: 'pro',
              price: '$13.000',
              description: 'Máxima exposición para bicicletas tope de gama.',
              cta: 'Ir al Máximo',
              mostPopular: false,
              features: [
                { name: 'Galería completa (12 fotos)', included: true },
                { name: 'Publicación activa ilimitada', included: true },
                { name: 'Prioridad en portada', included: true },
                { name: 'WhatsApp Directo habilitado', included: true },
                { name: 'Posicionamiento Máximo', included: true },
                { name: 'Boost x 90 días', included: true },
              ],
            },
          ] as const

          const CheckIcon = ({ className = 'h-4 w-4 text-emerald-400' }: { className?: string }) => (
            <svg className={className} fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
              <path strokeLinecap="round" strokeLinejoin="round" d="M5 13l4 4L19 7" />
            </svg>
          )
          const XIcon = ({ className = 'h-4 w-4 text-gray-500' }: { className?: string }) => (
            <svg className={className} fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
              <path strokeLinecap="round" strokeLinejoin="round" d="M6 18L18 6M6 6l12 12" />
            </svg>
          )

          return (
            <section className="rounded-2xl p-6 sm:p-8 border border-gray-800 bg-[#0b1421]" aria-labelledby="plans-title">
              <h2 id="plans-title" className="text-xl font-semibold">Conocé nuestros planes de visibilidad</h2>
              <div className="mt-6 grid grid-cols-1 gap-4 lg:grid-cols-3">
                {TIERS.map((t) => {
                  const isPopular = t.mostPopular
                  const cardBase = 'relative rounded-2xl p-6 sm:p-8 border transition-all'
                  const bgFree = 'bg-[#0f1b2a] border-white/10'
                  const bgPremium = 'bg-gradient-to-b from-blue-900/40 to-transparent border-blue-500/30 ring-2 ring-blue-500 lg:scale-105 shadow-[0_0_60px_rgba(37,99,235,0.25)]'
                  const bgPro = 'bg-[#111827] border-purple-400/20'
                  const cls = `${cardBase} ${t.id==='premium' ? bgPremium : (t.id==='pro' ? bgPro : bgFree)}`
                  return (
                    <div key={t.id} className={cls}>
                      {isPopular && (
                        <div className="absolute -top-4 left-1/2 -translate-x-1/2 rounded-full bg-blue-600 px-3 py-1 text-xs font-bold uppercase tracking-wider text-white">Recomendado</div>
                      )}
                      <div className="flex items-baseline justify-between">
                        <h3 className="text-white text-lg font-semibold">{t.name}</h3>
                        <div className="text-white text-2xl font-bold tracking-tight">{t.price}</div>
                      </div>
                      <p className="mt-1 text-sm text-gray-300">{t.description}</p>
                      <ul className="mt-4 space-y-2 text-sm">
                        {t.features.map((f) => (
                          <li key={f.name} className="flex items-center gap-2 text-gray-300">
                            {f.included ? <CheckIcon /> : <XIcon />}
                            <span className={f.included ? 'text-white/90' : 'text-gray-500'}>{f.name}</span>
                          </li>
                        ))}
                      </ul>
                      <div className="mt-6">
                        {t.id === 'free' ? (
                          <span className="inline-flex items-center rounded-full border border-white/10 bg-white/5 px-3 py-1 text-xs text-white/80">Incluido por defecto (publicás en Gratis)</span>
                        ) : null}
                      </div>
                    </div>
                  )
                })}
              </div>
              <p className="mt-4 text-xs text-gray-400">El boost mejora la visibilidad durante 90 días. La publicación permanece activa siempre.</p>
            </section>
          )
        })()}
      </div>
    </div>
  )
}
