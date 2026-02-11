import type { Listing } from '../types'

type SpecItem = {
  key: string
  label: string
  value: string | null | undefined
  colSpan?: 1 | 2 | 3
  onEdit?: () => void
}

const normalizeKey = (s: string) =>
  (s || '')
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .toLowerCase()
    .trim()

const parseExtrasMap = (extras?: string | null) => {
  const out: Record<string, string> = {}
  if (!extras) return out
  const parts = extras.split('•').map((p) => p.trim()).filter(Boolean)
  for (const p of parts) {
    const idx = p.indexOf(':')
    if (idx === -1) continue
    const k = p.slice(0, idx).trim()
    const v = p.slice(idx + 1).trim()
    if (k) out[k] = v
  }
  return out
}

const getExtra = (map: Record<string, string>, key: string) => {
  const keyNorm = normalizeKey(key)
  for (const k of Object.keys(map)) {
    if (normalizeKey(k) === keyNorm) return map[k]
  }
  return ''
}

const HIDDEN_EXTRAS_KEYS_BASE = new Set(
  [
    'Talle',
    'Talles',
    'Año',
    'Ano',
    'Grupo',
    'Rodado',
    'Freno',
    'Tipo de freno',
    'Condición',
    'Condicion',
    'Material',
    'Tipo de transmisión',
    'Tipo de transmision',
    'Transmisión',
    'Transmision',
    'Batería',
    'Bateria',
  ].map(normalizeKey)
)

const getVisibleExtrasText = (extras: string | null | undefined, hiddenKeys: Set<string>) => {
  const parts = String(extras || '')
    .split('•')
    .map((p) => p.trim())
    .filter(Boolean)

  const visible = parts.filter((p) => {
    const idx = p.indexOf(':')
    if (idx === -1) return true
    const k = p.slice(0, idx).trim()
    return !hiddenKeys.has(normalizeKey(k))
  })

  return visible.join(' • ').trim()
}

function SpecCell({ label, value, colSpan = 1, onEdit }: Omit<SpecItem, 'key'>) {
  const displayValue = (value || '').toString().trim() || '—'
  return (
    <div className={`min-w-0 ${colSpan === 2 ? 'md:col-span-2' : colSpan === 3 ? 'md:col-span-3' : ''}`}>
      <div className="mb-1 flex items-center justify-between gap-2">
        <div className="text-[10px] font-bold uppercase tracking-wider text-gray-400">{label}</div>
        {onEdit ? (
          <button
            type="button"
            className="rounded-full border border-gray-200 bg-white p-1 text-gray-600 transition hover:bg-gray-50"
            aria-label={`Editar ${label}`}
            onClick={onEdit}
          >
            <svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24" className="h-3.5 w-3.5" fill="currentColor"><path d="M3 17.25V21h3.75L17.81 9.94l-3.75-3.75L3 17.25Zm14.71-9.04a1 1 0 0 0 0-1.41l-1.51-1.51a1 1 0 0 0-1.41 0l-1.13 1.13 3.75 3.75 1.3-1.46Z"/></svg>
          </button>
        ) : null}
      </div>
      <div className="text-sm font-semibold text-mb-ink truncate" title={displayValue}>
        {displayValue}
      </div>
    </div>
  )
}

type Props = {
  listing: Listing
  isModerator?: boolean
  onEditField?: (field: string, current: any, type: 'text' | 'number' | 'textarea') => void
  specCondition?: string | null
  specBrake?: string | null
  specFork?: string | null
  specFixieRatio?: string | null
  specMotor?: string | null
  specCharge?: string | null
  specTxType?: string | null
}

