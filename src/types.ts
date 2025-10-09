export type Category = 'Ruta'|'MTB'|'Gravel'|'Urbana'|'Accesorios'|'E-Bike'|'Niños'|'Pista'|'Triatlón'|'Indumentaria'

export type SellerPlan = 'basic' | 'premium' | 'featured' | 'pro'

export interface Listing {
  id: string
  slug?: string
  title: string
  brand: string
  model: string
  year?: number
  category: Category
  price: number
  priceCurrency?: 'USD' | 'ARS'
  /** Precio anterior (para mostrar rebaja en "Ofertas únicas") */
  originalPrice?: number
  location: string
  description: string
  images: string[]
  sellerId: string
  sellerName?: string
  sellerPlan?: SellerPlan
  sellerPlanExpires?: number
  sellerLocation?: string
  sellerWhatsapp?: string
  sellerEmail?: string
  sellerAvatar?: string
  material?: string
  frameSize?: string
  drivetrain?: string
  drivetrainDetail?: string
  wheelset?: string
  wheelSize?: string
  extras?: string
  plan?: string
  status?: 'draft' | 'active' | 'paused' | 'sold' | 'expired' | 'archived'
  expiresAt?: number | null
  renewalNotifiedAt?: number | null
  createdAt: number
}

export interface UserProfile {
  uid: string
  name: string
  photoURL?: string
  location?: string
  bio?: string
}

export interface Plan {
  id: string
  /** Código legible usado en URLs/queries (p.e. free, basic, premium). */
  code?: string | null
  name: string
  price: number
  currency: string
  /**
   * Duración general asociada al plan. Para planes por publicación coincide con los días activos de la publicación.
   */
  periodDays: number
  /**
   * Duración específica de la publicación (permite separar futuros planes con distinta lógica).
   */
  listingDurationDays?: number
  maxListings: number
  maxPhotos: number
  /** Días que la publicación permanece destacada en portada. */
  featuredDays: number
  whatsappEnabled: boolean
  /** Indica si la publicación se difunde automáticamente en redes. */
  socialBoost?: boolean
  description?: string | null
  accentColor?: string | null
  createdAt?: number
}

export interface Subscription {
  id: string
  userId: string
  planId: string
  status: 'active' | 'cancelled' | 'expired' | 'pending'
  startsAt: number
  endsAt?: number | null
  cancelAt?: number | null
  createdAt?: number
  updatedAt?: number
  plan?: Plan
  autoRenew?: boolean
}
