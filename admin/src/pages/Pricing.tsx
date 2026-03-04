/**
 * Pricing Dashboard - Admin
 * Gestión del sistema de pricing de bicicletas
 */

import { useEffect, useState } from 'react'
import { getSupabaseClient } from '@app/services/supabase'

interface PricingStats {
  total: number
  active: number
  withModel: number
  bySource: Record<string, { total: number; active: number }>
}

interface PriceSuggestion {
  bike_model_id: string | null
  model: {
    brand: string
    model: string
    year: number
    category?: string
  }
  suggestion: {
    confidence: 'high' | 'medium' | 'low'
    price_ars: number | null
    range: { low: number; mid: number; high: number }
    sample_size: number
    calculated_at: string
  } | null
  sources: Record<string, { count: number; avg_price: number }>
  samples: Array<{
    source: string
    price: number
    province: string
    listed_at: string
  }>
}

const currencyArs = new Intl.NumberFormat('es-AR', {
  style: 'currency',
  currency: 'ARS',
  maximumFractionDigits: 0,
})

export function PricingPage() {
  const [stats, setStats] = useState<PricingStats | null>(null)
  const [loading, setLoading] = useState(true)
  const [searchParams, setSearchParams] = useState({
    brand: '',
    model: '',
    year: new Date().getFullYear(),
    condition: 'used' as const,
  })
  const [suggestion, setSuggestion] = useState<PriceSuggestion | null>(null)
  const [searching, setSearching] = useState(false)
  const [activeTab, setActiveTab] = useState<'overview' | 'suggest' | 'jobs'>('overview')

  const supabase = getSupabaseClient()

  useEffect(() => {
    loadStats()
  }, [])

  async function loadStats() {
    setLoading(true)
    
    // Totales
    const { count: total } = await supabase
      .from('price_listings')
      .select('*', { count: 'exact', head: true })
    
    const { count: active } = await supabase
      .from('price_listings')
      .select('*', { count: 'exact', head: true })
      .eq('status', 'active')
    
    const { count: withModel } = await supabase
      .from('price_listings')
      .select('bike_model_id', { count: 'exact', head: true })
      .not('bike_model_id', 'is', null)
    
    // Por fuente
    const { data: bySourceData } = await supabase
      .from('price_listings')
      .select('source, status')
    
    const bySource: Record<string, { total: number; active: number }> = {}
    bySourceData?.forEach(row => {
      if (!bySource[row.source]) {
        bySource[row.source] = { total: 0, active: 0 }
      }
      bySource[row.source].total++
      if (row.status === 'active') bySource[row.source].active++
    })
    
    setStats({
      total: total || 0,
      active: active || 0,
      withModel: withModel || 0,
      bySource,
    })
    setLoading(false)
  }

  async function searchPrice() {
    if (!searchParams.brand || !searchParams.model) return
    
    setSearching(true)
    
    try {
      const API_BASE = import.meta.env.VITE_API_BASE_URL || ''
      const params = new URLSearchParams({
        brand: searchParams.brand,
        model: searchParams.model,
        year: searchParams.year.toString(),
        condition: searchParams.condition,
        currency: 'ARS',
      })
      
      const response = await fetch(`${API_BASE}/api/v1/pricing/suggest?${params}`)
      
      if (response.ok) {
        const data = await response.json()
        setSuggestion(data)
      } else {
        setSuggestion(null)
      }
    } catch (err) {
      console.error('Error fetching suggestion:', err)
      setSuggestion(null)
    } finally {
      setSearching(false)
    }
  }

  function getConfidenceColor(confidence: string) {
    switch (confidence) {
      case 'high': return 'bg-green-100 text-green-800'
      case 'medium': return 'bg-yellow-100 text-yellow-800'
      case 'low': return 'bg-red-100 text-red-800'
      default: return 'bg-gray-100 text-gray-800'
    }
  }

  function getConfidenceLabel(confidence: string) {
    switch (confidence) {
      case 'high': return 'Alta confianza'
      case 'medium': return 'Confianza media'
      case 'low': return 'Baja confianza'
      default: return 'Desconocida'
    }
  }

  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-semibold text-gray-900">Pricing Database</h1>
          <p className="text-gray-500 mt-1">Base de datos de precios de bicicletas en Argentina</p>
        </div>
        <div className="flex gap-2">
          <button
            onClick={loadStats}
            className="px-4 py-2 bg-blue-600 text-white rounded-lg hover:bg-blue-700 transition-colors"
          >
            🔄 Actualizar
          </button>
        </div>
      </div>

      {/* Tabs */}
      <div className="border-b border-gray-200">
        <nav className="flex gap-6">
          {[
            { id: 'overview', label: '📊 Resumen', icon: '' },
            { id: 'suggest', label: '🔍 Sugerir Precio', icon: '' },
          ].map((tab) => (
            <button
              key={tab.id}
              onClick={() => setActiveTab(tab.id as any)}
              className={`pb-3 px-1 font-medium text-sm border-b-2 transition-colors ${
                activeTab === tab.id
                  ? 'border-blue-500 text-blue-600'
                  : 'border-transparent text-gray-500 hover:text-gray-700'
              }`}
            >
              {tab.label}
            </button>
          ))}
        </nav>
      </div>

      {/* Tab: Overview */}
      {activeTab === 'overview' && (
        <div className="space-y-6">
          {loading ? (
            <div className="text-center py-12 text-gray-500">Cargando estadísticas...</div>
          ) : (
            <>
              {/* Stats Cards */}
              <div className="grid grid-cols-1 md:grid-cols-4 gap-4">
                <div className="bg-white rounded-xl border p-6">
                  <div className="text-sm text-gray-500 mb-1">Total Listings</div>
                  <div className="text-3xl font-bold text-gray-900">{stats?.total.toLocaleString()}</div>
                </div>
                <div className="bg-white rounded-xl border p-6">
                  <div className="text-sm text-gray-500 mb-1">Activos</div>
                  <div className="text-3xl font-bold text-green-600">{stats?.active.toLocaleString()}</div>
                </div>
                <div className="bg-white rounded-xl border p-6">
                  <div className="text-sm text-gray-500 mb-1">Con Modelo</div>
                  <div className="text-3xl font-bold text-blue-600">{stats?.withModel.toLocaleString()}</div>
                </div>
                <div className="bg-white rounded-xl border p-6">
                  <div className="text-sm text-gray-500 mb-1">Fuentes</div>
                  <div className="text-3xl font-bold text-purple-600">{Object.keys(stats?.bySource || {}).length}</div>
                </div>
              </div>

              {/* By Source */}
              <div className="bg-white rounded-xl border p-6">
                <h3 className="font-semibold text-gray-900 mb-4">Listings por Fuente</h3>
                <div className="space-y-3">
                  {Object.entries(stats?.bySource || {}).map(([source, data]) => (
                    <div key={source} className="flex items-center justify-between p-3 bg-gray-50 rounded-lg">
                      <div className="flex items-center gap-3">
                        <span className="font-medium capitalize text-gray-900">{source}</span>
                        <span className="text-sm text-gray-500">
                          {data.active.toLocaleString()} / {data.total.toLocaleString()} activos
                        </span>
                      </div>
                      <div className="w-32 h-2 bg-gray-200 rounded-full overflow-hidden">
                        <div
                          className="h-full bg-blue-500 rounded-full"
                          style={{ width: `${(data.active / data.total) * 100}%` }}
                        />
                      </div>
                    </div>
                  ))}
                </div>
              </div>

              {/* Last 24h Activity */}
              <div className="bg-white rounded-xl border p-6">
                <h3 className="font-semibold text-gray-900 mb-4">Actividad Reciente</h3>
                <p className="text-gray-500 text-sm">
                  El sistema actualiza automáticamente cada hora desde Ciclo Market.
                </p>
              </div>
            </>
          )}
        </div>
      )}

      {/* Tab: Suggest */}
      {activeTab === 'suggest' && (
        <div className="space-y-6">
          {/* Search Form */}
          <div className="bg-white rounded-xl border p-6">
            <h3 className="font-semibold text-gray-900 mb-4">Consultar Precio de Mercado</h3>
            <div className="grid grid-cols-1 md:grid-cols-5 gap-4">
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1">Marca</label>
                <input
                  type="text"
                  value={searchParams.brand}
                  onChange={(e) => setSearchParams({ ...searchParams, brand: e.target.value })}
                  placeholder="Ej: Specialized"
                  className="w-full px-3 py-2 border rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-blue-500"
                />
              </div>
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1">Modelo</label>
                <input
                  type="text"
                  value={searchParams.model}
                  onChange={(e) => setSearchParams({ ...searchParams, model: e.target.value })}
                  placeholder="Ej: Tarmac"
                  className="w-full px-3 py-2 border rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-blue-500"
                />
              </div>
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1">Año</label>
                <input
                  type="number"
                  value={searchParams.year}
                  onChange={(e) => setSearchParams({ ...searchParams, year: parseInt(e.target.value) })}
                  className="w-full px-3 py-2 border rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-blue-500"
                />
              </div>
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1">Condición</label>
                <select
                  value={searchParams.condition}
                  onChange={(e) => setSearchParams({ ...searchParams, condition: e.target.value as any })}
                  className="w-full px-3 py-2 border rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-blue-500"
                >
                  <option value="new">Nueva</option>
                  <option value="like_new">Como nueva</option>
                  <option value="used">Usada</option>
                  <option value="good">Buena</option>
                  <option value="fair">Regular</option>
                </select>
              </div>
              <div className="flex items-end">
                <button
                  onClick={searchPrice}
                  disabled={searching || !searchParams.brand || !searchParams.model}
                  className="w-full px-4 py-2 bg-blue-600 text-white rounded-lg hover:bg-blue-700 disabled:opacity-50 disabled:cursor-not-allowed transition-colors"
                >
                  {searching ? 'Buscando...' : '🔍 Consultar'}
                </button>
              </div>
            </div>
          </div>

          {/* Results */}
          {suggestion && (
            <div className="bg-white rounded-xl border p-6">
              {suggestion.suggestion ? (
                <div className="space-y-6">
                  {/* Header */}
                  <div className="flex items-center justify-between pb-4 border-b">
                    <div>
                      <h3 className="text-xl font-bold text-gray-900">
                        {suggestion.model.brand} {suggestion.model.model} {suggestion.model.year}
                      </h3>
                      <p className="text-gray-500">{suggestion.model.category}</p>
                    </div>
                    <span className={`px-3 py-1 rounded-full text-sm font-medium ${getConfidenceColor(suggestion.suggestion.confidence)}`}>
                      {getConfidenceLabel(suggestion.suggestion.confidence)}
                    </span>
                  </div>

                  {/* Price */}
                  <div className="text-center py-6 bg-gray-50 rounded-xl">
                    <div className="text-sm text-gray-500 mb-1">Precio sugerido</div>
                    <div className="text-4xl font-bold text-gray-900">
                      {currencyArs.format(suggestion.suggestion.range.mid)}
                    </div>
                    <div className="text-gray-500 mt-2">
                      Rango: {currencyArs.format(suggestion.suggestion.range.low)} - {currencyArs.format(suggestion.suggestion.range.high)}
                    </div>
                  </div>

                  {/* Stats */}
                  <div className="grid grid-cols-3 gap-4">
                    <div className="text-center p-4 bg-blue-50 rounded-lg">
                      <div className="text-2xl font-bold text-blue-600">{suggestion.suggestion.sample_size}</div>
                      <div className="text-sm text-gray-600">muestras</div>
                    </div>
                    <div className="text-center p-4 bg-green-50 rounded-lg">
                      <div className="text-2xl font-bold text-green-600">{Object.keys(suggestion.sources).length}</div>
                      <div className="text-sm text-gray-600">fuentes</div>
                    </div>
                    <div className="text-center p-4 bg-purple-50 rounded-lg">
                      <div className="text-2xl font-bold text-purple-600">
                        {new Date(suggestion.suggestion.calculated_at).toLocaleDateString('es-AR')}
                      </div>
                      <div className="text-sm text-gray-600">actualizado</div>
                    </div>
                  </div>

                  {/* Sources */}
                  {Object.keys(suggestion.sources).length > 0 && (
                    <div>
                      <h4 className="font-medium text-gray-900 mb-3">Fuentes de datos</h4>
                      <div className="space-y-2">
                        {Object.entries(suggestion.sources).map(([source, data]) => (
                          <div key={source} className="flex items-center justify-between p-3 bg-gray-50 rounded-lg">
                            <span className="capitalize font-medium text-gray-700">{source}</span>
                            <div className="text-right">
                              <span className="text-gray-500 text-sm mr-3">{data.count} pubs</span>
                              <span className="font-semibold">{currencyArs.format(data.avg_price)}</span>
                            </div>
                          </div>
                        ))}
                      </div>
                    </div>
                  )}

                  {/* Recent samples */}
                  {suggestion.samples && suggestion.samples.length > 0 && (
                    <div>
                      <h4 className="font-medium text-gray-900 mb-3">Publicaciones recientes</h4>
                      <div className="space-y-2 max-h-60 overflow-y-auto">
                        {suggestion.samples.slice(0, 10).map((sample, i) => (
                          <div key={i} className="flex items-center justify-between p-3 border rounded-lg">
                            <div>
                              <span className="capitalize text-gray-600">{sample.source}</span>
                              {sample.province && (
                                <span className="text-gray-400 text-sm ml-2">• {sample.province}</span>
                              )}
                            </div>
                            <span className="font-semibold">{currencyArs.format(sample.price)}</span>
                          </div>
                        ))}
                      </div>
                    </div>
                  )}
                </div>
              ) : (
                <div className="text-center py-8 text-gray-500">
                  <p className="text-lg mb-2">No hay datos suficientes</p>
                  <p className="text-sm">No encontramos publicaciones similares para este modelo.</p>
                  {suggestion.alternatives && (
                    <div className="mt-4">
                      <p className="font-medium text-gray-700 mb-2">Sugerencias:</p>
                      <ul className="list-disc list-inside text-left max-w-md mx-auto">
                        {suggestion.alternatives.actions.map((action, i) => (
                          <li key={i}>{action}</li>
                        ))}
                      </ul>
                    </div>
                  )}
                </div>
              )}
            </div>
          )}
        </div>
      )}
    </div>
  )
}

export default PricingPage
