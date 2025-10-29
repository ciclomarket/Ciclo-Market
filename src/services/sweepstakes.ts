import type { Sweepstake } from '../types'

const API_BASE = (import.meta.env.VITE_API_BASE_URL || '').trim().replace(/\/$/, '')
const ACTIVE_ENDPOINT = API_BASE ? `${API_BASE}/api/sweepstakes/active` : '/api/sweepstakes/active'

function normalizeSweepstake(data: any): Sweepstake | null {
  if (!data) return null
  const startRaw = data.start_at ?? data.startAt
  const endRaw = data.end_at ?? data.endAt
  const startAt = Date.parse(startRaw)
  const endAt = Date.parse(endRaw)
  if (!Number.isFinite(startAt) || !Number.isFinite(endAt)) return null
  const createdRaw = data.created_at ?? data.createdAt ?? null
  const createdAt = createdRaw ? Date.parse(createdRaw) : null
  return {
    id: String(data.id ?? ''),
    slug: String(data.slug ?? ''),
    title: String(data.title ?? ''),
    startAt,
    endAt,
    createdAt: Number.isFinite(createdAt) ? createdAt : null,
  }
}

export async function fetchActiveSweepstake(): Promise<Sweepstake | null> {
  try {
    const res = await fetch(ACTIVE_ENDPOINT, {
      method: 'GET',
      headers: { Accept: 'application/json' },
    })
    if (!res.ok) return null
    const payload = await res.json().catch(() => null)
    return normalizeSweepstake(payload)
  } catch {
    return null
  }
}
