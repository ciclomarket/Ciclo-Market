/**
 * Pricing Scraper Service V2
 * Sistema de scraping escalable con jobs, cola y rate limiting
 */

const { createClient } = require('@supabase/supabase-js')
const { scrapeMercadoLibre } = require('./scraperService')

// Cliente Supabase con service role
const supabase = createClient(
  process.env.SUPABASE_URL,
  process.env.SUPABASE_SERVICE_ROLE_KEY
)

// Rate limiters por fuente
const rateLimiters = new Map()

class RateLimiter {
  constructor(requestsPerMinute) {
    this.minInterval = 60000 / requestsPerMinute
    this.lastRequest = 0
  }

  async wait() {
    const now = Date.now()
    const waitTime = Math.max(0, this.lastRequest + this.minInterval - now)
    if (waitTime > 0) {
      await new Promise(r => setTimeout(r, waitTime))
    }
    this.lastRequest = Date.now()
  }
}

function getRateLimiter(sourceName, requestsPerMinute) {
  if (!rateLimiters.has(sourceName)) {
    rateLimiters.set(sourceName, new RateLimiter(requestsPerMinute))
  }
  return rateLimiters.get(sourceName)
}

/**
 * Crea un nuevo job de scraping
 */
async function createScrapingJob({ sourceId, jobType, params, priority = 5, scheduledAt = null, cronExpression = null }) {
  const { data, error } = await supabase
    .from('scraping_jobs')
    .insert({
      source_id: sourceId,
      job_type: jobType,
      params,
      priority,
      scheduled_at: scheduledAt || new Date().toISOString(),
      cron_expression: cronExpression,
      status: 'pending'
    })
    .select()
    .single()

  if (error) throw error
  return data
}

/**
 * Obtiene jobs pendientes ordenados por prioridad
 */
async function getPendingJobs(limit = 10) {
  const { data, error } = await supabase
    .from('scraping_jobs')
    .select(`
      *,
      scraping_sources(name, config, type)
    `)
    .eq('status', 'pending')
    .lte('scheduled_at', new Date().toISOString())
    .order('priority', { ascending: true })
    .order('scheduled_at', { ascending: true })
    .limit(limit)

  if (error) throw error
  return data
}

/**
 * Actualiza el estado de un job
 */
async function updateJobStatus(jobId, updates) {
  const { error } = await supabase
    .from('scraping_jobs')
    .update({
      ...updates,
      updated_at: new Date().toISOString()
    })
    .eq('id', jobId)

  if (error) throw error
}

/**
 * Registra un log de scraping
 */
async function logScrapingAttempt({ jobId, sourceId, url, method = 'GET', statusCode, responseTimeMs, success, errorType, errorMessage, itemsExtracted = 0 }) {
  const { error } = await supabase
    .from('scraping_logs')
    .insert({
      job_id: jobId,
      source_id: sourceId,
      url,
      method,
      status_code: statusCode,
      response_time_ms: responseTimeMs,
      success,
      error_type: errorType,
      error_message: errorMessage,
      items_extracted: itemsExtracted
    })

  if (error) console.error('Error logging scrape:', error)
}

/**
 * Normaliza los datos de un listing usando attribute_mappings
 */
async function normalizeListingData(source, data) {
  const normalized = { ...data }

  // Normalizar condición
  if (data.condition) {
    const { data: mapping } = await supabase
      .from('attribute_mappings')
      .select('normalized_value')
      .eq('source', source)
      .eq('attribute_type', 'condition')
      .eq('source_value', data.condition)
      .single()
    
    if (mapping) {
      normalized.condition = mapping.normalized_value
    }
  }

  // Normalizar marca (buscar en aliases)
  if (data.brand && data.model) {
    const { data: alias } = await supabase
      .from('bike_model_aliases')
      .select('bike_model_id')
      .ilike('alias', `%${data.model}%`)
      .order('match_score', { ascending: false })
      .limit(1)
      .single()
    
    if (alias) {
      normalized.bike_model_id = alias.bike_model_id
    }
  }

  return normalized
}

/**
 * Inserta o actualiza un listing
 */
