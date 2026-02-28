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
  if (previous <= 0) {
    if (current <= 0) {
      return <span className="badge badge-gray">—</span>
    }
    return <span className="badge badge-green">▲ +{formatMetric(diff)}</span>
  }
  const pct = (diff / previous) * 100
  if (Math.abs(pct) < 0.1) {
    return <span className="badge badge-gray">—</span>
  }
  if (pct > 0) {
    return <span className="badge badge-green">▲ {percentFormatter.format(pct)}%</span>
  }
  return <span className="badge badge-red">▼ {percentFormatter.format(Math.abs(pct))}%</span>
}

interface StatCardProps {
  title: string
  value: string
  description: string
  icon: string
  iconColor: 'blue' | 'green' | 'amber' | 'purple' | 'red'
  trend?: { current: number; previous: number }
}

function StatCard({ title, value, description, icon, iconColor, trend }: StatCardProps) {
  return (
    <article className="admin-card">
      <div className="admin-card-header">
        <div>
          <h3 className="admin-card-title">{title}</h3>
          <p className="admin-card-value">{value}</p>
          {trend && (
            <div style={{ marginTop: 'var(--space-2)' }}>
              <DeltaBadge current={trend.current} previous={trend.previous} />
            </div>
          )}
        </div>
        <div className={`admin-card-icon ${iconColor}`}>{icon}</div>
      </div>
      <p className="admin-card-description">{description}</p>
    </article>
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
    try {
      const raw = window.sessionStorage.getItem('cm_admin_overview_cache_v1')
      if (!raw) return
      const cached = JSON.parse(raw) as {
        ts: number
        metrics: SummaryMetrics | null
        payments: PaymentsSummary | null
        userGrowth: UserGrowthSummary | null
        listingActivity: ListingActivitySummary | null
        funnel: FunnelCounts | null
      }
      if (!cached?.ts || Date.now() - cached.ts > 60_000) return
      setMetrics(cached.metrics ?? null)
      setPayments(cached.payments ?? null)
      setUserGrowth(cached.userGrowth ?? null)
      setListingActivity(cached.listingActivity ?? null)
      setFunnel(cached.funnel ?? null)
      setLoading(false)
    } catch { /* noop */ }
  }, [])

  useEffect(() => {
    let active = true
    if (!metrics && !payments && !userGrowth && !listingActivity && !funnel) setLoading(true)
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
        try {
          window.sessionStorage.setItem('cm_admin_overview_cache_v1', JSON.stringify({
            ts: Date.now(),
            metrics: summary,
            payments: paymentsSummary,
            userGrowth: userSummary,
            listingActivity: listingsSummary,
            funnel: funnelSummary,
          }))
        } catch { /* noop */ }
      })
      .catch((err) => {
        console.warn('[admin] overview metrics failed', err)
        if (active) setError('No pudimos cargar las métricas. Intentá nuevamente en unos minutos.')
      })
      .finally(() => {
        if (active) setLoading(false)
      })

    return () => { active = false }
  }, [metrics, payments, userGrowth, listingActivity, funnel])

  const statCards = useMemo(() => {
    const cards: StatCardProps[] = [
      {
        title: 'Usuarios totales',
        value: formatMetric(metrics?.totalUsers ?? null),
        description: 'Perfiles registrados en la plataforma',
        icon: '👥',
        iconColor: 'blue',
        trend: userGrowth ? { current: userGrowth.users30d, previous: userGrowth.usersPrev30d } : undefined,
      },
      {
        title: 'Usuarios verificados',
        value: formatMetric(metrics?.verifiedUsers ?? null),
        description: 'Cuentas con verificación completada',
        icon: '✓',
        iconColor: 'green',
      },
      {
        title: 'Tiendas oficiales',
        value: formatMetric(metrics?.officialStores ?? null),
        description: 'Partners con store habilitada',
        icon: '🏪',
        iconColor: 'purple',
      },
      {
        title: 'Avisos activos',
        value: formatMetric(metrics?.activeListings ?? null),
        description: 'Publicaciones visibles actualmente',
        icon: '📦',
        iconColor: 'amber',
        trend: listingActivity ? { current: listingActivity.created30d, previous: listingActivity.createdPrev30d } : undefined,
      },
    ]
    return cards
  }, [metrics, userGrowth, listingActivity])

  const funnelSteps: FunnelStep[] = useMemo(() => {
    if (!funnel) return []
    const site = funnel.site.current
    const listing = funnel.listing.current
    const intent = funnel.contactIntent.current
    const logged = funnel.contactLogged.current
    const sold = funnel.saleConfirmed.current
    const steps: FunnelStep[] = [
      { label: 'Site Views', value: site, previous: funnel.site.previous },
      {
        label: 'Listing Views',
        value: listing,
        previous: funnel.listing.previous,
        conversionLabel: site > 0 ? `${percentFormatter.format((listing / site) * 100)}%` : null,
      },
      {
        label: 'Contact Intent',
        value: intent,
        previous: funnel.contactIntent.previous,
        conversionLabel: listing > 0 ? `${percentFormatter.format((intent / listing) * 100)}%` : null,
      },
      {
        label: 'Contact Logged',
        value: logged,
        previous: funnel.contactLogged.previous,
        conversionLabel: intent > 0 ? `${percentFormatter.format((logged / intent) * 100)}%` : null,
      },
      {
        label: 'Sale Confirmed',
        value: sold,
        previous: funnel.saleConfirmed.previous,
        conversionLabel: logged > 0 ? `${percentFormatter.format((sold / logged) * 100)}%` : null,
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
      {/* KPI Cards */}
      <section className="admin-grid admin-grid-4" style={{ marginBottom: 'var(--space-6)' }}>
        {statCards.map((card) => (
          <StatCard
            key={card.title}
            {...card}
            value={loading ? '…' : card.value}
          />
        ))}
      </section>

      {/* Error Message */}
      {error && (
        <div className="admin-card" style={{ borderColor: 'var(--cm-danger)', marginBottom: 'var(--space-5)' }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: 'var(--space-3)', color: 'var(--cm-danger)' }}>
            <span>⚠</span>
            <span>{error}</span>
          </div>
        </div>
      )}

      {/* Funnel Section */}
      <section className="admin-card" style={{ marginBottom: 'var(--space-5)' }}>
        <div className="admin-card-header">
          <div>
            <h3 className="admin-card-title">Funnel de Conversión</h3>
            <p style={{ margin: 0, color: 'var(--admin-text-muted)', fontSize: '0.875rem' }}>
              Últimos 30 días · visitantes → ventas
            </p>
          </div>
        </div>
        
        <div style={{ display: 'flex', gap: 'var(--space-4)', flexWrap: 'wrap', alignItems: 'flex-start' }}>
          {funnelSteps.map((step, index) => (
            <div key={step.label} style={{ display: 'flex', alignItems: 'center', gap: 'var(--space-4)' }}>
              <div style={{ minWidth: '120px', textAlign: 'center' }}>
                <div style={{ fontSize: '0.6875rem', color: 'var(--admin-text-muted)', textTransform: 'uppercase', letterSpacing: '0.05em', marginBottom: 'var(--space-1)' }}>
                  {step.label}
                </div>
                <div style={{ fontSize: '1.5rem', fontWeight: 700, color: 'var(--admin-text)' }}>
                  {formatMetric(step.value)}
                </div>
                <div style={{ marginTop: 'var(--space-1)' }}>
                  <DeltaBadge current={step.value} previous={step.previous} />
                </div>
              </div>
              {index < funnelSteps.length - 1 && step.conversionLabel && (
                <div style={{ textAlign: 'center', color: 'var(--admin-text-muted)' }}>
                  <div style={{ fontSize: '1.25rem' }}>→</div>
                  <div style={{ fontSize: '0.75rem', color: 'var(--cm-success)', fontWeight: 600 }}>
                    {step.conversionLabel}
                  </div>
                </div>
              )}
            </div>
          ))}
        </div>
      </section>

      {/* Two Column Layout */}
      <div className="admin-grid admin-grid-2" style={{ marginBottom: 'var(--space-5)' }}>
        {/* Revenue Card */}
        <section className="admin-card">
          <div className="admin-card-header">
            <div>
              <h3 className="admin-card-title">Ingresos (90 días)</h3>
              <p style={{ margin: 0, color: 'var(--admin-text-muted)', fontSize: '0.875rem' }}>
                Métrica de monetización
              </p>
            </div>
            <div className="admin-card-icon green">💰</div>
          </div>
          
          <div style={{ display: 'grid', gap: 'var(--space-4)', gridTemplateColumns: 'repeat(auto-fit, minmax(150px, 1fr))' }}>
            <div>
              <div style={{ fontSize: '0.75rem', color: 'var(--admin-text-muted)', textTransform: 'uppercase', letterSpacing: '0.05em' }}>Total ARS</div>
              <div style={{ fontSize: '1.25rem', fontWeight: 700, color: 'var(--admin-text)' }}>
                {payments ? currencyArs.format(payments.totalByCurrency['ARS'] || 0) : '…'}
              </div>
            </div>
            <div>
              <div style={{ fontSize: '0.75rem', color: 'var(--admin-text-muted)', textTransform: 'uppercase', letterSpacing: '0.05em' }}>Total USD</div>
              <div style={{ fontSize: '1.25rem', fontWeight: 700, color: 'var(--admin-text)' }}>
                {payments ? currencyUsd.format(payments.totalByCurrency['USD'] || 0) : '…'}
              </div>
            </div>
            <div>
              <div style={{ fontSize: '0.75rem', color: 'var(--admin-text-muted)', textTransform: 'uppercase', letterSpacing: '0.05em' }}>Pagos</div>
              <div style={{ fontSize: '1.25rem', fontWeight: 700, color: 'var(--admin-text)' }}>
                {payments ? formatMetric(payments.count) : '…'}
              </div>
            </div>
          </div>

          {planBreakdown.length > 0 && (
            <>
              <div className="admin-divider" />
              <div>
                <div style={{ fontSize: '0.75rem', color: 'var(--admin-text-muted)', textTransform: 'uppercase', letterSpacing: '0.05em', marginBottom: 'var(--space-3)' }}>
                  Distribución por plan
                </div>
                <div style={{ display: 'flex', flexDirection: 'column', gap: 'var(--space-2)' }}>
                  {planBreakdown.map((plan) => (
                    <div key={plan.plan} style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                      <span className="badge badge-gray">{plan.label}</span>
                      <span style={{ fontWeight: 600, color: 'var(--admin-text)' }}>{currencyArs.format(plan.amount)}</span>
                    </div>
                  ))}
                </div>
              </div>
            </>
          )}
        </section>

        {/* Activity Card */}
        <section className="admin-card">
          <div className="admin-card-header">
            <div>
              <h3 className="admin-card-title">Actividad Reciente</h3>
              <p style={{ margin: 0, color: 'var(--admin-text-muted)', fontSize: '0.875rem' }}>
                Usuarios y publicaciones
              </p>
            </div>
            <div className="admin-card-icon amber">📈</div>
          </div>
          
          <div style={{ display: 'grid', gap: 'var(--space-4)' }}>
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', padding: 'var(--space-3)', background: 'var(--admin-gray-50)', borderRadius: 'var(--radius-lg)' }}>
              <div>
                <div style={{ fontSize: '0.75rem', color: 'var(--admin-text-muted)' }}>Nuevos usuarios (7d)</div>
                <div style={{ fontSize: '1.25rem', fontWeight: 700, color: 'var(--admin-text)' }}>
                  {userGrowth ? formatMetric(userGrowth.users7d) : '…'}
                </div>
              </div>
              {userGrowth && <DeltaBadge current={userGrowth.users7d} previous={userGrowth.usersPrev7d} />}
            </div>
            
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', padding: 'var(--space-3)', background: 'var(--admin-gray-50)', borderRadius: 'var(--radius-lg)' }}>
              <div>
                <div style={{ fontSize: '0.75rem', color: 'var(--admin-text-muted)' }}>Nuevos usuarios (30d)</div>
                <div style={{ fontSize: '1.25rem', fontWeight: 700, color: 'var(--admin-text)' }}>
                  {userGrowth ? formatMetric(userGrowth.users30d) : '…'}
                </div>
              </div>
              {userGrowth && <DeltaBadge current={userGrowth.users30d} previous={userGrowth.usersPrev30d} />}
            </div>
            
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', padding: 'var(--space-3)', background: 'var(--admin-gray-50)', borderRadius: 'var(--radius-lg)' }}>
              <div>
                <div style={{ fontSize: '0.75rem', color: 'var(--admin-text-muted)' }}>Nuevos avisos (30d)</div>
                <div style={{ fontSize: '1.25rem', fontWeight: 700, color: 'var(--admin-text)' }}>
                  {listingActivity ? formatMetric(listingActivity.created30d) : '…'}
                </div>
              </div>
              {listingActivity && <DeltaBadge current={listingActivity.created30d} previous={listingActivity.createdPrev30d} />}
            </div>
          </div>
        </section>
      </div>

      {/* Ideas Section */}
      <section className="admin-card">
        <div className="admin-card-header">
          <div>
            <h3 className="admin-card-title">Ideas para la próxima iteración</h3>
          </div>
          <div className="admin-card-icon blue">💡</div>
        </div>
        <ul style={{ margin: 0, paddingLeft: '1.25rem', color: 'var(--admin-text-secondary)', lineHeight: 1.8 }}>
          <li>Configurar alertas si las publicaciones pausadas superan un umbral semanal</li>
          <li>Crear segmentos de usuarios nuevos con alta actividad (vistas y clics)</li>
          <li>Relacionar planes vendidos vs planes activos para detectar churn</li>
        </ul>
      </section>
    </div>
  )
}
