import { useEffect, useState } from 'react'
import { Link, useSearchParams } from 'react-router-dom'
import { ShieldCheck } from 'lucide-react'
import { getSupabaseClient } from '@/services/supabase'
import { useAuth } from '@/context/AuthContext'

type MpStatus = {
  status: 'connected' | 'disconnected' | 'revoked' | 'error'
  liveMode: boolean
  connectedAt: string | null
  tosAcceptedAt: string | null
}

export default function PagoProtegidoPanel() {
  const { user } = useAuth()
  const [sp] = useSearchParams()
  const [status, setStatus] = useState<MpStatus | null>(null)
  const [loading, setLoading] = useState(true)
  const [acceptedTos, setAcceptedTos] = useState(false)
  const [connecting, setConnecting] = useState(false)

  const apiBase = (import.meta.env.VITE_API_BASE_URL || '').replace(/\/$/, '')
  const mpOauthResult = sp.get('mp_oauth')

  const loadStatus = async () => {
    if (!user) return
    setLoading(true)
    try {
      const supabase = getSupabaseClient()
      const { data: session } = await supabase.auth.getSession()
      const token = session.session?.access_token
      if (!token) return
      const endpoint = apiBase ? `${apiBase}/api/mp/oauth/status` : '/api/mp/oauth/status'
      const res = await fetch(endpoint, { headers: { Authorization: `Bearer ${token}` } })
      const json = await res.json()
      if (json?.ok) setStatus(json)
    } catch (e) {
      console.warn('[pago-protegido] status failed', e)
    } finally {
      setLoading(false)
    }
  }

  useEffect(() => {
    void loadStatus()
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [user?.id])

  const connect = async () => {
    if (!user || !acceptedTos || connecting) return
    setConnecting(true)
    try {
      const supabase = getSupabaseClient()
      const { data: session } = await supabase.auth.getSession()
      const token = session.session?.access_token
      if (!token) return
      const endpoint = apiBase ? `${apiBase}/api/mp/oauth/connect?acceptedTos=1` : '/api/mp/oauth/connect?acceptedTos=1'
      const res = await fetch(endpoint, { headers: { Authorization: `Bearer ${token}` } })
      const json = await res.json()
      if (res.ok && json?.url) {
        window.location.assign(json.url)
        return
      }
      alert('No pudimos iniciar la conexión con Mercado Pago. Intentá nuevamente.')
    } catch (e) {
      console.warn('[pago-protegido] connect failed', e)
      alert('No pudimos iniciar la conexión con Mercado Pago. Intentá nuevamente.')
    } finally {
      setConnecting(false)
    }
  }

  if (!user) {
    return (
      <main className="bg-gray-50 min-h-[60vh]">
        <div className="max-w-2xl mx-auto px-4 py-12 text-center">
          <p className="text-slate-600">Iniciá sesión para gestionar Pago Protegido.</p>
        </div>
      </main>
    )
  }

  const isConnected = status?.status === 'connected'

  return (
    <main className="bg-gray-50 min-h-[60vh]">
      <div className="max-w-2xl mx-auto px-4 py-12">
        <div className="flex items-center gap-2 mb-2">
          <ShieldCheck className="w-7 h-7 text-emerald-600" />
          <h1 className="text-3xl font-bold text-mb-ink">Pago Protegido</h1>
        </div>
        <p className="text-sm text-gray-500 mb-8">
          Conectá tu cuenta de Mercado Pago para poder ofrecer Pago Protegido en tus publicaciones de bicicletas.
        </p>

        {mpOauthResult === 'success' ? (
          <div className="mb-6 rounded-xl bg-emerald-50 border border-emerald-200 text-emerald-800 px-4 py-3 text-sm">
            Tu cuenta de Mercado Pago quedó conectada correctamente.
          </div>
        ) : null}
        {mpOauthResult === 'error' ? (
          <div className="mb-6 rounded-xl bg-red-50 border border-red-200 text-red-800 px-4 py-3 text-sm">
            No pudimos completar la conexión con Mercado Pago. Intentá nuevamente.
          </div>
        ) : null}

        <div className="bg-white rounded-2xl shadow-sm border border-slate-100 p-6">
          {loading ? (
            <p className="text-sm text-slate-500">Cargando estado…</p>
          ) : isConnected ? (
            <div className="space-y-2">
              <p className="text-sm font-medium text-emerald-700">✅ Cuenta de Mercado Pago conectada</p>
              {status?.connectedAt ? (
                <p className="text-xs text-slate-500">
                  Conectada el {new Date(status.connectedAt).toLocaleDateString('es-AR')}
                </p>
              ) : null}
              <p className="text-xs text-slate-500">
                Modo: {status?.liveMode ? 'producción' : 'sandbox (pruebas)'}
              </p>
            </div>
          ) : (
            <div className="space-y-4">
              <p className="text-sm text-slate-700">
                Todavía no conectaste tu cuenta de Mercado Pago para Pago Protegido.
              </p>
              <label className="flex items-start gap-2 text-sm text-slate-700">
                <input
                  type="checkbox"
                  checked={acceptedTos}
                  onChange={(e) => setAcceptedTos(e.target.checked)}
                  className="mt-0.5"
                />
                <span>
                  Acepto los{' '}
                  <Link to="/pago-protegido/terminos" target="_blank" className="text-sky-600 underline">
                    Términos y Condiciones de Pago Protegido
                  </Link>
                </span>
              </label>
              <button
                type="button"
                disabled={!acceptedTos || connecting}
                onClick={connect}
                className="inline-flex items-center justify-center gap-2 rounded-xl bg-sky-600 px-5 py-3 text-sm font-semibold text-white shadow-sm transition hover:brightness-105 disabled:opacity-50 disabled:cursor-not-allowed"
              >
                {connecting ? 'Redirigiendo…' : 'Conectar con Mercado Pago'}
              </button>
            </div>
          )}
        </div>
      </div>
    </main>
  )
}
