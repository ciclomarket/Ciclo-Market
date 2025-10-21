const API_BASE = (import.meta.env.VITE_API_BASE_URL || '').replace(/\/$/, '')
const CRON_SECRET = import.meta.env.VITE_CRON_SECRET || ''

export async function triggerNewsletterDigest(): Promise<{ ok: boolean }> {
  const url = API_BASE ? `${API_BASE}/api/newsletter/send-latest` : '/api/newsletter/send-latest'
  const resp = await fetch(url, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      ...(CRON_SECRET ? { 'x-cron-secret': CRON_SECRET } : {}),
    },
  })
  if (!resp.ok) {
    const data = await resp.json().catch(() => ({}))
    throw new Error(data?.error || 'newsletter_failed')
  }
  return resp.json().catch(() => ({ ok: true }))
}

