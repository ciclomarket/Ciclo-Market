import { useCallback, useEffect, useMemo, useState } from 'react'
import { Link } from 'react-router-dom'
import { MapPin, Package } from 'lucide-react'
import Container from '../components/Container'
import SeoHead from '../components/SeoHead'
import { fetchStores, fetchStoreActivityCounts, type StoreSummary } from '../services/users'
import { fetchListings } from '../services/listings'
import { buildPublicUrlSafe } from '../lib/supabaseImages'
import type { Category } from '../types'

type StoreCategoryFilter = 'Todos' | 'Accesorios' | 'Indumentaria'
type StoreCategoryMap = Record<string, Category[]>
type ProvinceCount = Record<string, number>

const STORE_CATEGORY_CARDS: Array<{ key: StoreCategoryFilter; label: string; description: string }> = [
  { key: 'Todos', label: 'Todas', description: 'Todo el catálogo disponible' },
  { key: 'Accesorios', label: 'Accesorios', description: 'Componentes, upgrades y electrónica' },
  { key: 'Indumentaria', label: 'Indumentaria', description: 'Ropa técnica y cascos' },
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
    activeFilterChips.push({ key: 'query', label: `Búsqueda: “${query.trim()}”`, onRemove: () => setQuery('') })
  }
  const hasActiveFilters = activeFilterChips.length > 0

  return (
    <>
      <SeoHead
        title="Tiendas oficiales | Ciclo Market"
        description="Descubrí tiendas oficiales verificadas en Ciclo Market. Explorá su catálogo, filtrá por provincia y encontrá productos publicados por cada tienda."
        canonicalPath="/tiendas"
      />

      <div className="min-h-[calc(100vh-var(--header-h))] bg-gray-50">
        <Container className="pt-10 pb-6">
          <div className="max-w-3xl">
            <h1 className="text-3xl font-extrabold tracking-tight text-mb-ink sm:text-4xl">Tiendas oficiales</h1>
            <p className="mt-2 text-gray-600">
              Tiendas verificadas dentro de Ciclo Market. Entrá a cada tienda para ver su catálogo y contacto.
            </p>
          </div>

          <div className="mt-6 grid gap-3 md:grid-cols-12 md:items-end">
            <div className="md:col-span-6">
              <label className="block text-xs font-semibold uppercase tracking-wide text-gray-500">Buscar</label>
              <input
                type="search"
                value={query}
                onChange={(event) => setQuery(event.target.value)}
                placeholder="Nombre de tienda, ciudad o provincia…"
                className="mt-1 w-full rounded-xl border border-gray-200 bg-white px-4 py-3 text-sm text-mb-ink shadow-sm focus:border-mb-primary focus:ring-1 focus:ring-mb-primary"
              />
            </div>
            <div className="md:col-span-3">
              <label className="block text-xs font-semibold uppercase tracking-wide text-gray-500">Provincia</label>
              <select
                value={selectedProvinces[0] ?? ''}
                onChange={(event) => {
                  const value = event.target.value
                  setSelectedProvinces(value ? [value] : [])
                }}
                className="mt-1 w-full rounded-xl border border-gray-200 bg-white px-3 py-3 text-sm text-mb-ink shadow-sm focus:border-mb-primary focus:ring-1 focus:ring-mb-primary"
              >
                <option value="">Todas</option>
                {provinceOptions.map((p) => (
                  <option key={p} value={p}>
                    {p} ({provinceCounts[p] ?? 0})
                  </option>
                ))}
              </select>
            </div>
            <div className="md:col-span-3">
              <label className="block text-xs font-semibold uppercase tracking-wide text-gray-500">Orden</label>
              <select
                value={sortMode}
                onChange={(event) => setSortMode(event.target.value as 'active' | 'alpha')}
                className="mt-1 w-full rounded-xl border border-gray-200 bg-white px-3 py-3 text-sm text-mb-ink shadow-sm focus:border-mb-primary focus:ring-1 focus:ring-mb-primary"
              >
                <option value="active">Más activas</option>
                <option value="alpha">Alfabético</option>
              </select>
            </div>
          </div>

          <div className="mt-4 flex flex-wrap items-center gap-2">
            {STORE_CATEGORY_CARDS.map((card) => {
              const active = categoryFilter === card.key
              return (
                <button
                  key={card.key}
                  type="button"
                  onClick={() => setCategoryFilter(card.key)}
                  className={`rounded-full px-4 py-2 text-sm font-semibold transition ${
                    active
                      ? 'bg-mb-primary text-white shadow-sm'
                      : 'bg-white text-mb-ink border border-gray-200 hover:border-gray-300 hover:bg-gray-50'
                  }`}
                >
                  {card.label}
                </button>
              )
            })}

            {hasActiveFilters ? (
              <button
                type="button"
                onClick={handleClearFilters}
                className="ml-auto text-sm font-semibold text-gray-600 underline-offset-4 hover:text-gray-900 hover:underline"
              >
                Limpiar filtros
              </button>
            ) : null}
          </div>

          {hasActiveFilters ? (
            <div className="mt-3 flex flex-wrap items-center gap-2">
              {activeFilterChips.map((chip) => (
                <button
                  key={chip.key}
                  type="button"
                  onClick={chip.onRemove}
                  className="inline-flex items-center gap-2 rounded-full border border-gray-200 bg-white px-3 py-1.5 text-xs font-medium text-gray-700 hover:border-gray-300"
                >
                  <span>{chip.label}</span>
                  <svg
                    xmlns="http://www.w3.org/2000/svg"
                    viewBox="0 0 24 24"
                    className="h-3.5 w-3.5"
                    fill="none"
                    stroke="currentColor"
                    strokeWidth={2}
                  >
                    <path strokeLinecap="round" strokeLinejoin="round" d="M6 18 18 6m0 12L6 6" />
                  </svg>
                </button>
              ))}
            </div>
          ) : null}
        </Container>

        <Container className="pb-12">
          {loading ? (
            <div className="rounded-2xl border border-gray-200 bg-white p-6 text-center text-gray-600">Cargando tiendas…</div>
          ) : filteredStores.length ? (
            <div className="grid grid-cols-1 gap-6 md:grid-cols-2 lg:grid-cols-3">
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
                    className="group overflow-hidden rounded-2xl border border-gray-100 bg-white shadow-sm transition-all hover:-translate-y-0.5 hover:shadow-xl"
                    aria-label={`Ver tienda ${storeName}`}
                  >
                    <div className="relative z-0 h-32 overflow-hidden">
                      {banner ? (
                        <img src={banner} alt="" className="h-full w-full object-cover" loading="lazy" decoding="async" />
                      ) : (
                        <div className="h-full w-full bg-gradient-to-r from-gray-800 to-gray-900" aria-hidden="true" />
                      )}
                    </div>

                    <div className="px-6 pb-6">
                      <div className="relative z-10 -mt-10 flex justify-center">
                        <img
                          src={avatar}
                          alt={storeName}
                          className="h-20 w-20 rounded-full object-cover ring-4 ring-white shadow-sm"
                          loading="lazy"
                          decoding="async"
                        />
                      </div>

                      <div className="mt-4 text-center">
                        <div className="text-lg font-bold text-mb-ink">{storeName}</div>
                        <div className="mt-2 flex flex-col items-center gap-1 text-sm text-gray-600">
                          <div className="flex items-center gap-2">
                            <MapPin className="h-4 w-4 text-gray-400" aria-hidden="true" />
                            <span className="truncate">{location}</span>
                          </div>
                          <div className="flex items-center gap-2">
                            <Package className="h-4 w-4 text-gray-400" aria-hidden="true" />
                            <span>{productCount} productos publicados</span>
                          </div>
                        </div>
                      </div>

                      <div className="mt-5">
                        <span className="inline-flex w-full items-center justify-center rounded-xl border border-gray-200 bg-white px-4 py-2.5 text-sm font-semibold text-mb-ink transition group-hover:border-gray-300 group-hover:bg-gray-50">
                          Ver tienda
                        </span>
                      </div>
                    </div>
                  </Link>
                )
              })}
            </div>
          ) : (
            <div className="rounded-2xl border border-gray-200 bg-white p-6 text-center text-gray-600">
              {stores.length === 0 ? 'No hay tiendas publicadas aún.' : 'No encontramos tiendas con esos filtros.'}
            </div>
          )}

          <div className="mt-10 rounded-2xl border border-gray-200 bg-white p-6">
            <div className="flex flex-col gap-4 md:flex-row md:items-center md:justify-between">
              <div>
                <h2 className="text-lg font-bold text-mb-ink">¿Querés abrir una tienda en Ciclo Market?</h2>
                <p className="mt-1 text-sm text-gray-600">
                  Mostrá tu catálogo, sumá contacto directo y beneficios de difusión. Coordinemos la verificación.
                </p>
              </div>
              <div className="flex flex-wrap gap-3">
                <a
                  href="mailto:admin@ciclomarket.ar"
                  className="inline-flex items-center justify-center rounded-xl border border-gray-200 bg-white px-4 py-2 text-sm font-semibold text-mb-ink hover:bg-gray-50"
                >
                  admin@ciclomarket.ar
                </a>
                <Link
                  to="/dashboard"
                  className="inline-flex items-center justify-center rounded-xl border border-gray-200 bg-white px-4 py-2 text-sm font-semibold text-mb-ink hover:bg-gray-50"
                >
                  Ir al panel
                </Link>
                <Link
                  to="/publicar"
                  className="inline-flex items-center justify-center rounded-xl bg-mb-primary px-4 py-2 text-sm font-semibold text-white hover:bg-mb-primary/90"
                >
                  Ver planes
                </Link>
              </div>
            </div>
          </div>
        </Container>
      </div>
    </>
  )
}