async function upsertListing(listingData) {
  const { data: existing } = await supabase
    .from('price_listings')
    .select('id, price, price_history')
    .eq('source', listingData.source)
    .eq('external_id', listingData.external_id)
    .maybeSingle()

  if (existing) {
    // Actualizar si cambió el precio o estado
    const updates = {
      ...listingData,
      updated_at: new Date().toISOString()
    }

    const { error } = await supabase
      .from('price_listings')
      .update(updates)
      .eq('id', existing.id)

    if (error) throw error
    return { id: existing.id, action: 'updated' }
  } else {
    // Insertar nuevo
    const { data, error } = await supabase
      .from('price_listings')
      .insert(listingData)
      .select()
      .single()

    if (error) throw error
    return { id: data.id, action: 'inserted' }
  }
}

/**
 * Ejecuta un job de scraping de MercadoLibre
 */
async function executeMercadoLibreJob(job) {
  const startTime = Date.now()
  const config = job.scraping_sources.config || {}
  const rateLimiter = getRateLimiter('mercadolibre', config.rate_limit_per_minute || 10)

  await updateJobStatus(job.id, { 
    status: 'running', 
    started_at: new Date().toISOString() 
  })

  const results = {
    processed: 0,
    inserted: 0,
    updated: 0,
    failed: 0,
    errors: []
  }

  try {
    const { urls, searchQueries } = job.params

    // Si tenemos URLs específicas
    if (urls && Array.isArray(urls)) {
      for (const url of urls) {
        try {
          await rateLimiter.wait()
          
          const scrapeStart = Date.now()
          const scraped = await scrapeMercadoLibre(url)
          const scrapeTime = Date.now() - scrapeStart

          // Log del intento
          await logScrapingAttempt({
            jobId: job.id,
            sourceId: job.source_id,
            url,
            statusCode: 200,
            responseTimeMs: scrapeTime,
            success: true,
            itemsExtracted: 1
          })

          // Normalizar y guardar
          const normalized = await normalizeListingData('mercadolibre', {
            source: 'mercadolibre',
            external_id: scraped.external_id,
            external_url: url,
            title: scraped.title,
            price: scraped.price,
            currency: scraped.currency || 'ARS',
            condition: scraped.condition,
            description: scraped.description,
            raw_data: scraped,
            scraped_at: new Date().toISOString(),
            status: 'active'
          })

          const result = await upsertListing(normalized)
          results.processed++
          results[result.action === 'inserted' ? 'inserted' : 'updated']++

          // Actualizar contador en job
          await updateJobStatus(job.id, {
            items_processed: results.processed,
            items_inserted: results.inserted,
            items_updated: results.updated
          })

        } catch (err) {
          results.failed++
          results.errors.push({ url, error: err.message, code: err.code })
          
          await logScrapingAttempt({
            jobId: job.id,
            sourceId: job.source_id,
            url,
            statusCode: err.httpStatus || 0,
            success: false,
            errorType: err.code || 'unknown',
            errorMessage: err.message
          })
        }
      }
    }

    // Completar job
    const completedUpdates = {
      status: results.failed > 0 && results.processed === 0 ? 'failed' : 'completed',
      completed_at: new Date().toISOString(),
      items_processed: results.processed,
      items_inserted: results.inserted,
      items_updated: results.updated,
      items_failed: results.failed,
      error_message: results.errors.length > 0 ? JSON.stringify(results.errors.slice(0, 5)) : null
    }

    // Si es recurrente, programar siguiente ejecución
    if (job.cron_expression) {
      const nextRun = calculateNextRun(job.cron_expression)
      completedUpdates.next_run_at = nextRun
      completedUpdates.status = 'pending'
      completedUpdates.scheduled_at = nextRun
    }

    await updateJobStatus(job.id, completedUpdates)

    // Actualizar métricas de fuente
    await supabase.rpc('update_source_coverage', {
      p_source_id: job.source_id,
      p_date: new Date().toISOString().split('T')[0]
    })

    return results

  } catch (err) {
    await updateJobStatus(job.id, {
      status: 'failed',
      completed_at: new Date().toISOString(),
      error_message: err.message
    })
    throw err
  }
}

/**
 * Ejecuta un job de scraping genérico
 */
