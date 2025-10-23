import { useCallback, useEffect, useMemo, useState } from 'react'
import { Link, useParams, useSearchParams } from 'react-router-dom'
import Container from '../components/Container'
// SEO global se maneja desde App; acá sólo inyectamos JSON-LD
import JsonLd from '../components/JsonLd'
import FilterDropdown from '../components/FilterDropdown'
import { fetchUserProfile, fetchStoreProfileBySlug, fetchUserContactEmail, type UserProfileRecord } from '../services/users'
import { track, trackOncePerSession } from '../services/track'
import { normaliseWhatsapp, buildWhatsappUrl } from '../utils/whatsapp'
import { fetchListingsBySeller } from '../services/listings'
import ListingCard from '../components/ListingCard'
import type { Listing } from '../types'
const API_BASE = (import.meta.env.VITE_API_BASE_URL || '').replace(/\/$/, '')

type FilterOption = { id: string; label: string; match: (l: Listing) => boolean }
type FilterSection = { id: string; label: string; options: FilterOption[] }

function textIncludes(l: Listing, ...terms: string[]) {
  const hay = `${l.title} ${l.brand} ${l.model} ${l.description || ''} ${l.extras || ''}`.toLowerCase()
  return terms.some((t) => hay.includes(t.toLowerCase()))
}

function subcatIs(l: Listing, ...values: string[]) {
  const sc = (l.subcategory || '').toLowerCase()
  if (!sc) return false
  return values.some((v) => sc === v.toLowerCase() || sc.includes(v.toLowerCase()))
}

const FILTERS: FilterSection[] = [
  {
    id: 'road',
    label: 'Ruta & Gravel',
    options: [
      { id: 'road', label: 'Bicicletas de Ruta', match: (l) => (l.category || '').toLowerCase().includes('ruta') || subcatIs(l, 'ruta') },
      { id: 'gravel', label: 'Gravel', match: (l) => (l.category || '').toLowerCase().includes('gravel') || subcatIs(l, 'gravel') },
      { id: 'tt', label: 'Triatlón / TT', match: (l) => subcatIs(l, 'triatlón','tt') || textIncludes(l, 'tt', 'triatl') },
      { id: 'vintage', label: 'Vintage / Acero', match: (l) => subcatIs(l, 'vintage','acero') || textIncludes(l, 'vintage', 'acero') },
    ]
  },
  {
    id: 'mtb',
    label: 'MTB',
    options: [
      { id: 'xc', label: 'Cross Country', match: (l) => subcatIs(l, 'xc','cross country') || textIncludes(l, 'xc', 'cross country') },
      { id: 'trail', label: 'Trail', match: (l) => subcatIs(l, 'trail') || textIncludes(l, 'trail') },
      { id: 'enduro', label: 'Enduro', match: (l) => subcatIs(l, 'enduro') || textIncludes(l, 'enduro') },
      { id: 'dh', label: 'Downhill', match: (l) => subcatIs(l, 'downhill','dh') || textIncludes(l, 'downhill', 'dh') },
    ]
  },
  {
    id: 'urban',
    label: 'Urbana & Fixie',
    options: [
      { id: 'urbana', label: 'Urbana', match: (l) => (l.category || '').toLowerCase().includes('urbana') || subcatIs(l, 'urbana') },
      { id: 'fixie', label: 'Fixie', match: (l) => (l.category || '').toLowerCase().includes('fixie') || subcatIs(l, 'fixie') },
      { id: 'singlespeed', label: 'Single Speed', match: (l) => subcatIs(l, 'singlespeed','single speed') || textIncludes(l, 'single speed') },
    ]
  },
  {
    id: 'accessories',
    label: 'Accesorios',
    options: [
      { id: 'electro', label: 'Electrónica', match: (l) => (l.category || '').toLowerCase().includes('accesor') && (subcatIs(l, 'electrónica','electronica') || textIncludes(l, 'gps', 'sensor', 'ciclocomput')) },
      { id: 'rodillos', label: 'Rodillos', match: (l) => (l.category || '').toLowerCase().includes('accesor') && (subcatIs(l, 'rodillo','trainer') || textIncludes(l, 'rodillo', 'trainer')) },
      { id: 'luces', label: 'Luces', match: (l) => (l.category || '').toLowerCase().includes('accesor') && (subcatIs(l, 'luces','luz') || textIncludes(l, 'luz', 'luces')) },
      { id: 'componentes', label: 'Componentes', match: (l) => (l.category || '').toLowerCase().includes('accesor') && (subcatIs(l, 'componentes','ruedas','grupo','cockpit') || textIncludes(l, 'rueda', 'grupo', 'sillin', 'manubrio', 'stem', 'frenos')) },
    ]
  },
  {
    id: 'apparel',
    label: 'Indumentaria',
    options: [
      { id: 'jersey', label: 'Jerseys', match: (l) => (l.category || '').toLowerCase().includes('indument') && (subcatIs(l, 'jersey') || textIncludes(l, 'jersey')) },
      { id: 'casco', label: 'Cascos', match: (l) => (l.category || '').toLowerCase().includes('indument') && (subcatIs(l, 'casco') || textIncludes(l, 'casco')) },
      { id: 'zapatillas', label: 'Zapatillas', match: (l) => (l.category || '').toLowerCase().includes('indument') && (subcatIs(l, 'zapatilla') || textIncludes(l, 'zapat')) },
      { id: 'otros', label: 'Otros', match: (l) => (l.category || '').toLowerCase().includes('indument') },
    ]
  },
  {
    id: 'ebike',
    label: 'E‑Bike',
    options: [
      { id: 'ebike', label: 'Todas las E‑Bike', match: (l) => subcatIs(l, 'e-bike','ebike') || textIncludes(l, 'e-bike', 'ebike', 'steps') },
    ]
  },
]

