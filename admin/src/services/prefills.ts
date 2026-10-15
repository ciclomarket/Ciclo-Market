import { getSupabaseClient, supabaseEnabled } from '@app/services/supabase'

export type PrefillDraft = {
  mainCategory: 'Bicicletas'
  category: string
  brand: string
  model: string
  year: string
  condition: string
  material: string
  frameSize: string
  wheelSize: string
  drivetrain: string
  drivetrainOther: string
  brakeType: string
  description: string
  extras: string
  images: string[]
  priceCurrency: 'USD' | 'ARS'
  priceInput: string
  province: string
  city: string
}

export type ExtractResult = {
  draft: PrefillDraft
  sellerFirstName: string
  isBike: boolean
  missing: string[]
}

export type CreatedPrefill = { token: string; url: string; message: string }

export type PrefillRow = {
  id: string
  url: string
  title: string
  thumbnail: string | null
  sellerName: string | null
  sourceUrl: string | null
  createdAt: string
  firstOpenedAt: string | null
  openCount: number
  claimedAt: string | null
  listingId: string | null
}

const ERROR_MESSAGES: Record<string, string> = {
  ai_not_configured: 'Falta configurar ANTHROPIC_API_KEY en el server.',
  ai_refusal: 'La IA no pudo procesar este contenido.',
  ai_failed: 'Falló la IA. Probá de nuevo.',
  missing_input: 'Pegá el texto o subí al menos una foto.',
  unauthorized: 'Sesión vencida. Volvé a iniciar sesión.',
  forbidden: 'Tu usuario no tiene permisos de moderador.',
}

function resolveApiBase(): string {
  const env = (import.meta.env.VITE_API_BASE_URL || '').replace(/\/$/, '')
  if (env) return env
  if (typeof window === 'undefined') return ''
  const host = window.location.hostname
  if (host === 'ciclomarket.ar' || host === 'www.ciclomarket.ar') return 'https://ciclo-market.onrender.com'
  return ''
}

async function adminFetch<T>(path: string, init?: RequestInit): Promise<T> {
  if (!supabaseEnabled) throw new Error('supabase_disabled')
  const { data } = await getSupabaseClient().auth.getSession()
  const token = data.session?.access_token
  if (!token) throw new Error(ERROR_MESSAGES.unauthorized)
  const resp = await fetch(`${resolveApiBase()}${path}`, {
    ...init,
    headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${token}`, ...(init?.headers || {}) },
  })
  const body = await resp.json().catch(() => ({}))
  if (!resp.ok || !body?.ok) {
    const code = String(body?.error || 'request_failed')
    throw new Error(ERROR_MESSAGES[code] || code)
  }
  return body as T
}

export function extractPrefill(args: { text: string; images: string[] }): Promise<ExtractResult> {
  return adminFetch<ExtractResult>('/api/admin/prefills/extract', { method: 'POST', body: JSON.stringify(args) })
}

export function createPrefill(args: {
  draft: PrefillDraft
  sellerName: string
  sourceUrl: string
  sourceText: string
}): Promise<CreatedPrefill> {
  return adminFetch<CreatedPrefill>('/api/admin/prefills', { method: 'POST', body: JSON.stringify(args) })
}

export async function fetchPrefills(): Promise<PrefillRow[]> {
  const body = await adminFetch<{ prefills: PrefillRow[] }>('/api/admin/prefills')
  return body.prefills
}
