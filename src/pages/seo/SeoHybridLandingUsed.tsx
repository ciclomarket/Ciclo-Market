import { useMemo } from 'react'
import SeoLandingTemplate, { type SeoLandingContent } from './SeoLandingTemplate'
import ListingCard from '../../components/ListingCard'
import SkeletonCard from '../../components/SkeletonCard'
import Container from '../../components/Container'
import Button from '../../components/Button'
import { useUsedListings } from '../../hooks/useUsedListings'
import type { Listing } from '../../types'
import { ChevronDown } from 'lucide-react'

interface SeoHybridLandingUsedProps extends SeoLandingContent {
  initialLimit?: number
}

/**
 * Landing page híbrida para bicicletas usadas.
 * Layout minimalista inspirado en The Pro's Closet.
 */
export default function SeoHybridLandingUsed({
  initialLimit = 12,
  ...seoProps
}: SeoHybridLandingUsedProps) {
  const { listings, count, loading, hasMore, loadMore } = useUsedListings({
    limit: initialLimit,
  })

  const enhancedCtAs = useMemo(() => {
    if (count === null) return seoProps.ctas

    const firstCta = seoProps.ctas[0]
    if (firstCta) {
      return [
        { ...firstCta, label: `Ver ${count} bicis` },
        ...seoProps.ctas.slice(1),
      ]
    }
    return seoProps.ctas
  }, [seoProps.ctas, count])

  return (
    <>
      <SeoLandingTemplate 
        {...seoProps} 
        ctas={enhancedCtAs}
        mode="hero"
        productCount={count}
      />

      <section className="py-6 bg-white" id="productos">
        <Container>
          <div className="grid grid-cols-2 md:grid-cols-3 lg:grid-cols-4 gap-3 md:gap-4">
            {loading ? (
              Array.from({ length: initialLimit }).map((_, i) => (
                <SkeletonCard key={`skeleton-${i}`} />
              ))
            ) : listings.length > 0 ? (
              listings.map((listing: Listing) => (
                <ListingCard key={listing.id} l={listing} />
              ))
            ) : (
              <div className="col-span-full py-12 text-center">
                <p className="text-gray-600 mb-4">
                  No hay bicicletas disponibles.
                </p>
                <Button to="/publicar">Publicar la mía</Button>
              </div>
            )}
          </div>

          {!loading && hasMore && (
            <div className="mt-6 text-center">
              <button
                onClick={loadMore}
                className="inline-flex items-center gap-1 px-4 py-2 text-sm font-medium text-gray-700 hover:text-gray-900 border border-gray-200 rounded-lg hover:border-gray-300 transition-colors"
              >
                Cargar más
                <ChevronDown className="w-4 h-4" />
              </button>
            </div>
          )}
        </Container>
      </section>

      <SeoLandingTemplate 
        {...seoProps}
        mode="content"
        productCount={count}
      />
    </>
  )
}