type MultiFilterKey = 'brand' | 'material' | 'frameSize' | 'wheelSize' | 'drivetrain' | 'condition' | 'brake' | 'year' | 'size'
type StoreFiltersState = {
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
}

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

type ListingMetadata = {
  condition?: string
  brake?: string
  apparelSize?: string
}

type ListingFacetsResult = {
  options: Record<MultiFilterKey, string[]>
  priceRange: { min: number; max: number }
  metadata: Record<string, ListingMetadata>
}

const APPAREL_SIZE_ORDER = ['XXS','XS','S','M','L','XL','XXL','XXXL','4XL','5XL']

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

function sortAlpha(values: Iterable<string>) {
  return Array.from(values).sort((a, b) => a.localeCompare(b, 'es', { sensitivity: 'base' }))
}

function sortYearDesc(values: Iterable<string>) {
  return Array.from(values).sort((a, b) => Number(b) - Number(a))
}

function sortSizes(values: Iterable<string>) {
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
    // Agregar múltiples talles desde extras si existen
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
    // Agregar todos los talles de indumentaria si vienen en "Talles"
    const extrasForSizes = extractExtrasMap(listing.extras)
    const multiSizes = extrasForSizes.talles
    if (multiSizes) {
      multiSizes.split(',').map((s) => s.trim()).filter(Boolean).forEach((s) => sets.size.add(s))
    }

    metadata[listing.id] = {
      condition: condition || undefined,
      brake: brake || undefined,
      apparelSize: apparelSize || undefined
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
        Rango disponible: {bounds.min ? `$${bounds.min.toLocaleString('es-AR')}` : '—'} – {bounds.max ? `$${bounds.max.toLocaleString('es-AR')}` : '—'}
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
          <div className="text-xs text-white/60">Productos con precio rebajado sobre el original.</div>
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
const STORE_CATEGORY_BANNERS: Array<{ key: 'all' | 'acc' | 'app'; label: string; section: '' | 'accessories' | 'apparel'; description: string; image: string; imageMobile: string }> = [
  {
    key: 'all',
    label: 'Todas',
    section: '',
    description: 'Todo el catálogo disponible',
    image: '/design/Banners/1.png',
    imageMobile: '/design/Banners-Mobile/1.png'
  },
  {
    key: 'acc',
    label: 'Accesorios',
    section: 'accessories',
    description: 'Componentes y upgrades',
    image: '/design/Banners/2.png',
    imageMobile: '/design/Banners-Mobile/2.png'
  },
  {
    key: 'app',
    label: 'Indumentaria',
    section: 'apparel',
    description: 'Ropa técnica y casual',
    image: '/design/Banners/3.png',
    imageMobile: '/design/Banners-Mobile/3.png'
  }
]

export default function Store() {
  const params = useParams()
  const [search, setSearch] = useSearchParams()
  // filtros de sidebar removidos
  const [profile, setProfile] = useState<UserProfileRecord | null>(null)
  const [listings, setListings] = useState<Listing[]>([])
  const [loading, setLoading] = useState(true)
  const [storeEmail, setStoreEmail] = useState<string | null>(null)
  const [filters, setFiltersState] = useState<StoreFiltersState>({
    brand: [],
    material: [],
    frameSize: [],
    wheelSize: [],
    drivetrain: [],
    condition: [],
    brake: [],
    year: [],
    size: [],
    priceMin: undefined,
    priceMax: undefined,
    deal: undefined,
    q: undefined
  })
  const [mobileFiltersOpen, setMobileFiltersOpen] = useState(false)
  const [mobileSortOpen, setMobileSortOpen] = useState(false)
  const [sortMode, setSortMode] = useState<'relevance' | 'newest' | 'asc' | 'desc'>('relevance')
  const activeSection = (search.get('sec') || '').trim()
  const activeOption = (search.get('opt') || '').trim()

  const setSection = useCallback((sec: string, opt?: string) => {
    const next = new URLSearchParams(search)
    if (!sec) {
      next.delete('sec')
      next.delete('opt')
    } else {
      next.set('sec', sec)
      if (!opt) next.delete('opt')
      else next.set('opt', opt)
    }
    setSearch(next, { replace: true })
  }, [search, setSearch])

  const setFilters = useCallback((patch: Partial<StoreFiltersState>) => {
    setFiltersState((prev) => ({
      brand: 'brand' in patch ? patch.brand ?? [] : prev.brand,
      material: 'material' in patch ? patch.material ?? [] : prev.material,
      frameSize: 'frameSize' in patch ? patch.frameSize ?? [] : prev.frameSize,
      wheelSize: 'wheelSize' in patch ? patch.wheelSize ?? [] : prev.wheelSize,
      drivetrain: 'drivetrain' in patch ? patch.drivetrain ?? [] : prev.drivetrain,
      condition: 'condition' in patch ? patch.condition ?? [] : prev.condition,
      year: 'year' in patch ? patch.year ?? [] : prev.year,
      size: 'size' in patch ? patch.size ?? [] : prev.size,
      priceMin: 'priceMin' in patch ? patch.priceMin : prev.priceMin,
      priceMax: 'priceMax' in patch ? patch.priceMax : prev.priceMax,
      deal: 'deal' in patch ? patch.deal : prev.deal,
      q: 'q' in patch ? patch.q : prev.q
    }))
  }, [])

  const sellerId = useMemo(() => profile?.id ?? null, [profile])

  useEffect(() => {
    let active = true
    const load = async () => {
      setLoading(true)
      // Buscamos por slug en users.store_slug o por id directo
      const slugOrId = (params.slug as string) || ''
      let found: UserProfileRecord | null = null
      // Si parece un UUID, buscar por id; si no, por store_slug
      if (/^[0-9a-fA-F-]{16,}$/.test(slugOrId)) {
        found = await fetchUserProfile(slugOrId)
      } else {
        found = await fetchStoreProfileBySlug(slugOrId)
      }
      if (!active) return
      setProfile(found)
      setLoading(false)
    }
    void load()
    return () => { active = false }
  }, [params.slug])

  // Track store view once per session when profile is loaded
  useEffect(() => {
    const pid = profile?.id
    if (!pid) return
    trackOncePerSession(`store_view_${pid}`, () => {
      track('store_view', { store_user_id: pid })
    })
  }, [profile?.id])

  useEffect(() => {
    let mounted = true
    const load = async () => {
      if (!sellerId) { setListings([]); return }
      const rows = await fetchListingsBySeller(sellerId)
      if (!mounted) return
      setListings(rows)
    }
    void load()
    return () => { mounted = false }
  }, [sellerId])

  // Buscar email del vendedor/tienda cuando haya perfil
  useEffect(() => {
    let active = true
    ;(async () => {
      try {
        const pid = profile?.id
        if (!pid) { if (active) setStoreEmail(null); return }
        const email = await fetchUserContactEmail(pid)
        if (active) setStoreEmail(email)
      } catch {
        if (active) setStoreEmail(null)
      }
    })()
    return () => { active = false }
  }, [profile?.id])

  const sectionFiltered = useMemo(() => {
    if (!activeSection && !activeOption) return listings
    const section = FILTERS.find((s) => s.id === activeSection) || null
    if (section && activeOption) {
      const opt = section.options.find((o) => o.id === activeOption)
      if (opt) return listings.filter(opt.match)
    }
    if (section) {
      return listings.filter((l) => section.options.some((o) => o.match(l)))
    }
    return listings
  }, [listings, activeSection, activeOption])
  const facetsData = useMemo(() => computeListingFacets(sectionFiltered), [sectionFiltered])
  const listingMetadata = facetsData.metadata
  const filtered = useMemo(() => {
    const brandSet = new Set(filters.brand.map((value) => normalizeText(value)))
    const materialSet = new Set(filters.material.map((value) => normalizeText(value)))
    const frameSizeSet = new Set(filters.frameSize.map((value) => normalizeText(value)))
    const wheelSizeSet = new Set(filters.wheelSize.map((value) => normalizeText(value)))
    const drivetrainSet = new Set(filters.drivetrain.map((value) => normalizeText(value)))
    const conditionSet = new Set(filters.condition.map((value) => normalizeText(value)))
    const yearSet = new Set(filters.year.map((value) => normalizeText(value)))
    const sizeSet = new Set(filters.size.map((value) => normalizeText(value)))
    const brakeSet = new Set(filters.brake.map((value) => normalizeText(value)))
    const priceMin = typeof filters.priceMin === 'number' ? filters.priceMin : null
    const priceMax = typeof filters.priceMax === 'number' ? filters.priceMax : null

    const matchesValue = (value: string | undefined, activeSet: Set<string>) => {
      if (!activeSet.size) return true
      if (!value) return false
      return activeSet.has(normalizeText(value))
    }

    return sectionFiltered.filter((listing) => {
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
        const derived = listingMetadata[listing.id] ?? {}
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

      if (filters.deal === '1') {
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
  }, [sectionFiltered, filters, listingMetadata])

  const finalList = useMemo(() => {
    const arr = [...filtered]
    if (sortMode === 'relevance') {
      return arr
    }
    if (sortMode === 'newest') {
      return arr.sort((a, b) => (b.createdAt ?? 0) - (a.createdAt ?? 0))
    }
    if (sortMode === 'asc') {
      return arr.sort((a, b) => (a.price ?? 0) - (b.price ?? 0))
    }
    if (sortMode === 'desc') {
      return arr.sort((a, b) => (b.price ?? 0) - (a.price ?? 0))
    }
    return arr
  }, [filtered, sortMode])

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
  if (activeSection || activeOption) {
    const section = FILTERS.find((sec) => sec.id === activeSection)
    const option = section?.options.find((opt) => opt.id === activeOption)
    const label = option?.label || section?.label
    if (label) {
      activeFilterChips.push({
        key: 'section',
        label: `Categoría: ${label}`,
        onRemove: () => setSection('')
      })
    }
  }
  for (const key of MULTI_FILTER_ORDER) {
    for (const value of filters[key]) {
      activeFilterChips.push({
        key: `${key}-${value}`,
        label: `${MULTI_FILTER_LABELS[key]}: ${value}`,
        onRemove: () => setFilters({ [key]: filters[key].filter((item) => normalizeText(item) !== normalizeText(value)) } as Partial<StoreFiltersState>)
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

  const handleClearFilters = useCallback(() => {
    const reset: Partial<StoreFiltersState> = {
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

  if (loading) return <Container className="py-12">Cargando tienda…</Container>
  if (!profile || !profile.store_enabled) return <Container className="py-12">Tienda no encontrada.</Container>

  const banner = profile.store_banner_url || '/og-preview.png'
  const bannerPosY = typeof profile.store_banner_position_y === 'number' ? profile.store_banner_position_y : 50
  const avatar = profile.store_avatar_url || profile.avatar_url || '/avatar-placeholder.png'
  const storeName = profile.store_name || profile.full_name || 'Tienda'
  const address = profile.store_address || [profile.city, profile.province].filter(Boolean).join(', ')
  const phone = profile.store_phone || profile.whatsapp_number || ''
  const workingHours = (profile as any).store_hours as string | null

  // Google Reviews integrations removidas

  return (
    <div className="min-h-[70vh] relative isolate overflow-hidden text-white bg-gradient-to-b from-[#0f1729] via-[#101b2d] to-[#0f1729]">
      <div className="pointer-events-none absolute inset-0 -z-10 opacity-60">
        <div className="absolute -top-16 -left-16 h-64 w-64 rounded-full bg-[radial-gradient(circle,_rgba(37,99,235,0.25),_transparent_60%)] blur-2xl" />
        <div className="absolute -bottom-16 -right-10 h-64 w-64 rounded-full bg-[radial-gradient(circle,_rgba(14,165,233,0.20),_transparent_60%)] blur-2xl" />
      </div>
      <JsonLd
        data={{
          '@context': 'https://schema.org',
          '@type': profile.store_address ? 'LocalBusiness' : 'Organization',
          name: storeName,
          url: `${(import.meta.env.VITE_FRONTEND_URL || window.location.origin).replace(/\/$/, '')}/tienda/${profile.store_slug || profile.id}`,
          logo: avatar,
          image: banner,
          address: address || undefined,
          contactPoint: (phone ? [{ '@type': 'ContactPoint', telephone: phone, contactType: 'customer service' }] : undefined),
          sameAs: [
            profile.store_instagram ? `https://instagram.com/${String(profile.store_instagram).replace(/^@+/, '')}` : null,
            profile.store_facebook ? `https://facebook.com/${String(profile.store_facebook).replace(/^@+/, '')}` : null,
            profile.store_website || null,
          ].filter(Boolean),
        }}
      />
      <div className="relative h-48 md:h-64 w-full overflow-hidden bg-[#14212e]">
        <img src={banner} alt="Banner" className="h-full w-full object-cover" style={{ objectPosition: `center ${bannerPosY}%` }} />
        {/* Fade inferior sutil en todos los tamaños para legibilidad del título */}
        <div
          className="pointer-events-none absolute inset-x-0 bottom-0 z-10 h-20 md:h-28 bg-gradient-to-t from-[#14212e]/80 via-transparent to-transparent"
          aria-hidden
        />
      </div>
      <Container>
        <div className="relative z-20 -mt-14 md:-mt-10 flex flex-col items-center gap-3 md:flex-row md:items-end md:gap-4">
          <img src={avatar} alt={storeName} className="h-24 w-24 md:h-20 md:w-20 rounded-2xl border-4 border-white object-cover shadow" />
          <div className="flex-1 min-w-0 pt-1 text-center md:text-left">
            <h1 className="text-2xl font-bold text-white truncate">{storeName}</h1>
            {/* Rating de Google removido */}
            {profile.verified ? (
              <div className="mt-1 inline-flex items-center gap-1 rounded-full bg-emerald-500/90 px-2.5 py-0.5 text-xs font-semibold text-white">✓ Verificado</div>
            ) : null}
            <p className="mt-1 text-sm text-white/85 truncate">{address}</p>
            <div className="mt-3 grid w-full max-w-md grid-cols-3 gap-2 justify-items-stretch md:max-w-none">
              {phone && (
                <a href={`tel:${phone}`} className="inline-flex items-center justify-center gap-2 rounded-full bg-white px-3 py-1.5 text-xs font-semibold text-[#14212e] shadow hover:bg-white/90 md:px-4 md:py-2 md:text-sm" aria-label="Llamar">
                  <PhoneIcon /> Llamar
                </a>
              )}
              <a href={storeEmail ? `mailto:${storeEmail}` : '#'} onClick={(e) => { if (!storeEmail) e.preventDefault() }} className={`inline-flex items-center justify-center gap-2 rounded-full bg-white px-3 py-1.5 text-xs font-semibold text-[#14212e] shadow md:px-4 md:py-2 md:text-sm ${storeEmail ? 'hover:bg-white/90' : 'opacity-60 cursor-not-allowed'}`} aria-label="E-mail">
                <EmailIcon /> E‑mail
              </a>
              {(() => {
                const waNumber = normaliseWhatsapp(profile.whatsapp_number || phone || '')
                const trimmedStoreName = (storeName || '').trim()
                const storeWaMessage = trimmedStoreName
                  ? `Hola ${trimmedStoreName}! Vi tu tienda en Ciclo Market.`
                  : 'Hola! Vi tu tienda en Ciclo Market.'
                const waLink = buildWhatsappUrl(waNumber || (profile.whatsapp_number || phone || ''), storeWaMessage)
                const href = waLink || undefined
                const disabled = !href
                const classes = `inline-flex items-center justify-center gap-2 rounded-full bg-white px-3 py-1.5 text-xs font-semibold text-[#14212e] shadow md:px-4 md:py-2 md:text-sm ${disabled ? 'opacity-60 cursor-not-allowed' : 'hover:bg-white/90'}`
                return (
                  <a href={href} target={disabled ? undefined : '_blank'} rel={disabled ? undefined : 'noreferrer'} className={classes} onClick={(e) => { if (disabled) e.preventDefault() }} aria-label="WhatsApp">
                    <img src="/whatsapp.png" alt="" className="h-4 w-4" aria-hidden /> WhatsApp
                  </a>
                )
              })()}
            </div>
            {(profile.store_instagram || profile.store_facebook || profile.store_website) && (
              <div className="mt-3 text-center text-xs text-white/80 md:text-left">
                <span className="text-white/70">Redes:</span>{' '}
                {profile.store_instagram ? (<a href={normalizeHandle(profile.store_instagram, 'ig')} target="_blank" rel="noreferrer" className="underline hover:text-white">Instagram</a>) : null}
                {profile.store_facebook ? (<><span>{' '}|{' '}</span><a href={normalizeHandle(profile.store_facebook, 'fb')} target="_blank" rel="noreferrer" className="underline hover:text-white">Facebook</a></>) : null}
                {profile.store_website ? (<><span>{' '}|{' '}</span><a href={profile.store_website} target="_blank" rel="noreferrer" className="underline hover:text-white">Web</a></>) : null}
              </div>
            )}
          </div>
        </div>

        {/* Bloque de "Dejar reseña en Google" removido */}

        <div className="mt-6 space-y-6">
          {workingHours && (
            <div className="rounded-xl border border-white/10 bg-white/5 p-3 text-white">
              <div className="flex items-center justify-between text-sm font-semibold">
                <span>Horarios de atención</span>
              </div>
              <p className="mt-2 whitespace-pre-line text-sm text-white/80">{workingHours}</p>
            </div>
          )}

          <div className="space-y-6">
            <div className="grid grid-cols-3 gap-2 sm:gap-4">
              {STORE_CATEGORY_BANNERS.map((card) => {
                const isActive = card.section ? activeSection === card.section : !activeSection
                return (
                  <button
                    key={card.key}
                    type="button"
                    onClick={() => setSection(card.section)}
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

            <div className="sm:hidden text-xs text-white/70">{finalList.length} resultados</div>

            <div className="hidden flex-col gap-3 sm:flex lg:flex-row lg:items-center lg:justify-between">
              <div className="text-sm text-white/70">{finalList.length} resultados</div>
              <div className="flex items-center gap-2 text-sm">
                <span className="text-white/60">Ordenar</span>
                <select
                  className="input w-48 rounded-full border border-white/10 bg-white/90 text-sm text-[#14212e]"
                  value={sortMode}
                  onChange={(e) => setSortMode(e.target.value as 'relevance' | 'newest' | 'asc' | 'desc')}
                >
                  <option value="relevance">Relevancia</option>
                  <option value="newest">Más recientes</option>
                  <option value="desc">Precio: mayor a menor</option>
                  <option value="asc">Precio: menor a mayor</option>
                </select>
              </div>
            </div>

            <div className="hidden flex-wrap gap-2 sm:flex">
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
                        onChange={(next) => setFilters({ [key]: next } as Partial<StoreFiltersState>)}
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
              <FilterDropdown label="Promos" summary={filters.deal === '1' ? 'Activas' : 'Todas'}>
                {({ close }) => (
                  <DealFilterContent
                    active={filters.deal === '1'}
                    onToggle={(active) => setFilters({ deal: active ? '1' : undefined })}
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

            <div className="grid -mx-2 grid-cols-1 gap-0 sm:mx-0 sm:grid-cols-2 sm:gap-4 lg:grid-cols-3 items-start content-start">
              {finalList.map((l, idx) => (
                <div key={l.id} className="p-2 sm:p-0">
                  <ListingCard l={l} storeLogoUrl={profile.store_avatar_url || profile.avatar_url || null} priority={idx < 4} />
                </div>
              ))}
              {finalList.length === 0 && (
                <div className="py-12 text-center text-[#14212e]/60 col-span-full">No hay productos en esta categoría.</div>
              )}
            </div>
          </div>
        </div>
      </Container>

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
                          onChange={(next) => setFilters({ [key]: next } as Partial<StoreFiltersState>)}
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
                  summary={filters.deal === '1' ? 'Activas' : 'Todas'}
                  className="w-full"
                  buttonClassName="w-full justify-between"
                  inlineOnMobile
                >
                  {({ close }) => (
                    <DealFilterContent
                      active={filters.deal === '1'}
                      onToggle={(active) => setFilters({ deal: active ? '1' : undefined })}
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
    </div>
  )
}

function normalizeHandle(value: string, type: 'ig' | 'fb') {
  const v = (value || '').trim()
  if (!v) return '#'
  if (type === 'ig') {
    if (/^https?:\/\//i.test(v)) return v
    return `https://instagram.com/${v.replace(/^@+/, '')}`
  }
  if (/^https?:\/\//i.test(v)) return v
  return `https://facebook.com/${v.replace(/^@+/, '')}`
}

function PhoneIcon() {
  return <img src="/call.png" alt="" className="h-5 w-5" loading="lazy" decoding="async" aria-hidden />
}
function EmailIcon() {
  return (
    <svg viewBox="0 0 24 24" className="h-4 w-4" fill="none" stroke="currentColor" strokeWidth={1.8} aria-hidden>
      <path strokeLinecap="round" strokeLinejoin="round" d="M4 6h16a2 2 0 0 1 2 2v8a2 2 0 0 1-2 2H4a2 2 0 0 1-2-2V8a2 2 0 0 1 2-2Zm0 0 8 6 8-6" />
    </svg>
  )
}
function InstagramIcon() {
  return (
    <svg viewBox="0 0 24 24" className="h-4 w-4" fill="currentColor" aria-hidden>
      <path d="M7 2h10a5 5 0 0 1 5 5v10a5 5 0 0 1-5 5H7a5 5 0 0 1-5-5V7a5 5 0 0 1 5-5m5 5a5 5 0 1 0 0 10 5 5 0 0 0 0-10m6.5-.25a1.25 1.25 0 1 0 0 2.5a1.25 1.25 0 0 0 0-2.5Z" />
    </svg>
  )
}
function FacebookIcon() {
  return (
    <svg className="h-4 w-4" viewBox="0 0 24 24" aria-hidden>
      <path fill="#fff" d="M24 12.073C24 5.405 18.627 0 12 0S0 5.405 0 12.073C0 18.1 4.388 23.094 10.125 24v-8.437H7.078v-3.49h3.047V9.356c0-3.007 1.792-4.668 4.533-4.668 1.312 0 2.686.235 2.686.235v2.97h-1.513c-1.49 0-1.954.928-1.954 1.88v2.26h3.328l-.532 3.49h-2.796V24C19.612 23.094 24 18.1 24 12.073z"/>
    </svg>
  )
}
function LinkIcon() {
  return (
    <svg viewBox="0 0 24 24" className="h-4 w-4" fill="none" stroke="currentColor" strokeWidth={2}>
      <path strokeLinecap="round" strokeLinejoin="round" d="M10.5 13.5 13.5 10.5m-8 8 3-3m5-5 3-3M7.5 16.5A4.5 4.5 0 1 1 1.5 10.5 4.5 4.5 0 0 1 7.5 16.5Zm9-9A4.5 4.5 0 1 1 12.5 1.5 4.5 4.5 0 0 1 16.5 7.5Z" />
    </svg>
  )
}
// MenuIcon ya no se usa
