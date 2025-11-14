import { useCallback, useEffect, useMemo, useState } from 'react'
import Container from '../../components/Container'
import { Field } from '../../components/FormFields'
import Button from '../../components/Button'
import useUpload from '../../hooks/useUpload'
import { useNavigate, useSearchParams } from 'react-router-dom'
import type { Category, Listing } from '../../types'
import { useCurrency } from '../../context/CurrencyContext'
import { BIKE_CATEGORIES, FRAME_SIZES, WHEEL_SIZE_OPTIONS } from '../../constants/catalog'
import { PROVINCES, OTHER_CITY_OPTION } from '../../constants/locations'
import { useAuth } from '../../context/AuthContext'
import { supabaseEnabled, getSupabaseClient } from '../../services/supabase'
import { usePlans } from '../../context/PlanContext'
import { canonicalPlanCode, normalisePlanText, resolvePlanCode, type PlanCode } from '../../utils/planCodes'
import { formatNameWithInitial } from '../../utils/user'
import { normaliseWhatsapp, extractLocalWhatsapp, sanitizeLocalWhatsappInput } from '../../utils/whatsapp'
import { fetchListing } from '../../services/listings'
import { validateGift, redeemGift, claimGift } from '../../services/gifts'
import { fetchUserProfile, type UserProfileRecord } from '../../services/users'
import { redeemCredit, attachCreditToListing } from '../../services/credits'
import { useToast } from '../../context/ToastContext'

const MATERIAL_OPTIONS = ['Aluminio','Carbono','Aluminio + Carbono','Titanio','Acero','Otro']

const DRIVETRAIN_OPTIONS = [
  'Otro',
  // Shimano Ruta / Gravel
  'Shimano Claris 8v','Shimano Sora 9v','Shimano Tiagra 4700','Shimano 105 R7000','Shimano 105 12v Di2',
  'Shimano Ultegra R8000','Shimano Ultegra 8170 Di2','Shimano Dura-Ace 9000','Shimano Dura-Ace 9150 Di2',
  'Shimano Dura-Ace 9200 Di2','Shimano Dura-Ace 7970 Di2','Shimano GRX 600','Shimano GRX 810','Shimano GRX 12v',
  // Shimano MTB / E-Bike
  'Shimano Deore 10v','Shimano Deore 12v','Shimano SLX 12v','Shimano XT M8100','Shimano XTR M9100','Shimano Steps E-Bike',
  // SRAM Ruta / Gravel
  'SRAM Apex 1','SRAM Apex XPLR','SRAM Rival 22','SRAM Rival eTap AXS','SRAM Force 22','SRAM Force eTap AXS',
  'SRAM Red 22','SRAM Red eTap AXS','SRAM Red eTap 11v',
  // SRAM MTB
  'SRAM NX Eagle','SRAM GX Eagle','SRAM GX Eagle Transmission','SRAM X01 Eagle','SRAM XX1 Eagle','SRAM XX Eagle Transmission',
  // Campagnolo / Otros
  'Campagnolo Centaur','Campagnolo Chorus 12v','Campagnolo Chorus EPS','Campagnolo Record 12v','Campagnolo Record EPS',
'Campagnolo Super Record 12v','Campagnolo Super Record EPS','Campagnolo Ekar 13v',
]

const ACCESSORY_TYPES = [
  'Componentes y partes',
  'Ruedas y cubiertas',
  'Herramientas y mantenimiento',
  'Electrónica y sensores',
  'Bikepacking y transporte',
  'Lubricantes y limpieza',
  'Otro'
] as const

const CONDITION_OPTIONS = ['Nuevo', 'Como nuevo', 'Usado'] as const

const ACCESSORY_DISCIPLINES = ['Universal', 'Ruta', 'MTB', 'Gravel', 'Urbana', 'E-Bike', 'Pista', 'Triatlón', 'Niños'] as const

const APPAREL_TYPES = ['Jersey', 'Bibs / Culotte', 'Campera / Chaleco', 'Casco', 'Zapatillas', 'Guantes', 'Lentes', 'Medias', 'Protección', 'Accesorio', 'Otro'] as const
const APPAREL_SIZES = ['XXS', 'XS', 'S', 'M', 'L', 'XL', 'XXL', '3XL', 'Talle único'] as const
const APPAREL_SHOE_SIZES = Array.from({ length: 50 }, (_, index) => String(index + 1))
const APPAREL_FIT_OPTIONS = ['Unisex', 'Hombre', 'Mujer'] as const

