import { useCallback, useEffect, useMemo, useRef, useState } from 'react'
import { useSearchParams, Link } from 'react-router-dom'
import Container from '../components/Container'
import ListingCard from '../components/ListingCard'
import { transformSupabasePublicUrl } from '../utils/supabaseImage'
import { fetchStoresMeta } from '../services/users'
import EmptyState from '../components/EmptyState'
import SkeletonCard from '../components/SkeletonCard'
import { mockListings } from '../mock/mockData'
import { fetchListings } from '../services/listings'
import { supabaseEnabled } from '../services/supabase'
import type { Listing } from '../types'
import { hasPaidPlan } from '../utils/plans'
import FilterDropdown from '../components/FilterDropdown'

type Cat = 'Todos' | 'Ruta' | 'MTB' | 'Gravel' | 'Urbana' | 'Fixie' | 'Accesorios' | 'Indumentaria' | 'E-Bike' | 'Niños' | 'Pista' | 'Triatlón'
type MultiFilterKey = 'brand' | 'material' | 'frameSize' | 'wheelSize' | 'drivetrain' | 'condition' | 'brake' | 'year' | 'size'
type FiltersState = {
  cat: Cat
  brand: string[]
  material: string[]
  frameSize: string[]
  wheelSize: string[]
  drivetrain: string[]
  condition: string[]
  brake: string[]
  year: string[]
  size: string[]
  priceMin?: number
  priceMax?: number
  deal?: '1'
  q?: string
  /** Subcategoría/tipo dentro de la categoría (p.ej. Accesorios → Ruedas y cubiertas) */
  subcat?: string
}

const CAT_VALUES: Cat[] = ['Todos','Ruta','MTB','Gravel','Urbana','Fixie','Accesorios','Indumentaria','E-Bike','Niños','Pista','Triatlón']
const MULTI_PARAM_KEYS: MultiFilterKey[] = ['brand','material','frameSize','wheelSize','drivetrain','condition','brake','year','size']
const MULTI_FILTER_ORDER: MultiFilterKey[] = ['brand','material','frameSize','wheelSize','drivetrain','condition','brake','year','size']
const MULTI_FILTER_LABELS: Record<MultiFilterKey, string> = {
  brand: 'Marca',
  material: 'Material',
  frameSize: 'Tamaño cuadro',
  wheelSize: 'Rodado',
  drivetrain: 'Grupo transmisión',
  condition: 'Condición',
  brake: 'Freno',
  year: 'Año',
  size: 'Talle'
}
const CATEGORY_CARDS: Array<{ cat: Cat; label: string; description: string; image: string; imageMobile: string }> = [
  {
    cat: 'Todos',
    label: 'Todas',
    description: 'Todo el catálogo disponible',
    image: '/design/Banners/1.png',
    imageMobile: '/design/Banners-Mobile/1.png'
  },
  {
    cat: 'Accesorios',
    label: 'Accesorios',
    description: 'Componentes y upgrades',
    image: '/design/Banners/2.png',
    imageMobile: '/design/Banners-Mobile/2.png'
  },
  {
    cat: 'Indumentaria',
    label: 'Indumentaria',
    description: 'Ropa técnica y casual',
    image: '/design/Banners/3.png',
    imageMobile: '/design/Banners-Mobile/3.png'
  }
]

const normalizeText = (value: string) => value
  ? value
      .normalize('NFD')
      .replace(/[\u0300-\u036f]/g, '')
      .trim()
      .toLowerCase()
  : ''

const uniqueInsensitive = (values: string[]) => {
  const seen = new Set<string>()
  const output: string[] = []
  for (const value of values) {
    const normalized = normalizeText(value)
    if (!normalized || seen.has(normalized)) continue
    seen.add(normalized)
    output.push(value.trim())
  }
  return output
}

const parseNumericParam = (value: string | null) => {
  if (!value) return undefined
  const parsed = Number(value)
  if (!Number.isFinite(parsed) || parsed <= 0) return undefined
  return Math.round(parsed)
}

function paramsToFilters(params: URLSearchParams): FiltersState {
  const catParam = params.get('cat') as Cat | null
  const cat: Cat = catParam && CAT_VALUES.includes(catParam) ? catParam : 'Todos'

  const base: FiltersState = {
    cat,
    brand: [],
    material: [],
    frameSize: [],
    wheelSize: [],
    drivetrain: [],
    condition: [],
    brake: [],
    year: [],
    size: []
  }

  for (const key of MULTI_PARAM_KEYS) {
    const values = params.getAll(key).filter(Boolean)
    if (values.length) base[key] = uniqueInsensitive(values)
  }

  const deal = params.get('deal')
  if (deal === '1' || deal === 'true') base.deal = '1'

  const q = params.get('q')
  if (q) base.q = q

  const subcat = params.get('subcat')
  if (subcat) base.subcat = subcat

  base.priceMin = parseNumericParam(params.get('price_min'))
  base.priceMax = parseNumericParam(params.get('price_max'))

  return base
}

function filtersToSearchParams(current: URLSearchParams, filters: FiltersState) {
  const params = new URLSearchParams(current.toString())

  params.delete('cat')
  if (filters.cat && filters.cat !== 'Todos') params.set('cat', filters.cat)

  params.delete('deal')
  if (filters.deal) params.set('deal', filters.deal)

  params.delete('q')
  if (filters.q) params.set('q', filters.q)

  params.delete('subcat')
  if (filters.subcat) params.set('subcat', filters.subcat)

  for (const key of MULTI_PARAM_KEYS) {
    params.delete(key)
    const values = filters[key]
    if (values && values.length) {
      for (const value of values) params.append(key, value)
    }
  }

  if (typeof filters.priceMin === 'number') params.set('price_min', String(Math.round(filters.priceMin)))
  else params.delete('price_min')

  if (typeof filters.priceMax === 'number') params.set('price_max', String(Math.round(filters.priceMax)))
  else params.delete('price_max')

  return params
}

type ListingMetadata = {
  condition?: string
  brake?: string
  apparelSize?: string
  accessoryType?: string
}

type ListingFacetsResult = {
  options: Record<MultiFilterKey, string[]>
  priceRange: { min: number; max: number }
  metadata: Record<string, ListingMetadata>
}

const APPAREL_SIZE_ORDER = ['XXS','XS','S','M','L','XL','XXL','XXXL','4XL','5XL']

