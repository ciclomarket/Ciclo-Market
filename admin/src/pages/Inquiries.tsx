import { Fragment, useEffect, useState } from 'react'
import { fetchListingInquiries, fetchWhatsappReach, type ListingInquiryRow, type WhatsappReachRow } from '@admin/services/inquiries'

const dateFormatter = new Intl.DateTimeFormat('es-AR', { dateStyle: 'short', timeStyle: 'short' })
const priceFormatter = new Intl.NumberFormat('es-AR')

function StatusBadge({ status }: { status: ListingInquiryRow['email_status'] }) {
  const map: Record<ListingInquiryRow['email_status'], { label: string; bg: string; color: string }> = {
    sent: { label: 'Enviado', bg: '#d1fae5', color: '#065f46' },
    pending: { label: 'Pendiente', bg: '#fef3c7', color: '#92400e' },
    failed: { label: 'Falló', bg: '#fee2e2', color: '#991b1b' },
  }
  const s = map[status] || map.pending
  return (
    <span
      style={{
        display: 'inline-block',
        padding: '2px 10px',
        borderRadius: 999,
        fontSize: '0.75rem',
        fontWeight: 600,
        background: s.bg,
        color: s.color,
      }}
    >
      {s.label}
    </span>
  )
}

function InquiriesTable({ rows, loading, channel }: { rows: ListingInquiryRow[]; loading: boolean; channel: 'email' | 'whatsapp' }) {
  const [expanded, setExpanded] = useState<string | null>(null)
  const colSpan = channel === 'whatsapp' ? 4 : 5

  return (
    <section className="admin-card">
      <div style={{ overflowX: 'auto' }}>
        <table className="admin-table">
          <thead>
            <tr>
              <th>Fecha</th>
              <th>Publicación</th>
              <th>Vendedor</th>
              <th>Comprador</th>
              {channel === 'email' && <th>Estado</th>}
            </tr>
          </thead>
          <tbody>
            {loading ? (
              <tr><td colSpan={colSpan} className="cell-muted" style={{ textAlign: 'center' }}>Cargando…</td></tr>
            ) : rows.length ? (
              rows.map((row) => (
                <Fragment key={row.id}>
                  <tr onClick={() => setExpanded((current) => (current === row.id ? null : row.id))} style={{ cursor: 'pointer' }}>
                    <td className="cell-muted">{dateFormatter.format(new Date(row.created_at))}</td>
                    <td className="cell-strong">{row.listing_title || row.listing_id}</td>
                    <td>{row.seller_full_name || row.seller_email || row.seller_id}</td>
                    <td>{row.full_name} <span className="cell-muted">({row.phone || row.email})</span></td>
                    {channel === 'email' && <td><StatusBadge status={row.email_status} /></td>}
                  </tr>
                  {expanded === row.id && (
                    <tr>
                      <td colSpan={colSpan} style={{ background: 'var(--admin-bg-muted, #f9fafb)', padding: 'var(--space-4)' }}>
                        <p style={{ margin: 0, fontSize: '0.875rem', whiteSpace: 'pre-wrap' }}>{row.message}</p>
                        <p style={{ margin: '8px 0 0', fontSize: '0.8rem', color: 'var(--admin-text-muted)' }}>
                          Email: {row.email}{row.phone ? ` · Teléfono: ${row.phone}` : ''}
                        </p>
                        {row.email_status === 'failed' && row.email_last_error && (
                          <p style={{ margin: '8px 0 0', fontSize: '0.8rem', color: 'var(--cm-danger)' }}>
                            Error: {row.email_last_error}
                          </p>
                        )}
                      </td>
                    </tr>
                  )}
                </Fragment>
              ))
            ) : (
              <tr><td colSpan={colSpan} className="cell-muted" style={{ textAlign: 'center' }}>Sin consultas todavía</td></tr>
            )}
          </tbody>
        </table>
      </div>
    </section>
  )
}

