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
  const periodStart = kpis.weekStart
  const periodEnd = kpis.weekEnd
  const source = 'Supabase'
  const insights = []

  if (kpis.bikeOfWeek) {
    insights.push({
      insightKey: `bike_of_week_views_7d:${kpis.weekKey}`,
      payload: {
        title: `Bike of the Week ${kpis.weekKey}`,
        category: 'Demand',
        metric: 'bike_of_week_views_7d',
        value: `${kpis.bikeOfWeek.title} — ${kpis.bikeOfWeek.views} views`,
        periodStart,
        periodEnd,
        source,
      },
    })
  }

  for (let i = 0; i < kpis.top3ListingsByViews.length; i += 1) {
    const rank = i + 1
    const item = kpis.top3ListingsByViews[i]
    insights.push({
      insightKey: `top_listing_views_rank_${rank}_7d:${kpis.weekKey}`,
      payload: {
        title: `Top listing by views #${rank} ${kpis.weekKey}`,
        category: 'Demand',
        metric: `top_listing_views_rank_${rank}_7d`,
        value: `${item.title} — ${item.views} views`,
        periodStart,
        periodEnd,
        source,
      },
    })
  }

  insights.push(
    {
      insightKey: `contacts_7d:${kpis.weekKey}`,
      payload: {
        title: `Contacts 7d ${kpis.weekKey}`,
        category: 'Funnel',
        metric: 'contacts_7d',
        value: String(kpis.contacts7d),
        periodStart,
        periodEnd,
        source,
      },
    },
    {
      insightKey: `new_listings_7d:${kpis.weekKey}`,
      payload: {
        title: `New listings 7d ${kpis.weekKey}`,
        category: 'Supply',
        metric: 'new_listings_7d',
        value: String(kpis.newListings7d),
        periodStart,
        periodEnd,
        source,
      },
    },
    {
      insightKey: `price_drops_7d:${kpis.weekKey}`,
      payload: {
        title: `Price drops 7d ${kpis.weekKey}`,
        category: 'Pricing',
        metric: 'price_drops_7d',
        value: String(kpis.priceDrops7d),
        periodStart,
        periodEnd,
        source,
      },
    },
    {
      insightKey: `median_hours_to_first_contact:${kpis.weekKey}`,
      payload: {
        title: `Median time to first contact ${kpis.weekKey}`,
        category: 'Funnel',
        metric: 'median_hours_to_first_contact',
        value: Number.isFinite(kpis.medianHoursToFirstContact)
          ? Number(kpis.medianHoursToFirstContact).toFixed(2)
          : 'N/A',
        periodStart,
        periodEnd,
        source,
      },
    },
    {
      insightKey: `listings_no_contact_7dplus:${kpis.weekKey}`,
      payload: {
        title: `Listings without contact (+7d) ${kpis.weekKey}`,
        category: 'Supply',
        metric: 'listings_no_contact_7dplus',
        value: String(kpis.listingsNoContact7dplus),
        periodStart,
        periodEnd,
        source,
      },
    }
  )

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
      notes: `Publicar resumen semanal y destacar Bike of the Week (${kpis.weekStart}..${kpis.weekEnd}).`,
      taskKey: `weekly_report_publish_${key}`,
    },
    {
      task: `Optimizar listings sin contacto (+7d) ${key}`,
      type: 'Ops',
      day: 'Tuesday',
      priority: 'High',
      status: 'Todo',
      owner: 'Ops',
      notes: 'Aplicar playbook de precio/fotos/titulo para recuperar demanda.',
      taskKey: `weekly_no_contact_ops_${key}`,
    },
    {
      task: `Acciones de pricing por price drops ${key}`,
      type: 'Pricing',
      day: 'Wednesday',
      priority: 'Medium',
      status: 'Todo',
      owner: 'Growth',
      notes: 'Revisar señales de price_drops_7d y sugerir rangos de precio.',
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

    const plannedInsights = buildInsightsFromKpis(kpis)

    if (payload.dryRun) {
      return res.json({
        ok: true,
        dryRun: true,
        weekKey: kpis.weekKey,
        kpis,
        plannedInsights: plannedInsights.map((x) => x.insightKey),
        plannedTasks: payload.includeTasks ? buildWeeklyTasks(kpis).map((x) => x.taskKey) : [],
      })
    }

    const reportResult = await createWeeklyReport(kpis)

    const insightResults = []
    for (const item of plannedInsights) {
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
        insightsProcessed: insightResults.length,
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
