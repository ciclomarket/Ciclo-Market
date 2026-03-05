/**
 * Pricing Jobs Scheduler
 * Jobs programados para el sistema de pricing
 */

const { createClient } = require('@supabase/supabase-js')
const pricingScraper = require('../services/pricingScraperService')

const supabase = createClient(
  process.env.SUPABASE_URL,
  process.env.SUPABASE_SERVICE_ROLE_KEY
)

/**
 * Procesa jobs de scraping pendientes
 * Corre cada 5 minutos
 */
async function processScrapingJobs() {
  console.log('[Pricing Jobs] Processing pending scraping jobs...')
  
  try {
    const results = await pricingScraper.processPendingJobs({ limit: 10 })
    
    const summary = {
      processed: results.length,
      successful: results.filter(r => r.status === 'success').length,
      errors: results.filter(r => r.status === 'error').length
    }
    
    console.log('[Pricing Jobs] Summary:', summary)
    return summary
    
  } catch (err) {
    console.error('[Pricing Jobs] Error processing jobs:', err)
    throw err
  }
}

/**
 * Recalcula precios de mercado
 * Corre diariamente a las 2 AM
 */
async function recalculateMarketPrices() {
  console.log('[Pricing Jobs] Recalculating market prices...')
  
  try {
    await pricingScraper.recalculateMarketPrices()
    console.log('[Pricing Jobs] Market prices recalculated successfully')
    
    // Actualizar analytics diarios
    await updateDailyAnalytics()
    
  } catch (err) {
    console.error('[Pricing Jobs] Error recalculating prices:', err)
    throw err
  }
}

/**
 * Actualiza métricas diarias
 */
async function updateDailyAnalytics() {
  const today = new Date().toISOString().split('T')[0]
  
  console.log(`[Pricing Jobs] Updating daily analytics for ${today}...`)
  
  try {
    // Actualizar cobertura por fuente
    const { data: sources } = await supabase
      .from('scraping_sources')
      .select('id')
      .eq('is_active', true)
    
    for (const source of sources || []) {
      await supabase.rpc('update_source_coverage', {
        p_source_id: source.id,
        p_date: today
      })
    }
    
    console.log(`[Pricing Jobs] Updated coverage for ${sources?.length || 0} sources`)
    
  } catch (err) {
    console.error('[Pricing Jobs] Error updating analytics:', err)
  }
}

/**
 * Detecta listings expirados/vendidos
 * Corre cada 12 horas
 */
async function detectExpiredListings() {
  console.log('[Pricing Jobs] Detecting expired listings...')
  
  try {
    const cutoffDate = new Date()
    cutoffDate.setDate(cutoffDate.getDate() - 30) // 30 días sin verificación
    
    // Marcar como expirados los listings no verificados en 30 días
    const { data, error } = await supabase
      .from('price_listings')
      .update({ 
        status: 'expired',
        updated_at: new Date().toISOString()
      })
      .eq('status', 'active')
      .or(`last_verified_at.lt.${cutoffDate.toISOString()},last_verified_at.is.null`)
      .select('id')
    
    if (error) throw error
    
    console.log(`[Pricing Jobs] Marked ${data?.length || 0} listings as expired`)
    
  } catch (err) {
    console.error('[Pricing Jobs] Error detecting expired:', err)
  }
}

/**
 * Limpia logs antiguos
 * Corre semanalmente (domingos 3 AM)
 */
async function cleanupOldLogs() {
  console.log('[Pricing Jobs] Cleaning up old logs...')
  
  try {
    const cutoffDate = new Date()
    cutoffDate.setDate(cutoffDate.getDate() - 30) // Mantener 30 días
    
    // Borrar logs antiguos
    const { error } = await supabase
      .from('scraping_logs')
      .delete()
      .lt('created_at', cutoffDate.toISOString())
    
    if (error) throw error
    
    console.log('[Pricing Jobs] Old logs cleaned up')
    
  } catch (err) {
    console.error('[Pricing Jobs] Error cleaning logs:', err)
  }
}

/**
 * Scheduler principal - ejecuta jobs según su horario
 * Todos los jobs son semanales (domingos) para optimizar recursos
 */
async function runScheduledJobs() {
  const now = new Date()
  const hour = now.getHours()
  const minute = now.getMinutes()
  const dayOfWeek = now.getDay() // 0 = domingo
  
  // Solo ejecutar jobs los domingos
  if (dayOfWeek !== 0) return
  
  // Domingo 2:00 AM: recalcular precios de mercado
  if (hour === 2 && minute === 0) {
    await recalculateMarketPrices()
  }
  
  // Domingo 3:00 AM: limpieza de logs
  if (hour === 3 && minute === 0) {
    await cleanupOldLogs()
  }
  
  // Domingo 4:00 AM: scraping semanal de precios
  if (hour === 4 && minute === 0) {
    await processScrapingJobs()
  }
  
  // Domingo 5:00 AM: detectar expirados
  if (hour === 5 && minute === 0) {
    await detectExpiredListings()
  }
}

/**
 * Inicializa jobs recurrentes
 */
async function initializeRecurringJobs() {
  console.log('[Pricing Jobs] Initializing recurring jobs...')
  
  try {
    await pricingScraper.scheduleRecurringJobs()
    console.log('[Pricing Jobs] Recurring jobs initialized')
  } catch (err) {
    console.error('[Pricing Jobs] Error initializing jobs:', err)
  }
}

module.exports = {
  processScrapingJobs,
  recalculateMarketPrices,
  detectExpiredListings,
  cleanupOldLogs,
  runScheduledJobs,
  initializeRecurringJobs,
  updateDailyAnalytics
}
