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
  const styleBase: React.CSSProperties = {
    display: 'inline-flex',
    alignItems: 'center',
    gap: '0.3rem',
    fontSize: '0.82rem',
    fontWeight: 600,
  }
  if (previous <= 0) {
    if (current <= 0) return <span style={{ ...styleBase, color: '#7f92ab' }}>—</span>
    return <span style={{ ...styleBase, color: '#6fff9d' }}>▲ +{numberFormatter.format(current)}</span>
  }
  const diff = current - previous
  const pct = (diff / previous) * 100
  if (Math.abs(pct) < 0.1) return <span style={{ ...styleBase, color: '#7f92ab' }}>—</span>
  if (pct > 0) return <span style={{ ...styleBase, color: '#6fff9d' }}>▲ {percentFormatter.format(pct)}%</span>
  return <span style={{ ...styleBase, color: '#ff8f8f' }}>▼ {percentFormatter.format(Math.abs(pct))}%</span>
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
      <section className="admin-card" style={{ marginBottom: '1.5rem', display: 'flex', justifyContent: 'space-between', alignItems: 'center', gap: '1.5rem', flexWrap: 'wrap' }}>
        <div>
          <h3>{store?.store_name ?? 'Tienda sin nombre'}</h3>
          <p style={{ color: '#9fb3c9' }}>
            {store ? `${store.city ?? ''}${store.city && store.province ? ', ' : ''}${store.province ?? ''}` || 'Ubicación no informada' : ''}
          </p>
          <p style={{ color: '#7f92ab', marginTop: '0.5rem' }}>
            Slug: <strong>{store?.store_slug ?? '—'}</strong>
          </p>
        </div>
        <div style={{ display: 'flex', gap: '0.75rem', flexWrap: 'wrap' }}>
          <button
            type="button"
            onClick={() => navigate(-1)}
            style={{
              padding: '0.5rem 0.9rem',
              borderRadius: '12px',
              border: '1px solid rgba(255,255,255,0.12)',
              background: 'rgba(255,255,255,0.08)',
              color: '#f2f6fb',
              fontWeight: 600,
              cursor: 'pointer',
            }}
          >
            Volver
          </button>
          <Link
            to="/stores"
            style={{
              padding: '0.5rem 0.9rem',
              borderRadius: '12px',
              border: '1px solid rgba(97,223,255,0.3)',
              background: 'linear-gradient(135deg, rgba(97,223,255,0.24), rgba(73,133,255,0.24))',
              color: '#f2f6fb',
              fontWeight: 600,
            }}
          >
            Ver listado
          </Link>
        </div>
      </section>

      {error ? (
        <div className="admin-card" style={{ borderColor: 'rgba(255,107,107,0.4)', color: '#ff8f8f', marginBottom: '1.5rem' }}>{error}</div>
      ) : null}

      <section className="admin-card" style={{ marginBottom: '1.5rem' }}>
        <h3>Métricas (últimos 30 días)</h3>
        <div style={{ display: 'grid', gap: '1rem', gridTemplateColumns: 'repeat(auto-fit,minmax(180px,1fr))', marginTop: '1rem' }}>
          <div>
            <div style={{ color: '#9fb3c9', fontSize: '0.82rem' }}>Vistas tienda</div>
            <div style={{ fontSize: '1.6rem', fontWeight: 700, color: '#f2f6fb' }}>
              {store ? numberFormatter.format(store.storeViews30d) : '…'}
            </div>
          </div>
          <div>
            <div style={{ color: '#9fb3c9', fontSize: '0.82rem' }}>Vistas avisos</div>
            <div style={{ fontSize: '1.6rem', fontWeight: 700, color: '#f2f6fb' }}>
              {store ? numberFormatter.format(store.listingViews30d) : '…'}
            </div>
          </div>
          <div>
            <div style={{ color: '#9fb3c9', fontSize: '0.82rem' }}>Clics WhatsApp</div>
            <div style={{ fontSize: '1.6rem', fontWeight: 700, color: '#f2f6fb' }}>
              {store ? numberFormatter.format(store.waClicks30d) : '…'}
            </div>
          </div>
          <div>
            <div style={{ color: '#9fb3c9', fontSize: '0.82rem' }}>CTR avisos → WA</div>
            <div style={{ fontSize: '1.6rem', fontWeight: 700, color: '#f2f6fb' }}>
              {store ? `${percentFormatter.format(ctrListing)}%` : '…'}
            </div>
          </div>
          <div>
            <div style={{ color: '#9fb3c9', fontSize: '0.82rem' }}>Checkouts (30d)</div>
            <div style={{ fontSize: '1.6rem', fontWeight: 700, color: '#f2f6fb' }}>
              {detail ? numberFormatter.format(detail.checkouts30d) : '…'}
            </div>
            <div style={{ marginTop: '0.35rem' }}>
              {detail ? <DeltaBadge current={detail.checkouts30d} previous={detail.checkoutsPrev30d} /> : null}
            </div>
          </div>
        </div>
        <div style={{ marginTop: '1.2rem', color: '#7f92ab', fontSize: '0.85rem' }}>
          Avisos activos: <strong style={{ color: '#c2d5eb' }}>{store ? store.activeListings : '—'}</strong>
        </div>
      </section>

      <section className="admin-card">
        <h3>Publicaciones de la tienda</h3>
        <p style={{ color: '#7f92ab', marginBottom: '0.75rem' }}>Ordenadas por vistas de los últimos 30 días.</p>
        <div style={{ overflowX: 'auto' }}>
          <table style={{ width: '100%', borderCollapse: 'collapse', minWidth: '760px' }}>
            <thead>
              <tr style={{ background: 'rgba(12,23,35,0.9)', textAlign: 'left', color: '#9fb3c9', fontSize: '0.78rem', letterSpacing: '0.08em' }}>
                <th style={{ padding: '0.6rem 0.9rem' }}>Publicación</th>
                <th style={{ padding: '0.6rem 0.9rem' }}>Estado</th>
                <th style={{ padding: '0.6rem 0.9rem' }}>Plan</th>
                <th style={{ padding: '0.6rem 0.9rem' }}>Creado</th>
                <th style={{ padding: '0.6rem 0.9rem' }}>Vistas 30d</th>
                <th style={{ padding: '0.6rem 0.9rem' }}>Clics WA 30d</th>
                <th style={{ padding: '0.6rem 0.9rem' }}>CTR 30d</th>
              </tr>
            </thead>
            <tbody>
              {loading ? (
                <tr><td colSpan={7} style={{ padding: '1rem', color: '#92a5bc', textAlign: 'center' }}>Cargando publicaciones…</td></tr>
              ) : sortedListings.length ? (
                sortedListings.map((listing) => {
                  const ctr = listing.views30d > 0 ? (listing.waClicks30d / listing.views30d) * 100 : 0
                  return (
                    <tr key={listing.id} style={{ borderTop: '1px solid rgba(255,255,255,0.06)' }}>
                      <td style={{ padding: '0.8rem 0.9rem', color: '#c2d5eb' }}>{listing.title}</td>
                      <td style={{ padding: '0.8rem 0.9rem', color: '#c2d5eb' }}>{listing.status ?? '—'}</td>
                      <td style={{ padding: '0.8rem 0.9rem', color: '#c2d5eb' }}>{listing.sellerPlan ?? '—'}</td>
                      <td style={{ padding: '0.8rem 0.9rem', color: '#c2d5eb' }}>{formatDate(listing.createdAt)}</td>
                      <td style={{ padding: '0.8rem 0.9rem', color: '#c2d5eb' }}>{numberFormatter.format(listing.views30d)}</td>
                      <td style={{ padding: '0.8rem 0.9rem', color: '#c2d5eb' }}>{numberFormatter.format(listing.waClicks30d)}</td>
                      <td style={{ padding: '0.8rem 0.9rem', color: '#c2d5eb' }}>{percentFormatter.format(ctr)}%</td>
                    </tr>
                  )
                })
              ) : (
                <tr><td colSpan={7} style={{ padding: '1rem', color: '#92a5bc', textAlign: 'center' }}>La tienda no tiene publicaciones activas.</td></tr>
              )}
            </tbody>
          </table>
        </div>
      </section>
    </div>
  )
}
