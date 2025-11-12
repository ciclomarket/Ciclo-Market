import { useCallback, useEffect, useMemo, useState } from 'react'
import { fetchAdminListings, type AdminListingRow } from '@admin/services/listings'

const statusOptions = [
  { value: 'all', label: 'Todas' },
  { value: 'active', label: 'Activas' },
  { value: 'paused', label: 'Pausadas' },
  { value: 'draft', label: 'Borradores' },
  { value: 'archived', label: 'Archivadas' },
]

const planOptions = [
  { value: 'all', label: 'Todos los planes' },
  { value: 'free', label: 'Free' },
  { value: 'basic', label: 'Básico' },
  { value: 'pro', label: 'Pro' },
  { value: 'premium', label: 'Premium' },
]

type SortField = 'createdAt' | 'views30d' | 'waClicks30d' | 'ctr30d'
type SortDirection = 'asc' | 'desc'

const dateFormatter = new Intl.DateTimeFormat('es-AR', {
  year: 'numeric',
  month: 'short',
  day: '2-digit',
})
const numberFormatter = new Intl.NumberFormat('es-AR')
const percentFormatter = new Intl.NumberFormat('es-AR', { maximumFractionDigits: 1 })

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
  const [plan, setPlan] = useState<string>('all')
  const [createdFrom, setCreatedFrom] = useState<string>('')
  const [createdTo, setCreatedTo] = useState<string>('')
  const [rows, setRows] = useState<AdminListingRow[]>([])
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)
  const [sortField, setSortField] = useState<SortField>('createdAt')
  const [sortDirection, setSortDirection] = useState<SortDirection>('desc')

  const load = useCallback(async () => {
    setLoading(true)
    setError(null)
    try {
      const params: any = { status, limit: 200 }
      if (plan && plan !== 'all') params.plan = plan
      if (createdFrom) params.createdFrom = `${createdFrom}T00:00:00`
      if (createdTo) params.createdTo = `${createdTo}T23:59:59`
      const data = await fetchAdminListings(params)
      setRows(data)
    } catch (err) {
      console.warn('[admin] fetch listings failed', err)
      setError('No pudimos cargar las publicaciones. Reintentá en unos segundos.')
    } finally {
      setLoading(false)
    }
  }, [status, plan, createdFrom, createdTo])

  useEffect(() => {
    void load()
  }, [load])

  const enhancedRows = useMemo(() => rows.map((row) => {
    const views30d = Number(row.views30d ?? 0)
    const waClicks30d = Number(row.waClicks30d ?? 0)
    const ctr30d = views30d > 0 ? (waClicks30d / views30d) * 100 : 0
    return {
      ...row,
      views30d,
      waClicks30d,
      ctr30d,
    }
  }), [rows])

  const sortedRows = useMemo(() => {
    const copy = [...enhancedRows]
    const factor = sortDirection === 'asc' ? 1 : -1
    copy.sort((a, b) => {
      switch (sortField) {
        case 'views30d':
          return factor * (a.views30d - b.views30d)
        case 'waClicks30d':
          return factor * (a.waClicks30d - b.waClicks30d)
        case 'ctr30d':
          return factor * (a.ctr30d - b.ctr30d)
        case 'createdAt':
        default: {
          const aTime = a.createdAt ? new Date(a.createdAt).getTime() : 0
          const bTime = b.createdAt ? new Date(b.createdAt).getTime() : 0
          return factor * (aTime - bTime)
        }
      }
    })
    return copy
  }, [enhancedRows, sortField, sortDirection])

  const hasRows = sortedRows.length > 0

  const toggleSort = (field: SortField) => {
    setSortField((prevField) => {
      if (prevField === field) {
        setSortDirection((prevDir) => (prevDir === 'asc' ? 'desc' : 'asc'))
        return prevField
      }
      setSortDirection('desc')
      return field
    })
  }

  const renderSortIndicator = (field: SortField) => {
    if (sortField !== field) return null
    return sortDirection === 'asc' ? '▲' : '▼'
  }

  return (
    <div>
      <section className="admin-card" style={{ marginBottom: '1.5rem' }}>
        <div style={{ display: 'flex', justifyContent: 'space-between', gap: '1.5rem', flexWrap: 'wrap' }}>
          <div>
            <h3>Panel de publicaciones</h3>
            <p>
              Revisá las publicaciones con métricas clave de vistas y clics de WhatsApp.
              Podés filtrar por estado, plan y rango de creación.
            </p>
          </div>
          <div style={{ display: 'grid', gap: '0.6rem', gridTemplateColumns: 'repeat(auto-fit,minmax(150px,1fr))', maxWidth: '460px' }}>
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
            <label style={{ display: 'flex', flexDirection: 'column', gap: '0.25rem', fontSize: '0.8rem', color: '#9db2cb' }}>
              Plan
              <select
                value={plan}
                onChange={(event) => setPlan(event.target.value)}
                style={{
                  background: 'rgba(15,30,46,0.8)',
                  border: '1px solid rgba(255,255,255,0.1)',
                  color: '#f2f6fb',
                  padding: '0.45rem 0.7rem',
                  borderRadius: '10px',
                }}
              >
                {planOptions.map((option) => (
                  <option key={option.value} value={option.value}>
                    {option.label}
                  </option>
                ))}
              </select>
            </label>
            <label style={{ display: 'flex', flexDirection: 'column', gap: '0.25rem', fontSize: '0.8rem', color: '#9db2cb' }}>
              Creado desde
              <input
                type="date"
                value={createdFrom}
                onChange={(event) => setCreatedFrom(event.target.value)}
                style={{
                  background: 'rgba(15,30,46,0.8)',
                  border: '1px solid rgba(255,255,255,0.1)',
                  color: '#f2f6fb',
                  padding: '0.45rem 0.7rem',
                  borderRadius: '10px',
                }}
              />
            </label>
            <label style={{ display: 'flex', flexDirection: 'column', gap: '0.25rem', fontSize: '0.8rem', color: '#9db2cb' }}>
              Creado hasta
              <input
                type="date"
                value={createdTo}
                onChange={(event) => setCreatedTo(event.target.value)}
                style={{
                  background: 'rgba(15,30,46,0.8)',
                  border: '1px solid rgba(255,255,255,0.1)',
                  color: '#f2f6fb',
                  padding: '0.45rem 0.7rem',
                  borderRadius: '10px',
                }}
              />
            </label>
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
              height: 'fit-content',
            }}
          >
            Actualizar
          </button>
        </div>
      </section>

      {error ? (
        <div className="admin-card" style={{ borderColor: 'rgba(255,107,107,0.4)', color: '#ff8f8f', marginBottom: '1.5rem' }}>{error}</div>
      ) : null}

      <div className="admin-card" style={{ padding: 0, overflow: 'hidden' }}>
        <table style={{ width: '100%', borderCollapse: 'collapse', minWidth: '900px' }}>
          <thead>
            <tr style={{ background: 'rgba(12,23,35,0.9)', textAlign: 'left', color: '#9fb3c9', fontSize: '0.78rem', letterSpacing: '0.08em' }}>
              <th style={{ padding: '0.9rem 1.2rem' }}>Título</th>
              <th style={{ padding: '0.9rem 1.2rem' }}>Estado</th>
              <th style={{ padding: '0.9rem 1.2rem' }}>Precio</th>
              <th style={{ padding: '0.9rem 1.2rem' }}>Plan</th>
              <th style={{ padding: '0.9rem 1.2rem' }}>Vendedor</th>
              <th style={{ padding: '0.9rem 1.2rem' }}>
                <button
                  type="button"
                  onClick={() => toggleSort('createdAt')}
                  style={{ background: 'transparent', border: 0, color: '#9fb3c9', cursor: 'pointer', fontSize: '0.78rem', letterSpacing: '0.08em' }}
                >
                  Creado {renderSortIndicator('createdAt')}
                </button>
              </th>
              <th style={{ padding: '0.9rem 1.2rem' }}>
                <button
                  type="button"
                  onClick={() => toggleSort('views30d')}
                  style={{ background: 'transparent', border: 0, color: '#9fb3c9', cursor: 'pointer', fontSize: '0.78rem', letterSpacing: '0.08em' }}
                >
                  Vistas 30d {renderSortIndicator('views30d')}
                </button>
              </th>
              <th style={{ padding: '0.9rem 1.2rem' }}>
                <button
                  type="button"
                  onClick={() => toggleSort('waClicks30d')}
                  style={{ background: 'transparent', border: 0, color: '#9fb3c9', cursor: 'pointer', fontSize: '0.78rem', letterSpacing: '0.08em' }}
                >
                  WA 30d {renderSortIndicator('waClicks30d')}
                </button>
              </th>
              <th style={{ padding: '0.9rem 1.2rem' }}>
                <button
                  type="button"
                  onClick={() => toggleSort('ctr30d')}
                  style={{ background: 'transparent', border: 0, color: '#9fb3c9', cursor: 'pointer', fontSize: '0.78rem', letterSpacing: '0.08em' }}
                >
                  CTR 30d {renderSortIndicator('ctr30d')}
                </button>
              </th>
              <th style={{ padding: '0.9rem 1.2rem' }}>Expira</th>
            </tr>
          </thead>
          <tbody>
            {loading ? (
              <tr>
                <td colSpan={10} style={{ padding: '1.5rem', textAlign: 'center', color: '#92a5bc' }}>
                  Cargando publicaciones…
                </td>
              </tr>
            ) : hasRows ? (
              sortedRows.map((row) => (
                <tr key={row.id} style={{ borderTop: '1px solid rgba(255,255,255,0.04)' }}>
                  <td style={{ padding: '1rem 1.2rem', color: '#f2f6fb', fontWeight: 500 }}>
                    <div>{row.title}</div>
                    <div style={{ color: '#7f92ab', fontSize: '0.82rem' }}>{row.category ?? 'Sin categoría'}</div>
                  </td>
                  <td style={{ padding: '1rem 1.2rem', textTransform: 'capitalize', color: '#c2d5eb' }}>{row.status ?? 'sin dato'}</td>
                  <td style={{ padding: '1rem 1.2rem', color: '#c2d5eb' }}>{formatPrice(row.price ?? null, row.priceCurrency)}</td>
                  <td style={{ padding: '1rem 1.2rem', color: '#c2d5eb', textTransform: 'capitalize' }}>{row.sellerPlan ?? '—'}</td>
                  <td style={{ padding: '1rem 1.2rem', color: '#c2d5eb' }}>
                    <div>{row.sellerName ?? 'Sin nombre'}</div>
                    <div style={{ fontSize: '0.78rem', color: '#7f92ab' }}>{row.sellerEmail ?? row.sellerId ?? '—'}</div>
                  </td>
                  <td style={{ padding: '1rem 1.2rem', color: '#c2d5eb' }}>{formatDate(row.createdAt)}</td>
                  <td style={{ padding: '1rem 1.2rem', color: '#c2d5eb' }}>{numberFormatter.format(row.views30d)}</td>
                  <td style={{ padding: '1rem 1.2rem', color: '#c2d5eb' }}>{numberFormatter.format(row.waClicks30d)}</td>
                  <td style={{ padding: '1rem 1.2rem', color: '#c2d5eb' }}>{percentFormatter.format(row.ctr30d)}%</td>
                  <td style={{ padding: '1rem 1.2rem', color: '#c2d5eb' }}>{formatDate(row.expiresAt)}</td>
                </tr>
              ))
            ) : (
              <tr>
                <td colSpan={10} style={{ padding: '1.5rem', textAlign: 'center', color: '#92a5bc' }}>
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
