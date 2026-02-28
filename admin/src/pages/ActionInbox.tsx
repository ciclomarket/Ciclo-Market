/**
 * CRM Vendedores - Action Inbox
 * CRM 2.0 with Kanban, Next Best Action, Automation Rules
 */

import { useCallback, useEffect, useMemo, useState } from 'react'
import { FullScreenMessage } from '@admin/components/FullScreenMessage'
import { LoadingScreen } from '@admin/components/LoadingScreen'
import { SellerDrawer } from '@admin/components/sellerOps/SellerDrawer'
import { SellerOpsTable, type SellerOpsSortDirection, type SellerOpsSortField, type SellerOpsTableRow } from '@admin/components/sellerOps/SellerOpsTable'
import { WhatsAppButton } from '@admin/components/sellerOps/WhatsAppButton'
import { KanbanBoard } from '@admin/components/crm/KanbanBoard'
import { NextBestAction } from '@admin/components/crm/NextBestAction'
import { AutomationRules } from '@admin/components/crm/AutomationRules'
import {
  createSellerTask,
  fetchSellerOpsDetails,
  fetchSellerOpsInbox,
  logOutreachWhatsApp,
  ensureKanbanCard,
  type CrmSellerSummaryRow,
  type SellerOpsDetails,
} from '@admin/services/sellerOps'
import { useAdminAuth } from '@admin/context/AdminAuthContext'
import { supabaseEnabled } from '@app/services/supabase'
import type { KanbanCard, RecommendedAction } from '@admin/types/crm'

type FilterStage = 'all' | 'lead' | 'onboarding' | 'active' | 'at_risk' | 'churned'
type FilterBool = 'all' | 'yes' | 'no'
type FilterCooldown = 'all' | 'active' | 'inactive'
type FilterSellerType = 'all' | 'store' | 'particular'
type FilterHasActiveListings = 'all' | 'yes'
type TabView = 'list' | 'kanban' | 'actions' | 'automation'

const sortFields: SellerOpsSortField[] = ['score', 'active_listings', 'wa_30d', 'email_30d', 'contacts_30d', 'last_lead']
const ACTION_INBOX_CACHE_KEY = 'cm_admin_action_inbox_cache_v1'
const ACTION_INBOX_CACHE_TTL_MS = 60_000

function asFilterStage(value: string): FilterStage {
  return value === 'lead' || value === 'onboarding' || value === 'active' || value === 'at_risk' || value === 'churned' || value === 'all'
    ? value
    : 'all'
}

function asFilterCooldown(value: string): FilterCooldown {
  return value === 'active' || value === 'inactive' || value === 'all' ? value : 'all'
}

function asFilterBool(value: string): FilterBool {
  return value === 'yes' || value === 'no' || value === 'all' ? value : 'all'
}

function asFilterSellerType(value: string): FilterSellerType {
  return value === 'store' || value === 'particular' || value === 'all' ? value : 'all'
}

function asFilterHasActiveListings(value: string): FilterHasActiveListings {
  return value === 'yes' || value === 'all' ? value : 'all'
}

function asSortField(value: string): SellerOpsSortField {
  return sortFields.includes(value as SellerOpsSortField) ? (value as SellerOpsSortField) : 'score'
}

function buildSortKey(field: SellerOpsSortField, direction: SellerOpsSortDirection): string {
  const suffix = direction === 'asc' ? 'asc' : 'desc'
  if (field === 'score') return `score_${suffix}`
  if (field === 'active_listings') return `active_listings_${suffix}`
  if (field === 'wa_30d') return `wa_30d_${suffix}`
  if (field === 'email_30d') return `email_30d_${suffix}`
  if (field === 'contacts_30d') return `contacts_30d_${suffix}`
  if (field === 'last_lead') return `last_lead_${suffix}`
  return 'score_desc'
}

type ActionInboxCache = {
  ts: number
  page: number
  pageSize: number
  sortField: SellerOpsSortField
  sortDirection: SellerOpsSortDirection
  filterStoreOnly: FilterSellerType
  filterStage: FilterStage
  filterCooldown: FilterCooldown
  filterOptedOut: FilterBool
  filterHasActiveListings: FilterHasActiveListings
  activeTab: TabView
  rows: CrmSellerSummaryRow[]
}

