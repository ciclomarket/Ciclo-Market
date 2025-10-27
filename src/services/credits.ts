const API_BASE = (import.meta.env.VITE_API_BASE_URL || '').replace(/\/$/, '')

export type Credit = {
  id: string
  created_at: string
  plan_code: 'basic' | 'premium'
  status: 'available' | 'used' | 'pending' | 'expired' | 'cancelled'
  used_at?: string | null
  expires_at?: string | null
  listing_id?: string | null
}

export async function fetchMyCredits(userId: string): Promise<Credit[]> {
  if (!API_BASE) return []
  try {
    const res = await fetch(`${API_BASE}/api/credits/me?userId=${encodeURIComponent(userId)}`)
    if (!res.ok) return []
    const data = await res.json()
    if (!Array.isArray(data)) return []
    return data as Credit[]
  } catch {
    return []
  }
}

export async function fetchCreditsHistory(userId: string): Promise<Credit[]> {
  if (!API_BASE) return []
  try {
    const res = await fetch(`${API_BASE}/api/credits/history?userId=${encodeURIComponent(userId)}`)
    if (!res.ok) return []
    const data = await res.json()
    if (!Array.isArray(data)) return []
    return data as Credit[]
  } catch {
    return []
  }
}

export async function redeemCredit(userId: string, planCode: 'basic' | 'premium'): Promise<{ ok: true; creditId: string; planCode: 'basic' | 'premium' } | { ok: false; error: string }> {
  if (!API_BASE) return { ok: false, error: 'missing_api_base' }
  try {
    const res = await fetch(`${API_BASE}/api/credits/redeem`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ userId, planCode })
    })
    const data = await res.json()
    return data
  } catch {
    return { ok: false, error: 'network_error' }
  }
}

export async function attachCreditToListing(userId: string, creditId: string, listingId: string): Promise<boolean> {
  if (!API_BASE) return false
  try {
    const res = await fetch(`${API_BASE}/api/credits/attach`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ userId, creditId, listingId })
    })
    const data = await res.json().catch(() => ({}))
    return Boolean(res.ok && data?.ok)
  } catch {
    return false
  }
}

export async function grantCredit(userId: string, planCode: 'basic' | 'premium'): Promise<{ ok: boolean; creditId?: string }> {
  if (!API_BASE) return { ok: false }
  try {
    const res = await fetch(`${API_BASE}/api/credits/grant`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ userId, planCode })
    })
    const data = await res.json().catch(() => ({}))
    return { ok: Boolean(res.ok && data?.ok), creditId: data?.creditId }
  } catch {
    return { ok: false }
  }
}
