/**
 * Next Best Action Component
 * Shows AI-powered suggestions for CRM actions
 */

import { useEffect, useState } from 'react'
import { fetchRecommendedActions, completeAction, dismissAction } from '@admin/services/crmAdvanced'
import type { RecommendedAction } from '@admin/types/crm'

interface NextBestActionProps {
  sellerId?: string
  onActionClick?: (action: RecommendedAction) => void
}

const priorityConfig = {
  critical: { color: '#dc2626', bg: '#fef2f2', icon: '🔥' },
  high: { color: '#ea580c', bg: '#fff7ed', icon: '⚡' },
  medium: { color: '#ca8a04', bg: '#fefce8', icon: '💡' },
  low: { color: '#6b7280', bg: '#f9fafb', icon: '📌' },
}

const actionTypeConfig: Record<string, { icon: string; label: string; btnText: string }> = {
  contact_whatsapp: { icon: '💬', label: 'Contactar WhatsApp', btnText: 'Abrir WhatsApp' },
  contact_email: { icon: '✉️', label: 'Enviar Email', btnText: 'Enviar Email' },
  send_template: { icon: '📧', label: 'Enviar Template', btnText: 'Ver Templates' },
  create_task: { icon: '✓', label: 'Crear Tarea', btnText: 'Crear Tarea' },
  suggest_price_drop: { icon: '📉', label: 'Sugerir Bajar Precio', btnText: 'Enviar Sugerencia' },
  suggest_improve_photos: { icon: '📸', label: 'Mejorar Fotos', btnText: 'Enviar Tips' },
  suggest_verify_identity: { icon: '✅', label: 'Verificar Identidad', btnText: 'Enviar Link' },
  suggest_add_whatsapp: { icon: '📱', label: 'Agregar WhatsApp', btnText: 'Enviar Guía' },
  mark_at_risk: { icon: '⚠️', label: 'Marcar At Risk', btnText: 'Confirmar' },
}

