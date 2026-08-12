import type { Listing } from '../types'

// Orden de visibilidad del marketplace:
// 1. PRO (vendedores individuales con plan PRO)
// 2. Tiendas oficiales (cualquier publicación de una tienda, sea cual sea su plan interno)
// 3. PREMIUM
// 4. FREE
// Las tiendas van en su propio escalón porque sus publicaciones ya se crean
// con plan PRO por defecto (ver Publish/Plans.tsx) — si no se separaran acá,
// quedarían mezcladas e indistinguibles de los PRO individuales.
export function getListingRankTier(l: Listing): 4 | 3 | 2 | 1 {
  if (!l.isTienda && l.planTier === 'PRO') return 4
  if (l.isTienda) return 3
  if (l.planTier === 'PREMIUM') return 2
  return 1
}

export function compareListingsByRank(a: Listing, b: Listing, now: number = Date.now()): number {
  const tierDiff = getListingRankTier(b) - getListingRankTier(a)
  if (tierDiff !== 0) return tierDiff

  // Dentro del mismo escalón, un destaque temporal activo (rankBoostUntil)
  // pasa primero, y entre destacados desempata el que vence más tarde.
  const boostUntil = (l: Listing) => {
    const raw = typeof l.rankBoostUntil === 'number' ? l.rankBoostUntil : 0
    return raw > now ? raw : 0
  }
  const boostA = boostUntil(a)
  const boostB = boostUntil(b)
  if (boostA > 0 || boostB > 0) {
    if (boostA !== boostB) return boostB - boostA
  }

  const createdDiff = (b.createdAt ?? 0) - (a.createdAt ?? 0)
  if (createdDiff !== 0) return createdDiff
  return String(a.id).localeCompare(String(b.id))
}

export function sortListingsByRank(listings: Listing[]): Listing[] {
  const now = Date.now()
  return [...listings].sort((a, b) => compareListingsByRank(a, b, now))
}
