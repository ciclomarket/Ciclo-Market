import { useState, useEffect } from 'react'
import { fetchBlogListingCard } from '../../services/blog'
import { Eye, MapPin, Calendar, Tag } from 'lucide-react'

interface ListingCardBlockProps {
  listingId?: string
  listingUrl?: string
}

interface ListingData {
  id: string
  title: string
  price: number
  price_currency: string
  brand?: string
  model?: string
  year?: number
  category?: string
  condition?: string
  location?: string
  image_url?: string
  slug: string
  views?: number
}

export function ListingCardBlock({ listingId, listingUrl }: ListingCardBlockProps) {
  const [listing, setListing] = useState<ListingData | null>(null)
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState<string | null>(null)

  useEffect(() => {
    if (!listingId && !listingUrl) return
    
    const loadListing = async () => {
      setLoading(true)
      try {
        // Extraer ID de la URL si se proporcionó URL
        let id = listingId
        if (!id && listingUrl) {
          const match = listingUrl.match(/\/listing\/[^-]+-[^-]+-([^/]+)$/)
          id = match?.[1] || listingUrl.split('/').pop()
        }
        
        if (id) {
          const data = await fetchBlogListingCard(id)
          setListing(data)
        }
      } catch (err) {
        setError('No se pudo cargar el listing')
      } finally {
        setLoading(false)
      }
    }
    
    loadListing()
  }, [listingId, listingUrl])

  if (loading) {
    return (
      <div className="my-6 rounded-2xl border border-gray-200 bg-white p-6 shadow-sm">
        <div className="flex animate-pulse gap-4">
          <div className="h-32 w-32 rounded-xl bg-gray-200" />
          <div className="flex-1 space-y-3">
            <div className="h-5 w-3/4 rounded bg-gray-200" />
            <div className="h-4 w-1/2 rounded bg-gray-200" />
            <div className="h-8 w-24 rounded bg-gray-200" />
          </div>
        </div>
      </div>
    )
  }

  if (error || !listing) {
    return (
      <div className="my-6 rounded-2xl border border-red-200 bg-red-50 p-6 text-red-700">
        <p className="text-sm font-medium">⚠️ Listing no encontrado o no disponible</p>
        <p className="text-xs mt-1">ID: {listingId || listingUrl}</p>
      </div>
    )
  }

  const formatPrice = (price: number, currency: string) => {
    const symbol = currency === 'USD' ? 'US$' : '$'
    return `${symbol}${price.toLocaleString()}`
  }

  return (
    <a 
      href={`https://www.ciclomarket.ar/listing/${listing.slug}`}
      target="_blank"
      rel="noopener noreferrer"
      className="my-6 block overflow-hidden rounded-2xl border border-gray-200 bg-white shadow-sm transition-all hover:shadow-lg hover:-translate-y-1"
    >
      <div className="flex flex-col sm:flex-row">
        {/* Imagen */}
        <div className="relative h-48 w-full sm:h-auto sm:w-48 sm:min-w-[12rem]">
          {listing.image_url ? (
            <img 
              src={listing.image_url} 
              alt={listing.title}
              className="h-full w-full object-cover"
              loading="lazy"
            />
          ) : (
            <div className="flex h-full w-full items-center justify-center bg-gradient-to-br from-gray-100 to-gray-200">
              <span className="text-4xl">🚲</span>
            </div>
          )}
          <div className="absolute left-3 top-3">
            <span className="rounded-full bg-[#14212e] px-2.5 py-1 text-xs font-semibold text-white">
              {listing.category || 'Bicicleta'}
            </span>
          </div>
        </div>

        {/* Contenido */}
        <div className="flex flex-1 flex-col justify-between p-4">
          <div>
            <div className="mb-1 flex items-center gap-2 text-xs text-gray-500">
              {listing.brand && (
                <span className="font-medium text-[#14212e]">{listing.brand}</span>
              )}
              {listing.year && (
                <>
                  <span>·</span>
                  <span>{listing.year}</span>
                </>
              )}
            </div>
            
            <h3 className="mb-2 text-lg font-bold text-gray-900 line-clamp-2">
              {listing.title}
            </h3>
            
            <div className="mb-3 flex flex-wrap items-center gap-3 text-sm text-gray-600">
              {listing.condition && (
                <span className="flex items-center gap-1">
                  <Tag className="h-3.5 w-3.5" />
                  {listing.condition}
                </span>
              )}
              {listing.location && (
                <span className="flex items-center gap-1">
                  <MapPin className="h-3.5 w-3.5" />
                  {listing.location}
                </span>
              )}
              {listing.views !== undefined && (
                <span className="flex items-center gap-1">
                  <Eye className="h-3.5 w-3.5" />
                  {listing.views} vistas
                </span>
              )}
            </div>
          </div>

          <div className="flex items-center justify-between">
            <div className="text-2xl font-bold text-[#14212e]">
              {formatPrice(listing.price, listing.price_currency)}
            </div>
            <span className="rounded-full bg-[#e6edf5] px-4 py-2 text-sm font-semibold text-[#14212e] transition hover:bg-[#14212e] hover:text-white">
              Ver publicación →
            </span>
          </div>
        </div>
      </div>
    </a>
  )
}

// Versión estática para usar en el editor (sin necesidad de cargar datos)
export function ListingCardStatic({ 
  title = 'Título de la bicicleta',
  brand = 'Marca',
  price = 'US$0',
  category = 'Ruta',
  imageUrl = '',
  listingUrl = '#'
}: {
  title?: string
  brand?: string
  price?: string
  category?: string
  imageUrl?: string
  listingUrl?: string
}) {
  return (
    <a 
      href={listingUrl}
      target="_blank"
      rel="noopener noreferrer"
      className="my-6 block overflow-hidden rounded-2xl border border-gray-200 bg-white shadow-sm transition-all hover:shadow-lg hover:-translate-y-1"
    >
      <div className="flex flex-col sm:flex-row">
        <div className="relative h-48 w-full sm:h-auto sm:w-48 sm:min-w-[12rem]">
          {imageUrl ? (
            <img 
              src={imageUrl} 
              alt={title}
              className="h-full w-full object-cover"
              loading="lazy"
            />
          ) : (
            <div className="flex h-full w-full items-center justify-center bg-gradient-to-br from-gray-100 to-gray-200">
              <span className="text-4xl">🚲</span>
            </div>
          )}
          <div className="absolute left-3 top-3">
            <span className="rounded-full bg-[#14212e] px-2.5 py-1 text-xs font-semibold text-white">
              {category}
            </span>
          </div>
        </div>

        <div className="flex flex-1 flex-col justify-between p-4">
          <div>
            <div className="mb-1 text-xs text-gray-500">
              <span className="font-medium text-[#14212e]">{brand}</span>
            </div>
            <h3 className="mb-2 text-lg font-bold text-gray-900 line-clamp-2">
              {title}
            </h3>
          </div>

          <div className="flex items-center justify-between">
            <div className="text-2xl font-bold text-[#14212e]">{price}</div>
            <span className="rounded-full bg-[#e6edf5] px-4 py-2 text-sm font-semibold text-[#14212e] transition hover:bg-[#14212e] hover:text-white">
              Ver publicación →
            </span>
          </div>
        </div>
      </div>
    </a>
  )
}
