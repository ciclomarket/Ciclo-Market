import { useEffect, useMemo, useState } from 'react'
import { TimeSeriesChart } from '@admin/components/TimeSeriesChart'
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

export default function AnalyticsPage() {
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
      <section className="admin-card" style={{ marginBottom: '1.5rem' }}>
        <h3>Ingresos por moneda (últimos 90 días)</h3>
        <div style={{ display: 'grid', gap: '1.25rem', gridTemplateColumns: 'repeat(auto-fit,minmax(200px,1fr))', marginTop: '1rem' }}>
          <div>
            <div style={{ color: '#9fb3c9', fontSize: '0.82rem' }}>Total ARS</div>
            <div style={{ fontSize: '1.8rem', fontWeight: 700, color: '#f2f6fb' }}>
              {payments ? currencyArs.format(payments.totalByCurrency['ARS'] || 0) : '…'}
            </div>
          </div>
          <div>
            <div style={{ color: '#9fb3c9', fontSize: '0.82rem' }}>Total USD</div>
            <div style={{ fontSize: '1.8rem', fontWeight: 700, color: '#f2f6fb' }}>
              {payments ? currencyUsd.format(payments.totalByCurrency['USD'] || 0) : '…'}
            </div>
          </div>
          <div>
            <div style={{ color: '#9fb3c9', fontSize: '0.82rem' }}>Checkouts (90d)</div>
            <div style={{ fontSize: '1.8rem', fontWeight: 700, color: '#f2f6fb' }}>
              {payments ? numberFormatter.format(payments.count) : '…'}
            </div>
          </div>
        </div>

        <div style={{ marginTop: '2rem' }}>
          <h4 style={{ marginBottom: '0.75rem', color: '#9fb3c9', textTransform: 'uppercase', letterSpacing: '0.08em' }}>
            Distribución por plan
          </h4>
          {planBreakdown.length ? (
            <div style={{ display: 'grid', gap: '0.6rem', gridTemplateColumns: 'repeat(auto-fit,minmax(160px,1fr))' }}>
              {planBreakdown.map((plan) => (
                <div key={plan.plan} style={{ background: 'rgba(97,223,255,0.06)', borderRadius: '12px', padding: '0.75rem 1rem', border: '1px solid rgba(255,255,255,0.08)' }}>
                  <div style={{ color: '#9fb3c9', fontSize: '0.8rem' }}>{plan.label}</div>
                  <div style={{ fontSize: '1.2rem', fontWeight: 600, color: '#f2f6fb' }}>{currencyArs.format(plan.amount)}</div>
                </div>
              ))}
            </div>
          ) : (
            <p style={{ color: '#7f92ab' }}>{loading ? 'Cargando…' : 'Sin datos disponibles.'}</p>
          )}
        </div>
      </section>

      {error ? (
        <div className="admin-card" style={{ borderColor: 'rgba(255,107,107,0.4)', color: '#ff8f8f', marginBottom: '1.5rem' }}>
          {error}
        </div>
      ) : null}

      <section className="admin-grid" style={{ marginBottom: '1.5rem' }}>
        <article className="admin-card">
          <h3>Ingresos diarios</h3>
          <p style={{ color: '#7f92ab', marginBottom: '0.75rem' }}>Últimos 90 días · escala ARS</p>
          <TimeSeriesChart
            data={revenueSeries}
            height={240}
            stroke="#61dfff"
            fill="rgba(97,223,255,0.18)"
            yFormatter={(value) => currencyArs.format(value)}
            emptyLabel={loading ? 'Cargando…' : 'Sin datos'}
          />
        </article>
        <article className="admin-card">
          <h3>Checkouts confirmados</h3>
          <p style={{ color: '#7f92ab', marginBottom: '0.75rem' }}>Número de órdenes completadas por día.</p>
          <TimeSeriesChart
            data={checkoutSeries}
            height={240}
            stroke="#6fff9d"
            fill="rgba(111,255,157,0.18)"
            yFormatter={(value) => numberFormatter.format(Math.round(value))}
            emptyLabel={loading ? 'Cargando…' : 'Sin datos'}
          />
        </article>
      </section>

      <section className="admin-card" style={{ marginBottom: '1.5rem' }}>
        <h3>Calidad de publicaciones (últimos 30 días)</h3>
        <div style={{ display: 'grid', gap: '1.25rem', gridTemplateColumns: 'repeat(auto-fit,minmax(180px,1fr))', marginTop: '1rem' }}>
          <div>
            <div style={{ color: '#9fb3c9', fontSize: '0.82rem' }}>Promedio de vistas por publicación</div>
            <div style={{ fontSize: '1.6rem', fontWeight: 700, color: '#f2f6fb' }}>
              {listingQuality ? numberFormatter.format(Math.round(listingQuality.avgViews30d)) : '…'}
            </div>
          </div>
          <div>
            <div style={{ color: '#9fb3c9', fontSize: '0.82rem' }}>Promedio de clics WA por publicación</div>
            <div style={{ fontSize: '1.6rem', fontWeight: 700, color: '#f2f6fb' }}>
              {listingQuality ? numberFormatter.format(Math.round(listingQuality.avgWaClicks30d)) : '…'}
            </div>
          </div>
          <div>
            <div style={{ color: '#9fb3c9', fontSize: '0.82rem' }}>Publicaciones monitorizadas</div>
            <div style={{ fontSize: '1.6rem', fontWeight: 700, color: '#f2f6fb' }}>
              {listingQuality ? numberFormatter.format(listingQuality.listingsTracked) : '…'}
            </div>
          </div>
        </div>
      </section>

      <section className="admin-grid">
        <article className="admin-card">
          <h3>Top 5 publicaciones por vistas (30d)</h3>
          <div style={{ marginTop: '0.75rem', overflowX: 'auto' }}>
            <table style={{ width: '100%', borderCollapse: 'collapse', minWidth: '520px' }}>
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
          <h3>Top 5 publicaciones por clics de WhatsApp (30d)</h3>
          <div style={{ marginTop: '0.75rem', overflowX: 'auto' }}>
            <table style={{ width: '100%', borderCollapse: 'collapse', minWidth: '520px' }}>
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
    </div>
  )
}
