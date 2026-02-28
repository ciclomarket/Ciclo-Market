import { useEffect, useMemo, useState } from 'react'
import { Link, useNavigate, useParams } from 'react-router-dom'
import { fetchAdminStoreDetail, type AdminStoreDetail } from '@admin/services/stores'

const numberFormatter = new Intl.NumberFormat('es-AR')
const percentFormatter = new Intl.NumberFormat('es-AR', { maximumFractionDigits: 1 })
const dateFormatter = new Intl.DateTimeFormat('es-AR', { year: 'numeric', month: 'short', day: '2-digit' })

function formatDate(value: string | null): string {
  if (!value) return '—'
  const date = new Date(value)
  if (Number.isNaN(date.getTime())) return '—'
  return dateFormatter.format(date)
}

interface DeltaBadgeProps {
  current: number
  previous: number
}

function DeltaBadge({ current, previous }: DeltaBadgeProps) {
  const diff = current - previous
  if (previous <= 0) {
    if (current <= 0) return <span className="badge badge-gray">—</span>
    return <span className="badge badge-green">▲ +{numberFormatter.format(current)}</span>
  }
  const pct = (diff / previous) * 100
  if (Math.abs(pct) < 0.1) return <span className="badge badge-gray">—</span>
  if (pct > 0) return <span className="badge badge-green">▲ {percentFormatter.format(pct)}%</span>
  return <span className="badge badge-red">▼ {percentFormatter.format(Math.abs(pct))}%</span>
}

