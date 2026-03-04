const express = require('express')
const { z } = require('zod')
const { getWeeklyKpis } = require('../services/notion/weeklyKpiService')
const { createWeeklyReport, upsertInsight, createTask } = require('../services/notion/notionService')

const router = express.Router()

const syncPayloadSchema = z.object({
  includeTasks: z.boolean().optional().default(false),
  dryRun: z.boolean().optional().default(false),
  periodEnd: z.string().datetime().optional(),
  periodStart: z.string().datetime().optional(),
})

function extractBearer(req) {
  const header = req.headers.authorization || req.headers['x-sync-secret']
  if (!header) return null
  const value = String(header).trim()
  if (/^bearer\s+/i.test(value)) {
    return value.replace(/^bearer\s+/i, '').trim()
  }
  return value
}

function ensureSyncSecret(req, res, next) {
  const expected = String(process.env.NOTION_SYNC_SECRET || '').trim()
  if (!expected) {
    console.warn('[notion-sync] NOTION_SYNC_SECRET no configurado')
    return res.status(500).json({ ok: false, error: 'server_misconfigured' })
  }

  const provided = extractBearer(req)
  if (!provided || provided !== expected) {
    return res.status(401).json({ ok: false, error: 'unauthorized' })
  }

  next()
}

function buildInsightsFromKpis(kpis) {
  const period = `${kpis.weekStart}..${kpis.weekEnd}`
  const source = 'Supabase'

  const insights = [
    {
      insightKey: `new_listings_${kpis.weekKey}`,
      payload: {
        title: `Nuevos listings ${kpis.weekKey}`,
        category: 'Supply',
        metric: 'new_listings_7d',
        value: kpis.newListings7d,
        period,
        source,
      },
    },
    {
      insightKey: `contacts_${kpis.weekKey}`,
      payload: {
        title: `Contactos 7d ${kpis.weekKey}`,
        category: 'Demand',
        metric: 'contacts_7d',
        value: kpis.contacts7d,
        period,
        source,
      },
    },
    {
      insightKey: `price_drops_${kpis.weekKey}`,
      payload: {
        title: `Price drops ${kpis.weekKey}`,
        category: 'Pricing',
        metric: 'price_drops_7d',
        value: kpis.priceDrops7d,
        period,
        source,
      },
    },
    {
      insightKey: `median_first_contact_hours_${kpis.weekKey}`,
      payload: {
        title: `Median time to first contact ${kpis.weekKey}`,
        category: 'Funnel',
        metric: 'median_hours_to_first_contact',
        value: Number(kpis.medianHoursToFirstContact || 0),
        period,
        source,
      },
    },
  ]

  for (let i = 0; i < kpis.topModelsByLikes.length; i += 1) {
    const item = kpis.topModelsByLikes[i]
    insights.push({
      insightKey: `top_model_likes_${i + 1}_${kpis.weekKey}`,
      payload: {
        title: `Top model likes #${i + 1} ${kpis.weekKey}`,
        category: 'Demand',
        metric: item.model,
        value: item.likes,
        period,
        source,
      },
    })
  }

  return insights
}

function buildWeeklyTasks(kpis) {
  const key = kpis.weekKey
  return [
    {
      task: `Publicar reporte semanal ${key}`,
      type: 'Report',
      day: 'Monday',
      priority: 'High',
      status: 'Todo',
      owner: 'Growth',
      notes: `Revisar variaciones semanales y publicar resumen ejecutivo (${kpis.weekStart}..${kpis.weekEnd}).`,
      taskKey: `weekly_report_publish_${key}`,
    },
    {
      task: `Analizar top listings por views ${key}`,
      type: 'Analysis',
      day: 'Tuesday',
      priority: 'Medium',
      status: 'Todo',
      owner: 'Ops',
      notes: 'Detectar patrones de precio/fotos/titulos para replicar en nuevos listings.',
      taskKey: `weekly_top_views_analysis_${key}`,
    },
    {
      task: `Diseñar 2 contenidos desde insights ${key}`,
      type: 'Content',
      day: 'Wednesday',
      priority: 'High',
      status: 'Todo',
      owner: 'Marketing',
      notes: 'Transformar insights en contenido (blog/IG/WhatsApp).',
      taskKey: `weekly_content_plan_${key}`,
    },
    {
      task: `Proponer acciones de pricing ${key}`,
      type: 'Pricing',
      day: 'Thursday',
      priority: 'Medium',
      status: 'Todo',
      owner: 'Growth',
      notes: 'Revisar price drops y recomendar ajustes por categoría/modelo.',
      taskKey: `weekly_pricing_actions_${key}`,
    },
  ]
}

router.post('/api/notion/sync-weekly', ensureSyncSecret, async (req, res) => {
  const startedAt = Date.now()
  let payload

  try {
    payload = syncPayloadSchema.parse(req.body || {})
  } catch (err) {
    return res.status(400).json({ ok: false, error: 'invalid_payload', details: err?.issues || err?.message || String(err) })
  }

  try {
    const kpis = await getWeeklyKpis({
      periodStart: payload.periodStart,
      periodEnd: payload.periodEnd,
    })

    if (payload.dryRun) {
      return res.json({
        ok: true,
        dryRun: true,
        weekKey: kpis.weekKey,
        kpis,
        plannedInsights: buildInsightsFromKpis(kpis).map((x) => x.insightKey),
        plannedTasks: payload.includeTasks ? buildWeeklyTasks(kpis).map((x) => x.taskKey) : [],
      })
    }

    const reportResult = await createWeeklyReport(kpis)

    const insightResults = []
    for (const item of buildInsightsFromKpis(kpis)) {
      const result = await upsertInsight(item.insightKey, item.payload)
      insightResults.push(result)
    }

    const taskResults = []
    if (payload.includeTasks) {
      for (const task of buildWeeklyTasks(kpis)) {
        const result = await createTask(task)
        taskResults.push(result)
      }
    }

    const elapsedMs = Date.now() - startedAt

    console.info(
      JSON.stringify({
        level: 'info',
        msg: '[notion-sync] sync_completed',
        weekKey: kpis.weekKey,
        elapsedMs,
        reportMode: reportResult.mode,
        insightsUpserted: insightResults.length,
        tasksProcessed: taskResults.length,
      })
    )

    return res.json({
      ok: true,
      weekKey: kpis.weekKey,
      elapsedMs,
      report: reportResult,
      insights: insightResults,
      tasks: taskResults,
      kpis,
    })
  } catch (err) {
    console.error(
      JSON.stringify({
        level: 'error',
        msg: '[notion-sync] sync_failed',
        error: err?.message || String(err),
      })
    )

    return res.status(500).json({
      ok: false,
      error: 'sync_failed',
      message: err?.message || 'Unexpected error',
    })
  }
})

module.exports = router
