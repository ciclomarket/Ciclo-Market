/**
 * Pricing API Routes
 * Endpoints para ingesta de datos y consultas de precios
 */

const express = require('express')
const { createClient } = require('@supabase/supabase-js')
const { z } = require('zod')

const router = express.Router()

// Cliente Supabase
const supabase = createClient(
  process.env.SUPABASE_URL,
  process.env.SUPABASE_SERVICE_ROLE_KEY
)

// Schemas de validación
const IngestItemSchema = z.object({
  external_id: z.string().min(1).max(255),
  title: z.string().min(1).max(500),
  price: z.number().positive(),
  currency: z.string().length(3).default('ARS'),
  price_usd: z.number().positive().optional(),
  url: z.string().url().optional(),
  condition: z.enum(['new', 'like_new', 'used', 'good', 'fair', 'poor']).optional(),
  brand: z.string().optional(),
  model: z.string().optional(),
  year: z.number().int().min(1980).max(2030).optional(),
  size: z.string().optional(),
  color: z.string().optional(),
  province: z.string().optional(),
  city: z.string().optional(),
  listed_at: z.string().datetime().optional(),
  raw_data: z.record(z.any()).optional()
})

const IngestRequestSchema = z.object({
  source: z.string().min(1),
  auth_token: z.string().optional(),
  items: z.array(IngestItemSchema).min(1).max(1000)
})

const PriceSuggestionSchema = z.object({
  brand: z.string().min(1),
  model: z.string().min(1),
  year: z.number().int().min(1980).max(2030),
  condition: z.enum(['new', 'like_new', 'used', 'good', 'fair', 'poor']).default('used'),
  currency: z.string().length(3).default('ARS')
})

/**
 * Middleware de autenticación para fuentes externas
 */
async function validateSourceAuth(req, res, next) {
  const { source, auth_token } = req.body

  // Buscar fuente
  const { data: sourceData, error } = await supabase
    .from('scraping_sources')
    .select('id, name, is_active, config')
    .eq('name', source)
    .single()

  if (error || !sourceData) {
    return res.status(400).json({ error: 'Unknown source', code: 'unknown_source' })
  }

  if (!sourceData.is_active) {
    return res.status(403).json({ error: 'Source is inactive', code: 'source_inactive' })
  }

  // Validar token si la fuente lo requiere
  const requiresAuth = sourceData.config?.requires_auth !== false
  if (requiresAuth) {
    // En producción, validar contra tokens almacenados
    // Por ahora, aceptamos cualquier token no vacío para fuentes confiables
    if (!auth_token && sourceData.name !== 'manual') {
      return res.status(401).json({ error: 'Auth token required', code: 'auth_required' })
    }
  }

  req.sourceData = sourceData
  next()
}

/**
 * POST /api/v1/pricing/ingest
 * Ingesta datos de precios desde fuentes externas
 */
router.post('/ingest', async (req, res) => {
  try {
    // Validar request body
    const validation = IngestRequestSchema.safeParse(req.body)
    if (!validation.success) {
      return res.status(400).json({
        error: 'Validation failed',
        code: 'validation_error',
        details: validation.error.errors
      })
    }

    const { source, items } = validation.data

    // Validar fuente
    const { data: sourceData, error: sourceError } = await supabase
      .from('scraping_sources')
      .select('id, name, is_active')
      .eq('name', source)
      .single()

    if (sourceError || !sourceData) {
      return res.status(400).json({ error: 'Unknown source', code: 'unknown_source' })
    }

    if (!sourceData.is_active) {
      return res.status(403).json({ error: 'Source is inactive', code: 'source_inactive' })
    }

    // Crear job de ingesta
    const { data: job, error: jobError } = await supabase
      .from('scraping_jobs')
      .insert({
        source_id: sourceData.id,
        job_type: 'api_ingest',
        params: { items, source },
        priority: 3,
        status: 'pending',
        scheduled_at: new Date().toISOString(),
        executed_by: 'api'
      })
      .select()
      .single()

    if (jobError) throw jobError

    // Ejecutar inmediatamente (en producción, esto podría ir a una cola)
    const pricingScraper = require('../services/pricingScraperService')
    const result = await pricingScraper.executeScrapingJob({
      ...job,
      scraping_sources: sourceData
    })

    res.json({
      success: true,
      job_id: job.id,
      processed: result.processed,
      inserted: result.inserted,
      updated: result.updated,
      failed: result.failed || 0,
      errors: result.errors || []
    })

  } catch (err) {
    console.error('[Pricing API] Ingest error:', err)
    res.status(500).json({
      error: 'Internal server error',
      code: 'server_error',
      message: err.message
    })
  }
})

