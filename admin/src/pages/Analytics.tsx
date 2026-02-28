/**
 * Analytics Page with Impact Dashboard
 */

import { useEffect, useMemo, useState } from 'react'
import { TimeSeriesChart } from '@admin/components/TimeSeriesChart'
import { ImpactDashboard } from '@admin/components/crm/ImpactDashboard'
import {
  summarizeRecentPayments,
  fetchListingQualityMetrics,
  type PaymentsSummary,
  type ListingQualityMetrics,
} from '@admin/services/metrics'
import {
  fetchTopListingsByViews,
  fetchTopListingsByWaClicks,
  type ListingEngagementTop,
} from '@admin/services/engagement'

type AnalyticsTab = 'revenue' | 'engagement' | 'impact'

const currencyArs = new Intl.NumberFormat('es-AR', { style: 'currency', currency: 'ARS', maximumFractionDigits: 0 })
const currencyUsd = new Intl.NumberFormat('es-AR', { style: 'currency', currency: 'USD', maximumFractionDigits: 0 })
const percentFormatter = new Intl.NumberFormat('es-AR', { maximumFractionDigits: 1 })
const numberFormatter = new Intl.NumberFormat('es-AR')

const planLabels: Record<string, string> = {
  free: 'Free',
  basic: 'Básico',
  pro: 'Pro',
  premium: 'Premium',
  sin_plan: 'Sin dato',
}

function planLabel(raw: string): string {
  const key = raw.toLowerCase()
  return planLabels[key] || key.charAt(0).toUpperCase() + key.slice(1)
}

function formatCtr(views: number, waClicks: number): string {
  if (!views) return '0%'
  return `${percentFormatter.format((waClicks / views) * 100)}%`
}

interface StatCardProps {
  label: string
  value: string
  subvalue?: string
  icon: string
  color: 'blue' | 'green' | 'amber' | 'purple'
}

function StatCard({ label, value, subvalue, icon, color }: StatCardProps) {
  const colorMap = {
    blue: { bg: '#eff6ff', text: '#1d4ed8', border: '#bfdbfe' },
    green: { bg: '#ecfdf5', text: '#047857', border: '#a7f3d0' },
    amber: { bg: '#fffbeb', text: '#b45309', border: '#fcd34d' },
    purple: { bg: '#f5f3ff', text: '#6d28d9', border: '#c4b5fd' },
  }
  const colors = colorMap[color]

  return (
    <div
      className="admin-card"
      style={{
        display: 'flex',
        alignItems: 'center',
        gap: 'var(--space-4)',
      }}
    >
      <div
        style={{
          width: 48,
          height: 48,
          borderRadius: 'var(--radius-lg)',
          background: colors.bg,
          display: 'grid',
          placeItems: 'center',
          fontSize: '1.5rem',
          border: `1px solid ${colors.border}`,
        }}
      >
        {icon}
      </div>
      <div>
        <div style={{ fontSize: '0.75rem', color: 'var(--admin-text-muted)', textTransform: 'uppercase', letterSpacing: '0.05em' }}>
          {label}
        </div>
        <div style={{ fontSize: '1.25rem', fontWeight: 700, color: colors.text }}>
          {value}
        </div>
        {subvalue && (
          <div style={{ fontSize: '0.75rem', color: 'var(--admin-text-muted)' }}>
            {subvalue}
          </div>
        )}
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
}

function TabButton({ active, onClick, icon, label }: TabButtonProps) {
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
    </button>
  )
}

