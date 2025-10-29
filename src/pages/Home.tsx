// src/pages/Home.tsx
import Container from '../components/Container'
import Button from '../components/Button'
import ListingCard from '../components/ListingCard'
import EmptyState from '../components/EmptyState'
import { mockListings } from '../mock/mockData'
import { useEffect, useMemo, useState, type ReactNode } from 'react'
import SkeletonCard from '../components/SkeletonCard'
import { Link, useNavigate } from 'react-router-dom'
import { useCurrency } from '../context/CurrencyContext'
import { formatListingPrice } from '../utils/pricing'
import HorizontalSlider from '../components/HorizontalSlider'
import { transformSupabasePublicUrl } from '../utils/supabaseImage'
import { fetchListings } from '../services/listings'
import { supabaseEnabled } from '../services/supabase'
import { fetchLikeCounts } from '../services/likes'
import type { Listing } from '../types'
import { buildListingSlug } from '../utils/slug'
import { hasPaidPlan } from '../utils/plans'
import { track, trackOncePerSession } from '../services/track'

import specializedLogo from '/brands/specialized.png'
import canyonLogo from '/brands/canyon.png'
import trekLogo from '/brands/trek.png'
import scottLogo from '/brands/scott.png'
import cannondaleLogo from '/brands/cannondale.png'
import cerveloLogo from '/brands/cervelo.png'
import colnerLogo from '/brands/colner.png'
import giantLogo from '/brands/giant.png'

// ── Config marcas: logos en /public/brands/*.png
const BRANDS = [
  { slug: 'specialized', name: 'Specialized' },
  { slug: 'canyon', name: 'Canyon' },
  { slug: 'trek', name: 'Trek' },
  { slug: 'scott', name: 'Scott' },
  { slug: 'cannondale', name: 'Cannondale' },
  { slug: 'giant', name: 'Giant' },
  { slug: 'cervelo', name: 'Cervelo' },
  { slug: 'colner', name: 'Colner' },
] as const

const BRAND_LOGOS: Record<(typeof BRANDS)[number]['slug'], string> = {
  specialized: specializedLogo,
  canyon: canyonLogo,
  trek: trekLogo,
  scott: scottLogo,
  cannondale: cannondaleLogo,
  giant: giantLogo,
  cervelo: cerveloLogo,
  colner: colnerLogo,
}

function HeroBackground() {
  const [src, setSrc] = useState('/bicicletas-home-card.jpg')
  useEffect(() => {
    const pick = () => {
      const w = window.innerWidth
      const dpr = window.devicePixelRatio || 1
      // Elegir asset según ancho/dpr. En mobile usamos la versión más liviana.
      if (w * dpr > 1200) setSrc('/bicicletas-home.jpg')
      else setSrc('/bicicletas-home-card.jpg')
    }
    pick()
    window.addEventListener('resize', pick)
    return () => window.removeEventListener('resize', pick)
  }, [])
  return (
    <div
      className="absolute inset-0 -z-20 bg-cover bg-center md:[background-position:50%_28%]"
      style={{ backgroundImage: `url(${src})` }}
      aria-hidden
    />
  )
}

