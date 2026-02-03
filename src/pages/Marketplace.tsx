import { useCallback, useEffect, useMemo, useRef, useState } from 'react'
import { useSearchParams, Link, useLocation, useNavigate, useNavigationType } from 'react-router-dom'
import Container from '../components/Container'
import ListingCard from '../components/ListingCard'
import { buildImageSource } from '../lib/imageUrl'
import { fetchStoresMeta } from '../services/users'
import EmptyState from '../components/EmptyState'
import SkeletonCard from '../components/SkeletonCard'
import { mockListings } from '../mock/mockData'
import { fetchListings } from '../services/listings'
import { fetchMarket } from '../services/market'
import { supabaseEnabled } from '../services/supabase'
import { useAuth } from '../context/AuthContext'
import { saveSearch } from '../services/savedSearches'
import type { Listing } from '../types'
import { useCurrency } from '../context/CurrencyContext'
import { hasPaidPlan } from '../utils/plans'
import FilterDropdown from '../components/FilterDropdown'
import { fetchLikeCounts } from '../services/likes'
import SeoHead, { type SeoHeadProps } from '../components/SeoHead'
import { resolveSiteOrigin, toAbsoluteUrl as absoluteUrl, categoryToCanonicalPath, buildBreadcrumbList } from '../utils/seo'

type Cat = 'Todos' | 'Ruta' | 'MTB' | 'Gravel' | 'Urbana' | 'Fixie' | 'Accesorios' | 'Indumentaria' | 'Nutrición' | 'E-Bike' | 'Niños' | 'Pista' | 'Triatlón'
type MultiFilterKey = 'brand' | 'material' | 'frameSize' | 'wheelSize' | 'drivetrain' | 'condition' | 'brake' | 'year' | 'size' | 'location' | 'transmissionType'
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
  location: string[]
  transmissionType: string[]
  priceCur?: 'USD' | 'ARS'
  priceMin?: number
  priceMax?: number
  deal?: '1'
  store?: '1'
  // When set, restricts 'Todos' to only bike categories
  bikes?: '1'
  q?: string
  /** Subcategoría/tipo dentro de la categoría (p.ej. Accesorios → Ruedas y cubiertas) */
  subcat?: string
}

const CAT_VALUES: Cat[] = ['Todos','Ruta','MTB','Gravel','Triatlón','Urbana','Fixie','Accesorios','Indumentaria','Nutrición','E-Bike','Niños','Pista']
const MULTI_PARAM_KEYS: MultiFilterKey[] = ['brand','material','frameSize','wheelSize','drivetrain','condition','brake','year','size','location','transmissionType']
const MULTI_FILTER_ORDER: MultiFilterKey[] = ['brand','material','frameSize','wheelSize','drivetrain','condition','brake','year','size','location','transmissionType']
// UI ordering helpers: show frame size first, then price, then the rest
const UI_FILTERS_BEFORE_PRICE: MultiFilterKey[] = ['size']
const UI_FILTERS_AFTER_PRICE: MultiFilterKey[] = ['brand','location','material','brake','year','condition','drivetrain','transmissionType','wheelSize']
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
  , location: 'Ubicación',
  transmissionType: 'Tipo de transmisión'
}
const CATEGORY_CARDS: Array<{ cat: Cat; label: string; description: string; image: string; imageMobile: string }> = [
  {
    cat: 'Todos',
    label: 'Bicicletas',
    description: 'Solo bicicletas',
    image: '/design/Banners/1.webp',
    imageMobile: '/design/Banners-Mobile/1.webp'
  },
  {
    cat: 'Accesorios',
    label: 'Accesorios',
    description: 'Componentes y upgrades',
    image: '/design/Banners/2.webp',
    imageMobile: '/design/Banners-Mobile/2.webp'
  },
  {
    cat: 'Indumentaria',
    label: 'Indumentaria',
    description: 'Ropa técnica y casual',
    image: '/design/Banners/3.webp',
    imageMobile: '/design/Banners-Mobile/3.webp'
  }
]

type CategorySeoKey = Cat | 'Deals'

