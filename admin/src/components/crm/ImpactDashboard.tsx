/**
 * Impact Dashboard - Ciclo Market Metrics
 * Shows conversion rates, sales by category/city, time to sale
 */

import { useEffect, useState } from 'react'
import { 
  fetchImpactMetrics, 
  fetchSalesByCategory, 
  fetchSalesByCity,
  fetchConversionFunnel 
} from '@admin/services/crmAdvanced'

export function ImpactDashboard() {
  const [period, setPeriod] = useState<'7d' | '30d' | '90d'>('30d')
  const [loading, setLoading] = useState(true)
  const [metrics, setMetrics] = useState<any>(null)
  const [categoryData, setCategoryData] = useState<any[]>([])
  const [cityData, setCityData] = useState<any[]>([])
  const [funnel, setFunnel] = useState<any>(null)

  const loadData = async () => {
    setLoading(true)
    try {
      const [m, c, city, f] = await Promise.all([
        fetchImpactMetrics(period),
        fetchSalesByCategory(period),
        fetchSalesByCity(period),
        fetchConversionFunnel(period),
      ])
      setMetrics(m)
      setCategoryData(c)
      setCityData(city)
      setFunnel(f)
    } catch (err) {
      console.error('[impact-dashboard] load failed', err)
    } finally {
      setLoading(false)
    }
  }

  useEffect(() => {
    loadData()
  }, [period])

  const formatCurrency = (val: number) => 
    new Intl.NumberFormat('es-AR', { style: 'currency', currency: 'ARS', maximumFractionDigits: 0 }).format(val)

  const formatPercent = (val: number) => `${val.toFixed(1)}%`

  if (loading) {
    return (
      <div className="admin-loading" style={{ minHeight: '400px' }}>
        <div className="admin-spinner" />
      </div>
    )
  }

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 'var(--space-6)' }}>
      {/* Header with period selector */}
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
        <div>
          <h2 style={{ margin: 0, fontSize: '1.5rem', fontWeight: 700 }}>📊 Impacto Ciclo Market</h2>
          <p style={{ margin: 'var(--space-1) 0 0', color: 'var(--admin-text-muted)' }}>
            Métricas de conversión y ventas para inversores y partners
          </p>
        </div>
        <div style={{ display: 'flex', gap: 'var(--space-2)' }}>
          {(['7d', '30d', '90d'] as const).map(p => (
            <button
              key={p}
              onClick={() => setPeriod(p)}
              className={`btn ${period === p ? 'btn-primary' : 'btn-secondary'}`}
              style={{ minWidth: '60px' }}
            >
              {p === '7d' ? '7 días' : p === '30d' ? '30 días' : '90 días'}
            </button>
          ))}
        </div>
      </div>

      {/* Main KPI Cards */}
      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(220px, 1fr))', gap: 'var(--space-4)' }}>
        <KPICard
          label="💰 Ventas Confirmadas"
          value={metrics?.confirmed_sales || 0}
          change={metrics?.sales_change}
          format="number"
          subtitle={`${formatCurrency(metrics?.total_revenue || 0)} en GMV`}
          color="#10b981"
        />
        <KPICard
          label="📈 Tasa de Conversión"
          value={metrics?.conversion_rate || 0}
          change={metrics?.conversion_change}
          format="percent"
          subtitle="Listing → Venta"
          color="#3b82f6"
        />
        <KPICard
          label="⏱️ Tiempo Medio a Venta"
          value={metrics?.avg_time_to_sale || 0}
          change={metrics?.time_change}
          format="days"
          subtitle="Días desde publicación"
          color="#8b5cf6"
          invertChange={true}
        />
        <KPICard
          label="🚴 Listings Activos"
          value={metrics?.active_listings || 0}
          change={metrics?.listings_change}
          format="number"
          subtitle="Con al menos 1 contacto"
          color="#f59e0b"
        />
      </div>

      {/* Conversion Funnel */}
      {funnel && (
        <div style={{
          background: 'var(--admin-surface)',
          borderRadius: 'var(--radius-xl)',
          padding: 'var(--space-6)',
          border: '1px solid var(--admin-border)',
        }}>
          <h3 style={{ margin: '0 0 var(--space-5)', fontSize: '1.125rem', fontWeight: 700 }}>
            🎯 Embudo de Conversión
          </h3>
          
          <div style={{ display: 'flex', alignItems: 'center', gap: 'var(--space-3)', flexWrap: 'wrap' }}>
            <FunnelStage
              icon="👁️"
              label="Vistas"
              value={funnel.views}
              percent={100}
              color="#6366f1"
            />
            <FunnelArrow rate={funnel.inquiries / funnel.views * 100} />
            <FunnelStage
              icon="💬"
              label="Consultas"
              value={funnel.inquiries}
              percent={funnel.inquiries / funnel.views * 100}
              color="#3b82f6"
            />
            <FunnelArrow rate={funnel.whatsapp_clicks / funnel.inquiries * 100} />
            <FunnelStage
              icon="📱"
              label="Clicks WhatsApp"
              value={funnel.whatsapp_clicks}
              percent={funnel.whatsapp_clicks / funnel.views * 100}
              color="#10b981"
            />
            <FunnelArrow rate={funnel.confirmed_sales / funnel.whatsapp_clicks * 100} />
            <FunnelStage
              icon="✅"
              label="Ventas"
              value={funnel.confirmed_sales}
              percent={funnel.conversion_rate}
              color="#059669"
            />
          </div>

          <div style={{
            marginTop: 'var(--space-4)',
            padding: 'var(--space-4)',
            background: '#ecfdf5',
            borderRadius: 'var(--radius-lg)',
            display: 'flex',
            justifyContent: 'space-around',
            flexWrap: 'wrap',
            gap: 'var(--space-4)',
          }}>
            <div style={{ textAlign: 'center' }}>
              <div style={{ fontSize: '1.5rem', fontWeight: 800, color: '#047857' }}>
                {formatPercent(funnel.conversion_rate)}
              </div>
              <div style={{ fontSize: '0.75rem', color: '#065f46' }}>Tasa de Conversión Total</div>
            </div>
            <div style={{ textAlign: 'center' }}>
              <div style={{ fontSize: '1.5rem', fontWeight: 800, color: '#047857' }}>
                {formatCurrency((metrics?.total_revenue || 0) / (funnel.confirmed_sales || 1))}
              </div>
              <div style={{ fontSize: '0.75rem', color: '#065f46' }}>Ticket Promedio</div>
            </div>
            <div style={{ textAlign: 'center' }}>
              <div style={{ fontSize: '1.5rem', fontWeight: 800, color: '#047857' }}>
                {Math.round((funnel.inquiries || 0) / (funnel.views || 1) * 1000)}
              </div>
              <div style={{ fontSize: '0.75rem', color: '#065f46' }}>Consultas por 1000 vistas</div>
            </div>
          </div>
        </div>
      )}

      {/* Two Column Layout */}
      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(400px, 1fr))', gap: 'var(--space-6)' }}>
        {/* Sales by Category */}
        <div style={{
          background: 'var(--admin-surface)',
          borderRadius: 'var(--radius-xl)',
          padding: 'var(--space-6)',
          border: '1px solid var(--admin-border)',
        }}>
          <h3 style={{ margin: '0 0 var(--space-4)', fontSize: '1.125rem', fontWeight: 700 }}>
            🚲 Ventas por Categoría
          </h3>
          
          <div style={{ display: 'flex', flexDirection: 'column', gap: 'var(--space-3)' }}>
            {categoryData.map((cat, i) => (
              <div key={cat.category} style={{ display: 'flex', alignItems: 'center', gap: 'var(--space-3)' }}>
                <div style={{ width: 24, textAlign: 'center', fontSize: '1.125rem' }}>
                  {['🚵', '🚴', '🏔️', '🏁', '🎒'][i % 5]}
                </div>
                <div style={{ flex: 1 }}>
                  <div style={{ display: 'flex', justifyContent: 'space-between', marginBottom: 4 }}>
                    <span style={{ fontSize: '0.875rem', fontWeight: 500 }}>{cat.category}</span>
                    <span style={{ fontSize: '0.875rem', color: 'var(--admin-text-muted)' }}>
                      {cat.sales} ventas
                    </span>
                  </div>
                  <div style={{ 
                    height: 8, 
                    background: 'var(--admin-gray-100)', 
                    borderRadius: 4,
                    overflow: 'hidden',
                  }}>
                    <div style={{
                      width: `${Math.min(cat.sales / Math.max(...categoryData.map(c => c.sales)) * 100, 100)}%`,
                      height: '100%',
                      background: `hsl(${200 + i * 30}, 70%, 50%)`,
                      borderRadius: 4,
                    }} />
                  </div>
                </div>
                <div style={{ minWidth: 80, textAlign: 'right' }}>
                  <div style={{ fontSize: '0.875rem', fontWeight: 600 }}>
                    {formatCurrency(cat.revenue)}
                  </div>
                  <div style={{ fontSize: '0.75rem', color: 'var(--admin-text-muted)' }}>
                    {cat.avg_time_to_sale}d avg
                  </div>
                </div>
              </div>
            ))}
          </div>
        </div>

        {/* Sales by City */}
        <div style={{
          background: 'var(--admin-surface)',
          borderRadius: 'var(--radius-xl)',
          padding: 'var(--space-6)',
          border: '1px solid var(--admin-border)',
        }}>
          <h3 style={{ margin: '0 0 var(--space-4)', fontSize: '1.125rem', fontWeight: 700 }}>
            🌍 Ventas por Ciudad
          </h3>
          
          <div style={{ display: 'flex', flexDirection: 'column', gap: 'var(--space-3)' }}>
            {cityData.slice(0, 8).map((city, i) => (
              <div key={city.city} style={{ display: 'flex', alignItems: 'center', gap: 'var(--space-3)' }}>
                <div style={{
                  width: 32,
                  height: 32,
                  borderRadius: '50%',
                  background: 'var(--admin-gray-100)',
                  display: 'grid',
                  placeItems: 'center',
                  fontSize: '0.875rem',
                  fontWeight: 700,
                  color: 'var(--admin-text-muted)',
                }}>
                  {i + 1}
                </div>
                <div style={{ flex: 1 }}>
                  <div style={{ display: 'flex', justifyContent: 'space-between', marginBottom: 4 }}>
                    <span style={{ fontSize: '0.875rem', fontWeight: 500 }}>{city.city}</span>
                    <span style={{ fontSize: '0.875rem', color: 'var(--admin-text-muted)' }}>
                      {city.sellers} vendedores
                    </span>
                  </div>
                </div>
                <div style={{ textAlign: 'right' }}>
                  <div style={{ fontSize: '0.875rem', fontWeight: 600 }}>
                    {city.sales} ventas
                  </div>
                  <div style={{ fontSize: '0.75rem', color: 'var(--cm-success)' }}>
                    {formatCurrency(city.revenue)}
                  </div>
                </div>
              </div>
            ))}
          </div>
        </div>
      </div>
    </div>
  )
}

