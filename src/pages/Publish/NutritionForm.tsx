import { useEffect, useMemo, useState } from 'react'
import Container from '../../components/Container'
import { Field } from '../../components/FormFields'
import Button from '../../components/Button'
import useUpload from '../../hooks/useUpload'
import { useNavigate, useSearchParams } from 'react-router-dom'
import { useAuth } from '../../context/AuthContext'
import { getSupabaseClient, supabaseEnabled } from '../../services/supabase'
import { useToast } from '../../context/ToastContext'
import { fetchUserProfile } from '../../services/users'
import { PROVINCES, OTHER_CITY_OPTION } from '../../constants/locations'
import { parseMoneyInput } from '../../utils/money'

type Condition = 'Nuevo' | 'Como nuevo' | 'Usado'

const NUTRITION_TYPES = ['Geles','Hidratación','Suplementación','Barras y snacks'] as const
const CONDITION_OPTIONS: Condition[] = ['Nuevo','Como nuevo','Usado']

export default function NutritionForm() {
  const { user } = useAuth()
  const { show: showToast } = useToast()
  const navigate = useNavigate()
  const [searchParams] = useSearchParams()
  const { uploadFiles, uploading, progress } = useUpload()

  const [isStore, setIsStore] = useState<boolean>(false)

  const [brand, setBrand] = useState('')
  const [model, setModel] = useState('')
  const [type, setType] = useState<(typeof NUTRITION_TYPES)[number]>('Geles')
  const [flavor, setFlavor] = useState('')
  const [caffeineMg, setCaffeineMg] = useState('')
  const [sodiumMg, setSodiumMg] = useState('')
  const [carbsG, setCarbsG] = useState('')
  const [calories, setCalories] = useState('')
  const [servingSize, setServingSize] = useState('')
  const [servings, setServings] = useState('')
  const [ingredients, setIngredients] = useState('')
  const [allergens, setAllergens] = useState('')
  const [expiry, setExpiry] = useState('')
  const [condition, setCondition] = useState<Condition>('Nuevo')
  const [priceCurrency, setPriceCurrency] = useState<'USD' | 'ARS'>('USD')
  const [priceInput, setPriceInput] = useState('')
  const [province, setProvince] = useState('')
  const [city, setCity] = useState('')
  const [cityOther, setCityOther] = useState('')
  const [description, setDescription] = useState('')
  const [images, setImages] = useState<string[]>([])
  const [submitting, setSubmitting] = useState(false)

  useEffect(() => {
    const presetType = searchParams.get('subcat')
    if (presetType && (NUTRITION_TYPES as readonly string[]).includes(presetType)) {
      setType(presetType as (typeof NUTRITION_TYPES)[number])
    }
  }, [searchParams])

  useEffect(() => {
    let active = true
    ;(async () => {
      try {
        if (!user?.id) { setIsStore(false); return }
        const profile = await fetchUserProfile(user.id)
        if (!active) return
        setIsStore(Boolean((profile as any)?.store_enabled))
        // Prefill ubicación
        const p = (profile as any)?.province?.trim()
        const c = (profile as any)?.city?.trim()
        if (p && !province) setProvince(p)
        if (c && !city) setCity(c)
      } catch { setIsStore(false) }
    })()
    return () => { active = false }
  }, [user?.id])

  useEffect(() => { if (city !== OTHER_CITY_OPTION) setCityOther('') }, [city])

  const priceNumber = useMemo(() => {
    const n = parseMoneyInput(priceInput, { allowDecimals: true })
    return n && n > 0 ? n : 0
  }, [priceInput])

  const autoTitle = useMemo(() => `${brand.trim()} ${model.trim()}`.trim() || 'Producto de nutrición', [brand, model])
  const formattedPreviewPrice = () => {
    if (!priceNumber) return '—'
    const locale = priceCurrency === 'ARS' ? 'es-AR' : 'en-US'
    const code = priceCurrency
    const formatted = new Intl.NumberFormat(locale, { style: 'currency', currency: code, maximumFractionDigits: 2, minimumFractionDigits: 0 }).format(priceNumber)
    return `${formatted} ${code}`
  }
  const finalCityLabel = city === OTHER_CITY_OPTION ? (cityOther || '') : city
  const previewLocation = useMemo(() => {
    if (finalCityLabel && province) return `${finalCityLabel}, ${province}`
    if (province) return province
    return '—'
  }, [finalCityLabel, province])

  if (!user) return (
    <Container>
      <div className="mx-auto mt-12 max-w-xl rounded-2xl border border-black/10 bg-white p-6 text-center text-sm text-black/60 shadow">
        Iniciá sesión para publicar.
      </div>
    </Container>
  )

  if (!isStore) return (
    <Container>
      <div className="mx-auto mt-12 max-w-xl rounded-2xl border border-amber-400/30 bg-amber-50 p-6 text-center text-sm text-amber-700 shadow">
        La categoría Nutrición está disponible solo para Tiendas Oficiales.
      </div>
    </Container>
  )

  const handleUpload = async (files: File[]) => {
    const urls = await uploadFiles(files)
    setImages((prev) => [...prev, ...urls])
  }

  const submit = async () => {
    if (submitting) return
    if (!supabaseEnabled) return alert('Publicar deshabilitado: configurá Supabase en .env')
    if (!brand.trim()) return alert('Ingresá la marca')
    if (!model.trim()) return alert('Ingresá el nombre del producto')
    if (priceNumber <= 0) return alert('Ingresá un precio válido')
    if (!province) return alert('Seleccioná una provincia')
    if (!city) return alert('Seleccioná una ciudad')
    if (city === OTHER_CITY_OPTION && !cityOther.trim()) return alert('Especificá la ciudad')
    if (!images.length) return alert('Subí al menos una foto')

    const client = getSupabaseClient()
    setSubmitting(true)
    try {
      const extrasParts: string[] = []
      if (servingSize.trim()) extrasParts.push(`Porción: ${servingSize.trim()}`)
      if (carbsG.trim()) extrasParts.push(`Carbohidratos: ${carbsG.trim()} g`)
      if (sodiumMg.trim()) extrasParts.push(`Sodio: ${sodiumMg.trim()} mg`)
      if (caffeineMg.trim()) extrasParts.push(`Cafeína: ${caffeineMg.trim()} mg`)
      if (calories.trim()) extrasParts.push(`Calorías: ${calories.trim()} kcal`)
      if (servings.trim()) extrasParts.push(`Porciones: ${servings.trim()}`)
      if (flavor.trim()) extrasParts.push(`Sabor: ${flavor.trim()}`)
      if (expiry.trim()) extrasParts.push(`Vence: ${expiry.trim()}`)
      if (ingredients.trim()) extrasParts.push(`Ingredientes: ${ingredients.trim()}`)
      if (allergens.trim()) extrasParts.push(`Alérgenos: ${allergens.trim()}`)

      const location = city === OTHER_CITY_OPTION && cityOther ? `${cityOther}, ${province}` : `${city}, ${province}`
      const { data, error } = await client
        .from('listings')
        .insert({
          title: autoTitle,
          brand: brand.trim(),
          model: model.trim(),
          category: 'Nutrición',
          subcategory: type,
          price: priceNumber,
          price_currency: priceCurrency,
          description,
          location,
          images,
          seller_id: user.id,
          extras: extrasParts.join(' • '),
        })
        .select('id, slug')
        .maybeSingle()

      if (error || !data) {
        console.error('Error insert nutrition:', error)
        alert('No pudimos crear la publicación. Intentá nuevamente.')
        return
      }

      showToast('Publicación creada con éxito')
      navigate(`/listing/${data.slug ?? data.id}`)
    } finally {
      setSubmitting(false)
    }
  }

  return (
    <div className="bg-[#14212e]">
      <Container className="text-white">
        <div className="mx-auto max-w-6xl py-8">
          <div className="mb-6 text-center">
            <span className="inline-flex items-center justify-center gap-2 rounded-full border border-white/20 bg-white/10 px-3 py-1 text-xs uppercase tracking-[0.3em] text-white/70">Tienda oficial</span>
            <h1 className="mt-2 text-2xl font-bold">Publicá productos de nutrición</h1>
            <p className="mt-1 text-sm text-white/70">Geles, hidratación, barras y suplementación. Ingresá datos claros por porción.</p>
          </div>

          <div className="grid md:grid-cols-[1fr_360px] gap-4 md:gap-6 lg:gap-10">
            {/* Columna izquierda: formulario (card con fondo blanco, igual al preview) */}
            <div className="card w-full max-w-full min-w-0 overflow-hidden p-6 space-y-6 text-[#14212e] bg-white/95">
              {/* Básicos */}
              <section className="space-y-4">
                <div className="grid sm:grid-cols-3 gap-4">
                  <Field label="Marca">
                    <input className="input" value={brand} onChange={(e) => setBrand(e.target.value)} placeholder="Ej.: Maurten" />
                  </Field>
                  <Field label="Producto / Modelo">
                    <input className="input" value={model} onChange={(e) => setModel(e.target.value)} placeholder="Ej.: Gel 100" />
                  </Field>
                  <Field label="Tipo">
                    <select className="select" value={type} onChange={(e) => setType(e.target.value as any)}>
                      {NUTRITION_TYPES.map((t) => (<option key={t} value={t}>{t}</option>))}
                    </select>
                  </Field>
                </div>
                <div className="grid sm:grid-cols-3 gap-4">
                  <Field label="Sabor (opcional)">
                    <input className="input" value={flavor} onChange={(e) => setFlavor(e.target.value)} placeholder="Ej.: Limón" />
                  </Field>
                  <Field label="Porción">
                    <input className="input" value={servingSize} onChange={(e) => setServingSize(e.target.value)} placeholder="Ej.: 40 g / 500 ml" />
                  </Field>
                  <Field label="Porciones por pack">
                    <input className="input" inputMode="numeric" value={servings} onChange={(e) => setServings(e.target.value)} placeholder="Ej.: 12" />
                  </Field>
                </div>
              </section>

              {/* Tabla nutricional breve */}
              <section className="space-y-4">
                <div className="grid sm:grid-cols-4 gap-4">
                  <Field label="Carbohidratos (g/porción)">
                    <input className="input" inputMode="numeric" value={carbsG} onChange={(e) => setCarbsG(e.target.value)} placeholder="Ej.: 25" />
                  </Field>
                  <Field label="Sodio (mg/porción)">
                    <input className="input" inputMode="numeric" value={sodiumMg} onChange={(e) => setSodiumMg(e.target.value)} placeholder="Ej.: 300" />
                  </Field>
                  <Field label="Cafeína (mg/porción)">
                    <input className="input" inputMode="numeric" value={caffeineMg} onChange={(e) => setCaffeineMg(e.target.value)} placeholder="Ej.: 100" />
                  </Field>
                  <Field label="Calorías (kcal/porción)">
                    <input className="input" inputMode="numeric" value={calories} onChange={(e) => setCalories(e.target.value)} placeholder="Ej.: 100" />
                  </Field>
                </div>
              </section>

              <section className="space-y-4">
                <div className="grid sm:grid-cols-2 gap-4">
                  <Field label="Ingredientes">
                    <textarea className="textarea" rows={3} value={ingredients} onChange={(e) => setIngredients(e.target.value)} placeholder="Lista completa de ingredientes" />
                  </Field>
                  <Field label="Alérgenos (opcional)">
                    <textarea className="textarea" rows={3} value={allergens} onChange={(e) => setAllergens(e.target.value)} placeholder="Contiene: gluten, lactosa, etc." />
                  </Field>
                </div>
                <div className="grid sm:grid-cols-3 gap-4">
                  <Field label="Vencimiento">
                    <input className="input" type="month" value={expiry} onChange={(e) => setExpiry(e.target.value)} />
                  </Field>
                  <Field label="Condición">
                    <select className="select" value={condition} onChange={(e) => setCondition(e.target.value as Condition)}>
                      {CONDITION_OPTIONS.map((c) => (<option key={c} value={c}>{c}</option>))}
                    </select>
                  </Field>
                </div>
              </section>

              <section className="space-y-4">
                <h2 className="text-lg font-semibold">Precio y ubicación</h2>
                <div className="grid sm:grid-cols-3 gap-4">
                  <Field label="Moneda">
                    <select className="select" value={priceCurrency} onChange={(e) => setPriceCurrency(e.target.value as 'USD'|'ARS')}>
                      <option value="USD">USD</option>
                      <option value="ARS">ARS</option>
                    </select>
                  </Field>
                  <Field label="Precio">
                    <input className="input" type="number" min={0} step="0.01" inputMode="decimal" value={priceInput} onChange={(e) => setPriceInput(e.target.value)} placeholder="0" />
                  </Field>
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
              </section>

              <section className="space-y-3">
                <h2 className="text-lg font-semibold">Descripción (opcional)</h2>
                <textarea className="textarea" rows={4} value={description} onChange={(e) => setDescription(e.target.value)} placeholder="Notas de uso, recomendaciones y detalles relevantes" />
              </section>

              <section className="space-y-3">
                <h2 className="text-lg font-semibold">Fotos</h2>
                <div className="flex flex-wrap gap-3">
                  {images.map((src, index) => (
                    <div key={index} className="relative h-28 w-28 overflow-hidden rounded-lg border border-white/20 bg-white/10">
                      <img src={src} alt="" className="h-full w-full object-cover" />
                      <button type="button" className="absolute right-1 top-1 rounded-full bg-black/70 p-1 text-white" onClick={() => setImages((prev) => prev.filter((_, i) => i !== index))} aria-label={`Eliminar foto ${index + 1}`}>✕</button>
                    </div>
                  ))}
                  <label className="grid h-28 w-28 cursor-pointer place-content-center rounded-lg border border-dashed border-white/20 text-white/70 hover:border-white/40">
                    <span className="text-xs">Subir</span>
                    <input type="file" multiple accept="image/*" className="hidden" onChange={async (e) => { const f = Array.from(e.target.files || []); if (f.length) await handleUpload(f) }} />
                  </label>
                </div>
                {uploading && (
                  <div className="text-xs text-white/70">Subiendo… {Math.round(progress * 100)}%</div>
                )}
              </section>

              <div>
                <Button onClick={submit} disabled={submitting} className="w-full">
                  {submitting ? 'Publicando…' : 'Publicar'}
                </Button>
              </div>
            </div>

            {/* Columna derecha: preview (Ficha técnica) */}
            <aside className="card w-full max-w-full min-w-0 overflow-hidden p-6 space-y-5 md:sticky md:top-6 h-fit text-[#14212e] bg-white/95">
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
                <div className="flex justify-between gap-3"><dt className="text-black/60">Tipo</dt><dd>{type}</dd></div>
                {servingSize && (<div className="flex justify-between gap-3"><dt className="text-black/60">Porción</dt><dd>{servingSize}</dd></div>)}
                {servings && (<div className="flex justify-between gap-3"><dt className="text-black/60">Porciones</dt><dd>{servings}</dd></div>)}
                {carbsG && (<div className="flex justify-between gap-3"><dt className="text-black/60">Carbohidratos</dt><dd>{carbsG} g</dd></div>)}
                {sodiumMg && (<div className="flex justify-between gap-3"><dt className="text-black/60">Sodio</dt><dd>{sodiumMg} mg</dd></div>)}
                {caffeineMg && (<div className="flex justify-between gap-3"><dt className="text-black/60">Cafeína</dt><dd>{caffeineMg} mg</dd></div>)}
                {calories && (<div className="flex justify-between gap-3"><dt className="text-black/60">Calorías</dt><dd>{calories} kcal</dd></div>)}
                {flavor && (<div className="flex justify-between gap-3"><dt className="text-black/60">Sabor</dt><dd>{flavor}</dd></div>)}
                {expiry && (<div className="flex justify-between gap-3"><dt className="text-black/60">Vencimiento</dt><dd>{expiry}</dd></div>)}
                <div className="flex justify-between gap-3"><dt className="text-black/60">Condición</dt><dd>{condition}</dd></div>
              </dl>
            </aside>
          </div>
        </div>
      </Container>
    </div>
  )
}