const CATEGORY_SEO_CONTENT: Record<CategorySeoKey, { descriptor: string; summary: string; copy: string }> = {
  Todos: {
    descriptor: 'bicicletas nuevas y usadas',
    summary: 'Sobre el marketplace de bicicletas',
    copy: `El marketplace de Ciclo Market se actualiza todos los días con bicicletas nuevas, usadas y reacondicionadas pensadas para distintas disciplinas. El objetivo es que ahorres tiempo: cada aviso muestra fotos reales, estado declarado, formas de contacto directo y señales de confianza del vendedor. Podés filtrar por marca, rango de precio, talle o ubicación y guardar búsquedas para recibir avisos cuando ingrese una bici similar. También destacamos negociaciones transparentes; por eso verás etiquetas de ofertas, planes vigentes y métricas de interacción. Si preferís comprar a una tienda, activá el filtro de oficiales y revisá su catálogo completo en un mismo lugar. Publicar es igual de simple: en minutos cargás tu bici, sumás upgrades y elegís un plan que te ayuda a vender más rápido sin comisiones ocultas.`,
  },
  Ruta: {
    descriptor: 'bicicletas de ruta usadas',
    summary: 'Sobre bicicletas de ruta usadas',
    copy: `Las bicicletas de ruta publicadas en Ciclo Market pasan por una curaduría para asegurar medidas claras, fotos nítidas y componentes detallados. Encontrás opciones endurance, aero y escaladoras, muchas con mejoras como ruedas de carbono, potenciómetros o grupos electrónicos. Usá los filtros para ajustar por talle, material del cuadro, grupo o ciudad y así llegar a una prueba segura. En cada aviso señalamos si pertenece a una tienda oficial o a un ciclista verificado para coordinar entrega con tranquilidad. Si necesitás vender, podés publicar tu bici y activar un plan destacado que la ubique en la portada. Guardá las publicaciones que te interesen y solicitá alertas de baja de precio para no perder oportunidades cuando alguien negocia.`,
  },
  MTB: {
    descriptor: 'bicicletas de mountain bike usadas',
    summary: 'Sobre bicicletas de MTB usadas',
    copy: `El segmento MTB reúne rígidas y dobles suspensión listas para XC, trail o enduro. Cada publicación aclara recorrido, seteo del amortiguador y upgrades como ruedas tubeless, transmisiones 12v o frenos de cuatro pistones. Podés filtrar por recorrido, tamaño de rueda, grupo, material o condición para encontrar la bici que se adapte a tu terreno. Las tiendas oficiales suelen publicar flotas demo y opciones reacondicionadas con garantía, mientras que los ciclistas privados destacan mantenimientos recientes y service al día. Si todavía estás buscando referencias, guardá modelos para compararlos y recibir avisos cuando ingresen cuadros similares. Y si tenés una MTB a la venta, subila en minutos y añadí fotos de los componentes clave para conseguir más contactos.`,
  },
  Gravel: {
    descriptor: 'bicicletas de gravel usadas',
    summary: 'Sobre bicicletas de gravel usadas',
    copy: `La categoría gravel mezcla bicicletas para explorar, entrenar en ripio y viajar con bikepacking. Vas a encontrar cuadros de carbono, aluminio y acero con vainas cortas o geometrías más relajadas según el enfoque del fabricante. Indicamos espacio máximo de cubierta, monturas disponibles y upgrades como ruedas 650B, transmisión monoplato o bolsos específicos. Con los filtros podés segmentar por material, ancho de neumático, grupo o ubicación para coordinar prueba en tu zona. Muchas publicaciones incluyen historias del setup, rutas recomendadas y kilometraje estimado, lo que ayuda a decidirse sin sorpresas. Si querés vender la tuya, añadí fotos del equipamiento y aclaraciones sobre mantenimiento para destacar frente a otros anuncios de aventura.`,
  },
  Triatlón: {
    descriptor: 'bicicletas de triatlón y contrarreloj',
    summary: 'Sobre bicicletas de triatlón usadas',
    copy: `La categoría triatlón combina cuadros TT, componentes aero y montajes listos para carreras de media o larga distancia. Detallamos stack, reach, extensiones, soportes de hidratación y tipo de freno para que puedas replicar tu posición sin adivinar. Los filtros te permiten acotar por talle, grupo, ruedas o ubicación y así planificar una prueba con tiempo. Muchas publicaciones incluyen datos de fitting, potenciómetros instalados y kilometraje real, lo que simplifica la evaluación previa a un viaje. Las tiendas oficiales suelen ofrecer armado profesional y garantías de cuadro, mientras que los atletas privados comentan el calendario en el que competían. Usá la lista de seguimiento para detectar cuando una bici baja de precio y asegurarte un upgrade antes de la próxima temporada.`,
  },
  Urbana: {
    descriptor: 'bicicletas urbanas y plegables',
    summary: 'Sobre bicicletas urbanas usadas',
    copy: `Las bicicletas urbanas y plegables de Ciclo Market están pensadas para moverse en la ciudad con seguridad y estilo. Abundan opciones con guardabarros, portaequipaje, transmisión interna o correas libres de mantenimiento. Podés usar los filtros para priorizar tamaño, sistema de frenos, tipo de cuadro o accesorios incluidos, y así definir si querés una bici lista para el viaje diario o un proyecto de restauración. Revisamos que cada publicación detalle luces, candados o mejoras de seguridad para que el recorrido urbano sea más simple. También vas a ver destacadas las tiendas con servicio técnico propio para quienes buscan garantía o instalación de canastos y sillas infantiles. Si vas a publicar la tuya, contá cómo se usó, el kilometraje estimado y el estado de la batería si se trata de un modelo asistido.`,
  },
  Fixie: {
    descriptor: 'bicicletas fixie y single speed',
    summary: 'Sobre fixie y single speed',
    copy: `La sección fixie agrupa cuadros livianos, componentes minimalistas y muchas bicicletas listas para personalizar. Encontrás montajes con piñón fijo, rueda libre o configuraciones mixtas para ciudad. Indicamos medidas de cuadro, relación de transmisión y componentes destacados como correas, straps o manubrios de pista. Los filtros permiten segmentar por material, tipo de freno, tamaño de rueda o marca del cuadro artesanal. Muchas publicaciones explican qué piezas se reemplazaron recientemente, algo clave para quienes quieren rodar sin mantenimiento inmediato. Si buscás inspiración, guardá tus favoritas y comparalas para ver diferencias de geometría. Y si vas a vender tu fixie, suma fotos de detalles de pintura, soldaduras y componentes custom para que se destaque dentro del listado.`,
  },
  Accesorios: {
    descriptor: 'accesorios y componentes para ciclismo',
    summary: 'Sobre accesorios para ciclismo',
    copy: `El catálogo de accesorios reúne componentes originales, upgrades premium y equipamiento de entrenamiento. Encontrás ruedas, grupos completos, potenciómetros, ciclocomputadoras, rodillos inteligentes y repuestos difíciles de conseguir. Cada publicación detalla compatibilidades, estado de uso y, cuando corresponde, facturas o garantías vigentes. Podés filtrar por tipo de componente, material, marca o condición para acelerar la búsqueda. Las tiendas oficiales suelen ofrecer instalación y servicio, mientras que los ciclistas particulares destacan upgrades que cambiaron por una mejora. Aprovechá los filtros de precio y condición para detectar oportunidades en productos casi nuevos. Y si querés vender accesorios olvidados en tu taller, sacá fotos claras, aclarando estándares (Boost, AXS, 12v) para facilitar la decisión de otro ciclista.`,
  },
  Indumentaria: {
    descriptor: 'indumentaria de ciclismo',
    summary: 'Sobre indumentaria para ciclismo',
    copy: `Esta sección agrupa jerseys, culottes, cascos, zapatillas y accesorios técnicos para entrenar o competir. Indicamos la tabla de talles declarada, el ajuste recomendado y si la prenda fue usada en competencias, salidas casuales o permanece nueva. Los filtros permiten ordenar por marca, categoría, género y talle para evitar pruebas innecesarias. También se destacan las tecnologías de los tejidos, ventilaciones y protecciones integradas. Las tiendas oficiales suelen publicar colecciones completas con posibilidad de cambios, mientras que los ciclistas privados liberan prendas en muy buen estado para renovar guardarropa. Sumá tus favoritos a la lista de seguimiento y recibí alertas cuando aparezcan talles difíciles. Si vas a vender, una guía rápida sobre medidas y fotos con buena luz ayudan a que otro ciclista confíe en tu publicación.`,
  },
  Nutrición: {
    descriptor: 'nutrición deportiva para ciclistas',
    summary: 'Sobre nutrición para ciclismo',
    copy: `En Nutrición reunimos geles, barras, suplementos y bebidas isotónicas pensados para sostener tus entrenamientos. Cada publicación destaca fecha de vencimiento, sabores disponibles y presentaciones individuales o en pack para que planifiques tu stock sin sorpresas. Podés filtrar por disciplina, objetivo (energía inmediata, recuperación o hidratación) y tipo de producto para comparar marcas. Las tiendas oficiales suelen ofrecer combos y asesoramiento profesional, mientras que los vendedores particulares aclaran cómo almacenaron los productos y por qué los están liberando. Guardá tus favoritos para recibir alertas y aprovechar cuando ingresan ediciones limitadas o promociones especiales.`,
  },
  'E-Bike': {
    descriptor: 'bicicletas eléctricas asistidas',
    summary: 'Sobre bicicletas eléctricas',
    copy: `En E-Bike vas a encontrar bicicletas asistidas para ciudad, montaña o gravel con motores centrales o hub. Destacamos capacidad de batería, ciclos de carga, autonomía estimada y modo de asistencia regulable para que evalúes si se adapta a tu rutina. Usá los filtros para separar por disciplina, potencia, tamaño de rueda o marca del sistema eléctrico. Muchas publicaciones incluyen historial de service y certificaciones de taller autorizado, algo clave para cuidar tu inversión. Las tiendas oficiales ofrecen upgrades como packs de luces, portaequipaje o software actualizado, mientras que particulares describen cómo usaron la bici y por qué la venden. Revisá la sección de preguntas para conocer detalles adicionales y coordiná una prueba segura antes de decidirte.`,
  },
  'Niños': {
    descriptor: 'bicicletas para niños y niñas',
    summary: 'Sobre bicicletas infantiles',
    copy: `En la categoría Niños reunimos balance bikes, rodados intermedios y primeras bicis con transmisión. Cada aviso incluye altura recomendada, peso del cuadro y si tiene rueditas, freno a contra pedal o frenos de mano. Podés filtrar por rodado, marca, material o estado para encontrar una bici que acompañe el crecimiento sin sorpresas. Los vendedores suelen detallar cuánto uso tuvo, si la bici pasó por service y qué accesorios incluyen (casco, canasto, luces). También vas a ver publicaciones de tiendas oficiales con programas de recompra o cambios de talla, ideales para familias que cambian de bici cada temporada. Guardá tus opciones preferidas y coordiná entrega en un punto seguro para que la experiencia sea tan simple como estrenar la bici nueva.`,
  },
  Pista: {
    descriptor: 'bicicletas de pista y velódromo',
    summary: 'Sobre bicicletas de pista',
    copy: `Las bicicletas de pista listadas en Ciclo Market están pensadas para velódromo o criterium con cuadros rígidos, ángulos agresivos y componentes específicos. Detallamos material del cuadro, geometría, longitud de bielas y relación de transmisión sugerida para cada disciplina. Los filtros ayudan a separar montajes para entrenamientos, carreras o uso urbano controlado. Muchos avisos incluyen mejoras como ruedas lenticulares, cockpits aero o straps reforzados. Revisamos que cada publicación aclare si se entrega con piñón fijo, rueda libre o ambos, y si trae tapabarros o frenos desmontables. Sumá modelos a tu lista para comparar geometrías o armar un segundo juego de ruedas. Cuando publiques la tuya, destacá las sesiones donde la usaste y estado de los rodamientos para generar confianza entre especialistas.`,
  },
  Deals: {
    descriptor: 'ofertas destacadas en bicicletas y accesorios',
    summary: 'Sobre ofertas de bicicletas',
    copy: `La sección de ofertas reúne bicicletas y accesorios con precio promocional o reciente baja confirmada por el vendedor. Cada publicación indica el valor anterior para que puedas medir el descuento real y comparar con otros anuncios activos. Filtrá por categoría, rango de precio, tienda oficial o ubicación para detectar oportunidades cerca tuyo. También destacamos planes vigentes, upgrades incluidos y la fecha de actualización del anuncio para evitar precios desactualizados. Agregá tus favoritos a la lista de seguimiento y activá alertas: cuando un vendedor aplica otra rebaja, te avisamos por correo o notificación. Y si querés acelerar la venta de tu bici, podés marcar el precio anterior y agregar un copy claro sobre el estado y los extras para atraer compradores atentos a las oportunidades.`,
  },
}

const CATEGORY_TITLE_MAP: Record<Cat, string> = {
  Todos: 'Bicicletas usadas y nuevas',
  Ruta: 'Bicicletas de ruta',
  MTB: 'Bicicletas de MTB',
  Gravel: 'Bicicletas de gravel',
  Triatlón: 'Bicicletas de triatlón',
  Urbana: 'Bicicletas urbanas',
  Fixie: 'Fixie y single speed',
  Accesorios: 'Accesorios de ciclismo',
  Indumentaria: 'Indumentaria ciclista',
  Nutrición: 'Nutrición para ciclismo',
  'E-Bike': 'Bicicletas eléctricas',
  'Niños': 'Bicicletas para niños',
  Pista: 'Bicicletas de pista',
}

const normalizeText = (value: string) => value
  ? value
      .normalize('NFD')
      .replace(/[\u0300-\u036f]/g, '')
      .trim()
      .toLowerCase()
  : ''

const isJsonLdObject = (value: unknown): value is Record<string, unknown> => {
  if (!value || typeof value !== 'object' || Array.isArray(value)) return false
  return Object.keys(value as Record<string, unknown>).length > 0
}

const filterJsonLdArray = (input: unknown[]): Record<string, unknown>[] =>
  input.filter(isJsonLdObject) as Record<string, unknown>[]

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
    size: [],
    location: [],
    transmissionType: []
  }

  for (const key of MULTI_PARAM_KEYS) {
    const values = params.getAll(key).filter(Boolean)
    if (values.length) base[key] = uniqueInsensitive(values)
  }

  // Backward compatibility: merge any legacy 'frameSize' params into unified 'size'
  if (base.frameSize && base.frameSize.length) {
    base.size = uniqueInsensitive([...(base.size || []), ...base.frameSize])
    base.frameSize = []
  }

  const deal = params.get('deal')
  if (deal === '1' || deal === 'true') base.deal = '1'

  const bikes = params.get('bikes')
  if (bikes === '1' || bikes === 'true') base.bikes = '1'

  const q = params.get('q')
  if (q) base.q = q

  const subcat = params.get('subcat')
  if (subcat) base.subcat = subcat

  base.priceMin = parseNumericParam(params.get('price_min'))
  base.priceMax = parseNumericParam(params.get('price_max'))
  const cur = params.get('price_cur')
  if (cur === 'USD' || cur === 'ARS') base.priceCur = cur

  const store = params.get('store')
  if (store === '1') base.store = '1'

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

  if (filters.priceCur === 'USD' || filters.priceCur === 'ARS') params.set('price_cur', filters.priceCur)
  else params.delete('price_cur')

  if (filters.store === '1') params.set('store', '1')
  else params.delete('store')

  if (filters.bikes === '1') params.set('bikes', '1')
  else params.delete('bikes')

  return params
}

