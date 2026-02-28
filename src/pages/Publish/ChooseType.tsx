import { Link, useNavigate, useSearchParams } from 'react-router-dom'
import { useEffect } from 'react'
import { useAuth } from '../../context/AuthContext'
import Container from '../../components/Container'
// Button ya no se usa acá para tener control total del estilo
// import Button from '../../components/Button' 

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

  // Auto redirect if /publicar?type=... is provided
  const t = (searchParams.get('type') || '').toLowerCase()
  if (t === 'bike' || t === 'accessory' || t === 'apparel' || t === 'nutrition') {
    const next = new URLSearchParams(Array.from(searchParams.entries()))
    return <AutoNav to={`/publicar/nueva?${next.toString()}`} />
  }

  return (
    <div className="min-h-screen bg-[#14212E] text-white py-12 px-4">
      <div className="max-w-5xl mx-auto space-y-14">
        {/* Section A: Category Selection */}
        <section>
          <h1 className="text-3xl font-bold text-center mb-2">Qué querés publicar hoy?</h1>
          <p className="text-center text-gray-400 mb-10">Elegí una categoría. Empezá en Gratis y mejorá cuando quieras.</p>
          <div className="grid gap-3 grid-cols-2 lg:grid-cols-4">
            {items.map((it) => (
              <div
                key={it.type}
                role="link"
                tabIndex={0}
                onClick={() => navigate(it.href)}
                onKeyDown={(e) => { if (e.key === 'Enter' || e.key === ' ') { e.preventDefault(); navigate(it.href) } }}
                className="group relative overflow-hidden rounded-xl border border-gray-700 h-64 cursor-pointer transition-all hover:border-blue-500 hover:shadow-[0_0_20px_rgba(59,130,246,0.4)] hover:-translate-y-1 focus:outline-none focus-visible:ring-2 focus-visible:ring-white"
                aria-label={`Seleccionar ${it.title}`}
              >
                {/* Background image with Zoom Effect */}
                <img src={it.img} alt={it.title}
                  className="absolute inset-0 w-full h-full object-cover transition-transform duration-700 group-hover:scale-110" />
                
                {/* Overlay gradient: Más oscuro abajo para asegurar contraste */}
                <div className="absolute inset-0 bg-gradient-to-t from-black/95 via-black/60 to-black/20" />
                
                {/* Content */}
                <div className="absolute inset-0 z-10 p-5 flex flex-col justify-end">
                  <div className="text-lg font-bold text-white tracking-wide drop-shadow-md">{it.title}</div>
                  <p className="mt-1 text-sm text-gray-200 drop-shadow-sm leading-tight">{it.desc}</p>
                  
                  <div className="mt-4">
                    {/* BOTÓN CORREGIDO: Estilos directos, sin componente wrapper */}
                    <button
                      type="button"
                      className="relative z-20 w-full py-2.5 rounded-lg border border-white/40 bg-white/10 backdrop-blur-md text-white font-bold tracking-wide transition-all duration-300 group-hover:bg-blue-600 group-hover:border-blue-600 group-hover:text-white shadow-[0_4px_6px_rgba(0,0,0,0.3)]"
                    >
                      Seleccionar
                    </button>
                  </div>
                </div>
              </div>
            ))}
          </div>
        </section>

        {/* Section B: Plans Comparison */}
        <section className="bg-[#1a2c3d] rounded-2xl p-6 sm:p-8 border border-gray-700" aria-labelledby="plans-title">
          <h2 id="plans-title" className="text-xl font-semibold text-center md:text-left">Conocé nuestros planes de visibilidad</h2>
          <div className="mt-8 grid grid-cols-1 lg:grid-cols-3 gap-6">
            {/* FREE */}
            <div className="rounded-xl bg-[#172433] p-6 border border-gray-700 flex flex-col justify-between">
              <div>
                <div className="text-white font-semibold text-lg">Gratis</div>
                <div className="mt-2 text-3xl font-bold text-gray-400">$0</div>
              </div>
              <div className="mt-6 space-y-3 text-sm">
                <div className="flex items-center justify-between text-gray-300 py-1 border-b border-gray-700/50"><span>Fotos</span><span className="text-white font-medium">4</span></div>
                <div className="flex items-center justify-between text-gray-300 py-1 border-b border-gray-700/50"><span>WhatsApp</span><span className="text-gray-500 font-bold">✕</span></div>
                <div className="flex items-center justify-between text-gray-300 py-1 border-b border-gray-700/50"><span>Visibilidad</span><span className="text-white">Estándar</span></div>
                <div className="flex items-center justify-between text-gray-300 py-1"><span>Prioridad</span><span className="text-gray-500">Baja</span></div>
              </div>
            </div>

            {/* PREMIUM (Recommended) - Highlighted */}
            <div className="relative rounded-xl bg-gradient-to-b from-blue-900/20 to-blue-900/5 p-6 border border-blue-500 shadow-[0_0_20px_rgba(59,130,246,0.15)] flex flex-col justify-between scale-105 z-10">
              <div className="absolute -top-3 left-1/2 -translate-x-1/2 rounded-full bg-blue-600 px-4 py-1 text-xs font-bold uppercase tracking-wider text-white shadow-lg">Recomendado</div>
              <div>
                <div className="text-white font-semibold text-lg">Premium</div>
                <div className="mt-2 text-3xl font-bold tracking-tight text-white">$9.000</div>
              </div>
              <div className="mt-6 space-y-3 text-sm">
                <div className="flex items-center justify-between text-gray-200 py-1 border-b border-blue-500/20"><span>Fotos</span><span className="text-white font-bold">8</span></div>
                <div className="flex items-center justify-between text-gray-200 py-1 border-b border-blue-500/20"><span>WhatsApp</span><span className="text-emerald-400 font-bold">✓</span></div>
                <div className="flex items-center justify-between text-gray-200 py-1 border-b border-blue-500/20"><span>Visibilidad/Boost</span><span className="text-blue-200 font-medium">90 días</span></div>
                <div className="flex items-center justify-between text-gray-200 py-1"><span>Prioridad</span><span className="text-blue-400 font-bold">Alta</span></div>
              </div>
            </div>

            {/* PRO */}
            <div className="rounded-xl bg-[#172433] p-6 border border-gray-700 flex flex-col justify-between">
              <div>
                <div className="text-white font-semibold text-lg">Pro</div>
                <div className="mt-2 text-3xl font-bold text-white">$13.000</div>
              </div>
              <div className="mt-6 space-y-3 text-sm">
                <div className="flex items-center justify-between text-gray-300 py-1 border-b border-gray-700/50"><span>Fotos</span><span className="text-white font-medium">12</span></div>
                <div className="flex items-center justify-between text-gray-300 py-1 border-b border-gray-700/50"><span>WhatsApp</span><span className="text-emerald-400 font-bold">✓</span></div>
                <div className="flex items-center justify-between text-gray-300 py-1 border-b border-gray-700/50"><span>Visibilidad/Boost</span><span className="text-white">90 días</span></div>
                <div className="flex items-center justify-between text-gray-300 py-1"><span>Prioridad</span><span className="text-emerald-400 font-bold">Máxima</span></div>
              </div>
            </div>
          </div>
          <p className="mt-6 text-center text-xs text-gray-500">El boost mejora la visibilidad durante 90 días. La publicación permanece activa siempre.</p>
        </section>
      </div>
    </div>
  )
}