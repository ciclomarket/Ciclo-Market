import { useParams, Navigate, Link } from 'react-router-dom'
import { useState, useMemo, lazy, Suspense } from 'react'
import { ChevronDown, Check } from 'lucide-react'
import SeoHead from '../../components/SeoHead'
import Container from '../../components/Container'
import SkeletonCard from '../../components/SkeletonCard'
import Breadcrumbs from '../../components/Breadcrumbs'
import { PROVINCIA_SLUGS, provinciaSlugToName } from '../../utils/provinciaSlugs'
import { useProvinciaListings } from '../../hooks/useProvinciaListings'
import type { Listing } from '../../types'

const ListingCard = lazy(() => import('../../components/ListingCard'))

const CATEGORY_FILTERS = ['MTB', 'Ruta', 'Gravel', 'Urbana'] as const

export default function ProvinciaLanding() {
  const { provinciaSlug = '' } = useParams<{ provinciaSlug: string }>()
  const provinciaNombre = provinciaSlugToName(provinciaSlug)

  if (!provinciaNombre) return <Navigate to="/marketplace" replace />

  return <ProvinciaLandingContent provinciaNombre={provinciaNombre} provinciaSlug={provinciaSlug} />
}

function ProvinciaLandingContent({
  provinciaNombre,
  provinciaSlug,
}: {
  provinciaNombre: string
  provinciaSlug: string
}) {
  const { listings, count, loading, hasMore, loadMore } = useProvinciaListings(provinciaNombre)
  const [activeCategory, setActiveCategory] = useState<string | null>(null)

  const filteredListings = useMemo(() => {
    if (!activeCategory) return listings
    return listings.filter((l: Listing) => l.category === activeCategory)
  }, [listings, activeCategory])

  const displayName = provinciaNombre === 'Ciudad Autónoma de Buenos Aires' ? 'CABA' : provinciaNombre
  const title = `Bicicletas usadas en ${displayName} | Ciclo Market`
  const description = `Comprá y vendé bicicletas en ${displayName}. ${count ? `${count} publicaciones activas` : 'Publicaciones activas'} de vendedores locales. Sin comisiones, contacto directo.`
  const canonical = `/provincia/${provinciaSlug}`

  const breadcrumbLd = {
    '@context': 'https://schema.org',
    '@type': 'BreadcrumbList',
    itemListElement: [
      { '@type': 'ListItem', position: 1, name: 'Inicio', item: 'https://www.ciclomarket.ar' },
      { '@type': 'ListItem', position: 2, name: 'Bicicletas en Argentina', item: 'https://www.ciclomarket.ar/bicicletas-usadas' },
      { '@type': 'ListItem', position: 3, name: `Bicicletas en ${displayName}`, item: `https://www.ciclomarket.ar/provincia/${provinciaSlug}` },
    ],
  }

  const itemListLd = listings.slice(0, 10).length > 0 ? {
    '@context': 'https://schema.org',
    '@type': 'ItemList',
    name: `Bicicletas usadas en ${displayName}`,
    numberOfItems: count ?? listings.length,
    itemListElement: listings.slice(0, 10).map((l, i) => ({
      '@type': 'ListItem',
      position: i + 1,
      name: l.title,
      url: `https://www.ciclomarket.ar/listing/${l.slug || l.id}`,
    })),
  } : null

  return (
    <>
      <SeoHead
        title={title}
        description={description}
        canonicalPath={canonical}
        image="/OG-Marketplace.png"
        keywords={[
          `bicicletas usadas ${displayName.toLowerCase()}`,
          `comprar bicicleta ${displayName.toLowerCase()}`,
          `clasificados bicicletas ${displayName.toLowerCase()}`,
          `bicicletas segunda mano ${displayName.toLowerCase()}`,
          `vender bicicleta ${displayName.toLowerCase()}`,
        ]}
        jsonLd={[breadcrumbLd, itemListLd].filter(Boolean) as Record<string, unknown>[]}
      />

      {/* Hero */}
      <section className="bg-[#f5f5f3] border-b border-gray-200">
        <Container>
          <div className="py-8 md:py-12">
            <Breadcrumbs
              items={[
                { label: 'Inicio', to: '/' },
                { label: 'Bicicletas usadas', to: '/bicicletas-usadas' },
                { label: `Bicicletas en ${displayName}` },
              ]}
              className="mb-4 text-sm text-gray-500"
            />
            <div className="max-w-3xl">
              <h1 className="text-3xl md:text-4xl font-semibold text-gray-900 tracking-tight mb-3">
                Bicicletas usadas en {displayName}
              </h1>
              <p className="text-lg text-gray-600 leading-relaxed mb-5">
                {count !== null
                  ? `${count} publicaciones activas · Vendedores locales en ${displayName}.`
                  : `Vendedores locales en ${displayName}.`}{' '}
                Comprá y vendé sin intermediarios.
              </p>
              <div className="flex flex-wrap items-center gap-4 text-sm text-gray-600 mb-5">
                <span className="flex items-center gap-1.5">
                  <Check className="w-4 h-4 text-green-600" />
                  Vendedores locales
                </span>
                <span className="flex items-center gap-1.5">
                  <Check className="w-4 h-4 text-green-600" />
                  Contacto directo
                </span>
                <span className="flex items-center gap-1.5">
                  <Check className="w-4 h-4 text-green-600" />
                  Publicación gratuita
                </span>
              </div>
              <div className="flex flex-wrap gap-3">
                <Link
                  to={`/marketplace?location=${encodeURIComponent(provinciaNombre)}`}
                  className="inline-flex items-center rounded-lg bg-[#14212e] px-4 py-2.5 text-sm font-semibold text-white transition hover:bg-[#1b2f3f]"
                >
                  Ver todas en el marketplace
                </Link>
                <Link
                  to="/publicar"
                  className="inline-flex items-center rounded-lg border border-gray-300 bg-white px-4 py-2.5 text-sm font-semibold text-gray-700 transition hover:border-gray-400"
                >
                  Publicar mi bici
                </Link>
              </div>
            </div>
          </div>
        </Container>
      </section>

      {/* Filtros de categoría */}
      <section className="bg-white border-b border-gray-200 sticky top-0 z-10">
        <Container>
          <div className="flex items-center gap-2 py-3 overflow-x-auto scrollbar-none">
            <button
              onClick={() => setActiveCategory(null)}
              className={`flex-shrink-0 rounded-full px-4 py-1.5 text-sm font-medium transition ${
                !activeCategory
                  ? 'bg-[#14212e] text-white'
                  : 'bg-gray-100 text-gray-700 hover:bg-gray-200'
              }`}
            >
              Todas
            </button>
            {CATEGORY_FILTERS.map((cat) => (
              <button
                key={cat}
                onClick={() => setActiveCategory(activeCategory === cat ? null : cat)}
                className={`flex-shrink-0 rounded-full px-4 py-1.5 text-sm font-medium transition ${
                  activeCategory === cat
                    ? 'bg-[#14212e] text-white'
                    : 'bg-gray-100 text-gray-700 hover:bg-gray-200'
                }`}
              >
                {cat}
              </button>
            ))}
          </div>
        </Container>
      </section>

      {/* Grid de listings */}
      <section className="py-6 bg-white">
        <Container>
          <div className="grid grid-cols-2 md:grid-cols-3 lg:grid-cols-4 gap-3 md:gap-4">
            {loading ? (
              Array.from({ length: 12 }).map((_, i) => <SkeletonCard key={i} />)
            ) : filteredListings.length > 0 ? (
              <Suspense fallback={Array.from({ length: 12 }).map((_, i) => <SkeletonCard key={i} />)}>
                {filteredListings.map((listing: Listing) => (
                  <ListingCard key={listing.id} l={listing} />
                ))}
              </Suspense>
            ) : (
              <div className="col-span-full py-16 text-center">
                <p className="text-gray-500 mb-4">
                  No hay bicicletas disponibles en {displayName}
                  {activeCategory ? ` de ${activeCategory}` : ''} en este momento.
                </p>
                <Link
                  to="/marketplace"
                  className="text-sm font-medium text-[#14212e] underline"
                >
                  Ver todo el marketplace
                </Link>
              </div>
            )}
          </div>

          {!loading && hasMore && (
            <div className="mt-6 text-center">
              <button
                onClick={loadMore}
                className="inline-flex items-center gap-1.5 px-4 py-2 text-sm font-medium text-gray-700 hover:text-gray-900 border border-gray-200 rounded-lg hover:border-gray-300 transition"
              >
                Cargar más
                <ChevronDown className="w-4 h-4" />
              </button>
            </div>
          )}
        </Container>
      </section>

      {/* CTA */}
      <section className="py-12 bg-[#f5f5f3] border-t border-gray-200">
        <Container>
          <div className="max-w-2xl mx-auto text-center">
            <h2 className="text-2xl font-semibold text-gray-900 mb-3">
              ¿Querés vender tu bici en {displayName}?
            </h2>
            <p className="text-gray-600 mb-6">
              Publicá gratis y llegá a compradores de toda la región. Sin comisiones, sin intermediarios.
            </p>
            <Link
              to="/publicar"
              className="inline-flex items-center rounded-lg bg-[#14212e] px-6 py-3 text-sm font-semibold text-white transition hover:bg-[#1b2f3f]"
            >
              Publicar gratis →
            </Link>
          </div>
        </Container>
      </section>

      {/* Contenido SEO */}
      <section className="py-10 border-t border-gray-100">
        <Container>
          <div className="max-w-3xl prose prose-gray text-sm text-gray-600 leading-relaxed space-y-4">
            <h2 className="text-lg font-semibold text-gray-900">
              Marketplace de bicicletas en {displayName}
            </h2>
            <p>
              Ciclo Market es el punto de encuentro para compradores y vendedores de bicicletas en {displayName}. Encontrá MTB, bicicletas de ruta, gravel y urbanas de vendedores particulares y tiendas oficiales de la zona. Cada publicación incluye fotos reales, precio y contacto directo por WhatsApp.
            </p>
            <p>
              Vendé tu bicicleta en {displayName} gratis. Publicar es simple y sin costo: subí fotos, describí el estado y precio, y empezá a recibir consultas de compradores de la región.
            </p>
            <div className="flex flex-wrap gap-x-2 gap-y-1 text-sm not-prose">
              <span className="text-gray-500">Otras provincias:</span>
              {Object.entries(PROVINCIA_SLUGS)
                .filter(([slug]) => slug !== provinciaSlug)
                .slice(0, 6)
                .map(([slug, nombre]) => (
                  <Link
                    key={slug}
                    to={`/provincia/${slug}`}
                    className="text-gray-700 hover:text-blue-600 underline underline-offset-2"
                  >
                    {nombre === 'Ciudad Autónoma de Buenos Aires' ? 'CABA' : nombre}
                  </Link>
                ))}
            </div>
          </div>
        </Container>
      </section>
    </>
  )
}
