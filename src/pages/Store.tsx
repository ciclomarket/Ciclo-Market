import { useCallback, useEffect, useMemo, useState, useRef } from 'react'
import { Link, useParams, useSearchParams } from 'react-router-dom'
import { CalendarDays, Globe, Instagram, MapPin, Package } from 'lucide-react'
import Container from '../components/Container'
import SeoHead, { type SeoHeadProps } from '../components/SeoHead'
import FilterDropdown from '../components/FilterDropdown'
import { fetchUserProfile, fetchStoreProfileBySlug, fetchUserContactEmail, type UserProfileRecord } from '../services/users'
import { track, trackOncePerSession } from '../services/track'
import { useCurrency } from '../context/CurrencyContext'
import { normaliseWhatsapp, buildWhatsappUrl } from '../utils/whatsapp'
import { fetchListingsBySeller } from '../services/listings'
import ListingCard from '../components/ListingCard'
import type { Listing } from '../types'
const API_BASE = (import.meta.env.VITE_API_BASE_URL || '').replace(/\/$/, '')
import { buildPublicUrlSafe } from '../lib/supabaseImages'
import { fetchLikeCounts } from '../services/likes'
import { useAuth } from '../context/AuthContext'
import { resolveSiteOrigin, toAbsoluteUrl as absoluteUrl, buildBreadcrumbList } from '../utils/seo'

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

const isJsonLdObject = (value: unknown): value is Record<string, unknown> => {
  if (!value || typeof value !== 'object' || Array.isArray(value)) return false
  return Object.keys(value as Record<string, unknown>).length > 0
}

const filterJsonLdArray = (input: unknown[]): Record<string, unknown>[] =>
  input.filter(isJsonLdObject) as Record<string, unknown>[]

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
    id: 'nutrition',
    label: 'Nutrición',
    options: [
      { id: 'all', label: 'Toda Nutrición', match: (l) => (l.category || '').toLowerCase().includes('nutric') },
      { id: 'gel', label: 'Geles', match: (l) => (l.category || '').toLowerCase().includes('nutric') && (subcatIs(l, 'gel') || textIncludes(l, 'gel')) },
      { id: 'barra', label: 'Barras', match: (l) => (l.category || '').toLowerCase().includes('nutric') && (subcatIs(l, 'barra') || textIncludes(l, 'barra')) },
      { id: 'hidratacion', label: 'Hidratación / Sales', match: (l) => (l.category || '').toLowerCase().includes('nutric') && (subcatIs(l, 'sales','hidrat') || textIncludes(l, 'sales', 'hidrat')) },
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

type MultiFilterKey = 'brand' | 'material' | 'frameSize' | 'wheelSize' | 'drivetrain' | 'condition' | 'brake' | 'year' | 'size' | 'transmissionType'
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
  transmissionType: string[]
  priceCur?: 'USD' | 'ARS'
  priceMin?: number
  priceMax?: number
  deal?: '1'
  q?: string
}

const MULTI_FILTER_ORDER: MultiFilterKey[] = ['brand','material','frameSize','wheelSize','drivetrain','condition','brake','year','size','transmissionType']
// UI ordering helpers for filters (avoid duplicate frameSize vs size)
const UI_FILTERS_BEFORE_PRICE: MultiFilterKey[] = ['size']
const UI_FILTERS_AFTER_PRICE: MultiFilterKey[] = ['brand','material','brake','year','condition','drivetrain','transmissionType','wheelSize']
const MULTI_FILTER_LABELS: Record<MultiFilterKey, string> = {
  brand: 'Marca',
  material: 'Material',
  frameSize: 'Tamaño cuadro',
  wheelSize: 'Rodado',
  drivetrain: 'Grupo transmisión',
  condition: 'Condición',
  brake: 'Freno',
  year: 'Año',
  size: 'Talle',
  transmissionType: 'Tipo de transmisión'
}

type ListingMetadata = {
  condition?: string
  brake?: string
  apparelSize?: string
  transmissionType?: 'Mecánico' | 'Electrónico'
}

type ListingFacetsResult = {
  options: Record<MultiFilterKey, string[]>
  priceRange: { min: number; max: number }
  priceRangeByCur: { USD: { min: number; max: number } | null; ARS: { min: number; max: number } | null }
  metadata: Record<string, ListingMetadata>
}

const APPAREL_SIZE_ORDER = ['XXS','XS','S','M','L','XL','XXL','XXXL','4XL','5XL']
// Mapeo de talles de cuadro (letras) a rangos en cm para filtrado
const FRAME_SIZE_RANGES: Record<string, { min: number; max?: number }> = {
  xxs: { min: 44, max: 47 },
  xs: { min: 48, max: 50 },
  s: { min: 51, max: 53 },
  m: { min: 54, max: 55 },
  l: { min: 56, max: 58 },
  xxl: { min: 59, max: 62 },
  xxxl: { min: 62, max: undefined }, // 62+ cm
}
const FRAME_SIZE_ORDER = ['XXS','XS','S','M','L','XXL','XXXL'] as const

const parseFrameSizeCm = (value?: string | null): number | null => {
  if (!value) return null
  const txt = value.toString().toLowerCase().replace(/,/g, '.').trim()
  const m = txt.match(/(\d{2}(?:\.\d+)?)/)
  if (!m) return null
  const n = Number(m[1])
  return Number.isFinite(n) ? n : null
}

const normalizeText = (value: string) => value
  ? value
      .normalize('NFD')
      .replace(/[\u0300-\u036f]/g, '')
      .trim()
      .toLowerCase()
  : ''

const isListingPubliclyVisible = (listing: Listing): boolean => {
  const status = (listing.status || '').toLowerCase()
  if (status === 'archived' || status === 'deleted' || status === 'draft' || status === 'expired') return false
  if (typeof listing.expiresAt === 'number' && listing.expiresAt > 0 && listing.expiresAt < Date.now()) return false
  return true
}

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

const formatList = (values: string[], limit = 3) => {
  const unique = Array.from(new Set(values.map((v) => v.trim()).filter(Boolean)))
  const sliced = unique.slice(0, limit)
  if (!sliced.length) return ''
  if (sliced.length === 1) return sliced[0]
  return `${sliced.slice(0, -1).join(', ')} y ${sliced[sliced.length - 1]}`
}

