import { useState, useMemo, useEffect } from 'react'
import { useNavigate, useSearchParams } from 'react-router-dom'
import Container from '../../components/Container'
import Button from '../../components/Button'
import { BIKE_CATEGORIES, FRAME_SIZES, WHEEL_SIZE_OPTIONS } from '../../constants/catalog'
import { PROVINCES } from '../../constants/locations'
import { useAuth } from '../../context/AuthContext'
import { getSupabaseClient, supabaseEnabled } from '../../services/supabase'
import { fetchUserProfile, upsertUserProfile } from '../../services/users'
import useUpload from '../../hooks/useUpload'

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
const MAIN_CATEGORIES = ['Bicicletas', 'Accesorios', 'Indumentaria', 'Nutrición'] as const
const ACCESSORY_SUBCATS = ['Ruedas', 'Grupos', 'Componentes', 'Computadoras', 'Bikepacking', 'Lubricantes', 'Transporte', 'Otros'] as const
const APPAREL_SUBCATS = ['Casco', 'Jersey', 'Calzas', 'Zapatos', 'Guantes', 'Campera', 'Neoprene', 'Camiseta térmica', 'Otros'] as const
const NUTRITION_SUBCATS = ['Gel', 'Barra', 'Sales', 'Bebida isotónica', 'Proteína', 'Electrolitos', 'Otro'] as const
// Más completo: grupos de transmisión (ruta/mtb) históricos
const DRIVETRAIN_OPTIONS: string[] = [
  // Shimano Road
  'Shimano Claris','Shimano Sora','Shimano Tiagra','Shimano 105','Shimano 105 Di2','Shimano Ultegra','Shimano Ultegra Di2','Shimano Dura‑Ace','Shimano Dura‑Ace Di2',
  // Shimano Gravel
  'Shimano GRX 400','Shimano GRX 600','Shimano GRX 800','Shimano GRX Di2',
  // Shimano MTB
  'Shimano Deore','Shimano Deore XT','Shimano SLX','Shimano XTR','Shimano XT M8100','Shimano XTR M9100',
  // SRAM Road
  'SRAM Apex','SRAM Apex eTap AXS','SRAM Rival','SRAM Rival eTap AXS','SRAM Force','SRAM Force eTap AXS','SRAM Red','SRAM Red eTap AXS',
  // SRAM MTB
  'SRAM SX Eagle','SRAM NX Eagle','SRAM GX Eagle','SRAM X01 Eagle','SRAM XX1 Eagle','SRAM GX Eagle Transmission','SRAM X0 Transmission','SRAM XX Transmission',
  // Campagnolo Road
  'Campagnolo Centaur','Campagnolo Potenza','Campagnolo Chorus','Campagnolo Record','Campagnolo Super Record','Campagnolo Super Record EPS','Campagnolo Ekar',
  'Otro'
]

const StepHeader = ({ step, title, isOpen, isCompleted, onClick }: { step: number; title: string; isOpen: boolean; isCompleted?: boolean; onClick: () => void }) => (
  <button
    type="button"
    onClick={onClick}
    className={`w-full flex items-center justify-between p-5 text-left border-b border-gray-100 transition-all ${isOpen ? 'bg-blue-50/50' : 'bg-white hover:bg-gray-50'}`}
  >
    <div className="flex items-center gap-4">
      <div className={`flex items-center justify-center w-8 h-8 rounded-full text-sm font-bold transition-colors ${isCompleted ? 'bg-green-500 text-white' : 'bg-gray-200 text-gray-600'}`}>
        {isCompleted ? '✓' : step}
      </div>
      <span className={`text-lg font-bold ${isOpen ? 'text-gray-900' : 'text-gray-500'}`}>{title}</span>
    </div>
    <div className={`text-gray-400 transform transition-transform ${isOpen ? 'rotate-180' : ''}`}>▼</div>
  </button>
)

