import { useEffect, useState } from 'react'
import { getSupabaseClient, supabaseEnabled } from '../../services/supabase'
import { buildCardImageUrlSafe } from '../../lib/supabaseImages'

interface ListingData {
  id: string
  title: string
  price: number
  price_currency: string
  brand?: string
  model?: string
  year?: number
  category?: string
  location?: string
  images?: string[]
  slug: string
  views?: number
}

interface BlogContentRendererProps {
  htmlContent: string
}

// Extraer slugs de shortcodes [listing:slug]
function extractListingSlugs(html: string): string[] {
  const slugs: string[] = []
  const regex = /\[listing:([^\]]+)\]/g
  let match
  
  while ((match = regex.exec(html)) !== null) {
    slugs.push(match[1].trim())
  }
  
  return [...new Set(slugs)]
}

// Función para obtener datos de listings por slugs
async function fetchListingsBySlugs(slugs: string[]): Promise<Record<string, ListingData>> {
  if (!supabaseEnabled || slugs.length === 0) return {}
  
  const supabase = getSupabaseClient()
  
  const { data, error } = await supabase
    .from('listings')
    .select(`
      id,
      title,
      price,
      price_currency,
      brand,
      model,
      year,
      category,
      location,
      images,
      slug,
      view_count
    `)
    .in('slug', slugs)
    .in('status', ['active', 'published', 'sold'])
  
  if (error) {
    console.error('[BlogContentRenderer] Error fetching listings:', error)
    return {}
  }
  
  const result: Record<string, ListingData> = {}
  
  data?.forEach((item: any) => {
    result[item.slug] = {
      id: item.id,
      title: item.title,
      price: item.price,
      price_currency: item.price_currency,
      brand: item.brand,
      model: item.model,
      year: item.year,
      category: item.category,
      location: item.location,
      images: item.images,
      slug: item.slug,
      views: item.view_count,
    }
  })
  
  return result
}

function formatPrice(price: number, currency: string): string {
  const symbol = currency === 'USD' ? 'US$' : '$'
  return `${symbol}${price.toLocaleString()}`
}

// Componente ListingCard con el mismo diseño que el ListingCard original (VERTICAL)
function ListingCard({ listing }: { listing: ListingData }) {
  const firstImage = listing.images?.[0]
  const imageUrl = firstImage ? buildCardImageUrlSafe(firstImage) : null
  const city = listing.location?.split(',')[0]?.trim() || null
  
  // Meta info al estilo ListingCard
  const metaDisplay = [
    listing.brand,
    listing.year,
    listing.model,
    city
  ].filter(Boolean).join(' · ')
  
  return (
    <a 
      href={`https://www.ciclomarket.ar/listing/${listing.slug}`}
      target="_blank"
      rel="noopener noreferrer"
      className="card-flat group flex h-full w-full max-w-[320px] flex-col overflow-hidden mx-auto"
    >
      {/* Imagen - mismo aspect ratio y estilo que ListingCard */}
      <div className="relative overflow-hidden rounded-2xl aspect-[5/4] sm:aspect-video bg-gray-100">
        {imageUrl ? (
          <img
            src={imageUrl}
            alt={listing.title}
            loading="lazy"
            decoding="async"
            className="h-full w-full object-cover object-center transition-transform duration-300 group-hover:scale-105"
          />
        ) : (
          <div className="absolute inset-0 flex items-center justify-center text-xs font-medium uppercase tracking-wide text-black/40">
            Sin imagen
          </div>
        )}
        
        {/* Badge de categoría arriba izquierda */}
        <div className="absolute top-2 left-2 z-10">
          <span className="rounded-full bg-[#14212e] px-2.5 py-1 text-[10px] font-semibold text-white shadow">
            {listing.category || 'Bicicleta'}
          </span>
        </div>
        
        {/* Badge de vistas abajo derecha - estilo ListingCard */}
        <div className="absolute bottom-2 right-2 z-10">
          <span className="rounded-full bg-black/60 px-2 py-1 text-xs font-semibold text-white shadow flex items-center gap-1">
            👀 {Math.max(0, listing.views || 0)}
          </span>
        </div>
      </div>
      
      {/* Contenido - mismo estilo que ListingCard */}
      <div className="flex flex-1 flex-col px-4 py-3 sm:px-5 sm:py-4 min-h-[100px]">
        <h3 className="line-clamp-2 font-semibold text-[#14212e] text-base sm:text-lg">
          {listing.title}
        </h3>
        
        <div className="mt-1 leading-tight">
          <span className="font-semibold text-[#14212e] text-sm sm:text-base">
            {formatPrice(listing.price, listing.price_currency)}
          </span>
        </div>
        
        {metaDisplay && (
          <p className="mt-1 text-xs text-[#14212e]/70 line-clamp-1 sm:line-clamp-2">
            {metaDisplay}
          </p>
        )}
      </div>
    </a>
  )
}

