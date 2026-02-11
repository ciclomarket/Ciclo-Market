import { useEffect, useMemo, useState } from 'react'
import { useNavigate, useSearchParams } from 'react-router-dom'
import WizardSteps from '@/components/wizard/WizardSteps'
import StepBasicInfo from '@/components/wizard/StepBasicInfo'
import StepSpecs from '@/components/wizard/StepSpecs'
import StepPhotos from '@/components/wizard/StepPhotos'
import StepPricing from '@/components/wizard/StepPricing'
import { BIKE_CATEGORIES, FRAME_SIZES, WHEEL_SIZE_OPTIONS } from '@/constants/catalog'
import { PROVINCES } from '@/constants/locations'
import { useAuth } from '@/context/AuthContext'
import { getSupabaseClient, supabaseEnabled } from '@/services/supabase'
import { fetchUserProfile, upsertUserProfile } from '@/services/users'
import useUpload from '@/hooks/useUpload'
import { parseMoneyInput } from '@/utils/money'

const CONDITION_OPTIONS = ['Nuevo', 'Como nuevo', 'Usado'] as const

const CONDITION_COPY: Record<string, string> = {
  'Bicicletas|Nuevo': 'Nunca rodó. Componentes originales, sin marcas ni desgaste.',
  'Bicicletas|Como nuevo': 'Usada pocas veces. Mínimas señales de uso, servicio al día.',
  'Bicicletas|Usado': 'Rodada con uso visible. Puede tener marcas o upgrades; describí el estado real.',
  'Accesorios|Nuevo': 'Sin uso previo. Empaque/estado impecable.',
  'Accesorios|Como nuevo': 'Usado muy poco, sin golpes ni rayas relevantes.',
  'Accesorios|Usado': 'Con uso visible; describe cualquier marca o detalle.',
  'Indumentaria|Nuevo': 'Sin uso ni lavado. Etiquetas o empaque si aplica.',
  'Indumentaria|Como nuevo': 'Usada 1-2 veces, sin desgaste ni manchas.',
  'Indumentaria|Usado': 'Con uso; aclara estado de color, costuras y cierres.',
}

const PHONE_PREFIXES = ['54', '55', '56', '595']

const parsePhone = (raw?: string | null) => {
  const digits = (raw || '').replace(/\D/g, '')
  let country = '54'
  let local = digits
  for (const pref of PHONE_PREFIXES) {
    if (digits.startsWith(pref) && digits.length > pref.length) {
      country = pref
      local = digits.slice(pref.length)
      break
    }
  }
  return { country, local }
}

const normalizeBrand = (raw: string) => {
  const v = String(raw || '').trim()
  const key = v
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .toLowerCase()
  const map: Record<string, string> = {
    'merida': 'Merida',
    'mérida': 'Merida',
    'cervelo': 'Cervelo',
    'cervélo': 'Cervelo',
    'van ryzel': 'Van Rysel',
    'van rysel (van ryzen)': 'Van Rysel',
    'van ryzen': 'Van Rysel',
    'wilier triestina': 'Wilier',
  }
  return map[key] || v
}

const MAIN_CATEGORIES = ['Bicicletas', 'Accesorios', 'Indumentaria', 'Nutrición'] as const
const ACCESSORY_SUBCATS = [
  'Ruedas',
  'Grupos',
  'Componentes',
  'Computadoras',
  'Bikepacking',
  'Lubricantes',
  'Transporte',
  'Otros',
] as const
const APPAREL_SUBCATS = ['Casco', 'Jersey', 'Calzas', 'Zapatos', 'Guantes', 'Campera', 'Neoprene', 'Camiseta térmica', 'Otros'] as const
const NUTRITION_SUBCATS = ['Gel', 'Barra', 'Sales', 'Bebida isotónica', 'Proteína', 'Electrolitos', 'Otro'] as const

const DRIVETRAIN_OPTIONS: string[] = [
  'Shimano Claris','Shimano Sora','Shimano Tiagra','Shimano 105','Shimano 105 Di2','Shimano Ultegra','Shimano Ultegra Di2','Shimano Dura‑Ace','Shimano Dura‑Ace Di2',
  'Shimano GRX 400','Shimano GRX 600','Shimano GRX 800','Shimano GRX Di2',
  'Shimano Deore','Shimano Deore XT','Shimano SLX','Shimano XTR','Shimano XT M8100','Shimano XTR M9100',
  'SRAM Apex','SRAM Apex eTap AXS','SRAM Rival','SRAM Rival eTap AXS','SRAM Force','SRAM Force eTap AXS','SRAM Red','SRAM Red eTap AXS',
  'SRAM SX Eagle','SRAM NX Eagle','SRAM GX Eagle','SRAM X01 Eagle','SRAM XX1 Eagle','SRAM GX Eagle Transmission','SRAM X0 Transmission','SRAM XX Transmission',
  'Campagnolo Centaur','Campagnolo Potenza','Campagnolo Chorus','Campagnolo Record','Campagnolo Super Record','Campagnolo Super Record EPS','Campagnolo Ekar',
  'Otro'
]

