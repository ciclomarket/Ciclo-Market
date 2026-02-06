import { useMemo, useState, type FormEvent } from 'react'

type ImportResponse =
  | {
      source: 'mercadolibre'
      external_id: string
      title: string | null
      price: number | null
      currency: string | null
      condition: 'new' | 'used' | null
      description: string | null
      images: string[]
      brand: string | null
      model: string | null
    }
  | {
      ok: false
      error: string
      message?: string
      status?: number
      content_type?: string | null
      raw?: string
    }

const API_BASE = (import.meta.env.VITE_API_BASE_URL || '').replace(/\/$/, '')

function resolveApiBase(): string {
  if (API_BASE) return API_BASE
  if (typeof window === 'undefined') return ''
  const origin = window.location?.origin?.replace(/\/$/, '') || ''
  const host = window.location?.hostname?.toLowerCase?.() || ''
  if (host.endsWith('ciclomarket.ar')) return 'https://ciclo-market.onrender.com'
  return origin
}

export default function MercadoLibreImportPOC() {
  const [url, setUrl] = useState('')
  const [accessToken, setAccessToken] = useState(() => {
    try {
      return localStorage.getItem('poc_meli_access_token') || ''
    } catch {
      return ''
    }
  })
  const [loading, setLoading] = useState(false)
  const [data, setData] = useState<ImportResponse | null>(null)
  const [httpStatus, setHttpStatus] = useState<number | null>(null)

  const pretty = useMemo(() => {
    if (!data) return ''
    return JSON.stringify(data, null, 2)
  }, [data])

  async function onSubmit(event: FormEvent) {
    event.preventDefault()
    setLoading(true)
    setData(null)
    setHttpStatus(null)

    try {
      const base = resolveApiBase()
      const endpoint = base ? `${base}/api/import/mercadolibre` : '/api/import/mercadolibre'
      const res = await fetch(endpoint, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ url, access_token: accessToken.trim() || undefined }),
      })
      setHttpStatus(res.status)
      const contentType = res.headers.get('content-type')
      if (contentType && contentType.includes('application/json')) {
        const json = (await res.json().catch(() => null)) as ImportResponse | null
        setData(json || { ok: false, error: 'invalid_json', content_type: contentType })
      } else {
        const text = await res.text().catch(() => '')
        setData({
          ok: false,
          error: 'non_json_response',
          content_type: contentType,
          raw: text ? text.slice(0, 2000) : '',
          message: 'El servidor respondió con un payload no-JSON (posible 404 o HTML).',
        })
      }
    } catch (err) {
      setData({ ok: false, error: 'network_error', message: err instanceof Error ? err.message : 'network_error' })
    } finally {
      setLoading(false)
    }
  }

  return (
    <div className="mx-auto w-full max-w-4xl px-4 py-10">
      <h1 className="text-2xl font-semibold text-[#14212e]">POC · Importar desde MercadoLibre (AR)</h1>
      <p className="mt-2 text-sm text-[#14212e]/70">
        Página interna para pruebas. Endpoint: <span className="font-mono">POST /api/import/mercadolibre</span>
      </p>

      <form onSubmit={onSubmit} className="mt-6 rounded-xl border border-gray-200 bg-white p-4 shadow-sm">
        <label className="block text-sm font-medium text-[#14212e]" htmlFor="meli-url">
          URL de la publicación
        </label>
        <div className="mt-2 flex flex-col gap-3 sm:flex-row">
          <input
            id="meli-url"
            value={url}
            onChange={(e) => setUrl(e.target.value)}
            placeholder="https://articulo.mercadolibre.com.ar/MLA123456789..."
            className="w-full rounded-lg border border-gray-300 px-3 py-2 text-sm outline-none focus:border-[#14212e]/50"
          />
          <button
            type="submit"
            disabled={loading || !url.trim()}
            className="inline-flex items-center justify-center rounded-lg bg-[#14212e] px-4 py-2 text-sm font-semibold text-white disabled:opacity-60"
          >
            {loading ? 'Importando…' : 'Importar'}
          </button>
        </div>

        <label className="mt-4 block text-sm font-medium text-[#14212e]" htmlFor="meli-token">
          Access token (opcional, solo POC)
        </label>
        <input
          id="meli-token"
          value={accessToken}
          onChange={(e) => {
            const next = e.target.value
            setAccessToken(next)
            try {
              localStorage.setItem('poc_meli_access_token', next)
            } catch {
              // ignore
            }
          }}
          placeholder="APP_USR-…"
          className="mt-2 w-full rounded-lg border border-gray-300 px-3 py-2 text-sm font-mono outline-none focus:border-[#14212e]/50"
        />
      </form>

      <div className="mt-6 grid grid-cols-1 gap-4">
        <div className="rounded-xl border border-gray-200 bg-white p-4 shadow-sm">
          <div className="flex items-center justify-between gap-3">
            <h2 className="text-sm font-semibold text-[#14212e]">Respuesta</h2>
            {httpStatus != null && (
              <span className="rounded-full bg-gray-100 px-3 py-1 text-xs font-medium text-[#14212e]/70">
                HTTP {httpStatus}
              </span>
            )}
          </div>

          {!data ? (
            <p className="mt-3 text-sm text-[#14212e]/60">Pegá una URL y tocá Importar.</p>
          ) : (
            <pre className="mt-3 max-h-[520px] overflow-auto rounded-lg bg-gray-50 p-3 text-xs text-[#14212e]">
              {pretty}
            </pre>
          )}
        </div>
      </div>
    </div>
  )
}
