import { useEffect, useMemo, useState } from 'react'
import Container from '../../components/Container'
import { Field } from '../../components/FormFields'
import Button from '../../components/Button'
import useUpload from '../../hooks/useUpload'
import { useNavigate, useSearchParams } from 'react-router-dom'
import type { Category } from '../../types'
import { useCurrency } from '../../context/CurrencyContext'
import { BIKE_CATEGORIES, FRAME_SIZES, WHEEL_SIZE_OPTIONS } from '../../constants/catalog'
import { PROVINCES, OTHER_CITY_OPTION } from '../../constants/locations'
import { useAuth } from '../../context/AuthContext'
import { supabase, supabaseEnabled } from '../../services/supabase'
import { usePlans } from '../../context/PlanContext'
import { normalisePlanText, resolvePlanCode } from '../../utils/planCodes'

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

export default function NewListingForm() {
  const [searchParams] = useSearchParams()
  const navigate = useNavigate()
  const { fx } = useCurrency()
  const { uploadFiles, uploading, progress } = useUpload()
  const { user, enabled } = useAuth()
  const { plans } = usePlans()

  /** 1) Plan seleccionado por query (?plan=free|basic|premium) */
  const selectedPlan = useMemo(() => {
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
  }, [plans, searchParams])

  // Canonizamos el código de plan (lo usa la DB y el backend)
  const resolvedPlanCode = selectedPlan ? resolvePlanCode(selectedPlan) : null
  const planCode = resolvedPlanCode
    ?? (selectedPlan?.code ? normalisePlanText(selectedPlan.code) : undefined)
    ?? (selectedPlan?.id ? normalisePlanText(selectedPlan.id) : undefined)
  const planPrice = selectedPlan?.price ?? 0
  const maxPhotos = selectedPlan?.maxPhotos ?? 4
  const planName = selectedPlan?.name ?? 'Plan'
  const listingDuration = selectedPlan?.listingDurationDays ?? selectedPlan?.periodDays ?? 30

  const listingExpiresLabel = useMemo(() => {
    const base = new Date()
    base.setDate(base.getDate() + listingDuration)
    return new Intl.DateTimeFormat('es-AR', { dateStyle: 'long' }).format(base)
  }, [listingDuration])

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

  const [category, setCategory] = useState<Category | null>(null)
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
  const [province, setProvince] = useState('')
  const [city, setCity] = useState('')
  const [cityOther, setCityOther] = useState('')
  const [description, setDescription] = useState('')
  const [images, setImages] = useState<string[]>([])

  const materialValue = material === 'Otro' ? customMaterial.trim() : material
  const drivetrainValue = drivetrain === 'Otro' ? drivetrainOther.trim() : drivetrain
  const priceNumber = Number(priceInput) || 0

  /** Habilitamos fotos cuando hay datos clave (para mejor UX) */
  const photosEnabled = !!(category && model.trim() && materialValue && priceNumber > 0)
  const remainingPhotos = maxPhotos - images.length

  const finalCity = city === OTHER_CITY_OPTION ? cityOther.trim() : city
  const previewLocation = province
    ? finalCity
      ? `${finalCity}, ${province}`
      : city === OTHER_CITY_OPTION
        ? `Otra ciudad, ${province}`
        : `${province}`
    : 'Ubicación por definir'

  const autoTitle = useMemo(() => {
    const composed = `${brand.trim()} ${model.trim()}`.trim()
    return composed || 'Bicicleta en venta'
  }, [brand, model])

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

  /** 3) Submit: inserta listing + paga si corresponde */
  const submit = async () => {
    if (!enabled || !supabaseEnabled) return alert('Publicar deshabilitado: configurá Supabase en .env')
    if (!supabase) return alert('Supabase no configurado correctamente')
    if (!user) return alert('Iniciá sesión para crear una publicación')
    if (!planCode) return alert('No se detectó el plan seleccionado')

    // Validaciones base
    if (!category) return alert('Seleccioná una categoría')
    if (!brand.trim()) return alert('Ingresá la marca de la bicicleta')
    if (!model.trim()) return alert('Ingresá el modelo de la bicicleta')
    if (!materialValue) return alert('Indicá el material del cuadro')
    if (priceNumber <= 0) return alert('Ingresá un precio válido')
    if (!province) return alert('Seleccioná una provincia')
    if (!city) return alert('Seleccioná una ciudad')
    if (city === OTHER_CITY_OPTION && !cityOther.trim()) return alert('Especificá la ciudad')
    if (!images.length) return alert('Subí al menos una foto')

    // (Opcional) límite de publicaciones activas por usuario según plan visible en UI
    const client = supabase

    if (supabaseEnabled && (selectedPlan as any)?.maxListings && (selectedPlan as any).maxListings > 1) {
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

    // Guardamos siempre precio en USD (si elegiste ARS, convertimos)
    const priceForStorage = priceCurrency === 'ARS' ? Number((priceNumber / fx).toFixed(2)) : priceNumber
    const location = finalCity ? `${finalCity}, ${province}` : province

    const expiresAtDate = new Date()
    expiresAtDate.setDate(expiresAtDate.getDate() + listingDuration)
    const expiresAtIso = expiresAtDate.toISOString()

    const metadata = user.user_metadata ?? {}
    const rawSellerName = metadata.full_name ?? metadata.username ?? metadata.name ?? user.email ?? 'Vendedor'
    const sellerName = typeof rawSellerName === 'string' ? rawSellerName : String(rawSellerName)
    const sellerLocation = metadata.city
      ? (metadata.province ? `${metadata.city}, ${metadata.province}` : metadata.city)
      : undefined
    const sellerWhatsapp = metadata.whatsapp ?? metadata.phone ?? undefined

    // Defaults exigidos por el negocio
    const safeDescription = (description.trim() || 'No declara descripción específica')
    const safeExtras = (extras.trim() || 'No tiene agregados extras, se encuentra original')

    /** 3.a Inserta listing (dispara trigger de snapshot por plan_code) */
    const { data: inserted, error: insertErr } = await client
      .from('listings')
      .insert([{
        seller_id: user.id,
        title: autoTitle,
        brand: brand.trim(),
        model: model.trim(),
        year: year ? Number(year) : undefined,
        category,
        price: priceForStorage,
        price_currency: priceCurrency,     // si tu columna se llama distinto, ajustá aquí
        location,
        description: safeDescription,
        images: [],                        // primero creamos vacío, luego seteamos URLs
        seller_name: sellerName,
        seller_location: sellerLocation,
        seller_whatsapp: sellerWhatsapp,
        material: materialValue || undefined,
        frame_size: frameSize || undefined,
        drivetrain: drivetrain === 'Otro' ? undefined : drivetrain,
        drivetrain_detail: drivetrain === 'Otro' ? (drivetrainOther.trim() || undefined) : undefined,
        wheelset: wheelset.trim() || undefined,
        wheel_size: wheelSize || undefined,
        extras: safeExtras,
        plan_code: planCode,               // 👈 clave para snapshot
        plan: planCode,
        status: 'active',
        expires_at: expiresAtIso,
        renewal_notified_at: null,
      }])
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

  return (
    <Container>
      <div className="flex flex-col md:flex-row md:items-center md:justify-between gap-3 mb-6">
        <div>
          <h1 className="text-2xl font-bold">Nueva publicación</h1>
          <p className="text-sm text-black/60 mt-1">Completá los datos de tu bici y obtené una vista previa en tiempo real.</p>
        </div>
        <div className="rounded-xl border border-mb-primary/30 bg-mb-primary/5 px-4 py-3 text-sm text-mb-ink max-w-sm">
          <div className="font-semibold text-mb-primary">Plan seleccionado: {planName}</div>
          <div className="text-xs font-semibold text-mb-primary/80">
            {planPriceLabel ?? 'Sin costo'}
          </div>
          {selectedPlan?.description && (
            <div className="mt-2 text-xs text-black/70">{selectedPlan.description}</div>
          )}
            <div className="mt-2 text-xs text-black/60 space-y-1">
              <div>Duración de la publicación: {listingDuration} días</div>
              <div>Expira aprox.: {listingExpiresLabel}</div>
              <div>Fotos permitidas: {maxPhotos}</div>
            <div>
              {selectedPlan?.featuredDays
                ? `Destacada ${selectedPlan.featuredDays} ${selectedPlan.featuredDays === 1 ? 'día' : 'días'} en portada`
                : 'Sin destaque en portada'}
            </div>
            <div>{selectedPlan?.whatsappEnabled ? 'Botón de WhatsApp habilitado' : 'Sin botón de WhatsApp'}</div>
            {selectedPlan?.socialBoost && <div>Difusión en Instagram y Facebook</div>}
          </div>
        </div>
      </div>

      <div className="grid md:grid-cols-2 gap-6">
        <div className="card p-6 space-y-6">
          <section>
            <h2 className="text-lg font-semibold text-mb-ink">1. Categoría</h2>
            <p className="text-sm text-black/60">Elegí la categoría que mejor describe tu bicicleta.</p>
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
          </section>

          <section className={category ? 'space-y-4' : 'opacity-50 pointer-events-none select-none space-y-4'}>
            <h2 className="text-lg font-semibold text-mb-ink">2. Detalles de la bici</h2>
            {!category && <p className="text-sm text-black/50">Seleccioná una categoría para continuar.</p>}

            <div className="grid sm:grid-cols-2 gap-4">
              <Field label="Marca">
                <input className="input" value={brand} onChange={(e) => setBrand(e.target.value)} placeholder="Ej.: Specialized" />
              </Field>
              <Field label="Modelo">
                <input className="input" value={model} onChange={(e) => setModel(e.target.value)} placeholder="Ej.: Tarmac SL7" />
              </Field>
            </div>

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

            <div className="grid sm:grid-cols-2 gap-4">
              <Field label="Año (opcional)">
                <input className="input" type="number" value={year} onChange={(e) => setYear(e.target.value)} placeholder="2023" />
              </Field>
            </div>

            <Field label="Descripción">
              <textarea
                className="textarea"
                value={description}
                onChange={(e) => setDescription(e.target.value)}
                placeholder="Contá el estado, mantenimiento y cualquier detalle relevante."
              />
              <p className="text-xs text-black/50 mt-1">Si la dejás vacía: “No declara descripción específica”.</p>
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
              <p className="text-xs text-black/50">Completá categoría, marca, modelo, material y precio para habilitar las fotos.</p>
            )}
            {uploading && <p className="text-sm mt-1">Subiendo… {progress}%</p>}
            <div className="grid grid-cols-3 gap-2">
              {images.map((src, index) => (
                <div key={index} className="relative aspect-square overflow-hidden rounded-md border border-black/10">
                  <img src={src} alt="Foto de la bicicleta" className="w-full h-full object-cover" />
                </div>
              ))}
            </div>
          </section>

          <Button onClick={submit} className="w-full">Publicar</Button>
        </div>

        <aside className="card p-6 space-y-5 md:sticky md:top-6 h-fit">
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
          </dl>

          <div>
            <h3 className="text-sm font-semibold text-black/70">Extras</h3>
            <p className="text-sm text-black/60 mt-1 whitespace-pre-line">
              {extras.trim() || 'No tiene agregados extras, se encuentra original'}
            </p>
          </div>

          <div>
            <h3 className="text-sm font-semibold text-black/70">Descripción</h3>
            <p className="text-sm text-black/60 mt-1 whitespace-pre-line">
              {description.trim() || 'No declara descripción específica'}
            </p>
          </div>
        </aside>
      </div>
    </Container>
  )
}
