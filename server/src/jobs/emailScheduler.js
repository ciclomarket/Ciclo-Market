/**
 * Email Scheduler - Sistema de distribución de emails en lotes
 * Resend limit: 100 emails/día en plan gratis
 * Distribuye los envíos en lotes de 100 durante la semana
 */

const { getServerSupabaseClient } = require('../lib/supabaseClient')

/**
 * Calcula el offset para el batch de hoy basado en el número de semana
 * @param {number} totalUsers - Total de usuarios a enviar
 * @param {number} batchSize - Tamaño del lote (default 100)
 * @returns {object} { offset, batchNumber, totalBatches }
 */
function calculateBatchOffset(totalUsers, batchSize = 100) {
  const now = new Date()
  const startOfYear = new Date(now.getFullYear(), 0, 1)
  const weekNumber = Math.ceil((((now - startOfYear) / 86400000) + startOfYear.getDay() + 1) / 7)
  
  const totalBatches = Math.ceil(totalUsers / batchSize)
  const batchNumber = (weekNumber % totalBatches) || totalBatches
  const offset = (batchNumber - 1) * batchSize
  
  return {
    offset,
    batchNumber,
    totalBatches,
    batchSize,
    weekNumber
  }
}

/**
 * Obtiene el batch de usuarios para hoy
 * @param {string} automationType - Tipo de automatización
 * @param {Function} fetchUsersFn - Función para obtener usuarios
 * @param {number} limit - Límite por día
 */
async function getTodaysBatch(automationType, fetchUsersFn, limit = 100) {
  const supabase = getServerSupabaseClient()
  
  // Obtener todos los usuarios elegibles
  const allUsers = await fetchUsersFn(supabase)
  
  if (!allUsers.length) {
    return { users: [], batchInfo: null }
  }
  
  // Calcular batch de hoy
  const batchInfo = calculateBatchOffset(allUsers.length, limit)
  const todaysUsers = allUsers.slice(batchInfo.offset, batchInfo.offset + limit)
  
  console.info(`[${automationType}] Batch ${batchInfo.batchNumber}/${batchInfo.totalBatches} (semana ${batchInfo.weekNumber}): usuarios ${batchInfo.offset + 1}-${batchInfo.offset + todaysUsers.length} de ${allUsers.length}`)
  
  return { users: todaysUsers, batchInfo }
}

/**
 * Verifica si hoy es el día de enviar este tipo de email
 * @param {string} automationType - 'monday' | 'wednesday' | 'friday'
 * @returns {boolean}
 */
function isTodaySendDay(automationType) {
  const dayOfWeek = new Date().getDay()
  // 0=domingo, 1=lunes, 2=martes, 3=miércoles, 4=jueves, 5=viernes, 6=sábado
  const sendDays = {
    'monday': 1,
    'wednesday': 3,
    'friday': 5
  }
  return dayOfWeek === sendDays[automationType]
}

/**
 * Delay entre emails para no saturar Resend
 * @param {number} ms - Milisegundos
 */
function sleep(ms) {
  return new Promise(resolve => setTimeout(resolve, ms))
}

module.exports = {
  calculateBatchOffset,
  getTodaysBatch,
  isTodaySendDay,
  sleep
}
