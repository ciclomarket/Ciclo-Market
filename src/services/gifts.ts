const API_BASE = (import.meta.env.VITE_API_BASE_URL || '').trim()

export type GiftPlan = 'basic' | 'premium'

export async function validateGift(code: string): Promise<{ ok: boolean; plan?: GiftPlan; error?: string }> {
  const endpoint = API_BASE ? `${API_BASE}/api/gifts/validate?code=${encodeURIComponent(code)}` : `/api/gifts/validate?code=${encodeURIComponent(code)}`
  const res = await fetch(endpoint)
  if (!res.ok) return { ok: false }
  return res.json()
}

export async function redeemGift(code: string, sellerId: string): Promise<{ ok: boolean }> {
  const endpoint = API_BASE ? `${API_BASE}/api/gifts/redeem` : '/api/gifts/redeem'
  const res = await fetch(endpoint, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ code, sellerId })
  })
  if (!res.ok) return { ok: false }
  return res.json()
}

export async function createGift(plan: GiftPlan, uses: number = 1, expiresAt?: string, adminToken?: string): Promise<{ ok: boolean; code?: string }> {
  const endpoint = API_BASE ? `${API_BASE}/api/gifts/create` : '/api/gifts/create'
  const res = await fetch(endpoint, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', ...(adminToken ? { 'X-Admin-Token': adminToken } : {}) },
    body: JSON.stringify({ plan, uses, expiresAt })
  })
  if (!res.ok) return { ok: false }
  return res.json()
}
