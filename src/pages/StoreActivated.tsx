// src/pages/StoreActivated.tsx
import { useEffect, useState } from 'react'
import { Link, useSearchParams } from 'react-router-dom'
import { BadgeCheck, Package, Share2, Store } from 'lucide-react'
import { useAuth } from '../context/AuthContext'
import { getSupabaseClient, supabaseEnabled } from '../services/supabase'
import Container from '../components/Container'
import Button from '../components/Button'

const BASE = import.meta.env.VITE_API_BASE_URL || ''

export default function StoreActivated() {
  const { user } = useAuth()
  const [searchParams] = useSearchParams()
  const [storeName, setStoreName] = useState<string | null>(null)
  const [storeSlug, setStoreSlug] = useState<string | null>(null)
  const [storeEnabled, setStoreEnabled] = useState(false)
  const [loading, setLoading] = useState(true)
  const [polls, setPolls] = useState(0)

  // MP devuelve preapproval_id en query params
  const subscriptionId = searchParams.get('preapproval_id') || searchParams.get('subscription_id')

  const MAX_POLLS = 5

  useEffect(() => {
    if (!user || !supabaseEnabled) { setLoading(false); return }
    const supabase = getSupabaseClient()
    let cancelled = false

    const fetchProfile = async () => {
      // Además de releer la tabla, le pedimos al backend que reconsulte el
      // estado real en MercadoPago y active la tienda si el webhook nunca
      // llegó (o llegó como 'pending').
      if (BASE) {
        try {
          const { data: sessionData } = await supabase.auth.getSession()
          const token = sessionData.session?.access_token
          await fetch(`${BASE}/api/store/confirm`, {
            method: 'POST',
            headers: {
              'Content-Type': 'application/json',
              ...(token ? { Authorization: `Bearer ${token}` } : {}),
            },
          })
        } catch { /* noop: seguimos con el polling pasivo igual */ }
      }

      const { data } = await supabase
        .from('users')
        .select('store_name, store_slug, store_enabled')
        .eq('id', user.id)
        .maybeSingle()
      if (cancelled) return
      setStoreName(data?.store_name ?? null)
      setStoreSlug(data?.store_slug ?? null)
      setStoreEnabled(Boolean(data?.store_enabled))
      setLoading(false)

      if (!data?.store_enabled && polls < MAX_POLLS) {
        setTimeout(() => setPolls((p) => p + 1), 3000)
      }
    }

    fetchProfile()
    return () => { cancelled = true }
  }, [user, polls])

  const storeUrl = storeSlug ? `/tienda/${storeSlug}` : '/dashboard'

  if (loading) {
    return (
      <div className="flex min-h-[calc(100vh-64px)] items-center justify-center bg-[#f4f6f8]">
        <div className="h-8 w-8 animate-spin rounded-full border-2 border-[#14212e] border-t-transparent" />
      </div>
    )
  }

  return (
    <div className="min-h-[calc(100vh-64px)] bg-[#f4f6f8] py-12">
      <Container>
        <div className="mx-auto max-w-lg text-center">
          {/* Icono de éxito */}
          <div className="mb-6 flex justify-center">
            <div className="relative flex h-20 w-20 items-center justify-center rounded-full bg-emerald-100">
              <BadgeCheck className="h-10 w-10 text-emerald-500" />
              <div className="absolute -right-1 -top-1 h-6 w-6 animate-ping rounded-full bg-emerald-300 opacity-75" />
            </div>
          </div>

          <h1 className="text-2xl font-bold text-gray-900">
            {storeEnabled
              ? (storeName ? `¡${storeName} ya está en Ciclo Market!` : '¡Tu tienda ya está activa!')
              : 'Pago recibido'}
          </h1>
          {storeEnabled ? (
            <p className="mt-2 text-gray-500">
              Tu suscripción fue aprobada. Tu tienda ya aparece en el directorio.
            </p>
          ) : polls < MAX_POLLS ? (
            <p className="mt-2 flex items-center justify-center gap-2 text-amber-600">
              <span className="h-4 w-4 animate-spin rounded-full border-2 border-amber-500 border-t-transparent" />
              Confirmando pago… puede tardar unos segundos.
            </p>
          ) : (
            <div className="mt-2 space-y-3">
              <p className="text-amber-600">
                Recibimos tu pago, pero todavía no pudimos confirmar la activación automáticamente.
              </p>
              <div className="flex flex-wrap justify-center gap-3">
                <Button variant="ghost" className="border border-gray-200" onClick={() => setPolls(0)}>
                  Reintentar
                </Button>
                <a
                  href="https://wa.me/5493764748459?text=Hola%2C+pagu%C3%A9+mi+tienda+pero+no+se+activ%C3%B3%2C+%C2%BFme+ayudan%3F"
                  target="_blank"
                  rel="noopener noreferrer"
                  className="inline-flex items-center rounded-full border border-gray-200 px-4 py-2 text-sm font-semibold text-[#14212e] hover:bg-gray-50"
                >
                  Hablar con soporte
                </a>
              </div>
            </div>
          )}

          {subscriptionId && (
            <p className="mt-1 text-xs text-gray-400">ID de suscripción: {subscriptionId}</p>
          )}

          {/* Próximos pasos */}
          <div className="mt-8 space-y-3 text-left">
            <h2 className="text-sm font-semibold uppercase tracking-wide text-gray-400">Próximos pasos</h2>

            <div className="flex items-start gap-4 rounded-xl border border-gray-200 bg-white p-4">
              <div className="flex h-9 w-9 flex-shrink-0 items-center justify-center rounded-full bg-[#14212e] text-white">
                <Package className="h-4 w-4" />
              </div>
              <div>
                <p className="font-semibold text-gray-900">Publicá tu primer producto</p>
                <p className="text-sm text-gray-500">Cargá bicicletas con fotos, precio y descripción completa.</p>
              </div>
            </div>

            <div className="flex items-start gap-4 rounded-xl border border-gray-200 bg-white p-4">
              <div className="flex h-9 w-9 flex-shrink-0 items-center justify-center rounded-full bg-[#14212e] text-white">
                <Store className="h-4 w-4" />
              </div>
              <div>
                <p className="font-semibold text-gray-900">Completá el perfil de tu tienda</p>
                <p className="text-sm text-gray-500">Agregá logo, banner y descripción desde tu Dashboard.</p>
              </div>
            </div>

            <div className="flex items-start gap-4 rounded-xl border border-gray-200 bg-white p-4">
              <div className="flex h-9 w-9 flex-shrink-0 items-center justify-center rounded-full bg-[#14212e] text-white">
                <Share2 className="h-4 w-4" />
              </div>
              <div>
                <p className="font-semibold text-gray-900">Compartí tu tienda</p>
                <p className="text-sm text-gray-500">
                  Tu URL:{' '}
                  {storeSlug ? (
                    <span className="font-medium text-[#14212e]">ciclomarket.ar/tienda/{storeSlug}</span>
                  ) : (
                    <span className="text-gray-400">disponible en tu dashboard</span>
                  )}
                </p>
              </div>
            </div>
          </div>

          {/* CTAs */}
          <div className="mt-8 flex flex-col gap-3 sm:flex-row sm:justify-center">
            <Button to="/publicar" className="bg-[#14212e] text-white hover:bg-[#1b2f3f]">
              Publicar mi primer producto
            </Button>
            <Button to={storeUrl} variant="ghost" className="border border-gray-200">
              Ver mi tienda
            </Button>
          </div>
        </div>
      </Container>
    </div>
  )
}
