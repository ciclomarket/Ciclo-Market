import type { SellerPlan } from '../types'

export function isPlanActive(plan?: SellerPlan, expires?: number | null): boolean {
  if (!plan) return false
  if (expires == null) return true
  return expires > Date.now()
}

const FEATURED_PLANS: SellerPlan[] = ['basic', 'premium', 'featured', 'pro']

export function hasPaidPlan(plan?: SellerPlan, expires?: number | null): boolean {
  if (!plan) return false
  return isPlanActive(plan, expires) && FEATURED_PLANS.includes(plan)
}

export function isPlanVerified(plan?: SellerPlan, expires?: number | null): boolean {
  if (!plan) return false
  return isPlanActive(plan, expires) && (plan === 'premium' || plan === 'pro')
}

export function getPlanLabel(plan?: SellerPlan, expires?: number | null): string {
  const active = isPlanActive(plan, expires)
  if (!plan) return 'Publicación estándar'
  if (plan === 'basic') return active ? 'Publicación destacada' : 'Publicación destacada (vencida)'
  if (plan === 'premium') return active ? 'Publicación premium' : 'Publicación premium (vencida)'
  if (plan === 'featured') return active ? 'Destacado especial' : 'Destacado especial (vencido)'
  if (plan === 'pro') return active ? 'Tienda verificada' : 'Tienda verificada (vencida)'
  return active ? 'Publicación con beneficios' : 'Publicación (vencida)'
}
