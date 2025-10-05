import { useEffect, useState, type ReactNode } from 'react'
import { useParams } from 'react-router-dom'
import Container from '../components/Container'
import ImageCarousel from '../components/ImageCarousel'
import Button from '../components/Button'
import { mockListings } from '../mock/mockData'
import { useCurrency } from '../context/CurrencyContext'
import { formatListingPrice } from '../utils/pricing'
import { getPlanLabel, hasPaidPlan, isPlanVerified } from '../utils/plans'
import { useCompare } from '../context/CompareContext'
import useFaves from '../hooks/useFaves'
import { fetchListing } from '../services/listings'
import { supabaseEnabled } from '../services/supabase'
import type { Listing } from '../types'

export default function ListingDetail() {
  const params = useParams()
  const { format, fx } = useCurrency()
  const [listing, setListing] = useState<Listing | null>(null)
  const [loading, setLoading] = useState(true)
  const { ids: compareIds, toggle: toggleCompare } = useCompare()
  const { has: hasFav, toggle: toggleFav } = useFaves()
  const listingKey = params.slug ?? params.id ?? ''

  useEffect(() => {
    let active = true
    const load = async () => {
      if (!listingKey) {
        setListing(null)
        setLoading(false)
        return
      }
      setLoading(true)
      if (supabaseEnabled) {
        const result = await fetchListing(listingKey)
        if (!active) return
        if (result) {
          setListing(result)
          setLoading(false)
          return
        }
      }
      if (!active) return
      const fallback = mockListings.find((l) => l.slug === listingKey || l.id === listingKey) ?? null
      setListing(fallback)
      setLoading(false)
    }
    load()
    return () => {
      active = false
    }
  }, [listingKey])

  if (loading) return <Container>Cargando publicación…</Container>
  if (!listing) return <Container>Publicación no encontrada.</Container>

  const waText = encodeURIComponent(`Hola! Vi tu ${listing.title} en Ciclo Market y me interesa. ¿Sigue disponible?`)
  const waLink = listing.sellerWhatsapp ? `https://wa.me/${listing.sellerWhatsapp.replace(/[^0-9]/g, '')}?text=${waText}` : null

  const formattedPrice = formatListingPrice(listing.price, listing.priceCurrency, format, fx)
  const originalPriceLabel = listing.originalPrice
    ? formatListingPrice(listing.originalPrice, listing.priceCurrency, format, fx)
    : null
  const planLabel = getPlanLabel(listing.sellerPlan, listing.sellerPlanExpires)
  const paidPlanActive = hasPaidPlan(listing.sellerPlan, listing.sellerPlanExpires)
  const verifiedVendor = isPlanVerified(listing.sellerPlan, listing.sellerPlanExpires)
  const inCompare = compareIds.includes(listing.id)
  const isFav = hasFav(listing.id)

  return (
    <Container>
      <div className="grid gap-6 lg:grid-cols-[2fr_1fr] lg:grid-rows-[auto_auto]">
        <div className="order-1 space-y-6 lg:col-start-1 lg:row-start-1">
          <ImageCarousel images={listing.images} />
        </div>

        <div className="order-2 lg:col-start-2 lg:row-start-1">
          <div className="card p-6">
            <div className="flex items-start justify-between gap-4">
              <div>
                <h1 className="text-2xl font-bold text-[#14212e] leading-tight">{listing.title}</h1>
                <p className="mt-2 text-sm text-[#14212e]/70">{listing.location}</p>
              </div>
              <div className="flex items-center gap-2">
                <IconButton label={isFav ? 'Quitar de favoritos' : 'Agregar a favoritos'} onClick={() => toggleFav(listing.id)}>
                  <svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24" className="h-5 w-5" fill="currentColor">
                    <path d="M12 21.35s-6.63-4.35-9.33-8.35C-0.03 9.78.36 5.96 3.05 4.04 5.06 2.62 7.92 3 9.7 4.79L12 7.1l2.3-2.31c1.78-1.78 4.64-2.17 6.65-.75 2.69 1.92 3.08 5.74.38 8.96C18.63 17 12 21.35 12 21.35Z" />
                  </svg>
                </IconButton>
                <IconButton label={inCompare ? 'Quitar de comparativa' : 'Agregar a comparativa'} onClick={() => toggleCompare(listing.id)}>
                  <svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24" className="h-5 w-5" fill="currentColor">
                    <path d="M10 4H6a2 2 0 0 0-2 2v12a2 2 0 0 0 2 2h4V4Zm2 0v16h6a2 2 0 0 0 2-2V6a2 2 0 0 0-2-2h-6Z" />
                  </svg>
                </IconButton>
              </div>
            </div>
            <div className="mt-4 flex items-end gap-3">
              <span className="text-3xl font-extrabold text-mb-primary">{formattedPrice}</span>
              {originalPriceLabel && <span className="text-sm text-[#14212e]/60 line-through">{originalPriceLabel}</span>}
            </div>
            <p className="mt-4 text-xs text-[#14212e]/60">
              Guardá o compará esta bici para decidir más tarde.
            </p>
          </div>
        </div>

        <div className="order-3 space-y-6 lg:col-start-1 lg:row-start-2">
          <section className="card p-6">
            <h2 className="text-lg font-semibold text-[#14212e]">Descripción</h2>
            <p className="mt-3 text-sm leading-relaxed text-[#14212e]/80 whitespace-pre-wrap">
              {listing.description}
            </p>
          </section>

          <section className="card p-6">
            <h2 className="text-lg font-semibold text-[#14212e]">Especificaciones</h2>
            <div className="mt-4 grid gap-3 sm:grid-cols-2">
              <Spec label="Marca" value={listing.brand} />
              <Spec label="Modelo" value={listing.model} />
              <Spec label="Año" value={listing.year ? String(listing.year) : '—'} />
              <Spec label="Categoría" value={listing.category} />
              <Spec label="Material" value={listing.material || '—'} />
              <Spec label="Talle / Medida" value={listing.frameSize || '—'} />
              <Spec label="Grupo" value={listing.drivetrain || listing.drivetrainDetail || '—'} />
              <Spec label="Ruedas" value={listing.wheelset || '—'} />
              <Spec label="Rodado" value={listing.wheelSize || '—'} />
              <Spec label="Extras" value={listing.extras || '—'} fullWidth />
            </div>
          </section>
        </div>

        <div className="order-4 lg:col-start-2 lg:row-start-2">
          <div className="card p-6 space-y-4">
            <div className="flex items-center justify-between gap-3">
              <div>
                <p className="text-sm text-[#14212e]/70">Publicado por</p>
                <h3 className="text-lg font-semibold text-[#14212e]">
                  {listing.sellerName || 'Vendedor Ciclo Market'}
                </h3>
                <p className="text-xs text-[#14212e]/60">{listing.sellerLocation || 'Ubicación reservada'}</p>
              </div>
              {listing.sellerPlan && (
                <span
                  className={`rounded-full px-3 py-1 text-xs font-semibold uppercase ${
                    paidPlanActive ? 'bg-mb-primary text-white' : 'bg-[#14212e]/10 text-[#14212e]'
                  }`}
                >
                  {planLabel}
                </span>
              )}
            </div>
            <div className="flex items-center gap-3">
              <div className="size-14 overflow-hidden rounded-full bg-[#14212e]/10">
                {listing.sellerAvatar ? (
                  <img src={listing.sellerAvatar} alt={listing.sellerName || 'Vendedor'} className="h-full w-full object-cover" />
                ) : (
                  <span className="flex h-full w-full items-center justify-center text-sm text-[#14212e]/60">
                    {(listing.sellerName || 'CM')[0]}
                  </span>
                )}
              </div>
              <div className="text-xs text-[#14212e]/60">
                <p>{planLabel}</p>
                <p>ID vendedor: {listing.sellerId}</p>
              </div>
            </div>
            <div className="grid gap-2">
              <Button className="w-full" variant="ghost">
                Hacé una oferta
              </Button>
              <Button className="w-full" variant="primary">
                Contactar al vendedor
              </Button>
              {paidPlanActive && waLink && (
                <a href={waLink} target="_blank" rel="noreferrer" className="btn btn-secondary w-full text-center">
                  Contactar por WhatsApp
                </a>
              )}
              <Button className="w-full" variant="ghost">
                Contactar por email
              </Button>
            </div>
            <p className="text-xs text-[#14212e]/60">
              {verifiedVendor
                ? 'Vendedor verificado: tus ofertas generan alertas prioritarias en su bandeja y correo.'
                : 'Las ofertas llegan a la bandeja de Mensajes del vendedor y se notifican por correo.'}
            </p>
          </div>
        </div>
      </div>
    </Container>
  )
}

function Spec({ label, value, fullWidth = false }: { label: string; value: string; fullWidth?: boolean }) {
  return (
    <div className={fullWidth ? 'sm:col-span-2' : undefined}>
      <p className="text-xs uppercase tracking-wide text-[#14212e]/50">{label}</p>
      <p className="mt-1 text-sm font-medium text-[#14212e]">{value || '—'}</p>
    </div>
  )
}

function IconButton({ label, children, onClick }: { label: string; children: ReactNode; onClick?: () => void }) {
  return (
    <button
      type="button"
      className="rounded-full border border-[#14212e]/10 bg-white/80 p-2 text-[#14212e] transition hover:bg-[#14212e]/10"
      aria-label={label}
      onClick={onClick}
    >
      {children}
    </button>
  )
}
