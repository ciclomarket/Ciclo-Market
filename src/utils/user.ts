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
