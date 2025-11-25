import { useMemo, useState } from 'react'
import { useParams, useNavigate, useSearchParams } from 'react-router-dom'
import Container from '../components/Container'
import Button from '../components/Button'

const BASE = import.meta.env.VITE_API_BASE_URL || ''

export default function HighlightListing() {
  const { slug } = useParams()
  const navigate = useNavigate()
  const [searchParams] = useSearchParams()
  const [loading, setLoading] = useState<string | null>(null)
  const listingId = searchParams.get('id')?.trim() || null

  const options = useMemo(() => ([
    { id: 'highlight-7', days: 7, price: 3000, title: 'Destacar 7 días', description: 'Más visibilidad por una semana.' },
    { id: 'highlight-14', days: 14, price: 5000, title: 'Destacar 14 días', description: 'Doble de tiempo, mejor exposición.' },
  ]), [])

  const startCheckout = async (opt: { id: string; days: number; price: number }) => {
    if (!BASE) {
      alert('Configurá VITE_API_BASE_URL para iniciar el pago.')
      return
    }
    try {
      setLoading(opt.id)
      let headers: Record<string, string> = { 'Content-Type': 'application/json' }
      try {
        const { getSupabaseClient, supabaseEnabled } = await import('../services/supabase')
        if (supabaseEnabled) {
          const client = getSupabaseClient()
          const { data } = await client.auth.getSession()
          const token = data.session?.access_token
          if (token) headers = { ...headers, Authorization: `Bearer ${token}` }
        }
      } catch { /* noop */ }
      const res = await fetch(`${BASE}/api/checkout`, {
        method: 'POST',
        headers,
        body: JSON.stringify({
          planId: opt.id,
          planCode: opt.id,
          planName: `Destaque ${opt.days} días (${slug})`,
          planCurrency: 'ARS',
          autoRenew: false,
          amount: opt.price,
          metadata: {
            listingSlug: slug || null,
            listingId,
            highlightDays: opt.days
          },
          redirectUrls: {
            success: `${window.location.origin}/listing/${slug}?payment=success&highlightDays=${opt.days}`,
            failure: `${window.location.origin}/listing/${slug}?payment=failure`,
            pending: `${window.location.origin}/listing/${slug}?payment=pending`,
          }
        })
      })
      const data = await res.json().catch(() => ({}))
      const url = data?.init_point ?? data?.url
      if (!res.ok || !url) throw new Error('No pudimos iniciar el pago')
      window.location.href = url
    } catch (err: any) {
      alert(err?.message || 'No pudimos iniciar el pago')
      setLoading(null)
    }
  }

  return (
    <div className="bg-[#14212e] py-10 text-white">
      <Container>
        <div className="mx-auto max-w-4xl">
          <h1 className="text-2xl font-bold">Destacar publicación</h1>
          <p className="mt-1 text-white/80">Elegí una opción de destaque para tu aviso.</p>
          <div className="mt-6 grid gap-4 md:grid-cols-2">
            {options.map((opt) => (
              <div key={opt.id} className="rounded-3xl border border-white/10 bg-white/10 p-6 backdrop-blur">
                <h2 className="text-xl font-semibold">{opt.title}</h2>
                <p className="text-sm text-white/70 mt-1">{opt.description}</p>
                <p className="mt-3 text-2xl font-bold">$ {opt.price.toLocaleString('es-AR')}</p>
                <Button
                  className="mt-4 bg-white text-[#14212e] hover:bg-white/90"
                  disabled={loading === opt.id}
                  onClick={() => void startCheckout(opt)}
                >
                  {loading === opt.id ? 'Redirigiendo…' : 'Comprar destaque'}
                </Button>
              </div>
            ))}
          </div>
          <div className="mt-6">
            <Button variant="ghost" onClick={() => navigate(-1)}>Volver</Button>
          </div>
        </div>
      </Container>
    </div>
  )
}
