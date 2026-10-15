import { useCallback, useEffect, useState, type ClipboardEvent, type ReactNode } from 'react'
import useUpload from '@app/hooks/useUpload'
import { BIKE_CATEGORIES, FRAME_SIZES, WHEEL_SIZE_OPTIONS } from '@app/constants/catalog'
import { PROVINCES } from '@app/constants/locations'
import {
  createPrefill,
  extractPrefill,
  fetchPrefills,
  type CreatedPrefill,
  type PrefillDraft,
  type PrefillRow,
} from '@admin/services/prefills'

const CONDITIONS = ['Nuevo', 'Como nuevo', 'Usado']
const BRAKE_TYPES = ['Disco hidráulico', 'Disco mecánico', 'Herradura']

const inputClass = 'w-full rounded-lg border border-gray-300 px-3 py-2 text-sm focus:border-blue-500 focus:outline-none'

function Field({ label, children }: { label: string; children: ReactNode }) {
  return (
    <label className="block">
      <span className="mb-1 block text-xs font-medium text-gray-500">{label}</span>
      {children}
    </label>
  )
}

function SelectField({ label, value, options, onChange }: { label: string; value: string; options: readonly string[]; onChange: (v: string) => void }) {
  return (
    <Field label={label}>
      <select className={inputClass} value={value} onChange={(e) => onChange(e.target.value)}>
        <option value="">—</option>
        {options.filter(Boolean).map((o) => <option key={o} value={o}>{o}</option>)}
      </select>
    </Field>
  )
}

function formatDate(iso: string | null) {
  if (!iso) return '—'
  return new Date(iso).toLocaleString('es-AR', { day: '2-digit', month: '2-digit', hour: '2-digit', minute: '2-digit' })
}

