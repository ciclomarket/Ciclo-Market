import { useCallback, useEffect, useMemo, useState } from 'react'
import { Link } from 'react-router-dom'
import { MapPin, Package, Search, Store, CheckCircle2, Star, Phone, Globe } from 'lucide-react'
import Container from '../components/Container'
import SeoHead from '../components/SeoHead'
import { fetchStores, fetchStoreActivityCounts, type StoreSummary } from '../services/users'
import { fetchListings } from '../services/listings'
import { buildPublicUrlSafe } from '../lib/supabaseImages'
import type { Category } from '../types'

type StoreCategoryFilter = 'Todos' | 'Bicicletas' | 'Accesorios' | 'Indumentaria'
type StoreCategoryMap = Record<string, Category[]>
type ProvinceCount = Record<string, number>

const STORE_CATEGORY_CARDS: Array<{ key: StoreCategoryFilter; label: string; description: string; icon: string }> = [
  { key: 'Todos', label: 'Todas las tiendas', description: 'Ver todo el catálogo', icon: '🏪' },
  { key: 'Bicicletas', label: 'Bicicletas', description: 'Tiendas especializadas', icon: '🚲' },
  { key: 'Accesorios', label: 'Accesorios', description: 'Componentes y upgrades', icon: '🔧' },
  { key: 'Indumentaria', label: 'Indumentaria', description: 'Ropa técnica y cascos', icon: '👕' },
]

const normalizeText = (value: string) =>
  value
    .normalize('NFD')
    .replace(/[^a-zA-Z0-9\s]/g, '')
    .trim()
    .toLowerCase()

