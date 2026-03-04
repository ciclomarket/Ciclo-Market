#!/usr/bin/env node
/**
 * Pricing Admin CLI
 * Herramienta de administración para el sistema de pricing
 */

const { createClient } = require('@supabase/supabase-js')
const readline = require('readline')

const supabase = createClient(
  process.env.SUPABASE_URL || process.env.VITE_SUPABASE_URL,
  process.env.SUPABASE_SERVICE_ROLE_KEY
)

const rl = readline.createInterface({
  input: process.stdin,
  output: process.stdout
})

function prompt(question) {
  return new Promise(resolve => rl.question(question, resolve))
}

async function showStats() {
  console.log('\n📊 Estadísticas del Sistema de Pricing\n')
  
  // Totales
  const { count: totalListings } = await supabase
    .from('price_listings')
    .select('*', { count: 'exact', head: true })
  
  const { count: activeListings } = await supabase
    .from('price_listings')
    .select('*', { count: 'exact', head: true })
    .eq('status', 'active')
  
  const { count: uniqueModels } = await supabase
    .from('price_listings')
    .select('bike_model_id', { count: 'exact', head: true })
    .not('bike_model_id', 'is', null)
  
  console.log(`Total listings: ${totalListings}`)
  console.log(`Activos: ${activeListings}`)
  console.log(`Con modelo asignado: ${uniqueModels}`)
  
  // Por fuente
  const { data: bySource } = await supabase
    .from('price_listings')
    .select('source, status')
  
  const stats = {}
  bySource?.forEach(row => {
    if (!stats[row.source]) {
      stats[row.source] = { total: 0, active: 0 }
    }
    stats[row.source].total++
    if (row.status === 'active') stats[row.source].active++
  })
  
  console.log('\nPor fuente:')
  Object.entries(stats).forEach(([source, data]) => {
    console.log(`  ${source}: ${data.active}/${data.total} activos`)
  })
  
  // Jobs recientes
  const { data: recentJobs } = await supabase
    .from('scraping_jobs')
    .select('job_type, status, items_processed, created_at')
    .order('created_at', { ascending: false })
    .limit(5)
  
  console.log('\nÚltimos jobs:')
  recentJobs?.forEach(job => {
    console.log(`  [${job.status}] ${job.job_type} - ${job.items_processed || 0} items`)
  })
}

async function syncCicloMarket() {
  console.log('\n🔄 Sincronizando listings de CicloMarket...\n')
  
  const pricingScraper = require('../src/services/pricingScraperService')
  
  const { data: source } = await supabase
    .from('scraping_sources')
    .select('id')
    .eq('name', 'ciclomarket')
    .single()
  
  if (!source) {
    console.log('❌ Fuente ciclomarket no encontrada')
    return
  }
  
  const job = await pricingScraper.createScrapingJob({
    sourceId: source.id,
    jobType: 'full_sync',
    params: {},
    priority: 1
  })
  
  console.log(`✅ Job creado: ${job.id}`)
  console.log('Ejecutando...')
  
  const result = await pricingScraper.executeScrapingJob({
    ...job,
    scraping_sources: { name: 'ciclomarket', config: {} }
  })
  
  console.log(`\nResultado:`)
  console.log(`  Procesados: ${result.processed}`)
  console.log(`  Insertados: ${result.inserted}`)
  console.log(`  Actualizados: ${result.updated}`)
}

async function recalculatePrices() {
  console.log('\n🧮 Recalculando precios de mercado...\n')
  
  const start = Date.now()
  await supabase.rpc('recalculate_market_prices_enhanced')
  const duration = Date.now() - start
  
  console.log(`✅ Recálculo completado en ${duration}ms`)
  
  // Mostrar resumen
  const { data: prices } = await supabase
    .from('market_prices')
    .select('currency, sample_size, calculated_at')
    .order('calculated_at', { ascending: false })
    .limit(10)
  
  console.log('\nÚltimos precios calculados:')
  prices?.forEach(p => {
    console.log(`  ${p.currency} - ${p.sample_size} muestras`)
  })
}

async function scrapeMercadoLibre() {
  console.log('\n🔍 Scraping de MercadoLibre\n')
  
  const query = await prompt('Término de búsqueda (ej: "bicicleta mountain bike"): ')
  const maxResults = parseInt(await prompt('Máximo de resultados (default 50): ') || '50')
  
  const { data: source } = await supabase
    .from('scraping_sources')
    .select('id')
    .eq('name', 'mercadolibre')
    .single()
  
  if (!source) {
    console.log('❌ Fuente mercadolibre no encontrada')
    return
  }
  
  // Crear job de búsqueda
  const job = await pricingScraper.createScrapingJob({
    sourceId: source.id,
    jobType: 'search',
    params: {
      searchQueries: [query],
      maxResults
    },
    priority: 1
  })
  
  console.log(`\n✅ Job creado: ${job.id}`)
  console.log('El job será procesado por el scheduler.')
}

async function showMenu() {
  console.log('\n')
  console.log('╔════════════════════════════════════════════════╗')
  console.log('║     Pricing Admin CLI - Ciclo Market           ║')
  console.log('╠════════════════════════════════════════════════╣')
  console.log('║  1. Ver estadísticas                           ║')
  console.log('║  2. Sync CicloMarket → price_listings          ║')
  console.log('║  3. Recalcular market_prices                   ║')
  console.log('║  4. Scrapear MercadoLibre                      ║')
  console.log('║  5. Ver jobs pendientes                        ║')
  console.log('║  6. Limpiar logs antiguos                      ║')
  console.log('║  0. Salir                                      ║')
  console.log('╚════════════════════════════════════════════════╝')
  
  const choice = await prompt('\nSelección: ')
  
  switch (choice.trim()) {
    case '1':
      await showStats()
      break
    case '2':
      await syncCicloMarket()
      break
    case '3':
      await recalculatePrices()
      break
    case '4':
      await scrapeMercadoLibre()
      break
    case '5':
      await showPendingJobs()
      break
    case '6':
      await cleanupLogs()
      break
    case '0':
      console.log('\n👋 Adiós!')
      rl.close()
      process.exit(0)
    default:
      console.log('\n❌ Opción inválida')
  }
  
  await showMenu()
}

async function showPendingJobs() {
  const { data: jobs } = await supabase
    .from('scraping_jobs')
    .select(`
      id,
      job_type,
      status,
      priority,
      items_processed,
      scheduled_at,
      scraping_sources(name)
    `)
    .eq('status', 'pending')
    .order('priority', { ascending: true })
    .order('scheduled_at', { ascending: true })
    .limit(20)
  
  console.log(`\n📋 Jobs pendientes: ${jobs?.length || 0}\n`)
  
  jobs?.forEach(job => {
    console.log(`  [${job.priority}] ${job.scraping_sources?.name} - ${job.job_type}`)
    console.log(`       ID: ${job.id}`)
    console.log(`       Scheduled: ${new Date(job.scheduled_at).toLocaleString()}`)
  })
}

async function cleanupLogs() {
  console.log('\n🧹 Limpiando logs antiguos...\n')
  
  const cutoffDate = new Date()
  cutoffDate.setDate(cutoffDate.getDate() - 30)
  
  const { count } = await supabase
    .from('scraping_logs')
    .delete()
    .lt('created_at', cutoffDate.toISOString())
    .select('count')
  
  console.log(`✅ Eliminados ${count} logs antiguos`)
}

// Iniciar
if (require.main === module) {
  showMenu().catch(err => {
    console.error('Error:', err)
    process.exit(1)
  })
}

module.exports = { showStats, syncCicloMarket, recalculatePrices }
