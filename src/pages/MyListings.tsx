import { useMemo, useState } from 'react'
import Container from '../components/Container'
import useMyListings from '../hooks/useMyListings'
import Button from '../components/Button'
import { formatListingPrice } from '../utils/pricing'
import { useCurrency } from '../context/CurrencyContext'
import { getSupabaseClient, supabaseEnabled } from '../services/supabase'
import useUpload from '../hooks/useUpload'

export default function MyListingsPage() {
  const { items, loading, error } = useMyListings()
  const { format, fx } = useCurrency()
  const [editing, setEditing] = useState<{ id: string; price?: string; photos?: boolean } | null>(null)
  const { uploadFiles } = useUpload()

  const content = useMemo(() => {
    if (loading) return <div className="py-10 text-center text-[#14212e]/70">Cargando mis publicaciones…</div>
    if (error) return <div className="py-10 text-center text-red-600">Error: {error}</div>
    if (items.length === 0) return <div className="py-14 text-center text-[#14212e]/70">No tenés publicaciones aún.</div>
    return null
  }, [loading, error, items])

  const handlePriceSave = async (id: string, priceStr: string) => {
    const n = Number(priceStr)
    if (!Number.isFinite(n) || n <= 0) return
    if (!supabaseEnabled) return
    const supabase = getSupabaseClient()
    const { error } = await supabase.from('listings').update({ price: n }).eq('id', id)
    if (!error) setEditing(null)
  }

  const openPhotosEditor = (id: string) => setEditing({ id, photos: true })

  const handleAddPhotos = async (id: string, files: File[]) => {
    if (!files || files.length === 0) return
    const urls = await uploadFiles(files)
    if (!urls.length) return
    const current = items.find((it) => it.id === id)
    if (!current) return
    const next = [...(current.images || []), ...urls].slice(0, 12)
    if (!supabaseEnabled) return
    const supabase = getSupabaseClient()
    await supabase.from('listings').update({ images: next }).eq('id', id)
  }

  const toggleWhatsapp = async (id: string, enable: boolean) => {
    if (!supabaseEnabled) return
    const supabase = getSupabaseClient()
    await supabase.from('listings').update({ whatsapp_enabled: enable }).eq('id', id)
  }

  return (
    <div className="bg-[#f7fbff] py-8">
      <Container>
        <h1 className="text-2xl font-bold text-[#14212e]">Mis publicaciones</h1>
        {content || (
          <div className="mt-6 grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
            {items.map((l) => {
              const priceLabel = formatListingPrice(l.price, l.priceCurrency, format, fx)
              const photosVis = l.photosVisible ?? Math.min(l.images?.length || 0, 12)
              const cap = l.grantedVisiblePhotos ? Math.min(l.grantedVisiblePhotos, 12) : 4
              const photosTotal = l.images?.length || 0
              return (
                <div key={l.id} className="rounded-2xl border border-[#14212e]/10 bg-white p-4 shadow-sm">
                  <div className="flex items-center justify-between gap-3">
                    <div className="text-sm font-semibold text-[#14212e] line-clamp-2">{l.title}</div>
                    <span className={`rounded-full px-2 py-0.5 text-xs ${l.planStatus === 'PRO' ? 'bg-emerald-100 text-emerald-800' : l.planStatus === 'PREMIUM' ? 'bg-amber-100 text-amber-800' : 'bg-slate-100 text-slate-700'}`}>{l.planStatus ?? 'FREE'}</span>
                  </div>
                  <div className="mt-2 text-lg font-bold text-[#14212e]">{priceLabel}</div>
                  <div className="mt-2 flex items-center justify-between text-xs text-[#14212e]/70">
                    <div>Prioridad: {l.priorityActive ? 'activa' : 'inactiva'}</div>
                    <div>Fotos visibles: {photosVis}/{cap}</div>
                  </div>
                  <div className="mt-1 text-xs text-[#14212e]/70">WhatsApp: {(l.whatsappCapGranted && l.whatsappEnabled) ? 'activo' : (l.whatsappCapGranted ? 'apagado' : 'no disponible')}</div>

                  <div className="mt-3 flex flex-wrap gap-2">
                    <Button size="sm" onClick={() => setEditing({ id: l.id, price: String(l.price) })}>Editar precio</Button>
                    <Button size="sm" variant="secondary" onClick={() => openPhotosEditor(l.id)}>Editar fotos</Button>
                    <Button size="sm" variant="secondary" onClick={() => toggleWhatsapp(l.id, !(l.whatsappEnabled ?? false))}>{(l.whatsappCapGranted && l.whatsappEnabled) ? 'Apagar WhatsApp' : 'Encender WhatsApp'}</Button>
                    {l.canUpgrade && (
                      <Button size="sm" variant="accent">Mejorar</Button>
                    )}
                  </div>

                  {editing?.id === l.id && editing.price !== undefined && (
                    <div className="mt-3 flex items-center gap-2">
                      <input className="input" type="number" min={0} step="1" value={editing.price} onChange={(e) => setEditing({ id: l.id, price: e.target.value })} />
                      <Button size="sm" onClick={() => handlePriceSave(l.id, editing.price!)}>Guardar</Button>
                      <Button size="sm" variant="secondary" onClick={() => setEditing(null)}>Cancelar</Button>
                    </div>
                  )}

                  {editing?.id === l.id && editing.photos && (
                    <div className="mt-3 space-y-2">
                      <div className="text-xs text-[#14212e]/70">
                        {l.planStatus === 'PREMIUM' ? 'Se muestran 8 · Guardadas hasta 12' : 'Se muestran 4 · Guardadas hasta 12'}
                      </div>
                      <div className="grid grid-cols-4 gap-2">
                        {l.images?.map((url, idx) => (
                          <img key={idx} src={url} className="aspect-square rounded object-cover" alt="" />
                        ))}
                      </div>
                      <input type="file" multiple accept="image/*" onChange={(e) => handleAddPhotos(l.id, Array.from(e.target.files || []))} />
                      <div className="flex gap-2">
                        <Button size="sm" variant="secondary" onClick={() => setEditing(null)}>Cerrar</Button>
                      </div>
                    </div>
                  )}
                </div>
              )
            })}
          </div>
        )}
      </Container>
    </div>
  )
}
