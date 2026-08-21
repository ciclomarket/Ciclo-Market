import { Fragment, useEffect, useState } from 'react'
import { fetchListingInquiries, type ListingInquiryRow } from '@admin/services/inquiries'

const dateFormatter = new Intl.DateTimeFormat('es-AR', { dateStyle: 'short', timeStyle: 'short' })

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

export default function InquiriesPage() {
  const [rows, setRows] = useState<ListingInquiryRow[]>([])
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)
  const [expanded, setExpanded] = useState<string | null>(null)

  useEffect(() => {
    let alive = true
    setLoading(true)
    setError(null)
    fetchListingInquiries({ limit: 200 })
      .then((data) => {
        if (alive) setRows(data)
      })
      .catch((err) => {
        console.warn('[admin] inquiries load failed', err)
        if (alive) setError('No pudimos cargar las consultas. Intentá nuevamente.')
      })
      .finally(() => { if (alive) setLoading(false) })
    return () => { alive = false }
  }, [])

  return (
    <div>
      <div className="admin-card" style={{ marginBottom: 'var(--space-5)' }}>
        <h3 style={{ margin: 0, fontSize: '1rem', fontWeight: 600, color: 'var(--admin-text)' }}>Consultas de compradores</h3>
        <p style={{ margin: 'var(--space-1) 0 0', fontSize: '0.875rem', color: 'var(--admin-text-muted)' }}>
          Mensajes enviados desde el botón de Email en la ficha de cada aviso, con estado del envío al vendedor.
        </p>
      </div>

      {error && (
        <div className="admin-card" style={{ borderColor: 'var(--cm-danger)', marginBottom: 'var(--space-5)' }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: 'var(--space-3)', color: 'var(--cm-danger)' }}>
            <span>⚠</span>
            <span>{error}</span>
          </div>
        </div>
      )}

      <section className="admin-card">
        <div style={{ overflowX: 'auto' }}>
          <table className="admin-table">
            <thead>
              <tr>
                <th>Fecha</th>
                <th>Publicación</th>
                <th>Vendedor</th>
                <th>Comprador</th>
                <th>Estado</th>
              </tr>
            </thead>
            <tbody>
              {loading ? (
                <tr><td colSpan={5} className="cell-muted" style={{ textAlign: 'center' }}>Cargando…</td></tr>
              ) : rows.length ? (
                rows.map((row) => (
                  <Fragment key={row.id}>
                    <tr
                      onClick={() => setExpanded((current) => (current === row.id ? null : row.id))}
                      style={{ cursor: 'pointer' }}
                    >
                      <td className="cell-muted">{dateFormatter.format(new Date(row.created_at))}</td>
                      <td className="cell-strong">{row.listing_title || row.listing_id}</td>
                      <td>{row.seller_full_name || row.seller_email || row.seller_id}</td>
                      <td>{row.full_name} <span className="cell-muted">({row.email})</span></td>
                      <td><StatusBadge status={row.email_status} /></td>
                    </tr>
                    {expanded === row.id && (
                      <tr>
                        <td colSpan={5} style={{ background: 'var(--admin-bg-muted, #f9fafb)', padding: 'var(--space-4)' }}>
                          <p style={{ margin: 0, fontSize: '0.875rem', whiteSpace: 'pre-wrap' }}>{row.message}</p>
                          {row.phone && (
                            <p style={{ margin: '8px 0 0', fontSize: '0.8rem', color: 'var(--admin-text-muted)' }}>
                              Teléfono: {row.phone}
                            </p>
                          )}
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
                <tr><td colSpan={5} className="cell-muted" style={{ textAlign: 'center' }}>Sin consultas todavía</td></tr>
              )}
            </tbody>
          </table>
        </div>
      </section>
    </div>
  )
}
