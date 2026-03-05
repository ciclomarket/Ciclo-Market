const cron = require('node-cron')
const { getServerSupabaseClient } = require('../lib/supabaseClient')
const { sendMail, isMailConfigured } = require('../lib/mail')
const { renderEmailTemplate } = require('./templateRenderer')
const { createUnsubscribeToken } = require('./unsubscribe')

const paymentAbandon20off = require('./campaigns/paymentAbandon20off')
const upgradeComparison = require('./campaigns/upgradeComparison')
const priceDropAlerts = require('./campaigns/priceDropAlerts')
const buyerInterestWeekly = require('./campaigns/buyerInterestWeekly')
const newArrivalsWeekly = require('./campaigns/newArrivalsWeekly')
const sellerWeeklyPerformance = require('./campaigns/sellerWeeklyPerformance')
const externalLeadsWeekly = require('./campaigns/externalLeadsWeekly')

const CAMPAIGNS = [
  paymentAbandon20off,
  upgradeComparison,
  priceDropAlerts,
  buyerInterestWeekly,
  newArrivalsWeekly,
  sellerWeeklyPerformance,
  externalLeadsWeekly,
]

function getTimeZone() {
  return String(process.env.EMAIL_TZ || 'America/Argentina/Buenos_Aires')
}

function getDatePartsInTz(date, timeZone) {
  const formatter = new Intl.DateTimeFormat('en-CA', {
    timeZone,
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
    weekday: 'short',
  })
  const parts = formatter.formatToParts(date)
  const values = {}
  for (const p of parts) values[p.type] = p.value
  return {
    year: Number(values.year),
    month: Number(values.month),
    day: Number(values.day),
    weekdayLabel: values.weekday,
  }
}

function isoWeekFromDateParts({ year, month, day }) {
  const utcDate = new Date(Date.UTC(year, month - 1, day))
  const dayNum = utcDate.getUTCDay() || 7
  utcDate.setUTCDate(utcDate.getUTCDate() + 4 - dayNum)
  const isoYear = utcDate.getUTCFullYear()
  const yearStart = new Date(Date.UTC(isoYear, 0, 1))
  const weekNo = Math.ceil((((utcDate - yearStart) / 86400000) + 1) / 7)
  return { isoYear, isoWeek: weekNo }
}

function weekdayNumber(label) {
  const map = { Sun: 0, Mon: 1, Tue: 2, Wed: 3, Thu: 4, Fri: 5, Sat: 6 }
  return map[label] ?? new Date().getDay()
}

function buildDateContext(dateOverride) {
  const now = dateOverride ? new Date(dateOverride) : new Date()
  const tz = getTimeZone()
  const parts = getDatePartsInTz(now, tz)
  const iso = isoWeekFromDateParts(parts)

  return {
    now,
    tz,
    ...parts,
    ...iso,
    dayOfWeek: weekdayNumber(parts.weekdayLabel),
    since7d: new Date(now.getTime() - 7 * 24 * 60 * 60 * 1000).toISOString(),
    since30d: new Date(now.getTime() - 30 * 24 * 60 * 60 * 1000).toISOString(),
  }
}

async function getFeatureFlags(supabase) {
  const defaults = {
    email_engine_enabled: true,
    campaign_payment_abandon_20off_enabled: true,
    campaign_upgrade_comparison_enabled: true,
    campaign_price_drop_alert_enabled: true,
    campaign_buyer_interest_weekly_enabled: true,
    campaign_new_arrivals_weekly_enabled: true,
    campaign_seller_weekly_performance_enabled: true,
    campaign_external_lead_weekly_enabled: true,
  }

  try {
    const keys = Object.keys(defaults)
    const { data } = await supabase
      .from('app_settings')
      .select('key,value')
      .in('key', keys)

    const out = { ...defaults }
    for (const row of data || []) {
      const enabled = row?.value?.enabled
      if (typeof enabled === 'boolean') out[row.key] = enabled
    }
    return out
  } catch {
    return defaults
  }
}

