/**
 * Automation Rules Builder
 * Mini Zapier - WHEN condition → DO action
 */

import { useState, useEffect } from 'react'
import { fetchAutomationRules, createAutomationRule, toggleRule, deleteRule } from '@admin/services/crmAdvanced'
import type { AutomationRule, AutomationCondition, AutomationAction } from '@admin/types/crm'

const CONDITIONS: { value: AutomationCondition; label: string }[] = [
  { value: 'listing_expiring_24h', label: '📅 Publicación vence en 24h' },
  { value: 'listing_expiring_72h', label: '📅 Publicación vence en 72h' },
  { value: 'no_leads_7d', label: '😴 Sin leads en 7 días' },
  { value: 'no_leads_14d', label: '😴 Sin leads en 14 días' },
  { value: 'new_lead_received', label: '🔔 Nuevo lead recibido' },
  { value: 'high_ctr_low_leads', label: '📈 Alto CTR, bajos leads' },
  { value: 'seller_not_responded_24h', label: '⏰ Vendedor no respondió en 24h' },
  { value: 'seller_not_responded_48h', label: '⏰ Vendedor no respondió en 48h' },
  { value: 'whatsapp_not_enabled', label: '💬 WhatsApp no habilitado' },
  { value: 'phone_not_verified', label: '✅ Teléfono no verificado' },
  { value: 'photos_low_quality', label: '📸 Fotos de baja calidad' },
  { value: 'price_above_market', label: '💰 Precio sobre el mercado' },
  { value: 'seller_at_risk_churn', label: '⚠️ Vendedor en riesgo de churn' },
]

const ACTIONS: { value: AutomationAction; label: string; needsTemplate?: boolean }[] = [
  { value: 'send_email', label: '📧 Enviar email', needsTemplate: true },
  { value: 'send_whatsapp', label: '💬 Enviar WhatsApp', needsTemplate: true },
  { value: 'create_task', label: '✓ Crear tarea' },
  { value: 'add_tag', label: '🏷️ Agregar tag' },
  { value: 'notify_admin', label: '🔔 Notificar admin' },
  { value: 'move_kanban_stage', label: '📋 Mover en Kanban' },
  { value: 'mark_at_risk', label: '⚠️ Marcar at risk' },
]

const EMAIL_TEMPLATES = [
  { value: 'renewal_reminder', label: 'Recordatorio de renovación' },
  { value: 'renewal_expired', label: 'Publicación vencida' },
  { value: 'seller_followup_sold', label: '¿Vendiste tu bici?' },
  { value: 'trust_level_low', label: 'Alerta de confianza baja' },
  { value: 'whatsapp_upsell', label: 'Activar WhatsApp' },
]

const KANBAN_STAGES = [
  { value: 'contacted', label: 'Contactado' },
  { value: 'responded', label: 'Respondió' },
  { value: 'sold_cm', label: 'Vendió por CM' },
  { value: 'sold_elsewhere', label: 'Vendió fuera' },
  { value: 'not_sold', label: 'No vendió' },
  { value: 'needs_help', label: 'Necesita ayuda' },
  { value: 'price_drop', label: 'Reducir precio' },
]

interface AutomationRulesProps {
  compact?: boolean
}