function readActionInboxCache(): ActionInboxCache | null {
  try {
    const raw = window.sessionStorage.getItem(ACTION_INBOX_CACHE_KEY)
    if (!raw) return null
    const parsed = JSON.parse(raw) as Partial<ActionInboxCache>
    if (!parsed || typeof parsed !== 'object') return null
    if (typeof parsed.ts !== 'number') return null
    if (!Array.isArray(parsed.rows)) return null
    return parsed as ActionInboxCache
  } catch {
    return null
  }
}

function writeActionInboxCache(cache: ActionInboxCache) {
  try {
    window.sessionStorage.setItem(ACTION_INBOX_CACHE_KEY, JSON.stringify(cache))
  } catch { /* noop */ }
}

const defaultMessage = (sellerName: string, listingUrl: string | null) => [
  `Hola ${sellerName}, soy Rodri de Ciclo Market.`,
  listingUrl ? `Vi que tu publicación recibió consultas estos días: ${listingUrl}` : 'Vi que tu publicación recibió consultas estos días.',
  '¿La vendiste?',
  'Respondé con un número:',
  '1) Sí, por Ciclo Market',
  '2) Sí, por fuera',
  '3) Todavía no',
  '4) Quiero mejorarla (precio/fotos)',
  'Si querés que te ayudemos más rápido, respondé: PRECIO o FOTOS (o AYUDA).',
].join('\n')

// Stats Card Component
interface StatCardProps {
  label: string
  value: string | number
  icon: string
  color: 'blue' | 'green' | 'amber' | 'red' | 'purple' | 'pink'
}

function StatCard({ label, value, icon, color }: StatCardProps) {
  const colorMap = {
    blue: { bg: '#eff6ff', text: '#1d4ed8' },
    green: { bg: '#ecfdf5', text: '#047857' },
    amber: { bg: '#fffbeb', text: '#b45309' },
    red: { bg: '#fef2f2', text: '#b91c1c' },
    purple: { bg: '#f5f3ff', text: '#6d28d9' },
    pink: { bg: '#fdf2f8', text: '#be185d' },
  }
  const colors = colorMap[color]
  
  return (
    <div style={{ 
      display: 'flex', 
      alignItems: 'center', 
      gap: 'var(--space-3)',
      padding: 'var(--space-4)',
      background: 'var(--admin-surface)',
      border: '1px solid var(--admin-border)',
      borderRadius: 'var(--radius-xl)',
    }}>
      <div style={{
        width: 44,
        height: 44,
        borderRadius: 'var(--radius-lg)',
        background: colors.bg,
        display: 'grid',
        placeItems: 'center',
        fontSize: '1.25rem',
      }}>
        {icon}
      </div>
      <div>
        <div style={{ fontSize: '0.75rem', color: 'var(--admin-text-muted)', textTransform: 'uppercase', letterSpacing: '0.05em' }}>
          {label}
        </div>
        <div style={{ fontSize: '1.25rem', fontWeight: 700, color: colors.text }}>
          {value}
        </div>
      </div>
    </div>
  )
}

// Tab Button Component
interface TabButtonProps {
  active: boolean
  onClick: () => void
  icon: string
  label: string
  count?: number
}

function TabButton({ active, onClick, icon, label, count }: TabButtonProps) {
  return (
    <button
      onClick={onClick}
      style={{
        display: 'flex',
        alignItems: 'center',
        gap: 'var(--space-2)',
        padding: 'var(--space-3) var(--space-4)',
        background: active ? 'var(--admin-surface)' : 'transparent',
        border: 'none',
        borderBottom: `2px solid ${active ? '#3b82f6' : 'transparent'}`,
        color: active ? '#3b82f6' : 'var(--admin-text-muted)',
        fontSize: '0.875rem',
        fontWeight: 600,
        cursor: 'pointer',
        transition: 'all 0.2s',
        whiteSpace: 'nowrap',
      }}
    >
      <span>{icon}</span>
      <span>{label}</span>
      {count !== undefined && count > 0 && (
        <span style={{
          background: active ? '#3b82f6' : 'var(--admin-gray-200)',
          color: active ? 'white' : 'var(--admin-text-muted)',
          padding: '2px 8px',
          borderRadius: 'var(--radius)',
          fontSize: '0.75rem',
        }}>
          {count}
        </span>
      )}
    </button>
  )
}

