const cron = require('node-cron')
const { getServerSupabaseClient } = require('../lib/supabaseClient')
const { sendMail, isMailConfigured } = require('../lib/mail')
const { buildStoreAnalyticsHTML } = require('../emails/storeAnalyticsEmail')

async function resolveUserEmail(supabase, userId) {
  if (!userId) return null
  try {
    // Prefer public.users.email if present
    const { data: u } = await supabase.from('users').select('email').eq('id', userId).maybeSingle()
    if (u?.email) return u.email
  } catch {}
  try {
    // Fallback to auth admin lookup
    const { data, error } = await supabase.auth.admin.getUserById(userId)
    if (!error && data?.user?.email) return data.user.email
  } catch {}
  return null
}

async function buildForStore(supabase, userId, baseFront) {
  const cleanBase = (baseFront || 'https://ciclomarket.ar').replace(/\/$/, '')
  // Store name
  let storeName = ''
  try {
    const { data: u } = await supabase.from('users').select('store_name').eq('id', userId).maybeSingle()
    if (u?.store_name) storeName = u.store_name
  } catch {}

  const { data: summary } = await supabase
    .from('store_summary_30d')
    .select('*')
    .eq('store_user_id', userId)
    .maybeSingle()

  let { data: topRowsRaw } = await supabase
    .from('store_listing_summary_30d')
    .select('*')
    .eq('store_user_id', userId)
    .order('wa_clicks', { ascending: false, nullsFirst: false })
    .order('views', { ascending: false, nullsFirst: false })
    .limit(10)

  if (!topRowsRaw || topRowsRaw.length === 0) {
    const sinceIso = new Date(Date.now() - 30 * 24 * 60 * 60 * 1000).toISOString()
    const { data: eventsRaw } = await supabase
      .from('events')
      .select('listing_id,type,created_at')
      .eq('store_user_id', userId)
      .gte('created_at', sinceIso)
      .in('type', ['listing_view','wa_click'])
      .not('listing_id', 'is', null)
    const agg = new Map()
    for (const ev of (eventsRaw || [])) {
      const id = ev.listing_id
      if (!id) continue
      const row = agg.get(id) || { listing_id: id, store_user_id: userId, views: 0, wa_clicks: 0 }
      if (ev.type === 'listing_view') row.views += 1
      else if (ev.type === 'wa_click') row.wa_clicks += 1
      agg.set(id, row)
    }
    topRowsRaw = Array.from(agg.values()).sort((a, b) => (b.wa_clicks - a.wa_clicks) || (b.views - a.views)).slice(0, 10)
  }

  const listingIds = (topRowsRaw || []).map((r) => r.listing_id).filter(Boolean)
  let listingMap = {}
  if (listingIds.length) {
    const { data: listings } = await supabase
      .from('listings')
      .select('id,title,slug,status')
      .in('id', listingIds)
      .neq('status', 'deleted')
    listingMap = Object.fromEntries((listings || []).map((l) => [l.id, l]))
  }
  const topRows = (topRowsRaw || [])
    .filter((r) => Boolean(listingMap[r.listing_id]))
    .map((r) => {
      const l = listingMap[r.listing_id]
      const slugOrId = l?.slug || r.listing_id
      const link = `${cleanBase}/listing/${encodeURIComponent(slugOrId)}`
      return { ...r, title: l?.title || r.listing_id, link }
    })

  const dashboardUrl = `${cleanBase}/dashboard?tab=${encodeURIComponent('Analítica')}`
  const { html, text } = buildStoreAnalyticsHTML({
    baseFront: cleanBase,
    storeName,
    periodLabel: 'últimos 30 días',
    summary: summary || { store_views: 0, listing_views: 0, wa_clicks: 0 },
    topListings: topRows,
    dashboardUrl,
    unsubscribeLink: `${cleanBase}/ayuda`,
  })
  return { html, text }
}

async function runStoreAnalyticsDigestOnce() {
  if (!isMailConfigured()) {
    console.info('[storeAnalyticsDigest] mail not configured, skipping')
    return 0
  }
  const supabase = getServerSupabaseClient()
  const baseFront = (process.env.FRONTEND_URL || '').split(',')[0]?.trim() || 'https://ciclomarket.ar'

  // Fetch enabled stores
  const { data: stores, error } = await supabase
    .from('users')
    .select('id, store_enabled')
    .eq('store_enabled', true)
  if (error || !Array.isArray(stores) || stores.length === 0) {
    console.info('[storeAnalyticsDigest] no stores to notify')
    return 0
  }

  let sent = 0
  for (const row of stores) {
    try {
      const userId = row.id
      const email = await resolveUserEmail(supabase, userId)
      if (!email) { continue }
      const { html, text } = await buildForStore(supabase, userId, baseFront)
      await sendMail({
        from: process.env.SMTP_FROM || `Ciclo Market <${process.env.SMTP_USER || 'no-reply@ciclomarket.ar'}>`,
        to: email,
        subject: 'Resumen de tu tienda (30 días) · Ciclo Market',
        html,
        text,
      })
      sent += 1
    } catch (err) {
      console.warn('[storeAnalyticsDigest] failed for store', row?.id, err?.message || err)
    }
  }
  console.info('[storeAnalyticsDigest] sent:', sent)
  return sent
}

function startStoreAnalyticsDigestJob() {
  if (process.env.STORE_ANALYTICS_DIGEST_ENABLED !== 'true') {
    console.info('[storeAnalyticsDigest] disabled (STORE_ANALYTICS_DIGEST_ENABLED != "true")')
    return
  }
  const schedule = process.env.STORE_ANALYTICS_DIGEST_CRON || '0 10 * * 1' // Monday 10:00
  const tz = process.env.STORE_ANALYTICS_DIGEST_TZ || 'America/Argentina/Buenos_Aires'
  const task = cron.schedule(schedule, async () => {
    try {
      await runStoreAnalyticsDigestOnce()
    } catch (err) {
      console.error('[storeAnalyticsDigest] job failed', err)
    }
  }, { timezone: tz })
  task.start()
  console.info('[storeAnalyticsDigest] job started with cron', schedule, 'tz', tz)
}

module.exports = { startStoreAnalyticsDigestJob, runStoreAnalyticsDigestOnce }
