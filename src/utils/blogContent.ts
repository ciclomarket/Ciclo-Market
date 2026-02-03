/**
 * Utilidades para manejar contenido del blog con metadatos embebidos.
 *
 * Compatibilidad: guardamos SEO/JSON‑LD dentro de html_content usando un comentario especial
 * al inicio del documento:
 *   <!-- MB_META:{"seo_title":"...","seo_description":"...","canonical_url":"...","og_image_url":"...","json_ld":[{...}]} -->
 *
 * En render, extraemos ese bloque y también removemos <script type="application/ld+json">
 * y <style> del cuerpo. Los JSON‑LD extraídos se agregan al <head> mediante Helmet.
 */

export type EmbeddedMeta = {
  seoTitle?: string | null
  seoDescription?: string | null
  canonicalUrl?: string | null
  ogImageUrl?: string | null
  jsonLd?: Array<Record<string, unknown>> | null
  theme?: {
    heroBg?: string | null
    heroText?: string | null
    accent?: string | null
    surfaceBg?: string | null
  } | null
}

export type ParsedBlogHtml = {
  contentHtml: string
  meta: EmbeddedMeta
  jsonLdFromScripts: Array<Record<string, unknown>>
}

const META_RE = /<!--\s*MB_META\s*:(.*?)-->/is

function safeParseJson(input: string): any | null {
  try {
    return JSON.parse(input)
  } catch {
    return null
  }
}

export function parseBlogHtmlMeta(rawHtml: string | null | undefined): ParsedBlogHtml {
  const src = typeof rawHtml === 'string' ? rawHtml : ''
  let html = src
  const meta: EmbeddedMeta = {}
  const jsonLdFromScripts: Array<Record<string, unknown>> = []

  // 1) Extraer bloque de metadatos embebidos
  const metaMatch = META_RE.exec(src)
  if (metaMatch && metaMatch[1]) {
    const jsonText = metaMatch[1].trim()
    const parsed = safeParseJson(jsonText)
    if (parsed && typeof parsed === 'object') {
      meta.seoTitle = parsed.seo_title ?? parsed.seoTitle ?? null
      meta.seoDescription = parsed.seo_description ?? parsed.seoDescription ?? null
      meta.canonicalUrl = parsed.canonical_url ?? parsed.canonicalUrl ?? null
      meta.ogImageUrl = parsed.og_image_url ?? parsed.ogImageUrl ?? null
      if (Array.isArray(parsed.json_ld)) {
        meta.jsonLd = parsed.json_ld.filter((obj: any) => obj && typeof obj === 'object')
      } else if (parsed.jsonLd && typeof parsed.jsonLd === 'object') {
        meta.jsonLd = [parsed.jsonLd]
      } else {
        meta.jsonLd = null
      }
      // Theme tokens
      const theme = parsed.theme
      if (theme && typeof theme === 'object') {
        meta.theme = {
          heroBg: theme.heroBg ?? theme.hero_bg ?? null,
          heroText: theme.heroText ?? theme.hero_text ?? null,
          accent: theme.accent ?? null,
          surfaceBg: theme.surfaceBg ?? theme.surface_bg ?? null,
        }
      }
    }
    // Quitar el bloque del HTML para no mostrarlo en el cuerpo
    html = html.replace(META_RE, '').trimStart()
  }

  // 2) Extraer <script type="application/ld+json">…</script>
  const SCRIPT_JSON_LD_RE = /<script[^>]*type\s*=\s*"application\/ld\+json"[^>]*>([\s\S]*?)<\/script>/gi
  html = html.replace(SCRIPT_JSON_LD_RE, (_full, jsonContent: string) => {
    const parsed = safeParseJson(jsonContent)
    if (parsed) {
      if (Array.isArray(parsed)) {
        for (const item of parsed) {
          if (item && typeof item === 'object') jsonLdFromScripts.push(item)
        }
      } else if (typeof parsed === 'object') {
        jsonLdFromScripts.push(parsed)
      }
    }
    return ''
  })

  // 3) Remover estilos embebidos para evitar que se impriman como texto o rompan layout
  const STYLE_RE = /<style[^>]*>[\s\S]*?<\/style>/gi
  html = html.replace(STYLE_RE, '')

  return {
    contentHtml: html,
    meta,
    jsonLdFromScripts,
  }
}

export function buildEmbeddedMetaComment(meta: EmbeddedMeta): string {
  const payload: Record<string, unknown> = {}
  if (meta.seoTitle) payload.seo_title = meta.seoTitle
  if (meta.seoDescription) payload.seo_description = meta.seoDescription
  if (meta.canonicalUrl) payload.canonical_url = meta.canonicalUrl
  if (meta.ogImageUrl) payload.og_image_url = meta.ogImageUrl
  if (Array.isArray(meta.jsonLd) && meta.jsonLd.length) payload.json_ld = meta.jsonLd
  if (meta.theme && typeof meta.theme === 'object') {
    payload.theme = {
      heroBg: meta.theme.heroBg ?? undefined,
      heroText: meta.theme.heroText ?? undefined,
      accent: meta.theme.accent ?? undefined,
      surfaceBg: meta.theme.surfaceBg ?? undefined,
    }
  }
  const text = JSON.stringify(payload)
  return `<!-- MB_META:${text} -->`
}