const sortAlpha = (values: Iterable<string>) =>
  Array.from(values).sort((a, b) => a.localeCompare(b, 'es', { sensitivity: 'base' }))

const sortYearDesc = (values: Iterable<string>) =>
  Array.from(values).sort((a, b) => Number(b) - Number(a))

const sortSizes = (values: Iterable<string>) => {
  const normalizedOrder = APPAREL_SIZE_ORDER.map((v) => normalizeText(v))
  return Array.from(values).sort((a, b) => {
    const normA = normalizeText(a)
    const normB = normalizeText(b)
    const idxA = normalizedOrder.indexOf(normA)
    const idxB = normalizedOrder.indexOf(normB)
    if (idxA !== -1 || idxB !== -1) {
      if (idxA === -1) return 1
      if (idxB === -1) return -1
      return idxA - idxB
    }
    return a.localeCompare(b, 'es', { sensitivity: 'base' })
  })
}

const extractExtrasMap = (extras?: string | null) => {
  const map: Record<string, string> = {}
  if (!extras) return map
  extras
    .split('•')
    .map((part) => part.trim())
    .filter(Boolean)
    .forEach((part) => {
      const [rawKey, ...rest] = part.split(':')
      if (!rawKey || rest.length === 0) return
      const key = normalizeText(rawKey)
      const value = rest.join(':').trim()
      if (!value) return
      map[key] = value
    })
  return map
}

const extractCondition = (listing: Listing) => {
  const extrasMap = extractExtrasMap(listing.extras)
  if (extrasMap.condicion) return extrasMap.condicion
  const description = listing.description ?? ''
  const match = description.match(/condici[oó]n:\s*([^\n•]+)/i)
  if (match && match[1]) return match[1].trim()
  return undefined
}

const extractApparelSize = (listing: Listing) => {
  if (listing.category !== 'Indumentaria') return undefined
  const extrasMap = extractExtrasMap(listing.extras)
  const value = extrasMap.talle ?? extrasMap.talles
  if (!value) return undefined
  const first = value.split(',')[0]?.trim()
  return first || value
}

const cleanValue = (value?: string | null) => {
  if (!value) return undefined
  const trimmed = value.trim()
  return trimmed ? trimmed.replace(/\s+/g, ' ') : undefined
}

function computeListingFacets(listings: Listing[]): ListingFacetsResult {
  const sets: Record<MultiFilterKey, Set<string>> = {
    brand: new Set(),
    material: new Set(),
    frameSize: new Set(),
    wheelSize: new Set(),
    drivetrain: new Set(),
    condition: new Set(),
    brake: new Set(),
    year: new Set(),
    size: new Set()
  }
  const metadata: Record<string, ListingMetadata> = {}
  let minPrice = Number.POSITIVE_INFINITY
  let maxPrice = 0

  for (const listing of listings) {
    const brand = cleanValue(listing.brand)
    if (brand) sets.brand.add(brand)

    const material = cleanValue(listing.material)
    if (material) sets.material.add(material)

    const frameSize = cleanValue(listing.frameSize)
    if (frameSize) sets.frameSize.add(frameSize)
    // Incluir múltiples talles desde extras
    const extrasMap = extractExtrasMap(listing.extras)
    const multi = extrasMap.talles
    if (multi) {
      multi.split(',').map((s) => s.trim()).filter(Boolean).forEach((s) => sets.frameSize.add(s))
    }

    const wheelSize = cleanValue(listing.wheelSize)
    if (wheelSize) sets.wheelSize.add(wheelSize)

    const drivetrain = cleanValue(listing.drivetrain)
    if (drivetrain) sets.drivetrain.add(drivetrain)

    if (typeof listing.year === 'number' && listing.year > 1900) {
      sets.year.add(String(listing.year))
    }

    const condition = cleanValue(extractCondition(listing))
    if (condition) sets.condition.add(condition)

    const brake = cleanValue((() => {
      const extrasMap = extractExtrasMap(listing.extras)
      if (extrasMap['tipo de freno']) return extrasMap['tipo de freno']
      if (extrasMap.freno) return extrasMap.freno
      const description = listing.description ?? ''
      const match = description.match(/tipo de freno:\s*([^\n•]+)/i) || description.match(/freno:\s*([^\n•]+)/i)
      if (match && match[1]) return match[1].trim()
      return undefined
    })())
    if (brake) sets.brake.add(brake)

    const apparelSize = cleanValue(extractApparelSize(listing))
    if (apparelSize) sets.size.add(apparelSize)
    // Incluir todos los talles de indumentaria desde "Talles"
    const extrasForSizes = extractExtrasMap(listing.extras)
    const multiSizes = extrasForSizes.talles
    if (multiSizes) {
      multiSizes.split(',').map((s) => s.trim()).filter(Boolean).forEach((s) => sets.size.add(s))
    }

    // Derivar tipo de accesorio desde extras cuando aplique
    let accessoryType: string | undefined
    if ((listing.category as any) === 'Accesorios') {
      const extrasMap2 = extractExtrasMap(listing.extras)
      const typeValue = cleanValue(extrasMap2.tipo)
      if (typeValue) accessoryType = typeValue
    }

    metadata[listing.id] = {
      condition: condition || undefined,
      brake: brake || undefined,
      apparelSize: apparelSize || undefined,
      accessoryType
    }

    const price = Number(listing.price)
    if (Number.isFinite(price) && price > 0) {
      if (price < minPrice) minPrice = price
      if (price > maxPrice) maxPrice = price
    }
  }

  return {
    options: {
      brand: sortAlpha(sets.brand),
      material: sortAlpha(sets.material),
      frameSize: sortAlpha(sets.frameSize),
      wheelSize: sortAlpha(sets.wheelSize),
      drivetrain: sortAlpha(sets.drivetrain),
      condition: sortAlpha(sets.condition),
      brake: sortAlpha(sets.brake),
      year: sortYearDesc(sets.year),
      size: sortSizes(sets.size)
    },
    priceRange: {
      min: Number.isFinite(minPrice) ? Math.floor(minPrice) : 0,
      max: Number.isFinite(maxPrice) ? Math.ceil(maxPrice) : 0
    },
    metadata
  }
}

type MultiSelectContentProps = {
  options: string[]
  selected: string[]
  onChange: (next: string[]) => void
  close: () => void
  placeholder?: string
}

