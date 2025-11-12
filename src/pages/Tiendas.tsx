import { useCallback, useEffect, useMemo, useState } from 'react'
import { Link } from 'react-router-dom'
import Container from '../components/Container'
import StoresMap from '../components/StoresMap'
import GoogleStoresMap from '../components/GoogleStoresMap'
import SeoHead from '../components/SeoHead'
import { fetchStores, fetchStoreActivityCounts, type StoreSummary } from '../services/users'
import { fetchListings } from '../services/listings'
import { SUPABASE_RECOMMENDED_QUALITY, buildSupabaseSrc, buildSupabaseSrcSet, shouldTranscodeToWebp } from '../utils/supabaseImage'
import type { Category } from '../types'

type StoreCategoryFilter = 'Todos' | 'Accesorios' | 'Indumentaria'

type StoreCategoryMap = Record<string, Category[]>

type ProvinceCount = Record<string, number>

const STORE_CATEGORY_CARDS: Array<{ key: StoreCategoryFilter; label: string; description: string }> = [
  { key: 'Todos', label: 'Todas', description: 'Todo el catálogo disponible' },
  { key: 'Accesorios', label: 'Accesorios', description: 'Componentes, upgrades y servicios' },
  { key: 'Indumentaria', label: 'Indumentaria', description: 'Ropa técnica y casual' }
]

const normalizeText = (value: string) =>
  value
    .normalize('NFD')
    .replace(/[^a-zA-Z0-9\s]/g, '')
    .trim()
    .toLowerCase()

function buildLocationLabel(store: StoreSummary): string {
  const address = (store as any).store_address as string | null
  const location = [store.city, store.province].filter(Boolean).join(', ')
  if (address && location) return `${address} · ${location}`
  if (address) return address
  if (location) return location
  return 'Ubicación no declarada'
}

