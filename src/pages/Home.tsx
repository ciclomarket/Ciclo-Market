// src/pages/Home.tsx
import Container from '../components/Container'
import Button from '../components/Button'
import ListingCard from '../components/ListingCard'
import EmptyState from '../components/EmptyState'
import { mockListings } from '../mock/mockData'
import { useEffect, useMemo, useState } from 'react'
import SkeletonCard from '../components/SkeletonCard'
import { Link, useNavigate } from 'react-router-dom'
import { useCurrency } from '../context/CurrencyContext'
import HorizontalSlider from '../components/HorizontalSlider'
import { fetchListings } from '../services/listings'
import { supabaseEnabled } from '../services/supabase'
import type { Listing } from '../types'
import { buildListingSlug } from '../utils/slug'
import { hasPaidPlan } from '../utils/plans'
import { applySeo } from '../utils/seo'

import specializedLogo from '/brands/specialized.svg'
import canyonLogo from '/brands/canyon.svg'
import trekLogo from '/brands/trek.svg'
import scottLogo from '/brands/scott.svg'
import cannondaleLogo from '/brands/cannondale.svg'
import cerveloLogo from '/brands/cervelo.svg'
import colnerLogo from '/brands/colner.svg'
import topmegaLogo from '/brands/topmega.svg'

// ── Config marcas: logos en /public/brands/*.svg
const BRANDS = [
  { slug: 'specialized', name: 'Specialized' },
  { slug: 'canyon', name: 'Canyon' },
  { slug: 'trek', name: 'Trek' },
  { slug: 'scott', name: 'Scott' },
  { slug: 'cannondale', name: 'Cannondale' },
  { slug: 'cervelo', name: 'Cervelo' },
  { slug: 'colner', name: 'Colner' },
  { slug: 'topmega', name: 'Top Mega' }
] as const

const BRAND_LOGOS: Record<(typeof BRANDS)[number]['slug'], string> = {
  specialized: specializedLogo,
  canyon: canyonLogo,
  trek: trekLogo,
  scott: scottLogo,
  cannondale: cannondaleLogo,
  cervelo: cerveloLogo,
  colner: colnerLogo,
  topmega: topmegaLogo,
}

function OfferCard({ l }: { l: any }) {
  const { format } = useCurrency()
  const hasOriginal = typeof l.originalPrice === 'number' && l.originalPrice > l.price
  const offPct = hasOriginal ? Math.round((1 - l.price / l.originalPrice) * 100) : 0
  const slug = l.slug ?? buildListingSlug({ id: l.id, title: l.title, brand: l.brand, model: l.model, category: l.category })
  return (
    <Link to={`/listing/${slug}`} className="card-flat overflow-hidden block group">
      <div className="relative">
        <div className="aspect-video overflow-hidden bg-[#0b131c]/20">
          <img
            src={l.images?.[0]}
            alt={l.title}
            className="w-full h-full object-cover group-hover:scale-105 transition"
            loading="lazy"
          />
        </div>
        {hasOriginal && (
          <span className="absolute top-2 left-2 bg-mb-secondary text-white text-xs rounded-full px-2 py-0.5">
            -{offPct}%
          </span>
        )}
      </div>
      <div className="p-4">
        <h3 className="font-semibold text-[#14212e] line-clamp-1">{l.title}</h3>
        <p className="text-sm text-[#14212e]/70 mt-1">
          {l.location} • {l.brand} {l.model}
        </p>
        <div className="mt-2 flex items-baseline gap-2">
          <span className="text-mb-primary font-bold">{format(l.price)}</span>
          {hasOriginal && (
            <span className="text-sm line-through text-black/50">
              {format(l.originalPrice)}
            </span>
          )}
        </div>
      </div>
    </Link>
  )
}

function BrandLogo({
  brand,
  active,
  onClick,
}: {
  brand: (typeof BRANDS)[number]
  active: boolean
  onClick: () => void
}) {
  const [err, setErr] = useState(false)
  return (
    <button
      onClick={onClick}
      className={`rounded-2xl border transition transform hover:scale-[1.03] bg-white p-4 h-20 grid place-content-center
                  ${
                    active
                      ? 'border-[#14212e] ring-2 ring-[#14212e]/40 bg-white'
                      : 'border-white/60 bg-white/80 hover:border-[#14212e]/30 hover:bg-white'
                  } backdrop-blur`}
      title={brand.name} aria-pressed={active}
    >
      {!err ? (
        <img
          src={BRAND_LOGOS[brand.slug]}
          alt={brand.name}
          className="max-h-8 w-auto opacity-90"
          onError={() => setErr(true)}
        />
      ) : (
        <span className="px-3 py-1 text-sm font-semibold">{brand.name}</span>
      )}
    </button>
  )
}