function campaignEnabled(flags, campaignName) {
  if (!flags.email_engine_enabled) return false
  const key = `campaign_${campaignName}_enabled`
  return flags[key] !== false
}

async function buildCandidateEmails({ supabase, dateCtx, flags, baseFront, serverBase, selectedCampaigns, forceWeekly }) {
  const candidates = []
  const selected = Array.isArray(selectedCampaigns) && selectedCampaigns.length
    ? new Set(selectedCampaigns)
    : null

  for (const campaignModule of CAMPAIGNS) {
    const name = campaignModule.CAMPAIGN
    if (selected && !selected.has(name)) continue
    if (!campaignEnabled(flags, name)) continue

    const rows = await campaignModule.buildCandidates({ supabase, dateCtx, baseFront, serverBase, forceWeekly })
    for (const row of rows || []) candidates.push(row)
  }

  return candidates
}

async function loadSuppressions(supabase, candidates) {
  const emails = [...new Set(candidates.map((c) => String(c.email || '').trim().toLowerCase()).filter(Boolean))]
  const userIds = [...new Set(candidates.map((c) => c.userId).filter(Boolean))]

  const [suppRes, prefRes] = await Promise.all([
    emails.length
      ? supabase.from('email_suppressions').select('email').in('email', emails)
      : Promise.resolve({ data: [] }),
    userIds.length
      ? supabase.from('user_notification_settings').select('user_id,marketing_emails_enabled,marketing_emails').in('user_id', userIds)
      : Promise.resolve({ data: [] }),
  ])

  const suppressedEmails = new Set((suppRes.data || []).map((r) => String(r.email || '').toLowerCase()))
  const optedOutUsers = new Set(
    (prefRes.data || [])
      .filter((r) => r.marketing_emails_enabled === false || r.marketing_emails === false)
      .map((r) => String(r.user_id))
  )

  return { suppressedEmails, optedOutUsers }
}

async function loadWeeklyCounts(supabase, dateCtx, candidates) {
  const userIds = [...new Set(candidates.map((c) => c.userId).filter(Boolean))]
  const emails = [...new Set(candidates.map((c) => String(c.email || '').toLowerCase()).filter(Boolean))]

  const [userRows, emailRows] = await Promise.all([
    userIds.length
      ? supabase
        .from('email_logs')
        .select('user_id')
        .in('user_id', userIds)
        .eq('iso_year', dateCtx.isoYear)
        .eq('iso_week', dateCtx.isoWeek)
        .eq('status', 'sent')
      : Promise.resolve({ data: [] }),
    emails.length
      ? supabase
        .from('email_logs')
        .select('email_to')
        .in('email_to', emails)
        .eq('iso_year', dateCtx.isoYear)
        .eq('iso_week', dateCtx.isoWeek)
        .eq('status', 'sent')
      : Promise.resolve({ data: [] }),
  ])

  const countByUser = new Map()
  for (const row of userRows.data || []) {
    const key = String(row.user_id)
    countByUser.set(key, (countByUser.get(key) || 0) + 1)
  }

  const countByEmail = new Map()
  for (const row of emailRows.data || []) {
    const key = String(row.email_to || '').toLowerCase()
    countByEmail.set(key, (countByEmail.get(key) || 0) + 1)
  }

  return { countByUser, countByEmail }
}

async function existingIdempotencySet(supabase, keys) {
  if (!keys.length) return new Set()
  const { data } = await supabase
    .from('email_logs')
    .select('idempotency_key')
    .in('idempotency_key', keys)
  return new Set((data || []).map((r) => String(r.idempotency_key)))
}

async function logEmail(supabase, row) {
  await supabase.from('email_logs').insert(row)
}

function dedupeByPriority(candidates) {
  const byRecipient = new Map()
  for (const candidate of candidates) {
    const recipientKey = candidate.userId ? `u:${candidate.userId}` : `e:${String(candidate.email || '').toLowerCase()}`
    const current = byRecipient.get(recipientKey)
    if (!current || Number(candidate.priority) < Number(current.priority)) {
      byRecipient.set(recipientKey, candidate)
    }
  }
  return [...byRecipient.values()]
}

