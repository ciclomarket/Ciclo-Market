const API_BASE = (import.meta.env.VITE_API_BASE_URL || '').replace(/\/$/, '')
import { getSupabaseClient, supabaseEnabled } from './supabase'

export async function submitVerificationRequest(payload: {
  name: string
  instagram?: string
  phone?: string
  email: string
  message: string
  attachments?: string[]
}): Promise<boolean> {
  if (!API_BASE) return false
  try {
    const headers: Record<string, string> = { 'Content-Type': 'application/json' }
    if (supabaseEnabled) {
      const client = getSupabaseClient()
      const { data } = await client.auth.getSession()
      const token = data.session?.access_token
      if (token) headers.Authorization = `Bearer ${token}`
    }
    const res = await fetch(`${API_BASE}/api/verification/request`, {
      method: 'POST',
      headers,
      body: JSON.stringify(payload),
    })
    return res.ok
  } catch (err) {
    console.warn('[verification] submit failed', err)
    return false
  }
}

