import { getSupabaseClient, supabaseEnabled } from './supabase'
import { canonicalPlanCode, normalisePlanText } from '../utils/planCodes'
import type { Plan } from '../types'

type PlanRow = {
  id: string
  code?: string | null
  name: string
  price: number
  currency: string
  period_days: number
  listing_duration_days?: number | null
  max_listings: number
  max_photos: number
  featured_slots?: number | null
  featured_days?: number | null
  whatsapp_enabled: boolean
  social_boost?: boolean | null
  description?: string | null
  accent_color?: string | null
  created_at?: string | null
}

function sanitizeDescription(desc?: string | null, code?: string | null): string | undefined {
  if (!desc) return undefined
  const plan = canonicalPlanCode(code) || canonicalPlanCode(desc) || null
  let out = desc
  if (plan === 'basic' || plan === 'premium') {
    // Quitar frases de "destaque X días" para evitar duplicado con features
    out = out.replace(/desta(?:cado|cada|que|queado)?[^.!?\n,;]*\d+\s*d[ií]as?/gi, '')
    out = out.replace(/desta(?:cado|cada|que|queado)?[^.!?\n,;]*/gi, '')
  }
  // Limpieza general: espacios dobles, puntuación sobrante al final
  out = out.replace(/\s{2,}/g, ' ').replace(/[\s,;.-]+$/g, '').trim()
  // Quitar puntuación y espacios al inicio (p.ej. ", difusión …")
  out = out.replace(/^[,;.\s]+/, '')
  // Capitalizar primera letra si es minúscula
  if (out) out = out.charAt(0).toUpperCase() + out.slice(1)
  return out || undefined
}

const normalizePlan = (row: PlanRow): Plan => {
  const periodDays = row.period_days ?? 30
  const listingDuration = row.listing_duration_days ?? periodDays
  const featuredDays = row.featured_days ?? row.featured_slots ?? 0
  const code =
    canonicalPlanCode(row.code ?? undefined) ||
    canonicalPlanCode(row.id ?? undefined) ||
    canonicalPlanCode(row.name ?? undefined)

  // Base mapping
  const mapped: Plan = {
    id: row.id,
    code: row.code ?? row.id,
    name: row.name,
    price: Number(row.price ?? 0),
    currency: row.currency ?? 'ARS',
    periodDays,
    listingDurationDays: listingDuration,
    maxListings: row.max_listings ?? 1,
    maxPhotos: row.max_photos ?? 4,
    featuredDays,
    whatsappEnabled: Boolean(row.whatsapp_enabled),
    socialBoost: Boolean(row.social_boost ?? false),
    description: sanitizeDescription(row.description ?? undefined, row.code ?? row.id ?? row.name),
    accentColor: row.accent_color ?? undefined,
    createdAt: row.created_at ? Date.parse(row.created_at) : undefined
  }

  // Overrides por reglas de negocio
  if (code === 'free') {
    mapped.periodDays = 15
    mapped.listingDurationDays = 15
    mapped.maxListings = 1
    mapped.whatsappEnabled = false
    mapped.description = 'Excelente opción para comenzar a vender de forma rápida y segura.'
  }
  if (code === 'basic' || code === 'premium') {
    // 0 = ilimitadas
    mapped.maxListings = 0
  }
  if (code === 'basic') {
    mapped.description = 'Aprovechá nuestros servicios de destaque y contacto directo.'
  }
  if (code === 'premium') {
    mapped.description = 'Llegá a más clientes apareciendo en redes y anuncios.'
  }
  return mapped
}

export const FALLBACK_PLANS: Plan[] = [
  {
    id: 'free',
    code: 'free',
    name: 'Gratis',
    price: 0,
    currency: 'ARS',
    periodDays: 15,
    listingDurationDays: 15,
    maxListings: 1,
    maxPhotos: 4,
    featuredDays: 0,
    whatsappEnabled: false,
    socialBoost: false,
    description: 'Excelente opción para comenzar a vender de forma rápida y segura.'
  },
  {
    id: 'basic',
    code: 'basic',
    name: 'Básica',
    price: 9000,
    currency: 'ARS',
    periodDays: 60,
    listingDurationDays: 60,
    maxListings: 0,
    maxPhotos: 6,
    featuredDays: 7,
    whatsappEnabled: true,
    socialBoost: false,
    description: 'Aprovechá nuestros servicios de destaque y contacto directo.'
  },
  {
    id: 'premium',
    code: 'premium',
    name: 'Premium',
    price: 13000,
    currency: 'ARS',
    periodDays: 60,
    listingDurationDays: 60,
    maxListings: 0,
    maxPhotos: 8,
    featuredDays: 14,
    whatsappEnabled: true,
    socialBoost: true,
    description: 'Llegá a más clientes apareciendo en redes y anuncios.'
  }
]

export async function fetchPlans(): Promise<Plan[]> {
  if (!supabaseEnabled) return FALLBACK_PLANS
  try {
    const supabase = getSupabaseClient()
    const { data, error } = await supabase
      .from('plans')
      .select('*')
      .order('price', { ascending: true })
    if (error || !data || data.length === 0) return FALLBACK_PLANS
    return data.map((row) => normalizePlan(row as PlanRow))
  } catch {
    return FALLBACK_PLANS
  }
}
