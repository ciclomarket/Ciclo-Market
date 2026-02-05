import { useEffect } from 'react'
import { useNavigate, useSearchParams } from 'react-router-dom'
import { Check } from 'lucide-react'

import Container from '../../components/Container'
import { useAuth } from '../../context/AuthContext'

type ListingType = 'bike' | 'accessory' | 'apparel' | 'nutrition'

function AutoNav({ to }: { to: string }) {
  const navigate = useNavigate()
  useEffect(() => {
    navigate(to, { replace: true })
  }, [navigate, to])
  return null
}

const CATEGORY_CARDS: Array<{
  type: ListingType
  title: string
  desc: string
  href: string
  image: string
}> = [
  {
    type: 'bike',
    title: 'Bicicletas',
    desc: 'Vendé tu bici lista para rodar.',
    href: '/publicar/crear?type=bike',
    image: '/design/Banners-Mobile/1.webp',
  },
  {
    type: 'accessory',
    title: 'Accesorios',
    desc: 'Ruedas, componentes y electrónica.',
    href: '/publicar/crear?type=accessory',
    image: '/design/Banners-Mobile/2.webp',
  },
  {
    type: 'apparel',
    title: 'Indumentaria',
    desc: 'Jerseys, cascos y zapatillas.',
    href: '/publicar/crear?type=apparel',
    image: '/design/Banners-Mobile/3.webp',
  },
  {
    type: 'nutrition',
    title: 'Nutrición',
    desc: 'Gels, barritas y suplementos.',
    href: '/publicar/crear?type=nutrition',
    image: '/design/Banners-Mobile/4.webp',
  },
]

export default function ChooseType() {
  const { user } = useAuth()
  const [searchParams] = useSearchParams()
  const navigate = useNavigate()

  const handleSelect = (href: string) => {
    if (!user) {
      navigate(`/login?redirect=${encodeURIComponent(href)}`)
      return
    }
    navigate(href)
  }

  const t = (searchParams.get('type') || '').toLowerCase()
  if (t === 'bike' || t === 'accessory' || t === 'apparel' || t === 'nutrition') {
    const next = new URLSearchParams(Array.from(searchParams.entries()))
    const target = `/publicar/crear?${next.toString()}`
    if (!user) return <AutoNav to={`/login?redirect=${encodeURIComponent(target)}`} />
    return <AutoNav to={target} />
  }

  return (
    <div className="min-h-screen bg-gray-50">
      <Container className="!py-0 !pt-12 md:!pt-16 !pb-16">
        <section className="text-center">
          <h1 className="text-3xl font-bold text-mb-ink">¿Qué querés vender hoy?</h1>
          <p className="mt-2 text-gray-500">
            Elegí una categoría para empezar. Es gratis y sin comisiones por venta.
          </p>
        </section>

        <section className="mt-12" aria-label="Categorías">
          <div className="mx-auto max-w-5xl">
            <div className="grid grid-cols-2 gap-3 sm:grid-cols-4 sm:gap-6">
              {CATEGORY_CARDS.map((it) => {
                return (
                  <button
                    key={it.type}
                    type="button"
                    onClick={() => handleSelect(it.href)}
                    className="relative w-full overflow-hidden rounded-3xl border-2 border-gray-200 bg-white transition hover:border-gray-300 hover:shadow-md focus:outline-none focus-visible:ring-2 focus-visible:ring-mb-primary/40 focus-visible:ring-offset-2 focus-visible:ring-offset-gray-50"
                    aria-label={`Elegir ${it.title}`}
                  >
                    <div className="relative aspect-square">
                      <img
                        src={it.image}
                        alt={it.title}
                        className="h-full w-full object-cover"
                        loading="lazy"
                        decoding="async"
                      />
                      <div className="absolute inset-0 bg-gradient-to-t from-[#050c18]/85 via-transparent to-transparent" aria-hidden />
                      <div className="absolute inset-0 flex items-end p-2 sm:p-4">
                        <div className="space-y-1 text-left">
                          <span className="text-sm font-semibold text-white sm:text-lg drop-shadow-[0_1px_2px_rgba(0,0,0,0.8)]">
                            {it.title}
                          </span>
                          <span className="hidden text-xs text-white/80 sm:block">{it.desc}</span>
                        </div>
                      </div>
                    </div>
                  </button>
                )
              })}
            </div>
          </div>
        </section>

        <section className="mt-16" aria-labelledby="plans-title">
          <h2 id="plans-title" className="text-center text-2xl font-bold text-mb-ink">
            Nuestros planes de visibilidad
          </h2>
          <p className="mt-2 text-center text-sm text-gray-500">
            Podés empezar gratis y mejorar tu visibilidad cuando quieras.
          </p>

          <div className="mt-8 grid grid-cols-1 gap-4 lg:grid-cols-3">
            <div className="rounded-2xl bg-white p-8 shadow-sm border border-gray-200">
              <div className="text-sm font-semibold text-gray-600">Free</div>
              <div className="mt-3 flex items-end gap-2">
                <div className="text-3xl font-bold text-mb-ink">Gratis</div>
              </div>
              <ul className="mt-6 space-y-3 text-sm text-gray-600">
                {['Publicación activa ilimitada', 'Contacto por email', 'Visibilidad estándar', 'Sin comisiones por venta'].map(
                  (feature) => (
                    <li key={feature} className="flex items-start gap-2">
                      <Check className="mt-0.5 h-4 w-4 text-gray-400" aria-hidden="true" />
                      <span>{feature}</span>
                    </li>
                  ),
                )}
              </ul>
            </div>

            <div className="relative rounded-2xl bg-white p-8 shadow-sm border border-blue-500 ring-2 ring-blue-500/15 shadow-[0_14px_40px_rgba(59,130,246,0.12)]">
              <div className="absolute -top-3 left-1/2 -translate-x-1/2 rounded-full bg-blue-600 px-3 py-1 text-xs font-bold text-white">
                Recomendado
              </div>
              <div className="text-sm font-semibold text-blue-700">Premium</div>
              <div className="mt-3 flex items-end gap-2">
                <div className="text-3xl font-bold text-mb-ink">$9.000</div>
              </div>
              <ul className="mt-6 space-y-3 text-sm text-gray-700">
                {['WhatsApp directo', 'Mejor posicionamiento', 'Más exposición durante 90 días', 'Ideal para vender más rápido'].map(
                  (feature) => (
                    <li key={feature} className="flex items-start gap-2">
                      <Check className="mt-0.5 h-4 w-4 text-blue-600" aria-hidden="true" />
                      <span>{feature}</span>
                    </li>
                  ),
                )}
              </ul>
            </div>

            <div className="rounded-2xl bg-white p-8 shadow-sm border border-gray-200">
              <div className="text-sm font-semibold text-gray-700">Pro</div>
              <div className="mt-3 flex items-end gap-2">
                <div className="text-3xl font-bold text-mb-ink">$13.000</div>
              </div>
              <ul className="mt-6 space-y-3 text-sm text-gray-700">
                {['Máxima exposición', 'Prioridad en portada', 'WhatsApp directo', 'Boost de visibilidad 90 días'].map(
                  (feature) => (
                    <li key={feature} className="flex items-start gap-2">
                      <Check className="mt-0.5 h-4 w-4 text-blue-600" aria-hidden="true" />
                      <span>{feature}</span>
                    </li>
                  ),
                )}
              </ul>
            </div>
          </div>
        </section>
      </Container>
    </div>
  )
}
