// Bookmarklet "→ Ciclo Market": corre en la pestaña de la publicación (Marketplace, ML, etc.),
// junta el texto y las fotos que ya están cargadas en pantalla y abre el admin en /prefills
// con esos datos en el hash (#import=...). El hash nunca viaja a ningún servidor.

export const IMPORT_HASH_PREFIX = '#import='

export type BookmarkletPayload = {
  text: string
  images: string[]
  sourceUrl: string
}

// Se serializa con toString(), así que no puede usar nada de fuera de la función.
function collect(adminUrl: string) {
  const MAX_IMAGES = 12
  const seen: Record<string, true> = {}
  const images: string[] = []
  const add = (url: string | null | undefined) => {
    if (!url || !/^https:\/\//.test(url) || seen[url]) return
    seen[url] = true
    images.push(url)
  }
  const allImgs = Array.from(document.images)

  if (/mercadoli[bv]re/.test(location.hostname)) {
    // ML guarda la versión grande de cada foto de la galería en data-zoom.
    document.querySelectorAll('img[data-zoom]').forEach((img) => add(img.getAttribute('data-zoom')))
  } else {
    // Facebook marca las fotos de la galería con un alt tipo "Foto del producto de …".
    allImgs.forEach((img) => {
      if (/product photo|foto del producto|imagen del producto|foto do produto/i.test(img.alt || '')) add(img.currentSrc || img.src)
    })
  }

  // Respaldo: imágenes grandes en la parte de arriba de la página (la galería),
  // dejando afuera las "publicaciones similares" que aparecen más abajo.
  if (images.length < 2) {
    allImgs.forEach((img) => {
      const top = img.getBoundingClientRect().top + window.scrollY
      if (img.naturalWidth >= 400 && img.naturalHeight >= 300 && top < 1400) add(img.currentSrc || img.src)
    })
  }

  const main = (document.querySelector('[role="main"]') as HTMLElement | null) || document.body
  const payload = {
    text: `${document.title}\n${main.innerText}`.slice(0, 6000),
    images: images.slice(0, MAX_IMAGES),
    sourceUrl: location.href,
  }
  window.open(`${adminUrl}#import=${encodeURIComponent(JSON.stringify(payload))}`, '_blank')
}

export function buildBookmarkletHref(adminPrefillsUrl: string): string {
  const code = `(${collect.toString()})(${JSON.stringify(adminPrefillsUrl)});void 0`
  return `javascript:${encodeURIComponent(code)}`
}

export function readImportPayloadFromHash(hash: string): BookmarkletPayload | null {
  if (!hash.startsWith(IMPORT_HASH_PREFIX)) return null
  try {
    const parsed = JSON.parse(decodeURIComponent(hash.slice(IMPORT_HASH_PREFIX.length)))
    return {
      text: typeof parsed?.text === 'string' ? parsed.text : '',
      images: Array.isArray(parsed?.images) ? parsed.images.filter((u: unknown) => typeof u === 'string') : [],
      sourceUrl: typeof parsed?.sourceUrl === 'string' ? parsed.sourceUrl : '',
    }
  } catch {
    return null
  }
}
