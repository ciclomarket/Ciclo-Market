import { useEffect, useMemo, useState, useCallback } from 'react'
import type { SellerOpsDetails, SellerStage, ListingRow } from '@admin/services/sellerOps'
import { addSellerNote, createSellerTask, markSellerSale, sendSellerEmailTemplate, setSellerStage, fetchSellerTags, addSellerTag, removeSellerTag, PREDEFINED_TAGS, scheduleFollowUp, markListingAsSold, logOutreachWhatsApp } from '@admin/services/sellerOps'
import { EmailTemplatePicker, EMAIL_TEMPLATES, type EmailTemplateKey } from './EmailTemplatePicker'

type TabKey = 'profile' | 'listings' | 'engagement' | 'outreach' | 'tasks' | 'notes' | 'emails' | 'timeline'

// Timeline item types
interface TimelineItem {
  id: string
  type: 'outreach' | 'task' | 'note' | 'stage_change' | 'listing' | 'sale'
  title: string
  description?: string
  timestamp: string
  meta?: Record<string, unknown>
  icon: string
  color: string
}

const dateTimeFormatter = new Intl.DateTimeFormat('es-AR', { dateStyle: 'medium', timeStyle: 'short' })
const dateFormatter = new Intl.DateTimeFormat('es-AR', { dateStyle: 'medium' })

function formatDateTime(value: string | null | undefined): string {
  if (!value) return '—'
  const ts = Date.parse(value)
  if (Number.isNaN(ts)) return '—'
  return dateTimeFormatter.format(new Date(ts))
}

function formatDate(value: string | null | undefined): string {
  if (!value) return '—'
  const ts = Date.parse(value)
  if (Number.isNaN(ts)) return '—'
  return dateFormatter.format(new Date(ts))
}

function safeStage(value: string | null | undefined): SellerStage {
  const raw = String(value || 'active').toLowerCase()
  if (raw === 'lead' || raw === 'onboarding' || raw === 'active' || raw === 'at_risk' || raw === 'churned' || raw === 'sold' || raw === 'lost') return raw
  return 'active'
}

function getStageBadgeClass(stage: string): string {
  switch (stage) {
    case 'lead': return 'badge-stage-lead'
    case 'onboarding': return 'badge-blue'
    case 'active': return 'badge-green'
    case 'at_risk': return 'badge-amber'
    case 'churned': return 'badge-red'
    case 'sold': return 'badge-green'
    case 'lost': return 'badge-gray'
    default: return 'badge-gray'
  }
}

function getChannelBadgeClass(channel: string): string {
  switch (channel) {
    case 'whatsapp': return 'badge-green'
    case 'email': return 'badge-blue'
    default: return 'badge-gray'
  }
}

function getStatusBadgeClass(status: string): string {
  switch (status) {
    case 'sent': return 'badge-green'
    case 'queued': return 'badge-amber'
    case 'failed': return 'badge-red'
    case 'replied': return 'badge-blue'
    case 'stop': return 'badge-gray'
    default: return 'badge-gray'
  }
}

export interface SellerDrawerProps {
  open: boolean
  details: SellerOpsDetails | null
  onClose: () => void
  onRefresh: () => void
}