export default function Tiendas() {
  const [stores, setStores] = useState<StoreSummary[]>([])
  const [loading, setLoading] = useState(true)
  const [query, setQuery] = useState('')
  const [sortMode, setSortMode] = useState<'active' | 'alpha'>('active')
  const [activity, setActivity] = useState<Record<string, number>>({})
  const [categoryFilter, setCategoryFilter] = useState<StoreCategoryFilter>('Todos')
  const [selectedProvinces, setSelectedProvinces] = useState<string[]>([])
  const [storeCategories, setStoreCategories] = useState<StoreCategoryMap>({})
  const [activeStoreId, setActiveStoreId] = useState<string | null>(null)
  const [mobileFiltersOpen, setMobileFiltersOpen] = useState(false)

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
      } catch { void 0 }
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
      } catch { void 0 }
      if (active) setLoading(false)
    }
    void load()
    return () => { active = false }
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

  const provinceCounts = useMemo<ProvinceCount>(() => {
    const counts: ProvinceCount = {}
    for (const store of queryFilteredStores) {
      const key = store.province || 'Sin provincia'
      counts[key] = (counts[key] || 0) + 1
    }
    return counts
  }, [queryFilteredStores])

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

  useEffect(() => {
    if (activeStoreId && filteredStores.some((store) => store.id === activeStoreId)) return
    setActiveStoreId(filteredStores[0]?.id ?? null)
  }, [filteredStores, activeStoreId])

  const mapStores = useMemo(() => filteredStores.map((store) => ({
    id: store.id,
    name: store.store_name || store.store_slug,
    slug: store.store_slug,
    avatarUrl: store.store_avatar_url,
    address: (store as any).store_address ?? null,
    city: store.city,
    province: store.province,
    lat: typeof (store as any).store_lat === 'number' ? (store as any).store_lat : null,
    lon: typeof (store as any).store_lon === 'number' ? (store as any).store_lon : null,
    phone: (store as any).store_phone ?? null,
    website: (store as any).store_website ?? null,
  })), [filteredStores])

  const activeFilterChips: Array<{ key: string; label: string; onRemove: () => void }> = []
  if (categoryFilter !== 'Todos') {
    activeFilterChips.push({ key: 'category', label: `Categoría: ${categoryFilter}`, onRemove: () => setCategoryFilter('Todos') })
  }
  for (const province of selectedProvinces) {
    activeFilterChips.push({
      key: `province-${province}`,
      label: `Provincia: ${province}`,
      onRemove: () => toggleProvince(province)
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
        description="Locales verificados con catálogo activo, contacto directo y métricas para seguir ventas. Encontrá tiendas por provincia y descubrí sus bicicletas destacadas."
        canonicalPath="/tiendas"
      />
      <section className="relative overflow-hidden text-white">
        <img
          src="/hero-tiendas.webp"
          alt="Tiendas oficiales"
          className="absolute inset-0 h-full w-full object-cover md:object-[50%_30%]"
        />
        <div className="absolute inset-0 bg-[#0b131c]/80" />
        <div className="relative">
          <Container>
            <div className="mx-auto max-w-3xl py-10 text-center">
              <h1 className="text-3xl font-extrabold tracking-tight sm:text-4xl">Tiendas oficiales</h1>
              <p className="mt-3 text-white/80">Locales y equipos con presencia verificada dentro de Ciclo Market. Ingresá para ver su catálogo y datos de contacto.</p>
            </div>
          </Container>
        </div>
      </section>
      <section className="relative isolate overflow-hidden bg-gradient-to-b from-[#0f1729] via-[#101b2d] to-[#0f1729] text-white overflow-x-hidden">
        <div className="pointer-events-none absolute inset-0 -z-10 opacity-60">
          <div className="absolute -top-16 -left-16 h-64 w-64 rounded-full bg-[radial-gradient(circle,_rgba(37,99,235,0.25),_transparent_60%)] blur-2xl" />
          <div className="absolute -bottom-16 -right-10 h-64 w-64 rounded-full bg-[radial-gradient(circle,_rgba(14,165,233,0.20),_transparent_60%)] blur-2xl" />
        </div>
        <Container>
          <div className="py-10 space-y-8">
            {/* Cajas de categorías removidas */}

            {loading ? (
              <div className="rounded-3xl border border-white/10 bg-white/5 p-6 text-center text-white/80">Cargando tiendas…</div>
            ) : (
              <div className="grid gap-6 lg:grid-cols-[360px_1fr]">
                {/* Mapa primero en mobile */}
                <div className="order-1 h-80 min-w-0 rounded-3xl border border-white/10 bg-white/5 p-3 sm:h-[420px] lg:order-2 lg:h-[calc(100vh-260px)]">
                  <div className="h-full w-full overflow-hidden rounded-2xl">
                    {(import.meta as any).env?.VITE_GOOGLE_MAPS_KEY
                      ? <GoogleStoresMap stores={mapStores as any} focusStoreId={activeStoreId} />
                      : <StoresMap stores={mapStores} focusStoreId={activeStoreId} onStoreClick={(id) => setActiveStoreId(id)} />}
                  </div>
                </div>
                {/* Panel de búsqueda/lista segundo en mobile */}
                <aside className="order-2 flex min-h-0 min-w-0 flex-col gap-4 rounded-3xl border border-white/10 bg-white/5 p-4 lg:order-1 lg:h-[calc(100vh-260px)] lg:pr-6">
                  <div className="flex flex-col gap-3">
                    <div className="flex gap-2">
                      <input
                        type="search"
                        value={query}
                        onChange={(event) => setQuery(event.target.value)}
                        placeholder="Buscar por nombre o ciudad"
                        className="input w-full bg-white text-[#14212e]"
                      />
                      <button
                        type="button"
                        onClick={() => setMobileFiltersOpen(true)}
                        className="rounded-xl border border-white/10 bg-white/10 px-3 text-xs font-semibold uppercase tracking-wide text-white lg:hidden"
                      >
                        Filtros
                      </button>
                    </div>
                    <div className="flex flex-col gap-2 sm:flex-row sm:items-center sm:justify-between">
                      <span className="text-xs text-white/70">{filteredStores.length} tiendas verificadas</span>
                      <select
                        value={sortMode}
                        onChange={(event) => setSortMode(event.target.value as 'active' | 'alpha')}
                        className="input w-full sm:w-auto bg-white text-sm text-[#14212e]"
                      >
                        <option value="active">Más activas</option>
                        <option value="alpha">Alfabético</option>
                      </select>
                    </div>
                  </div>

                  {hasActiveFilters ? (
                    <div className="flex flex-wrap items-center gap-2">
                      {activeFilterChips.map((chip) => (
                        <button
                          key={chip.key}
                          type="button"
                          onClick={chip.onRemove}
                          className="inline-flex items-center gap-2 rounded-full border border-white/15 bg-white/10 px-3 py-1 text-xs text-white transition hover:border-white/40 hover:bg-white/20"
                        >
                          <span>{chip.label}</span>
                          <svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24" className="h-3.5 w-3.5" fill="none" stroke="currentColor" strokeWidth={2}>
                            <path strokeLinecap="round" strokeLinejoin="round" d="M6 18 18 6m0 12L6 6" />
                          </svg>
                        </button>
                      ))}
                      <button
                        type="button"
                        onClick={handleClearFilters}
                        className="text-xs text-white/70 underline-offset-2 hover:text-white hover:underline"
                      >
                        Limpiar todo
                      </button>
                    </div>
                  ) : null}

                  <div className="hidden lg:block">
                    <div className="flex items-center justify-between text-xs font-semibold uppercase tracking-wide text-white/60">
                      <span>Provincias</span>
                      <button
                        type="button"
                        onClick={() => setSelectedProvinces([])}
                        className="text-[11px] font-normal text-white/60 hover:text-white"
                      >
                        Ver todas
                      </button>
                    </div>
                    <ul className="mt-2 max-h-56 space-y-2 overflow-y-auto pr-1 text-sm">
                      {provinceOptions.map((province) => {
                        const normalized = normalizeText(province)
                        const active = selectedProvinces.some((value) => normalizeText(value) === normalized)
                        const count = provinceCounts[province] ?? 0
                        return (
                          <li key={province}>
                            <button
                              type="button"
                              onClick={() => toggleProvince(province)}
                              className={`flex w-full items-center justify-between rounded-xl px-3 py-2 transition ${
                                active ? 'bg-white/15 text-white' : 'bg-white/5 text-white/75 hover:bg-white/10'
                              }`}
                            >
                              <span className="truncate">{province}</span>
                              <span className="text-xs text-white/60">{count}</span>
                            </button>
                          </li>
                        )
                      })}
                    </ul>
                  </div>

                  <div className="max-h-[28rem] overflow-y-auto pr-1 sm:max-h-none sm:flex-1">
                    {filteredStores.length ? (
                      <ul className="space-y-3">
                        {filteredStores.map((store) => {
                          const isActive = activeStoreId === store.id
                          const locationLabel = buildLocationLabel(store)
                          const productCount = activity[store.id] || 0
                          return (
                            <li
                              key={store.id}
                              onMouseEnter={() => setActiveStoreId(store.id)}
                              onFocus={() => setActiveStoreId(store.id)}
                              className={`rounded-2xl border px-4 py-3 transition ${
                                isActive ? 'border-white bg-white/10 shadow-lg' : 'border-white/10 bg-white/5 hover:border-white/30'
                              }`}
                            >
                              <div className="flex gap-3">
                                <div className="h-14 w-14 flex-shrink-0 overflow-hidden rounded-xl border border-white/15 bg-white/10">
                                  {store.store_avatar_url ? (
                                    <picture>
                                      {shouldTranscodeToWebp(store.store_avatar_url) ? (
                                        <source
                                          type="image/webp"
                                          srcSet={buildSupabaseSrcSet(store.store_avatar_url, [120, 160, 200], {
                                            format: 'webp',
                                            quality: SUPABASE_RECOMMENDED_QUALITY,
                                          })}
                                          sizes="56px"
                                        />
                                      ) : null}
                                      <img
                                        src={buildSupabaseSrc(store.store_avatar_url, 160)}
                                        srcSet={buildSupabaseSrcSet(store.store_avatar_url, [120, 160, 200])}
                                        sizes="56px"
                                        alt={store.store_name || store.store_slug}
                                        className="h-full w-full object-cover"
                                        loading="lazy"
                                        decoding="async"
                                      />
                                    </picture>
                                  ) : (
                                    <div className="flex h-full w-full items-center justify-center text-sm font-semibold text-white/70">
                                      {(store.store_name || store.store_slug || '?').trim().charAt(0).toUpperCase()}
                                    </div>
                                  )}
                                </div>
                                <div className="min-w-0">
                                  <div className="flex items-start justify-between gap-2">
                                    <h3 className="truncate text-sm font-semibold text-white">{store.store_name || store.store_slug}</h3>
                                    {productCount ? (
                                      <span className="rounded-full bg-white/10 px-2 py-0.5 text-[11px] text-white/70">{productCount} prod.</span>
                                    ) : null}
                                  </div>
                                  <p className="mt-1 truncate text-xs text-white/60">{locationLabel}</p>
                                </div>
                              </div>
                              <div className="mt-3 flex flex-wrap gap-2">
                                <button
                                  type="button"
                                  onClick={() => setActiveStoreId(store.id)}
                                  className="rounded-full border border-white/20 px-3 py-1 text-xs text-white hover:border-white/40 hover:bg-white/10"
                                >
                                  Ver en mapa
                                </button>
                                <Link
                                  to={`/tienda/${encodeURIComponent(store.store_slug)}`}
                                  className="rounded-full bg-white px-3 py-1 text-xs font-semibold text-[#14212e] hover:bg-white/90"
                                >
                                  Ver tienda
                                </Link>
                              </div>
                            </li>
                          )
                        })}
                      </ul>
                    ) : (
                      <div className="rounded-2xl border border-white/10 bg-white/5 p-4 text-sm text-white/70">
                        {stores.length === 0 ? 'No hay tiendas publicadas aún.' : 'No encontramos tiendas con esos filtros.'}
                      </div>
                    )}
                  </div>
                </aside>
              </div>
            )}

            <div className="rounded-xl border border-white/10 bg-white/5 p-5">
              <div className="flex flex-col gap-3 md:flex-row md:items-center md:justify-between">
                <div>
                  <h2 className="text-lg font-semibold">¿Querés abrir una tienda en Ciclo Market?</h2>
                  <p className="text-sm text-white/80">Mostrá tu catálogo, sumá contacto directo y beneficios de difusión. ¡Comunicáte con nosotros!</p>
                </div>
                <div className="flex flex-wrap gap-3">
                  <a href="mailto:admin@ciclomarket.ar" className="btn bg-white text-[#14212e]">admin@ciclomarket.ar</a>
                  <Link to="/dashboard" className="btn bg-white text-[#14212e]">Ir al panel</Link>
     
                  <Link to="/publicar" className="btn bg-[#0c72ff] text-white">Ver planes</Link>
                </div>
              </div>
            </div>
          </div>
        </Container>
      </section>

      {mobileFiltersOpen ? (
        <div
          className="fixed inset-0 z-50 bg-[#050c18]/80 backdrop-blur-sm lg:hidden"
          onClick={() => setMobileFiltersOpen(false)}
        >
          <div
            className="absolute inset-x-0 bottom-0 max-h-[90vh] rounded-t-3xl bg-[#0f1724] p-5 shadow-2xl"
            onClick={(event) => event.stopPropagation()}
          >
            <div className="flex items-center justify-between">
              <h3 className="text-base font-semibold text-white">Filtrar por provincia</h3>
              <button
                type="button"
                onClick={() => setMobileFiltersOpen(false)}
                className="rounded-full border border-white/20 px-3 py-1 text-xs text-white"
              >
                Cerrar
              </button>
            </div>
            <div className="mt-4 space-y-2 text-sm">
              <button
                type="button"
                onClick={() => {
                  setSelectedProvinces([])
                  setMobileFiltersOpen(false)
                }}
                className="w-full rounded-xl border border-white/15 bg-white/10 px-3 py-2 text-left font-medium text-white hover:border-white/30 hover:bg-white/15"
              >
                Ver todas ({queryFilteredStores.length})
              </button>
              {provinceOptions.map((province) => {
                const normalized = normalizeText(province)
                const active = selectedProvinces.some((value) => normalizeText(value) === normalized)
                const count = provinceCounts[province] ?? 0
                return (
                  <button
                    key={`mobile-${province}`}
                    type="button"
                    onClick={() => toggleProvince(province)}
                    className={`flex w-full items-center justify-between rounded-xl px-3 py-2 transition ${
                      active ? 'bg-white/15 text-white' : 'bg-white/5 text-white/75 hover:bg-white/10'
                    }`}
                  >
                    <span className="truncate">{province}</span>
                    <span className="text-xs text-white/60">{count}</span>
                  </button>
                )
              })}
            </div>
          </div>
        </div>
      ) : null}
    </>
  )
}