export default function ListingSpecs({
  listing,
  isModerator = false,
  onEditField,
  specCondition,
  specBrake,
  specFork,
  specFixieRatio,
  specMotor,
  specCharge,
  specTxType,
}: Props) {
  const extrasMap = parseExtrasMap(listing.extras)
  const items: SpecItem[] = []
  const isBike = listing.category !== 'Accesorios' && listing.category !== 'Indumentaria' && listing.category !== 'Nutrición'

  const add = (item: SpecItem) => {
    items.push(item)
  }

  add({ key: 'brand', label: 'Marca', value: listing.brand, onEdit: isModerator && onEditField ? () => onEditField('brand', listing.brand, 'text') : undefined })
  add({ key: 'model', label: 'Modelo', value: listing.model, onEdit: isModerator && onEditField ? () => onEditField('model', listing.model, 'text') : undefined })
  add({ key: 'year', label: 'Año', value: listing.year ? String(listing.year) : '', onEdit: isModerator && onEditField ? () => onEditField('year', listing.year ?? '', 'number') : undefined })
  add({ key: 'category', label: 'Categoría', value: listing.category })
  if (listing.subcategory) add({ key: 'subcategory', label: 'Tipo', value: listing.subcategory })

  if (listing.category === 'Nutrición') {
    const porcion = getExtra(extrasMap, 'Porción') || getExtra(extrasMap, 'Porcion')
    const carbs = getExtra(extrasMap, 'Carbohidratos')
    const sodio = getExtra(extrasMap, 'Sodio')
    const cafeina = getExtra(extrasMap, 'Cafeína') || getExtra(extrasMap, 'Cafeina')
    const calorias = getExtra(extrasMap, 'Calorías') || getExtra(extrasMap, 'Calorias')
    const porciones = getExtra(extrasMap, 'Porciones')
    const sabor = getExtra(extrasMap, 'Sabor')
    const vence = getExtra(extrasMap, 'Vence')
    const ingredientes = getExtra(extrasMap, 'Ingredientes')
    const alerg = getExtra(extrasMap, 'Alérgenos') || getExtra(extrasMap, 'Alergenos')

    if (porcion) add({ key: 'porcion', label: 'Porción', value: porcion })
    if (porciones) add({ key: 'porciones', label: 'Porciones', value: porciones })
    if (carbs) add({ key: 'carbs', label: 'Carbohidratos', value: carbs })
    if (sodio) add({ key: 'sodio', label: 'Sodio', value: sodio })
    if (cafeina) add({ key: 'cafeina', label: 'Cafeína', value: cafeina })
    if (calorias) add({ key: 'calorias', label: 'Calorías', value: calorias })
    if (sabor) add({ key: 'sabor', label: 'Sabor', value: sabor })
    if (vence) add({ key: 'vence', label: 'Vencimiento', value: vence })
    if (ingredientes) add({ key: 'ingredientes', label: 'Ingredientes', value: ingredientes, colSpan: 3 })
    if (alerg) add({ key: 'alergenos', label: 'Alérgenos', value: alerg, colSpan: 3 })
  } else if (listing.category === 'Indumentaria') {
    if (listing.material) {
      add({
        key: 'material',
        label: 'Material',
        value: listing.material,
        onEdit: isModerator && onEditField ? () => onEditField('material', listing.material, 'text') : undefined,
      })
    }
    if (listing.gender) add({ key: 'gender', label: 'Género', value: listing.gender, onEdit: isModerator && onEditField ? () => onEditField('gender', listing.gender, 'text') : undefined })
    const talles = getExtra(extrasMap, 'Talles') || ''
    if (talles) add({ key: 'talles', label: 'Talles', value: talles, colSpan: 3 })
    if (listing.frameSize) add({ key: 'frameSize', label: 'Talle', value: listing.frameSize, onEdit: isModerator && onEditField ? () => onEditField('frameSize', listing.frameSize, 'text') : undefined })
  } else {
    const parts = (listing.extras || '')
      .split('•')
      .map((p) => p.trim())
      .filter(Boolean)
    const token = parts.find((p) => p.toLowerCase().startsWith('talles:'))
    const multi = token ? token.split(':').slice(1).join(':').trim() : ''
    const sizeField = listing.frameSize || multi || ''
    const groupField = (listing.drivetrain || listing.drivetrainDetail || '') as string

    add({ key: 'material', label: 'Material', value: listing.material || '', onEdit: isModerator && onEditField ? () => onEditField('material', listing.material ?? '', 'text') : undefined })
    add({ key: 'size', label: 'Talle / Medida', value: sizeField, onEdit: isModerator && onEditField ? () => onEditField('frameSize', listing.frameSize ?? '', 'text') : undefined })
    add({ key: 'wheelSize', label: 'Rodado', value: listing.wheelSize || '', onEdit: isModerator && onEditField ? () => onEditField('wheelSize', listing.wheelSize ?? '', 'text') : undefined })
    add({ key: 'drivetrain', label: 'Grupo', value: groupField, onEdit: isModerator && onEditField ? () => onEditField('drivetrain', groupField, 'text') : undefined })
    if (specTxType) add({ key: 'txType', label: 'Tipo de transmisión', value: specTxType })
    if (specBrake) add({ key: 'brake', label: 'Freno', value: specBrake })
    if (specCondition) add({ key: 'cond', label: 'Condición', value: specCondition })
    if (listing.category === 'MTB' && specFork) add({ key: 'fork', label: 'Horquilla', value: specFork })
    if (listing.wheelset) add({ key: 'wheelset', label: 'Ruedas', value: listing.wheelset, onEdit: isModerator && onEditField ? () => onEditField('wheelset', listing.wheelset, 'text') : undefined })
    if (listing.category === 'Fixie' && specFixieRatio) add({ key: 'ratio', label: 'Relación', value: specFixieRatio })
    if (listing.category === 'E-Bike' && specMotor) add({ key: 'motor', label: 'Motor', value: specMotor })
    if (listing.category === 'E-Bike' && specCharge) add({ key: 'charge', label: 'Batería / Carga', value: specCharge })

    const upgradeItems: Array<{ key: string; label: string; value: string }> = []
    if (isBike) {
      const seat = getExtra(extrasMap, 'Asiento') || getExtra(extrasMap, 'Sillín') || getExtra(extrasMap, 'Sillin')
      const handlebar = getExtra(extrasMap, 'Manillar')
      const stem = getExtra(extrasMap, 'Potencia') || getExtra(extrasMap, 'Stem')
      const crank = getExtra(extrasMap, 'Palancas') || getExtra(extrasMap, 'Bielas')
      const power = getExtra(extrasMap, 'Potenciómetro') || getExtra(extrasMap, 'Potenciometro') || getExtra(extrasMap, 'Power meter')
      const wheels = getExtra(extrasMap, 'Ruedas')
      const tires = getExtra(extrasMap, 'Cubiertas') || getExtra(extrasMap, 'Cubierta') || getExtra(extrasMap, 'Neumáticos') || getExtra(extrasMap, 'Neumaticos')
      const pedals = getExtra(extrasMap, 'Pedales')
      const chain = getExtra(extrasMap, 'Cadena')
      const forkUpgrade = getExtra(extrasMap, 'Horquilla')

      if (seat) upgradeItems.push({ key: 'seat', label: 'Asiento', value: seat })
      if (handlebar) upgradeItems.push({ key: 'handlebar', label: 'Manillar', value: handlebar })
      if (stem) upgradeItems.push({ key: 'stem', label: 'Potencia', value: stem })
      if (crank) upgradeItems.push({ key: 'crank', label: 'Palancas', value: crank })
      if (power) upgradeItems.push({ key: 'powermeter', label: 'Potenciómetro', value: power })
      if (wheels && !listing.wheelset) upgradeItems.push({ key: 'wheels', label: 'Ruedas', value: wheels })
      if (tires) upgradeItems.push({ key: 'tires', label: 'Cubiertas', value: tires })
      if (pedals) upgradeItems.push({ key: 'pedals', label: 'Pedales', value: pedals })
      if (chain) upgradeItems.push({ key: 'chain', label: 'Cadena', value: chain })
      if (forkUpgrade && !(listing.category === 'MTB' && specFork)) upgradeItems.push({ key: 'forkUpg', label: 'Horquilla', value: forkUpgrade })
    }

    for (const it of upgradeItems) add({ key: it.key, label: it.label, value: it.value })

    const hidden = new Set(HIDDEN_EXTRAS_KEYS_BASE)
    if (listing.category === 'MTB' && specFork) hidden.add(normalizeKey('Horquilla'))
    if (listing.category === 'Fixie' && specFixieRatio) hidden.add(normalizeKey('Relación'))
    if (listing.category === 'E-Bike' && specMotor) hidden.add(normalizeKey('Motor'))
    if (listing.category === 'E-Bike' && specCharge) hidden.add(normalizeKey('Carga'))
    for (const it of upgradeItems) hidden.add(normalizeKey(it.label))

    const visibleExtrasText = getVisibleExtrasText(listing.extras, hidden)
    if (visibleExtrasText) {
      add({
        key: 'extras',
        label: 'Extras',
        value: visibleExtrasText,
        colSpan: 3,
        onEdit: isModerator && onEditField ? () => onEditField('extras', listing.extras, 'textarea') : undefined,
      })
    }
  }

  return (
    <div className="grid grid-cols-2 md:grid-cols-3 gap-y-6 gap-x-4">
      {items.map((it) => (
        <SpecCell key={it.key} label={it.label} value={it.value} colSpan={it.colSpan} onEdit={it.onEdit} />
      ))}
    </div>
  )
}