const ensureUrl = (value?: string | null) => {
  if (!value) return null
  const trimmed = value.trim()
  if (!trimmed) return null
  if (/^https?:\/\//i.test(trimmed)) return trimmed
  return `https://${trimmed.replace(/^\/+/, '')}`
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

// Inferir tipo de transmisión a partir de texto del grupo o detalle
const inferTransmissionType = (text?: string | null): 'Mecánico' | 'Electrónico' | null => {
  const t = (text || '').toLowerCase()
  if (!t) return null
  if (t.includes('di2') || t.includes('etap') || t.includes('axs') || t.includes('eps') || t.includes('steps')) return 'Electrónico'
  return 'Mecánico'
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
    size: new Set(),
    transmissionType: new Set(),
  }
  const metadata: Record<string, ListingMetadata> = {}
  let minPrice = Number.POSITIVE_INFINITY
  let maxPrice = 0
  let minUSD = Number.POSITIVE_INFINITY
  let maxUSD = 0
  let minARS = Number.POSITIVE_INFINITY
  let maxARS = 0

  for (const listing of listings) {
    const brand = cleanValue(listing.brand)
    if (brand) sets.brand.add(brand)

    const material = cleanValue(listing.material)
    if (material) sets.material.add(material)

    const frameSize = cleanValue(listing.frameSize)
    if (frameSize) { sets.frameSize.add(frameSize); sets.size.add(frameSize) }
    // Agregar múltiples talles desde extras si existen
    const extrasMap = extractExtrasMap(listing.extras)
    const multi = extrasMap.talles
    if (multi) {
      multi.split(',').map((s) => s.trim()).filter(Boolean).forEach((s) => { sets.frameSize.add(s); sets.size.add(s) })
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

    const txType = inferTransmissionType((listing as any).drivetrainDetail) || inferTransmissionType(listing.drivetrain) || ((): 'Mecánico' | 'Electrónico' | null => {
      const m = extractExtrasMap(listing.extras)
      return inferTransmissionType(m.grupo || m['transmisión'] || m.transmision || null)
    })()
    if (txType) sets.transmissionType.add(txType)

    metadata[listing.id] = {
      condition: condition || undefined,
      brake: brake || undefined,
      apparelSize: apparelSize || undefined,
      transmissionType: txType || undefined
    }

    const price = Number(listing.price)
    if (Number.isFinite(price) && price > 0) {
      if (price < minPrice) minPrice = price
      if (price > maxPrice) maxPrice = price
      const cur = (listing.priceCurrency || 'ARS') as 'USD' | 'ARS'
      if (cur === 'USD') {
        if (price < minUSD) minUSD = price
        if (price > maxUSD) maxUSD = price
      } else {
        if (price < minARS) minARS = price
        if (price > maxARS) maxARS = price
      }
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
      size: sortSizes(sets.size),
      transmissionType: sortAlpha(sets.transmissionType)
    },
    priceRange: {
      min: Number.isFinite(minPrice) ? Math.floor(minPrice) : 0,
      max: Number.isFinite(maxPrice) ? Math.ceil(maxPrice) : 0
    },
    priceRangeByCur: {
      USD: Number.isFinite(minUSD) && Number.isFinite(maxUSD) && maxUSD > 0 ? { min: Math.floor(minUSD), max: Math.ceil(maxUSD) } : null,
      ARS: Number.isFinite(minARS) && Number.isFinite(maxARS) && maxARS > 0 ? { min: Math.floor(minARS), max: Math.ceil(maxARS) } : null,
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
          className="input h-10 w-full rounded-full border border-gray-200 bg-white px-4 text-sm text-[#14212e] placeholder:text-gray-400 focus:outline-none focus:ring-2 focus:ring-mb-primary/20"
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
                  <label className="flex cursor-pointer items-center gap-2 rounded-lg px-2 py-1 hover:bg-gray-50">
                    <input
                      type="checkbox"
                      checked={checked}
                      onChange={() => toggleOption(option)}
                      className="h-4 w-4 accent-mb-primary"
                    />
                    <span>{option}</span>
                  </label>
                </li>
              )
            })}
          </ul>
        ) : (
          <div className="py-4 text-sm text-gray-500">Sin coincidencias.</div>
        )}
      </div>
      <div className="flex items-center justify-between pt-1 text-sm">
        <button
          type="button"
          onClick={() => {
            onChange([])
            close()
          }}
          className="text-gray-600 hover:text-gray-900"
        >
          Limpiar
        </button>
        <button type="button" onClick={close} className="rounded-full bg-mb-primary px-3 py-1 font-semibold text-white hover:bg-mb-primary/90">
          Listo
        </button>
      </div>
    </div>
  )
}

// Selector especializado para Talle: letras con rango + otros talles libres
function SizeSelectContent({ options, selected, onChange, close }: { options: string[]; selected: string[]; onChange: (next: string[]) => void; close: () => void }) {
  const normalizedSelected = useMemo(() => new Set(selected.map((v) => normalizeText(v))), [selected])
  const letterOptions = FRAME_SIZE_ORDER.map((k) => k)
  const otherOptions = useMemo(() => {
    const letterSet = new Set(letterOptions.map((x) => normalizeText(x)))
    const uniq = Array.from(new Set(options.map((o) => o.trim()).filter(Boolean)))
    return uniq.filter((opt) => !letterSet.has(normalizeText(opt)))
  }, [options])

  const toggle = (val: string) => {
    const norm = normalizeText(val)
    if (normalizedSelected.has(norm)) onChange(selected.filter((s) => normalizeText(s) !== norm))
    else onChange([...selected, val])
  }

  const labelFor = (k: (typeof FRAME_SIZE_ORDER)[number]) => {
    const range = FRAME_SIZE_RANGES[k.toLowerCase()]
    if (!range) return k
    const suffix = typeof range.max === 'number' ? `${range.min}-${range.max} cm` : `${range.min}+ cm`
    return `${k} (${suffix})`
  }

  return (
    <div className="flex flex-col gap-3 text-sm">
      <div className="flex flex-col gap-2">
        {letterOptions.map((opt) => {
          const active = normalizedSelected.has(normalizeText(opt))
          return (
            <label key={opt} className={`flex cursor-pointer items-center gap-2 rounded-lg px-2 py-1 hover:bg-gray-50 ${active ? 'bg-gray-50' : ''}`}>
              <input type="checkbox" className="h-4 w-4 accent-mb-primary" checked={active} onChange={() => toggle(opt)} />
              <span>{labelFor(opt)}</span>
            </label>
          )
        })}
      </div>
      {otherOptions.length ? (
        <>
          <div className="mt-1 text-xs text-gray-500">Otros talles</div>
          <div className="max-h-40 overflow-y-auto pr-1">
            <ul className="flex flex-col gap-2">
              {otherOptions.map((opt) => {
                const active = normalizedSelected.has(normalizeText(opt))
                return (
                  <li key={opt}>
                    <label className="flex cursor-pointer items-center gap-2 rounded-lg px-2 py-1 hover:bg-gray-50">
                      <input type="checkbox" className="h-4 w-4 accent-mb-primary" checked={active} onChange={() => toggle(opt)} />
                      <span>{opt}</span>
                    </label>
                  </li>
                )
              })}
            </ul>
          </div>
        </>
      ) : null}
      <div className="flex items-center justify-between pt-1 text-sm">
        <button type="button" onClick={() => { onChange([]); close() }} className="text-gray-600 hover:text-gray-900">Limpiar</button>
        <button type="button" onClick={close} className="rounded-full bg-mb-primary px-3 py-1 font-semibold text-white hover:bg-mb-primary/90">Listo</button>
      </div>
    </div>
  )
}

type PriceFilterContentProps = {
  min?: number
  max?: number
  bounds: { min: number; max: number }
  currency?: 'USD' | 'ARS'
  boundsByCur?: { USD: { min: number; max: number } | null; ARS: { min: number; max: number } | null }
  onCurrencyChange?: (cur?: 'USD' | 'ARS') => void
  onApply: (range: { min?: number; max?: number }) => void
  onClear: () => void
  close: () => void
}

