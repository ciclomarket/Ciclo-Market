export type SeoPayload = {
  title?: string
  description?: string
  image?: string
  url?: string
}

const DEFAULT_TITLE = 'Ciclo Market | Marketplace de bicicletas'
const DEFAULT_DESCRIPTION = 'Comprá y vendé bicicletas usadas o nuevas en Ciclo Market. Planes flexibles, publicaciones destacadas y contacto directo con vendedores verificados.'

function computeDefaultImage(): string {
  if (typeof window === 'undefined') return '/hero-market.jpg'
  return `${window.location.origin}/hero-market.jpg`
}

function computeDefaultUrl(): string {
  if (typeof window === 'undefined') return 'https://ciclomarket.ar'
  return window.location.href
}

const META_NAME_MAP: Record<string, string> = {
  description: 'description',
  twitterCard: 'twitter:card'
}

const META_PROPERTY_MAP: Record<string, string> = {
  ogTitle: 'og:title',
  ogDescription: 'og:description',
  ogImage: 'og:image',
  ogUrl: 'og:url'
}

function setMetaWithAttribute(attr: 'name' | 'property', key: string, value: string) {
  if (typeof document === 'undefined') return
  let element = document.querySelector(`meta[${attr}="${key}"]`)
  if (!element) {
    element = document.createElement('meta')
    element.setAttribute(attr, key)
    document.head.appendChild(element)
  }
  element.setAttribute('content', value)
}

export function applySeo(payload: SeoPayload) {
  if (typeof document === 'undefined') return
  const title = payload.title ?? DEFAULT_TITLE
  document.title = title

  const description = payload.description ?? DEFAULT_DESCRIPTION
  setMetaWithAttribute('name', META_NAME_MAP.description, description)

  const url = payload.url ?? computeDefaultUrl()
  const image = payload.image ?? computeDefaultImage()

  setMetaWithAttribute('property', META_PROPERTY_MAP.ogTitle, title)
  setMetaWithAttribute('property', META_PROPERTY_MAP.ogDescription, description)
  setMetaWithAttribute('property', META_PROPERTY_MAP.ogImage, image)
  setMetaWithAttribute('property', META_PROPERTY_MAP.ogUrl, url)
  setMetaWithAttribute('name', META_NAME_MAP.twitterCard, 'summary_large_image')
}

export function resetSeo() {
  applySeo({})
}