/**
 * GET /api/v1/pricing/suggest
 * Obtiene sugerencia de precio para un modelo
 */
router.get('/suggest', async (req, res) => {
  try {
    const validation = PriceSuggestionSchema.safeParse({
      brand: req.query.brand,
      model: req.query.model,
      year: req.query.year ? parseInt(req.query.year) : undefined,
      condition: req.query.condition,
      currency: req.query.currency
    })

    if (!validation.success) {
      return res.status(400).json({
        error: 'Validation failed',
        code: 'validation_error',
        details: validation.error.errors
      })
    }

    const { brand, model, year, condition, currency } = validation.data

    // Buscar bike_model_id
    const { data: bikeModel, error: modelError } = await supabase
      .from('bike_models')
      .select('id, brand, model, year_released, category')
      .ilike('brand', brand)
      .ilike('model', `%${model}%`)
      .single()

    if (modelError || !bikeModel) {
      // Intentar buscar en aliases
      const { data: alias } = await supabase
        .from('bike_model_aliases')
        .select('bike_model_id, bike_models(*)')
        .ilike('alias', `%${model}%`)
        .limit(1)
        .single()

      if (!alias) {
        return res.status(404).json({
          error: 'Model not found',
          code: 'model_not_found',
          suggestion: 'Try searching with different spelling or check available models'
        })
      }
    }

    const bikeModelId = bikeModel?.id

    // Buscar precios de mercado exactos
    const { data: marketPrice, error: priceError } = await supabase
      .from('market_prices')
      .select('*')
      .eq('bike_model_id', bikeModelId)
      .eq('condition', condition)
      .eq('year', year)
      .eq('currency', currency)
      .order('calculated_at', { ascending: false })
      .limit(1)
      .single()

    // Si no hay precio exacto, buscar similares (±2 años)
    let similarPrices = null
    if (!marketPrice) {
      const { data: similar } = await supabase
        .from('market_prices')
        .select('*')
        .eq('bike_model_id', bikeModelId)
        .eq('condition', condition)
        .eq('currency', currency)
        .gte('year', year - 2)
        .lte('year', year + 2)
        .order('sample_size', { ascending: false })
        .limit(1)
        .single()
      
      similarPrices = similar
    }

    // Buscar listings individuales para muestras
    const { data: samples } = await supabase
      .from('price_listings')
      .select('source, price, currency, condition, province, scraped_at, external_url')
      .eq('bike_model_id', bikeModelId)
      .eq('status', 'active')
      .eq('currency', currency)
      .order('scraped_at', { ascending: false })
      .limit(10)

    // Calcular fuentes
    const sources = {}
    if (samples) {
      samples.forEach(s => {
        if (!sources[s.source]) {
          sources[s.source] = { count: 0, avg_price: 0, total: 0 }
        }
        sources[s.source].count++
        sources[s.source].total += s.price
      })
      
      Object.keys(sources).forEach(key => {
        sources[key].avg_price = Math.round(sources[key].total / sources[key].count)
        delete sources[key].total
      })
    }

    // Construir respuesta
    const hasExact = !!marketPrice
    const hasSimilar = !!similarPrices
    const confidence = hasExact ? 'high' : hasSimilar ? 'medium' : 'low'
    
    const priceData = marketPrice || similarPrices

    res.json({
      bike_model_id: bikeModelId,
      model: {
        brand: bikeModel?.brand,
        model: bikeModel?.model,
        year: year,
        category: bikeModel?.category
      },
      suggestion: priceData ? {
        confidence,
        price_ars: currency === 'ARS' ? priceData.median_price : null,
        price_usd: currency === 'USD' ? priceData.median_price : null,
        currency,
        range: {
          low: priceData.p25 || priceData.min_price,
          mid: priceData.median_price,
          high: priceData.p75 || priceData.max_price
        },
        sample_size: priceData.sample_size,
        calculated_at: priceData.calculated_at
      } : null,
      sources,
      samples: samples?.map(s => ({
        source: s.source,
        price: s.price,
        condition: s.condition,
        province: s.province,
        listed_at: s.scraped_at
      })),
      alternatives: !priceData ? {
        message: 'No pricing data available for this exact model/year',
        actions: [
          'Check similar years (±2)',
          'Check different condition',
          'Browse active listings directly'
        ]
      } : null
    })

  } catch (err) {
    console.error('[Pricing API] Suggest error:', err)
    res.status(500).json({
      error: 'Internal server error',
      code: 'server_error',
      message: err.message
    })
  }
})

