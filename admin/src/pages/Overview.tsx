import { useEffect, useMemo, useState } from 'react'
import { fetchSummaryMetrics, summarizeRecentPayments, type SummaryMetrics } from '@admin/services/metrics'

const numberFormatter = new Intl.NumberFormat('es-AR')

function formatMetric(value: number | null): string {
  if (value === null) return '—'
  return numberFormatter.format(value)
}

export default function OverviewPage() {
  const [metrics, setMetrics] = useState<SummaryMetrics | null>(null)
  const [payments, setPayments] = useState<{ count: number; totalArs: number; totalUsd: number } | null>(null)
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)

  useEffect(() => {
    let active = true
    setLoading(true)
    setError(null)

    Promise.all([fetchSummaryMetrics(), summarizeRecentPayments(90)])
      .then(([data, pay]) => {
        if (!active) return
        setMetrics(data)
        const ars = pay.totalByCurrency['ARS'] || 0
        const usd = pay.totalByCurrency['USD'] || 0
        setPayments({ count: pay.count, totalArs: ars, totalUsd: usd })
      })
      .catch((err) => {
        console.warn('[admin] overview metrics failed', err)
        if (!active) return
        setError('No pudimos cargar las métricas. Intentá nuevamente en unos minutos.')
      })
      .finally(() => {
        if (active) setLoading(false)
      })

    return () => {
      active = false
    }
  }, [])

  const cards = useMemo(() => ([
    {
      title: 'Usuarios totales',
      description: 'Perfiles creados en el marketplace (tabla users).',
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
      title: 'Avisos pausados',
      description: 'Publicaciones detenidas por el usuario o moderación.',
      value: formatMetric(metrics?.pausedListings ?? null),
    },
    {
      title: 'Checkouts confirmados',
      description: 'Pagos exitosos registrados (últimos 90 días).',
      value: payments ? formatMetric(payments.count) : '…',
    },
  ]), [metrics, payments])

  return (
    <div>
      <section className="admin-grid" style={{ marginBottom: '2rem' }}>
        {cards.map((card) => (
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
        <div className="admin-card" style={{ borderColor: 'rgba(255,107,107,0.4)', color: '#ff8f8f' }}>
          {error}
        </div>
      ) : null}

      <section className="admin-card" style={{ marginBottom: '2rem' }}>
        <h3>Próximos pasos sugeridos</h3>
        <ul style={{ margin: '0.5rem 0 0', paddingLeft: '1.2rem', color: '#91a4ba', lineHeight: 1.7 }}>
          <li>Comparar estas métricas con la semana anterior para detectar variaciones grandes.</li>
          <li>Agregar alertas automáticas cuando el número de avisos pausados crezca de forma inusual.</li>
          <li>Sumar breakdown por moneda: ARS vs USD (ya disponible).</li>
        </ul>
      </section>
    </div>
  )
}
