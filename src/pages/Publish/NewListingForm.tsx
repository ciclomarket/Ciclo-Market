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
import { supabase, supabaseEnabled, getSupabaseClient } from '../../services/supabase'
import { usePlans } from '../../context/PlanContext'
import { canonicalPlanCode, normalisePlanText, resolvePlanCode, type PlanCode } from '../../utils/planCodes'
import { formatNameWithInitial } from '../../utils/user'
import { normaliseWhatsapp, extractLocalWhatsapp, sanitizeLocalWhatsappInput } from '../../utils/whatsapp'
import { fetchListing } from '../../services/listings'
import { fetchUserProfile, type UserProfileRecord } from '../../services/users'
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
  const [searchParams] = useSearchParams()
  const navigate = useNavigate()
  const { fx } = useCurrency()
  const { uploadFiles, uploading, progress } = useUpload()
  const { user, enabled } = useAuth()
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

  /** 1) Plan seleccionado por query (?plan=free|basic|premium) */
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

    const explicitMatch = plans.find((plan) => {
      const code = resolvePlanCode(plan)
      if (code && code === param) return true
      if (plan.code && normalisePlanText(plan.code) === param) return true
      if (plan.id && normalisePlanText(plan.id) === param) return true
      return false
    })

    return explicitMatch ?? plans[0]
  }, [plans, planOverride, searchParams])

  // Canonizamos el código de plan (lo usa la DB y el backend)
  const resolvedPlanCode = selectedPlan ? resolvePlanCode(selectedPlan) : null
  const planCode = (planOverride ?? resolvedPlanCode)
    ?? (selectedPlan?.code ? normalisePlanText(selectedPlan.code) : undefined)
    ?? (selectedPlan?.id ? normalisePlanText(selectedPlan.id) : undefined)
  const planPrice = selectedPlan?.price ?? 0
  const maxPhotos = selectedPlan?.maxPhotos ?? 4
  const planName = selectedPlan?.name ?? 'Plan'
  const listingDuration = selectedPlan?.listingDurationDays ?? selectedPlan?.periodDays ?? 30
  const whatsappEnabled = true

  const listingExpiresLabel = useMemo(() => {
    if (editingListing?.expiresAt) {
      return new Intl.DateTimeFormat('es-AR', { dateStyle: 'long' }).format(new Date(editingListing.expiresAt))
    }
    const base = new Date()
    base.setDate(base.getDate() + listingDuration)
    return new Intl.DateTimeFormat('es-AR', { dateStyle: 'long' }).format(base)
  }, [editingListing?.expiresAt, listingDuration])

  const expiresAtIso = useMemo(() => {
    if (editingListing?.expiresAt) {
      return new Date(editingListing.expiresAt).toISOString()
    }
    const base = new Date()
    base.setDate(base.getDate() + listingDuration)
    return base.toISOString()
  }, [editingListing?.expiresAt, listingDuration])

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

  const [category, setCategory] = useState<Category | null>(isAccessory ? 'Accesorios' : isApparel ? 'Indumentaria' : null)
  const [brand, setBrand] = useState('')
  const [model, setModel] = useState('')
  const [material, setMaterial] = useState(MATERIAL_OPTIONS[0])
  const [customMaterial, setCustomMaterial] = useState('')
  const [frameSize, setFrameSize] = useState('')
  const [drivetrain, setDrivetrain] = useState(DRIVETRAIN_OPTIONS[0])
  const [drivetrainOther, setDrivetrainOther] = useState('')
  const [wheelset, setWheelset] = useState('')
  const [wheelSize, setWheelSize] = useState('')
  const [extras, setExtras] = useState('')
  const [priceCurrency, setPriceCurrency] = useState<'USD'|'ARS'>('USD')
  const [priceInput, setPriceInput] = useState('')
  const [year, setYear] = useState('')
  const [province, setProvince] = useState<string>('')
  const [city, setCity] = useState<string>('')
  const [cityOther, setCityOther] = useState<string>('')
  const [description, setDescription] = useState('')
  const [images, setImages] = useState<string[]>([])
  const [sellerWhatsappLocal, setSellerWhatsappLocal] = useState('')
  const [profile, setProfile] = useState<UserProfileRecord | null>(null)
  const [draftRestored, setDraftRestored] = useState(false)
  const [accessoryType, setAccessoryType] = useState<(typeof ACCESSORY_TYPES)[number]>(ACCESSORY_TYPES[0])
  const [accessoryCondition, setAccessoryCondition] = useState<(typeof CONDITION_OPTIONS)[number]>(CONDITION_OPTIONS[1])
  const [accessoryDiscipline, setAccessoryDiscipline] = useState<(typeof ACCESSORY_DISCIPLINES)[number]>('Universal')
  const [accessoryUseNote, setAccessoryUseNote] = useState('')
  const [apparelType, setApparelType] = useState<(typeof APPAREL_TYPES)[number]>(APPAREL_TYPES[0])
  const [apparelSize, setApparelSize] = useState<string>(APPAREL_SIZES[3])
  const [apparelFit, setApparelFit] = useState<(typeof APPAREL_FIT_OPTIONS)[number]>(APPAREL_FIT_OPTIONS[0])
  const [apparelCondition, setApparelCondition] = useState<(typeof CONDITION_OPTIONS)[number]>(CONDITION_OPTIONS[1])

  const isEditing = Boolean(editingListing)

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
      if (whatsappEnabled && !sellerWhatsappLocal && data?.whatsapp_number) {
        const localValue = sanitizeLocalWhatsappInput(extractLocalWhatsapp(data.whatsapp_number))
        if (localValue) setSellerWhatsappLocal(localValue)
      }
    }
    void loadProfile()
    return () => {
      active = false
    }
  }, [user?.id, whatsappEnabled, sellerWhatsappLocal])

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
        if (user && existing.sellerId !== user.id) {
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
    const metaWhatsapp = (user?.user_metadata?.whatsapp as string | undefined) ?? (user?.user_metadata?.phone as string | undefined) ?? ''
    const profileWhatsapp = profile?.whatsapp_number ?? ''
    const defaultWhatsapp = profileWhatsapp || metaWhatsapp
    if (defaultWhatsapp) {
      const localValue = sanitizeLocalWhatsappInput(extractLocalWhatsapp(defaultWhatsapp) || defaultWhatsapp)
      if (localValue) setSellerWhatsappLocal(localValue)
    }
  }, [listingId, whatsappEnabled, profile?.whatsapp_number, sellerWhatsappLocal, user?.user_metadata?.phone, user?.user_metadata?.whatsapp])

  useEffect(() => {
    if (!listingId || !whatsappEnabled) return
    if (!profile?.whatsapp_number) return
    if (sellerWhatsappLocal) return
    const localValue = sanitizeLocalWhatsappInput(extractLocalWhatsapp(profile.whatsapp_number))
    if (localValue) setSellerWhatsappLocal(localValue)
  }, [listingId, whatsappEnabled, profile?.whatsapp_number, sellerWhatsappLocal])

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

  /** 3) Submit: inserta listing o actualiza si corresponde */
  const submit = async () => {
    if (!enabled || !supabaseEnabled) return alert('Publicar deshabilitado: configurá Supabase en .env')
    if (!supabase) return alert('Supabase no configurado correctamente')
    if (!user) return alert('Iniciá sesión para crear una publicación')
    if (!planCode) return alert('No se detectó el plan seleccionado')

    const finalCategory = (isAccessory ? 'Accesorios' : isApparel ? 'Indumentaria' : category) as Category | null

    // Validaciones base
    if (!finalCategory) return alert('Seleccioná una categoría')
    if (!brand.trim()) return alert(isAccessory || isApparel ? 'Ingresá la marca del producto' : 'Ingresá la marca de la bicicleta')
    if (!model.trim()) return alert(isAccessory || isApparel ? 'Ingresá el nombre del producto' : 'Ingresá el modelo de la bicicleta')
    if (!isAccessory && !isApparel && !materialValue) return alert('Indicá el material del cuadro')
    if (isApparel && !apparelSize) return alert('Seleccioná un talle para la prenda')
    if (priceNumber <= 0) return alert('Ingresá un precio válido')
    if (!province) return alert('Seleccioná una provincia')
    if (!city) return alert('Seleccioná una ciudad')
    if (city === OTHER_CITY_OPTION && !cityOther.trim()) return alert('Especificá la ciudad')
    if (!images.length) return alert('Subí al menos una foto')
    // (Opcional) límite de publicaciones activas por usuario según plan visible en UI
    const client = getSupabaseClient()

    if (!editingListing && supabaseEnabled && (selectedPlan as any)?.maxListings && (selectedPlan as any).maxListings > 1) {
      const { count } = await client
        .from('listings')
        .select('id', { count: 'exact', head: true })
        .eq('seller_id', user.id)
        .neq('status', 'expired')
      if (typeof count === 'number' && count >= (selectedPlan as any).maxListings) {
        alert(`Tu plan ${selectedPlan?.name} permite hasta ${(selectedPlan as any).maxListings} publicaciones activas.`)
        return
      }
    }

    // Guardamos el precio tal cual lo ingresó el usuario según la moneda seleccionada
    const priceForStorage = priceNumber
    const location = finalCity ? `${finalCity}, ${province}` : province

    const expiresAtDate = new Date()
    expiresAtDate.setDate(expiresAtDate.getDate() + listingDuration)
    const expiresAtIso = expiresAtDate.toISOString()

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
    const safeDescription = (() => {
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
        const parts = [`Tipo: ${apparelType}`, `Talle: ${apparelSize}`, `Condición: ${apparelCondition}`, `Fit: ${apparelFit}`]
        if (extras.trim()) parts.push(`Notas: ${extras.trim()}`)
        return parts.join(' • ')
      }
      const base = extras.trim()
      if (base) return base
      return 'No tiene agregados extras, se encuentra original'
    })()

    const candidateSources: Array<string | null> = [
      sellerWhatsappLocal,
      profileWhatsapp,
      metadataWhatsapp,
      metadataPhone,
      editingListing?.sellerWhatsapp ?? null
    ]
    let formattedWhatsapp: string | null = null
    if (whatsappEnabled) {
      for (const source of candidateSources) {
        if (!source) continue
        const normalized = normaliseWhatsapp(source)
        if (normalized) {
          formattedWhatsapp = normalized
          break
        }
      }
    } else {
      formattedWhatsapp = editingListing?.sellerWhatsapp ?? null
    }

    const payload = {
      title: autoTitle,
      brand: brand.trim(),
      model: model.trim(),
      year: (isAccessory || isApparel) ? undefined : year ? Number(year) : undefined,
      category: finalCategory,
      price: priceForStorage,
      price_currency: priceCurrency,
      location,
      description: safeDescription,
      images,
      seller_name: sellerName,
      seller_location: sellerLocation,
      seller_whatsapp: formattedWhatsapp,
      seller_email: user.email,
      seller_plan: planCode,
      material: (isAccessory || isApparel) ? undefined : (materialValue || undefined),
      frame_size: (isAccessory || isApparel) ? undefined : (frameSize || undefined),
      drivetrain: (isAccessory || isApparel) ? undefined : (drivetrain === 'Otro' ? undefined : drivetrain),
      drivetrain_detail: (isAccessory || isApparel) ? undefined : (drivetrain === 'Otro' ? (drivetrainOther.trim() || undefined) : undefined),
      wheelset: (isAccessory || isApparel) ? undefined : (wheelset.trim() || undefined),
      wheel_size: (isAccessory || isApparel) ? undefined : (wheelSize || undefined),
      extras: safeExtras,
      plan_code: planCode,
      plan: planCode,
      status: 'active',
      expires_at: expiresAtIso,
      renewal_notified_at: null
    }

    if (editingListing) {
      const { data: updated, error: updateError } = await client
        .from('listings')
        .update(payload)
        .eq('id', editingListing.id)
        .select()
        .single()

      if (updateError || !updated) {
        console.error('Error update listing:', updateError)
        alert('No pudimos actualizar la publicación. Intentá nuevamente.')
        return
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
      console.error('Error insert listing:', insertErr)
      alert('No pudimos crear la publicación. Verificá Supabase y volvé a intentar.')
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

    // Ya pagaste tu plan (si correspondía). Redirigimos al detalle del aviso.
    clearDraft()
    showToast(isEditing ? 'Publicación actualizada con éxito' : 'Publicación creada con éxito')
    navigate(`/listing/${inserted.slug ?? inserted.id}`)
  }

  const formattedPreviewPrice = () => {
    if (!priceNumber) return '—'
    const locale = priceCurrency === 'ARS' ? 'es-AR' : 'en-US'
    const code = priceCurrency
    const formatted = new Intl.NumberFormat(locale, { style: 'currency', currency: code, maximumFractionDigits: 0 }).format(priceNumber)
    return `${formatted} ${code}`
  }

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
          <div className="font-semibold text-white">{isEditing ? `Plan en uso: ${planName}` : `Plan seleccionado: ${planName}`}</div>
          <div className="text-xs font-semibold text-white/90">
            {isEditing ? 'Podés cambiar de plan desde tu panel de vendedor.' : (planPriceLabel ?? 'Sin costo')}
          </div>
          {selectedPlan?.description && (
            <div className="mt-2 text-xs text-white/80">{selectedPlan.description}</div>
          )}
          <div className="mt-2 space-y-1 text-xs text-white/70">
            <div>Duración de la publicación: {listingDuration} días</div>
            <div>Expira aprox.: {listingExpiresLabel}</div>
            <div>Fotos permitidas: {maxPhotos}</div>
            <div>
              {selectedPlan?.featuredDays
                ? `Destacada ${selectedPlan.featuredDays} ${selectedPlan.featuredDays === 1 ? 'día' : 'días'} en portada`
                : 'Sin destaque en portada'}
            </div>
            <div>Botón de WhatsApp habilitado en todos los planes</div>
            {selectedPlan?.socialBoost && <div>Difusión en Instagram y Facebook</div>}
          </div>
        </div>
      </div>

      <div className="grid w-full gap-6 md:grid-cols-2">
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
                  <Field label="Ajuste / Fit">
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
              <div className="mt-4 grid grid-cols-2 sm:grid-cols-3 gap-2">
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
            )}
          </section>

          <section className={(!isAccessory && !isApparel && !category) ? 'opacity-50 pointer-events-none select-none space-y-4' : 'space-y-4'}>
            <h2 className="text-lg font-semibold text-mb-ink">
              {isAccessory ? '2. Detalles del producto' : isApparel ? '2. Detalles de la indumentaria' : '2. Detalles de la bici'}
            </h2>
            {!isAccessory && !isApparel && !category && (
              <p className="text-sm text-black/50">Seleccioná una categoría para continuar.</p>
            )}

            <div className="grid sm:grid-cols-2 gap-4">
              <Field label="Marca">
                <input
                  className="input"
                  value={brand}
                  onChange={(e) => setBrand(e.target.value)}
                  placeholder={
                    isAccessory ? 'Ej.: Garmin' : isApparel ? 'Ej.: Rapha' : 'Ej.: Specialized'
                  }
                />
              </Field>
              <Field label={isAccessory || isApparel ? 'Producto / Modelo' : 'Modelo'}>
                <input
                  className="input"
                  value={model}
                  onChange={(e) => setModel(e.target.value)}
                  placeholder={
                    isAccessory ? 'Ej.: Edge 540' : isApparel ? 'Ej.: Jersey Pro Team' : 'Ej.: Tarmac SL7'
                  }
                />
              </Field>
            </div>

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

                <Field label="Agregados extras (opcional)">
                  <textarea className="textarea" value={extras} onChange={(e) => setExtras(e.target.value)} placeholder="Cambios, upgrades, mantenimiento, accesorios incluidos..." />
                </Field>
              </>
            )}

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
                <div className="flex items-stretch">
                  <span className="inline-flex items-center rounded-l-lg border border-black/10 border-r-0 bg-black/5 px-3 text-sm text-black/70">
                    +54
                  </span>
                  <input
                    className="input rounded-l-none"
                    inputMode="numeric"
                    pattern="[0-9]*"
                    value={sellerWhatsappLocal}
                    onChange={(e) => setSellerWhatsappLocal(sanitizeLocalWhatsappInput(e.target.value))}
                    placeholder="91122334455"
                  />
                </div>
                <p className="mt-1 text-xs text-black/50">Ingresá tu número local sin el +54. Lo agregamos automáticamente en la publicación.</p>
              </Field>
            )}

            {(!isAccessory && !isApparel) && (
              <div className="grid sm:grid-cols-2 gap-4">
                <Field label="Año (opcional)">
                  <input className="input" type="number" value={year} onChange={(e) => setYear(e.target.value)} placeholder="2023" />
                </Field>
              </div>
            )}

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
                <div key={index} className="relative aspect-square overflow-hidden rounded-md border border-black/10">
                  <img src={src} alt="Foto del producto" className="w-full h-full object-cover" />
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

          <Button onClick={submit} className="w-full">Publicar</Button>
        </div>

        <aside className="card w-full max-w-full min-w-0 overflow-hidden p-6 space-y-5 md:sticky md:top-6 md:max-w-sm h-fit text-[#14212e]">
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
            <p className="text-mb-primary text-lg font-semibold">{formattedPreviewPrice()}</p>
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
                  <dt className="font-medium text-black/80">Talle</dt>
                  <dd>{apparelSize}</dd>
                </div>
                <div className="flex justify-between gap-4">
                  <dt className="font-medium text-black/80">Condición</dt>
                  <dd>{apparelCondition}</dd>
                </div>
                <div className="flex justify-between gap-4">
                  <dt className="font-medium text-black/80">Fit</dt>
                  <dd>{apparelFit}</dd>
                </div>
              </>
            ) : (
              <>
                <div className="flex justify-between gap-4">
                  <dt className="font-medium text-black/80">Material</dt>
                  <dd>{materialValue || '—'}</dd>
                </div>
                <div className="flex justify-between gap-4">
                  <dt className="font-medium text-black/80">Rodado</dt>
                  <dd>{wheelSize || '—'}</dd>
                </div>
                <div className="flex justify-between gap-4">
                  <dt className="font-medium text-black/80">Talle</dt>
                  <dd>{frameSize || '—'}</dd>
                </div>
                <div className="flex justify-between gap-4">
                  <dt className="font-medium text-black/80">Grupo</dt>
                  <dd>{drivetrainValue || '—'}</dd>
                </div>
                <div className="flex justify-between gap-4">
                  <dt className="font-medium text-black/80">Ruedas</dt>
                  <dd className="text-right">{wheelset || '—'}</dd>
                </div>
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
