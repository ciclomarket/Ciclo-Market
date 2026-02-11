// server/src/index.js
try {
  require('dotenv').config()
} catch (error) {
  if (error && error.code !== 'MODULE_NOT_FOUND') {
    console.warn('dotenv failed to load:', error.message || error)
  }
}

const express = require('express')
const cors = require('cors')
const crypto = require('crypto')
const { MercadoPagoConfig, Preference } = require('mercadopago')
const { createClient: createSupabaseServerClient } = require('@supabase/supabase-js')
const { sendMail, isMailConfigured } = require('./lib/mail')
const { getServerSupabaseClient } = require('./lib/supabaseClient')
const {
  buildListingMatchContext,
  matchesSavedSearchCriteria,
  buildSavedSearchEmail,
  resolveFrontendBaseUrl,
} = require('./lib/savedSearch')
const { startRenewalNotificationJob } = (() => {
  try { return require('./jobs/renewalNotifier') } catch { return {} }
})()
const { startNewsletterDigestJob, runDigestOnce } = (() => {
  try { return require('./jobs/newsletterDigest') } catch { return {} }
})()
const { startStoreAnalyticsDigestJob, runStoreAnalyticsDigestOnce } = (() => {
  try { return require('./jobs/storeAnalyticsDigest') } catch { return {} }
})()
const { startMarketingAutomationsJob, runMarketingAutomationsOnce } = (() => {
  try { return require('./jobs/marketingAutomations') } catch { return {} }
})()
const { startSavedSearchDigestJob, runSavedSearchDigestOnce } = (() => {
  try { return require('./jobs/savedSearchDigest') } catch { return {} }
})()
const { startDeletedPurgerJob } = (() => {
  try { return require('./jobs/deletedPurger') } catch { return {} }
})()
const { buildStoreAnalyticsHTML } = (() => {
  try { return require('./emails/storeAnalyticsEmail') } catch { return {} }
})()
const { buildEmailHtml: buildFree2PaidEmailHtml } = (() => {
  try { return require('./jobs/campaignFreeToPaid') } catch { return {} }
})()
const { processPayment, recordPaymentIntent } = require('./services/paymentService')
const appApiRouter = require('./routes/appApi')
const importRouter = require('./routes/import')
// Sweepstake feature removed
const path = require('path')
// const https = require('https') // removed: used only for Google rating proxy

// Optional service-scoped Supabase client used for server-side writes (payments, credits)
// Falls back to per-request clients if not configured.
const supabaseService = (() => {
  try {
    const url = process.env.SUPABASE_SERVICE_URL || process.env.SUPABASE_URL || process.env.VITE_SUPABASE_URL
    const key = process.env.SUPABASE_SERVICE_ROLE_KEY
    if (!url || !key) {
      console.warn('[server] SUPABASE_SERVICE_ROLE_KEY no configurada; operaciones de pago/creditos usarán fallback')
      return null
    }
    return createSupabaseServerClient(url, key)
  } catch (err) {
    console.warn('[server] supabaseService init failed', err?.message || err)
    return null
  }
})()

// Mercado Pago client (used for checkout + payment lookups)
const mpClient = (() => {
  const token = String(process.env.MERCADOPAGO_ACCESS_TOKEN || '').trim()
  if (!token) {
    console.warn('[payments] MERCADOPAGO_ACCESS_TOKEN no configurado; /api/checkout deshabilitado')
    return null
  }
  try {
    return new MercadoPagoConfig({ accessToken: token })
  } catch (err) {
    console.error('[payments] error inicializando MP client', err)
    return null
  }
})()

function normalizeOrigin(frontendUrlEnv) {
  const raw = (frontendUrlEnv || '').split(',')[0]?.trim()
  if (!raw) return 'https://www.ciclomarket.ar'
  try {
    const url = new URL(raw.startsWith('http') ? raw : `https://${raw}`)
    const host = url.hostname.startsWith('www.') ? url.hostname : `www.${url.hostname}`
    url.protocol = 'https:'
    url.hostname = host.replace(/^www\.www\./, 'www.')
    url.pathname = ''
    return url.toString().replace(/\/$/, '')
  } catch {
    return raw.startsWith('http') ? raw.replace(/\/$/, '') : `https://${raw.replace(/\/$/, '')}`
  }
}

const app = express()
app.set('trust proxy', 1) // Confiar en el primer proxy (Cloudflare/Render)

