const express = require('express')
const { getServerSupabaseClient } = require('../lib/supabaseClient')
const { runEmailOrchestrator } = require('../email/orchestrator')
const {
  verifyUnsubscribeToken,
  applySuppression,
  validateEmail,
  renderUnsubscribeHtml,
} = require('../email/unsubscribe')
const {
  createListingUpgradePreference,
  verifyUpgradeToken,
} = require('../email/mercadopagoCheckout')
const { recordPaymentIntent } = require('../services/paymentService')

const router = express.Router()
const leadRateLimit = new Map()

function extractBearer(req) {
  const header = req.headers['authorization'] || req.headers['x-cron-secret']
  if (!header) return null
  const value = String(header).trim()
  if (/^bearer\s+/i.test(value)) return value.replace(/^bearer\s+/i, '').trim()
  return value
}

function ensureCronSecret(req, res, next) {
  const provided = extractBearer(req)
  const expected = process.env.CRON_SECRET
  if (!expected) return res.status(500).json({ ok: false, error: 'server_misconfigured' })
  if (!provided || provided !== expected) return res.status(401).json({ ok: false, error: 'unauthorized' })
  next()
}

async function getAuthUser(req, supabase) {
  const header = String(req.headers.authorization || '')
  if (!header.startsWith('Bearer ')) return null
  const token = header.slice(7).trim()
  if (!token) return null
  try {
    const { data, error } = await supabase.auth.getUser(token)
    if (error || !data?.user) return null
    return data.user
  } catch {
    return null
  }
}

function getRequesterIp(req) {
  const raw = req.headers['x-forwarded-for'] || req.ip || req.socket?.remoteAddress || 'unknown'
  return String(Array.isArray(raw) ? raw[0] : raw).split(',')[0].trim()
}

function checkLeadRateLimit(ip) {
  const now = Date.now()
  const windowMs = 10 * 60 * 1000
  const maxAttempts = 30
  const hits = leadRateLimit.get(ip) || []
  const kept = hits.filter((t) => now - t < windowMs)
  kept.push(now)
  leadRateLimit.set(ip, kept)
  return kept.length <= maxAttempts
}

async function handleListingUpgradeCheckout(req, res, { redirect = false } = {}) {
  const supabase = getServerSupabaseClient()
  const authUser = await getAuthUser(req, supabase)

  let userId = authUser?.id || null
  let userEmail = authUser?.email || null
  let listingId = String(req.body?.listingId || '').trim()
  let planCode = String(req.body?.planCode || '').trim().toLowerCase()
  let campaign = String(req.body?.campaign || 'upgrade_comparison').trim().toLowerCase()
  let discountPct = Number(req.body?.discountPct || 0)

  const token = String(req.body?.token || req.query?.token || '').trim()
  if (token) {
    const payload = verifyUpgradeToken(token)
    if (!payload) return res.status(401).json({ ok: false, error: 'invalid_token' })
    userId = payload.userId || userId
    listingId = payload.listingId || listingId
    planCode = String(payload.planCode || planCode || '').toLowerCase()
    campaign = String(payload.campaign || campaign)
    discountPct = Number(payload.discountPct || discountPct || 0)
  }

  if (!userId || !listingId || !['premium', 'pro', 'basic'].includes(planCode)) {
    return res.status(400).json({ ok: false, error: 'invalid_payload' })
  }

  const { data: listing, error } = await supabase
    .from('listings')
    .select('id,seller_id,slug,title,plan,plan_code,seller_plan')
    .eq('id', listingId)
    .maybeSingle()

  if (error || !listing) return res.status(404).json({ ok: false, error: 'listing_not_found' })
  if (String(listing.seller_id) !== String(userId)) return res.status(403).json({ ok: false, error: 'forbidden' })

  const currentPlans = [listing.plan, listing.plan_code, listing.seller_plan].map((v) => String(v || '').toLowerCase())
  if (planCode === 'premium' && currentPlans.includes('premium')) {
    return res.status(409).json({ ok: false, error: 'already_premium' })
  }
  if (planCode === 'pro' && currentPlans.includes('pro')) {
    return res.status(409).json({ ok: false, error: 'already_pro' })
  }

  if (!userEmail) {
    const { data: userRow } = await supabase.from('users').select('email').eq('id', userId).maybeSingle()
    userEmail = userRow?.email || null
  }

  try {
    const result = await createListingUpgradePreference({
      userId,
      userEmail,
      listingId,
      planCode,
      campaign,
      discountPct,
      metadata: { listingSlug: listing.slug || null },
    })

    try {
      await recordPaymentIntent({
        userId,
        listingId,
        amount: result.amount,
        currency: 'ARS',
        status: 'pending',
        providerRef: result.checkoutRef,
      })
    } catch (err) {
      console.warn('[emailEngine] recordPaymentIntent failed', err?.message || err)
    }

    if (redirect) return res.redirect(302, result.url)
    return res.json({ ok: true, url: result.url, preference_id: result.preferenceId })
  } catch (err) {
    console.error('[emailEngine] listing-upgrade failed', err)
    return res.status(500).json({ ok: false, error: err?.message || 'checkout_failed' })
  }
}

