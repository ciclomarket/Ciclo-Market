/**
 * Advanced CRM Services
 * Kanban, Next Best Action, Automation Rules, Impact Dashboard
 */

import type {
  KanbanCard,
  KanbanStage,
  RecommendedAction,
  AutomationRule,
  ImpactMetrics,
} from '@admin/types/crm'
// Get admin API base from environment
const getAdminApiBase = (): string => {
  try {
    // Variables de entorno de Vite (disponibles en build time)
    const env = (
      (import.meta as any).env?.VITE_API_BASE_URL || 
      (import.meta as any).env?.VITE_ADMIN_API_BASE || 
      (import.meta as any).env?.VITE_API_URL || 
      ''
    ).replace(/\/$/, '')
    
    if (env) return env
    if (typeof window === 'undefined') return ''
    
    // Detectar automáticamente por hostname (fallback para producción)
    const host = window.location.hostname
    if (host === 'ciclomarket.ar' || host === 'www.ciclomarket.ar') {
      return 'https://ciclo-market.onrender.com'
    }
    
    // Desarrollo local
    if (host === 'localhost' || host === '127.0.0.1') {
      return 'http://localhost:3000'
    }
    
    // Último fallback
    return ''
  } catch {
    return ''
  }
}

const ADMIN_API_BASE = () => getAdminApiBase()

// ============================================================================
// KANBAN BOARD
// ============================================================================

export async function fetchKanbanCards(filters?: {
  stage?: KanbanStage
  priority?: string
  seller_id?: string
}): Promise<KanbanCard[]> {
  const params = new URLSearchParams()
  if (filters?.stage) params.append('stage', filters.stage)
  if (filters?.priority) params.append('priority', filters.priority)
  if (filters?.seller_id) params.append('seller_id', filters.seller_id)

  const response = await fetch(`${ADMIN_API_BASE()}/api/admin/kanban/cards?${params}`, {
    credentials: 'include',
  })
  if (!response.ok) throw new Error('Failed to fetch kanban cards')
  return response.json()
}

export async function createKanbanCard(card: Partial<KanbanCard>): Promise<KanbanCard> {
  const response = await fetch(`${ADMIN_API_BASE()}/api/admin/kanban/cards`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    credentials: 'include',
    body: JSON.stringify(card),
  })
  if (!response.ok) throw new Error('Failed to create kanban card')
  return response.json()
}

export async function moveKanbanCard(
  cardId: string,
  toStage: KanbanStage,
  notes?: string
): Promise<KanbanCard> {
  const response = await fetch(`${ADMIN_API_BASE()}/api/admin/kanban/cards/${cardId}/move`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    credentials: 'include',
    body: JSON.stringify({ to_stage: toStage, notes }),
  })
  if (!response.ok) throw new Error('Failed to move kanban card')
  return response.json()
}

export async function updateKanbanCard(
  cardId: string,
  updates: Partial<KanbanCard>
): Promise<KanbanCard> {
  const response = await fetch(`${ADMIN_API_BASE()}/api/admin/kanban/cards/${cardId}`, {
    method: 'PATCH',
    headers: { 'Content-Type': 'application/json' },
    credentials: 'include',
    body: JSON.stringify(updates),
  })
  if (!response.ok) throw new Error('Failed to update kanban card')
  return response.json()
}

export async function deleteKanbanCard(cardId: string): Promise<void> {
  const response = await fetch(`${ADMIN_API_BASE()}/api/admin/kanban/cards/${cardId}`, {
    method: 'DELETE',
    credentials: 'include',
  })
  if (!response.ok) throw new Error('Failed to delete kanban card')
}

export async function fetchKanbanMetrics(): Promise<{
  by_stage: Record<KanbanStage, number>
  recent_moves: Array<{ from: KanbanStage; to: KanbanStage; count: number }>
  avg_time_in_stage: Record<KanbanStage, number>
}> {
  const response = await fetch(`${ADMIN_API_BASE()}/api/admin/kanban/metrics`, {
    credentials: 'include',
  })
  if (!response.ok) throw new Error('Failed to fetch kanban metrics')
  return response.json()
}

// ============================================================================
// NEXT BEST ACTION
// ============================================================================

export async function fetchRecommendedActions(sellerId?: string): Promise<RecommendedAction[]> {
  const params = sellerId ? `?seller_id=${sellerId}` : ''
  const response = await fetch(`${ADMIN_API_BASE()}/api/admin/crm/recommended-actions${params}`, {
    credentials: 'include',
  })
  if (!response.ok) throw new Error('Failed to fetch recommended actions')
  return response.json()
}

export async function fetchActionForSeller(sellerId: string): Promise<RecommendedAction | null> {
  const response = await fetch(`${ADMIN_API_BASE()}/api/admin/crm/recommended-actions?seller_id=${sellerId}`, {
    credentials: 'include',
  })
  if (!response.ok) throw new Error('Failed to fetch action')
  const actions = await response.json()
  return actions[0] || null
}

export async function dismissAction(actionId: string): Promise<void> {
  const response = await fetch(`${ADMIN_API_BASE()}/api/admin/crm/actions/${actionId}/dismiss`, {
    method: 'POST',
    credentials: 'include',
  })
  if (!response.ok) throw new Error('Failed to dismiss action')
}

export async function completeAction(actionId: string): Promise<void> {
  const response = await fetch(`${ADMIN_API_BASE()}/api/admin/crm/actions/${actionId}/complete`, {
    method: 'POST',
    credentials: 'include',
  })
  if (!response.ok) throw new Error('Failed to complete action')
}

// ============================================================================
// AUTOMATION RULES
// ============================================================================

