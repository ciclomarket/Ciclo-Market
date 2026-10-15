import { useEffect, useMemo, useState } from 'react'
import { Link, useNavigate, useParams } from 'react-router-dom'
import SeoHead from '@/components/SeoHead'
import { OTHER_CITY_OPTION, PROVINCES } from '@/constants/locations'
import { trackGA4Event } from '@/lib/ga4'
import { PREFILL_TOKEN_KEY } from '@/services/prefills'

const API_BASE = (import.meta.env.VITE_API_BASE_URL || '').replace(/\/$/, '')

// Debe coincidir con las keys que usa src/pages/CreateListing.tsx
const DRAFT_KEY = 'cm_publish_draft_bike'
const SESSION_DRAFT_KEY = 'cm_publish_last'

type PrefillDraft = {
  category?: string
  brand?: string
  model?: string
  year?: string
  condition?: string
  drivetrain?: string
  drivetrainOther?: string
  brakeType?: string
  images?: string[]
  priceCurrency?: 'USD' | 'ARS'
  priceInput?: string
  province?: string
  city?: string
  [key: string]: unknown
}

type LoadState =
  | { status: 'loading' }
  | { status: 'open'; draft: PrefillDraft; sellerName: string | null }
  | { status: 'claimed' | 'expired' | 'not_found' | 'error' }

const normalize = (s: string) => s.normalize('NFD').replace(/[̀-ͯ]/g, '').toLowerCase().trim()

// La ciudad viene en texto libre: si está en la lista de la provincia se usa, si no va como "Otra ciudad".
function resolveCity(province: string, city: string) {
  const options = PROVINCES.find((p) => p.name === province)?.cities ?? []
  const match = options.find((c) => c !== OTHER_CITY_OPTION && normalize(c) === normalize(city))
  if (match) return { city: match, cityMode: 'preset' as const, cityCustom: '' }
  if (!city) return { city: '', cityMode: 'preset' as const, cityCustom: '' }
  return { city: '', cityMode: 'custom' as const, cityCustom: city }
}

// Abrimos el wizard en el primer paso que le falte algo, para que el vendedor complete solo eso.
function firstIncompleteStep(d: PrefillDraft) {
  if (!d.category || !d.condition) return 1
  if (!d.brand || !d.model || !(d.drivetrain || d.drivetrainOther) || !d.brakeType) return 2
  if (!d.images?.length) return 3
  return 4
}

function formatPrice(draft: PrefillDraft) {
  const n = Number(draft.priceInput)
  if (!Number.isFinite(n) || n <= 0) return null
  return `${draft.priceCurrency === 'ARS' ? '$' : 'USD'} ${n.toLocaleString('es-AR')}`
}