export function NextBestAction({ sellerId, onActionClick }: NextBestActionProps) {
  const [actions, setActions] = useState<RecommendedAction[]>([])
  const [loading, setLoading] = useState(true)
  const [expandedId, setExpandedId] = useState<string | null>(null)

  const loadActions = async () => {
    setLoading(true)
    try {
      const data = await fetchRecommendedActions(sellerId)
      setActions(data)
    } catch (err) {
      console.error('[next-best-action] load failed', err)
    } finally {
      setLoading(false)
    }
  }

  useEffect(() => {
    loadActions()
  }, [sellerId])

  const handleDismiss = async (actionId: string, e: React.MouseEvent) => {
    e.stopPropagation()
    try {
      await dismissAction(actionId)
      await loadActions()
    } catch (err) {
      console.error('[next-best-action] dismiss failed', err)
    }
  }

  const handleComplete = async (actionId: string) => {
    try {
      await completeAction(actionId)
      await loadActions()
    } catch (err) {
      console.error('[next-best-action] complete failed', err)
    }
  }

  if (loading) {
    return (
      <div style={{ padding: 'var(--space-4)', textAlign: 'center' }}>
        <div className="admin-spinner" style={{ margin: '0 auto var(--space-3)' }} />
        <p style={{ color: 'var(--admin-text-muted)', fontSize: '0.875rem' }}>
          Analizando datos...
        </p>
      </div>
    )
  }

  if (actions.length === 0) {
    return (
      <div style={{ 
        padding: 'var(--space-6)', 
        textAlign: 'center',
        background: 'var(--admin-gray-50)',
        borderRadius: 'var(--radius-lg)',
      }}>
        <div style={{ fontSize: '2.5rem', marginBottom: 'var(--space-3)' }}>✅</div>
        <h4 style={{ margin: '0 0 var(--space-2)', fontSize: '1rem', color: 'var(--admin-text)' }}>
          No hay acciones pendientes
        </h4>
        <p style={{ margin: 0, fontSize: '0.875rem', color: 'var(--admin-text-muted)' }}>
          Todo está bajo control. Te avisaremos cuando haya algo importante.
        </p>
      </div>
    )
  }

  // Group by priority
  const critical = actions.filter(a => a.priority === 'critical')
  const high = actions.filter(a => a.priority === 'high')
  const medium = actions.filter(a => a.priority === 'medium')
  const low = actions.filter(a => a.priority === 'low')

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 'var(--space-3)' }}>
      {/* Summary Header */}
      <div style={{ 
        display: 'flex', 
        gap: 'var(--space-3)', 
        flexWrap: 'wrap',
        marginBottom: 'var(--space-2)'
      }}>
        {critical.length > 0 && (
          <div style={{
            padding: 'var(--space-2) var(--space-3)',
            background: '#fef2f2',
            borderRadius: 'var(--radius)',
            fontSize: '0.875rem',
            color: '#dc2626',
            fontWeight: 600,
          }}>
            🔥 {critical.length} críticas
          </div>
        )}
        {high.length > 0 && (
          <div style={{
            padding: 'var(--space-2) var(--space-3)',
            background: '#fff7ed',
            borderRadius: 'var(--radius)',
            fontSize: '0.875rem',
            color: '#ea580c',
            fontWeight: 600,
          }}>
            ⚡ {high.length} altas
          </div>
        )}
        <div style={{
          marginLeft: 'auto',
          fontSize: '0.8125rem',
          color: 'var(--admin-text-muted)',
        }}>
          {actions.length} acciones sugeridas
        </div>
      </div>

      {/* Action Cards */}
      {[...critical, ...high, ...medium, ...low].map((action) => {
        const priority = priorityConfig[action.priority]
        const actionType = actionTypeConfig[action.type]
        const isExpanded = expandedId === action.id

        return (
          <div
            key={action.id}
            style={{
              background: 'var(--admin-surface)',
              border: `1px solid ${priority.color}30`,
              borderLeft: `4px solid ${priority.color}`,
              borderRadius: 'var(--radius-lg)',
              overflow: 'hidden',
              transition: 'all 0.2s',
            }}
          >
            {/* Card Header */}
            <div
              onClick={() => setExpandedId(isExpanded ? null : action.id)}
              style={{
                padding: 'var(--space-4)',
                cursor: 'pointer',
                display: 'flex',
                alignItems: 'flex-start',
                gap: 'var(--space-3)',
              }}
            >
              <div style={{
                width: 40,
                height: 40,
                borderRadius: 'var(--radius-lg)',
                background: priority.bg,
                display: 'grid',
                placeItems: 'center',
                fontSize: '1.25rem',
                flexShrink: 0,
              }}>
                {actionType?.icon || action.icon}
              </div>

              <div style={{ flex: 1, minWidth: 0 }}>
                <div style={{ 
                  display: 'flex', 
                  alignItems: 'center', 
                  gap: 'var(--space-2)',
                  marginBottom: 'var(--space-1)'
                }}>
                  <span style={{
                    fontSize: '0.625rem',
                    fontWeight: 700,
                    textTransform: 'uppercase',
                    letterSpacing: '0.05em',
                    color: priority.color,
                    background: priority.bg,
                    padding: '2px 8px',
                    borderRadius: 'var(--radius)',
                  }}>
                    {action.priority}
                  </span>
                  <span style={{
                    fontSize: '0.75rem',
                    color: 'var(--admin-text-muted)',
                  }}>
                    {actionType?.label || action.type}
                  </span>
                </div>

                <h4 style={{ 
                  margin: '0 0 var(--space-1)', 
                  fontSize: '0.9375rem', 
                  fontWeight: 600,
                  color: 'var(--admin-text)',
                }}>
                  {action.title}
                </h4>

                <p style={{ 
                  margin: 0, 
                  fontSize: '0.8125rem', 
                  color: 'var(--admin-text-secondary)',
                  lineHeight: 1.5,
                }}>
                  {action.description}
                </p>

                {/* Listing info if available */}
                {action.listing_title && (
                  <div style={{
                    marginTop: 'var(--space-2)',
                    padding: 'var(--space-2)',
                    background: 'var(--admin-gray-50)',
                    borderRadius: 'var(--radius)',
                    fontSize: '0.75rem',
                    color: 'var(--admin-text-muted)',
                  }}>
                    📦 {action.listing_title}
                  </div>
                )}
              </div>

              <div style={{ display: 'flex', alignItems: 'center', gap: 'var(--space-2)' }}>
                <button
                  onClick={(e) => handleDismiss(action.id, e)}
                  style={{
                    padding: 'var(--space-1)',
                    background: 'transparent',
                    border: 'none',
                    cursor: 'pointer',
                    color: 'var(--admin-text-muted)',
                    fontSize: '1rem',
                    borderRadius: 'var(--radius)',
                  }}
                  title="Descartar"
                >
                  ✕
                </button>
                <span style={{ 
                  fontSize: '0.75rem', 
                  color: 'var(--admin-text-muted)',
                  transform: isExpanded ? 'rotate(180deg)' : 'none',
                  transition: 'transform 0.2s',
                }}>
                  ▼
                </span>
              </div>
            </div>

            {/* Expanded Content */}
            {isExpanded && (
              <div style={{
                padding: '0 var(--space-4) var(--space-4)',
                borderTop: '1px solid var(--admin-border-light)',
              }}>
                {/* Reason */}
                <div style={{
                  padding: 'var(--space-3)',
                  background: 'var(--admin-gray-50)',
                  borderRadius: 'var(--radius)',
                  marginTop: 'var(--space-3)',
                  fontSize: '0.8125rem',
                  color: 'var(--admin-text-secondary)',
                }}>
                  <strong>🤖 Por qué sugerimos esto:</strong>
                  <p style={{ margin: 'var(--space-1) 0 0' }}>{action.reason}</p>
                </div>

                {/* Expected Impact */}
                {(action.expected_conversion_lift || action.estimated_value) && (
                  <div style={{
                    display: 'flex',
                    gap: 'var(--space-4)',
                    marginTop: 'var(--space-3)',
                    padding: 'var(--space-3)',
                    background: '#ecfdf5',
                    borderRadius: 'var(--radius)',
                  }}>
                    {action.expected_conversion_lift && (
                      <div>
                        <div style={{ fontSize: '0.75rem', color: '#065f46' }}>Conversión esperada</div>
                        <div style={{ fontSize: '1.125rem', fontWeight: 700, color: '#047857' }}>
                          +{(action.expected_conversion_lift * 100).toFixed(0)}%
                        </div>
                      </div>
                    )}
                    {action.estimated_value && (
                      <div>
                        <div style={{ fontSize: '0.75rem', color: '#065f46' }}>Valor estimado</div>
                        <div style={{ fontSize: '1.125rem', fontWeight: 700, color: '#047857' }}>
                          ${action.estimated_value.toLocaleString()}
                        </div>
                      </div>
                    )}
                  </div>
                )}

                {/* Action Buttons */}
                <div style={{
                  display: 'flex',
                  gap: 'var(--space-2)',
                  marginTop: 'var(--space-3)',
                }}>
                  <button
                    onClick={() => {
                      onActionClick?.(action)
                      handleComplete(action.id)
                    }}
                    className="btn btn-primary"
                  >
                    {actionType?.btnText || 'Ejecutar'}
                  </button>
                  <button
                    onClick={() => handleComplete(action.id)}
                    className="btn btn-secondary"
                  >
                    Marcar como hecho
                  </button>
                </div>
              </div>
            )}
          </div>
        )
      })}
    </div>
  )
}