type MainCategory = typeof MAIN_CATEGORIES[number]
type AccessorySubcat = typeof ACCESSORY_SUBCATS[number]
type ApparelSubcat = typeof APPAREL_SUBCATS[number]
type NutritionSubcat = typeof NUTRITION_SUBCATS[number]
type Currency = 'USD' | 'ARS'

type FormData = {
  mainCategory: MainCategory
  category: string
  accessorySubcat: AccessorySubcat | ''
  apparelSubcat: ApparelSubcat | ''
  nutritionSubcat: NutritionSubcat | ''
  grantedVisiblePhotos: number
  brandSource: 'preset' | 'custom'
  brand: string
  model: string
  year: string
  condition: typeof CONDITION_OPTIONS[number] | ''
  material: string
  frameSize: string
  wheelSize: string
  drivetrain: string
  drivetrainOther: string
  brakeType: string
  showBikeExtras: boolean
  seatInfo: string
  forkInfo: string
  handlebarInfo: string
  stemInfo: string
  cranksetInfo: string
  powerMeterInfo: string
  wheelsInfo: string
  tiresInfo: string
  pedalsInfo: string
  chainInfo: string
  description: string
  extras: string
  images: string[]
  priceCurrency: Currency
  priceInput: string
  province: string
  city: string
  whatsApp: string
  waCountry: '+54' | '+55' | '+56' | '+595'
  waLocal: string
  groupComplete: 'Completo' | 'Partes' | ''
  groupMode: 'Mecánico' | 'Electrónico' | ''
  accUseType: string
  accCompatibility: string
  accWeight: string
  apparelGender: string
  apparelSize: string
  apparelColor: string
  nutriCHO: string
  nutriSodium: string
  nutriServings: string
  nutriNetWeight: string
  nutriExpire: string
  isNegotiable: boolean
}

type Errors = Record<string, string>

const DRAFT_FIELDS: Array<keyof FormData> = [
  'mainCategory',
  'category',
  'accessorySubcat',
  'apparelSubcat',
  'nutritionSubcat',
  'grantedVisiblePhotos',
  'brandSource',
  'brand',
  'model',
  'year',
  'condition',
  'material',
  'frameSize',
  'wheelSize',
  'drivetrain',
  'drivetrainOther',
  'brakeType',
  'showBikeExtras',
  'seatInfo',
  'forkInfo',
  'handlebarInfo',
  'stemInfo',
  'cranksetInfo',
  'powerMeterInfo',
  'wheelsInfo',
  'tiresInfo',
  'pedalsInfo',
  'chainInfo',
  'description',
  'extras',
  'images',
  'priceCurrency',
  'priceInput',
  'province',
  'city',
  'whatsApp',
  'waCountry',
  'waLocal',
  'groupComplete',
  'groupMode',
  'accUseType',
  'accCompatibility',
  'accWeight',
  'apparelGender',
  'apparelSize',
  'apparelColor',
  'nutriCHO',
  'nutriSodium',
  'nutriServings',
  'nutriNetWeight',
  'nutriExpire',
  'isNegotiable',
]

type DraftPayload = Partial<FormData> & { step?: number; ts?: number }

function pickDraftPayload(raw: any): DraftPayload | null {
  if (!raw || typeof raw !== 'object') return null
  const out: DraftPayload = {}
  for (const key of DRAFT_FIELDS) {
    if (key in raw) (out as any)[key] = raw[key]
  }
  if (typeof raw.step === 'number') out.step = raw.step
  if (typeof raw.ts === 'number') out.ts = raw.ts
  return out
}

function parseExtrasMap(extrasRaw?: string | null) {
  const map: Record<string, string> = {}
  const parts = String(extrasRaw || '')
    .split('•')
    .map((p) => p.trim())
    .filter(Boolean)
  for (const p of parts) {
    const idx = p.indexOf(':')
    if (idx === -1) continue
    const k = p.slice(0, idx).trim()
    const v = p.slice(idx + 1).trim()
    if (k) map[k] = v
  }
  return map
}

function getExtra(map: Record<string, string>, key: string) {
  const norm = (s: string) => s.normalize('NFD').replace(/[\u0300-\u036f]/g, '').toLowerCase()
  const keyNorm = norm(key)
  for (const k of Object.keys(map)) {
    if (norm(k) === keyNorm) return map[k]
  }
  return ''
}