function PriceFilterContent({ min, max, bounds, currency, boundsByCur, onCurrencyChange, onApply, onClear, close }: PriceFilterContentProps) {
  const [minValue, setMinValue] = useState(min ? String(min) : '')
  const [maxValue, setMaxValue] = useState(max ? String(max) : '')
  const [localCur, setLocalCur] = useState<'USD' | 'ARS' | undefined>(currency)
  const { fx } = useCurrency()

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

  useEffect(() => { setLocalCur(currency) }, [currency])

  const symbol = localCur === 'USD' ? 'USD ' : '$'
  const effBounds = (() => {
    if (localCur && boundsByCur) {
      const b = boundsByCur[localCur]
      if (b) return b
    }
    return bounds
  })()

  return (
    <div className="flex flex-col gap-3 text-sm">
      <div className="flex items-center justify-end gap-2">
        {onCurrencyChange ? (
          <div className="inline-flex items-center rounded-full border border-gray-200 bg-gray-50 p-0.5">
            {(['ARS','USD'] as const).map((cur) => (
              <button
                key={cur}
                type="button"
                onClick={() => { const next = localCur === cur ? undefined : cur; setLocalCur(next); onCurrencyChange(next) }}
                className={`px-2 py-1 text-xs rounded-full ${
                  localCur === cur ? 'bg-white text-[#14212e] shadow-sm' : 'text-gray-600 hover:text-gray-900'
                }`}
              >
                {cur}
              </button>
            ))}
          </div>
        ) : null}
      </div>
      <div className="text-xs text-gray-500">
        Rango disponible: {effBounds.min ? `${symbol}${localCur === 'USD' ? effBounds.min.toLocaleString('en-US') : effBounds.min.toLocaleString('es-AR')}` : '—'} – {effBounds.max ? `${symbol}${localCur === 'USD' ? effBounds.max.toLocaleString('en-US') : effBounds.max.toLocaleString('es-AR')}` : '—'}
      </div>
      <div className="text-[11px] text-gray-400">
        Conversión: 1 USD = {fx.toLocaleString('es-AR')} ARS
      </div>
      <div className="grid grid-cols-2 gap-3">
        <label className="flex flex-col gap-1">
          <span className="text-xs text-gray-500">Desde</span>
          <input
            type="number"
            min={0}
            value={minValue}
            onChange={(event) => setMinValue(event.target.value)}
            className="input h-10 rounded-full border border-gray-200 bg-white px-3 text-[#14212e] focus:outline-none focus:ring-2 focus:ring-mb-primary/20"
          />
        </label>
        <label className="flex flex-col gap-1">
          <span className="text-xs text-gray-500">Hasta</span>
          <input
            type="number"
            min={0}
            value={maxValue}
            onChange={(event) => setMaxValue(event.target.value)}
            className="input h-10 rounded-full border border-gray-200 bg-white px-3 text-[#14212e] focus:outline-none focus:ring-2 focus:ring-mb-primary/20"
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
          className="text-gray-600 hover:text-gray-900"
        >
          Limpiar
        </button>
        <div className="flex gap-2">
          <button
            type="button"
            onClick={close}
            className="rounded-full border border-gray-200 px-3 py-1 text-gray-700 hover:bg-gray-50"
          >
            Cancelar
          </button>
          <button
            type="button"
            onClick={apply}
            className="rounded-full bg-mb-primary px-3 py-1 font-semibold text-white hover:bg-mb-primary/90"
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
      <label className="flex cursor-pointer items-center gap-3 rounded-xl border border-gray-200 bg-white px-3 py-2 hover:bg-gray-50">
        <input
          type="checkbox"
          checked={active}
          onChange={(event) => onToggle(event.target.checked)}
          className="h-4 w-4 accent-mb-primary"
        />
        <div>
          <div className="font-medium text-mb-ink">Solo con descuento</div>
          <div className="text-xs text-gray-500 whitespace-normal break-words leading-snug">Productos con precio rebajado sobre el original.</div>
        </div>
      </label>
      <button
        type="button"
        onClick={() => {
          onToggle(false)
          close()
        }}
        className="self-end rounded-full bg-mb-primary px-3 py-1 text-xs font-semibold text-white hover:bg-mb-primary/90"
      >
        Listo
      </button>
    </div>
  )
}
const STORE_CATEGORY_BANNERS: Array<{ key: 'all' | 'acc' | 'app' | 'nut'; label: string; section: '' | 'accessories' | 'apparel' | 'nutrition'; description: string; image: string; imageMobile: string }> = [
  {
    key: 'all',
    label: 'Bicicletas',
    section: '',
    description: 'Solo bicicletas',
    image: '/design/Banners/1.webp',
    imageMobile: '/design/Banners-Mobile/1.webp'
  },
  {
    key: 'acc',
    label: 'Accesorios',
    section: 'accessories',
    description: 'Componentes y upgrades',
    image: '/design/Banners/2.webp',
    imageMobile: '/design/Banners-Mobile/2.webp'
  },
  {
    key: 'app',
    label: 'Indumentaria',
    section: 'apparel',
    description: 'Ropa técnica y casual',
    image: '/design/Banners/3.webp',
    imageMobile: '/design/Banners-Mobile/3.webp'
  },
  {
    key: 'nut',
    label: 'Nutrición',
    section: 'nutrition',
    description: 'Geles, hidratación y recovery',
    image: '/design/Banners/4.webp',
    imageMobile: '/design/Banners-Mobile/4.webp'
  }
]

