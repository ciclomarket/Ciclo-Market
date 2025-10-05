import type { SellerPlan } from '../types'

export function isPlanActive(plan?: SellerPlan, expires?: number | null): boolean {
  if (!plan) return false
  if (expires == null) return true
  return expires > Date.now()
}

export function hasPaidPlan(plan?: SellerPlan, expires?: number | null): boolean {
  return isPlanActive(plan, expires) && plan !== 'basic'
}

export function isPlanVerified(plan?: SellerPlan, expires?: number | null): boolean {
  return isPlanActive(plan, expires) && plan === 'pro'
}

export function getPlanLabel(plan?: SellerPlan, expires?: number | null): string {
  const active = isPlanActive(plan, expires)
  if (!plan) return 'Sin plan'
  if (plan === 'basic') return 'Básica'
  if (plan === 'featured') return active ? 'Destacada' : 'Destacada (vencido)'
  if (plan === 'pro') return active ? 'Pro · Verificado' : 'Pro (vencido)'
  return 'Plan activo'
}