async function runEmailOrchestrator({ dryRun = false, campaigns = null, dateOverride = null, forceWeekly = false } = {}) {
  const supabase = getServerSupabaseClient()
  const flags = await getFeatureFlags(supabase)
  const dateCtx = buildDateContext(dateOverride)

  const baseFront = String(process.env.FRONTEND_URL || 'https://www.ciclomarket.ar').split(',')[0].trim().replace(/\/$/, '')
  const serverBase = String(process.env.SERVER_BASE_URL || process.env.PUBLIC_BASE_URL || 'https://ciclo-market.onrender.com').trim().replace(/\/$/, '')

  const summary = {
    dryRun,
    dateCtx: {
      isoYear: dateCtx.isoYear,
      isoWeek: dateCtx.isoWeek,
      dayOfWeek: dateCtx.dayOfWeek,
      tz: dateCtx.tz,
    },
    totals: {
      candidates: 0,
      sent: 0,
      skipped: 0,
      failed: 0,
    },
    byCampaign: {},
    skipped: [],
    sent: [],
  }

  if (!flags.email_engine_enabled) {
    return { ...summary, disabled: true }
  }

  const candidates = await buildCandidateEmails({
    supabase,
    dateCtx,
    flags,
    baseFront,
    serverBase,
    selectedCampaigns: campaigns,
    forceWeekly,
  })

  summary.totals.candidates = candidates.length
  if (!candidates.length) return summary

  const filteredByPriority = dedupeByPriority(candidates)
  const { suppressedEmails, optedOutUsers } = await loadSuppressions(supabase, filteredByPriority)
  const { countByUser, countByEmail } = await loadWeeklyCounts(supabase, dateCtx, filteredByPriority)
  const existingKeys = await existingIdempotencySet(supabase, filteredByPriority.map((c) => c.idempotencyKey))

  for (const candidate of filteredByPriority) {
    const email = String(candidate.email || '').trim().toLowerCase()
    const userId = candidate.userId ? String(candidate.userId) : null

    const campaignBucket = summary.byCampaign[candidate.campaign] || { sent: 0, skipped: 0, failed: 0 }

    let skipReason = null
    if (!email) skipReason = 'missing_email'
    else if (suppressedEmails.has(email)) skipReason = 'suppressed'
    else if (userId && optedOutUsers.has(userId)) skipReason = 'marketing_disabled'
    else if (existingKeys.has(candidate.idempotencyKey)) skipReason = 'duplicate'
    else {
      const userCount = userId ? Number(countByUser.get(userId) || 0) : 0
      const emailCount = Number(countByEmail.get(email) || 0)
      if (Math.max(userCount, emailCount) >= 3) skipReason = 'weekly_limit'
    }

    if (skipReason) {
      summary.totals.skipped += 1
      campaignBucket.skipped += 1
      summary.skipped.push({ campaign: candidate.campaign, email, reason: skipReason })
      summary.byCampaign[candidate.campaign] = campaignBucket
      await logEmail(supabase, {
        campaign: candidate.campaign,
        priority: candidate.priority,
        user_id: userId,
        lead_email: candidate.leadEmail || null,
        email_to: email || candidate.leadEmail || 'unknown',
        listing_id: candidate.listingId || null,
        payment_id: candidate.paymentId || null,
        idempotency_key: candidate.idempotencyKey,
        iso_year: dateCtx.isoYear,
        iso_week: dateCtx.isoWeek,
        status: 'skipped',
        skip_reason: skipReason,
        provider: 'smtp',
        subject: candidate.payload?.subject || null,
        metadata: candidate.payload || {},
      })
      continue
    }

    const unsubscribeToken = createUnsubscribeToken({
      email,
      userId: userId || null,
      exp: Date.now() + 180 * 24 * 60 * 60 * 1000,
    })

    const rendered = renderEmailTemplate({
      campaign: candidate.campaign,
      baseFront,
      recipient: { email, userId },
      payload: {
        ...candidate.payload,
        unsubscribeUrl: `${serverBase}/unsubscribe?token=${encodeURIComponent(unsubscribeToken)}`,
      },
    })

    if (dryRun) {
      summary.sent.push({ campaign: candidate.campaign, email, dryRun: true, subject: rendered.subject })
      summary.totals.sent += 1
      campaignBucket.sent += 1
      summary.byCampaign[candidate.campaign] = campaignBucket
      continue
    }

    try {
      const response = await sendMail({
        from: process.env.SMTP_FROM || `${rendered.campaign} <notificaciones@ciclomarket.ar>`,
        to: email,
        subject: rendered.subject,
        html: rendered.html,
        text: rendered.text,
        headers: {
          'List-Unsubscribe': `<${serverBase}/unsubscribe?token=${encodeURIComponent(unsubscribeToken)}>`,
        },
      })

      const providerMessageId = response?.id || response?.messageId || null
      summary.totals.sent += 1
      campaignBucket.sent += 1
      summary.sent.push({ campaign: candidate.campaign, email, subject: rendered.subject })

      if (userId) countByUser.set(userId, (countByUser.get(userId) || 0) + 1)
      countByEmail.set(email, (countByEmail.get(email) || 0) + 1)

      await logEmail(supabase, {
        campaign: candidate.campaign,
        priority: candidate.priority,
        user_id: userId,
        lead_email: candidate.leadEmail || null,
        email_to: email,
        listing_id: candidate.listingId || null,
        payment_id: candidate.paymentId || null,
        idempotency_key: candidate.idempotencyKey,
        iso_year: dateCtx.isoYear,
        iso_week: dateCtx.isoWeek,
        status: 'sent',
        provider: 'smtp',
        provider_message_id: providerMessageId,
        subject: rendered.subject,
        metadata: candidate.payload || {},
      })

      if (candidate.campaign === 'external_lead_weekly') {
        await supabase
          .from('external_leads')
          .update({ last_sent_at: new Date().toISOString(), last_seen_at: new Date().toISOString() })
          .eq('email', email)
      }
    } catch (err) {
      summary.totals.failed += 1
      campaignBucket.failed += 1
      await logEmail(supabase, {
        campaign: candidate.campaign,
        priority: candidate.priority,
        user_id: userId,
        lead_email: candidate.leadEmail || null,
        email_to: email,
        listing_id: candidate.listingId || null,
        payment_id: candidate.paymentId || null,
        idempotency_key: candidate.idempotencyKey,
        iso_year: dateCtx.isoYear,
        iso_week: dateCtx.isoWeek,
        status: 'failed',
        provider: 'smtp',
        subject: rendered.subject,
        metadata: candidate.payload || {},
        error: err?.message || 'send_failed',
      })
    }

    summary.byCampaign[candidate.campaign] = campaignBucket
  }

  return summary
}

function startEmailOrchestratorJob() {
  const enabled = process.env.EMAIL_ENGINE_ENABLED
  if (enabled === 'false') {
    console.info('[email_orchestrator] disabled (EMAIL_ENGINE_ENABLED=false)')
    return
  }

  const schedule = process.env.EMAIL_ENGINE_CRON || '30 10 * * *'
  const tz = getTimeZone()

  const task = cron.schedule(schedule, async () => {
    try {
      const result = await runEmailOrchestrator({ dryRun: false })
      console.info('[email_orchestrator] completed', {
        sent: result?.totals?.sent || 0,
        skipped: result?.totals?.skipped || 0,
        failed: result?.totals?.failed || 0,
      })
    } catch (err) {
      console.error('[email_orchestrator] failed', err)
    }
  }, { timezone: tz })

  task.start()
  console.info('[email_orchestrator] started with cron', schedule, 'tz', tz)
}

module.exports = {
  runEmailOrchestrator,
  startEmailOrchestratorJob,
  buildDateContext,
}
