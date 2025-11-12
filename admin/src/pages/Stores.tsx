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
      <section className="admin-card" style={{ marginBottom: '1.5rem' }}>
        <div style={{ display: 'flex', justifyContent: 'space-between', flexWrap: 'wrap', gap: '1.5rem' }}>
          <div>
            <h3>Tiendas oficiales</h3>
            <p>
              Revisá la lista de partners activos, su información pública y cantidad de avisos en línea. Desde acá vas a
              poder navegar a los formularios de edición (logo, banner, copy, horarios) que implementemos más adelante.
            </p>
          </div>
          <button
            type="button"
            onClick={() => load()}
            style={{
              padding: '0.5rem 0.9rem',
              borderRadius: '12px',
              border: '1px solid rgba(255,255,255,0.12)',
              background: 'linear-gradient(135deg, rgba(97,223,255,0.24), rgba(73,133,255,0.24))',
              color: '#f2f6fb',
              fontWeight: 600,
              cursor: 'pointer',
            }}
          >
            Actualizar
          </button>
        </div>
      </section>

      {error ? (
        <div className="admin-card" style={{ borderColor: 'rgba(255,107,107,0.4)', color: '#ff8f8f' }}>{error}</div>
      ) : null}

      <div className="admin-card" style={{ padding: 0, overflow: 'hidden' }}>
        <table style={{ width: '100%', borderCollapse: 'collapse', minWidth: '960px' }}>
          <thead>
            <tr style={{ background: 'rgba(12,23,35,0.9)', textAlign: 'left', color: '#9fb3c9', fontSize: '0.78rem', letterSpacing: '0.08em' }}>
              <th style={{ padding: '0.9rem 1.2rem' }}>Tienda</th>
              <th style={{ padding: '0.9rem 1.2rem' }}>Ubicación</th>
              <th style={{ padding: '0.9rem 1.2rem' }}>Slug</th>
              <th style={{ padding: '0.9rem 1.2rem' }}>Avisos activos</th>
              <th style={{ padding: '0.9rem 1.2rem' }}>Vistas tienda (30d)</th>
              <th style={{ padding: '0.9rem 1.2rem' }}>Vistas avisos (30d)</th>
              <th style={{ padding: '0.9rem 1.2rem' }}>Clics WA (30d)</th>
              <th style={{ padding: '0.9rem 1.2rem' }}>CTR avisos → WA</th>
              <th style={{ padding: '0.9rem 1.2rem' }}>Contacto</th>
              <th style={{ padding: '0.9rem 1.2rem' }}>Detalle</th>
            </tr>
          </thead>
          <tbody>
            {loading ? (
              <tr>
                <td colSpan={10} style={{ padding: '1.5rem', textAlign: 'center', color: '#92a5bc' }}>
                  Cargando tiendas…
                </td>
              </tr>
            ) : sortedStores.length === 0 ? (
              <tr>
                <td colSpan={10} style={{ padding: '1.5rem', textAlign: 'center', color: '#92a5bc' }}>
                  No hay tiendas oficiales registradas todavía.
                </td>
              </tr>
            ) : (
              sortedStores.map((store) => (
                <tr key={store.id} style={{ borderTop: '1px solid rgba(255,255,255,0.04)' }}>
                  <td style={{ padding: '1rem 1.2rem', color: '#f2f6fb', fontWeight: 500 }}>
                    <div>{store.store_name ?? 'Sin nombre'}</div>
                    {store.store_website ? (
                      <a
                        href={store.store_website}
                        target="_blank"
                        rel="noreferrer"
                        style={{ fontSize: '0.78rem', color: '#7f92ab' }}
                      >
                        {store.store_website}
                      </a>
                    ) : null}
                  </td>
                  <td style={{ padding: '1rem 1.2rem', color: '#c2d5eb' }}>
                    {[store.city, store.province].filter(Boolean).join(', ') || '—'}
                  </td>
                  <td style={{ padding: '1rem 1.2rem', color: '#c2d5eb' }}>{store.store_slug}</td>
                  <td style={{ padding: '1rem 1.2rem', color: '#c2d5eb' }}>{store.activeListings}</td>
                  <td style={{ padding: '1rem 1.2rem', color: '#c2d5eb' }}>{numberFormatter.format(store.storeViews30d)}</td>
                  <td style={{ padding: '1rem 1.2rem', color: '#c2d5eb' }}>{numberFormatter.format(store.listingViews30d)}</td>
                  <td style={{ padding: '1rem 1.2rem', color: '#c2d5eb' }}>{numberFormatter.format(store.waClicks30d)}</td>
                  <td style={{ padding: '1rem 1.2rem', color: '#c2d5eb' }}>
                    {store.listingViews30d > 0
                      ? `${percentFormatter.format((store.waClicks30d / store.listingViews30d) * 100)}%`
                      : '0%'}
                  </td>
                  <td style={{ padding: '1rem 1.2rem', color: '#c2d5eb' }}>{store.store_phone ?? '—'}</td>
                  <td style={{ padding: '1rem 1.2rem' }}>
                    <button
                      type="button"
                      onClick={() => navigate(`/stores/${store.id}`)}
                      style={{
                        padding: '0.4rem 0.75rem',
                        borderRadius: '10px',
                        border: '1px solid rgba(255,255,255,0.12)',
                        background: 'rgba(97,223,255,0.12)',
                        color: '#f2f6fb',
                        fontWeight: 600,
                        cursor: 'pointer',
                      }}
                    >
                      Ver detalle
                    </button>
                  </td>
                </tr>
              ))
            )}
          </tbody>
        </table>
      </div>
    </div>
  )
}
