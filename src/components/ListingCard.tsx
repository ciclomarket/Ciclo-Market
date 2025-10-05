
import { Link } from 'react-router-dom'
import { Listing } from '../types'
import useFaves from '../hooks/useFaves'
import { useCurrency } from '../context/CurrencyContext'
import { formatListingPrice } from '../utils/pricing'
import { useCompare } from '../context/CompareContext'
import { buildListingSlug } from '../utils/slug'

export default function ListingCard({ l }: { l: Listing }) {
  const { has, toggle } = useFaves()
  const { ids: compareIds, toggle: toggleCompare } = useCompare()
  const { format, fx } = useCurrency()
  const fav = has(l.id)
  const inCompare = compareIds.includes(l.id)
  const priceLabel = formatListingPrice(l.price, l.priceCurrency, format, fx)
  const slug = l.slug ?? buildListingSlug({ id: l.id, title: l.title })
  return (
    <div className="relative">
      <button
        onClick={() => toggleCompare(l.id)}
        aria-label="Comparar"
        className={`absolute z-10 top-2 left-2 rounded-full px-2 py-1 text-xs ${inCompare ? 'bg-white/90 text-[#14212e]' : 'bg-[#14212e]/70 text-white/80'} border border-white/20 backdrop-blur`}
      >
        ⇄
      </button>
      <button
        onClick={() => toggle(l.id)}
        aria-label="Favorito"
        className={`absolute z-10 top-2 right-2 rounded-full px-2 py-1 text-xs ${fav ? 'bg-white/90 text-[#14212e]' : 'bg-[#14212e]/70 text-white/80'} border border-white/20 backdrop-blur`}
      >
        {fav ? '★' : '☆'}
      </button>
      <Link to={`/listing/${slug}`} className="card-flat overflow-hidden block group">
        <div className="aspect-video bg-black/40 overflow-hidden">
          <img src={l.images[0]} alt={l.title} className="w-full h-full object-cover group-hover:scale-105 transition"/>
        </div>
        <div className="p-4">
          <div className="flex items-center justify-between gap-3">
            <h3 className="font-semibold line-clamp-1 text-[#14212e]">{l.title}</h3>
            <span className="text-mb-primary font-semibold">{priceLabel}</span>
          </div>
          <p className="text-sm text-[#14212e]/70 mt-1">
            {l.location} • {l.brand} {l.model}
          </p>
        </div>
      </Link>
    </div>
  )
}
