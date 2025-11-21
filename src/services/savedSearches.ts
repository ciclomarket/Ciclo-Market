const API_BASE = (import.meta.env.VITE_API_BASE_URL || '').replace(/\/$/, '')
import { getSupabaseClient, supabaseEnabled } from './supabase'

export type SavedSearch = {
  id: number
  user_id: string
  name: string | null
  criteria: Record<string, any>
  is_active: boolean
  created_at: string | null
}

async function authHeaders(): Promise<Record<string, string> | undefined> {
  if (!supabaseEnabled) return undefined
  try {
    const client = getSupabaseClient()
    const { data } = await client.auth.getSession()
    const token = data.session?.access_token || null
    if (token) return { Authorization: `Bearer ${token}` }
  } catch { /* noop */ }
  return undefined
}

export async function listSavedSearches(): Promise<SavedSearch[]> {
  const base = API_BASE || ''
  const endpoint = base ? `${base}/api/saved-searches` : '/api/saved-searches'
  const headers = await authHeaders()
  const res = await fetch(endpoint, { headers })
  if (!res.ok) return []
  const data = await res.json().catch(() => [])
  return Array.isArray(data) ? (data as SavedSearch[]) : []
}

export async function saveSearch(criteria: Record<string, unknown>, name?: string | null, options?: { active?: boolean }): Promise<SavedSearch | null> {
  const base = API_BASE || ''
  const endpoint = base ? `${base}/api/saved-searches` : '/api/saved-searches'
  const headers: Record<string, string> = { 'Content-Type': 'application/json', ...(await authHeaders()) }
  const res = await fetch(endpoint, {
    method: 'POST',
    headers,
    body: JSON.stringify({
      name: name ?? null,
      criteria,
      is_active: options?.active ?? true,
    })
  })
  if (!res.ok) return null
  const data = await res.json().catch(() => null)
  return (data && typeof data === 'object') ? (data as SavedSearch) : null
}

export async function deleteSearch(id: number | string): Promise<boolean> {
  const base = API_BASE || ''
  const endpoint = base ? `${base}/api/saved-searches/${encodeURIComponent(String(id))}` : `/api/saved-searches/${encodeURIComponent(String(id))}`
  const headers = await authHeaders()
  const res = await fetch(endpoint, { method: 'DELETE', headers })
  return res.ok
}
