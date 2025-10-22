import { slugify } from './slug'

export function formatNameWithInitial(fullName?: string | null, fallbackEmail?: string | null): string {
  if (fullName && fullName.trim().length > 0) {
    const parts = fullName.trim().split(/\s+/)
    const first = parts[0]
    const lastInitial = parts.length > 1 ? parts[parts.length - 1][0] : undefined
    if (lastInitial) {
      return `${capitalize(first)} ${capitalize(lastInitial)}.`
    }
    return capitalize(first)
  }
  if (fallbackEmail) {
    const localPart = fallbackEmail.split('@')[0]
    return capitalize(localPart)
  }
  return 'Vendedor'
}

export function deriveProfileSlug({
  fullName,
  discipline,
  fallback
}: {
  fullName: string
  discipline: 'ruta' | 'mtb' | 'gravel' | 'urbana'
  fallback: string
}): string {
  const baseSlug = slugify(fullName).replace(/-/g, '')
  const safeBase = baseSlug || slugify(fallback).replace(/-/g, '') || 'usuario'
  return `${safeBase}_${discipline}`
}

export function pickDiscipline(preferences: readonly string[] | string[] = []): 'ruta' | 'mtb' | 'gravel' | 'urbana' {
  const lower = preferences.map((pref) => pref.toLowerCase())
  if (lower.includes('ruta')) return 'ruta'
  if (lower.includes('gravel')) return 'gravel'
  if (lower.includes('mtb')) return 'mtb'
  return 'urbana'
}

export function capitalize(value?: string | number): string {
  if (value === undefined || value === null) return ''
  const text = String(value)
  if (!text) return ''
  return text.charAt(0).toUpperCase() + text.slice(1)
}

// -------------------------- Trust level (perfil) ---------------------------

export type TrustLevel = 'basic' | 'semi_pro' | 'pro' | 'verified'

export interface TrustRelevantFields {
  verified?: boolean | null
  instagram_handle?: string | null
  facebook_handle?: string | null
  website_url?: string | null
  whatsapp_number?: string | null
}

export interface TrustReviewsInfo {
  count?: number | null
  avgRating?: number | null
}

/**
 * Deriva el nivel de confianza del usuario según su perfil público.
 * Reglas:
 *  - verified === true => 'verified'
 *  - Si tiene al menos un dato de contacto/red (ig/fb/web/whatsapp) => 'connected'
 *  - Caso contrario => 'basic'
 */
export function computeTrustLevel(p: TrustRelevantFields | null | undefined, reviews?: TrustReviewsInfo | null): TrustLevel {
  if (!p) return 'basic'
  if (p.verified === true) return 'verified'
  const count = typeof reviews?.count === 'number' ? reviews!.count! : 0
  const avg = typeof reviews?.avgRating === 'number' ? reviews!.avgRating! : 0
  // Pro: al menos 1 reseña y promedio >= 4
  if (count >= 1 && avg >= 4) return 'pro'
  // Semi-pro: señales sociales/contacto
  const hasSocialOrContact = [p.instagram_handle, p.facebook_handle, p.website_url, p.whatsapp_number]
    .map((v) => (typeof v === 'string' ? v.trim() : ''))
    .some((v) => v.length > 0)
  return hasSocialOrContact ? 'semi_pro' : 'basic'
}

export function trustLabel(level: TrustLevel, variant: 'short' | 'long' = 'long'): string {
  switch (level) {
    case 'verified':
      return variant === 'short' ? 'Verificado' : 'Vendedor verificado'
    case 'pro':
      return variant === 'short' ? 'Pro' : 'Vendedor Pro'
    case 'semi_pro':
      return variant === 'short' ? 'Semi-pro' : 'Vendedor semi-pro'
    case 'basic':
    default:
      return variant === 'short' ? 'Amateur' : 'Vendedor amateur'
  }
}

export function trustColorClasses(level: TrustLevel): { bg: string; text: string; border: string } {
  // Mantener contraste por defecto
  return { bg: 'bg-[#14212e]', text: 'text-white', border: 'border-[#0f1924]' }
}

// Fondo interno sutil por nivel (sin sombras)
export function trustBadgeBgClasses(level: TrustLevel): string {
  switch (level) {
    case 'verified':
      return 'bg-[linear-gradient(135deg,#14212e_0%,#1e3a34_100%)]'
    case 'pro':
      return 'bg-[linear-gradient(135deg,#14212e_0%,#1f3b2e_100%)]'
    case 'semi_pro':
      return 'bg-[linear-gradient(135deg,#14212e_0%,#15364a_100%)]'
    case 'basic':
    default:
      return 'bg-[linear-gradient(135deg,#14212e_0%,#1a2633_100%)]'
  }
}

export function trustDescription(level: TrustLevel): string {
  switch (level) {
    case 'verified':
      return 'Usuario verificado por Ciclo Market: ofrece toda la información y documentación para ser un vendedor verificado.'
    case 'pro':
      return 'Cuenta con reseñas positivas de la comunidad (al menos 1 reseña con 3★ o más).'
    case 'semi_pro':
      return 'Incluye redes, fotos e información para que puedas saber quién vende/compra.'
    case 'basic':
    default:
      return 'No ofrece mucha información de su persona.'
  }
}
