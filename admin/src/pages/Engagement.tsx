import { useEffect, useMemo, useState } from 'react'
import MiniLineChart from '@admin/components/MiniLineChart'
import { fetchDailyEvents, fetchTopListingsByViews, fetchTopListingsByWaClicks, type DailyEventsByType } from '@admin/services/engagement'

type Period = 7 | 30

function toChart(series: Array<{ day: string; total: number }>) {
  return series.map((p, idx) => ({ x: idx, y: p.total }))
}

export default function EngagementPage() {
  const [period, setPeriod] = useState<Period>(30)
  const [events, setEvents] = useState<DailyEventsByType>({ site: [], listing: [], store: [] })
  const [topViews, setTopViews] = useState<Array<{ id: string; title: string; total: number }>>([])
  const [topWa, setTopWa] = useState<Array<{ id: string; title: string; total: number }>>([])
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)

  useEffect(() => {
    let alive = true
    setLoading(true)
    setError(null)
    Promise.all([
      fetchDailyEvents(period),
      fetchTopListingsByViews(period, 10),
      fetchTopListingsByWaClicks(period, 10),
    ])
      .then(([ev, tv, twa]) => {
        if (!alive) return
        setEvents(ev)
        setTopViews(tv)
        setTopWa(twa)
      })
      .catch((err) => {
        console.warn('[engagement] load failed', err)
        if (alive) setError('No pudimos cargar engagement. Intentá nuevamente.')
      })
      .finally(() => { if (alive) setLoading(false) })
    return () => { alive = false }
  }, [period])

  const siteData = useMemo(() => toChart(events.site), [events.site])
  const listingData = useMemo(() => toChart(events.listing), [events.listing])
  const storeData = useMemo(() => toChart(events.store), [events.store])

  return (
    <div>
      <section className="admin-card" style={{ marginBottom: '1rem' }}>
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', gap: '1rem' }}>
          <h3>Engagement</h3>
          <div>
            <label style={{ fontSize: '0.85rem', color: '#9fb3c9', marginRight: '0.5rem' }}>Período</label>
            <select
              value={period}
              onChange={(e) => setPeriod(Number(e.target.value) as Period)}
              style={{ background: 'rgba(15,30,46,0.8)', border: '1px solid rgba(255,255,255,0.1)', color: '#f2f6fb', padding: '0.45rem 0.7rem', borderRadius: '10px' }}
            >
              <option value={7}>7 días</option>
              <option value={30}>30 días</option>
            </select>
          </div>
        </div>
      </section>

      {error ? (
        <div className="admin-card" style={{ borderColor: 'rgba(255,107,107,0.4)', color: '#ff8f8f' }}>{error}</div>
      ) : null}

      <section className="admin-grid" style={{ marginBottom: '1.5rem' }}>
        <article className="admin-card">
          <h3>Site Views</h3>
          <div style={{ marginTop: '0.75rem' }}>{siteData.length > 1 ? <MiniLineChart data={siteData} width={520} height={140} /> : <div style={{ color: '#92a5bc' }}>{loading ? 'Cargando…' : 'Sin datos'}</div>}</div>
        </article>
        <article className="admin-card">
          <h3>Listing Views</h3>
          <div style={{ marginTop: '0.75rem' }}>{listingData.length > 1 ? <MiniLineChart data={listingData} width={520} height={140} stroke="#61f2ff" fill="rgba(97,242,255,0.18)" /> : <div style={{ color: '#92a5bc' }}>{loading ? 'Cargando…' : 'Sin datos'}</div>}</div>
        </article>
        <article className="admin-card">
          <h3>Store Views</h3>
          <div style={{ marginTop: '0.75rem' }}>{storeData.length > 1 ? <MiniLineChart data={storeData} width={520} height={140} stroke="#6fff9d" fill="rgba(111,255,157,0.18)" /> : <div style={{ color: '#92a5bc' }}>{loading ? 'Cargando…' : 'Sin datos'}</div>}</div>
        </article>
      </section>

      <section className="admin-grid">
        <article className="admin-card">
          <h3>Top publicaciones por vistas</h3>
          <div style={{ marginTop: '0.75rem', overflowX: 'auto' }}>
            <table style={{ width: '100%', borderCollapse: 'collapse', minWidth: '520px' }}>
              <thead>
                <tr style={{ background: 'rgba(12,23,35,0.9)', textAlign: 'left', color: '#9fb3c9', fontSize: '0.78rem', letterSpacing: '0.08em' }}>
                  <th style={{ padding: '0.6rem 0.9rem' }}>Publicación</th>
                  <th style={{ padding: '0.6rem 0.9rem' }}>Vistas</th>
                </tr>
              </thead>
              <tbody>
                {loading ? (
                  <tr><td colSpan={2} style={{ padding: '1rem', color: '#92a5bc', textAlign: 'center' }}>Cargando…</td></tr>
                ) : topViews.length ? (
                  topViews.map((row) => (
                    <tr key={row.id} style={{ borderTop: '1px solid rgba(255,255,255,0.06)' }}>
                      <td style={{ padding: '0.7rem 0.9rem', color: '#c2d5eb' }}>{row.title}</td>
                      <td style={{ padding: '0.7rem 0.9rem', color: '#c2d5eb' }}>{row.total}</td>
                    </tr>
                  ))
                ) : (
                  <tr><td colSpan={2} style={{ padding: '1rem', color: '#92a5bc', textAlign: 'center' }}>Sin datos</td></tr>
                )}
              </tbody>
            </table>
          </div>
        </article>

        <article className="admin-card">
          <h3>Top publicaciones por clics de WhatsApp</h3>
          <div style={{ marginTop: '0.75rem', overflowX: 'auto' }}>
            <table style={{ width: '100%', borderCollapse: 'collapse', minWidth: '520px' }}>
              <thead>
                <tr style={{ background: 'rgba(12,23,35,0.9)', textAlign: 'left', color: '#9fb3c9', fontSize: '0.78rem', letterSpacing: '0.08em' }}>
                  <th style={{ padding: '0.6rem 0.9rem' }}>Publicación</th>
                  <th style={{ padding: '0.6rem 0.9rem' }}>Clics WA</th>
                </tr>
              </thead>
              <tbody>
                {loading ? (
                  <tr><td colSpan={2} style={{ padding: '1rem', color: '#92a5bc', textAlign: 'center' }}>Cargando…</td></tr>
                ) : topWa.length ? (
                  topWa.map((row) => (
                    <tr key={row.id} style={{ borderTop: '1px solid rgba(255,255,255,0.06)' }}>
                      <td style={{ padding: '0.7rem 0.9rem', color: '#c2d5eb' }}>{row.title}</td>
                      <td style={{ padding: '0.7rem 0.9rem', color: '#c2d5eb' }}>{row.total}</td>
                    </tr>
                  ))
                ) : (
                  <tr><td colSpan={2} style={{ padding: '1rem', color: '#92a5bc', textAlign: 'center' }}>Sin datos</td></tr>
                )}
              </tbody>
            </table>
          </div>
        </article>
      </section>
    </div>
  )
}