export default function CreateListing() {
  const [sp] = useSearchParams()
  const navigate = useNavigate()
  const { user } = useAuth()
  const { uploadFiles, uploading, progress } = useUpload()

  const editId = useMemo(() => {
    const id = (sp.get('id') || '').trim()
    return id || null
  }, [sp])
  const isEdit = Boolean(editId)

  const mainCategoryFromUrl = useMemo<MainCategory>(() => {
    const t = (sp.get('type') || '').toLowerCase()
    if (t === 'accessory') return 'Accesorios'
    if (t === 'apparel') return 'Indumentaria'
    if (t === 'nutrition') return 'Nutrición'
    return 'Bicicletas'
  }, [sp])

  const draftKey = useMemo(() => {
    const t = (sp.get('type') || '').toLowerCase()
    return `cm_publish_draft_${t || 'bike'}`
  }, [sp])
  const sessionDraftKey = 'cm_publish_last'

  const [loadedDraft, setLoadedDraft] = useState(false)
  const [submitting, setSubmitting] = useState(false)
  const [authModalOpen, setAuthModalOpen] = useState(false)
  const [authEmail, setAuthEmail] = useState('')
  const [authEmailSending, setAuthEmailSending] = useState(false)
  const [authEmailMessage, setAuthEmailMessage] = useState<string | null>(null)
  const [authEmailError, setAuthEmailError] = useState<string | null>(null)
  const [step, setStep] = useState(1)
  const [errors, setErrors] = useState<Errors>({})
  const [profileFullName, setProfileFullName] = useState('')
  const [profileEmail, setProfileEmail] = useState('')

  const INITIAL_STATE: FormData = useMemo(
    () => ({
      mainCategory: mainCategoryFromUrl,
      category: '',
      accessorySubcat: '',
      apparelSubcat: '',
      nutritionSubcat: '',
      grantedVisiblePhotos: 4,
      brandSource: 'preset',
      brand: '',
      model: '',
      year: '',
      condition: '',
      material: '',
      frameSize: '',
      wheelSize: '',
      drivetrain: '',
      drivetrainOther: '',
      brakeType: '',
      showBikeExtras: false,
      seatInfo: '',
      forkInfo: '',
      handlebarInfo: '',
      stemInfo: '',
      cranksetInfo: '',
      powerMeterInfo: '',
      wheelsInfo: '',
      tiresInfo: '',
      pedalsInfo: '',
      chainInfo: '',
      description: '',
      extras: '',
      images: [],
      priceCurrency: 'USD',
      priceInput: '',
      province: '',
      city: '',
      whatsApp: '',
      waCountry: '+54',
      waLocal: '',
      groupComplete: '',
      groupMode: '',
      accUseType: '',
      accCompatibility: '',
      accWeight: '',
      apparelGender: '',
      apparelSize: '',
      apparelColor: '',
      nutriCHO: '',
      nutriSodium: '',
      nutriServings: '',
      nutriNetWeight: '',
      nutriExpire: '',
      isNegotiable: false,
    }),
    [mainCategoryFromUrl]
  )

  const [formData, setFormData] = useState<FormData>(INITIAL_STATE)

  const persistDraft = useMemo(
    () => (data: DraftPayload) => {
      try {
        const payload = JSON.stringify({ ...data, ts: Date.now() })
        window.localStorage.setItem(draftKey, payload)
        window.sessionStorage.setItem(sessionDraftKey, payload)
      } catch {
        /* noop */
      }
    },
    [draftKey]
  )

  const loadDraft = useMemo(
    () => () => {
      try {
        const sessionRaw = window.sessionStorage.getItem(sessionDraftKey)
        if (sessionRaw) return JSON.parse(sessionRaw)
        const raw = window.localStorage.getItem(draftKey)
        if (!raw) return null
        const parsed = JSON.parse(raw)
        return parsed || null
      } catch {
        return null
      }
    },
    [draftKey]
  )

  const updateField = (key: keyof FormData, value: any) => {
    setFormData((prev) => {
      const next = { ...prev, [key]: value } as FormData
      if (key === 'waCountry' || key === 'waLocal') {
        const local = String(key === 'waLocal' ? value : next.waLocal).replace(/\D/g, '').replace(/^54/, '')
        const country = String(key === 'waCountry' ? value : next.waCountry)
        next.waLocal = local
        next.whatsApp = `${country}${local}`
      }
      return next
    })
  }

  // Autosave draft to avoid losing progress on refresh / background / closing the browser
  useEffect(() => {
    if (!loadedDraft) return
    if (isEdit) return
    const timerId = window.setTimeout(() => {
      persistDraft({ ...formData, step })
    }, 300)
    return () => {
      window.clearTimeout(timerId)
    }
  }, [loadedDraft, isEdit, formData, step, persistDraft])

  // Force-save on navigation/backgrounding (esp. mobile camera use cases)
  useEffect(() => {
    if (!loadedDraft) return
    if (isEdit) return
    const saveNow = () => {
      try {
        persistDraft({ ...formData, step })
      } catch {
        /* noop */
      }
    }
    window.addEventListener('pagehide', saveNow)
    window.addEventListener('beforeunload', saveNow)
    return () => {
      window.removeEventListener('pagehide', saveNow)
      window.removeEventListener('beforeunload', saveNow)
    }
  }, [loadedDraft, isEdit, formData, step, persistDraft])

  const validateStep = (currentStep: number, data: FormData): Errors => {
    const nextErrors: Errors = {}

    if (currentStep === 1) {
      const needsSubcat =
        data.mainCategory === 'Bicicletas'
          ? !data.category
          : data.mainCategory === 'Accesorios'
            ? !data.accessorySubcat
            : data.mainCategory === 'Indumentaria'
              ? !data.apparelSubcat
              : !data.nutritionSubcat
      if (needsSubcat) nextErrors.category = 'Seleccioná una categoría'
      if (!data.condition) nextErrors.condition = 'Seleccioná la condición'
    }

    if (currentStep === 2) {
      if (!data.brand.trim()) nextErrors.brand = 'Completá la marca'
      if (!data.model.trim()) nextErrors.model = 'Completá el modelo'
      if (data.mainCategory === 'Bicicletas') {
        const drivetrainOk = Boolean((data.drivetrain || data.drivetrainOther).trim())
        if (!drivetrainOk) nextErrors.drivetrain = 'Completá el grupo de transmisión'
        if (!data.brakeType.trim()) nextErrors.brakeType = 'Seleccioná el tipo de freno'
      }
    }

    if (currentStep === 3) {
      if (data.images.length === 0) nextErrors.images = 'Subí al menos una foto'
    }

    if (currentStep === 4) {
      const price = parseMoneyInput(data.priceInput, { allowDecimals: true })
      if (!price || price <= 0) nextErrors.priceInput = 'Indicá un precio válido'
      if (!data.province.trim()) nextErrors.province = 'Seleccioná la provincia'
      if (!data.city.trim()) nextErrors.city = 'Seleccioná la ciudad'
    }

    return nextErrors
  }

  const goNext = () => {
    const nextErrors = validateStep(step, formData)
    if (Object.keys(nextErrors).length > 0) {
      setErrors(nextErrors)
      return
    }
    setErrors({})
    setStep((prev) => Math.min(4, prev + 1))
  }

  const goBack = () => {
    setErrors({})
    setStep((prev) => Math.max(1, prev - 1))
  }

  const buildExtras = (): string => {
    const parts: string[] = []
    const pushKV = (label: string, value: string) => {
      const v = String(value || '').trim()
      if (!v) return
      parts.push(`${label}: ${v}`)
    }

    if (formData.mainCategory === 'Bicicletas') {
      pushKV('Talle', formData.frameSize)
      pushKV('Año', formData.year)
      pushKV('Grupo', formData.drivetrain || formData.drivetrainOther)
      pushKV('Freno', formData.brakeType)
      pushKV('Rodado', formData.wheelSize)
      pushKV('Condición', formData.condition)

      const hasUpgrades =
        Boolean(formData.seatInfo?.trim()) ||
        Boolean(formData.forkInfo?.trim()) ||
        Boolean(formData.handlebarInfo?.trim()) ||
        Boolean(formData.stemInfo?.trim()) ||
        Boolean(formData.cranksetInfo?.trim()) ||
        Boolean(formData.powerMeterInfo?.trim()) ||
        Boolean(formData.wheelsInfo?.trim()) ||
        Boolean(formData.tiresInfo?.trim()) ||
        Boolean(formData.pedalsInfo?.trim()) ||
        Boolean(formData.chainInfo?.trim())

      if (formData.showBikeExtras || hasUpgrades) {
        pushKV('Asiento', formData.seatInfo)
        pushKV('Horquilla', formData.forkInfo)
        pushKV('Manillar', formData.handlebarInfo)
        pushKV('Potencia', formData.stemInfo)
        pushKV('Palancas', formData.cranksetInfo)
        pushKV('Potenciómetro', formData.powerMeterInfo)
        pushKV('Ruedas', formData.wheelsInfo)
        pushKV('Cubiertas', formData.tiresInfo)
        pushKV('Pedales', formData.pedalsInfo)
        pushKV('Cadena', formData.chainInfo)
      }
    } else if (formData.mainCategory === 'Accesorios') {
      pushKV('Tipo', formData.accessorySubcat)
      pushKV('Uso', formData.accUseType)
      pushKV('Material', formData.material)
      pushKV('Freno', formData.brakeType)
      pushKV('Rodado', formData.wheelSize)
      pushKV('Compatibilidad', formData.accCompatibility)
      pushKV('Peso', formData.accWeight)
      pushKV('Contenido', formData.groupComplete)
      pushKV('Modo', formData.groupMode)
      if (formData.groupComplete === 'Completo') pushKV('Grupo', formData.drivetrain)
      pushKV('Condición', formData.condition)
    } else if (formData.mainCategory === 'Indumentaria') {
      pushKV('Tipo', formData.apparelSubcat)
      pushKV('Género', formData.apparelGender)
      pushKV('Talle', formData.apparelSize)
      pushKV('Color', formData.apparelColor)
      pushKV('Uso', formData.accUseType)
      pushKV('Material', formData.material)
      pushKV('Condición', formData.condition)
    } else if (formData.mainCategory === 'Nutrición') {
      pushKV('Tipo', formData.nutritionSubcat)
      pushKV('CHO', formData.nutriCHO ? `${formData.nutriCHO} g` : '')
      pushKV('Sodio', formData.nutriSodium ? `${formData.nutriSodium} mg` : '')
      pushKV('Porciones', formData.nutriServings)
      pushKV('Peso', formData.nutriNetWeight)
      pushKV('Vence', formData.nutriExpire)
      pushKV('Condición', formData.condition)
    }

    pushKV('Agregados', formData.extras)
    return parts.filter(Boolean).join(' • ')
  }

  const handleAddFiles = async (files: File[]) => {
    if (!files.length) return
    const remaining = Math.max(0, 12 - formData.images.length)
    if (remaining <= 0) return
    const pick = files.slice(0, remaining)
    const urls = await uploadFiles(pick)
    if (!urls.length) return
    setFormData((prev) => {
      const images = [...prev.images, ...urls].slice(0, 12)
      return { ...prev, images }
    })
  }

  // Load draft + profile prefill + preset subcat
  useEffect(() => {
    let active = true
    ;(async () => {
      try {
        if (!loadedDraft) {
          const raw = loadDraft()
          const draft = pickDraftPayload(raw)
          if (draft) {
            setFormData((prev) => ({
              ...prev,
              ...draft,
              mainCategory: prev.mainCategory,
              brand: normalizeBrand(draft?.brand || prev.brand),
              brandSource: draft?.brandSource === 'custom' ? 'custom' : 'preset',
            }))
            const draftStep = Number(draft.step)
            if (Number.isFinite(draftStep) && draftStep >= 1 && draftStep <= 4) setStep(draftStep)
          }
          setLoadedDraft(true)
          try { window.sessionStorage.removeItem(sessionDraftKey) } catch { /* noop */ }
        }

        if (!user?.id) return
        const profile = await fetchUserProfile(user.id)
        if (!active) return
        if (profile?.full_name) setProfileFullName(profile.full_name)
        if (user?.email) setProfileEmail(user.email)
        if (profile?.province && !formData.province) updateField('province', profile.province)
        if (profile?.city && !formData.city) updateField('city', profile.city)
        if ((profile as any)?.whatsapp_number && !formData.whatsApp) {
          const raw = String((profile as any).whatsapp_number)
          const parsed = parsePhone(raw)
          updateField('waCountry', `+${parsed.country}` as any)
          updateField('waLocal', parsed.local)
          updateField('whatsApp', `+${parsed.country}${parsed.local}`)
        }

        const preset = (sp.get('subcat') || '').trim()
        if (preset && !isEdit) {
          if (formData.mainCategory === 'Bicicletas') updateField('category', preset)
          else if (formData.mainCategory === 'Accesorios') updateField('accessorySubcat', preset as any)
          else if (formData.mainCategory === 'Indumentaria') updateField('apparelSubcat', preset as any)
          else if (formData.mainCategory === 'Nutrición') updateField('nutritionSubcat', preset as any)
        }
      } catch {
        /* noop */
      }
    })()
    return () => { active = false }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [user?.id, loadedDraft])

  // Load existing listing for edit
  useEffect(() => {
    let active = true
    const loadExisting = async () => {
      if (!isEdit || !editId) return
      if (!supabaseEnabled) return
      if (!user?.id) return
      try {
        const supabase = getSupabaseClient()
        const { data: row, error } = await supabase.from('listings').select('*').eq('id', editId).maybeSingle()
        if (!active) return
        if (error || !row) {
          alert('No se pudo cargar la publicación para editar.')
          return
        }
        if (row.seller_id && row.seller_id !== user.id) {
          alert('No tenés permisos para editar esta publicación.')
          navigate(`/listing/${encodeURIComponent(editId)}`)
          return
        }

        const extrasMap = parseExtrasMap(row.extras)
        const inferredBrake = getExtra(extrasMap, 'Freno') || getExtra(extrasMap, 'Tipo de freno')
        const inferredCondition = getExtra(extrasMap, 'Condición') || getExtra(extrasMap, 'Condicion')
        const inferredSeat = getExtra(extrasMap, 'Asiento') || getExtra(extrasMap, 'Sillín') || getExtra(extrasMap, 'Sillin')
        const inferredFork = getExtra(extrasMap, 'Horquilla')
        const inferredHandlebar = getExtra(extrasMap, 'Manillar')
        const inferredStem = getExtra(extrasMap, 'Potencia') || getExtra(extrasMap, 'Stem')
        const inferredCrank = getExtra(extrasMap, 'Palancas') || getExtra(extrasMap, 'Bielas')
        const inferredPowerMeter = getExtra(extrasMap, 'Potenciómetro') || getExtra(extrasMap, 'Potenciometro') || getExtra(extrasMap, 'Power meter')
        const inferredWheels = getExtra(extrasMap, 'Ruedas')
        const inferredTires = getExtra(extrasMap, 'Cubiertas') || getExtra(extrasMap, 'Cubierta') || getExtra(extrasMap, 'Neumáticos') || getExtra(extrasMap, 'Neumaticos')
        const inferredPedals = getExtra(extrasMap, 'Pedales')
        const inferredChain = getExtra(extrasMap, 'Cadena')
        const inferredAddons = getExtra(extrasMap, 'Agregados') || getExtra(extrasMap, 'Extras')
        const inferredShowBikeExtras = Boolean(
          inferredSeat ||
            inferredFork ||
            inferredHandlebar ||
            inferredStem ||
            inferredCrank ||
            inferredPowerMeter ||
            inferredWheels ||
            inferredTires ||
            inferredPedals ||
            inferredChain
        )

        const drivetrainVal = String(row.drivetrain || '')
        const drivetrainDetailVal = String(row.drivetrain_detail || '')
        const resolvedDrivetrain = (() => {
          if (drivetrainDetailVal) return { drivetrain: 'Otro', drivetrainOther: drivetrainDetailVal }
          if (drivetrainVal && !DRIVETRAIN_OPTIONS.includes(drivetrainVal)) return { drivetrain: 'Otro', drivetrainOther: drivetrainVal }
          return { drivetrain: drivetrainVal, drivetrainOther: '' }
        })()

        const imagesArr = Array.isArray(row.images) ? row.images.filter(Boolean).map((x: any) => String(x)) : []

        const loc = String(row.location || '')
        let city = ''
        let province = ''
        if (loc) {
          const parts = loc.split(',').map((p: string) => p.trim()).filter(Boolean)
          if (parts.length >= 1) city = parts[0]
          if (parts.length >= 2) province = parts.slice(1).join(', ')
        }

        const cat = String(row.category || '')
        const sub = String(row.subcategory || '')
        const nextMainCategory: MainCategory =
          cat === 'Accesorios' ? 'Accesorios' : cat === 'Indumentaria' ? 'Indumentaria' : cat === 'Nutrición' ? 'Nutrición' : 'Bicicletas'

        setFormData((prev) => ({
          ...prev,
          mainCategory: nextMainCategory,
          category: nextMainCategory === 'Bicicletas' ? (BIKE_CATEGORIES.includes(cat as any) ? cat : (BIKE_CATEGORIES.includes(sub as any) ? sub : '')) : prev.category,
          accessorySubcat: nextMainCategory === 'Accesorios' ? (sub as any) : prev.accessorySubcat,
          apparelSubcat: nextMainCategory === 'Indumentaria' ? (sub as any) : prev.apparelSubcat,
          nutritionSubcat: nextMainCategory === 'Nutrición' ? (sub as any) : prev.nutritionSubcat,
          grantedVisiblePhotos: typeof (row as any).granted_visible_photos === 'number' ? (row as any).granted_visible_photos : 4,
          brand: normalizeBrand(String(row.brand || '')),
          brandSource: 'preset',
          model: String(row.model || ''),
          year: row.year != null ? String(row.year) : '',
          description: String(row.description || ''),
          material: String(row.material || ''),
          frameSize: String(row.frame_size || ''),
          wheelSize: String(row.wheel_size || ''),
          drivetrain: resolvedDrivetrain.drivetrain,
          drivetrainOther: resolvedDrivetrain.drivetrainOther,
          brakeType: String(inferredBrake || ''),
          condition: String(inferredCondition || '') as any,
          showBikeExtras: inferredShowBikeExtras,
          seatInfo: String(inferredSeat || ''),
          forkInfo: String(inferredFork || ''),
          handlebarInfo: String(inferredHandlebar || ''),
          stemInfo: String(inferredStem || ''),
          cranksetInfo: String(inferredCrank || ''),
          powerMeterInfo: String(inferredPowerMeter || ''),
          wheelsInfo: String(inferredWheels || ''),
          tiresInfo: String(inferredTires || ''),
          pedalsInfo: String(inferredPedals || ''),
          chainInfo: String(inferredChain || ''),
          images: imagesArr.slice(0, 12),
          priceCurrency: (row.price_currency || 'USD') as Currency,
          priceInput: row.price != null ? String(row.price) : '',
          city: city || prev.city,
          province: province || prev.province,
          extras: String(inferredAddons || ''),
        }))
      } catch {
        alert('No se pudo cargar la publicación para editar.')
      }
    }
    void loadExisting()
    return () => { active = false }
  }, [isEdit, editId, user?.id])

  // Auto-submit after auth intent
  useEffect(() => {
    if (!user || submitting || !loadedDraft) return
    try {
      const pending = window.sessionStorage.getItem('cm_publish_pending')
      const hasData = formData.brand.trim().length > 0 && formData.model.trim().length > 0 && formData.priceInput.trim().length > 0
      if (pending === '1' && hasData) {
        window.sessionStorage.removeItem('cm_publish_pending')
        void submit()
      }
    } catch {
      // ignore
    }
  }, [user?.id, submitting, loadedDraft, formData.brand, formData.model, formData.priceInput])

  const submit = async () => {
    if (submitting) return
    if (!supabaseEnabled) { alert('Supabase no configurado en .env'); return }
    if (!user) {
      try {
        window.sessionStorage.setItem('cm_publish_pending', '1')
        persistDraft(formData)
      } catch { /* noop */ }
      setAuthModalOpen(true)
      return
    }

    const nextErrors = validateStep(4, formData)
    if (Object.keys(nextErrors).length > 0) {
      setErrors(nextErrors)
      setStep(4)
      return
    }

    setSubmitting(true)
    const supabase = getSupabaseClient()

    const price = parseMoneyInput(formData.priceInput, { allowDecimals: true }) || 0
    const title = `${formData.brand.trim()} ${formData.model.trim()}`.trim()
    const location = [formData.city, formData.province].filter(Boolean).join(', ')
    const categoryField = formData.mainCategory === 'Bicicletas' ? (formData.category || null) : formData.mainCategory
    const subcategoryField =
      formData.mainCategory === 'Bicicletas'
        ? null
        : formData.mainCategory === 'Accesorios'
          ? formData.accessorySubcat
          : formData.mainCategory === 'Indumentaria'
            ? formData.apparelSubcat
            : formData.nutritionSubcat

    const extrasText = buildExtras()

    const imagesToSave = formData.images.length ? formData.images.slice(0, 12) : []

    const payload: any = {
      title,
      brand: formData.brand.trim(),
      model: formData.model.trim(),
      year: formData.year ? Number(formData.year) : null,
      category: categoryField,
      subcategory: subcategoryField || null,
      price,
      price_currency: formData.priceCurrency,
      location: location || null,
      description: formData.description || null,
      material: formData.material || null,
      frame_size: formData.mainCategory === 'Bicicletas' ? (formData.frameSize || null) : null,
      wheel_size: formData.wheelSize || null,
      drivetrain: (formData.drivetrain || formData.drivetrainOther) || null,
      drivetrain_detail: formData.drivetrainOther || null,
      extras: extrasText || null,
      images: imagesToSave,
    }

    const { data, error } =
      isEdit && editId
        ? await supabase.from('listings').update(payload).eq('id', editId).select('id, slug').maybeSingle()
        : await supabase
            .from('listings')
            .insert([
              {
                ...payload,
                status: 'draft',
                seller_id: user.id,
                plan_code: 'free',
                plan: 'free',
                granted_visible_photos: 4,
                visible_images_count: Math.min(4, imagesToSave.length || 4),
                plan_price: 0,
                plan_photo_limit: 4,
              },
            ])
            .select('id, slug')
            .maybeSingle()

    if (error) {
      alert(`Error al ${isEdit ? 'guardar' : 'publicar'}: ${error.message}`)
      setSubmitting(false)
      return
    }

    try {
      await upsertUserProfile({ id: user.id, province: formData.province, city: formData.city, whatsapp: formData.whatsApp })
    } catch { /* noop */ }

    const slug = (data as any)?.slug || (data as any)?.id
    if (slug) {
      navigate(isEdit ? `/listing/${slug}` : `/listing/${slug}?post_publish=1`)
    } else {
      navigate(`/dashboard?tab=${encodeURIComponent('Publicaciones')}`)
    }
    setSubmitting(false)
  }

  const stepComponent = (() => {
    if (step === 1)
      return (
        <StepBasicInfo
          data={formData}
          onChange={updateField}
          errors={errors}
          bikeCategories={BIKE_CATEGORIES as any}
          accessorySubcats={ACCESSORY_SUBCATS as any}
          apparelSubcats={APPAREL_SUBCATS as any}
          nutritionSubcats={NUTRITION_SUBCATS as any}
          conditionOptions={CONDITION_OPTIONS as any}
          conditionCopy={CONDITION_COPY}
        />
      )
    if (step === 2)
      return (
        <StepSpecs
          data={formData}
          onChange={updateField}
          errors={errors}
          frameSizes={FRAME_SIZES as any}
          wheelSizeOptions={WHEEL_SIZE_OPTIONS as any}
          drivetrainOptions={DRIVETRAIN_OPTIONS}
        />
      )
    if (step === 3)
      return (
        <StepPhotos
          data={formData}
          onChange={updateField}
          errors={errors}
          maxPhotos={12}
          uploading={uploading}
          progress={progress}
          onAddFiles={handleAddFiles}
        />
      )
    return (
      <StepPricing
        data={formData}
        onChange={updateField}
        errors={errors}
        provinces={PROVINCES as any}
        currencies={['USD', 'ARS']}
      />
    )
  })()

  const headerTitle = isEdit ? 'Editar publicación' : 'Publicar'
  const subTitle = formData.mainCategory === 'Bicicletas' ? 'bicicleta' : formData.mainCategory.toLowerCase()

  return (
    <main className="bg-gray-50">
      <div className="max-w-4xl mx-auto px-4 py-12">
        <h1 className="text-3xl font-bold mb-2 text-center text-mb-ink">
          {headerTitle} {subTitle}
        </h1>
        <p className="mb-8 text-center text-sm text-gray-500">
          Completá los pasos. Podés volver atrás cuando quieras.
        </p>

        <WizardSteps currentStep={step} />

        <div className="bg-white rounded-2xl shadow-sm border border-slate-100 p-8">{stepComponent}</div>

        <div className="mt-8 flex items-center justify-between">
          {step > 1 ? (
            <button type="button" onClick={goBack} className="text-sm font-semibold text-slate-600 hover:text-slate-900">
              Atrás
            </button>
          ) : (
            <span />
          )}

          {step < 4 ? (
            <button
              type="button"
              onClick={goNext}
              className="inline-flex items-center justify-center rounded-xl bg-slate-900 px-6 py-3 text-sm font-bold text-white hover:bg-slate-800"
            >
              Siguiente
            </button>
          ) : (
            <button
              type="button"
              onClick={() => void submit()}
              className="inline-flex items-center justify-center rounded-xl bg-slate-900 px-6 py-3 text-sm font-bold text-white hover:bg-slate-800 disabled:opacity-60"
              disabled={submitting}
            >
              {submitting ? 'Publicando…' : isEdit ? 'Guardar cambios' : 'Publicar'}
            </button>
          )}
        </div>
      </div>

      {authModalOpen && (
        <div
          className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 backdrop-blur-sm"
          role="dialog"
          aria-modal="true"
          onClick={() => setAuthModalOpen(false)}
        >
          <div
            className="mx-4 w-full max-w-md rounded-2xl border border-white/10 bg-white p-6 text-[#14212e] shadow-2xl"
            onClick={(e) => e.stopPropagation()}
          >
            <div className="flex items-start justify-between gap-4">
              <div>
                <h3 className="text-xl font-bold">Ingresá para publicar</h3>
                <p className="mt-1 text-sm text-slate-600">
                  Creá tu cuenta o continuá con Google para terminar la publicación.
                </p>
              </div>
              <button
                aria-label="Cerrar"
                className="rounded-full border border-slate-200 p-2 hover:bg-slate-50"
                onClick={() => setAuthModalOpen(false)}
              >
                <svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24" className="h-5 w-5" fill="none" stroke="currentColor" strokeWidth={1.5}>
                  <path strokeLinecap="round" strokeLinejoin="round" d="M6 6l12 12M6 18 18 6" />
                </svg>
              </button>
            </div>
            <div className="mt-4 space-y-3">
              <button
                type="button"
                className="w-full inline-flex items-center justify-center gap-2 rounded-lg bg-[#14212e] px-4 py-3 text-white font-semibold hover:bg-[#1b2f3f]"
                onClick={async () => {
                  try {
                    const supabase = getSupabaseClient()
                    const redirectTo = window.location.href
                    await supabase.auth.signInWithOAuth({ provider: 'google', options: { redirectTo } })
                  } catch (e) {
                    console.warn('[auth] google sign-in failed', e)
                  }
                }}
              >
                <svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 48 48" className="h-5 w-5" aria-hidden="true">
                  <path fill="#FFC107" d="M43.6 20.5H42V20H24v8h11.3C34.5 31.9 30.7 35 26 35c-6.1 0-11-4.9-11-11s4.9-11 11-11c2.8 0 5.4 1.1 7.4 2.9l5.7-5.7C35.6 7 30.9 5 26 5 14.4 5 5 14.4 5 26s9.4 21 21 21 21-9.4 21-21c0-1.2-.1-2.3-.4-3.5z" />
                  <path fill="#FF3D00" d="m6.3 14.7 6.6 4.8C14.5 15.3 19.8 12 26 12c2.8 0 5.4 1.1 7.4 2.9l5.7-5.7C35.6 7 30.9 5 26 5 17 5 9.1 9.7 6.3 14.7z" />
                  <path fill="#4CAF50" d="M26 47c4.7 0 9-1.8 12.3-4.7l-5.7-5.7C30.7 37.9 28.4 39 26 39c-4.6 0-8.4-3.1-9.8-7.3l-6.6 5.1C12.3 42.5 18.7 47 26 47z" />
                  <path fill="#1976D2" d="M43.6 20.5H42V20H24v8h11.3c-1.1 3.1-3.6 5.5-6.6 6.7l5.7 5.7C34.1 41.2 39 38 42 33c1.8-2.8 2.8-6.1 2.8-9.5 0-1.2-.1-2.3-.4-3.5z" />
                </svg>
                Continuar con Google
              </button>

              <div className="space-y-2">
                <label className="text-xs font-semibold text-slate-600">O ingresá tu email para recibir un link</label>
                <input
                  type="email"
                  value={authEmail}
                  onChange={(e) => {
                    setAuthEmail(e.target.value)
                    setAuthEmailError(null)
                    setAuthEmailMessage(null)
                  }}
                  className="w-full rounded-lg border border-slate-200 px-3 py-2 text-sm focus:border-blue-500 focus:ring-2 focus:ring-blue-200"
                  placeholder="tu@email.com"
                />
                {authEmailError && <p className="text-xs text-red-600">{authEmailError}</p>}
                {authEmailMessage && <p className="text-xs text-green-700">{authEmailMessage}</p>}
                <button
                  type="button"
                  className="w-full rounded-lg border border-slate-200 bg-white px-4 py-2 text-sm font-semibold text-[#14212e] hover:bg-slate-100"
                  disabled={authEmailSending}
                  onClick={async () => {
                    setAuthEmailError(null)
                    setAuthEmailMessage(null)
                    const email = authEmail.trim()
                    if (!email || !email.includes('@')) {
                      setAuthEmailError('Ingresá un email válido')
                      return
                    }
                    try {
                      setAuthEmailSending(true)
                      const supabase = getSupabaseClient()
                      const redirectTo = window.location.href
                      const { error } = await supabase.auth.signInWithOtp({
                        email,
                        options: { emailRedirectTo: redirectTo },
                      })
                      if (error) {
                        setAuthEmailError(error.message || 'No pudimos enviar el correo. Intentá nuevamente.')
                      } else {
                        setAuthEmailMessage('Revisá tu casilla. Te enviamos un link para continuar.')
                      }
                    } catch (e: any) {
                      setAuthEmailError(e?.message || 'No pudimos enviar el correo.')
                    } finally {
                      setAuthEmailSending(false)
                    }
                  }}
                >
                  {authEmailSending ? 'Enviando…' : 'Ingresar con email'}
                </button>
              </div>

              <p className="text-xs text-slate-500 text-center">
                Te enviaremos un link y volverás a este formulario para finalizar la publicación.
              </p>
            </div>
          </div>
        </div>
      )}
    </main>
  )
}