export default function StoreDetailPage() {
  const params = useParams()
  const navigate = useNavigate()
  const storeId = params.id || ''
  const [detail, setDetail] = useState<AdminStoreDetail | null>(null)
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)

  useEffect(() => {
    if (!storeId) {
      setError('Tienda no encontrada.')
      setLoading(false)
      return
    }
    let active = true
    setLoading(true)
    fetchAdminStoreDetail(storeId)
      .then((data) => {
        if (!active) return
        setDetail(data)
        if (!data.store) setError('No encontramos la tienda solicitada.')
      })
      .catch((err) => {
        console.warn('[admin] store detail failed', err)
        if (active) setError('No pudimos cargar los datos de la tienda.')
      })
      .finally(() => {
        if (active) setLoading(false)
      })
    return () => { active = false }
  }, [storeId])

  const store = detail?.store ?? null
  const listings = detail?.listings ?? []
  const ctrListing = store && store.listingViews30d > 0
    ? (store.waClicks30d / store.listingViews30d) * 100
    : 0

  const sortedListings = useMemo(() => (
    [...listings].sort((a, b) => b.views30d - a.views30d)
  ), [listings])

  return (
    <div>
      {/* Header */}
      <div className="admin-card" style={{ marginBottom: 'var(--space-5)' }}>
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', gap: 'var(--space-4)', flexWrap: 'wrap' }}>
          <div>
            <h2 style={{ margin: 0, fontSize: '1.25rem', fontWeight: 700, color: 'var(--admin-text)' }}>
              {store?.store_name ?? 'Tienda sin nombre'}
            </h2>
            <p style={{ margin: 'var(--space-1) 0 0', fontSize: '0.875rem', color: 'var(--admin-text-muted)' }}>
              {store ? `${store.city ?? ''}${store.city && store.province ? ', ' : ''}${store.province ?? ''}` || 'Ubicación no informada' : ''}
            </p>
            <div style={{ marginTop: 'var(--space-2)' }}>
              <span className="badge badge-gray">Slug: {store?.store_slug ?? '—'}</span>
            </div>
          </div>
          <div style={{ display: 'flex', gap: 'var(--space-2)' }}>
            <button type="button" onClick={() => navigate(-1)} className="btn btn-secondary">
              ← Volver
            </button>
            <Link to="/stores" className="btn btn-primary">
              Ver listado
            </Link>
          </div>
        </div>
      </div>

      {/* Error */}
      {error && (
        <div className="admin-card" style={{ borderColor: 'var(--cm-danger)', marginBottom: 'var(--space-5)' }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: 'var(--space-3)', color: 'var(--cm-danger)' }}>
            <span>⚠</span>
            <span>{error}</span>
          </div>
        </div>
      )}

      {/* Metrics */}
      <section className="admin-card" style={{ marginBottom: 'var(--space-5)' }}>
        <div className="admin-card-header">
          <div>
            <h3 className="admin-card-title">Métricas (últimos 30 días)</h3>
          </div>
        </div>
        <div style={{ display: 'grid', gap: 'var(--space-4)', gridTemplateColumns: 'repeat(auto-fit, minmax(160px, 1fr))' }}>
          <div style={{ padding: 'var(--space-4)', background: '#eff6ff', borderRadius: 'var(--radius-lg)', border: '1px solid #bfdbfe' }}>
            <div style={{ fontSize: '0.75rem', color: '#1e40af', textTransform: 'uppercase', letterSpacing: '0.05em' }}>Vistas tienda</div>
            <div style={{ fontSize: '1.5rem', fontWeight: 700, color: '#1d4ed8', marginTop: 'var(--space-1)' }}>
              {store ? numberFormatter.format(store.storeViews30d) : '…'}
            </div>
          </div>
          <div style={{ padding: 'var(--space-4)', background: '#ecfdf5', borderRadius: 'var(--radius-lg)', border: '1px solid #a7f3d0' }}>
            <div style={{ fontSize: '0.75rem', color: '#065f46', textTransform: 'uppercase', letterSpacing: '0.05em' }}>Vistas avisos</div>
            <div style={{ fontSize: '1.5rem', fontWeight: 700, color: '#047857', marginTop: 'var(--space-1)' }}>
              {store ? numberFormatter.format(store.listingViews30d) : '…'}
            </div>
          </div>
          <div style={{ padding: 'var(--space-4)', background: '#fffbeb', borderRadius: 'var(--radius-lg)', border: '1px solid #fcd34d' }}>
            <div style={{ fontSize: '0.75rem', color: '#92400e', textTransform: 'uppercase', letterSpacing: '0.05em' }}>Clics WhatsApp</div>
            <div style={{ fontSize: '1.5rem', fontWeight: 700, color: '#b45309', marginTop: 'var(--space-1)' }}>
              {store ? numberFormatter.format(store.waClicks30d) : '…'}
            </div>
          </div>
          <div style={{ padding: 'var(--space-4)', background: '#faf5ff', borderRadius: 'var(--radius-lg)', border: '1px solid #e9d5ff' }}>
            <div style={{ fontSize: '0.75rem', color: '#6b21a8', textTransform: 'uppercase', letterSpacing: '0.05em' }}>CTR avisos → WA</div>
            <div style={{ fontSize: '1.5rem', fontWeight: 700, color: '#7c3aed', marginTop: 'var(--space-1)' }}>
              {store ? `${percentFormatter.format(ctrListing)}%` : '…'}
            </div>
          </div>
          <div style={{ padding: 'var(--space-4)', background: 'var(--admin-gray-50)', borderRadius: 'var(--radius-lg)', border: '1px solid var(--admin-border)' }}>
            <div style={{ fontSize: '0.75rem', color: 'var(--admin-text-muted)', textTransform: 'uppercase', letterSpacing: '0.05em' }}>Checkouts</div>
            <div style={{ fontSize: '1.5rem', fontWeight: 700, color: 'var(--admin-text)', marginTop: 'var(--space-1)' }}>
              {detail ? numberFormatter.format(detail.checkouts30d) : '…'}
            </div>
            <div style={{ marginTop: 'var(--space-1)' }}>
              {detail && <DeltaBadge current={detail.checkouts30d} previous={detail.checkoutsPrev30d} />}
            </div>
          </div>
        </div>
        <div style={{ marginTop: 'var(--space-4)', padding: 'var(--space-3)', background: 'var(--admin-gray-50)', borderRadius: 'var(--radius-lg)', fontSize: '0.875rem', color: 'var(--admin-text-secondary)' }}>
          Avisos activos: <strong style={{ color: 'var(--admin-text)' }}>{store ? store.activeListings : '—'}</strong>
        </div>
      </section>

      {/* Listings */}
      <section className="admin-card">
        <div className="admin-card-header">
          <div>
            <h3 className="admin-card-title">Publicaciones de la tienda</h3>
            <p style={{ margin: 'var(--space-1) 0 0', fontSize: '0.875rem', color: 'var(--admin-text-muted)' }}>Ordenadas por vistas de los últimos 30 días</p>
          </div>
        </div>
        <div style={{ overflowX: 'auto' }}>
          <table className="admin-table">
            <thead>
              <tr>
                <th>Publicación</th>
                <th>Estado</th>
                <th>Plan</th>
                <th>Creado</th>
                <th style={{ textAlign: 'right' }}>Vistas 30d</th>
                <th style={{ textAlign: 'right' }}>Clics WA 30d</th>
                <th style={{ textAlign: 'right' }}>CTR</th>
              </tr>
            </thead>
            <tbody>
              {loading ? (
                <tr><td colSpan={7} className="cell-muted" style={{ textAlign: 'center' }}>Cargando…</td></tr>
              ) : sortedListings.length ? (
                sortedListings.map((listing) => {
                  const ctr = listing.views30d > 0 ? (listing.waClicks30d / listing.views30d) * 100 : 0
                  return (
                    <tr key={listing.id}>
                      <td className="cell-strong">{listing.title}</td>
                      <td>
                        <span className={`badge ${listing.status === 'active' ? 'badge-green' : 'badge-gray'}`}>
                          {listing.status ?? '—'}
                        </span>
                      </td>
                      <td><span className="badge badge-gray">{listing.sellerPlan ?? '—'}</span></td>
                      <td className="cell-muted">{formatDate(listing.createdAt)}</td>
                      <td className="cell-strong" style={{ textAlign: 'right' }}>{numberFormatter.format(listing.views30d)}</td>
                      <td style={{ textAlign: 'right' }}>{numberFormatter.format(listing.waClicks30d)}</td>
                      <td className="cell-muted" style={{ textAlign: 'right' }}>{percentFormatter.format(ctr)}%</td>
                    </tr>
                  )
                })
              ) : (
                <tr><td colSpan={7} className="cell-muted" style={{ textAlign: 'center' }}>La tienda no tiene publicaciones activas.</td></tr>
              )}
            </tbody>
          </table>
        </div>
      </section>
    </div>
  )
}
