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
import { buildImageSource } from '../lib/imageUrl'
import { fetchListings } from '../services/listings'
import { fetchStoresMeta } from '../services/users'
import { supabaseEnabled } from '../services/supabase'
import { fetchLikeCounts } from '../services/likes'
import type { Listing } from '../types'
import { buildListingSlug } from '../utils/slug'
import { hasPaidPlan } from '../utils/plans'
import { track, trackOncePerSession } from '../services/track'
import { useAuth } from '../context/AuthContext'

import specializedLogo from '/brands/specialized.webp'
import canyonLogo from '/brands/canyon.webp'
import trekLogo from '/brands/trek.webp'
import scottLogo from '/brands/scott.webp'
import cannondaleLogo from '/brands/cannondale.webp'
import cerveloLogo from '/brands/cervelo.webp'
import colnerLogo from '/brands/colner.webp'
import giantLogo from '/brands/giant.webp'

// ── Config marcas: logos en /public/brands/*.webp
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

function shuffleArray<T>(input: T[], limit?: number): T[] {
  const arr = input.slice()
  for (let i = arr.length - 1; i > 0; i -= 1) {
    const j = Math.floor(Math.random() * (i + 1))
    ;[arr[i], arr[j]] = [arr[j], arr[i]]
  }
  return typeof limit === 'number' ? arr.slice(0, limit) : arr
}

function buildStoreRoundRobin(listings: Listing[], storeLogos: Record<string, string | null>, limit: number): Listing[] {
  const groups = new Map<string, Listing[]>()
  for (const listing of listings) {
    if (!listing?.sellerId) continue
    if (!(listing.sellerId in storeLogos)) continue
    const bucket = groups.get(listing.sellerId)
    if (bucket) bucket.push(listing)
    else groups.set(listing.sellerId, [listing])
  }
  if (!groups.size) return []
  const sellers = shuffleArray(Array.from(groups.keys()))
  const pools = sellers.map((sellerId) => ({
    sellerId,
    items: shuffleArray(groups.get(sellerId) ?? []),
  }))
  const result: Listing[] = []
  let added = true
  while (result.length < limit && added) {
    added = false
    for (const pool of pools) {
      if (!pool.items.length) continue
      result.push(pool.items.shift()!)
      added = true
      if (result.length >= limit) break
    }
  }
  return result
}

