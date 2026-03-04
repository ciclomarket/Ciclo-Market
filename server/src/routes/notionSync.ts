import express, { type Request, type Response, type NextFunction } from 'express'
import { z } from 'zod'
import { getWeeklyKpis } from '../services/notion/weeklyKpiService'
import { createWeeklyReport, upsertInsight, createTask } from '../services/notion/notionService'

const router = express.Router()

const syncPayloadSchema = z.object({
  includeTasks: z.boolean().optional().default(false),
  dryRun: z.boolean().optional().default(false),
  periodEnd: z.string().datetime().optional(),
  periodStart: z.string().datetime().optional(),
})

function extractBearer(req: Request): string | null {
  const header = req.headers.authorization || req.headers['x-sync-secret']
  if (!header) return null
  const value = String(header).trim()
  if (/^bearer\s+/i.test(value)) return value.replace(/^bearer\s+/i, '').trim()
  return value
}

function ensureSyncSecret(req: Request, res: Response, next: NextFunction): Response | void {
  const expected = String(process.env.NOTION_SYNC_SECRET || '').trim()
  if (!expected) return res.status(500).json({ ok: false, error: 'server_misconfigured' })

  const provided = extractBearer(req)
  if (!provided || provided !== expected) return res.status(401).json({ ok: false, error: 'unauthorized' })

  return next()
}

function buildInsightsFromKpis(kpis: Awaited<ReturnType<typeof getWeeklyKpis>>) {
  const period = `${kpis.weekStart}..${kpis.weekEnd}`
  const source = 'Supabase'

  const insights = [
    {
      insightKey: `new_listings_${kpis.weekKey}`,
      payload: { title: `Nuevos listings ${kpis.weekKey}`, category: 'Supply', metric: 'new_listings_7d', value: kpis.newListings7d, period, source },
    },
    {
      insightKey: `contacts_${kpis.weekKey}`,
      payload: { title: `Contactos 7d ${kpis.weekKey}`, category: 'Demand', metric: 'contacts_7d', value: kpis.contacts7d, period, source },
    },
    {
      insightKey: `price_drops_${kpis.weekKey}`,
      payload: { title: `Price drops ${kpis.weekKey}`, category: 'Pricing', metric: 'price_drops_7d', value: kpis.priceDrops7d, period, source },
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

function buildWeeklyTasks(kpis: Awaited<ReturnType<typeof getWeeklyKpis>>) {
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

router.post('/api/notion/sync-weekly', ensureSyncSecret, async (req: Request, res: Response) => {
  const startedAt = Date.now()

  try {
    const payload = syncPayloadSchema.parse(req.body || {})
    const kpis = await getWeeklyKpis({ periodStart: payload.periodStart, periodEnd: payload.periodEnd })

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

    const report = await createWeeklyReport(kpis)

    const insights = []
    for (const item of buildInsightsFromKpis(kpis)) {
      insights.push(await upsertInsight(item.insightKey, item.payload))
    }

    const tasks = []
    if (payload.includeTasks) {
      for (const task of buildWeeklyTasks(kpis)) tasks.push(await createTask(task))
    }

    return res.json({ ok: true, weekKey: kpis.weekKey, elapsedMs: Date.now() - startedAt, report, insights, tasks, kpis })
  } catch (err) {
    return res.status(500).json({ ok: false, error: 'sync_failed', message: err instanceof Error ? err.message : String(err) })
  }
})

export default router
