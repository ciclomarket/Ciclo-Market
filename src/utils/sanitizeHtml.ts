const GLOBAL_ALLOWED_ATTRS = new Set(['class', 'id', 'title', 'aria-label', 'aria-hidden', 'role'])

const TAG_ALLOWED_ATTRS: Record<string, Set<string>> = {
  a: new Set(['href', 'target', 'rel']),
  img: new Set(['src', 'alt', 'title', 'width', 'height', 'loading']),
  iframe: new Set(['src', 'title', 'allow', 'allowfullscreen', 'frameborder']),
  blockquote: new Set(['cite']),
  code: new Set(['language']),
  pre: new Set(['data-lang']),
  ol: new Set(['start', 'type']),
  li: new Set(['value']),
  table: new Set(['summary']),
  th: new Set(['scope', 'colspan', 'rowspan']),
  td: new Set(['colspan', 'rowspan']),
}

const ALLOWED_TAGS = new Set([
  'p',
  'br',
  'strong',
  'em',
  'u',
  's',
  'ul',
  'ol',
  'li',
  'h1',
  'h2',
  'h3',
  'h4',
  'h5',
  'h6',
  'blockquote',
  'pre',
  'code',
  'span',
  'div',
  'img',
  'figure',
  'figcaption',
  'a',
  'iframe',
  'hr',
  'table',
  'thead',
  'tbody',
  'tfoot',
  'tr',
  'th',
  'td',
])

const YOUTUBE_HOSTS = ['www.youtube.com', 'youtube.com', 'youtu.be']
const VIMEO_HOSTS = ['player.vimeo.com', 'vimeo.com']

function cleanHref(value: string): string | null {
  const trimmed = value.trim()
  if (!trimmed) return null
  if (/^mailto:|^tel:/i.test(trimmed)) return trimmed
  try {
    const url = new URL(trimmed, 'https://example.com')
    if (url.protocol === 'http:' || url.protocol === 'https:') {
      if (url.hostname === 'example.com') {
        // relative URL -> keep path/query/hash
        return url.pathname + url.search + url.hash
      }
      return url.toString()
    }
  } catch {
    return null
  }
  return null
}

function cleanSrc(value: string, tagName: string): string | null {
  const trimmed = value.trim()
  if (!trimmed) return null
  if (tagName === 'img' && /^data:image\//i.test(trimmed)) {
    return trimmed
  }
  try {
    const url = new URL(trimmed, 'https://example.com')
    if (url.protocol !== 'http:' && url.protocol !== 'https:') return null
    if (url.hostname === 'example.com') {
      return url.pathname + url.search + url.hash
    }
    if (tagName === 'iframe') {
      const host = url.hostname.toLowerCase()
      const isYoutube = YOUTUBE_HOSTS.includes(host)
      const isVimeo = VIMEO_HOSTS.includes(host)
      if (!isYoutube && !isVimeo) return null
    }
    return url.toString()
  } catch {
    return null
  }
}

function sanitizeElementAttributes(el: Element) {
  const tag = el.tagName.toLowerCase()
  const allowed = TAG_ALLOWED_ATTRS[tag] ?? new Set<string>()

  for (const attr of Array.from(el.attributes)) {
    const name = attr.name.toLowerCase()
    const value = attr.value

    if (name.startsWith('on')) {
      el.removeAttribute(attr.name)
      continue
    }

    if (name === 'style') {
      el.removeAttribute(attr.name)
      continue
    }

    if (name === 'href' && tag === 'a') {
      const safeHref = cleanHref(value)
      if (safeHref) {
        el.setAttribute('href', safeHref)
        if (safeHref.startsWith('http')) {
          el.setAttribute('target', '_blank')
          el.setAttribute('rel', 'noopener noreferrer')
        }
      } else {
        el.removeAttribute(attr.name)
      }
      continue
    }

    if (name === 'src' && (tag === 'img' || tag === 'iframe')) {
      const safeSrc = cleanSrc(value, tag)
      if (safeSrc) {
        el.setAttribute('src', safeSrc)
      } else {
        el.removeAttribute(attr.name)
      }
      continue
    }

    const isGlobalAllowed = GLOBAL_ALLOWED_ATTRS.has(name)
    const isTagAllowed = allowed.has(name)
    if (!isGlobalAllowed && !isTagAllowed) {
      el.removeAttribute(attr.name)
      continue
    }

    if (name === 'class') {
      const classValue = value
        .split(/\s+/)
        .filter(Boolean)
        .map((c) => c.replace(/[^a-zA-Z0-9:_-]/g, ''))
        .join(' ')
      if (classValue) {
        el.setAttribute('class', classValue)
      } else {
        el.removeAttribute('class')
      }
    }
  }
}

function sanitizeNode(node: Node) {
  if (node.nodeType === Node.ELEMENT_NODE) {
    const el = node as Element
    const tagName = el.tagName.toLowerCase()
    if (!ALLOWED_TAGS.has(tagName)) {
      // Replace forbidden element with its children
      const parent = el.parentNode
      if (parent) {
        while (el.firstChild) {
          parent.insertBefore(el.firstChild, el)
        }
        parent.removeChild(el)
      }
      return
    }

    if (tagName === 'iframe') {
      el.setAttribute('allowfullscreen', 'true')
      if (!el.hasAttribute('allow')) {
        el.setAttribute('allow', 'accelerometer; autoplay; clipboard-write; encrypted-media; gyroscope; picture-in-picture; web-share')
      }
    }

    sanitizeElementAttributes(el)
  }

  for (const child of Array.from(node.childNodes)) {
    sanitizeNode(child)
  }
}

export function sanitizeHtml(html: string): string {
  if (typeof html !== 'string' || html.trim().length === 0) return ''
  if (typeof window === 'undefined') {
    // SSR fallback: defer sanitization to client
    return html
  }
  const template = window.document.createElement('template')
  template.innerHTML = html
  sanitizeNode(template.content)
  return template.innerHTML
}