function OfferCard({ l }: { l: any }) {
  const { format, fx } = useCurrency()
  const hasOriginal = typeof l.originalPrice === 'number' && l.originalPrice > l.price
  const offPct = hasOriginal ? Math.round((1 - l.price / l.originalPrice) * 100) : 0
  const slug = l.slug ?? buildListingSlug({ id: l.id, title: l.title, brand: l.brand, model: l.model, category: l.category })
  const city = l.location?.split(',')[0]?.trim() || null
  const extrasTokens = (l.extras ?? '')
    .split('•')
    .map((part: string) => part.trim())
    .filter(Boolean)
  const getExtraValue = (label: string) => {
    const token = extrasTokens.find((part: string) => part.toLowerCase().startsWith(`${label.toLowerCase()}:`))
    if (!token) return null
    return token.split(':').slice(1).join(':').trim() || null
  }
  let metaParts: Array<string | null>
  if (l.category === 'Accesorios') {
    const typeValue = getExtraValue('Tipo')
    const useValue = getExtraValue('Uso')
    metaParts = [typeValue, useValue ? `Uso: ${useValue}` : null, city]
  } else if (l.category === 'Indumentaria') {
    const typeValue = getExtraValue('Tipo')
    const multiSizes = getExtraValue('Talles')
    const singleSize = getExtraValue('Talle')
    const mergedSize = multiSizes ?? singleSize
    const usePlural = Boolean(multiSizes) || Boolean(mergedSize && mergedSize.includes(','))
    const conditionValue = getExtraValue('Condición')
    metaParts = [
      typeValue,
      mergedSize ? `${usePlural ? 'Talles' : 'Talle'}: ${mergedSize}` : null,
      conditionValue ? `Condición: ${conditionValue}` : null,
      city
    ]
  } else {
    const multiSizes = getExtraValue('Talles')
    const singleSize = l.frameSize?.trim() || null
    const mergedSize = multiSizes ?? singleSize
    const usePlural = Boolean(multiSizes) || Boolean(mergedSize && mergedSize.includes(','))
    const sizeLabel = mergedSize ? `${usePlural ? 'Talles' : 'Talle'}: ${mergedSize}` : null
    const drivetrainLabel = l.drivetrain?.trim() || null
    metaParts = [sizeLabel, drivetrainLabel, city]
  }
  const metaDisplay = metaParts.filter(Boolean) as string[]
  return (
    <Link to={`/listing/${slug}`} className="card-flat group flex h-full flex-col overflow-hidden">
      <div className="relative">
        <div className="aspect-video overflow-hidden bg-[#0b131c]/20">
          <img
            src={transformSupabasePublicUrl(l.images?.[0] || '', { width: 640, quality: 72, format: 'webp' })}
            srcSet={l.images && l.images[0] ? [320, 480, 640, 768, 960]
              .map((w) => `${transformSupabasePublicUrl(l.images[0], { width: w, quality: 72, format: 'webp' })} ${w}w`).join(', ') : undefined}
            sizes="(max-width: 1023px) 100vw, 33vw"
            alt={l.title}
            className="w-full h-full object-cover group-hover:scale-105 transition"
            loading="lazy"
            decoding="async"
          />
        </div>
        {hasOriginal && (
          <span className="absolute top-2 left-2 bg-mb-secondary text-white text-xs rounded-full px-2 py-0.5">
            -{offPct}%
          </span>
        )}
      </div>
      <div className="flex flex-1 flex-col p-4">
        <h3 className="line-clamp-1 font-semibold text-[#14212e]">{l.title}</h3>
        <p className="mt-1 text-sm text-[#14212e]/70">{metaDisplay.join(' • ')}</p>
        <div className="mt-2 flex items-baseline gap-2">
          <span className="font-bold text-[#14212e]">
            {formatListingPrice(l.price, l.priceCurrency, format, fx)}
          </span>
          {hasOriginal && (
            <span className="text-sm text-black/50 line-through">
              {formatListingPrice(l.originalPrice, l.priceCurrency, format, fx)}
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

function Step({ icon, t, d }: { icon: ReactNode; t: string; d: string }) {
  return (
    <div className="group relative rounded-2xl border border-white/10 bg-white/5 p-6 text-center backdrop-blur transition hover:border-white/20 hover:bg-white/10">
      <div className="mx-auto grid size-12 place-content-center rounded-xl bg-gradient-to-br from-[#0ea5e9] via-[#2563eb] to-[#1d4ed8] text-white shadow-[0_8px_20px_rgba(37,99,235,0.35)]">
        {icon}
      </div>
      <h4 className="mt-3 font-semibold text-white">{t}</h4>
      <p className="mt-2 text-sm text-white/75">{d}</p>
      <div className="pointer-events-none absolute inset-0 rounded-2xl opacity-0 group-hover:opacity-100 ring-1 ring-inset ring-white/10 transition" />
    </div>
  )
}

export default function Home() {
  useEffect(() => {
    trackOncePerSession('site_view_home', () => track('site_view'))
  }, [])
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

  const onlyBikes = (arr: Listing[]) => arr.filter((l) => l.category !== 'Accesorios' && l.category !== 'Indumentaria')
  const featuredListings = featuredListingsRaw.length ? onlyBikes(featuredListingsRaw) : onlyBikes(listings).slice(0, 8)

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

  // Preload estratégico: primeras 2 de "Últimas publicadas"
  useEffect(() => {
    if (typeof document === 'undefined') return
    const preloadTargets = filtered.slice(0, 2)
    const created: HTMLLinkElement[] = []
    for (const l of preloadTargets) {
      const img = (l as any).images?.[0]
      if (!img) continue
      const link = document.createElement('link')
      link.rel = 'preload'
      link.as = 'image'
      link.href = transformSupabasePublicUrl(img, { width: 640, quality: 70, format: 'webp' })
      const srcset = [320, 480, 640, 768, 960].map((w) => `${transformSupabasePublicUrl(img, { width: w, quality: 70, format: 'webp' })} ${w}w`).join(', ')
      link.setAttribute('imagesrcset', srcset)
      link.setAttribute('imagesizes', '(max-width: 1279px) 75vw, 50vw')
      document.head.appendChild(link)
      created.push(link)
    }
    return () => {
      for (const el of created) {
        try { document.head.removeChild(el) } catch { void 0 }
      }
    }
  }, [filtered.slice(0, 2).map((x) => (x as any).id).join(',')])

  // Like counts (batch) for sections
  const [likesFeatured, setLikesFeatured] = useState<Record<string, number>>({})
  const [likesOffers, setLikesOffers] = useState<Record<string, number>>({})
  const [likesRecent, setLikesRecent] = useState<Record<string, number>>({})

  useEffect(() => {
    const ids = featuredListings.slice(0, 24).map((l) => l.id)
    if (!ids.length) { setLikesFeatured({}); return }
    let active = true
    ;(async () => {
      try {
        const map = await fetchLikeCounts(ids)
        if (active) setLikesFeatured(map)
      } catch (error) {
        console.warn('[home] featured likes fetch failed', error)
      }
    })()
    return () => { active = false }
  }, [featuredListings.map((l) => l.id).join(',')])

  useEffect(() => {
    const ids = offers.slice(0, 20).map((l: any) => l.id)
    if (!ids.length) { setLikesOffers({}); return }
    let active = true
    ;(async () => {
      try {
        const map = await fetchLikeCounts(ids)
        if (active) setLikesOffers(map)
      } catch (error) {
        console.warn('[home] offers likes fetch failed', error)
      }
    })()
    return () => { active = false }
  }, [offers.map((l: any) => l.id).join(',')])

  useEffect(() => {
    const ids = filtered.slice(0, 20).map((l) => l.id)
    if (!ids.length) { setLikesRecent({}); return }
    let active = true
    ;(async () => {
      try {
        const map = await fetchLikeCounts(ids)
        if (active) setLikesRecent(map)
      } catch (error) {
        console.warn('[home] recent likes fetch failed', error)
      }
    })()
    return () => { active = false }
  }, [filtered.slice(0, 20).map((l) => l.id).join(',')])

  return (
    <div
      className="relative isolate overflow-hidden text-white"
      style={{ background: '#14212e' }}
    >
      {/* HERO */}
      <section className="relative overflow-hidden border-b border-white/10 text-white">
        {/* Hero como background CSS para no contar como LCP */}
        <HeroBackground />
        <div className="absolute inset-0 -z-10 bg-[#14212e]/60" />
        <div className="absolute inset-0 -z-10 bg-[radial-gradient(1200px_600px_at_-20%_-10%,rgba(255,255,255,0.18),transparent_70%)]" />
        <div className="absolute inset-0 -z-10 bg-[radial-gradient(900px_520px_at_110%_10%,rgba(20,33,46,0.28),transparent_78%)]" />
        <Container>
          <div className="relative mx-auto max-w-4xl py-10 md:py-14 text-center">
            <span className="inline-flex items-center gap-3 rounded-full border border-white/10 bg-white/10 px-3 py-1 text-[11px] uppercase tracking-[0.4em] text-white/70">
              Comunidad ciclista
            </span>
            <h1 className="mt-5 text-3xl font-extrabold leading-tight tracking-tight sm:text-4xl md:text-5xl">
              El nuevo lugar para comprar y vender bicicletas en Argentina.
            </h1>
            <p className="mt-3 mx-auto max-w-2xl text-base md:text-lg text-white/80">
              Publicá en minutos, destacá tu aviso y conectá directo con compradores. Sin comisiones por venta.
            </p>
            <div className="mt-6 flex flex-wrap items-center justify-center gap-3">
              <Button
                to="/publicar"
                className="bg-gradient-to-r from-[#0ea5e9] via-[#2563eb] to-[#1d4ed8] text-white shadow-[0_14px_40px_rgba(37,99,235,0.45)] hover:brightness-110"
              >
                <span>Publicar bicicleta</span>
                <svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24" className="h-4 w-4" fill="none" stroke="currentColor" strokeWidth={1.8}>
                  <path strokeLinecap="round" strokeLinejoin="round" d="M5 12h14m-6-6 6 6-6 6" />
                </svg>
              </Button>
              <Link
                to="/marketplace"
                className="btn bg-[#14212e] text-white shadow-[0_14px_40px_rgba(20,33,46,0.35)] hover:bg-[#1b2f3f]"
              >
                <svg
                  xmlns="http://www.w3.org/2000/svg"
                  viewBox="0 0 24 24"
                  className="h-4 w-4 text-white"
                  fill="none"
                  stroke="currentColor"
                  strokeWidth={1.8}
                >
                  <path strokeLinecap="round" strokeLinejoin="round" d="m17.5 17.5-4-4m1-3.5a5.5 5.5 0 1 1-11 0 5.5 5.5 0 0 1 11 0Z" />
                </svg>
                <span>Explorar bicicletas</span>
              </Link>
            </div>
            <div className="pointer-events-none absolute inset-x-0 -bottom-6 mx-auto h-px max-w-3xl bg-gradient-to-r from-transparent via-white/40 to-transparent" />
          </div>
        </Container>
      </section>

      {/* BICICLETAS DESTACADAS */}
      {featuredListings.length > 0 && (
        <section className="relative isolate overflow-hidden bg-gradient-to-b from-[#0f1729] via-[#101b2d] to-[#0f1729] pt-10 pb-6" style={{ contentVisibility: 'auto' as any }}>
          <div className="pointer-events-none absolute inset-0 -z-10 opacity-60">
            <div className="absolute -top-16 -left-16 h-64 w-64 rounded-full bg-[radial-gradient(circle,_rgba(37,99,235,0.25),_transparent_60%)] blur-2xl" />
            <div className="absolute -bottom-16 -right-10 h-64 w-64 rounded-full bg-[radial-gradient(circle,_rgba(14,165,233,0.20),_transparent_60%)] blur-2xl" />
          </div>
          <Container className="text-white">
            <HorizontalSlider
              title="Bicicletas destacadas"
              subtitle="Avisos con planes Premium o Básico activos"
              items={featuredListings}
              maxItems={24}
              initialLoad={8}
              renderCard={(l: any, idx?: number) => <ListingCard l={l} priority={(idx ?? 0) < 4} likeCount={likesFeatured[l.id]} />}
              tone="dark"
            />
          </Container>
        </section>
      )}

      {/* OFERTAS DESTACADAS */}
      <section className="relative isolate overflow-hidden bg-gradient-to-b from-[#0f1729] via-[#101b2d] to-[#0f1729] pt-8 pb-8" style={{ contentVisibility: 'auto' as any }}>
        <div className="pointer-events-none absolute inset-0 -z-10 opacity-60">
          <div className="absolute -top-16 -left-16 h-64 w-64 rounded-full bg-[radial-gradient(circle,_rgba(37,99,235,0.25),_transparent_60%)] blur-2xl" />
          <div className="absolute -bottom-16 -right-10 h-64 w-64 rounded-full bg-[radial-gradient(circle,_rgba(14,165,233,0.20),_transparent_60%)] blur-2xl" />
        </div>
        <Container className="text-white">
          {offers.length ? (
            <HorizontalSlider
              title="Ofertas destacadas"
              subtitle="Bicicletas con precio reducido recientemente"
              items={offers}
              maxItems={20}
              initialLoad={8}
              renderCard={(l:any, idx?: number) => <ListingCard l={l} priority={(idx ?? 0) < 4} likeCount={likesOffers[l.id]} />}
              tone="dark"
            />
          ) : (
            <>
              <div className="flex items-center justify-between mb-4 text-white">
                <h2 className="text-xl font-semibold">Ofertas destacadas</h2>
                <span className="text-sm text-white/70">Bicicletas con precio rebajado</span>
              </div>
              <EmptyState title="Sin ofertas por ahora" subtitle="Cuando una publicación tenga rebaja, aparecerá acá." />
            </>
          )}
        </Container>
      </section>

      {/* ÚLTIMAS PUBLICADAS */}
      <section id="explorar" className="relative isolate overflow-hidden bg-gradient-to-b from-[#0f1729] via-[#101b2d] to-[#0f1729] pt-8 pb-10" style={{ contentVisibility: 'auto' as any }}>
        <div className="pointer-events-none absolute inset-0 -z-10 opacity-60">
          <div className="absolute -top-16 -left-16 h-64 w-64 rounded-full bg-[radial-gradient(circle,_rgba(37,99,235,0.25),_transparent_60%)] blur-2xl" />
          <div className="absolute -bottom-16 -right-10 h-64 w-64 rounded-full bg-[radial-gradient(circle,_rgba(14,165,233,0.20),_transparent_60%)] blur-2xl" />
        </div>
        <Container className="text-white">
          <div className="flex items-center justify-between mb-4 text-white">
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
              renderCard={(l:any, idx?: number) => <ListingCard l={l} priority={(idx ?? 0) < 4} likeCount={likesRecent[l.id]} />}
              tone="dark"
            />
          ) : (
            <EmptyState />
          )}
        </Container>
      </section>

      {/* MARCAS con logos clickeables */}
      <section className="bg-[#1d2f41] py-12" style={{ contentVisibility: 'auto' as any }}>
        <Container className="text-white">
          <div className="flex items-center justify-between mb-4 text-white">
            <h3 className="text-lg font-semibold">Marcas destacadas</h3>
            {brand && (
              <button
                className="inline-flex items-center gap-2 rounded-xl2 border border-white/40 px-3 py-1.5 text-sm font-medium text-white transition hover:bg-white/10"
                onClick={clearBrand}
              >
                Limpiar marca
              </button>
            )}
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
      <section className="section-ribbon py-14 text-white" style={{ contentVisibility: 'auto' as any }}>
        <Container className="text-white">
          <div className="text-center mb-8">
            <h2 className="text-2xl font-semibold">Cómo funciona</h2>
            <p className="text-sm text-white/70">Publicá en 4 pasos, sin vueltas.</p>
          </div>
          <div className="relative">
            <div className="pointer-events-none absolute left-0 right-0 top-1/2 hidden h-px -translate-y-1/2 bg-gradient-to-r from-transparent via-white/20 to-transparent md:block" />
            <div className="grid gap-4 md:grid-cols-4 items-stretch">
              <Step
                icon={(
                  <svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24" className="h-6 w-6" fill="none" stroke="currentColor" strokeWidth={1.8}>
                    <path strokeLinecap="round" strokeLinejoin="round" d="M12 12a5 5 0 1 0-5-5 5 5 0 0 0 5 5Zm0 2c-4 0-7 2-7 4v1h14v-1c0-2-3-4-7-4Z" />
                  </svg>
                )}
                t="Registrate"
                d="Creá tu cuenta en minutos. Es gratis."
              />
              <Step
                icon={(
                  <svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24" className="h-6 w-6" fill="none" stroke="currentColor" strokeWidth={1.8}>
                    <path strokeLinecap="round" strokeLinejoin="round" d="M4 7h16M4 12h16M4 17h10" />
                  </svg>
                )}
                t="Publicá"
                d="Elegí un plan y subí tu bici con fotos claras."
              />
              <Step
                icon={(
                  <svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24" className="h-6 w-6" fill="none" stroke="currentColor" strokeWidth={1.8}>
                    <path strokeLinecap="round" strokeLinejoin="round" d="M21 8a2 2 0 0 0-2-2H7L3 9v9a2 2 0 0 0 2 2h14a2 2 0 0 0 2-2V8Z" />
                    <path strokeLinecap="round" strokeLinejoin="round" d="M7 8V5a2 2 0 0 1 2-2h8" />
                  </svg>
                )}
                t="Contactá"
                d="Respondé consultas por chat o WhatsApp."
              />
              <Step
                icon={(
                  <svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24" className="h-6 w-6" fill="none" stroke="currentColor" strokeWidth={1.8}>
                    <path strokeLinecap="round" strokeLinejoin="round" d="m5 13 4 4L19 7" />
                  </svg>
                )}
                t="Vendé"
                d="Coordiná entrega y cerrá la operación con confianza."
              />
            </div>
          </div>
        </Container>
      </section>
    </div>
  )
}