export default function PrefillsPage() {
  const { uploadFiles, uploading } = useUpload()
  const [text, setText] = useState('')
  const [sourceUrl, setSourceUrl] = useState('')
  const [images, setImages] = useState<string[]>([])
  const [draft, setDraft] = useState<PrefillDraft | null>(null)
  const [sellerName, setSellerName] = useState('')
  const [missing, setMissing] = useState<string[]>([])
  const [isBike, setIsBike] = useState(true)
  const [extracting, setExtracting] = useState(false)
  const [creating, setCreating] = useState(false)
  const [created, setCreated] = useState<CreatedPrefill | null>(null)
  const [message, setMessage] = useState('')
  const [copied, setCopied] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [rows, setRows] = useState<PrefillRow[]>([])

  const loadRows = useCallback(async () => {
    try { setRows(await fetchPrefills()) } catch (err) { setError((err as Error).message) }
  }, [])

  useEffect(() => { void loadRows() }, [loadRows])

  const addFiles = async (files: File[]) => {
    const imageFiles = files.filter((f) => f.type.startsWith('image/'))
    if (!imageFiles.length) return
    const urls = await uploadFiles(imageFiles)
    setImages((prev) => [...prev, ...urls].slice(0, 12))
  }

  // Permite pegar capturas o fotos con Ctrl/Cmd+V en cualquier parte del formulario.
  const handlePaste = (e: ClipboardEvent) => {
    const files = Array.from(e.clipboardData.files || [])
    if (files.some((f) => f.type.startsWith('image/'))) {
      e.preventDefault()
      void addFiles(files)
    }
  }

  const updateDraft = (patch: Partial<PrefillDraft>) => setDraft((prev) => (prev ? { ...prev, ...patch } : prev))

  const reset = () => {
    setText(''); setSourceUrl(''); setImages([]); setDraft(null); setSellerName('')
    setMissing([]); setIsBike(true); setCreated(null); setMessage(''); setError(null)
  }

  const handleExtract = async () => {
    setError(null); setExtracting(true); setCreated(null)
    try {
      const result = await extractPrefill({ text, images })
      setDraft(result.draft)
      setSellerName(result.sellerFirstName)
      setMissing(result.missing)
      setIsBike(result.isBike)
    } catch (err) {
      setError((err as Error).message)
    } finally {
      setExtracting(false)
    }
  }

  const handleCreate = async () => {
    if (!draft) return
    setError(null); setCreating(true)
    try {
      const result = await createPrefill({ draft: { ...draft, images }, sellerName, sourceUrl, sourceText: text })
      setCreated(result)
      setMessage(result.message)
      void loadRows()
    } catch (err) {
      setError((err as Error).message)
    } finally {
      setCreating(false)
    }
  }

  const copyMessage = async () => {
    try {
      await navigator.clipboard.writeText(message)
      setCopied(true)
      setTimeout(() => setCopied(false), 2000)
    } catch { /* noop */ }
  }

  const drivetrainValue = draft ? (draft.drivetrain === 'Otro' || !draft.drivetrain ? draft.drivetrainOther : draft.drivetrain) : ''
  const opened = rows.filter((r) => r.firstOpenedAt).length
  const claimed = rows.filter((r) => r.claimedAt).length

  return (
    <div className="space-y-6" onPaste={handlePaste}>
      <div>
        <h1 className="text-2xl font-semibold text-gray-900">Borradores para outreach</h1>
        <p className="mt-1 text-gray-500">
          Pegá el texto y las fotos de una publicación de Marketplace. La IA arma el borrador y te da un link para mandarle al vendedor.
        </p>
      </div>

      {error && <div className="rounded-lg bg-red-50 px-4 py-3 text-sm text-red-700">{error}</div>}

      <div className="grid gap-6 lg:grid-cols-2">
        {/* 1. Fuente */}
        <section className="space-y-4 rounded-xl border border-gray-200 bg-white p-5">
          <h2 className="font-semibold text-gray-900">1. Publicación original</h2>
          <Field label="Texto de la publicación (título, precio, descripción, ubicación)">
            <textarea className={`${inputClass} h-40`} value={text} onChange={(e) => setText(e.target.value)} placeholder="Pegá acá todo el texto…" />
          </Field>
          <Field label="Link original (opcional, para tu registro)">
            <input className={inputClass} value={sourceUrl} onChange={(e) => setSourceUrl(e.target.value)} placeholder="https://www.facebook.com/marketplace/item/…" />
          </Field>
          <div>
            <span className="mb-1 block text-xs font-medium text-gray-500">Fotos (subí archivos o pegá con Ctrl/Cmd+V)</span>
            <div className="flex flex-wrap gap-2">
              {images.map((src, i) => (
                <div key={src} className="relative h-20 w-20 overflow-hidden rounded-lg border border-gray-200">
                  <img src={src} alt="" className="h-full w-full object-cover" />
                  <button
                    type="button"
                    onClick={() => setImages((prev) => prev.filter((_, idx) => idx !== i))}
                    className="absolute right-1 top-1 rounded bg-black/60 px-1.5 text-xs text-white"
                  >
                    ✕
                  </button>
                </div>
              ))}
              <label className="flex h-20 w-20 cursor-pointer items-center justify-center rounded-lg border-2 border-dashed border-gray-300 text-xs text-gray-500 hover:border-blue-400">
                {uploading ? 'Subiendo…' : '+ Fotos'}
                <input type="file" accept="image/*" multiple className="hidden" onChange={(e) => { void addFiles(Array.from(e.target.files || [])); e.target.value = '' }} />
              </label>
            </div>
          </div>
          <div className="flex gap-2">
            <button
              type="button"
              onClick={handleExtract}
              disabled={extracting || uploading || (!text.trim() && images.length === 0)}
              className="rounded-lg bg-blue-600 px-4 py-2 font-medium text-white hover:bg-blue-700 disabled:opacity-50"
            >
              {extracting ? 'Analizando…' : '✨ Analizar con IA'}
            </button>
            <button type="button" onClick={reset} className="rounded-lg border border-gray-300 px-4 py-2 text-gray-700 hover:bg-gray-50">
              Limpiar
            </button>
          </div>
        </section>

        {/* 2. Revisión */}
        <section className="space-y-4 rounded-xl border border-gray-200 bg-white p-5">
          <h2 className="font-semibold text-gray-900">2. Revisá y generá el link</h2>
          {!draft && <p className="text-sm text-gray-500">Acá vas a ver los datos que extrajo la IA para corregirlos antes de crear el link.</p>}
          {draft && (
            <>
              {!isBike && <div className="rounded-lg bg-yellow-50 px-3 py-2 text-sm text-yellow-800">Ojo: la IA cree que esto no es una bicicleta completa.</div>}
              {missing.length > 0 && (
                <div className="rounded-lg bg-yellow-50 px-3 py-2 text-sm text-yellow-800">
                  Faltan datos (el vendedor los completa al publicar): {missing.join(', ')}
                </div>
              )}
              <div className="grid grid-cols-2 gap-3">
                <Field label="Marca"><input className={inputClass} value={draft.brand} onChange={(e) => updateDraft({ brand: e.target.value })} /></Field>
                <Field label="Modelo"><input className={inputClass} value={draft.model} onChange={(e) => updateDraft({ model: e.target.value })} /></Field>
                <SelectField label="Tipo" value={draft.category} options={BIKE_CATEGORIES} onChange={(v) => updateDraft({ category: v })} />
                <SelectField label="Condición" value={draft.condition} options={CONDITIONS} onChange={(v) => updateDraft({ condition: v })} />
                <Field label="Precio">
                  <div className="flex gap-2">
                    <select className={`${inputClass} w-24`} value={draft.priceCurrency} onChange={(e) => updateDraft({ priceCurrency: e.target.value as 'USD' | 'ARS' })}>
                      <option value="USD">USD</option>
                      <option value="ARS">ARS</option>
                    </select>
                    <input className={inputClass} value={draft.priceInput} onChange={(e) => updateDraft({ priceInput: e.target.value.replace(/\D/g, '') })} />
                  </div>
                </Field>
                <Field label="Año"><input className={inputClass} value={draft.year} onChange={(e) => updateDraft({ year: e.target.value })} /></Field>
                <SelectField label="Talle" value={draft.frameSize} options={FRAME_SIZES} onChange={(v) => updateDraft({ frameSize: v })} />
                <SelectField label="Rodado" value={draft.wheelSize} options={WHEEL_SIZE_OPTIONS} onChange={(v) => updateDraft({ wheelSize: v })} />
                <Field label="Grupo">
                  <input className={inputClass} value={drivetrainValue} onChange={(e) => updateDraft({ drivetrain: e.target.value ? 'Otro' : '', drivetrainOther: e.target.value })} />
                </Field>
                <SelectField label="Frenos" value={draft.brakeType} options={BRAKE_TYPES} onChange={(v) => updateDraft({ brakeType: v })} />
                <SelectField label="Provincia" value={draft.province} options={PROVINCES.map((p) => p.name)} onChange={(v) => updateDraft({ province: v })} />
                <Field label="Ciudad"><input className={inputClass} value={draft.city} onChange={(e) => updateDraft({ city: e.target.value })} /></Field>
              </div>
              <Field label="Descripción">
                <textarea className={`${inputClass} h-28`} value={draft.description} onChange={(e) => updateDraft({ description: e.target.value })} />
              </Field>
              <Field label="Nombre del vendedor (para el saludo)">
                <input className={inputClass} value={sellerName} onChange={(e) => setSellerName(e.target.value)} />
              </Field>
              <button
                type="button"
                onClick={handleCreate}
                disabled={creating || uploading}
                className="w-full rounded-lg bg-green-600 px-4 py-2 font-medium text-white hover:bg-green-700 disabled:opacity-50"
              >
                {creating ? 'Creando…' : '🔗 Crear link mágico'}
              </button>
            </>
          )}
          {created && (
            <div className="space-y-2 rounded-lg border border-green-200 bg-green-50 p-4">
              <p className="text-sm font-medium text-green-800">Link creado: <a href={created.url} target="_blank" rel="noreferrer" className="underline">{created.url}</a></p>
              <textarea className={`${inputClass} h-28 bg-white`} value={message} onChange={(e) => setMessage(e.target.value)} />
              <button type="button" onClick={copyMessage} className="rounded-lg bg-green-600 px-4 py-2 text-sm font-medium text-white hover:bg-green-700">
                {copied ? '✓ Copiado' : 'Copiar mensaje'}
              </button>
            </div>
          )}
        </section>
      </div>

      {/* Historial */}
      <section className="rounded-xl border border-gray-200 bg-white p-5">
        <div className="mb-4 flex items-baseline justify-between">
          <h2 className="font-semibold text-gray-900">Links enviados</h2>
          <p className="text-sm text-gray-500">
            {rows.length} creados · {opened} abiertos · <span className="font-medium text-green-700">{claimed} publicados</span>
          </p>
        </div>
        <div className="overflow-x-auto">
          <table className="w-full text-left text-sm">
            <thead className="text-xs uppercase text-gray-500">
              <tr>
                <th className="py-2 pr-4">Bici</th>
                <th className="py-2 pr-4">Vendedor</th>
                <th className="py-2 pr-4">Creado</th>
                <th className="py-2 pr-4">Abierto</th>
                <th className="py-2 pr-4">Estado</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-gray-100">
              {rows.map((r) => (
                <tr key={r.id}>
                  <td className="py-2 pr-4">
                    <div className="flex items-center gap-2">
                      {r.thumbnail && <img src={r.thumbnail} alt="" className="h-10 w-10 rounded object-cover" />}
                      <a href={r.url} target="_blank" rel="noreferrer" className="font-medium text-gray-900 hover:underline">{r.title}</a>
                    </div>
                  </td>
                  <td className="py-2 pr-4 text-gray-600">{r.sellerName || '—'}</td>
                  <td className="py-2 pr-4 text-gray-600">{formatDate(r.createdAt)}</td>
                  <td className="py-2 pr-4 text-gray-600">{r.firstOpenedAt ? `${formatDate(r.firstOpenedAt)} (${r.openCount}×)` : 'No'}</td>
                  <td className="py-2 pr-4">
                    {r.claimedAt
                      ? <span className="rounded-full bg-green-100 px-2 py-0.5 text-xs font-medium text-green-800">Publicada</span>
                      : <span className="rounded-full bg-gray-100 px-2 py-0.5 text-xs font-medium text-gray-600">Pendiente</span>}
                  </td>
                </tr>
              ))}
              {rows.length === 0 && (
                <tr><td colSpan={5} className="py-6 text-center text-gray-500">Todavía no creaste links.</td></tr>
              )}
            </tbody>
          </table>
        </div>
      </section>
    </div>
  )
}
