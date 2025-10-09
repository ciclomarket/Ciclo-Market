const API_BASE = (import.meta.env.VITE_API_BASE_URL || '').replace(/\/$/, '')

type OfferEmailPayload = {
  sellerEmail: string
  sellerName?: string | null
  listingTitle: string
  listingUrl?: string
  amountLabel: string
  buyerName?: string | null
  buyerEmail?: string | null
  buyerWhatsapp?: string | null
}

export async function sendOfferEmail(payload: OfferEmailPayload): Promise<void> {
  const endpoint = API_BASE ? `${API_BASE}/api/offers/notify` : '/api/offers/notify'
  const response = await fetch(endpoint, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(payload)
  })
  if (!response.ok) {
    const data = await response.json().catch(() => ({}))
    const message = data?.error || 'No se pudo notificar la oferta por email.'
    throw new Error(message)
  }
}
