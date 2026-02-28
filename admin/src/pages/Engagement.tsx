import { useEffect, useMemo, useState } from 'react'
import { TimeSeriesChart } from '@admin/components/TimeSeriesChart'
import {
  fetchDailyEvents,
  fetchTopListingsByViews,
  fetchTopListingsByWaClicks,
  fetchTopStoresByViews,
  fetchStoreEngagementSummary,
  computeComparatives,
  type DailyEventsByType,
  type ListingEngagementTop,
  type StoreEngagementTop,
} from '@admin/services/engagement'

type Period = 7 | 30 | 90

const numberFormatter = new Intl.NumberFormat('es-AR')
const percentFormatter = new Intl.NumberFormat('es-AR', { maximumFractionDigits: 1 })

function toSeries(points: Array<{ day: string; total: number }>, period: number) {
  return points.slice(-period).map((p) => ({ date: p.day, value: p.total }))
}

function formatCtr(views: number, waClicks: number): string {
  if (!views) return '0%'
  return `${percentFormatter.format((waClicks / views) * 100)}%`
}

interface StatCardProps {
  label: string
  value: number
  delta: number
  pct: number
  icon: string
  color: 'blue' | 'green' | 'amber' | 'red'
}

function StatCard({ label, value, delta, pct, icon, color }: StatCardProps) {
  const colorMap = {
    blue: { bg: '#eff6ff', icon: '#3b82f6' },
    green: { bg: '#ecfdf5', icon: '#10b981' },
    amber: { bg: '#fffbeb', icon: '#f59e0b' },
    red: { bg: '#fef2f2', icon: '#ef4444' },
  }
  const colors = colorMap[color]
  const isPositive = delta >= 0

  return (
    <div className="admin-card">
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', marginBottom: 'var(--space-3)' }}>
        <div
          style={{
            width: 40,
            height: 40,
            borderRadius: 'var(--radius-lg)',
            background: colors.bg,
            display: 'grid',
            placeItems: 'center',
            fontSize: '1.25rem',
          }}
        >
          {icon}
        </div>
        <div
          style={{
            display: 'flex',
            alignItems: 'center',
            gap: 'var(--space-1)',
            padding: 'var(--space-1) var(--space-2)',
            borderRadius: 'var(--radius)',
            background: isPositive ? '#d1fae5' : '#fee2e2',
            color: isPositive ? '#065f46' : '#991b1b',
            fontSize: '0.75rem',
            fontWeight: 600,
          }}
        >
          {isPositive ? '↑' : '↓'} {percentFormatter.format(Math.abs(pct))}%
        </div>
      </div>
      <div style={{ fontSize: '0.75rem', color: 'var(--admin-text-muted)', textTransform: 'uppercase', letterSpacing: '0.05em' }}>
        {label}
      </div>
      <div style={{ fontSize: '1.5rem', fontWeight: 700, color: 'var(--admin-text)', marginTop: 'var(--space-1)' }}>
        {numberFormatter.format(value)}
      </div>
      <div style={{ fontSize: '0.75rem', color: 'var(--admin-text-muted)', marginTop: 'var(--space-1)' }}>
        Prev: {numberFormatter.format(value - delta)}
      </div>
    </div>
  )
}

