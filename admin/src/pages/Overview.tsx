import { useEffect, useMemo, useState } from 'react'
import {
  fetchSummaryMetrics,
  summarizeRecentPayments,
  fetchUserGrowthSummary,
  fetchListingActivitySummary,
  fetchFunnelCounts,
  type SummaryMetrics,
  type PaymentsSummary,
  type UserGrowthSummary,
  type ListingActivitySummary,
  type FunnelCounts,
} from '@admin/services/metrics'

const numberFormatter = new Intl.NumberFormat('es-AR', { maximumFractionDigits: 0 })
const currencyArs = new Intl.NumberFormat('es-AR', { style: 'currency', currency: 'ARS', maximumFractionDigits: 0 })
const currencyUsd = new Intl.NumberFormat('es-AR', { style: 'currency', currency: 'USD', maximumFractionDigits: 0 })
const percentFormatter = new Intl.NumberFormat('es-AR', { maximumFractionDigits: 1 })

const planLabels: Record<string, string> = {
  free: 'Free',
  basic: 'Básico',
  pro: 'Pro',
  premium: 'Premium',
  sin_plan: 'Sin dato',
}

function formatMetric(value: number | null): string {
  if (value === null) return '—'
  return numberFormatter.format(value)
}

interface DeltaBadgeProps {
  current: number
  previous: number
}

function DeltaBadge({ current, previous }: DeltaBadgeProps) {
  const diff = current - previous
  const styleBase: React.CSSProperties = {
    display: 'inline-flex',
    alignItems: 'center',
    gap: '0.35rem',
    fontSize: '0.82rem',
    fontWeight: 600,
  }
  if (previous <= 0) {
    if (current <= 0) {
      return <span style={{ ...styleBase, color: '#7f92ab' }}>—</span>
    }
    return (
      <span style={{ ...styleBase, color: '#6fff9d' }}>
        ▲ +{formatMetric(diff)}
      </span>
    )
  }
  const pct = (diff / previous) * 100
  if (Math.abs(pct) < 0.1) {
    return <span style={{ ...styleBase, color: '#7f92ab' }}>—</span>
  }
  if (pct > 0) {
    return (
      <span style={{ ...styleBase, color: '#6fff9d' }}>
        ▲ {percentFormatter.format(pct)}%
      </span>
    )
  }
  return (
    <span style={{ ...styleBase, color: '#ff8f8f' }}>
      ▼ {percentFormatter.format(Math.abs(pct))}%
    </span>
  )
}

interface FunnelStep {
  label: string
  value: number
  previous: number
  conversionLabel?: string | null
}

