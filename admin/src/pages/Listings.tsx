import { useCallback, useEffect, useMemo, useState } from 'react'
import { fetchAdminListings, type AdminListingRow } from '@admin/services/listings'

const statusOptions = [
  { value: 'all', label: 'Todas' },
  { value: 'active', label: 'Activas' },
  { value: 'paused', label: 'Pausadas' },
  { value: 'draft', label: 'Borradores' },
  { value: 'archived', label: 'Archivadas' },
]

const dateFormatter = new Intl.DateTimeFormat('es-AR', {
  year: 'numeric',
  month: 'short',
  day: '2-digit',
})

function formatDate(value: string | null): string {
  if (!value) return '—'
  const date = new Date(value)
  if (Number.isNaN(date.getTime())) return '—'
  return dateFormatter.format(date)
}

function formatPrice(price: number | null, currency: string | null): string {
  if (price === null) return '—'
  const formatter = new Intl.NumberFormat('es-AR', {
    style: 'currency',
    currency: currency === 'ARS' ? 'ARS' : 'USD',
    maximumFractionDigits: currency === 'ARS' ? 0 : 2,
  })
  return formatter.format(price)
}

export default function ListingsPage() {
  const [status, setStatus] = useState<string>('all')
  const [rows, setRows] = useState<AdminListingRow[]>([])
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)

  const load = useCallback(async () => {
    setLoading(true)
    setError(null)
    try {
      const data = await fetchAdminListings({ status })
      setRows(data)
    } catch (err) {
      console.warn('[admin] fetch listings failed', err)
      setError('No pudimos cargar las publicaciones. Reintentá en unos segundos.')
    } finally {
      setLoading(false)
    }
  }, [status])

  useEffect(() => {
    void load()
  }, [load])

  const hasRows = rows.length > 0

  const headerActions = useMemo(() => (
    <div style={{ display: 'flex', gap: '0.75rem', alignItems: 'center' }}>
      <label style={{ display: 'flex', flexDirection: 'column', gap: '0.25rem', fontSize: '0.8rem', color: '#9db2cb' }}>
        Estado
        <select
          value={status}
          onChange={(event) => setStatus(event.target.value)}
          style={{
            background: 'rgba(15,30,46,0.8)',
            border: '1px solid rgba(255,255,255,0.1)',
            color: '#f2f6fb',
            padding: '0.45rem 0.7rem',
            borderRadius: '10px',
          }}
        >
          {statusOptions.map((option) => (
            <option key={option.value} value={option.value}>
              {option.label}
            </option>
          ))}
        </select>
      </label>
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
  ), [status, load])

  return (
    <div>
      <section className="admin-card" style={{ marginBottom: '1.5rem' }}>
        <div style={{ display: 'flex', justifyContent: 'space-between', gap: '1.5rem', flexWrap: 'wrap' }}>
          <div>
            <h3>Panel de publicaciones</h3>
            <p>
              Revisá los avisos más recientes, su estado y plan vigente. Este listado ordena por publicación descendente
              y permite filtrar por estado.
            </p>
          </div>
          {headerActions}
        </div>
      </section>

      {error ? (
        <div className="admin-card" style={{ borderColor: 'rgba(255,107,107,0.4)', color: '#ff8f8f' }}>{error}</div>
      ) : null}

      <div className="admin-card" style={{ padding: 0, overflow: 'hidden' }}>
        <table style={{ width: '100%', borderCollapse: 'collapse', minWidth: '760px' }}>
          <thead>
            <tr style={{ background: 'rgba(12,23,35,0.9)', textAlign: 'left', color: '#9fb3c9', fontSize: '0.78rem', letterSpacing: '0.08em' }}>
              <th style={{ padding: '0.9rem 1.2rem' }}>Titulo</th>
              <th style={{ padding: '0.9rem 1.2rem' }}>Estado</th>
              <th style={{ padding: '0.9rem 1.2rem' }}>Precio</th>
              <th style={{ padding: '0.9rem 1.2rem' }}>Plan</th>
              <th style={{ padding: '0.9rem 1.2rem' }}>Vendedor</th>
              <th style={{ padding: '0.9rem 1.2rem' }}>Creado</th>
              <th style={{ padding: '0.9rem 1.2rem' }}>Expira</th>
            </tr>
          </thead>
          <tbody>
            {loading ? (
              <tr>
                <td colSpan={7} style={{ padding: '1.5rem', textAlign: 'center', color: '#92a5bc' }}>
                  Cargando publicaciones…
                </td>
              </tr>
            ) : hasRows ? (
              rows.map((row) => (
                <tr key={row.id} style={{ borderTop: '1px solid rgba(255,255,255,0.04)' }}>
                  <td style={{ padding: '1rem 1.2rem', color: '#f2f6fb', fontWeight: 500 }}>
                    <div>{row.title}</div>
                    <div style={{ color: '#7f92ab', fontSize: '0.82rem' }}>{row.category ?? 'Sin categoría'}</div>
                  </td>
                  <td style={{ padding: '1rem 1.2rem', textTransform: 'capitalize', color: '#c2d5eb' }}>{row.status ?? 'sin dato'}</td>
                  <td style={{ padding: '1rem 1.2rem', color: '#c2d5eb' }}>{formatPrice(row.price ?? null, row.priceCurrency)}</td>
                  <td style={{ padding: '1rem 1.2rem', color: '#c2d5eb' }}>{row.sellerPlan ?? '—'}</td>
                  <td style={{ padding: '1rem 1.2rem', color: '#c2d5eb' }}>
                    <div>{row.sellerName ?? 'Sin nombre'}</div>
                    <div style={{ fontSize: '0.78rem', color: '#7f92ab' }}>{row.sellerEmail ?? row.sellerId ?? '—'}</div>
                  </td>
                  <td style={{ padding: '1rem 1.2rem', color: '#c2d5eb' }}>{formatDate(row.createdAt)}</td>
                  <td style={{ padding: '1rem 1.2rem', color: '#c2d5eb' }}>{formatDate(row.expiresAt)}</td>
                </tr>
              ))
            ) : (
              <tr>
                <td colSpan={7} style={{ padding: '1.5rem', textAlign: 'center', color: '#92a5bc' }}>
                  No encontramos publicaciones con el filtro actual.
                </td>
              </tr>
            )}
          </tbody>
        </table>
      </div>
    </div>
  )
}
