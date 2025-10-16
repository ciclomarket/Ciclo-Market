import { useEffect, useMemo, useState } from 'react'
import { Link, Navigate, useParams } from 'react-router-dom'
import Container from '../components/Container'
import SEO from '../components/SEO'
import JsonLd from '../components/JsonLd'
import { fetchListings } from '../services/listings'
import type { Listing } from '../types'
import ListingCard from '../components/ListingCard'
import { supabaseEnabled } from '../services/supabase'

type LandingConf = {
  slug: string
  cat: 'Ruta' | 'MTB' | 'Urbana' | 'Fixie' | 'Triatlón' | 'E-Bike' | 'Pista' | 'Accesorios' | 'Indumentaria'
  title: string
  description: string
  intro: string
  related?: Array<{ href: string; label: string }>
}

const LANDINGS: Record<string, LandingConf> = {
  'bicicletas-de-ruta': {
    slug: 'bicicletas-de-ruta',
    cat: 'Ruta',
    title: 'Bicicletas de ruta en Argentina',
    description: 'Encontrá bicicletas de ruta nuevas y usadas: aero, escaladoras y endurance. Comprá y vendé con contacto directo al vendedor.',
    intro:
      'Pedalear en ruta es sinónimo de velocidad y resistencia. En Ciclo Market reunimos modelos aero, escaladores y endurance para que elijas la bici que va con tu forma de rodar. Compará por grupo, talla y material, mirá fotos reales y contactá al vendedor por WhatsApp o email. Publicar y encontrar tu próxima ruta es fácil y transparente.',
    related: [
      { href: '/marketplace/mtb', label: 'MTB' },
      { href: '/marketplace/e-bike', label: 'E‑bikes' },
    ],
  },
  mtb: {
    slug: 'mtb',
    cat: 'MTB',
    title: 'MTB: rígidas y dobles',
    description: 'Mountain bikes para XC, trail y enduro. Rígidas y dobles suspensión con fotos reales y precios actualizados.',
    intro:
      'Si buscás una MTB para competir o explorar, acá vas a encontrar opciones rígidas y dobles para XC, trail o enduro. Filtrá por grupo, rodado y recorrido de suspensión para elegir con confianza. Publicar tu MTB usada también es simple: destacá tu aviso y llegá a más compradores.',
    related: [
      { href: '/marketplace/bicicletas-de-ruta', label: 'Ruta' },
      { href: '/marketplace/pista', label: 'Pista' },
    ],
  },
  urbana: {
    slug: 'urbana',
    cat: 'Urbana',
    title: 'Bicicletas urbanas y paseo',
    description: 'Bicicletas urbanas, folding y de paseo para moverte todos los días con estilo y comodidad.',
    intro:
      'Para el día a día, una bici urbana resuelve traslados con comodidad y bajo mantenimiento. Encontrá modelos con portaequipaje, cambios internos y cuadros confort. Publicá la tuya en minutos y conectá directo con interesados verificados.',
  },
  fixie: {
    slug: 'fixie',
    cat: 'Fixie',
    title: 'Fixies y single speed',
    description: 'Fixies y single speed listas para pistear en la ciudad. Componentes livianos y geometrías ágiles.',
    intro:
      'Las fixies enamoran por su simpleza: una relación, menos peso y sensaciones directas. Acá vas a encontrar cuadros urbanos, piñón fijo y single speed personalizados para rodar con estilo. Publicá la tuya o comprá la próxima sin vueltas.',
  },
  triatlon: {
    slug: 'triatlon',
    cat: 'Triatlón',
    title: 'Bicicletas de triatlón y contrarreloj',
    description: 'Bicis de triatlón y CRI con perfiles aero, apoyabrazos y montajes específicos para rendir al máximo.',
    intro:
      'Pensadas para cortar el viento, las bicis de triatlón y contrarreloj priorizan la aerodinámica y posición. Encontrá cuadros con perfiles aero, ruedas de perfil y montajes optimizados. Organizá tu temporada y mejorá tus parciales.',
  },
  'e-bike': {
    slug: 'e-bike',
    cat: 'E-Bike',
    title: 'E‑bikes: asistencia eléctrica',
    description: 'Bicicletas eléctricas urbanas, de ruta y MTB. Motores confiables y baterías de buena autonomía.',
    intro:
      'Sumá autonomía y diversión con una e‑bike. En el marketplace hay opciones urbanas, de ruta y MTB con motores confiables y repuestos disponibles. Compará capacidades de batería, peso y modos de asistencia antes de decidir.',
  },
  pista: {
    slug: 'pista',
    cat: 'Pista',
    title: 'Bicicletas de pista',
    description: 'Cuadros y componentes para velódromo y criterium. Geometrías reactivas y montajes específicos.',
    intro:
      'La pista exige precisión: cuadros rígidos, vainas cortas y componentes livianos. Reunimos opciones para criterium y velódromo para que puedas armar tu setup ideal o vender tu cuadro con llegada a ciclistas de todo el país.',
  },
  accesorios: {
    slug: 'accesorios',
    cat: 'Accesorios',
    title: 'Accesorios para ciclismo',
    description: 'Cascos, luces, rodillos, ciclocomputadoras y más. Equipate mejor para cada salida.',
    intro:
      'Accesorios que hacen la diferencia: cascos, luces, ciclocomputadoras, portabidones, rodillos y más. Comprá con fotos reales y compatibilidades claras. Publicar tus accesorios usados es una manera simple de recuperar inversión.',
  },
  indumentaria: {
    slug: 'indumentaria',
    cat: 'Indumentaria',
    title: 'Indumentaria ciclista',
    description: 'Indumentaria técnica para ciclismo: culottes, jerseys, camperas y calzado de ruta o MTB.',
    intro:
      'Elegí indumentaria técnica pensada para pedalear: jerseys, culottes, camperas y calzado específico. Sumá confort y performance, y dale nueva vida a tu equipamiento usado publicándolo en minutos.',
  },
}