function MultiSelectContent({ options, selected, onChange, close, placeholder = 'Buscar' }: MultiSelectContentProps) {
  const [query, setQuery] = useState('')
  const selectedSet = useMemo(() => new Set(selected.map((value) => normalizeText(value))), [selected])
  const filtered = useMemo(() => {
    const q = normalizeText(query)
    if (!q) return options
    return options.filter((option) => normalizeText(option).includes(q))
  }, [options, query])

  const toggleOption = (value: string) => {
    const normalized = normalizeText(value)
    if (selectedSet.has(normalized)) {
      onChange(selected.filter((item) => normalizeText(item) !== normalized))
    } else {
      onChange([...selected, value])
    }
  }

  return (
    <div className="flex flex-col gap-3">
      {options.length > 6 ? (
        <input
          type="search"
          value={query}
          onChange={(event) => setQuery(event.target.value)}
          placeholder={placeholder}
          className="input h-10 w-full rounded-full border border-white/10 bg-[#0a101a] px-4 text-sm text-white placeholder:text-white/50 focus:outline-none focus:ring-2 focus:ring-white/40"
        />
      ) : null}
      <div className="max-h-56 overflow-y-auto pr-1">
        {filtered.length ? (
          <ul className="flex flex-col gap-2 text-sm">
            {filtered.map((option) => {
              const normalized = normalizeText(option)
              const checked = selectedSet.has(normalized)
              return (
                <li key={option}>
                  <label className="flex cursor-pointer items-center gap-2 rounded-lg px-2 py-1 hover:bg-white/10">
                    <input
                      type="checkbox"
                      checked={checked}
                      onChange={() => toggleOption(option)}
                      className="h-4 w-4 accent-white"
                    />
                    <span>{option}</span>
                  </label>
                </li>
              )
            })}
          </ul>
        ) : (
          <div className="py-4 text-sm text-white/60">Sin coincidencias.</div>
        )}
      </div>
      <div className="flex items-center justify-between pt-1 text-sm">
        <button
          type="button"
          onClick={() => {
            onChange([])
            close()
          }}
          className="text-white/70 hover:text-white"
        >
          Limpiar
        </button>
        <button type="button" onClick={close} className="rounded-full bg-white px-3 py-1 text-[#14212e] hover:bg-white/90">
          Listo
        </button>
      </div>
    </div>
  )
}

type PriceFilterContentProps = {
  min?: number
  max?: number
  bounds: { min: number; max: number }
  onApply: (range: { min?: number; max?: number }) => void
  onClear: () => void
  close: () => void
}

function PriceFilterContent({ min, max, bounds, onApply, onClear, close }: PriceFilterContentProps) {
  const [minValue, setMinValue] = useState(min ? String(min) : '')
  const [maxValue, setMaxValue] = useState(max ? String(max) : '')

  useEffect(() => {
    setMinValue(min ? String(min) : '')
  }, [min])

  useEffect(() => {
    setMaxValue(max ? String(max) : '')
  }, [max])

  const apply = () => {
    const parsedMin = minValue ? Number(minValue) : undefined
    const parsedMax = maxValue ? Number(maxValue) : undefined
    const safeMin = Number.isFinite(parsedMin) && parsedMin! > 0 ? Math.round(parsedMin!) : undefined
    const safeMax = Number.isFinite(parsedMax) && parsedMax! > 0 ? Math.round(parsedMax!) : undefined
    if (typeof safeMin === 'number' && typeof safeMax === 'number' && safeMin > safeMax) {
      alert('El precio mínimo no puede ser mayor que el máximo.')
      return
    }
    onApply({ min: safeMin, max: safeMax })
    close()
  }

  return (
    <div className="flex flex-col gap-3 text-sm">
      <div className="text-xs text-white/60">
        Rango disponible: {bounds.min ? `$${bounds.min.toLocaleString('es-AR')}` : '—'} –{' '}
        {bounds.max ? `$${bounds.max.toLocaleString('es-AR')}` : '—'}
      </div>
      <div className="grid grid-cols-2 gap-3">
        <label className="flex flex-col gap-1">
          <span className="text-xs text-white/60">Desde</span>
          <input
            type="number"
            min={0}
            value={minValue}
            onChange={(event) => setMinValue(event.target.value)}
            className="input h-10 rounded-full border border-white/10 bg-[#0a101a] px-3 text-white focus:outline-none focus:ring-2 focus:ring-white/40"
          />
        </label>
        <label className="flex flex-col gap-1">
          <span className="text-xs text-white/60">Hasta</span>
          <input
            type="number"
            min={0}
            value={maxValue}
            onChange={(event) => setMaxValue(event.target.value)}
            className="input h-10 rounded-full border border-white/10 bg-[#0a101a] px-3 text-white focus:outline-none focus:ring-2 focus:ring-white/40"
          />
        </label>
      </div>
      <div className="flex items-center justify-between pt-1">
        <button
          type="button"
          onClick={() => {
            onClear()
            close()
          }}
          className="text-white/70 hover:text-white"
        >
          Limpiar
        </button>
        <div className="flex gap-2">
          <button
            type="button"
            onClick={close}
            className="rounded-full border border-white/20 px-3 py-1 text-white hover:border-white/40"
          >
            Cancelar
          </button>
          <button
            type="button"
            onClick={apply}
            className="rounded-full bg-white px-3 py-1 font-semibold text-[#14212e] hover:bg-white/90"
          >
            Aplicar
          </button>
        </div>
      </div>
    </div>
  )
}

type DealFilterContentProps = {
  active: boolean
  onToggle: (nextActive: boolean) => void
  close: () => void
}

function DealFilterContent({ active, onToggle, close }: DealFilterContentProps) {
  return (
    <div className="flex flex-col gap-3 text-sm">
      <label className="flex cursor-pointer items-center gap-3 rounded-xl border border-white/10 bg-white/5 px-3 py-2 hover:border-white/30">
        <input
          type="checkbox"
          checked={active}
          onChange={(event) => onToggle(event.target.checked)}
          className="h-4 w-4 accent-white"
        />
        <div>
          <div className="font-medium text-white">Solo con descuento</div>
          <div className="text-xs text-white/60">Publicaciones con precio rebajado sobre el original.</div>
        </div>
      </label>
      <button
        type="button"
        onClick={() => {
          onToggle(false)
          close()
        }}
        className="self-end rounded-full bg-white px-3 py-1 text-xs font-semibold text-[#14212e] hover:bg-white/90"
      >
        Listo
      </button>
    </div>
  )
}