async function executeScrapingJob(job) {
  const sourceName = job.scraping_sources?.name

  switch (sourceName) {
    case 'mercadolibre':
      return executeMercadoLibreJob(job)
    
    case 'ciclomarket':
      // Sync desde listings de CicloMarket
      return executeCicloMarketSync(job)
    
    case 'manual':
    case 'api':
      // Procesar datos enviados via API
      return executeApiIngestJob(job)
    
    default:
      throw new Error(`Source ${sourceName} not implemented`)
  }
}

/**
 * Sync desde listings de CicloMarket a price_listings
 */
async function executeCicloMarketSync(job) {
  await updateJobStatus(job.id, { 
    status: 'running', 
    started_at: new Date().toISOString() 
  })

  const { data: listings, error } = await supabase
    .from('listings')
    .select(`
      id,
      title,
      price,
      price_currency,
      year,
      condition,
      province,
      city,
      created_at,
      status,
      bike_model_id,
      seller_id
    `)
    .eq('status', 'active')
    .gt('price', 0)

  if (error) throw error

  let inserted = 0
  let updated = 0

  for (const listing of listings) {
    const listingData = {
      source: 'ciclomarket',
      external_id: listing.id,
      external_url: `https://www.ciclomarket.ar/bicicleta/${listing.id}`,
      bike_model_id: listing.bike_model_id,
      title: listing.title,
      price: listing.price,
      currency: listing.price_currency || 'ARS',
      year: listing.year,
      condition: listing.condition,
      province: listing.province,
      city: listing.city,
      listed_at: listing.created_at,
      scraped_at: new Date().toISOString(),
      status: listing.status,
      seller_type: 'individual'
    }

    const result = await upsertListing(listingData)
    if (result.action === 'inserted') inserted++
    else updated++
  }

  await updateJobStatus(job.id, {
    status: 'completed',
    completed_at: new Date().toISOString(),
    items_processed: listings.length,
    items_inserted: inserted,
    items_updated: updated
  })

  return { processed: listings.length, inserted, updated }
}

/**
 * Procesa datos ingestados via API
 */
async function executeApiIngestJob(job) {
  await updateJobStatus(job.id, { 
    status: 'running', 
    started_at: new Date().toISOString() 
  })

  const { items, source } = job.params

  if (!Array.isArray(items)) {
    throw new Error('params.items must be an array')
  }

  let inserted = 0
  let updated = 0
  let failed = 0
  const errors = []

  for (const item of items) {
    try {
      const normalized = await normalizeListingData(source, {
        source,
        external_id: item.external_id,
        external_url: item.url,
        title: item.title,
        price: item.price,
        currency: item.currency || 'ARS',
        price_usd: item.price_usd,
        year: item.year,
        condition: item.condition,
        size: item.size,
        color: item.color,
        province: item.province,
        city: item.city,
        listed_at: item.listed_at,
        scraped_at: new Date().toISOString(),
        status: 'active',
        raw_data: item.raw_data || {}
      })

      const result = await upsertListing(normalized)
      if (result.action === 'inserted') inserted++
      else updated++

    } catch (err) {
      failed++
      errors.push({ external_id: item.external_id, error: err.message })
    }
  }

  await updateJobStatus(job.id, {
    status: failed > 0 && inserted === 0 ? 'failed' : 'completed',
    completed_at: new Date().toISOString(),
    items_processed: items.length,
    items_inserted: inserted,
    items_updated: updated,
    items_failed: failed,
    error_message: errors.length > 0 ? JSON.stringify(errors.slice(0, 10)) : null
  })

  return { processed: items.length, inserted, updated, failed, errors }
}

/**
 * Calcula la próxima ejecución según cron expression
 */
function calculateNextRun(cronExpression) {
  // Implementación básica - en producción usar node-cron o similar
  const now = new Date()
  
  // Por defecto, siguiente día a la misma hora
  const next = new Date(now)
  next.setDate(next.getDate() + 1)
  
  return next.toISOString()
}

/**
 * Procesador principal de jobs - ejecuta jobs pendientes
 */
