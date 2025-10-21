import { useEffect, useRef } from 'react'
import { loadGoogleMaps } from '../utils/googleMaps'

declare global {
  interface Window {
    google?: any
  }
}
export type GoogleStorePin = {
  id: string
  name: string
  slug: string
  lat?: number | null
  lon?: number | null
  avatarUrl?: string | null
  address?: string | null
  city?: string | null
  province?: string | null
  phone?: string | null
  website?: string | null
}

type Props = {
  stores: GoogleStorePin[]
  focusStoreId?: string | null
}

export default function GoogleStoresMap({ stores, focusStoreId }: Props) {
  const ref = useRef<HTMLDivElement | null>(null)
  const markersRef = useRef<Record<string, any>>({})
  const mapRef = useRef<any | null>(null)
  const infoRef = useRef<any | null>(null)
  useEffect(() => {
    const apiKey = (import.meta as any).env?.VITE_GOOGLE_MAPS_KEY as string | undefined
    const mapId = (import.meta as any).env?.VITE_GOOGLE_MAPS_MAP_ID as string | undefined
    if (!ref.current || !apiKey) return
    let map: any | null = null
    let markers: any[] = []
    let active = true
    const init = async () => {
      const libs = mapId ? ['places', 'marker'] : ['places']
      const google = await loadGoogleMaps(apiKey, libs)
      if (!active || !ref.current) return
      const g = google.maps
      map = new g.Map(ref.current, {
        center: { lat: -34.6037, lng: -58.3816 },
        zoom: 4,
        mapTypeControl: false,
        streetViewControl: false,
        fullscreenControl: false,
        ...(mapId ? { mapId } : {}),
      })
      mapRef.current = map
      const bounds = new g.LatLngBounds()
      const info = new g.InfoWindow()
      infoRef.current = info
      const geocoder = new g.Geocoder()

      const buildQuery = (s: GoogleStorePin) => {
        const parts = [s.address, s.city, s.province, 'Argentina'].filter(Boolean)
        return parts.join(', ')
      }

      const getCoords = async (s: GoogleStorePin): Promise<{ lat: number; lon: number } | null> => {
        if (typeof s.lat === 'number' && typeof s.lon === 'number') return { lat: s.lat, lon: s.lon }
        const q = buildQuery(s)
        if (!q) return null
        const cacheKey = `geo:${q}`
        try {
          const cached = localStorage.getItem(cacheKey)
          if (cached) {
            const parsed = JSON.parse(cached)
            if (typeof parsed?.lat === 'number' && typeof parsed?.lon === 'number') return parsed
          }
        } catch { /* noop */ }
        const result = await new Promise<{ lat: number; lon: number } | null>((resolve) => {
          geocoder.geocode({ address: q }, (results: any[], status: any) => {
            const ok = status === 'OK' || status === (g as any).GeocoderStatus?.OK
            if (ok && results?.[0]?.geometry?.location) {
              const loc = results[0].geometry.location
              const lat = typeof loc.lat === 'function' ? loc.lat() : loc.lat
              const lon = typeof loc.lng === 'function' ? loc.lng() : loc.lng
              resolve({ lat, lon })
            } else {
              resolve(null)
            }
          })
        })
        if (result) {
          try { localStorage.setItem(cacheKey, JSON.stringify(result)) } catch { /* noop */ }
        }
        return result
      }

      markersRef.current = {}
      for (const s of stores) {
        const coords = await getCoords(s)
        if (!coords) continue
        const position = { lat: coords.lat, lng: coords.lon }

        // Usar AdvancedMarkerElement si está disponible para icono redondo
        const AdvancedMarker = (g as any)?.marker?.AdvancedMarkerElement
        if (AdvancedMarker) {
          const size = 54
          const wrapper = document.createElement('div')
          wrapper.style.width = `${size}px`
          wrapper.style.height = `${size}px`
          wrapper.style.borderRadius = '50%'
          wrapper.style.border = '3px solid #fff'
          wrapper.style.boxShadow = '0 12px 24px rgba(10,20,35,0.42)'
          wrapper.style.background = '#fff'
          wrapper.style.overflow = 'hidden'
          wrapper.style.display = 'flex'
          wrapper.style.alignItems = 'center'
          wrapper.style.justifyContent = 'center'
          if (s.avatarUrl) {
            const img = document.createElement('img')
            img.src = s.avatarUrl
            img.alt = s.name
            img.style.width = '100%'
            img.style.height = '100%'
            img.style.objectFit = 'cover'
            wrapper.appendChild(img)
          } else {
            // Inicial de fallback
            const span = document.createElement('span')
            span.textContent = (s.name || '?').trim().charAt(0).toUpperCase()
            span.style.fontWeight = '700'
            span.style.fontSize = '18px'
            span.style.color = '#0f1724'
            wrapper.appendChild(span)
          }
          const marker = new AdvancedMarker({ map, position, content: wrapper, title: s.name })
          ;(marker as any).__store = s
          marker.addListener('click', () => {
            const address = [s.address, s.city, s.province].filter(Boolean).join(', ')
            const phoneBtn = s.phone ? `<a href=\"tel:${s.phone}\" style=\"padding:6px 10px;border-radius:999px;font-size:12px;text-decoration:none;border:1px solid #0f1724;color:#0f1724;margin-left:6px\">Llamar</a>` : ''
            const webBtn = s.website ? `<a href=\"${s.website}\" target=\"_blank\" rel=\"noopener\" style=\"padding:6px 10px;border-radius:999px;font-size:12px;text-decoration:none;border:1px solid #0f1724;color:#0f1724;margin-left:6px\">Web</a>` : ''
            const html = `
              <div style=\"min-width:220px;max-width:280px\">\n                <div style=\"font-weight:600;color:#0f1724\">${s.name}</div>\n                ${address ? `<div style=\\\"font-size:12px;color:#4b5563;margin-top:2px;white-space:nowrap;overflow:hidden;text-overflow:ellipsis\\\">${address}</div>` : ''}\n                <div style=\"margin-top:8px\">\n                  <a href=\"/tienda/${encodeURIComponent(s.slug)}\" style=\"background:#0f1724;color:#fff;padding:6px 10px;border-radius:999px;font-size:12px;text-decoration:none\">Ver tienda</a>\n                  ${phoneBtn}\n                  ${webBtn}\n                </div>\n              </div>`
            info.setContent(html)
            info.open({ map, anchor: marker })
          })
          bounds.extend(position)
          markers.push(marker)
          markersRef.current[s.id] = marker
        } else {
          // Fallback: marker simple (el icono puede verse cuadrado)
          const marker = new g.Marker({
            position,
            map,
            icon: s.avatarUrl
              ? {
                  url: s.avatarUrl,
                  scaledSize: new g.Size(48, 48),
                }
              : undefined,
            title: s.name,
          })
          ;(marker as any).__store = s
          marker.addListener('click', () => {
            const address = [s.address, s.city, s.province].filter(Boolean).join(', ')
            const phoneBtn = s.phone ? `<a href=\"tel:${s.phone}\" style=\"padding:6px 10px;border-radius:999px;font-size:12px;text-decoration:none;border:1px solid #0f1724;color:#0f1724;margin-left:6px\">Llamar</a>` : ''
            const webBtn = s.website ? `<a href=\"${s.website}\" target=\"_blank\" rel=\"noopener\" style=\"padding:6px 10px;border-radius:999px;font-size:12px;text-decoration:none;border:1px solid #0f1724;color:#0f1724;margin-left:6px\">Web</a>` : ''
            const html = `
              <div style=\"min-width:220px;max-width:280px\">\n                <div style=\"font-weight:600;color:#0f1724\">${s.name}</div>\n                ${address ? `<div style=\\\"font-size:12px;color:#4b5563;margin-top:2px;white-space:nowrap;overflow:hidden;text-overflow:ellipsis\\\">${address}</div>` : ''}\n                <div style=\"margin-top:8px\">\n                  <a href=\"/tienda/${encodeURIComponent(s.slug)}\" style=\"background:#0f1724;color:#fff;padding:6px 10px;border-radius:999px;font-size:12px;text-decoration:none\">Ver tienda</a>\n                  ${phoneBtn}\n                  ${webBtn}\n                </div>\n              </div>`
            info.setContent(html)
            info.open(map, marker)
          })
          bounds.extend(position)
          markers.push(marker)
          markersRef.current[s.id] = marker
        }
      }
      if (!bounds.isEmpty()) map.fitBounds(bounds)
    }
    void init()
    return () => {
      active = false
      try { markers.forEach((m) => m.setMap(null)) } catch { /* noop */ }
      map = null
      mapRef.current = null
      infoRef.current = null
      markersRef.current = {}
    }
  }, [stores])

  useEffect(() => {
    if (!focusStoreId || !mapRef.current) return
    const marker = markersRef.current[focusStoreId]
    if (!marker) return
    const g = (window as any).google?.maps
    const info = infoRef.current || (g ? new g.InfoWindow() : null)
    if (!info) return
    // Compose content from attached store data
    const s = (marker as any).__store as GoogleStorePin | undefined
    if (s) {
      const address = [s.address, s.city, s.province].filter(Boolean).join(', ')
      const phoneBtn = s.phone ? `<a href=\"tel:${s.phone}\" style=\"padding:6px 10px;border-radius:999px;font-size:12px;text-decoration:none;border:1px solid #0f1724;color:#0f1724;margin-left:6px\">Llamar</a>` : ''
      const webBtn = s.website ? `<a href=\"${s.website}\" target=\"_blank\" rel=\"noopener\" style=\"padding:6px 10px;border-radius:999px;font-size:12px;text-decoration:none;border:1px solid #0f1724;color:#0f1724;margin-left:6px\">Web</a>` : ''
      const html = `
        <div style=\"min-width:220px;max-width:280px\">\n          <div style=\"font-weight:600;color:#0f1724\">${s.name}</div>\n          ${address ? `<div style=\\\"font-size:12px;color:#4b5563;margin-top:2px;white-space:nowrap;overflow:hidden;text-overflow:ellipsis\\\">${address}</div>` : ''}\n          <div style=\"margin-top:8px\">\n            <a href=\"/tienda/${encodeURIComponent(s.slug)}\" style=\"background:#0f1724;color:#fff;padding:6px 10px;border-radius:999px;font-size:12px;text-decoration:none\">Ver tienda</a>\n            ${phoneBtn}\n            ${webBtn}\n          </div>\n        </div>`
      info.setContent(html)
    }
    try {
      const pos = marker.position || marker.positionLatLng || marker.position_
      const lat = typeof pos?.lat === 'function' ? pos.lat() : pos?.lat
      const lng = typeof pos?.lng === 'function' ? pos.lng() : pos?.lng
      if (typeof lat === 'number' && typeof lng === 'number') {
        mapRef.current.setCenter({ lat, lng })
        mapRef.current.setZoom(Math.max(mapRef.current.getZoom() || 7, 7))
      }
      if (info.open.length === 1) info.open({ map: mapRef.current, anchor: marker })
      else info.open(mapRef.current, marker)
    } catch { /* noop */ }
  }, [focusStoreId])
  return <div ref={ref} className="h-full w-full min-w-0" />
}