function toItemListJson(origin: string, items: Listing[]) {
  return {
    '@context': 'https://schema.org',
    '@type': 'ItemList',
    itemListElement: items.slice(0, 20).map((l, idx) => ({
      '@type': 'ListItem',
      position: idx + 1,
      url: `${origin}/listing/${encodeURIComponent(l.slug ?? l.id)}`,
      item: {
        '@type': 'Product',
        name: l.title,
        image: Array.isArray(l.images) && l.images.length ? l.images[0] : undefined,
        category: l.category,
        offers: typeof l.price === 'number' && l.price > 0 ? {
          '@type': 'Offer',
          price: l.price,
          priceCurrency: (l.priceCurrency || 'ARS').toUpperCase(),
          availability: 'https://schema.org/InStock'
        } : undefined
      }
    }))
  }
}

export default function CategoryLanding() {
  const params = useParams()
  const slug = String(params.slug || '')
  const conf = LANDINGS[slug]
  const [listings, setListings] = useState<Listing[]>([])
  const [loading, setLoading] = useState(true)

  useEffect(() => {
    let active = true
    const load = async () => {
      setLoading(true)
      const data = await fetchListings()
      if (!active) return
      const filtered = data.filter((l) => l.category === conf?.cat)
      setListings(filtered)
      setLoading(false)
    }
    if (conf) void load()
    return () => { active = false }
  }, [slug])

  if (!conf) return <Navigate to="/marketplace" replace />

  const originEnv = (import.meta.env.VITE_FRONTEND_URL || import.meta.env.VITE_SITE_URL || '').trim()
  const runtimeOrigin = typeof window !== 'undefined' ? window.location.origin : ''
  const origin = (originEnv || runtimeOrigin || 'https://ciclomarket.ar').replace(/\/$/, '')
  const itemListJson = toItemListJson(origin, listings)

  return (
    <>
      <SEO title={conf.title} description={conf.description} />
      <JsonLd data={itemListJson} />
      <section className="bg-[#0b131c] text-white">
        <Container>
          <div className="mx-auto max-w-3xl py-10">
            <h1 className="text-3xl font-extrabold tracking-tight sm:text-4xl">{conf.title}</h1>
            <p className="mt-3 text-white/80">{conf.intro}</p>
            {conf.related && conf.related.length > 0 && (
              <div className="mt-5 flex flex-wrap gap-2 text-sm">
                {conf.related.map((r) => (
                  <Link key={r.href} to={r.href} className="rounded-full border border-white/20 bg-white/10 px-3 py-1 text-white/90 hover:bg-white/20">
                    {r.label}
                  </Link>
                ))}
              </div>
            )}
          </div>
        </Container>
      </section>

      <section className="bg-[#14212e] text-white">
        <Container>
          <div className="py-10">
            <h2 className="text-xl font-bold">Últimos avisos en {conf.cat}</h2>
            {loading && <div className="mt-6 text-white/80">Cargando…</div>}
            {!loading && (
              <div className="mt-6 grid grid-cols-1 gap-5 sm:grid-cols-2 lg:grid-cols-3">
                {listings.slice(0, 20).map((l) => (
                  <ListingCard key={l.id} listing={l} />
                ))}
              </div>
            )}
          </div>
        </Container>
      </section>
    </>
  )
}

