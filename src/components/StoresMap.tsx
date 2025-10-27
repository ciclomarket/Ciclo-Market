import { useEffect, useMemo, useRef, useState } from 'react'
import { transformSupabasePublicUrl } from '../utils/supabaseImage'

declare global {
  interface Window { L?: any }
}

export type StorePin = {
  id: string
  name: string
  slug: string
  avatarUrl?: string | null
  address?: string | null
  city?: string | null
  province?: string | null
  lat?: number | null
  lon?: number | null
  phone?: string | null
  website?: string | null
}

type Props = {
  stores: StorePin[]
  focusStoreId?: string | null
  onStoreClick?: (storeId: string) => void
}

function loadLeafletAssets(): Promise<void> {
  return new Promise((resolve) => {
    if (window.L) return resolve()
    const cssId = 'leaflet-css'
    const jsId = 'leaflet-js'
    if (!document.getElementById(cssId)) {
      const link = document.createElement('link')
      link.id = cssId
      link.rel = 'stylesheet'
      link.href = 'https://unpkg.com/leaflet@1.9.4/dist/leaflet.css'
      document.head.appendChild(link)
    }
    const finish = () => resolve()
    if (document.getElementById(jsId)) {
      const el = document.getElementById(jsId) as HTMLScriptElement
      if (el && (window as any).L) return finish()
    }
    const script = document.createElement('script')
    script.id = jsId
    script.src = 'https://unpkg.com/leaflet@1.9.4/dist/leaflet.js'
    script.async = true
    script.onload = finish
    document.body.appendChild(script)
  })
}

async function geocode(query: string): Promise<{ lat: number; lon: number } | null> {
  try {
    const url = `https://nominatim.openstreetmap.org/search?format=json&q=${encodeURIComponent(query)}`
    const resp = await fetch(url, { headers: { 'Accept-Language': 'es' } })
    const data = await resp.json().catch(() => [])
    if (Array.isArray(data) && data.length > 0) {
      const item = data[0]
      const lat = Number(item.lat)
      const lon = Number(item.lon)
      if (Number.isFinite(lat) && Number.isFinite(lon)) return { lat, lon }
    }
    return null
  } catch {
    return null
  }
}

function ensurePopupStyles() {
  const id = 'cm-store-popup-style'
  if (document.getElementById(id)) return
  const style = document.createElement('style')
  style.id = id
  style.textContent = `
    .cm-store-popup .leaflet-popup-content { margin: 0 10px 8px !important; }
    .cm-store-popup .leaflet-popup-content > :first-child { margin-top: 0 !important; }
    .cm-store-popup .leaflet-popup-content-wrapper { padding: 4px !important; }
  `
  document.head.appendChild(style)
}

