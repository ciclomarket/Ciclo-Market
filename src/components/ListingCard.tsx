
import { Link } from 'react-router-dom'
import { Listing } from '../types'
import useFaves from '../hooks/useFaves'
import { useCurrency } from '../context/CurrencyContext'
import { formatListingPrice } from '../utils/pricing'
import { useCompare } from '../context/CompareContext'
import { buildListingSlug } from '../utils/slug'
import { hasPaidPlan } from '../utils/plans'

export default function ListingCard({ l }: { l: Listing }) {
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
  return (
    <div className="relative">
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
      <Link to={`/listing/${slug}`} className="card-flat overflow-hidden block group">
        <div className="aspect-video bg-black/40 overflow-hidden">
          <img src={l.images[0]} alt={l.title} className="w-full h-full object-cover group-hover:scale-105 transition"/>
        </div>
        <div className="p-4">
          <div className="flex items-center justify-between gap-3">
            <h3 className="font-semibold line-clamp-1 text-[#14212e]">{l.title}</h3>
            <div className="text-right">
              <span className="text-mb-primary font-semibold leading-none block">{priceLabel}</span>
              {originalPriceLabel && (
                <span className="text-xs text-[#14212e]/50 line-through block">{originalPriceLabel}</span>
              )}
            </div>
          </div>
          <p className="text-sm text-[#14212e]/70 mt-1">
            {l.location} • {l.brand} {l.model}
          </p>
        </div>
      </Link>
    </div>
  )
}