// --- SITEMAP FIX: PRIMERO QUE NADA ---
app.get('/sitemap.xml', async (req, res) => {
  try {
    const baseUrl = 'https://www.ciclomarket.ar'
    const xmlHeader = '<?xml version="1.0" encoding="UTF-8"?>'

    const escapeXml = (value) =>
      String(value ?? '')
        .replace(/&/g, '&amp;')
        .replace(/</g, '&lt;')
        .replace(/>/g, '&gt;')
        .replace(/"/g, '&quot;')
        .replace(/'/g, '&apos;')

    const nowIso = new Date().toISOString()
    const listingsPerPage = 500
    let totalPages = 1

    try {
      const supabase = getServerSupabaseClient()
      const { count, error } = await supabase.from('listings').select('id', { count: 'exact', head: true }).eq('status', 'active')
      if (!error && typeof count === 'number' && count > 0) {
        totalPages = Math.max(1, Math.ceil(count / listingsPerPage))
      }
    } catch (err) {
      console.warn('[sitemap] count lookup failed (fallback to 1 page)', err?.message || err)
    }

    const entries = [
      { loc: `${baseUrl}/sitemap-static.xml`, lastmod: nowIso },
      { loc: `${baseUrl}/sitemap-categories.xml`, lastmod: nowIso },
      { loc: `${baseUrl}/sitemap-stores.xml`, lastmod: nowIso },
      { loc: `${baseUrl}/sitemap-blog.xml`, lastmod: nowIso },
      { loc: `${baseUrl}/sitemap-shopping.xml`, lastmod: nowIso },
    ]
    for (let page = 1; page <= totalPages; page += 1) {
      entries.push({ loc: `${baseUrl}/sitemap-listings-${page}.xml`, lastmod: nowIso })
    }

    const payload = entries
      .map(({ loc, lastmod }) => `  <sitemap>\n    <loc>${escapeXml(loc)}</loc>\n    <lastmod>${escapeXml(lastmod)}</lastmod>\n  </sitemap>`)
      .join('\n')

    const xml = `${xmlHeader}\n<sitemapindex xmlns="http://www.sitemaps.org/schemas/sitemap/0.9">\n${payload}\n</sitemapindex>`

    res.header('Content-Type', 'application/xml; charset=utf-8')
    return res.status(200).send(xml)
  } catch (e) {
    console.error('[sitemap] /sitemap.xml failed', e)
    return res.status(500).end()
  }
})
// -------------------------------------

app.use(express.json())

app.use((req, res, next) => {
  const forwardedHostHeader = req.headers['x-forwarded-host']
  const forwardedHost = Array.isArray(forwardedHostHeader) ? forwardedHostHeader[0] : forwardedHostHeader
  const rawHost = String(forwardedHost || req.headers.host || '').split(',')[0]?.trim()
  const protoHeader = req.headers['x-forwarded-proto']
  const forwardedProto = Array.isArray(protoHeader) ? protoHeader[0] : protoHeader
  const currentProto = String(forwardedProto || req.protocol || 'http').toLowerCase()

  const hostOnly = (rawHost || '').split(':')[0]
  const prefersCiclomarket = /(?:^|\.)ciclomarket\.ar$/i.test(hostOnly)
  const enforceHost = /^ciclomarket\.ar$/i.test(hostOnly)
  const targetHost = enforceHost ? 'www.ciclomarket.ar' : hostOnly
  const shouldForceHttps = prefersCiclomarket && currentProto !== 'https'

  if ((enforceHost || shouldForceHttps) && targetHost) {
    const redirectUrl = new URL(req.originalUrl, `https://${targetHost}`)
    redirectUrl.protocol = 'https:'
    redirectUrl.host = targetHost
    return res.redirect(301, redirectUrl.toString())
  }

  if (prefersCiclomarket && req.path.length > 1 && req.path.endsWith('/')) {
    const normalized = new URL(req.originalUrl, `${currentProto}://${targetHost || rawHost}`)
    normalized.pathname = normalized.pathname.replace(/\/+$/, '')
    normalized.protocol = prefersCiclomarket ? 'https:' : normalized.protocol
    if (targetHost) normalized.host = targetHost
    return res.redirect(301, normalized.toString())
  }

  return next()
})

/* ----------------------------- Static assets ------------------------------ */
const distDir = path.join(__dirname, '..', '..', 'dist')
// Static assets live at project-root/public (not server/public)
const publicDir = path.join(__dirname, '..', '..', 'public')
// Admin panel (built separately)
const adminDistDir = path.join(__dirname, '..', '..', 'dist-admin')
const sitemapRouter = require('./routes/sitemaps')
const feedsRouter = require('./routes/feeds')

app.use(
  express.static(distDir, {
    fallthrough: true,
    setHeaders(res, filePath) {
      if (filePath.endsWith('index.html')) {
        res.setHeader('Cache-Control', 'no-cache, no-store, must-revalidate')
      } else if (/\.(?:js|css|png|jpe?g|webp|avif|svg|ico|gif|woff2?)$/i.test(filePath)) {
        res.setHeader('Cache-Control', 'public, max-age=31536000, immutable')
      }
    },
  })
)
// Serve admin build under /admin
app.use(
  '/admin',
  express.static(adminDistDir, {
    fallthrough: true,
    setHeaders(res, filePath) {
      if (filePath.endsWith('index.html')) {
        res.setHeader('Cache-Control', 'no-cache, no-store, must-revalidate')
      } else if (/\.(?:js|css|png|jpe?g|webp|avif|svg|ico|gif|woff2?)$/i.test(filePath)) {
        res.setHeader('Cache-Control', 'public, max-age=31536000, immutable')
      }
    },
  })
)
app.use(
  express.static(publicDir, {
    maxAge: '30d',
    setHeaders(res, filePath) {
      if (filePath.endsWith('.xml')) {
        res.setHeader('Content-Type', 'application/xml; charset=utf-8')
      }
      if (/\.(?:html|xml|txt|json)$/i.test(filePath)) {
        res.setHeader('Cache-Control', 'public, max-age=300, must-revalidate')
      } else {
        res.setHeader('Cache-Control', 'public, max-age=2592000, immutable')
      }
    },
  })
)

// Sitemaps & custom API endpoints
app.use(sitemapRouter)
app.use(feedsRouter)

// Preview endpoint for Free→Paid campaign email (HTML)
app.get('/api/preview/campaign/free2paid', async (req, res) => {
  try {
    if (typeof buildFree2PaidEmailHtml !== 'function') {
      return res.status(501).type('text/plain').send('Preview not available')
    }
    const supabase = getServerSupabaseClient()
    const listingId = req.query.listingId ? String(req.query.listingId) : null
    const sellerId = req.query.sellerId ? String(req.query.sellerId) : null
    let listing = null
    if (listingId) {
      const { data } = await supabase
        .from('listings')
        .select('id,seller_id,title,price,price_currency,images,plan,plan_code,seller_plan,status,slug,location,seller_location')
        .eq('id', listingId)
        .maybeSingle()
      listing = data
    } else {
      let query = supabase
        .from('listings')
        // Nota: algunas instalaciones no tienen `updated_at` en `listings`.
        .select('id,seller_id,title,price,price_currency,images,plan,plan_code,seller_plan,status,slug,location,seller_location,created_at')
        .or('status.in.(active,published),status.is.null')
        .or('plan.eq.free,plan_code.eq.free,seller_plan.eq.free')
        .order('created_at', { ascending: false, nullsLast: true })
        .limit(1)
      if (sellerId) query = query.eq('seller_id', sellerId)
      const { data } = await query
      listing = Array.isArray(data) && data[0] ? data[0] : null
    }
    let profile = null
    if (listing?.seller_id) {
      const { data } = await supabase
        .from('users')
        .select('id,full_name,email')
        .eq('id', listing.seller_id)
        .maybeSingle()
      profile = data
    }
    const html = buildFree2PaidEmailHtml({
      baseFront: resolveFrontendBaseUrl(),
      profile,
      listing,
    })
    return res.type('text/html; charset=utf-8').send(html)
  } catch (err) {
    console.error('[preview/free2paid] failed', err)
    return res.status(500).type('text/plain').send('Preview error')
  }
})

/* ----------------------------- CORS --------------------------------------- */
// Permitir CORS amplio (ajustable por FRONTEND_URL si se quiere restringir)
const allowed = (() => {
  const raw = (process.env.FRONTEND_URL || '')
    .split(',')
    .map((s) => s.trim())
    .filter(Boolean)
  if (!raw.length) return []
  const expanded = new Set()
  for (const entry of raw) {
    const normalized = entry.replace(/\/$/, '')
    if (!normalized) continue
    expanded.add(normalized)
    try {
      const url = new URL(normalized.startsWith('http') ? normalized : `https://${normalized}`)
      const host = url.hostname
      if (host.startsWith('www.')) {
        url.hostname = host.replace(/^www\./, '')
        expanded.add(url.toString().replace(/\/$/, ''))
      } else {
        url.hostname = `www.${host}`
        expanded.add(url.toString().replace(/\/$/, ''))
      }
    } catch {
      // ignore malformed entries
    }
  }
  return Array.from(expanded)
})()

const corsOptions = {
  origin: allowed.length ? allowed : (origin, cb) => cb(null, true),
  credentials: true,
  methods: ['GET', 'POST', 'PUT', 'PATCH', 'DELETE', 'OPTIONS'],
  allowedHeaders: ['Content-Type', 'Authorization', 'X-Requested-With'],
}

app.use(cors(corsOptions))
app.options('*', cors(corsOptions))

// Import endpoints (MercadoLibre, etc.)
app.use(importRouter)

// Custom application API (analytics, reviews, share boost, etc.)
app.use(appApiRouter)

/* ----------------------------- Cron jobs ---------------------------------- */
// Start scheduled jobs after basic middleware is ready
try { startNewsletterDigestJob && startNewsletterDigestJob() } catch {}
try { startStoreAnalyticsDigestJob && startStoreAnalyticsDigestJob() } catch {}
try { startMarketingAutomationsJob && startMarketingAutomationsJob() } catch {}
try { startSavedSearchDigestJob && startSavedSearchDigestJob() } catch {}
try { startDeletedPurgerJob && startDeletedPurgerJob() } catch {}

/* Google Reviews endpoints removed */

/* ----------------------------- Checkout (Mercado Pago) -------------------- */
app.post('/api/checkout', async (req, res) => {
  try {
    if (!mpClient) return res.status(503).json({ ok: false, error: 'payments_unavailable' })
    const supabase = getServerSupabaseClient()
    const authUser = await getAuthUser(req, supabase)

    const body = req.body || {}
    const rawPlan = body.planCode || body.planId
    const planCode = normalisePlanCode(rawPlan)
    const amount = Number(body.amount)
    const currency = (body.planCurrency || 'ARS').toString()
    const planName = (body.planName || (planCode === 'premium' ? 'Plan Premium' : planCode === 'basic' ? 'Plan Básico' : String(body.planId || 'Checkout'))).toString()
    const promoCode = (body.promo || body.promoCode || '').toString().trim().toLowerCase()
    const redirect = body.redirectUrls || {}
    const backUrls = {
      success: typeof redirect.success === 'string' && redirect.success ? redirect.success : `${resolveFrontendBaseUrl()}/dashboard?payment=success`,
      failure: typeof redirect.failure === 'string' && redirect.failure ? redirect.failure : `${resolveFrontendBaseUrl()}/dashboard?payment=failure`,
      pending: typeof redirect.pending === 'string' && redirect.pending ? redirect.pending : `${resolveFrontendBaseUrl()}/dashboard?payment=pending`,
    }

    if (!Number.isFinite(amount) || amount <= 0) {
      return res.status(400).json({ ok: false, error: 'invalid_amount' })
    }

    // Validate amount server-side to avoid client tampering
    async function fetchPlanBasePrice(code) {
      try {
        const svc = getServerSupabaseClient()
        const { data } = await svc
          .from('plans')
          .select('id,code,name,price')
          .or('code.eq.' + code + ',id.eq.' + code + ',name.ilike.%' + code + '%')
          .limit(1)
          .maybeSingle()
        if (data && typeof data.price === 'number' && data.price > 0) return Number(data.price)
      } catch {}
      // Fallbacks aligned with frontend FALLBACK_PLANS
      if (code === 'basic') return 9000
      if (code === 'premium') return 13000
      return 0
    }

    let expectedAmount = 0
    if (planCode === 'basic' || planCode === 'premium') {
      const base = await fetchPlanBasePrice(planCode)
      const promoAllowed = promoCode === 'free2paid'
      if (promoAllowed) {
        expectedAmount = planCode === 'basic' ? 5000 : 9000
      } else {
        expectedAmount = base
      }
    } else {
      expectedAmount = amount // other flows (e.g., pro) not discounted here
    }

    if (!Number.isFinite(expectedAmount) || expectedAmount <= 0) {
      return res.status(400).json({ ok: false, error: 'amount_not_configured' })
    }
    if (Math.round(amount) !== Math.round(expectedAmount)) {
      return res.status(400).json({ ok: false, error: 'amount_mismatch', expected: expectedAmount })
    }

    const fallbackUserId = body.userId ? String(body.userId) : null
    const userId = (authUser && authUser.id) ? authUser.id : fallbackUserId
    if (!userId) return res.status(401).json({ ok: false, error: 'unauthorized' })

	    const metadata = {
	      userId,
	      planCode: planCode || null,
	      planId: String(body.planId || rawPlan || ''),
	      listingId: body.listingId ? String(body.listingId) : undefined,
	      listingSlug: body.listingSlug ? String(body.listingSlug) : undefined,
	      upgradePlanCode: planCode || undefined,
	      ...((typeof body.metadata === 'object' && body.metadata) || {}),
	    }

	    const checkoutRef = typeof crypto.randomUUID === 'function'
	      ? `mb_${crypto.randomUUID()}`
	      : `mb_${Date.now()}_${Math.random().toString(16).slice(2)}`
	    metadata.checkoutRef = checkoutRef

	    const itemCategoryId = String(process.env.MERCADOPAGO_ITEM_CATEGORY_ID || 'services').trim()
	    const itemId = String(body.itemId || `plan_${planCode || metadata.planId || 'checkout'}`).trim()
	    const itemDescription = String(body.itemDescription || `Compra: ${planName}`).trim()

    const pref = new Preference(mpClient)
    const publicBase = (process.env.PUBLIC_BASE_URL || '').toString().replace(/\/$/, '')
    const notificationUrl = publicBase ? `${publicBase}/api/mp/webhook` : undefined
	    console.info('[checkout] creating preference', {
	      userId,
	      planCode,
	      checkoutRef,
	      amount,
	      currency,
	      hasNotificationUrl: Boolean(notificationUrl),
	      notificationUrl,
	    })
	    const mp = await pref.create({
	      body: {
	        external_reference: checkoutRef,
	        items: [
	          {
	            id: itemId,
	            title: planName,
	            description: itemDescription,
	            ...(itemCategoryId ? { category_id: itemCategoryId } : {}),
	            quantity: 1,
	            unit_price: expectedAmount,
	            currency_id: currency,
	          },
	        ],
	        payer: { email: authUser?.email || undefined },
	        metadata,
	        back_urls: backUrls,
	        ...(notificationUrl ? { notification_url: notificationUrl } : {}),
	        auto_return: 'approved',
	        statement_descriptor: 'CICLO MARKET',
	      },
	    })

    const initPoint = mp?.init_point || mp?.sandbox_init_point || null
    if (!initPoint) return res.status(500).json({ ok: false, error: 'mp_init_point_missing' })

    // Log + persist checkout intent for observability
    try {
      console.info('[checkout:init]', { userId, planCode, amount, currency, preferenceId: mp?.id || null, listingId: metadata.listingId || null })
    } catch {}
	    try {
	      await recordPaymentIntent({ userId, listingId: metadata.listingId || null, amount, currency, status: 'pending', providerRef: checkoutRef })
	    } catch (e) {
	      console.warn('[checkout] recordPayment pending failed', (e && e.message) || e)
	    }

    return res.json({ ok: true, url: initPoint, preference_id: mp?.id || null })
  } catch (err) {
    const msg = (err && (err.message || err.toString())) || 'unknown_error'
    console.error('[checkout] failed', err)
    return res.status(500).json({ ok: false, error: 'checkout_failed', message: msg })
  }
})

/* ----------------------------- Utils OG ----------------------------------- */
function isBot(req) {
  const ua = String(req.headers['user-agent'] || '').toLowerCase()
  return /facebookexternalhit|whatsapp|twitterbot|slackbot|linkedinbot|discordbot|telegrambot|vkshare|pinterest|bot|crawler|spider/.test(
    ua
  )
}

function escapeHtml(s) {
  return String(s || '')
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
}

const PHONE_REGEX = /\d+/g
function normalizeWhatsappForStorage(raw) {
  if (!raw) return null
  const digits = String(raw).match(PHONE_REGEX)
  if (!digits) return null
  let normalized = digits.join('')
  normalized = normalized.replace(/^00+/, '')
  normalized = normalized.replace(/^0+/, '')
  if (!normalized) return null
  if (!normalized.startsWith('54')) normalized = `54${normalized}`
  return normalized
}

function ensureWhatsappInContactMethods(methods) {
  const base = Array.isArray(methods) ? methods.filter(Boolean).map((m) => String(m)) : ['email', 'chat']
  const set = new Set(base)
  if (!set.has('email')) set.add('email')
  if (!set.has('chat')) set.add('chat')
  set.add('whatsapp')
  return Array.from(set)
}

function extractAdminKey(req) {
  const header =
    req.headers['x-admin-key'] ||
    req.headers['x-cron-secret'] ||
    req.headers['authorization']
  if (!header) return null
  const value = String(header).trim()
  if (!value) return null
  if (/^bearer\s+/i.test(value)) {
    return value.replace(/^bearer\s+/i, '').trim()
  }
  return value
}

function resolveAdminSecrets() {
  const secret = process.env.CRON_SECRET
  return secret ? [String(secret).trim()] : []
}

function ensureAdminAuthorized(req, res) {
  const provided = extractAdminKey(req)
  const allowed = resolveAdminSecrets()
  if (!allowed.length) {
    console.warn('[sweepstakes] admin secret not configured')
  }
  if (!allowed.length || !provided) {
    res.status(401).json({ ok: false, error: 'unauthorized' })
    return false
  }
  const authorized = allowed.some((key) => key === provided)
  if (!authorized) {
    res.status(401).json({ ok: false, error: 'unauthorized' })
    return false
  }
  return true
}

function csvEscapeValue(value) {

return { subject, html, text: textParts.join('\n') }
}


/* ----------------------------- Saved searches ----------------------------- */
function sanitizeSavedSearchCriteria(value) {
  if (!value || typeof value !== 'object') return {}
  const output = {}
  for (const [key, rawVal] of Object.entries(value)) {
    if (rawVal === null || rawVal === undefined) continue
    if (typeof rawVal === 'string') {
      const trimmed = rawVal.trim()
      if (!trimmed) continue
      if (key === 'cat' && trimmed.toLowerCase() === 'todos') continue
      if (key === 'deal' && trimmed !== '1') continue
      if (key === 'store' && trimmed !== '1') continue
      output[key] = trimmed
      continue
    }
    if (Array.isArray(rawVal)) {
      const arr = rawVal
        .map((item) => (typeof item === 'string' ? item.trim() : item))
        .filter((item) => {
          if (typeof item === 'string') return Boolean(item)
          return item !== null && item !== undefined
        })
      if (arr.length) output[key] = Array.from(new Set(arr))
      continue
    }
    output[key] = rawVal
  }
  return output
}

app.get('/api/saved-searches', async (req, res) => {
  try {
    const supabase = supabaseService || getServerSupabaseClient()
    if (!supabase) return res.status(503).json({ error: 'service_unavailable' })
    const user = await getAuthUser(req, supabase)
    if (!user) return res.status(401).json({ error: 'unauthorized' })
    const { data, error } = await supabase
      .from('saved_searches')
      .select('id,user_id,name,criteria,is_active,created_at')
      .eq('user_id', user.id)
      .order('created_at', { ascending: false })
    if (error) return res.status(500).json({ error: 'query_failed' })
    return res.json(Array.isArray(data) ? data : [])
  } catch (err) {
    console.error('[saved-searches:list] failed', err)
    return res.status(500).json({ error: 'unexpected_error' })
  }
})

app.post('/api/saved-searches', async (req, res) => {
  try {
    const supabase = supabaseService || getServerSupabaseClient()
    if (!supabase) return res.status(503).json({ error: 'service_unavailable' })
    const user = await getAuthUser(req, supabase)
    if (!user) return res.status(401).json({ error: 'unauthorized' })

    const rawCriteria = req.body?.criteria
    if (!rawCriteria || typeof rawCriteria !== 'object') {
      return res.status(400).json({ error: 'invalid_criteria' })
    }

    const criteria = sanitizeSavedSearchCriteria(rawCriteria)
    if (!Object.keys(criteria).length) {
      return res.status(400).json({ error: 'empty_criteria' })
    }

    const name = (req.body?.name ? String(req.body.name) : '').trim().slice(0, 255) || null
    const isActive = typeof req.body?.is_active === 'boolean' ? req.body.is_active : true

    const { data, error } = await supabase
      .from('saved_searches')
      .insert({
        user_id: user.id,
        name,
        criteria,
        is_active: isActive,
      })
      .select('id,user_id,name,criteria,is_active,created_at')
      .maybeSingle()

    if (error || !data) return res.status(500).json({ error: 'insert_failed' })
    return res.status(201).json(data)
  } catch (err) {
    console.error('[saved-searches:create] failed', err)
    return res.status(500).json({ error: 'unexpected_error' })
  }
})

app.patch('/api/saved-searches/:id', async (req, res) => {
  try {
    const supabase = supabaseService || getServerSupabaseClient()
    if (!supabase) return res.status(503).json({ error: 'service_unavailable' })
    const user = await getAuthUser(req, supabase)
    if (!user) return res.status(401).json({ error: 'unauthorized' })
    const id = Number(req.params.id)
    if (!Number.isInteger(id) || id <= 0) return res.status(400).json({ error: 'invalid_id' })

    const { data: row, error: fetchErr } = await supabase
      .from('saved_searches')
      .select('id,user_id,name,criteria,is_active,created_at')
      .eq('id', id)
      .maybeSingle()
    if (fetchErr) return res.status(500).json({ error: 'lookup_failed' })
    if (!row) return res.status(404).json({ error: 'not_found' })
    if (row.user_id !== user.id) return res.status(403).json({ error: 'forbidden' })

    const updates = {}
    if (typeof req.body?.name === 'string') {
      const trimmed = req.body.name.trim().slice(0, 255)
      updates.name = trimmed || null
    }
    if (typeof req.body?.is_active === 'boolean') {
      updates.is_active = req.body.is_active
    }

    if (!Object.keys(updates).length) {
      return res.status(400).json({ error: 'nothing_to_update' })
    }

    const { data: updated, error: updErr } = await supabase
      .from('saved_searches')
      .update(updates)
      .eq('id', id)
      .select('id,user_id,name,criteria,is_active,created_at')
      .maybeSingle()
    if (updErr || !updated) return res.status(500).json({ error: 'update_failed' })

    return res.json(updated)
  } catch (err) {
    console.error('[saved-searches:update] failed', err)
    return res.status(500).json({ error: 'unexpected_error' })
  }
})

app.delete('/api/saved-searches/:id', async (req, res) => {
  try {
    const supabase = supabaseService || getServerSupabaseClient()
    if (!supabase) return res.status(503).json({ error: 'service_unavailable' })
    const user = await getAuthUser(req, supabase)
    if (!user) return res.status(401).json({ error: 'unauthorized' })
    const id = Number(req.params.id)
    if (!Number.isInteger(id) || id <= 0) return res.status(400).json({ error: 'invalid_id' })

    const { data: row, error: fetchErr } = await supabase
      .from('saved_searches')
      .select('id,user_id')
      .eq('id', id)
      .maybeSingle()
    if (fetchErr) return res.status(500).json({ error: 'lookup_failed' })
    if (!row) return res.status(404).json({ error: 'not_found' })
    if (row.user_id !== user.id) return res.status(403).json({ error: 'forbidden' })

    const { error } = await supabase
      .from('saved_searches')
      .delete()
      .eq('id', id)
    if (error) return res.status(500).json({ error: 'delete_failed' })
    return res.json({ ok: true })
  } catch (err) {
    console.error('[saved-searches:delete] failed', err)
    return res.status(500).json({ error: 'unexpected_error' })
  }
})

/* ----------------------------- Marketplace search ------------------------ */
async function fetchStoreFlags(supabase, sellerIds) {
  const unique = Array.from(new Set((sellerIds || []).filter(Boolean)))
  if (!unique.length) return new Map()
  try {
    const { data } = await supabase
      .from('users')
      .select('id, store_enabled')
      .in('id', unique)
    const map = new Map()
    for (const row of data || []) {
      if (!row?.id) continue
      map.set(String(row.id), Boolean(row.store_enabled))
    }
    return map
  } catch {
    return new Map()
  }
}

app.get('/api/market/search', async (req, res) => {
  try {
    const supabase = getServerSupabaseClient()
    // Detectar si es moderador para ampliar el alcance
    let isModeratorUser = false
    try {
      const user = await getAuthUser(req, supabase)
      if (user) {
        // helper definido más abajo
        isModeratorUser = await userIsModerator(user.id, supabase)
      }
    } catch { /* noop */ }
    const limit = Math.max(1, Math.min(300, Number(req.query.limit) || 48))
    const offset = Math.max(0, Number(req.query.offset) || 0)
    const sort = String(req.query.sort || 'relevance')

    const rawCriteria = {
      cat: req.query.cat,
      subcat: req.query.subcat,
      brand: req.query.brand,
      material: req.query.material,
      frameSize: req.query.frameSize,
      wheelSize: req.query.wheelSize,
      drivetrain: req.query.drivetrain,
      condition: req.query.condition,
      brake: req.query.brake,
      year: req.query.year,
      size: req.query.size,
      location: req.query.location,
      transmissionType: req.query.transmissionType,
      q: req.query.q,
      deal: req.query.deal,
      store: req.query.store,
      priceCur: req.query.price_cur,
      priceMin: req.query.price_min ? Number(req.query.price_min) : undefined,
      priceMax: req.query.price_max ? Number(req.query.price_max) : undefined,
    }
    const criteria = sanitizeSavedSearchCriteria(rawCriteria)

    let query = supabase
      .from('listings')
      .select('id,slug,title,brand,model,year,category,subcategory,price,price_currency,original_price,location,description,material,frame_size,wheel_size,drivetrain,drivetrain_detail,wheelset,extras,seller_id,seller_name,seller_plan,seller_plan_expires,seller_location,seller_whatsapp,seller_email,seller_avatar,plan,highlight_expires,rank_boost_until,granted_visible_photos,whatsapp_cap_granted,whatsapp_enabled,whatsapp_user_disabled,contact_methods,expires_at,renewal_notified_at,status,created_at,images')
      .order('created_at', { ascending: false })
      .limit(500)

    if (!isModeratorUser) {
      query = query
        .in('status', ['active', 'published'])
        .eq('moderation_state', 'approved')
    }

    const cat = typeof criteria.cat === 'string' ? criteria.cat.trim() : ''
    if (cat && cat !== 'Todos') query = query.eq('category', cat)
    const subcat = typeof criteria.subcat === 'string' ? criteria.subcat.trim() : ''
    if (subcat) query = query.eq('subcategory', subcat)

    const { data: rows, error } = await query
    if (error) return res.status(500).json({ error: 'query_failed' })
    const items = Array.isArray(rows) ? rows : []

    const sellerIds = items.map((r) => r?.seller_id).filter(Boolean)
    const storeMap = await fetchStoreFlags(supabase, sellerIds)
    const filtered = []
    const now = Date.now()
    for (const listing of items) {
      const sellerId = listing?.seller_id ? String(listing.seller_id) : null
      const storeEnabled = sellerId ? Boolean(storeMap.get(sellerId)) : false
      // Ocultar vencidas solo para usuarios comunes
      if (!isModeratorUser) {
        try {
          const exp = listing?.expires_at ? Date.parse(listing.expires_at) : null
          if (typeof exp === 'number' && !Number.isNaN(exp) && exp > 0 && exp < now) continue
        } catch { /* noop */ }
      }
      const context = buildListingMatchContext(listing, { storeEnabled })
      // Aplicar coincidencia general SIN obligar currency; el rango de precio se filtra abajo con conversión
      const { priceCur: _pc, priceMin: _pmin, priceMax: _pmax, ...criteriaNoPrice } = criteria
      if (!matchesSavedSearchCriteria(criteriaNoPrice, context)) continue
      if (criteria.store === '1' && !storeEnabled) continue
      // Filtrado por precio con conversión a la moneda seleccionada (si corresponde)
      const fx = Number(req.query.fx) || 0
      const priceCur = typeof criteria.priceCur === 'string' ? criteria.priceCur.toUpperCase() : null
      const cur = String(listing.price_currency || 'ARS').toUpperCase()
      let priceSel = Number(listing.price) || 0
      if (priceCur && priceCur !== cur) {
        if (priceCur === 'USD' && cur === 'ARS' && fx > 0) priceSel = priceSel / fx
        else if (priceCur === 'ARS' && cur === 'USD' && fx > 0) priceSel = priceSel * fx
      }
      if (typeof criteria.priceMin === 'number' && Number.isFinite(criteria.priceMin)) {
        if (priceSel < Number(criteria.priceMin)) continue
      }
      if (typeof criteria.priceMax === 'number' && Number.isFinite(criteria.priceMax)) {
        if (priceSel > Number(criteria.priceMax)) continue
      }
      // Public derivations for UI (4/8/12 + WA badge)
      const rbu = listing?.rank_boost_until ? new Date(listing.rank_boost_until).getTime() : 0
      const premiumActive = rbu > now
      const granted = Number(listing?.granted_visible_photos || 4)
      const planTier = premiumActive ? (granted >= 12 ? 'PRO' : (granted >= 8 ? 'PREMIUM' : 'FREE')) : 'FREE'
      const publicPhotosLimit = planTier === 'PRO' ? 12 : (planTier === 'PREMIUM' ? 8 : 4)
      const images = Array.isArray(listing?.images) ? listing.images : []
      const publicPhotosVisible = Math.min(images.length, publicPhotosLimit)
      const waPublic = premiumActive && granted >= 8 && !!listing?.whatsapp_enabled && !listing?.whatsapp_user_disabled
      filtered.push({ ...listing, __store_enabled: storeEnabled, premium_active: premiumActive, plan_tier: planTier, public_photos_limit: publicPhotosLimit, public_photos_visible: publicPhotosVisible, wa_public: waPublic })
    }

    const fx = Number(req.query.fx) || 0
    const priceCur = typeof criteria.priceCur === 'string' ? criteria.priceCur.toUpperCase() : null
    const priceInSelected = (row) => {
      const cur = String(row.price_currency || 'ARS').toUpperCase()
      const price = Number(row.price) || 0
      if (!priceCur || priceCur === cur) return price
      if (!fx || !Number.isFinite(fx)) return price
      return priceCur === 'USD' ? (cur === 'ARS' ? price / fx : price) : (cur === 'USD' ? price * fx : price)
    }

    let ordered = filtered
    if (sort === 'newest') {
      ordered = [...filtered].sort((a, b) => new Date(b.created_at || 0).getTime() - new Date(a.created_at || 0).getTime())
    } else if (sort === 'asc' || sort === 'desc') {
      ordered = [...filtered].sort((a, b) => {
        const pa = priceInSelected(a)
        const pb = priceInSelected(b)
        return sort === 'asc' ? pa - pb : pb - pa
      })
    } else {
      // relevance: freshness + engagement + premium boost + highlight + store
      ordered = [...filtered].sort((a, b) => {
        const nowTs = Date.now()
        const fresh = (row) => {
          const ageDays = Math.max(0, (nowTs - new Date(row.created_at || 0).getTime()) / (24*60*60*1000))
          return 1 / (1 + ageDays / 14)
        }
        const engage = (row) => (Number(row.original_price) > Number(row.price)) ? 0.1 : 0
        const premium = (row) => {
          const rbu = row.rank_boost_until || row.featured_until || null
          const active = rbu ? new Date(rbu).getTime() > nowTs : false
          if (!active) return 0
          const cap = Number(row.granted_visible_photos) || 4
          return cap >= 12 ? 1.1 : 0.8 // PRO > PREMIUM
        }
        const highlight = (row) => (row.highlight_expires && new Date(row.highlight_expires).getTime() > nowTs) ? 0.15 : 0
        const store = (row) => Boolean(row.__store_enabled) ? 0.05 : 0
        const score = (row) => fresh(row) + engage(row) + premium(row) + highlight(row) + store(row)
        const delta = score(b) - score(a)
        if (delta !== 0) return delta
        return new Date(b.created_at || 0).getTime() - new Date(a.created_at || 0).getTime()
      })
    }

    const total = ordered.length
    const sliced = ordered.slice(offset, offset + limit)
    return res.json({ items: sliced, total })
  } catch (err) {
    console.error('[market/search] failed', err)
    return res.status(500).json({ error: 'unexpected_error' })
  }
})

/* ----------------------------- Credits endpoints ------------------------- */
app.get('/api/credits/me', async (req, res) => {
  return res.json([])
})

app.get('/api/credits/history', async (req, res) => {
  return res.json([])
})

// Canjear un crédito disponible (no cambia estado; devuelve uno para usar)
app.post('/api/credits/redeem', async (req, res) => {
  return res.status(410).json({ ok: false, error: 'credits_disabled' })
})

// Asociar un crédito a un listing y marcarlo como usado
app.post('/api/credits/attach', async (req, res) => {
  return res.status(410).json({ ok: false, error: 'credits_disabled' })
})

/* ----------------------------- Gifts endpoints --------------------------- */
function normalizePlanCode(value) {
  const v = String(value || '').toLowerCase().trim()
  if (v === 'premium') return 'premium'
  if (v === 'basic') return 'basic'
  if (v === 'pro') return 'pro'
  return null
}

// British spelling alias used elsewhere in this file
function normalisePlanCode(value) {
  return normalizePlanCode(value)
}

function isGiftValidRow(row) {
  if (!row) return false
  const uses = Number(row.uses_left || 0)
  if (!Number.isFinite(uses) || uses <= 0) return false
  if (row.expires_at) {
    const exp = new Date(row.expires_at).getTime()
    if (Number.isFinite(exp) && exp > 0 && exp < Date.now()) return false
  }
  return true
}

// Crear código de regalo (requiere sesión o clave admin)
app.post('/api/gifts/create', async (req, res) => {
  try {
    const supabase = getServerSupabaseClient()
    // Requerir sesión válida para crear regalos
    const user = await getAuthUser(req, supabase)
    if (!user) return res.status(401).json({ ok: false, error: 'unauthorized' })

    const plan = normalizePlanCode(req.body?.plan)
    const uses = Number(req.body?.uses || 1)
    const expiresAt = req.body?.expiresAt ? new Date(req.body.expiresAt).toISOString() : null
    if (!plan || !Number.isFinite(uses) || uses <= 0) return res.status(400).json({ ok: false, error: 'invalid_params' })

    function genCode() {
      const alphabet = 'ABCDEFGHJKLMNPQRSTUVWXYZ23456789'
      let out = ''
      for (let i = 0; i < 10; i += 1) out += alphabet[Math.floor(Math.random() * alphabet.length)]
      return out
    }

    let code = null
    for (let i = 0; i < 5; i += 1) {
      const candidate = genCode()
      const { data, error } = await supabase
        .from('gift_codes')
        .insert({ code: candidate, plan, uses_left: uses, expires_at: expiresAt })
        .select('code')
        .maybeSingle()
      if (!error && data?.code) { code = data.code; break }
    }
    if (!code) return res.status(500).json({ ok: false, error: 'create_failed' })
    return res.json({ ok: true, code })
  } catch (err) {
    console.error('[gifts/create] failed', err)
    return res.status(500).json({ ok: false, error: 'unexpected_error' })
  }
})

// Validar código de regalo
app.get('/api/gifts/validate', async (req, res) => {
  try {
    const supabase = getServerSupabaseClient()
    const code = String(req.query.code || '').trim().toUpperCase()
    if (!code) return res.status(400).json({ ok: false, error: 'invalid_code' })
    const { data, error } = await supabase
      .from('gift_codes')
      .select('code,plan,uses_left,expires_at')
      .eq('code', code)
      .maybeSingle()
    if (error || !data) return res.json({ ok: false, error: 'not_found' })
    if (!isGiftValidRow(data)) return res.json({ ok: false, error: 'expired_or_used' })
    return res.json({ ok: true, plan: normalizePlanCode(data.plan) })
  } catch (err) {
    console.error('[gifts/validate] failed', err)
    return res.status(500).json({ ok: false, error: 'unexpected_error' })
  }
})

// Reclamar código: crea un crédito disponible para el usuario (idempotente por provider_ref)
app.post('/api/gifts/claim', async (req, res) => {
  try {
    const supabase = getServerSupabaseClient()
    const userId = String(req.body?.userId || '').trim()
    const code = String(req.body?.code || '').trim().toUpperCase()
    if (!userId || !code) return res.status(400).json({ ok: false, error: 'invalid_params' })

    // Idempotencia: si ya existe un crédito de este gift para el usuario, devolverlo
    const { data: existing } = await supabase
      .from('publish_credits')
      .select('id,plan_code,status')
      .eq('user_id', userId)
      .eq('provider', 'gift')
      .eq('provider_ref', code)
      .limit(1)
    if (Array.isArray(existing) && existing[0]) {
      return res.json({ ok: true, creditId: existing[0].id, planCode: existing[0].plan_code })
    }

    // Verificar gift válido y descontar uso de forma atómica
    // Leer fila actual y luego intentar decremento optimista
    // No atomic decrement supported here; do it with a second guarded update
    const { data: row } = await supabase
      .from('gift_codes')
      .select('code,plan,uses_left,expires_at')
      .eq('code', code)
      .maybeSingle()
    if (!isGiftValidRow(row)) return res.status(409).json({ ok: false, error: 'not_available' })

    const { data: decOne, error: upd } = await supabase
      .from('gift_codes')
      .update({ uses_left: (row.uses_left || 1) - 1 })
      .eq('code', code)
      .eq('uses_left', row.uses_left)
      .select('code,plan,uses_left')
      .maybeSingle()
    if (upd || !decOne) return res.status(409).json({ ok: false, error: 'conflict' })

    const planCode = normalizePlanCode(row.plan)
    if (!planCode) return res.status(400).json({ ok: false, error: 'invalid_plan' })

    const expiresAt = new Date(Date.now() + 30 * 24 * 60 * 60 * 1000).toISOString()
    const { data: credit, error: insErr } = await supabase
      .from('publish_credits')
      .insert({ user_id: userId, plan_code: planCode, status: 'available', provider: 'gift', provider_ref: code, expires_at: expiresAt })
      .select('id,plan_code')
      .maybeSingle()
    if (insErr || !credit) return res.status(500).json({ ok: false, error: 'credit_failed' })
    return res.json({ ok: true, creditId: credit.id, planCode: credit.plan_code })
  } catch (err) {
    console.error('[gifts/claim] failed', err)
    return res.status(500).json({ ok: false, error: 'unexpected_error' })
  }
})

// Redimir (consumir) un gift directamente sin crédito (fallback)
app.post('/api/gifts/redeem', async (req, res) => {
  try {
    const supabase = getServerSupabaseClient()
    const code = String(req.body?.code || '').trim().toUpperCase()
    if (!code) return res.status(400).json({ ok: false, error: 'invalid_code' })
    const { data: row } = await supabase
      .from('gift_codes')
      .select('code,uses_left,expires_at')
      .eq('code', code)
      .maybeSingle()
    if (!isGiftValidRow(row)) return res.status(409).json({ ok: false, error: 'not_available' })
    const { data: decOne, error: upd } = await supabase
      .from('gift_codes')
      .update({ uses_left: (row.uses_left || 1) - 1 })
      .eq('code', code)
      .eq('uses_left', row.uses_left)
      .select('code,uses_left')
      .maybeSingle()
    if (upd || !decOne) return res.status(409).json({ ok: false, error: 'conflict' })
    return res.json({ ok: true })
  } catch (err) {
    console.error('[gifts/redeem] failed', err)
    return res.status(500).json({ ok: false, error: 'unexpected_error' })
  }
})


async function runSavedSearchAlert(listingId) {
  if (!listingId) return
  const supabase = supabaseService || getServerSupabaseClient()
  if (!supabase) {
    console.warn('[saved-search-alert] supabase service not configured')
    return
  }

  try {
    console.info('[saved-search-alert] start', { listingId })
    const { data: listing, error: listingErr } = await supabase
      .from('listings')
      .select('id,slug,title,brand,model,year,category,subcategory,price,price_currency,original_price,location,description,material,frame_size,wheel_size,drivetrain,drivetrain_detail,extras,seller_id,images')
      .eq('id', listingId)
      .maybeSingle()

    if (listingErr) {
      console.error('[saved-search-alert] listing fetch failed', listingErr)
      return
    }
    if (!listing) {
      console.warn('[saved-search-alert] listing not found', { listingId })
      return
    }

    const sellerId = listing.seller_id ? String(listing.seller_id) : null
    let sellerStoreEnabled = false
    if (sellerId) {
      try {
        const { data: sellerProfile } = await supabase
          .from('users')
          .select('id,store_enabled')
          .eq('id', sellerId)
          .maybeSingle()
        sellerStoreEnabled = Boolean(sellerProfile?.store_enabled)
      } catch (err) {
        console.warn('[saved-search-alert] seller store lookup failed', err)
      }
    }

    const context = buildListingMatchContext(listing, { storeEnabled: sellerStoreEnabled })

    const categoryFilter = {}
    if (context.category) categoryFilter.cat = context.category
    if (context.subcategory) categoryFilter.subcat = context.subcategory

    let query = supabase
      .from('saved_searches')
      .select('id,user_id,name,criteria,is_active,created_at')
      .eq('is_active', true)

    if (Object.keys(categoryFilter).length) {
      query = query.contains('criteria', categoryFilter)
    }

    const { data: searches, error: searchesErr } = await query
    if (searchesErr) {
      console.error('[saved-search-alert] saved searches query failed', searchesErr)
      return
    }

    const matchedAlerts = (searches || []).filter((row) => {
      if (!row?.criteria || typeof row.criteria !== 'object') return false
      if (row.user_id && sellerId && row.user_id === sellerId) return false
      return matchesSavedSearchCriteria(row.criteria, context)
    })

    if (!matchedAlerts.length) {
      console.info('[saved-search-alert] no matches', { listingId })
      return
    }

    const userIds = Array.from(new Set(matchedAlerts.map((row) => row.user_id).filter(Boolean)))
    if (!userIds.length) return

    const { data: usersRows, error: usersErr } = await supabase
      .from('users')
      .select('id,email,full_name')
      .in('id', userIds)

    if (usersErr) {
      console.error('[saved-search-alert] users fetch failed', usersErr)
      return
    }

    const usersMap = new Map()
    for (const row of usersRows || []) {
      if (row?.id) usersMap.set(row.id, row)
    }

    if (!isMailConfigured()) {
      console.warn('[saved-search-alert] email disabled, skip notifications')
      return
    }

    const frontendBase = resolveFrontendBaseUrl()
    const listingPath = listing.slug ? `/listing/${listing.slug}` : `/listing/${listing.id}`
    const listingUrl = `${frontendBase}${listingPath}`
    const from = process.env.SMTP_FROM || `Ciclo Market <${process.env.SMTP_USER || 'no-reply@ciclomarket.ar'}>`
    const sentKeys = new Set()

    for (const alert of matchedAlerts) {
      const profile = usersMap.get(alert.user_id)
      if (!profile?.email) continue
      const dedupeKey = `${profile.email}:${listing.id}`
      if (sentKeys.has(dedupeKey)) continue

      const searchUrl = alert?.criteria?.url
        ? `${frontendBase}${String(alert.criteria.url).startsWith('/') ? '' : '/'}${String(alert.criteria.url).replace(/^\//, '')}`
        : null
      const { subject, html, text } = buildSavedSearchEmail({
        listing,
        listingUrl,
        searchUrl,
        alertName: alert?.name || null,
        context,
      })

      try {
        await sendMail({ from, to: profile.email, subject, html, text })
        sentKeys.add(dedupeKey)
        console.info('[saved-search-alert] email sent', { listingId, alertId: alert.id, to: profile.email })
      } catch (err) {
        console.error('[saved-search-alert] send failed', err)
      }
    }
    console.info('[saved-search-alert] completed', { listingId, sent: sentKeys.size })
  } catch (err) {
    console.error('[saved-search-alert] unexpected error', err)
  }
}

// Permit calling the alert runner from other modules/tests
module.exports.runSavedSearchAlert = runSavedSearchAlert
module.exports.runSavedSearchDigestOnce = runSavedSearchDigestOnce

/* ----------------------------- Payment confirm (manual) ------------------- */
// Admin-triggered endpoint to confirm a payment by id (fallback if webhooks fail)
// Requires x-cron-secret header to prevent abuse
app.post('/api/payments/confirm', async (req, res) => {
  try {
    const secret = String(req.headers['x-cron-secret'] || '')
    if (!secret || secret !== String(process.env.CRON_SECRET || '')) {
      return res.status(401).json({ ok: false, error: 'unauthorized' })
    }
    const paymentId = String(req.body?.payment_id || req.query?.payment_id || '').trim()
    if (!paymentId) return res.status(400).json({ ok: false, error: 'missing_payment_id' })
    const result = await processPayment(paymentId)
    if (!result.ok) return res.status(500).json(result)
    return res.json(result)
  } catch (err) {
    console.error('[payments/confirm] failed', err)
    return res.status(500).json({ ok: false, error: 'unexpected_error' })
  }
})

// MP sends either GET with query ?id=...&topic=payment or POST with JSON
app.all('/api/mp/webhook', (req, res) => {
  const q = req.query || {}
  const b = (req.body && typeof req.body === 'object') ? req.body : {}

  const topic = String(q.topic || q.type || b.topic || b.type || '').toLowerCase()
  const id = String(b?.data?.id || b?.id || q?.id || q?.['data.id'] || '').trim()

  console.info('[webhook] received', { topic, id })

  // Respond immediately to avoid MP retries/timeouts.
  res.status(200).json({ ok: true })

  ;(async () => {
    try {
      if (!id) return

      if (topic === 'merchant_order') {
        const token = String(process.env.MERCADOPAGO_ACCESS_TOKEN || '').trim()
        if (!token) return

        const moRes = await fetch(`https://api.mercadolibre.com/merchant_orders/${encodeURIComponent(id)}`, {
          headers: { Authorization: `Bearer ${token}` },
        })
        if (!moRes.ok) {
          const txt = await moRes.text().catch(() => '')
          console.warn('[webhook] merchant_order fetch failed', { id, status: moRes.status, body: txt })
          return
        }
        const mo = await moRes.json().catch(() => null)
        const payments = Array.isArray(mo?.payments) ? mo.payments : []
        const approved = payments.find((p) => String(p?.status || '').toLowerCase() === 'approved')
        const paymentId = approved?.id || payments[0]?.id || null
        if (!paymentId) {
          console.info('[webhook] merchant_order without payments yet', { id })
          return
        }
        const result = await processPayment(String(paymentId))
        if (!result.ok) console.warn('[webhook] processPayment failed', { paymentId, result })
        return
      }

      // Default: payment notification
      const result = await processPayment(id)
      if (!result.ok) console.warn('[webhook] processPayment failed', { paymentId: id, result })
    } catch (err) {
      console.error('[webhook] background handling failed', err)
    }
  })()
})

/* ----------------------------- SPA fallback ------------------------------ */
app.get('*', (req, res, next) => {
  if (req.method !== 'GET') return next()
  const route = req.path || ''
  if (route.startsWith('/api') || route.startsWith('/sitemap') || route.startsWith('/share')) {
    return next()
  }
  // Static middleware will have served assets; remaining GETs render SPA shell
  return res.sendFile(path.join(distDir, 'index.html'), (err) => {
    if (err) next(err)
  })
})

/* ------------------------------- Start ------------------------------------- */
const PORT = process.env.PORT || 4000
app.listen(PORT, '0.0.0.0', () => {
  console.log(`API on :${PORT}`)
  if (process.env.RENEWAL_NOTIFIER_ENABLED === 'true') {
    try {
      const { startRenewalNotificationJob } = require('./jobs/renewalNotifier')
      startRenewalNotificationJob()
    } catch (err) {
      console.warn('[renewalNotifier] not started:', err?.message || err)
    }
  } else {
    console.info('[renewalNotifier] disabled (RENEWAL_NOTIFIER_ENABLED != "true")')
  }
  if (process.env.NEWSLETTER_DIGEST_ENABLED === 'true') {
    try {
      startNewsletterDigestJob()
    } catch (err) {
      console.warn('[newsletterDigest] not started:', err?.message || err)
    }
  } else {
    console.info('[newsletterDigest] disabled (NEWSLETTER_DIGEST_ENABLED != "true")')
  }
  if (process.env.REVIEW_REMINDER_ENABLED === 'true') {
    try {
      const { startReviewReminderJob } = require('./jobs/reviewReminder')
      startReviewReminderJob()
    } catch (err) {
      console.warn('[reviewReminder] not started:', err?.message || err)
    }
  } else {
    console.info('[reviewReminder] disabled (REVIEW_REMINDER_ENABLED != "true")')
  }
  // One-off reactivation of expired listings (+90 days) and optional scheduling
  if (process.env.EXTEND_EXPIRED_ENABLED === 'true') {
    try {
      const { runOnce } = require('./jobs/extendExpired90d')
      runOnce().catch((e) => console.warn('[extendExpired90d] runOnce error', e?.message || e))
    } catch (err) {
      console.warn('[extendExpired90d] not started:', err?.message || err)
    }
  } else {
    console.info('[extendExpired90d] disabled (EXTEND_EXPIRED_ENABLED != "true")')
  }
  if (process.env.EXTEND_EXPIRED_CRON) {
    try {
      const cron = require('node-cron')
      const { runOnce } = require('./jobs/extendExpired90d')
      const schedule = String(process.env.EXTEND_EXPIRED_CRON)
      console.info('[extendExpired90d] scheduling via cron', schedule)
      cron.schedule(schedule, () => {
        runOnce().catch((e) => console.warn('[extendExpired90d] cron error', e?.message || e))
      })
    } catch (err) {
      console.warn('[extendExpired90d] cron not started:', err?.message || err)
    }
  }
})
/* ----------------------------- Auth helper -------------------------------- */
async function getAuthUser(req, supabase) {
  const authHeader = String(req.headers.authorization || '')
  const token = authHeader.startsWith('Bearer ') ? authHeader.slice(7).trim() : null
  if (!token) return null
  try {
    const { data, error } = await supabase.auth.getUser(token)
    if (error || !data?.user) return null
    return data.user
  } catch {
    return null
  }
}

// Helper: consulta role del usuario en tabla user_roles ('moderator' o 'admin')
async function userIsModerator(userId, supabase) {
  try {
    if (!userId) return false
    const { data, error } = await supabase
      .from('user_roles')
      .select('role')
      .eq('user_id', userId)
      .maybeSingle()
    if (error) return false
    const role = String(data?.role || '').toLowerCase()
    return role === 'moderator' || role === 'admin'
  } catch {
    return false
  }
}

/* ----------------------------- Listings ops -------------------------------- */
// Renovar publicación: suma días a expires_at (15 si free, 60 si basic/premium)
app.post('/api/listings/:id/renew', async (req, res) => {
  try {
    const { id } = req.params
    const supabase = getServerSupabaseClient()
    const user = await getAuthUser(req, supabase)
    if (!user) return res.status(401).json({ error: 'unauthorized' })
    const { data: listing, error } = await supabase
      .from('listings')
      .select('*')
      .eq('id', id)
      .single()
    if (error || !listing) return res.status(404).json({ error: 'not_found' })
    if (listing.seller_id !== user.id) return res.status(403).json({ error: 'forbidden' })
    const planRaw = String(listing.plan || listing.seller_plan || '').toLowerCase()
    const days = (planRaw === 'basic' || planRaw === 'premium') ? 60 : 15
    const now = Date.now()
    const current = listing.expires_at ? new Date(listing.expires_at).getTime() : now
    const base = Math.max(current, now)
    const next = new Date(base + days * 24 * 60 * 60 * 1000).toISOString()
    const { error: upd } = await supabase
      .from('listings')
      .update({ expires_at: next })
      .eq('id', id)
    if (upd) return res.status(500).json({ error: 'update_failed' })
    return res.json({ ok: true, expiresAt: next })
  } catch (err) {
    console.error('[renew] failed', err)
    return res.status(500).json({ error: 'unexpected_error' })
  }
})

// Destacar publicación: aplica destaque sin cambiar el plan base
app.post('/api/listings/:id/highlight', async (req, res) => {
  try {
    const { id } = req.params
    const days = Number(req.body?.days || 7)
    if (!Number.isFinite(days) || days <= 0) return res.status(400).json({ error: 'invalid_days' })
    const supabase = getServerSupabaseClient()
    const user = await getAuthUser(req, supabase)
    if (!user) return res.status(401).json({ error: 'unauthorized' })
    const { data: listing, error } = await supabase
      .from('listings')
      .select('id,seller_id,highlight_expires')
      .eq('id', id)
      .single()
    if (error || !listing) return res.status(404).json({ error: 'not_found' })
    if (listing.seller_id !== user.id) return res.status(403).json({ error: 'forbidden' })
    const now = Date.now()
    const base = listing.highlight_expires ? Math.max(new Date(listing.highlight_expires).getTime(), now) : now
    const next = new Date(base + days * 24 * 60 * 60 * 1000).toISOString()
    const { error: upd } = await supabase
      .from('listings')
      .update({ highlight_expires: next })
      .eq('id', id)
    if (upd) return res.status(500).json({ error: 'update_failed' })
    return res.json({ ok: true, sellerPlan: 'featured', sellerPlanExpires: next })
  } catch (err) {
    console.error('[highlight] failed', err)
    return res.status(500).json({ error: 'unexpected_error' })
  }
})

// Cleanup imágenes de un listing (borra archivos del bucket asociados)
app.post('/api/listings/:id/cleanup-images', async (req, res) => {
  try {
    const { id } = req.params
    const supabase = getServerSupabaseClient()
    const user = await getAuthUser(req, supabase)
    if (!user) return res.status(401).json({ error: 'unauthorized' })

    const { data: row, error } = await supabase
      .from('listings')
      .select('id,seller_id,images,status')
      .eq('id', id)
      .maybeSingle()
    if (error || !row) return res.status(404).json({ error: 'not_found' })
    // Permitir sólo al owner o moderador
    const isOwner = String(row.seller_id || '') === String(user.id)
    const isMod = isOwner ? true : await userIsModerator(user.id, supabase)
    if (!isMod) return res.status(403).json({ error: 'forbidden' })

    const STORAGE_BUCKET = process.env.SUPABASE_STORAGE_BUCKET || 'listings'
    const extractKeys = (images) => {
      const keys = new Set()
      if (!Array.isArray(images)) return []
      for (const item of images) {
        const str = typeof item === 'string' ? item : (item?.path || item?.key || item?.url || item?.uri)
        if (!str) continue
        const m = String(str).match(/\/storage\/v1\/object\/public\/([^/]+)\/(.+)$/) || String(str).match(/\/object\/public\/([^/]+)\/(.+)$/)
        if (m && m[2]) keys.add(m[2])
        else keys.add(String(str).replace(/^\/+/, ''))
      }
      return Array.from(keys)
    }

    const keys = extractKeys(row.images || [])
    if (keys.length) {
      try { await supabase.storage.from(STORAGE_BUCKET).remove(keys) } catch (err) {
        console.warn('[cleanup-images] storage remove failed', id, err?.message || err)
      }
    }
    return res.json({ ok: true, removed: keys.length })
  } catch (err) {
    console.error('[cleanup-images] failed', err)
    return res.status(500).json({ error: 'unexpected_error' })
  }
})

// Upgrade or renew a publication to a paid plan (owner with credit or moderator)
app.post('/api/listings/:id/upgrade', async (req, res) => {
  try {
    const { id } = req.params
    const supabase = getServerSupabaseClient()
    const user = await getAuthUser(req, supabase)
    if (!user) return res.status(401).json({ error: 'unauthorized' })

    const { data: listing, error: listingError } = await supabase
      .from('listings')
      .select('id,seller_id,images,plan,plan_code,seller_plan,expires_at,highlight_expires,rank_boost_until,granted_visible_photos,whatsapp_cap_granted,whatsapp_enabled,whatsapp_user_disabled,seller_whatsapp,contact_methods')
      .eq('id', id)
      .maybeSingle()
    if (listingError || !listing) return res.status(404).json({ error: 'not_found' })

    const ownerId = String(listing.seller_id || '')
    const isOwner = listing.seller_id === user.id
    let isModeratorUser = false
    if (!isOwner) {
      isModeratorUser = await userIsModerator(user.id, supabase)
    }
    if (!isOwner && !isModeratorUser) return res.status(403).json({ error: 'forbidden' })

    const planCode = normalisePlanCode(req.body?.planCode || req.body?.plan)
    const requestedTier = String(req.body?.plan_tier || '').trim().toUpperCase() // 'PREMIUM' | 'PRO'
    if (!planCode || (planCode !== 'basic' && planCode !== 'premium' && planCode !== 'pro')) {
      return res.status(400).json({ error: 'invalid_plan' })
    }
    const effectiveTier = requestedTier === 'PRO' || planCode === 'pro' ? 'PRO' : 'PREMIUM'

    // Sistema de créditos deshabilitado
    const useCredit = false
    const creditId = null

    let planRow = null
    if (supabaseService) {
      const { data: row } = await supabaseService
        .from('plans')
        .select('code, listing_duration_days, period_days, featured_days, featured_slots, whatsapp_enabled')
        .eq('code', planCode)
        .maybeSingle()
      planRow = row
    }
    const listingDays = Number(planRow?.listing_duration_days || planRow?.period_days || 60)
    let includedHighlightDays = Number(planRow?.featured_days || planRow?.featured_slots || 0)
    const now = Date.now()
    const nextExpires = new Date(now + listingDays * 24 * 60 * 60 * 1000).toISOString()
    let nextHighlightIso = listing.highlight_expires || null
    if (includedHighlightDays > 0) {
      const baseHighlight = listing.highlight_expires ? Math.max(new Date(listing.highlight_expires).getTime(), now) : now
      nextHighlightIso = new Date(baseHighlight + includedHighlightDays * 24 * 60 * 60 * 1000).toISOString()
    }

    // Premium rank boost: 90 days from now (or extend from current future boost)
    const PREMIUM_BOOST_DAYS = 90
    const baseBoost = listing.rank_boost_until ? Math.max(new Date(listing.rank_boost_until).getTime(), now) : now
    const nextRankBoostIso = new Date(baseBoost + PREMIUM_BOOST_DAYS * 24 * 60 * 60 * 1000).toISOString()

    let sellerWhatsapp = normalizeWhatsappForStorage(listing.seller_whatsapp || '')
    let profileWhatsapp = null
    if (supabaseService) {
      const { data: profile } = await supabaseService
        .from('users')
        .select('whatsapp_number, store_phone')
        .eq('id', ownerId)
        .maybeSingle()
      const fallbackWhatsapp = profile?.whatsapp_number || profile?.store_phone || ''
      profileWhatsapp = normalizeWhatsappForStorage(fallbackWhatsapp)
    }
    if (!sellerWhatsapp) sellerWhatsapp = profileWhatsapp
    if ((planCode === 'basic' || planCode === 'premium' || planCode === 'pro') && !sellerWhatsapp) {
      if (creditId && supabaseService) {
        await supabaseService
          .from('publish_credits')
          .update({ status: 'available', used_at: null })
        .eq('id', creditId)
      }
      return res.status(409).json({ error: 'missing_whatsapp' })
    }

    const contactMethods = Array.isArray(listing.contact_methods)
      ? ensureWhatsappInContactMethods(listing.contact_methods)
      : ensureWhatsappInContactMethods(['email', 'chat'])

    // Determine benefits to grant
    const targetCap = effectiveTier === 'PRO' ? 12 : 8
    const nextGrantedPhotos = Math.max(Number(listing.granted_visible_photos || 4), targetCap)
    const nextWhatsappCap = true
    // Respect explicit off: if user disabled, do not force-enable on upgrade
    const nextWhatsappEnabled = listing.whatsapp_user_disabled ? listing.whatsapp_enabled : true
    const imagesArr = Array.isArray(listing.images) ? listing.images.filter(Boolean) : []
    const nextVisibleImagesCount = Math.min(imagesArr.length, targetCap)

    const { data: updatedListing, error: updateErr } = await supabase
      .from('listings')
      .update({
        plan: planCode,
        plan_code: planCode,
        seller_plan: planCode,
        seller_whatsapp: sellerWhatsapp,
        contact_methods: contactMethods,
        expires_at: nextExpires,
        highlight_expires: nextHighlightIso,
        rank_boost_until: nextRankBoostIso,
        granted_visible_photos: nextGrantedPhotos,
        plan_photo_limit: targetCap,
        visible_images_count: nextVisibleImagesCount,
        whatsapp_cap_granted: nextWhatsappCap,
        whatsapp_enabled: nextWhatsappEnabled,
        status: 'active',
      })
      .eq('id', id)
      .select('*')
      .maybeSingle()

    if (updateErr || !updatedListing) {
      if (creditId && supabaseService) {
        await supabaseService
          .from('publish_credits')
          .update({ status: 'available', used_at: null })
          .eq('id', creditId)
      }
      return res.status(500).json({ error: 'update_failed' })
    }

    if (supabaseService) {
      // Record plan period history (best-effort)
      try {
        const expiresAt = new Date(now + PREMIUM_BOOST_DAYS * 24 * 60 * 60 * 1000).toISOString()
        await supabaseService
          .from('listing_plan_periods')
          .insert({ listing_id: id, plan_code: (effectiveTier || (nextGrantedPhotos >= 12 ? 'PRO' : 'PREMIUM')), started_at: new Date().toISOString(), expires_at: expiresAt, payment_id: null })
      } catch (err) {
        console.warn('[upgrade] listing_plan_periods insert failed (non-fatal)', err?.message || err)
      }
    }

    if (creditId && supabaseService) {
      await supabaseService
        .from('publish_credits')
        .update({ listing_id: id })
        .eq('id', creditId)
    }

    return res.json({ ok: true, listing: updatedListing })
  } catch (err) {
    console.error('[upgrade] failed', err)
    return res.status(500).json({ error: 'unexpected_error' })
  }
})

// Aplicar plan + destaque incluido en un paso atómico
app.post('/api/listings/:id/apply-plan', async (req, res) => {
  try {
    const { id } = req.params
    const supabase = getServerSupabaseClient()
    const user = await getAuthUser(req, supabase)
    if (!user) return res.status(401).json({ error: 'unauthorized' })
    const planCodeRaw = String(req.body?.planCode || '').trim().toLowerCase()
    const planCode = normalisePlanCode(planCodeRaw)
    const listingDays = Number(req.body?.listingDays || 0)
    let includedHighlightDays = Number(req.body?.includedHighlightDays || 0)
    if (!planCode || !listingDays || listingDays <= 0) return res.status(400).json({ error: 'invalid_params' })

    const { data: listing, error } = await supabase
      .from('listings')
      .select('id,seller_id,expires_at,highlight_expires')
      .eq('id', id)
      .single()
    if (error || !listing) return res.status(404).json({ error: 'not_found' })
    if (listing.seller_id !== user.id) return res.status(403).json({ error: 'forbidden' })

    const now = Date.now()
    // Renovar expires_at: para planes pagos extendemos desde el vencimiento actual, para Gratis reiniciamos a partir de hoy
    const currentExpires = listing.expires_at ? new Date(listing.expires_at).getTime() : null
    const baseExpires =
      planCode === 'free' || planCode === 'basic' || planCode === 'premium'
        ? now
        : Math.max(currentExpires ?? now, now)
    const nextExpires = new Date(baseExpires + listingDays * 24 * 60 * 60 * 1000).toISOString()

    // Regla especial: tiendas oficiales (plan 'pro') obtienen al menos 14 días de destaque
    try {
      if (planCode === 'pro' && (!Number.isFinite(includedHighlightDays) || includedHighlightDays < 14)) {
        includedHighlightDays = 14
      }
    } catch {}

    // Sumar destaque incluido sobre highlight_expires (independiente del plan)
    let nextHighlight = listing.highlight_expires ? new Date(listing.highlight_expires).getTime() : now
    if (includedHighlightDays && includedHighlightDays > 0) {
      const baseHighlight = Math.max(nextHighlight, now)
      nextHighlight = baseHighlight + includedHighlightDays * 24 * 60 * 60 * 1000
    }
    const nextHighlightIso = new Date(nextHighlight).toISOString()

    const { data: updated, error: upd } = await supabase
      .from('listings')
      .update({
        plan: planCode,
        plan_code: planCode,
        expires_at: nextExpires,
        highlight_expires: nextHighlightIso,
        rank_boost_until: (planCode === 'premium') ? new Date(Math.max(now, now)).toISOString() : undefined
      })
      .eq('id', id)
      .select('*')
      .maybeSingle()
    if (upd || !updated) return res.status(500).json({ error: 'update_failed' })

    const status = String(updated.status || '').toLowerCase()
    if (status === 'active' || status === 'published') {
      try {
        runSavedSearchAlert(updated.id).catch((err) => {
          console.error('[apply-plan] saved search alert failed', err)
        })
      } catch (err) {
        console.error('[apply-plan] saved search alert threw', err)
      }
    }

    return res.json({ ok: true, plan: planCode, expiresAt: nextExpires, highlightExpires: nextHighlightIso })
  } catch (err) {
    console.error('[apply-plan] failed', err)
    return res.status(500).json({ error: 'unexpected_error' })
  }
})
/* ----------------------------- FX (admin) ---------------------------------- */
// In-memory override (lost on restart). For persistence, store in DB or KV.
let fxOverride = null

app.get('/api/fx', (_req, res) => {
  const envFx = Number(process.env.USD_ARS_FX || process.env.VITE_USD_ARS_FX)
  const fx = Number.isFinite(fxOverride) && fxOverride > 0
    ? fxOverride
    : (Number.isFinite(envFx) && envFx > 0 ? envFx : 1000)
  res.json({ fx, source: fxOverride ? 'override' : (envFx ? 'env' : 'default') })
})

app.post('/api/admin/fx', (req, res) => {
  try {
    const key = req.headers['x-admin-key'] || req.headers['x-cron-secret']
    const allowed = process.env.FX_ADMIN_KEY || process.env.CRON_SECRET
    if (!allowed || !key || String(key) !== String(allowed)) {
      return res.status(401).json({ ok: false, error: 'unauthorized' })
    }
    const { fx } = req.body || {}
    const n = Number(fx)
    if (!Number.isFinite(n) || n <= 0) {
      return res.status(400).json({ ok: false, error: 'invalid_fx' })
    }
    fxOverride = n
    return res.json({ ok: true, fx: fxOverride })
  } catch (e) {
    return res.status(500).json({ ok: false })
  }
})
/* Admin SPA fallback */
app.get('/admin/*', (req, res, next) => {
  return res.sendFile(path.join(adminDistDir, 'index.html'), (err) => {
    if (err) next(err)
  })
})
/* ----------------------------- My Listings quick actions ------------------ */
// Owner: update price
app.patch('/api/my-listings/:id/price', async (req, res) => {
  try {
    const supabase = getServerSupabaseClient()
    const user = await getAuthUser(req, supabase)
    if (!user) return res.status(401).json({ ok: false, error: 'unauthorized' })
    const id = String(req.params.id)
    const nextPrice = Number(req.body?.price)
    if (!Number.isFinite(nextPrice) || nextPrice <= 0) return res.status(400).json({ ok: false, error: 'invalid_price' })
    const { data: listing, error: fetchErr } = await supabase
      .from('listings')
      .select('id,seller_id')
      .eq('id', id)
      .maybeSingle()
    if (fetchErr || !listing) return res.status(404).json({ ok: false, error: 'not_found' })
    if (listing.seller_id !== user.id) return res.status(403).json({ ok: false, error: 'forbidden' })
    const { error: updErr } = await supabase
      .from('listings')
      .update({ price: nextPrice })
      .eq('id', id)
    if (updErr) return res.status(500).json({ ok: false, error: 'update_failed' })
    return res.json({ ok: true })
  } catch (err) {
    return res.status(500).json({ ok: false, error: 'unexpected_error' })
  }
})

// Owner: reorder/replace images (max 12)
app.patch('/api/my-listings/:id/images', async (req, res) => {
  try {
    const supabase = getServerSupabaseClient()
    const user = await getAuthUser(req, supabase)
    if (!user) return res.status(401).json({ ok: false, error: 'unauthorized' })
    const id = String(req.params.id)
    const images = Array.isArray(req.body?.images) ? req.body.images.map(String) : null
    if (!images) return res.status(400).json({ ok: false, error: 'invalid_payload' })
    const next = images.slice(0, 12)
    const { data: listing } = await supabase
      .from('listings')
      .select('id,seller_id')
      .eq('id', id)
      .maybeSingle()
    if (!listing) return res.status(404).json({ ok: false, error: 'not_found' })
    if (listing.seller_id !== user.id) return res.status(403).json({ ok: false, error: 'forbidden' })
    const { error: updErr } = await supabase
      .from('listings')
      .update({ images: next })
      .eq('id', id)
    if (updErr) return res.status(500).json({ ok: false, error: 'update_failed' })
    return res.json({ ok: true })
  } catch (err) {
    return res.status(500).json({ ok: false, error: 'unexpected_error' })
  }
})

// Owner: toggle whatsapp (requires cap granted)
app.patch('/api/my-listings/:id/whatsapp', async (req, res) => {
  try {
    const supabase = getServerSupabaseClient()
    const user = await getAuthUser(req, supabase)
    if (!user) return res.status(401).json({ ok: false, error: 'unauthorized' })
    const id = String(req.params.id)
    const enable = Boolean(req.body?.enabled)
    const { data: listing } = await supabase
      .from('listings')
      .select('id,seller_id,whatsapp_cap_granted')
      .eq('id', id)
      .maybeSingle()
    if (!listing) return res.status(404).json({ ok: false, error: 'not_found' })
    if (listing.seller_id !== user.id) return res.status(403).json({ ok: false, error: 'forbidden' })
    if (!listing.whatsapp_cap_granted) return res.status(409).json({ ok: false, error: 'cap_not_granted' })
    const { error: updErr } = await supabase
      .from('listings')
      .update({ whatsapp_enabled: enable, whatsapp_user_disabled: !enable })
      .eq('id', id)
    if (updErr) return res.status(500).json({ ok: false, error: 'update_failed' })
    return res.json({ ok: true })
  } catch (err) {
    return res.status(500).json({ ok: false, error: 'unexpected_error' })
  }
})

// Owner: start upgrade checkout (Premium ARS 11000)
app.post('/api/my-listings/:id/upgrade', async (req, res) => {
  try {
    if (!mpClient) return res.status(503).json({ ok: false, error: 'payments_unavailable' })
    const supabase = getServerSupabaseClient()
    const user = await getAuthUser(req, supabase)
    if (!user) return res.status(401).json({ ok: false, error: 'unauthorized' })
    const id = String(req.params.id)
    // Validate ownership
    const { data: listing } = await supabase
      .from('listings')
      .select('id,seller_id')
      .eq('id', id)
      .maybeSingle()
    if (!listing) return res.status(404).json({ ok: false, error: 'not_found' })
    if (listing.seller_id !== user.id) return res.status(403).json({ ok: false, error: 'forbidden' })

    // Create MP preference using existing /api/checkout path to keep logic consolidated
    req.body = {
      planCode: 'premium',
      amount: 11000,
      planCurrency: 'ARS',
      planName: 'Plan Premium',
      listingId: id,
      redirectUrls: {
        success: `${resolveFrontendBaseUrl()}/checkout/success`,
        failure: `${resolveFrontendBaseUrl()}/checkout/failure`,
        pending: `${resolveFrontendBaseUrl()}/checkout/pending`,
      },
    }
    return app._router.handle(req, res, () => {}) // delegate to existing route
  } catch (err) {
    return res.status(500).json({ ok: false, error: 'unexpected_error' })
  }
})
