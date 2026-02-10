import { useMemo, useState } from 'react'
import Container from '../components/Container'
import Button from '../components/Button'

type Condition = 'new' | 'excellent' | 'good' | 'fair'
type BrandTier = 'premium' | 'budget'

type PricingResult = {
  estimatedPrice: number
  priceRange: { min: number; max: number }
  depreciationGraphData: Array<[number, number]>
}

function formatUsd(value: number) {
  const n = Number(value)
  if (!Number.isFinite(n)) return '—'
  try {
    return new Intl.NumberFormat('en-US', { style: 'currency', currency: 'USD', maximumFractionDigits: 0 }).format(n)
  } catch {
    return `$${Math.round(n)}`
  }
}

function DepreciationChart({ data }: { data: Array<[number, number]> }) {
  const points = useMemo(() => {
    if (!data.length) return []
    const values = data.map(([, v]) => v)
    const minV = Math.min(...values)
    const maxV = Math.max(...values)
    const padX = 24
    const padY = 18
    const width = 700
    const height = 240
    const innerW = width - padX * 2
    const innerH = height - padY * 2
    const denom = maxV - minV || 1
    return data.map(([year, value], idx) => {
      const t = data.length === 1 ? 0 : idx / (data.length - 1)
      const x = padX + t * innerW
      const y = padY + (1 - (value - minV) / denom) * innerH
      return { year, value, x, y }
    })
  }, [data])

  if (!points.length) return null
  const polyline = points.map((p) => `${p.x.toFixed(1)},${p.y.toFixed(1)}`).join(' ')
  const first = points[0]
  const last = points[points.length - 1]
  const min = points.reduce((acc, p) => (p.value < acc.value ? p : acc), points[0])
  const max = points.reduce((acc, p) => (p.value > acc.value ? p : acc), points[0])

  return (
    <div className="rounded-3xl border border-gray-100 bg-white p-5 shadow-sm">
      <div className="flex flex-wrap items-end justify-between gap-3">
        <div>
          <p className="text-xs font-semibold uppercase tracking-wider text-gray-500">Curva de depreciación</p>
          <p className="mt-1 text-sm text-gray-600">Valores estimados por año (misma condición y marca).</p>
        </div>
        <div className="text-right">
          <p className="text-xs text-gray-500">Año {first.year} → {last.year}</p>
          <p className="text-sm font-semibold text-mb-ink">{formatUsd(first.value)} → {formatUsd(last.value)}</p>
        </div>
      </div>

      <div className="mt-4">
        <svg viewBox="0 0 700 240" className="h-56 w-full">
          <defs>
            <linearGradient id="deprLine" x1="0" y1="0" x2="1" y2="0">
              <stop offset="0%" stopColor="#06b6d4" stopOpacity="1" />
              <stop offset="100%" stopColor="#2563eb" stopOpacity="1" />
            </linearGradient>
          </defs>
          <rect x="0" y="0" width="700" height="240" rx="18" fill="#0b1220" />

          <polyline points={polyline} fill="none" stroke="url(#deprLine)" strokeWidth="4" strokeLinejoin="round" strokeLinecap="round" />

          {points.map((p) => (
            <circle key={p.year} cx={p.x} cy={p.y} r="4.5" fill={p.year === last.year ? '#ffffff' : '#93c5fd'} opacity={p.year === last.year ? 0.95 : 0.8} />
          ))}

          <text x={24} y={24} fill="rgba(255,255,255,0.75)" fontSize="12">
            Max: {formatUsd(max.value)}
          </text>
          <text x={24} y={44} fill="rgba(255,255,255,0.75)" fontSize="12">
            Min: {formatUsd(min.value)}
          </text>
        </svg>
      </div>

      <div className="mt-4 grid grid-cols-2 gap-3 sm:grid-cols-3 md:grid-cols-6">
        {data.slice(-6).map(([year, value]) => (
          <div key={year} className="rounded-2xl border border-gray-100 bg-gray-50 p-3">
            <p className="text-xs font-semibold text-gray-500">{year}</p>
            <p className="mt-1 text-sm font-bold text-mb-ink">{formatUsd(value)}</p>
          </div>
        ))}
      </div>
    </div>
  )
}