export default function Store() {
  const { fx } = useCurrency()
  const { user } = useAuth()
  const params = useParams()
  const [search, setSearch] = useSearchParams()
  const siteOrigin = useMemo(() => resolveSiteOrigin(), [])
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
    transmissionType: [],
    priceCur: undefined,
    priceMin: undefined,
    priceMax: undefined,
    deal: undefined,
    q: undefined
  })
  const [mobileFiltersOpen, setMobileFiltersOpen] = useState(false)
  const [mobileSortOpen, setMobileSortOpen] = useState(false)
  const [sortMode, setSortMode] = useState<'relevance' | 'newest' | 'asc' | 'desc'>('relevance')
  const [hoursOpen, setHoursOpen] = useState(false)
  const [hoursStyle, setHoursStyle] = useState<React.CSSProperties>({})
  const [hoursArrowLeft, setHoursArrowLeft] = useState<number>(16)
  const hoursRef = useRef<HTMLDivElement | null>(null)

  useEffect(() => {
    if (!hoursOpen) return
    let raf = 0
    const measureAndSet = () => {
      const root = hoursRef.current
      if (!root) return
      const rect = root.getBoundingClientRect()
      const vw = window.innerWidth
      const vh = window.innerHeight
      const padding = 8
      const desired = vw < 480 ? Math.min(320, vw - padding * 2) : Math.min(360, vw - padding * 2)
      const centerX = rect.left + rect.width / 2
      const left = Math.max(padding, Math.min(centerX - desired / 2, vw - desired - padding))
      const top = Math.min(rect.bottom + 8, vh - 16)
      setHoursStyle({ position: 'fixed', top, left, width: desired })
      setHoursArrowLeft(Math.max(16, Math.min(desired - 16, centerX - left)))
    }
    const schedule = () => {
      if (raf) cancelAnimationFrame(raf)
      raf = requestAnimationFrame(measureAndSet)
    }
    const handleClickAway = (e: MouseEvent) => {
      const root = hoursRef.current
      if (!root) return
      const target = e.target as Node
      if (!root.contains(target)) setHoursOpen(false)
    }
    const handleKey = (e: KeyboardEvent) => { if (e.key === 'Escape') setHoursOpen(false) }
    schedule()
    window.addEventListener('resize', schedule)
    window.addEventListener('scroll', schedule, { passive: true })
    document.addEventListener('mousedown', handleClickAway)
    document.addEventListener('keydown', handleKey)
    return () => {
      if (raf) cancelAnimationFrame(raf)
      window.removeEventListener('resize', schedule)
      window.removeEventListener('scroll', schedule)
      document.removeEventListener('mousedown', handleClickAway)
      document.removeEventListener('keydown', handleKey)
    }
  }, [hoursOpen])

  const renderWorkingHours = (text?: string | null) => {
    const raw = (text || '').trim()
    if (!raw) return null
    const lines = raw.split(/\r?\n/).map((l) => l.trim()).filter(Boolean)
    if (!lines.length) return <p className="text-xs text-white/85">{raw}</p>
    const normalizeVal = (v: string) => v
      .replace(/\s*a\s*/gi, ' – ')
      .replace(/\s*[-–]\s*/g, ' – ')
      .replace(/\s+/g, ' ')
      .trim()

    return (
      <ul className="space-y-1 text-xs">
        {lines.map((rawLine, idx) => {
          const line = rawLine.replace(/\s+/g, ' ').trim()
          // Caso 1: "Día: horario" con el ":" actuando como separador de etiqueta (antes del primer número)
          const colonIdx = line.indexOf(':')
          const firstDigitIdx = line.search(/\d/)
          if (colonIdx > 0 && (firstDigitIdx === -1 || colonIdx < firstDigitIdx)) {
            const day = line.slice(0, colonIdx).trim()
            const val = normalizeVal(line.slice(colonIdx + 1).trim())
            return (
              <li key={idx} className="flex items-baseline gap-3">
                <span className="w-28 sm:w-32 shrink-0 font-medium text-white/90">{day}</span>
                <span className="text-white/85 tabular-nums font-mono">{val}</span>
              </li>
            )
          }
          // Caso 2: "Día horario" donde el primer número marca el inicio del horario
          if (firstDigitIdx > 0) {
            const day = line.slice(0, firstDigitIdx).trim()
            const val = normalizeVal(line.slice(firstDigitIdx).trim())
            return (
              <li key={idx} className="flex items-baseline gap-3">
                <span className="w-28 sm:w-32 shrink-0 font-medium text-white/90">{day}</span>
                <span className="text-white/85 tabular-nums font-mono">{val}</span>
              </li>
            )
          }
          // Fallback: línea completa como valor
          return (
            <li key={idx} className="text-white/85 tabular-nums">{line}</li>
          )
        })}
      </ul>
    )
  }
  const activeSection = (search.get('sec') || '').trim()
  const activeOption = (search.get('opt') || '').trim()
  const bikesOnly = (search.get('bikes') || '').trim() === '1'

  const setSection = useCallback((sec: string, opt?: string, bikes?: boolean) => {
    const next = new URLSearchParams(search)
    if (!sec) {
      next.delete('sec')
      next.delete('opt')
    } else {
      next.set('sec', sec)
      if (!opt) next.delete('opt')
      else next.set('opt', opt)
    }
    if (bikes) next.set('bikes', '1')
    else next.delete('bikes')
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
      brake: 'brake' in patch ? patch.brake ?? [] : prev.brake,
      year: 'year' in patch ? patch.year ?? [] : prev.year,
      size: 'size' in patch ? patch.size ?? [] : prev.size,
      transmissionType: 'transmissionType' in patch ? patch.transmissionType ?? [] : prev.transmissionType,
      priceCur: 'priceCur' in patch ? patch.priceCur : prev.priceCur,
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
      track('store_view', { store_user_id: pid, user_id: user?.id || null })
    })
  }, [profile?.id, user?.id])

  useEffect(() => {
    let mounted = true
    const load = async () => {
      if (!sellerId) { setListings([]); return }
      const rows = await fetchListingsBySeller(sellerId)
      if (!mounted) return
      setListings(rows.filter(isListingPubliclyVisible))
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
  // Aplicar filtro de "Solo bicicletas" si bikesOnly = true
  const baseList = useMemo(() => {
    if (!bikesOnly) return sectionFiltered
    return sectionFiltered.filter((l) => {
      const c = (l.category || '')
      return c !== 'Accesorios' && c !== 'Indumentaria' && c !== 'Nutrición'
    })
  }, [sectionFiltered, bikesOnly])
  const facetsData = useMemo(() => computeListingFacets(baseList), [baseList])
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
    const txTypeSet = new Set(filters.transmissionType.map((value) => normalizeText(value)))
    const priceMin = typeof filters.priceMin === 'number' ? filters.priceMin : null
    const priceMax = typeof filters.priceMax === 'number' ? filters.priceMax : null

    const matchesValue = (value: string | undefined, activeSet: Set<string>) => {
      if (!activeSet.size) return true
      if (!value) return false
      return activeSet.has(normalizeText(value))
    }

    return baseList.filter((listing) => {
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

      if (txTypeSet.size) {
        const derivedTx = (listingMetadata[listing.id] ?? {}).transmissionType || inferTransmissionType(listing.drivetrain)
        if (!derivedTx || !txTypeSet.has(normalizeText(derivedTx))) return false
      }

      if (sizeSet.size) {
        const selectedLetters = filters.size
          .map((v) => normalizeText(v))
          .filter((v) => v in FRAME_SIZE_RANGES)
        const selectedNumeric = filters.size
          .map((v) => parseFrameSizeCm(v))
          .filter((n): n is number => Number.isFinite(n as number))

        const extrasMap = extractExtrasMap(listing.extras)
        const frameCm = parseFrameSizeCm(listing.frameSize)
        const extrasCandidates: number[] = []
        const sizeTextCandidates: string[] = []
        if (extrasMap['tamano cuadro']) sizeTextCandidates.push(extrasMap['tamano cuadro'])
        if (extrasMap['talle']) sizeTextCandidates.push(extrasMap['talle'])
        if (extrasMap['talles']) sizeTextCandidates.push(...extrasMap['talles'].split(',').map((s) => s.trim()))
        for (const txt of sizeTextCandidates) {
          const n = parseFrameSizeCm(txt)
          if (n != null) extrasCandidates.push(n)
        }

        const frameMatch = listing.frameSize ? sizeSet.has(normalizeText(listing.frameSize)) : false
        const hasSingle = ((): boolean => {
          const val = (listingMetadata[listing.id] ?? {}).apparelSize
          return Boolean(val && sizeSet.has(normalizeText(val)))
        })()
        const anyMulti = (extrasMap.talles || '')
          .split(',')
          .map((s) => s.trim())
          .filter(Boolean)
          .some((s) => sizeSet.has(normalizeText(s)))
        const numericEq = (frameCm != null && selectedNumeric.includes(frameCm)) || extrasCandidates.some((n) => selectedNumeric.includes(n))
        let letterRange = false
        const candidates = [frameCm, ...extrasCandidates.filter((n) => n != null)] as number[]
        for (const cm of candidates) {
          if (cm == null) continue
          for (const key of selectedLetters) {
            const range = FRAME_SIZE_RANGES[key]
            if (!range) continue
            if (typeof range.max === 'number') {
              if (cm >= range.min && cm <= range.max) { letterRange = true; break }
            } else {
              if (cm >= range.min) { letterRange = true; break }
            }
          }
          if (letterRange) break
        }
        if (!(frameMatch || hasSingle || anyMulti || numericEq || letterRange)) return false
      }

      // Precio: convertir a moneda seleccionada usando fx y aplicar rango
      const listCur = (String(listing.priceCurrency || 'ARS').toUpperCase() as 'USD' | 'ARS')
      const toSelected = (value: number): number => {
        if (!filters.priceCur) return value
        if (filters.priceCur === listCur) return value
        return filters.priceCur === 'USD' ? value / fx : value * fx
      }
      const priceInSelected = toSelected(listing.price)
      if (priceMin !== null && priceInSelected < priceMin) return false
      if (priceMax !== null && priceInSelected > priceMax) return false

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
  }, [baseList, filters, listingMetadata])

  const finalList = useMemo(() => {
    const arr = [...filtered]
    if (sortMode === 'relevance') {
      // Si no hay filtros activos, priorizar bicicletas primero
      const anyFilter = Boolean(
        activeSection || activeOption || bikesOnly ||
        filters.q || filters.deal || filters.priceCur ||
        typeof filters.priceMin === 'number' || typeof filters.priceMax === 'number' ||
        filters.brand.length || filters.material.length || filters.frameSize.length || filters.wheelSize.length ||
        filters.drivetrain.length || filters.condition.length || filters.brake.length || filters.year.length ||
        filters.size.length || filters.transmissionType.length
      )
      if (!anyFilter) {
        const isBike = (l: Listing) => {
          const c = (l.category || '')
          return c !== 'Accesorios' && c !== 'Indumentaria' && c !== 'Nutrición'
        }
        const bikes = arr.filter(isBike)
        const others = arr.filter((l) => !isBike(l))
        return [...bikes, ...others]
      }
      return arr
    }
    if (sortMode === 'newest') {
      return arr.sort((a, b) => (b.createdAt ?? 0) - (a.createdAt ?? 0))
    }
    if (sortMode === 'asc') {
      const toSelected = (l: Listing) => {
        if (!filters.priceCur) return l.price ?? 0
        const cur = (String(l.priceCurrency || 'ARS').toUpperCase() as 'USD' | 'ARS')
        const base = l.price ?? 0
        return filters.priceCur === cur ? base : (filters.priceCur === 'USD' ? base / fx : base * fx)
      }
      return arr.sort((a, b) => toSelected(a) - toSelected(b))
    }
    if (sortMode === 'desc') {
      const toSelected = (l: Listing) => {
        if (!filters.priceCur) return l.price ?? 0
        const cur = (String(l.priceCurrency || 'ARS').toUpperCase() as 'USD' | 'ARS')
        const base = l.price ?? 0
        return filters.priceCur === cur ? base : (filters.priceCur === 'USD' ? base / fx : base * fx)
      }
      return arr.sort((a, b) => toSelected(b) - toSelected(a))
    }
    return arr
  }, [filtered, sortMode])

  // Batch-like counts for visible final list
  const [likeCounts, setLikeCounts] = useState<Record<string, number>>({})
  useEffect(() => {
    const ids = finalList.map((l) => l.id)
    if (!ids.length) { setLikeCounts({}); return }
    let active = true
    ;(async () => {
      try {
        const map = await fetchLikeCounts(ids)
        if (active) setLikeCounts(map)
      } catch { /* noop */ }
    })()
    return () => { active = false }
  }, [finalList.map((l) => l.id).join(',')])

  const summaryFor = (key: MultiFilterKey) => {
    const values = filters[key]
    if (!values.length) return 'Todos'
    if (values.length === 1) return values[0]
    return `${values.length} seleccionadas`
  }

  const priceSummary = (() => {
    const { priceMin, priceMax, priceCur } = filters
    const symbol = priceCur === 'USD' ? 'USD ' : '$'
    if (typeof priceMin === 'number' || typeof priceMax === 'number') {
      const minLabel = typeof priceMin === 'number' ? `${symbol}${priceCur === 'USD' ? priceMin.toLocaleString('en-US') : priceMin.toLocaleString('es-AR')}` : 'Min'
      const maxLabel = typeof priceMax === 'number' ? `${symbol}${priceCur === 'USD' ? priceMax.toLocaleString('en-US') : priceMax.toLocaleString('es-AR')}` : 'Max'
      return `${minLabel} – ${maxLabel}`
    }
    return priceCur ? `${priceCur}` : 'Todos'
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
  if (typeof filters.priceMin === 'number' || typeof filters.priceMax === 'number' || filters.priceCur) {
    const parts: string[] = []
    const symbol = filters.priceCur === 'USD' ? 'USD ' : '$'
    if (typeof filters.priceMin === 'number') parts.push(`desde ${symbol}${filters.priceCur === 'USD' ? filters.priceMin.toLocaleString('en-US') : filters.priceMin.toLocaleString('es-AR')}`)
    if (typeof filters.priceMax === 'number') parts.push(`hasta ${symbol}${filters.priceCur === 'USD' ? filters.priceMax.toLocaleString('en-US') : filters.priceMax.toLocaleString('es-AR')}`)
    if (!parts.length && filters.priceCur) parts.push(filters.priceCur)
    activeFilterChips.push({
      key: 'price',
      label: `Precio ${parts.join(' ')}`,
      onRemove: () => setFilters({ priceMin: undefined, priceMax: undefined, priceCur: undefined })
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

const categorySummary = useMemo(() => {
  const categories = listings
    .map((listing) => listing.category)
    .filter((value): value is NonNullable<Listing['category']> => Boolean(value))
  const unique = Array.from(new Set(categories))
  return {
    values: unique,
    label: unique.length ? formatList(unique, 3) : '',
  }
}, [listings])

const topListings = useMemo(() => listings.slice(0, Math.min(listings.length, 10)), [listings])

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

  // (moved) Desestructuración de seoMeta más abajo para evitar referenciar antes de su inicialización

  // NOTE: No leer `profile` aquí; puede ser null. Derivar dentro de `seoMeta` o después de early returns.

  const seoMeta = useMemo((): { config: Partial<SeoHeadProps>; details: { summary: string; copy: string } | null } => {
    if (!profile) {
      return {
        config: {
          title: 'Tienda no encontrada',
          description: 'Explorá las tiendas oficiales verificadas en Ciclo Market.',
          canonicalPath: params.slug ? `/tienda/${params.slug}` : undefined,
          noIndex: true,
        },
        details: null,
      }
    }

    const slug = profile.store_slug || params.slug || profile.id || ''
    const canonicalPath = slug ? `/tienda/${slug}` : undefined
    const canonicalUrl = canonicalPath ? absoluteUrl(canonicalPath, siteOrigin) : undefined
    const storeNameLocal = profile.store_name || profile.full_name || 'Tienda'
    const addressLocal = profile.store_address || [profile.city, profile.province].filter(Boolean).join(', ')
    const phoneLocal = profile.store_phone || profile.whatsapp_number || ''
    const avatarLocal = profile.store_avatar_url || profile.avatar_url || '/avatar-placeholder.png'
    const bannerUrl = profile.store_banner_url || avatarLocal
    const locationLabel = addressLocal
    const categoriesLabel = categorySummary.label || 'bicicletas y accesorios'
    const descriptionParts = [
      `${storeNameLocal} en Ciclo Market: ${categoriesLabel}.`,
      locationLabel ? `Atención en ${locationLabel}.` : null,
      listings.length
        ? `${listings.length} publicaciones activas con fotos reales, estado verificado y contacto directo.`
        : 'Publicaciones activas con fotos reales, estado verificado y contacto directo.',
      'Coordiná pruebas, envíos asegurados y soporte personalizado desde la tienda oficial.',
    ].filter(Boolean)
    const description = descriptionParts.join(' ').replace(/\s+/g, ' ').trim()

    const absoluteBanner = absoluteUrl(bannerUrl, siteOrigin) ?? bannerUrl
    const absoluteLogo = absoluteUrl(avatarLocal, siteOrigin) ?? avatarLocal
    const instagram = profile.store_instagram
      ? ensureUrl(`https://instagram.com/${String(profile.store_instagram).replace(/^@+/, '')}`)
      : null
    const facebook = profile.store_facebook
      ? ensureUrl(`https://facebook.com/${String(profile.store_facebook).replace(/^@+/, '')}`)
      : null
    const website = ensureUrl(profile.store_website || null)
    const sameAs = [instagram, facebook, website].filter(Boolean) as string[]

    const postalAddress =
      profile.store_address || profile.city || profile.province
        ? {
            '@type': 'PostalAddress',
            streetAddress: profile.store_address || undefined,
            addressLocality: profile.city || undefined,
            addressRegion: profile.province || undefined,
            addressCountry: 'AR',
          }
        : undefined

    const organizationSchema = {
      '@context': 'https://schema.org',
      '@type': postalAddress ? 'LocalBusiness' : 'Organization',
      name: storeNameLocal,
      url: canonicalUrl,
      logo: absoluteLogo,
      image: absoluteBanner,
      telephone: phoneLocal || undefined,
      address: postalAddress,
      contactPoint: phoneLocal
        ? [
            {
              '@type': 'ContactPoint',
              telephone: phoneLocal,
              contactType: 'customer service',
              areaServed: 'AR',
            },
          ]
        : undefined,
      sameAs: sameAs.length ? sameAs : undefined,
    }

    const itemListElements = topListings
      .map((listing, index) => {
        const slug = listing.slug || listing.id
        if (!slug) return null
        const url = absoluteUrl(`/listing/${slug}`, siteOrigin)
        if (!url) return null
        const name = [listing.brand, listing.model].filter(Boolean).join(' ').trim() || listing.title
        return {
          '@type': 'ListItem' as const,
          position: index + 1,
          name,
          url,
        }
      })
      .filter((entry): entry is { '@type': 'ListItem'; position: number; name: string; url: string } => Boolean(entry))

    const itemListSchema =
      itemListElements.length > 0
        ? {
            '@context': 'https://schema.org',
            '@type': 'ItemList',
      name: `${storeNameLocal} - catálogo`,
      url: canonicalUrl,
      numberOfItems: itemListElements.length,
      itemListElement: itemListElements,
    }
        : null

    const breadcrumbs = [
      { name: 'Inicio', item: '/' },
      { name: 'Tiendas oficiales', item: '/tiendas-oficiales' },
    ]
    if (canonicalPath) {
      breadcrumbs.push({ name: storeNameLocal, item: canonicalPath })
    }
    const breadcrumbSchema = buildBreadcrumbList(breadcrumbs, siteOrigin)

    const keywords = Array.from(
      new Set(
        [
          'ciclomarket',
          'tienda oficial bicicletas',
          storeNameLocal,
          categoriesLabel ? `${categoriesLabel}` : null,
          locationLabel ? `bicicletas ${locationLabel}` : null,
        ].filter(Boolean) as string[],
      ),
    )

    const detailsCopy = [
      `${storeNameLocal} publica un inventario curado de ${categorySummary.values.length ? categorySummary.values.join(', ') : 'bicicletas y accesorios'} en Ciclo Market, siempre listos para rodar.`,
      `Cada aviso incluye historia, mantenimiento y upgrades recientes para que puedas decidirte sin salir de ${locationLabel || 'casa'}.`,
      `Coordinamos pruebas presenciales${locationLabel ? ` en ${locationLabel}` : ''} y envíos asegurados a todo el país con seguimiento personalizado.`,
      `${listings.length ? `Hoy contamos con ${listings.length} publicaciones activas` : 'Actualizamos el catálogo cada semana'} y agregamos ingresos apenas pasan nuestro control de calidad.`,
      `Si necesitás asesoramiento${phoneLocal ? ` escribinos al ${phoneLocal}` : ''}; te ayudamos con talles, accesorios compatibles o planes corporativos.`,
      `Seguinos dentro de la tienda oficial y activá alertas: te avisamos cuando lleguen ediciones limitadas o reposiciones muy buscadas.`,
    ]
      .join(' ')
      .replace(/\s+/g, ' ')
      .trim()

    const jsonLd = filterJsonLdArray([organizationSchema, itemListSchema, breadcrumbSchema])

    return {
      config: {
        title: `Tienda oficial ${storeNameLocal}`,
        description,
        canonicalPath,
        image: absoluteBanner,
        keywords,
        jsonLd,
        noIndex: false,
      },
      details: {
        summary: `Sobre ${storeNameLocal}`,
        copy: detailsCopy,
      },
    }
  }, [
    profile,
    params.slug,
    siteOrigin,
    categorySummary.values,
    categorySummary.label,
    listings.length,
    topListings,
  ])

  // Desestructuramos después de construir seoMeta para evitar referencias antes de inicialización
  const { config: seoConfig, details: seoDetails } = seoMeta
  // Google Reviews integrations removidas

  if (loading) {
    return (
      <>
        <SeoHead {...seoConfig} />
        <Container className="py-12">Cargando tienda…</Container>
      </>
    )
  }
  if (!profile || !profile.store_enabled) {
    return (
      <>
        <SeoHead {...seoConfig} />
        <Container className="py-12">Tienda no encontrada.</Container>
      </>
    )
  }

  // Derivar campos de perfil una vez garantizado
  const banner = profile.store_banner_url || null
  const bannerPosY = typeof profile.store_banner_position_y === 'number' ? profile.store_banner_position_y : 50
  const avatar = profile.store_avatar_url || profile.avatar_url || '/avatar-placeholder.png'
  const storeName = profile.store_name || profile.full_name || 'Tienda'
  const address = profile.store_address || [profile.city, profile.province].filter(Boolean).join(', ')
  const phone = profile.store_phone || profile.whatsapp_number || ''
  const workingHours = (profile as any).store_hours as string | null

  return (
    <div className="min-h-[70vh] overflow-x-hidden bg-gray-50 text-gray-900">
      <SeoHead {...seoConfig} />
      <div className="w-full">
        <div className="relative h-48 w-full overflow-hidden bg-gradient-to-r from-gray-800 to-gray-900 md:h-64">
          {banner ? (
            <img
              src={buildPublicUrlSafe(banner) || ''}
              alt="Banner de la tienda"
              className="h-full w-full object-cover"
              style={{ objectPosition: `center ${bannerPosY}%` }}
              loading="eager"
              decoding="async"
            />
          ) : null}
          <div className="pointer-events-none absolute inset-0 bg-black/10" aria-hidden="true" />
        </div>

        <div className="bg-white border-b border-gray-200">
          <Container className="pb-6">
            <div className="relative -mt-4 flex flex-col gap-6 md:-mt-12 md:flex-row md:items-end md:justify-between">
              <div className="flex items-end gap-4">
                <img
                  src={buildPublicUrlSafe(avatar) || ''}
                  alt={storeName}
                  className="h-24 w-24 rounded-2xl object-cover ring-4 ring-white shadow-sm md:h-28 md:w-28"
                  loading="eager"
                  decoding="async"
                />
                <div className="min-w-0 pb-1">
                  <div className="flex flex-wrap items-center gap-2">
                    <h1 className="text-2xl font-extrabold tracking-tight text-mb-ink md:text-3xl">{storeName}</h1>
                  </div>

                  <div className="mt-2 flex flex-wrap items-center gap-x-4 gap-y-2 text-sm text-gray-600">
                    {address ? (
                      <span className="inline-flex min-w-0 items-start gap-2">
                        <MapPin className="mt-0.5 h-4 w-4 shrink-0 text-gray-400" aria-hidden="true" />
                        <span className="min-w-0 whitespace-normal break-words leading-snug">{address}</span>
                      </span>
                    ) : null}

                    {(profile.store_instagram || profile.store_website) ? (
                      <span className="inline-flex items-center gap-3">
                        {profile.store_instagram ? (
                          <a
                            href={normalizeHandle(profile.store_instagram, 'ig')}
                            target="_blank"
                            rel="noreferrer"
                            className="inline-flex items-center gap-2 font-semibold text-gray-700 hover:text-mb-primary"
                          >
                            <Instagram className="h-4 w-4" aria-hidden="true" />
                            Instagram
                          </a>
                        ) : null}
                        {profile.store_website ? (
                          <a
                            href={profile.store_website}
                            target="_blank"
                            rel="noreferrer"
                            className="inline-flex items-center gap-2 font-semibold text-gray-700 hover:text-mb-primary"
                          >
                            <Globe className="h-4 w-4" aria-hidden="true" />
                            Web
                          </a>
                        ) : null}
                      </span>
                    ) : null}
                  </div>
                </div>
              </div>

              <div className="flex flex-col gap-3 sm:flex-row sm:items-center">
                {(() => {
                  const waNumber = normaliseWhatsapp(profile.whatsapp_number || phone || '')
                  const trimmedStoreName = (storeName || '').trim()
                  const storeWaMessage = trimmedStoreName
                    ? `Hola ${trimmedStoreName}! Vi tu tienda en Ciclo Market.`
                    : 'Hola! Vi tu tienda en Ciclo Market.'
                  const waLink = buildWhatsappUrl(waNumber || (profile.whatsapp_number || phone || ''), storeWaMessage)
                  const href = waLink || undefined
                  const disabled = !href
                  return (
                    <a
                      href={href}
                      target={disabled ? undefined : '_blank'}
                      rel={disabled ? undefined : 'noreferrer'}
                      className={`inline-flex items-center justify-center rounded-xl px-5 py-3 text-sm font-bold transition ${
                        disabled
                          ? 'cursor-not-allowed bg-emerald-600/50 text-white/80'
                          : 'bg-emerald-600 text-white hover:bg-emerald-500'
                      }`}
                      onClick={(e) => {
                        if (disabled) e.preventDefault()
                      }}
                      aria-label="Contactar por WhatsApp"
                    >
                      Contactar por WhatsApp
                    </a>
                  )
                })()}

                <button
                  type="button"
                  className="inline-flex items-center justify-center rounded-xl border border-gray-200 bg-white px-5 py-3 text-sm font-bold text-mb-ink hover:bg-gray-50"
                  aria-label="Seguir tienda"
                >
                  Seguir
                </button>
              </div>
            </div>

            <div className="mt-4 flex flex-wrap gap-x-6 gap-y-2 text-sm text-gray-600">
              <span className="inline-flex items-center gap-2">
                <Package className="h-4 w-4 text-gray-400" aria-hidden="true" />
                {listings.length} productos publicados
              </span>
              {profile.created_at ? (
                <span className="inline-flex items-center gap-2">
                  <CalendarDays className="h-4 w-4 text-gray-400" aria-hidden="true" />
                  En Ciclo Market desde {new Date(profile.created_at).toLocaleDateString('es-AR', { year: 'numeric', month: 'long' })}
                </span>
              ) : null}
            </div>
          </Container>
        </div>
      </div>

      <Container className="pt-6">
        <div className="flex flex-col gap-4 md:flex-row md:items-end md:justify-between">
          <div className="w-full md:max-w-md">
            <label className="block text-xs font-semibold uppercase tracking-wide text-gray-500">{`Buscar en ${storeName}`}</label>
            <input
              type="search"
              value={filters.q || ''}
              onChange={(e) => setFilters({ q: e.target.value ? e.target.value : undefined })}
              placeholder={`Buscar en ${storeName}…`}
              className="mt-1 w-full rounded-xl border border-gray-200 bg-white px-4 py-3 text-sm text-mb-ink shadow-sm focus:border-mb-primary focus:ring-1 focus:ring-mb-primary"
            />
          </div>

          <div className="flex flex-wrap items-center gap-2">
            {[
              { key: 'all', label: 'Todo', onClick: () => setSection('') },
              { key: 'bikes', label: 'Bicis', onClick: () => setSection('', undefined, true) },
              { key: 'accessories', label: 'Accesorios', onClick: () => setSection('accessories') },
              { key: 'apparel', label: 'Indumentaria', onClick: () => setSection('apparel') },
            ].map((chip) => {
              const active =
                (chip.key === 'all' && !activeSection && !bikesOnly) ||
                (chip.key === 'bikes' && bikesOnly) ||
                (chip.key === 'accessories' && activeSection === 'accessories' && !bikesOnly) ||
                (chip.key === 'apparel' && activeSection === 'apparel' && !bikesOnly)
              return (
                <button
                  key={chip.key}
                  type="button"
                  onClick={chip.onClick}
                  className={`rounded-full px-4 py-2 text-sm font-semibold transition ${
                    active ? 'bg-mb-primary text-white' : 'bg-white text-mb-ink border border-gray-200 hover:bg-gray-50'
                  }`}
                  aria-pressed={active}
                >
                  {chip.label}
                </button>
              )
            })}
          </div>
        </div>

        {/* Bloque de "Dejar reseña en Google" removido */}

        <div className="mt-6 space-y-6">
          {/* Horarios movidos al header junto a Redes */}
          <div className="space-y-6">

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

            <div className="sm:hidden text-xs text-gray-600">{finalList.length} resultados</div>

            <div className="hidden flex-col gap-3 sm:flex lg:flex-row lg:items-center lg:justify-between">
              <div className="text-sm text-gray-600">{finalList.length} resultados</div>
              <div className="flex items-center gap-2 text-sm">
                <span className="text-gray-500">Ordenar</span>
                <select
                  className="input w-48 rounded-full border border-gray-200 bg-white text-sm text-[#14212e]"
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

            {/* Filtros (desktop): estilo inline con separadores y wrap a 2+ filas */}
            <div className="hidden sm:flex flex-wrap items-center text-sm gap-y-2">
              {UI_FILTERS_BEFORE_PRICE.map((key) => {
                const rawOptions = facetsData.options[key]
                const options = Array.from(new Set([...rawOptions, ...filters[key]]))
                return (
                  <div key={key} className="px-3 border-l border-gray-200 first:border-l-0 whitespace-nowrap">
                    <FilterDropdown
                      label={MULTI_FILTER_LABELS[key]}
                      summary={summaryFor(key)}
                      disabled={key === 'size' ? false : !options.length}
                      tone="light"
                      variant="inline"
                    >
                      {({ close }) => (
                        key === 'size' ? (
                          <SizeSelectContent
                            options={options}
                            selected={filters.size}
                            onChange={(next) => setFilters({ size: next })}
                            close={close}
                          />
                        ) : (
                          <MultiSelectContent
                            options={options}
                            selected={filters[key]}
                            onChange={(next) => setFilters({ [key]: next } as Partial<StoreFiltersState>)}
                            close={close}
                            placeholder={`Buscar ${MULTI_FILTER_LABELS[key].toLowerCase()}`}
                          />
                        )
                      )}
                    </FilterDropdown>
                  </div>
                )
              })}
              <div className="px-3 border-l border-gray-200 first:border-l-0 whitespace-nowrap">
              <FilterDropdown label="Precio" summary={priceSummary} tone="light" variant="inline">
                {({ close }) => (
                  <PriceFilterContent
                    min={filters.priceMin}
                    max={filters.priceMax}
                    bounds={facetsData.priceRange}
                    currency={filters.priceCur}
                    boundsByCur={facetsData.priceRangeByCur}
                    onCurrencyChange={(cur) => setFilters({ priceCur: cur })}
                    onApply={({ min, max }) => setFilters({ priceMin: min, priceMax: max })}
                    onClear={() => setFilters({ priceMin: undefined, priceMax: undefined })}
                    close={close}
                  />
                )}
              </FilterDropdown>
              </div>
              {UI_FILTERS_AFTER_PRICE.map((key) => {
                const rawOptions = facetsData.options[key]
                const options = Array.from(new Set([...rawOptions, ...filters[key]]))
                return (
                  <div key={key} className="px-3 border-l border-gray-200 first:border-l-0 whitespace-nowrap">
                    <FilterDropdown
                      label={MULTI_FILTER_LABELS[key]}
                      summary={summaryFor(key)}
                      disabled={!options.length}
                      tone="light"
                      variant="inline"
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
                  </div>
                )
              })}
              <div className="px-3 border-l border-gray-200 first:border-l-0 whitespace-nowrap">
              <FilterDropdown label="Promos" summary={filters.deal === '1' ? 'Activas' : 'Todas'} tone="light" variant="inline">
                {({ close }) => (
                  <DealFilterContent
                    active={filters.deal === '1'}
                    onToggle={(active) => setFilters({ deal: active ? '1' : undefined })}
                    close={close}
                  />
                )}
              </FilterDropdown>
              </div>
            </div>

            {hasActiveFilters ? (
              <div className="text-xs text-gray-600">
                Filtros activos: {activeFilterChips.map((c) => c.label).join(', ')}{' '}
                <button type="button" onClick={handleClearFilters} className="underline hover:text-gray-900">Limpiar</button>
              </div>
            ) : null}

            <div className="grid -mx-2 grid-cols-1 gap-0 sm:mx-0 sm:grid-cols-2 sm:gap-4 lg:grid-cols-3 items-start content-start">
              {finalList.map((l, idx) => (
                <div key={l.id} className="p-2 sm:p-0">
                  <ListingCard l={l} storeLogoUrl={profile.store_avatar_url || profile.avatar_url || null} priority={idx < 4} likeCount={likeCounts[l.id]} />
                </div>
              ))}
              {finalList.length === 0 && (
                <div className="py-12 text-center text-[#14212e]/60 col-span-full">No hay productos en esta categoría.</div>
              )}
            </div>
          </div>
        </div>
      </Container>

      {seoDetails ? (
        <Container className="mt-10 mb-12">
          <details className="seo-details">
            <summary className="seo-summary">{seoDetails.summary}</summary>
            <div className="seo-copy">
              <p>{seoDetails.copy}</p>
            </div>
          </details>
        </Container>
      ) : null}

      {mobileFiltersOpen ? (
        <div
          className="fixed inset-0 z-50 bg-black/40 backdrop-blur-sm sm:hidden"
          onClick={() => setMobileFiltersOpen(false)}
        >
          <div
            className="absolute right-0 top-0 h-full w-full bg-white shadow-2xl sm:hidden"
            onClick={(e) => e.stopPropagation()}
          >
            <div className="flex h-full flex-col">
              <div className="flex items-center justify-between border-b border-gray-200 px-5 py-4">
                <h3 className="text-base font-semibold text-mb-ink">Filtros</h3>
                <button
                  type="button"
                  onClick={() => setMobileFiltersOpen(false)}
                  className="rounded-full border border-gray-200 px-3 py-1 text-xs text-gray-700 hover:bg-gray-50"
                >
                  Cerrar
                </button>
              </div>
              <div className="flex-1 overflow-y-auto px-5 py-4 pb-28 space-y-3 text-mb-ink">
                {UI_FILTERS_BEFORE_PRICE.map((key) => {
                  const rawOptions = facetsData.options[key]
                  const options = Array.from(new Set([...rawOptions, ...filters[key]]))
                  return (
                    <FilterDropdown
                      key={`mobile-${key}`}
                      label={MULTI_FILTER_LABELS[key]}
                      summary={summaryFor(key)}
                      disabled={key === 'size' ? false : !options.length}
                      tone="light"
                      className="w-full"
                      buttonClassName="w-full justify-between"
                      inlineOnMobile
                      variant="inline"
                    >
                      {({ close }) => (
                        key === 'size' ? (
                          <SizeSelectContent
                            options={options}
                            selected={filters.size}
                            onChange={(next) => setFilters({ size: next })}
                            close={close}
                          />
                        ) : (
                          <MultiSelectContent
                            options={options}
                            selected={filters[key]}
                            onChange={(next) => setFilters({ [key]: next } as Partial<StoreFiltersState>)}
                            close={close}
                            placeholder={`Buscar ${MULTI_FILTER_LABELS[key].toLowerCase()}`}
                          />
                        )
                      )}
                    </FilterDropdown>
                  )
                })}
                <FilterDropdown
                  label="Precio"
                  summary={priceSummary}
                  tone="light"
                  className="w-full"
                  buttonClassName="w-full justify-between"
                  inlineOnMobile
                  variant="inline"
                >
                  {({ close }) => (
                    <PriceFilterContent
                      min={filters.priceMin}
                      max={filters.priceMax}
                      bounds={facetsData.priceRange}
                      currency={filters.priceCur}
                      boundsByCur={facetsData.priceRangeByCur}
                      onCurrencyChange={(cur) => setFilters({ priceCur: cur })}
                      onApply={({ min, max }) => setFilters({ priceMin: min, priceMax: max })}
                      onClear={() => setFilters({ priceMin: undefined, priceMax: undefined })}
                      close={close}
                    />
                  )}
                </FilterDropdown>
                {UI_FILTERS_AFTER_PRICE.map((key) => {
                  const rawOptions = facetsData.options[key]
                  const options = Array.from(new Set([...rawOptions, ...filters[key]]))
                  return (
                    <FilterDropdown
                      key={`mobile-${key}`}
                      label={MULTI_FILTER_LABELS[key]}
                      summary={summaryFor(key)}
                      disabled={!options.length}
                      tone="light"
                      className="w-full"
                      buttonClassName="w-full justify-between"
                      inlineOnMobile
                      variant="inline"
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
                  label="Promos"
                  summary={filters.deal === '1' ? 'Activas' : 'Todas'}
                  tone="light"
                  className="w-full"
                  buttonClassName="w-full justify-between"
                  inlineOnMobile
                  variant="inline"
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
              <div className="border-t border-gray-200 bg-white px-5 py-4">
                <div className="flex gap-3">
                  <button
                    type="button"
                    onClick={() => handleClearFilters()}
                    className="flex-1 rounded-full border border-gray-200 px-4 py-2 text-sm font-semibold text-gray-700 hover:bg-gray-50"
                  >
                    Limpiar
                  </button>
                  <button
                    type="button"
                    onClick={() => setMobileFiltersOpen(false)}
                    className="flex-1 rounded-full bg-mb-primary px-4 py-2 text-sm font-semibold text-white hover:bg-mb-primary/90"
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
          className="fixed inset-0 z-50 bg-black/40 backdrop-blur-sm sm:hidden"
          onClick={() => setMobileSortOpen(false)}
        >
          <div
            className="absolute inset-x-0 bottom-0 rounded-t-3xl bg-white p-5 shadow-2xl"
            onClick={(e) => e.stopPropagation()}
          >
            <div className="flex items-center justify-between">
              <h3 className="text-base font-semibold text-mb-ink">Ordenar por</h3>
              <button
                type="button"
                onClick={() => setMobileSortOpen(false)}
                className="rounded-full border border-gray-200 px-3 py-1 text-xs text-gray-700 hover:bg-gray-50"
              >
                Cerrar
              </button>
            </div>
            <div className="mt-4 space-y-2 text-sm text-mb-ink">
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
                      active ? 'border-mb-primary/40 bg-mb-primary/5' : 'border-gray-200 hover:bg-gray-50'
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
  return <img src="/call.webp" alt="" className="h-5 w-5" loading="lazy" decoding="async" aria-hidden onError={(e)=>{try{const el=e.currentTarget as HTMLImageElement; if(el.src.endsWith('.webp')) el.src='/call.png';}catch{/* noop */}}} />
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
