import { useEffect, useState } from 'react'
import { initMetaPixel, setMetaPixelConsent, trackMetaPixel } from '../lib/metaPixel'
import { initAnalytics } from '../analytics'

declare global { interface Window { __cm_pixel_pv_sent?: boolean } }

const STORAGE_KEY = 'cm_consent'

export default function CookieConsent() {
  const [visible, setVisible] = useState(false)

  useEffect(() => {
    try {
      const saved = localStorage.getItem(STORAGE_KEY)
      if (!saved) {
        setVisible(true)
      } else {
        // Reaplicar consentimiento guardado
        const choice = saved === 'granted' ? 'granted' : 'denied'
        if (choice === 'granted') {
          // Inicializar GA de forma diferida
          initAnalytics()
        }
        const gtag = (window as any).gtag as ((...args: any[]) => void) | undefined
        if (typeof gtag === 'function') {
          gtag('consent', 'update', { analytics_storage: choice })
        }
        // Meta Pixel: inicializar y aplicar consentimiento si está concedido
        const pixelId = (import.meta.env.VITE_META_PIXEL_ID || '').trim()
        if (choice === 'granted' && pixelId) {
          if (initMetaPixel(pixelId)) {
            setMetaPixelConsent(true)
            // enviar un PageView inicial al restablecer (una sola vez)
            if (!window.__cm_pixel_pv_sent) {
              trackMetaPixel('PageView')
              window.__cm_pixel_pv_sent = true
            }
          }
        } else {
          // si hay fbq cargado por una navegación anterior, revocar
          setMetaPixelConsent(false)
        }
      }
    } catch {
      setVisible(true)
    }
  }, [])

  if (!visible) return null

  const applyConsent = (granted: boolean) => {
    try { localStorage.setItem(STORAGE_KEY, granted ? 'granted' : 'denied') } catch { void 0 }
    if (granted) {
      // Inicializar GA al aceptar
      initAnalytics()
    }
    const gtag = (window as any).gtag as ((...args: any[]) => void) | undefined
    if (typeof gtag === 'function') {
      gtag('consent', 'update', { analytics_storage: granted ? 'granted' : 'denied' })
      if (granted) {
        // Enviar page_view inicial tras aceptar
        const pagePath = window.location.pathname + window.location.search
        gtag('event', 'page_view', { page_path: pagePath, page_location: `${window.location.origin}${pagePath}` })
      }
    }
    // Meta Pixel: inicializar y aplicar consentimiento sólo si fue concedido
    const pixelId = (import.meta.env.VITE_META_PIXEL_ID || '').trim()
    if (granted && pixelId) {
      if (initMetaPixel(pixelId)) {
        setMetaPixelConsent(true)
        if (!window.__cm_pixel_pv_sent) {
          trackMetaPixel('PageView')
          window.__cm_pixel_pv_sent = true
        }
      }
    } else {
      setMetaPixelConsent(false)
    }
    setVisible(false)
  }

  return (
    <div className="fixed inset-x-0 bottom-4 z-50 px-4">
      <div className="mx-auto max-w-3xl rounded-2xl border border-white/15 bg-[#0f1729]/85 p-4 text-white backdrop-blur shadow-[0_18px_40px_rgba(6,12,24,0.35)]">
        <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
          <div className="min-w-0 pr-2">
            <p className="text-sm font-semibold">Usamos cookies para analítica</p>
            <p className="text-xs text-white/70">Nos ayudan a entender el uso del sitio y mejorar tu experiencia. Podés leer nuestra <a href="/privacidad" className="underline hover:text-white">Política de privacidad</a>.</p>
          </div>
          <div className="flex flex-wrap gap-2">
            <button
              type="button"
              className="rounded-full border border-white/20 px-4 py-2 text-sm font-semibold text-white hover:bg-white/10"
              onClick={() => applyConsent(false)}
            >
              Rechazar
            </button>
            <button
              type="button"
              className="rounded-full bg-gradient-to-r from-[#0ea5e9] via-[#2563eb] to-[#1d4ed8] px-4 py-2 text-sm font-semibold text-white shadow-[0_14px_40px_rgba(37,99,235,0.45)] hover:brightness-110"
              onClick={() => applyConsent(true)}
            >
              Aceptar
            </button>
          </div>
        </div>
      </div>
    </div>
  )
}
