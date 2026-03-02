import type { ReactNode } from 'react'
import type { CrmSellerSummaryRow, SellerStage } from '@admin/services/sellerOps'

const numberFormatter = new Intl.NumberFormat('es-AR')
const dateTimeFormatter = new Intl.DateTimeFormat('es-AR', { dateStyle: 'short', timeStyle: 'short' })

export type SellerOpsSortField = 'score' | 'active_listings' | 'wa_30d' | 'email_30d' | 'contacts_30d' | 'last_lead'
export type SellerOpsSortDirection = 'asc' | 'desc'

function formatDateTime(value: string | null): string {
  if (!value) return '—'
  const ts = Date.parse(value)
  if (Number.isNaN(ts)) return '—'
  return dateTimeFormatter.format(new Date(ts))
}

function getStageBadgeClass(stage: string | null | undefined): string {
  const s = String(stage || 'active').toLowerCase()
  switch (s) {
    case 'lead': return 'badge-stage-lead'
    case 'onboarding': return 'badge-blue'
    case 'active': return 'badge-green'
    case 'at_risk': return 'badge-amber'
    case 'churned': return 'badge-red'
    case 'sold': return 'badge-green'
    default: return 'badge-gray'
  }
}

function stageLabel(stage: string | null | undefined): string {
  const s = String(stage || 'active').toLowerCase()
  if (s === 'lead') return 'Lead'
  if (s === 'onboarding') return 'Onboarding'
  if (s === 'at_risk') return 'At Risk'
  if (s === 'churned') return 'Churned'
  if (s === 'sold') return 'Sold'
  return 'Active'
}

export interface SellerOpsTableRow extends CrmSellerSummaryRow {
  stage: SellerStage | string | null
}

export interface SellerOpsTableProps {
  rows: SellerOpsTableRow[]
  onViewSeller: (sellerId: string) => void
  onAddTask: (sellerId: string) => void
  renderWhatsAppAction: (row: SellerOpsTableRow) => ReactNode
  sortField: SellerOpsSortField
  sortDirection: SellerOpsSortDirection
  onToggleSort: (field: SellerOpsSortField) => void
  // Bulk selection props
  selectedIds: Set<string>
  onToggleSelect: (sellerId: string) => void
  onSelectAll: () => void
  onSelectNone: () => void
  isAllSelected: boolean
}

function sortIndicator(active: boolean, direction: SellerOpsSortDirection): string {
  if (!active) return ''
  return direction === 'asc' ? ' ↑' : ' ↓'
}

function SortableHeader({
  label,
  field,
  sortField,
  sortDirection,
  onToggleSort,
}: {
  label: string
  field: SellerOpsSortField
  sortField: SellerOpsSortField
  sortDirection: SellerOpsSortDirection
  onToggleSort: (field: SellerOpsSortField) => void
}) {
  const active = sortField === field
  return (
    <button
      type="button"
      onClick={() => onToggleSort(field)}
      className="admin-table-sort"
      style={{ color: active ? 'var(--admin-text)' : 'var(--admin-text-muted)' }}
    >
      {label}{sortIndicator(active, sortDirection)}
    </button>
  )
}