/* ------------------------ UI helpers ------------------------ */
/* ------------------------ Page ------------------------ */
type Crumb = { label: string; to?: string }
type MarketplaceProps = { forcedCat?: Cat; allowedCats?: Cat[]; forcedDeal?: boolean; headingTitle?: string; breadcrumbs?: Crumb[] }
export default function Marketplace({ forcedCat, allowedCats, forcedDeal, headingTitle, breadcrumbs }: MarketplaceProps = {}) {
  const [searchParams, setSearchParams] = useSearchParams()
  const paramsKey = searchParams.toString()
  const filters = useMemo(() => paramsToFilters(searchParams), [paramsKey])
  const effectiveCat: Cat = forcedCat ?? filters.cat
  const effectiveDeal = forcedDeal ? '1' : filters.deal

  const [count, setCount] = useState(40)
  const sentinelRef = useRef<HTMLDivElement | null>(null)
  const [sortMode, setSortMode] = useState<'relevance' | 'newest' | 'asc' | 'desc'>('relevance')
  const [listings, setListings] = useState<Listing[]>([])
  const [loading, setLoading] = useState(true)
  const [storeLogos, setStoreLogos] = useState<Record<string, string | null>>({})
  const [mobileFiltersOpen, setMobileFiltersOpen] = useState(false)
  const [mobileSortOpen, setMobileSortOpen] = useState(false)

  useEffect(() => {
    let active = true
    const load = async () => {
      setLoading(true)
      if (supabaseEnabled) {
        const data = await fetchListings()
        if (!active) return
        setListings(data)
        try {
          const sellerIds = Array.from(new Set(data.map((x) => x.sellerId).filter(Boolean)))
          const logos = await fetchStoresMeta(sellerIds)
          if (active) setStoreLogos(logos)
        } catch { void 0 }
        setLoading(false)
        return
      }
      if (!active) return
      setListings(mockListings)
      setLoading(false)
    }
    void load()
    return () => {
      active = false
    }
  }, [])

  const categoryFiltered = useMemo(() => {
    if (Array.isArray(allowedCats) && allowedCats.length) {
      const set = new Set(allowedCats)
      return listings.filter((listing) => set.has(listing.category as Cat))
    }
    if (effectiveCat === 'Todos') return listings
    return listings.filter((listing) => listing.category === effectiveCat)
  }, [listings, effectiveCat, allowedCats?.join(',')])

  const facetsData = useMemo(() => computeListingFacets(categoryFiltered), [categoryFiltered])
  const listingMetadata = facetsData.metadata

  const setFilters = useCallback((patch: Partial<FiltersState>) => {
    const merged: FiltersState = {
      ...filters,
      cat: forcedCat ?? patch.cat ?? filters.cat,
      subcat: 'subcat' in patch ? patch.subcat : filters.subcat,
      brand: 'brand' in patch ? patch.brand ?? [] : filters.brand,
      material: 'material' in patch ? patch.material ?? [] : filters.material,
      frameSize: 'frameSize' in patch ? patch.frameSize ?? [] : filters.frameSize,
      wheelSize: 'wheelSize' in patch ? patch.wheelSize ?? [] : filters.wheelSize,
      drivetrain: 'drivetrain' in patch ? patch.drivetrain ?? [] : filters.drivetrain,
      condition: 'condition' in patch ? patch.condition ?? [] : filters.condition,
      brake: 'brake' in patch ? patch.brake ?? [] : filters.brake,
      year: 'year' in patch ? patch.year ?? [] : filters.year,
      size: 'size' in patch ? patch.size ?? [] : filters.size,
      priceMin: 'priceMin' in patch ? patch.priceMin : filters.priceMin,
      priceMax: 'priceMax' in patch ? patch.priceMax : filters.priceMax,
      deal: 'deal' in patch ? patch.deal : filters.deal,
      q: 'q' in patch ? patch.q : filters.q
    }
    const nextParams = filtersToSearchParams(searchParams, merged)
    setSearchParams(nextParams)
  }, [filters, searchParams, setSearchParams, forcedCat])

  const filtered = useMemo(() => {
    if (!categoryFiltered.length) return []
    const brandSet = new Set(filters.brand.map((value) => normalizeText(value)))
    const materialSet = new Set(filters.material.map((value) => normalizeText(value)))
    const frameSizeSet = new Set(filters.frameSize.map((value) => normalizeText(value)))
    const wheelSizeSet = new Set(filters.wheelSize.map((value) => normalizeText(value)))
    const drivetrainSet = new Set(filters.drivetrain.map((value) => normalizeText(value)))
    const conditionSet = new Set(filters.condition.map((value) => normalizeText(value)))
    const brakeSet = new Set(filters.brake.map((value) => normalizeText(value)))
    const yearSet = new Set(filters.year.map((value) => normalizeText(value)))
    const sizeSet = new Set(filters.size.map((value) => normalizeText(value)))
    const priceMin = typeof filters.priceMin === 'number' ? filters.priceMin : null
    const priceMax = typeof filters.priceMax === 'number' ? filters.priceMax : null

    const matchesValue = (value: string | undefined, activeSet: Set<string>) => {
      if (!activeSet.size) return true
      if (!value) return false
      return activeSet.has(normalizeText(value))
    }

    const normalizedSubcat = normalizeText(filters.subcat || '')
    const filteredList = categoryFiltered.filter((listing) => {
      if (normalizedSubcat && effectiveCat === 'Accesorios') {
        const listingSub = normalizeText(listing.subcategory || '')
        const derived = listingMetadata[listing.id]
        const derivedType = normalizeText(derived?.accessoryType || '')
        const matchesSub = listingSub === normalizedSubcat || derivedType === normalizedSubcat
        if (!matchesSub) return false
      }
      if (!matchesValue(listing.brand, brandSet)) return false
      if (!matchesValue(listing.material, materialSet)) return false
      if (frameSizeSet.size) {
        const directMatch = matchesValue(listing.frameSize, frameSizeSet)
        if (!directMatch) {
          const extrasMap = extractExtrasMap(listing.extras)
          const multi = extrasMap.talles || ''
          const anyMulti = multi
            .split(',')
            .map((s) => s.trim())
            .filter(Boolean)
            .some((s) => frameSizeSet.has(normalizeText(s)))
          if (!anyMulti) return false
        }
      }
      if (!matchesValue(listing.wheelSize, wheelSizeSet)) return false
      if (!matchesValue(listing.drivetrain, drivetrainSet)) return false

      if (yearSet.size) {
        const year = listing.year ? String(listing.year) : ''
        if (!year || !yearSet.has(normalizeText(year))) return false
      }

      const derived = listingMetadata[listing.id] ?? {}

      if (conditionSet.size) {
        if (!derived.condition || !conditionSet.has(normalizeText(derived.condition))) return false
      }

      if (brakeSet.size) {
        if (!derived.brake || !brakeSet.has(normalizeText(derived.brake))) return false
      }

      if (sizeSet.size) {
        const hasSingle = derived.apparelSize && sizeSet.has(normalizeText(derived.apparelSize))
        if (!hasSingle) {
          const extrasMap = extractExtrasMap(listing.extras)
          const multi = extrasMap.talles || ''
          const anyMulti = multi
            .split(',')
            .map((s) => s.trim())
            .filter(Boolean)
            .some((s) => sizeSet.has(normalizeText(s)))
          if (!anyMulti) return false
        }
      }

      if (priceMin !== null && listing.price < priceMin) return false
      if (priceMax !== null && listing.price > priceMax) return false

      if (effectiveDeal === '1') {
        const hasDeal = typeof listing.originalPrice === 'number' && listing.originalPrice > listing.price
        if (!hasDeal) return false
      }

      if (filters.q) {
        const q = filters.q.toLowerCase()
        const haystack = [listing.title, listing.brand, listing.model, listing.description]
          .filter(Boolean)
          .join(' ')
          .toLowerCase()
        if (!haystack.includes(q)) return false
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
    if (sortMode === 'newest') {
      return sorted.sort((a, b) => (b.createdAt ?? 0) - (a.createdAt ?? 0))
    }
    return sorted.sort((a, b) => (sortMode === 'asc' ? a.price - b.price : b.price - a.price))
  }, [categoryFiltered, filters, sortMode, listingMetadata, effectiveDeal])

  const visible = filtered.slice(0, count)

  useEffect(() => {
    // Menor carga inicial para mejorar LCP en mobile
    setCount(12)
  }, [paramsKey])

  useEffect(() => {
    if (!sentinelRef.current) return
    const el = sentinelRef.current
    const io = new IntersectionObserver((entries) => {
      const entry = entries[0]
      if (entry.isIntersecting) {
        setCount((c) => (c + 24 <= filtered.length ? c + 24 : filtered.length))
      }
    }, { rootMargin: '600px 0px' })
    io.observe(el)
    return () => io.disconnect()
  }, [filtered.length])

  // Preload estratégico: primeras 2 imágenes visibles
  useEffect(() => {
    if (typeof document === 'undefined') return
    const preloadTargets = visible.slice(0, 2)
    const created: HTMLLinkElement[] = []
    for (const l of preloadTargets) {
      const img = l.images?.[0]
      if (!img) continue
      const link = document.createElement('link')
      link.rel = 'preload'
      link.as = 'image'
      link.href = transformSupabasePublicUrl(img, { width: 640, quality: 70, format: 'webp' })
      const srcset = [320, 480, 640, 768, 960].map((w) => `${transformSupabasePublicUrl(img, { width: w, quality: 70, format: 'webp' })} ${w}w`).join(', ')
      link.setAttribute('imagesrcset', srcset)
      link.setAttribute('imagesizes', '(max-width: 1279px) 50vw, 33vw')
      document.head.appendChild(link)
      created.push(link)
    }
    return () => {
      for (const el of created) {
        try { document.head.removeChild(el) } catch { void 0 }
      }
    }
  }, [visible.slice(0, 2).map((x) => x.id).join(',')])

  const handleCategory = useCallback((cat: Cat) => {
    if (forcedCat) return
    setFilters({ cat })
  }, [setFilters, forcedCat])

  const handleRemoveMulti = useCallback((key: MultiFilterKey, value: string) => {
    const next = filters[key].filter((item) => normalizeText(item) !== normalizeText(value))
    setFilters({ [key]: next } as Partial<FiltersState>)
  }, [filters, setFilters])

  const handleClearFilters = useCallback(() => {
    const reset: Partial<FiltersState> = {
      cat: 'Todos',
      subcat: undefined,
      priceMin: undefined,
      priceMax: undefined,
      deal: undefined,
      q: undefined
    }
    for (const key of MULTI_FILTER_ORDER) {
      ;(reset as any)[key] = []
    }
    setFilters(reset)
  }, [setFilters])

  const summaryFor = (key: MultiFilterKey) => {
    const values = filters[key]
    if (!values.length) return 'Todos'
    if (values.length === 1) return values[0]
    return `${values.length} seleccionadas`
  }

  const priceSummary = (() => {
    const { priceMin, priceMax } = filters
    if (typeof priceMin === 'number' || typeof priceMax === 'number') {
      const minLabel = typeof priceMin === 'number' ? `$${priceMin.toLocaleString('es-AR')}` : 'Min'
      const maxLabel = typeof priceMax === 'number' ? `$${priceMax.toLocaleString('es-AR')}` : 'Max'
      return `${minLabel} – ${maxLabel}`
    }
    return 'Todos'
  })()

  const sortSummary = (() => {
    switch (sortMode) {
      case 'relevance':
        return 'Relevancia'
      case 'newest':
        return 'Más recientes'
      case 'desc':
        return 'Precio ↓'
      case 'asc':
        return 'Precio ↑'
      default:
        return 'Relevancia'
    }
  })()

  const activeFilterChips: Array<{ key: string; label: string; onRemove: () => void }> = []
  if (filters.cat !== 'Todos') {
    activeFilterChips.push({
      key: 'cat',
      label: `Categoría: ${filters.cat}`,
      onRemove: () => setFilters({ cat: 'Todos' })
    })
  }
  if (filters.subcat) {
    activeFilterChips.push({
      key: 'subcat',
      label: `Tipo: ${filters.subcat}`,
      onRemove: () => setFilters({ subcat: undefined })
    })
  }
  for (const key of MULTI_FILTER_ORDER) {
    for (const value of filters[key]) {
      activeFilterChips.push({
        key: `${key}-${value}`,
        label: `${MULTI_FILTER_LABELS[key]}: ${value}`,
        onRemove: () => handleRemoveMulti(key, value)
      })
    }
  }
  if (typeof filters.priceMin === 'number' || typeof filters.priceMax === 'number') {
    const parts: string[] = []
    if (typeof filters.priceMin === 'number') parts.push(`desde $${filters.priceMin.toLocaleString('es-AR')}`)
    if (typeof filters.priceMax === 'number') parts.push(`hasta $${filters.priceMax.toLocaleString('es-AR')}`)
    activeFilterChips.push({
      key: 'price',
      label: `Precio ${parts.join(' ')}`,
      onRemove: () => setFilters({ priceMin: undefined, priceMax: undefined })
    })
  }
  if (filters.deal === '1') {
    activeFilterChips.push({
      key: 'deal',
      label: 'Solo descuentos',
      onRemove: () => setFilters({ deal: undefined })
    })
  }

  const hasActiveFilters = activeFilterChips.length > 0

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
            <div className="relative mx-auto max-w-4xl py-10 text-center md:py-14">
              <span className="inline-flex items-center gap-3 rounded-full border border-white/10 bg-white/10 px-3 py-1 text-[11px] uppercase tracking-[0.4em] text-white/70">
                Marketplace vivo
              </span>
              <h1 className="mt-5 text-3xl font-extrabold leading-tight tracking-tight sm:text-4xl md:text-5xl">
                Las bicicletas se reinventan, vos también.
              </h1>
              <p className="mt-3 mx-auto max-w-2xl text-base text-white/80 md:text-lg">
                Filtrá por disciplina, marca o presupuesto. Vendé en minutos y conectá directo con compradores verificados.
              </p>
              <div className="mt-6 flex flex-wrap items-center justify-center gap-3">
                <Link
                  to="/publicar"
                  className="btn bg-gradient-to-r from-[#0ea5e9] via-[#2563eb] to-[#1d4ed8] text-white shadow-[0_14px_40px_rgba(37,99,235,0.45)] hover:brightness-110"
                >
                  <span>Publicar bicicleta</span>
                  <svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24" className="h-4 w-4" fill="none" stroke="currentColor" strokeWidth={1.8}>
                    <path strokeLinecap="round" strokeLinejoin="round" d="M5 12h14m-6-6 6 6-6 6" />
                  </svg>
                </Link>
                <a href="#listings" className="btn bg-[#14212e] text-white shadow-[0_14px_40px_rgba(20,33,46,0.35)] hover:bg-[#1b2f3f]">
                  <svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24" className="h-4 w-4" fill="none" stroke="currentColor" strokeWidth={1.8}>
                    <path strokeLinecap="round" strokeLinejoin="round" d="m17.5 17.5-4-4m1-3.5a5.5 5.5 0 1 1-11 0 5.5 5.5 0 0 1 11 0Z" />
                  </svg>
                  <span>Explorar bicicletas</span>
                </a>
              </div>
              <div className="pointer-events-none absolute inset-x-0 -bottom-6 mx-auto h-px max-w-3xl bg-gradient-to-r from-transparent via-white/40 to-transparent" />
            </div>
          </Container>
        </div>
      </section>

      <section id="listings" className="relative isolate overflow-hidden bg-gradient-to-b from-[#0f1729] via-[#101b2d] to-[#0f1729] text-white">
        <div className="pointer-events-none absolute inset-0 -z-10 opacity-60">
          <div className="absolute -top-16 -left-16 h-64 w-64 rounded-full bg-[radial-gradient(circle,_rgba(37,99,235,0.25),_transparent_60%)] blur-2xl" />
          <div className="absolute -bottom-16 -right-10 h-64 w-64 rounded-full bg-[radial-gradient(circle,_rgba(14,165,233,0.20),_transparent_60%)] blur-2xl" />
        </div>
        <Container className="text-white">
          <div className="py-10 space-y-8">

            {forcedCat || (allowedCats && allowedCats.length) ? null : (
            <div className="grid grid-cols-3 gap-2 sm:gap-4">
              {CATEGORY_CARDS.map((card) => {
                const isActive = filters.cat === card.cat
                return (
                  <button
                    key={card.cat}
                    type="button"
                    onClick={() => handleCategory(card.cat)}
                    className={`relative w-full overflow-hidden rounded-3xl border-2 transition focus:outline-none focus-visible:ring-2 focus-visible:ring-white/80 focus-visible:ring-offset-2 focus-visible:ring-offset-[#14212e] ${
                      isActive ? 'border-white shadow-lg' : 'border-white/15 bg-white/5 hover:border-white/30 hover:shadow-md'
                    }`}
                    aria-pressed={isActive}
                  >
                    <div className="relative aspect-square sm:aspect-[17/5]">
                      <picture className="block h-full w-full">
                        <source media="(max-width: 640px)" srcSet={card.imageMobile} />
                        <img src={card.image} alt={card.label} className="h-full w-full object-cover" loading="lazy" decoding="async" />
                      </picture>
                      <div className="absolute inset-0 bg-gradient-to-t from-[#050c18]/85 via-transparent to-transparent" aria-hidden />
                      <div className="absolute inset-0 flex items-end p-2 sm:p-4">
                        <div className="space-y-1 text-left">
                          <span className="text-sm font-semibold text-white sm:text-lg">{card.label}</span>
                          <span className="hidden text-xs text-white/80 sm:block">{card.description}</span>
                        </div>
                      </div>
                    </div>
                  </button>
                )
              })}
            </div>
            )}

            <div className="sm:hidden">
              <div className="flex w-full overflow-hidden rounded-2xl bg-white text-[#14212e] shadow">
                <button
                  type="button"
                  onClick={() => setMobileFiltersOpen(true)}
                  className="flex-1 px-4 py-3 text-sm font-semibold uppercase tracking-wide"
                >
                  Filtros
                </button>
                <div className="w-px bg-[#14212e]/10" />
                <button
                  type="button"
                  onClick={() => setMobileSortOpen(true)}
                  className="flex-1 px-4 py-3 text-sm font-semibold uppercase tracking-wide"
                >
                  {sortSummary}
                </button>
              </div>
            </div>

            <div className="sm:hidden text-xs text-white/70">{filtered.length} resultados</div>

            <div className="space-y-4">
              {breadcrumbs && breadcrumbs.length ? (
                <nav aria-label="Miga de pan" className="text-xs text-white/60">
                  <ol className="flex items-center gap-2">
                    {breadcrumbs.map((c, idx) => (
                      <li key={`${c.label}-${idx}`} className="flex items-center gap-2">
                        {c.to ? (
                          <Link to={c.to} className="hover:text-white/80">{c.label}</Link>
                        ) : (
                          <span className="text-white/70">{c.label}</span>
                        )}
                        {idx < breadcrumbs.length - 1 ? (<span className="text-white/30">›</span>) : null}
                      </li>
                    ))}
                  </ol>
                </nav>
              ) : null}
              {headingTitle ? (
                <h2 className="text-xl font-semibold">{headingTitle}</h2>
              ) : null}
              <div className="hidden flex-col gap-3 sm:flex lg:flex-row lg:items-center lg:justify-between">
                <div className="text-sm text-white/70">{filtered.length} resultados</div>
                <div className="flex items-center gap-2 text-sm">
                  <span className="text-white/60">Ordenar</span>
                  <select
                    value={sortMode}
                    onChange={(event) => setSortMode(event.target.value as 'relevance' | 'newest' | 'asc' | 'desc')}
                    className="input w-48 rounded-full border border-white/10 bg-white/90 text-sm text-[#14212e]"
                  >
                    <option value="relevance">Relevancia</option>
                    <option value="newest">Más recientes</option>
                    <option value="desc">Precio: mayor a menor</option>
                    <option value="asc">Precio: menor a mayor</option>
                  </select>
                </div>
              </div>

              <div className="hidden flex-wrap gap-2 sm:flex">
                {forcedCat || (allowedCats && allowedCats.length) ? null : (
                <FilterDropdown label="Categoría" summary={filters.cat}>
                  {({ close }) => (
                    <div className="flex flex-col gap-1 text-sm">
                      {CAT_VALUES.map((cat) => {
                        const isActive = filters.cat === cat
                        return (
                          <button
                            key={cat}
                            type="button"
                            onClick={() => {
                              setFilters({ cat })
                              close()
                            }}
                            className={`flex items-center justify-between rounded-xl px-3 py-2 transition hover:bg-white/10 ${
                              isActive ? 'bg-white/15 text-white' : 'text-white/80'
                            }`}
                          >
                            <span>{cat}</span>
                            {isActive ? (
                              <svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24" className="h-4 w-4" fill="none" stroke="currentColor" strokeWidth={2}>
                                <path strokeLinecap="round" strokeLinejoin="round" d="m5 13 4 4L19 7" />
                              </svg>
                            ) : null}
                          </button>
                        )
                      })}
                    </div>
                  )}
                </FilterDropdown>
                )}

                {MULTI_FILTER_ORDER.map((key) => {
                  const rawOptions = facetsData.options[key]
                  const options = Array.from(new Set([...rawOptions, ...filters[key]]))
                  return (
                    <FilterDropdown
                      key={key}
                      label={MULTI_FILTER_LABELS[key]}
                      summary={summaryFor(key)}
                      disabled={!options.length}
                    >
                      {({ close }) => (
                        <MultiSelectContent
                          options={options}
                          selected={filters[key]}
                          onChange={(next) => setFilters({ [key]: next } as Partial<FiltersState>)}
                          close={close}
                          placeholder={`Buscar ${MULTI_FILTER_LABELS[key].toLowerCase()}`}
                        />
                      )}
                    </FilterDropdown>
                  )
                })}

                <FilterDropdown label="Precio" summary={priceSummary}>
                  {({ close }) => (
                    <PriceFilterContent
                      min={filters.priceMin}
                      max={filters.priceMax}
                      bounds={facetsData.priceRange}
                      onApply={({ min, max }) => setFilters({ priceMin: min, priceMax: max })}
                      onClear={() => setFilters({ priceMin: undefined, priceMax: undefined })}
                      close={close}
                    />
                  )}
                </FilterDropdown>

                <FilterDropdown label="Promos" summary={effectiveDeal === '1' ? 'Activas' : 'Todas'}>
                  {({ close }) => (
                    <DealFilterContent
                      active={effectiveDeal === '1'}
                      onToggle={(active) => { if (!forcedDeal) setFilters({ deal: active ? '1' : undefined }) }}
                      close={close}
                    />
                  )}
                </FilterDropdown>
              </div>

              {hasActiveFilters ? (
                <div className="flex flex-wrap items-center gap-2">
                  {activeFilterChips.map((chip) => (
                    <button
                      key={chip.key}
                      type="button"
                      onClick={chip.onRemove}
                      className="inline-flex items-center gap-2 rounded-full border border-white/20 bg-white/10 px-3 py-1 text-xs text-white transition hover:border-white/40 hover:bg-white/20"
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
            </div>

            {loading ? (
              <div className="grid -mx-2 grid-cols-1 gap-0 sm:mx-0 sm:grid-cols-2 sm:gap-5 lg:grid-cols-3">
                {Array.from({ length: 6 }).map((_, idx) => (
                  <div key={`skeleton-${idx}`} className="p-2 sm:p-0">
                    <SkeletonCard />
                  </div>
                ))}
              </div>
            ) : visible.length ? (
              <>
                <div className="grid -mx-2 grid-cols-1 gap-0 sm:mx-0 sm:grid-cols-2 sm:gap-5 lg:grid-cols-3">
                  {visible.map((listing, idx) => (
                    <div key={listing.id} className="p-2 sm:p-0">
                      <ListingCard l={listing} storeLogoUrl={storeLogos[listing.sellerId] || null} priority={idx < 4} />
                    </div>
                  ))}
                </div>
                <div ref={sentinelRef} className="h-12" />
                {visible.length < filtered.length ? (
                  <div className="flex justify-center">
                    <button
                      onClick={() => setCount((c) => Math.min(c + 40, filtered.length))}
                      className="btn mt-4 bg-white text-[#14212e] hover:bg-white/90"
                    >
                      Cargar más
                    </button>
                  </div>
                ) : null}
              </>
            ) : (
              <div className="mt-10">
                <EmptyState
                  title="No encontramos bicis con esos filtros"
                  subtitle="Ajustá los filtros o revisá más adelante."
                />
              </div>
            )}
          </div>
        </Container>
      </section>

      {mobileFiltersOpen ? (
        <div
          className="fixed inset-0 z-50 bg-[#050c18]/80 backdrop-blur-sm sm:hidden"
          onClick={() => setMobileFiltersOpen(false)}
        >
          <div
            className="absolute right-0 top-0 h-full w-full bg-[#0f1724] shadow-2xl sm:hidden"
            onClick={(e) => e.stopPropagation()}
          >
            <div className="flex h-full flex-col">
              <div className="flex items-center justify-between border-b border-white/10 px-5 py-4">
                <h3 className="text-base font-semibold text-white">Filtros</h3>
                <button
                  type="button"
                  onClick={() => setMobileFiltersOpen(false)}
                  className="rounded-full border border-white/20 px-3 py-1 text-xs text-white"
                >
                  Cerrar
                </button>
              </div>
              <div className="flex-1 overflow-y-auto px-5 py-4 pb-28 space-y-3 text-white">
                {forcedCat || (allowedCats && allowedCats.length) ? null : (
                <FilterDropdown
                  label="Categoría"
                  summary={filters.cat}
                  className="w-full"
                buttonClassName="w-full justify-between"
                inlineOnMobile
                >
                  {({ close }) => (
                    <div className="flex flex-col gap-1 text-sm">
                      {CAT_VALUES.map((cat) => {
                        const isActive = filters.cat === cat
                        return (
                          <button
                            key={cat}
                            type="button"
                            onClick={() => {
                              setFilters({ cat })
                              close()
                            }}
                            className={`flex items-center justify-between rounded-xl px-3 py-2 transition hover:bg-white/10 ${
                              isActive ? 'bg-white/15 text-white' : 'text-white/80'
                            }`}
                          >
                            <span>{cat}</span>
                            {isActive ? (
                              <svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24" className="h-4 w-4" fill="none" stroke="currentColor" strokeWidth={2}>
                                <path strokeLinecap="round" strokeLinejoin="round" d="m5 13 4 4L19 7" />
                              </svg>
                            ) : null}
                          </button>
                        )
                      })}
                    </div>
                  )}
                </FilterDropdown>
                )}
                {MULTI_FILTER_ORDER.map((key) => {
                  const rawOptions = facetsData.options[key]
                  const options = Array.from(new Set([...rawOptions, ...filters[key]]))
                  return (
                    <FilterDropdown
                      key={`mobile-${key}`}
                      label={MULTI_FILTER_LABELS[key]}
                      summary={summaryFor(key)}
                    disabled={!options.length}
                    className="w-full"
                    buttonClassName="w-full justify-between"
                    inlineOnMobile
                  >
                    {({ close }) => (
                      <MultiSelectContent
                        options={options}
                        selected={filters[key]}
                        onChange={(next) => setFilters({ [key]: next } as Partial<FiltersState>)}
                        close={close}
                        placeholder={`Buscar ${MULTI_FILTER_LABELS[key].toLowerCase()}`}
                      />
                    )}
                  </FilterDropdown>
                )
              })}
              <FilterDropdown
                label="Precio"
                summary={priceSummary}
                className="w-full"
                buttonClassName="w-full justify-between"
                inlineOnMobile
              >
                {({ close }) => (
                  <PriceFilterContent
                    min={filters.priceMin}
                    max={filters.priceMax}
                    bounds={facetsData.priceRange}
                    onApply={({ min, max }) => setFilters({ priceMin: min, priceMax: max })}
                    onClear={() => setFilters({ priceMin: undefined, priceMax: undefined })}
                    close={close}
                  />
                )}
              </FilterDropdown>
              <FilterDropdown
                label="Promos"
                summary={effectiveDeal === '1' ? 'Activas' : 'Todas'}
                className="w-full"
                buttonClassName="w-full justify-between"
                inlineOnMobile
              >
                {({ close }) => (
                  <DealFilterContent
                    active={effectiveDeal === '1'}
                    onToggle={(active) => { if (!forcedDeal) setFilters({ deal: active ? '1' : undefined }) }}
                    close={close}
                  />
                )}
              </FilterDropdown>
              </div>
              <div className="border-t border-white/10 bg-[#0f1724] px-5 py-4">
                <div className="flex gap-3">
                  <button
                    type="button"
                    onClick={() => handleClearFilters()}
                    className="flex-1 rounded-full border border-white/20 px-4 py-2 text-sm text-white hover:border-white/40 hover:bg-white/10"
                  >
                    Limpiar
                  </button>
                  <button
                    type="button"
                    onClick={() => setMobileFiltersOpen(false)}
                    className="flex-1 rounded-full bg-white px-4 py-2 text-sm font-semibold text-[#14212e] hover:bg-white/90"
                  >
                    Aplicar
                  </button>
                </div>
              </div>
            </div>
          </div>
        </div>
      ) : null}

      {mobileSortOpen ? (
        <div
          className="fixed inset-0 z-50 bg-[#050c18]/80 backdrop-blur-sm sm:hidden"
          onClick={() => setMobileSortOpen(false)}
        >
          <div
            className="absolute inset-x-0 bottom-0 rounded-t-3xl bg-[#0f1724] p-5 shadow-2xl"
            onClick={(e) => e.stopPropagation()}
          >
            <div className="flex items-center justify-between">
              <h3 className="text-base font-semibold text-white">Ordenar por</h3>
              <button
                type="button"
                onClick={() => setMobileSortOpen(false)}
                className="rounded-full border border-white/20 px-3 py-1 text-xs text-white"
              >
                Cerrar
              </button>
            </div>
            <div className="mt-4 space-y-2 text-sm text-white">
              {[
                { value: 'relevance', label: 'Relevancia' },
                { value: 'newest', label: 'Más recientes' },
                { value: 'desc', label: 'Precio: mayor a menor' },
                { value: 'asc', label: 'Precio: menor a mayor' }
              ].map((option) => {
                const active = sortMode === option.value
                return (
                  <button
                    key={option.value}
                    type="button"
                    onClick={() => {
                      setSortMode(option.value as 'relevance' | 'newest' | 'asc' | 'desc')
                      setMobileSortOpen(false)
                    }}
                    className={`w-full rounded-2xl border px-4 py-3 text-left transition ${
                      active ? 'border-white bg-white/15' : 'border-white/15 hover:border-white/30 hover:bg-white/10'
                    }`}
                  >
                    {option.label}
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
