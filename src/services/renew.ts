const API_BASE = (import.meta.env.VITE_API_BASE_URL || '').replace(/\/$/, '')
import { getSupabaseClient, supabaseEnabled } from './supabase'

export async function renewListingViaApi(id: string): Promise<boolean> {
  if (!API_BASE) return false
  if (!supabaseEnabled) return false
  try {
    const client = getSupabaseClient()
    const { data } = await client.auth.getSession()
    const token = data.session?.access_token || null
    if (!token) return false
    const res = await fetch(`${API_BASE}/api/listings/${encodeURIComponent(id)}/renew`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        Authorization: `Bearer ${token}`,
      },
    })
    return res.ok
  } catch (err) {
    console.warn('[renew] request failed', err)
    return false
  }
}

