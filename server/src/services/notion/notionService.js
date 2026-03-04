const { z } = require('zod')
const { getNotionClient, notionRequest, getEnv } = require('./notionClient')

const reportSchema = z.object({
  weekKey: z.string().min(4),
  weekStart: z.string().min(8),
  weekEnd: z.string().min(8),
  newListings7d: z.number().int().nonnegative(),
  contacts7d: z.number().int().nonnegative(),
  priceDrops7d: z.number().int().nonnegative(),
  medianHoursToFirstContact: z.number().nonnegative().nullable(),
  listingsNoContact7dplus: z.number().int().nonnegative(),
  topListingsByViews: z.array(z.object({ listingId: z.string(), title: z.string(), views: z.number().int().nonnegative() })),
  bikeOfWeek: z.object({ listingId: z.string(), title: z.string(), views: z.number().int().nonnegative() }).nullable(),
})

const insightSchema = z.object({
  title: z.string().min(3),
  category: z.enum(['Demand', 'Supply', 'Funnel', 'Pricing']),
  metric: z.string().min(2),
  value: z.union([z.string(), z.number()]),
  periodStart: z.string().min(8),
  periodEnd: z.string().min(8),
  source: z.string().min(2).default('Supabase'),
})

const taskSchema = z.object({
  task: z.string().min(3),
  type: z.string().min(2),
  day: z.string().min(2),
  priority: z.string().min(2),
  status: z.string().min(2).default('Todo'),
  owner: z.string().min(2).default('Growth'),
  notes: z.string().default(''),
  taskKey: z.string().optional(),
})

function requireDbId(name) {
  const value = getEnv(name)
  if (!value) throw new Error(`${name} no configurado`)
  return value
}

function toRichText(value) {
  const content = String(value || '').slice(0, 2000)
  return [{ text: { content } }]
}

function buildWeeklyReportTitle(weekKey) {
  return `Weekly Market Report ${weekKey}`
}

function buildWeeklyReportLink(weekKey) {
  return `https://www.ciclomarket.ar/admin/growth-os?week=${encodeURIComponent(weekKey)}`
}

function buildReportNotes(kpis) {
  const medianText = Number.isFinite(kpis.medianHoursToFirstContact)
    ? `${kpis.medianHoursToFirstContact.toFixed(2)}h`
    : 'N/A'

  const bikeOfWeekText = kpis.bikeOfWeek
    ? `${kpis.bikeOfWeek.title} (${kpis.bikeOfWeek.views} views)`
    : 'sin datos'

  const topListings = kpis.topListingsByViews
    .slice(0, 5)
    .map((item, idx) => `${idx + 1}. ${item.title} (${item.views} views)`)
    .join(' | ')

  return [
    `Periodo: ${kpis.weekStart} -> ${kpis.weekEnd}`,
    `Bike of the week: ${bikeOfWeekText}`,
    `New listings (7d): ${kpis.newListings7d}`,
    `Contacts (7d): ${kpis.contacts7d}`,
    `Price drops (7d): ${kpis.priceDrops7d}`,
    `Median time to first contact (14d): ${medianText}`,
    `Listings no contact (+7d): ${kpis.listingsNoContact7dplus}`,
    `Top listings by views: ${topListings || 'sin datos'}`,
  ].join('\n')
}

async function findPageByUrl(databaseId, url) {
  const notion = getNotionClient()
  const response = await notionRequest('databases.query.findPageByUrl', () =>
    notion.databases.query({
      database_id: databaseId,
      page_size: 1,
      filter: {
        property: 'Link',
        url: {
          equals: url,
        },
      },
    })
  )

  return response.results?.[0] || null
}

async function findInsightByKey(databaseId, insightKey) {
  const notion = getNotionClient()
  const response = await notionRequest('databases.query.findInsightByKey', () =>
    notion.databases.query({
      database_id: databaseId,
      page_size: 1,
      filter: {
        property: 'InsightKey',
        rich_text: {
          contains: insightKey,
        },
      },
    })
  )

  return response.results?.[0] || null
}

