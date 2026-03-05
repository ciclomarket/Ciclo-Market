import posthog from 'posthog-js'

type SearchFilters = Record<string, unknown>

let initialized = false

function isBrowser(): boolean {
  return typeof window !== 'undefined'
}

function getPostHogConfig() {
  const key = String(import.meta.env.VITE_POSTHOG_KEY || '').trim()
  const host = String(import.meta.env.VITE_POSTHOG_HOST || 'https://app.posthog.com').trim()
  return { key, host }
}

export function initPostHog(): void {
  if (!isBrowser() || initialized) return
  const { key, host } = getPostHogConfig()
  if (!key) return

  posthog.init(key, {
    api_host: host || 'https://app.posthog.com',
    autocapture: true,
    capture_pageview: false,
    session_recording: {
      maskAllInputs: true,
      maskInputOptions: {
        password: true,
        email: true,
      },
    },
  })
  initialized = true
}

function capture(event: string, properties?: Record<string, unknown>): void {
  if (!isBrowser()) return
  if (!initialized) initPostHog()
  if (!initialized) return
  try {
    posthog.capture(event, properties)
  } catch {
    // no-op
  }
}

export function capturePageview(path: string): void {
  capture('$pageview', { $current_url: path })
}

export function identifyPostHogUser(userId: string, email?: string | null): void {
  if (!isBrowser()) return
  if (!initialized) initPostHog()
  if (!initialized || !userId) return
  try {
    posthog.identify(userId, email ? { email } : undefined)
  } catch {
    // no-op
  }
}

export function resetPostHogUser(): void {
  if (!isBrowser() || !initialized) return
  try {
    posthog.reset()
  } catch {
    // no-op
  }
}

export function captureListingViewed(payload: {
  listingId: string
  category?: string
  price?: number | null
  currency?: string | null
}): void {
  capture('listing_viewed', {
    listing_id: payload.listingId,
    category: payload.category || null,
    price: typeof payload.price === 'number' ? payload.price : null,
    currency: payload.currency || null,
  })
}

export function captureSearchPerformed(payload: {
  query?: string
  filters?: SearchFilters
  resultsCount?: number
  source?: string
}): void {
  capture('search_performed', {
    query: payload.query || '',
    filters: payload.filters || {},
    results_count: typeof payload.resultsCount === 'number' ? payload.resultsCount : undefined,
    source: payload.source || 'web',
  })
}

export function captureContactSellerClicked(payload: {
  listingId: string
  sellerId?: string | null
  method: 'whatsapp' | 'email'
}): void {
  capture('contact_seller_clicked', {
    listing_id: payload.listingId,
    seller_id: payload.sellerId || null,
    method: payload.method,
  })
}

export function captureListingCreatedStarted(payload?: { category?: string; source?: string }): void {
  capture('listing_created_started', {
    category: payload?.category || null,
    source: payload?.source || 'publish_wizard',
  })
}

export function captureListingCreatedCompleted(payload: {
  listingId: string
  category?: string | null
  price?: number | null
  currency?: string | null
}): void {
  capture('listing_created_completed', {
    listing_id: payload.listingId,
    category: payload.category || null,
    price: typeof payload.price === 'number' ? payload.price : null,
    currency: payload.currency || null,
  })
}

export function captureSavedSearchCreated(payload: {
  userId?: string | null
  name?: string
  criteria?: SearchFilters
}): void {
  capture('saved_search_created', {
    user_id: payload.userId || null,
    name: payload.name || null,
    criteria: payload.criteria || {},
  })
}
