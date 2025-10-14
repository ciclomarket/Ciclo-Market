
import { useState } from 'react'
import { Link } from 'react-router-dom'
import { Listing } from '../types'
import useFaves from '../hooks/useFaves'
import { useCurrency } from '../context/CurrencyContext'
import { formatListingPrice } from '../utils/pricing'
import { useCompare } from '../context/CompareContext'
import { buildListingSlug } from '../utils/slug'
import { hasPaidPlan } from '../utils/plans'

export default function ListingCard({ l }: { l: Listing }) {
  const [imageLoaded, setImageLoaded] = useState(false)
  const { has, toggle } = useFaves()
  const { ids: compareIds, toggle: toggleCompare } = useCompare()
  const { format, fx } = useCurrency()
  const fav = has(l.id)
  const inCompare = compareIds.includes(l.id)
  const priceLabel = formatListingPrice(l.price, l.priceCurrency, format, fx)
  const hasOffer = typeof l.originalPrice === 'number' && l.originalPrice > l.price && l.originalPrice > 0
  const originalPriceLabel = hasOffer
    ? formatListingPrice(l.originalPrice as number, l.priceCurrency, format, fx)
    : null
  const slug = l.slug ?? buildListingSlug({ id: l.id, title: l.title, brand: l.brand, model: l.model, category: l.category })
  const highlighted = hasPaidPlan(l.sellerPlan ?? (l.plan as any), l.sellerPlanExpires)
  const discountPct = hasOffer ? Math.round((1 - l.price / (l.originalPrice as number)) * 100) : null
  const city = l.location?.split(',')[0]?.trim() || null
  const extrasTokens = (l.extras ?? '')
    .split('•')
    .map((part) => part.trim())
    .filter(Boolean)
  const getExtraValue = (label: string) => {
    const token = extrasTokens.find((part) => part.toLowerCase().startsWith(`${label.toLowerCase()}:`))
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
    const sizeValue = getExtraValue('Talle')
    const conditionValue = getExtraValue('Condición')
    metaParts = [
      typeValue,
      sizeValue ? `Talle: ${sizeValue}` : null,
      conditionValue ? `Condición: ${conditionValue}` : null,
      city
    ]
  } else {
    const sizeLabel = `Talle: ${l.frameSize?.trim() || 'N/D'}`
    const drivetrainLabel = l.drivetrain?.trim() || null
    metaParts = [sizeLabel, drivetrainLabel, city]
  }
  const metaDisplay = metaParts.filter(Boolean) as string[]
  const isSold = l.status === 'sold'
  const isArchived = l.status === 'archived'
  const statusLabel = isSold ? 'Vendida' : isArchived ? 'Archivada' : null
  const imageStatusClass = isArchived ? 'opacity-60 grayscale' : isSold ? 'opacity-85' : ''
  const titleClass = isArchived ? 'line-clamp-1 font-semibold text-[#14212e]/50' : 'line-clamp-1 font-semibold text-[#14212e]'
  const metaClass = isArchived ? 'mt-1 text-sm text-[#14212e]/50' : 'mt-1 text-sm text-[#14212e]/70'
  return (
    <div className="relative h-full">
      <div className="absolute top-2 left-2 right-2 z-10 flex items-center justify-between gap-2">
        <div className="flex items-center gap-2">
          <button
            onClick={() => toggleCompare(l.id)}
            aria-label="Comparar"
            className={`rounded-full px-2 py-1 text-xs ${inCompare ? 'bg-white/90 text-[#14212e]' : 'bg-[#14212e]/70 text-white/80'} border border-white/20 backdrop-blur`}
          >
            ⇄
          </button>
          <button
            onClick={() => toggle(l.id)}
            aria-label="Favorito"
            className={`rounded-full px-2 py-1 text-xs ${fav ? 'bg-white/90 text-[#14212e]' : 'bg-[#14212e]/70 text-white/80'} border border-white/20 backdrop-blur`}
          >
            {fav ? '★' : '☆'}
          </button>
        </div>
        <div className="flex items-center gap-2">
          {statusLabel && (
            <span className={`rounded-full px-3 py-1 text-xs font-semibold text-white shadow ${isSold ? 'bg-[#0f766e]' : 'bg-[#6b7280]'}`}>
              {statusLabel}
            </span>
          )}
          {discountPct !== null && discountPct > 0 && (
            <span className="rounded-full bg-mb-secondary px-3 py-1 text-xs font-semibold text-white shadow">
              -{discountPct}%
            </span>
          )}
          {highlighted && (
            <span className="rounded-full bg-[#14212e] px-3 py-1 text-xs font-semibold text-white shadow-lg">
              Destacada 🔥
            </span>
          )}
        </div>
      </div>
      <Link to={`/listing/${slug}`} className="card-flat group flex h-full flex-col overflow-hidden">
        <div className="aspect-video relative overflow-hidden bg-black/10">
          <img
            src={l.images[0]}
            alt={l.title}
            loading="lazy"
            decoding="async"
            onLoad={() => setImageLoaded(true)}
            onError={() => setImageLoaded(true)}
            className={`h-full w-full object-cover transition duration-700 ${imageLoaded ? 'opacity-100 scale-100' : 'opacity-0 scale-105'} ${imageStatusClass} group-hover:scale-105`}
          />
          <div
            aria-hidden="true"
            className={`pointer-events-none absolute inset-0 bg-gradient-to-br from-white/40 via-white/10 to-white/40 transition-opacity duration-500 ${imageLoaded ? 'opacity-0' : 'opacity-100 animate-pulse'}`}
          />
        </div>
        <div className="flex flex-1 flex-col px-5 py-4">
          <div className="flex items-start justify-between gap-3">
            <h3 className={titleClass}>{l.title}</h3>
            <div className="text-right leading-none">
              <span className="block font-semibold text-mb-primary">{priceLabel}</span>
              {originalPriceLabel && (
                <span className="block text-xs text-[#14212e]/50 line-through">{originalPriceLabel}</span>
              )}
            </div>
          </div>
          <p className={metaClass}>{metaDisplay.join(' • ')}</p>
        </div>
      </Link>
    </div>
  )
}
