import { useMemo } from 'react'
import { useLocation } from 'react-router-dom'
import SeoLandingTemplate, { type SeoLandingContent } from './SeoLandingTemplate'
import ListingCard from '../../components/ListingCard'
import SkeletonCard from '../../components/SkeletonCard'
import Container from '../../components/Container'
import Button from '../../components/Button'
import { useUsedListings } from '../../hooks/useUsedListings'
import type { Listing } from '../../types'
import { ChevronDown } from 'lucide-react'
import CategorySeoSection from '../../components/seo/CategorySeoSection'
import { CATEGORY_SEO_RICH_CONTENT } from '../../constants/seoCategoryContent'
import SeoHead from '../../components/SeoHead'
import { resolveSiteOrigin, toAbsoluteUrl as absoluteUrl } from '../../utils/seo'

interface SeoHybridLandingUsedProps extends SeoLandingContent {
  /** Clave del contenido SEO rico (por defecto 'Todos') */
  seoContentKey?: string
  initialLimit?: number
}

/**
 * Landing page híbrida para bicicletas usadas.
 * Layout minimalista inspirado en The Pro's Closet.
 */
export default function SeoHybridLandingUsed({
  seoContentKey = 'Todos',
  initialLimit = 12,
  ...seoProps
}: SeoHybridLandingUsedProps) {
  const { pathname } = useLocation()
  const siteOrigin = useMemo(() => resolveSiteOrigin(), [])
  const { listings, count, loading, hasMore, loadMore } = useUsedListings({
    limit: initialLimit,
  })

  const richContent = CATEGORY_SEO_RICH_CONTENT[seoContentKey] ?? CATEGORY_SEO_RICH_CONTENT.Todos

  // Título sin el sufijo duplicado (SEO.tsx agrega "| Ciclo Market")
  const pageTitle = useMemo(
    () => seoProps.title?.replace(/\s*\|\s*Ciclo Market\s*$/i, '').trim() || undefined,
    [seoProps.title],
  )

  // ItemList de productos. Se renderiza como <script> directo (no vía Helmet)
  // porque react-helmet-async colapsa los <script type="application/ld+json">.
  const itemListSchema = useMemo(() => {
    const elements = listings
      .slice(0, 12)
      .map((listing, index) => {
        const slug = listing.slug || listing.id
        if (!slug) return null
        const url = absoluteUrl(`/listing/${slug}`, siteOrigin)
        if (!url) return null
        const brandModel = [listing.brand, listing.model].filter(Boolean).join(' ').trim()
        const name = brandModel
          ? listing.year
            ? `${brandModel} ${listing.year}`
            : brandModel
          : listing.title
        return { '@type': 'ListItem' as const, position: index + 1, name, url }
      })
      .filter(
        (entry): entry is { '@type': 'ListItem'; position: number; name: string; url: string } => Boolean(entry),
      )
    if (!elements.length) return null
    return {
      '@context': 'https://schema.org',
      '@type': 'ItemList',
      name: `${seoProps.h1} - Ciclo Market`,
      url: absoluteUrl(pathname, siteOrigin),
      numberOfItems: elements.length,
      itemListElement: elements,
    }
  }, [listings, siteOrigin, seoProps.h1, pathname])

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
      {/* Meta tags específicos de la landing (título, descripción, canonical, keywords) */}
      <SeoHead
        title={pageTitle}
        description={seoProps.description}
        image="/OG-Marketplace.png"
        keywords={seoProps.keywords}
      />
      {itemListSchema ? (
        <script
          type="application/ld+json"
          dangerouslySetInnerHTML={{ __html: JSON.stringify(itemListSchema) }}
        />
      ) : null}

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

      {/* Contenido SEO rico - Flujo continuo debajo del grid (estilo The Pro's Closet) */}
      <CategorySeoSection content={richContent} />
    </>
  )
}