function HeroBackground() {
  // Imagen LCP con soporte WebP y múltiple densidad (360/720/1520)
  return (
    <picture>
      {/* Mobile: usar versión optimizada específica */}
      <source
        media="(max-width: 767px)"
        type="image/webp"
        srcSet={'/bicicletas-home_mobile.webp 946w'}
        sizes="100vw"
      />
      {/* Desktop: mantener actual */}
      <source
        media="(min-width: 768px)"
        type="image/webp"
        srcSet={'/bicicletas-home.webp 1520w'}
        sizes="100vw"
      />
      <img
        src="/bicicletas-home-card-small.jpg"
        srcSet={'/bicicletas-home-card-small.jpg 360w, /bicicletas-home-card.jpg 720w, /bicicletas-home.jpg 1520w'}
        sizes="100vw"
        width={1520}
        height={1305}
        alt=""
        loading="eager"
        fetchPriority="high"
        decoding="async"
        className="absolute inset-0 -z-20 size-full object-cover md:[object-position:50%_28%]"
      />
    </picture>
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
  const primaryImage = typeof l.images?.[0] === 'string' ? l.images[0] : null
  const media = buildImageSource(primaryImage, { profile: 'card', sizes: '(max-width: 1023px) 100vw, 33vw' })
  const imageSrc = media?.src || primaryImage || ''
  const imageSrcSet = media?.srcSet
  const imageSizes = media?.sizes || '(max-width: 1023px) 100vw, 33vw'
  return (
    <Link to={`/listing/${slug}`} className="card-flat group flex h-full flex-col overflow-hidden">
        <div className="relative">
          <div className="relative aspect-[4/3] overflow-hidden rounded-2xl bg-[#0B1220]">
            {imageSrc ? (
              <>
                <img
                  src={imageSrc}
                  srcSet={imageSrcSet}
                  sizes={imageSizes}
                  alt=""
                  loading="lazy"
                  decoding="async"
                  aria-hidden="true"
                  className="absolute inset-0 h-full w-full scale-110 object-cover opacity-60 blur-xl"
                />
                <img
                  src={imageSrc}
                  srcSet={imageSrcSet}
                  sizes={imageSizes}
                  alt={l.title}
                  className="absolute inset-0 h-full w-full object-contain"
                  loading="lazy"
                  decoding="async"
                  onError={(e) => {
                    if (primaryImage && e.currentTarget.src !== primaryImage) {
                      e.currentTarget.src = primaryImage
                    }
                  }}
                />
              </>
            ) : (
              <div className="absolute inset-0 flex items-center justify-center text-xs font-medium uppercase tracking-wide text-white/50">
                Sin imagen
              </div>
            )}
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
          height={32}
          loading="lazy"
          decoding="async"
          onError={(e) => {
            try {
              const el = e.currentTarget as HTMLImageElement
              if (el.src.endsWith('.webp')) {
                el.src = el.src.replace(/\.webp$/, '.png')
                return
              }
            } catch {}
            setErr(true)
          }}
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
  const { user } = useAuth()
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

  const featuredListings = useMemo(() => {
    const now = Date.now()
    const isBike = (l: Listing) => l.category !== 'Accesorios' && l.category !== 'Indumentaria' && l.category !== 'Nutrición'
    const highlighted = listings.filter((l) => isBike(l) && typeof l.highlightExpires === 'number' && l.highlightExpires > now)
      .sort((a, b) => (b.highlightExpires ?? 0) - (a.highlightExpires ?? 0))
    // Completar con pagas si hace falta
    const paid = listings.filter((l) => isBike(l) && hasPaidPlan(l.sellerPlan ?? (l.plan as any), l.sellerPlanExpires))
    const seen = new Set(highlighted.map((l) => l.id))
    const merged: Listing[] = [...highlighted]
    for (const l of paid) { if (!seen.has(l.id)) merged.push(l); if (merged.length >= 12) break }
    if (merged.length === 0) return listings.filter(isBike).slice(0, 8)
    return merged.slice(0, 12)
  }, [listings])

  // Filtrado general
  const filtered = useMemo(
    () =>
      listings.filter((l) => {
        if (brand && l.brand.toLowerCase() !== brand.toLowerCase()) return false
        return true
      }),
    [listings, brand]
  )

  const [storeLogos, setStoreLogos] = useState<Record<string, string | null>>({})

  const routeListings = useMemo(() => shuffleArray(listings.filter((l) => l.category === 'Ruta'), 24), [listings])
  const mtbListings = useMemo(() => shuffleArray(listings.filter((l) => l.category === 'MTB'), 24), [listings])
  const triListings = useMemo(() => shuffleArray(listings.filter((l) => l.category === 'Triatlón'), 24), [listings])
  const officialStoreListings = useMemo(() => buildStoreRoundRobin(listings, storeLogos, 24), [listings, storeLogos])

  const clearBrand = () => setBrand('')

  const handleBrandClick = (brandName: string) => {
    setBrand(brandName)
    navigate(`/marketplace?brand=${encodeURIComponent(brandName)}`)
  }

  // Preload estratégico: primera de "Últimas publicadas" (evitar exceso en mobile)
  useEffect(() => {
    if (typeof document === 'undefined') return
    const isMobile = typeof window !== 'undefined' ? window.innerWidth < 768 : false
    if (isMobile) return // en mobile evitamos preload extra
    const preloadTargets = filtered.slice(0, 1)
    const created: HTMLLinkElement[] = []
    for (const l of preloadTargets) {
      const img = (l as any).images?.[0]
      if (!img) continue
      const link = document.createElement('link')
      link.rel = 'preload'
      link.as = 'image'
      const media = buildImageSource(img, { profile: 'card', sizes: '(max-width: 1279px) 75vw, 50vw' })
      if (!media?.src) continue
      link.href = media.src
      if (media.srcSet) link.setAttribute('imagesrcset', media.srcSet)
      if (media.sizes) link.setAttribute('imagesizes', media.sizes)
      document.head.appendChild(link)
      created.push(link)
    }
    return () => {
      for (const el of created) {
        try { document.head.removeChild(el) } catch { void 0 }
      }
    }
  }, [filtered.slice(0, 1).map((x) => (x as any).id).join(',')])

  // Like counts (batch) for sections
  const [likesFeatured, setLikesFeatured] = useState<Record<string, number>>({})
  const [likesRoute, setLikesRoute] = useState<Record<string, number>>({})
  const [likesMtb, setLikesMtb] = useState<Record<string, number>>({})
  const [likesTri, setLikesTri] = useState<Record<string, number>>({})
  const [likesStores, setLikesStores] = useState<Record<string, number>>({})
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
    const ids = routeListings.map((l) => l.id)
    if (!ids.length) { setLikesRoute({}); return }
    let active = true
    ;(async () => {
      try {
        const map = await fetchLikeCounts(ids)
        if (active) setLikesRoute(map)
      } catch (error) {
        console.warn('[home] route likes fetch failed', error)
      }
    })()
    return () => { active = false }
  }, [routeListings.map((l) => l.id).join(',')])

  useEffect(() => {
    const ids = mtbListings.map((l) => l.id)
    if (!ids.length) { setLikesMtb({}); return }
    let active = true
    ;(async () => {
      try {
        const map = await fetchLikeCounts(ids)
        if (active) setLikesMtb(map)
      } catch (error) {
        console.warn('[home] mtb likes fetch failed', error)
      }
    })()
    return () => { active = false }
  }, [mtbListings.map((l) => l.id).join(',')])

  useEffect(() => {
    const ids = triListings.map((l) => l.id)
    if (!ids.length) { setLikesTri({}); return }
    let active = true
    ;(async () => {
      try {
        const map = await fetchLikeCounts(ids)
        if (active) setLikesTri(map)
      } catch (error) {
        console.warn('[home] tri likes fetch failed', error)
      }
    })()
    return () => { active = false }
  }, [triListings.map((l) => l.id).join(',')])

  useEffect(() => {
    const ids = officialStoreListings.map((l) => l.id)
    if (!ids.length) { setLikesStores({}); return }
    let active = true
    ;(async () => {
      try {
        const map = await fetchLikeCounts(ids)
        if (active) setLikesStores(map)
      } catch (error) {
        console.warn('[home] stores likes fetch failed', error)
      }
    })()
    return () => { active = false }
  }, [officialStoreListings.map((l) => l.id).join(',')])

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

  // Cargar logos de tiendas oficiales para mostrar badge en cards
  useEffect(() => {
    const sellerIds = Array.from(new Set(listings.map((l) => l.sellerId).filter(Boolean))) as string[]
    if (!sellerIds.length) { setStoreLogos({}); return }
    let active = true
    ;(async () => {
      try {
        const logos = await fetchStoresMeta(sellerIds)
        if (active) setStoreLogos(logos)
      } catch { if (active) setStoreLogos({}) }
    })()
    return () => { active = false }
  }, [listings.map((l) => l.sellerId || '').join(',')])

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
          <div className="relative mx-auto max-w-4xl py-10 text-center md:py-14">
            <span className="inline-flex items-center gap-3 rounded-full border border-white/10 bg-white/10 px-3 py-1 text-[11px] uppercase tracking-[0.4em] text-white/70">
              Comunidad ciclista
            </span>
            <h1 className="mt-5 text-3xl font-extrabold leading-tight tracking-tight sm:text-4xl md:text-5xl">
              El nuevo lugar para comprar y vender bicicletas en Argentina.
            </h1>
            <p className="mx-auto mt-3 max-w-2xl text-base text-white/80 md:text-lg">
              Publicá en minutos, destacá tu aviso y conectá directo con compradores. Sin comisiones por venta.
            </p>
            <div className="mt-6 flex flex-wrap items-center justify-center gap-3">
              <Button
                to="/publicar"
                className="bg-gradient-to-r from-[#0ea5e9] via-[#2563eb] to-[#1d4ed8] text-white shadow-[0_14px_40px_rgba(37,99,235,0.45)] hover:brightness-110"
              >
                <span>Publicar bicicleta</span>
                <svg
                  xmlns="http://www.w3.org/2000/svg"
                  viewBox="0 0 24 24"
                  className="h-4 w-4"
                  fill="none"
                  stroke="currentColor"
                  strokeWidth={1.8}
                >
                  <path strokeLinecap="round" strokeLinejoin="round" d="M5 12h14m-6-6 6 6-6 6" />
                </svg>
              </Button>
              <Link to="/marketplace" className="btn bg-[#14212e] text-white shadow-[0_14px_40px_rgba(20,33,46,0.35)] hover:bg-[#1b2f3f]">
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
        <section className="relative isolate overflow-hidden bg-gradient-to-b from-[#0f1729] via-[#101b2d] to-[#0f1729] pt-10 pb-6">
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
              renderCard={(l: any, idx?: number) => <ListingCard l={l} storeLogoUrl={storeLogos[l.sellerId] || null} priority={(idx ?? 0) < 4} likeCount={likesFeatured[l.id]} />}
              tone="dark"
            />
          </Container>
        </section>
      )}

      {routeListings.length > 0 && (
        <section className="relative isolate overflow-hidden bg-gradient-to-b from-[#0f1729] via-[#101b2d] to-[#0f1729] pt-8 pb-8">
          <div className="pointer-events-none absolute inset-0 -z-10 opacity-60">
            <div className="absolute -top-16 -left-16 h-64 w-64 rounded-full bg-[radial-gradient(circle,_rgba(37,99,235,0.25),_transparent_60%)] blur-2xl" />
            <div className="absolute -bottom-16 -right-10 h-64 w-64 rounded-full bg-[radial-gradient(circle,_rgba(14,165,233,0.20),_transparent_60%)] blur-2xl" />
          </div>
          <Container className="text-white">
            <HorizontalSlider
              title="Bicicletas de ruta"
              subtitle="Modelos listos para el asfalto y las largas distancias"
              items={routeListings}
              maxItems={24}
              initialLoad={8}
              renderCard={(l: any, idx?: number) => (
                <ListingCard l={l} storeLogoUrl={storeLogos[l.sellerId] || null} priority={(idx ?? 0) < 4} likeCount={likesRoute[l.id]} />
              )}
              tone="dark"
            />
          </Container>
        </section>
      )}

      {mtbListings.length > 0 && (
        <section className="relative isolate overflow-hidden bg-gradient-to-b from-[#0f1729] via-[#101b2d] to-[#0f1729] pt-6 pb-8">
          <div className="pointer-events-none absolute inset-0 -z-10 opacity-60">
            <div className="absolute -top-16 -left-16 h-64 w-64 rounded-full bg-[radial-gradient(circle,_rgba(37,99,235,0.25),_transparent_60%)] blur-2xl" />
            <div className="absolute -bottom-16 -right-10 h-64 w-64 rounded-full bg-[radial-gradient(circle,_rgba(14,165,233,0.20),_transparent_60%)] blur-2xl" />
          </div>
          <Container className="text-white">
            <HorizontalSlider
              title="Bicicletas de MTB"
              subtitle="Rigidas y doble suspensión para dominar los senderos"
              items={mtbListings}
              maxItems={24}
              initialLoad={8}
              renderCard={(l: any, idx?: number) => (
                <ListingCard l={l} storeLogoUrl={storeLogos[l.sellerId] || null} priority={(idx ?? 0) < 4} likeCount={likesMtb[l.id]} />
              )}
              tone="dark"
            />
          </Container>
        </section>
      )}

      {triListings.length > 0 && (
        <section className="relative isolate overflow-hidden bg-gradient-to-b from-[#0f1729] via-[#101b2d] to-[#0f1729] pt-6 pb-8">
          <div className="pointer-events-none absolute inset-0 -z-10 opacity-60">
            <div className="absolute -top-16 -left-16 h-64 w-64 rounded-full bg-[radial-gradient(circle,_rgba(37,99,235,0.25),_transparent_60%)] blur-2xl" />
            <div className="absolute -bottom-16 -right-10 h-64 w-64 rounded-full bg-[radial-gradient(circle,_rgba(14,165,233,0.20),_transparent_60%)] blur-2xl" />
          </div>
          <Container className="text-white">
            <HorizontalSlider
              title="Bicicletas de triatlón"
              subtitle="Geometría y aerodinámica pensadas para ganar tiempo"
              items={triListings}
              maxItems={24}
              initialLoad={8}
              renderCard={(l: any, idx?: number) => (
                <ListingCard l={l} storeLogoUrl={storeLogos[l.sellerId] || null} priority={(idx ?? 0) < 4} likeCount={likesTri[l.id]} />
              )}
              tone="dark"
            />
          </Container>
        </section>
      )}

      {officialStoreListings.length > 0 && (
        <section className="relative isolate overflow-hidden bg-gradient-to-b from-[#0f1729] via-[#101b2d] to-[#0f1729] pt-6 pb-10">
          <div className="pointer-events-none absolute inset-0 -z-10 opacity-60">
            <div className="absolute -top-16 -left-16 h-64 w-64 rounded-full bg-[radial-gradient(circle,_rgba(37,99,235,0.25),_transparent_60%)] blur-2xl" />
            <div className="absolute -bottom-16 -right-10 h-64 w-64 rounded-full bg-[radial-gradient(circle,_rgba(14,165,233,0.20),_transparent_60%)] blur-2xl" />
          </div>
          <Container className="text-white">
            <HorizontalSlider
              title="Tiendas oficiales"
              subtitle="Productos seleccionados de tiendas verificadas"
              items={officialStoreListings}
              maxItems={24}
              initialLoad={8}
              renderCard={(l: any, idx?: number) => (
                <ListingCard l={l} storeLogoUrl={storeLogos[l.sellerId] || null} priority={(idx ?? 0) < 4} likeCount={likesStores[l.id]} />
              )}
              tone="dark"
            />
          </Container>
        </section>
      )}

      {/* ÚLTIMAS PUBLICADAS */}
      <section id="explorar" className="relative isolate overflow-hidden bg-gradient-to-b from-[#0f1729] via-[#101b2d] to-[#0f1729] pt-8 pb-10">
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
              renderCard={(l:any, idx?: number) => <ListingCard l={l} storeLogoUrl={storeLogos[l.sellerId] || null} priority={(idx ?? 0) < 4} likeCount={likesRecent[l.id]} />}
              tone="dark"
            />
          ) : (
            <EmptyState />
          )}
        </Container>
      </section>

      {/* CATEGORÍAS RÁPIDAS (Bicis / Accesorios / Indumentaria / Nutrición) */}
      <section className="relative isolate overflow-hidden bg-gradient-to-b from-[#0f1729] via-[#101b2d] to-[#0f1729] pt-2 pb-8">
        <div className="pointer-events-none absolute inset-0 -z-10 opacity-60">
          <div className="absolute -top-16 -left-16 h-64 w-64 rounded-full bg-[radial-gradient(circle,_rgba(37,99,235,0.25),_transparent_60%)] blur-2xl" />
          <div className="absolute -bottom-16 -right-10 h-64 w-64 rounded-full bg-[radial-gradient(circle,_rgba(14,165,233,0.20),_transparent_60%)] blur-2xl" />
        </div>
        <Container className="text-white">
          <div className="flex items-center justify-between mb-3">
            <h3 className="text-lg font-semibold">Buscá por categoría</h3>
          </div>
          <div className="grid grid-cols-2 gap-2 sm:grid-cols-4 sm:gap-4">
            {[
              {
                key: 'bikes',
                label: 'Bicicletas',
                description: 'Solo bicicletas',
                image: '/design/Banners/1.webp',
                imageMobile: '/design/Banners-Mobile/1.webp',
                to: '/marketplace?bikes=1',
              },
              {
                key: 'acc',
                label: 'Accesorios',
                description: 'Componentes y upgrades',
                image: '/design/Banners/2.webp',
                imageMobile: '/design/Banners-Mobile/2.webp',
                to: '/marketplace?cat=Accesorios',
              },
              {
                key: 'app',
                label: 'Indumentaria',
                description: 'Ropa técnica y casual',
                image: '/design/Banners/3.webp',
                imageMobile: '/design/Banners-Mobile/3.webp',
                to: '/marketplace?cat=Indumentaria',
              },
              {
                key: 'nut',
                label: 'Nutrición',
                description: 'Energía e hidratación',
                image: '/design/Banners/4.webp',
                imageMobile: '/design/Banners-Mobile/4.webp',
                to: '/marketplace?cat=Nutrici%C3%B3n',
              },
            ].map((card) => (
              <Link
                key={card.key}
                to={card.to}
                className="relative w-full overflow-hidden rounded-3xl border-2 border-white/15 bg-white/5 transition hover:border-white/30 hover:shadow-md focus:outline-none focus-visible:ring-2 focus-visible:ring-white/80 focus-visible:ring-offset-2 focus-visible:ring-offset-[#14212e]"
              >
                <div className="relative aspect-square sm:aspect-[17/5]">
                  <picture className="block h-full w-full">
                    <source media="(max-width: 640px)" srcSet={card.imageMobile} />
                    <img src={card.image} alt={card.label} className="h-full w-full object-cover" loading="lazy" decoding="async" />
                  </picture>
                  <div className="absolute inset-0 bg-gradient-to-t from-[#050c18]/85 via-transparent to-transparent" aria-hidden />
                  <div className="absolute inset-0 flex items-end p-2 sm:p-4">
                    <div className="space-y-1 text-left">
                      <span className="text-sm font-semibold text-white sm:text-lg drop-shadow-[0_1px_2px_rgba(0,0,0,0.8)]">{card.label}</span>
                      <span className="hidden text-xs text-white/80 sm:block">{card.description}</span>
                    </div>
                  </div>
                </div>
              </Link>
            ))}
          </div>
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