export default function PrefillLanding() {
  const { token = '' } = useParams()
  const navigate = useNavigate()
  const [state, setState] = useState<LoadState>({ status: 'loading' })
  const [activeImage, setActiveImage] = useState(0)

  useEffect(() => {
    let active = true
    ;(async () => {
      try {
        const res = await fetch(`${API_BASE}/api/prefills/${encodeURIComponent(token)}`)
        const data = await res.json().catch(() => null)
        if (!active) return
        if (res.status === 404) return setState({ status: 'not_found' })
        if (!res.ok || !data?.ok) return setState({ status: 'error' })
        if (data.status === 'open') {
          setState({ status: 'open', draft: data.draft || {}, sellerName: data.sellerName || null })
          trackGA4Event('prefill_open', { token })
        } else {
          setState({ status: data.status === 'claimed' ? 'claimed' : 'expired' })
        }
      } catch {
        if (active) setState({ status: 'error' })
      }
    })()
    return () => { active = false }
  }, [token])

  const draft = state.status === 'open' ? state.draft : null
  const title = useMemo(() => [draft?.brand, draft?.model].filter(Boolean).join(' ') || 'Tu bicicleta', [draft])
  const images = draft?.images ?? []

  const handleContinue = () => {
    if (!draft) return
    const payload = {
      ...draft,
      mainCategory: 'Bicicletas',
      ...resolveCity(String(draft.province || ''), String(draft.city || '')),
      step: firstIncompleteStep(draft),
      ts: Date.now(),
    }
    try {
      const raw = JSON.stringify(payload)
      window.localStorage.setItem(DRAFT_KEY, raw)
      window.sessionStorage.setItem(SESSION_DRAFT_KEY, raw)
      window.localStorage.setItem(PREFILL_TOKEN_KEY, token)
    } catch { /* noop */ }
    trackGA4Event('prefill_continue', { token })
    navigate('/publicar/nueva?type=bike')
  }

  return (
    <div className="min-h-screen bg-[#14212E] py-10 px-4 text-white">
      <SeoHead title="Tu publicación está lista" noIndex />
      <div className="mx-auto max-w-xl">
        {state.status === 'loading' && <p className="py-20 text-center text-white/70">Cargando tu publicación…</p>}

        {state.status !== 'loading' && state.status !== 'open' && (
          <div className="rounded-2xl bg-white p-8 text-center text-gray-900 shadow-xl">
            <h1 className="text-2xl font-bold">
              {state.status === 'claimed' ? 'Esta publicación ya fue confirmada' : 'Este link ya no está disponible'}
            </h1>
            <p className="mt-2 text-gray-600">
              {state.status === 'claimed'
                ? 'La podés ver y editar desde tu panel.'
                : 'Igual podés publicar tu bici gratis en pocos minutos.'}
            </p>
            <Link
              to={state.status === 'claimed' ? '/dashboard' : '/publicar'}
              className="mt-6 inline-block rounded-xl bg-blue-600 px-6 py-3 font-semibold text-white hover:bg-blue-700"
            >
              {state.status === 'claimed' ? 'Ir a mi panel' : 'Publicar gratis'}
            </Link>
          </div>
        )}

        {draft && (
          <>
            <p className="text-center text-sm font-semibold uppercase tracking-wide text-blue-300">Ciclo Market</p>
            <h1 className="mt-2 text-center text-3xl font-bold">
              {state.status === 'open' && state.sellerName ? `${state.sellerName}, tu bici` : 'Tu bici'} ya está casi publicada
            </h1>
            <p className="mt-2 text-center text-white/70">Te armamos la publicación con tus fotos y datos. Revisala y confirmala gratis.</p>

            <div className="mt-8 overflow-hidden rounded-2xl bg-white text-gray-900 shadow-xl">
              {images.length > 0 && (
                <div>
                  <img src={images[activeImage]} alt={title} className="aspect-[4/3] w-full object-cover" />
                  {images.length > 1 && (
                    <div className="flex gap-2 overflow-x-auto p-3">
                      {images.map((src, i) => (
                        <button
                          key={src}
                          type="button"
                          onClick={() => setActiveImage(i)}
                          className={`h-14 w-14 flex-none overflow-hidden rounded-lg border-2 ${i === activeImage ? 'border-blue-600' : 'border-transparent'}`}
                        >
                          <img src={src} alt="" className="h-full w-full object-cover" />
                        </button>
                      ))}
                    </div>
                  )}
                </div>
              )}
              <div className="p-6">
                <h2 className="text-xl font-bold">{title}</h2>
                <div className="mt-1 flex flex-wrap gap-x-3 text-gray-600">
                  {formatPrice(draft) && <span className="font-semibold text-gray-900">{formatPrice(draft)}</span>}
                  {[draft.city, draft.province].filter(Boolean).length > 0 && (
                    <span>{[draft.city, draft.province].filter(Boolean).join(', ')}</span>
                  )}
                </div>
                <ul className="mt-5 space-y-2 text-sm text-gray-700">
                  <li>✓ Publicar es gratis</li>
                  <li>✓ Marketplace solo de bicis, con compradores de todo el país</li>
                  <li>✓ Podés editar o pausar la publicación cuando quieras</li>
                </ul>
                <button
                  type="button"
                  onClick={handleContinue}
                  className="mt-6 w-full rounded-xl bg-blue-600 px-6 py-4 text-lg font-semibold text-white hover:bg-blue-700"
                >
                  Revisar y publicar gratis
                </button>
                <p className="mt-3 text-center text-xs text-gray-500">No se publica nada hasta que confirmes.</p>
              </div>
            </div>
          </>
        )}
      </div>
    </div>
  )
}
