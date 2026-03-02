/**
 * Kanban Board for WhatsApp Follow-up Flow
 * Ciclo Market CRM
 */

import { useEffect, useState, useCallback } from 'react'
import { fetchKanbanCards, moveKanbanCard } from '@admin/services/crmAdvanced'
import { KANBAN_STAGES, type KanbanCard, type KanbanStage } from '@admin/types/crm'

interface KanbanBoardProps {
  onCardClick?: (card: KanbanCard) => void
  onWhatsAppClick?: (card: KanbanCard) => void
}

// Priority indicators
const priorityConfig = {
  urgent: { color: '#ef4444', label: 'Urgente', bg: '#fef2f2' },
  high: { color: '#f97316', label: 'Alta', bg: '#fff7ed' },
  medium: { color: '#f59e0b', label: 'Media', bg: '#fffbeb' },
  low: { color: '#6b7280', label: 'Baja', bg: '#f9fafb' },
}

export function KanbanBoard({ onCardClick, onWhatsAppClick }: KanbanBoardProps) {
  const [cards, setCards] = useState<KanbanCard[]>([])
  const [loading, setLoading] = useState(true)
  const [draggedCard, setDraggedCard] = useState<KanbanCard | null>(null)
  const [dragOverStage, setDragOverStage] = useState<KanbanStage | null>(null)
  const [selectedCard, setSelectedCard] = useState<KanbanCard | null>(null)
  const [showMoveModal, setShowMoveModal] = useState(false)
  const [moveNotes, setMoveNotes] = useState('')
  const [targetStage, setTargetStage] = useState<KanbanStage | null>(null)

  const loadCards = useCallback(async () => {
    setLoading(true)
    try {
      const data = await fetchKanbanCards()
      setCards(data)
    } catch (err) {
      console.error('[kanban] load failed', err)
    } finally {
      setLoading(false)
    }
  }, [])

  useEffect(() => {
    loadCards()
  }, [loadCards])

  const handleDragStart = (card: KanbanCard) => {
    setDraggedCard(card)
  }

  const handleDragOver = (e: React.DragEvent, stage: KanbanStage) => {
    e.preventDefault()
    setDragOverStage(stage)
  }

  const handleDragLeave = () => {
    setDragOverStage(null)
  }

  const handleDrop = async (e: React.DragEvent, stage: KanbanStage) => {
    e.preventDefault()
    setDragOverStage(null)
    
    if (!draggedCard || draggedCard.stage === stage) {
      setDraggedCard(null)
      return
    }

    setSelectedCard(draggedCard)
    setTargetStage(stage)
    setShowMoveModal(true)
    setDraggedCard(null)
  }

  const confirmMove = async () => {
    if (!selectedCard || !targetStage) return

    try {
      await moveKanbanCard(selectedCard.id, targetStage, moveNotes)
      await loadCards()
      setShowMoveModal(false)
      setSelectedCard(null)
      setTargetStage(null)
      setMoveNotes('')
    } catch (err) {
      console.error('[kanban] move failed', err)
    }
  }

  const getCardsForStage = (stage: KanbanStage) => {
    return cards.filter(c => c.stage === stage).sort((a, b) => {
      const priorityOrder = { urgent: 0, high: 1, medium: 2, low: 3 }
      const priorityDiff = priorityOrder[a.priority] - priorityOrder[b.priority]
      if (priorityDiff !== 0) return priorityDiff
      return new Date(a.created_at).getTime() - new Date(b.created_at).getTime()
    })
  }

  const formatTimeAgo = (date: string) => {
    const diff = Date.now() - new Date(date).getTime()
    const hours = Math.floor(diff / 3600000)
    const days = Math.floor(hours / 24)
    
    if (hours < 1) return 'Ahora'
    if (hours < 24) return `${hours}h`
    if (days < 7) return `${days}d`
    return `${Math.floor(days / 7)}s`
  }

  if (loading) {
    return (
      <div style={{ display: 'flex', gap: 'var(--space-4)', overflowX: 'auto', padding: 'var(--space-4)' }}>
        {KANBAN_STAGES.map(stage => (
          <div key={stage.key} style={{ minWidth: '280px', flex: 1 }}>
            <div style={{ 
              background: 'var(--admin-gray-50)', 
              borderRadius: 'var(--radius-lg)', 
              padding: 'var(--space-4)',
              height: '600px'
            }}>
              <div className="admin-loading">
                <div className="admin-spinner" />
              </div>
            </div>
          </div>
        ))}
      </div>
    )
  }

  return (
    <div style={{ display: 'flex', flexDirection: 'column', height: '100%' }}>
      {/* Header */}
      <div style={{ 
        display: 'flex', 
        justifyContent: 'space-between', 
        alignItems: 'center',
        padding: 'var(--space-4) var(--space-5)',
        borderBottom: '1px solid var(--admin-border)',
        background: 'var(--admin-surface)'
      }}>
        <div>
          <h2 style={{ margin: 0, fontSize: '1.25rem', fontWeight: 700 }}>📋 Kanban de WhatsApp</h2>
          <p style={{ margin: 'var(--space-1) 0 0', fontSize: '0.875rem', color: 'var(--admin-text-muted)' }}>
            Flujo de seguimiento: Contactado → Respondió → Vendió/No vendió
          </p>
        </div>
        <div style={{ display: 'flex', gap: 'var(--space-2)', alignItems: 'center' }}>
          <span style={{ fontSize: '0.875rem', color: 'var(--admin-text-muted)' }}>
            Total: <strong>{cards.length}</strong> cards
          </span>
          <button 
            onClick={loadCards}
            className="btn btn-secondary btn-sm"
          >
            ↻ Actualizar
          </button>
        </div>
      </div>

      {/* Kanban Columns */}
      <div style={{ 
        display: 'flex', 
        gap: 'var(--space-4)', 
        overflowX: 'auto', 
        padding: 'var(--space-4)',
        flex: 1,
        background: 'var(--admin-bg)'
      }}>
        {KANBAN_STAGES.map(stage => {
          const stageCards = getCardsForStage(stage.key)
          const isDragOver = dragOverStage === stage.key

          return (
            <div 
              key={stage.key}
              style={{ 
                minWidth: '300px',
                maxWidth: '340px',
                flex: 1,
                display: 'flex',
                flexDirection: 'column',
              }}
            >
              {/* Column Header */}
              <div style={{
                background: stage.color,
                color: 'white',
                padding: 'var(--space-3) var(--space-4)',
                borderRadius: 'var(--radius-lg) var(--radius-lg) 0 0',
                display: 'flex',
                alignItems: 'center',
                gap: 'var(--space-2)',
              }}>
                <span style={{ fontSize: '1.25rem' }}>{stage.icon}</span>
                <div style={{ flex: 1 }}>
                  <div style={{ fontWeight: 600, fontSize: '0.9375rem' }}>{stage.label}</div>
                  <div style={{ fontSize: '0.75rem', opacity: 0.9 }}>{stage.description}</div>
                </div>
                <div style={{
                  background: 'rgba(255,255,255,0.2)',
                  borderRadius: 'var(--radius)',
                  padding: '2px 8px',
                  fontSize: '0.875rem',
                  fontWeight: 600,
                }}>
                  {stageCards.length}
                </div>
              </div>

              {/* Column Body */}
              <div
                onDragOver={(e) => handleDragOver(e, stage.key)}
                onDragLeave={handleDragLeave}
                onDrop={(e) => handleDrop(e, stage.key)}
                style={{
                  background: isDragOver ? '#eff6ff' : 'var(--admin-gray-50)',
                  border: `2px ${isDragOver ? 'dashed #3b82f6' : 'solid transparent'}`,
                  borderRadius: '0 0 var(--radius-lg) var(--radius-lg)',
                  padding: 'var(--space-3)',
                  flex: 1,
                  overflowY: 'auto',
                  maxHeight: 'calc(100vh - 280px)',
                  minHeight: '200px',
                }}
              >
                <div style={{ display: 'flex', flexDirection: 'column', gap: 'var(--space-3)' }}>
                  {stageCards.map(card => {
                    const priority = priorityConfig[card.priority]
                    
                    return (
                      <div
                        key={card.id}
                        draggable
                        onDragStart={() => handleDragStart(card)}
                        onClick={() => onCardClick?.(card)}
                        style={{
                          background: 'var(--admin-surface)',
                          border: '1px solid var(--admin-border)',
                          borderRadius: 'var(--radius-lg)',
                          padding: 'var(--space-3)',
                          cursor: 'grab',
                          boxShadow: 'var(--shadow-sm)',
                          transition: 'all 0.2s',
                        }}
                      >
                        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', marginBottom: 'var(--space-2)' }}>
                          <span style={{
                            fontSize: '0.625rem',
                            fontWeight: 600,
                            textTransform: 'uppercase',
                            padding: '2px 8px',
                            borderRadius: 'var(--radius)',
                            background: priority.bg,
                            color: priority.color,
                          }}>
                            {priority.label}
                          </span>
                          <span style={{ fontSize: '0.75rem', color: 'var(--admin-text-muted)' }}>
                            {formatTimeAgo(card.last_contact_at)}
                          </span>
                        </div>

                        <div style={{ fontWeight: 600, color: 'var(--admin-text)', fontSize: '0.9375rem', marginBottom: 'var(--space-1)' }}>
                          {card.seller_name}
                        </div>
                        
                        {card.listing_title && (
                          <div style={{ fontSize: '0.8125rem', color: 'var(--admin-text-muted)', marginBottom: 'var(--space-2)' }}>
                            📦 {card.listing_title}
                          </div>
                        )}

                        {card.tags.length > 0 && (
                          <div style={{ display: 'flex', gap: 'var(--space-1)', flexWrap: 'wrap', marginTop: 'var(--space-2)' }}>
                            {card.tags.map(tag => (
                              <span key={tag} className="badge badge-gray" style={{ fontSize: '0.625rem' }}>
                                {tag}
                              </span>
                            ))}
                          </div>
                        )}

                        <div style={{ 
                          display: 'flex', 
                          justifyContent: 'space-between', 
                          alignItems: 'center',
                          marginTop: 'var(--space-2)',
                          paddingTop: 'var(--space-2)',
                          borderTop: '1px solid var(--admin-border-light)',
                          fontSize: '0.75rem',
                          color: 'var(--admin-text-muted)'
                        }}>
                          <span>📱 {card.whatsapp_number}</span>
                          <div style={{ display: 'flex', gap: 'var(--space-2)', alignItems: 'center' }}>
                            {card.estimated_value && (
                              <span style={{ fontWeight: 600, color: 'var(--cm-success)' }}>
                                ${card.estimated_value.toLocaleString()}
                              </span>
                            )}
                            {/* WhatsApp Button */}
                            <button
                              onClick={(e) => {
                                e.stopPropagation()
                                onWhatsAppClick?.(card)
                              }}
                              title="Contactar por WhatsApp"
                              style={{
                                display: 'flex',
                                alignItems: 'center',
                                gap: '4px',
                                padding: '4px 8px',
                                background: '#ecfdf5',
                                color: '#047857',
                                border: '1px solid #a7f3d0',
                                borderRadius: 'var(--radius)',
                                fontSize: '0.75rem',
                                fontWeight: 600,
                                cursor: 'pointer',
                                transition: 'all 0.2s',
                              }}
                              onMouseEnter={(e) => {
                                e.currentTarget.style.background = '#d1fae5'
                              }}
                              onMouseLeave={(e) => {
                                e.currentTarget.style.background = '#ecfdf5'
                              }}
                            >
                              <svg width="14" height="14" viewBox="0 0 24 24" fill="currentColor">
                                <path d="M17.472 14.382c-.297-.149-1.758-.867-2.03-.967-.273-.099-.471-.148-.67.15-.197.297-.767.966-.94 1.164-.173.199-.347.223-.644.075-.297-.15-1.255-.463-2.39-1.475-.883-.788-1.48-1.761-1.653-2.059-.173-.297-.018-.458.13-.606.134-.133.298-.347.446-.52.149-.174.198-.298.298-.497.099-.198.05-.371-.025-.52-.075-.149-.669-1.612-.916-2.207-.242-.579-.487-.5-.669-.51-.173-.008-.371-.01-.57-.01-.198 0-.52.074-.792.372-.272.297-1.04 1.016-1.04 2.479 0 1.462 1.065 2.875 1.213 3.074.149.198 2.096 3.2 5.077 4.487.709.306 1.262.489 1.694.625.712.227 1.36.195 1.871.118.571-.085 1.758-.719 2.006-1.413.248-.694.248-1.289.173-1.413-.074-.124-.272-.198-.57-.347m-5.421 7.403h-.004a9.87 9.87 0 01-5.031-1.378l-.361-.214-3.741.982.998-3.648-.235-.374a9.86 9.86 0 01-1.51-5.26c.001-5.45 4.436-9.884 9.888-9.884 2.64 0 5.122 1.03 6.988 2.898a9.825 9.825 0 012.893 6.994c-.003 5.45-4.437 9.884-9.885 9.884m8.413-18.297A11.815 11.815 0 0012.05 0C5.495 0 .16 5.335.157 11.892c0 2.096.547 4.142 1.588 5.945L.057 24l6.305-1.654a11.882 11.882 0 005.683 1.448h.005c6.554 0 11.89-5.335 11.893-11.893a11.821 11.821 0 00-3.48-8.413Z"/>
                              </svg>
                              <span>WA</span>
                            </button>
                          </div>
                        </div>

                        {card.notes && (
                          <div style={{ 
                            marginTop: 'var(--space-2)',
                            padding: 'var(--space-2)',
                            background: 'var(--admin-gray-50)',
                            borderRadius: 'var(--radius)',
                            fontSize: '0.75rem',
                            color: 'var(--admin-text-secondary)',
                          }}>
                            📝 {card.notes.length > 60 ? card.notes.slice(0, 60) + '...' : card.notes}
                          </div>
                        )}
                      </div>
                    )
                  })}
                </div>

                {stageCards.length === 0 && (
                  <div style={{ 
                    textAlign: 'center', 
                    padding: 'var(--space-8) var(--space-4)',
                    color: 'var(--admin-text-muted)',
                    fontSize: '0.875rem'
                  }}>
                    <div style={{ fontSize: '2rem', marginBottom: 'var(--space-2)' }}>{stage.icon}</div>
                    <div>Sin cards</div>
                    <div style={{ fontSize: '0.75rem', marginTop: 'var(--space-1)' }}>
                      Arrastra cards aquí
                    </div>
                  </div>
                )}
              </div>
            </div>
          )
        })}
      </div>

      {/* Move Modal */}
      {showMoveModal && selectedCard && targetStage && (
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
            maxWidth: '480px',
            margin: 'var(--space-4)',
          }}>
            <h3 style={{ margin: '0 0 var(--space-4)', fontSize: '1.125rem', fontWeight: 700 }}>
              Mover card a: {KANBAN_STAGES.find(s => s.key === targetStage)?.label}
            </h3>
            
            <div style={{ marginBottom: 'var(--space-4)' }}>
              <label style={{ 
                display: 'block', 
                fontSize: '0.75rem', 
                fontWeight: 600, 
                color: 'var(--admin-text-muted)', 
                textTransform: 'uppercase',
                marginBottom: 'var(--space-2)'
              }}>
                Notas (opcional)
              </label>
              <textarea
                value={moveNotes}
                onChange={(e) => setMoveNotes(e.target.value)}
                placeholder="Ej: Respondió que está esperando una oferta..."
                rows={3}
                className="admin-textarea"
                autoFocus
              />
            </div>

            <div style={{ display: 'flex', gap: 'var(--space-3)', justifyContent: 'flex-end' }}>
              <button
                onClick={() => {
                  setShowMoveModal(false)
                  setSelectedCard(null)
                  setTargetStage(null)
                  setMoveNotes('')
                }}
                className="btn btn-secondary"
              >
                Cancelar
              </button>
              <button
                onClick={confirmMove}
                className="btn btn-primary"
              >
                Confirmar movimiento
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  )
}
