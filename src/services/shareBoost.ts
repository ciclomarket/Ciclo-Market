const API_BASE = (import.meta.env.VITE_API_BASE_URL || '').trim()

export type ShareBoostType = 'story' | 'post'

export async function submitShareBoost(payload: {
  listingId: string
  sellerId: string
  type: ShareBoostType
  handle?: string | null
  proofUrl?: string | null
  note?: string | null
  reward?: 'boost7' | 'photos2'
}) {
  const endpoint = API_BASE ? `${API_BASE}/api/share-boost/submit` : '/api/share-boost/submit'
  const res = await fetch(endpoint, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(payload),
  })
  if (!res.ok) {
    const text = await res.text()
    throw new Error(text || 'No pudimos enviar el comprobante')
  }
  return await res.json()
}

export async function fetchPendingShareBoosts(): Promise<any[]> {
  const endpoint = API_BASE ? `${API_BASE}/api/share-boost/pending` : '/api/share-boost/pending'
  const res = await fetch(endpoint)
  if (!res.ok) throw new Error('No pudimos cargar la cola de comprobantes')
  const data = await res.json()
  return data?.items || []
}

export async function reviewShareBoost(id: string, approve: boolean, reviewerId?: string) {
  const endpoint = API_BASE ? `${API_BASE}/api/share-boost/review` : '/api/share-boost/review'
  const res = await fetch(endpoint, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ id, approve, reviewerId })
  })
  if (!res.ok) {
    const text = await res.text()
    throw new Error(text || 'No pudimos actualizar el comprobante')
  }
  return await res.json()
}