async function processPendingJobs(options = {}) {
  const { limit = 5, dryRun = false } = options

  const jobs = await getPendingJobs(limit)
  const results = []

  for (const job of jobs) {
    try {
      console.log(`[Scraper] Processing job ${job.id} (${job.job_type} from ${job.scraping_sources?.name})`)
      
      if (dryRun) {
        results.push({ jobId: job.id, status: 'dry_run' })
        continue
      }

      const result = await executeScrapingJob(job)
      results.push({ jobId: job.id, status: 'success', result })
      
    } catch (err) {
      console.error(`[Scraper] Job ${job.id} failed:`, err.message)
      results.push({ jobId: job.id, status: 'error', error: err.message })
    }
  }

  return results
}

/**
 * Scheduler - programa jobs recurrentes
 */
async function scheduleRecurringJobs() {
  // MercadoLibre - cada 6 horas
  const { data: mlSource } = await supabase
    .from('scraping_sources')
    .select('id')
    .eq('name', 'mercadolibre')
    .single()

  if (mlSource) {
    await createScrapingJob({
      sourceId: mlSource.id,
      jobType: 'delta_sync',
      params: { 
        searchQueries: ['bicicleta', 'mountain bike', 'ruta', ' gravel'],
        maxResults: 1000 
      },
      priority: 5,
      cronExpression: '0 */6 * * *' // Cada 6 horas
    })
  }

  // CicloMarket - cada hora
  const { data: cmSource } = await supabase
    .from('scraping_sources')
    .select('id')
    .eq('name', 'ciclomarket')
    .single()

  if (cmSource) {
    await createScrapingJob({
      sourceId: cmSource.id,
      jobType: 'delta_sync',
      params: {},
      priority: 3,
      cronExpression: '0 * * * *' // Cada hora
    })
  }

  console.log('[Scraper] Recurring jobs scheduled')
}

/**
 * Recalcula market prices
 * Versión sin RPC - calcula directamente desde price_listings
 */
async function recalculateMarketPrices() {
  console.log('[Scraper] Recalculating market prices...')
  
  try {
    // Obtener todos los modelos activos con precios
    const { data: listings, error: fetchError } = await supabase
      .from('price_listings')
      .select('bike_model_id, price, currency, condition, year, country')
      .eq('status', 'active')
      .gt('listed_at', new Date(Date.now() - 90 * 24 * 60 * 60 * 1000).toISOString())
      .not('bike_model_id', 'is', null)
    
    if (fetchError) throw fetchError
    
    // Agrupar por modelo y calcular estadísticas
    const grouped = {}
    for (const listing of listings || []) {
      const key = `${listing.bike_model_id}_${listing.country}_${listing.currency}_${listing.condition}_${listing.year}`
      if (!grouped[key]) {
        grouped[key] = {
          bike_model_id: listing.bike_model_id,
          country: listing.country,
          currency: listing.currency,
          condition: listing.condition,
          year: listing.year,
          prices: []
        }
      }
      grouped[key].prices.push(listing.price)
    }
    
    // Calcular promedio y mediana para cada grupo
    for (const key in grouped) {
      const group = grouped[key]
      const prices = group.prices.sort((a, b) => a - b)
      const avg = Math.round(prices.reduce((a, b) => a + b, 0) / prices.length)
      const mid = Math.floor(prices.length / 2)
      const median = prices.length % 2 ? prices[mid] : Math.round((prices[mid - 1] + prices[mid]) / 2)
      
      // Upsert a market_prices
      const { error: upsertError } = await supabase
        .from('market_prices')
        .upsert({
          bike_model_id: group.bike_model_id,
          country: group.country,
          currency: group.currency,
          condition: group.condition,
          year: group.year,
          avg_price: avg,
          median_price: median,
          sample_size: prices.length,
          calculated_at: new Date().toISOString()
        }, {
          onConflict: 'bike_model_id,country,currency,condition,year'
        })
      
      if (upsertError) {
        console.warn('[Scraper] Failed to upsert market price for', key, upsertError.message)
      }
    }
    
    console.log(`[Scraper] Market prices recalculated for ${Object.keys(grouped).length} groups`)
  } catch (err) {
    console.error('[Scraper] Error recalculating market prices:', err)
    throw err
  }
}

module.exports = {
  createScrapingJob,
  getPendingJobs,
  executeScrapingJob,
  processPendingJobs,
  scheduleRecurringJobs,
  recalculateMarketPrices,
  upsertListing,
  normalizeListingData
}
