import { useEffect, useMemo, useState } from 'react'
import type { SellerOpsDetails, SellerStage, ListingRow } from '@admin/services/sellerOps'
import { addSellerNote, createSellerTask, markSellerSale, sendSellerEmailTemplate, setSellerStage } from '@admin/services/sellerOps'
import { EmailTemplatePicker, EMAIL_TEMPLATES, type EmailTemplateKey } from './EmailTemplatePicker'

type TabKey = 'profile' | 'listings' | 'engagement' | 'outreach' | 'tasks' | 'notes' | 'emails'

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

  const tabs: Array<[TabKey, string, string]> = [
    ['profile', 'Perfil', '👤'],
    ['listings', 'Publicaciones', '📦'],
    ['engagement', 'Engagement', '📊'],
    ['outreach', 'Outreach', '📧'],
    ['tasks', 'Tareas', '✓'],
    ['notes', 'Notas', '📝'],
    ['emails', 'Emails', '✉️'],
  ]

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
          </div>

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
            </div>
          )}

          {tab === 'listings' && (
            <div style={{ display: 'grid', gap: 'var(--space-3)' }}>
              {details?.listings?.length ? (
                details.listings.map((l) => (
                  <div key={l.id} className="admin-card" style={{ margin: 0 }}>
                    <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', gap: 'var(--space-3)' }}>
                      <div style={{ flex: 1 }}>
                        <div style={{ fontWeight: 600, color: 'var(--admin-text)', marginBottom: 'var(--space-1)' }}>
                          {l.title || 'Sin título'}
                        </div>
                        <div style={{ display: 'flex', gap: 'var(--space-2)', flexWrap: 'wrap' }}>
                          <span className={`badge ${l.status === 'active' ? 'badge-green' : 'badge-gray'}`}>
                            {l.status || '—'}
                          </span>
                          <span className="badge badge-gray">{l.moderation_state || '—'}</span>
                          <span className="badge badge-blue">{formatDate(l.created_at)}</span>
                        </div>
                      </div>
                    </div>
                  </div>
                ))
              ) : (
                <div className="admin-empty">
                  <div className="admin-empty-icon">📭</div>
                  <div className="admin-empty-title">Sin publicaciones</div>
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
