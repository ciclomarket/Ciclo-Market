import type { Plan } from '../types'

export const PLAN_ORDER = ['free', 'basic', 'premium'] as const
export type PlanCode = (typeof PLAN_ORDER)[number]

const PLAN_CODE_ALIASES: Record<string, PlanCode> = {
  free: 'free',
  gratis: 'free',
  basic: 'basic',
  basica: 'basic',
  featured: 'basic',
  destacada: 'basic',
  premium: 'premium',
  pro: 'premium'
}

const ORDER_LOOKUP = new Set<PlanCode>(PLAN_ORDER)

function resolveAlias(normalised: string): PlanCode | null {
  const alias = PLAN_CODE_ALIASES[normalised]
  if (alias) return alias
  if (ORDER_LOOKUP.has(normalised as PlanCode)) return normalised as PlanCode
  return null
}

export function normalisePlanText(value?: string | null): string {
  if (!value) return ''
  return value
    .toLowerCase()
    .normalize('NFD')
    .replace(/\p{Diacritic}/gu, '')
}

export function canonicalPlanCode(value?: string | null): PlanCode | null {
  const normalised = normalisePlanText(value)
  if (!normalised) return null
  return resolveAlias(normalised)
}

export function resolvePlanCode(plan: Plan): PlanCode | null {
  const candidates = [plan.code, plan.id, plan.name]
  for (const raw of candidates) {
    const alias = canonicalPlanCode(raw)
    if (alias) return alias
  }

  const aliasFromName = canonicalPlanCode(plan.name)
  if (aliasFromName) return aliasFromName

  return null
}

export function planMatchesCode(plan: Plan, code?: string | null): boolean {
  if (!code) return false
  const resolved = resolvePlanCode(plan)
  if (!resolved) return false
  const target = canonicalPlanCode(code)
  return resolved === target
}