export default function ActionInboxPage() {
  const { user } = useAdminAuth()
  const [activeTab, setActiveTab] = useState<TabView>('list')
  const [page, setPage] = useState(1)
  const [pageSize, setPageSize] = useState(25)
  const [rows, setRows] = useState<CrmSellerSummaryRow[]>([])
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)
  const [hydrated, setHydrated] = useState(false)

  const [sortField, setSortField] = useState<SellerOpsSortField>(() => asSortField('score'))
  const [sortDirection, setSortDirection] = useState<SellerOpsSortDirection>('desc')

  const [filterStoreOnly, setFilterStoreOnly] = useState<FilterSellerType>('all')
  const [filterStage, setFilterStage] = useState<FilterStage>('all')
  const [filterCooldown, setFilterCooldown] = useState<FilterCooldown>('all')
  const [filterOptedOut, setFilterOptedOut] = useState<FilterBool>('all')
  const [filterHasActiveListings, setFilterHasActiveListings] = useState<FilterHasActiveListings>('all')

  const [drawerOpen, setDrawerOpen] = useState(false)
  const [drawerLoading, setDrawerLoading] = useState(false)
  const [drawerDetails, setDrawerDetails] = useState<SellerOpsDetails | null>(null)
  const [drawerError, setDrawerError] = useState<string | null>(null)

  useEffect(() => {
    const cache = readActionInboxCache()
    if (!cache) {
      setHydrated(true)
      return
    }
    setPage(cache.page || 1)
    setPageSize(cache.pageSize || 25)
    setSortField(asSortField(cache.sortField || 'score'))
    setSortDirection(cache.sortDirection === 'asc' ? 'asc' : 'desc')
    setFilterStoreOnly(asFilterSellerType(cache.filterStoreOnly || 'all'))
    setFilterStage(asFilterStage(cache.filterStage || 'all'))
    setFilterCooldown(asFilterCooldown(cache.filterCooldown || 'all'))
    setFilterOptedOut(asFilterBool(cache.filterOptedOut || 'all'))
    setFilterHasActiveListings(asFilterHasActiveListings(cache.filterHasActiveListings || 'all'))
    setActiveTab(cache.activeTab || 'list')
    setRows(cache.rows)
    setLoading(false)
    setHydrated(true)
  }, [])

  const serverFilters = useMemo<Record<string, unknown>>(() => {
    const f: Record<string, unknown> = {}
    if (filterStoreOnly === 'store') f.is_store = true
    else if (filterStoreOnly === 'particular') f.is_store = false
    if (filterStage !== 'all') f.stage = filterStage
    if (filterOptedOut === 'yes') f.opted_out = true
    else if (filterOptedOut === 'no') f.opted_out = false
    if (filterCooldown === 'active') f.cooldown_active = true
    else if (filterCooldown === 'inactive') f.cooldown_active = false
    if (filterHasActiveListings === 'yes') f.active_only = true
    return f
  }, [filterStoreOnly, filterStage, filterOptedOut, filterCooldown, filterHasActiveListings])

  const [debouncedFilters, setDebouncedFilters] = useState<Record<string, unknown>>(serverFilters)

  useEffect(() => {
    const t = window.setTimeout(() => {
      setPage(1)
      setDebouncedFilters(serverFilters)
    }, 250)
    return () => window.clearTimeout(t)
  }, [serverFilters])

  const sortKey = useMemo(() => buildSortKey(sortField, sortDirection), [sortField, sortDirection])

  const loadInbox = useCallback(async (opts?: { filters?: Record<string, unknown>; page?: number; pageSize?: number; sort?: string }) => {
    setLoading(true)
    setError(null)
    try {
      const result = await fetchSellerOpsInbox({
        page: opts?.page ?? page,
        pageSize: opts?.pageSize ?? pageSize,
        filters: opts?.filters ?? debouncedFilters,
        sort: opts?.sort ?? sortKey,
      })
      setRows(result.rows)
    } catch (err) {
      console.warn('[seller-ops] inbox failed', err)
      setError('No pudimos cargar el CRM. Intentá nuevamente.')
    } finally {
      setLoading(false)
    }
  }, [page, pageSize, debouncedFilters, sortKey])

  useEffect(() => {
    if (!hydrated) return
    const cache = readActionInboxCache()
    if (cache && Date.now() - cache.ts <= ACTION_INBOX_CACHE_TTL_MS) return
    void loadInbox()
  }, [hydrated, loadInbox])

  useEffect(() => {
    if (!hydrated) return
    writeActionInboxCache({
      ts: Date.now(),
      page,
      pageSize,
      sortField,
      sortDirection,
      filterStoreOnly,
      filterStage,
      filterCooldown,
      filterOptedOut,
      filterHasActiveListings,
      activeTab,
      rows,
    })
  }, [
    hydrated,
    page,
    pageSize,
    sortField,
    sortDirection,
    filterStoreOnly,
    filterStage,
    filterCooldown,
    filterOptedOut,
    filterHasActiveListings,
    activeTab,
    rows,
  ])

  const openDrawer = async (sellerId: string) => {
    setDrawerOpen(true)
    setDrawerLoading(true)
    setDrawerError(null)
    setDrawerDetails(null)
    try {
      const details = await fetchSellerOpsDetails(sellerId)
      setDrawerDetails(details)
    } catch (err: any) {
      setDrawerError(err?.message ?? 'No pudimos cargar el seller.')
    } finally {
      setDrawerLoading(false)
    }
  }

  const refreshDrawer = async () => {
    const sellerId = drawerDetails?.sellerId
    if (!sellerId) return
    setDrawerLoading(true)
    setDrawerError(null)
    try {
      const details = await fetchSellerOpsDetails(sellerId)
      setDrawerDetails(details)
      await loadInbox({ filters: serverFilters, sort: sortKey })
    } catch (err: any) {
      setDrawerError(err?.message ?? 'No pudimos refrescar el seller.')
    } finally {
      setDrawerLoading(false)
    }
  }

  const handleAddTask = async (sellerId: string) => {
    const type = window.prompt('Tipo de task (ej: CONTACT_HOT, FOLLOW_UP):', 'CONTACT_HOT')
    if (type === null) return
    const trimmed = type.trim()
    if (!trimmed) return
    try {
      await createSellerTask({
        sellerId,
        type: trimmed,
        priority: 0,
        payload: { source: 'action_inbox' },
      })
      await loadInbox({ filters: serverFilters })
    } catch (err) {
      console.warn('[seller-ops] create task failed', err)
      await openDrawer(sellerId)
    }
  }

  const renderWhatsAppAction = (row: SellerOpsTableRow) => {
    const optedOut = Boolean(row.whatsapp_opt_out)
    const disabledReason = optedOut ? 'Opt-out WhatsApp' : null
    const slugOrId = row.last_lead_listing_slug || row.last_lead_listing_id || null
    const listingUrl = slugOrId ? `https://www.ciclomarket.ar/listing/${encodeURIComponent(String(slugOrId))}` : null
    const message = defaultMessage(row.seller_name || '!', listingUrl)
    const phone = row.whatsapp_number

    return (
      <WhatsAppButton
        phone={phone}
        message={message}
        disabledReason={disabledReason}
        onBeforeOpen={async () => {
          await logOutreachWhatsApp({
            sellerId: row.seller_id,
            messagePreview: message,
            createdBy: user?.id ?? null,
            listingId: row.last_lead_listing_id ?? null,
            meta: {
              source: 'admin_ops',
              url: typeof window !== 'undefined' ? window.location.href : null,
              listing_url: listingUrl,
            },
            cooldownDays: 0,
          })
          // Create Kanban card automatically when WhatsApp is sent
          await ensureKanbanCard({
            sellerId: row.seller_id,
            sellerName: row.seller_name || 'Sin nombre',
            whatsappNumber: row.whatsapp_number || '',
            listingId: row.last_lead_listing_id ?? null,
            listingTitle: row.last_lead_listing_title ?? null,
            stage: 'contacted',
            priority: row.stage === 'at_risk' ? 'high' : 'medium',
            source: 'whatsapp',
          })
          setRows((prev) => prev.map((r) => (r.seller_id === row.seller_id
            ? { ...r, last_outreach_at: new Date().toISOString() }
            : r)))
          void loadInbox({ filters: serverFilters })
        }}
      />
    )
  }

  const handleKanbanCardClick = (card: KanbanCard) => {
    void openDrawer(card.seller_id)
  }

  const handleActionClick = (action: RecommendedAction) => {
    if (action.seller_id) {
      void openDrawer(action.seller_id)
    }
  }

  // Calculate stats
  const stats = useMemo(() => {
    const total = rows.length
    const withActiveListings = rows.filter(r => (r.active_listings_count ?? 0) > 0).length
    const stores = rows.filter(r => r.is_store).length
    const atRisk = rows.filter(r => r.stage === 'at_risk').length
    return { total, withActiveListings, stores, atRisk }
  }, [rows])

  if (!supabaseEnabled) {
    return (
      <FullScreenMessage
        title="Panel deshabilitado"
        message="Configurá VITE_SUPABASE_URL y VITE_SUPABASE_ANON_KEY antes de utilizar el CRM."
      />
    )
  }

  return (
    <div>
      {/* Stats Row */}
      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(180px, 1fr))', gap: 'var(--space-4)', marginBottom: 'var(--space-5)' }}>
        <StatCard label="Total Sellers" value={stats.total} icon="👥" color="blue" />
        <StatCard label="Con Activos" value={stats.withActiveListings} icon="📦" color="green" />
        <StatCard label="Stores" value={stats.stores} icon="🏪" color="amber" />
        <StatCard label="At Risk" value={stats.atRisk} icon="⚠️" color="red" />
      </div>

      {/* Tabs Navigation */}
      <div style={{
        display: 'flex',
        borderBottom: '1px solid var(--admin-border)',
        marginBottom: 'var(--space-5)',
        overflowX: 'auto',
        gap: 'var(--space-1)',
      }}>
        <TabButton
          active={activeTab === 'list'}
          onClick={() => setActiveTab('list')}
          icon="📋"
          label="Lista"
          count={rows.length}
        />
        <TabButton
          active={activeTab === 'kanban'}
          onClick={() => setActiveTab('kanban')}
          icon="📊"
          label="Kanban"
        />
        <TabButton
          active={activeTab === 'actions'}
          onClick={() => setActiveTab('actions')}
          icon="💡"
          label="Acciones Sugeridas"
        />
        <TabButton
          active={activeTab === 'automation'}
          onClick={() => setActiveTab('automation')}
          icon="🤖"
          label="Automatización"
        />
      </div>

      {/* Tab Content */}
      {activeTab === 'list' && (
        <>
          {/* Filters Card */}
          <section className="admin-card" style={{ marginBottom: 'var(--space-5)' }}>
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 'var(--space-4)' }}>
              <div>
                <h3 style={{ margin: 0, fontSize: '1rem', fontWeight: 600, color: 'var(--admin-text)' }}>Filtros</h3>
                <p style={{ margin: 'var(--space-1) 0 0', fontSize: '0.875rem', color: 'var(--admin-text-muted)' }}>
                  Refiná la búsqueda de sellers
                </p>
              </div>
              <button
                type="button"
                onClick={() => loadInbox({ filters: serverFilters })}
                className="btn btn-primary"
              >
                <span>↻</span>
                <span>Actualizar</span>
              </button>
            </div>

            <div className="admin-filters" style={{ margin: 0, border: 'none', padding: 0 }}>
              <div className="admin-filters-group">
                <label className="admin-form-label">Tipo de seller</label>
                <select
                  className="admin-select"
                  value={filterStoreOnly}
                  onChange={(e) => setFilterStoreOnly(asFilterSellerType(e.target.value))}
                >
                  <option value="all">Todos</option>
                  <option value="store">Stores</option>
                  <option value="particular">Particulares</option>
                </select>
              </div>

              <div className="admin-filters-group">
                <label className="admin-form-label">Stage</label>
                <select
                  className="admin-select"
                  value={filterStage}
                  onChange={(e) => setFilterStage(asFilterStage(e.target.value))}
                >
                  <option value="all">Todos</option>
                  <option value="lead">Lead</option>
                  <option value="onboarding">Onboarding</option>
                  <option value="active">Active</option>
                  <option value="at_risk">At risk</option>
                  <option value="churned">Churned</option>
                </select>
              </div>

              <div className="admin-filters-group">
                <label className="admin-form-label">Cooldown</label>
                <select
                  className="admin-select"
                  value={filterCooldown}
                  onChange={(e) => setFilterCooldown(asFilterCooldown(e.target.value))}
                >
                  <option value="all">Todos</option>
                  <option value="active">Activo</option>
                  <option value="inactive">Inactivo</option>
                </select>
              </div>

              <div className="admin-filters-group">
                <label className="admin-form-label">Opt-out WhatsApp</label>
                <select
                  className="admin-select"
                  value={filterOptedOut}
                  onChange={(e) => setFilterOptedOut(asFilterBool(e.target.value))}
                >
                  <option value="all">Todos</option>
                  <option value="no">No (contactables)</option>
                  <option value="yes">Sí (opt-out)</option>
                </select>
              </div>

              <div className="admin-filters-group">
                <label className="admin-form-label">Publicaciones</label>
                <select
                  className="admin-select"
                  value={filterHasActiveListings}
                  onChange={(e) => setFilterHasActiveListings(asFilterHasActiveListings(e.target.value))}
                >
                  <option value="all">Todos</option>
                  <option value="yes">Con activos</option>
                </select>
              </div>
            </div>
          </section>

          {/* Error Message */}
          {error && (
            <div className="admin-card" style={{ borderColor: 'var(--cm-danger)', marginBottom: 'var(--space-4)' }}>
              <div style={{ display: 'flex', alignItems: 'center', gap: 'var(--space-3)', color: 'var(--cm-danger)' }}>
                <span>⚠</span>
                <span>{error}</span>
              </div>
            </div>
          )}

          {/* Table Container */}
          <div className="admin-table-container">
            {loading ? (
              <div className="admin-loading">
                <div className="admin-spinner" />
                <span style={{ marginLeft: 'var(--space-3)' }}>Cargando sellers…</span>
              </div>
            ) : (
              <SellerOpsTable
                rows={rows as SellerOpsTableRow[]}
                onViewSeller={(sellerId) => void openDrawer(sellerId)}
                onAddTask={(sellerId) => void handleAddTask(sellerId)}
                renderWhatsAppAction={renderWhatsAppAction}
                sortField={sortField}
                sortDirection={sortDirection}
                onToggleSort={(field) => {
                  const nextDirection: SellerOpsSortDirection = field === sortField
                    ? (sortDirection === 'asc' ? 'desc' : 'asc')
                    : 'desc'
                  const nextSort = buildSortKey(field, nextDirection)
                  setPage(1)
                  setSortField(field)
                  setSortDirection(nextDirection)
                  void loadInbox({ filters: serverFilters, page: 1, pageSize, sort: nextSort })
                }}
              />
            )}

            {/* Pagination */}
            {!loading && (
              <div className="admin-pagination">
                <div className="admin-pagination-info">
                  Página {page} · {rows.length} resultados
                </div>
                <div className="admin-pagination-actions">
                  <label style={{ fontSize: '0.875rem', color: 'var(--admin-text-muted)' }}>Por página</label>
                  <select
                    className="admin-select"
                    style={{ width: 'auto' }}
                    value={pageSize}
                    onChange={(e) => { setPage(1); setPageSize(Number(e.target.value)) }}
                  >
                    <option value={25}>25</option>
                    <option value={50}>50</option>
                    <option value={100}>100</option>
                  </select>
                  <button
                    type="button"
                    className="btn btn-secondary"
                    onClick={() => setPage((p) => Math.max(1, p - 1))}
                    disabled={page <= 1}
                  >
                    ← Anterior
                  </button>
                  <button
                    type="button"
                    className="btn btn-secondary"
                    onClick={() => setPage((p) => p + 1)}
                    disabled={rows.length < pageSize}
                  >
                    Siguiente →
                  </button>
                </div>
              </div>
            )}
          </div>
        </>
      )}

      {activeTab === 'kanban' && (
        <div style={{ 
          background: 'var(--admin-surface)', 
          borderRadius: 'var(--radius-xl)',
          border: '1px solid var(--admin-border)',
          overflow: 'hidden',
          minHeight: '600px',
        }}>
          <KanbanBoard onCardClick={handleKanbanCardClick} />
        </div>
      )}

      {activeTab === 'actions' && (
        <div className="admin-card">
          <div style={{ marginBottom: 'var(--space-4)' }}>
            <h3 style={{ margin: 0, fontSize: '1.125rem', fontWeight: 700 }}>💡 Acciones Sugeridas</h3>
            <p style={{ margin: 'var(--space-1) 0 0', fontSize: '0.875rem', color: 'var(--admin-text-muted)' }}>
              Inteligencia artificial para priorizar tu tiempo
            </p>
          </div>
          <NextBestAction onActionClick={handleActionClick} />
        </div>
      )}

      {activeTab === 'automation' && (
        <div className="admin-card">
          <AutomationRules />
        </div>
      )}

      {/* Drawer */}
      <SellerDrawer
        open={drawerOpen}
        details={drawerLoading ? null : drawerDetails}
        onClose={() => setDrawerOpen(false)}
        onRefresh={() => void refreshDrawer()}
      />

      {/* Loading Overlay */}
      {drawerOpen && drawerLoading && (
        <div style={{ position: 'fixed', inset: 0, zIndex: 60 }}>
          <LoadingScreen label="Cargando seller…" />
        </div>
      )}

      {/* Error Overlay */}
      {drawerOpen && drawerError && (
        <div style={{ position: 'fixed', inset: 0, zIndex: 60 }}>
          <FullScreenMessage 
            title="No pudimos cargar el seller" 
            message={drawerError} 
            action={<button type="button" className="btn btn-primary" onClick={() => setDrawerOpen(false)}>Cerrar</button>} 
          />
        </div>
      )}
    </div>
  )
}
