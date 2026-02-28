/**
 * CRM Types - Ciclo Market Admin
 * Comprehensive types for Kanban, Automation, Lead Intelligence
 */

// ============================================================================
// KANBAN BOARD
// ============================================================================

export type KanbanStage = 
  | 'contacted' 
  | 'responded' 
  | 'sold_cm' 
  | 'sold_elsewhere' 
  | 'not_sold' 
  | 'needs_help' 
  | 'price_drop'

export interface KanbanColumn {
  key: KanbanStage
  label: string
  description: string
  color: string
  icon: string
  can_drop: boolean
}

export const KANBAN_STAGES: KanbanColumn[] = [
  {
    key: 'contacted',
    label: 'Contactado',
    description: 'Envié WhatsApp, esperando respuesta',
    color: '#3b82f6',
    icon: '📱',
    can_drop: true,
  },
  {
    key: 'responded',
    label: 'Respondió',
    description: 'Vendedor respondió, en conversación',
    color: '#8b5cf6',
    icon: '💬',
    can_drop: true,
  },
  {
    key: 'sold_cm',
    label: 'Vendió por CM',
    description: 'Venta confirmada a través de Ciclo Market',
    color: '#10b981',
    icon: '✅',
    can_drop: true,
  },
  {
    key: 'sold_elsewhere',
    label: 'Vendió fuera',
    description: 'Vendió por otro canal',
    color: '#6b7280',
    icon: '🏠',
    can_drop: true,
  },
  {
    key: 'not_sold',
    label: 'No vendió',
    description: 'No logró vender, no quiere seguir',
    color: '#ef4444',
    icon: '❌',
    can_drop: true,
  },
  {
    key: 'needs_help',
    label: 'Necesita Ayuda',
    description: 'Necesita asistencia para vender',
    color: '#f59e0b',
    icon: '🆘',
    can_drop: true,
  },
  {
    key: 'price_drop',
    label: 'Reducir Precio',
    description: 'Interesado en bajar el precio',
    color: '#ec4899',
    icon: '📉',
    can_drop: true,
  },
]

export interface KanbanCard {
  id: string
  seller_id: string
  seller_name: string
  listing_id?: string
  listing_title?: string
  whatsapp_number: string
  stage: KanbanStage
  priority: 'urgent' | 'high' | 'medium' | 'low'
  tags: string[]
  notes?: string
  estimated_value?: number
  source: 'whatsapp' | 'email' | 'manual' | 'automation'
  created_at: string
  last_contact_at: string
  moved_at?: string
  assigned_to?: string
}

export interface KanbanMove {
  id: string
  card_id: string
  from_stage: KanbanStage
  to_stage: KanbanStage
  moved_at: string
  moved_by: string
  notes?: string
}

// ============================================================================
// NEXT BEST ACTION
// ============================================================================

export type ActionType = 
  | 'contact_whatsapp'
  | 'contact_email'
  | 'send_template'
  | 'create_task'
  | 'suggest_price_drop'
  | 'suggest_improve_photos'
  | 'suggest_verify_identity'
  | 'suggest_add_whatsapp'
  | 'mark_at_risk'
  | 'schedule_followup'
  | 'manual_review'

export type ActionPriority = 'critical' | 'high' | 'medium' | 'low'

export interface RecommendedAction {
  id: string
  type: ActionType
  title: string
  description: string
  priority: ActionPriority
  icon: string
  reason: string
  seller_id?: string
  seller_name?: string
  listing_id?: string
  listing_title?: string
  expected_conversion_lift?: number
  estimated_value?: number
  created_at: string
  expires_at?: string
  dismissed?: boolean
  completed?: boolean
}

export interface NextBestActionConfig {
  weights: {
    time_since_contact: number
    ctr: number
    lead_velocity: number
    response_rate: number
    listing_age: number
  }
  thresholds: {
    critical: number
    high: number
    medium: number
  }
}

// ============================================================================
// AUTOMATION RULES
// ============================================================================

export type AutomationCondition =
  | 'listing_expiring_24h'
  | 'listing_expiring_72h'
  | 'no_leads_7d'
  | 'no_leads_14d'
  | 'new_lead_received'
  | 'high_ctr_low_leads'
  | 'seller_not_responded_24h'
  | 'seller_not_responded_48h'
  | 'whatsapp_not_enabled'
  | 'phone_not_verified'
  | 'photos_low_quality'
  | 'price_above_market'
  | 'seller_at_risk_churn'

export type AutomationAction =
  | 'send_email'
  | 'send_whatsapp'
  | 'create_task'
  | 'add_tag'
  | 'notify_admin'
  | 'move_kanban_stage'
  | 'mark_at_risk'