function Stat({ n, t }: { n: string; t: string }) {
  return (
    <div className="rounded-xl2 border border-white/20 bg-white/10 p-4 backdrop-blur">
      <div className="text-2xl font-extrabold text-white">{n}</div>
      <div className="text-sm text-white/70">{t}</div>
    </div>
  )
}

function Step({ n, t, d }: { n: number; t: string; d: string }) {
  return (
    <div
      className="rounded-2xl border border-white/15 bg-white/10 p-5 transition hover:bg-white/16 backdrop-blur"
      style={{
        backgroundImage:
          'radial-gradient(120px 40px at 20% 0%, rgba(20,33,46,.12), transparent), radial-gradient(120px 40px at 80% 0%, rgba(20,33,46,.18), transparent)'
      }}
    >
      <div className="grid size-10 place-content-center rounded-xl2 bg-white/90 font-bold text-[#14212e]">{n}</div>
      <h4 className="mt-3 font-semibold text-white">{t}</h4>
      <p className="text-sm text-white/70">{d}</p>
    </div>
  )
}

export default function Home() {
  const [listings, setListings] = useState<Listing[]>([])
  const [dataStatus, setDataStatus] = useState<'idle' | 'loading' | 'ready'>('loading')

  // Filtros simples
  const [brand, setBrand] = useState<string>('')
  const navigate = useNavigate()

  useEffect(() => {
    let active = true
    const load = async () => {
      setDataStatus('loading')
      if (supabaseEnabled) {
        const data = await fetchListings()
        if (!active) return
        setListings(data)
        setDataStatus('ready')
        return
      }
      if (!active) return
      setListings(mockListings)
      setDataStatus('ready')
    }
    load()
    applySeo({
      title: 'Ciclo Market | Comprá y vendé bicicletas en Argentina',
      description: 'Explorá el marketplace de bicicletas Ciclo Market: publicaciones destacadas, planes flexibles y contacto directo con vendedores verificados.'
    })
    return () => {
      active = false
    }
  }, [])

  const loading = dataStatus !== 'ready'

  // Ofertas: originalPrice > price
  const offers = useMemo(
    () => listings.filter((l: any) => typeof l.originalPrice === 'number' && l.price < l.originalPrice),
    [listings]
  )

  const featuredListingsRaw = useMemo(
    () => listings.filter((l) => hasPaidPlan(l.sellerPlan ?? (l.plan as any), l.sellerPlanExpires)),
    [listings]
  )

  const featuredListings = featuredListingsRaw.length ? featuredListingsRaw : listings.slice(0, 8)

  // Filtrado general
  const filtered = useMemo(
    () =>
      listings.filter((l) => {
        if (brand && l.brand.toLowerCase() !== brand.toLowerCase()) return false
        return true
      }),
    [listings, brand]
  )

  const clearBrand = () => setBrand('')

  const handleBrandClick = (brandName: string) => {
    setBrand(brandName)
    navigate(`/marketplace?brand=${encodeURIComponent(brandName)}`)
  }

  return (
    <>
      {/* HERO */}
      <section className="relative overflow-hidden border-b border-white/10 text-white">
        <img
          src="/bicicletas-home.jpg"
          alt="Ciclistas rodando en ruta"
          className="absolute inset-0 -z-20 h-full w-full object-cover"
        />
        <div className="absolute inset-0 -z-10 bg-[#14212e]/60" />
        <div className="absolute inset-0 -z-10 bg-[radial-gradient(1200px_600px_at_-20%_-10%,rgba(255,255,255,0.18),transparent_70%)]" />
        <div className="absolute inset-0 -z-10 bg-[radial-gradient(900px_520px_at_110%_10%,rgba(20,33,46,0.28),transparent_78%)]" />
        <Container>
          <div className="relative grid items-center gap-10 py-16 lg:grid-cols-[minmax(0,1fr)_minmax(0,0.75fr)]">
            <div className="order-2 lg:order-1">
              <span className="inline-flex items-center gap-3 rounded-full border border-white/10 bg-white/10 px-3 py-1 text-xs uppercase tracking-[0.4em] text-white/70">
                Comunidad Ciclista
              </span>
              <h1 className="mt-6 text-3xl font-extrabold leading-tight tracking-tight text-white sm:text-4xl md:text-5xl">
                El marketplace de bicicletas en Argentina
              </h1>
              <p className="mt-4 max-w-prose text-lg leading-relaxed text-white/75">
                Publicá tu bici, conectá con compradores y vendé fácil. Planes simples, sin comisiones por venta.
              </p>
              <div className="mt-6 flex flex-wrap gap-3">
                <Button
                  to="/publicar"
                  className="bg-white text-[#14212e] shadow-xl ring-white/30 hover:bg-white/90 hover:text-[#14212e]"
                >
                  Publicar bicicleta
                </Button>
                <Link
                  to="/marketplace"
                  className="btn border border-white/30 bg-transparent text-white ring-white/30 hover:bg-white/10 hover:text-white"
                >
                  Explorar bicicletas
                </Link>
              </div>
              <div className="mt-10 grid grid-cols-3 gap-4 text-center">
                <Stat n="2k+" t="Publicaciones" />
                <Stat n="1.2k" t="Vendedores" />
                <Stat n="18" t="Provincias" />
              </div>
            </div>
            <div className="order-1 hidden justify-center lg:order-2 lg:flex">
              <div className="relative aspect-[4/5] w-full max-w-xs overflow-hidden rounded-[32px] border border-white/20 bg-white/5 shadow-[0_25px_60px_rgba(12,20,28,0.45)] backdrop-blur">
                <img
                  src="/bicicletas-home.jpg"
                  alt="Detalle de bicicleta"
                  className="h-full w-full object-cover"
                />
                <div className="absolute inset-0 bg-gradient-to-t from-[#14212e]/70 via-[#14212e]/10 to-transparent" />
              </div>
            </div>
          </div>
        </Container>
      </section>

      {/* BICICLETAS DESTACADAS */}
      {featuredListings.length > 0 && (
        <section className="section-soft pt-12 pb-6">
          <Container>
            <HorizontalSlider
              title="Bicicletas destacadas"
              subtitle="Avisos con planes Premium o Básico activos"
              items={featuredListings}
              maxItems={24}
              initialLoad={8}
              renderCard={(l: any) => <ListingCard l={l} />}
            />
          </Container>
        </section>
      )}

      {/* OFERTAS DESTACADAS */}
      <section className="section-soft pt-12 pb-12">
        <Container>
          {offers.length ? (
            <HorizontalSlider
              title="Ofertas destacadas"
              subtitle="Bicicletas con precio reducido recientemente"
              items={offers}
              maxItems={20}
              initialLoad={8}
              renderCard={(l:any) => <OfferCard l={l} />}
            />
          ) : (
            <>
              <div className="flex items-center justify-between mb-4">
                <h2 className="text-xl font-semibold">Ofertas destacadas</h2>
                <span className="text-sm text-black/60">Bicicletas con precio rebajado</span>
              </div>
              <EmptyState title="Sin ofertas por ahora" subtitle="Cuando una publicación tenga rebaja, aparecerá acá." />
            </>
          )}
        </Container>
      </section>

      {/* ÚLTIMAS PUBLICADAS */}
      <section id="explorar" className="pt-12">
        <Container>
          <div className="flex items-center justify-between mb-4">
            <h2 className="text-xl font-semibold">Últimas publicadas</h2>
          </div>

          {loading ? (
            <div className="grid sm:grid-cols-2 lg:grid-cols-3 gap-5">
              {Array.from({length:6}).map((_,i)=><SkeletonCard key={i}/>)}
            </div>
          ) : filtered.length ? (
            <HorizontalSlider
              title=" "
              items={filtered}
              maxItems={20}
              initialLoad={8}
              renderCard={(l:any) => <ListingCard l={l} />}
            />
          ) : (
            <EmptyState />
          )}
        </Container>
      </section>

      {/* MARCAS con logos clickeables */}
      <section className="section-soft py-12">
        <Container>
          <div className="flex items-center justify-between mb-4">
            <h3 className="text-lg font-semibold">Marcas destacadas</h3>
            {brand && <button className="btn btn-ghost text-sm" onClick={clearBrand}>Limpiar marca</button>}
          </div>
          <div className="grid grid-cols-2 sm:grid-cols-4 lg:grid-cols-8 gap-4">
            {BRANDS.map(b => (
              <BrandLogo
                key={b.slug}
                brand={b}
                active={brand.toLowerCase() === b.name.toLowerCase()}
                onClick={() => handleBrandClick(b.name)}
              />
            ))}
          </div>
        </Container>
      </section>

      {/* ¿CÓMO FUNCIONA? */}
      <section className="section-ribbon py-14 text-white">
        <Container>
          <div
            className="rounded-3xl border border-white/10 bg-white/5 p-6 md:p-10 backdrop-blur"
            style={{
              backgroundImage:
                'radial-gradient(400px 160px at 10% 0%, rgba(255,255,255,.16), transparent 70%), radial-gradient(400px 160px at 90% 0%, rgba(20,33,46,.24), transparent 70%)'
            }}
          >
            <div className="grid md:grid-cols-4 gap-6 items-stretch">
              <Step n={1} t="Registrate" d="Creá tu cuenta en minutos." />
              <Step n={2} t="Publicá" d="Elegí un plan y subí tu bici." />
              <Step n={3} t="Contactá" d="Respondé mensajes y coordiná la venta." />
              <Step n={4} t="Vende" d="Concretá la operación de forma segura." />
            </div>
          </div>
        </Container>
      </section>
    </>
  )
}