// Helper Components

function KPICard({ 
  label, 
  value, 
  change, 
  format, 
  subtitle, 
  color,
  invertChange 
}: {
  label: string
  value: number
  change?: number
  format: 'number' | 'percent' | 'days' | 'currency'
  subtitle: string
  color: string
  invertChange?: boolean
}) {
  const formatValue = () => {
    if (format === 'number') return value.toLocaleString()
    if (format === 'percent') return `${value.toFixed(1)}%`
    if (format === 'days') return `${value.toFixed(0)}d`
    return value.toString()
  }

  const isPositive = invertChange ? (change || 0) < 0 : (change || 0) > 0

  return (
    <div style={{
      background: 'var(--admin-surface)',
      borderRadius: 'var(--radius-xl)',
      padding: 'var(--space-5)',
      border: '1px solid var(--admin-border)',
    }}>
      <div style={{ fontSize: '0.75rem', color: 'var(--admin-text-muted)', marginBottom: 'var(--space-2)' }}>
        {label}
      </div>
      <div style={{ fontSize: '1.75rem', fontWeight: 800, color, marginBottom: 'var(--space-1)' }}>
        {formatValue()}
      </div>
      <div style={{ fontSize: '0.75rem', color: 'var(--admin-text-muted)' }}>
        {subtitle}
      </div>
      {change !== undefined && (
        <div style={{ 
          marginTop: 'var(--space-2)',
          fontSize: '0.75rem', 
          fontWeight: 600,
          color: isPositive ? '#10b981' : '#ef4444',
        }}>
          {isPositive ? '↑' : '↓'} {Math.abs(change).toFixed(1)}%
        </div>
      )}
    </div>
  )
}