// Skeleton estilo ListingCard
function ListingCardSkeleton() {
  return (
    <div className="animate-pulse w-full max-w-[320px] mx-auto">
      <div className="aspect-[5/4] sm:aspect-video rounded-2xl bg-gray-200" />
      <div className="px-4 py-3 sm:px-5 sm:py-4 space-y-2">
        <div className="h-5 w-3/4 rounded bg-gray-200" />
        <div className="h-4 w-24 rounded bg-gray-200" />
        <div className="h-3 w-1/2 rounded bg-gray-200" />
      </div>
    </div>
  )
}

// Componente para renderizar un grupo de cards en grid
function ListingCardsGrid({ 
  slugs, 
  listingsData, 
  loading 
}: { 
  slugs: string[]
  listingsData: Record<string, ListingData>
  loading: boolean
}) {
  return (
    <div className="my-6 flex flex-wrap justify-center gap-4 sm:gap-6">
      {slugs.map((slug) => {
        if (loading) {
          return <ListingCardSkeleton key={`skeleton-${slug}`} />
        }
        
        const listing = listingsData[slug]
        if (!listing) {
          return (
            <div key={`notfound-${slug}`} className="rounded-xl border border-amber-200 bg-amber-50 p-4 text-amber-700 w-full max-w-[320px] mx-auto">
              <p className="text-sm">⚠️ Publicación no encontrada: <code>{slug}</code></p>
            </div>
          )
        }
        
        return <ListingCard key={`listing-${slug}`} listing={listing} />
      })}
    </div>
  )
}

export default function BlogContentRenderer({ htmlContent }: BlogContentRendererProps) {
  const [listingsData, setListingsData] = useState<Record<string, ListingData>>({})
  const [loading, setLoading] = useState(true)
  
  const slugs = extractListingSlugs(htmlContent)
  
  useEffect(() => {
    async function loadListings() {
      if (slugs.length === 0) {
        setLoading(false)
        return
      }
      
      const data = await fetchListingsBySlugs(slugs)
      setListingsData(data)
      setLoading(false)
    }
    
    loadListings()
  }, [htmlContent])
  
  // Si no hay slugs que cargar, mostrar HTML directamente
  if (slugs.length === 0) {
    return (
      <div 
        className="blog-content"
        dangerouslySetInnerHTML={{ __html: htmlContent }}
      />
    )
  }
  
  // Parsear el HTML y construir bloques: HTML o Grid de cards
  const blocks: React.ReactNode[] = []
  let lastIndex = 0
  let currentCardSlugs: string[] = []
  
  const shortcodeRegex = /\[listing:([^\]]+)\]/g
  let match
  
  while ((match = shortcodeRegex.exec(htmlContent)) !== null) {
    const slug = match[1].trim()
    
    // Si hay HTML antes del shortcode, lo agregamos
    if (match.index > lastIndex) {
      const htmlBefore = htmlContent.substring(lastIndex, match.index)
      // Si había cards acumuladas, renderizamos el grid primero
      if (currentCardSlugs.length > 0) {
        blocks.push(
          <ListingCardsGrid 
            key={`grid-${blocks.length}`}
            slugs={currentCardSlugs}
            listingsData={listingsData}
            loading={loading}
          />
        )
        currentCardSlugs = []
      }
      blocks.push(
        <div 
          key={`html-${blocks.length}`}
          className="blog-content"
          dangerouslySetInnerHTML={{ __html: htmlBefore }}
        />
      )
    }
    
    // Acumulamos el slug para el grid
    currentCardSlugs.push(slug)
    lastIndex = match.index + match[0].length
  }
  
  // Renderizar cards pendientes al final
  if (currentCardSlugs.length > 0) {
    blocks.push(
      <ListingCardsGrid 
        key={`grid-${blocks.length}`}
        slugs={currentCardSlugs}
        listingsData={listingsData}
        loading={loading}
      />
    )
  }
  
  // Agregar el resto del HTML si queda
  if (lastIndex < htmlContent.length) {
    const htmlAfter = htmlContent.substring(lastIndex)
    blocks.push(
      <div 
        key={`html-end`}
        className="blog-content"
        dangerouslySetInnerHTML={{ __html: htmlAfter }}
      />
    )
  }
  
  return <>{blocks}</>
}