export interface AutomationRule {
  id: string
  name: string
  condition: AutomationCondition
  condition_config?: Record<string, unknown>
  action: AutomationAction
  action_config: {
    template?: string
    message?: string
    tag?: string
    stage?: KanbanStage
    delay_minutes?: number
    [key: string]: unknown
  }
  enabled: boolean
  run_count: number
  last_run_at?: string
  created_at: string
  updated_at: string
}

export interface AutomationLog {
  id: string
  rule_id: string
  rule_name: string
  executed_at: string
  status: 'success' | 'failed' | 'skipped'
  entity_type: 'seller' | 'listing'
  entity_id: string
  details?: Record<string, unknown>
  error_message?: string
}

// ============================================================================
// LEAD INTELLIGENCE
// ============================================================================

export interface LeadIntelligence {
  velocity: {
    leads_per_day: number
    trend: 'up' | 'down' | 'stable'
    change_percent: number
  }
  time_to_first_contact: {
    hours: number
    benchmark_diff: number // vs 2 hours benchmark
  }
  peak_hours: Array<{
    hour: number
    contact_count: number
    day_name: string
  }>
  peak_days: Array<{
    day: string
    contact_count: number
    conversion_rate: number
  }>
  wa_vs_email_ratio: {
    whatsapp: number
    email: number
    preferred: 'whatsapp' | 'email'
  }
  unique_vs_total_leads: {
    unique: number
    total: number
    ratio: number
  }
  engagement_score: number // 0-100
  health_status: 'healthy' | 'at_risk' | 'critical'
}

export interface SellerIntelligence extends LeadIntelligence {
  seller_id: string
  seller_name: string
  listing_count: number
  total_listing_value: number
  best_performing_listing?: {
    id: string
    title: string
    ctr: number
    leads: number
  }
  recommendations: string[]
}

// ============================================================================
// IMPACT DASHBOARD
// ============================================================================

export interface ImpactMetrics {
  period: string
  confirmed_sales: number
  total_revenue: number
  conversion_rate: number
  avg_time_to_sale: number
  active_listings: number
  total_leads: number
  gmv_per_listing: number
  sales_change?: number
  conversion_change?: number
  time_change?: number
  listings_change?: number
}

export interface ConversionFunnel {
  views: number
  inquiries: number
  whatsapp_clicks: number
  confirmed_sales: number
  conversion_rate: number
  stage_rates: {
    view_to_inquiry: number
    inquiry_to_whatsapp: number
    whatsapp_to_sale: number
  }
}

export interface SalesByCategory {
  category: string
  sales: number
  revenue: number
  avg_time_to_sale: number
  avg_price: number
  market_share: number
}

export interface SalesByCity {
  city: string
  sales: number
  revenue: number
  sellers: number
  avg_price: number
  growth_rate: number
}

export interface CohortAnalysis {
  cohort: string
  total_sellers: number
  active_after_7d: number
  active_after_30d: number
  conversion_rate: number
  avg_revenue: number
  retention_7d: number
  retention_30d: number
}

// ============================================================================
// FOLLOW-UP SYSTEM
// ============================================================================

export interface FollowUpSchedule {
  id: string
  seller_id: string
  listing_id?: string
  scheduled_for: string
  type: 'whatsapp' | 'email' | 'call'
  template_key?: string
  status: 'pending' | 'sent' | 'cancelled'
  sent_at?: string
  sent_by?: string
  created_at: string
}

export interface FollowUpRule {
  id: string
  name: string
  trigger: 'days_after_contact' | 'no_response' | 'stage_change'
  trigger_config: {
    days?: number
    from_stage?: KanbanStage
    to_stage?: KanbanStage
  }
  action: 'send_whatsapp' | 'send_email'
  template_key: string
  enabled: boolean
}

// ============================================================================
// CRM USER ACTIVITY
// ============================================================================

export interface CRMUserActivity {
  id: string
  user_id: string
  user_name: string
  action_type: 
    | 'seller_contacted'
    | 'email_sent'
    | 'task_created'
    | 'note_added'
    | 'kanban_moved'
    | 'sale_marked'
    | 'template_sent'
  entity_type: 'seller' | 'listing'
  entity_id: string
  entity_name: string
  metadata?: Record<string, unknown>
  created_at: string
}

export interface CRMPerformance {
  user_id: string
  user_name: string
  period: string
  sellers_contacted: number
  emails_sent: number
  tasks_created: number
  sales_marked: number
  avg_response_time: number
  conversion_rate: number
}
