const API_BASE = (import.meta.env.VITE_API_BASE_URL || '').replace(/\/$/, '')

export async function subscribeNewsletter(payload: { email: string; name?: string; audienceId?: string }): Promise<{ ok: boolean; error?: string }> {
  if (!API_BASE) return { ok: false, error: 'api_base_missing' }
  try {
    const res = await fetch(`${API_BASE}/api/newsletter/subscribe`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(payload),
    })
    if (!res.ok) {
      const data = await res.json().catch(() => ({}))
      return { ok: false, error: data?.error || 'subscribe_failed' }
    }
    return { ok: true }
  } catch {
    return { ok: false, error: 'network_error' }
  }
}
