/**
 * Email Cron Routes - Endpoints HTTP para testear y ejecutar automatizaciones
 * Base path: /api/cron/*
 * Requiere header: Authorization: Bearer CRON_SECRET
 */

const express = require('express')
const { sendMondayEmails, AUTOMATION_TYPE: TYPE_MONDAY } = require('../jobs/mondayNewArrivals')
const { sendWednesdayEmails, AUTOMATION_TYPE: TYPE_WEDNESDAY } = require('../jobs/wednesdayListingUpdate')
const { sendFridayEmails, AUTOMATION_TYPE: TYPE_FRIDAY } = require('../jobs/fridayUpgradeOffer')

const router = express.Router()

// ============================================================================
// AUTH MIDDLEWARE
// ============================================================================

function extractBearer(req) {
  const header = req.headers['authorization'] || req.headers['x-cron-secret']
  if (!header) return null
  const value = String(header).trim()
  if (/^bearer\s+/i.test(value)) {
    return value.replace(/^bearer\s+/i, '').trim()
  }
  return value
}

function ensureCronSecret(req, res, next) {
  const provided = extractBearer(req)
  const expected = process.env.CRON_SECRET
  
  if (!expected) {
    console.warn('[emailCron] CRON_SECRET no configurado')
    return res.status(500).json({ ok: false, error: 'server_misconfigured' })
  }
  
  if (!provided || provided !== expected) {
    return res.status(401).json({ ok: false, error: 'unauthorized' })
  }
  
  next()
}

// ============================================================================
// ROUTES
// ============================================================================

// Health check
router.get('/cron/health', (req, res) => {
  res.json({ ok: true, automations: [TYPE_MONDAY, TYPE_WEDNESDAY, TYPE_FRIDAY] })
})

// Monday - Nuevos ingresos
router.post('/cron/monday-new-arrivals', ensureCronSecret, async (req, res) => {
  try {
    const dryRun = req.body?.dryRun === true || req.query?.dry === 'true'
    const limit = Number(req.body?.limit || req.query?.limit || 200)
    const force = req.body?.force === true || req.query?.force === 'true'
    
    console.info(`[emailCron] monday-new-arrivals triggered`, { dryRun, limit, force })
    
    const result = await sendMondayEmails({ dryRun, limit, force })
    
    res.json({
      ok: true,
      automation: TYPE_MONDAY,
      dryRun,
      sent: result.sent,
      recipientsCount: result.recipients?.length || 0,
      listingsCount: result.listingsCount,
      recipients: dryRun ? result.recipients?.slice(0, 10) : undefined, // Solo en dry-run mostramos detalles
      preview: dryRun && result.recipients?.[0]?.preview 
        ? result.recipients[0].preview.substring(0, 1000) + '...'
        : undefined,
    })
  } catch (err) {
    console.error('[emailCron] monday-new-arrivals failed', err)
    res.status(500).json({ ok: false, error: err.message })
  }
})

// Wednesday - Listing Update
router.post('/cron/wednesday-listing-update', ensureCronSecret, async (req, res) => {
  try {
    const dryRun = req.body?.dryRun === true || req.query?.dry === 'true'
    const limit = Number(req.body?.limit || req.query?.limit || 200)
    const force = req.body?.force === true || req.query?.force === 'true'
    
    console.info(`[emailCron] wednesday-listing-update triggered`, { dryRun, limit, force })
    
    const result = await sendWednesdayEmails({ dryRun, limit, force })
    
    res.json({
      ok: true,
      automation: TYPE_WEDNESDAY,
      dryRun,
      sent: result.sent,
      recipientsCount: result.recipients?.length || 0,
      recipients: dryRun ? result.recipients?.slice(0, 10).map(r => ({
        userId: r.userId,
        email: r.email,
        subject: r.subject,
        totalListings: r.totalListings,
        totalViews: r.totalViews,
      })) : undefined,
      preview: dryRun && result.recipients?.[0]?.preview
        ? result.recipients[0].preview.substring(0, 1000) + '...'
        : undefined,
    })
  } catch (err) {
    console.error('[emailCron] wednesday-listing-update failed', err)
    res.status(500).json({ ok: false, error: err.message })
  }
})

// Friday - Upgrade Offer
router.post('/cron/friday-upgrade-offer', ensureCronSecret, async (req, res) => {
  try {
    const dryRun = req.body?.dryRun === true || req.query?.dry === 'true'
    const limit = Number(req.body?.limit || req.query?.limit || 200)
    const force = req.body?.force === true || req.query?.force === 'true'
    
    console.info(`[emailCron] friday-upgrade-offer triggered`, { dryRun, limit, force })
    
    const result = await sendFridayEmails({ dryRun, limit, force })
    
    res.json({
      ok: true,
      automation: TYPE_FRIDAY,
      dryRun,
      sent: result.sent,
      recipientsCount: result.recipients?.length || 0,
      recipients: dryRun ? result.recipients?.slice(0, 10).map(r => ({
        userId: r.userId,
        email: r.email,
        subject: r.subject,
        listingTitle: r.listingTitle,
      })) : undefined,
      preview: dryRun && result.recipients?.[0]?.preview
        ? result.recipients[0].preview.substring(0, 1000) + '...'
        : undefined,
    })
  } catch (err) {
    console.error('[emailCron] friday-upgrade-offer failed', err)
    res.status(500).json({ ok: false, error: err.message })
  }
})

// Stats - Métricas de envíos
router.get('/cron/email-stats', ensureCronSecret, async (req, res) => {
  try {
    const { getServerSupabaseClient } = require('../lib/supabaseClient')
    const supabase = getServerSupabaseClient()
    
    const days = Number(req.query?.days || 30)
    const since = new Date(Date.now() - days * 24 * 60 * 60 * 1000).toISOString()
    
    const { data, error } = await supabase
      .from('email_automation_logs')
      .select('automation_type,sent_at,opened_at,clicked_at')
      .gte('sent_at', since)
      .order('sent_at', { ascending: false })
    
    if (error) throw error
    
    // Agrupar por tipo
    const stats = { total: 0, byType: {} }
    for (const row of data || []) {
      stats.total++
      const type = row.automation_type
      if (!stats.byType[type]) {
        stats.byType[type] = { sent: 0, opened: 0, clicked: 0 }
      }
      stats.byType[type].sent++
      if (row.opened_at) stats.byType[type].opened++
      if (row.clicked_at) stats.byType[type].clicked++
    }
    
    res.json({
      ok: true,
      days,
      stats,
      recent: (data || []).slice(0, 20).map(r => ({
        type: r.automation_type,
        sentAt: r.sent_at,
      })),
    })
  } catch (err) {
    console.error('[emailCron] stats failed', err)
    res.status(500).json({ ok: false, error: err.message })
  }
})

module.exports = router
