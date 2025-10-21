let loadingPromise: Promise<typeof window.google> | null = null

/**
 * Loads the Google Maps JavaScript API, reusing a single script tag across the app.
 * By default we request the Places library so Autocomplete works wherever needed.
 */
export function loadGoogleMaps(apiKey: string, libraries: string[] = ['places']): Promise<typeof window.google> {
  if (typeof window === 'undefined') return Promise.reject(new Error('Google Maps sólo está disponible en el navegador'))
  if (window.google && window.google.maps) return Promise.resolve(window.google)
  if (loadingPromise) return loadingPromise

  const params = new URLSearchParams()
  params.set('key', apiKey)
  const libs = Array.from(new Set(libraries.filter(Boolean)))
  if (libs.length) params.set('libraries', libs.join(','))
  params.set('language', 'es')
  params.set('region', 'AR')

  loadingPromise = new Promise((resolve, reject) => {
    const existing = document.getElementById('google-maps-js') as HTMLScriptElement | null
    const handleLoad = () => {
      if (window.google && window.google.maps) resolve(window.google)
      else reject(new Error('Google Maps no inicializó correctamente'))
    }
    const handleError = () => reject(new Error('No se pudo cargar Google Maps'))

    if (existing) {
      existing.addEventListener('load', handleLoad, { once: true })
      existing.addEventListener('error', handleError, { once: true })
      return
    }

    const script = document.createElement('script')
    script.id = 'google-maps-js'
    script.async = true
    script.defer = true
    script.src = `https://maps.googleapis.com/maps/api/js?${params.toString()}`
    script.addEventListener('load', handleLoad, { once: true })
    script.addEventListener('error', handleError, { once: true })
    document.body.appendChild(script)
  })

  return loadingPromise
}
