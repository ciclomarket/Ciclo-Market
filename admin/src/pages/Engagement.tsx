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
      <section className="admin-card" style={{ marginBottom: '1rem' }}>
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', gap: '1rem', flexWrap: 'wrap' }}>
          <div>
            <h3>Engagement</h3>
            <p>Seguimiento de vistas, clics y tiendas oficiales.</p>
          </div>
          <div>
            <label style={{ fontSize: '0.85rem', color: '#9fb3c9', marginRight: '0.5rem' }}>Período</label>
            <select
              value={period}
              onChange={(e) => setPeriod(Number(e.target.value) as Period)}
              style={{ background: 'rgba(15,30,46,0.8)', border: '1px solid rgba(255,255,255,0.1)', color: '#f2f6fb', padding: '0.45rem 0.7rem', borderRadius: '10px' }}
            >
              <option value={7}>7 días</option>
              <option value={30}>30 días</option>
              <option value={90}>90 días</option>
            </select>
          </div>
        </div>
      </section>

      {error ? (
        <div className="admin-card" style={{ borderColor: 'rgba(255,107,107,0.4)', color: '#ff8f8f', marginBottom: '1.5rem' }}>{error}</div>
      ) : null}

      <section className="admin-grid" style={{ marginBottom: '1.5rem' }}>
        {[
          { label: 'Site Views', data: comparatives.site },
          { label: 'Listing Views', data: comparatives.listing },
          { label: 'Store Views', data: comparatives.store },
          { label: 'WA Clicks', data: comparatives.wa },
        ].map((card) => (
          <article key={card.label} className="admin-card">
            <h3>{card.label}</h3>
            <div style={{ marginTop: '0.5rem', display: 'flex', alignItems: 'baseline', gap: '0.6rem' }}>
              <div style={{ fontSize: '1.6rem', fontWeight: 700, color: '#f2f6fb' }}>{numberFormatter.format(card.data.current)}</div>
              <div style={{ fontSize: '0.9rem', color: card.data.delta >= 0 ? '#6fff9d' : '#ff8f8f' }}>
                {card.data.delta >= 0 ? '▲' : '▼'} {percentFormatter.format(Math.abs(card.data.pct))}% vs {period}d previos
              </div>
            </div>
            <div style={{ marginTop: '0.25rem', fontSize: '0.85rem', color: '#9fb3c9' }}>Prev: {numberFormatter.format(card.data.previous)}</div>
          </article>
        ))}
      </section>

      <section className="admin-grid" style={{ marginBottom: '1.5rem' }}>
        <article className="admin-card">
          <h3>Site Views</h3>
          <TimeSeriesChart
            data={siteSeries}
            height={220}
            stroke="#61dfff"
            fill="rgba(97,223,255,0.18)"
            emptyLabel={loading ? 'Cargando…' : 'Sin datos'}
          />
        </article>
        <article className="admin-card">
          <h3>Listing Views</h3>
          <TimeSeriesChart
            data={listingSeries}
            height={220}
            stroke="#6fff9d"
            fill="rgba(111,255,157,0.18)"
            emptyLabel={loading ? 'Cargando…' : 'Sin datos'}
          />
        </article>
        <article className="admin-card">
          <h3>Store Views</h3>
          <TimeSeriesChart
            data={storeSeries}
            height={220}
            stroke="#ffd166"
            fill="rgba(255,209,102,0.18)"
            emptyLabel={loading ? 'Cargando…' : 'Sin datos'}
          />
        </article>
        <article className="admin-card">
          <h3>WA Clicks</h3>
          <TimeSeriesChart
            data={waSeries}
            height={220}
            stroke="#ff8f8f"
            fill="rgba(255,143,143,0.18)"
            emptyLabel={loading ? 'Cargando…' : 'Sin datos'}
          />
        </article>
      </section>

      <section className="admin-grid" style={{ marginBottom: '1.5rem' }}>
        <article className="admin-card">
          <h3>Top publicaciones por vistas</h3>
          <div style={{ marginTop: '0.75rem', overflowX: 'auto' }}>
            <table style={{ width: '100%', borderCollapse: 'collapse', minWidth: '560px' }}>
              <thead>
                <tr style={{ background: 'rgba(12,23,35,0.9)', textAlign: 'left', color: '#9fb3c9', fontSize: '0.78rem', letterSpacing: '0.08em' }}>
                  <th style={{ padding: '0.6rem 0.9rem' }}>#</th>
                  <th style={{ padding: '0.6rem 0.9rem' }}>Publicación</th>
                  <th style={{ padding: '0.6rem 0.9rem' }}>Vistas</th>
                  <th style={{ padding: '0.6rem 0.9rem' }}>Clics WA</th>
                  <th style={{ padding: '0.6rem 0.9rem' }}>CTR</th>
                </tr>
              </thead>
              <tbody>
                {loading ? (
                  <tr><td colSpan={5} style={{ padding: '1rem', color: '#92a5bc', textAlign: 'center' }}>Cargando…</td></tr>
                ) : topViews.length ? (
                  topViews.map((row, index) => (
                    <tr key={row.id} style={{ borderTop: '1px solid rgba(255,255,255,0.06)' }}>
                      <td style={{ padding: '0.7rem 0.9rem', color: '#7f92ab' }}>{index + 1}</td>
                      <td style={{ padding: '0.7rem 0.9rem', color: '#c2d5eb' }}>{row.title}</td>
                      <td style={{ padding: '0.7rem 0.9rem', color: '#c2d5eb' }}>{numberFormatter.format(row.views)}</td>
                      <td style={{ padding: '0.7rem 0.9rem', color: '#c2d5eb' }}>{numberFormatter.format(row.waClicks)}</td>
                      <td style={{ padding: '0.7rem 0.9rem', color: '#c2d5eb' }}>{formatCtr(row.views, row.waClicks)}</td>
                    </tr>
                  ))
                ) : (
                  <tr><td colSpan={5} style={{ padding: '1rem', color: '#92a5bc', textAlign: 'center' }}>Sin datos</td></tr>
                )}
              </tbody>
            </table>
          </div>
        </article>

        <article className="admin-card">
          <h3>Top publicaciones por clics de WhatsApp</h3>
          <div style={{ marginTop: '0.75rem', overflowX: 'auto' }}>
            <table style={{ width: '100%', borderCollapse: 'collapse', minWidth: '560px' }}>
              <thead>
                <tr style={{ background: 'rgba(12,23,35,0.9)', textAlign: 'left', color: '#9fb3c9', fontSize: '0.78rem', letterSpacing: '0.08em' }}>
                  <th style={{ padding: '0.6rem 0.9rem' }}>#</th>
                  <th style={{ padding: '0.6rem 0.9rem' }}>Publicación</th>
                  <th style={{ padding: '0.6rem 0.9rem' }}>Clics WA</th>
                  <th style={{ padding: '0.6rem 0.9rem' }}>Vistas</th>
                  <th style={{ padding: '0.6rem 0.9rem' }}>CTR</th>
                </tr>
              </thead>
              <tbody>
                {loading ? (
                  <tr><td colSpan={5} style={{ padding: '1rem', color: '#92a5bc', textAlign: 'center' }}>Cargando…</td></tr>
                ) : topWa.length ? (
                  topWa.map((row, index) => (
                    <tr key={row.id} style={{ borderTop: '1px solid rgba(255,255,255,0.06)' }}>
                      <td style={{ padding: '0.7rem 0.9rem', color: '#7f92ab' }}>{index + 1}</td>
                      <td style={{ padding: '0.7rem 0.9rem', color: '#c2d5eb' }}>{row.title}</td>
                      <td style={{ padding: '0.7rem 0.9rem', color: '#c2d5eb' }}>{numberFormatter.format(row.waClicks)}</td>
                      <td style={{ padding: '0.7rem 0.9rem', color: '#c2d5eb' }}>{numberFormatter.format(row.views)}</td>
                      <td style={{ padding: '0.7rem 0.9rem', color: '#c2d5eb' }}>{formatCtr(row.views, row.waClicks)}</td>
                    </tr>
                  ))
                ) : (
                  <tr><td colSpan={5} style={{ padding: '1rem', color: '#92a5bc', textAlign: 'center' }}>Sin datos</td></tr>
                )}
              </tbody>
            </table>
          </div>
        </article>
      </section>

      <section className="admin-card">
        <h3>Engagement por tienda oficial</h3>
        <p style={{ color: '#7f92ab', marginBottom: '0.75rem' }}>Totales acumulados para el período seleccionado.</p>
        <div style={{ overflowX: 'auto' }}>
          <table style={{ width: '100%', borderCollapse: 'collapse', minWidth: '680px' }}>
            <thead>
              <tr style={{ background: 'rgba(12,23,35,0.9)', textAlign: 'left', color: '#9fb3c9', fontSize: '0.78rem', letterSpacing: '0.08em' }}>
                <th style={{ padding: '0.6rem 0.9rem' }}>#</th>
                <th style={{ padding: '0.6rem 0.9rem' }}>Tienda</th>
                <th style={{ padding: '0.6rem 0.9rem' }}>Vistas tienda</th>
                <th style={{ padding: '0.6rem 0.9rem' }}>Vistas avisos</th>
                <th style={{ padding: '0.6rem 0.9rem' }}>Clics WA</th>
                <th style={{ padding: '0.6rem 0.9rem' }}>CTR avisos → WA</th>
              </tr>
            </thead>
            <tbody>
              {loading ? (
                <tr><td colSpan={6} style={{ padding: '1rem', color: '#92a5bc', textAlign: 'center' }}>Cargando…</td></tr>
              ) : storeEngagement.length ? (
                storeEngagement.map((store, index) => (
                  <tr key={store.id} style={{ borderTop: '1px solid rgba(255,255,255,0.06)' }}>
                    <td style={{ padding: '0.7rem 0.9rem', color: '#7f92ab' }}>{index + 1}</td>
                    <td style={{ padding: '0.7rem 0.9rem', color: '#c2d5eb' }}>{store.name}</td>
                    <td style={{ padding: '0.7rem 0.9rem', color: '#c2d5eb' }}>{numberFormatter.format(store.storeViews)}</td>
                    <td style={{ padding: '0.7rem 0.9rem', color: '#c2d5eb' }}>{numberFormatter.format(store.listingViews)}</td>
                    <td style={{ padding: '0.7rem 0.9rem', color: '#c2d5eb' }}>{numberFormatter.format(store.waClicks)}</td>
                    <td style={{ padding: '0.7rem 0.9rem', color: '#c2d5eb' }}>{formatCtr(store.listingViews, store.waClicks)}</td>
                  </tr>
                ))
              ) : (
                <tr><td colSpan={6} style={{ padding: '1rem', color: '#92a5bc', textAlign: 'center' }}>Sin datos</td></tr>
              )}
            </tbody>
          </table>
        </div>
      </section>
    </div>
  )
}
