/**
 * PriceSuggestion Component
 * Muestra sugerencia de precio con rangos y fuentes
 */

import React, { useState, useEffect } from 'react'
import { 
  getPriceSuggestion, 
  formatPriceRange, 
  getConfidenceLabel,
  getConfidenceDescription,
  type PriceSuggestion 
} from '../../services/pricingApi'
import { TrendingUp, TrendingDown, Minus, Database, ExternalLink } from 'lucide-react'

interface PriceSuggestionProps {
  brand: string
  model: string
  year: number
  condition?: 'new' | 'like_new' | 'used' | 'good' | 'fair' | 'poor'
  currency?: string
  className?: string
}

export const PriceSuggestion: React.FC<PriceSuggestionProps> = ({
  brand,
  model,
  year,
  condition = 'used',
  currency = 'ARS',
  className = ''
}) => {
  const [suggestion, setSuggestion] = useState<PriceSuggestion | null>(null)
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)

  useEffect(() => {
    const fetchSuggestion = async () => {
      setLoading(true)
      setError(null)
      
      try {
        const data = await getPriceSuggestion({
          brand,
          model,
          year,
          condition,
          currency
        })
        setSuggestion(data)
      } catch (err) {
        setError(err instanceof Error ? err.message : 'Error desconocido')
      } finally {
        setLoading(false)
      }
    }

    fetchSuggestion()
  }, [brand, model, year, condition, currency])

  if (loading) {
    return (
      <div className={`bg-gray-50 rounded-lg p-4 animate-pulse ${className}`}>
        <div className="h-4 bg-gray-200 rounded w-1/3 mb-2"></div>
        <div className="h-8 bg-gray-200 rounded w-2/3 mb-2"></div>
        <div className="h-4 bg-gray-200 rounded w-1/2"></div>
      </div>
    )
  }

  if (error || !suggestion?.suggestion) {
    return (
      <div className={`bg-gray-50 rounded-lg p-4 ${className}`}>
        <p className="text-gray-500 text-sm">
          {error || 'No hay datos de precios disponibles para este modelo'}
        </p>
        {suggestion?.alternatives && (
          <div className="mt-2 text-sm text-gray-600">
            <p className="font-medium">Sugerencias:</p>
            <ul className="list-disc list-inside mt-1">
              {suggestion.alternatives.actions.map((action, i) => (
                <li key={i}>{action}</li>
              ))}
            </ul>
          </div>
        )}
      </div>
    )
  }

  const { suggestion: priceData, sources, samples } = suggestion
  const confidence = getConfidenceLabel(priceData.confidence)
  const formatter = new Intl.NumberFormat('es-AR', {
    style: 'currency',
    currency: priceData.currency,
    maximumFractionDigits: 0
  })

  // Calcular tendencia
  const trend = priceData.sample_size > 5 ? 'stable' : 'unknown'
  const TrendIcon = trend === 'up' ? TrendingUp : trend === 'down' ? TrendingDown : Minus

  return (
    <div className={`bg-white border rounded-lg p-4 shadow-sm ${className}`}>
      {/* Header */}
      <div className="flex items-center justify-between mb-3">
        <h3 className="font-semibold text-gray-900 flex items-center gap-2">
          <Database className="w-4 h-4 text-blue-500" />
          Precio de Mercado
        </h3>
        <span className={`text-xs font-medium px-2 py-1 rounded-full ${confidence.color.replace('text-', 'bg-').replace('600', '100')} ${confidence.color}`}>
          {confidence.text}
        </span>
      </div>

      {/* Precio principal */}
      <div className="mb-4">
        <div className="text-3xl font-bold text-gray-900">
          {formatter.format(priceData.range.mid)}
        </div>
        <div className="text-sm text-gray-500">
          Rango: {formatPriceRange(priceData)}
        </div>
      </div>

      {/* Stats */}
      <div className="grid grid-cols-3 gap-2 mb-4 text-center">
        <div className="bg-gray-50 rounded p-2">
          <div className="text-lg font-semibold text-gray-900">
            {priceData.sample_size}
          </div>
          <div className="text-xs text-gray-500">muestras</div>
        </div>
        <div className="bg-gray-50 rounded p-2">
          <div className="text-lg font-semibold text-gray-900 flex items-center justify-center gap-1">
            <TrendIcon className="w-4 h-4" />
          </div>
          <div className="text-xs text-gray-500">tendencia</div>
        </div>
        <div className="bg-gray-50 rounded p-2">
          <div className="text-lg font-semibold text-gray-900">
            {Object.keys(sources).length}
          </div>
          <div className="text-xs text-gray-500">fuentes</div>
        </div>
      </div>

      {/* Fuentes */}
      {Object.keys(sources).length > 0 && (
        <div className="mb-4">
          <h4 className="text-xs font-medium text-gray-500 uppercase mb-2">
            Fuentes de datos
          </h4>
          <div className="space-y-1">
            {Object.entries(sources).map(([source, data]) => (
              <div key={source} className="flex justify-between items-center text-sm">
                <span className="capitalize text-gray-600">{source}</span>
                <div className="flex items-center gap-2">
                  <span className="text-gray-500">{data.count} pubs</span>
                  <span className="font-medium">
                    {formatter.format(data.avg_price)}
                  </span>
                </div>
              </div>
            ))}
          </div>
        </div>
      )}

      {/* Muestras recientes */}
      {samples && samples.length > 0 && (
        <div>
          <h4 className="text-xs font-medium text-gray-500 uppercase mb-2">
            Publicaciones recientes
          </h4>
          <div className="space-y-2 max-h-40 overflow-y-auto">
            {samples.slice(0, 5).map((sample, i) => (
              <div key={i} className="flex justify-between items-center text-sm p-2 bg-gray-50 rounded">
                <div>
                  <span className="capitalize text-gray-600">{sample.source}</span>
                  <span className="text-gray-400 mx-1">•</span>
                  <span className="text-gray-500">{sample.condition}</span>
                </div>
                <span className="font-medium">
                  {formatter.format(sample.price)}
                </span>
              </div>
            ))}
          </div>
        </div>
      )}

      {/* Footer */}
      <div className="mt-4 pt-3 border-t text-xs text-gray-400">
        {getConfidenceDescription(priceData.confidence, priceData.sample_size)}
        <br />
        Actualizado: {new Date(priceData.calculated_at).toLocaleDateString('es-AR')}
      </div>
    </div>
  )
}

export default PriceSuggestion