export default function NewListingForm() {
  const [sp] = useSearchParams()
  const navigate = useNavigate()
  const { user } = useAuth()
  const [openStep, setOpenStep] = useState<number>(1)
  // Derive main category from query param: type=bike|accessory|apparel|nutrition
  const mainCategory = useMemo<typeof MAIN_CATEGORIES[number]>(() => {
    const t = (sp.get('type') || '').toLowerCase()
    if (t === 'accessory') return 'Accesorios'
    if (t === 'apparel') return 'Indumentaria'
    if (t === 'nutrition') return 'Nutrición'
    return 'Bicicletas'
  }, [sp])
  const [category, setCategory] = useState('')
  const [brand, setBrand] = useState('')
  const [model, setModel] = useState('')
  const [year, setYear] = useState('')
  const [bikeCondition, setBikeCondition] = useState('')
  // Bike details
  const [material, setMaterial] = useState('')
  const [frameSize, setFrameSize] = useState('')
  const [wheelSize, setWheelSize] = useState('')
  const [drivetrain, setDrivetrain] = useState('')
  const [drivetrainOther, setDrivetrainOther] = useState('')
  const [brakeType, setBrakeType] = useState('')
  // Category-specific details
  const [mtbForkModel, setMtbForkModel] = useState('')
  const [fixieRatio, setFixieRatio] = useState('')
  const [ebikeMotor, setEbikeMotor] = useState('')
  const [ebikeBattery, setEbikeBattery] = useState('')
  // Extras & description
  const [seatInfo, setSeatInfo] = useState('')
  const [handlebarInfo, setHandlebarInfo] = useState('')
  const [pedalsInfo, setPedalsInfo] = useState('')
  const [chainInfo, setChainInfo] = useState('')
  const [forkInfo, setForkInfo] = useState('')
  const [extras, setExtras] = useState('')
  const [description, setDescription] = useState('')
  const [images, setImages] = useState<string[]>([])
  const [priceCurrency, setPriceCurrency] = useState<'USD'|'ARS'>('USD')
  const [priceInput, setPriceInput] = useState('')
  const [province, setProvince] = useState('')
  const [city, setCity] = useState('')
  const [whatsApp, setWhatsApp] = useState('')
  const [waCountry, setWaCountry] = useState('+54')
  const [waLocal, setWaLocal] = useState('')
  const [authModalOpen, setAuthModalOpen] = useState(false)
  const [submitting, setSubmitting] = useState(false)
  const [authEmail, setAuthEmail] = useState('')
  const [authEmailSending, setAuthEmailSending] = useState(false)
  const [authEmailMessage, setAuthEmailMessage] = useState<string | null>(null)
  const [authEmailError, setAuthEmailError] = useState<string | null>(null)
  const sessionDraftKey = 'cm_publish_last'
  const [loadedDraft, setLoadedDraft] = useState(false)
  // Accessorios / Indumentaria / Nutrición extended fields
  const [accType, setAccType] = useState('')
  const [accCompatibility, setAccCompatibility] = useState('')
  const [accWeight, setAccWeight] = useState('')
  const [apparelType, setApparelType] = useState('')
  const [apparelGender, setApparelGender] = useState('')
  const [apparelSize, setApparelSize] = useState('')
  const [apparelColor, setApparelColor] = useState('')
  const [nutriType, setNutriType] = useState('')
  const [nutriCHO, setNutriCHO] = useState('')
  const [nutriSodium, setNutriSodium] = useState('')
  const [nutriServings, setNutriServings] = useState('')
  const [nutriNetWeight, setNutriNetWeight] = useState('')
  const [nutriExpire, setNutriExpire] = useState('')
  // Subcategory selections for non-bike flows
  const [accessorySubcat, setAccessorySubcat] = useState<typeof ACCESSORY_SUBCATS[number] | ''>('')
  const [apparelSubcat, setApparelSubcat] = useState<typeof APPAREL_SUBCATS[number] | ''>('')
  const [nutritionSubcat, setNutritionSubcat] = useState<typeof NUTRITION_SUBCATS[number] | ''>('')
  // Accessory specifics
  const [accUseType, setAccUseType] = useState('') // Ruta, MTB, Urbano, Gravel
  const [groupComplete, setGroupComplete] = useState<'Completo' | 'Partes' | ''>('')
  const [groupMode, setGroupMode] = useState<'Mecánico' | 'Electrónico' | ''>('')
  const [showBikeExtras, setShowBikeExtras] = useState(false)
  const { uploadFiles, uploading, progress } = useUpload()
  const [profileFullName, setProfileFullName] = useState('')
  const [profileEmail, setProfileEmail] = useState('')
  const [profileAvatarUrl, setProfileAvatarUrl] = useState('')

  const handleFiles = async (fl: FileList | null) => {
    if (!fl || fl.length === 0) return
    const files = Array.from(fl)
    const urls = await uploadFiles(files)
    if (!urls.length) return
    setImages(prev => [...prev, ...urls].slice(0, 12))
  }

  // --- Draft persistence helpers ---
  const draftKey = useMemo(() => {
    const t = (sp.get('type') || '').toLowerCase()
    return `cm_publish_draft_${t || 'bike'}`
  }, [sp])

  const persistDraft = useMemo(() => (
    (data: any) => {
      try {
        const payload = JSON.stringify({ ...data, ts: Date.now() })
        window.localStorage.setItem(draftKey, payload)
        window.sessionStorage.setItem(sessionDraftKey, payload)
      } catch {}
    }
  ), [draftKey, sessionDraftKey])

  const loadDraft = useMemo(() => (
    () => {
      try {
        const sessionRaw = window.sessionStorage.getItem(sessionDraftKey)
        if (sessionRaw) {
          return JSON.parse(sessionRaw)
        }
        const raw = window.localStorage.getItem(draftKey)
        if (!raw) return null
        const parsed = JSON.parse(raw)
        return parsed || null
      } catch {
        return null
      }
    }
  ), [draftKey, sessionDraftKey])
  const removeImageAt = (idx: number) => setImages(prev => prev.filter((_, i) => i !== idx))
  const makePrimaryAt = (idx: number) => setImages(prev => {
    if (idx <= 0 || idx >= prev.length) return prev
    const copy = prev.slice()
    const [picked] = copy.splice(idx, 1)
    copy.unshift(picked)
    return copy
  })
  // Prefill province/city/whatsapp from profile when available
  useEffect(() => {
    let active = true
    ;(async () => {
      try {
        // Draft restore (run once)
        if (!loadedDraft) {
          const draft = loadDraft()
          if (draft) {
            setCategory(draft.category || '')
            setBrand(draft.brand || '')
            setModel(draft.model || '')
            setYear(draft.year || '')
            setMaterial(draft.material || '')
            setFrameSize(draft.frameSize || '')
            setWheelSize(draft.wheelSize || '')
            setDrivetrain(draft.drivetrain || '')
            setDrivetrainOther(draft.drivetrainOther || '')
            setBrakeType(draft.brakeType || '')
            setMtbForkModel(draft.mtbForkModel || '')
            setFixieRatio(draft.fixieRatio || '')
            setEbikeMotor(draft.ebikeMotor || '')
            setEbikeBattery(draft.ebikeBattery || '')
            setSeatInfo(draft.seatInfo || '')
            setHandlebarInfo(draft.handlebarInfo || '')
            setPedalsInfo(draft.pedalsInfo || '')
            setChainInfo(draft.chainInfo || '')
            setForkInfo(draft.forkInfo || '')
            setExtras(draft.extras || '')
            setDescription(draft.description || '')
            setImages(Array.isArray(draft.images) ? draft.images : [])
            setPriceCurrency(draft.priceCurrency || 'USD')
            setPriceInput(draft.priceInput || '')
            setProvince(draft.province || '')
            setCity(draft.city || '')
            setWaCountry(draft.waCountry || '+54')
            setWaLocal(draft.waLocal || '')
            setWhatsApp(draft.whatsApp || '')
            setBikeCondition(draft.bikeCondition || '')
            setAccessorySubcat(draft.accessorySubcat || '')
            setApparelSubcat(draft.apparelSubcat || '')
            setNutritionSubcat(draft.nutritionSubcat || '')
            setApparelGender(draft.apparelGender || '')
            setApparelSize(draft.apparelSize || '')
            setApparelColor(draft.apparelColor || '')
            setAccUseType(draft.accUseType || '')
            setGroupComplete(draft.groupComplete || 'Completo')
            setNutriCHO(draft.nutriCHO || '')
            setNutriSodium(draft.nutriSodium || '')
            setNutriServings(draft.nutriServings || '')
            setNutriNetWeight(draft.nutriNetWeight || '')
            setNutriExpire(draft.nutriExpire || '')
          }
          setLoadedDraft(true)
          try { window.sessionStorage.removeItem(sessionDraftKey) } catch {}
        }

        if (!user?.id) return
        const profile = await fetchUserProfile(user.id)
        if (!active) return
        if (profile?.full_name) setProfileFullName(profile.full_name)
        if (profile?.avatar_url) setProfileAvatarUrl(profile.avatar_url)
        if (user?.email) setProfileEmail(user.email)
        if (profile?.province && !province) setProvince(profile.province)
        if (profile?.city && !city) setCity(profile.city)
        if ((profile as any)?.whatsapp_number && !whatsApp) {
          const raw = String((profile as any).whatsapp_number)
          const parsed = parsePhone(raw)
          setWaCountry(`+${parsed.country}`)
          setWaLocal(parsed.local)
          setWhatsApp(`+${parsed.country}${parsed.local}`)
        }
        // read initial subcat from URL
        const preset = (sp.get('subcat') || '').trim()
        if (preset) {
          if (mainCategory === 'Bicicletas') setCategory(preset)
          else if (mainCategory === 'Accesorios') setAccessorySubcat(preset as any)
          else if (mainCategory === 'Indumentaria') setApparelSubcat(preset as any)
          else if (mainCategory === 'Nutrición') setNutritionSubcat(preset as any)
        }
      } catch {}
    })()
    return () => { active = false }
  }, [user?.id, loadedDraft, loadDraft, mainCategory, province, city, whatsApp])

  // Infer mechanical vs electronic from group text
  function inferTxType(txt?: string): 'Mecánico' | 'Electrónico' {
    const v = (txt || '').toLowerCase()
    if (v.includes('di2') || v.includes('etap') || v.includes('axs') || v.includes('eps') || v.includes('electr')) return 'Electrónico'
    return 'Mecánico'
  }

  const displayAuthor = useMemo(() => {
    const name = (profileFullName || '').trim()
    if (name) {
      const parts = name.split(/\s+/).filter(Boolean)
      if (parts.length === 1) return parts[0]
      const first = parts[0]
      const last = parts[parts.length - 1]
      const initial = last && last[0] ? `${last[0].toUpperCase()}.` : ''
      return `${first} ${initial}`.trim()
    }
    const emailName = (profileEmail || '').split('@')[0] || 'Tu perfil'
    const tokens = emailName.split(/[._-]/).filter(Boolean)
    if (tokens.length >= 2) return `${tokens[0]} ${tokens[1][0]?.toUpperCase() || ''}.`
    return emailName
  }, [profileFullName, profileEmail])

  // Si volvemos del login con intención de publicar, relanzar submit automáticamente
  useEffect(() => {
    if (!user || submitting || !loadedDraft) return
    try {
      const pending = window.sessionStorage.getItem('cm_publish_pending')
      // Solo auto-enviar si tenemos datos esenciales cargados
      const hasData = brand.trim().length > 0 && model.trim().length > 0 && priceInput.trim().length > 0
      if (pending === '1' && hasData) {
        window.sessionStorage.removeItem('cm_publish_pending')
        void submit()
      }
    } catch {
      // ignore
    }
  }, [user?.id, submitting, loadedDraft, brand, model, priceInput])

const buildExtras = (): string => {
    const parts: string[] = []
    if (mainCategory === 'Bicicletas') {
      if (frameSize) parts.push(`Talle: ${frameSize}`)
      if (year) parts.push(`Año: ${year}`)
      if (drivetrain || drivetrainOther) parts.push(`Grupo: ${drivetrain || drivetrainOther}`)
      if (brakeType) parts.push(`Freno: ${brakeType}`)
      if (wheelSize) parts.push(`Rodado: ${wheelSize}`)
      if (seatInfo) parts.push(`Asiento: ${seatInfo}`)
      if (handlebarInfo) parts.push(`Manillar: ${handlebarInfo}`)
      if (pedalsInfo) parts.push(`Pedales: ${pedalsInfo}`)
      if (chainInfo) parts.push(`Cadena: ${chainInfo}`)
      if (forkInfo) parts.push(`Horquilla: ${forkInfo}`)
    } else if (mainCategory === 'Accesorios') {
      if (accessorySubcat) parts.push(`Tipo: ${accessorySubcat}`)
      if (accUseType) parts.push(`Uso: ${accUseType}`)
      if (material) parts.push(`Material: ${material}`)
      if (brakeType) parts.push(`Freno: ${brakeType}`)
      if (wheelSize) parts.push(`Rodado: ${wheelSize}`)
      if (accCompatibility) parts.push(`Compatibilidad: ${accCompatibility}`)
      if (accWeight) parts.push(`Peso: ${accWeight}`)
      if (groupComplete) parts.push(`Contenido: ${groupComplete}`)
      if (groupMode) parts.push(`Modo: ${groupMode}`)
      if (drivetrain && groupComplete === 'Completo') parts.push(`Grupo: ${drivetrain}`)
    } else if (mainCategory === 'Indumentaria') {
      if (apparelSubcat) parts.push(`Tipo: ${apparelSubcat}`)
      if (apparelGender) parts.push(`Género: ${apparelGender}`)
      if (apparelSize) parts.push(`Talle: ${apparelSize}`)
      if (apparelColor) parts.push(`Color: ${apparelColor}`)
      if (accUseType) parts.push(`Uso: ${accUseType}`)
      if (material) parts.push(`Material: ${material}`)
    } else if (mainCategory === 'Nutrición') {
      if (nutritionSubcat) parts.push(`Tipo: ${nutritionSubcat}`)
      if (nutriCHO) parts.push(`CHO: ${nutriCHO} g`)
      if (nutriSodium) parts.push(`Sodio: ${nutriSodium} mg`)
      if (nutriServings) parts.push(`Porciones: ${nutriServings}`)
      if (nutriNetWeight) parts.push(`Peso: ${nutriNetWeight}`)
      if (nutriExpire) parts.push(`Vence: ${nutriExpire}`)
    }
    return parts.filter(Boolean).join(' • ')
  }

  const submit = async () => {
    if (submitting) return
    if (!supabaseEnabled) { alert('Supabase no configurado en .env'); return }
    if (!user) {
      try {
        window.sessionStorage.setItem('cm_publish_pending', '1')
        const snapshot = {
          category,
          accessorySubcat,
          apparelSubcat,
          nutritionSubcat,
          brand,
          model,
          year,
          priceInput,
          priceCurrency,
          city,
          province,
          description,
          material,
          frameSize,
          wheelSize,
          drivetrain,
          drivetrainOther,
          brakeType,
          accCompatibility,
          accWeight,
          groupComplete,
          groupMode,
          accUseType,
          apparelGender,
          apparelSize,
          apparelColor,
          nutriCHO,
          nutriSodium,
          nutriServings,
          nutriNetWeight,
          nutriExpire,
          extras,
          images,
          bikeCondition,
          accCondition,
          apparelCondition,
          waCountry,
          waLocal,
        }
        persistDraft(snapshot)
      } catch {}
      setAuthModalOpen(true)
      return
    }
    setSubmitting(true)
    const supabase = getSupabaseClient()
    const price = Number(priceInput)
    if (!brand.trim() || !model.trim()) { alert('Completá marca y modelo'); setOpenStep(2); setSubmitting(false); return }
    if (!price || price <= 0) { alert('Indicá un precio válido'); setOpenStep(5); setSubmitting(false); return }
    // Bicicletas: exigir transmisión y freno
    if (mainCategory === 'Bicicletas' && (!drivetrain && !drivetrainOther || !brakeType)) {
      alert('Completá grupo de transmisión y tipo de freno'); setOpenStep(2); setSubmitting(false); return
    }

    const title = `${brand.trim()} ${model.trim()}`.trim()
    const location = [city, province].filter(Boolean).join(', ')
    const categoryField = mainCategory === 'Bicicletas' ? 'Bicicletas' : mainCategory
    const subcategoryField = mainCategory === 'Bicicletas' ? (category || null) : (
      mainCategory === 'Accesorios' ? accessorySubcat : (mainCategory === 'Indumentaria' ? apparelSubcat : nutritionSubcat)
    )
    const extrasText = buildExtras()

    const payload: any = {
      title,
      brand: brand.trim(),
      model: model.trim(),
      year: year ? Number(year) : null,
      category: categoryField,
      subcategory: subcategoryField,
      price,
      price_currency: priceCurrency,
      location: location || null,
      description: description || null,
      material: material || null,
      frame_size: mainCategory === 'Bicicletas' ? (frameSize || null) : null,
      wheel_size: wheelSize || null,
      drivetrain: (drivetrain || drivetrainOther) || null,
      drivetrain_detail: drivetrainOther || null,
      extras: extrasText || null,
      images: images.length ? images.slice(0, 12) : [],
      status: 'draft',
      seller_id: user.id,
      plan_code: 'free',
      plan: 'free',
      granted_visible_photos: 4,
      visible_images_count: Math.min(4, images.length || 4),
      plan_price: 0,
      plan_photo_limit: 4,
    }

    const { data, error } = await supabase.from('listings').insert(payload).select('id, slug').maybeSingle()
    if (error) {
      console.warn('[publish] insert error', error)
      alert(`Error al publicar: ${error.message}`)
      setSubmitting(false)
      return
    }
    // Update user profile (province/city/whatsapp) if provided
    try {
      await upsertUserProfile({ id: user.id, province, city, whatsapp: whatsApp })
    } catch {}
    // Redirigir al detalle de la publicación y mostrar modal de upgrade
    const slug = data?.slug || data?.id
    if (slug) {
      navigate(`/listing/${slug}?post_publish=1`)
    } else {
      navigate(`/dashboard?tab=${encodeURIComponent('Publicaciones')}`)
    }
    setSubmitting(false)
  }

  return (
    <div className="min-h-screen bg-[#14212E] py-12 px-4 font-sans text-gray-900">
      <Container>
        <div className="max-w-7xl mx-auto grid grid-cols-1 lg:grid-cols-12 gap-8 items-start">
          {/* LEFT: White Form Card */}
          <div className="lg:col-span-7 bg-white rounded-2xl shadow-xl overflow-hidden border border-gray-200">
            <div className="p-6 border-b border-gray-100">
              <h1 className="text-2xl font-bold text-gray-900">Nueva publicación</h1>
              <p className="text-gray-500 text-sm mt-1">Completá los pasos para vender.</p>
            </div>

            {/* Step 1: Categoría / Subcategoría (según tipo) */}
            <StepHeader step={1} title="Categoría" isOpen={openStep === 1} isCompleted={(mainCategory === 'Bicicletas' ? !!category : (mainCategory === 'Accesorios' ? !!accessorySubcat : (mainCategory === 'Indumentaria' ? !!apparelSubcat : !!nutritionSubcat)))} onClick={() => setOpenStep(1)} />
            {openStep === 1 && (
              <div className="p-6 animate-in fade-in slide-in-from-top-2 duration-200 space-y-5">
                {mainCategory === 'Bicicletas' && (
                  <div className="space-y-2">
                    <p className="text-sm text-gray-500">Tipo de bicicleta</p>
                    {/* Mobile: dropdown */}
                    <select
                      className="sm:hidden w-full h-12 px-3 bg-white border border-gray-300 rounded-lg"
                      value={category}
                      onChange={(e) => {
                        const bc = e.target.value
                        setCategory(bc)
                        const next = new URLSearchParams(sp)
                        next.set('subcat', bc)
                        history.replaceState({}, '', `${location.pathname}?${next.toString()}`)
                        setOpenStep(2)
                      }}
                    >
                      <option value="">Seleccionar…</option>
                      {BIKE_CATEGORIES.map((bc) => (
                        <option key={`opt-${bc}`} value={bc}>{bc}</option>
                      ))}
                    </select>
                    <div className="hidden sm:grid grid-cols-2 sm:grid-cols-3 gap-3">
                      {BIKE_CATEGORIES.map((bc) => (
                        <button
                          key={bc}
                          type="button"
                          onClick={() => {
                            setCategory(bc)
                            const next = new URLSearchParams(sp)
                            next.set('subcat', bc)
                            history.replaceState({}, '', `${location.pathname}?${next.toString()}`)
                            setOpenStep(2)
                          }}
                          className={`h-14 rounded-lg border font-medium transition-all ${category === bc ? 'bg-blue-600 text-white border-blue-600 shadow-md' : 'bg-white text-gray-600 border-gray-200 hover:border-blue-400 hover:text-blue-600'}`}
                        >
                          {bc}
                        </button>
                      ))}
                    </div>
                  </div>
                )}
                {mainCategory === 'Accesorios' && (
                  <div className="space-y-2">
                    <p className="text-sm text-gray-500">Categoría de accesorio</p>
                    {/* Mobile: dropdown */}
                    <select
                      className="sm:hidden w-full h-12 px-3 bg-white border border-gray-300 rounded-lg"
                      value={accessorySubcat}
                      onChange={(e) => {
                        const sc = e.target.value as typeof ACCESSORY_SUBCATS[number]
                        setAccessorySubcat(sc)
                        const next = new URLSearchParams(sp)
                        next.set('subcat', sc)
                        history.replaceState({}, '', `${location.pathname}?${next.toString()}`)
                        setOpenStep(2)
                      }}
                    >
                      <option value="">Seleccionar…</option>
                      {ACCESSORY_SUBCATS.map((sc) => (
                        <option key={`opt-${sc}`} value={sc}>{sc}</option>
                      ))}
                    </select>
                    <div className="hidden sm:grid grid-cols-2 sm:grid-cols-3 gap-3">
                      {ACCESSORY_SUBCATS.map(sc => (
                        <button key={sc} type="button" onClick={() => { setAccessorySubcat(sc); const next = new URLSearchParams(sp); next.set('subcat', sc); history.replaceState({}, '', `${location.pathname}?${next.toString()}`); setOpenStep(2) }} className={`h-14 rounded-lg border font-medium transition-all ${accessorySubcat === sc ? 'bg-blue-600 text-white border-blue-600 shadow-md' : 'bg-white text-gray-600 border-gray-200 hover:border-blue-400 hover:text-blue-600'}`}>{sc}</button>
                      ))}
                    </div>
                  </div>
                )}
                {mainCategory === 'Indumentaria' && (
                  <div className="space-y-2">
                    <p className="text-sm text-gray-500">Categoría de indumentaria</p>
                    {/* Mobile: dropdown */}
                    <select
                      className="sm:hidden w-full h-12 px-3 bg-white border border-gray-300 rounded-lg"
                      value={apparelSubcat}
                      onChange={(e) => {
                        const sc = e.target.value as typeof APPAREL_SUBCATS[number]
                        setApparelSubcat(sc)
                        const next = new URLSearchParams(sp)
                        next.set('subcat', sc)
                        history.replaceState({}, '', `${location.pathname}?${next.toString()}`)
                        setOpenStep(2)
                      }}
                    >
                      <option value="">Seleccionar…</option>
                      {APPAREL_SUBCATS.map((sc) => (
                        <option key={`opt-${sc}`} value={sc}>{sc}</option>
                      ))}
                    </select>
                    <div className="hidden sm:grid grid-cols-2 sm:grid-cols-3 gap-3">
                      {APPAREL_SUBCATS.map(sc => (
                        <button key={sc} type="button" onClick={() => { setApparelSubcat(sc); const next = new URLSearchParams(sp); next.set('subcat', sc); history.replaceState({}, '', `${location.pathname}?${next.toString()}`); setOpenStep(2) }} className={`h-14 rounded-lg border font-medium transition-all ${apparelSubcat === sc ? 'bg-blue-600 text-white border-blue-600 shadow-md' : 'bg-white text-gray-600 border-gray-200 hover:border-blue-400 hover:text-blue-600'}`}>{sc}</button>
                      ))}
                    </div>
                  </div>
                )}
                {mainCategory === 'Nutrición' && (
                  <div className="space-y-2">
                    <p className="text-sm text-gray-500">Tipo de producto</p>
                    {/* Mobile: dropdown */}
                    <select
                      className="sm:hidden w-full h-12 px-3 bg-white border border-gray-300 rounded-lg"
                      value={nutritionSubcat}
                      onChange={(e) => {
                        const sc = e.target.value as typeof NUTRITION_SUBCATS[number]
                        setNutritionSubcat(sc)
                        const next = new URLSearchParams(sp)
                        next.set('subcat', sc)
                        history.replaceState({}, '', `${location.pathname}?${next.toString()}`)
                        setOpenStep(2)
                      }}
                    >
                      <option value="">Seleccionar…</option>
                      {NUTRITION_SUBCATS.map((sc) => (
                        <option key={`opt-${sc}`} value={sc}>{sc}</option>
                      ))}
                    </select>
                    <div className="hidden sm:grid grid-cols-2 sm:grid-cols-3 gap-3">
                      {NUTRITION_SUBCATS.map(sc => (
                        <button key={sc} type="button" onClick={() => { setNutritionSubcat(sc); const next = new URLSearchParams(sp); next.set('subcat', sc); history.replaceState({}, '', `${location.pathname}?${next.toString()}`); setOpenStep(2) }} className={`h-14 rounded-lg border font-medium transition-all ${nutritionSubcat === sc ? 'bg-blue-600 text-white border-blue-600 shadow-md' : 'bg-white text-gray-600 border-gray-200 hover:border-blue-400 hover:text-blue-600'}`}>{sc}</button>
                      ))}
                    </div>
                  </div>
                )}
              </div>
            )}

          {/* Step 2: Details */}
          <StepHeader step={2} title="Detalles" isOpen={openStep === 2} isCompleted={!!brand && !!model} onClick={() => setOpenStep(2)} />
          {openStep === 2 && (
            <div className="p-6 space-y-5 animate-in fade-in slide-in-from-top-2 duration-200">
              <div className="grid grid-cols-2 gap-4">
                <div>
                  <label className="block text-sm font-semibold text-gray-700 mb-1">Marca</label>
                  <input className="w-full h-12 px-4 bg-white border border-gray-300 rounded-lg text-gray-900 focus:ring-2 focus:ring-blue-500 outline-none" value={brand} onChange={e => setBrand(e.target.value)} placeholder={mainCategory === 'Accesorios' ? (accessorySubcat === 'Casco' ? 'Ej: POC' : accessorySubcat === 'Ruedas' ? 'Ej: Zipp' : 'Ej: Shimano') : mainCategory === 'Indumentaria' ? (apparelSubcat === 'Casco' ? 'Ej: Giro' : 'Ej: Rapha') : mainCategory === 'Nutrición' ? 'Ej: GU' : 'Ej: Trek'} />
                </div>
                <div>
                  <label className="block text-sm font-semibold text-gray-700 mb-1">Modelo</label>
                  <input className="w-full h-12 px-4 bg-white border border-gray-300 rounded-lg text-gray-900 focus:ring-2 focus:ring-blue-500 outline-none" value={model} onChange={e => setModel(e.target.value)} placeholder={mainCategory === 'Indumentaria'
                    ? (apparelSubcat === 'Casco' ? 'Ej: Ventral Air' : apparelSubcat === 'Zapatillas' ? 'Ej: S-Works Torch' : 'Ej: Aero Jersey Pro')
                    : mainCategory === 'Accesorios'
                      ? (accessorySubcat === 'Ruedas' ? 'Ej: Bora WTO 45' : accessorySubcat === 'Casco' ? 'Ej: Helios Spherical' : accessorySubcat === 'Computadoras' ? 'Ej: Edge 540' : 'Ej: Force AXS')
                      : mainCategory === 'Nutrición'
                        ? (nutritionSubcat || 'Ej: Gel Doble CHO')
                        : 'Ej: Domane SL 6'} />
                </div>
              </div>
              <div className="grid grid-cols-2 gap-4">
                <div>
                  <label className="block text-sm font-semibold text-gray-700 mb-1">Año (opcional)</label>
                  <input className="w-full h-12 px-4 bg-white border border-gray-300 rounded-lg text-gray-900 focus:ring-2 focus:ring-blue-500 outline-none" value={year} onChange={e => setYear(e.target.value)} placeholder="2023" />
                </div>
              </div>
              {/* Bike core specs */}
              {mainCategory === 'Bicicletas' && (
              <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
                <div>
                  <label className="block text-sm font-semibold text-gray-700 mb-1">Material</label>
                  <select className="w-full h-12 px-3 bg-white border border-gray-300 rounded-lg" value={material} onChange={e=>setMaterial(e.target.value)}>
                    <option value="">Seleccionar…</option>
                    {['Aluminio','Carbono','Aluminio + Carbono','Titanio','Acero','Otro'].map(opt => (
                      <option key={opt} value={opt}>{opt}</option>
                    ))}
                  </select>
                </div>
                <div>
                  <label className="block text-sm font-semibold text-gray-700 mb-1">Talle</label>
                  <select className="w-full h-12 px-3 bg-white border border-gray-300 rounded-lg" value={frameSize} onChange={e=>setFrameSize(e.target.value)}>
                    <option value="">Seleccionar…</option>
                    {FRAME_SIZES.map(sz => (<option key={sz || 'none'} value={sz || ''}>{sz || '—'}</option>))}
                  </select>
                </div>
                <div>
                  <label className="block text-sm font-semibold text-gray-700 mb-1">Rodado</label>
                  <select className="w-full h-12 px-3 bg-white border border-gray-300 rounded-lg" value={wheelSize} onChange={e=>setWheelSize(e.target.value)}>
                    <option value="">Seleccionar…</option>
                    {WHEEL_SIZE_OPTIONS.map(sz => (<option key={sz || 'none'} value={sz || ''}>{sz || '—'}</option>))}
                  </select>
                </div>
              </div>
              )}

              {/* Bike Drivetrain + brakes */}
              {mainCategory === 'Bicicletas' && (
              <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
                <div>
                  <label className="block text-sm font-semibold text-gray-700 mb-1">Grupo de transmisión</label>
                  <select className="w-full h-12 px-3 bg-white border border-gray-300 rounded-lg" value={drivetrain} onChange={e=>setDrivetrain(e.target.value)}>
                    <option value="">Seleccionar…</option>
                    {DRIVETRAIN_OPTIONS.map(opt => (
                      <option key={opt} value={opt}>{opt}</option>
                    ))}
                  </select>
                  {drivetrain === 'Otro' && (
                    <input className="mt-2 w-full h-12 px-4 bg-white border border-gray-300 rounded-lg" value={drivetrainOther} onChange={e=>setDrivetrainOther(e.target.value)} placeholder="Detalle del grupo" />
                  )}
                </div>
                <div>
                  <label className="block text-sm font-semibold text-gray-700 mb-1">Tipo de freno</label>
                  <select className="w-full h-12 px-3 bg-white border border-gray-300 rounded-lg" value={brakeType} onChange={e=>setBrakeType(e.target.value)}>
                    <option value="">Seleccionar…</option>
                    <option value="Disco hidráulico">Disco hidráulico</option>
                    <option value="Disco mecánico">Disco mecánico</option>
                    <option value="Herradura">Herradura</option>
                  </select>
                </div>
              </div>
              )}

              {/* Accessories dynamic fields */}
              {mainCategory === 'Accesorios' && (
                <div className="space-y-4">
                  {accessorySubcat === 'Ruedas' && (
                    <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
                      <div>
                        <label className="block text-sm font-semibold text-gray-700 mb-1">Rodado</label>
                        <select className="w-full h-12 px-3 bg-white border border-gray-300 rounded-lg" value={wheelSize} onChange={e=>setWheelSize(e.target.value)}>
                          <option value="">Seleccionar…</option>
                          {WHEEL_SIZE_OPTIONS.map(sz => (<option key={sz || 'none'} value={sz || ''}>{sz || '—'}</option>))}
                        </select>
                      </div>
                      <div>
                        <label className="block text-sm font-semibold text-gray-700 mb-1">Uso</label>
                        <select className="w-full h-12 px-3 bg-white border border-gray-300 rounded-lg" value={accUseType} onChange={e=>setAccUseType(e.target.value)}>
                          <option value="">Seleccionar…</option>
                          {['Ruta','MTB','Gravel','Urbano'].map(x => <option key={x} value={x}>{x}</option>)}
                        </select>
                      </div>
                      <div>
                        <label className="block text-sm font-semibold text-gray-700 mb-1">Material</label>
                        <select className="w-full h-12 px-3 bg-white border border-gray-300 rounded-lg" value={material} onChange={e=>setMaterial(e.target.value)}>
                          <option value="">Seleccionar…</option>
                          {['Aluminio','Carbono','Mixto','Otro'].map(m => <option key={m} value={m}>{m}</option>)}
                        </select>
                      </div>
                      <div>
                        <label className="block text-sm font-semibold text-gray-700 mb-1">Tipo de freno</label>
                        <select className="w-full h-12 px-3 bg-white border border-gray-300 rounded-lg" value={brakeType} onChange={e=>setBrakeType(e.target.value)}>
                          <option value="">Seleccionar…</option>
                          <option value="Disco">Disco</option>
                          <option value="Herradura">Herradura</option>
                        </select>
                      </div>
                      <div>
                        <label className="block text-sm font-semibold text-gray-700 mb-1">Peso (opcional)</label>
                        <input className="w-full h-12 px-4 bg-white border border-gray-300 rounded-lg" value={accWeight} onChange={e=>setAccWeight(e.target.value)} placeholder="Ej.: 1520 g (par)" />
                      </div>
                    </div>
                  )}
                  {accessorySubcat === 'Grupos' && (
                    <div className="space-y-4">
                      <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
                        <div>
                          <label className="block text-sm font-semibold text-gray-700 mb-1">Contenido</label>
                          <select className="w-full h-12 px-3 bg-white border border-gray-300 rounded-lg" value={groupComplete} onChange={e=>setGroupComplete(e.target.value as any)}>
                            <option value="">Seleccionar…</option>
                            <option value="Completo">Completo</option>
                            <option value="Partes">Partes</option>
                          </select>
                        </div>
                        <div>
                          <label className="block text-sm font-semibold text-gray-700 mb-1">Modo</label>
                          <select className="w-full h-12 px-3 bg-white border border-gray-300 rounded-lg" value={groupMode} onChange={e=>setGroupMode(e.target.value as any)}>
                            <option value="">Seleccionar…</option>
                            <option value="Mecánico">Mecánico</option>
                            <option value="Electrónico">Electrónico</option>
                          </select>
                        </div>
                        {groupComplete === 'Completo' && (
                          <div>
                            <label className="block text-sm font-semibold text-gray-700 mb-1">Grupo</label>
                            <select className="w-full h-12 px-3 bg-white border border-gray-300 rounded-lg" value={drivetrain} onChange={e=>setDrivetrain(e.target.value)}>
                              <option value="">Seleccionar…</option>
                              {['Shimano 105','Ultegra','Dura‑Ace','GRX','Deore','SLX','XT','XTR','SRAM Apex','Rival','Force','Red','GX Eagle','X01','XX1','Chorus','Record','Super Record'].map(opt => <option key={opt} value={opt}>{opt}</option>)}
                            </select>
                          </div>
                        )}
                      </div>
                      {groupComplete === 'Partes' && (
                        <div>
                          <label className="block text-sm font-semibold text-gray-700 mb-1">Descripción de las partes</label>
                          <textarea className="w-full min-h-[100px] px-4 py-3 bg-white border border-gray-300 rounded-lg" value={extras} onChange={e=>setExtras(e.target.value)} placeholder="Detalle manual de lo incluido (shifters, cambios, frenos, etc.)" />
                        </div>
                      )}
                    </div>
                  )}
                  {accessorySubcat === 'Componentes' && (
                    <div>
                      <label className="block text-sm font-semibold text-gray-700 mb-1">Descripción del componente</label>
                      <textarea className="w-full min-h-[100px] px-4 py-3 bg-white border border-gray-300 rounded-lg" value={description} onChange={e=>setDescription(e.target.value)} placeholder="Detalle manual (tipo de bicicleta, medidas, compatibilidad)" />
                    </div>
                  )}
                </div>
              )}

              {/* Apparel dynamic fields */}
              {mainCategory === 'Indumentaria' && (
                <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                  {apparelSubcat === 'Zapatos' && (
                    <>
                      <div>
                        <label className="block text-sm font-semibold text-gray-700 mb-1">Talle</label>
                        <input className="w-full h-12 px-4 bg-white border border-gray-300 rounded-lg" value={apparelSize} onChange={e=>setApparelSize(e.target.value)} placeholder="Ej.: 42 EU" />
                      </div>
                      <div>
                        <label className="block text-sm font-semibold text-gray-700 mb-1">Uso</label>
                        <select className="w-full h-12 px-3 bg-white border border-gray-300 rounded-lg" value={accUseType} onChange={e=>setAccUseType(e.target.value)}>
                          <option value="">Seleccionar…</option>
                          {['Ruta','MTB','Gravel','Triatlón'].map(x => <option key={x} value={x}>{x}</option>)}
                        </select>
                      </div>
                      <div className="sm:col-span-2">
                        <label className="block text-sm font-semibold text-gray-700 mb-1">Color</label>
                        <input className="w-full h-12 px-4 bg-white border border-gray-300 rounded-lg" value={apparelColor} onChange={e=>setApparelColor(e.target.value)} placeholder="Ej.: Negro" />
                      </div>
                    </>
                  )}
                  {apparelSubcat === 'Jersey' && (
                    <>
                      <div>
                        <label className="block text-sm font-semibold text-gray-700 mb-1">Fit</label>
                        <select className="w-full h-12 px-3 bg-white border border-gray-300 rounded-lg" value={apparelGender} onChange={e=>setApparelGender(e.target.value)}>
                          <option value="">Seleccionar…</option>
                          {['Unisex','Hombre','Mujer'].map(x => <option key={x} value={x}>{x}</option>)}
                        </select>
                      </div>
                      <div>
                        <label className="block text-sm font-semibold text-gray-700 mb-1">Talle</label>
                        <input className="w-full h-12 px-4 bg-white border border-gray-300 rounded-lg" value={apparelSize} onChange={e=>setApparelSize(e.target.value)} placeholder="Ej.: M" />
                      </div>
                      <div className="sm:col-span-2">
                        <label className="block text-sm font-semibold text-gray-700 mb-1">Material</label>
                        <input className="w-full h-12 px-4 bg-white border border-gray-300 rounded-lg" value={material} onChange={e=>setMaterial(e.target.value)} placeholder="Ej.: Poliéster reciclado" />
                      </div>
                    </>
                  )}
                </div>
              )}

              {/* Nutrition dynamic fields shown earlier */}
              {/* Category specific bits */}
              {category === 'MTB' && (
                <div>
                  <label className="block text-sm font-semibold text-gray-700 mb-1">Horquilla (modelo)</label>
                  <input className="w-full h-12 px-4 bg-white border border-gray-300 rounded-lg" value={mtbForkModel} onChange={e=>setMtbForkModel(e.target.value)} placeholder="Ej.: RockShox SID 120mm" />
                </div>
              )}
              {category === 'Fixie' && (
                <div>
                  <label className="block text-sm font-semibold text-gray-700 mb-1">Relación plato/piñón</label>
                  <input className="w-full h-12 px-4 bg-white border border-gray-300 rounded-lg" value={fixieRatio} onChange={e=>setFixieRatio(e.target.value)} placeholder="Ej.: 49:16" />
                </div>
              )}
              {category === 'E-Bike' && (
                <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                  <div>
                    <label className="block text-sm font-semibold text-gray-700 mb-1">Motor (marca/modelo)</label>
                    <input className="w-full h-12 px-4 bg-white border border-gray-300 rounded-lg" value={ebikeMotor} onChange={e=>setEbikeMotor(e.target.value)} placeholder="Ej.: Bosch Performance CX" />
                  </div>
                  <div>
                    <label className="block text-sm font-semibold text-gray-700 mb-1">Batería / Carga</label>
                    <input className="w-full h-12 px-4 bg-white border border-gray-300 rounded-lg" value={ebikeBattery} onChange={e=>setEbikeBattery(e.target.value)} placeholder="Ej.: 500Wh, carga rápida" />
                  </div>
                </div>
              )}
              {/* Extras - only for Bicicletas with toggle */}
              {mainCategory === 'Bicicletas' && (
                <div className="space-y-3">
                  {!showBikeExtras ? (
                    <button type="button" onClick={() => setShowBikeExtras(true)} className="inline-flex items-center rounded-lg border border-gray-300 px-3 py-2 text-sm font-medium text-gray-700 hover:bg-gray-50">
                      Mostrar extras (opcional)
                    </button>
                  ) : (
                    <>
                      <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                        <div>
                          <label className="block text-sm font-semibold text-gray-700 mb-1">Asiento (modelo)</label>
                          <input className="w-full h-12 px-4 bg-white border border-gray-300 rounded-lg" value={seatInfo} onChange={e=>setSeatInfo(e.target.value)} placeholder="Ej.: Prologo Scratch M5" />
                        </div>
                        <div>
                          <label className="block text-sm font-semibold text-gray-700 mb-1">Manillar (modelo)</label>
                          <input className="w-full h-12 px-4 bg-white border border-gray-300 rounded-lg" value={handlebarInfo} onChange={e=>setHandlebarInfo(e.target.value)} placeholder="Ej.: Zipp Service Course" />
                        </div>
                        <div>
                          <label className="block text-sm font-semibold text-gray-700 mb-1">Pedales (modelo)</label>
                          <input className="w-full h-12 px-4 bg-white border border-gray-300 rounded-lg" value={pedalsInfo} onChange={e=>setPedalsInfo(e.target.value)} placeholder="Ej.: Shimano PD‑R7000" />
                        </div>
                        <div>
                          <label className="block text-sm font-semibold text-gray-700 mb-1">Cadena (modelo)</label>
                          <input className="w-full h-12 px-4 bg-white border border-gray-300 rounded-lg" value={chainInfo} onChange={e=>setChainInfo(e.target.value)} placeholder="Ej.: KMC X11" />
                        </div>
                        <div>
                          <label className="block text-sm font-semibold text-gray-700 mb-1">Horquilla (upgrade)</label>
                          <input className="w-full h-12 px-4 bg-white border border-gray-300 rounded-lg" value={forkInfo} onChange={e=>setForkInfo(e.target.value)} placeholder="Ej.: Fox 34 Performance" />
                        </div>
                      </div>
                      <div>
                        <label className="block text-sm font-semibold text-gray-700 mb-1">Agregados / Notas (opcional)</label>
                        <textarea className="w-full min-h-[100px] px-4 py-3 bg-white border border-gray-300 rounded-lg" value={extras} onChange={e=>setExtras(e.target.value)} placeholder="Cambios, upgrades, mantenimiento, accesorios incluidos..." />
                      </div>
                      <button type="button" onClick={() => setShowBikeExtras(false)} className="inline-flex items-center rounded-lg border border-gray-300 px-3 py-2 text-sm font-medium text-gray-700 hover:bg-gray-50">
                        Ocultar extras
                      </button>
                    </>
                  )}
                </div>
              )}
              <div>
                <label className="block text-sm font-semibold text-gray-700 mb-1">Descripción</label>
                <textarea className="w-full min-h-[120px] px-4 py-3 bg-white border border-gray-300 rounded-lg" value={description} onChange={e=>setDescription(e.target.value)} placeholder="Estado general, mantenimiento y cualquier detalle relevante." />
              </div>
              <button type="button" onClick={() => setOpenStep(3)} className="w-full py-3 bg-gray-900 text-white font-medium rounded-lg hover:bg-black transition-colors">Continuar</button>
            </div>
          )}

            {/* Step 3: Condition */}
            <StepHeader step={3} title="Condición" isOpen={openStep === 3} isCompleted={!!bikeCondition} onClick={() => setOpenStep(3)} />
            {openStep === 3 && (
              <div className="p-6 animate-in fade-in slide-in-from-top-2 duration-200 space-y-3">
                <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
                  {CONDITION_OPTIONS.map(cond => {
                    const key = `${mainCategory}|${cond}`
                    const desc = CONDITION_COPY[key] || CONDITION_COPY[`Bicicletas|${cond}`] || ''
                    return (
                      <button
                        key={cond}
                        type="button"
                        onClick={() => { setBikeCondition(cond); setOpenStep(mainCategory === 'Nutrición' ? 4 : 4) }}
                        className={`p-4 text-left border rounded-lg h-full ${bikeCondition === cond ? 'border-blue-600 bg-blue-50 text-blue-800' : 'border-gray-200 hover:border-gray-300'}`}
                      >
                        <span className="font-bold block">{cond}</span>
                        {desc ? <span className="mt-1 block text-sm text-gray-600 leading-snug">{desc}</span> : null}
                      </button>
                    )
                  })}
                </div>
              </div>
            )}

            {/* Step 4: Photos */}
            <StepHeader step={4} title="Fotos" isOpen={openStep === 4} isCompleted={images.length > 0} onClick={() => setOpenStep(4)} />
          {openStep === 4 && (
            <div className="p-6 animate-in fade-in slide-in-from-top-2 duration-200">
              <div className="border-2 border-dashed border-gray-300 rounded-xl p-8 text-center hover:bg-gray-50 transition-colors relative cursor-pointer">
                <input type="file" multiple accept="image/*" onChange={e => handleFiles(e.target.files)} className="absolute inset-0 opacity-0 cursor-pointer" />
                <p className="text-gray-500 font-medium">Hacé clic o arrastrá tus fotos</p>
              </div>
              {images.length > 0 && (
                <div className="grid grid-cols-4 gap-3 mt-4">
                  {images.map((src, idx) => (
                    <div key={idx} className="relative aspect-square rounded-lg overflow-hidden border border-gray-200">
                      <img src={src} className="w-full h-full object-cover" />
                      {idx !== 0 && (
                        <button onClick={() => makePrimaryAt(idx)} className="absolute left-1 top-1 bg-white/90 text-[#14212e] rounded px-2 py-0.5 text-xs font-semibold shadow">Principal</button>
                      )}
                      <button onClick={() => removeImageAt(idx)} className="absolute top-1 right-1 bg-black/50 text-white rounded-full p-1 hover:bg-red-500">✕</button>
                    </div>
                  ))}
                </div>
              )}
              <button type="button" onClick={() => setOpenStep(5)} className="w-full mt-4 py-3 bg-gray-900 text-white font-medium rounded-lg">Continuar</button>
            </div>
          )}

            {/* Step 5: Price */}
            <StepHeader step={5} title="Precio" isOpen={openStep === 5} isCompleted={!!priceInput} onClick={() => setOpenStep(5)} />
            {openStep === 5 && (
              <div className="p-6 animate-in fade-in slide-in-from-top-2 duration-200">
                <div className="flex gap-4">
                  <select className="h-14 px-4 bg-white border border-gray-300 rounded-lg" value={priceCurrency} onChange={e => setPriceCurrency(e.target.value as any)}>
                    <option value="USD">USD</option>
                    <option value="ARS">ARS</option>
                  </select>
                  <input type="number" className="flex-1 h-14 px-4 bg-white border border-gray-300 rounded-lg text-xl font-bold" placeholder="0" value={priceInput} onChange={e => setPriceInput(e.target.value)} />
                </div>
                <button type="button" onClick={() => setOpenStep(6)} className="w-full mt-4 py-3 bg-gray-900 text-white font-medium rounded-lg">Continuar</button>
              </div>
            )}

            {/* Step 6: Contacto */}
            <StepHeader step={6} title="Contacto" isOpen={openStep === 6} isCompleted={!!province && !!city} onClick={() => setOpenStep(6)} />
            {openStep === 6 && (
              <div className="p-6 animate-in fade-in slide-in-from-top-2 duration-200 space-y-4">
                <div className="grid grid-cols-2 gap-4">
                  <select className="h-12 px-4 bg_white border border-gray-300 rounded-lg" value={province} onChange={e => setProvince(e.target.value)}>
                    <option value="">Provincia</option>
                    {PROVINCES.map(p => <option key={p.name} value={p.name}>{p.name}</option>)}
                  </select>
                  <select className="h-12 px-4 bg-white border border-gray-300 rounded-lg" value={city} onChange={e => setCity(e.target.value)}>
                    <option value="">Ciudad</option>
                    {PROVINCES.find(p => p.name === province)?.cities.map(c => <option key={c} value={c}>{c}</option>)}
                  </select>
                </div>
                {/* WhatsApp contact */}
                <div>
                  <label className="block text-sm font-semibold text-gray-700 mb-1">WhatsApp</label>
                  <div className="grid grid-cols-3 gap-2 sm:grid-cols-4">
                    <select
                      className="h-12 px-3 bg-white border border-gray-300 rounded-lg col-span-1"
                      value={waCountry}
                      onChange={(e)=>{
                        const v = e.target.value
                        setWaCountry(v)
                        const normalized = (waLocal || '').replace(/\D/g,'')
                        setWhatsApp(`${v}${normalized}`)
                      }}
                    >
                      <option value={'+54'}>🇦🇷 +54 AR</option>
                      <option value={'+55'}>🇧🇷 +55 BR</option>
                      <option value={'+56'}>🇨🇱 +56 CL</option>
                      <option value={'+595'}>🇵🇾 +595 PY</option>
                    </select>
                    <input
                      className="col-span-2 sm:col-span-3 h-12 px-4 bg-white border border-gray-300 rounded-lg"
                      inputMode="tel"
                      placeholder="Ej.: 1122334455"
                      value={waLocal}
                      onChange={(e)=>{
                        const digits = e.target.value.replace(/\D/g,'')
                        // Evitar doble prefijo: si ya incluye +54, lo recortamos
                        const cleaned = digits.replace(/^54/, '')
                        setWaLocal(cleaned)
                        setWhatsApp(`${waCountry}${cleaned}`)
                      }}
                    />
                  </div>
                </div>
                <div className="pt-2">
                  <Button onClick={submit} className="w-full h-14 text-lg shadow-xl shadow-blue-900/10">Publicar</Button>
                </div>
              </div>
            )}
          </div>

          {/* RIGHT: Sticky Preview */}
          <div className="hidden lg:block lg:col-span-5 sticky top-8">
            <div className="bg-white rounded-xl shadow-lg border border-gray-200 overflow-hidden">
              <div className="aspect-[4/3] bg-gray-100 flex items-center justify-center relative">
                {images[0] ? (
                  <img src={images[0]} className="w-full h-full object-cover" />
                ) : (
                  <div className="text-gray-400 flex flex-col items-center py-10">
                    <span className="text-4xl mb-2">🚴‍♂️</span>
                    <span className="text-sm font-medium">Tu foto aquí</span>
                  </div>
                )}
              </div>
              <div className="p-6">
                <p className="text-xs font-bold text-blue-600 uppercase mb-1">{(mainCategory === 'Bicicletas' ? category : mainCategory) || 'Categoría'}</p>
                <h3 className="text-2xl font-bold text-gray-900 leading-tight">{brand || 'Marca'} {model || 'Modelo'}</h3>
                <p className="mt-1 text-2xl font-bold text-gray-900">{priceInput ? `${priceCurrency} ${priceInput}` : 'Precio…'}</p>

                <div className="mt-4 flex items-center gap-3">
                  {profileAvatarUrl ? (
                    <img src={profileAvatarUrl} alt="Avatar" className="h-9 w-9 rounded-full object-cover border border-gray-200" />
                  ) : (
                    <div className="h-9 w-9 rounded-full bg-gray-200" />
                  )}
                  <div>
                    <p className="text-sm font-semibold text-gray-900">Publicado por: {displayAuthor}</p>
                    <p className="text-xs text-gray-500">{[city, province].filter(Boolean).join(', ') || 'Ubicación'}</p>
                    {(mainCategory !== 'Bicicletas' ? (mainCategory === 'Accesorios' ? accessorySubcat : (mainCategory === 'Indumentaria' ? apparelSubcat : nutritionSubcat)) : category) && (
                      <p className="text-xs text-gray-500">{mainCategory} • {(mainCategory === 'Bicicletas' ? category : (mainCategory === 'Accesorios' ? accessorySubcat : (mainCategory === 'Indumentaria' ? apparelSubcat : nutritionSubcat)))}</p>
                    )}
                  </div>
                </div>
                {/* Especificaciones estilo /listing (label arriba, valor abajo) */}
                <div className="mt-5">
                  <h4 className="text-sm font-semibold text-gray-900">Especificaciones</h4>
                  <div className="mt-2 grid grid-cols-1 gap-3 sm:grid-cols-2 lg:grid-cols-3">
                    <div>
                      <div className="text-xs text-gray-500">Marca</div>
                      <div className="text-sm text-gray-900 font-medium">{brand || '—'}</div>
                    </div>
                    <div>
                      <div className="text-xs text-gray-500">Modelo</div>
                      <div className="text-sm text-gray-900 font-medium">{model || '—'}</div>
                    </div>
                    <div>
                      <div className="text-xs text-gray-500">Año</div>
                      <div className="text-sm text-gray-900 font-medium">{year || '—'}</div>
                    </div>
                    <div>
                      <div className="text-xs text-gray-500">Categoría</div>
                      <div className="text-sm text-gray-900 font-medium">{(mainCategory === 'Bicicletas' ? category : mainCategory) || '—'}</div>
                    </div>
                    <div>
                      <div className="text-xs text-gray-500">Material</div>
                      <div className="text-sm text-gray-900 font-medium">{material || '—'}</div>
                    </div>
                    <div>
                      <div className="text-xs text-gray-500">Talle / Medida</div>
                      <div className="text-sm text-gray-900 font-medium">{(mainCategory === 'Bicicletas' ? (frameSize || '—') : (mainCategory === 'Indumentaria' ? (apparelSize || '—') : '—'))}</div>
                    </div>
                    <div>
                      <div className="text-xs text-gray-500">Rodado</div>
                      <div className="text-sm text-gray-900 font-medium">{wheelSize || '—'}</div>
                    </div>
                    <div>
                      <div className="text-xs text-gray-500">Grupo</div>
                      <div className="text-sm text-gray-900 font-medium">{(drivetrain || drivetrainOther) || '—'}</div>
                    </div>
                    <div>
                      <div className="text-xs text-gray-500">Tipo de transmisión</div>
                      <div className="text-sm text-gray-900 font-medium">{(drivetrain || drivetrainOther) ? inferTxType(drivetrain || drivetrainOther) : '—'}</div>
                    </div>
                    <div>
                      <div className="text-xs text-gray-500">Freno</div>
                      <div className="text-sm text-gray-900 font-medium">{brakeType || '—'}</div>
                    </div>
                    <div>
                      <div className="text-xs text-gray-500">Condición</div>
                      <div className="text-sm text-gray-900 font-medium">{bikeCondition || '—'}</div>
                    </div>
                  </div>
                </div>

                <div className="mt-5">
                  <h4 className="text-sm font-semibold text-gray-900">Descripción</h4>
                  <p className="text-sm text-gray-600 whitespace-pre-line mt-1">{description || '—'}</p>
                </div>

                <div className="mt-5">
                  <h4 className="text-sm font-semibold text-gray-900">Extras</h4>
                  <p className="text-sm text-gray-600 whitespace-pre-line mt-1">{extras || 'No tiene agregados extras, se encuentra original'}</p>
                </div>
              </div>
            </div>
          </div>
        </div>
      </Container>
      {authModalOpen && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 backdrop-blur-sm" role="dialog" aria-modal="true" onClick={() => setAuthModalOpen(false)}>
          <div className="mx-4 w-full max-w-md rounded-2xl border border-white/10 bg-white p-6 text-[#14212e] shadow-2xl" onClick={(e) => e.stopPropagation()}>
            <div className="flex items-start justify-between gap-4">
              <div>
                <h3 className="text-xl font-bold">Ingresá para publicar</h3>
                <p className="mt-1 text-sm text-slate-600">Creá tu cuenta o continuá con Google para terminar la publicación.</p>
              </div>
              <button aria-label="Cerrar" className="rounded-full border border-slate-200 p-2 hover:bg-slate-50" onClick={() => setAuthModalOpen(false)}>
                <svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24" className="h-5 w-5" fill="none" stroke="currentColor" strokeWidth={1.5}><path strokeLinecap="round" strokeLinejoin="round" d="M6 6l12 12M6 18 18 6"/></svg>
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
                <svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 48 48" className="h-5 w-5" aria-hidden="true"><path fill="#FFC107" d="M43.6 20.5H42V20H24v8h11.3C34.5 31.9 30.7 35 26 35c-6.1 0-11-4.9-11-11s4.9-11 11-11c2.8 0 5.4 1.1 7.4 2.9l5.7-5.7C35.6 7 30.9 5 26 5 14.4 5 5 14.4 5 26s9.4 21 21 21 21-9.4 21-21c0-1.2-.1-2.3-.4-3.5z"/><path fill="#FF3D00" d="m6.3 14.7 6.6 4.8C14.5 15.3 19.8 12 26 12c2.8 0 5.4 1.1 7.4 2.9l5.7-5.7C35.6 7 30.9 5 26 5 17 5 9.1 9.7 6.3 14.7z"/><path fill="#4CAF50" d="M26 47c4.7 0 9-1.8 12.3-4.7l-5.7-5.7C30.7 37.9 28.4 39 26 39c-4.6 0-8.4-3.1-9.8-7.3l-6.6 5.1C12.3 42.5 18.7 47 26 47z"/><path fill="#1976D2" d="M43.6 20.5H42V20H24v8h11.3c-1.1 3.1-3.6 5.5-6.6 6.7l5.7 5.7C34.1 41.2 39 38 42 33c1.8-2.8 2.8-6.1 2.8-9.5 0-1.2-.1-2.3-.4-3.5z"/></svg>
                Continuar con Google
              </button>
              <div className="space-y-2">
                <label className="text-xs font-semibold text-slate-600">O ingresá tu email para recibir un link</label>
                <input
                  type="email"
                  value={authEmail}
                  onChange={(e) => { setAuthEmail(e.target.value); setAuthEmailError(null); setAuthEmailMessage(null) }}
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
              <p className="text-xs text-slate-500 text-center">Te enviaremos un link y volverás a este formulario para finalizar la publicación.</p>
            </div>
          </div>
        </div>
      )}
    </div>
  )
}