router.get('/unsubscribe', async (req, res) => {
  const supabase = getServerSupabaseClient()
  const token = String(req.query.token || '').trim()
  const parsed = verifyUnsubscribeToken(token)
  if (!parsed?.email) return res.status(400).send('Solicitud inválida.')

  try {
    await applySuppression(supabase, {
      email: parsed.email,
      userId: parsed.userId || null,
      reason: 'unsubscribe',
      source: 'unsubscribe_token',
    })
    return res.status(200).send(renderUnsubscribeHtml(parsed.email))
  } catch (err) {
    console.error('[emailEngine] unsubscribe failed', err)
    return res.status(500).send('No pudimos procesar tu baja en este momento.')
  }
})

router.post('/api/leads/subscribe', async (req, res) => {
  const ip = getRequesterIp(req)
  if (!checkLeadRateLimit(ip)) {
    return res.status(429).json({ ok: false, error: 'rate_limited' })
  }

  const email = String(req.body?.email || '').trim().toLowerCase()
  const source = String(req.body?.source || 'unknown').trim().slice(0, 120)
  if (!validateEmail(email)) {
    return res.status(400).json({ ok: false, error: 'invalid_email' })
  }

  const supabase = getServerSupabaseClient()

  try {
    const { data: suppressed } = await supabase
      .from('email_suppressions')
      .select('email')
      .eq('email', email)
      .maybeSingle()

    if (suppressed?.email) {
      return res.json({ ok: true, suppressed: true })
    }

    await supabase
      .from('external_leads')
      .upsert({
        email,
        source,
        status: 'active',
        last_seen_at: new Date().toISOString(),
      }, { onConflict: 'email' })

    return res.json({ ok: true })
  } catch (err) {
    console.error('[emailEngine] lead subscribe failed', err)
    return res.status(500).json({ ok: false, error: 'unexpected_error' })
  }
})

router.post('/api/checkout/listing-upgrade', async (req, res) => {
  return handleListingUpgradeCheckout(req, res, { redirect: false })
})

router.get('/api/checkout/listing-upgrade', async (req, res) => {
  const body = {
    token: req.query?.token,
    listingId: req.query?.listingId,
    planCode: req.query?.planCode,
    campaign: req.query?.campaign,
    discountPct: req.query?.discountPct,
  }
  req.body = body
  return handleListingUpgradeCheckout(req, res, { redirect: true })
})

router.post('/api/cron/email-orchestrator', ensureCronSecret, async (req, res) => {
  try {
    const result = await runEmailOrchestrator({
      dryRun: req.body?.dryRun === true,
      campaigns: Array.isArray(req.body?.campaigns) ? req.body.campaigns : null,
      dateOverride: req.body?.dateOverride || null,
      forceWeekly: req.body?.forceWeekly === true,
    })

    return res.json({ ok: true, ...result })
  } catch (err) {
    console.error('[emailEngine] orchestrator failed', err)
    return res.status(500).json({ ok: false, error: err?.message || 'orchestrator_failed' })
  }
})

module.exports = {
  emailEngineRouter: router,
}
