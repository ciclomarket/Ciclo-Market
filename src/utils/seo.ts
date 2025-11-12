const DEFAULT_SITE_ORIGIN = 'https://www.ciclomarket.ar'

function ensureCanonicalOrigin(raw?: string | null): string {
  if (!raw) return DEFAULT_SITE_ORIGIN
  try {
    const normalized = raw.startsWith('http') ? raw : `https://${raw}`
    const url = new URL(normalized)
    url.protocol = 'https:'
    url.pathname = ''
    url.search = ''
    url.hash = ''
    if (/^ciclomarket\.ar$/i.test(url.hostname)) {
      url.hostname = 'www.ciclomarket.ar'
    }
    if (/^www\.ciclomarket\.ar$/i.test(url.hostname)) {
      return `https://${url.hostname}`
    }
    return url.toString().replace(/\/$/, '')
  } catch {
    return DEFAULT_SITE_ORIGIN
  }
}

export function resolveSiteOrigin(): string {
  const envUrl = (import.meta.env.VITE_FRONTEND_URL ?? import.meta.env.VITE_SITE_URL ?? '').toString().trim()
  if (envUrl) {
    return ensureCanonicalOrigin(envUrl)
  }
  if (typeof window !== 'undefined' && window.location?.origin) {
    return ensureCanonicalOrigin(window.location.origin)
  }
  return DEFAULT_SITE_ORIGIN
}

export function toAbsoluteUrl(value: string | undefined, origin = resolveSiteOrigin()): string | undefined {
  if (!value) return undefined
  try {
    return new URL(value, origin).toString()
  } catch {
    return value
  }
}

export function categoryToCanonicalPath(category: string | null | undefined): string | null {
  if (!category) return null
  const normalized = category.toLowerCase()
  switch (normalized) {
    case 'ruta':
      return '/bicicletas-ruta'
    case 'mtb':
      return '/bicicletas-mtb'
    case 'gravel':
      return '/bicicletas-gravel'
    case 'fixie':
      return '/fixie'
    case 'accesorios':
      return '/accesorios'
    case 'indumentaria':
      return '/indumentaria'
    case 'triatlón':
    case 'triatlon':
      return '/bicicletas-triatlon'
    case 'e-bike':
      return '/marketplace?cat=E-Bike'
    case 'urbana':
      return '/marketplace?cat=Urbana'
    case 'niños':
    case 'ninos':
      return '/marketplace?cat=Niños'
    case 'pista':
      return '/marketplace?cat=Pista'
    default:
      return null
  }
}

export function buildBreadcrumbList(items: Array<{ name: string; item: string }>, origin = resolveSiteOrigin()) {
  if (!Array.isArray(items) || !items.length) return null
  const elements = items
    .filter((entry) => entry && entry.name && entry.item)
    .map((entry, index) => ({
      '@type': 'ListItem',
      position: index + 1,
      name: entry.name,
      item: toAbsoluteUrl(entry.item, origin),
    }))
    .filter((entry) => Boolean(entry.item))

  if (!elements.length) return null

  return {
    '@context': 'https://schema.org',
    '@type': 'BreadcrumbList',
    itemListElement: elements,
  }
}

export { DEFAULT_SITE_ORIGIN, ensureCanonicalOrigin }