/**
 * GET /api/v1/pricing/coverage
 * Dashboard de cobertura de datos
 */
router.get('/coverage', async (req, res) => {
  try {
    // Totales
    const { data: totals } = await supabase
      .from('price_listings')
      .select('status', { count: 'exact' })

    const { data: activeTotals } = await supabase
      .from('price_listings')
      .select('status', { count: 'exact' })
      .eq('status', 'active')

    const { data: uniqueModels } = await supabase
      .from('price_listings')
      .select('bike_model_id', { count: 'exact' })
      .not('bike_model_id', 'is', null)

    // Por fuente
    const { data: bySource } = await supabase
      .from('source_coverage')
      .select(`
        scraping_sources(name, display_name, is_reliable),
        date,
        total_listings,
        active_listings,
        unique_models,
        avg_price
      `)
      .eq('date', new Date().toISOString().split('T')[0])

    // Últimas 24 horas
    const yesterday = new Date()
    yesterday.setDate(yesterday.getDate() - 1)
    
    const { data: last24h } = await supabase
      .from('price_listings')
      .select('created_at', { count: 'exact' })
      .gte('scraped_at', yesterday.toISOString())

    const { data: priceChanges } = await supabase
      .from('price_changes')
      .select('id', { count: 'exact' })
      .gte('detected_at', yesterday.toISOString())

    res.json({
      totals: {
        listings: totals?.length || 0,
        active: activeTotals?.length || 0,
        unique_models: uniqueModels?.length || 0
      },
      by_source: bySource?.map(s => ({
        name: s.scraping_sources?.name,
        display_name: s.scraping_sources?.display_name,
        is_reliable: s.scraping_sources?.is_reliable,
        total: s.total_listings,
        active: s.active_listings,
        unique_models: s.unique_models,
        avg_price: s.avg_price
      })),
      last_24h: {
        new_listings: last24h?.length || 0,
        price_changes: priceChanges?.length || 0
      }
    })

  } catch (err) {
    console.error('[Pricing API] Coverage error:', err)
    res.status(500).json({
      error: 'Internal server error',
      code: 'server_error',
      message: err.message
    })
  }
})

/**
 * GET /api/v1/pricing/models
 * Lista modelos disponibles con precios
 */