export default function AnalyticsPage() {
  const [activeTab, setActiveTab] = useState<AnalyticsTab>('revenue')
  const [payments, setPayments] = useState<PaymentsSummary | null>(null)
  const [listingQuality, setListingQuality] = useState<ListingQualityMetrics | null>(null)
  const [topViews, setTopViews] = useState<ListingEngagementTop[]>([])
  const [topWa, setTopWa] = useState<ListingEngagementTop[]>([])
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)

  useEffect(() => {
    let alive = true
    setLoading(true)
    setError(null)

    Promise.all([
      summarizeRecentPayments(90),
      fetchListingQualityMetrics(),
      fetchTopListingsByViews(30, 5),
      fetchTopListingsByWaClicks(30, 5),
    ])
      .then(([paymentsSummary, qualitySummary, topByViews, topByWa]) => {
        if (!alive) return
        setPayments(paymentsSummary)
        setListingQuality(qualitySummary)
        setTopViews(topByViews)
        setTopWa(topByWa)
      })
      .catch((err) => {
        console.warn('[analytics] load failed', err)
        if (alive) setError('No pudimos cargar la analítica. Intentá nuevamente.')
      })
      .finally(() => {
        if (alive) setLoading(false)
      })

    return () => { alive = false }
  }, [])

  const revenueSeries = useMemo(() => (
    payments
      ? payments.byDay.map((row) => ({ date: row.day, value: row.total }))
      : []
  ), [payments])

  const checkoutSeries = useMemo(() => (
    payments
      ? payments.byDay.map((row) => ({ date: row.day, value: row.count }))
      : []
  ), [payments])

  const planBreakdown = useMemo(() => (
    payments
      ? Object.entries(payments.totalByPlan)
        .map(([plan, amount]) => ({ plan, label: planLabel(plan), amount }))
        .sort((a, b) => b.amount - a.amount)
      : []
  ), [payments])

  return (
    <div>
      {/* Tabs Navigation */}
      <div style={{
        display: 'flex',
        borderBottom: '1px solid var(--admin-border)',
        marginBottom: 'var(--space-5)',
        overflowX: 'auto',
        gap: 'var(--space-1)',
      }}>
        <TabButton
          active={activeTab === 'revenue'}
          onClick={() => setActiveTab('revenue')}
          icon="💰"
          label="Ingresos"
        />
        <TabButton
          active={activeTab === 'engagement'}
          onClick={() => setActiveTab('engagement')}
          icon="📈"
          label="Engagement"
        />
        <TabButton
          active={activeTab === 'impact'}
          onClick={() => setActiveTab('impact')}
          icon="🎯"
          label="Impacto CM"
        />
      </div>

      {activeTab === 'revenue' && (
        <div>
          {/* Stats Row */}
          <section className="admin-grid admin-grid-3" style={{ marginBottom: 'var(--space-5)' }}>
            <StatCard
              label="Total ARS (90d)"
              value={payments ? currencyArs.format(payments.totalByCurrency['ARS'] || 0) : '…'}
              icon="💰"
              color="green"
            />
            <StatCard
              label="Total USD (90d)"
              value={payments ? currencyUsd.format(payments.totalByCurrency['USD'] || 0) : '…'}
              icon="💵"
              color="amber"
            />
            <StatCard
              label="Checkouts"
              value={payments ? numberFormatter.format(payments.count) : '…'}
              subvalue="Últimos 90 días"
              icon="🛒"
              color="blue"
            />
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

          {/* Charts */}
          <section className="admin-grid admin-grid-2" style={{ marginBottom: 'var(--space-5)' }}>
            <article className="admin-card">
              <div className="admin-card-header">
                <div>
                  <h3 className="admin-card-title">Ingresos Diarios</h3>
                  <p style={{ margin: 0, fontSize: '0.875rem', color: 'var(--admin-text-muted)' }}>Últimos 90 días · ARS</p>
                </div>
              </div>
              <TimeSeriesChart
                data={revenueSeries}
                height={240}
                stroke="#3b82f6"
                fill="rgba(59, 130, 246, 0.1)"
                yFormatter={(value) => currencyArs.format(value)}
                emptyLabel={loading ? 'Cargando…' : 'Sin datos'}
              />
            </article>
            <article className="admin-card">
              <div className="admin-card-header">
                <div>
                  <h3 className="admin-card-title">Checkouts Confirmados</h3>
                  <p style={{ margin: 0, fontSize: '0.875rem', color: 'var(--admin-text-muted)' }}>Órdenes completadas por día</p>
                </div>
              </div>
              <TimeSeriesChart
                data={checkoutSeries}
                height={240}
                stroke="#10b981"
                fill="rgba(16, 185, 129, 0.1)"
                yFormatter={(value) => numberFormatter.format(Math.round(value))}
                emptyLabel={loading ? 'Cargando…' : 'Sin datos'}
              />
            </article>
          </section>

          {/* Plan Breakdown */}
          <section className="admin-card" style={{ marginBottom: 'var(--space-5)' }}>
            <div className="admin-card-header">
              <div>
                <h3 className="admin-card-title">Distribución por Plan</h3>
                <p style={{ margin: 0, fontSize: '0.875rem', color: 'var(--admin-text-muted)' }}>Ingresos segmentados por tipo de plan</p>
              </div>
            </div>
            {planBreakdown.length ? (
              <div style={{ display: 'grid', gap: 'var(--space-3)', gridTemplateColumns: 'repeat(auto-fit, minmax(200px, 1fr))' }}>
                {planBreakdown.map((plan) => (
                  <div
                    key={plan.plan}
                    style={{
                      padding: 'var(--space-4)',
                      background: 'var(--admin-gray-50)',
                      borderRadius: 'var(--radius-lg)',
                      border: '1px solid var(--admin-border)',
                    }}
                  >
                    <div style={{ fontSize: '0.75rem', color: 'var(--admin-text-muted)', textTransform: 'uppercase', letterSpacing: '0.05em' }}>
                      {plan.label}
                    </div>
                    <div style={{ fontSize: '1.125rem', fontWeight: 700, color: 'var(--admin-text)', marginTop: 'var(--space-1)' }}>
                      {currencyArs.format(plan.amount)}
                    </div>
                  </div>
                ))}
              </div>
            ) : (
              <p style={{ color: 'var(--admin-text-muted)' }}>{loading ? 'Cargando…' : 'Sin datos disponibles.'}</p>
            )}
          </section>
        </div>
      )}

      {activeTab === 'engagement' && (
        <div>
          {/* Listing Quality */}
          <section className="admin-card" style={{ marginBottom: 'var(--space-5)' }}>
            <div className="admin-card-header">
              <div>
                <h3 className="admin-card-title">Calidad de Publicaciones</h3>
                <p style={{ margin: 0, fontSize: '0.875rem', color: 'var(--admin-text-muted)' }}>Métricas de los últimos 30 días</p>
              </div>
            </div>
            <div style={{ display: 'grid', gap: 'var(--space-4)', gridTemplateColumns: 'repeat(auto-fit, minmax(200px, 1fr))' }}>
              <div
                style={{
                  padding: 'var(--space-4)',
                  background: '#eff6ff',
                  borderRadius: 'var(--radius-lg)',
                  border: '1px solid #bfdbfe',
                }}
              >
                <div style={{ fontSize: '0.75rem', color: '#1e40af', textTransform: 'uppercase', letterSpacing: '0.05em' }}>
                  Promedio de vistas
                </div>
                <div style={{ fontSize: '1.5rem', fontWeight: 700, color: '#1d4ed8', marginTop: 'var(--space-1)' }}>
                  {listingQuality ? numberFormatter.format(Math.round(listingQuality.avgViews30d)) : '…'}
                </div>
              </div>
              <div
                style={{
                  padding: 'var(--space-4)',
                  background: '#ecfdf5',
                  borderRadius: 'var(--radius-lg)',
                  border: '1px solid #a7f3d0',
                }}
              >
                <div style={{ fontSize: '0.75rem', color: '#065f46', textTransform: 'uppercase', letterSpacing: '0.05em' }}>
                  Promedio de clics WA
                </div>
                <div style={{ fontSize: '1.5rem', fontWeight: 700, color: '#047857', marginTop: 'var(--space-1)' }}>
                  {listingQuality ? numberFormatter.format(Math.round(listingQuality.avgWaClicks30d)) : '…'}
                </div>
              </div>
              <div
                style={{
                  padding: 'var(--space-4)',
                  background: '#fffbeb',
                  borderRadius: 'var(--radius-lg)',
                  border: '1px solid #fcd34d',
                }}
              >
                <div style={{ fontSize: '0.75rem', color: '#92400e', textTransform: 'uppercase', letterSpacing: '0.05em' }}>
                  Publicaciones monitorizadas
                </div>
                <div style={{ fontSize: '1.5rem', fontWeight: 700, color: '#b45309', marginTop: 'var(--space-1)' }}>
                  {listingQuality ? numberFormatter.format(listingQuality.listingsTracked) : '…'}
                </div>
              </div>
            </div>
          </section>

          {/* Top Listings */}
          <section className="admin-grid admin-grid-2">
            <article className="admin-card">
              <div className="admin-card-header">
                <div>
                  <h3 className="admin-card-title">Top por Vistas</h3>
                  <p style={{ margin: 0, fontSize: '0.875rem', color: 'var(--admin-text-muted)' }}>Últimos 30 días</p>
                </div>
              </div>
              <div style={{ overflowX: 'auto' }}>
                <table className="admin-table">
                  <thead>
                    <tr>
                      <th>#</th>
                      <th>Publicación</th>
                      <th style={{ textAlign: 'right' }}>Vistas</th>
                      <th style={{ textAlign: 'right' }}>CTR</th>
                    </tr>
                  </thead>
                  <tbody>
                    {loading ? (
                      <tr><td colSpan={4} className="cell-muted" style={{ textAlign: 'center' }}>Cargando…</td></tr>
                    ) : topViews.length ? (
                      topViews.map((row, index) => (
                        <tr key={row.id}>
                          <td className="cell-muted">{index + 1}</td>
                          <td className="cell-strong">{row.title}</td>
                          <td className="cell-strong" style={{ textAlign: 'right' }}>{numberFormatter.format(row.views)}</td>
                          <td className="cell-muted" style={{ textAlign: 'right' }}>{formatCtr(row.views, row.waClicks)}</td>
                        </tr>
                      ))
                    ) : (
                      <tr><td colSpan={4} className="cell-muted" style={{ textAlign: 'center' }}>Sin datos</td></tr>
                    )}
                  </tbody>
                </table>
              </div>
            </article>

            <article className="admin-card">
              <div className="admin-card-header">
                <div>
                  <h3 className="admin-card-title">Top por Clics WhatsApp</h3>
                  <p style={{ margin: 0, fontSize: '0.875rem', color: 'var(--admin-text-muted)' }}>Últimos 30 días</p>
                </div>
              </div>
              <div style={{ overflowX: 'auto' }}>
                <table className="admin-table">
                  <thead>
                    <tr>
                      <th>#</th>
                      <th>Publicación</th>
                      <th style={{ textAlign: 'right' }}>Clics</th>
                      <th style={{ textAlign: 'right' }}>CTR</th>
                    </tr>
                  </thead>
                  <tbody>
                    {loading ? (
                      <tr><td colSpan={4} className="cell-muted" style={{ textAlign: 'center' }}>Cargando…</td></tr>
                    ) : topWa.length ? (
                      topWa.map((row, index) => (
                        <tr key={row.id}>
                          <td className="cell-muted">{index + 1}</td>
                          <td className="cell-strong">{row.title}</td>
                          <td className="cell-strong" style={{ textAlign: 'right' }}>{numberFormatter.format(row.waClicks)}</td>
                          <td className="cell-muted" style={{ textAlign: 'right' }}>{formatCtr(row.views, row.waClicks)}</td>
                        </tr>
                      ))
                    ) : (
                      <tr><td colSpan={4} className="cell-muted" style={{ textAlign: 'center' }}>Sin datos</td></tr>
                    )}
                  </tbody>
                </table>
              </div>
            </article>
          </section>
        </div>
      )}

      {activeTab === 'impact' && <ImpactDashboard />}
    </div>
  )
}
