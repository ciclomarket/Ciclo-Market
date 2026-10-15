import { getSupabaseClient, supabaseEnabled } from './supabase'

const API_BASE = (import.meta.env.VITE_API_BASE_URL || '').replace(/\/$/, '')

// Token del link mágico (/p/:token) con el que el vendedor llegó al wizard.
export const PREFILL_TOKEN_KEY = 'cm_prefill_token'

/** Marca el borrador precargado como convertido en la publicación recién creada. */
export async function claimPendingPrefill(listingId: string): Promise<void> {
  let token: string | null = null
  try { token = window.localStorage.getItem(PREFILL_TOKEN_KEY) } catch { /* noop */ }
  if (!token || !supabaseEnabled) return
  try {
    const { data } = await getSupabaseClient().auth.getSession()
    const accessToken = data.session?.access_token
    if (!accessToken) return
    const res = await fetch(`${API_BASE}/api/prefills/${encodeURIComponent(token)}/claim`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${accessToken}` },
      body: JSON.stringify({ listingId }),
    })
    if (res.ok) window.localStorage.removeItem(PREFILL_TOKEN_KEY)
  } catch { /* noop */ }
}