export function AutomationRules({ compact }: AutomationRulesProps) {
  const [rules, setRules] = useState<AutomationRule[]>([])
  const [loading, setLoading] = useState(true)
  const [showCreate, setShowCreate] = useState(false)
  const [newRule, setNewRule] = useState<Partial<AutomationRule>>({
    condition: 'listing_expiring_24h',
    action: 'send_email',
  })

  const loadRules = async () => {
    try {
      const data = await fetchAutomationRules()
      setRules(data)
    } finally {
      setLoading(false)
    }
  }

  useEffect(() => {
    loadRules()
  }, [])

  const handleCreate = async () => {
    if (!newRule.condition || !newRule.action) return
    
    try {
      await createAutomationRule({
        name: newRule.name || 'Regla sin nombre',
        condition: newRule.condition,
        action: newRule.action,
        action_config: newRule.action_config || {},
        enabled: true,
        run_count: 0,
        updated_at: new Date().toISOString(),
      })
      setShowCreate(false)
      setNewRule({ condition: 'listing_expiring_24h', action: 'send_email' })
      await loadRules()
    } catch (err) {
      console.error('[automation] create failed', err)
    }
  }

  const handleToggle = async (ruleId: string, enabled: boolean) => {
    try {
      await toggleRule(ruleId, enabled)
      await loadRules()
    } catch (err) {
      console.error('[automation] toggle failed', err)
    }
  }

  const handleDelete = async (ruleId: string) => {
    if (!confirm('¿Eliminar esta regla?')) return
    try {
      await deleteRule(ruleId)
      await loadRules()
    } catch (err) {
      console.error('[automation] delete failed', err)
    }
  }

  const needsTemplate = ACTIONS.find(a => a.value === newRule.action)?.needsTemplate

  if (loading) {
    return (
      <div className="admin-loading">
        <div className="admin-spinner" />
      </div>
    )
  }

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 'var(--space-4)' }}>
      {/* Header */}
      {!compact && (
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
          <div>
            <h3 style={{ margin: 0, fontSize: '1.125rem', fontWeight: 700 }}>🤖 Reglas Automáticas</h3>
            <p style={{ margin: 'var(--space-1) 0 0', fontSize: '0.875rem', color: 'var(--admin-text-muted)' }}>
              Automatiza acciones basadas en condiciones
            </p>
          </div>
          <button onClick={() => setShowCreate(true)} className="btn btn-primary">
            + Nueva Regla
          </button>
        </div>
      )}

      {/* Rules List */}
      <div style={{ display: 'flex', flexDirection: 'column', gap: 'var(--space-3)' }}>
        {rules.map(rule => (
          <div
            key={rule.id}
            style={{
              display: 'flex',
              alignItems: 'center',
              gap: 'var(--space-3)',
              padding: 'var(--space-3)',
              background: rule.enabled ? 'var(--admin-surface)' : 'var(--admin-gray-50)',
              border: `1px solid ${rule.enabled ? 'var(--admin-border)' : 'transparent'}`,
              borderRadius: 'var(--radius-lg)',
              opacity: rule.enabled ? 1 : 0.7,
            }}
          >
            <div style={{
              width: 36,
              height: 36,
              borderRadius: 'var(--radius)',
              background: rule.enabled ? '#ecfdf5' : 'var(--admin-gray-200)',
              display: 'grid',
              placeItems: 'center',
              fontSize: '1rem',
            }}>
              {rule.enabled ? '⚡' : '⏸️'}
            </div>

            <div style={{ flex: 1, minWidth: 0 }}>
              <div style={{ fontWeight: 600, fontSize: '0.9375rem', marginBottom: 2 }}>
                {rule.name}
              </div>
              <div style={{ fontSize: '0.75rem', color: 'var(--admin-text-muted)' }}>
                <span style={{ color: '#3b82f6' }}>CUANDO</span> {CONDITIONS.find(c => c.value === rule.condition)?.label} →{' '}
                <span style={{ color: '#10b981' }}>ENTONCES</span> {ACTIONS.find(a => a.value === rule.action)?.label}
              </div>
            </div>

            <div style={{ display: 'flex', alignItems: 'center', gap: 'var(--space-2)' }}>
              <label className="admin-toggle">
                <input
                  type="checkbox"
                  checked={rule.enabled}
                  onChange={(e) => handleToggle(rule.id, e.target.checked)}
                />
                <span className="admin-toggle-slider" />
              </label>
              <button
                onClick={() => handleDelete(rule.id)}
                style={{
                  padding: 'var(--space-1) var(--space-2)',
                  background: 'transparent',
                  border: 'none',
                  cursor: 'pointer',
                  color: '#ef4444',
                }}
              >
                🗑️
              </button>
            </div>
          </div>
        ))}

        {rules.length === 0 && (
          <div style={{
            padding: 'var(--space-8)',
            textAlign: 'center',
            background: 'var(--admin-gray-50)',
            borderRadius: 'var(--radius-lg)',
            border: '2px dashed var(--admin-border)',
          }}>
            <div style={{ fontSize: '2.5rem', marginBottom: 'var(--space-3)' }}>🤖</div>
            <h4 style={{ margin: '0 0 var(--space-2)', fontSize: '1rem' }}>Sin reglas automáticas</h4>
            <p style={{ margin: 0, fontSize: '0.875rem', color: 'var(--admin-text-muted)' }}>
              Crea tu primera regla para automatizar tareas repetitivas
            </p>
          </div>
        )}
      </div>

      {/* Create Modal */}
      {showCreate && (
        <div style={{
          position: 'fixed',
          inset: 0,
          background: 'rgba(0,0,0,0.5)',
          display: 'grid',
          placeItems: 'center',
          zIndex: 100,
        }}>
          <div style={{
            background: 'var(--admin-surface)',
            borderRadius: 'var(--radius-xl)',
            padding: 'var(--space-6)',
            width: '100%',
            maxWidth: 520,
            margin: 'var(--space-4)',
            maxHeight: '90vh',
            overflow: 'auto',
          }}>
            <h3 style={{ margin: '0 0 var(--space-4)', fontSize: '1.25rem', fontWeight: 700 }}>
              🤖 Nueva Regla Automática
            </h3>

            {/* Rule Name */}
            <div style={{ marginBottom: 'var(--space-4)' }}>
              <label className="admin-label">Nombre de la regla</label>
              <input
                type="text"
                value={newRule.name || ''}
                onChange={(e) => setNewRule({ ...newRule, name: e.target.value })}
                placeholder="Ej: Email a publicaciones por vencer"
                className="admin-input"
              />
            </div>

            {/* WHEN */}
            <div style={{ marginBottom: 'var(--space-4)' }}>
              <label className="admin-label" style={{ color: '#3b82f6' }}>📍 CUANDO...</label>
              <select
                value={newRule.condition}
                onChange={(e) => setNewRule({ ...newRule, condition: e.target.value as AutomationCondition })}
                className="admin-select"
              >
                {CONDITIONS.map(c => (
                  <option key={c.value} value={c.value}>{c.label}</option>
                ))}
              </select>
            </div>

            {/* Arrow */}
            <div style={{
              textAlign: 'center',
              fontSize: '1.5rem',
              marginBottom: 'var(--space-2)',
              color: 'var(--admin-text-muted)',
            }}>
              ⬇️
            </div>

            {/* DO */}
            <div style={{ marginBottom: 'var(--space-4)' }}>
              <label className="admin-label" style={{ color: '#10b981' }}>⚡ ENTONCES...</label>
              <select
                value={newRule.action}
                onChange={(e) => setNewRule({ ...newRule, action: e.target.value as AutomationAction, action_config: {} })}
                className="admin-select"
              >
                {ACTIONS.map(a => (
                  <option key={a.value} value={a.value}>{a.label}</option>
                ))}
              </select>
            </div>

            {/* Template Selection */}
            {needsTemplate && (
              <div style={{ marginBottom: 'var(--space-4)' }}>
                <label className="admin-label">Template</label>
                <select
                  value={newRule.action_config?.template || ''}
                  onChange={(e) => setNewRule({
                    ...newRule,
                    action_config: { ...newRule.action_config, template: e.target.value }
                  })}
                  className="admin-select"
                >
                  <option value="">Seleccionar template...</option>
                  {EMAIL_TEMPLATES.map(t => (
                    <option key={t.value} value={t.value}>{t.label}</option>
                  ))}
                </select>
              </div>
            )}

            {/* Delay */}
            <div style={{ marginBottom: 'var(--space-4)' }}>
              <label className="admin-label">Retraso (opcional)</label>
              <select
                value={newRule.action_config?.delay_minutes || ''}
                onChange={(e) => setNewRule({
                  ...newRule,
                  action_config: { ...newRule.action_config, delay_minutes: e.target.value ? parseInt(e.target.value) : undefined }
                })}
                className="admin-select"
              >
                <option value="">Inmediatamente</option>
                <option value="60">1 hora después</option>
                <option value="360">6 horas después</option>
                <option value="720">12 horas después</option>
                <option value="1440">24 horas después</option>
              </select>
            </div>

            {/* Buttons */}
            <div style={{ display: 'flex', gap: 'var(--space-3)', justifyContent: 'flex-end' }}>
              <button onClick={() => setShowCreate(false)} className="btn btn-secondary">
                Cancelar
              </button>
              <button onClick={handleCreate} className="btn btn-primary" disabled={!newRule.name}>
                Crear Regla
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  )
}