export default function EngagementPage() {
  const [period, setPeriod] = useState<Period>(30)
  const [events, setEvents] = useState<DailyEventsByType>({ site: [], listing: [], store: [], wa: [] })
  const [topViews, setTopViews] = useState<ListingEngagementTop[]>([])
  const [topWa, setTopWa] = useState<ListingEngagementTop[]>([])
  const [topStores, setTopStores] = useState<StoreEngagementTop[]>([])
  const [storeEngagement, setStoreEngagement] = useState<StoreEngagementTop[]>([])
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)

  useEffect(() => {
    let alive = true
    setLoading(true)
    setError(null)
    const daysRequested = period * 2
    Promise.all([
      fetchDailyEvents(daysRequested),
      fetchTopListingsByViews(period, 10),
      fetchTopListingsByWaClicks(period, 10),
      fetchTopStoresByViews(period, 10),
      fetchStoreEngagementSummary(period, 40),
    ])
      .then(([ev, tv, twa, ts, storeSummary]) => {
        if (!alive) return
        setEvents(ev)
        setTopViews(tv)
        setTopWa(twa)
        setTopStores(ts)
        setStoreEngagement(storeSummary)
      })
      .catch((err) => {
        console.warn('[engagement] load failed', err)
        if (alive) setError('No pudimos cargar engagement. Intentá nuevamente.')
      })
      .finally(() => { if (alive) setLoading(false) })
    return () => { alive = false }
  }, [period])

  const siteSeries = useMemo(() => toSeries(events.site, period), [events.site, period])
  const listingSeries = useMemo(() => toSeries(events.listing, period), [events.listing, period])
  const storeSeries = useMemo(() => toSeries(events.store, period), [events.store, period])
  const waSeries = useMemo(() => toSeries(events.wa, period), [events.wa, period])
  const comparatives = useMemo(() => computeComparatives(events, period), [events, period])

  return (
    <div>
      {/* Header with Period Selector */}
      <div className="admin-card" style={{ marginBottom: 'var(--space-5)' }}>
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', gap: 'var(--space-4)', flexWrap: 'wrap' }}>
          <div>
            <h3 style={{ margin: 0, fontSize: '1rem', fontWeight: 600, color: 'var(--admin-text)' }}>Métricas de Engagement</h3>
            <p style={{ margin: 'var(--space-1) 0 0', fontSize: '0.875rem', color: 'var(--admin-text-muted)' }}>
              Seguimiento de vistas, clics y tiendas oficiales
            </p>
          </div>
          <div style={{ display: 'flex', alignItems: 'center', gap: 'var(--space-3)' }}>
            <label style={{ fontSize: '0.875rem', color: 'var(--admin-text-muted)' }}>Período</label>
            <div className="admin-tabs">
              {[7, 30, 90].map((p) => (
                <button
                  key={p}
                  type="button"
                  onClick={() => setPeriod(p as Period)}
                  className={`admin-tab ${period === p ? 'active' : ''}`}
                >
                  {p} días
                </button>
              ))}
            </div>
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

      {/* Stats Row */}
      <section className="admin-grid admin-grid-4" style={{ marginBottom: 'var(--space-5)' }}>
        <StatCard
          label="Site Views"
          value={comparatives.site.current}
          delta={comparatives.site.delta}
          pct={comparatives.site.pct}
          icon="🌐"
          color="blue"
        />
        <StatCard
          label="Listing Views"
          value={comparatives.listing.current}
          delta={comparatives.listing.delta}
          pct={comparatives.listing.pct}
          icon="📄"
          color="green"
        />
        <StatCard
          label="Store Views"
          value={comparatives.store.current}
          delta={comparatives.store.delta}
          pct={comparatives.store.pct}
          icon="🏪"
          color="amber"
        />
        <StatCard
          label="WA Clicks"
          value={comparatives.wa.current}
          delta={comparatives.wa.delta}
          pct={comparatives.wa.pct}
          icon="💬"
          color="green"
        />
      </section>

      {/* Charts */}
      <section className="admin-grid admin-grid-2" style={{ marginBottom: 'var(--space-5)' }}>
        <article className="admin-card">
          <div className="admin-card-header">
            <div>
              <h3 className="admin-card-title">Site Views</h3>
              <p style={{ margin: 0, fontSize: '0.875rem', color: 'var(--admin-text-muted)' }}>Vistas al sitio</p>
            </div>
          </div>
          <TimeSeriesChart
            data={siteSeries}
            height={220}
            stroke="#3b82f6"
            fill="rgba(59, 130, 246, 0.1)"
            emptyLabel={loading ? 'Cargando…' : 'Sin datos'}
          />
        </article>
        <article className="admin-card">
          <div className="admin-card-header">
            <div>
              <h3 className="admin-card-title">Listing Views</h3>
              <p style={{ margin: 0, fontSize: '0.875rem', color: 'var(--admin-text-muted)' }}>Vistas a publicaciones</p>
            </div>
          </div>
          <TimeSeriesChart
            data={listingSeries}
            height={220}
            stroke="#10b981"
            fill="rgba(16, 185, 129, 0.1)"
            emptyLabel={loading ? 'Cargando…' : 'Sin datos'}
          />
        </article>
        <article className="admin-card">
          <div className="admin-card-header">
            <div>
              <h3 className="admin-card-title">Store Views</h3>
              <p style={{ margin: 0, fontSize: '0.875rem', color: 'var(--admin-text-muted)' }}>Vistas a tiendas</p>
            </div>
          </div>
          <TimeSeriesChart
            data={storeSeries}
            height={220}
            stroke="#f59e0b"
            fill="rgba(245, 158, 11, 0.1)"
            emptyLabel={loading ? 'Cargando…' : 'Sin datos'}
          />
        </article>
        <article className="admin-card">
          <div className="admin-card-header">
            <div>
              <h3 className="admin-card-title">WA Clicks</h3>
              <p style={{ margin: 0, fontSize: '0.875rem', color: 'var(--admin-text-muted)' }}>Clics a WhatsApp</p>
            </div>
          </div>
          <TimeSeriesChart
            data={waSeries}
            height={220}
            stroke="#10b981"
            fill="rgba(16, 185, 129, 0.1)"
            emptyLabel={loading ? 'Cargando…' : 'Sin datos'}
          />
        </article>
      </section>

      {/* Top Listings Tables */}
      <section className="admin-grid admin-grid-2" style={{ marginBottom: 'var(--space-5)' }}>
        <article className="admin-card">
          <div className="admin-card-header">
            <div>
              <h3 className="admin-card-title">Top por Vistas</h3>
              <p style={{ margin: 0, fontSize: '0.875rem', color: 'var(--admin-text-muted)' }}>Publicaciones más visitadas</p>
            </div>
          </div>
          <div style={{ overflowX: 'auto' }}>
            <table className="admin-table">
              <thead>
                <tr>
                  <th>#</th>
                  <th>Publicación</th>
                  <th style={{ textAlign: 'right' }}>Vistas</th>
                  <th style={{ textAlign: 'right' }}>WA</th>
                  <th style={{ textAlign: 'right' }}>CTR</th>
                </tr>
              </thead>
              <tbody>
                {loading ? (
                  <tr><td colSpan={5} className="cell-muted" style={{ textAlign: 'center' }}>Cargando…</td></tr>
                ) : topViews.length ? (
                  topViews.map((row, index) => (
                    <tr key={row.id}>
                      <td className="cell-muted">{index + 1}</td>
                      <td className="cell-strong">{row.title}</td>
                      <td className="cell-strong" style={{ textAlign: 'right' }}>{numberFormatter.format(row.views)}</td>
                      <td style={{ textAlign: 'right' }}>{numberFormatter.format(row.waClicks)}</td>
                      <td className="cell-muted" style={{ textAlign: 'right' }}>{formatCtr(row.views, row.waClicks)}</td>
                    </tr>
                  ))
                ) : (
                  <tr><td colSpan={5} className="cell-muted" style={{ textAlign: 'center' }}>Sin datos</td></tr>
                )}
              </tbody>
            </table>
          </div>
        </article>

        <article className="admin-card">
          <div className="admin-card-header">
            <div>
              <h3 className="admin-card-title">Top por Clics WhatsApp</h3>
              <p style={{ margin: 0, fontSize: '0.875rem', color: 'var(--admin-text-muted)' }}>Más interacciones directas</p>
            </div>
          </div>
          <div style={{ overflowX: 'auto' }}>
            <table className="admin-table">
              <thead>
                <tr>
                  <th>#</th>
                  <th>Publicación</th>
                  <th style={{ textAlign: 'right' }}>Clics</th>
                  <th style={{ textAlign: 'right' }}>Vistas</th>
                  <th style={{ textAlign: 'right' }}>CTR</th>
                </tr>
              </thead>
              <tbody>
                {loading ? (
                  <tr><td colSpan={5} className="cell-muted" style={{ textAlign: 'center' }}>Cargando…</td></tr>
                ) : topWa.length ? (
                  topWa.map((row, index) => (
                    <tr key={row.id}>
                      <td className="cell-muted">{index + 1}</td>
                      <td className="cell-strong">{row.title}</td>
                      <td className="cell-strong" style={{ textAlign: 'right' }}>{numberFormatter.format(row.waClicks)}</td>
                      <td style={{ textAlign: 'right' }}>{numberFormatter.format(row.views)}</td>
                      <td className="cell-muted" style={{ textAlign: 'right' }}>{formatCtr(row.views, row.waClicks)}</td>
                    </tr>
                  ))
                ) : (
                  <tr><td colSpan={5} className="cell-muted" style={{ textAlign: 'center' }}>Sin datos</td></tr>
                )}
              </tbody>
            </table>
          </div>
        </article>
      </section>

      {/* Store Engagement */}
      <section className="admin-card">
        <div className="admin-card-header">
          <div>
            <h3 className="admin-card-title">Engagement por Tienda Oficial</h3>
            <p style={{ margin: 0, fontSize: '0.875rem', color: 'var(--admin-text-muted)' }}>Totales acumulados del período</p>
          </div>
        </div>
        <div style={{ overflowX: 'auto' }}>
          <table className="admin-table">
            <thead>
              <tr>
                <th>#</th>
                <th>Tienda</th>
                <th style={{ textAlign: 'right' }}>Vistas tienda</th>
                <th style={{ textAlign: 'right' }}>Vistas avisos</th>
                <th style={{ textAlign: 'right' }}>Clics WA</th>
                <th style={{ textAlign: 'right' }}>CTR</th>
              </tr>
            </thead>
            <tbody>
              {loading ? (
                <tr><td colSpan={6} className="cell-muted" style={{ textAlign: 'center' }}>Cargando…</td></tr>
              ) : storeEngagement.length ? (
                storeEngagement.map((store, index) => (
                  <tr key={store.id}>
                    <td className="cell-muted">{index + 1}</td>
                    <td className="cell-strong">{store.name}</td>
                    <td style={{ textAlign: 'right' }}>{numberFormatter.format(store.storeViews)}</td>
                    <td style={{ textAlign: 'right' }}>{numberFormatter.format(store.listingViews)}</td>
                    <td className="cell-strong" style={{ textAlign: 'right' }}>{numberFormatter.format(store.waClicks)}</td>
                    <td className="cell-muted" style={{ textAlign: 'right' }}>{formatCtr(store.listingViews, store.waClicks)}</td>
                  </tr>
                ))
              ) : (
                <tr><td colSpan={6} className="cell-muted" style={{ textAlign: 'center' }}>Sin datos</td></tr>
              )}
            </tbody>
          </table>
        </div>
      </section>
    </div>
  )
}