function WhatsappReachTable({ rows, loading }: { rows: WhatsappReachRow[]; loading: boolean }) {
  return (
    <section className="admin-card">
      <h4 style={{ margin: '0 0 4px', fontSize: '0.9rem', fontWeight: 600, color: 'var(--admin-text)' }}>
        Alcance por publicación (últimos 30 días)
      </h4>
      <p style={{ margin: '0 0 var(--space-3)', fontSize: '0.8rem', color: 'var(--admin-text-muted)' }}>
        Incluye todos los clicks al botón de WhatsApp, aunque el comprador no haya completado el formulario con su nombre y contacto.
      </p>
      <div style={{ overflowX: 'auto' }}>
        <table className="admin-table">
          <thead>
            <tr>
              <th>Publicación</th>
              <th>Vendedor</th>
              <th>Precio</th>
              <th>Clicks (30d)</th>
              <th>Leads con contacto (30d)</th>
            </tr>
          </thead>
          <tbody>
            {loading ? (
              <tr><td colSpan={5} className="cell-muted" style={{ textAlign: 'center' }}>Cargando…</td></tr>
            ) : rows.length ? (
              rows.map((row) => (
                <tr key={row.listing_id}>
                  <td className="cell-strong">{row.listing_title || row.listing_id}</td>
                  <td>{row.seller_full_name || '—'}</td>
                  <td>{row.price != null ? `$${priceFormatter.format(row.price)}` : '—'}</td>
                  <td className="cell-strong">{row.clicks}</td>
                  <td className="cell-muted">{row.leads}</td>
                </tr>
              ))
            ) : (
              <tr><td colSpan={5} className="cell-muted" style={{ textAlign: 'center' }}>Sin clicks de WhatsApp en este período</td></tr>
            )}
          </tbody>
        </table>
      </div>
    </section>
  )
}

export default function InquiriesPage() {
  const [tab, setTab] = useState<'email' | 'whatsapp'>('email')
  const [emailRows, setEmailRows] = useState<ListingInquiryRow[]>([])
  const [waRows, setWaRows] = useState<ListingInquiryRow[]>([])
  const [reachRows, setReachRows] = useState<WhatsappReachRow[]>([])
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)

  useEffect(() => {
    let alive = true
    setLoading(true)
    setError(null)
    Promise.all([
      fetchListingInquiries({ limit: 200, channel: 'email' }),
      fetchListingInquiries({ limit: 200, channel: 'whatsapp' }),
      fetchWhatsappReach({ days: 30 }),
    ])
      .then(([email, whatsapp, reach]) => {
        if (!alive) return
        setEmailRows(email)
        setWaRows(whatsapp)
        setReachRows(reach)
      })
      .catch((err) => {
        console.warn('[admin] inquiries load failed', err)
        if (alive) setError('No pudimos cargar los mensajes. Intentá nuevamente.')
      })
      .finally(() => { if (alive) setLoading(false) })
    return () => { alive = false }
  }, [])

  return (
    <div>
      <div className="admin-card" style={{ marginBottom: 'var(--space-5)' }}>
        <h3 style={{ margin: 0, fontSize: '1rem', fontWeight: 600, color: 'var(--admin-text)' }}>Mensajes</h3>
        <p style={{ margin: 'var(--space-1) 0 0', fontSize: '0.875rem', color: 'var(--admin-text-muted)' }}>
          Consultas enviadas desde la ficha de cada aviso, por email y por WhatsApp.
        </p>
        <div style={{ display: 'flex', gap: 'var(--space-2)', marginTop: 'var(--space-3)' }}>
          {(['email', 'whatsapp'] as const).map((t) => (
            <button
              key={t}
              type="button"
              onClick={() => setTab(t)}
              className="admin-tab-button"
              style={{
                padding: '6px 14px',
                borderRadius: 8,
                border: '1px solid var(--admin-border, #e5e7eb)',
                background: tab === t ? 'var(--cm-primary, #14212e)' : 'transparent',
                color: tab === t ? '#fff' : 'var(--admin-text)',
                fontSize: '0.85rem',
                fontWeight: 600,
                cursor: 'pointer',
              }}
            >
              {t === 'email' ? `Email (${emailRows.length})` : `WhatsApp (${waRows.length})`}
            </button>
          ))}
        </div>
      </div>

      {error && (
        <div className="admin-card" style={{ borderColor: 'var(--cm-danger)', marginBottom: 'var(--space-5)' }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: 'var(--space-3)', color: 'var(--cm-danger)' }}>
            <span>⚠</span>
            <span>{error}</span>
          </div>
        </div>
      )}

      {tab === 'whatsapp' && (
        <div style={{ marginBottom: 'var(--space-5)' }}>
          <WhatsappReachTable rows={reachRows} loading={loading} />
        </div>
      )}

      <InquiriesTable rows={tab === 'email' ? emailRows : waRows} loading={loading} channel={tab} />
    </div>
  )
}