export function SellerDrawer({ open, details, onClose, onRefresh }: SellerDrawerProps) {
  const [tab, setTab] = useState<TabKey>('profile')
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [success, setSuccess] = useState<string | null>(null)
  const [noteDraft, setNoteDraft] = useState('')
  const [taskType, setTaskType] = useState('CONTACT_HOT')
  const [stageDraft, setStageDraft] = useState<SellerStage>('active')
  
  // Email template state
  const [selectedTemplate, setSelectedTemplate] = useState<EmailTemplateKey | null>(null)
  const [selectedListing, setSelectedListing] = useState<string | null>(null)
  const [customSubject, setCustomSubject] = useState('')
  const [customBody, setCustomBody] = useState('')
  const [showPreview, setShowPreview] = useState(false)
  
  // Tags state
  const [sellerTags, setSellerTags] = useState<string[]>([])
  const [showTagSelector, setShowTagSelector] = useState(false)
  
  // Load tags when drawer opens
  useEffect(() => {
    if (!open || !details?.sellerId) return
    fetchSellerTags(details.sellerId).then(setSellerTags).catch(console.error)
  }, [open, details?.sellerId])
  
  const handleAddTag = async (tag: string) => {
    if (!details?.sellerId) return
    try {
      await addSellerTag(details.sellerId, tag)
      setSellerTags(prev => [...prev, tag])
    } catch (err) {
      console.error('[tags] add failed', err)
    }
  }
  
  const handleRemoveTag = async (tag: string) => {
    if (!details?.sellerId) return
    try {
      await removeSellerTag(details.sellerId, tag)
      setSellerTags(prev => prev.filter(t => t !== tag))
    } catch (err) {
      console.error('[tags] remove failed', err)
    }
  }
  
  // Follow-up state
  const [showFollowUpForm, setShowFollowUpForm] = useState(false)
  const [followUpType, setFollowUpType] = useState<'whatsapp' | 'email' | 'call'>('whatsapp')
  const [followUpWhen, setFollowUpWhen] = useState<'tomorrow' | '3days' | '1week' | 'custom'>('tomorrow')
  const [followUpNote, setFollowUpNote] = useState('')
  
  // Listings filter state
  const [listingSearchQuery, setListingSearchQuery] = useState('')
  const [listingSortBy, setListingSortBy] = useState<'newest' | 'most_views' | 'most_contacts'>('newest')
  
  // WhatsApp Quick Send state
  const [showWhatsAppModal, setShowWhatsAppModal] = useState(false)
  const [selectedListingForWA, setSelectedListingForWA] = useState<ListingRow | null>(null)
  const [customWAMessage, setCustomWAMessage] = useState('')
  const [recentWAMessages, setRecentWAMessages] = useState<string[]>([])
  
  // Load recent messages from localStorage
  useEffect(() => {
    try {
      const saved = localStorage.getItem('cm_recent_wa_messages')
      if (saved) setRecentWAMessages(JSON.parse(saved))
    } catch { /* ignore */ }
  }, [])
  
  // Save recent messages
  const saveRecentMessage = (msg: string) => {
    setRecentWAMessages(prev => {
      const updated = [msg, ...prev.filter(m => m !== msg)].slice(0, 10)
      localStorage.setItem('cm_recent_wa_messages', JSON.stringify(updated))
      return updated
    })
  }
  
  // Generate smart message based on context
  const generateSmartMessage = (listing?: ListingRow | null): string => {
    const sellerName = details?.summary?.seller_name?.split(' ')[0] || 'hola'
    const hasContacts = (details?.summary?.wa_clicks_30d || 0) + (details?.summary?.email_contacts_30d || 0) > 0
    
    if (listing && listing.total_contacts_30d && listing.total_contacts_30d > 0) {
      return `Hola ${sellerName}, soy Rodri de Ciclo Market. Vi que tu publicación "${listing.title?.substring(0, 40)}..." recibió ${listing.total_contacts_30d} consultas estos días. ¿La vendiste?\n\nRespondé con un número:\n1) Sí, por Ciclo Market\n2) Sí, por fuera\n3) Todavía no\n4) Quiero mejorarla (precio/fotos)`
    }
    
    if (hasContacts) {
      return `Hola ${sellerName}, soy Rodri de Ciclo Market. Vi que tu publicación recibió consultas estos días. ¿La vendiste?\n\nRespondé con un número:\n1) Sí, por Ciclo Market\n2) Sí, por fuera\n3) Todavía no\n4) Quiero mejorarla (precio/fotos)`
    }
    
    return `Hola ${sellerName}, soy Rodri de Ciclo Market. ¿Cómo va la venta de tu bici? ¿Necesitás ayuda con algo?`
  }
  
  // Open WhatsApp with popup
  const openWhatsAppPopup = (listing?: ListingRow | null) => {
    setSelectedListingForWA(listing || null)
    setCustomWAMessage(generateSmartMessage(listing))
    setShowWhatsAppModal(true)
  }
  
  // Send WhatsApp
  const sendWhatsApp = () => {
    const phone = details?.summary?.whatsapp_number
    if (!phone) return
    
    const normalized = phone.replace(/[^\d]/g, '').replace(/^0+/, '')
    const text = encodeURIComponent(customWAMessage)
    const url = `https://wa.me/${normalized}?text=${text}`
    
    // Open in popup
    const width = 500
    const height = 700
    const left = window.screenX + (window.outerWidth - width) / 2
    const top = window.screenY + (window.outerHeight - height) / 2
    
    window.open(
      url,
      'whatsapp-popup',
      `width=${width},height=${height},left=${left},top=${top},popup=yes,resizable=yes,scrollbars=yes`
    )
    
    // Save to recent
    saveRecentMessage(customWAMessage)
    
    // Log outreach
    logOutreachWhatsApp({
      sellerId: details!.sellerId,
      messagePreview: customWAMessage,
      createdBy: null,
      listingId: selectedListingForWA?.id || null,
      meta: { source: 'crm_quick_send' },
      cooldownDays: 0,
    }).catch(console.error)
    
    setShowWhatsAppModal(false)
    onRefresh()
  }
  
  // Filter and sort listings
  const filteredListings = useMemo(() => {
    if (!details?.listings) return []
    
    let filtered = details.listings
    
    // Filter by search query
    if (listingSearchQuery.trim()) {
      const query = listingSearchQuery.toLowerCase()
      filtered = filtered.filter(l => 
        (l.title?.toLowerCase() || '').includes(query) ||
        (l.slug?.toLowerCase() || '').includes(query)
      )
    }
    
    // Sort
    switch (listingSortBy) {
      case 'newest':
        filtered = [...filtered].sort((a, b) => 
          new Date(b.created_at || 0).getTime() - new Date(a.created_at || 0).getTime()
        )
        break
      case 'most_views':
        filtered = [...filtered].sort((a, b) => (b.views_30d || 0) - (a.views_30d || 0))
        break
      case 'most_contacts':
        filtered = [...filtered].sort((a, b) => (b.total_contacts_30d || 0) - (a.total_contacts_30d || 0))
        break
    }
    
    return filtered
  }, [details?.listings, listingSearchQuery, listingSortBy])
  
  const handleScheduleFollowUp = async () => {
    if (!details?.sellerId) return
    
    let dueAt: Date
    switch (followUpWhen) {
      case 'tomorrow': dueAt = new Date(Date.now() + 24 * 60 * 60 * 1000); break
      case '3days': dueAt = new Date(Date.now() + 3 * 24 * 60 * 60 * 1000); break
      case '1week': dueAt = new Date(Date.now() + 7 * 24 * 60 * 60 * 1000); break
      default: dueAt = new Date(Date.now() + 24 * 60 * 60 * 1000)
    }
    
    setBusy(true)
    try {
      await scheduleFollowUp({
        sellerId: details.sellerId,
        dueAt: dueAt.toISOString(),
        type: followUpType,
        note: followUpNote,
      })
      setSuccess('Follow-up programado correctamente')
      setShowFollowUpForm(false)
      setFollowUpNote('')
      onRefresh()
    } catch (e: any) {
      setError(e?.message ?? 'Error al programar follow-up')
    } finally {
      setBusy(false)
    }
  }
  
  const handleMarkListingSold = async (listingId: string, listingTitle: string | null) => {
    if (!confirm(`¿Marcar "${listingTitle || 'esta publicación'}" como vendida?`)) return
    
    setBusy(true)
    try {
      await markListingAsSold(listingId)
      setSuccess('Publicación marcada como vendida')
      onRefresh()
    } catch (e: any) {
      setError(e?.message ?? 'Error al marcar como vendida')
    } finally {
      setBusy(false)
    }
  }

  useEffect(() => {
    if (!open) return
    setTab('profile')
    setError(null)
    setSuccess(null)
    setSelectedTemplate(null)
    setSelectedListing(null)
    setCustomSubject('')
    setCustomBody('')
    setShowPreview(false)
    setListingSearchQuery('')
    setListingSortBy('newest')
    setShowWhatsAppModal(false)
    setSelectedListingForWA(null)
    setCustomWAMessage('')
  }, [open, details?.sellerId])

  useEffect(() => {
    if (!open) return
    const handler = (ev: KeyboardEvent) => {
      if (ev.key === 'Escape') onClose()
    }
    window.addEventListener('keydown', handler)
    return () => window.removeEventListener('keydown', handler)
  }, [open, onClose])

  const sellerName = details?.summary?.seller_name || details?.profile?.full_name || details?.profile?.store_name || 'Seller'
  const stage = useMemo(() => safeStage(details?.summary?.stage), [details?.summary?.stage])
  
  // Get email eligibility
  const summary = details?.summary ?? null
  const profile = details?.profile ?? null
  const canSendEmail = !summary?.email_opt_out && !(summary?.cooldown_until && Date.parse(summary.cooldown_until) > Date.now())
  const emailDisabledReason = summary?.email_opt_out 
    ? 'El usuario se dio de baja de emails'
    : (summary?.cooldown_until && Date.parse(summary.cooldown_until) > Date.now())
      ? 'Cooldown activo'
      : null

  useEffect(() => {
    if (!open) return
    setStageDraft(stage)
  }, [open, stage])

  const tabs: Array<[TabKey, string, string]> = [
    ['profile', 'Perfil', '👤'],
    ['timeline', 'Timeline', '📅'],
    ['listings', 'Publicaciones', '📦'],
    ['engagement', 'Engagement', '📊'],
    ['outreach', 'Outreach', '📧'],
    ['tasks', 'Tareas', '✓'],
    ['notes', 'Notas', '📝'],
    ['emails', 'Emails', '✉️'],
  ]

  // Build timeline from all activities
  const timelineItems: TimelineItem[] = useMemo(() => {
    if (!details) return []
    
    const items: TimelineItem[] = []
    
    // Outreach
    details.outreach.forEach(o => {
      items.push({
        id: o.id,
        type: 'outreach',
        title: o.channel === 'whatsapp' ? 'WhatsApp enviado' : 'Email enviado',
        description: o.message_preview || undefined,
        timestamp: o.sent_at || o.created_at,
        meta: { status: o.status, channel: o.channel },
        icon: o.channel === 'whatsapp' ? '💬' : '📧',
        color: o.channel === 'whatsapp' ? '#10b981' : '#3b82f6',
      })
    })
    
    // Tasks
    details.tasksOpen.forEach(t => {
      items.push({
        id: t.id,
        type: 'task',
        title: `Tarea: ${t.type}`,
        description: t.payload?.note as string || undefined,
        timestamp: t.created_at,
        meta: { status: t.status, priority: t.priority },
        icon: '✓',
        color: t.status === 'open' ? '#f59e0b' : '#6b7280',
      })
    })
    
    // Notes
    details.notes.forEach(n => {
      items.push({
        id: n.id,
        type: 'note',
        title: 'Nota agregada',
        description: n.note,
        timestamp: n.created_at,
        meta: { createdBy: n.created_by },
        icon: '📝',
        color: '#8b5cf6',
      })
    })
    
    // Listings
    details.listings.forEach(l => {
      items.push({
        id: l.id,
        type: 'listing',
        title: 'Publicación creada',
        description: l.title || undefined,
        timestamp: l.created_at || '',
        meta: { price: l.price, status: l.status },
        icon: '📦',
        color: '#6366f1',
      })
    })
    
    // Sort by timestamp desc
    return items
      .filter(i => i.timestamp)
      .sort((a, b) => new Date(b.timestamp).getTime() - new Date(a.timestamp).getTime())
  }, [details])

  // Early return after all hooks
  if (!open) return null

  const saveStage = async () => {
    if (!details) return
    setBusy(true)
    setError(null)
    setSuccess(null)
    try {
      await setSellerStage({ sellerId: details.sellerId, stage: stageDraft })
      onRefresh()
      setSuccess('Stage actualizado correctamente')
    } catch (e: any) {
      setError(e?.message ?? 'No pudimos guardar el stage.')
    } finally {
      setBusy(false)
    }
  }

  const saveNote = async () => {
    if (!details) return
    const text = noteDraft.trim()
    if (!text) return
    setBusy(true)
    setError(null)
    setSuccess(null)
    try {
      await addSellerNote({ sellerId: details.sellerId, note: text })
      setNoteDraft('')
      onRefresh()
      setTab('notes')
      setSuccess('Nota guardada correctamente')
    } catch (e: any) {
      setError(e?.message ?? 'No pudimos guardar la nota.')
    } finally {
      setBusy(false)
    }
  }

  const createTask = async () => {
    if (!details) return
    const text = taskType.trim()
    if (!text) return
    setBusy(true)
    setError(null)
    setSuccess(null)
    try {
      await createSellerTask({ sellerId: details.sellerId, type: text, priority: 0 })
      onRefresh()
      setTab('tasks')
      setSuccess('Tarea creada correctamente')
    } catch (e: any) {
      setError(e?.message ?? 'No pudimos crear la tarea.')
    } finally {
      setBusy(false)
    }
  }

  const confirmSale = async (confirmed: boolean) => {
    if (!details) return
    setBusy(true)
    setError(null)
    setSuccess(null)
    try {
      await markSellerSale({
        sellerId: details.sellerId,
        confirmed,
      })
      await setSellerStage({ sellerId: details.sellerId, stage: confirmed ? 'sold' : 'lost' })
      onRefresh()
      setSuccess(confirmed ? 'Venta confirmada por Ciclo Market' : 'Marcado como vendido fuera')
    } catch (e: any) {
      setError(e?.message ?? 'No pudimos registrar la venta.')
    } finally {
      setBusy(false)
    }
  }

  const handleSendEmail = async () => {
    if (!details || !selectedTemplate) return
    
    const template = EMAIL_TEMPLATES.find(t => t.key === selectedTemplate)
    if (!template) return
    
    // Validate listing if required
    if (template.requiresListing && !selectedListing) {
      setError('Este template requiere seleccionar una publicación')
      return
    }
    
    setBusy(true)
    setError(null)
    setSuccess(null)
    
    try {
      const context: Record<string, unknown> = { source: 'admin_crm' }
      
      // Add custom content for custom template
      if (template.key === 'custom') {
        if (!customSubject.trim() || !customBody.trim()) {
          throw new Error('El asunto y cuerpo son obligatorios para mensajes personalizados')
        }
        context.customSubject = customSubject
        context.customBody = customBody
      }
      
      await sendSellerEmailTemplate({
        sellerId: details.sellerId,
        templateKey: selectedTemplate,
        listingId: selectedListing,
        context,
      })
      
      onRefresh()
      setSuccess(`Email "${template.label}" enviado correctamente`)
      setSelectedTemplate(null)
      setSelectedListing(null)
      setCustomSubject('')
      setCustomBody('')
      setShowPreview(false)
    } catch (e: any) {
      setError(e?.message ?? 'No pudimos enviar el email.')
    } finally {
      setBusy(false)
    }
  }

  const selectedTemplateData = EMAIL_TEMPLATES.find(t => t.key === selectedTemplate)

  return (
    <div className="admin-drawer-overlay" role="dialog" aria-modal="true">
      <button type="button" onClick={onClose} className="admin-drawer-backdrop" aria-label="Cerrar" />
      
      <aside className="admin-drawer">
        {/* Header */}
        <div className="admin-drawer-header">
          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', gap: 'var(--space-3)' }}>
            <div style={{ flex: 1 }}>
              <div style={{ display: 'flex', alignItems: 'center', gap: 'var(--space-2)', marginBottom: 'var(--space-1)' }}>
                <span className={`badge ${getStageBadgeClass(stage)}`}>{stage}</span>
                <span style={{ fontSize: '0.75rem', color: 'var(--admin-text-muted)' }}>ID: {details?.sellerId?.slice(0, 8)}…</span>
              </div>
              <h2 className="admin-drawer-title">{sellerName}</h2>
              <p className="admin-drawer-subtitle">
                {[profile?.city, profile?.province].filter(Boolean).join(', ') || 'Sin ubicación'}
              </p>
            </div>
            <button type="button" onClick={onClose} className="btn btn-ghost btn-sm">✕</button>
          </div>

          {/* Quick Actions */}
          <div style={{ display: 'flex', gap: 'var(--space-2)', marginTop: 'var(--space-4)', flexWrap: 'wrap' }}>
            <button
              type="button"
              onClick={() => void confirmSale(true)}
              disabled={busy || !details}
              className="btn btn-success btn-sm"
            >
              ✅ Vendió por CM
            </button>
            <button
              type="button"
              onClick={() => void confirmSale(false)}
              disabled={busy || !details}
              className="btn btn-secondary btn-sm"
            >
              ❌ Vendió fuera
            </button>
            <button
              type="button"
              onClick={() => setTab('emails')}
              disabled={busy || !details || !canSendEmail}
              className="btn btn-primary btn-sm"
              title={emailDisabledReason || 'Enviar email'}
            >
              ✉️ Enviar Email
            </button>
            <button
              type="button"
              onClick={() => openWhatsAppPopup()}
              disabled={busy || !details || !details?.summary?.whatsapp_number}
              className="btn btn-sm"
              style={{ background: '#dcfce7', borderColor: '#22c55e', color: '#15803d' }}
              title={details?.summary?.whatsapp_number ? 'Enviar WhatsApp rápido' : 'Sin número de WhatsApp'}
            >
              💬 WhatsApp Rápido
            </button>
            <button
              type="button"
              onClick={() => setShowFollowUpForm(true)}
              disabled={busy || !details}
              className="btn btn-sm"
              style={{ background: '#fef3c7', borderColor: '#f59e0b', color: '#92400e' }}
            >
              ⏰ Follow-up
            </button>
          </div>
          
          {/* Follow-up Form Modal */}
          {showFollowUpForm && (
            <div style={{
              position: 'fixed',
              inset: 0,
              background: 'rgba(0,0,0,0.5)',
              display: 'grid',
              placeItems: 'center',
              zIndex: 200,
            }}>
              <div style={{
                background: 'var(--admin-surface)',
                borderRadius: 'var(--radius-xl)',
                padding: 'var(--space-6)',
                width: '100%',
                maxWidth: '420px',
                margin: 'var(--space-4)',
              }}>
                <h3 style={{ margin: '0 0 var(--space-4)', fontSize: '1.125rem', fontWeight: 700 }}>
                  ⏰ Programar Follow-up
                </h3>
                
                <div style={{ display: 'grid', gap: 'var(--space-4)' }}>
                  <div>
                    <label style={{ fontSize: '0.75rem', fontWeight: 600, color: 'var(--admin-text-muted)', textTransform: 'uppercase' }}>
                      Tipo de contacto
                    </label>
                    <div style={{ display: 'flex', gap: 'var(--space-2)', marginTop: 'var(--space-2)' }}>
                      {(['whatsapp', 'email', 'call'] as const).map(type => (
                        <button
                          key={type}
                          onClick={() => setFollowUpType(type)}
                          style={{
                            flex: 1,
                            padding: 'var(--space-2)',
                            border: `1px solid ${followUpType === type ? '#3b82f6' : 'var(--admin-border)'}`,
                            background: followUpType === type ? '#eff6ff' : 'white',
                            color: followUpType === type ? '#3b82f6' : 'var(--admin-text)',
                            borderRadius: 'var(--radius)',
                            fontSize: '0.875rem',
                            cursor: 'pointer',
                            fontWeight: followUpType === type ? 600 : 400,
                          }}
                        >
                          {type === 'whatsapp' ? '💬 WhatsApp' : type === 'email' ? '📧 Email' : '📞 Llamada'}
                        </button>
                      ))}
                    </div>
                  </div>
                  
                  <div>
                    <label style={{ fontSize: '0.75rem', fontWeight: 600, color: 'var(--admin-text-muted)', textTransform: 'uppercase' }}>
                      Cuándo
                    </label>
                    <select
                      className="admin-select"
                      style={{ marginTop: 'var(--space-2)' }}
                      value={followUpWhen}
                      onChange={(e) => setFollowUpWhen(e.target.value as any)}
                    >
                      <option value="tomorrow">Mañana</option>
                      <option value="3days">En 3 días</option>
                      <option value="1week">En 1 semana</option>
                    </select>
                  </div>
                  
                  <div>
                    <label style={{ fontSize: '0.75rem', fontWeight: 600, color: 'var(--admin-text-muted)', textTransform: 'uppercase' }}>
                      Nota (opcional)
                    </label>
                    <textarea
                      className="admin-textarea"
                      style={{ marginTop: 'var(--space-2)' }}
                      value={followUpNote}
                      onChange={(e) => setFollowUpNote(e.target.value)}
                      placeholder="Ej: Preguntar si vendió..."
                      rows={3}
                    />
                  </div>
                </div>
                
                <div style={{ display: 'flex', gap: 'var(--space-3)', justifyContent: 'flex-end', marginTop: 'var(--space-5)' }}>
                  <button
                    onClick={() => setShowFollowUpForm(false)}
                    className="btn btn-secondary"
                    disabled={busy}
                  >
                    Cancelar
                  </button>
                  <button
                    onClick={() => void handleScheduleFollowUp()}
                    className="btn btn-primary"
                    disabled={busy}
                  >
                    {busy ? 'Guardando...' : 'Programar'}
                  </button>
                </div>
              </div>
            </div>
          )}

          {/* WhatsApp Quick Send Modal */}
          {showWhatsAppModal && (
            <div style={{
              position: 'fixed',
              inset: 0,
              background: 'rgba(0,0,0,0.5)',
              display: 'grid',
              placeItems: 'center',
              zIndex: 200,
            }}>
              <div style={{
                background: 'var(--admin-surface)',
                borderRadius: 'var(--radius-xl)',
                padding: 'var(--space-6)',
                width: '100%',
                maxWidth: '520px',
                margin: 'var(--space-4)',
              }}>
                <h3 style={{ margin: '0 0 var(--space-4)', fontSize: '1.125rem', fontWeight: 700 }}>
                  💬 Enviar WhatsApp a {details?.summary?.seller_name?.split(' ')[0]}
                </h3>
                
                {selectedListingForWA && (
                  <div style={{ 
                    padding: 'var(--space-3)', 
                    background: '#f0fdf4', 
                    borderRadius: 'var(--radius)',
                    marginBottom: 'var(--space-4)',
                    fontSize: '0.875rem',
                  }}>
                    <strong>Sobre:</strong> {selectedListingForWA.title?.substring(0, 50)}...
                    {selectedListingForWA.total_contacts_30d ? (
                      <span style={{ color: '#15803d', marginLeft: 'var(--space-2)' }}>
                        ({selectedListingForWA.total_contacts_30d} contactos en 30d)
                      </span>
                    ) : null}
                  </div>
                )}
                
                {/* Quick message templates */}
                <div style={{ marginBottom: 'var(--space-4)' }}>
                  <label style={{ fontSize: '0.75rem', fontWeight: 600, color: 'var(--admin-text-muted)', textTransform: 'uppercase' }}>
                    Plantillas rápidas
                  </label>
                  <div style={{ display: 'flex', gap: 'var(--space-2)', marginTop: 'var(--space-2)', flexWrap: 'wrap' }}>
                    <button
                      onClick={() => setCustomWAMessage(generateSmartMessage(selectedListingForWA))}
                      className="btn btn-sm"
                      style={{ background: '#f3f4f6', fontSize: '0.75rem' }}
                    >
                      🎯 Detectar contexto
                    </button>
                    <button
                      onClick={() => setCustomWAMessage(`Hola ${details?.summary?.seller_name?.split(' ')[0] || ''}, soy Rodri de Ciclo Market. ¿Cómo va la venta de tu bici?`)}
                      className="btn btn-sm"
                      style={{ background: '#f3f4f6', fontSize: '0.75rem' }}
                    >
                      👋 Saludo simple
                    </button>
                    <button
                      onClick={() => setCustomWAMessage(`Hola ${details?.summary?.seller_name?.split(' ')[0] || ''}, soy Rodri de Ciclo Market. ¿Necesitás ayuda con el precio o las fotos de tu publicación?`)}
                      className="btn btn-sm"
                      style={{ background: '#f3f4f6', fontSize: '0.75rem' }}
                    >
                      💡 Ofrecer ayuda
                    </button>
                  </div>
                </div>
                
                {/* Recent messages */}
                {recentWAMessages.length > 0 && (
                  <div style={{ marginBottom: 'var(--space-4)' }}>
                    <label style={{ fontSize: '0.75rem', fontWeight: 600, color: 'var(--admin-text-muted)', textTransform: 'uppercase' }}>
                      Mensajes recientes
                    </label>
                    <div style={{ display: 'flex', flexDirection: 'column', gap: 'var(--space-1)', marginTop: 'var(--space-2)' }}>
                      {recentWAMessages.slice(0, 3).map((msg, idx) => (
                        <button
                          key={idx}
                          onClick={() => setCustomWAMessage(msg)}
                          style={{
                            textAlign: 'left',
                            padding: 'var(--space-2)',
                            background: '#f9fafb',
                            border: '1px solid var(--admin-border)',
                            borderRadius: 'var(--radius)',
                            fontSize: '0.75rem',
                            cursor: 'pointer',
                            whiteSpace: 'nowrap',
                            overflow: 'hidden',
                            textOverflow: 'ellipsis',
                          }}
                        >
                          {msg.substring(0, 60)}...
                        </button>
                      ))}
                    </div>
                  </div>
                )}
                
                {/* Message editor */}
                <div>
                  <label style={{ fontSize: '0.75rem', fontWeight: 600, color: 'var(--admin-text-muted)', textTransform: 'uppercase' }}>
                    Mensaje
                  </label>
                  <textarea
                    className="admin-textarea"
                    style={{ marginTop: 'var(--space-2)', minHeight: '120px', fontSize: '0.875rem' }}
                    value={customWAMessage}
                    onChange={(e) => setCustomWAMessage(e.target.value)}
                    placeholder="Escribí tu mensaje..."
                    onKeyDown={(e) => {
                      if (e.ctrlKey && e.key === 'Enter') {
                        e.preventDefault()
                        sendWhatsApp()
                      }
                      if (e.key === 'Escape') {
                        setShowWhatsAppModal(false)
                      }
                    }}
                  />
                  <div style={{ fontSize: '0.75rem', color: 'var(--admin-text-muted)', marginTop: 'var(--space-1)' }}>
                    Ctrl+Enter para enviar · Esc para cerrar
                  </div>
                </div>
                
                <div style={{ display: 'flex', gap: 'var(--space-3)', justifyContent: 'flex-end', marginTop: 'var(--space-5)' }}>
                  <button
                    onClick={() => setShowWhatsAppModal(false)}
                    className="btn btn-secondary"
                  >
                    Cancelar
                  </button>
                  <button
                    onClick={sendWhatsApp}
                    className="btn btn-primary"
                    style={{ background: '#22c55e', borderColor: '#22c55e' }}
                  >
                    💬 Abrir WhatsApp
                  </button>
                </div>
              </div>
            </div>
          )}

          {/* Stage Selector */}
          <div style={{ display: 'flex', gap: 'var(--space-2)', alignItems: 'center', marginTop: 'var(--space-4)', padding: 'var(--space-3)', background: 'var(--admin-surface)', borderRadius: 'var(--radius-lg)', border: '1px solid var(--admin-border)' }}>
            <label style={{ fontSize: '0.75rem', fontWeight: 600, color: 'var(--admin-text-muted)', textTransform: 'uppercase' }}>
              Stage
            </label>
            <select
              className="admin-select"
              style={{ width: 'auto', marginLeft: 'auto' }}
              value={stageDraft}
              onChange={(e) => setStageDraft(e.target.value as SellerStage)}
            >
              <option value="lead">Lead</option>
              <option value="onboarding">Onboarding</option>
              <option value="active">Active</option>
              <option value="at_risk">At Risk</option>
              <option value="churned">Churned</option>
              <option value="sold">Sold</option>
              <option value="lost">Lost</option>
            </select>
            <button
              type="button"
              onClick={saveStage}
              disabled={busy || !details}
              className="btn btn-primary btn-sm"
            >
              Guardar
            </button>
          </div>
        </div>

        {/* Tabs */}
        <div style={{ padding: 'var(--space-3) var(--space-5)', borderBottom: '1px solid var(--admin-border)', background: 'var(--admin-surface)' }}>
          <div className="admin-tabs">
            {tabs.map(([key, label, icon]) => (
              <button
                key={key}
                type="button"
                onClick={() => setTab(key)}
                className={`admin-tab ${tab === key ? 'active' : ''}`}
              >
                <span style={{ marginRight: 'var(--space-1)' }}>{icon}</span>
                {label}
              </button>
            ))}
          </div>
        </div>

        {/* Content */}
        <div className="admin-drawer-body">
          {/* Alerts */}
          {error && (
            <div style={{ padding: 'var(--space-3)', background: '#fef2f2', color: 'var(--cm-danger)', borderRadius: 'var(--radius-lg)', marginBottom: 'var(--space-4)', fontSize: '0.875rem' }}>
              ⚠ {error}
            </div>
          )}
          {success && (
            <div style={{ padding: 'var(--space-3)', background: '#ecfdf5', color: 'var(--cm-success)', borderRadius: 'var(--radius-lg)', marginBottom: 'var(--space-4)', fontSize: '0.875rem' }}>
              ✅ {success}
            </div>
          )}

          {/* Email Opt-out Warning */}
          {tab === 'emails' && emailDisabledReason && (
            <div style={{ padding: 'var(--space-4)', background: '#fef2f2', border: '1px solid #fee2e2', borderRadius: 'var(--radius-lg)', marginBottom: 'var(--space-4)' }}>
              <div style={{ display: 'flex', alignItems: 'center', gap: 'var(--space-2)', color: '#b91c1c', fontWeight: 600, marginBottom: 'var(--space-2)' }}>
                <span>⚠</span>
                <span>No se pueden enviar emails</span>
              </div>
              <p style={{ margin: 0, fontSize: '0.875rem', color: '#7f1d1d' }}>
                {emailDisabledReason}
              </p>
            </div>
          )}

          {tab === 'profile' && (
            <div style={{ display: 'grid', gap: 'var(--space-4)' }}>
              <div className="admin-card" style={{ margin: 0 }}>
                <h4 style={{ margin: '0 0 var(--space-3)', fontSize: '0.875rem', fontWeight: 600, color: 'var(--admin-text)' }}>Información de Contacto</h4>
                <div style={{ display: 'grid', gap: 'var(--space-2)', fontSize: '0.875rem' }}>
                  <div style={{ display: 'flex', justifyContent: 'space-between' }}>
                    <span style={{ color: 'var(--admin-text-muted)' }}>Email</span>
                    <span style={{ fontWeight: 500 }}>{profile?.email || '—'}</span>
                  </div>
                  <div style={{ display: 'flex', justifyContent: 'space-between' }}>
                    <span style={{ color: 'var(--admin-text-muted)' }}>WhatsApp</span>
                    <span style={{ fontWeight: 500 }}>{profile?.whatsapp_number || profile?.store_phone || '—'}</span>
                  </div>
                  <div style={{ display: 'flex', justifyContent: 'space-between' }}>
                    <span style={{ color: 'var(--admin-text-muted)' }}>Store habilitada</span>
                    <span className={`badge ${profile?.store_enabled ? 'badge-green' : 'badge-gray'}`}>
                      {profile?.store_enabled ? 'Sí' : 'No'}
                    </span>
                  </div>
                  <div style={{ display: 'flex', justifyContent: 'space-between' }}>
                    <span style={{ color: 'var(--admin-text-muted)' }}>Registro</span>
                    <span>{formatDate(profile?.created_at)}</span>
                  </div>
                </div>
              </div>

              {profile?.bio && (
                <div className="admin-card" style={{ margin: 0 }}>
                  <h4 style={{ margin: '0 0 var(--space-3)', fontSize: '0.875rem', fontWeight: 600, color: 'var(--admin-text)' }}>Bio</h4>
                  <p style={{ margin: 0, fontSize: '0.875rem', color: 'var(--admin-text-secondary)', lineHeight: 1.6 }}>{profile.bio}</p>
                </div>
              )}
              
              {/* Tags Section */}
              <div className="admin-card" style={{ margin: 0 }}>
                <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 'var(--space-3)' }}>
                  <h4 style={{ margin: 0, fontSize: '0.875rem', fontWeight: 600, color: 'var(--admin-text)' }}>Tags</h4>
                  <button 
                    onClick={() => setShowTagSelector(!showTagSelector)}
                    className="btn btn-sm"
                    style={{ background: 'var(--admin-gray-100)', borderColor: 'var(--admin-border)' }}
                  >
                    + Agregar
                  </button>
                </div>
                
                {/* Current tags */}
                <div style={{ display: 'flex', flexWrap: 'wrap', gap: 'var(--space-2)', marginBottom: sellerTags.length ? 'var(--space-3)' : 0 }}>
                  {sellerTags.length ? (
                    sellerTags.map(tag => {
                      const tagDef = PREDEFINED_TAGS.find(t => t.key === tag)
                      return (
                        <span 
                          key={tag}
                          style={{
                            display: 'inline-flex',
                            alignItems: 'center',
                            gap: '4px',
                            padding: '4px 12px',
                            background: tagDef ? `${tagDef.color}15` : 'var(--admin-gray-100)',
                            color: tagDef?.color || 'var(--admin-text)',
                            borderRadius: 'var(--radius)',
                            fontSize: '0.8125rem',
                            fontWeight: 500,
                            border: `1px solid ${tagDef ? `${tagDef.color}30` : 'var(--admin-border)'}`,
                          }}
                        >
                          {tagDef?.label || tag}
                          <button
                            onClick={() => handleRemoveTag(tag)}
                            style={{
                              background: 'none',
                              border: 'none',
                              cursor: 'pointer',
                              padding: '0 2px',
                              fontSize: '0.75rem',
                              color: 'inherit',
                              opacity: 0.7,
                            }}
                            title="Remover tag"
                          >
                            ✕
                          </button>
                        </span>
                      )
                    })
                  ) : (
                    <span style={{ fontSize: '0.875rem', color: 'var(--admin-text-muted)' }}>Sin tags</span>
                  )}
                </div>
                
                {/* Tag selector */}
                {showTagSelector && (
                  <div style={{ 
                    display: 'flex', 
                    flexWrap: 'wrap', 
                    gap: 'var(--space-2)',
                    padding: 'var(--space-3)',
                    background: 'var(--admin-gray-50)',
                    borderRadius: 'var(--radius)',
                  }}>
                    {PREDEFINED_TAGS.filter(t => !sellerTags.includes(t.key)).map(tag => (
                      <button
                        key={tag.key}
                        onClick={() => handleAddTag(tag.key)}
                        style={{
                          padding: '4px 12px',
                          background: 'white',
                          border: `1px solid ${tag.color}`,
                          color: tag.color,
                          borderRadius: 'var(--radius)',
                          fontSize: '0.8125rem',
                          cursor: 'pointer',
                          fontWeight: 500,
                        }}
                      >
                        {tag.label}
                      </button>
                    ))}
                  </div>
                )}
              </div>
            </div>
          )}

          {tab === 'listings' && (
            <div style={{ display: 'grid', gap: 'var(--space-3)' }}>
              {/* Search and Sort Controls */}
              {details?.listings && details.listings.length > 0 && (
                <div style={{ display: 'flex', gap: 'var(--space-3)', flexWrap: 'wrap', alignItems: 'center' }}>
                  {/* Search */}
                  <div style={{ position: 'relative', flex: 1, minWidth: '200px' }}>
                    <span style={{ 
                      position: 'absolute', 
                      left: 'var(--space-2)', 
                      top: '50%', 
                      transform: 'translateY(-50%)',
                      color: 'var(--admin-text-muted)',
                      fontSize: '0.875rem'
                    }}>🔍</span>
                    <input
                      type="text"
                      value={listingSearchQuery}
                      onChange={(e) => setListingSearchQuery(e.target.value)}
                      placeholder="Filtrar publicaciones..."
                      className="admin-input"
                      style={{ paddingLeft: '32px', fontSize: '0.875rem' }}
                    />
                    {listingSearchQuery && (
                      <button
                        onClick={() => setListingSearchQuery('')}
                        style={{
                          position: 'absolute',
                          right: 'var(--space-2)',
                          top: '50%',
                          transform: 'translateY(-50%)',
                          background: 'none',
                          border: 'none',
                          cursor: 'pointer',
                          color: 'var(--admin-text-muted)',
                          fontSize: '0.75rem',
                          padding: '2px',
                        }}
                      >
                        ✕
                      </button>
                    )}
                  </div>
                  
                  {/* Sort */}
                  <select
                    value={listingSortBy}
                    onChange={(e) => setListingSortBy(e.target.value as any)}
                    className="admin-select"
                    style={{ width: 'auto', fontSize: '0.875rem' }}
                  >
                    <option value="newest">📅 Más recientes</option>
                    <option value="most_views">👁️ Más vistas (30d)</option>
                    <option value="most_contacts">💬 Más contactos (30d)</option>
                  </select>
                </div>
              )}
              
              {/* Results count */}
              {listingSearchQuery && (
                <div style={{ fontSize: '0.8125rem', color: 'var(--admin-text-muted)' }}>
                  Mostrando {filteredListings.length} de {details?.listings?.length || 0} publicaciones
                </div>
              )}
              
              {filteredListings.length ? (
                filteredListings.map((l) => (
                  <div key={l.id} className="admin-card" style={{ margin: 0 }}>
                    <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', gap: 'var(--space-3)' }}>
                      <div style={{ flex: 1 }}>
                        <div style={{ fontWeight: 600, color: 'var(--admin-text)', marginBottom: 'var(--space-1)' }}>
                          {l.title || 'Sin título'}
                        </div>
                        <div style={{ display: 'flex', gap: 'var(--space-2)', flexWrap: 'wrap', marginBottom: 'var(--space-2)' }}>
                          <span className={`badge ${l.status === 'active' ? 'badge-green' : 'badge-gray'}`}>
                            {l.status || '—'}
                          </span>
                          <span className="badge badge-gray">{l.moderation_state || '—'}</span>
                          <span className="badge badge-blue">{formatDate(l.created_at)}</span>
                        </div>
                        
                        {/* Engagement Metrics */}
                        <div style={{ 
                          display: 'flex', 
                          gap: 'var(--space-3)', 
                          padding: 'var(--space-2)',
                          background: 'var(--admin-gray-50)',
                          borderRadius: 'var(--radius)',
                          fontSize: '0.8125rem',
                        }}>
                          <div style={{ display: 'flex', alignItems: 'center', gap: '4px' }}>
                            <span>👁️</span>
                            <span style={{ color: 'var(--admin-text-muted)' }}>Vistas:</span>
                            <span style={{ fontWeight: 600 }}>{l.views_30d || 0}</span>
                          </div>
                          <div style={{ display: 'flex', alignItems: 'center', gap: '4px' }}>
                            <span>📱</span>
                            <span style={{ color: 'var(--admin-text-muted)' }}>WA:</span>
                            <span style={{ fontWeight: 600, color: l.wa_clicks_30d ? '#047857' : 'inherit' }}>
                              {l.wa_clicks_30d || 0}
                            </span>
                          </div>
                          <div style={{ display: 'flex', alignItems: 'center', gap: '4px' }}>
                            <span>✉️</span>
                            <span style={{ color: 'var(--admin-text-muted)' }}>Email:</span>
                            <span style={{ fontWeight: 600 }}>{l.email_clicks_30d || 0}</span>
                          </div>
                          <div style={{ display: 'flex', alignItems: 'center', gap: '4px', marginLeft: 'auto' }}>
                            <span>💬</span>
                            <span style={{ color: 'var(--admin-text-muted)' }}>Total:</span>
                            <span style={{ 
                              fontWeight: 700, 
                              color: (l.total_contacts_30d || 0) > 0 ? '#047857' : 'var(--admin-text-muted)' 
                            }}>
                              {l.total_contacts_30d || 0}
                            </span>
                          </div>
                        </div>
                        
                        {/* Price if available */}
                        {l.price && (
                          <div style={{ marginTop: 'var(--space-2)', fontSize: '0.8125rem' }}>
                            <span style={{ color: 'var(--admin-text-muted)' }}>Precio: </span>
                            <span style={{ fontWeight: 600 }}>
                              {l.price_currency === 'USD' ? 'US$' : '$'}{l.price.toLocaleString()}
                            </span>
                          </div>
                        )}
                        
                        {/* Action buttons */}
                        {l.status !== 'sold' && (
                          <div style={{ marginTop: 'var(--space-3)', display: 'flex', gap: 'var(--space-2)', flexWrap: 'wrap' }}>
                            <button
                              onClick={() => handleMarkListingSold(l.id, l.title)}
                              disabled={busy}
                              className="btn btn-sm"
                              style={{ 
                                background: '#ecfdf5', 
                                borderColor: '#10b981', 
                                color: '#047857',
                                fontSize: '0.8125rem',
                              }}
                            >
                              ✅ Marcar como vendida
                            </button>
                            <button
                              onClick={() => openWhatsAppPopup(l)}
                              disabled={busy || !details?.summary?.whatsapp_number}
                              className="btn btn-sm"
                              style={{ 
                                background: '#dcfce7', 
                                borderColor: '#22c55e', 
                                color: '#15803d',
                                fontSize: '0.8125rem',
                              }}
                            >
                              💬 WA sobre esta
                            </button>
                            <a
                              href={`https://www.ciclomarket.ar/listing/${l.slug || l.id}`}
                              target="_blank"
                              rel="noopener noreferrer"
                              className="btn btn-sm btn-secondary"
                              style={{ fontSize: '0.8125rem' }}
                            >
                              🔗 Ver
                            </a>
                          </div>
                        )}
                        {l.status === 'sold' && (
                          <div style={{ marginTop: 'var(--space-3)' }}>
                            <span className="badge badge-green" style={{ fontSize: '0.8125rem' }}>
                              ✅ Vendida
                            </span>
                          </div>
                        )}
                      </div>
                    </div>
                  </div>
                ))
              ) : (
                <div className="admin-empty">
                  <div className="admin-empty-icon">📭</div>
                  <div className="admin-empty-title">
                    {listingSearchQuery ? 'No se encontraron publicaciones' : 'Sin publicaciones'}
                  </div>
                  {listingSearchQuery && (
                    <p>Probá con otra búsqueda</p>
                  )}
                </div>
              )}
            </div>
          )}

          {tab === 'engagement' && (
            <div className="admin-card" style={{ margin: 0 }}>
              <div style={{ display: 'grid', gap: 'var(--space-3)', fontSize: '0.875rem' }}>
                <div style={{ display: 'flex', justifyContent: 'space-between', padding: 'var(--space-2) 0', borderBottom: '1px solid var(--admin-border-light)' }}>
                  <span style={{ color: 'var(--admin-text-muted)' }}>Score</span>
                  <span style={{ fontWeight: 700, fontSize: '1rem' }}>{summary?.score ?? '—'}</span>
                </div>
                <div style={{ display: 'flex', justifyContent: 'space-between', padding: 'var(--space-2) 0', borderBottom: '1px solid var(--admin-border-light)' }}>
                  <span style={{ color: 'var(--admin-text-muted)' }}>Avisos activos</span>
                  <span style={{ fontWeight: 600 }}>{summary?.active_listings_count ?? '—'}</span>
                </div>
                <div style={{ display: 'flex', justifyContent: 'space-between', padding: 'var(--space-2) 0', borderBottom: '1px solid var(--admin-border-light)' }}>
                  <span style={{ color: 'var(--admin-text-muted)' }}>WA clicks 7d</span>
                  <span style={{ fontWeight: 600 }}>{summary?.wa_clicks_7d ?? '—'}</span>
                </div>
                <div style={{ display: 'flex', justifyContent: 'space-between', padding: 'var(--space-2) 0', borderBottom: '1px solid var(--admin-border-light)' }}>
                  <span style={{ color: 'var(--admin-text-muted)' }}>WA clicks 30d</span>
                  <span style={{ fontWeight: 600 }}>{summary?.wa_clicks_30d ?? '—'}</span>
                </div>
                <div style={{ display: 'flex', justifyContent: 'space-between', padding: 'var(--space-2) 0', borderBottom: '1px solid var(--admin-border-light)' }}>
                  <span style={{ color: 'var(--admin-text-muted)' }}>Emails 7d</span>
                  <span style={{ fontWeight: 600 }}>{summary?.email_contacts_7d ?? '—'}</span>
                </div>
                <div style={{ display: 'flex', justifyContent: 'space-between', padding: 'var(--space-2) 0', borderBottom: '1px solid var(--admin-border-light)' }}>
                  <span style={{ color: 'var(--admin-text-muted)' }}>Emails 30d</span>
                  <span style={{ fontWeight: 600 }}>{summary?.email_contacts_30d ?? '—'}</span>
                </div>
                <div style={{ display: 'flex', justifyContent: 'space-between', padding: 'var(--space-2) 0' }}>
                  <span style={{ color: 'var(--admin-text-muted)' }}>Último lead</span>
                  <span>{formatDateTime(summary?.last_lead_at)}</span>
                </div>
              </div>
            </div>
          )}

          {tab === 'timeline' && (
            <div style={{ display: 'grid', gap: 'var(--space-3)' }}>
              <h4 style={{ margin: 0, fontSize: '0.875rem', fontWeight: 600, color: 'var(--admin-text)' }}>
                Historial de Actividad ({timelineItems.length})
              </h4>
              
              {timelineItems.length ? (
                <div style={{ display: 'flex', flexDirection: 'column', gap: 'var(--space-3)' }}>
                  {timelineItems.map((item, index) => (
                    <div 
                      key={item.id} 
                      className="admin-card" 
                      style={{ 
                        margin: 0,
                        borderLeft: `3px solid ${item.color}`,
                        position: 'relative',
                      }}
                    >
                      {/* Connector line */}
                      {index < timelineItems.length - 1 && (
                        <div style={{
                          position: 'absolute',
                          left: '20px',
                          bottom: '-16px',
                          width: '2px',
                          height: '16px',
                          background: 'var(--admin-border)',
                        }} />
                      )}
                      
                      <div style={{ display: 'flex', gap: 'var(--space-3)', alignItems: 'flex-start' }}>
                        {/* Icon */}
                        <div style={{
                          width: 40,
                          height: 40,
                          borderRadius: '50%',
                          background: `${item.color}15`,
                          display: 'grid',
                          placeItems: 'center',
                          fontSize: '1.25rem',
                          flexShrink: 0,
                        }}>
                          {item.icon}
                        </div>
                        
                        {/* Content */}
                        <div style={{ flex: 1, minWidth: 0 }}>
                          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', gap: 'var(--space-2)', flexWrap: 'wrap' }}>
                            <div style={{ fontWeight: 600, color: 'var(--admin-text)', fontSize: '0.9375rem' }}>
                              {item.title}
                            </div>
                            <span style={{ fontSize: '0.75rem', color: 'var(--admin-text-muted)', whiteSpace: 'nowrap' }}>
                              {formatDateTime(item.timestamp)}
                            </span>
                          </div>
                          
                          {item.description && (
                            <p style={{ margin: 'var(--space-1) 0 0', fontSize: '0.875rem', color: 'var(--admin-text-secondary)', lineHeight: 1.5 }}>
                              {item.description}
                            </p>
                          )}
                          
                          {/* Meta badges */}
                          {item.meta && (
                            <div style={{ display: 'flex', gap: 'var(--space-2)', marginTop: 'var(--space-2)', flexWrap: 'wrap' }}>
                              {item.meta.status && (
                                <span className={`badge ${getStatusBadgeClass(String(item.meta.status))}`}>
                                  {String(item.meta.status)}
                                </span>
                              )}
                              {item.meta.channel && (
                                <span className={`badge ${getChannelBadgeClass(String(item.meta.channel))}`}>
                                  {String(item.meta.channel)}
                                </span>
                              )}
                            </div>
                          )}
                        </div>
                      </div>
                    </div>
                  ))}
                </div>
              ) : (
                <div className="admin-empty">
                  <div className="admin-empty-icon">📭</div>
                  <div className="admin-empty-title">Sin actividad registrada</div>
                </div>
              )}
            </div>
          )}

          {tab === 'outreach' && (
            <div style={{ display: 'grid', gap: 'var(--space-3)' }}>
              {/* Quick Email Actions */}
              <div className="admin-card" style={{ margin: 0, background: '#eff6ff', border: '1px solid #bfdbfe' }}>
                <h4 style={{ margin: '0 0 var(--space-3)', fontSize: '0.875rem', fontWeight: 600, color: '#1e40af' }}>Acciones Rápidas</h4>
                <div style={{ display: 'flex', gap: 'var(--space-2)', flexWrap: 'wrap' }}>
                  <button
                    type="button"
                    onClick={() => setTab('emails')}
                    disabled={!canSendEmail}
                    className="btn btn-primary btn-sm"
                  >
                    ✉️ Enviar Email
                  </button>
                </div>
              </div>

              {/* Outreach History */}
              <h4 style={{ margin: 0, fontSize: '0.875rem', fontWeight: 600, color: 'var(--admin-text)' }}>Historial de Outreach</h4>
              
              {details?.outreach?.length ? (
                details.outreach.map((o) => (
                  <div key={o.id} className="admin-card" style={{ margin: 0 }}>
                    <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', gap: 'var(--space-3)', marginBottom: 'var(--space-2)' }}>
                      <div>
                        <span className={getChannelBadgeClass(o.channel)}>
                          {o.channel}
                        </span>
                        <span className={getStatusBadgeClass(o.status)} style={{ marginLeft: 'var(--space-2)' }}>
                          {o.status}
                        </span>
                        {o.template_key && (
                          <span className="badge badge-gray" style={{ marginLeft: 'var(--space-2)' }}>
                            {EMAIL_TEMPLATES.find(t => t.key === o.template_key)?.label || o.template_key}
                          </span>
                        )}
                      </div>
                      <span style={{ fontSize: '0.75rem', color: 'var(--admin-text-muted)' }}>{formatDateTime(o.sent_at || o.created_at)}</span>
                    </div>
                    {o.message_preview && (
                      <p style={{ margin: 0, fontSize: '0.875rem', color: 'var(--admin-text-secondary)', lineHeight: 1.5 }}>
                        {o.message_preview}
                      </p>
                    )}
                  </div>
                ))
              ) : (
                <div className="admin-empty">
                  <div className="admin-empty-icon">📭</div>
                  <div className="admin-empty-title">Sin outreach registrado</div>
                </div>
              )}
            </div>
          )}

          {tab === 'tasks' && (
            <div style={{ display: 'grid', gap: 'var(--space-3)' }}>
              {/* New Task */}
              <div style={{ display: 'flex', gap: 'var(--space-2)' }}>
                <input
                  value={taskType}
                  onChange={(e) => setTaskType(e.target.value)}
                  placeholder="Tipo de tarea (ej: CONTACT_HOT)"
                  className="admin-input"
                />
                <button
                  type="button"
                  onClick={createTask}
                  disabled={busy || !details}
                  className="btn btn-primary"
                >
                  + Crear
                </button>
              </div>

              {/* Tasks List */}
              {details?.tasksOpen?.length ? (
                details.tasksOpen.map((t) => (
                  <div key={t.id} className="admin-card" style={{ margin: 0 }}>
                    <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start' }}>
                      <div>
                        <div style={{ fontWeight: 600, color: 'var(--admin-text)', marginBottom: 'var(--space-1)' }}>{t.type}</div>
                        <div style={{ fontSize: '0.75rem', color: 'var(--admin-text-muted)' }}>
                          Due: {formatDateTime(t.due_at)} · Prioridad: {t.priority}
                        </div>
                      </div>
                      <span className="badge badge-amber">Pendiente</span>
                    </div>
                  </div>
                ))
              ) : (
                <div className="admin-empty">
                  <div className="admin-empty-icon">✓</div>
                  <div className="admin-empty-title">Sin tareas abiertas</div>
                </div>
              )}
            </div>
          )}

          {tab === 'notes' && (
            <div style={{ display: 'grid', gap: 'var(--space-3)' }}>
              {/* New Note */}
              <div>
                <textarea
                  value={noteDraft}
                  onChange={(e) => setNoteDraft(e.target.value)}
                  rows={3}
                  placeholder="Escribí una nota interna…"
                  className="admin-textarea"
                />
                <div style={{ display: 'flex', justifyContent: 'flex-end', marginTop: 'var(--space-2)' }}>
                  <button
                    type="button"
                    onClick={saveNote}
                    disabled={busy || !noteDraft.trim() || !details}
                    className="btn btn-primary"
                  >
                    Guardar nota
                  </button>
                </div>
              </div>

              {/* Notes List */}
              {details?.notes?.length ? (
                details.notes.map((n) => (
                  <div key={n.id} className="admin-card" style={{ margin: 0 }}>
                    <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', marginBottom: 'var(--space-2)' }}>
                      <span style={{ fontSize: '0.75rem', fontWeight: 600, color: 'var(--admin-text-muted)', textTransform: 'uppercase' }}>
                        Nota interna
                      </span>
                      <span style={{ fontSize: '0.75rem', color: 'var(--admin-text-muted)' }}>{formatDateTime(n.created_at)}</span>
                    </div>
                    <p style={{ margin: 0, fontSize: '0.875rem', color: 'var(--admin-text-secondary)', lineHeight: 1.6, whiteSpace: 'pre-wrap' }}>
                      {n.note}
                    </p>
                  </div>
                ))
              ) : (
                <div className="admin-empty">
                  <div className="admin-empty-icon">📝</div>
                  <div className="admin-empty-title">Sin notas</div>
                </div>
              )}
            </div>
          )}

          {tab === 'emails' && (
            <div style={{ display: 'grid', gap: 'var(--space-4)' }}>
              {/* Template Selector */}
              <div>
                <label style={{ display: 'block', fontSize: '0.75rem', fontWeight: 600, color: 'var(--admin-text-muted)', textTransform: 'uppercase', marginBottom: 'var(--space-2)' }}>
                  Template de Email
                </label>
                <EmailTemplatePicker
                  selected={selectedTemplate}
                  onSelect={(template) => {
                    setSelectedTemplate(template.key)
                    setShowPreview(false)
                  }}
                  disabled={busy || !canSendEmail}
                />
              </div>

              {/* Listing Selector (if required) */}
              {selectedTemplateData?.requiresListing && (
                <div>
                  <label style={{ display: 'block', fontSize: '0.75rem', fontWeight: 600, color: 'var(--admin-text-muted)', textTransform: 'uppercase', marginBottom: 'var(--space-2)' }}>
                    Seleccionar Publicación *
                  </label>
                  <select
                    className="admin-select"
                    value={selectedListing || ''}
                    onChange={(e) => setSelectedListing(e.target.value || null)}
                    disabled={busy}
                  >
                    <option value="">Seleccionar...</option>
                    {details?.listings?.map((l) => (
                      <option key={l.id} value={l.id}>
                        {l.title || 'Sin título'} {l.status ? `(${l.status})` : ''}
                      </option>
                    ))}
                  </select>
                  {(!details?.listings?.length) && (
                    <p style={{ margin: 'var(--space-2) 0 0', fontSize: '0.75rem', color: 'var(--cm-danger)' }}>
                      Este vendedor no tiene publicaciones disponibles
                    </p>
                  )}
                </div>
              )}

              {/* Custom Email Fields */}
              {selectedTemplate === 'custom' && (
                <div style={{ display: 'grid', gap: 'var(--space-3)' }}>
                  <div>
                    <label style={{ display: 'block', fontSize: '0.75rem', fontWeight: 600, color: 'var(--admin-text-muted)', textTransform: 'uppercase', marginBottom: 'var(--space-2)' }}>
                      Asunto *
                    </label>
                    <input
                      type="text"
                      className="admin-input"
                      value={customSubject}
                      onChange={(e) => setCustomSubject(e.target.value)}
                      placeholder="Asunto del email"
                      disabled={busy}
                    />
                  </div>
                  <div>
                    <label style={{ display: 'block', fontSize: '0.75rem', fontWeight: 600, color: 'var(--admin-text-muted)', textTransform: 'uppercase', marginBottom: 'var(--space-2)' }}>
                      Mensaje *
                    </label>
                    <textarea
                      className="admin-textarea"
                      rows={6}
                      value={customBody}
                      onChange={(e) => setCustomBody(e.target.value)}
                      placeholder="Escribí el contenido del email..."
                      disabled={busy}
                    />
                  </div>
                </div>
              )}

              {/* Template Preview */}
              {selectedTemplate && selectedTemplate !== 'custom' && (
                <div className="admin-card" style={{ margin: 0, background: '#f8fafc' }}>
                  <h4 style={{ margin: '0 0 var(--space-3)', fontSize: '0.875rem', fontWeight: 600, color: 'var(--admin-text)' }}>
                    Vista Previa
                  </h4>
                  <div style={{ marginBottom: 'var(--space-2)' }}>
                    <span style={{ fontSize: '0.75rem', color: 'var(--admin-text-muted)' }}>Asunto:</span>
                    <p style={{ margin: 'var(--space-1) 0 0', fontSize: '0.875rem', fontWeight: 500 }}>
                      {selectedTemplateData?.subject}
                    </p>
                  </div>
                  <div>
                    <span style={{ fontSize: '0.75rem', color: 'var(--admin-text-muted)' }}>Descripción:</span>
                    <p style={{ margin: 'var(--space-1) 0 0', fontSize: '0.875rem', color: 'var(--admin-text-secondary)' }}>
                      {selectedTemplateData?.description}
                    </p>
                  </div>
                </div>
              )}

              {/* Send Button */}
              {selectedTemplate && (
                <div style={{ display: 'flex', gap: 'var(--space-2)', justifyContent: 'flex-end' }}>
                  <button
                    type="button"
                    onClick={() => {
                      setSelectedTemplate(null)
                      setSelectedListing(null)
                      setShowPreview(false)
                    }}
                    disabled={busy}
                    className="btn btn-secondary"
                  >
                    Cancelar
                  </button>
                  <button
                    type="button"
                    onClick={handleSendEmail}
                    disabled={busy || !canSendEmail}
                    className="btn btn-primary"
                  >
                    {busy ? (
                      <>
                        <span className="admin-spinner" style={{ width: 14, height: 14, borderWidth: 2, marginRight: 'var(--space-2)' }} />
                        Enviando...
                      </>
                    ) : (
                      <>📧 Enviar Email</>
                    )}
                  </button>
                </div>
              )}

              {/* Recent Emails */}
              {details?.outreach?.filter(o => o.channel === 'email').length > 0 && (
                <>
                  <div className="admin-divider" />
                  <h4 style={{ margin: 0, fontSize: '0.875rem', fontWeight: 600, color: 'var(--admin-text)' }}>
                    Emails Enviados Recientemente
                  </h4>
                  <div style={{ display: 'grid', gap: 'var(--space-3)' }}>
                    {details.outreach
                      .filter(o => o.channel === 'email')
                      .slice(0, 5)
                      .map((o) => (
                        <div key={o.id} className="admin-card" style={{ margin: 0 }}>
                          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start' }}>
                            <div>
                              <span className={getStatusBadgeClass(o.status)}>
                                {o.status}
                              </span>
                              {o.template_key && (
                                <span className="badge badge-gray" style={{ marginLeft: 'var(--space-2)' }}>
                                  {EMAIL_TEMPLATES.find(t => t.key === o.template_key)?.label || o.template_key}
                                </span>
                              )}
                            </div>
                            <span style={{ fontSize: '0.75rem', color: 'var(--admin-text-muted)' }}>
                              {formatDateTime(o.sent_at || o.created_at)}
                            </span>
                          </div>
                          {o.message_preview && (
                            <p style={{ margin: 'var(--space-2) 0 0', fontSize: '0.8125rem', color: 'var(--admin-text-secondary)' }}>
                              {o.message_preview}
                            </p>
                          )}
                        </div>
                      ))}
                  </div>
                </>
              )}
            </div>
          )}
        </div>

        {/* Footer */}
        <div className="admin-drawer-footer">
          <button type="button" onClick={onClose} className="btn btn-secondary">
            Cerrar
          </button>
        </div>
      </aside>
    </div>
  )
}
