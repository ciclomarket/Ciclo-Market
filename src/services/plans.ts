import { getSupabaseClient, supabaseEnabled } from './supabase'
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

const normalizePlan = (row: PlanRow): Plan => {
  const periodDays = row.period_days ?? 30
  const listingDuration = row.listing_duration_days ?? periodDays
  const featuredDays = row.featured_days ?? row.featured_slots ?? 0

  return {
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
    description: row.description ?? undefined,
    accentColor: row.accent_color ?? undefined,
    createdAt: row.created_at ? Date.parse(row.created_at) : undefined
  }
}

export const FALLBACK_PLANS: Plan[] = [
  {
    id: 'free',
    code: 'free',
    name: 'Gratis',
    price: 0,
    currency: 'ARS',
    periodDays: 30,
    listingDurationDays: 30,
    maxListings: 1,
    maxPhotos: 4,
    featuredDays: 0,
    whatsappEnabled: false,
    socialBoost: false,
    description: 'Publicá gratis por 30 días. Hasta 4 fotos, contacto por chat y email.'
  },
  {
    id: 'basic',
    code: 'basic',
    name: 'Básica',
    price: 9000,
    currency: 'ARS',
    periodDays: 60,
    listingDurationDays: 60,
    maxListings: 1,
    maxPhotos: 6,
    featuredDays: 7,
    whatsappEnabled: true,
    socialBoost: false,
    description: '60 días online, destaque 7 días y contacto directo por WhatsApp.'
  },
  {
    id: 'premium',
    code: 'premium',
    name: 'Premium',
    price: 13000,
    currency: 'ARS',
    periodDays: 60,
    listingDurationDays: 60,
    maxListings: 1,
    maxPhotos: 8,
    featuredDays: 14,
    whatsappEnabled: true,
    socialBoost: true,
    description: 'Destaque 14 días, publicación en Instagram y Facebook y contacto por WhatsApp.'
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