router.get('/models', async (req, res) => {
  try {
    const { brand, category, search, limit = 50, offset = 0 } = req.query

    let query = supabase
      .from('bike_models')
      .select(`
        id,
        brand,
        model,
        category,
        year_released,
        market_prices(sample_size, median_price, currency, condition, calculated_at)
      `)

    if (brand) {
      query = query.ilike('brand', `%${brand}%`)
    }

    if (category) {
      query = query.eq('category', category)
    }

    if (search) {
      query = query.or(`model.ilike.%${search}%,brand.ilike.%${search}%`)
    }

    query = query
      .order('brand')
      .order('model')
      .range(parseInt(offset), parseInt(offset) + parseInt(limit) - 1)

    const { data, error } = await query

    if (error) throw error

    res.json({
      models: data.map(m => ({
        id: m.id,
        brand: m.brand,
        model: m.model,
        category: m.category,
        year_released: m.year_released,
        prices: m.market_prices?.reduce((acc, p) => {
          acc[p.condition] = {
            median: p.median_price,
            currency: p.currency,
            samples: p.sample_size,
            updated: p.calculated_at
          }
          return acc
        }, {})
      })),
      pagination: {
        limit: parseInt(limit),
        offset: parseInt(offset)
      }
    })

  } catch (err) {
    console.error('[Pricing API] Models error:', err)
    res.status(500).json({
      error: 'Internal server error',
      code: 'server_error',
      message: err.message
    })
  }
})

/**
 * POST /api/v1/pricing/jobs
 * Crea un nuevo job de scraping (admin)
 */
router.post('/jobs', async (req, res) => {
  try {
    const { source_id, job_type, params, priority, scheduled_at, cron_expression } = req.body

    const pricingScraper = require('../services/pricingScraperService')
    const job = await pricingScraper.createScrapingJob({
      sourceId: source_id,
      jobType: job_type,
      params,
      priority: priority || 5,
      scheduledAt: scheduled_at,
      cronExpression: cron_expression
    })

    res.json({
      success: true,
      job_id: job.id,
      status: job.status,
      scheduled_at: job.scheduled_at
    })

  } catch (err) {
    console.error('[Pricing API] Create job error:', err)
    res.status(500).json({
      error: 'Internal server error',
      code: 'server_error',
      message: err.message
    })
  }
})

/**
 * GET /api/v1/pricing/jobs
 * Lista jobs de scraping (admin)
 */
router.get('/jobs', async (req, res) => {
  try {
    const { status, source, limit = 20, offset = 0 } = req.query

    let query = supabase
      .from('scraping_jobs')
      .select(`
        *,
        scraping_sources(name, display_name)
      `)
      .order('created_at', { ascending: false })
      .range(parseInt(offset), parseInt(offset) + parseInt(limit) - 1)

    if (status) {
      query = query.eq('status', status)
    }

    if (source) {
      query = query.eq('scraping_sources.name', source)
    }

    const { data, error } = await query

    if (error) throw error

    res.json({
      jobs: data.map(j => ({
        id: j.id,
        source: j.scraping_sources?.name,
        source_display: j.scraping_sources?.display_name,
        job_type: j.job_type,
        status: j.status,
        priority: j.priority,
        items_processed: j.items_processed,
        items_inserted: j.items_inserted,
        items_updated: j.items_updated,
        items_failed: j.items_failed,
        scheduled_at: j.scheduled_at,
        started_at: j.started_at,
        completed_at: j.completed_at,
        error_message: j.error_message
      })),
      pagination: {
        limit: parseInt(limit),
        offset: parseInt(offset)
      }
    })

  } catch (err) {
    console.error('[Pricing API] List jobs error:', err)
    res.status(500).json({
      error: 'Internal server error',
      code: 'server_error',
      message: err.message
    })
  }
})

/**
 * POST /api/v1/pricing/recalculate
 * Fuerza recálculo de market prices (admin)
 */
router.post('/recalculate', async (req, res) => {
  try {
    const pricingScraper = require('../services/pricingScraperService')
    await pricingScraper.recalculateMarketPrices()

    res.json({
      success: true,
      message: 'Market prices recalculated successfully'
    })

  } catch (err) {
    console.error('[Pricing API] Recalculate error:', err)
    res.status(500).json({
      error: 'Internal server error',
      code: 'server_error',
      message: err.message
    })
  }
})

module.exports = router