export function SellerOpsTable({
  rows,
  onViewSeller,
  onAddTask,
  renderWhatsAppAction,
  sortField,
  sortDirection,
  onToggleSort,
  selectedIds,
  onToggleSelect,
  onSelectAll,
  onSelectNone,
  isAllSelected,
}: SellerOpsTableProps) {
  if (rows.length === 0) {
    return (
      <div className="admin-empty">
        <div className="admin-empty-icon">🔍</div>
        <div className="admin-empty-title">No se encontraron sellers</div>
        <p>Probá ajustando los filtros para ver más resultados</p>
      </div>
    )
  }

  const selectedCount = selectedIds.size

  return (
    <table className="admin-table">
      <thead>
        <tr>
          <th style={{ width: 40, textAlign: 'center' }}>
            <input
              type="checkbox"
              checked={isAllSelected}
              onChange={() => isAllSelected ? onSelectNone() : onSelectAll()}
              style={{ cursor: 'pointer' }}
              title={isAllSelected ? 'Deseleccionar todos' : 'Seleccionar todos de esta página'}
            />
          </th>
          <th style={{ minWidth: 200 }}>Seller</th>
          <th style={{ textAlign: 'center' }}>
            <SortableHeader label="Score" field="score" sortField={sortField} sortDirection={sortDirection} onToggleSort={onToggleSort} />
          </th>
          <th style={{ textAlign: 'center' }}>
            <SortableHeader label="Activos" field="active_listings" sortField={sortField} sortDirection={sortDirection} onToggleSort={onToggleSort} />
          </th>
          <th style={{ textAlign: 'center' }}>WA 7d</th>
          <th style={{ textAlign: 'center' }}>
            <SortableHeader label="WA 30d" field="wa_30d" sortField={sortField} sortDirection={sortDirection} onToggleSort={onToggleSort} />
          </th>
          <th style={{ textAlign: 'center' }}>Mail 7d</th>
          <th style={{ textAlign: 'center' }}>
            <SortableHeader label="Mail 30d" field="email_30d" sortField={sortField} sortDirection={sortDirection} onToggleSort={onToggleSort} />
          </th>
          <th style={{ textAlign: 'center' }}>
            <SortableHeader label="Contactos" field="contacts_30d" sortField={sortField} sortDirection={sortDirection} onToggleSort={onToggleSort} />
          </th>
          <th>
            <SortableHeader label="Último Lead" field="last_lead" sortField={sortField} sortDirection={sortDirection} onToggleSort={onToggleSort} />
          </th>
          <th>Stage</th>
          <th style={{ minWidth: 180 }}>Acciones</th>
        </tr>
      </thead>
      <tbody>
        {rows.map((row) => {
          const isSelected = selectedIds.has(row.seller_id)
          return (
          <tr 
            key={row.seller_id}
            style={isSelected ? { background: '#eff6ff' } : undefined}
          >
            <td style={{ textAlign: 'center' }}>
              <input
                type="checkbox"
                checked={isSelected}
                onChange={() => onToggleSelect(row.seller_id)}
                style={{ cursor: 'pointer' }}
              />
            </td>
            <td>
              <div style={{ display: 'flex', flexDirection: 'column', gap: 'var(--space-1)' }}>
                <div style={{ fontWeight: 600, color: 'var(--admin-text)' }}>
                  {row.seller_name}
                </div>
                <div style={{ display: 'flex', alignItems: 'center', gap: 'var(--space-2)' }}>
                  <span className={`badge ${row.is_store ? 'badge-blue' : 'badge-gray'}`}>
                    {row.is_store ? 'Store' : 'Particular'}
                  </span>
                  {row.city && (
                    <span className="cell-muted" style={{ fontSize: '0.75rem' }}>
                      {row.city}{row.province ? `, ${row.province}` : ''}
                    </span>
                  )}
                </div>
              </div>
            </td>
            <td style={{ textAlign: 'center' }}>
              <span className="cell-strong">{numberFormatter.format(row.score ?? 0)}</span>
            </td>
            <td style={{ textAlign: 'center' }}>
              <span className={row.active_listings_count ? 'cell-strong' : 'cell-muted'}>
                {numberFormatter.format(row.active_listings_count ?? 0)}
              </span>
            </td>
            <td style={{ textAlign: 'center' }}>
              <span className={row.wa_clicks_7d ? 'cell-strong' : 'cell-muted'}>
                {numberFormatter.format(row.wa_clicks_7d ?? 0)}
              </span>
            </td>
            <td style={{ textAlign: 'center' }}>
              <span className={row.wa_clicks_30d ? 'cell-strong' : 'cell-muted'}>
                {numberFormatter.format(row.wa_clicks_30d ?? 0)}
              </span>
            </td>
            <td style={{ textAlign: 'center' }}>
              <span className={row.email_contacts_7d ? 'cell-strong' : 'cell-muted'}>
                {numberFormatter.format(row.email_contacts_7d ?? 0)}
              </span>
            </td>
            <td style={{ textAlign: 'center' }}>
              <span className={row.email_contacts_30d ? 'cell-strong' : 'cell-muted'}>
                {numberFormatter.format(row.email_contacts_30d ?? 0)}
              </span>
            </td>
            <td style={{ textAlign: 'center' }}>
              <span className={row.contacts_total_30d ? 'cell-strong' : 'cell-muted'}>
                {numberFormatter.format(row.contacts_total_30d ?? 0)}
              </span>
            </td>
            <td>
              <span className="cell-muted">{formatDateTime(row.last_lead_at)}</span>
            </td>
            <td>
              <span className={`badge ${getStageBadgeClass(row.stage)}`}>
                {stageLabel(row.stage)}
              </span>
            </td>
            <td>
              <div style={{ display: 'flex', gap: 'var(--space-2)', flexWrap: 'wrap' }}>
                {renderWhatsAppAction(row)}
                <button
                  type="button"
                  onClick={() => onViewSeller(row.seller_id)}
                  className="btn btn-secondary btn-sm"
                >
                  Ver
                </button>
                <button
                  type="button"
                  onClick={() => onAddTask(row.seller_id)}
                  className="btn btn-ghost btn-sm"
                >
                  + Task
                </button>
              </div>
            </td>
          </tr>
        )})}
      </tbody>
    </table>
  )
}
