import { useEffect, useMemo, useState } from 'react'
import { fetchSummaryMetrics, summarizeRecentPayments, fetchActiveListingsSeries, exportPaymentsCsv, type SummaryMetrics } from '@admin/services/metrics'
import MiniLineChart from '@admin/components/MiniLineChart'
import { triggerNewsletterDigest } from '@admin/services/actions'

const format = new Intl.NumberFormat('es-AR')

function formatValue(value: number | null): string {
  if (value === null) return '—'
  return format.format(value)
}

export default function AnalyticsPage() {
  const [metrics, setMetrics] = useState<SummaryMetrics | null>(null)
  const [payments, setPayments] = useState<{ count: number; totalArs: number; totalUsd: number; byDay: Array<{ day: string; total: number }> } | null>(null)
  const [activeSeries, setActiveSeries] = useState<Array<{ day: string; total: number }>>([])
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)

  useEffect(() => {
    let alive = true
    setLoading(true)
    setError(null)

    Promise.all([fetchSummaryMetrics(), summarizeRecentPayments(30), fetchActiveListingsSeries(30)])
      .then(([data, pay, active]) => {
        if (!alive) return
        setMetrics(data)
        const ars = pay.totalByCurrency['ARS'] || 0
        const usd = pay.totalByCurrency['USD'] || 0
        const byDay = pay.byDay.map((d) => ({ day: d.day, total: d.total }))
        setPayments({ count: pay.count, totalArs: ars, totalUsd: usd, byDay })
        setActiveSeries(active)
      })
      .catch((err) => {
        console.warn('[admin] analytics metrics failed', err)
        if (!alive) return
        setError('No pudimos cargar las métricas.')
      })
      .finally(() => {
        if (alive) setLoading(false)
      })

    return () => {
      alive = false
    }
  }, [])

  const listingStatus = useMemo(() => ([
    { label: 'Activos', value: metrics?.activeListings ?? null },
    { label: 'Pausados', value: metrics?.pausedListings ?? null },
    { label: 'Borradores', value: metrics?.draftListings ?? null },
    { label: 'Total', value: metrics?.totalListings ?? null },
  ]), [metrics])

  const storeData = useMemo(() => ([
    { label: 'Tiendas oficiales', value: metrics?.officialStores ?? null },
    { label: 'Usuarios verificados', value: metrics?.verifiedUsers ?? null },
    { label: 'Usuarios totales', value: metrics?.totalUsers ?? null },
  ]), [metrics])

  const currencyFormatARS = new Intl.NumberFormat('es-AR', { style: 'currency', currency: 'ARS', maximumFractionDigits: 0 })
  const currencyFormatUSD = new Intl.NumberFormat('es-AR', { style: 'currency', currency: 'USD' })

  const chartData = (payments?.byDay || []).map((d, idx) => ({ x: idx, y: d.total }))
  const activeChartData = activeSeries.map((d, idx) => ({ x: idx, y: d.total }))

  return (
    <div>
      <section className="admin-grid">
        {storeData.map((item) => (
          <article key={item.label} className="admin-card">
            <h3>{item.label}</h3>
            <p style={{ fontSize: '2rem', margin: '0.5rem 0', fontWeight: 600, color: '#f2f6fb' }}>
              {loading ? '…' : formatValue(item.value)}
            </p>
            <p style={{ color: '#8ea0b3' }}>Refrescá estos datos para seguir el crecimiento del marketplace.</p>
          </article>
        ))}
      </section>

      {error ? (
        <div className="admin-card" style={{ borderColor: 'rgba(255,107,107,0.4)', color: '#ff8f8f', marginTop: '1.5rem' }}>
          {error}
        </div>
      ) : null}

      <section className="admin-card" style={{ marginTop: '1.5rem' }}>
        <h3>Breakdown de publicaciones</h3>
        <div style={{ display: 'grid', gap: '0.75rem', marginTop: '1rem' }}>
          {listingStatus.map((item) => (
            <div key={item.label} style={{ display: 'flex', justifyContent: 'space-between', color: '#b7c7da' }}>
              <span>{item.label}</span>
              <strong style={{ color: '#f2f6fb' }}>{loading ? '…' : formatValue(item.value)}</strong>
            </div>
          ))}
        </div>
        <p style={{ marginTop: '1.5rem', color: '#7f92ab', fontSize: '0.88rem' }}>
          Tip: creá vistas en Supabase que calculen tendencia semana a semana para graficarlas acá.
        </p>
      </section>

      <section className="admin-card" style={{ marginTop: '1.5rem' }}>
        <h3>Ingresos (últimos 30 días)</h3>
        <div style={{ display: 'grid', gap: '0.75rem', marginTop: '1rem', gridTemplateColumns: 'repeat(auto-fit, minmax(180px, 1fr))' }}>
          <div>
            <div style={{ color: '#9fb3c9', fontSize: '0.85rem' }}>Checkouts confirmados</div>
            <div style={{ fontSize: '1.4rem', fontWeight: 700, color: '#f2f6fb' }}>{loading ? '…' : (payments ? formatValue(payments.count) : '—')}</div>
          </div>
          <div>
            <div style={{ color: '#9fb3c9', fontSize: '0.85rem' }}>Total ARS</div>
            <div style={{ fontSize: '1.4rem', fontWeight: 700, color: '#f2f6fb' }}>{loading ? '…' : (payments ? currencyFormatARS.format(payments.totalArs) : '—')}</div>
          </div>
          <div>
            <div style={{ color: '#9fb3c9', fontSize: '0.85rem' }}>Total USD</div>
            <div style={{ fontSize: '1.4rem', fontWeight: 700, color: '#f2f6fb' }}>{loading ? '…' : (payments ? currencyFormatUSD.format(payments.totalUsd) : '—')}</div>
          </div>
        </div>

        <div style={{ marginTop: '1rem', overflowX: 'auto' }}>
          {payments && payments.byDay.length > 1 ? (
            <div style={{ marginBottom: '1rem' }}>
              <MiniLineChart data={chartData} width={680} height={180} />
            </div>
          ) : null}
          <table style={{ width: '100%', borderCollapse: 'collapse', minWidth: '520px' }}>
            <thead>
              <tr style={{ background: 'rgba(12,23,35,0.9)', textAlign: 'left', color: '#9fb3c9', fontSize: '0.78rem', letterSpacing: '0.08em' }}>
                <th style={{ padding: '0.6rem 0.9rem' }}>Día</th>
                <th style={{ padding: '0.6rem 0.9rem' }}>Total (ARS)</th>
              </tr>
            </thead>
            <tbody>
              {loading ? (
                <tr>
                  <td colSpan={2} style={{ padding: '1rem', color: '#92a5bc', textAlign: 'center' }}>Cargando ingresos…</td>
                </tr>
              ) : payments && payments.byDay.length ? (
                payments.byDay.map((d) => (
                  <tr key={d.day} style={{ borderTop: '1px solid rgba(255,255,255,0.06)' }}>
                    <td style={{ padding: '0.7rem 0.9rem', color: '#c2d5eb' }}>{d.day}</td>
                    <td style={{ padding: '0.7rem 0.9rem', color: '#c2d5eb' }}>{currencyFormatARS.format(d.total)}</td>
                  </tr>
                ))
              ) : (
                <tr>
                  <td colSpan={2} style={{ padding: '1rem', color: '#92a5bc', textAlign: 'center' }}>No hay datos para mostrar.</td>
                </tr>
              )}
            </tbody>
          </table>
        </div>
      </section>

      <section className="admin-card" style={{ marginTop: '1.5rem' }}>
        <h3>Publicaciones activas por día (últimos 30 días)</h3>
        <div style={{ marginTop: '0.75rem' }}>
          {activeChartData.length > 1 ? (
            <MiniLineChart data={activeChartData} width={680} height={180} stroke="#6fff9d" fill="rgba(111,255,157,0.18)" />
          ) : (
            <div style={{ color: '#92a5bc' }}>Sin datos suficientes para graficar.</div>
          )}
        </div>
      </section>

      <section className="admin-card" style={{ marginTop: '1.5rem' }}>
        <h3>Acciones rápidas</h3>
        <div style={{ display: 'flex', gap: '0.75rem', flexWrap: 'wrap', marginTop: '0.75rem' }}>
          <button
            type="button"
            onClick={async () => {
              try {
                await triggerNewsletterDigest()
                alert('Newsletter disparada correctamente')
              } catch (err: any) {
                alert(err?.message || 'No pudimos enviar la newsletter')
              }
            }}
            style={{
              padding: '0.6rem 1rem',
              borderRadius: '12px',
              border: '1px solid rgba(255,255,255,0.12)',
              background: 'linear-gradient(135deg, rgba(97,223,255,0.24), rgba(73,133,255,0.24))',
              color: '#f2f6fb',
              fontWeight: 600,
              cursor: 'pointer',
            }}
          >
            Enviar newsletter (últimos avisos)
          </button>
          <button
            type="button"
            onClick={() => exportPaymentsCsv(90)}
            style={{
              padding: '0.6rem 1rem',
              borderRadius: '12px',
              border: '1px solid rgba(255,255,255,0.12)',
              background: 'linear-gradient(135deg, rgba(255,255,255,0.14), rgba(255,255,255,0.06))',
              color: '#f2f6fb',
              fontWeight: 600,
              cursor: 'pointer',
            }}
          >
            Exportar pagos (CSV)
          </button>
        </div>
        <p style={{ marginTop: '0.75rem', color: '#7f92ab', fontSize: '0.88rem' }}>
          Nota: esta acción requiere que el backend acepte la cabecera x-cron-secret configurada en el entorno del admin.
        </p>
      </section>
    </div>
  )
}
