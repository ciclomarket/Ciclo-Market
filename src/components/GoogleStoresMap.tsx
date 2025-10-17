import { useEffect, useRef } from 'react'

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
}

function loadGoogleMaps(apiKey: string): Promise<void> {
  return new Promise((resolve, reject) => {
    if (window.google && window.google.maps) return resolve()
    const existing = document.getElementById('google-maps-js') as HTMLScriptElement | null
    if (existing) {
      existing.addEventListener('load', () => resolve(), { once: true })
      existing.addEventListener('error', () => reject(new Error('Google Maps failed to load')), { once: true })
      return
    }
    const script = document.createElement('script')
    script.id = 'google-maps-js'
    script.async = true
    script.defer = true
    script.src = `https://maps.googleapis.com/maps/api/js?key=${encodeURIComponent(apiKey)}`
    script.onload = () => resolve()
    script.onerror = () => reject(new Error('Google Maps failed to load'))
    document.body.appendChild(script)
  })
}

export default function GoogleStoresMap({ stores }: { stores: GoogleStorePin[] }) {
  const ref = useRef<HTMLDivElement | null>(null)
  useEffect(() => {
    const apiKey = (import.meta as any).env?.VITE_GOOGLE_MAPS_KEY as string | undefined
    if (!ref.current || !apiKey) return
    let map: any | null = null
    let markers: any[] = []
    let active = true
    const init = async () => {
      await loadGoogleMaps(apiKey)
      if (!active || !ref.current) return
      const g = window.google
      map = new g.maps.Map(ref.current, {
        center: { lat: -34.6037, lng: -58.3816 },
        zoom: 4,
        mapTypeControl: false,
        streetViewControl: false,
        fullscreenControl: false,
      })
      const bounds = new g.maps.LatLngBounds()
      markers = stores.filter((s) => typeof s.lat === 'number' && typeof s.lon === 'number').map((s) => {
        const position = { lat: s.lat as number, lng: s.lon as number }
        const marker = new g.maps.Marker({
          position,
          map,
          icon: s.avatarUrl
            ? {
                url: s.avatarUrl,
                scaledSize: new g.maps.Size(48, 48),
              }
            : undefined,
          title: s.name,
        })
        marker.addListener('click', () => {
          window.location.href = `/tienda/${encodeURIComponent(s.slug)}`
        })
        bounds.extend(position)
        return marker
      })
      if (!bounds.isEmpty()) map.fitBounds(bounds)
    }
    void init()
    return () => {
      active = false
      try { markers.forEach((m) => m.setMap(null)) } catch { /* noop */ }
      map = null
    }
  }, [stores])
  return <div ref={ref} className="h-full w-full" />
}
