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
  try {
    const url = API_BASE
      ? `${API_BASE}/api/credits/me?userId=${encodeURIComponent(userId)}`
      : `/api/credits/me?userId=${encodeURIComponent(userId)}`
    const res = await fetch(url)
    if (!res.ok) return []
    const data = await res.json()
    if (!Array.isArray(data)) return []
    return data as Credit[]
  } catch {
    return []
  }
}

export async function fetchCreditsHistory(userId: string): Promise<Credit[]> {
  try {
    const url = API_BASE
      ? `${API_BASE}/api/credits/history?userId=${encodeURIComponent(userId)}`
      : `/api/credits/history?userId=${encodeURIComponent(userId)}`
    const res = await fetch(url)
    if (!res.ok) return []
    const data = await res.json()
    if (!Array.isArray(data)) return []
    return data as Credit[]
  } catch {
    return []
  }
}

export async function redeemCredit(userId: string, planCode: 'basic' | 'premium'): Promise<{ ok: true; creditId: string; planCode: 'basic' | 'premium' } | { ok: false; error: string }> {
  try {
    const endpoint = API_BASE ? `${API_BASE}/api/credits/redeem` : '/api/credits/redeem'
    const res = await fetch(endpoint, {
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
  try {
    const endpoint = API_BASE ? `${API_BASE}/api/credits/attach` : '/api/credits/attach'
    const res = await fetch(endpoint, {
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