export default function StoresMap({ stores, focusStoreId, onStoreClick }: Props) {
  const containerRef = useRef<HTMLDivElement | null>(null)
  const [ready, setReady] = useState(false)
  const mapRef = useRef<any | null>(null)
  const markersRef = useRef<Record<string, any>>({})

  const queries = useMemo(() => {
    return stores.map((s) => {
      const qParts = [s.address, s.city, s.province, 'Argentina'].filter(Boolean)
      return {
        id: s.id,
        slug: s.slug,
        name: s.name,
        avatarUrl: s.avatarUrl,
        phone: s.phone,
        website: s.website,
        q: qParts.join(', '),
        lat: typeof s.lat === 'number' ? s.lat : null,
        lon: typeof s.lon === 'number' ? s.lon : null
      }
    })
  }, [stores])

  useEffect(() => {
    let cancelled = false
    const init = async () => {
      await loadLeafletAssets()
      if (cancelled) return
      setReady(true)
    }
    void init()
    return () => { cancelled = true }
  }, [])

  useEffect(() => {
    if (!ready || !containerRef.current || !window.L) return
    const L = window.L
    const el = containerRef.current
    el.innerHTML = ''
    markersRef.current = {}
    const map = L.map(el, { zoomControl: true }).setView([-34.6037, -58.3816], 4)
    mapRef.current = map
    ensurePopupStyles()
    L.tileLayer('https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png', {
      attribution: '&copy; OpenStreetMap contributors'
    }).addTo(map)

    const bounds = L.latLngBounds([])
    const markers: any[] = []

    const run = async () => {
      for (const s of queries) {
        const cacheKey = s.q ? `geo:${s.q}` : null
        let coord: { lat: number; lon: number } | null = null
        if (typeof s.lat === 'number' && typeof s.lon === 'number') {
          coord = { lat: s.lat, lon: s.lon }
        }
        if (!coord && cacheKey) {
          try {
            const cached = localStorage.getItem(cacheKey)
            if (cached) coord = JSON.parse(cached)
          } catch { void 0 }
        }
        if (!coord) {
          coord = await geocode(s.q)
          if (coord && cacheKey) {
            try { localStorage.setItem(cacheKey, JSON.stringify(coord)) } catch { void 0 }
          }
        }
        if (!coord) continue
        const size = 54
        const avatar = s.avatarUrl ? transformSupabasePublicUrl(s.avatarUrl, { width: 160, quality: 78, format: 'webp' }) : null
        const html = avatar
          ? `<div style="width:${size}px;height:${size}px;border-radius:50%;border:3px solid #fff;background:#fff;box-shadow:0 12px 24px rgba(10,20,35,0.42);overflow:hidden;display:flex;align-items:center;justify-content:center;"><img src="${avatar}" style="width:100%;height:100%;object-fit:cover;" alt="${s.name}" /></div>`
          : `<div style="width:${size}px;height:${size}px;border-radius:50%;border:3px solid #fff;background:#0f1724;color:#fff;font-weight:600;font-size:18px;display:flex;align-items:center;justify-content:center;box-shadow:0 12px 24px rgba(10,20,35,0.42);">${(s.name || '?').trim().charAt(0).toUpperCase()}</div>`
        const icon = L.divIcon({ html, className: 'cm-store-marker', iconSize: [size, size], iconAnchor: [size / 2, size], popupAnchor: [0, -size / 2] })
        const marker = L.marker([coord.lat, coord.lon], { icon })
          .addTo(map) as any
        const phoneLink = s.phone ? `<a href="tel:${s.phone}" style="padding:4px 8px;border-radius:12px;font-size:11px;text-decoration:none;border:1px solid #0f1724;color:#0f1724">Llamar</a>` : ''
        const webLink = s.website ? `<a href="${s.website}" target="_blank" rel="noopener" style="padding:4px 8px;border-radius:12px;font-size:11px;text-decoration:none;border:1px solid #0f1724;color:#0f1724">Web</a>` : ''
        const popupHtml = `
          <div style="min-width:200px;max-width:260px;line-height:1.25">
            <div style="font-weight:700;color:#0f1724;font-size:14px">${s.name}</div>
            ${s.q ? `<div style="font-size:11px;color:#4b5563;margin-top:2px;white-space:nowrap;overflow:hidden;text-overflow:ellipsis">${s.q}</div>` : ''}
            <div style="margin-top:6px;display:flex;flex-wrap:wrap;gap:6px;align-items:center">
              <a href="/tienda/${encodeURIComponent(s.slug)}" style="background:#0f1724;color:#fff;padding:4px 8px;border-radius:12px;font-size:11px;text-decoration:none">Ver tienda</a>
              ${phoneLink}
              ${webLink}
            </div>
          </div>`
        marker.bindPopup(popupHtml, { offset: [0, -size / 2], className: 'cm-store-popup', autoPan: true, autoPanPadding: [16, 56], maxWidth: 280 })
        marker.on('click', () => {
          if (onStoreClick) onStoreClick(s.id)
          marker.openPopup()
        })
        markers.push(marker)
        markersRef.current[s.id] = marker
        bounds.extend([coord.lat, coord.lon])
      }
      if (bounds.isValid()) map.fitBounds(bounds.pad(0.15))
    }
    void run()
    return () => {
      try { markers.forEach((m) => m.remove && m.remove()) } catch { void 0 }
      map.remove()
      mapRef.current = null
      markersRef.current = {}
    }
  }, [ready, queries, onStoreClick])

  useEffect(() => {
    if (!focusStoreId || !mapRef.current) return
    const marker = markersRef.current[focusStoreId]
    if (!marker) return
    const latLng = marker.getLatLng()
    mapRef.current.setView(latLng, Math.max(mapRef.current.getZoom(), 7), { animate: true })
    marker.openPopup()
  }, [focusStoreId, ready])

  return <div ref={containerRef} className="h-80 w-full min-w-0 rounded-2xl border border-white/10" />
}