async function findTaskByTaskKey(databaseId, taskKey) {
  const notion = getNotionClient()
  const response = await notionRequest('databases.query.findTaskByTaskKey', () =>
    notion.databases.query({
      database_id: databaseId,
      page_size: 1,
      filter: {
        property: 'Notes',
        rich_text: {
          contains: `[taskKey:${taskKey}]`,
        },
      },
    })
  )

  return response.results?.[0] || null
}

async function createWeeklyReport(rawKpis) {
  const kpis = reportSchema.parse(rawKpis)
  const notion = getNotionClient()
  const dbContent = requireDbId('NOTION_DB_CONTENT')

  const title = buildWeeklyReportTitle(kpis.weekKey)
  const link = buildWeeklyReportLink(kpis.weekKey)
  const notes = buildReportNotes(kpis)
  const publishDate = new Date(`${kpis.weekEnd}T12:00:00.000Z`).toISOString()

  const existing = await findPageByUrl(dbContent, link)

  const properties = {
    Title: {
      title: [{ text: { content: title } }],
    },
    Status: {
      select: { name: 'Published' },
    },
    Channel: {
      select: { name: 'Notion' },
    },
    'Publish Date': {
      date: { start: publishDate },
    },
    Link: {
      url: link,
    },
    Notes: {
      rich_text: toRichText(notes),
    },
    'Insight Ref': {
      rich_text: toRichText(`week:${kpis.weekKey}`),
    },
  }

  if (existing?.id) {
    await notionRequest('pages.update.weeklyReport', () => notion.pages.update({ page_id: existing.id, properties }))
    return { mode: 'updated', pageId: existing.id, title, link }
  }

  const created = await notionRequest('pages.create.weeklyReport', () =>
    notion.pages.create({
      parent: { database_id: dbContent },
      properties,
    })
  )

  return { mode: 'created', pageId: created.id, title, link }
}

async function upsertInsight(insightKey, rawPayload) {
  const payload = insightSchema.parse(rawPayload)
  const notion = getNotionClient()
  const dbInsights = requireDbId('NOTION_DB_INSIGHTS')

  const existing = await findInsightByKey(dbInsights, insightKey)

  const properties = {
    Title: { title: [{ text: { content: payload.title } }] },
    Category: { select: { name: payload.category } },
    Metric: { rich_text: toRichText(payload.metric) },
    Value: { rich_text: toRichText(payload.value) },
    Period: { date: { start: payload.periodStart, end: payload.periodEnd } },
    Source: { rich_text: toRichText(payload.source || 'Supabase') },
    InsightKey: { rich_text: toRichText(insightKey) },
  }

  if (existing?.id) {
    await notionRequest('pages.update.insight', () => notion.pages.update({ page_id: existing.id, properties }))
    return { mode: 'updated', pageId: existing.id, insightKey }
  }

  const created = await notionRequest('pages.create.insight', () =>
    notion.pages.create({
      parent: { database_id: dbInsights },
      properties,
    })
  )

  return { mode: 'created', pageId: created.id, insightKey }
}

async function createTask(rawPayload) {
  const payload = taskSchema.parse(rawPayload)
  const notion = getNotionClient()
  const dbTasks = requireDbId('NOTION_DB_TASKS')

  const taskKey = payload.taskKey || null
  if (taskKey) {
    const existing = await findTaskByTaskKey(dbTasks, taskKey)
    if (existing?.id) {
      return { mode: 'skipped_existing', pageId: existing.id, taskKey }
    }
  }

  const notes = taskKey ? `${payload.notes}\n[taskKey:${taskKey}]` : payload.notes

  const created = await notionRequest('pages.create.task', () =>
    notion.pages.create({
      parent: { database_id: dbTasks },
      properties: {
        Task: { title: [{ text: { content: payload.task } }] },
        Type: { select: { name: payload.type } },
        Day: { select: { name: payload.day } },
        Priority: { select: { name: payload.priority } },
        Status: { select: { name: payload.status } },
        Owner: { rich_text: toRichText(payload.owner) },
        Notes: { rich_text: toRichText(notes) },
      },
    })
  )

  return { mode: 'created', pageId: created.id, taskKey }
}

module.exports = {
  createWeeklyReport,
  upsertInsight,
  createTask,
}
