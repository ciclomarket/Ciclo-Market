const API_BASE = (import.meta.env.VITE_API_BASE_URL || '').trim()
import { getSupabaseClient, supabaseEnabled } from './supabase'

export type GiftPlan = 'basic' | 'premium'

export async function validateGift(code: string): Promise<{ ok: boolean; plan?: GiftPlan; error?: string }> {
  const endpoint = API_BASE ? `${API_BASE}/api/gifts/validate?code=${encodeURIComponent(code)}` : `/api/gifts/validate?code=${encodeURIComponent(code)}`
  const res = await fetch(endpoint)
  if (!res.ok) return { ok: false }
  return res.json()
}

export async function redeemGift(code: string, sellerId: string): Promise<{ ok: boolean }> {
  const endpoint = API_BASE ? `${API_BASE}/api/gifts/redeem` : '/api/gifts/redeem'
  let headers: Record<string, string> = { 'Content-Type': 'application/json' }
  if (supabaseEnabled) {
    const client = getSupabaseClient()
    const { data } = await client.auth.getSession()
    const token = data.session?.access_token
    if (token) headers = { ...headers, Authorization: `Bearer ${token}` }
  }
  const res = await fetch(endpoint, {
    method: 'POST',
    headers,
    body: JSON.stringify({ code, sellerId })
  })
  if (!res.ok) return { ok: false }
  return res.json()
}

export async function createGift(plan: GiftPlan, uses: number = 1, expiresAt?: string): Promise<{ ok: boolean; code?: string }> {
  const endpoint = API_BASE ? `${API_BASE}/api/gifts/create` : '/api/gifts/create'
  let headers: Record<string, string> = { 'Content-Type': 'application/json' }
  if (supabaseEnabled) {
    const client = getSupabaseClient()
    const { data } = await client.auth.getSession()
    const token = data.session?.access_token
    if (token) headers = { ...headers, Authorization: `Bearer ${token}` }
  }
  const res = await fetch(endpoint, {
    method: 'POST',
    headers,
    body: JSON.stringify({ plan, uses, expiresAt })
  })
  if (!res.ok) return { ok: false }
  const data = await res.json().catch(() => ({}))
  return { ok: Boolean(data?.ok), code: data?.code }
}

export async function claimGift(code: string, userId: string): Promise<{ ok: boolean; creditId?: string; planCode?: 'basic' | 'premium'; error?: string }> {
  const endpoint = API_BASE ? `${API_BASE}/api/gifts/claim` : '/api/gifts/claim'
  try {
    let headers: Record<string, string> = { 'Content-Type': 'application/json' }
    if (supabaseEnabled) {
      const client = getSupabaseClient()
      const { data } = await client.auth.getSession()
      const token = data.session?.access_token
      if (token) headers = { ...headers, Authorization: `Bearer ${token}` }
    }
    const res = await fetch(endpoint, {
      method: 'POST',
      headers,
      body: JSON.stringify({ code, userId })
    })
    const data = await res.json().catch(() => ({}))
    if (!res.ok) return { ok: false, error: data?.error || 'claim_failed' }
    return { ok: Boolean(data?.ok), creditId: data?.creditId, planCode: data?.planCode }
  } catch {
    return { ok: false, error: 'network_error' }
  }
}
