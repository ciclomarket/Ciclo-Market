import { useEffect, useMemo, useRef, useState } from 'react'
import { useSearchParams, Link } from 'react-router-dom'
import Container from '../components/Container'
import ListingCard from '../components/ListingCard'
import EmptyState from '../components/EmptyState'
import SkeletonCard from '../components/SkeletonCard'
import { mockListings } from '../mock/mockData'
import { fetchListings } from '../services/listings'
import { supabaseEnabled } from '../services/supabase'
import type { Listing } from '../types'
import { hasPaidPlan } from '../utils/plans'

type Cat = 'Todos' | 'Ruta' | 'MTB' | 'Gravel' | 'Urbana' | 'Accesorios' | 'Indumentaria' | 'E-Bike' | 'Niños' | 'Pista' | 'Triatlón'
type FiltersState = {
  cat?: Cat
  brand?: string
  deal?: '1'
}

const CAT_VALUES: Cat[] = ['Todos','Ruta','MTB','Gravel','Urbana','Accesorios','Indumentaria','E-Bike','Niños','Pista','Triatlón']

const FILTER_PARAM_KEYS: Array<keyof FiltersState> = ['cat','brand','deal']

function paramsToFilters(params: URLSearchParams): FiltersState {
  const catParam = params.get('cat') as Cat | null
  const cat: Cat = catParam && CAT_VALUES.includes(catParam) ? catParam : 'Todos'

  const filters: FiltersState = { cat }

  const brand = params.get('brand')
  if (brand) filters.brand = brand

  const deal = params.get('deal')
  if (deal === '1' || deal === 'true') filters.deal = '1'

  return filters
}

function filtersToSearchParams(current: URLSearchParams, filters: FiltersState) {
  const params = new URLSearchParams(current.toString())

  FILTER_PARAM_KEYS.forEach((key) => params.delete(key))

  if (filters.cat && filters.cat !== 'Todos') params.set('cat', filters.cat)
  else params.delete('cat')

  if (filters.brand) params.set('brand', filters.brand)
  else params.delete('brand')

  if (filters.deal) params.set('deal', filters.deal)
  else params.delete('deal')

  return params
}

