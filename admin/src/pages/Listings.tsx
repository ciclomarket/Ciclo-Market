import { useCallback, useEffect, useMemo, useState } from 'react'
import { fetchAdminListings, type AdminListingRow, type FetchAdminListingsParams } from '@admin/services/listings'

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

type SortField = 'createdAt' | 'views30d' | 'contacts30d' | 'ctr30d' | 'lastContactAt'
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

function getStatusBadgeClass(status: string | null): string {
  switch (status) {
    case 'active': return 'badge-green'
    case 'paused': return 'badge-amber'
    case 'draft': return 'badge-gray'
    case 'archived': return 'badge-red'
    default: return 'badge-gray'
  }
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

  const now = useMemo(() => Date.now(), [])

  const isExpiringSoon = (expiresAt: string | null) => {
    if (!expiresAt) return false
    const ts = new Date(expiresAt).getTime()
    if (Number.isNaN(ts)) return false
    const days = (ts - now) / (1000 * 60 * 60 * 24)
    return days >= 0 && days <= 7
  }

  const isNoContacts14d = (lastContactAt: string | null) => {
    if (!lastContactAt) return true
    const ts = new Date(lastContactAt).getTime()
    if (Number.isNaN(ts)) return true
    const daysAgo = (now - ts) / (1000 * 60 * 60 * 24)
    return daysAgo >= 14
  }

  const load = useCallback(async () => {
    setLoading(true)
    setError(null)
    try {
      const params: FetchAdminListingsParams = { status, limit: 200 }
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
    const contacts30d = Number(row.contactsTotal30d ?? 0)
    const ctr30d = views30d > 0 ? (contacts30d / views30d) * 100 : 0
    return {
      ...row,
      views30d,
      contacts30d,
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
        case 'contacts30d':
          return factor * (a.contacts30d - b.contacts30d)
        case 'ctr30d':
          return factor * (a.ctr30d - b.ctr30d)
        case 'lastContactAt': {
          const aTime = a.lastContactAt ? new Date(a.lastContactAt).getTime() : 0
          const bTime = b.lastContactAt ? new Date(b.lastContactAt).getTime() : 0
          return factor * (aTime - bTime)
        }
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
    return sortDirection === 'asc' ? '↑' : '↓'
  }

  return (
    <div>
      {/* Filters Card */}
      <section className="admin-card" style={{ marginBottom: 'var(--space-5)' }}>
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', gap: 'var(--space-4)', flexWrap: 'wrap', marginBottom: 'var(--space-4)' }}>
          <div>
            <h3 style={{ margin: 0, fontSize: '1rem', fontWeight: 600, color: 'var(--admin-text)' }}>Filtros</h3>
            <p style={{ margin: 'var(--space-1) 0 0', fontSize: '0.875rem', color: 'var(--admin-text-muted)' }}>
              Filtrá por estado, plan y rango de creación
            </p>
          </div>
          <button type="button" onClick={() => load()} className="btn btn-primary">
            <span>↻</span>
            <span>Actualizar</span>
          </button>
        </div>

        <div className="admin-filters" style={{ margin: 0, border: 'none', padding: 0 }}>
          <div className="admin-filters-group">
            <label className="admin-form-label">Estado</label>
            <select className="admin-select" value={status} onChange={(e) => setStatus(e.target.value)}>
              {statusOptions.map((option) => (
                <option key={option.value} value={option.value}>{option.label}</option>
              ))}
            </select>
          </div>
          <div className="admin-filters-group">
            <label className="admin-form-label">Plan</label>
            <select className="admin-select" value={plan} onChange={(e) => setPlan(e.target.value)}>
              {planOptions.map((option) => (
                <option key={option.value} value={option.value}>{option.label}</option>
              ))}
            </select>
          </div>
          <div className="admin-filters-group">
            <label className="admin-form-label">Creado desde</label>
            <input type="date" className="admin-input" value={createdFrom} onChange={(e) => setCreatedFrom(e.target.value)} />
          </div>
          <div className="admin-filters-group">
            <label className="admin-form-label">Creado hasta</label>
            <input type="date" className="admin-input" value={createdTo} onChange={(e) => setCreatedTo(e.target.value)} />
          </div>
        </div>
      </section>

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
            <span style={{ marginLeft: 'var(--space-3)' }}>Cargando publicaciones…</span>
          </div>
        ) : !hasRows ? (
          <div className="admin-empty">
            <div className="admin-empty-icon">📭</div>
            <div className="admin-empty-title">No se encontraron publicaciones</div>
            <p>Probá ajustando los filtros</p>
          </div>
        ) : (
          <table className="admin-table" style={{ minWidth: '1200px' }}>
            <thead>
              <tr>
                <th>Título</th>
                <th>Estado</th>
                <th>Precio</th>
                <th>Plan</th>
                <th>Vendedor</th>
                <th>
                  <button type="button" onClick={() => toggleSort('createdAt')} className="admin-table-sort">
                    Creado {renderSortIndicator('createdAt')}
                  </button>
                </th>
                <th style={{ textAlign: 'right' }}>
                  <button type="button" onClick={() => toggleSort('views30d')} className="admin-table-sort">
                    Vistas {renderSortIndicator('views30d')}
                  </button>
                </th>
                <th style={{ textAlign: 'right' }}>Contactos</th>
                <th style={{ textAlign: 'right' }}>
                  <button type="button" onClick={() => toggleSort('ctr30d')} className="admin-table-sort">
                    CTR {renderSortIndicator('ctr30d')}
                  </button>
                </th>
                <th>Flags</th>
              </tr>
            </thead>
            <tbody>
              {sortedRows.map((row) => (
                <tr key={row.id}>
                  <td>
                    <div style={{ fontWeight: 600, color: 'var(--admin-text)' }}>{row.title}</div>
                    <div className="cell-muted">{row.category ?? 'Sin categoría'}</div>
                  </td>
                  <td>
                    <span className={`badge ${getStatusBadgeClass(row.status)}`}>
                      {row.status ?? 'sin dato'}
                    </span>
                  </td>
                  <td className="cell-strong">{formatPrice(row.price ?? null, row.priceCurrency)}</td>
                  <td>
                    <span className="badge badge-gray">{row.sellerPlan ?? '—'}</span>
                  </td>
                  <td>
                    <div style={{ fontWeight: 500 }}>{row.sellerName ?? 'Sin nombre'}</div>
                    <div className="cell-muted">{row.sellerEmail ?? row.sellerId ?? '—'}</div>
                  </td>
                  <td className="cell-muted">{formatDate(row.createdAt)}</td>
                  <td className="cell-strong" style={{ textAlign: 'right' }}>{numberFormatter.format(row.views30d)}</td>
                  <td style={{ textAlign: 'right' }}>
                    <div className="cell-strong">{numberFormatter.format(row.contactsTotal30d)}</div>
                    <div className="cell-muted" style={{ fontSize: '0.75rem' }}>
                      WA: {row.waContacts30d} · Mail: {row.emailContacts30d}
                    </div>
                  </td>
                  <td className="cell-strong" style={{ textAlign: 'right' }}>{percentFormatter.format(row.ctr30d)}%</td>
                  <td>
                    <div style={{ display: 'flex', gap: 'var(--space-1)', flexWrap: 'wrap' }}>
                      {row.imagesCount < 3 && (
                        <span className="badge badge-amber">Pocas fotos</span>
                      )}
                      {(row.description?.trim().length ?? 0) < 120 && (
                        <span className="badge badge-amber">Desc corta</span>
                      )}
                      {isNoContacts14d(row.lastContactAt) && (
                        <span className="badge badge-red">Sin contactos</span>
                      )}
                      {isExpiringSoon(row.expiresAt) && (
                        <span className="badge badge-red">Expira pronto</span>
                      )}
                    </div>
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
