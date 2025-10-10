const URL_LIKE_REGEX = /^(?:https?:\/\/|wa\.(?:me|link)\/|api\.whatsapp\.com\/)/i

const ARG_COUNTRY_CODE = '54'

const stripToDigits = (value: string): string => (value.match(/\d+/g) ?? []).join('')

const ensureHttps = (value: string): string => (value.startsWith('http') ? value : `https://${value}`)

const ensureArgentinaPrefix = (digits: string): string => {
  if (!digits) return ''
  const withoutExit = digits.replace(/^00+/, '')
  const withoutLeadingZeros = withoutExit.replace(/^0+/, '')
  if (!withoutLeadingZeros) return ''
  if (withoutLeadingZeros.startsWith(ARG_COUNTRY_CODE)) return withoutLeadingZeros
  return `${ARG_COUNTRY_CODE}${withoutLeadingZeros}`
}

const isWhatsappUrl = (value: string): boolean => URL_LIKE_REGEX.test(value)

/**
 * Normaliza un número de WhatsApp ingresado por el usuario para almacenarlo.
 * Siempre intenta devolver el formato internacional sin el prefijo "+" (ej.: 5491122334455).
 * Si recibe una URL válida se devuelve en formato URL para no romper datos existentes.
 */
export function normaliseWhatsapp(value?: string | null): string | null {
  if (!value) return null
  const trimmed = value.trim()
  if (!trimmed) return null

  if (isWhatsappUrl(trimmed)) {
    try {
      const url = new URL(ensureHttps(trimmed))
      const digits = stripToDigits(url.pathname)
      if (digits) {
        const formatted = ensureArgentinaPrefix(digits)
        return formatted || null
      }
      return url.toString()
    } catch {
      // Si falla al parsear la URL continuamos con la lógica numérica.
    }
  }

  const digits = stripToDigits(trimmed)
  const formatted = ensureArgentinaPrefix(digits)
  return formatted || null
}

/**
 * Extrae el número local (sin +54) a partir de un valor almacenado o ingresado previamente.
 */
export function extractLocalWhatsapp(value?: string | null): string {
  if (!value) return ''
  const trimmed = value.trim()
  if (!trimmed) return ''
  const digits = stripToDigits(trimmed)
  if (!digits) return ''
  const formatted = ensureArgentinaPrefix(digits)
  if (!formatted) return ''
  return formatted.startsWith(ARG_COUNTRY_CODE) ? formatted.slice(ARG_COUNTRY_CODE.length) : formatted
}

/**
 * Construye un enlace de WhatsApp con el texto prellenado si es posible.
 */
export function buildWhatsappUrl(raw?: string | null, message?: string): string | null {
  if (!raw) return null
  const trimmed = raw.trim()
  if (!trimmed) return null

  const tryAppendMessage = (value: string) => {
    if (!message) return value
    try {
      const url = new URL(ensureHttps(value))
      if (!url.searchParams.has('text')) {
        url.searchParams.set('text', message)
      }
      return url.toString()
    } catch {
      return value
    }
  }

  if (isWhatsappUrl(trimmed)) {
    return tryAppendMessage(trimmed)
  }

  const formatted = normaliseWhatsapp(trimmed)
  if (!formatted) return null

  if (isWhatsappUrl(formatted)) {
    return tryAppendMessage(formatted)
  }

  const base = `https://wa.me/${formatted}`
  return message ? `${base}?text=${encodeURIComponent(message)}` : base
}

/**
 * Limpia un input libre dejando solo dígitos.
 */
export function sanitizeLocalWhatsappInput(value: string): string {
  return value.replace(/[^0-9]/g, '')
}