/* ------------------------ UI helpers ------------------------ */
/* ------------------------ Page ------------------------ */
export default function Marketplace() {
  const [searchParams, setSearchParams] = useSearchParams()
  const paramsKey = searchParams.toString()
  const filters = useMemo(() => paramsToFilters(searchParams), [paramsKey])

  const [count, setCount] = useState(40)
  const sentinelRef = useRef<HTMLDivElement | null>(null)
  const [sortMode, setSortMode] = useState<'relevance' | 'asc' | 'desc'>('relevance')
  const [listings, setListings] = useState<Listing[]>([])
  const [loading, setLoading] = useState(true)

  useEffect(() => {
    let active = true
    const load = async () => {
      setLoading(true)
      if (supabaseEnabled) {
        const data = await fetchListings()
        if (!active) return
        setListings(data)
        setLoading(false)
        return
      }
      if (!active) return
      setListings(mockListings)
      setLoading(false)
    }
    load()
    return () => {
      active = false
    }
  }, [])

  const setFilters = (next: FiltersState) => {
    const nextParams = filtersToSearchParams(searchParams, next)
    setSearchParams(nextParams)
  }

  // Aplicar filtros
  const filtered = useMemo(() => {
    const filteredList = listings.filter((l) => {
      if (filters.cat && filters.cat !== 'Todos' && l.category !== filters.cat) return false
      if (filters.brand && l.brand.toLowerCase() !== filters.brand.toLowerCase()) return false
      if (filters.deal) {
        const hasDeal = typeof l.originalPrice === 'number' && l.originalPrice > l.price
        if (!hasDeal) return false
      }
      return true
    })

    const sorted = [...filteredList]

    if (sortMode === 'relevance') {
      return sorted.sort((a, b) => {
        const bFeatured = hasPaidPlan(b.sellerPlan ?? (b.plan as any), b.sellerPlanExpires) ? 1 : 0
        const aFeatured = hasPaidPlan(a.sellerPlan ?? (a.plan as any), a.sellerPlanExpires) ? 1 : 0
        if (bFeatured !== aFeatured) return bFeatured - aFeatured
        const bExpires = b.sellerPlanExpires ?? 0
        const aExpires = a.sellerPlanExpires ?? 0
        if (bExpires !== aExpires) return bExpires - aExpires
        return (b.createdAt ?? 0) - (a.createdAt ?? 0)
      })
    }

    return sorted.sort((a, b) => (sortMode === 'asc' ? a.price - b.price : b.price - a.price))
  }, [listings, filters, sortMode])

  const visible = filtered.slice(0, count)

  // Reset de paginación al cambiar filtros
  useEffect(() => { setCount(40) }, [paramsKey])

  // IntersectionObserver para carga infinita
  useEffect(() => {
    if (!sentinelRef.current) return
    const el = sentinelRef.current
    const io = new IntersectionObserver(entries => {
      const entry = entries[0]
      if (entry.isIntersecting) {
        setCount(c => (c + 40 <= filtered.length ? c + 40 : filtered.length))
      }
    }, { rootMargin: '600px 0px' })
    io.observe(el)
    return () => io.disconnect()
  }, [filtered.length])

  const handleCategory = (cat: Cat) => {
    setFilters({ ...filters, cat })
  }

  const handleClearFilters = () => {
    setFilters({ cat: 'Todos' })
  }

  const hasActiveFilters = filters.cat !== 'Todos' || !!filters.brand || !!filters.deal

  return (
    <>
      <section className="relative overflow-hidden text-white">
        <img
          src="/hero-market.jpg"
          alt="Ciclista de montaña"
          className="absolute inset-0 h-full w-full object-cover"
        />
        <div className="absolute inset-0 bg-[#0b131c]/85" />
        <div className="absolute inset-0 bg-[radial-gradient(900px_520px_at_15%_10%,rgba(255,255,255,0.18),transparent_70%)] opacity-80" />
        <div className="absolute inset-0 bg-[radial-gradient(980px_540px_at_120%_0%,rgba(20,33,46,0.26),transparent_78%)] opacity-80" />
        <div className="relative">
          <Container>
            <div className="grid items-center gap-12 py-16 lg:grid-cols-[3fr,2fr] lg:py-20">
              <div className="space-y-6">
                <span className="inline-flex items-center gap-2 rounded-full border border-white/20 bg-white/10 px-3 py-1 text-xs uppercase tracking-[0.4em] text-white/70">
                  Marketplace vivo
                </span>
                <h1 className="text-3xl font-extrabold leading-tight md:text-4xl">
                  Las bicicletas se reinventan, y vos también.
                </h1>
                <p className="max-w-2xl text-lg text-white/85">
                  Vendé tu bici, sumá a alguien más a la ruta y aprovechá ese valor para ir por tu próximo sueño. Acá encontrás modelos inspeccionados, soporte en logística y pagos asegurados para que el cambio sea fácil.
                </p>
                <div className="flex flex-wrap gap-3">
                  <Link
                    to="/publicar"
                    className="btn bg-white text-[#14212e] shadow-lg ring-white/30 hover:bg-white/90"
                  >
                    Publicar mi bicicleta
                  </Link>
                  <a
                    href="#listings"
                    className="btn border border-white/30 bg-transparent text-white hover:bg-white/10"
                  >
                    Ver bicicletas disponibles
                  </a>
                </div>
              </div>
            </div>
          </Container>
        </div>
      </section>

      <div id="listings" className="bg-[#14212e] text-white">
        <Container className="text-white">
          <div className="py-10">
            <div className="flex flex-col gap-6 lg:flex-row lg:items-center lg:justify-between">
              <div>
                <h2 className="text-xl font-bold text-white">Explorá el marketplace</h2>
                <p className="text-sm text-white/70">{filtered.length} avisos conectando historias nuevas.</p>
              </div>
              <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:gap-4">
                <div className="flex flex-wrap gap-2">
                  {['Todos','Ruta','MTB','Gravel','Urbana','Accesorios','Indumentaria','E-Bike','Niños','Pista','Triatlón'].map((cat) => (
                    <button
                      key={cat}
                      onClick={() => handleCategory(cat as Cat)}
                      className={`inline-flex items-center rounded-full border px-3 py-1 text-xs font-medium transition ${
                        filters.cat === cat
                          ? 'border-white bg-white text-[#14212e] shadow-sm'
                          : 'border-white/30 bg-white/10 text-white/75 hover:bg-white/20'
                      }`}
                    >
                      {cat}
                    </button>
                  ))}
                </div>
                <div className="flex items-center gap-2">
                  <span className="text-sm text-white/70">Ordenar</span>
                  <select
                    value={sortMode}
                    onChange={(e) => setSortMode(e.target.value as 'relevance' | 'asc' | 'desc')}
                    className="input w-auto bg-white/90 text-[#14212e]"
                  >
                    <option value="relevance">Relevancia</option>
                    <option value="desc">Precio: mayor a menor</option>
                    <option value="asc">Precio: menor a mayor</option>
                  </select>
                </div>
              </div>
            </div>

            <div className="mt-6 text-sm text-white/60">{filtered.length} resultados</div>

            {hasActiveFilters && (
              <div className="mt-3 flex flex-wrap items-center gap-3 text-sm text-white">
                {filters.brand && (
                  <span className="inline-flex items-center rounded-full border border-white/30 bg-white/15 px-3 py-1 text-white">
                    Marca: {filters.brand}
                  </span>
                )}
                {filters.deal && (
                  <span className="inline-flex items-center rounded-full border border-white/30 bg-white/15 px-3 py-1 text-white">
                    Ofertas activas
                  </span>
                )}
                {filters.cat && filters.cat !== 'Todos' && (
                  <span className="inline-flex items-center rounded-full border border-white/30 bg-white/15 px-3 py-1 text-white">
                    Categoría: {filters.cat}
                  </span>
                )}
                <button
                  type="button"
                  onClick={handleClearFilters}
                  className="rounded-full border border-white/30 px-3 py-1 text-sm text-white transition hover:bg-white/20"
                >
                  Limpiar filtros
                </button>
              </div>
            )}

            {loading ? (
              <div className="mt-6 grid gap-5 sm:grid-cols-2 xl:grid-cols-3">
                {Array.from({ length: 6 }).map((_, idx) => (
                  <SkeletonCard key={`skeleton-${idx}`} />
                ))}
              </div>
            ) : visible.length ? (
              <>
                <div className="mt-6 grid gap-5 sm:grid-cols-2 xl:grid-cols-3">
                  {visible.map((l) => (
                    <ListingCard key={l.id} l={l} />
                  ))}
                </div>
                <div ref={sentinelRef} className="h-12" />
                {visible.length < filtered.length && (
                  <div className="mt-4 flex justify-center">
                    <button
                      onClick={() => setCount((c) => Math.min(c + 40, filtered.length))}
                      className="btn bg-white text-[#14212e] hover:bg-white/90"
                    >
                      Cargar más
                    </button>
                  </div>
                )}
              </>
            ) : (
              <div className="mt-10">
                <EmptyState
                  title="No encontramos bicis en esta categoría"
                  subtitle="Probá con otra categoría o revisá más adelante."
                />
              </div>
            )}
          </div>
        </Container>
      </div>
    </>
  )
}