type ListingMetadata = {
  condition?: string
  brake?: string
  apparelSize?: string
  accessoryType?: string
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

const inferTransmissionType = (text?: string | null): 'Mecánico' | 'Electrónico' | null => {
  const t = (text || '').toLowerCase()
  if (!t) return null
  if (t.includes('di2') || t.includes('etap') || t.includes('axs') || t.includes('eps') || t.includes('steps')) return 'Electrónico'
  return 'Mecánico'
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

const listingDisplayName = (listing: Listing) => {
  const brandModel = [listing.brand, listing.model].filter(Boolean).join(' ').trim()
  if (brandModel) {
    if (listing.year) return `${brandModel} ${listing.year}`.trim()
    return brandModel
  }
  return listing.title
}

const formatList = (values: string[], limit = 3) => {
  const unique = Array.from(new Set(values.map((v) => v.trim()).filter(Boolean)))
  const sliced = unique.slice(0, limit)
  if (!sliced.length) return ''
  if (sliced.length === 1) return sliced[0]
  return `${sliced.slice(0, -1).join(', ')} y ${sliced[sliced.length - 1]}`
}

const formatResultsCount = (count: number | null | undefined) => {
  if (!count || count <= 0) return 'las mejores'
  if (count === 1) return 'una'
  if (count < 10) return `${count}`
  if (count < 30) return `más de ${Math.max(10, Math.floor(count / 5) * 5)}`
  if (count < 100) return `más de ${Math.floor(count / 10) * 10}`
  return 'más de 100'
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
    location: new Set(),
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
    if (frameSize) {
      // Unificamos en 'size' para no duplicar con 'Talle'
      sets.frameSize.add(frameSize)
      sets.size.add(frameSize)
    }
    // Incluir múltiples talles desde extras
    const extrasMap = extractExtrasMap(listing.extras)
    const multi = extrasMap.talles
    if (multi) {
      multi
        .split(',')
        .map((s) => s.trim())
        .filter(Boolean)
        .forEach((s) => { sets.frameSize.add(s); sets.size.add(s) })
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

    // Tipo de transmisión: inferir desde drivetrain/drivetrainDetail/extras
    const txType = inferTransmissionType(listing.drivetrainDetail) || inferTransmissionType(listing.drivetrain) || ((): 'Mecánico' | 'Electrónico' | null => {
      const map = extractExtrasMap(listing.extras)
      return inferTransmissionType(map.transmision || map['transmisión'] || map.grupo || null)
    })()
    if (txType) sets.transmissionType.add(txType)

    metadata[listing.id] = {
      condition: condition || undefined,
      brake: brake || undefined,
      apparelSize: apparelSize || undefined,
      accessoryType,
      transmissionType: txType || undefined
    }

    // Ubicación: agregar ciudad y provincia si están presentes
    const loc = (listing.sellerLocation || listing.location || '').toString()
    if (loc) {
      const parts = loc.split(',').map((s) => s.trim()).filter(Boolean)
      for (const p of parts) sets.location.add(p)
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
      location: sortAlpha(sets.location),
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
          className="input h-10 w-full rounded-full border border-white/10 bg-white px-4 text-sm text-[#14212e] placeholder:text-[#14212e]/60 focus:outline-none focus:ring-2 focus:ring-[#14212e]/20"
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

// Selector especializado para Talle: muestra letras con rango en cm y debajo otros talles libres
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
            <label key={opt} className={`flex cursor-pointer items-center gap-2 rounded-lg px-2 py-1 hover:bg-white/10 ${active ? 'bg-white/10' : ''}`}>
              <input type="checkbox" className="h-4 w-4 accent-white" checked={active} onChange={() => toggle(opt)} />
              <span>{labelFor(opt)}</span>
            </label>
          )
        })}
      </div>
      {otherOptions.length ? (
        <>
          <div className="mt-1 text-xs text-white/60">Otros talles</div>
          <div className="max-h-40 overflow-y-auto pr-1">
            <ul className="flex flex-col gap-2">
              {otherOptions.map((opt) => {
                const active = normalizedSelected.has(normalizeText(opt))
                return (
                  <li key={opt}>
                    <label className="flex cursor-pointer items-center gap-2 rounded-lg px-2 py-1 hover:bg-white/10">
                      <input type="checkbox" className="h-4 w-4 accent-white" checked={active} onChange={() => toggle(opt)} />
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
        <button type="button" onClick={() => { onChange([]); close() }} className="text-white/70 hover:text-white">Limpiar</button>
        <button type="button" onClick={close} className="rounded-full bg-white px-3 py-1 text-[#14212e] hover:bg-white/90">Listo</button>
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
          <div className="inline-flex items-center rounded-full border border-white/15 bg-white/5 p-0.5">
            {(['ARS','USD'] as const).map((cur) => (
              <button
                key={cur}
                type="button"
                onClick={() => { const next = localCur === cur ? undefined : cur; setLocalCur(next); onCurrencyChange(next) }}
                className={`px-2 py-1 text-xs rounded-full ${localCur === cur ? 'bg-white text-[#14212e]' : 'text-white/70 hover:text-white'}`}
              >
                {cur}
              </button>
            ))}
          </div>
        ) : null}
      </div>
      <div className="text-xs text-white/60">
        Rango disponible: {effBounds.min ? `${symbol}${localCur === 'USD' ? effBounds.min.toLocaleString('en-US') : effBounds.min.toLocaleString('es-AR')}` : '—'} – {effBounds.max ? `${symbol}${localCur === 'USD' ? effBounds.max.toLocaleString('en-US') : effBounds.max.toLocaleString('es-AR')}` : '—'}
      </div>
      <div className="text-[11px] text-white/50">
        Conversión: 1 USD = {fx.toLocaleString('es-AR')} ARS
      </div>
      <div className="grid grid-cols-2 gap-3">
        <label className="flex flex-col gap-1">
          <span className="text-xs text-white/60">Desde</span>
          <input
            type="number"
            min={0}
            value={minValue}
            onChange={(event) => setMinValue(event.target.value)}
            className="input h-10 rounded-full border border-white/10 bg-white px-3 text-[#14212e] focus:outline-none focus:ring-2 focus:ring-[#14212e]/20"
          />
        </label>
        <label className="flex flex-col gap-1">
          <span className="text-xs text-white/60">Hasta</span>
          <input
            type="number"
            min={0}
            value={maxValue}
            onChange={(event) => setMaxValue(event.target.value)}
            className="input h-10 rounded-full border border-white/10 bg-white px-3 text-[#14212e] focus:outline-none focus:ring-2 focus:ring-[#14212e]/20"
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
          <div className="text-xs text-white/60 whitespace-normal break-words leading-snug">Publicaciones con precio rebajado sobre el original.</div>
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

type StoreFilterContentProps = {
  active: boolean
  onToggle: (nextActive: boolean) => void
  close: () => void
}

function StoreFilterContent({ active, onToggle, close }: StoreFilterContentProps) {
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
          <div className="font-medium text-white">Solo tiendas oficiales</div>
          <div className="text-xs text-white/60 whitespace-normal break-words leading-snug">Ver solo publicaciones de tiendas verificadas.</div>
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
type MarketplaceProps = {
  forcedCat?: Cat
  allowedCats?: Cat[]
  forcedDeal?: boolean
  headingTitle?: string
  breadcrumbs?: Crumb[]
  seoOverrides?: Partial<SeoHeadProps>
}
export default function Marketplace({ forcedCat, allowedCats, forcedDeal, headingTitle, breadcrumbs, seoOverrides }: MarketplaceProps = {}) {
  const location = useLocation()
  const navType = useNavigationType()
  const { fx } = useCurrency()
  const siteOrigin = useMemo(() => resolveSiteOrigin(), [])
  const [searchParams, setSearchParams] = useSearchParams()
  const paramsKey = searchParams.toString()
  const filters = useMemo(() => paramsToFilters(searchParams), [paramsKey])
  const effectiveCat: Cat = forcedCat ?? filters.cat
  const effectiveDeal = forcedDeal ? '1' : filters.deal
  // Forzamos uso directo de Supabase (listings_enriched) para respetar límites 4/8/12 y WA público
  const MARKET_USE_API = false

  const [count, setCount] = useState(40)
  const sentinelRef = useRef<HTMLDivElement | null>(null)
  const loadMoreRef = useRef<HTMLDivElement | null>(null)
  const loadingMoreRef = useRef<boolean>(false)
  const restoringRef = useRef<boolean>(false)
  const [sortMode, setSortMode] = useState<'relevance' | 'newest' | 'asc' | 'desc'>('relevance')
  const [listings, setListings] = useState<Listing[]>([])
  const [serverMode, setServerMode] = useState(false)
  const [serverTotal, setServerTotal] = useState<number | null>(null)
  const [loading, setLoading] = useState(true)
  const [storeLogos, setStoreLogos] = useState<Record<string, string | null>>({})
  const [mobileFiltersOpen, setMobileFiltersOpen] = useState(false)
  const [mobileSortOpen, setMobileSortOpen] = useState(false)
  const [likeCounts, setLikeCounts] = useState<Record<string, number>>({})

  // Control manual de restauración de scroll
  useEffect(() => {
    try {
      if (typeof window !== 'undefined' && 'scrollRestoration' in window.history) {
        (window.history as any).scrollRestoration = 'manual'
      }
    } catch { /* noop */ }
  }, [])

  const scrollKey = useMemo(() => `${location.pathname}${location.search}`, [location.pathname, location.search])

  useEffect(() => {
    return () => {
      try { sessionStorage.setItem(`mb_scroll:${scrollKey}`, String(window.scrollY || window.pageYOffset || 0)) } catch { /* noop */ }
    }
  }, [scrollKey])

  useEffect(() => {
    if (navType !== 'POP') return
    restoringRef.current = true
    requestAnimationFrame(() => {
      try {
        const raw = sessionStorage.getItem(`mb_scroll:${scrollKey}`)
        const y = raw ? Number(raw) : 0
        if (Number.isFinite(y) && y > 0) window.scrollTo({ top: y, left: 0, behavior: 'auto' })
      } catch { /* noop */ }
    })
  }, [navType, scrollKey])

  useEffect(() => {
    if (!restoringRef.current) return
    if (loading) return
    const t = window.setTimeout(() => { restoringRef.current = false }, 120)
    return () => window.clearTimeout(t)
  }, [loading])

  useEffect(() => {
    let active = true
    const load = async () => {
      setLoading(true)
      // Si NO se pide usar la API de mercado, ir directo a Supabase como antes
      if (!MARKET_USE_API) {
        if (supabaseEnabled) {
          const data = await fetchListings()
          if (!active) return
          // Fallback: si por algún motivo viene vacío, intentamos la API una vez
          if (!data || data.length === 0) {
            try {
              const { items, total } = await fetchMarket({
                cat: effectiveCat === 'Todos' ? undefined : effectiveCat,
                q: filters.q,
                deal: effectiveDeal === '1',
                store: filters.store === '1',
                sort: sortMode,
                priceCur: filters.priceCur,
                priceMin: filters.priceMin,
                priceMax: filters.priceMax,
                fx,
                subcat: filters.subcat,
                brand: filters.brand,
                material: filters.material,
                frameSize: filters.frameSize,
                wheelSize: filters.wheelSize,
                drivetrain: filters.drivetrain,
                condition: filters.condition,
                brake: filters.brake,
                year: filters.year,
                size: filters.size,
                location: filters.location,
                limit: 300,
                offset: 0,
              })
              const mapped: Listing[] = (items || []).map((row: any) => ({
                id: String(row.id), slug: row.slug ?? undefined, title: row.title, brand: row.brand, model: row.model,
                year: typeof row.year === 'number' ? row.year : undefined,
                category: row.category, subcategory: row.subcategory ?? undefined,
                price: Number(row.price) || 0, priceCurrency: (row.price_currency || undefined),
                originalPrice: typeof row.original_price === 'number' ? row.original_price : undefined,
                location: row.location || '', description: row.description || '', images: Array.isArray(row.images) ? row.images : [],
                sellerId: row.seller_id, sellerName: row.seller_name ?? undefined,
                sellerPlan: (row.plan || undefined), plan: (row.plan || undefined),
                sellerPlanExpires: row.seller_plan_expires ? Date.parse(row.seller_plan_expires) : undefined,
                highlightExpires: row.highlight_expires ? Date.parse(row.highlight_expires) : undefined,
                sellerLocation: row.seller_location ?? undefined, sellerWhatsapp: row.seller_whatsapp ?? undefined,
                sellerEmail: row.seller_email ?? undefined, sellerAvatar: row.seller_avatar ?? undefined,
                material: row.material ?? undefined, frameSize: row.frame_size ?? undefined, drivetrain: row.drivetrain ?? undefined,
                drivetrainDetail: row.drivetrain_detail ?? undefined, wheelset: row.wheelset ?? undefined, wheelSize: row.wheel_size ?? undefined,
                extras: row.extras ?? undefined, status: row.status ?? 'active',
                expiresAt: row.expires_at ? Date.parse(row.expires_at) : null,
                renewalNotifiedAt: row.renewal_notified_at ? Date.parse(row.renewal_notified_at) : null,
                createdAt: row.created_at ? Date.parse(row.created_at) : Date.now(),
              }))
              setListings(mapped)
              setServerMode(true)
              setServerTotal(typeof total === 'number' ? total : null)
              try {
                const sellerIds = Array.from(new Set(mapped.map((x) => x.sellerId).filter(Boolean)))
                const logos = await fetchStoresMeta(sellerIds)
                if (active) setStoreLogos(logos)
              } catch { /* noop */ }
              setLoading(false)
              return
            } catch { /* ignore API fallback */ }
          }
          setServerMode(false)
          setServerTotal(null)
          setListings(data)
          try {
            const sellerIds = Array.from(new Set(data.map((x) => x.sellerId).filter(Boolean)))
            const logos = await fetchStoresMeta(sellerIds)
            if (active) setStoreLogos(logos)
          } catch { void 0 }
          setLoading(false)
          return
        }
      } else {
        // Usar API de mercado si está habilitado por flag
        try {
          const { items, total } = await fetchMarket({
            cat: effectiveCat === 'Todos' ? undefined : effectiveCat,
            q: filters.q,
            deal: effectiveDeal === '1',
            store: filters.store === '1',
            sort: sortMode,
            priceCur: filters.priceCur,
            priceMin: filters.priceMin,
            priceMax: filters.priceMax,
            fx,
            subcat: filters.subcat,
            brand: filters.brand,
            material: filters.material,
            frameSize: filters.frameSize,
            wheelSize: filters.wheelSize,
            drivetrain: filters.drivetrain,
            condition: filters.condition,
            brake: filters.brake,
            year: filters.year,
            size: filters.size,
            location: filters.location,
            limit: 300,
            offset: 0,
          })
          if (!active) return
          const mapped: Listing[] = (items || []).map((row: any) => ({
            id: String(row.id), slug: row.slug ?? undefined, title: row.title, brand: row.brand, model: row.model,
            year: typeof row.year === 'number' ? row.year : undefined,
            category: row.category, subcategory: row.subcategory ?? undefined,
            price: Number(row.price) || 0, priceCurrency: (row.price_currency || undefined),
            originalPrice: typeof row.original_price === 'number' ? row.original_price : undefined,
            location: row.location || '', description: row.description || '', images: Array.isArray(row.images) ? row.images : [],
            sellerId: row.seller_id, sellerName: row.seller_name ?? undefined,
            sellerPlan: (row.plan || undefined), plan: (row.plan || undefined),
            sellerPlanExpires: row.seller_plan_expires ? Date.parse(row.seller_plan_expires) : undefined,
            highlightExpires: row.highlight_expires ? Date.parse(row.highlight_expires) : undefined,
            sellerLocation: row.seller_location ?? undefined, sellerWhatsapp: row.seller_whatsapp ?? undefined,
            sellerEmail: row.seller_email ?? undefined, sellerAvatar: row.seller_avatar ?? undefined,
            material: row.material ?? undefined, frameSize: row.frame_size ?? undefined, drivetrain: row.drivetrain ?? undefined,
            drivetrainDetail: row.drivetrain_detail ?? undefined, wheelset: row.wheelset ?? undefined, wheelSize: row.wheel_size ?? undefined,
            extras: row.extras ?? undefined, status: row.status ?? 'active',
            expiresAt: row.expires_at ? Date.parse(row.expires_at) : null,
            renewalNotifiedAt: row.renewal_notified_at ? Date.parse(row.renewal_notified_at) : null,
            createdAt: row.created_at ? Date.parse(row.created_at) : Date.now(),
          }))
          setListings(mapped)
          setServerMode(true)
          setServerTotal(typeof total === 'number' ? total : null)
          try {
            const sellerIds = Array.from(new Set(mapped.map((x) => x.sellerId).filter(Boolean)))
            const logos = await fetchStoresMeta(sellerIds)
            if (active) setStoreLogos(logos)
          } catch { /* noop */ }
          setLoading(false)
          return
        } catch { /* noop */ }
      }
      // Fallback: mock data si no hay supabase
      if (supabaseEnabled) {
        // ya retornó antes
      } else {
        if (!active) return
        setServerMode(false)
        setServerTotal(null)
        setListings(mockListings)
        setLoading(false)
        return
      }
    }
    void load()
    return () => {
      active = false
    }
  }, [paramsKey, sortMode, fx])

  const categoryFiltered = useMemo(() => {
    if (serverMode) return listings
    if (Array.isArray(allowedCats) && allowedCats.length) {
      const set = new Set(allowedCats)
      return listings.filter((listing) => set.has(listing.category as Cat))
    }
    if (effectiveCat === 'Todos') {
      if (filters.bikes === '1') {
        // Excluir accesorios, indumentaria y nutrición cuando 'Solo bicicletas'
        return listings.filter((l) => l.category !== 'Accesorios' && l.category !== 'Indumentaria' && l.category !== 'Nutrición')
      }
      return listings
    }
    return listings.filter((listing) => listing.category === effectiveCat)
  }, [listings, serverMode, effectiveCat, allowedCats?.join(','), filters.bikes])

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
      location: 'location' in patch ? patch.location ?? [] : filters.location,
      transmissionType: 'transmissionType' in patch ? patch.transmissionType ?? [] : filters.transmissionType,
      priceCur: 'priceCur' in patch ? patch.priceCur : filters.priceCur,
      priceMin: 'priceMin' in patch ? patch.priceMin : filters.priceMin,
      priceMax: 'priceMax' in patch ? patch.priceMax : filters.priceMax,
      deal: 'deal' in patch ? patch.deal : filters.deal,
      store: 'store' in patch ? patch.store : filters.store,
      bikes: 'bikes' in patch ? patch.bikes : filters.bikes,
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
    const txTypeSet = new Set(filters.transmissionType.map((value) => normalizeText(value)))
    const conditionSet = new Set(filters.condition.map((value) => normalizeText(value)))
    const brakeSet = new Set(filters.brake.map((value) => normalizeText(value)))
    const yearSet = new Set(filters.year.map((value) => normalizeText(value)))
    const sizeSet = new Set(filters.size.map((value) => normalizeText(value)))
    const locationSet = new Set(filters.location.map((value) => normalizeText(value)))
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

      if (txTypeSet.size) {
        const val = derived.transmissionType || inferTransmissionType(listing.drivetrain) || inferTransmissionType(listing.drivetrainDetail)
        if (!val || !txTypeSet.has(normalizeText(val))) return false
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
        // valores numéricos en extras: "tamaño/tamano cuadro", "talle", "talles"
        const sizeTextCandidates: string[] = []
        if (extrasMap['tamano cuadro']) sizeTextCandidates.push(extrasMap['tamano cuadro'])
        if (extrasMap['talle']) sizeTextCandidates.push(extrasMap['talle'])
        if (extrasMap['talles']) sizeTextCandidates.push(...extrasMap['talles'].split(',').map((s) => s.trim()))
        for (const txt of sizeTextCandidates) {
          const n = parseFrameSizeCm(txt)
          if (n != null) extrasCandidates.push(n)
        }

        // Coincidencia por talle de indumentaria
        const hasSingle = derived.apparelSize ? sizeSet.has(normalizeText(derived.apparelSize)) : false
        // Multitalle en extras (texto)
        const anyMulti = (extrasMap.talles || '')
          .split(',')
          .map((s) => s.trim())
          .filter(Boolean)
          .some((s) => sizeSet.has(normalizeText(s)))
        // Coincidencia directa por texto
        const directText = listing.frameSize ? sizeSet.has(normalizeText(listing.frameSize)) : false
        // Equivalencia numérica exacta (frame o extras)
        const numericEq = (frameCm != null && selectedNumeric.includes(frameCm)) || extrasCandidates.some((n) => selectedNumeric.includes(n))
        // Rango por letras (frame o extras)
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
        if (!(hasSingle || anyMulti || directText || numericEq || letterRange)) return false
      }

      // Ubicación: match si cualquier token seleccionado aparece en la ubicación del listing
      if (locationSet.size) {
        const rawLoc = (listing.sellerLocation || listing.location || '').toString()
        const parts = rawLoc.split(',').map((s) => normalizeText(s.trim())).filter(Boolean)
        const hasAny = parts.some((p) => locationSet.has(p))
        if (!hasAny) return false
      }

      // Precio: si hay moneda elegida, convertir y comparar en esa moneda (fx oficial del día)
      const listCur = (String(listing.priceCurrency || 'ARS').toUpperCase() as 'USD' | 'ARS')
      const toSelected = (value: number): number => {
        if (!filters.priceCur) return value
        if (filters.priceCur === listCur) return value
        return filters.priceCur === 'USD' ? value / fx : value * fx
      }
      const priceInSelected = toSelected(listing.price)
      if (priceMin !== null && priceInSelected < priceMin) return false
      if (priceMax !== null && priceInSelected > priceMax) return false

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

    // Filtro: solo tiendas oficiales (aplica también en serverMode por consistencia)
    const filteredByStore = (() => {
      if (filters.store === '1') {
        return filteredList.filter((l) => Boolean(l.sellerId && storeLogos[l.sellerId]))
      }
      return filteredList
    })()

    const sorted = [...filteredByStore]
    // En serverMode preservamos el orden del backend para 'relevance'
    if (serverMode && sortMode === 'relevance') {
      return filteredByStore
    }
    if (sortMode === 'relevance') {
      return sorted.sort((a, b) => {
        const now = Date.now()
        const boostScore = (l: Listing) => {
          const rawBoost = typeof l.rankBoostUntil === 'number'
            ? l.rankBoostUntil
            : (l.rankBoostUntil ? Date.parse(l.rankBoostUntil as any) : 0)
          const active = rawBoost > now
          if (!active) return 0
          const granted = (l as any).grantedVisiblePhotos ?? (l as any).granted_visible_photos ?? 4
          if (granted >= 12) return 3 // Prioridad ALTA (Pro)
          if (granted >= 8) return 2 // Prioridad (Premium)
          return 1
        }
        const storeScore = (l: Listing) => (l.sellerId ? (storeLogos[l.sellerId] ? 1 : 0) : 0)

        const rA = boostScore(a)
        const rB = boostScore(b)
        if (rB !== rA) return rB - rA

        // En igualdad de boost, priorizar usuarios comunes sobre tiendas
        const sA = storeScore(a)
        const sB = storeScore(b)
        if (sA !== sB) return sA - sB

        // Dentro del mismo grupo, más likes primero (si no hay datos, 0)
        const aLikes = likeCounts[a.id] || 0
        const bLikes = likeCounts[b.id] || 0
        if (bLikes !== aLikes) return bLikes - aLikes

        // Si ambos están destacados, desempatar por vencimiento del destaque (más lejano primero)
        if (rA === 2) {
          const aHex = a.highlightExpires ?? 0
          const bHex = b.highlightExpires ?? 0
          if (bHex !== aHex) return bHex - aHex
        }

        // Fallback general: más recientes primero
        return (b.createdAt ?? 0) - (a.createdAt ?? 0)
      })
    }
    if (sortMode === 'newest') {
      return sorted.sort((a, b) => (b.createdAt ?? 0) - (a.createdAt ?? 0))
    }
      const toSelected = (l: Listing) => {
      if (!filters.priceCur) return l.price
      const cur = (String(l.priceCurrency || 'ARS').toUpperCase() as 'USD' | 'ARS')
      return filters.priceCur === cur ? l.price : (filters.priceCur === 'USD' ? l.price / fx : l.price * fx)
    }
    return sorted.sort((a, b) => {
      const pa = toSelected(a)
      const pb = toSelected(b)
      return sortMode === 'asc' ? pa - pb : pb - pa
    })
  }, [categoryFiltered, filters, sortMode, listingMetadata, effectiveDeal, storeLogos, likeCounts, serverMode, listings])

  const visible = serverMode ? filtered : filtered.slice(0, count)

  // Botón "Cargar más" (modo cliente): agrega más items sin mover el viewport hacia arriba
  const handleLoadMoreClient = useCallback(() => {
    // Método robusto: conservar scrollY exacto antes y después
    const prevY = window.scrollY || window.pageYOffset || 0
    setCount((c) => Math.min(c + 40, filtered.length))
    // Reinstate exact same scroll position after render
    requestAnimationFrame(() => {
      window.scrollTo({ top: prevY, left: 0, behavior: 'auto' })
      // Una segunda pasada por posibles reflows de imágenes
      setTimeout(() => {
        window.scrollTo({ top: prevY, left: 0, behavior: 'auto' })
      }, 80)
    })
  }, [filtered.length])

  // Botón "Cargar más" (modo servidor): pide siguiente página manteniendo scroll fijo
  const handleLoadMoreServer = useCallback(async () => {
    if (!serverMode) return
    if (loadingMoreRef.current) return
    const total = serverTotal ?? Infinity
    if (listings.length >= total) return
    const prevY = window.scrollY || window.pageYOffset || 0
    loadingMoreRef.current = true
    try {
      const { items, total: t } = await fetchMarket({
        cat: effectiveCat === 'Todos' ? undefined : effectiveCat,
        q: filters.q,
        deal: effectiveDeal === '1',
        store: filters.store === '1',
        sort: sortMode,
        priceCur: filters.priceCur,
        priceMin: filters.priceMin,
        priceMax: filters.priceMax,
        fx,
        subcat: filters.subcat,
        brand: filters.brand,
        material: filters.material,
        frameSize: filters.frameSize,
        wheelSize: filters.wheelSize,
        drivetrain: filters.drivetrain,
        condition: filters.condition,
        brake: filters.brake,
        year: filters.year,
        size: filters.size,
        location: filters.location,
        limit: 48,
        offset: listings.length,
      })
      const mapped: Listing[] = (items || []).map((row: any) => ({
        id: String(row.id), slug: row.slug ?? undefined, title: row.title, brand: row.brand, model: row.model,
        year: typeof row.year === 'number' ? row.year : undefined,
        category: row.category, subcategory: row.subcategory ?? undefined,
        price: Number(row.price) || 0, priceCurrency: (row.price_currency || undefined),
        originalPrice: typeof row.original_price === 'number' ? row.original_price : undefined,
        location: row.location || '', description: row.description || '', images: Array.isArray(row.images) ? row.images : [],
        sellerId: row.seller_id, sellerName: row.seller_name ?? undefined,
        sellerPlan: (row.plan || undefined), plan: (row.plan || undefined),
        sellerPlanExpires: row.seller_plan_expires ? Date.parse(row.seller_plan_expires) : undefined,
        highlightExpires: row.highlight_expires ? Date.parse(row.highlight_expires) : undefined,
        sellerLocation: row.seller_location ?? undefined, sellerWhatsapp: row.seller_whatsapp ?? undefined,
        sellerEmail: row.seller_email ?? undefined, sellerAvatar: row.seller_avatar ?? undefined,
        material: row.material ?? undefined, frameSize: row.frame_size ?? undefined, drivetrain: row.drivetrain ?? undefined,
        drivetrainDetail: row.drivetrain_detail ?? undefined, wheelset: row.wheelset ?? undefined, wheelSize: row.wheel_size ?? undefined,
        extras: row.extras ?? undefined, status: row.status ?? 'active',
        expiresAt: row.expires_at ? Date.parse(row.expires_at) : null,
        renewalNotifiedAt: row.renewal_notified_at ? Date.parse(row.renewal_notified_at) : null,
        createdAt: row.created_at ? Date.parse(row.created_at) : Date.now(),
      }))
      setListings((prev) => {
        const byId = new Map(prev.map((x) => [x.id, x]))
        const next: Listing[] = [...prev]
        for (const m of mapped) {
          if (!byId.has(m.id)) next.push(m)
        }
        return next
      })
      if (typeof t === 'number') setServerTotal(t)
    } finally {
      loadingMoreRef.current = false
      requestAnimationFrame(() => {
        window.scrollTo({ top: prevY, left: 0, behavior: 'auto' })
        setTimeout(() => window.scrollTo({ top: prevY, left: 0, behavior: 'auto' }), 80)
      })
    }
  }, [serverMode, serverTotal, listings.length, effectiveCat, filters, sortMode, fx])

  // Batch-like counts for visible listings
  useEffect(() => {
    const ids = visible.map((l) => l.id)
    if (!ids.length) { setLikeCounts({}); return }
    let active = true
    ;(async () => {
      try {
        const map = await fetchLikeCounts(ids)
        if (active) setLikeCounts(map)
      } catch { /* noop */ }
    })()
    return () => { active = false }
  }, [visible.map((l) => l.id).join(',')])

  useEffect(() => {
    // Menor carga inicial para mejorar LCP en mobile (sólo modo cliente)
    if (navType !== 'POP') setCount(12)
  }, [paramsKey, navType])

  useEffect(() => {
    if (!sentinelRef.current) return
    if (restoringRef.current) return
    const el = sentinelRef.current
    const io = new IntersectionObserver((entries) => {
      const entry = entries[0]
      if (!entry.isIntersecting) return
      if (serverMode) {
        // Cargar siguiente página desde el backend
        if (loadingMoreRef.current) return
        const total = serverTotal ?? Infinity
        if (listings.length >= total) return
        loadingMoreRef.current = true
        ;(async () => {
          try {
            const { items, total: t } = await fetchMarket({
              cat: effectiveCat === 'Todos' ? undefined : effectiveCat,
              q: filters.q,
              deal: effectiveDeal === '1',
              store: filters.store === '1',
              sort: sortMode,
              priceCur: filters.priceCur,
              priceMin: filters.priceMin,
              priceMax: filters.priceMax,
              fx,
              subcat: filters.subcat,
              brand: filters.brand,
              material: filters.material,
              frameSize: filters.frameSize,
              wheelSize: filters.wheelSize,
              drivetrain: filters.drivetrain,
              condition: filters.condition,
              brake: filters.brake,
              year: filters.year,
              size: filters.size,
              location: filters.location,
              limit: 48,
              offset: listings.length,
            })
            const mapped: Listing[] = (items || []).map((row: any) => ({
              id: String(row.id),
              slug: row.slug ?? undefined,
              title: row.title,
              brand: row.brand,
              model: row.model,
              year: typeof row.year === 'number' ? row.year : undefined,
              category: row.category,
              subcategory: row.subcategory ?? undefined,
              price: Number(row.price) || 0,
              priceCurrency: (row.price_currency || undefined),
              originalPrice: typeof row.original_price === 'number' ? row.original_price : undefined,
              location: row.location || '',
              description: row.description || '',
              images: Array.isArray(row.images) ? row.images : [],
              sellerId: row.seller_id,
              sellerName: row.seller_name ?? undefined,
              sellerPlan: (row.plan || undefined),
              plan: (row.plan || undefined),
              sellerPlanExpires: row.seller_plan_expires ? Date.parse(row.seller_plan_expires) : undefined,
              highlightExpires: row.highlight_expires ? Date.parse(row.highlight_expires) : undefined,
              sellerLocation: row.seller_location ?? undefined,
              sellerWhatsapp: row.seller_whatsapp ?? undefined,
              sellerEmail: row.seller_email ?? undefined,
              sellerAvatar: row.seller_avatar ?? undefined,
              material: row.material ?? undefined,
              frameSize: row.frame_size ?? undefined,
              drivetrain: row.drivetrain ?? undefined,
              drivetrainDetail: row.drivetrain_detail ?? undefined,
              wheelset: row.wheelset ?? undefined,
              wheelSize: row.wheel_size ?? undefined,
              extras: row.extras ?? undefined,
              status: row.status ?? 'active',
              expiresAt: row.expires_at ? Date.parse(row.expires_at) : null,
              renewalNotifiedAt: row.renewal_notified_at ? Date.parse(row.renewal_notified_at) : null,
              createdAt: row.created_at ? Date.parse(row.created_at) : Date.now(),
            }))
            setListings((prev) => {
              const byId = new Map(prev.map((x) => [x.id, x]))
              const next: Listing[] = [...prev]
              for (const m of mapped) {
                if (!byId.has(m.id)) next.push(m)
              }
              return next
            })
            if (typeof t === 'number') setServerTotal(t)
            // Actualizar logos para nuevos sellers
            try {
              const sellerIds = Array.from(new Set(mapped.map((x) => x.sellerId).filter(Boolean)))
              if (sellerIds.length) {
                const logos = await fetchStoresMeta(sellerIds)
                setStoreLogos((prev) => ({ ...prev, ...logos }))
              }
            } catch { /* noop */ }
          } finally {
            loadingMoreRef.current = false
          }
        })()
      } else {
        setCount((c) => (c + 24 <= filtered.length ? c + 24 : filtered.length))
      }
    }, { rootMargin: '600px 0px' })
    io.observe(el)
    return () => io.disconnect()
  }, [serverMode, serverTotal, listings.length, paramsKey, sortMode, fx])

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
      const media = buildImageSource(img, { profile: 'card', sizes: '(max-width: 1279px) 50vw, 33vw' })
      if (!media?.src) continue
      link.href = media.src
      if (media.srcSet) link.setAttribute('imagesrcset', media.srcSet)
      if (media.sizes) link.setAttribute('imagesizes', media.sizes)
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
      store: undefined,
      bikes: undefined,
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
  if (filters.store === '1') {
    activeFilterChips.push({
      key: 'store',
      label: 'Tiendas oficiales',
      onRemove: () => setFilters({ store: undefined })
    })
  }
  if (filters.bikes === '1') {
    activeFilterChips.push({
      key: 'bikes',
      label: 'Solo bicicletas',
      onRemove: () => setFilters({ bikes: undefined })
    })
  }

  const hasActiveFilters = activeFilterChips.length > 0

  const pathname = location.pathname || '/marketplace'
  const baseMarketplacePath = useMemo(
    () => (/^\/(market|buscar)/.test(pathname) ? '/marketplace' : pathname || '/marketplace'),
    [pathname],
  )
  const effectiveDealActive = Boolean(forcedDeal || effectiveDeal === '1')
  const categoryKey: CategorySeoKey = effectiveDealActive ? 'Deals' : effectiveCat
  const categoryContent = CATEGORY_SEO_CONTENT[categoryKey] ?? CATEGORY_SEO_CONTENT.Todos

  const totalResults = useMemo(
    () => (serverMode ? (typeof serverTotal === 'number' ? serverTotal : filtered.length) : filtered.length),
    [serverMode, serverTotal, filtered.length],
  )

  const primaryLocation = filters.location && filters.location.length ? filters.location[0]?.trim() || null : null

  const filterIntensity = [
    filters.brand?.length,
    filters.material?.length,
    filters.frameSize?.length,
    filters.wheelSize?.length,
    filters.drivetrain?.length,
    filters.condition?.length,
    filters.brake?.length,
    filters.year?.length,
    filters.size?.length,
    filters.location?.length,
    filters.subcat ? 1 : 0,
    filters.priceCur ? 1 : 0,
    filters.priceMin ? 1 : 0,
    filters.priceMax ? 1 : 0,
    filters.store ? 1 : 0,
  ].reduce((acc, value) => acc + (value ? 1 : 0), 0)

  const isSearch = Boolean(filters.q)
  const thinResults = !loading && filtered.length > 0 && filtered.length < 3
  const shouldApplyNoIndex =
    !forcedCat &&
    !(allowedCats && allowedCats.length) &&
    !effectiveDealActive &&
    !forcedDeal &&
    (isSearch || filterIntensity >= 2 || thinResults)

  const canonicalPath = useMemo(() => {
    if (seoOverrides?.canonicalPath) return seoOverrides.canonicalPath
    if (effectiveDealActive) return '/ofertas-destacadas'
    if (forcedCat) return categoryToCanonicalPath(forcedCat) ?? pathname
    if (allowedCats && allowedCats.length) return pathname
    if (filters.deal === '1') return '/ofertas-destacadas'
    if (filters.cat && filters.cat !== 'Todos') {
      const mapped = categoryToCanonicalPath(filters.cat)
      if (mapped) return mapped
    }
    if (pathname === '/buscar' || pathname === '/market') return '/marketplace'
    return pathname || '/marketplace'
  }, [seoOverrides?.canonicalPath, effectiveDealActive, forcedCat, allowedCats?.length, filters.deal, filters.cat, pathname])

  const canonicalUrl = useMemo(
    () => absoluteUrl(canonicalPath ?? baseMarketplacePath, siteOrigin) ?? `${siteOrigin}${canonicalPath ?? baseMarketplacePath}`,
    [canonicalPath, baseMarketplacePath, siteOrigin],
  )

  const topListings = useMemo(() => filtered.slice(0, Math.min(filtered.length, 12)), [filtered])

  const highlightTokens: string[] = []
  if (filters.brand?.length) highlightTokens.push(`marcas como ${formatList(filters.brand, 3)}`)
  if (filters.material?.length) highlightTokens.push(`materiales ${formatList(filters.material, 3)}`)
  if ((filters.size?.length || filters.frameSize?.length) && highlightTokens.length < 2) highlightTokens.push('talles específicos')
  if ((filters.priceMin || filters.priceMax || filters.priceCur) && highlightTokens.length < 2) highlightTokens.push('tu presupuesto')
  if (filters.location && filters.location.length > 1 && highlightTokens.length < 2) highlightTokens.push('ciudades cercanas')

  const countLabel = formatResultsCount(typeof totalResults === 'number' ? totalResults : filtered.length)
  const locationSuffix = primaryLocation ? ` en ${primaryLocation}` : ''

  const navigate = useNavigate()
  const { user } = useAuth()

  const handleSaveSearch = useCallback(async () => {
    try {
      if (!user?.id || !supabaseEnabled) {
        navigate(`/login?redirect=${encodeURIComponent(location.pathname + location.search)}`)
        return
      }
      const params = filtersToSearchParams(searchParams, filters)
      const urlPath = `${baseMarketplacePath}${params.toString() ? `?${params.toString()}` : ''}`
      const nameParts: string[] = []
      if (filters.cat && filters.cat !== 'Todos') nameParts.push(String(filters.cat))
      const size = (filters.size && filters.size.length ? filters.size[0] : '') || ''
      if (size) nameParts.push(`Talle ${size}`)
      if (typeof filters.priceMax === 'number' && filters.priceMax > 0) {
        const cur = filters.priceCur === 'USD' || filters.priceCur === 'ARS' ? filters.priceCur : 'USD'
        nameParts.push(`Hasta ${filters.priceMax} ${cur}`)
      }
      if (filters.brand && filters.brand.length) nameParts.push(`Marca ${filters.brand[0]}`)
      const suggested = nameParts.length ? nameParts.join(', ') : 'Búsqueda guardada'
      const name = window.prompt('Nombre para tu búsqueda', suggested) || suggested
      const criteriaPayload: Record<string, unknown> = { ...filters, url: urlPath }
      const created = await saveSearch(criteriaPayload, name)
      if (created?.id) {
        window.alert('Búsqueda guardada')
      } else {
        window.alert('No se pudo guardar la búsqueda. Intentá más tarde.')
      }
    } catch (err) {
      console.warn('[save-search] failed', err)
      window.alert('No se pudo guardar la búsqueda. Intentá más tarde.')
    }
  }, [user?.id, supabaseEnabled, searchParams, filters, baseMarketplacePath, location.pathname, location.search, navigate])
  const filterSentence = highlightTokens.length ? ` Filtrá por ${formatList(highlightTokens, highlightTokens.length)}.` : ''
  const dealsSentence = effectiveDealActive
    ? ' Aprovechá descuentos validados, seguí las bajas de precio y contactá directo al vendedor.'
    : ' Contactá directo con vendedores verificados y tiendas oficiales.'
  const description = `Encontrá ${countLabel} ${categoryContent.descriptor}${locationSuffix} en Ciclo Market.${filterSentence}${dealsSentence}`.replace(/\s+/g, ' ').trim()

  const baseHeading =
    headingTitle ?? (effectiveDealActive ? 'Ofertas destacadas' : CATEGORY_TITLE_MAP[effectiveCat] ?? 'Marketplace de bicicletas')

  let titleCore: string
  if (filters.q) {
    titleCore = `Resultados para "${filters.q}"`
    if (effectiveCat !== 'Todos') {
      titleCore += ` en ${CATEGORY_TITLE_MAP[effectiveCat] ?? effectiveCat}`
    }
    if (primaryLocation) {
      titleCore += ` en ${primaryLocation}`
    }
  } else {
    titleCore = baseHeading
    if (effectiveDealActive && effectiveCat !== 'Todos' && !forcedDeal) {
      titleCore += ` · ${CATEGORY_TITLE_MAP[effectiveCat] ?? effectiveCat}`
    }
    if (primaryLocation && !titleCore.toLowerCase().includes(primaryLocation.toLowerCase())) {
      titleCore += ` en ${primaryLocation}`
    }
  }
  titleCore = titleCore.trim()

  const breadcrumbItems = useMemo(() => {
    const seen = new Set<string>()
    const items: Array<{ name: string; item: string }> = []
    const push = (name: string, item: string) => {
      const key = `${name}|${item}`
      if (seen.has(key)) return
      seen.add(key)
      items.push({ name, item })
    }
    push('Inicio', '/')
    push('Marketplace', '/marketplace')
    if (effectiveDealActive) {
      push('Ofertas destacadas', '/ofertas-destacadas')
    } else if (forcedCat || effectiveCat !== 'Todos' || (allowedCats && allowedCats.length)) {
      push(headingTitle ?? CATEGORY_TITLE_MAP[effectiveCat] ?? 'Categoría', canonicalPath ?? baseMarketplacePath)
    }
    return items
  }, [effectiveDealActive, forcedCat, effectiveCat, allowedCats?.length, headingTitle, canonicalPath, baseMarketplacePath])

  const breadcrumbSchema = useMemo(() => buildBreadcrumbList(breadcrumbItems, siteOrigin), [breadcrumbItems, siteOrigin])

  const itemListSchema = useMemo(() => {
    const elements = topListings
      .map((listing, index) => {
        const slug = listing.slug || listing.id
        if (!slug) return null
        const listingPath = `/listing/${listing.slug ?? listing.id}`
        const url = absoluteUrl(listingPath, siteOrigin)
        if (!url) return null
        return {
          '@type': 'ListItem' as const,
          position: index + 1,
          name: listingDisplayName(listing),
          url,
        }
      })
      .filter((entry): entry is { '@type': 'ListItem'; position: number; name: string; url: string } => Boolean(entry))
    if (!elements.length) return null
    return {
      '@context': 'https://schema.org',
      '@type': 'ItemList',
      name: `${titleCore} - Ciclo Market`,
      url: canonicalUrl,
      numberOfItems: elements.length,
      itemListElement: elements,
    }
  }, [topListings, siteOrigin, canonicalUrl, titleCore])

  const baseJsonLd = useMemo<Record<string, unknown>[]>(
    () => filterJsonLdArray([breadcrumbSchema, itemListSchema]),
    [breadcrumbSchema, itemListSchema],
  )

  const otherOverrides = useMemo(() => {
    if (!seoOverrides) return {}
    const { jsonLd: _jsonLd, keywords: _keywords, ...rest } = seoOverrides
    return rest
  }, [seoOverrides])

  const overrideJsonLd = useMemo<Record<string, unknown>[]>(() => {
    const raw = seoOverrides?.jsonLd
    if (!raw) return []
    if (Array.isArray(raw)) return filterJsonLdArray(raw)
    return filterJsonLdArray([raw])
  }, [seoOverrides?.jsonLd])

  const jsonLdPayload = useMemo<Record<string, unknown>[] | undefined>(() => {
    const merged = filterJsonLdArray([...baseJsonLd, ...overrideJsonLd])
    return merged.length ? merged : undefined
  }, [baseJsonLd, overrideJsonLd])

  const baseKeywords = useMemo(() => {
    const keywords = new Set<string>()
    keywords.add('ciclomarket')
    keywords.add('marketplace de bicicletas')
    keywords.add(categoryContent.descriptor)
    if (effectiveDealActive) keywords.add('ofertas bicicletas')
    if (filters.q) keywords.add(`busqueda ${filters.q}`.toLowerCase())
    if (primaryLocation) keywords.add(`bicicletas en ${primaryLocation}`)
    if (effectiveCat !== 'Todos') keywords.add(`bicicletas ${effectiveCat.toLowerCase()}`)
    return Array.from(keywords)
  }, [categoryContent.descriptor, effectiveDealActive, filters.q, primaryLocation, effectiveCat])

  const mergedKeywords = useMemo(() => {
    const source = seoOverrides?.keywords
    if (!source) return baseKeywords
    const overrideList = Array.isArray(source) ? source : [source]
    const set = new Set<string>(baseKeywords)
    for (const value of overrideList) {
      if (typeof value === 'string' && value.trim()) {
        set.add(value.trim())
      }
    }
    return Array.from(set)
  }, [baseKeywords, seoOverrides?.keywords])

  const seoConfig = useMemo<Partial<SeoHeadProps>>(
    () => ({
      title: titleCore,
      description,
      canonicalPath,
      noIndex: shouldApplyNoIndex,
      keywords: mergedKeywords,
      jsonLd: jsonLdPayload,
      ...otherOverrides,
    }),
    [titleCore, description, canonicalPath, shouldApplyNoIndex, mergedKeywords, jsonLdPayload, otherOverrides],
  )

  const seoDetailsSummary = categoryContent.summary
  const seoDetailsCopy = categoryContent.copy

  return (
    <>
      <SeoHead {...seoConfig} />
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
            <div className="grid grid-cols-2 sm:grid-cols-4 gap-2 sm:gap-4">
              {CATEGORY_CARDS.map((card) => {
                const isActive = card.cat === 'Todos'
                  ? (filters.cat === 'Todos' && filters.bikes === '1')
                  : (filters.cat === card.cat)
                return (
                  <button
                    key={card.cat}
                    type="button"
                    onClick={() => {
                      if (card.cat === 'Todos') {
                        setFilters({ cat: 'Todos', bikes: '1' })
                      } else {
                        setFilters({ cat: card.cat, bikes: undefined })
                      }
                    }}
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
                          <span className="text-sm font-semibold text-white sm:text-lg drop-shadow-[0_1px_2px_rgba(0,0,0,0.8)]">{card.label}</span>
                          <span className="hidden text-xs text-white/80 sm:block">{card.description}</span>
                        </div>
                      </div>
                    </div>
                  </button>
                )
              })}
              {/* Nutrición tile */}
              <Link
                to="/marketplace?cat=Nutrici%C3%B3n"
                className="relative w-full overflow-hidden rounded-3xl border-2 border-white/15 bg-white/5 transition hover:border-white/30 hover:shadow-md focus:outline-none focus-visible:ring-2 focus-visible:ring-white/80 focus-visible:ring-offset-2 focus-visible:ring-offset-[#14212e]"
              >
                <div className="relative aspect-square sm:aspect-[17/5]">
                  <picture className="block h-full w-full">
                    <source media="(max-width: 640px)" srcSet="/design/Banners-Mobile/4.webp" />
                    <img src="/design/Banners/4.webp" alt="Nutrición" className="h-full w-full object-cover" loading="lazy" decoding="async" />
                  </picture>
                  <div className="absolute inset-0 bg-gradient-to-t from-[#050c18]/85 via-transparent to-transparent" aria-hidden />
                    <div className="absolute inset-0 flex items-end p-2 sm:p-4">
                      <div className="space-y-1 text-left">
                      <span className="text-sm font-semibold text-white sm:text-lg drop-shadow-[0_1px_2px_rgba(0,0,0,0.8)]">Nutrición</span>
                      <span className="hidden text-xs text-white/80 sm:block">Energía e hidratación</span>
                    </div>
                  </div>
                </div>
              </Link>
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

            <div className="sm:hidden text-xs text-white/70">{(serverMode && serverTotal != null) ? serverTotal : filtered.length} resultados</div>
            {user ? (
              <div className="sm:hidden mt-2">
                <button
                  type="button"
                  onClick={handleSaveSearch}
                  className="w-full rounded-full bg-white px-4 py-2 text-center text-sm font-semibold text-[#14212e] shadow hover:bg-white/95"
                >
                  Guardar búsqueda
                </button>
              </div>
            ) : null}

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
                <div className="text-sm text-white/70">{(serverMode && serverTotal != null) ? serverTotal : filtered.length} resultados</div>
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
                  {user ? (
                    <button
                      type="button"
                      onClick={handleSaveSearch}
                      className="btn ml-2 rounded-full bg-white px-4 py-2 text-sm font-semibold text-[#14212e] hover:bg-white/90"
                      title="Guardá esta búsqueda para volver rápido"
                    >
                      Guardar búsqueda
                    </button>
                  ) : null}
                </div>
              </div>

              <div className="hidden sm:flex flex-wrap items-center text-sm gap-y-2">
                {forcedCat || (allowedCats && allowedCats.length) ? null : (
                <div className="px-3 first:pl-0 border-l border-white/20 first:border-l-0 whitespace-nowrap">
                <FilterDropdown label="Categoría" summary={filters.cat} variant="inline">
                  {({ close }) => (
                    <div className="flex flex-col gap-1 text-sm">
                      {CAT_VALUES.map((cat) => {
                        const isActive = filters.cat === cat
                        return (
                          <button
                            key={cat}
                            type="button"
                            onClick={() => {
                              setFilters({ cat, bikes: undefined })
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
                </div>
                )}

                {/* Tamaños de cuadro (frameSize) primero */}
                {UI_FILTERS_BEFORE_PRICE.map((key) => {
                  const rawOptions = facetsData.options[key]
                  const options = Array.from(new Set([...rawOptions, ...filters[key]]))
                  return (
                    <div key={key} className="px-3 border-l border-white/20 first:border-l-0 whitespace-nowrap">
                      <FilterDropdown
                        label={MULTI_FILTER_LABELS[key]}
                        summary={summaryFor(key)}
                        disabled={key === 'size' ? false : !options.length}
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
                              onChange={(next) => setFilters({ [key]: next } as Partial<FiltersState>)}
                              close={close}
                              placeholder={`Buscar ${MULTI_FILTER_LABELS[key].toLowerCase()}`}
                            />
                          )
                        )}
                      </FilterDropdown>
                    </div>
                  )
                })}

                {/* Precio segundo */}
                <div className="px-3 border-l border-white/20 first:border-l-0 whitespace-nowrap">
                  <FilterDropdown label="Precio" summary={priceSummary} variant="inline">
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

                {/* Resto de filtros en el orden solicitado */}
                {UI_FILTERS_AFTER_PRICE.map((key) => {
                  const rawOptions = facetsData.options[key]
                  const options = Array.from(new Set([...rawOptions, ...filters[key]]))
                  return (
                    <div key={key} className="px-3 border-l border-white/20 first:border-l-0 whitespace-nowrap">
                      <FilterDropdown
                        label={MULTI_FILTER_LABELS[key]}
                        summary={summaryFor(key)}
                        disabled={!options.length}
                        variant="inline"
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
                    </div>
                  )
                })}

                <div className="px-3 border-l border-white/20 first:border-l-0 whitespace-nowrap">
                <FilterDropdown label="Promos" summary={effectiveDeal === '1' ? 'Activas' : 'Todas'} variant="inline">
                  {({ close }) => (
                    <DealFilterContent
                      active={effectiveDeal === '1'}
                      onToggle={(active) => { if (!forcedDeal) setFilters({ deal: active ? '1' : undefined }) }}
                      close={close}
                    />
                  )}
                </FilterDropdown>
                </div>

                <div className="px-3 border-l border-white/20 first:border-l-0 whitespace-nowrap">
                <FilterDropdown label="Tiendas oficiales" summary={filters.store === '1' ? 'Solo tiendas' : 'Todas'} variant="inline">
                  {({ close }) => (
                    <StoreFilterContent
                      active={filters.store === '1'}
                      onToggle={(active) => setFilters({ store: active ? '1' : undefined })}
                      close={close}
                    />
                  )}
                </FilterDropdown>
                </div>
              </div>

              {hasActiveFilters ? (
                <div className="text-xs text-white/70">
                  Filtros activos: {activeFilterChips.map((c) => c.label).join(', ')}{' '}
                  <button type="button" onClick={handleClearFilters} className="underline hover:text-white">Limpiar</button>
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
                <div className="grid -mx-2 grid-cols-1 gap-0 sm:mx-0 sm:grid-cols-2 sm:gap-5 lg:grid-cols-3" style={{ overflowAnchor: 'none' } as any}>
                  {visible.map((listing, idx) => (
                    <div
                      key={listing.id}
                      className="p-2 sm:p-0"
                      data-listing-id={listing.id}
                    >
                      <ListingCard
                        l={listing}
                        storeLogoUrl={storeLogos[listing.sellerId] || null}
                        priority={idx < 4}
                        likeCount={likeCounts[listing.id]}
                      />
                    </div>
                  ))}
                </div>
                <div ref={sentinelRef} className="h-12" />
                {serverMode && (serverTotal == null || listings.length < serverTotal) ? (
                  <div ref={loadMoreRef} className="flex justify-center">
                    <button
                      onClick={handleLoadMoreServer}
                      className="btn mt-4 bg-white text-[#14212e] hover:bg-white/90"
                    >
                      Cargar más
                    </button>
                  </div>
                ) : null}
                {!serverMode && visible.length < filtered.length ? (
                  <div ref={loadMoreRef} className="flex justify-center">
                    <button
                      onClick={handleLoadMoreClient}
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
          {seoDetailsCopy ? (
            <details className="seo-details mt-12">
              <summary className="seo-summary">{seoDetailsSummary}</summary>
              <div className="seo-copy">
                <p>{seoDetailsCopy}</p>
              </div>
            </details>
          ) : null}
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
                  variant="inline"
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
                              setFilters({ cat, bikes: undefined })
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
              {/* Tamaños de cuadro primero en mobile */}
              {UI_FILTERS_BEFORE_PRICE.map((key) => {
                const rawOptions = facetsData.options[key]
                const options = Array.from(new Set([...rawOptions, ...filters[key]]))
                return (
                  <FilterDropdown
                    key={`mobile-${key}`}
                    label={MULTI_FILTER_LABELS[key]}
                    summary={summaryFor(key)}
                    disabled={key === 'size' ? false : !options.length}
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
                          onChange={(next) => setFilters({ [key]: next } as Partial<FiltersState>)}
                          close={close}
                          placeholder={`Buscar ${MULTI_FILTER_LABELS[key].toLowerCase()}`}
                        />
                      )
                    )}
                  </FilterDropdown>
                )
              })}
              {/* Precio segundo en mobile */}
              <FilterDropdown
                label="Precio"
                summary={priceSummary}
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
              {/* Resto en el orden solicitado en mobile */}
              {UI_FILTERS_AFTER_PRICE.map((key) => {
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
                    variant="inline"
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
                label="Promos"
                summary={effectiveDeal === '1' ? 'Activas' : 'Todas'}
                className="w-full"
                buttonClassName="w-full justify-between"
                inlineOnMobile
                variant="inline"
              >
                {({ close }) => (
                  <DealFilterContent
                    active={effectiveDeal === '1'}
                    onToggle={(active) => { if (!forcedDeal) setFilters({ deal: active ? '1' : undefined }) }}
                    close={close}
                  />
                )}
              </FilterDropdown>
              <FilterDropdown
                label="Tiendas oficiales"
                summary={filters.store === '1' ? 'Solo tiendas' : 'Todas'}
                className="w-full"
                buttonClassName="w-full justify-between"
                inlineOnMobile
                variant="inline"
              >
                {({ close }) => (
                  <StoreFilterContent
                    active={filters.store === '1'}
                    onToggle={(active) => setFilters({ store: active ? '1' : undefined })}
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

export type { Cat }