export default function NewListingForm() {
  const [searchParams, setSearchParams] = useSearchParams()
  const navigate = useNavigate()
  const { fx } = useCurrency()
  const { uploadFiles, uploading, progress } = useUpload()
  const { user, enabled, isModerator } = useAuth()
  const { plans } = usePlans()
  const { show: showToast } = useToast()
  const listingId = searchParams.get('id')
  const listingTypeParam = searchParams.get('type')
  const listingType: 'bike' | 'accessory' | 'apparel' =
    listingTypeParam === 'accessory'
      ? 'accessory'
      : listingTypeParam === 'apparel'
        ? 'apparel'
        : 'bike'
  const isAccessory = listingType === 'accessory'
  const isApparel = listingType === 'apparel'
  const [editingListing, setEditingListing] = useState<Listing | null>(null)
  const [loadingListing, setLoadingListing] = useState(false)
  const [planOverride, setPlanOverride] = useState<PlanCode | null>(null)
  const [giftCode, setGiftCode] = useState<string | null>(null)
  const [giftPlan, setGiftPlan] = useState<PlanCode | null>(null)
  const [giftValidating, setGiftValidating] = useState(false)
  const [giftError, setGiftError] = useState<string | null>(null)
  const [giftClaimedAsCredit, setGiftClaimedAsCredit] = useState(false)
  const [profile, setProfile] = useState<UserProfileRecord | null>(null)
  const [submitting, setSubmitting] = useState(false)
  const upgradeStatusParam = searchParams.get('upgrade')
  const upgradePlanParam = canonicalPlanCode(searchParams.get('plan'))
  const upgradePlanLabel = upgradePlanParam === 'premium' ? 'Premium' : 'Básico'
  const upgradeSuccess = Boolean(listingId && upgradeStatusParam === 'success' && (upgradePlanParam === 'basic' || upgradePlanParam === 'premium'))
  const upgradePending = Boolean(listingId && upgradeStatusParam === 'pending')
  const upgradeFailure = Boolean(listingId && upgradeStatusParam === 'failure')

  /** 1) Plan seleccionado por query (?plan=free|basic|premium|pro)
   * Prioriza coincidencia literal (code/id/name) con el parámetro.
   * Si no hay, usa coincidencia por alias (resolvePlanCode).
   * Nota: `pro` no es alias de `premium`; es un plan exclusivo de tiendas.
   */
  const selectedPlan = useMemo(() => {
    if (planOverride) {
      const explicit = plans.find((plan) => {
        const code = resolvePlanCode(plan)
        return code === planOverride
      })
      if (explicit) return explicit
    }
    if (!plans.length) return undefined

    const param = normalisePlanText(searchParams.get('plan'))

    if (!param) return plans[0]

    // 1) Coincidencia literal exacta (code/id/name normalizados)
    const literalMatch = plans.find((plan) => {
      if (plan.code && normalisePlanText(plan.code) === param) return true
      if (plan.id && normalisePlanText(plan.id) === param) return true
      if (plan.name && normalisePlanText(plan.name) === param) return true
      return false
    })
    if (literalMatch) return literalMatch

    // 2) Coincidencia por alias/canonical (e.g., `pro` -> `premium`)
    const aliasMatch = plans.find((plan) => {
      const code = resolvePlanCode(plan)
      return Boolean(code && code === param)
    })
    if (aliasMatch) return aliasMatch

    return plans[0]
  }, [plans, planOverride, searchParams])

  // Detectar y validar gift code (?gift=CODE). Si es válido, sobreescribe el plan a basic/premium.
  useEffect(() => {
    const code = searchParams.get('gift')?.trim()
    if (!code) { setGiftCode(null); setGiftPlan(null); return }
    let active = true
    setGiftValidating(true)
    setGiftError(null)
    ;(async () => {
      try {
        const res = await validateGift(code)
        if (!active) return
        if (res.ok && (res.plan === 'basic' || res.plan === 'premium')) {
          setGiftCode(code)
          setGiftPlan(res.plan as PlanCode)
          setPlanOverride(res.plan as PlanCode)
          // Intentar convertir a crédito si el usuario está logueado
          try {
            if (user?.id && !giftClaimedAsCredit) {
              const claim = await claimGift(code, user.id)
              if (claim?.ok) {
                setGiftClaimedAsCredit(true)
                const next = new URLSearchParams(searchParams)
                next.delete('gift')
                next.set('credit', '1')
                setSearchParams(next, { replace: true })
              }
            }
          } catch { /* noop */ }
        } else {
          setGiftError('El código de regalo no es válido o está vencido.')
          setGiftCode(null)
          setGiftPlan(null)
        }
      } catch {
        if (active) setGiftError('No pudimos validar el código de regalo.')
      } finally {
        if (active) setGiftValidating(false)
      }
    })()

    return () => { active = false }
  }, [searchParams, user?.id, setSearchParams, giftClaimedAsCredit])

  // Canonizamos el código de plan (lo usa la DB y el backend)
  const resolvedPlanCode = selectedPlan ? resolvePlanCode(selectedPlan) : null
  const isStore = Boolean(profile?.store_enabled)
  const rawPlanParam = normalisePlanText(searchParams.get('plan'))
  const isProSelected = rawPlanParam === 'pro'
  const planCode = (planOverride ?? resolvedPlanCode)
    ?? (selectedPlan?.code ? normalisePlanText(selectedPlan.code) : undefined)
    ?? (selectedPlan?.id ? normalisePlanText(selectedPlan.id) : undefined)
  const planPrice = selectedPlan?.price ?? 0
  const maxPhotos = selectedPlan?.maxPhotos ?? 4
  const planName = selectedPlan?.name ?? 'Plan'
  // Duración de publicación: siempre según el plan elegido
  const listingDuration = selectedPlan?.listingDurationDays ?? selectedPlan?.periodDays ?? 30
  const whatsappEnabled = selectedPlan?.whatsappEnabled ?? false

  // Bloqueo temprano: si el usuario intenta abrir el formulario con plan Gratis y ya tiene una publicación activa (o "published")
  const [freeGateDone, setFreeGateDone] = useState(false)
  useEffect(() => {
    let cancelled = false
    ;(async () => {
      try {
        if (!enabled || !supabaseEnabled) { setFreeGateDone(true); return }
        if (!user?.id) { setFreeGateDone(true); return }
        if (editingListing) { setFreeGateDone(true); return }
        if (planCode !== 'free') { setFreeGateDone(true); return }
        const client = getSupabaseClient()
        const { data: rows, count } = await client
          .from('listings')
          .select('id', { count: 'exact' })
          .eq('seller_id', user.id)
          .or('status.in.(active,published),status.is.null')
          .or('plan.eq.free,plan_code.eq.free,seller_plan.eq.free')
          .limit(1)
        const c = typeof count === 'number' ? count : (Array.isArray(rows) ? rows.length : 0)
        if (!cancelled && c >= 1) {
          alert('Ya tenés una publicación activa con plan Gratis. Para publicar otra, elegí un plan pago.')
          navigate('/publicar', { replace: true })
          return
        }
        if (!cancelled) setFreeGateDone(true)
      } catch {
        if (!cancelled) setFreeGateDone(true)
      }
    })()
    return () => { cancelled = true }
  }, [enabled, supabaseEnabled, user?.id, planCode, editingListing, navigate])

  const listingExpiresLabel = useMemo(() => {
    // En flujo plan=free, esperamos a terminar la verificación antes de renderizar
    if (planCode === 'free' && !editingListing && !freeGateDone) return '…'
    // Plan pro (tienda verificada) no vence
    if (isProSelected) return 'No vence'
    if (editingListing?.expiresAt) {
      return new Intl.DateTimeFormat('es-AR', { dateStyle: 'long' }).format(new Date(editingListing.expiresAt))
    }
    const base = new Date()
    base.setDate(base.getDate() + listingDuration)
    return new Intl.DateTimeFormat('es-AR', { dateStyle: 'long' }).format(base)
  }, [editingListing?.expiresAt, listingDuration, planCode, freeGateDone, isProSelected])

  const expiresAtIso = useMemo(() => {
    if (planCode === 'free' && !editingListing && !freeGateDone) return null
    if (isProSelected) return null
    if (editingListing?.expiresAt) {
      return new Date(editingListing.expiresAt).toISOString()
    }
    const base = new Date()
    base.setDate(base.getDate() + listingDuration)
    return base.toISOString()
  }, [editingListing?.expiresAt, listingDuration, planCode, freeGateDone, isProSelected])

  const planPriceLabel = useMemo(() => {
    if (!selectedPlan) return null
    if (planPrice === 0) return 'Gratis'
    const currency = selectedPlan.currency ?? 'ARS'
    const locale = currency === 'USD' ? 'en-US' : 'es-AR'
    return new Intl.NumberFormat(locale, {
      style: 'currency',
      currency,
      maximumFractionDigits: 0
    }).format(planPrice)
  }, [selectedPlan, planPrice])

  const hasCredit = searchParams.get('credit') === '1'
  const effectivePlanLabel = useMemo(() => {
    if (giftPlan || hasCredit) return 'Bonificado'
    return planPriceLabel ?? 'Sin costo'
  }, [giftPlan, hasCredit, planPriceLabel])

  const [category, setCategory] = useState<Category | null>(isAccessory ? 'Accesorios' : isApparel ? 'Indumentaria' : null)
  const [brand, setBrand] = useState('')
  const [model, setModel] = useState('')
  const [material, setMaterial] = useState(MATERIAL_OPTIONS[0])
  const [customMaterial, setCustomMaterial] = useState('')
  const [frameSize, setFrameSize] = useState('')
  const [frameSizesMulti, setFrameSizesMulti] = useState('')
  const [drivetrain, setDrivetrain] = useState(DRIVETRAIN_OPTIONS[0])
  const [drivetrainOther, setDrivetrainOther] = useState('')
  const [wheelset, setWheelset] = useState('')
  const [wheelSize, setWheelSize] = useState('')
  const [extras, setExtras] = useState('')
  // Más información opcional para bicis
  const [moreOpen, setMoreOpen] = useState(false)
  const [seatInfo, setSeatInfo] = useState('')
  const [handlebarInfo, setHandlebarInfo] = useState('')
  const [pedalsInfo, setPedalsInfo] = useState('')
  const [chainInfo, setChainInfo] = useState('')
  const [forkInfo, setForkInfo] = useState('')
  const [brakeType, setBrakeType] = useState<'Disco hidráulico'|'Disco mecánico'|'Herradura'|''>('')
  const [bikeCondition, setBikeCondition] = useState<(typeof CONDITION_OPTIONS)[number] | ''>('')
  // Específicos por categoría
  const [mtbForkModel, setMtbForkModel] = useState('')
  const [fixieRatio, setFixieRatio] = useState('')
  const [ebikeMotor, setEbikeMotor] = useState('')
  const [ebikeCharge, setEbikeCharge] = useState('')
  const [priceCurrency, setPriceCurrency] = useState<'USD'|'ARS'>('USD')
  const [priceInput, setPriceInput] = useState('')
  const [year, setYear] = useState('')
  const [province, setProvince] = useState<string>('')
  const [city, setCity] = useState<string>('')
  const [cityOther, setCityOther] = useState<string>('')
  const [description, setDescription] = useState('')
  const [images, setImages] = useState<string[]>([])
  const [draggingIndex, setDraggingIndex] = useState<number | null>(null)
  const [dragOverIndex, setDragOverIndex] = useState<number | null>(null)
  const [sellerWhatsappLocal, setSellerWhatsappLocal] = useState('')
  const [whatsappUserEdited, setWhatsappUserEdited] = useState(false)
  // País para WhatsApp (prefijo)
  const COUNTRY_CODES = [
    { cc: 'AR', dial: '54', label: 'Argentina', flag: '🇦🇷' },
    { cc: 'PY', dial: '595', label: 'Paraguay', flag: '🇵🇾' },
    { cc: 'BR', dial: '55', label: 'Brasil', flag: '🇧🇷' },
    { cc: 'CL', dial: '56', label: 'Chile', flag: '🇨🇱' },
    { cc: 'UY', dial: '598', label: 'Uruguay', flag: '🇺🇾' },
    { cc: 'PE', dial: '51', label: 'Perú', flag: '🇵🇪' },
    { cc: 'VE', dial: '58', label: 'Venezuela', flag: '🇻🇪' },
    { cc: 'US', dial: '1', label: 'Estados Unidos', flag: '🇺🇸' },
  ] as const
  const [whatsappDial, setWhatsappDial] = useState<string>(COUNTRY_CODES[0].dial)
  const [draftRestored, setDraftRestored] = useState(false)
  const [accessoryType, setAccessoryType] = useState<(typeof ACCESSORY_TYPES)[number]>(ACCESSORY_TYPES[0])
  const [accessoryCondition, setAccessoryCondition] = useState<(typeof CONDITION_OPTIONS)[number]>(CONDITION_OPTIONS[1])
  const [accessoryDiscipline, setAccessoryDiscipline] = useState<(typeof ACCESSORY_DISCIPLINES)[number]>('Universal')
  const [accessoryUseNote, setAccessoryUseNote] = useState('')
  const [apparelType, setApparelType] = useState<(typeof APPAREL_TYPES)[number]>(APPAREL_TYPES[0])
  const [apparelSize, setApparelSize] = useState<string>(APPAREL_SIZES[3])
  const [apparelSizesMulti, setApparelSizesMulti] = useState<string>('')
  const [apparelFit, setApparelFit] = useState<(typeof APPAREL_FIT_OPTIONS)[number]>(APPAREL_FIT_OPTIONS[0])
  const [apparelCondition, setApparelCondition] = useState<(typeof CONDITION_OPTIONS)[number]>(CONDITION_OPTIONS[1])

  const isEditing = Boolean(editingListing)

  // (Wizard desactivado por ahora)

  const materialValue = isAccessory || isApparel ? '' : (material === 'Otro' ? customMaterial.trim() : material)
  const drivetrainValue = drivetrain === 'Otro' ? drivetrainOther.trim() : drivetrain
  const priceNumber = Number(priceInput) || 0

  const apparelSizeOptions = useMemo(
    () => (apparelType === 'Zapatillas' ? APPAREL_SHOE_SIZES : [...APPAREL_SIZES]),
    [apparelType]
  )

  useEffect(() => {
    if (!apparelSizeOptions.includes(apparelSize)) {
      setApparelSize(apparelSizeOptions[0] ?? '')
    }
  }, [apparelType, apparelSize, apparelSizeOptions])

  /** Habilitamos fotos cuando hay datos clave (para mejor UX) */
  const photosBaseReady = !!(category && brand.trim() && model.trim() && priceNumber > 0)
  const photosEnabled = (isAccessory || isApparel) ? photosBaseReady : !!(photosBaseReady && materialValue)
  const remainingPhotos = maxPhotos - images.length

  const finalCity = city === OTHER_CITY_OPTION ? cityOther.trim() : city
  const previewLocation = province
    ? finalCity
      ? `${finalCity}, ${province}`
      : city === OTHER_CITY_OPTION
        ? `Otra ciudad, ${province}`
        : `${province}`
    : 'Ubicación por definir'

  const storageKey = useMemo(() => {
    if (typeof window === 'undefined') return null
    if (!user?.id) return null
    const scope = listingId ? `listing:${listingId}` : `listing:${listingType}:new`
    return `mundobike:draft:${scope}:${user.id}`
  }, [listingId, user?.id, listingType])

  const clearDraft = useCallback(() => {
    if (!storageKey) return
    try {
      window.localStorage.removeItem(storageKey)
    } catch (err) {
      console.warn('[listing-form] clear draft failed', err)
    }
  }, [storageKey])

  useEffect(() => {
    setDraftRestored(false)
  }, [storageKey])

  useEffect(() => {
    if (!storageKey) {
      if (!draftRestored) setDraftRestored(true)
      return
    }
    if (draftRestored) return
    if (loadingListing) return
    try {
      const raw = window.localStorage.getItem(storageKey)
      if (!raw) {
        setDraftRestored(true)
        return
      }
      const draft = JSON.parse(raw) as Record<string, any>
      if (draft.category) setCategory(draft.category as Category)
      if (typeof draft.brand === 'string') setBrand(draft.brand)
      if (typeof draft.model === 'string') setModel(draft.model)
      if (typeof draft.material === 'string') {
        if (MATERIAL_OPTIONS.includes(draft.material)) {
          setMaterial(draft.material)
          setCustomMaterial(draft.customMaterial ?? '')
        } else {
          setMaterial('Otro')
          setCustomMaterial(draft.material)
        }
      } else if (draft.material === 'Otro' && typeof draft.customMaterial === 'string') {
        setMaterial('Otro')
        setCustomMaterial(draft.customMaterial)
      }
      if (typeof draft.frameSize === 'string') setFrameSize(draft.frameSize)
      if (typeof draft.frameSizesMulti === 'string') setFrameSizesMulti(draft.frameSizesMulti)
      if (typeof draft.drivetrain === 'string') setDrivetrain(draft.drivetrain)
      if (typeof draft.drivetrainOther === 'string') setDrivetrainOther(draft.drivetrainOther)
      if (typeof draft.wheelset === 'string') setWheelset(draft.wheelset)
      if (typeof draft.wheelSize === 'string') setWheelSize(draft.wheelSize)
      if (typeof draft.extras === 'string') setExtras(draft.extras)
      if (typeof draft.accessoryType === 'string' && (ACCESSORY_TYPES as readonly string[]).includes(draft.accessoryType)) setAccessoryType(draft.accessoryType as (typeof ACCESSORY_TYPES)[number])
      if (typeof draft.accessoryCondition === 'string' && (CONDITION_OPTIONS as readonly string[]).includes(draft.accessoryCondition)) setAccessoryCondition(draft.accessoryCondition as (typeof CONDITION_OPTIONS)[number])
      if (typeof draft.accessoryDiscipline === 'string' && (ACCESSORY_DISCIPLINES as readonly string[]).includes(draft.accessoryDiscipline)) setAccessoryDiscipline(draft.accessoryDiscipline as (typeof ACCESSORY_DISCIPLINES)[number])
      if (typeof draft.accessoryUseNote === 'string') setAccessoryUseNote(draft.accessoryUseNote)
      if (typeof draft.apparelType === 'string' && (APPAREL_TYPES as readonly string[]).includes(draft.apparelType)) setApparelType(draft.apparelType as (typeof APPAREL_TYPES)[number])
      if (typeof draft.apparelSize === 'string') setApparelSize(draft.apparelSize)
      if (typeof draft.apparelSizesMulti === 'string') setApparelSizesMulti(draft.apparelSizesMulti)
      if (typeof draft.apparelFit === 'string' && (APPAREL_FIT_OPTIONS as readonly string[]).includes(draft.apparelFit)) setApparelFit(draft.apparelFit as (typeof APPAREL_FIT_OPTIONS)[number])
      if (typeof draft.apparelCondition === 'string' && (CONDITION_OPTIONS as readonly string[]).includes(draft.apparelCondition)) setApparelCondition(draft.apparelCondition as (typeof CONDITION_OPTIONS)[number])
      if (draft.priceCurrency === 'USD' || draft.priceCurrency === 'ARS') {
        setPriceCurrency(draft.priceCurrency)
      }
      if (typeof draft.priceInput === 'string') setPriceInput(draft.priceInput)
      if (typeof draft.year === 'string') setYear(draft.year)
      if (typeof draft.province === 'string') setProvince(draft.province)
      if (typeof draft.city === 'string') setCity(draft.city)
      if (typeof draft.cityOther === 'string') setCityOther(draft.cityOther)
      if (typeof draft.description === 'string') setDescription(draft.description)
      if (Array.isArray(draft.images)) setImages(draft.images.filter((item: unknown) => typeof item === 'string'))
      const draftWhatsappRaw =
        typeof draft.sellerWhatsappLocal === 'string'
          ? draft.sellerWhatsappLocal
          : typeof draft.sellerWhatsappInput === 'string'
            ? draft.sellerWhatsappInput
            : ''
      if (draftWhatsappRaw) {
        const localValue = sanitizeLocalWhatsappInput(extractLocalWhatsapp(draftWhatsappRaw) || draftWhatsappRaw)
        setSellerWhatsappLocal(localValue)
      }
      if (draft.planOverride) setPlanOverride(draft.planOverride as PlanCode)
      setDraftRestored(true)
    } catch (err) {
      console.warn('[listing-form] draft restore failed', err)
      setDraftRestored(true)
    }
  }, [storageKey, draftRestored, loadingListing])

  useEffect(() => {
    if (!storageKey) return
    if (!draftRestored) return
    if (loadingListing) return
    try {
      const payload = JSON.stringify({
        category,
        brand,
        model,
        material,
        customMaterial,
        frameSize,
        frameSizesMulti,
        drivetrain,
        drivetrainOther,
        wheelset,
        wheelSize,
        extras,
        priceCurrency,
        priceInput,
        year,
        province,
        city,
        cityOther,
        description,
        images,
        sellerWhatsappLocal,
        planOverride,
        accessoryType,
        accessoryCondition,
        accessoryDiscipline,
        accessoryUseNote,
        apparelType,
        apparelSize,
        apparelSizesMulti,
        apparelFit,
        apparelCondition,
        listingType
      })
      window.localStorage.setItem(storageKey, payload)
    } catch (err) {
      console.warn('[listing-form] draft save failed', err)
    }
  }, [
    storageKey,
    draftRestored,
    loadingListing,
    category,
    brand,
    model,
    material,
    customMaterial,
    frameSize,
    frameSizesMulti,
    drivetrain,
    drivetrainOther,
    wheelset,
    wheelSize,
    extras,
    priceCurrency,
    priceInput,
    year,
    province,
    city,
    cityOther,
    description,
    images,
    sellerWhatsappLocal,
    planOverride,
    accessoryType,
    accessoryCondition,
    accessoryDiscipline,
    accessoryUseNote,
    apparelType,
    apparelSize,
    apparelSizesMulti,
    apparelFit,
    apparelCondition,
    listingType
  ])

  useEffect(() => {
    if (!user?.id || !supabaseEnabled) {
      setProfile(null)
      return
    }
    let active = true
    const loadProfile = async () => {
      const data = await fetchUserProfile(user.id)
      if (!active) return
      setProfile(data)
      if (whatsappEnabled && !sellerWhatsappLocal && !whatsappUserEdited && data?.whatsapp_number) {
        const localValue = sanitizeLocalWhatsappInput(extractLocalWhatsapp(data.whatsapp_number))
        if (localValue) setSellerWhatsappLocal(localValue)
      }
      // Prefill ubicación desde el perfil si no hay borrador ni valores cargados
      try {
        if (!listingId) {
          // Solo si aún no hay provincia/ciudad seleccionadas
          const profileProvince = (data?.province || '').trim()
          const profileCity = (data?.city || '').trim()
          if (profileProvince && !province) {
            setProvince(profileProvince)
          }
          if (profileCity && !city) {
            // Validar ciudad con la provincia del perfil (si existe)
            const provName = profileProvince || province
            const matchProv = PROVINCES.find((p) => p.name === provName)
            if (matchProv && matchProv.cities?.includes(profileCity as (typeof matchProv.cities)[number])) {
              setCity(profileCity)
            } else {
              setCity(OTHER_CITY_OPTION)
              setCityOther(profileCity)
            }
          }
        }
      } catch { /* noop */ }
    }
    void loadProfile()
    return () => {
      active = false
    }
  }, [user?.id, whatsappEnabled, sellerWhatsappLocal, whatsappUserEdited, listingId, province, city])

  const autoTitle = useMemo(() => {
    const composed = `${brand.trim()} ${model.trim()}`.trim()
    if (composed) return composed
    if (isAccessory) return 'Accesorio en venta'
    if (isApparel) return 'Indumentaria en venta'
    return 'Bicicleta en venta'
  }, [brand, model, isAccessory, isApparel])

  useEffect(() => {
    const loadListing = async () => {
      if (!listingId || !supabaseEnabled) return
      setLoadingListing(true)
      try {
        const existing = await fetchListing(listingId)
        if (!existing) {
          alert('No encontramos la publicación que querés editar.')
          navigate('/dashboard')
          return
        }
        if (user && existing.sellerId !== user.id && !isModerator) {
          alert('No tenés permisos para editar esta publicación.')
          navigate('/dashboard')
          return
        }
        setEditingListing(existing)
        const canonical = canonicalPlanCode(existing.plan ?? undefined)
        if (canonical) setPlanOverride(canonical)
        setCategory(existing.category as Category)
        setBrand(existing.brand)
        setModel(existing.model)
        setDescription(existing.description ?? '')
        setExtras(existing.extras ?? '')
        const existingCurrency = (existing.priceCurrency as 'USD' | 'ARS') ?? 'USD'
        setPriceCurrency(existingCurrency)
        setPriceInput(existing.price ? existing.price.toString() : '')
        setYear(existing.year ? String(existing.year) : '')
        setImages(existing.images ?? [])

        const extrasParts = (existing.extras ?? '')
          .split('•')
          .map((part) => part.trim())
          .filter(Boolean)
        const getExtraValue = (label: string) => {
          const item = extrasParts.find((part) => part.toLowerCase().startsWith(`${label.toLowerCase()}:`))
          if (!item) return null
          return item.split(':').slice(1).join(':').trim() || null
        }

        if ((existing.category as Category) === 'Accesorios') {
          const typeValue = getExtraValue('Tipo')
          if (typeValue && (ACCESSORY_TYPES as readonly string[]).includes(typeValue)) {
            setAccessoryType(typeValue as (typeof ACCESSORY_TYPES)[number])
          }
          const conditionValue = getExtraValue('Condición')
          if (conditionValue && (CONDITION_OPTIONS as readonly string[]).includes(conditionValue)) {
            setAccessoryCondition(conditionValue as (typeof CONDITION_OPTIONS)[number])
          }
          const disciplineValue = getExtraValue('Uso') ?? getExtraValue('Compatibilidad')
          if (disciplineValue && (ACCESSORY_DISCIPLINES as readonly string[]).includes(disciplineValue)) {
            setAccessoryDiscipline(disciplineValue as (typeof ACCESSORY_DISCIPLINES)[number])
          }
          const notesValue = getExtraValue('Notas')
          if (notesValue) setAccessoryUseNote(notesValue)
          else setAccessoryUseNote('')
          const detailValue = getExtraValue('Detalle')
          if (detailValue) setExtras(detailValue)
          else setExtras('')
          setMaterial(MATERIAL_OPTIONS[0])
          setCustomMaterial('')
          setDrivetrain(DRIVETRAIN_OPTIONS[0])
          setDrivetrainOther('')
          setWheelset('')
          setWheelSize('')
        } else if ((existing.category as Category) === 'Indumentaria') {
          setAccessoryUseNote('')
          setAccessoryDiscipline('Universal')
          setAccessoryCondition(CONDITION_OPTIONS[1])
          setAccessoryType(ACCESSORY_TYPES[0])
          const typeValue = getExtraValue('Tipo')
          if (typeValue && (APPAREL_TYPES as readonly string[]).includes(typeValue)) {
            setApparelType(typeValue as (typeof APPAREL_TYPES)[number])
          }
          const sizeValue = getExtraValue('Talle')
          if (sizeValue) {
            setApparelSize(sizeValue)
          }
          const sizesMulti = getExtraValue('Talles')
          if (sizesMulti) {
            setApparelSizesMulti(sizesMulti)
            if (!sizeValue) {
              const first = sizesMulti.split(',').map((s) => s.trim()).filter(Boolean)[0]
              if (first) setApparelSize(first)
            }
          } else {
            setApparelSizesMulti('')
          }
          const conditionValue = getExtraValue('Condición')
          if (conditionValue && (CONDITION_OPTIONS as readonly string[]).includes(conditionValue)) {
            setApparelCondition(conditionValue as (typeof CONDITION_OPTIONS)[number])
          }
          const fitValue = getExtraValue('Fit') ?? getExtraValue('Formato')
          if (fitValue && (APPAREL_FIT_OPTIONS as readonly string[]).includes(fitValue)) {
            setApparelFit(fitValue as (typeof APPAREL_FIT_OPTIONS)[number])
          }
          const notesValue = getExtraValue('Notas')
          if (notesValue) {
            setExtras(notesValue)
          } else {
            setExtras('')
          }
          setMaterial(MATERIAL_OPTIONS[0])
          setCustomMaterial('')
          setDrivetrain(DRIVETRAIN_OPTIONS[0])
          setDrivetrainOther('')
          setWheelset('')
          setWheelSize('')
          setYear('')
        } else {
          const materialFromDb = existing.material ?? ''
          if (materialFromDb && MATERIAL_OPTIONS.includes(materialFromDb)) {
            setMaterial(materialFromDb)
            setCustomMaterial('')
          } else if (materialFromDb) {
            setMaterial('Otro')
            setCustomMaterial(materialFromDb)
          }
          const drivetrainFromDb = existing.drivetrain ?? ''
          if (drivetrainFromDb && DRIVETRAIN_OPTIONS.includes(drivetrainFromDb)) {
            setDrivetrain(drivetrainFromDb)
            setDrivetrainOther('')
          } else if (drivetrainFromDb) {
            setDrivetrain('Otro')
            setDrivetrainOther(existing.drivetrainDetail ?? drivetrainFromDb)
          }
          setWheelset(existing.wheelset ?? '')
          setWheelSize(existing.wheelSize ?? '')
          const tallesMulti = getExtraValue('Talles')
          if (tallesMulti) setFrameSizesMulti(tallesMulti)
          else setFrameSizesMulti('')
        }
        const locationParts = (existing.location ?? '').split(',').map((part) => part.trim()).filter(Boolean)
        if (locationParts.length === 2) {
          const [cityValue, provinceValue] = locationParts
          const provinceMatch = PROVINCES.find((p) => p.name === provinceValue)
          if (provinceMatch) {
            setProvince(provinceValue)
            const belongsToProvince = provinceMatch.cities?.some((cityOption) => cityOption === cityValue)
            if (belongsToProvince) {
              setCity(cityValue)
            } else if (cityValue) {
              setCity(OTHER_CITY_OPTION)
              setCityOther(cityValue)
            }
          } else {
            setCity(OTHER_CITY_OPTION)
            setCityOther(cityValue)
          }
        }
        const existingWhatsappRaw = existing.sellerWhatsapp ?? ''
        if (existingWhatsappRaw) {
          const localValue = sanitizeLocalWhatsappInput(extractLocalWhatsapp(existingWhatsappRaw))
          setSellerWhatsappLocal(localValue)
        } else if (profile?.whatsapp_number) {
          const localValue = sanitizeLocalWhatsappInput(extractLocalWhatsapp(profile.whatsapp_number))
          if (localValue) setSellerWhatsappLocal(localValue)
        }
      } finally {
        setLoadingListing(false)
      }
    }
    void loadListing()
  }, [listingId, supabaseEnabled, user?.id])

  useEffect(() => {
    if (listingId || !whatsappEnabled) return
    if (sellerWhatsappLocal) return
    if (whatsappUserEdited) return
    const metaWhatsapp = (user?.user_metadata?.whatsapp as string | undefined) ?? (user?.user_metadata?.phone as string | undefined) ?? ''
    const profileWhatsapp = profile?.whatsapp_number ?? ''
    const defaultWhatsapp = profileWhatsapp || metaWhatsapp
    if (defaultWhatsapp) {
      const localValue = sanitizeLocalWhatsappInput(extractLocalWhatsapp(defaultWhatsapp) || defaultWhatsapp)
      if (localValue) setSellerWhatsappLocal(localValue)
    }
  }, [listingId, whatsappEnabled, profile?.whatsapp_number, sellerWhatsappLocal, user?.user_metadata?.phone, user?.user_metadata?.whatsapp, whatsappUserEdited])

  useEffect(() => {
    if (!listingId || !whatsappEnabled) return
    if (!profile?.whatsapp_number) return
    if (sellerWhatsappLocal) return
    if (whatsappUserEdited) return
    const localValue = sanitizeLocalWhatsappInput(extractLocalWhatsapp(profile.whatsapp_number))
    if (localValue) setSellerWhatsappLocal(localValue)
  }, [listingId, whatsappEnabled, profile?.whatsapp_number, sellerWhatsappLocal, whatsappUserEdited])

  /** 2) Subida de fotos (usa hook existente) */
  const handleFiles = async (files: FileList | null) => {
    if (!photosEnabled) {
      alert('Completá los datos principales antes de subir fotos.')
      return
    }
    if (!files || remainingPhotos <= 0) {
      if (remainingPhotos <= 0) alert(`Tu plan ${planName} permite subir hasta ${maxPhotos} fotos. Actualizá tu plan para cargar más imágenes.`)
      return
    }
    const selected = Array.from(files).slice(0, remainingPhotos)
    const urls = await uploadFiles(selected) // Ideal: acá podrías comprimir a WebP antes
    setImages((prev) => [...prev, ...urls])
  }

  const removeImageAt = (index: number) => {
    setImages((prev) => prev.filter((_, idx) => idx !== index))
  }

  const makePrimaryAt = (index: number) => {
    setImages((prev) => {
      if (index <= 0 || index >= prev.length) return prev
      const next = prev.slice()
      const [picked] = next.splice(index, 1)
      next.unshift(picked)
      return next
    })
  }

  const reorderImages = (from: number, to: number) => {
    setImages((prev) => {
      if (from === to || from < 0 || to < 0 || from >= prev.length || to >= prev.length) return prev
      const next = prev.slice()
      const [moved] = next.splice(from, 1)
      next.splice(to, 0, moved)
      return next
    })
  }

  const onThumbDragStart = (index: number, e: React.DragEvent<HTMLDivElement>) => {
    setDraggingIndex(index)
    setDragOverIndex(index)
    try {
      e.dataTransfer.effectAllowed = 'move'
      e.dataTransfer.setData('text/plain', String(index))
    } catch { /* noop */ }
  }

  const onThumbDragOver = (index: number, e: React.DragEvent<HTMLDivElement>) => {
    e.preventDefault()
    if (dragOverIndex !== index) setDragOverIndex(index)
    try { e.dataTransfer.dropEffect = 'move' } catch { /* noop */ }
  }

  const onThumbDrop = (index: number, e: React.DragEvent<HTMLDivElement>) => {
    e.preventDefault()
    let from = draggingIndex
    if (from == null) {
      const raw = e.dataTransfer.getData('text/plain')
      const parsed = Number(raw)
      if (Number.isFinite(parsed)) from = parsed
    }
    if (from != null) reorderImages(from, index)
    setDraggingIndex(null)
    setDragOverIndex(null)
  }

  const onThumbDragEnd = () => {
    setDraggingIndex(null)
    setDragOverIndex(null)
  }

  /** 3) Submit: inserta listing o actualiza si corresponde */
  const submit = async () => {
    if (submitting) return
    if (!enabled || !supabaseEnabled) return alert('Publicar deshabilitado: configurá Supabase en .env')
    if (!user) return alert('Iniciá sesión para crear una publicación')
    if (!planCode) return alert('No se detectó el plan seleccionado')

    const finalCategory = (isAccessory ? 'Accesorios' : isApparel ? 'Indumentaria' : category) as Category | null

    // Validaciones base
    if (!finalCategory) return alert('Seleccioná una categoría')
    if (!brand.trim()) return alert(isAccessory || isApparel ? 'Ingresá la marca del producto' : 'Ingresá la marca de la bicicleta')
    if (!model.trim()) return alert(isAccessory || isApparel ? 'Ingresá el nombre del producto' : 'Ingresá el modelo de la bicicleta')
    if (!isAccessory && !isApparel && !materialValue) return alert('Indicá el material del cuadro')
    if (isApparel && !apparelSize && !apparelSizesMulti.trim()) return alert('Indicá al menos un talle')
    if (priceNumber <= 0) return alert('Ingresá un precio válido')
    if (!province) return alert('Seleccioná una provincia')
    if (!city) return alert('Seleccioná una ciudad')
    if (city === OTHER_CITY_OPTION && !cityOther.trim()) return alert('Especificá la ciudad')
    if (!images.length) return alert('Subí al menos una foto')
    // (Opcional) límite de publicaciones activas por usuario según plan visible en UI
    const client = getSupabaseClient()

    setSubmitting(true)
    try {
      // Límite de publicaciones activas por plan: solo aplica a Gratis (1 activa)
      if (!editingListing && supabaseEnabled && planCode === 'free') {
        // Contar publicaciones activas (o published) del usuario con plan Gratis
        const { data: rows, count } = await client
          .from('listings')
          .select('id', { count: 'exact' })
          .eq('seller_id', user.id)
          .or('status.in.(active,published),status.is.null')
          .or('plan.eq.free,plan_code.eq.free,seller_plan.eq.free')
          .limit(1)

        const activeCount = typeof count === 'number' ? count : (Array.isArray(rows) ? rows.length : 0)
        if (activeCount >= 1) {
          alert('El plan Gratis permite una publicación activa a la vez.')
          return
        }
      }

    // Guardamos el precio tal cual lo ingresó el usuario según la moneda seleccionada
    const priceForStorage = priceNumber
    const location = finalCity ? `${finalCity}, ${province}` : province

    // Para tiendas oficiales, la publicación no vence (null)
    const computedExpiresAtIso = (() => {
      // Solo publicaciones con plan "pro" (tienda verificada) no vencen
      if (isProSelected) return null
      const d = new Date()
      d.setDate(d.getDate() + listingDuration)
      return d.toISOString()
    })()

    const metadata = user.user_metadata ?? {}
    const rawSellerName = metadata.full_name ?? metadata.name ?? user.email ?? 'Vendedor'
    const sellerName = formatNameWithInitial(typeof rawSellerName === 'string' ? rawSellerName : String(rawSellerName), user.email ?? undefined)
    const sellerLocation = metadata.city
      ? (metadata.province ? `${metadata.city}, ${metadata.province}` : metadata.city)
      : undefined
    const profileWhatsapp = profile?.whatsapp_number ?? null
    const metadataWhatsapp = typeof metadata.whatsapp === 'string' ? metadata.whatsapp : null
    const metadataPhone = typeof metadata.phone === 'string' ? metadata.phone : null

    // Defaults exigidos por el negocio
    let safeDescription = (() => {
      const base = description.trim()
      if (base) return base
      if (isAccessory || isApparel) return 'Sin descripción adicional'
      return 'No declara descripción específica'
    })()
    const safeExtras = (() => {
      if (isAccessory) {
        const parts = [`Tipo: ${accessoryType}`, `Condición: ${accessoryCondition}`, `Uso: ${accessoryDiscipline}`]
        if (accessoryUseNote.trim()) parts.push(`Notas: ${accessoryUseNote.trim()}`)
        if (extras.trim()) parts.push(`Detalle: ${extras.trim()}`)
        return parts.join(' • ')
      }
      if (isApparel) {
        const parts: string[] = [`Tipo: ${apparelType}`, `Condición: ${apparelCondition}`, `Género: ${apparelFit}`]
        const multi = apparelSizesMulti.trim()
        if (multi) {
          const normalized = multi
            .split(',')
            .map((s) => s.trim())
            .filter(Boolean)
            .join(', ')
          if (normalized) parts.splice(1, 0, `Talles: ${normalized}`)
        } else if (apparelSize) {
          parts.splice(1, 0, `Talle: ${apparelSize}`)
        }
        if (extras.trim()) parts.push(`Notas: ${extras.trim()}`)
        return parts.join(' • ')
      }
      const parts: string[] = []
      const multi = frameSizesMulti.trim()
      if (multi) {
        const normalized = multi
          .split(',')
          .map((s) => s.trim())
          .filter(Boolean)
          .join(', ')
        if (normalized) parts.push(`Talles: ${normalized}`)
      }
      // Extras (sin condición/freno/horquilla principal)
      if (seatInfo.trim()) parts.push(`Asiento: ${seatInfo.trim()}`)
      if (handlebarInfo.trim()) parts.push(`Manillar: ${handlebarInfo.trim()}`)
      if (pedalsInfo.trim()) parts.push(`Pedales: ${pedalsInfo.trim()}`)
      if (chainInfo.trim()) parts.push(`Cadena: ${chainInfo.trim()}`)
      if (forkInfo.trim()) parts.push(`Horquilla: ${forkInfo.trim()}`)
      if (category === 'Fixie' && fixieRatio.trim()) parts.push(`Relación: ${fixieRatio.trim()}`)
      if (category === 'E-Bike') {
        if (ebikeMotor.trim()) parts.push(`Motor: ${ebikeMotor.trim()}`)
        if (ebikeCharge.trim()) parts.push(`Carga: ${ebikeCharge.trim()}`)
      }
      const base = extras.trim()
      if (base) parts.push(`Detalle: ${base}`)
      return parts.length ? parts.join(' • ') : 'No tiene agregados extras, se encuentra original'
    })()

    // Condición / freno / horquilla principal pasan a descripción (solo bicis)
    if (!isAccessory && !isApparel) {
      const add: string[] = []
      if (bikeCondition) add.push(`Condición: ${bikeCondition}`)
      if (brakeType) add.push(`Tipo de freno: ${brakeType}`)
      if (category === 'MTB' && mtbForkModel.trim()) add.push(`Horquilla: ${mtbForkModel.trim()}`)
      if (add.length) safeDescription = `${safeDescription}\n${add.join(' • ')}`
    }

    const candidateSources: Array<string | null> = [
      sellerWhatsappLocal,
      profileWhatsapp,
      metadataWhatsapp,
      metadataPhone,
      editingListing?.sellerWhatsapp ?? null
    ]
    let formattedWhatsapp: string | null = null
    if (whatsappEnabled) {
      const local = sanitizeLocalWhatsappInput(sellerWhatsappLocal)
      if (local) {
        formattedWhatsapp = `${whatsappDial}${local}`
      } else {
        for (const source of candidateSources) {
          if (!source) continue
          const normalized = normaliseWhatsapp(source)
          if (normalized) { formattedWhatsapp = normalized; break }
        }
      }
    } else {
      formattedWhatsapp = editingListing?.sellerWhatsapp ?? null
    }

    const effectivePlanCode = isProSelected ? 'pro' : planCode
    // Derivar subcategoría cuando aplique
    const subcategory = isAccessory ? accessoryType : (isApparel ? apparelType : undefined)

    // 0. Si viene con crédito (?credit=1) canjear antes de crear el aviso
    let redeemedCreditId: string | null = null
    const wantsToUseCredit = searchParams.get('credit') === '1' && (planCode === 'basic' || planCode === 'premium')
    if (!editingListing && wantsToUseCredit && user?.id) {
      try {
        const res = await redeemCredit(user.id, planCode as 'basic' | 'premium')
        if (!res.ok) {
          alert('No encontramos un crédito disponible para tu cuenta. Volvé a seleccionar el plan o intentá nuevamente.')
          return
        }
        redeemedCreditId = res.creditId
      } catch {
        alert('No pudimos validar tu crédito. Intentá nuevamente en unos minutos.')
        return
      }
    }

      const payload = {
        title: autoTitle,
        brand: brand.trim(),
        model: model.trim(),
        year: (isAccessory || isApparel) ? undefined : year ? Number(year) : undefined,
        category: finalCategory,
        subcategory,
        price: priceForStorage,
        price_currency: priceCurrency,
        location,
        description: safeDescription,
        images,
        seller_name: sellerName,
        seller_location: sellerLocation,
        seller_whatsapp: formattedWhatsapp,
        seller_email: user.email,
        seller_plan: effectivePlanCode,
        material: (isAccessory || isApparel) ? undefined : (materialValue || undefined),
        frame_size: (isAccessory || isApparel) ? undefined : (frameSize || undefined),
        drivetrain: (isAccessory || isApparel) ? undefined : (drivetrain === 'Otro' ? undefined : drivetrain),
        drivetrain_detail: (isAccessory || isApparel) ? undefined : (drivetrain === 'Otro' ? (drivetrainOther.trim() || undefined) : undefined),
        wheelset: (isAccessory || isApparel) ? undefined : (wheelset.trim() || undefined),
        wheel_size: (isAccessory || isApparel) ? undefined : (wheelSize || undefined),
        extras: safeExtras,
        plan_code: effectivePlanCode,
        plan: effectivePlanCode,
        status: 'active',
        expires_at: computedExpiresAtIso,
        renewal_notified_at: null
      }

      // Si estamos editando una publicación que no es del usuario (moderador),
      // no sobrescribimos los datos del vendedor para conservar al publicador original.
      if (editingListing && user.id !== editingListing.sellerId) {
        // Evita cambiar el nombre visible del vendedor
        delete (payload as any).seller_name
        // Evita mover datos de contacto del vendedor al moderador por accidente
        delete (payload as any).seller_email
        delete (payload as any).seller_location
        // El whatsapp puede requerir políticas específicas; por defecto no lo tocamos
        delete (payload as any).seller_whatsapp
      }

      const currentPlanCode = editingListing ? canonicalPlanCode(editingListing.plan ?? editingListing.sellerPlan ?? undefined) : null
      const nextPlanCode = canonicalPlanCode(planCode)
      const planChanged = editingListing ? nextPlanCode !== currentPlanCode : true
      const shouldApplyPlan = !editingListing || planChanged

      if (editingListing) {
      const { data: updated, error: updateError } = await client
        .from('listings')
        .update(payload)
        .eq('id', editingListing.id)
        .select()
        .single()

      if (updateError || !updated) {
        const msg = String(updateError?.message || '').toLowerCase()
        if (msg.includes('whatsapp') || msg.includes('tel') || msg.includes('telefono') || msg.includes('teléfono')) {
          showToast('Evitá publicar teléfonos o WhatsApp en descripción o extras. Para WhatsApp elegí un plan Básico o Premium.', { variant: 'error' } as any)
          return
        }
        console.error('Error update listing:', updateError)
        alert('No pudimos actualizar la publicación. Intentá nuevamente.')
        return
      }
      // Aplicar destaque incluido de forma atómica en backend (plan + highlight) solo si hay cambio de plan o es nuevo
      if (shouldApplyPlan) {
        try {
          const { data: session } = await client.auth.getSession()
          const token = session.session?.access_token
          if (token) {
            const apiBase = (import.meta.env.VITE_API_BASE_URL || '').replace(/\/$/, '')
            if (apiBase) {
              await fetch(`${apiBase}/api/listings/${updated.id}/apply-plan`, {
                method: 'POST',
                headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${token}` },
                body: JSON.stringify({
                  planCode: effectivePlanCode,
                  listingDays: listingDuration,
                  includedHighlightDays: (selectedPlan?.featuredDays || 0),
                })
              })
            }
          }
        } catch { /* noop */ }
      }
        clearDraft()
        navigate(`/listing/${updated.slug ?? updated.id}`)
        return
      }

      /** 3.a Inserta listing (dispara trigger de snapshot por plan_code) */
      const { data: inserted, error: insertErr } = await client
        .from('listings')
        .insert([{ seller_id: user.id, ...payload, images: [] }])
        .select()
        .single()

      if (insertErr || !inserted) {
      const msg = String(insertErr?.message || '').toLowerCase()
      if (msg.includes('whatsapp') || msg.includes('tel') || msg.includes('telefono') || msg.includes('teléfono')) {
        showToast('Evitá publicar teléfonos o WhatsApp en descripción o extras. Para WhatsApp elegí un plan Básico o Premium.', { variant: 'error' } as any)
        return
      }
      console.error('Error insert listing:', insertErr)
      alert('No pudimos crear la publicación. Intentá nuevamente.')
      return
    }

      /** 3.b Guardar URLs de imágenes (respetar límite en el front ya lo hicimos) */
      const { error: updErr } = await client
        .from('listings')
        .update({ images })
        .eq('id', inserted.id)

      if (updErr) {
        console.error('Error update images:', updErr)
        alert('Creaste la publicación pero falló al guardar imágenes. Intentá editar y volver a subir.')
        return
      }

      // 3.c Asociar crédito al listing (best-effort)
      if (redeemedCreditId && inserted?.id && user?.id) {
        try { await attachCreditToListing(user.id, redeemedCreditId, inserted.id) } catch { /* noop */ }
      }

      // 3.d Redimir gift si corresponde (best-effort) – solo si NO usamos crédito
      if (giftCode && user?.id && !wantsToUseCredit) {
        try { await redeemGift(giftCode, user.id) } catch { void 0 }
      }

      // 3.e Aplicar plan + destaque incluido (atómico en backend)
      if (shouldApplyPlan) {
        try {
          const { data: session } = await client.auth.getSession()
          const token = session.session?.access_token
          if (token) {
            const apiBase = (import.meta.env.VITE_API_BASE_URL || '').replace(/\/$/, '')
            if (apiBase) {
              await fetch(`${apiBase}/api/listings/${inserted.id}/apply-plan`, {
                method: 'POST',
                headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${token}` },
                body: JSON.stringify({
                  planCode: effectivePlanCode,
                  listingDays: listingDuration,
                  includedHighlightDays: (selectedPlan?.featuredDays || 0),
                })
              })
            }
          }
        } catch { /* noop */ }
      }

      // Ya pagaste tu plan (si correspondía). Redirigimos al detalle del aviso.
      clearDraft()
      showToast(isEditing ? 'Publicación actualizada con éxito' : 'Publicación creada con éxito')
      navigate(`/listing/${inserted.slug ?? inserted.id}`)
    } finally {
      setSubmitting(false)
    }
  }

  const formattedPreviewPrice = () => {
    if (!priceNumber) return '—'
    const locale = priceCurrency === 'ARS' ? 'es-AR' : 'en-US'
    const code = priceCurrency
    const formatted = new Intl.NumberFormat(locale, { style: 'currency', currency: code, maximumFractionDigits: 0 }).format(priceNumber)
    return `${formatted} ${code}`
  }

  // (Preview de extras: se muestra el campo extras tal cual)

  useEffect(() => {
    setCity('')
    setCityOther('')
  }, [province])

  useEffect(() => {
    if (city !== OTHER_CITY_OPTION) setCityOther('')
  }, [city])

  useEffect(() => {
    if (isAccessory && category !== 'Accesorios') setCategory('Accesorios')
    if (isApparel && category !== 'Indumentaria') setCategory('Indumentaria')
    if (!isAccessory && !isApparel && (category === 'Accesorios' || category === 'Indumentaria')) setCategory(null)
  }, [isAccessory, isApparel, category])

  // Gateo inicial: en flujo plan=free y gate no terminado, no mostrar el formulario todavía
  if (planCode === 'free' && !editingListing && !freeGateDone) {
    return (
      <Container>
        <div className="mx-auto mt-12 max-w-xl rounded-2xl border border-black/10 bg-white p-6 text-center text-sm text-black/60 shadow">
          Verificando disponibilidad del plan Gratis…
        </div>
      </Container>
    )
  }

  if (loadingListing) {
    return (
      <Container>
        <div className="mx-auto mt-12 max-w-xl rounded-2xl border border-black/10 bg-white p-6 text-center text-sm text-black/60 shadow">
          Cargando datos de la publicación…
        </div>
      </Container>
    )
  }

  return (
    <div className="bg-[#14212e]">
      <Container className="text-white">
        {upgradeSuccess && (
          <div className="mb-6 rounded-2xl border border-emerald-400/60 bg-emerald-500/10 px-4 py-3 text-sm text-emerald-100 shadow-[0_18px_40px_rgba(6,12,24,0.35)]">
            <p className="font-semibold text-emerald-100">Plan {upgradePlanLabel} activado</p>
            <p className="mt-1 text-emerald-50/90">Tu plan {upgradePlanLabel.toLowerCase()} ya está activo para esta publicación. Ahora podés agregar tu WhatsApp y subir más fotos.</p>
          </div>
        )}
        {!upgradeSuccess && upgradePending && (
          <div className="mb-6 rounded-2xl border border-amber-400/60 bg-amber-500/10 px-4 py-3 text-sm text-amber-100 shadow-[0_18px_40px_rgba(6,12,24,0.25)]">
            <p className="font-semibold text-amber-100">Estamos procesando tu pago</p>
            <p className="mt-1 text-amber-50/90">Apenas Mercado Pago confirme el cobro vamos a activar el plan automáticamente.</p>
          </div>
        )}
        {upgradeFailure && (
          <div className="mb-6 rounded-2xl border border-red-400/60 bg-red-500/10 px-4 py-3 text-sm text-red-100 shadow-[0_18px_40px_rgba(48,10,10,0.25)]">
            <p className="font-semibold text-red-100">El pago no se completó</p>
            <p className="mt-1 text-red-50/90">Volvé a tu panel para intentar el upgrade nuevamente cuando quieras.</p>
          </div>
        )}
        <div className="flex w-full flex-col gap-3 md:flex-row md:items-center md:justify-between mb-6">
          <div className="min-w-0">
            <h1 className="text-2xl font-bold text-white">{isEditing ? 'Editar publicación' : 'Nueva publicación'}</h1>
            <p className="text-sm text-white/75 mt-1">
              {isEditing
                ? 'Actualizá la información de tu aviso. Los cambios se publican al instante.'
                : isAccessory
                  ? 'Completá los datos de tu producto y mirá la vista previa en tiempo real.'
                  : isApparel
                    ? 'Completá los datos de tu prenda y mirá la vista previa en tiempo real.'
                    : 'Completá los datos de tu bici y obtené una vista previa en tiempo real.'}
            </p>
          </div>
          <div className="min-w-0 rounded-xl border border-white/30 bg-white/10 px-4 py-3 text-sm text-white max-w-full md:max-w-sm">
          {/* Badge destacado de crédito/cortesía aplicada */}
          {((searchParams.get('credit') === '1') || (giftCode && giftPlan)) && (
            <div className="mb-2 inline-flex items-center gap-2 rounded-full bg-emerald-500 px-3 py-1 text-xs font-bold text-white shadow">
              <svg viewBox="0 0 24 24" className="h-4 w-4" fill="none" stroke="currentColor" strokeWidth={2}>
                <path d="m5 13 4 4L19 7" strokeLinecap="round" strokeLinejoin="round" />
              </svg>
              {searchParams.get('credit') === '1' ? 'Crédito aplicado' : `Cortesía aplicada: ${giftPlan === 'basic' ? 'Básico' : 'Premium'}`}
            </div>
          )}
          {searchParams.get('credit') === '1' && (
            <div className="-mt-1 mb-2 text-xs text-white/90">
              {planCode === 'premium'
                ? 'Tenés un crédito Premium bonificado. Podés usarlo para crear una publicación Premium sin costo.'
                : 'Tenés un crédito Básico bonificado. Podés usarlo para crear una publicación Básica sin costo.'}
            </div>
          )}
          <div className="font-semibold text-white">{isEditing ? `Plan en uso: ${planName}` : `Plan seleccionado: ${planName}`}</div>
          <div className="text-xs font-semibold text-white/90">
            {isProSelected ? 'Tienda verificada (sin costo)' : (isEditing ? 'Podés cambiar de plan desde tu panel de vendedor.' : effectivePlanLabel)}
          </div>
          {giftValidating && (
            <div className="mt-2 text-xs text-white/80">Verificando código de regalo…</div>
          )}
          {giftCode && giftPlan && (
            <div className="mt-2 rounded-lg border border-white/20 bg-white/10 p-2 text-xs">
              Código aplicado: {giftCode}
            </div>
          )}
          {giftError && (
            <div className="mt-2 text-xs text-red-200">{giftError}</div>
          )}
          {selectedPlan?.description && (
            <div className="mt-2 text-xs text-white/80">{selectedPlan.description}</div>
          )}
            <div className="mt-2 space-y-1 text-xs text-white/70">
            <div>Duración de la publicación: {isProSelected ? 'Ilimitada' : `${listingDuration} días`}</div>
            <div>Expira aprox.: {listingExpiresLabel}</div>
            <div>Fotos permitidas: {maxPhotos}</div>
            <div>
              {selectedPlan?.featuredDays
                ? `Destacada ${selectedPlan.featuredDays} ${selectedPlan.featuredDays === 1 ? 'día' : 'días'} en portada`
                : 'Sin destaque en portada'}
            </div>
            <div>{selectedPlan?.whatsappEnabled ? 'Botón de WhatsApp habilitado' : 'Sin WhatsApp (contacto por email)'}</div>
            {selectedPlan?.socialBoost && <div>Difusión en Instagram y Facebook</div>}
          </div>
        </div>
      </div>

      <div className="grid w-full gap-6 md:grid-cols-2 lg:grid-cols-[65%_35%]">
        <div className="card w-full max-w-full min-w-0 overflow-hidden p-6 space-y-6 text-[#14212e]">
          <section>
            <h2 className="text-lg font-semibold text-mb-ink">
              {isAccessory ? '1. Tipo de accesorio' : isApparel ? '1. Tipo de indumentaria' : '1. Categoría'}
            </h2>
            <p className="text-sm text-black/60">
              {isAccessory
                ? 'Definí qué clase de accesorio vas a publicar y en qué estado se encuentra.'
                : isApparel
                  ? 'Contanos qué prenda querés publicar y el fit que mejor describe el producto.'
                  : 'Elegí la categoría que mejor describe tu bicicleta.'}
            </p>
            {isAccessory && (
              <div className="mt-4 space-y-4">
                <Field label="Tipo de accesorio">
                  <select
                    className="select"
                    value={accessoryType}
                    onChange={(e) => setAccessoryType(e.target.value as (typeof ACCESSORY_TYPES)[number])}
                  >
                    {ACCESSORY_TYPES.map((option) => (
                      <option key={option} value={option}>
                        {option}
                      </option>
                    ))}
                  </select>
                </Field>
                <Field label="Condición">
                  <select
                    className="select"
                    value={accessoryCondition}
                    onChange={(e) => setAccessoryCondition(e.target.value as (typeof CONDITION_OPTIONS)[number])}
                  >
                    {CONDITION_OPTIONS.map((option) => (
                      <option key={option} value={option}>
                        {option}
                      </option>
                    ))}
                  </select>
                </Field>
              </div>
            )}
            {isApparel && (
              <div className="mt-4 space-y-4">
                <div className="grid sm:grid-cols-2 gap-4">
                  <Field label="Tipo de prenda">
                    <select
                      className="select"
                      value={apparelType}
                      onChange={(e) => setApparelType(e.target.value as (typeof APPAREL_TYPES)[number])}
                    >
                      {APPAREL_TYPES.map((option) => (
                        <option key={option} value={option}>
                          {option}
                        </option>
                      ))}
                    </select>
                  </Field>
                  <Field label="Género">
                    <select
                      className="select"
                      value={apparelFit}
                      onChange={(e) => setApparelFit(e.target.value as (typeof APPAREL_FIT_OPTIONS)[number])}
                    >
                      {APPAREL_FIT_OPTIONS.map((option) => (
                        <option key={option} value={option}>
                          {option}
                        </option>
                      ))}
                    </select>
                  </Field>
                </div>
                <Field label="Condición">
                  <select
                    className="select"
                    value={apparelCondition}
                    onChange={(e) => setApparelCondition(e.target.value as (typeof CONDITION_OPTIONS)[number])}
                  >
                    {CONDITION_OPTIONS.map((option) => (
                      <option key={option} value={option}>
                        {option}
                      </option>
                    ))}
                  </select>
                </Field>
              </div>
            )}
            {!isAccessory && !isApparel && (
              <>
                {/* Mobile: selector desplegable */}
                <div className="mt-4 sm:hidden">
                  <Field label="Elegí una categoría">
                    <select
                      className="select"
                      value={category ?? ''}
                      onChange={(e) => setCategory((e.target.value || null) as Category | null)}
                    >
                      <option value="">Seleccionar…</option>
                      {BIKE_CATEGORIES.map((option) => (
                        <option key={option} value={option}>{option}</option>
                      ))}
                    </select>
                  </Field>
                </div>
                {/* Desktop/Tablet: botones rápidos */}
                <div className="mt-4 hidden sm:grid grid-cols-2 sm:grid-cols-3 gap-2">
                  {BIKE_CATEGORIES.map((option) => {
                    const active = category === option
                    return (
                      <button
                        key={option}
                        type="button"
                        onClick={() => setCategory(option)}
                        className={`rounded-lg border px-3 py-2 text-sm text-left transition ${active ? 'border-mb-primary bg-mb-primary/10 font-semibold' : 'border-black/10 hover:border-black/20'}`}
                      >
                        {option}
                      </button>
                    )
                  })}
                </div>
              </>
            )}
          </section>

          <section className={(!isAccessory && !isApparel && !category) ? 'opacity-50 pointer-events-none select-none space-y-4' : 'space-y-4'}>
            <h2 className="text-lg font-semibold text-mb-ink">
              {isAccessory ? '2. Detalles del producto' : isApparel ? '2. Detalles de la indumentaria' : '2. Detalles de la bici'}
            </h2>
            {!isAccessory && !isApparel && !category && (
              <p className="text-sm text-black/50">Seleccioná una categoría para continuar.</p>
            )}

            {isAccessory || isApparel ? (
              <div className="grid sm:grid-cols-2 gap-4">
                <Field label="Marca">
                  <input className="input" value={brand} onChange={(e) => setBrand(e.target.value)} placeholder={isAccessory ? 'Ej.: Garmin' : 'Ej.: Rapha'} />
                </Field>
                <Field label="Producto / Modelo">
                  <input className="input" value={model} onChange={(e) => setModel(e.target.value)} placeholder={isAccessory ? 'Ej.: Edge 540' : 'Ej.: Jersey Pro Team'} />
                </Field>
              </div>
            ) : (
              <div className="grid sm:grid-cols-3 gap-4">
                <Field label="Marca">
                  <input className="input" value={brand} onChange={(e) => setBrand(e.target.value)} placeholder="Ej.: Specialized" />
                </Field>
                <Field label="Modelo">
                  <input className="input" value={model} onChange={(e) => setModel(e.target.value)} placeholder="Ej.: Tarmac SL7" />
                </Field>
                <Field label="Año (opcional)">
                  <input className="input" type="number" value={year} onChange={(e) => setYear(e.target.value)} placeholder="2023" />
                </Field>
              </div>
            )}

            {isAccessory && (
              <>
                <Field label="Uso recomendado">
                  <select
                    className="select"
                    value={accessoryDiscipline}
                    onChange={(e) => setAccessoryDiscipline(e.target.value as (typeof ACCESSORY_DISCIPLINES)[number])}
                  >
                    {ACCESSORY_DISCIPLINES.map((option) => (
                      <option key={option} value={option}>
                        {option}
                      </option>
                    ))}
                  </select>
                </Field>
                <Field label="Compatibilidad o notas de uso (opcional)">
                  <input
                    className="input"
                    value={accessoryUseNote}
                    onChange={(e) => setAccessoryUseNote(e.target.value)}
                    placeholder="Ej.: Para grupos SRAM AXS, incluye sensores, etc."
                  />
                </Field>
                <Field label="Notas adicionales (opcional)">
                  <textarea
                    className="textarea"
                    value={extras}
                    onChange={(e) => setExtras(e.target.value)}
                    placeholder="Incluí más detalles sobre estado, garantía, accesorios incluidos..."
                  />
                </Field>
              </>
            )}

            {isApparel && (
              <>
                <div className="grid sm:grid-cols-2 gap-4">
                  <Field label="Talle">
                    <select
                      className="select"
                      value={apparelSize}
                      onChange={(e) => setApparelSize(e.target.value)}
                    >
                      {apparelSizeOptions.map((option) => (
                        <option key={option} value={option}>
                          {option}
                        </option>
                      ))}
                    </select>
                  </Field>
                  <Field label="Más de un talle">
                    <input
                      className="input"
                      value={apparelSizesMulti}
                      onChange={(e) => setApparelSizesMulti(e.target.value)}
                      placeholder="Ej.: S, M, XL"
                    />
                    <p className="text-xs text-black/50 mt-1">Separá talles con coma. Ej.: S, M, XL</p>
                  </Field>
                  <Field label="Notas adicionales (opcional)">
                    <textarea
                      className="textarea"
                      value={extras}
                      onChange={(e) => setExtras(e.target.value)}
                      placeholder="Ej.: Incluye etiquetas, usado 3 veces, color azul."
                    />
                  </Field>
                </div>
              </>
            )}

            {!isAccessory && !isApparel && (
              <>
                <div className="grid sm:grid-cols-2 gap-4">
                  <Field label="Material del cuadro">
                    <select className="select" value={material} onChange={(e) => setMaterial(e.target.value)}>
                      {MATERIAL_OPTIONS.map((option) => (
                        <option key={option} value={option}>{option}</option>
                      ))}
                    </select>
                  </Field>
                  {material === 'Otro' && (
                    <Field label="Detalle del material">
                      <input className="input" value={customMaterial} onChange={(e) => setCustomMaterial(e.target.value)} placeholder="Describí el material" />
                    </Field>
                  )}
                </div>

                <div className="grid sm:grid-cols-2 gap-4">
                  <Field label="Talle (opcional)">
                    <select className="select" value={frameSize} onChange={(e) => setFrameSize(e.target.value)}>
                      {FRAME_SIZES.map((size) => (
                        <option key={size || 'none'} value={size}>{size ? size : 'Seleccionar talle'}</option>
                      ))}
                    </select>
                  </Field>
                  <Field label="Rodado">
                    <select className="select" value={wheelSize} onChange={(e) => setWheelSize(e.target.value)}>
                      {WHEEL_SIZE_OPTIONS.map((size) => (
                        <option key={size || 'rodado-none'} value={size}>{size ? size : 'Seleccionar rodado'}</option>
                      ))}
                    </select>
                  </Field>
                </div>

                <div className="grid sm:grid-cols-2 gap-4">
                  <Field label="Más de un talle">
                    <input
                      className="input"
                      value={frameSizesMulti}
                      onChange={(e) => setFrameSizesMulti(e.target.value)}
                      placeholder="Ej.: S, M, L"
                    />
                    <p className="text-xs text-black/50 mt-1">Separá talles con coma. Ej.: S, M, L</p>
                  </Field>
                </div>

                <div className="grid sm:grid-cols-2 gap-4">
                  <Field label="Grupo de transmisión">
                    <select className="select" value={drivetrain} onChange={(e) => setDrivetrain(e.target.value)}>
                      {DRIVETRAIN_OPTIONS.map((option) => (
                        <option key={option} value={option}>{option === 'Otro' ? 'Otro…' : option}</option>
                      ))}
                    </select>
                  </Field>
                  {drivetrain === 'Otro' && (
                    <Field label="Especificá el grupo">
                      <input className="input" value={drivetrainOther} onChange={(e) => setDrivetrainOther(e.target.value)} placeholder="Detalle del grupo" />
                    </Field>
                  )}
                </div>

                <Field label="Ruedas">
                  <input className="input" value={wheelset} onChange={(e) => setWheelset(e.target.value)} placeholder="Modelo de las ruedas" />
                  <p className="text-xs text-black/50 mt-1">Si las ruedas son las originales, indicá “Originales”.</p>
                </Field>

                <div className="grid sm:grid-cols-2 gap-4">
                  <Field label="Tipo de freno">
                    <select className="select" value={brakeType} onChange={(e) => setBrakeType(e.target.value as any)}>
                      <option value="">Seleccionar…</option>
                      <option value="Disco hidráulico">Disco hidráulico</option>
                      <option value="Disco mecánico">Disco mecánico</option>
                      <option value="Herradura">Herradura</option>
                    </select>
                  </Field>
                  <Field label="Condición general">
                    <select className="select" value={bikeCondition} onChange={(e) => setBikeCondition(e.target.value as any)}>
                      {CONDITION_OPTIONS.map((opt) => (
                        <option key={opt} value={opt}>{opt}</option>
                      ))}
                    </select>
                  </Field>
                </div>

                {category === 'MTB' && (
                  <Field label="Horquilla (modelo)">
                    <input className="input" value={mtbForkModel} onChange={(e) => setMtbForkModel(e.target.value)} placeholder="Ej.: RockShox SID 120mm" />
                  </Field>
                )}
                {category === 'Fixie' && (
                  <Field label="Relación plato/piñón">
                    <input className="input" value={fixieRatio} onChange={(e) => setFixieRatio(e.target.value)} placeholder="Ej.: 49:16" />
                  </Field>
                )}
                {category === 'E-Bike' && (
                  <div className="grid sm:grid-cols-2 gap-4">
                    <Field label="Motor (marca/modelo)">
                      <input className="input" value={ebikeMotor} onChange={(e) => setEbikeMotor(e.target.value)} placeholder="Ej.: Bosch Performance CX" />
                    </Field>
                    <Field label="Tipo de carga / batería">
                      <input className="input" value={ebikeCharge} onChange={(e) => setEbikeCharge(e.target.value)} placeholder="Ej.: 500Wh, carga rápida" />
                    </Field>
                  </div>
                )}

                <button type="button" className="btn btn-ghost" onClick={() => setMoreOpen((v) => !v)}>
                  {moreOpen ? 'Ocultar información adicional' : 'Agregar más información'}
                </button>
                {moreOpen && (
                  <div className="grid sm:grid-cols-2 gap-4">
                    <Field label="Asiento (modelo)">
                      <input className="input" value={seatInfo} onChange={(e) => setSeatInfo(e.target.value)} placeholder="Ej.: Prologo Scratch M5" />
                    </Field>
                    <Field label="Manillar (modelo)">
                      <input className="input" value={handlebarInfo} onChange={(e) => setHandlebarInfo(e.target.value)} placeholder="Ej.: Zipp Service Course" />
                    </Field>
                    <Field label="Pedales (modelo)">
                      <input className="input" value={pedalsInfo} onChange={(e) => setPedalsInfo(e.target.value)} placeholder="Ej.: Shimano PD-R7000" />
                    </Field>
                    <Field label="Cadena (modelo)">
                      <input className="input" value={chainInfo} onChange={(e) => setChainInfo(e.target.value)} placeholder="Ej.: KMC X11" />
                    </Field>
                    <Field label="Horquilla (upgrade)">
                      <input className="input" value={forkInfo} onChange={(e) => setForkInfo(e.target.value)} placeholder="Ej.: Fox 34 Performance" />
                    </Field>
                  </div>
                )}

                <Field label="Agregados extras (opcional)">
                  <textarea className="textarea" value={extras} onChange={(e) => setExtras(e.target.value)} placeholder="Cambios, upgrades, mantenimiento, accesorios incluidos..." />
                  <p className="text-xs text-black/50 mt-1">No publiques teléfonos ni WhatsApp. Para contacto usá el campo de WhatsApp o Email.</p>
                </Field>
              </>
            )}

            {/* Precio, Provincia y Ciudad se muestran al final */}
            {whatsappEnabled && null}

            {(!isAccessory && !isApparel) && null}

            <Field label="Descripción">
              <textarea
                className="textarea"
                value={description}
                onChange={(e) => setDescription(e.target.value)}
                placeholder={
                  isAccessory
                    ? 'Detalle estado, uso, medidas, compatibilidad…'
                    : isApparel
                      ? 'Contá cuándo se usó, cuidados, temporadas, detalles de fit.'
                      : 'Contá el estado, mantenimiento y cualquier detalle relevante.'
                }
              />
              <p className="text-xs text-black/50 mt-1">
                {isAccessory
                  ? 'Si la dejás vacía: “Sin descripción adicional”.'
                  : isApparel
                    ? 'Si la dejás vacía: “Sin descripción adicional”.'
                    : 'Si la dejás vacía: “No declara descripción específica”.'}
              </p>
              <p className="text-xs text-red-600/80 mt-1">Por seguridad no publiques teléfonos ni WhatsApp en este campo.</p>
            </Field>
            
            
          </section>

          <section className="space-y-3">
            <h2 className="text-lg font-semibold text-mb-ink">3. Fotos</h2>
            <p className="text-sm text-black/60">Subí fotos nítidas y bien iluminadas. Máximo {maxPhotos} fotos para este plan.</p>
            <input
              type="file"
              accept="image/*"
              multiple
              disabled={!photosEnabled}
              onChange={(e) => handleFiles(e.target.files)}
              className={!photosEnabled ? 'opacity-50 cursor-not-allowed' : ''}
            />
            <p className="text-xs text-black/50">
              Recomendamos subir imágenes JPG o PNG. Convertimos automáticamente fotos HEIC/HEIF a JPG para asegurar compatibilidad en las previsualizaciones (WhatsApp/Facebook).
              Arrastrá para reordenar; la primera foto es la imagen principal al compartir.
            </p>
            {!photosEnabled && (
              <p className="text-xs text-black/50">
                {isAccessory
                  ? 'Completá tipo, marca, modelo y precio para habilitar las fotos.'
                  : isApparel
                    ? 'Completá tipo, marca, modelo, talle y precio para habilitar las fotos.'
                    : 'Completá categoría, marca, modelo, material y precio para habilitar las fotos.'}
              </p>
            )}
            {uploading && <p className="text-sm mt-1">Subiendo… {progress}%</p>}
            <div className="grid grid-cols-3 gap-2">
              {images.map((src, index) => (
                <div
                  key={index}
                  className={`relative aspect-square overflow-hidden rounded-md border ${dragOverIndex === index ? 'border-mb-primary ring-2 ring-mb-primary/40' : 'border-black/10'}`}
                  draggable
                  onDragStart={(e) => onThumbDragStart(index, e)}
                  onDragOver={(e) => onThumbDragOver(index, e)}
                  onDrop={(e) => onThumbDrop(index, e)}
                  onDragEnd={onThumbDragEnd}
                  aria-grabbed={draggingIndex === index}
                  role="button"
                  title="Arrastrar para reordenar"
                >
                  <img src={src} alt="Foto del producto" className="w-full h-full object-cover" />
                  {index === 0 ? (
                    <span className="absolute left-1 top-1 rounded-full bg-emerald-600/90 px-2 py-0.5 text-[11px] font-semibold text-white shadow">
                      Principal
                    </span>
                  ) : (
                    <button
                      type="button"
                      onClick={() => makePrimaryAt(index)}
                      className="absolute left-1 top-1 rounded-full bg-white/90 px-2 py-0.5 text-[11px] font-semibold text-[#0c1723] shadow hover:bg-white"
                      aria-label={`Hacer principal la foto ${index + 1}`}
                    >
                      Hacer principal
                    </button>
                  )}
                  <button
                    type="button"
                    onClick={() => removeImageAt(index)}
                    className="absolute right-1 top-1 rounded-full bg-black/70 p-1 text-white transition hover:bg-black focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-white"
                    aria-label={`Eliminar foto ${index + 1}`}
                  >
                    ✕
                  </button>
                </div>
              ))}
            </div>
          </section>

          {/* Precio y ubicación al final */}
          <section className="space-y-4">
            <h2 className="text-lg font-semibold text-mb-ink">4. Precio y ubicación</h2>
            <div className="grid sm:grid-cols-2 gap-4">
              <div className="sm:col-span-2">
                <Field label="Precio">
                  <div className="grid grid-cols-[auto,1fr] items-center gap-2 w-full">
                    <select className="select min-w-[5.5rem]" value={priceCurrency} onChange={(e) => setPriceCurrency(e.target.value as 'USD'|'ARS')}>
                      <option value="USD">USD</option>
                      <option value="ARS">ARS</option>
                    </select>
                    <input
                      className="input w-full max-w-none text-right"
                      type="number" min={0} value={priceInput} onChange={(e) => setPriceInput(e.target.value)} placeholder="0"
                    />
                  </div>
                </Field>
              </div>
            </div>
            <div className="grid sm:grid-cols-2 gap-4">
              <Field label="Provincia">
                <select className="select" value={province} onChange={(e) => setProvince(e.target.value)}>
                  <option value="">Seleccionar provincia</option>
                  {PROVINCES.map((prov) => (<option key={prov.name} value={prov.name}>{prov.name}</option>))}
                </select>
              </Field>
              <Field label="Ciudad">
                <select className="select" value={city} onChange={(e) => setCity(e.target.value)} disabled={!province}>
                  <option value="">{province ? 'Seleccioná ciudad' : 'Elegí una provincia primero'}</option>
                  {PROVINCES.find((p) => p.name === province)?.cities.map((c) => (<option key={c} value={c}>{c}</option>))}
                  <option value={OTHER_CITY_OPTION}>{OTHER_CITY_OPTION}</option>
                </select>
              </Field>
            </div>
            {city === OTHER_CITY_OPTION && (
              <Field label="Ciudad (especificar)">
                <input className="input" value={cityOther} onChange={(e) => setCityOther(e.target.value)} placeholder="Ingresá el nombre de la ciudad" />
              </Field>
            )}
            {whatsappEnabled && (
              <Field label="WhatsApp de contacto">
                <div className="flex items-stretch gap-2">
                  <select
                    className="select basis-1/4 sm:w-[8.5rem]"
                    value={whatsappDial}
                    onChange={(e) => { setWhatsappDial(e.target.value); /* no marca como editado */ }}
                  >
                    {COUNTRY_CODES.map((c) => (
                      <option key={c.cc} value={c.dial}>{`${c.flag} +${c.dial}`}</option>
                    ))}
                  </select>
                  <input
                    className="input basis-3/4 sm:flex-1 min-w-[16ch]"
                    inputMode="numeric"
                    pattern="[0-9]*"
                    value={sellerWhatsappLocal}
                    onChange={(e) => { setSellerWhatsappLocal(sanitizeLocalWhatsappInput(e.target.value)); setWhatsappUserEdited(true) }}
                    placeholder="11 1234 5678"
                  />
                </div>
                <p className="mt-1 text-xs text-black/50">Elegí el prefijo de país y escribí tu número sin el signo + ni ceros iniciales.</p>
              </Field>
            )}
          </section>

          <Button onClick={submit} className="w-full" disabled={submitting}>
            {submitting ? 'Publicando…' : 'Publicar'}
          </Button>
        </div>

        <aside className="card w-full max-w-full min-w-0 overflow-hidden p-6 space-y-5 md:sticky md:top-6 h-fit text-[#14212e]">
          <h2 className="text-lg font-semibold text-mb-ink">Ficha técnica</h2>
          <div className="rounded-lg border border-black/10 overflow-hidden">
            {images[0] ? (
              <img src={images[0]} alt="Vista previa" className="w-full h-48 object-cover" />
            ) : (
              <div className="w-full h-48 bg-black/5 grid place-content-center text-sm text-black/50">
                Agregá fotos para ver la previa
              </div>
            )}
          </div>
          <div>
            <h3 className="text-xl font-bold text-mb-ink">{autoTitle}</h3>
            <p className="text-[#14212e] text-lg font-semibold">{formattedPreviewPrice()}</p>
            <p className="text-sm text-black/60 mt-1">{previewLocation}</p>
          </div>

          <dl className="space-y-2 text-sm text-black/70">
            <div className="flex justify-between gap-4">
              <dt className="font-medium text-black/80">Categoría</dt>
              <dd>{category ?? '—'}</dd>
            </div>
            <div className="flex justify-between gap-4">
              <dt className="font-medium text-black/80">Marca / Modelo</dt>
              <dd className="text-right">{[brand || '—', model || '—'].filter(Boolean).join(' • ')}</dd>
            </div>
            {isAccessory ? (
              <>
                <div className="flex justify-between gap-4">
                  <dt className="font-medium text-black/80">Tipo</dt>
                  <dd>{accessoryType}</dd>
                </div>
                <div className="flex justify-between gap-4">
                  <dt className="font-medium text-black/80">Condición</dt>
                  <dd>{accessoryCondition}</dd>
                </div>
                <div className="flex justify-between gap-4">
                  <dt className="font-medium text-black/80">Uso</dt>
                  <dd>{accessoryDiscipline}</dd>
                </div>
              </>
            ) : isApparel ? (
              <>
                <div className="flex justify-between gap-4">
                  <dt className="font-medium text-black/80">Tipo</dt>
                  <dd>{apparelType}</dd>
                </div>
                <div className="flex justify-between gap-4">
                  <dt className="font-medium text-black/80">{apparelSizesMulti.trim() ? 'Talles' : 'Talle'}</dt>
                  <dd>{apparelSizesMulti.trim() ? apparelSizesMulti.trim() : apparelSize}</dd>
                </div>
                <div className="flex justify-between gap-4">
                  <dt className="font-medium text-black/80">Condición</dt>
                  <dd>{apparelCondition}</dd>
                </div>
                <div className="flex justify-between gap-4">
                  <dt className="font-medium text-black/80">Género</dt>
                  <dd>{apparelFit}</dd>
                </div>
              </>
            ) : (
              <>
                {/* Orden: Material + Horquilla + Talle */}
                {materialValue && (
                  <div className="flex justify-between gap-4">
                    <dt className="font-medium text-black/80">Material</dt>
                    <dd>{materialValue}</dd>
                  </div>
                )}
                {category === 'MTB' && mtbForkModel && (
                  <div className="flex justify-between gap-4">
                    <dt className="font-medium text-black/80">Horquilla</dt>
                    <dd className="text-right">{mtbForkModel}</dd>
                  </div>
                )}
                {(frameSize || frameSizesMulti.trim()) && (
                  <div className="flex justify-between gap-4">
                    <dt className="font-medium text-black/80">{frameSizesMulti.trim() ? 'Talles' : 'Talle'}</dt>
                    <dd>{frameSizesMulti.trim() ? frameSizesMulti.trim() : frameSize}</dd>
                  </div>
                )}
                {/* Ruedas + Rodado */}
                {wheelset && (
                  <div className="flex justify-between gap-4">
                    <dt className="font-medium text-black/80">Ruedas</dt>
                    <dd className="text-right">{wheelset}</dd>
                  </div>
                )}
                {wheelSize && (
                  <div className="flex justify-between gap-4">
                    <dt className="font-medium text-black/80">Rodado</dt>
                    <dd>{wheelSize}</dd>
                  </div>
                )}
                {/* Grupo */}
                {drivetrainValue && (
                  <div className="flex justify-between gap-4">
                    <dt className="font-medium text-black/80">Grupo</dt>
                    <dd>{drivetrainValue}</dd>
                  </div>
                )}
                {/* Freno y Condición */}
                {brakeType && (
                  <div className="flex justify-between gap-4">
                    <dt className="font-medium text-black/80">Freno</dt>
                    <dd className="text-right">{brakeType}</dd>
                  </div>
                )}
                {bikeCondition && (
                  <div className="flex justify-between gap-4">
                    <dt className="font-medium text-black/80">Condición</dt>
                    <dd className="text-right">{bikeCondition}</dd>
                  </div>
                )}
                {/* Opcionales por categoría */}
                {category === 'Fixie' && fixieRatio && (
                  <div className="flex justify-between gap-4">
                    <dt className="font-medium text-black/80">Relación</dt>
                    <dd className="text-right">{fixieRatio}</dd>
                  </div>
                )}
                {category === 'E-Bike' && (ebikeMotor || ebikeCharge) && (
                  <>
                    {ebikeMotor && (
                      <div className="flex justify-between gap-4">
                        <dt className="font-medium text-black/80">Motor</dt>
                        <dd className="text-right">{ebikeMotor}</dd>
                      </div>
                    )}
                    {ebikeCharge && (
                      <div className="flex justify-between gap-4">
                        <dt className="font-medium text-black/80">Batería / Carga</dt>
                        <dd className="text-right">{ebikeCharge}</dd>
                      </div>
                    )}
                  </>
                )}
              </>
            )}
          </dl>

          <div>
            <h3 className="text-sm font-semibold text-black/70">Extras</h3>
            <p className="text-sm text-black/60 mt-1 whitespace-pre-line">
              {extras.trim() ||
                (isAccessory
                  ? 'Sin notas adicionales'
                  : isApparel
                    ? 'Sin notas adicionales'
                    : 'No tiene agregados extras, se encuentra original')}
            </p>
          </div>

          <div>
            <h3 className="text-sm font-semibold text-black/70">Descripción</h3>
            <p className="text-sm text-black/60 mt-1 whitespace-pre-line">
              {description.trim() || (isAccessory ? 'Sin descripción adicional' : 'No declara descripción específica')}
            </p>
          </div>
        </aside>
      </div>
    </Container>
    </div>
  )
}