export default function OverviewPage() {
  const [metrics, setMetrics] = useState<SummaryMetrics | null>(null)
  const [payments, setPayments] = useState<PaymentsSummary | null>(null)
  const [userGrowth, setUserGrowth] = useState<UserGrowthSummary | null>(null)
  const [listingActivity, setListingActivity] = useState<ListingActivitySummary | null>(null)
  const [funnel, setFunnel] = useState<FunnelCounts | null>(null)
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)

  useEffect(() => {
    let active = true
    setLoading(true)
    setError(null)

    Promise.all([
      fetchSummaryMetrics(),
      summarizeRecentPayments(90),
      fetchUserGrowthSummary(),
      fetchListingActivitySummary(),
      fetchFunnelCounts(30),
    ])
      .then(([summary, paymentsSummary, userSummary, listingsSummary, funnelSummary]) => {
        if (!active) return
        setMetrics(summary)
        setPayments(paymentsSummary)
        setUserGrowth(userSummary)
        setListingActivity(listingsSummary)
        setFunnel(funnelSummary)
      })
      .catch((err) => {
        console.warn('[admin] overview metrics failed', err)
        if (active) setError('No pudimos cargar las métricas. Intentá nuevamente en unos minutos.')
      })
      .finally(() => {
        if (active) setLoading(false)
      })

    return () => { active = false }
  }, [])

  const overviewCards = useMemo(() => ([
    {
      title: 'Usuarios totales',
      description: 'Perfiles registrados en la plataforma.',
      value: formatMetric(metrics?.totalUsers ?? null),
    },
    {
      title: 'Usuarios verificados',
      description: 'Cuentas con verificación completada.',
      value: formatMetric(metrics?.verifiedUsers ?? null),
    },
    {
      title: 'Tiendas oficiales',
      description: 'Partners con store habilitada.',
      value: formatMetric(metrics?.officialStores ?? null),
    },
    {
      title: 'Avisos publicados',
      description: 'Incluye activos, pausados y borradores.',
      value: formatMetric(metrics?.totalListings ?? null),
    },
    {
      title: 'Avisos activos',
      description: 'Publicaciones visibles actualmente.',
      value: formatMetric(metrics?.activeListings ?? null),
    },
    {
      title: 'Checkouts confirmados (90d)',
      description: 'Pagos registrados en los últimos 90 días.',
      value: payments ? formatMetric(payments.count) : '…',
    },
  ]), [metrics, payments])

  const funnelSteps: FunnelStep[] = useMemo(() => {
    if (!funnel) return []
    const site = funnel.site.current
    const listing = funnel.listing.current
    const wa = funnel.wa.current
    const checkout = funnel.checkout.current
    const steps: FunnelStep[] = [
      { label: 'Site Views', value: site, previous: funnel.site.previous },
      {
        label: 'Listing Views',
        value: listing,
        previous: funnel.listing.previous,
        conversionLabel: site > 0 ? `${percentFormatter.format((listing / site) * 100)}%` : null,
      },
      {
        label: 'WA Clicks',
        value: wa,
        previous: funnel.wa.previous,
        conversionLabel: listing > 0 ? `${percentFormatter.format((wa / listing) * 100)}%` : null,
      },
      {
        label: 'Checkouts',
        value: checkout,
        previous: funnel.checkout.previous,
        conversionLabel: wa > 0 ? `${percentFormatter.format((checkout / wa) * 100)}%` : null,
      },
    ]
    return steps
  }, [funnel])

  const planBreakdown = useMemo(() => {
    if (!payments) return []
    return Object.entries(payments.totalByPlan || {})
      .map(([plan, amount]) => ({
        plan,
        label: planLabels[plan] || plan.charAt(0).toUpperCase() + plan.slice(1),
        amount,
      }))
      .sort((a, b) => b.amount - a.amount)
      .slice(0, 4)
  }, [payments])

  return (
    <div>
      <section className="admin-grid" style={{ marginBottom: '2rem' }}>
        {overviewCards.map((card) => (
          <article key={card.title} className="admin-card">
            <h3>{card.title}</h3>
            <p style={{ fontSize: '2rem', margin: '0.5rem 0', fontWeight: 600, color: '#f2f6fb' }}>
              {loading ? '…' : card.value}
            </p>
            <p>{card.description}</p>
          </article>
        ))}
      </section>

      {error ? (
        <div className="admin-card" style={{ borderColor: 'rgba(255,107,107,0.4)', color: '#ff8f8f', marginBottom: '1.5rem' }}>
          {error}
        </div>
      ) : null}

      <section className="admin-grid" style={{ marginBottom: '1.5rem' }}>
        <article className="admin-card">
          <h3>Usuarios nuevos</h3>
          <p style={{ color: '#7f92ab', marginBottom: '1rem' }}>Crecimiento de registros según período.</p>
          <div style={{ display: 'grid', gap: '0.75rem' }}>
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'baseline' }}>
              <div>
                <div style={{ color: '#9fb3c9', fontSize: '0.82rem' }}>Últimos 7 días</div>
                <div style={{ fontSize: '1.6rem', fontWeight: 700, color: '#f2f6fb' }}>
                  {userGrowth ? formatMetric(userGrowth.users7d) : '…'}
                </div>
              </div>
              {userGrowth ? <DeltaBadge current={userGrowth.users7d} previous={userGrowth.usersPrev7d} /> : null}
            </div>
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'baseline' }}>
              <div>
                <div style={{ color: '#9fb3c9', fontSize: '0.82rem' }}>Últimos 30 días</div>
                <div style={{ fontSize: '1.6rem', fontWeight: 700, color: '#f2f6fb' }}>
                  {userGrowth ? formatMetric(userGrowth.users30d) : '…'}
                </div>
              </div>
              {userGrowth ? <DeltaBadge current={userGrowth.users30d} previous={userGrowth.usersPrev30d} /> : null}
            </div>
          </div>
        </article>

        <article className="admin-card">
          <h3>Actividad de avisos</h3>
          <p style={{ color: '#7f92ab', marginBottom: '1rem' }}>Nuevos avisos y pausas detectadas.</p>
          <div style={{ display: 'grid', gap: '0.75rem' }}>
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'baseline' }}>
              <div>
                <div style={{ color: '#9fb3c9', fontSize: '0.82rem' }}>Nuevos avisos (7d)</div>
                <div style={{ fontSize: '1.5rem', fontWeight: 700, color: '#f2f6fb' }}>
                  {listingActivity ? formatMetric(listingActivity.created7d) : '…'}
                </div>
              </div>
              {listingActivity ? <DeltaBadge current={listingActivity.created7d} previous={listingActivity.createdPrev7d} /> : null}
            </div>
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'baseline' }}>
              <div>
                <div style={{ color: '#9fb3c9', fontSize: '0.82rem' }}>Nuevos avisos (30d)</div>
                <div style={{ fontSize: '1.5rem', fontWeight: 700, color: '#f2f6fb' }}>
                  {listingActivity ? formatMetric(listingActivity.created30d) : '…'}
                </div>
              </div>
              {listingActivity ? <DeltaBadge current={listingActivity.created30d} previous={listingActivity.createdPrev30d} /> : null}
            </div>
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'baseline' }}>
              <div>
                <div style={{ color: '#9fb3c9', fontSize: '0.82rem' }}>Avisos pausados (30d)</div>
                <div style={{ fontSize: '1.5rem', fontWeight: 700, color: '#f2f6fb' }}>
                  {listingActivity ? formatMetric(listingActivity.paused30d) : '…'}
                </div>
              </div>
              {listingActivity ? <DeltaBadge current={listingActivity.paused30d} previous={listingActivity.pausedPrev30d} /> : null}
            </div>
          </div>
        </article>
      </section>

      <section className="admin-card" style={{ marginBottom: '1.5rem' }}>
        <h3>Funnel visitantes → ventas (últimos 30 días)</h3>
        <div style={{ display: 'flex', gap: '1rem', flexWrap: 'wrap', alignItems: 'flex-start', marginTop: '1rem' }}>
          {funnelSteps.map((step, index) => (
            <div key={step.label} style={{ display: 'flex', alignItems: 'center', gap: '1rem' }}>
              <div style={{ minWidth: '150px' }}>
                <div style={{ fontSize: '0.82rem', color: '#9fb3c9', textTransform: 'uppercase', letterSpacing: '0.08em' }}>
                  {step.label}
                </div>
                <div style={{ fontSize: '1.7rem', fontWeight: 700, color: '#f2f6fb' }}>
                  {formatMetric(step.value)}
                </div>
                <DeltaBadge current={step.value} previous={step.previous} />
              </div>
              {index < funnelSteps.length - 1 ? (
                <div style={{ textAlign: 'center' }}>
                  <div style={{ fontSize: '1.6rem', color: '#7f92ab' }}>→</div>
                  <div style={{ color: '#9fb3c9', fontSize: '0.8rem' }}>
                    {step.conversionLabel ?? '—'}
                  </div>
                </div>
              ) : null}
            </div>
          ))}
        </div>
      </section>

      <section className="admin-card" style={{ marginBottom: '1.5rem' }}>
        <h3>Ingresos recientes (90 días)</h3>
        <div style={{ display: 'grid', gap: '1.25rem', gridTemplateColumns: 'repeat(auto-fit,minmax(180px,1fr))', marginTop: '1rem' }}>
          <div>
            <div style={{ color: '#9fb3c9', fontSize: '0.82rem' }}>Total ARS</div>
            <div style={{ fontSize: '1.4rem', fontWeight: 700, color: '#f2f6fb' }}>
              {payments ? currencyArs.format(payments.totalByCurrency['ARS'] || 0) : '…'}
            </div>
          </div>
          <div>
            <div style={{ color: '#9fb3c9', fontSize: '0.82rem' }}>Total USD</div>
            <div style={{ fontSize: '1.4rem', fontWeight: 700, color: '#f2f6fb' }}>
              {payments ? currencyUsd.format(payments.totalByCurrency['USD'] || 0) : '…'}
            </div>
          </div>
          <div>
            <div style={{ color: '#9fb3c9', fontSize: '0.82rem' }}>Distribución por plan</div>
            <div style={{ display: 'flex', flexDirection: 'column', gap: '0.35rem', marginTop: '0.35rem' }}>
              {payments && planBreakdown.length ? (
                planBreakdown.map((plan) => (
                  <div key={plan.plan} style={{ display: 'flex', justifyContent: 'space-between', color: '#c2d5eb', fontSize: '0.9rem' }}>
                    <span>{plan.label}</span>
                    <strong>{currencyArs.format(plan.amount)}</strong>
                  </div>
                ))
              ) : (
                <span style={{ color: '#7f92ab' }}>Sin datos</span>
              )}
            </div>
          </div>
        </div>
      </section>

      <section className="admin-card">
        <h3>Ideas para la próxima iteración</h3>
        <ul style={{ margin: '0.75rem 0 0', paddingLeft: '1.2rem', color: '#91a4ba', lineHeight: 1.7 }}>
          <li>Configurar alertas si las publicaciones pausadas superan un umbral semanal.</li>
          <li>Crear segmentos de usuarios nuevos con alta actividad (vistas y clics).</li>
          <li>Relacionar planes vendidos vs planes activos para detectar churn.</li>
        </ul>
      </section>
    </div>
  )
}