export default function Tasacion() {
  const currentYear = new Date().getFullYear()

  const [originalPriceUsd, setOriginalPriceUsd] = useState<number>(2500)
  const [year, setYear] = useState<number>(Math.max(1990, currentYear - 2))
  const [condition, setCondition] = useState<Condition>('good')
  const [brandTier, setBrandTier] = useState<BrandTier>('premium')

  const [loading, setLoading] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [result, setResult] = useState<PricingResult | null>(null)

  const canSubmit = Number.isFinite(originalPriceUsd) && originalPriceUsd > 0 && Number.isFinite(year) && year >= 1900 && year <= currentYear

  const submit = async () => {
    if (!canSubmit) return
    setLoading(true)
    setError(null)
    try {
      const res = await fetch('/api/pricing/estimate', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ originalPriceUsd, year, condition, brandTier }),
      })
      const json = await res.json().catch(() => null)
      if (!res.ok || !json?.ok) {
        throw new Error(json?.message || json?.error || 'No se pudo calcular la tasación')
      }
      setResult(json.result as PricingResult)
    } catch (e: any) {
      setResult(null)
      setError(e?.message || 'Error inesperado')
    } finally {
      setLoading(false)
    }
  }

  return (
    <div className="bg-gray-50 text-mb-ink">
      <Container>
        <div className="py-12 md:py-16">
          <div className="mx-auto max-w-3xl text-center">
            <p className="text-xs font-semibold uppercase tracking-[0.35em] text-gray-500">Tasación</p>
            <h1 className="mt-3 text-4xl font-extrabold tracking-tight">¿Cuánto vale tu bici usada?</h1>
            <p className="mt-4 text-base leading-relaxed text-gray-600">
              Calculá una estimación basada en MSRP original, año, estado y marca. Es un modelo heurístico (no consulta precios de mercado).
            </p>
          </div>

          <div className="mx-auto mt-10 grid max-w-5xl grid-cols-1 gap-6 lg:grid-cols-2">
            <div className="rounded-3xl border border-gray-100 bg-white p-6 shadow-sm">
              <h2 className="text-lg font-bold">Datos de la bici</h2>
              <p className="mt-1 text-sm text-gray-600">Completá los inputs y calculá la tasación.</p>

              <div className="mt-6 grid grid-cols-1 gap-4 sm:grid-cols-2">
                <label className="block">
                  <span className="text-xs font-semibold uppercase tracking-wider text-gray-500">Precio original (USD)</span>
                  <input
                    type="number"
                    inputMode="decimal"
                    min={1}
                    step={50}
                    value={originalPriceUsd}
                    onChange={(e) => setOriginalPriceUsd(Number(e.target.value))}
                    className="mt-2 w-full rounded-2xl border border-gray-200 bg-white px-4 py-3 text-sm font-semibold text-mb-ink shadow-sm outline-none focus:border-cyan-300 focus:ring-4 focus:ring-cyan-100"
                    placeholder="Ej: 2500"
                  />
                </label>

                <label className="block">
                  <span className="text-xs font-semibold uppercase tracking-wider text-gray-500">Año del modelo</span>
                  <input
                    type="number"
                    inputMode="numeric"
                    min={1990}
                    max={currentYear}
                    step={1}
                    value={year}
                    onChange={(e) => setYear(Number(e.target.value))}
                    className="mt-2 w-full rounded-2xl border border-gray-200 bg-white px-4 py-3 text-sm font-semibold text-mb-ink shadow-sm outline-none focus:border-cyan-300 focus:ring-4 focus:ring-cyan-100"
                    placeholder={`Ej: ${currentYear - 2}`}
                  />
                </label>

                <label className="block">
                  <span className="text-xs font-semibold uppercase tracking-wider text-gray-500">Estado</span>
                  <select
                    value={condition}
                    onChange={(e) => setCondition(e.target.value as Condition)}
                    className="mt-2 w-full rounded-2xl border border-gray-200 bg-white px-4 py-3 text-sm font-semibold text-mb-ink shadow-sm outline-none focus:border-cyan-300 focus:ring-4 focus:ring-cyan-100"
                  >
                    <option value="new">Nueva</option>
                    <option value="excellent">Excelente</option>
                    <option value="good">Buena</option>
                    <option value="fair">Regular</option>
                  </select>
                </label>

                <label className="block">
                  <span className="text-xs font-semibold uppercase tracking-wider text-gray-500">Marca</span>
                  <select
                    value={brandTier}
                    onChange={(e) => setBrandTier(e.target.value as BrandTier)}
                    className="mt-2 w-full rounded-2xl border border-gray-200 bg-white px-4 py-3 text-sm font-semibold text-mb-ink shadow-sm outline-none focus:border-cyan-300 focus:ring-4 focus:ring-cyan-100"
                  >
                    <option value="premium">Premium (retiene más)</option>
                    <option value="budget">Budget</option>
                  </select>
                </label>
              </div>

              <div className="mt-6 flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
                <Button
                  type="button"
                  onClick={submit}
                  className="bg-[#14212e] text-white hover:bg-[#1b2f3f] disabled:cursor-not-allowed disabled:opacity-60"
                  disabled={!canSubmit || loading}
                >
                  {loading ? 'Calculando…' : 'Calcular tasación'}
                </Button>

                <p className="text-xs text-gray-500">
                  Tip: si estás en desarrollo local, definí `VITE_PROXY_API_TARGET` apuntando a tu server.
                </p>
              </div>

              {error && (
                <div className="mt-5 rounded-2xl border border-red-200 bg-red-50 px-4 py-3 text-sm text-red-700">
                  {error}
                </div>
              )}
            </div>

            <div className="rounded-3xl border border-gray-100 bg-white p-6 shadow-sm">
              <h2 className="text-lg font-bold">Resultado</h2>
              <p className="mt-1 text-sm text-gray-600">Estimación y rango recomendado para publicar.</p>

              {!result ? (
                <div className="mt-10 rounded-3xl border border-dashed border-gray-200 bg-gray-50 p-8 text-center text-sm text-gray-600">
                  Completá los datos y tocá “Calcular tasación”.
                </div>
              ) : (
                <div className="mt-6">
                  <div className="rounded-3xl bg-[#0f1729] p-6 text-white">
                    <p className="text-xs uppercase tracking-[0.35em] text-white/60">Precio estimado</p>
                    <p className="mt-2 text-4xl font-extrabold">{formatUsd(result.estimatedPrice)}</p>
                    <p className="mt-3 text-sm text-white/70">
                      Rango sugerido: <span className="font-semibold text-white">{formatUsd(result.priceRange.min)}</span> –{' '}
                      <span className="font-semibold text-white">{formatUsd(result.priceRange.max)}</span>
                    </p>
                  </div>

                  <div className="mt-6">
                    <DepreciationChart data={result.depreciationGraphData} />
                  </div>
                </div>
              )}
            </div>
          </div>
        </div>
      </Container>
    </div>
  )
}

