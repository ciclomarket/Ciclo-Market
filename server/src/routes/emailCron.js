/**
 * Email Cron Routes - Endpoints HTTP para automatizaciones puntuales
 * Base path: /api/cron/*
 * Requiere header: Authorization: Bearer CRON_SECRET
 *
 * Las automatizaciones recurrentes (monday-new-arrivals, wednesday-listing-update,
 * friday-upgrade-offer, y el motor de campañas de email/) fueron eliminadas por
 * generar reenvíos duplicados sin control de cupo compartido contra el límite
 * diario de Brevo. Lo que queda acá es puntual (alertas de seguridad) o de
 * solo lectura (stats).
 */

const express = require('express')
const { sendSecurityAlert, sendTargetedSecurityAlert, AUTOMATION_TYPE: TYPE_SECURITY_ALERT } = require('../jobs/securityAlertBroadcast')

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
  res.json({ ok: true, automations: [TYPE_SECURITY_ALERT] })
})

// Security Alert Broadcast - one-shot to ALL users
router.post('/cron/security-alert', ensureCronSecret, async (req, res) => {
  try {
    const dryRun = req.body?.dryRun === true || req.query?.dry === 'true'
    const limit = Number(req.body?.limit || req.query?.limit || 5000)
    const batchOffset = Number(req.body?.batchOffset || req.query?.batchOffset || 0)

    console.info(`[emailCron] security-alert triggered`, { dryRun, limit, batchOffset })

    const result = await sendSecurityAlert({ dryRun, limit, batchOffset })

    res.json({
      ok: true,
      automation: TYPE_SECURITY_ALERT,
      dryRun,
      sent: result.sent,
      skipped: result.skipped,
      recipientsCount: result.recipients?.length || 0,
      recipients: dryRun ? result.recipients?.slice(0, 20) : undefined,
    })
  } catch (err) {
    console.error('[emailCron] security-alert failed', err)
    res.status(500).json({ ok: false, error: err.message })
  }
})

// Security Alert Targeted — solo a usuarios que recibieron el mensaje fraudulento
router.post('/cron/security-alert-targeted', ensureCronSecret, async (req, res) => {
  try {
    const dryRun = req.body?.dryRun === true || req.query?.dry === 'true'
    const userIds = req.body?.userIds

    if (!Array.isArray(userIds) || !userIds.length) {
      return res.status(400).json({ ok: false, error: 'userIds debe ser un array no vacío' })
    }

    console.info(`[emailCron] security-alert-targeted triggered`, { dryRun, count: userIds.length })

    const result = await sendTargetedSecurityAlert({ userIds, dryRun })

    res.json({
      ok: true,
      automation: `${TYPE_SECURITY_ALERT}:targeted`,
      dryRun,
      sent: result.sent,
      skipped: result.skipped,
      recipientsCount: result.recipients?.length || 0,
      recipients: dryRun ? result.recipients : undefined,
    })
  } catch (err) {
    console.error('[emailCron] security-alert-targeted failed', err)
    res.status(500).json({ ok: false, error: err.message })
  }
})

// Stats - Métricas de envíos (histórico, tabla independiente del motor eliminado)
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