function FunnelStage({ icon, label, value, percent, color }: {
  icon: string
  label: string
  value: number
  percent: number
  color: string
}) {
  return (
    <div style={{
      background: `${color}15`,
      border: `1px solid ${color}30`,
      borderRadius: 'var(--radius-lg)',
      padding: 'var(--space-4)',
      minWidth: '120px',
      textAlign: 'center',
    }}>
      <div style={{ fontSize: '1.5rem', marginBottom: 'var(--space-1)' }}>{icon}</div>
      <div style={{ fontSize: '1.125rem', fontWeight: 700, color }}>{value.toLocaleString()}</div>
      <div style={{ fontSize: '0.75rem', color: 'var(--admin-text-muted)' }}>{label}</div>
      <div style={{ fontSize: '0.625rem', fontWeight: 600, color, marginTop: 4 }}>
        {percent.toFixed(1)}%
      </div>
    </div>
  )
}

function FunnelArrow({ rate }: { rate: number }) {
  return (
    <div style={{ textAlign: 'center', minWidth: '60px' }}>
      <div style={{ fontSize: '1.5rem', color: rate > 50 ? '#10b981' : rate > 20 ? '#f59e0b' : '#ef4444' }}>
        →
      </div>
      <div style={{ fontSize: '0.625rem', color: 'var(--admin-text-muted)', fontWeight: 600 }}>
        {rate.toFixed(1)}%
      </div>
    </div>
  )
}