export async function fetchAutomationRules(): Promise<AutomationRule[]> {
  const response = await fetch(`${ADMIN_API_BASE()}/api/admin/automation/rules`, {
    credentials: 'include',
  })
  if (!response.ok) throw new Error('Failed to fetch automation rules')
  return response.json()
}

export async function createAutomationRule(
  rule: Omit<AutomationRule, 'id' | 'created_at'>
): Promise<AutomationRule> {
  const response = await fetch(`${ADMIN_API_BASE()}/api/admin/automation/rules`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    credentials: 'include',
    body: JSON.stringify(rule),
  })
  if (!response.ok) throw new Error('Failed to create automation rule')
  return response.json()
}

export async function updateAutomationRule(
  ruleId: string,
  updates: Partial<AutomationRule>
): Promise<AutomationRule> {
  const response = await fetch(`${ADMIN_API_BASE()}/api/admin/automation/rules/${ruleId}`, {
    method: 'PATCH',
    headers: { 'Content-Type': 'application/json' },
    credentials: 'include',
    body: JSON.stringify(updates),
  })
  if (!response.ok) throw new Error('Failed to update automation rule')
  return response.json()
}

export async function toggleRule(ruleId: string, enabled: boolean): Promise<void> {
  const response = await fetch(`${ADMIN_API_BASE()}/api/admin/automation/rules/${ruleId}/toggle`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    credentials: 'include',
    body: JSON.stringify({ enabled }),
  })
  if (!response.ok) throw new Error('Failed to toggle rule')
}

export async function deleteRule(ruleId: string): Promise<void> {
  const response = await fetch(`${ADMIN_API_BASE()}/api/admin/automation/rules/${ruleId}`, {
    method: 'DELETE',
    credentials: 'include',
  })
  if (!response.ok) throw new Error('Failed to delete rule')
}

export async function testRule(ruleId: string): Promise<{ success: boolean; message: string }> {
  const response = await fetch(`${ADMIN_API_BASE()}/api/admin/automation/rules/${ruleId}/test`, {
    method: 'POST',
    credentials: 'include',
  })
  if (!response.ok) throw new Error('Failed to test rule')
  return response.json()
}

export async function fetchAutomationLogs(limit = 50): Promise<Array<{
  id: string
  rule_id: string
  rule_name: string
  executed_at: string
  status: 'success' | 'failed' | 'skipped'
  details?: Record<string, unknown>
}>> {
  const response = await fetch(`${ADMIN_API_BASE()}/api/admin/automation/logs?limit=${limit}`, {
    credentials: 'include',
  })
  if (!response.ok) throw new Error('Failed to fetch automation logs')
  return response.json()
}

// ============================================================================
// IMPACT DASHBOARD
// ============================================================================

export async function fetchImpactMetrics(period: '7d' | '30d' | '90d' = '30d'): Promise<ImpactMetrics> {
  const response = await fetch(`${ADMIN_API_BASE()}/api/admin/impact/metrics?period=${period}`, {
    credentials: 'include',
  })
  if (!response.ok) throw new Error('Failed to fetch impact metrics')
  return response.json()
}

export async function fetchSalesByCategory(period: string): Promise<Array<{
  category: string
  sales: number
  revenue: number
  avg_time_to_sale: number
}>> {
  const response = await fetch(`${ADMIN_API_BASE()}/api/admin/impact/sales-by-category?period=${period}`, {
    credentials: 'include',
  })
  if (!response.ok) throw new Error('Failed to fetch sales by category')
  return response.json()
}

export async function fetchSalesByCity(period: string): Promise<Array<{
  city: string
  sales: number
  revenue: number
  sellers: number
}>> {
  const response = await fetch(`${ADMIN_API_BASE()}/api/admin/impact/sales-by-city?period=${period}`, {
    credentials: 'include',
  })
  if (!response.ok) throw new Error('Failed to fetch sales by city')
  return response.json()
}

export async function fetchConversionFunnel(period: string): Promise<{
  views: number
  inquiries: number
  whatsapp_clicks: number
  confirmed_sales: number
  conversion_rate: number
}> {
  const response = await fetch(`${ADMIN_API_BASE()}/api/admin/impact/conversion-funnel?period=${period}`, {
    credentials: 'include',
  })
  if (!response.ok) throw new Error('Failed to fetch conversion funnel')
  return response.json()
}

// ============================================================================
// SELLER INTELLIGENCE
// ============================================================================

export async function fetchSellerIntelligence(sellerId: string): Promise<{
  velocity: { leads_per_day: number; trend: 'up' | 'down' | 'stable' }
  time_to_first_contact: { hours: number; benchmark_diff: number }
  peak_hours: Array<{ hour: number; contact_count: number }>
  peak_days: Array<{ day: string; contact_count: number }>
  wa_vs_email_ratio: { whatsapp: number; email: number; preferred: 'whatsapp' | 'email' }
  unique_vs_total_leads: { unique: number; total: number; ratio: number }
  engagement_score: number
  health_status: 'healthy' | 'at_risk' | 'critical'
}> {
  const response = await fetch(`${ADMIN_API_BASE()}/api/admin/sellers/${sellerId}/intelligence`, {
    credentials: 'include',
  })
  if (!response.ok) throw new Error('Failed to fetch seller intelligence')
  return response.json()
}

export async function fetchCohortAnalysis(cohort: string): Promise<{
  cohort: string
  total_sellers: number
  active_after_7d: number
  active_after_30d: number
  conversion_rate: number
  avg_revenue: number
}> {
  const response = await fetch(`${ADMIN_API_BASE()}/api/admin/analytics/cohorts/${cohort}`, {
    credentials: 'include',
  })
  if (!response.ok) throw new Error('Failed to fetch cohort analysis')
  return response.json()
}
