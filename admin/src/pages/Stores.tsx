import { useCallback, useEffect, useMemo, useState } from 'react'
import { useNavigate } from 'react-router-dom'
import { fetchAdminStores, type AdminStore } from '@admin/services/stores'

const numberFormatter = new Intl.NumberFormat('es-AR')
const percentFormatter = new Intl.NumberFormat('es-AR', { maximumFractionDigits: 1 })

export default function StoresPage() {
  const [stores, setStores] = useState<AdminStore[]>([])
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)
  const navigate = useNavigate()

  const load = useCallback(async () => {
    setLoading(true)
    setError(null)
    try {
      const data = await fetchAdminStores()
      setStores(data)
    } catch (err) {
      console.warn('[admin] fetch stores failed', err)
      setError('No pudimos obtener las tiendas oficiales.')
    } finally {
      setLoading(false)
    }
  }, [])

  useEffect(() => {
    void load()
  }, [load])

  const sortedStores = useMemo(() => (
    [...stores].sort((a, b) => (b.storeViews30d - a.storeViews30d))
  ), [stores])

  return (
    <div>
      {/* Header */}
      <div className="admin-card" style={{ marginBottom: 'var(--space-5)' }}>
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', gap: 'var(--space-4)', flexWrap: 'wrap' }}>
          <div>
            <h3 style={{ margin: 0, fontSize: '1rem', fontWeight: 600, color: 'var(--admin-text)' }}>Tiendas Oficiales</h3>
            <p style={{ margin: 'var(--space-1) 0 0', fontSize: '0.875rem', color: 'var(--admin-text-muted)' }}>
              Partners activos, información pública y métricas de engagement
            </p>
          </div>
          <button type="button" onClick={() => load()} className="btn btn-primary">
            <span>↻</span>
            <span>Actualizar</span>
          </button>
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

      {/* Table */}
      <div className="admin-table-container">
        {loading ? (
          <div className="admin-loading">
            <div className="admin-spinner" />
            <span style={{ marginLeft: 'var(--space-3)' }}>Cargando tiendas…</span>
          </div>
        ) : sortedStores.length === 0 ? (
          <div className="admin-empty">
            <div className="admin-empty-icon">🏪</div>
            <div className="admin-empty-title">No hay tiendas registradas</div>
          </div>
        ) : (
          <table className="admin-table">
            <thead>
              <tr>
                <th>Tienda</th>
                <th>Ubicación</th>
                <th style={{ textAlign: 'right' }}>Avisos activos</th>
                <th style={{ textAlign: 'right' }}>Vistas tienda</th>
                <th style={{ textAlign: 'right' }}>Vistas avisos</th>
                <th style={{ textAlign: 'right' }}>Clics WA</th>
                <th style={{ textAlign: 'right' }}>CTR</th>
                <th>Contacto</th>
                <th></th>
              </tr>
            </thead>
            <tbody>
              {sortedStores.map((store) => (
                <tr key={store.id}>
                  <td>
                    <div style={{ fontWeight: 600, color: 'var(--admin-text)' }}>{store.store_name ?? 'Sin nombre'}</div>
                    {store.store_website && (
                      <a href={store.store_website} target="_blank" rel="noreferrer" className="cell-muted" style={{ fontSize: '0.75rem' }}>
                        {store.store_website}
                      </a>
                    )}
                  </td>
                  <td className="cell-muted">{[store.city, store.province].filter(Boolean).join(', ') || '—'}</td>
                  <td className="cell-strong" style={{ textAlign: 'right' }}>{store.activeListings}</td>
                  <td style={{ textAlign: 'right' }}>{numberFormatter.format(store.storeViews30d)}</td>
                  <td style={{ textAlign: 'right' }}>{numberFormatter.format(store.listingViews30d)}</td>
                  <td className="cell-strong" style={{ textAlign: 'right' }}>{numberFormatter.format(store.waClicks30d)}</td>
                  <td className="cell-muted" style={{ textAlign: 'right' }}>
                    {store.listingViews30d > 0
                      ? `${percentFormatter.format((store.waClicks30d / store.listingViews30d) * 100)}%`
                      : '0%'}
                  </td>
                  <td className="cell-muted">{store.store_phone ?? '—'}</td>
                  <td>
                    <button
                      type="button"
                      onClick={() => navigate(`/stores/${store.id}`)}
                      className="btn btn-secondary btn-sm"
                    >
                      Ver
                    </button>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        )}
      </div>
    </div>
  )
}