export default function Tiendas() {
  const [stores, setStores] = useState<StoreSummary[]>([])
  const [loading, setLoading] = useState(true)
  const [query, setQuery] = useState('')
  const [sortMode, setSortMode] = useState<'active' | 'alpha'>('active')
  const [activity, setActivity] = useState<Record<string, number>>({})
  const [categoryFilter, setCategoryFilter] = useState<StoreCategoryFilter>('Todos')
  const [selectedProvinces, setSelectedProvinces] = useState<string[]>([])
  const [storeCategories, setStoreCategories] = useState<StoreCategoryMap>({})

  useEffect(() => {
    let active = true
    const load = async () => {
      setLoading(true)
      try {
        const data = await fetchStores()
        if (active) setStores(data)
      } catch {
        if (active) setStores([])
      }
      try {
        const counts = await fetchStoreActivityCounts()
        if (active) setActivity(counts)
      } catch {
        void 0
      }
      try {
        const listings = await fetchListings()
        if (active) {
          const categories: StoreCategoryMap = {}
          for (const listing of listings) {
            const sid = listing.sellerId
            if (!sid) continue
            const current = categories[sid] ?? []
            if (listing.category && !current.includes(listing.category)) current.push(listing.category)
            categories[sid] = current
          }
          setStoreCategories(categories)
        }
      } catch {
        void 0
      }
      if (active) setLoading(false)
    }
    void load()
    return () => {
      active = false
    }
  }, [])

  const provinceOptions = useMemo(() => {
    const set = new Set<string>()
    let hasUnknown = false
    for (const store of stores) {
      const province = typeof store.province === 'string' ? store.province.trim() : ''
      if (province) set.add(province)
      else hasUnknown = true
    }
    const options = Array.from(set).sort((a, b) => a.localeCompare(b, 'es', { sensitivity: 'base' }))
    if (hasUnknown) options.push('Sin provincia')
    return options
  }, [stores])

  const queryFilteredStores = useMemo(() => {
    const q = normalizeText(query)
    if (!q) return stores
    return stores.filter((store) => {
      const name = normalizeText(store.store_name || store.store_slug || '')
      const location = normalizeText([store.city, store.province, (store as any).store_address].filter(Boolean).join(' '))
      return name.includes(q) || location.includes(q)
    })
  }, [stores, query])

  const provinceCounts = useMemo<ProvinceCount>(() => {
    const counts: ProvinceCount = {}
    for (const store of queryFilteredStores) {
      const key = store.province || 'Sin provincia'
      counts[key] = (counts[key] || 0) + 1
    }
    return counts
  }, [queryFilteredStores])

  const filteredStores = useMemo(() => {
    const provinceSet = new Set(selectedProvinces.map((value) => normalizeText(value)))
    const matchesCategory = (storeId: string) => {
      if (categoryFilter === 'Todos') return true
      const categories = storeCategories[storeId] ?? []
      return categories.some((category) => category === categoryFilter)
    }

    const filtered = queryFilteredStores.filter((store) => {
      if (!matchesCategory(store.id)) return false
      if (provinceSet.size) {
        const province = typeof store.province === 'string' ? normalizeText(store.province) : ''
        const matchesEmpty = !province && provinceSet.has('sin provincia')
        if (!matchesEmpty && (!province || !provinceSet.has(province))) return false
      }
      return true
    })

    return filtered.sort((a, b) => {
      if (sortMode === 'alpha') {
        const an = normalizeText(a.store_name || a.store_slug || '')
        const bn = normalizeText(b.store_name || b.store_slug || '')
        return an.localeCompare(bn)
      }
      const countA = activity[a.id] || 0
      const countB = activity[b.id] || 0
      if (countB !== countA) return countB - countA
      const an = normalizeText(a.store_name || a.store_slug || '')
      const bn = normalizeText(b.store_name || b.store_slug || '')
      return an.localeCompare(bn)
    })
  }, [queryFilteredStores, activity, sortMode, categoryFilter, selectedProvinces, storeCategories])

  const toggleProvince = useCallback((province: string) => {
    setSelectedProvinces((prev) => {
      const normalized = normalizeText(province)
      const exists = prev.some((value) => normalizeText(value) === normalized)
      if (exists) return prev.filter((value) => normalizeText(value) !== normalized)
      return [...prev, province]
    })
  }, [])

  const handleClearFilters = useCallback(() => {
    setCategoryFilter('Todos')
    setSelectedProvinces([])
    setQuery('')
  }, [])

  const activeFilterChips: Array<{ key: string; label: string; onRemove: () => void }> = []
  if (categoryFilter !== 'Todos') {
    activeFilterChips.push({
      key: 'category',
      label: `Categoría: ${categoryFilter}`,
      onRemove: () => setCategoryFilter('Todos'),
    })
  }
  for (const province of selectedProvinces) {
    activeFilterChips.push({
      key: `province-${province}`,
      label: `Provincia: ${province}`,
      onRemove: () => toggleProvince(province),
    })
  }
  if (query.trim()) {
    activeFilterChips.push({ key: 'query', label: `Búsqueda: "${query.trim()}"`, onRemove: () => setQuery('') })
  }
  const hasActiveFilters = activeFilterChips.length > 0

  return (
    <>
      <SeoHead
        title="Tiendas oficiales de bicicletas | Ciclo Market"
        description="Descubrí tiendas oficiales verificadas en Ciclo Market. Explorá su catálogo, filtrá por provincia y encontrá productos publicados por cada tienda."
        canonicalPath="/tiendas"
      />

      {/* Hero Section */}
      <div className="bg-gradient-to-br from-[#0f1729] via-[#1e293b] to-[#0f1729] text-white">
        <Container className="py-16 md:py-20">
          <div className="max-w-3xl mx-auto text-center">
            <div className="inline-flex items-center gap-2 px-4 py-2 bg-white/10 backdrop-blur rounded-full text-sm font-medium mb-6">
              <Store className="w-4 h-4" />
              Tiendas Verificadas
            </div>
            <h1 className="text-4xl md:text-5xl font-extrabold tracking-tight mb-4">
              Tiendas oficiales
            </h1>
            <p className="text-lg text-white/80 max-w-2xl mx-auto">
              Encontrá las mejores bicicleterías de Argentina. Todas las tiendas están verificadas 
              y cuentan con catálogo actualizado, precios reales y atención personalizada.
            </p>
          </div>
        </Container>
      </div>

      {/* Search & Filters Bar */}
      <div className="bg-white border-b border-gray-200 sticky top-0 z-30">
        <Container className="py-3 md:py-4">
          {/* Mobile: Compact filters row */}
          <div className="flex flex-col gap-3">
            {/* Search + Filters Row */}
            <div className="flex gap-2">
              {/* Search */}
              <div className="flex-1 relative">
                <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-gray-400" />
                <input
                  type="search"
                  value={query}
                  onChange={(event) => setQuery(event.target.value)}
                  placeholder="Buscar tienda..."
                  className="w-full pl-9 pr-3 py-2.5 rounded-xl border border-gray-200 bg-gray-50 text-sm text-gray-900 focus:bg-white focus:border-blue-500 focus:ring-2 focus:ring-blue-200 transition-all"
                />
              </div>
              
              {/* Mobile filter button */}
              <button
                type="button"
                onClick={() => {
                  const el = document.getElementById('mobile-filters')
                  el?.classList.toggle('hidden')
                }}
                className="md:hidden flex items-center gap-1.5 px-3 py-2.5 bg-gray-100 text-gray-700 rounded-xl text-sm font-medium"
              >
                <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 6V4m0 2a2 2 0 100 4m0-4a2 2 0 110 4m-6 8a2 2 0 100-4m0 4a2 2 0 110-4m0 4v2m0-6V4m6 6v10m6-2a2 2 0 100-4m0 4a2 2 0 110-4m0 4v2m0-6V4" />
                </svg>
                Filtros
              </button>
            </div>
            
            {/* Desktop filters */}
            <div id="mobile-filters" className="hidden md:flex flex-col md:flex-row gap-3">
              {/* Province Select */}
              <div className="md:w-56">
                <select
                  value={selectedProvinces[0] ?? ''}
                  onChange={(event) => {
                    const value = event.target.value
                    setSelectedProvinces(value ? [value] : [])
                  }}
                  className="w-full px-3 py-2.5 rounded-xl border border-gray-200 bg-white text-sm text-gray-900 focus:border-blue-500 focus:ring-2 focus:ring-blue-200"
                >
                  <option value="">Todas las provincias</option>
                  {provinceOptions.map((p) => (
                    <option key={p} value={p}>
                      {p} ({provinceCounts[p] ?? 0})
                    </option>
                  ))}
                </select>
              </div>

              {/* Sort */}
              <div className="md:w-40">
                <select
                  value={sortMode}
                  onChange={(event) => setSortMode(event.target.value as 'active' | 'alpha')}
                  className="w-full px-3 py-2.5 rounded-xl border border-gray-200 bg-white text-sm text-gray-900 focus:border-blue-500 focus:ring-2 focus:ring-blue-200"
                >
                  <option value="active">Más activas</option>
                  <option value="alpha">Alfabético</option>
                </select>
              </div>
            </div>
          </div>

          {/* Category Chips - Horizontal scroll on mobile */}
          <div className="flex items-center gap-2 mt-3 overflow-x-auto pb-1 -mx-4 px-4 md:mx-0 md:px-0 md:pb-0 md:flex-wrap scrollbar-hide">
            {STORE_CATEGORY_CARDS.map((card) => {
              const active = categoryFilter === card.key
              return (
                <button
                  key={card.key}
                  type="button"
                  onClick={() => setCategoryFilter(card.key)}
                  className={`flex items-center gap-1.5 rounded-full px-3 py-2 text-sm font-medium whitespace-nowrap transition flex-shrink-0 ${
                    active
                      ? 'bg-blue-600 text-white shadow-md'
                      : 'bg-gray-100 text-gray-700 hover:bg-gray-200'
                  }`}
                >
                  <span className="text-base">{card.icon}</span>
                  <span>{card.label}</span>
                </button>
              )
            })}

            {hasActiveFilters && (
              <button
                type="button"
                onClick={handleClearFilters}
                className="ml-2 text-sm font-medium text-gray-500 hover:text-gray-900 whitespace-nowrap flex-shrink-0"
              >
                Limpiar
              </button>
            )}
          </div>

          {/* Active Filters */}
          {hasActiveFilters && (
            <div className="flex flex-wrap items-center gap-2 mt-3 pt-3 border-t border-gray-100">
              {activeFilterChips.map((chip) => (
                <button
                  key={chip.key}
                  type="button"
                  onClick={chip.onRemove}
                  className="inline-flex items-center gap-2 rounded-full bg-blue-50 text-blue-700 px-3 py-1.5 text-sm font-medium hover:bg-blue-100"
                >
                  <span>{chip.label}</span>
                  <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
                  </svg>
                </button>
              ))}
            </div>
          )}
        </Container>
      </div>

      {/* Results */}
      <Container className="py-8">
        {loading ? (
          <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-4 md:gap-6">
            {[...Array(6)].map((_, i) => (
              <div key={i} className="bg-white rounded-xl md:rounded-2xl border border-gray-100 overflow-hidden animate-pulse">
                <div className="h-28 sm:h-32 md:h-36 bg-gray-200" />
                <div className="p-4 md:p-6">
                  <div className="w-16 h-16 md:w-20 md:h-20 bg-gray-200 rounded-xl md:rounded-2xl -mt-8 md:-mt-10 mb-3 md:mb-4" />
                  <div className="h-5 md:h-6 bg-gray-200 rounded w-3/4 mb-2" />
                  <div className="h-3.5 md:h-4 bg-gray-200 rounded w-1/2" />
                </div>
              </div>
            ))}
          </div>
        ) : filteredStores.length ? (
          <>
            <div className="flex items-center justify-between mb-6">
              <p className="text-gray-600">
                Mostrando <span className="font-semibold text-gray-900">{filteredStores.length}</span> tiendas
              </p>
            </div>

            <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-4 md:gap-6">
              {filteredStores.map((store) => {
                const storeName = store.store_name || store.store_slug
                const avatar = buildPublicUrlSafe(store.store_avatar_url || '/avatar-placeholder.png') || ''
                const banner = store.store_banner_url ? (buildPublicUrlSafe(store.store_banner_url) || '') : ''
                const location = [store.city, store.province].filter(Boolean).join(', ') || 'Ubicación no declarada'
                const productCount = activity[store.id] || 0

                return (
                  <Link
                    key={store.id}
                    to={`/tienda/${encodeURIComponent(store.store_slug)}`}
                    className="group bg-white rounded-xl md:rounded-2xl border border-gray-100 overflow-hidden hover:shadow-lg md:hover:shadow-xl transition-all duration-300 hover:-translate-y-0.5 md:hover:-translate-y-1"
                  >
                    {/* Banner */}
                    <div className="relative h-28 sm:h-32 md:h-36 overflow-hidden">
                      {banner ? (
                        <img 
                          src={banner} 
                          alt="" 
                          className="h-full w-full object-cover group-hover:scale-105 transition-transform duration-500"
                          loading="lazy" 
                          decoding="async" 
                        />
                      ) : (
                        <div className="h-full w-full bg-gradient-to-r from-blue-600 to-blue-800" />
                      )}
                      <div className="absolute inset-0 bg-gradient-to-t from-black/30 to-transparent" />
                      
                      {/* Verified Badge */}
                      <div className="absolute top-2 right-2 md:top-3 md:right-3">
                        <span className="inline-flex items-center gap-1 px-2 py-0.5 md:px-2.5 md:py-1 bg-white/90 backdrop-blur rounded-full text-xs font-medium text-blue-700">
                          <CheckCircle2 className="w-3 h-3 md:w-3.5 md:h-3.5" />
                          <span className="hidden sm:inline">Verificada</span>
                        </span>
                      </div>
                    </div>

                    {/* Content */}
                    <div className="px-4 md:px-6 pb-4 md:pb-6">
                      {/* Avatar */}
                      <div className="relative -mt-8 md:-mt-12 mb-3 md:mb-4">
                        <img
                          src={avatar}
                          alt={storeName}
                          className="w-16 h-16 md:w-24 md:h-24 rounded-xl md:rounded-2xl object-cover ring-3 md:ring-4 ring-white shadow-md bg-white"
                          loading="lazy"
                          decoding="async"
                        />
                      </div>

                      {/* Info */}
                      <div>
                        <h3 className="text-lg md:text-xl font-bold text-gray-900 group-hover:text-blue-600 transition-colors line-clamp-1">
                          {storeName}
                        </h3>
                        
                        <div className="mt-2 md:mt-3 space-y-1 md:space-y-2">
                          <div className="flex items-center gap-1.5 text-xs md:text-sm text-gray-600">
                            <MapPin className="h-3.5 w-3.5 md:h-4 md:w-4 text-gray-400 flex-shrink-0" />
                            <span className="line-clamp-1">{location}</span>
                          </div>
                          
                          <div className="flex items-center gap-1.5 text-xs md:text-sm text-gray-600">
                            <Package className="h-3.5 w-3.5 md:h-4 md:w-4 text-gray-400" />
                            <span>{productCount} productos</span>
                          </div>
                        </div>

                        {/* Quick Contact */}
                        <div className="mt-3 md:mt-4 flex items-center gap-2">
                          {store.store_phone && (
                            <span className="inline-flex items-center gap-1 px-2 py-1 md:px-3 md:py-1.5 bg-green-50 text-green-700 rounded-lg text-xs md:text-sm font-medium">
                              <Phone className="w-3 h-3 md:w-3.5 md:h-3.5" />
                              <span className="hidden sm:inline">WhatsApp</span>
                            </span>
                          )}
                          {store.store_website && (
                            <span className="inline-flex items-center gap-1 px-2 py-1 md:px-3 md:py-1.5 bg-gray-100 text-gray-700 rounded-lg text-xs md:text-sm font-medium">
                              <Globe className="w-3 h-3 md:w-3.5 md:h-3.5" />
                              <span className="hidden sm:inline">Web</span>
                            </span>
                          )}
                        </div>

                        {/* CTA */}
                        <div className="mt-3 md:mt-5">
                          <span className="flex items-center justify-center w-full py-2 md:py-2.5 bg-gray-900 text-white rounded-lg md:rounded-xl text-sm md:text-base font-semibold group-hover:bg-blue-600 transition-colors">
                            Ver catálogo
                          </span>
                        </div>
                      </div>
                    </div>
                  </Link>
                )
              })}
            </div>
          </>
        ) : (
          <div className="text-center py-16">
            <div className="w-20 h-20 bg-gray-100 rounded-full flex items-center justify-center mx-auto mb-4">
              <Store className="w-10 h-10 text-gray-400" />
            </div>
            <h3 className="text-lg font-semibold text-gray-900 mb-2">
              {stores.length === 0 ? 'No hay tiendas publicadas aún' : 'No encontramos tiendas con esos filtros'}
            </h3>
            <p className="text-gray-500 mb-4">
              {stores.length === 0 
                ? 'Sé el primero en abrir una tienda en Ciclo Market' 
                : 'Probá con otros filtros o búsqueda'}
            </p>
            {hasActiveFilters && (
              <button
                onClick={handleClearFilters}
                className="inline-flex items-center gap-2 px-4 py-2 bg-blue-600 text-white rounded-lg font-medium hover:bg-blue-700"
              >
                Limpiar filtros
              </button>
            )}
          </div>
        )}

        {/* CTA Section */}
        <div className="mt-16 bg-gradient-to-r from-blue-600 to-blue-700 rounded-3xl p-8 md:p-12 text-white text-center">
          <div className="max-w-2xl mx-auto">
            <h2 className="text-2xl md:text-3xl font-bold mb-4">
              ¿Tenés una bicicletería?
            </h2>
            <p className="text-blue-100 text-lg mb-6">
              Unite a las tiendas oficiales de Ciclo Market y llegá a miles de ciclistas. 
              Publicá tu catálogo, recibí consultas y vendé más.
            </p>
            <div className="flex flex-col sm:flex-row gap-4 justify-center">
              <Link
                to="/vender/tiendas"
                className="inline-flex items-center justify-center px-6 py-3 bg-white text-blue-600 rounded-xl font-semibold hover:bg-blue-50 transition-colors"
              >
                Conocer beneficios
              </Link>
              <a
                href="mailto:admin@ciclomarket.ar"
                className="inline-flex items-center justify-center px-6 py-3 bg-blue-500/50 backdrop-blur text-white rounded-xl font-semibold hover:bg-blue-500/70 transition-colors"
              >
                Contactar ventas
              </a>
            </div>
          </div>
        </div>
      </Container>
    </>
  )
}
