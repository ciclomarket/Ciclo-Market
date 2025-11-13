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
const { MercadoPagoConfig, Preference } = require('mercadopago')
const { createClient: createSupabaseServerClient } = require('@supabase/supabase-js')
const { sendMail, isMailConfigured } = require('./lib/mail')
const { getServerSupabaseClient } = require('./lib/supabaseClient')
const { startRenewalNotificationJob } = (() => {
  try { return require('./jobs/renewalNotifier') } catch { return {} }
})()
const { startNewsletterDigestJob, runDigestOnce } = (() => {
  try { return require('./jobs/newsletterDigest') } catch { return {} }
})()
const { startStoreAnalyticsDigestJob, runStoreAnalyticsDigestOnce } = (() => {
  try { return require('./jobs/storeAnalyticsDigest') } catch { return {} }
})()
const { buildStoreAnalyticsHTML } = (() => {
  try { return require('./emails/storeAnalyticsEmail') } catch { return {} }
})()
const { buildSweepstakeParticipantEmail } = (() => {
  try { return require('./emails/sweepstakeParticipantEmail') } catch { return {} }
})()
const { buildSweepstakeWinnerEmail } = (() => {
  try { return require('./emails/sweepstakeWinnerEmail') } catch { return {} }
})()
const {
  getActiveSweepstake,
  getSweepstakeBySlug,
  upsertSweepstake,
  listParticipantsBySweepstakeId,
  getParticipantByUserId,
  upsertWinner,
  getWinnerBySweepstakeId,
} = (() => {
  try { return require('./lib/sweepstakes') } catch { return {} }
})()
const path = require('path')
// const https = require('https') // removed: used only for Google rating proxy

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
app.set('trust proxy', true)
app.use(express.json())

app.use((req, res, next) => {
  const rawHost = String(req.headers.host || '').trim()
  const protoHeader = req.headers['x-forwarded-proto']
  const forwardedProto = Array.isArray(protoHeader) ? protoHeader[0] : protoHeader
  const currentProto = String(forwardedProto || req.protocol || 'http').toLowerCase()

  const prefersCiclomarket = /(?:^|\.)ciclomarket\.ar$/i.test(rawHost)
  const enforceHost = /^ciclomarket\.ar$/i.test(rawHost)
  const targetHost = enforceHost ? 'www.ciclomarket.ar' : rawHost
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

/* ----------------------------- Cron jobs ---------------------------------- */
// Start scheduled jobs after basic middleware is ready
try { startNewsletterDigestJob && startNewsletterDigestJob() } catch {}
try { startStoreAnalyticsDigestJob && startStoreAnalyticsDigestJob() } catch {}

/* Google Reviews endpoints removed */

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
  if (value === null || value === undefined) return ''
  const str = String(value)
  if (!/[",\n\r]/.test(str)) return str
  return `"${str.replace(/"/g, '""')}"`
}

function buildParticipantsCsv(rows) {
  const header = 'user_id,first_listing_id,created_at'
  const lines = rows.map((row) =>
    [
      csvEscapeValue(row.user_id),
      csvEscapeValue(row.first_listing_id),
      csvEscapeValue(row.created_at),
    ].join(',')
  )
  return [header, ...lines].join('\n')
}

const UUID_REGEX = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i

function getFrontendBaseUrl() {
  return normalizeOrigin(process.env.FRONTEND_URL)
}

function fallbackNameFromEmail(email) {
  if (!email) return null
  const idx = email.indexOf('@')
  return idx > 0 ? email.slice(0, idx) : email
}

async function lookupUserContact(supabase, userId) {
  const result = { email: null, name: null }
  const id = String(userId || '').trim()
  if (!id) return result

  const isUUID = UUID_REGEX.test(id)
  if (isUUID) {
    try {
      const { data, error } = await supabase.auth.admin.getUserById(id)
      if (!error && data?.user) {
        result.email = data.user.email ?? result.email
        const meta = data.user.user_metadata || {}
        result.name =
          meta.name ||
          meta.full_name ||
          meta.first_name ||
          meta.display_name ||
          result.name
      }
    } catch (err) {
      console.warn('[sweepstakes] admin user lookup failed', err)
    }
  }

  if (!result.email || !result.name) {
    try {
      const { data, error } = await supabase
        .from('users')
        .select('email, name, full_name, profile_name')
        .or(`id.eq.${id},profile_slug.eq.${id}`)
        .maybeSingle()
      if (!error && data) {
        result.email = result.email || data.email || null
        result.name =
          result.name ||
          data.name ||
          data.full_name ||
          data.profile_name ||
          null
      }
    } catch (err) {
      console.warn('[sweepstakes] profile lookup failed', err)
    }
  }

  if (!result.email && /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(id)) {
    result.email = id
  }

  if (!result.name && result.email) {
    result.name = fallbackNameFromEmail(result.email)
  }

  return result
}

async function fetchListingSummary(supabase, listingId) {
  const id = String(listingId || '').trim()
  if (!id) return null
  try {
    const { data, error } = await supabase
      .from('listings')
      .select('id, slug, title')
      .eq('id', id)
      .maybeSingle()
    if (error || !data) return null
    const base = getFrontendBaseUrl()
    const slugOrId = data.slug || data.id
    return {
      id: data.id,
      slug: data.slug || null,
      title: data.title || 'Tu publicación en Ciclo Market',
      url: `${base}/listing/${encodeURIComponent(slugOrId)}`,
    }
  } catch (err) {
    console.warn('[sweepstakes] listing summary failed', err)
    return null
  }
}

function ensureMailAvailable(res) {
  if (!isMailConfigured()) {
    res.status(503).json({ ok: false, error: 'mail_not_configured' })
    return false
  }
  return true
}

/* ----------------------------- Health ------------------------------------- */
app.get('/', (_req, res) => {
  res.send('Ciclo Market API ready')
})

/* (Imagen proxy eliminado: ahora usamos URL directas o el transform nativo de Supabase) */

/* ----------------------------- Supabase (service) ------------------------- */
// Cliente con service role para registrar pagos (solo backend)
const supabaseService = (() => {
  const url = process.env.SUPABASE_URL || process.env.VITE_SUPABASE_URL
  const key = process.env.SUPABASE_SERVICE_ROLE_KEY
  if (!url || !key) {
    console.warn('[payments] SUPABASE_SERVICE_ROLE_KEY not configured – payments will not be recorded')
    return null
  }
  return createSupabaseServerClient(url, key)
})()

function coerceUuid(value) {
  if (!value) return null
  const str = typeof value === 'string' ? value.trim() : String(value)
  return UUID_REGEX.test(str) ? str : null
}

async function recordPayment({ userId, listingId, amount, currency = 'ARS', status = 'succeeded', provider = 'mercadopago', providerRef = null }) {
  if (!supabaseService) return
  try {
    const payload = {
      user_id: coerceUuid(userId),
      listing_id: coerceUuid(listingId),
      amount: typeof amount === 'number' ? amount : null,
      currency,
      status,
      provider,
      provider_ref: providerRef,
    }
    const { error } = await supabaseService.from('payments').insert(payload)
    if (error) console.error('[payments] insert failed', error, { payload })
  } catch (err) {
    console.error('[payments] unexpected error', err)
  }
}

/* ----------------------------- Track events ------------------------------- */
app.post('/api/track', async (req, res) => {
  try {
    if (!supabaseService) return res.sendStatus(204)
    const { type, listing_id, store_user_id, user_id, source, path, referrer, anon_id, meta } = req.body || {}
    const clean = (s) => (typeof s === 'string' ? s.slice(0, 512) : null)
    const allowed = new Set(['site_view','listing_view','store_view','wa_click'])
    if (!allowed.has(type)) return res.status(400).json({ ok: false, error: 'invalid_type' })
    const ua = clean(req.headers['user-agent'] || '')
    const payload = {
      type,
      listing_id: listing_id || null,
      store_user_id: store_user_id || null,
      user_id: typeof user_id === 'string' && user_id ? user_id : null,
      anon_id: clean(anon_id) || null,
      path: clean(path) || null,
      referrer: clean(referrer) || null,
      source: typeof source === 'string' && source ? source.slice(0, 64) : null,
      ua,
      meta: meta && typeof meta === 'object' ? meta : null,
    }
    const { error } = await supabaseService.from('events').insert(payload)
    if (error) console.warn('[track] insert failed', error)
    return res.sendStatus(204)
  } catch (err) {
    console.warn('[track] unexpected', err)
    return res.sendStatus(204)
  }
})

/* ----------------------------- Sweepstakes --------------------------------- */
app.get('/api/sweepstakes/active', async (_req, res) => {
  if (typeof getActiveSweepstake !== 'function') {
    return res.status(501).json({ error: 'not_configured' })
  }
  try {
    const sweepstake = await getActiveSweepstake()
    res.setHeader('Cache-Control', 'public, max-age=60, stale-while-revalidate=60')
    if (!sweepstake) {
      return res.json(null)
    }
    return res.json(sweepstake)
  } catch (err) {
    console.warn('[sweepstakes] active endpoint error', err)
    return res.status(500).json({ error: 'unexpected_error' })
  }
})

app.post('/api/sweepstakes', async (req, res) => {
  if (typeof upsertSweepstake !== 'function') {
    return res.status(501).json({ ok: false, error: 'not_configured' })
  }
  if (!ensureAdminAuthorized(req, res)) return

  let supabase
  try {
    supabase = getServerSupabaseClient()
  } catch (err) {
    console.error('[sweepstakes] supabase init failed', err)
    return res.status(500).json({ ok: false, error: 'supabase_not_configured' })
  }

  try {
    const sweepstake = await upsertSweepstake(req.body || {}, supabase)
    return res.json({ ok: true, sweepstake })
  } catch (err) {
    if (err && err.message === 'invalid_payload') {
      return res.status(400).json({ ok: false, error: 'invalid_payload', details: err.details })
    }
    if (err && err.message === 'invalid_range') {
      return res.status(400).json({ ok: false, error: 'invalid_range', details: err.details })
    }
    console.error('[sweepstakes] upsert endpoint error', err)
    return res.status(500).json({ ok: false, error: 'unexpected_error' })
  }
})

app.get('/api/sweepstakes/:slug/participants.csv', async (req, res) => {
  if (typeof getSweepstakeBySlug !== 'function' || typeof listParticipantsBySweepstakeId !== 'function') {
    return res.status(501).json({ ok: false, error: 'not_configured' })
  }
  if (!ensureAdminAuthorized(req, res)) return

  const slug = String(req.params.slug || '').trim()
  if (!slug) {
    return res.status(400).json({ ok: false, error: 'invalid_slug' })
  }

  let supabase
  try {
    supabase = getServerSupabaseClient()
  } catch (err) {
    console.error('[sweepstakes] supabase init failed', err)
    return res.status(500).json({ ok: false, error: 'supabase_not_configured' })
  }

  try {
    const sweepstake = await getSweepstakeBySlug(slug, supabase)
    if (!sweepstake) {
      return res.status(404).json({ ok: false, error: 'not_found' })
    }
    const participants = await listParticipantsBySweepstakeId(sweepstake.id, supabase)
    const csv = buildParticipantsCsv(participants)
    const filename = `${sweepstake.slug}-participants.csv`
    res.setHeader('Content-Type', 'text/csv; charset=utf-8')
    res.setHeader('Content-Disposition', `attachment; filename="${filename}"`)
    res.setHeader('Cache-Control', 'no-store')
    return res.send(csv)
  } catch (err) {
    console.error('[sweepstakes] participants csv error', err)
    return res.status(500).json({ ok: false, error: 'unexpected_error' })
  }
})

app.post('/api/sweepstakes/:slug/participants/:userId/notify', async (req, res) => {
  if (
    typeof getSweepstakeBySlug !== 'function' ||
    typeof getParticipantByUserId !== 'function' ||
    typeof buildSweepstakeParticipantEmail !== 'function'
  ) {
    return res.status(501).json({ ok: false, error: 'not_configured' })
  }
  if (!ensureAdminAuthorized(req, res)) return
  if (!ensureMailAvailable(res)) return

  const slug = String(req.params.slug || '').trim()
  const userId = String(req.params.userId || '').trim()
  if (!slug || !userId) {
    return res.status(400).json({ ok: false, error: 'invalid_params' })
  }

  let supabase
  try {
    supabase = getServerSupabaseClient()
  } catch (err) {
    console.error('[sweepstakes] supabase init failed', err)
    return res.status(500).json({ ok: false, error: 'supabase_not_configured' })
  }

  try {
    const sweepstake = await getSweepstakeBySlug(slug, supabase)
    if (!sweepstake?.id) {
      return res.status(404).json({ ok: false, error: 'not_found' })
    }
    const participant = await getParticipantByUserId(sweepstake.id, userId, supabase)
    if (!participant) {
      return res.status(404).json({ ok: false, error: 'participant_not_found' })
    }

    const contact = await lookupUserContact(supabase, participant.user_id)
    if (!contact.email) {
      return res.status(404).json({ ok: false, error: 'email_not_found' })
    }

    let listingTitle = null
    let listingUrl = null
    if (participant.first_listing_id) {
      const listing = await fetchListingSummary(supabase, participant.first_listing_id)
      if (listing) {
        listingTitle = listing.title
        listingUrl = listing.url
      }
    }

    const emailPayload = buildSweepstakeParticipantEmail({
      name: contact.name,
      sweepstakeTitle: sweepstake.title,
      endAt: sweepstake.end_at,
      listingTitle,
      listingUrl,
    })

    const mailOptions = {
      to: contact.email,
      subject: emailPayload.subject,
      html: emailPayload.html,
      text: emailPayload.text,
    }

    await sendMail(mailOptions)
    return res.json({ ok: true, sentTo: contact.email })
  } catch (err) {
    console.error('[sweepstakes] participant notify failed', err)
    return res.status(500).json({ ok: false, error: 'unexpected_error' })
  }
})

app.post('/api/sweepstakes/:slug/winner', async (req, res) => {
  if (
    typeof getSweepstakeBySlug !== 'function' ||
    typeof getParticipantByUserId !== 'function' ||
    typeof upsertWinner !== 'function'
  ) {
    return res.status(501).json({ ok: false, error: 'not_configured' })
  }
  if (!ensureAdminAuthorized(req, res)) return

  const slug = String(req.params.slug || '').trim()
  const userId = String(req.body?.userId || '').trim()
  const notify = req.body?.notify !== undefined ? Boolean(req.body.notify) : true
  const instructions =
    typeof req.body?.instructions === 'string' && req.body.instructions.trim()
      ? req.body.instructions.trim()
      : undefined

  if (!slug || !userId) {
    return res.status(400).json({ ok: false, error: 'invalid_params' })
  }

  if (notify && typeof buildSweepstakeWinnerEmail !== 'function') {
    return res.status(501).json({ ok: false, error: 'winner_email_not_configured' })
  }
  if (notify && !ensureMailAvailable(res)) return

  let supabase
  try {
    supabase = getServerSupabaseClient()
  } catch (err) {
    console.error('[sweepstakes] supabase init failed', err)
    return res.status(500).json({ ok: false, error: 'supabase_not_configured' })
  }

  try {
    const sweepstake = await getSweepstakeBySlug(slug, supabase)
    if (!sweepstake?.id) {
      return res.status(404).json({ ok: false, error: 'not_found' })
    }

    const participant = await getParticipantByUserId(sweepstake.id, userId, supabase)
    if (!participant) {
      return res.status(404).json({ ok: false, error: 'participant_not_found' })
    }

    const winner = await upsertWinner({ sweepstakeId: sweepstake.id, userId }, supabase)

    if (notify && winner) {
      const contact = await lookupUserContact(supabase, userId)
      if (!contact.email) {
        console.warn('[sweepstakes] winner notify aborted: email missing')
      } else {
        const emailPayload = buildSweepstakeWinnerEmail({
          name: contact.name,
          sweepstakeTitle: sweepstake.title,
          endAt: sweepstake.end_at,
          claimInstructions: instructions,
        })
        const mailOptions = {
          to: contact.email,
          subject: emailPayload.subject,
          html: emailPayload.html,
          text: emailPayload.text,
        }
        try {
          await sendMail(mailOptions)
        } catch (mailError) {
          console.error('[sweepstakes] winner email failed', mailError)
          return res.status(500).json({ ok: false, error: 'email_failed', details: mailError?.message })
        }
      }
    }

    return res.json({ ok: true, winner })
  } catch (err) {
    console.error('[sweepstakes] winner selection failed', err)
    return res.status(500).json({ ok: false, error: 'unexpected_error' })
  }
})

// Per-store Google rating endpoint removed

// Sitemap index que referencia sitemaps por tipo
app.get('/sitemap.xml', async (_req, res) => {
  try {
    res.type('application/xml')
    const origin = normalizeOrigin(process.env.FRONTEND_URL)

    // Calcular cantidad de páginas para listings visibles (mismo criterio que el front)
    let pages = 1
    const PAGE_SIZE = 1000
    try {
      const supabase = getServerSupabaseClient()
      const nowIso = new Date().toISOString()
      const { count } = await supabase
        .from('listings')
        .select('id', { count: 'exact', head: true })
        .not('status', 'in', '(draft,deleted,archived,expired)')
        .or(`expires_at.is.null,expires_at.gt.${nowIso}`)
      if (typeof count === 'number' && count > 0) {
        pages = Math.max(1, Math.ceil(count / PAGE_SIZE))
      }
    } catch {}

    const lastmod = new Date().toISOString()
    const listingEntries = Array.from({ length: pages }, (_, i) => {
      const n = i + 1
      return `
  <sitemap>
    <loc>${origin}/sitemap-listings-${n}.xml</loc>
    <lastmod>${lastmod}</lastmod>
  </sitemap>`
    }).join('')

    const xml = `<?xml version="1.0" encoding="UTF-8"?>
<sitemapindex xmlns="http://www.sitemaps.org/schemas/sitemap/0.9">
  <sitemap>
    <loc>${origin}/sitemap-static.xml</loc>
    <lastmod>${lastmod}</lastmod>
  </sitemap>
  <sitemap>
    <loc>${origin}/sitemap-categories.xml</loc>
    <lastmod>${lastmod}</lastmod>
  </sitemap>
  <sitemap>
    <loc>${origin}/sitemap-stores.xml</loc>
    <lastmod>${lastmod}</lastmod>
  </sitemap>
  ${listingEntries}
</sitemapindex>`
    res.set('Cache-Control', 'public, max-age=1800')
    return res.send(xml)
  } catch (e) {
    try {
      return res.sendFile(path.join(publicDir, 'sitemap.xml'))
    } catch {
      return res.status(500).send('')
    }
  }
})

// Sitemap: páginas estáticas
app.get('/sitemap-static.xml', async (_req, res) => {
  res.type('application/xml')
  const origin = normalizeOrigin(process.env.FRONTEND_URL)
  const nowIso = new Date().toISOString().slice(0, 10)
  const staticPaths = [
    '/',
    '/marketplace',
    // Legacy ofertas path (kept to help discovery if referenced)
    '/ofertas',
    // Landings SEO
    '/bicicletas-usadas',
    '/bicicletas-ruta',
    '/bicicletas-mtb',
    '/bicicletas-gravel',
    '/bicicletas-triatlon',
    '/fixie',
    '/accesorios',
    '/indumentaria',
    '/ofertas-destacadas',
    '/clasificados-bicicletas',
    '/publicar',
    '/como-publicar',
    '/sorteo-strava',
    '/ayuda',
    '/tienda-oficial',
    '/tiendas',
    '/faq',
    '/terminos',
    '/privacidad',
  ]
  const urls = staticPaths
    .map((p) => `
  <url>
    <loc>${origin}${p}</loc>
    <lastmod>${nowIso}</lastmod>
    <changefreq>weekly</changefreq>
  </url>`)
    .join('')
  const xml = `<?xml version="1.0" encoding="UTF-8"?>
<urlset xmlns="http://www.sitemaps.org/schemas/sitemap/0.9">
${urls}
</urlset>`
  res.set('Cache-Control', 'public, max-age=1800')
  return res.send(xml)
})

// Sitemap: listings paginados
app.get('/sitemap-listings-:page(\\d+).xml', async (req, res) => {
  try {
    res.type('application/xml')
    const origin = normalizeOrigin(process.env.FRONTEND_URL)
    const page = Math.max(1, parseInt(String(req.params.page || '1'), 10) || 1)
    // Reducimos el tamaño de página para disminuir timeouts
    const PAGE_SIZE = 500
    const from = (page - 1) * PAGE_SIZE
    const to = from + PAGE_SIZE - 1
    const supabase = getServerSupabaseClient()
    const nowIso = new Date().toISOString()
    const { data, error } = await supabase
      .from('listings')
      .select('id, slug, created_at, expires_at, status')
      .not('status', 'in', '(draft,deleted,archived,expired)')
      .or(`expires_at.is.null,expires_at.gt.${nowIso}`)
      .order('created_at', { ascending: false })
      .range(from, to)
    if (error) throw error
    const nowDay = new Date().toISOString().slice(0, 10)
    // Filtro defensivo adicional por si alguna fila no respeta las condiciones anteriores
    const rows = (data || []).filter((l) => {
      const status = typeof l.status === 'string' ? l.status.trim().toLowerCase() : 'active'
      if (status === 'draft' || status === 'deleted' || status === 'archived' || status === 'expired') return false
      const exp = l.expires_at ? Date.parse(l.expires_at) : null
      return !(typeof exp === 'number' && exp > 0 && exp < Date.now())
    })
    const urls = rows
      .map((l) => {
        const slugOrId = l.slug || l.id
        const lastmod = l.created_at ? new Date(l.created_at).toISOString().slice(0, 10) : nowDay
        return `
  <url>
    <loc>${origin}/listing/${encodeURIComponent(slugOrId)}</loc>
    <lastmod>${lastmod}</lastmod>
    <changefreq>weekly</changefreq>
    <priority>0.7</priority>
  </url>`
      })
      .join('')
    const xml = `<?xml version="1.0" encoding="UTF-8"?>
<urlset xmlns="http://www.sitemaps.org/schemas/sitemap/0.9">
${urls}
</urlset>`
    res.set('Cache-Control', 'public, max-age=1800')
    return res.send(xml)
  } catch (e) {
    // Evitar error 5xx para Google: devolver un sitemap vacío con 200
    try {
      res.type('application/xml')
      res.set('Cache-Control', 'public, max-age=600')
      const xml = `<?xml version="1.0" encoding="UTF-8"?>\n<urlset xmlns="http://www.sitemaps.org/schemas/sitemap/0.9"></urlset>`
      return res.send(xml)
    } catch {
      return res.status(200).type('application/xml').send('<?xml version="1.0" encoding="UTF-8"?>\n<urlset xmlns="http://www.sitemaps.org/schemas/sitemap/0.9"></urlset>')
    }
  }
})

// Sitemap: tiendas oficiales
app.get('/sitemap-stores.xml', async (_req, res) => {
  try {
    res.type('application/xml')
    const origin = (process.env.FRONTEND_URL || '').split(',')[0]?.trim() || 'https://ciclomarket.ar'
    const supabase = getServerSupabaseClient()
    const { data, error } = await supabase
      .from('users')
      .select('store_slug, created_at, store_enabled')
      .eq('store_enabled', true)
      .not('store_slug', 'is', null)
    if (error) throw error
    const nowIso = new Date().toISOString().slice(0, 10)
    const urls = (data || [])
      .filter((r) => r.store_slug)
      .map((r) => {
        const loc = `${origin}/tienda/${encodeURIComponent(String(r.store_slug))}`
        const lastmod = r.created_at ? new Date(r.created_at).toISOString().slice(0, 10) : nowIso
        return `
  <url>
    <loc>${loc}</loc>
    <lastmod>${lastmod}</lastmod>
    <changefreq>weekly</changefreq>
  </url>`
      })
      .join('')
    const xml = `<?xml version="1.0" encoding="UTF-8"?>
<urlset xmlns="http://www.sitemaps.org/schemas/sitemap/0.9">
${urls}
</urlset>`
    res.set('Cache-Control', 'public, max-age=1800')
    return res.send(xml)
  } catch (e) {
    return res.status(500).send('')
  }
})

// Sitemap: categorías/landings curadas
app.get('/sitemap-categories.xml', async (_req, res) => {
  try {
    res.type('application/xml')
    const origin = (process.env.FRONTEND_URL || '').split(',')[0]?.trim() || 'https://ciclomarket.ar'
    const nowIso = new Date().toISOString().slice(0, 10)
    const cats = [
      '/bicicletas-usadas',
      '/bicicletas-ruta',
      '/bicicletas-mtb',
      '/bicicletas-gravel',
      '/bicicletas-triatlon',
      '/fixie',
      '/accesorios',
      '/indumentaria',
      '/ofertas-destacadas',
      '/clasificados-bicicletas',
    ]
    const urls = cats
      .map((p) => `\n  <url>\n    <loc>${origin}${p}</loc>\n    <lastmod>${nowIso}</lastmod>\n    <changefreq>weekly</changefreq>\n  </url>`)
      .join('')
    const xml = `<?xml version="1.0" encoding="UTF-8"?>\n<urlset xmlns="http://www.sitemaps.org/schemas/sitemap/0.9">\n${urls}\n</urlset>`
    res.set('Cache-Control', 'public, max-age=1800')
    return res.send(xml)
  } catch {
    return res.status(200).type('application/xml').send('<?xml version="1.0" encoding="UTF-8"?>\n<urlset xmlns="http://www.sitemaps.org/schemas/sitemap/0.9"></urlset>')
  }
})

/* -------------------------- SEO Redirects --------------------------- */
// Rutas legacy a nuevas landings (301) para preservar señales
app.get(['/marketplace/bicicletas-de-ruta', '/marketplace/bicicletas-ruta'], (_req, res) => res.redirect(301, '/bicicletas-ruta'))
app.get(['/marketplace/bicicletas-de-mtb', '/marketplace/mtb'], (_req, res) => res.redirect(301, '/bicicletas-mtb'))
app.get(['/marketplace/bicicletas-de-gravel', '/marketplace/gravel'], (_req, res) => res.redirect(301, '/bicicletas-gravel'))
app.get(['/ofertas'], (_req, res) => res.redirect(301, '/ofertas-destacadas'))

app.get('/robots.txt', (_req, res) => {
  res.type('text/plain')
  res.sendFile(path.join(publicDir, 'robots.txt'))
})

/* ----------------------- Open Graph for Listings --------------------------- */
/**
 * Sirve meta-tags OG solo para /share/listing/:id en el BACKEND.
 * - Si es un bot (WhatsApp/Facebook/etc.): devuelve HTML con <meta property="og:*">
 * - Si es un humano: redirige al front (FRONTEND_URL).
 * Nota: evitamos interceptar /listing/:id aquí para no interferir con el SPA.
 */
app.get(['/share/listing/:id'], async (req, res) => {
  try {
    const { id } = req.params
    const supabase = getServerSupabaseClient()
    const isUuid = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(String(id || ''))

    async function fetchByIdOrSlug(key) {
      // Try by id first if it looks like a UUID
      if (isUuid) {
        const { data, error } = await supabase
          .from('listings')
          .select('id, slug, title, price, price_currency, description, images, status, frame_size, material, year, drivetrain, drivetrain_detail')
          .eq('id', key)
          .single()
        if (!error && data) return { data }
      }
      // Fallback by slug (or primary if not UUID)
      const { data, error } = await supabase
        .from('listings')
        .select('id, slug, title, price, price_currency, description, images, status, frame_size, material, year, drivetrain, drivetrain_detail')
        .eq('slug', key)
        .single()
      return { data, error }
    }

    const { data: listing, error } = await fetchByIdOrSlug(id)

    const baseFront = getFrontendBaseUrl()
    const slugOrId = (listing && listing.slug) ? listing.slug : id
    const canonicalUrl = `${baseFront}/listing/${encodeURIComponent(slugOrId)}`
    const fallbackImg = `${baseFront}/logo-azul.png`

    if (error || !listing) {
      const nf = `<!doctype html><html lang="es"><head>
<meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1">
<title>Ciclo Market</title>
<meta property="og:title" content="Publicación no encontrada · Ciclo Market" />
<meta property="og:description" content="La bicicleta que buscás no está disponible." />
<meta property="og:image" content="${fallbackImg}" />
<meta property="og:type" content="website" />
<meta property="og:url" content="${canonicalUrl}" />
<meta name="twitter:card" content="summary_large_image" />
</head><body></body></html>`
      res.set('Content-Type', 'text/html; charset=utf-8')
      res.set('Cache-Control', 'public, max-age=300')
      return res.status(404).send(nf)
    }

    // Imagen OG fija (solicitado): usar siempre el logo
    const ogImage = fallbackImg

    // Título + precio
    let priceFmt = null
    if (typeof listing.price === 'number' && listing.price > 0) {
      try {
        priceFmt = new Intl.NumberFormat('es-AR', {
          style: 'currency',
          currency: listing.price_currency || 'ARS',
          maximumFractionDigits: 0,
        }).format(listing.price)
      } catch {
        priceFmt = `${listing.price_currency || 'ARS'} ${listing.price}`
      }
    }
    const title = [listing.title, priceFmt].filter(Boolean).join(' · ')
    // Descripción OG enfocada en specs clave
    const specParts = []
    if (listing.frame_size) specParts.push(`Talle: ${listing.frame_size}`)
    if (listing.material) specParts.push(`Material: ${listing.material}`)
    if (listing.year) specParts.push(`Año: ${listing.year}`)
    const group = listing.drivetrain_detail || listing.drivetrain
    if (group) specParts.push(`Grupo: ${group}`)
    const desc = specParts.join(' · ') || 'Mirá los detalles en Ciclo Market.'

    const html = `<!doctype html><html lang="es"><head>
<meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1">
<title>${escapeHtml(title)} | Ciclo Market</title>

<meta property="og:title" content="${escapeHtml(title)}" />
<meta property="og:description" content="${escapeHtml(desc)}" />
<meta property="og:image" content="${ogImage}" />
<meta property="og:image:secure_url" content="${ogImage}" />
<meta property="og:image:width" content="1200" />
<meta property="og:image:height" content="630" />
<meta property="og:image:type" content="image/jpeg" />
<meta property="og:url" content="${canonicalUrl}" />
<meta property="og:type" content="product" />
<meta property="og:updated_time" content="${Math.floor(Date.now() / 1000)}" />
<meta property="product:price:amount" content="${listing.price || ''}" />
<meta property="product:price:currency" content="${listing.price_currency || 'ARS'}" />

<meta name="twitter:card" content="summary_large_image" />
<meta name="twitter:title" content="${escapeHtml(title)}" />
<meta name="twitter:description" content="${escapeHtml(desc)}" />
<meta name="twitter:image" content="${ogImage}" />
</head>
<body>${isBot(req) ? '' : `<script>location.replace(${JSON.stringify(canonicalUrl)});</script>`}</body></html>`

    res.set('Content-Type', 'text/html; charset=utf-8')
    res.set('Cache-Control', 'public, max-age=300')
    return res.status(200).send(html)
  } catch (e) {
    console.error('[og] error', e)
    res.set('Content-Type', 'text/html; charset=utf-8')
    return res.status(500).send('<!doctype html><title>Error</title>')
  }
})

/* ----------------------------- Users / Mail -------------------------------- */
app.get('/api/users/:id/contact-email', async (req, res) => {
  const userId = String(req.params.id || '')
  if (!userId) return res.status(400).json({ error: 'missing_user_id' })

  const isUUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(userId)

  try {
    const supabase = getServerSupabaseClient()

    // 1) Si es UUID, usamos admin.getUserById (Auth)
    if (isUUID) {
      const { data, error } = await supabase.auth.admin.getUserById(userId)
      if (error) {
        console.warn('[users] admin getUser failed', error)
      } else {
        const email = data?.user?.email ?? null
        if (email) return res.json({ email })
      }
    }

    // 2) Fallback: buscar en la tabla de perfiles 'users'
    // Permitimos buscar por id exacto o por profile_slug
    {
      const { data, error } = await supabase
        .from('users')
        .select('email')
        .or(`id.eq.${userId},profile_slug.eq.${userId}`)
        .maybeSingle()
      if (!error && data?.email) {
        return res.json({ email: data.email })
      }
    }

    // 3) Si el parámetro ya es un email, lo devolvemos validado
    if (/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(userId)) {
      return res.json({ email: userId })
    }

    return res.status(404).json({ error: 'email_not_found' })
  } catch (err) {
    console.warn('[users] contact email lookup error', err)
    return res.status(500).json({ error: 'unexpected_error' })
  }
})

/* ----------------------------- Share Boost --------------------------------- */
// Estructura esperada (tabla sugerida en Supabase):
// create table share_boosts (
//   id uuid primary key default gen_random_uuid(),
//   seller_id text not null,
//   listing_id text not null,
//   type text not null check (type in ('story','post')),
//   handle text null,
//   proof_url text null,
//   note text null,
//   reward text not null default 'boost7', -- 'boost7' | 'photos2'
//   status text not null default 'pending', -- 'pending' | 'approved' | 'rejected'
//   created_at timestamptz not null default now(),
//   reviewed_at timestamptz null,
//   reviewed_by text null
// );
app.post('/api/share-boost/submit', async (req, res) => {
  try {
    const { sellerId, listingId, type, handle, proofUrl, note, reward } = req.body || {}
    if (!sellerId || !listingId || !type) return res.status(400).send('missing_fields')
    const supabase = getServerSupabaseClient()
    const payload = {
      seller_id: sellerId,
      listing_id: listingId,
      type,
      handle: handle || null,
      proof_url: proofUrl || null,
      note: note || null,
      reward: reward || 'boost7',
      status: 'pending',
    }
    const { error } = await supabase.from('share_boosts').insert([payload])
    if (error) return res.status(500).send('insert_failed')
    return res.json({ ok: true })
  } catch (err) {
    console.warn('[share-boost] submit failed', err)
    return res.status(500).send('unexpected_error')
  }
})

app.get('/api/share-boost/pending', async (_req, res) => {
  try {
    const supabase = getServerSupabaseClient()
    const { data, error } = await supabase
      .from('share_boosts')
      .select('*')
      .eq('status', 'pending')
      .order('created_at', { ascending: false })
    if (error) return res.status(500).send('fetch_failed')
    return res.json({ items: data || [] })
  } catch (err) {
    console.warn('[share-boost] list failed', err)
    return res.status(500).send('unexpected_error')
  }
})

// Moderadores pueden aprobar/rechazar y aplicar premio
app.post('/api/share-boost/review', async (req, res) => {
  try {
    const { id, approve, reviewerId } = req.body || {}
    if (!id) return res.status(400).send('missing_id')
    const supabase = getServerSupabaseClient()
    const newStatus = approve ? 'approved' : 'rejected'
    const { data, error } = await supabase.from('share_boosts').update({ status: newStatus, reviewed_at: new Date().toISOString(), reviewed_by: reviewerId || null }).eq('id', id).select().single()
    if (error || !data) return res.status(500).send('update_failed')

    if (approve && data.reward === 'boost7') {
      // Si el vendedor es tienda oficial, no sobrescribimos su plan 'pro'
      let isStore = false
      try {
        const { data: listingRow } = await supabase
          .from('listings')
          .select('seller_id')
          .eq('id', data.listing_id)
          .maybeSingle()
        if (listingRow?.seller_id) {
          const { data: profile } = await supabase
            .from('users')
            .select('store_enabled')
            .eq('id', listingRow.seller_id)
            .maybeSingle()
          isStore = Boolean(profile?.store_enabled)
        }
      } catch (e) {
        // noop
      }
      if (!isStore) {
        // Aplicar destaque 7 días: setear seller_plan básico por 7 días desde hoy
        const expires = new Date(Date.now() + 7 * 24 * 60 * 60 * 1000).toISOString()
        const { error: upd } = await supabase
          .from('listings')
          .update({ seller_plan: 'basic', seller_plan_expires: expires })
          .eq('id', data.listing_id)
        if (upd) console.warn('[share-boost] apply boost failed', upd)
      }
    }
    // Nota: para reward 'photos2' requeriría un campo adicional por listing; pendiente
    return res.json({ ok: true })
  } catch (err) {
    console.warn('[share-boost] review failed', err)
    return res.status(500).send('unexpected_error')
  }
})

/* ----------------------------- Gifts (plan codes) -------------------------- */
// Tablas sugeridas en Supabase:
// create table if not exists gift_codes (
//   code text primary key,
//   plan text not null check (plan in ('basic','premium')),
//   uses_left int not null default 1,
//   expires_at timestamptz null,
//   created_at timestamptz not null default now()
// );
// create table if not exists gift_redemptions (
//   id uuid primary key default gen_random_uuid(),
//   code text not null references gift_codes(code),
//   seller_id text not null,
//   redeemed_at timestamptz not null default now()
// );

app.post('/api/gifts/create', async (req, res) => {
  try {
    const { plan, uses, expiresAt } = req.body || {}
    if (!plan || !['basic', 'premium'].includes(plan)) return res.status(400).send('invalid_plan')
    const supabase = getServerSupabaseClient()
    // Generar un código simple (suficiente para casos de regalo manual)
    const code = (Math.random().toString(36).slice(2, 10) + Math.random().toString(36).slice(2, 6)).toUpperCase()
    const payload = {
      code,
      plan,
      uses_left: Math.max(1, Number(uses) || 1),
      expires_at: expiresAt || null,
    }
    const { error } = await supabase.from('gift_codes').insert([payload])
    if (error) return res.status(500).send('insert_failed')
    return res.json({ ok: true, code })
  } catch (err) {
    console.warn('[gifts] create failed', err)
    return res.status(500).send('unexpected_error')
  }
})

app.get('/api/gifts/validate', async (req, res) => {
  try {
    const code = String(req.query.code || '')
    if (!code) return res.status(400).json({ ok: false, error: 'missing_code' })
    const supabase = getServerSupabaseClient()
    const { data, error } = await supabase
      .from('gift_codes')
      .select('*')
      .eq('code', code)
      .maybeSingle()
    if (error || !data) return res.json({ ok: false, error: 'invalid_code' })
    if (data.uses_left <= 0) return res.json({ ok: false, error: 'no_uses_left' })
    if (data.expires_at && new Date(data.expires_at).getTime() < Date.now()) return res.json({ ok: false, error: 'expired' })
    return res.json({ ok: true, plan: data.plan })
  } catch (err) {
    console.warn('[gifts] validate failed', err)
    return res.status(500).json({ ok: false })
  }
})

app.post('/api/gifts/redeem', async (req, res) => {
  try {
    const { code, sellerId } = req.body || {}
    if (!code || !sellerId) return res.status(400).send('missing_fields')
    const supabase = getServerSupabaseClient()
    const { data, error } = await supabase
      .from('gift_codes')
      .select('*')
      .eq('code', code)
      .maybeSingle()
    if (error || !data) return res.status(400).send('invalid_code')
    if (data.uses_left <= 0) return res.status(400).send('no_uses_left')
    if (data.expires_at && new Date(data.expires_at).getTime() < Date.now()) return res.status(400).send('expired')

    // Registrar redención
    const { error: ins } = await supabase.from('gift_redemptions').insert([{ code, seller_id: sellerId }])
    if (ins) console.warn('[gifts] redemption insert warn', ins)

    // Decrementar usos (protegido contra negativos)
    const { error: upd } = await supabase
      .from('gift_codes')
      .update({ uses_left: (data.uses_left - 1) < 0 ? 0 : (data.uses_left - 1) })
      .eq('code', code)
    if (upd) console.warn('[gifts] decrement warn', upd)

    return res.json({ ok: true })
  } catch (err) {
    console.warn('[gifts] redeem failed', err)
    return res.status(500).send('unexpected_error')
  }
})

// Claim a gift code as a publish credit for a user
app.post('/api/gifts/claim', async (req, res) => {
  try {
    const { code, userId } = req.body || {}
    if (!code || !userId) return res.status(400).json({ ok: false, error: 'missing_fields' })
    const supabase = getServerSupabaseClient()

    // If a credit for this (code,user) already exists, treat as idempotent success
    const providerRef = `${code}:${userId}`
    const { data: existingCredit } = await supabase
      .from('publish_credits')
      .select('id, status')
      .eq('provider', 'gift')
      .eq('provider_ref', providerRef)
      .maybeSingle()
    if (existingCredit?.id) {
      return res.json({ ok: true, creditId: existingCredit.id })
    }

    // Validate gift
    const { data: gift, error } = await supabase
      .from('gift_codes')
      .select('*')
      .eq('code', code)
      .maybeSingle()
    if (error || !gift) return res.status(400).json({ ok: false, error: 'invalid_code' })
    if (gift.uses_left <= 0) return res.status(400).json({ ok: false, error: 'no_uses_left' })
    if (gift.expires_at && new Date(gift.expires_at).getTime() < Date.now()) return res.status(400).json({ ok: false, error: 'expired' })
    const planCode = normalisePlanCode(gift.plan)
    if (!(planCode === 'basic' || planCode === 'premium')) return res.status(400).json({ ok: false, error: 'invalid_plan' })

    // Create credit (available) with provider 'gift'
    const expiryIso = gift.expires_at || new Date(Date.now() + 30 * 24 * 60 * 60 * 1000).toISOString()
    const { data: creditIns, error: creditErr } = await supabase
      .from('publish_credits')
      .insert([{ user_id: userId, plan_code: planCode, status: 'available', provider: 'gift', provider_ref: providerRef, expires_at: expiryIso }])
      .select('id')
      .maybeSingle()
    if (creditErr || !creditIns?.id) return res.status(500).json({ ok: false, error: 'credit_insert_failed' })

    // Register redemption and decrement uses_left (best-effort)
    try {
      await supabase.from('gift_redemptions').insert([{ code, seller_id: userId }])
    } catch (e) { /* noop */ }
    try {
      await supabase.from('gift_codes').update({ uses_left: Math.max(0, Number(gift.uses_left || 0) - 1) }).eq('code', code)
    } catch (e) { /* noop */ }

    return res.json({ ok: true, creditId: creditIns.id, planCode })
  } catch (err) {
    console.warn('[gifts/claim] failed', err)
    return res.status(500).json({ ok: false, error: 'unexpected_error' })
  }
})

app.post('/api/offers/notify', async (req, res) => {
  if (!isMailConfigured()) {
    return res.status(503).json({ error: 'smtp_unavailable' })
  }

  const {
    sellerEmail,
    sellerName,
    listingTitle,
    listingUrl,
    amountLabel,
    buyerName,
    buyerEmail,
    buyerWhatsapp,
  } = req.body || {}

  if (!sellerEmail || !listingTitle || !amountLabel) {
    return res.status(400).json({ error: 'missing_fields' })
  }

  const from = process.env.SMTP_FROM || `Ciclo Market <${process.env.SMTP_USER}>`
  const title = listingTitle || 'tu publicación'
  const whatsappLabel = buyerWhatsapp ? String(buyerWhatsapp) : null
  const whatsappSanitized = whatsappLabel ? whatsappLabel.replace(/[^0-9+]/g, '') : null
  const whatsappLink = whatsappSanitized ? `https://wa.me/${whatsappSanitized.replace(/^[+]/, '')}` : null
  const buyerDisplayName = buyerName || 'Un comprador interesado'
  const buyerContactLine = [buyerEmail ? `Email: ${buyerEmail}` : null, whatsappLabel ? `WhatsApp: ${whatsappLabel}` : null]
    .filter(Boolean)
    .join(' • ')

  const html = `
    <div style="font-family: Arial, sans-serif; line-height: 1.5; color: #14212e;">
      <h2 style="color:#0c1723;">Nueva oferta para ${title}</h2>
      <p>Hola ${sellerName || 'vendedor'},</p>
      <p><strong>${buyerDisplayName}</strong> te envió una oferta por <strong>${amountLabel}</strong>.</p>
      <p>Mensaje rápido: “Contactate si te interesa 💬”.</p>
      ${listingUrl ? `<p>Ver publicación: <a href="${listingUrl}" style="color:#0c72ff;">${listingUrl}</a></p>` : ''}
      ${buyerContactLine ? `<p>Datos de contacto: ${buyerContactLine}</p>` : ''}
      ${whatsappLink ? `<p><a href="${whatsappLink}" style="display:inline-block;margin-top:12px;padding:10px 16px;background:#25D366;color:#fff;text-decoration:none;border-radius:6px;">Abrir WhatsApp</a></p>` : ''}
      <hr style="margin:24px 0;border:none;border-top:1px solid #e1e5eb;" />
      <p style="font-size:12px;color:#6b7280;">Este correo se generó automáticamente desde Ciclo Market.</p>
    </div>
  `

  const textParts = [
    `Nueva oferta para ${title}`,
    `De: ${buyerDisplayName}`,
    `Monto ofrecido: ${amountLabel}`,
    'Mensaje: Contactate si te interesa',
    listingUrl ? `Publicación: ${listingUrl}` : null,
    buyerContactLine ? `Contacto: ${buyerContactLine}` : null,
    whatsappLink ? `WhatsApp directo: ${whatsappLink}` : null,
  ].filter(Boolean)

  try {
    await sendMail({
      from,
      to: sellerEmail,
      subject: `Tenés una nueva oferta para ${title}`,
      text: textParts.join('\n'),
      html,
    })
    return res.json({ ok: true })
  } catch (error) {
    console.error('[offers] email send failed', error)
    return res.status(500).json({ error: 'email_failed' })
  }
})

/* ----------------------------- Listings cleanup --------------------------- */
// Convierte una URL pública de Supabase a { bucket, path } para Storage.remove
function parseSupabasePublicUrl(publicUrl) {
  try {
    const u = new URL(publicUrl)
    const marker = '/storage/v1/object/public/'
    const idx = u.pathname.indexOf(marker)
    if (idx === -1) return null
    const remainder = u.pathname.slice(idx + marker.length) // <bucket>/<path>
    const firstSlash = remainder.indexOf('/')
    if (firstSlash === -1) return null
    const bucket = remainder.slice(0, firstSlash)
    const path = decodeURIComponent(remainder.slice(firstSlash + 1))
    return { bucket, path }
  } catch {
    return null
  }
}

// Borra del storage las imágenes asociadas a una publicación
app.post('/api/listings/:id/cleanup-images', async (req, res) => {
  try {
    const listingId = String(req.params.id || '')
    if (!listingId) return res.status(400).json({ error: 'missing_id' })
    const supabase = getServerSupabaseClient()
    const { data: row, error } = await supabase
      .from('listings')
      .select('images')
      .eq('id', listingId)
      .maybeSingle()
    if (error) return res.status(500).json({ error: 'fetch_failed' })
    if (!row) return res.status(404).json({ error: 'not_found' })

    const urls = Array.isArray(row.images) ? row.images : []
    // Agrupar por bucket
    const byBucket = new Map()
    for (const url of urls) {
      const parsed = parseSupabasePublicUrl(String(url))
      if (!parsed) continue
      if (!byBucket.has(parsed.bucket)) byBucket.set(parsed.bucket, [])
      byBucket.get(parsed.bucket).push(parsed.path)
    }

    let removed = 0
    for (const [bucket, paths] of byBucket.entries()) {
      if (!paths.length) continue
      const { error: rmErr } = await supabase.storage.from(bucket).remove(paths)
      if (rmErr) {
        // seguimos con otros buckets pero reportamos el error
        console.warn('[cleanup-images] remove failed', bucket, rmErr.message)
        continue
      }
      removed += paths.length
    }

    return res.json({ ok: true, removed })
  } catch (err) {
    console.warn('[cleanup-images] failed', err)
    return res.status(500).json({ error: 'unexpected_error' })
  }
})

// Prune: borra imágenes de listings con status='deleted' y luego elimina filas
app.post('/api/dev/prune-deleted', async (req, res) => {
  try {
    if (process.env.ENABLE_DEV_ENDPOINTS !== 'true') return res.status(403).json({ error: 'forbidden' })
    const limit = Math.max(1, Math.min(1000, Number(req.body?.limit || 200)))
    const supabase = getServerSupabaseClient()

    const { data: rows, error } = await supabase
      .from('listings')
      .select('id, images')
      .eq('status', 'deleted')
      .limit(limit)

    if (error) return res.status(500).json({ error: 'fetch_failed' })
    if (!rows || rows.length === 0) return res.json({ ok: true, removed: 0, imagesRemoved: 0 })

    // Agrupación por bucket para borrar del storage
    const byBucket = new Map()
    for (const row of rows) {
      const urls = Array.isArray(row.images) ? row.images : []
      for (const url of urls) {
        const parsed = parseSupabasePublicUrl(String(url))
        if (!parsed) continue
        if (!byBucket.has(parsed.bucket)) byBucket.set(parsed.bucket, new Set())
        byBucket.get(parsed.bucket).add(parsed.path)
      }
    }

    let imagesRemoved = 0
    for (const [bucket, set] of byBucket.entries()) {
      const paths = Array.from(set)
      if (!paths.length) continue
      const { error: rmErr } = await supabase.storage.from(bucket).remove(paths)
      if (rmErr) {
        console.warn('[prune-deleted] storage remove failed', bucket, rmErr.message)
        continue
      }
      imagesRemoved += paths.length
    }

    const ids = rows.map((r) => r.id)
    const { error: delErr } = await supabase.from('listings').delete().in('id', ids)
    if (delErr) {
      console.warn('[prune-deleted] rows delete failed', delErr)
      return res.status(500).json({ error: 'rows_delete_failed', imagesRemoved, candidates: rows.length })
    }
    return res.json({ ok: true, removed: ids.length, imagesRemoved })
  } catch (err) {
    console.warn('[prune-deleted] failed', err)
    return res.status(500).json({ error: 'unexpected_error' })
  }
})

/* ----------------------------- Contacts + Reviews ------------------------- */
// Registra un evento de contacto (whatsapp/email) para habilitar reseñas 24h después
app.post('/api/contacts/log', async (req, res) => {
  try {
    const { sellerId, listingId, buyerId, type } = req.body || {}
    if (!sellerId || !type) return res.status(400).json({ error: 'missing_fields' })
    const supabase = getServerSupabaseClient()
    // Normalizar listingId: si viene un slug (texto) intentamos resolver el UUID
    const UUID_RE = /^[0-9a-fA-F]{8}-[0-9a-fA-F]{4}-[0-9a-fA-F]{4}-[0-9a-fA-F]{4}-[0-9a-fA-F]{12}$/
    let listingUuid = null
    try {
      const raw = typeof listingId === 'string' ? listingId.trim() : ''
      const isUuid = UUID_RE.test(raw)
      if (raw) {
        if (isUuid) {
          listingUuid = raw
        } else {
          const { data: bySlug } = await supabase
            .from('listings')
            .select('id')
            .eq('slug', raw)
            .maybeSingle()
          if (bySlug?.id && UUID_RE.test(String(bySlug.id))) listingUuid = bySlug.id
        }
      }
    } catch (_) {
      // ignore, fallback to null
      listingUuid = null
    }
    const payload = {
      seller_id: sellerId,
      buyer_id: buyerId || null,
      type,
      // Sólo incluimos listing_id si es un UUID válido
      ...(listingUuid ? { listing_id: listingUuid } : {}),
    }
    const { error } = await supabase.from('contact_events').insert([payload])
    if (error) {
      console.warn('[contacts] insert failed', { ...error, listingId, listingUuid })
    }
    // Emisión inmediata de recordatorio/notification/email (one-shot, si hay buyer)
    if (buyerId) {
      try {
        // Asegurar recordatorio para el par vendedor-comprador (ready inmediatamente)
        await supabase
          .from('review_reminders')
          .upsert({
            seller_id: sellerId,
            buyer_id: buyerId,
            ...(listingUuid ? { listing_id: listingUuid } : {}),
            contact_event_id: null,
            ready_at: new Date().toISOString(),
          }, { onConflict: 'seller_id,buyer_id' })

        // Leer estado actual para evitar duplicados
        const { data: rem } = await supabase
          .from('review_reminders')
          .select('id,sent_inapp,sent_email')
          .eq('seller_id', sellerId)
          .eq('buyer_id', buyerId)
          .maybeSingle()

        // In-app notification (si no fue enviada)
        if (rem && rem.sent_inapp === false) {
          const cta = `/vendedor/${sellerId}?review=1`
          const insertPayload = {
            user_id: buyerId,
            type: 'system',
            title: 'Podés dejar una reseña',
            body: 'Tu reseña para este vendedor ya está disponible. ¡Contá tu experiencia y ayudá a otros!',
            cta_url: cta,
            metadata: { seller_id: sellerId },
            actor_id: sellerId,
          }
          const { error: notifErr } = await supabase.from('notifications').insert([insertPayload])
          if (notifErr) {
            console.warn('[contacts] notification insert failed', notifErr)
          } else {
            await supabase
              .from('review_reminders')
              .update({ sent_inapp: true })
              .eq('id', rem.id)
          }
        }

        // Email (si hay configuración y aún no se envió)
        if (false && rem && rem.sent_email === false) {
          const canSendMail = (() => {
            try { return require('./lib/mail').isMailConfigured() } catch { return false }
          })()
          if (canSendMail) {
            try {
              // Buscar email del comprador
              const { data: profile } = await supabase
                .from('users')
                .select('id,email,full_name')
                .eq('id', buyerId)
                .maybeSingle()
              const to = profile?.email
              if (to) {
                const baseFront = (process.env.FRONTEND_URL || '').split(',')[0]?.trim() || ''
                const ctaUrl = baseFront ? `${baseFront}/vendedor/${sellerId}?review=1` : null
                await sendMail({
                  from: process.env.SMTP_FROM || `Ciclo Market <${process.env.SMTP_USER}>`,
                  to,
                  subject: 'Ya podés dejar una reseña',
                  html: `<div style="font-family:Arial,sans-serif;line-height:1.6;color:#14212e;">
                    <h2>Dejá tu reseña</h2>
                    <p>Hola ${profile.full_name || 'ciclista'},</p>
                    <p>Ya podés dejar una reseña sobre tu experiencia con este vendedor.</p>
                    ${ctaUrl ? `<div style="margin:16px 0;"><a href="${ctaUrl}" style="display:inline-block;padding:10px 16px;background:#14212e;color:#fff;text-decoration:none;border-radius:8px;">Escribir reseña</a></div>` : ''}
                    <p>Gracias por ayudar a la comunidad Ciclo Market.</p>
                  </div>`,
                })
                await supabase
                  .from('review_reminders')
                  .update({ sent_email: true })
                  .eq('id', rem.id)
              }
            } catch (mailErr) {
              console.warn('[contacts] send review email failed', mailErr)
            }
          }
        }
      } catch (e) {
        console.warn('[contacts] immediate reminder/notification failed', e)
      }
    }

    return res.json({ ok: true })
  } catch (err) {
    console.warn('[contacts] log failed', err)
    return res.status(500).json({ error: 'unexpected_error' })
  }
})

// ¿Puede buyer reseñar a seller? Definir ANTES de la ruta paramétrica para evitar colisión
app.get('/api/reviews/can-review', async (req, res) => {
  try {
    const buyerId = String(req.query.buyerId || '')
    const sellerId = String(req.query.sellerId || '')
    if (!buyerId || !sellerId) return res.status(400).json({ allowed: false })
    const supabase = getServerSupabaseClient()
    // Existe contacto previo o recordatorio creado (por emisión inmediata)
    const { data: contacts } = await supabase
      .from('contact_events')
      .select('id')
      .eq('seller_id', sellerId)
      .eq('buyer_id', buyerId)
      .limit(1)
    let hasContact = Array.isArray(contacts) && contacts.length > 0
    if (!hasContact) {
      try {
        const { data: rems } = await supabase
          .from('review_reminders')
          .select('id')
          .eq('seller_id', sellerId)
          .eq('buyer_id', buyerId)
          .limit(1)
        hasContact = Array.isArray(rems) && rems.length > 0
      } catch (e) {
        hasContact = false
      }
    }
    if (!hasContact) return res.json({ allowed: false, reason: 'Primero contactá al vendedor (WhatsApp o email).' })
    const { data: existing } = await supabase
      .from('reviews')
      .select('id')
      .eq('seller_id', sellerId)
      .eq('buyer_id', buyerId)
      .limit(1)
    if (existing && existing.length > 0) return res.json({ allowed: false, reason: 'Ya publicaste una reseña.' })
    return res.json({ allowed: true })
  } catch (err) {
    console.warn('[reviews] can-review failed', err)
    return res.status(500).json({ allowed: false })
  }
})

// Devuelve reseñas + resumen por vendedor
app.get('/api/reviews/:sellerId', async (req, res) => {
  try {
    const { sellerId } = req.params
    const supabase = getServerSupabaseClient()
    // Intento 1: con columna status (nueva)
    let reviews = null
    let error = null
    try {
      const r1 = await supabase
        .from('reviews')
        .select('id,seller_id,buyer_id,listing_id,rating,tags,comment,created_at,status')
        .eq('seller_id', sellerId)
        .eq('status', 'published')
        .order('created_at', { ascending: false })
      reviews = r1.data
      error = r1.error
    } catch (e) {
      error = e
    }
    // Fallback: sin columna status (schema viejo)
    if (error) {
      console.warn('[reviews] fetch with status failed, falling back without status', error?.message || error)
      const r2 = await supabase
        .from('reviews')
        .select('id,seller_id,buyer_id,listing_id,rating,tags,comment,created_at')
        .eq('seller_id', sellerId)
        .order('created_at', { ascending: false })
      if (r2.error) return res.status(500).json({ error: 'fetch_failed' })
      reviews = r2.data
    }
    const list = Array.isArray(reviews) ? reviews : []
    // Enriquecer con nombre del comprador (Nombre + inicial del apellido) y avatar
    let byName = list
    try {
      const buyerIds = Array.from(new Set(list.map((r) => r.buyer_id).filter(Boolean)))
      if (buyerIds.length) {
        const { data: usersData } = await supabase
          .from('users')
          .select('id, full_name, avatar_url')
          .in('id', buyerIds)
        const nameMap = new Map((usersData || []).map((u) => [u.id, { name: u.full_name || null, avatar: u.avatar_url || null }]))
        byName = list.map((r) => {
          const meta = nameMap.get(r.buyer_id) || { name: null, avatar: null }
          const full = String(meta.name || '').trim()
          let label = 'Comprador verificado'
          if (full) {
            const parts = full.split(/\s+/).filter(Boolean)
            if (parts.length === 1) label = parts[0]
            else if (parts.length > 1) label = `${parts[0]} ${parts[1].charAt(0).toUpperCase()}.`
          }
          return { ...r, buyer_name: label, buyer_avatar_url: meta.avatar }
        })
      }
    } catch {}
    const count = byName.length
    const avgRating = count ? (byName.reduce((acc, r) => acc + (r.rating || 0), 0) / count) : 0
    // Distribución de calificaciones y conteo de etiquetas
    const dist = { 1: 0, 2: 0, 3: 0, 4: 0, 5: 0 }
    const tagsCount = {}
    for (const r of byName) {
      const rr = Number(r.rating || 0)
      if (rr >= 1 && rr <= 5) dist[rr] = (dist[rr] || 0) + 1
      if (Array.isArray(r.tags)) {
        for (const t of r.tags) {
          const key = String(t)
          tagsCount[key] = (tagsCount[key] || 0) + 1
        }
      }
    }
    return res.json({ reviews: byName, summary: { sellerId, count, avgRating, dist, tagsCount } })
  } catch (err) {
    console.warn('[reviews] fetch failed', err)
    return res.status(500).json({ error: 'unexpected_error' })
  }
})

  // ¿Puede buyer reseñar a seller? Requiere haber contactado (contact_events o review_reminders) y no haber reseñado antes
  app.get('/api/reviews/can-review', async (req, res) => {
    try {
      const buyerId = String(req.query.buyerId || '')
      const sellerId = String(req.query.sellerId || '')
      if (!buyerId || !sellerId) return res.status(400).json({ allowed: false })
      const supabase = getServerSupabaseClient()
    // Existe contacto previo o recordatorio creado (por emisión inmediata)
    const { data: contacts } = await supabase
      .from('contact_events')
      .select('id')
      .eq('seller_id', sellerId)
      .eq('buyer_id', buyerId)
      .limit(1)
    let hasContact = Array.isArray(contacts) && contacts.length > 0
    if (!hasContact) {
      try {
        const { data: rems } = await supabase
          .from('review_reminders')
          .select('id')
          .eq('seller_id', sellerId)
          .eq('buyer_id', buyerId)
          .limit(1)
        hasContact = Array.isArray(rems) && rems.length > 0
      } catch (e) {
        // Si la tabla aún no existe, ignorar y seguir con contact_events
        hasContact = false
      }
    }
    if (!hasContact) return res.json({ allowed: false, reason: 'Primero contactá al vendedor (WhatsApp o email).' })
      const { data: existing } = await supabase
        .from('reviews')
        .select('id')
        .eq('seller_id', sellerId)
        .eq('buyer_id', buyerId)
        .limit(1)
      if (existing && existing.length > 0) return res.json({ allowed: false, reason: 'Ya publicaste una reseña.' })
      return res.json({ allowed: true })
    } catch (err) {
      console.warn('[reviews] can-review failed', err)
      return res.status(500).json({ allowed: false })
    }
  })

// Publica reseña
app.post('/api/reviews/submit', async (req, res) => {
  try {
    const { sellerId, buyerId, listingId, rating, tags, comment } = req.body || {}
    if (!sellerId || !buyerId || !rating) return res.status(400).send('missing_fields')
    const r = Number(rating)
    if (!Number.isFinite(r) || r < 1 || r > 5) return res.status(400).send('invalid_rating')
    if (String(sellerId) === String(buyerId)) return res.status(400).send('not_allowed')
    const supabase = getServerSupabaseClient()
    // Validaciones server-side: única reseña por par y requiere al menos un contacto
    try {
      const { data: existing } = await supabase
        .from('reviews')
        .select('id')
        .eq('seller_id', sellerId)
        .eq('buyer_id', buyerId)
        .limit(1)
      if (existing && existing.length > 0) return res.status(400).send('not_allowed')
      const { data: contacts } = await supabase
        .from('contact_events')
        .select('id')
        .eq('seller_id', sellerId)
        .eq('buyer_id', buyerId)
        .limit(1)
      if (!contacts || contacts.length === 0) {
        // Fallback: permitir si existe un recordatorio emitido (misma regla que can-review)
        try {
          const { data: rems } = await supabase
            .from('review_reminders')
            .select('id')
            .eq('seller_id', sellerId)
            .eq('buyer_id', buyerId)
            .limit(1)
          const hasReminder = Array.isArray(rems) && rems.length > 0
          if (!hasReminder) return res.status(400).send('not_allowed')
        } catch (e) {
          return res.status(400).send('not_allowed')
        }
      }
    } catch (e) {
      // Si falla la verificación, negar por defecto
      return res.status(400).send('not_allowed')
    }
    // Sanitizar etiquetas a un set permitido
    const ALLOWED_TAGS = new Set([
      'atencion',
      'respetuoso',
      'buen_vendedor',
      'compre',
      // nuevas etiquetas
      'puntual',
      'buena_comunicacion',
      'recomendado',
    ])
    let safeTags = null
    if (Array.isArray(tags)) {
      const uniq = Array.from(new Set(tags.map((t) => String(t))))
      safeTags = uniq.filter((t) => ALLOWED_TAGS.has(t)).slice(0, 6)
      if (safeTags.length === 0) safeTags = null
    }
    const payload = {
      seller_id: sellerId,
      buyer_id: buyerId,
      listing_id: listingId || null,
      rating: r,
      tags: safeTags,
      comment: typeof comment === 'string' && comment.trim() ? String(comment).slice(0, 1000) : null,
      status: 'published',
    }
    const { error } = await supabase.from('reviews').insert([payload])
    if (error) return res.status(500).send('insert_failed')
    return res.json({ ok: true })
  } catch (err) {
    console.warn('[reviews] submit failed', err)
    return res.status(500).send('unexpected_error')
  }
})

/* ----------------------------- Dev / Test endpoints ---------------------- */
app.post('/api/dev/renewal-test/:id', async (req, res) => {
  try {
    if (process.env.ENABLE_DEV_ENDPOINTS !== 'true') return res.status(403).json({ error: 'forbidden' })
    const { id } = req.params
    const supabase = getServerSupabaseClient()
    const { data: listing } = await supabase
      .from('listings')
      .select('id,title,seller_id,expires_at')
      .eq('id', id)
      .maybeSingle()
    if (!listing) return res.status(404).json({ error: 'not_found' })
    const { data: profile } = await supabase
      .from('users')
      .select('id,email,full_name')
      .eq('id', listing.seller_id)
      .maybeSingle()
    if (!profile?.email) return res.status(400).json({ error: 'missing_email' })
    const baseFront = (process.env.FRONTEND_URL || '').split(',')[0]?.trim() || ''
    const highlightUrl = `${baseFront}/listing/${listing.id}/destacar`
    const expiresLabel = listing.expires_at ? new Date(listing.expires_at).toLocaleString('es-AR', { dateStyle: 'long', timeStyle: 'short' }) : 'pronto'
    await sendMail({
      from: process.env.SMTP_FROM || `Ciclo Market <${process.env.SMTP_USER}>`,
      to: profile.email,
      subject: `Tu publicación "${listing.title}" está por vencer (prueba)`,
      html: `<div style="font-family:Arial,sans-serif;line-height:1.6;color:#14212e;">
        <h2>Tu publicación está por vencer</h2>
        <p>Hola ${profile.full_name || 'vendedor'},</p>
        <p>Tu aviso <strong>${listing.title}</strong> vence el <strong>${expiresLabel}</strong>.</p>
        <div style="margin:16px 0;">
          <a href="${baseFront}/dashboard?tab=Publicaciones" style="display:inline-block;padding:10px 16px;background:#14212e;color:#fff;text-decoration:none;border-radius:8px;margin-right:8px;">Renovar publicación</a>
          <a href="${highlightUrl}" style="display:inline-block;padding:10px 16px;background:#2563eb;color:#fff;text-decoration:none;border-radius:8px;">Destacar ahora</a>
        </div>
        <p>(Este es un correo de prueba enviado bajo ENABLE_DEV_ENDPOINTS=true)</p>
      </div>`
    })
    return res.json({ ok: true })
  } catch (e) {
    console.error('[dev] renewal-test failed', e)
    return res.status(500).json({ error: 'unexpected_error' })
  }
})

// Preview sender for the renewal reminder email (uses the new template)
app.post('/api/dev/renewal-preview', async (req, res) => {
  try {
    if (process.env.ENABLE_DEV_ENDPOINTS !== 'true') return res.status(403).json({ error: 'forbidden' })
    const supabase = getServerSupabaseClient()
    const { to = 'admin@ciclomarket.ar', listingId = null, title = null, expiresInHours = 24 } = req.body || {}

    const baseFront = (process.env.FRONTEND_URL || '').split(',')[0]?.trim() || 'https://ciclomarket.ar'
    const cleanBase = baseFront.replace(/\/$/, '')

    let listingTitle = title || 'Tu bicicleta'
    let highlightUrl = `${cleanBase}/publicar`
    if (listingId) {
      const { data: listing } = await supabase
        .from('listings')
        .select('id,slug,title')
        .eq('id', listingId)
        .maybeSingle()
      if (listing) {
        listingTitle = listing.title || listingTitle
        const slugOrId = listing.slug || listing.id
        highlightUrl = `${cleanBase}/listing/${encodeURIComponent(slugOrId)}/destacar`
      }
    }

    const expiresDate = new Date(Date.now() + Number(expiresInHours) * 60 * 60 * 1000)
    const expiresLabel = expiresDate.toLocaleString('es-AR', { dateStyle: 'long', timeStyle: 'short' })
    const renewApiHint = `${cleanBase}/dashboard?tab=Publicaciones`
    const bikesUrl = `${cleanBase}/marketplace?cat=Ruta`
    const partsUrl = `${cleanBase}/marketplace?cat=Accesorios`
    const apparelUrl = `${cleanBase}/marketplace?cat=Indumentaria`

    if (!isMailConfigured()) return res.status(503).json({ error: 'mail_not_configured' })

    await sendMail({
      from: process.env.SMTP_FROM || `Ciclo Market <${process.env.SMTP_USER}>`,
      to,
      subject: `Tu publicación "${listingTitle}" está por vencer (preview)` ,
      html: `
      <div style="background:#ffffff;margin:0 auto;max-width:640px;font-family:Arial, sans-serif;color:#14212e">
        <table role="presentation" cellspacing="0" cellpadding="0" border="0" align="center" style="width:100%">
          <tr>
            <td style="padding:20px 24px;text-align:center">
              <img src="${cleanBase}/site-logo.png" alt="Ciclo Market" style="height:64px;width:auto;display:inline-block" />
            </td>
          </tr>
          <tr>
            <td style="background:#14212e;color:#fff;text-align:center;padding:10px 12px">
              <a href="${bikesUrl}" style="color:#fff;text-decoration:none;margin:0 10px;font-size:14px">Bicicletas</a>
              <a href="${partsUrl}" style="color:#fff;text-decoration:none;margin:0 10px;font-size:14px">Accesorios</a>
              <a href="${apparelUrl}" style="color:#fff;text-decoration:none;margin:0 10px;font-size:14px">Indumentaria</a>
            </td>
          </tr>
          <tr>
            <td style="padding:24px">
              <h2 style="margin:0 0 8px;font-size:20px;color:#0c1723">Tu publicación está por vencer</h2>
              <p style="margin:0 0 12px">Tu aviso <strong>${listingTitle}</strong> vence el <strong>${expiresLabel}</strong>.</p>
              <p style="margin:0 0 16px;text-align:center">
                <a href="${renewApiHint}" style="display:inline-block;padding:12px 18px;background:#14212e;color:#fff;text-decoration:none;border-radius:10px;margin-right:8px;font-weight:600">Renovar publicación</a>
                <a href="${highlightUrl}" style="display:inline-block;padding:12px 18px;background:#2563eb;color:#fff;text-decoration:none;border-radius:10px;font-weight:600">Destacar ahora</a>
              </p>
              <div style="margin-top:18px;padding:14px 16px;background:#f6f8fb;border:1px solid #e5ebf3;border-radius:10px">
                <h3 style="margin:0 0 8px;font-size:16px;color:#0c1723">Planes recomendados</h3>
                <ul style="margin:0;padding-left:18px;color:#374151">
                  <li style="margin:6px 0"><b>Básica</b>: 60 días de publicación, 7 días de destaque, botón de WhatsApp habilitado.</li>
                  <li style="margin:6px 0"><b>Premium</b>: 60 días de publicación, 14 días de destaque, WhatsApp + difusión en redes.</li>
                </ul>
              </div>
              <div style="margin-top:18px;padding:14px 16px;background:#fdfcf8;border:1px solid #f0e6c3;border-radius:10px">
                <h3 style="margin:0 0 8px;font-size:16px;color:#0c1723">Preguntas y respuestas</h3>
                <p style="margin:0 0 8px;color:#374151">Respondé rápido las consultas para mejorar tu conversión. Las respuestas ayudan a todos los interesados.</p>
                <p style="margin:0;color:#6b7280;font-size:12px">Consejo: habilitá el botón de WhatsApp con un plan destacado para cerrar ventas más rápido.</p>
              </div>
              <p style="margin:16px 0 0;font-size:12px;color:#6b7280">Si los botones no funcionan, ingresá a tu panel: <a href="${renewApiHint}" style="color:#0c72ff;text-decoration:underline">${renewApiHint}</a></p>
            </td>
          </tr>
        </table>
      </div>
      `
    })
    return res.json({ ok: true })
  } catch (e) {
    console.error('[dev] renewal-preview failed', e)
    return res.status(500).json({ error: 'unexpected_error' })
  }
})

// Preview: store analytics email (weekly summary for stores)
app.post('/api/dev/store-analytics-preview', async (req, res) => {
  try {
    if (process.env.ENABLE_DEV_ENDPOINTS !== 'true') return res.status(403).json({ error: 'forbidden' })
    if (!isMailConfigured()) return res.status(503).json({ error: 'mail_not_configured' })

    const supabase = getServerSupabaseClient()
  const { to = 'admin@ciclomarket.ar', storeUserId = null } = req.body || {}

    const baseFront = (process.env.FRONTEND_URL || '').split(',')[0]?.trim() || 'https://ciclomarket.ar'
    const cleanBase = baseFront.replace(/\/$/, '')
    const dashboardUrl = `${cleanBase}/dashboard?tab=${encodeURIComponent('Analítica')}`

    let userId = (typeof storeUserId === 'string' && storeUserId.trim()) ? storeUserId.trim() : null
    let storeName = ''
    if (!userId && to) {
      const { data: u } = await supabase.from('users').select('id, store_name').eq('email', to).maybeSingle()
      if (u?.id) { userId = u.id; storeName = u.store_name || '' }
    } else if (userId) {
      const { data: u } = await supabase.from('users').select('store_name').eq('id', userId).maybeSingle()
      if (u) storeName = u.store_name || ''
    }
    if (!userId) return res.status(400).json({ error: 'store_user_id_required' })

    // Pull summary rows (30d)
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
      // Fallback: computar agregados directo desde events (últimos 30 días)
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

    const { html, text } = buildStoreAnalyticsHTML({
      baseFront: cleanBase,
      storeName,
      periodLabel: 'últimos 30 días',
      summary: summary || { store_views: 0, listing_views: 0, wa_clicks: 0 },
      topListings: topRows,
      dashboardUrl,
      unsubscribeLink: `${cleanBase}/ayuda`,
    })

    await sendMail({
      from: process.env.SMTP_FROM || `Ciclo Market <${process.env.SMTP_USER || 'no-reply@ciclomarket.ar'}>`,
      to,
      subject: 'Resumen de tu tienda (30 días) · Ciclo Market',
      html,
      text,
    })

    return res.json({ ok: true, html, text })
  } catch (e) {
    console.error('[dev] store-analytics-preview failed', e)
    return res.status(500).json({ error: 'unexpected_error' })
  }
})

async function resolveUserEmail(supabase, userId) {
  if (!userId) return null
  try {
    const { data, error } = await supabase.auth.admin.getUserById(userId)
    if (error) {
      console.warn('[questions] resolveUserEmail failed', error)
      return null
    }
    return data?.user?.email ?? null
  } catch (err) {
    console.warn('[questions] resolveUserEmail unexpected error', err)
    return null
  }
}

app.post('/api/questions/notify', async (req, res) => {
  const rawEvent = typeof req.body?.event === 'string' ? req.body.event.toLowerCase() : ''
  const event = rawEvent
  const questionId = req.body?.questionId

  const allowed = new Set(['asked','answered','moderator_deleted_question','moderator_cleared_answer'])
  if (!questionId || !allowed.has(event)) {
    return res.status(400).json({ error: 'invalid_request' })
  }

  let supabase
  try {
    supabase = getServerSupabaseClient()
  } catch (error) {
    console.warn('[questions] supabase client unavailable', error)
    return res.status(500).json({ error: 'supabase_unavailable' })
  }

  const { data: question, error: fetchError } = await supabase
    .from('listing_questions')
    .select(
      `
        id,
        listing_id,
        question_body,
        answer_body,
        created_at,
        answered_at,
        asker_id,
        answerer_id,
        listing:listing_id (
          id,
          slug,
          title,
          seller_id,
          seller_name,
          seller_email
        )
      `
    )
    .eq('id', questionId)
    .maybeSingle()

  if (fetchError) {
    console.warn('[questions] fetch failed', fetchError)
    return res.status(500).json({ error: 'fetch_failed' })
  }
  if (!question) {
    return res.status(404).json({ error: 'question_not_found' })
  }

  const listing = question.listing || {}
  const listingTitle = listing.title || 'tu publicación'
  const baseFront =
    (process.env.FRONTEND_URL || '').split(',').map((s) => s.trim()).filter(Boolean)[0] || 'https://ciclomarket.ar'
  const cleanBase = baseFront.replace(/\/$/, '')
  const listingSlug = listing.slug || listing.id
  const listingUrl = listingSlug ? `${cleanBase}/listing/${encodeURIComponent(listingSlug)}` : cleanBase
  const from = process.env.SMTP_FROM || `Ciclo Market <${process.env.SMTP_USER}>`
  const bikesUrl = `${cleanBase}/marketplace?cat=Ruta`
  const partsUrl = `${cleanBase}/marketplace?cat=Accesorios`
  const apparelUrl = `${cleanBase}/marketplace?cat=Indumentaria`

  async function resolveUserFullName(userId) {
    if (!userId) return null
    try {
      const { data, error } = await supabase
        .from('users')
        .select('full_name')
        .eq('id', userId)
        .maybeSingle()
      if (error) return null
      const name = typeof data?.full_name === 'string' ? data.full_name.trim() : ''
      return name || null
    } catch (_) {
      return null
    }
  }

  // No incluimos imagen del listing en el email por diseño

  const createNotification = async ({
    userId,
    title,
    body,
    cta,
    metadata,
    actorId,
  }) => {
    if (!userId) return
    try {
      const insertPayload = {
        user_id: userId,
        type: 'question',
        title,
        body,
        metadata,
        cta_url: cta,
      }
      if (actorId) insertPayload.actor_id = actorId

      const { error: insertError } = await supabase
        .from('notifications')
        .insert(insertPayload)
      if (insertError) {
        console.warn('[questions] notification insert failed', insertError)
      }
    } catch (notificationError) {
      console.warn('[questions] notification insert failed', notificationError)
    }
  }

  if (event === 'asked') {
    const sellerEmail = listing.seller_email || (await resolveUserEmail(supabase, listing.seller_id))
    if (!sellerEmail) {
      return res.status(404).json({ error: 'seller_email_not_found' })
    }

    const sellerName = escapeHtml(listing.seller_name || 'vendedor')
    const safeQuestion = escapeHtml(question.question_body || '').replace(/\n/g, '<br />')
    const logoUrl = `${cleanBase}/site-logo.png`
    const askerResolved = await resolveUserFullName(question.asker_id)
    const askerName = escapeHtml(askerResolved || 'un interesado')
    const html = `
      <div style="background:#ffffff;margin:0 auto;max-width:600px;font-family:Arial, sans-serif;color:#14212e">
        <table role="presentation" cellspacing="0" cellpadding="0" border="0" align="center" style="width:100%">
          <tr>
            <td style="padding:20px 24px;text-align:center">
              <img src="${logoUrl}" alt="Ciclo Market" style="height:64px;width:auto;display:inline-block" />
            </td>
          </tr>
          <tr>
            <td style="background:#14212e;color:#fff;text-align:center;padding:12px">
              <a href="${bikesUrl}" style="color:#fff;text-decoration:none;margin:0 10px;font-size:14px">Bicicletas</a>
              <a href="${partsUrl}" style="color:#fff;text-decoration:none;margin:0 10px;font-size:14px">Accesorios</a>
              <a href="${apparelUrl}" style="color:#fff;text-decoration:none;margin:0 10px;font-size:14px">Indumentaria</a>
            </td>
          </tr>
          <tr>
            <td style="padding:24px">
              <h2 style="margin:0 0 8px;font-size:20px;color:#0c1723">Tenés una nueva consulta sobre ${escapeHtml(listingTitle)}</h2>
              <p style="margin:0 0 8px">Hola ${sellerName},</p>
              <p style="margin:0 0 12px">Respondé desde la publicación para que todos los interesados vean la respuesta.</p>
              <p style="margin:0 0 16px;text-align:center">
                <a href="${listingUrl}" style="display:inline-block;padding:12px 18px;background:#14212e;color:#fff;text-decoration:none;border-radius:8px;font-weight:600">Ver publicación</a>
              </p>
              <p style="margin:0 0 8px">Recibiste un mensaje de <b>${askerName}</b>:</p>
              <blockquote style="margin:12px 0;padding:12px 16px;border-left:4px solid #0c72ff;background:#f3f6fb;border-radius:6px">${safeQuestion}</blockquote>
              <p style="font-size:12px;color:#6b7280;margin:16px 0 0">Si el botón no funciona, copiá y pegá este enlace: <a href="${listingUrl}" style="color:#0c72ff;text-decoration:underline">${listingUrl}</a></p>
            </td>
          </tr>
          <tr>
            <td style="padding:8px 24px">
              <table role="presentation" width="100%" cellspacing="0" cellpadding="0" style="text-align:center">
                <tr>
                  <td style="padding:10px">
                    <div style="font-size:14px;color:#0c1723;font-weight:600">Registrate</div>
                    <div style="font-size:12px;color:#475569">Creá tu cuenta en minutos.</div>
                  </td>
                  <td style="padding:10px">
                    <div style="font-size:14px;color:#0c1723;font-weight:600">Publicá</div>
                    <div style="font-size:12px;color:#475569">Subí tu bici y elegí un plan.</div>
                  </td>
                  <td style="padding:10px">
                    <div style="font-size:14px;color:#0c1723;font-weight:600">Vende seguro</div>
                    <div style="font-size:12px;color:#475569">Coordiná con soporte y notificaciones.</div>
                  </td>
                </tr>
              </table>
            </td>
          </tr>
          <tr>
            <td style="padding:16px 24px;border-top:1px solid #e1e5eb">
              <div style="font-size:16px;margin:0 0 6px;color:#0c1723"><b>¿Tenés consultas?</b></div>
              <div style="font-size:14px;color:#475569;margin:0">Nuestro equipo está listo para ayudarte. Respondé este correo con tu consulta.</div>
            </td>
          </tr>
          <tr>
            <td style="padding:16px 24px;background:#f6f8fb">
              <div style="font-size:14px;color:#0c1723;margin:0 0 8px"><b>Seguinos</b></div>
              <div style="font-size:13px;color:#475569;line-height:1.6">
                Instagram: <a href="https://instagram.com/ciclomarket.ar" style="color:#0c72ff;text-decoration:underline">@ciclomarket.ar</a><br />
                Strava: <a href="https://www.strava.com/clubs/1770147" style="color:#0c72ff;text-decoration:underline">ciclomarket en Strava</a>
              </div>
            </td>
          </tr>
        </table>
      </div>
    `

    const text = [
      `Tenés una nueva consulta sobre ${listingTitle}`,
      `Pregunta: ${question.question_body}`,
      `Respondé desde: ${listingUrl}`,
    ].join('\n')

    let emailStatus = 'skipped'
    if (isMailConfigured()) {
      try {
        console.info('[questions] sending email to seller', {
          listingId: listing.id,
          sellerId: listing.seller_id,
          sellerEmail,
        })
        await sendMail({
          from,
          to: sellerEmail,
          subject: `Nueva consulta sobre ${listingTitle}`,
          text,
          html,
        })
        emailStatus = 'sent'
      } catch (mailError) {
        emailStatus = 'failed'
        console.warn('[questions] email to seller failed', {
          message: mailError?.message,
          code: mailError?.code,
          command: mailError?.command,
        })
      }
    }

    await createNotification({
      userId: listing.seller_id,
      title: `Nueva consulta en ${listingTitle}`,
      body: (question.question_body || '').slice(0, 160),
      cta: listingUrl,
      metadata: {
        question_id: question.id,
        listing_id: listing.id,
        event: 'asked',
      },
      actorId: question.asker_id,
    })

    return res.json({ ok: true, email: emailStatus })
  }

  if (event === 'answered') {
    if (!question.answer_body) {
      return res.status(400).json({ error: 'missing_answer' })
    }
    const buyerEmail = await resolveUserEmail(supabase, question.asker_id)
    if (!buyerEmail) {
      return res.status(404).json({ error: 'buyer_email_not_found' })
    }

    const safeQuestion = escapeHtml(question.question_body || '').replace(/\n/g, '<br />')
    const safeAnswer = escapeHtml(question.answer_body || '').replace(/\n/g, '<br />')
    const logoUrl = `${cleanBase}/site-logo.png`
    const html = `
      <div style="background:#ffffff;margin:0 auto;max-width:600px;font-family:Arial, sans-serif;color:#14212e">
        <table role="presentation" cellspacing="0" cellpadding="0" border="0" align="center" style="width:100%">
          <tr>
            <td style="padding:20px 24px;text-align:center">
              <img src="${logoUrl}" alt="Ciclo Market" style="height:64px;width:auto;display:inline-block" />
            </td>
          </tr>
          <tr>
            <td style="background:#14212e;color:#fff;text-align:center;padding:12px">
              <a href="${bikesUrl}" style="color:#fff;text-decoration:none;margin:0 10px;font-size:14px">Bicicletas</a>
              <a href="${partsUrl}" style="color:#fff;text-decoration:none;margin:0 10px;font-size:14px">Accesorios</a>
              <a href="${apparelUrl}" style="color:#fff;text-decoration:none;margin:0 10px;font-size:14px">Indumentaria</a>
            </td>
          </tr>
          <tr>
            <td style="padding:24px">
              <h2 style="margin:0 0 8px;font-size:20px;color:#0c1723">El vendedor respondió tu consulta</h2>
              <p style="margin:0 0 12px">Podés ver la respuesta completa desde la publicación.</p>
              <p style="margin:0 0 16px;text-align:center">
                <a href="${listingUrl}" style="display:inline-block;padding:12px 18px;background:#14212e;color:#fff;text-decoration:none;border-radius:8px;font-weight:600">Ver publicación</a>
              </p>
              <p style="margin:0 0 8px">Consulta original:</p>
              <blockquote style="margin:12px 0;padding:12px 16px;border-left:4px solid #94a3b8;background:#f8fafc;border-radius:6px">${safeQuestion}</blockquote>
              <p style="margin:8px 0 8px">Respuesta del vendedor:</p>
              <blockquote style="margin:12px 0;padding:12px 16px;border-left:4px solid #10b981;background:#ecfdf5;border-radius:6px">${safeAnswer}</blockquote>
              <p style="font-size:12px;color:#6b7280;margin:16px 0 0">Si el botón no funciona, copiá y pegá este enlace: <a href="${listingUrl}" style="color:#0c72ff;text-decoration:underline">${listingUrl}</a></p>
            </td>
          </tr>
          <tr>
            <td style="padding:8px 24px">
              <table role="presentation" width="100%" cellspacing="0" cellpadding="0" style="text-align:center">
                <tr>
                  <td style="padding:10px">
                    <div style="font-size:14px;color:#0c1723;font-weight:600">Registrate</div>
                    <div style="font-size:12px;color:#475569">Creá tu cuenta en minutos.</div>
                  </td>
                  <td style="padding:10px">
                    <div style="font-size:14px;color:#0c1723;font-weight:600">Publicá</div>
                    <div style="font-size:12px;color:#475569">Subí tu bici y elegí un plan.</div>
                  </td>
                  <td style="padding:10px">
                    <div style="font-size:14px;color:#0c1723;font-weight:600">Vende seguro</div>
                    <div style="font-size:12px;color:#475569">Coordiná con soporte y notificaciones.</div>
                  </td>
                </tr>
              </table>
            </td>
          </tr>
          <tr>
            <td style="padding:16px 24px;border-top:1px solid #e1e5eb">
              <div style="font-size:16px;margin:0 0 6px;color:#0c1723"><b>¿Tenés consultas?</b></div>
              <div style="font-size:14px;color:#475569;margin:0">Nuestro equipo está listo para ayudarte. Respondé este correo con tu consulta.</div>
            </td>
          </tr>
          <tr>
            <td style="padding:16px 24px;background:#f6f8fb">
              <div style="font-size:14px;color:#0c1723;margin:0 0 8px"><b>Seguinos</b></div>
              <div style="font-size:13px;color:#475569;line-height:1.6">
                Instagram: <a href="https://instagram.com/ciclomarket.ar" style="color:#0c72ff;text-decoration:underline">@ciclomarket.ar</a><br />
                Strava: <a href="https://www.strava.com/clubs/1770147" style="color:#0c72ff;text-decoration:underline">ciclomarket en Strava</a>
              </div>
            </td>
          </tr>
        </table>
      </div>
    `

    const text = [
      'El vendedor respondió tu consulta:',
      `Pregunta: ${question.question_body}`,
      `Respuesta: ${question.answer_body}`,
      `Ver publicación: ${listingUrl}`,
    ].join('\n')

    let emailStatus = 'skipped'
    if (isMailConfigured()) {
      try {
        console.info('[questions] sending email to buyer', {
          listingId: listing.id,
          buyerId: question.asker_id,
          buyerEmail,
        })
        await sendMail({
          from,
          to: buyerEmail,
          subject: `${listingTitle}: el vendedor respondió tu consulta`,
          text,
          html,
        })
        emailStatus = 'sent'
      } catch (mailError) {
        emailStatus = 'failed'
        console.warn('[questions] email to buyer failed', {
          message: mailError?.message,
          code: mailError?.code,
          command: mailError?.command,
        })
      }
    }

    await createNotification({
      userId: question.asker_id,
      title: `Respuesta sobre ${listingTitle}`,
      body: (question.answer_body || '').slice(0, 160),
      cta: listingUrl,
      metadata: {
        question_id: question.id,
        listing_id: listing.id,
        event: 'answered',
      },
      actorId: question.answerer_id || listing.seller_id,
    })

    return res.json({ ok: true, email: emailStatus })
  }

  if (event === 'moderator_deleted_question') {
    // Notifica al comprador (asker) que su consulta fue eliminada
    const buyerEmail = await resolveUserEmail(supabase, question.asker_id)
    const html = `
      <div style="background:#ffffff;margin:0 auto;max-width:600px;font-family:Arial, sans-serif;color:#14212e">
        <table role="presentation" cellspacing="0" cellpadding="0" border="0" align="center" style="width:100%">
          <tr>
            <td style="padding:20px 24px;text-align:center">
              <img src="${cleanBase}/site-logo.png" alt="Ciclo Market" style="height:64px;width:auto;display:inline-block" />
            </td>
          </tr>
          <tr>
            <td style="padding:24px">
              <h2 style="margin:0 0 8px;font-size:20px;color:#0c1723">Un moderador eliminó tu consulta</h2>
              <p style="margin:0 0 12px">Tu consulta en “${escapeHtml(listingTitle)}” fue eliminada porque no cumple con nuestras bases y condiciones.</p>
              <p style="margin:0 0 12px">Si tenés dudas, escribinos a <a href="mailto:admin@ciclomarket.ar" style="color:#0c72ff;text-decoration:underline">admin@ciclomarket.ar</a>.</p>
              <p style="margin:0 0 16px;text-align:center">
                <a href="${listingUrl}" style="display:inline-block;padding:12px 18px;background:#14212e;color:#fff;text-decoration:none;border-radius:8px;font-weight:600">Ver publicación</a>
              </p>
            </td>
          </tr>
        </table>
      </div>
    `
    const text = [
      'Un moderador eliminó tu consulta',
      `Publicación: ${listingTitle}`,
      `Ver: ${listingUrl}`,
      'Contacto: admin@ciclomarket.ar'
    ].join('\n')

    let emailStatus = 'skipped'
    if (isMailConfigured() && buyerEmail) {
      try {
        await sendMail({ from, to: buyerEmail, subject: `Consulta eliminada en ${listingTitle}`, html, text })
        emailStatus = 'sent'
      } catch (e) {
        console.warn('[questions] moderator delete email failed', e)
        emailStatus = 'failed'
      }
    }

    await createNotification({
      userId: question.asker_id,
      title: `Consulta eliminada en ${listingTitle}`,
      body: 'Un moderador eliminó tu consulta por incumplir las reglas.',
      cta: listingUrl,
      metadata: { question_id: question.id, listing_id: listing.id, event: 'moderator_deleted_question' },
      actorId: listing.seller_id,
    })

    return res.json({ ok: true, email: emailStatus })
  }

  if (event === 'moderator_cleared_answer') {
    // Notifica al vendedor que se eliminó su respuesta
    const sellerEmail = listing.seller_email || (await resolveUserEmail(supabase, listing.seller_id))
    const html = `
      <div style="background:#ffffff;margin:0 auto;max-width:600px;font-family:Arial, sans-serif;color:#14212e">
        <table role="presentation" cellspacing="0" cellpadding="0" border="0" align="center" style="width:100%">
          <tr>
            <td style="padding:20px 24px;text-align:center">
              <img src="${cleanBase}/site-logo.png" alt="Ciclo Market" style="height:64px;width:auto;display:inline-block" />
            </td>
          </tr>
          <tr>
            <td style="padding:24px">
              <h2 style="margin:0 0 8px;font-size:20px;color:#0c1723">Un moderador eliminó tu respuesta</h2>
              <p style="margin:0 0 12px">Tu respuesta en “${escapeHtml(listingTitle)}” fue eliminada porque no cumple con nuestras bases y condiciones.</p>
              <p style="margin:0 0 12px">Si tenés dudas, escribinos a <a href="mailto:admin@ciclomarket.ar" style="color:#0c72ff;text-decoration:underline">admin@ciclomarket.ar</a>.</p>
              <p style="margin:0 0 16px;text-align:center">
                <a href="${listingUrl}" style="display:inline-block;padding:12px 18px;background:#14212e;color:#fff;text-decoration:none;border-radius:8px;font-weight:600">Ver publicación</a>
              </p>
            </td>
          </tr>
        </table>
      </div>
    `
    const text = [
      'Un moderador eliminó tu respuesta',
      `Publicación: ${listingTitle}`,
      `Ver: ${listingUrl}`,
      'Contacto: admin@ciclomarket.ar'
    ].join('\n')

    let emailStatus = 'skipped'
    if (isMailConfigured() && sellerEmail) {
      try {
        await sendMail({ from, to: sellerEmail, subject: `Respuesta eliminada en ${listingTitle}`, html, text })
        emailStatus = 'sent'
      } catch (e) {
        console.warn('[questions] moderator clear email failed', e)
        emailStatus = 'failed'
      }
    }

    await createNotification({
      userId: listing.seller_id,
      title: `Respuesta eliminada en ${listingTitle}`,
      body: 'Un moderador eliminó tu respuesta por incumplir las reglas.',
      cta: listingUrl,
      metadata: { question_id: question.id, listing_id: listing.id, event: 'moderator_cleared_answer' },
      actorId: question.asker_id,
    })

    return res.json({ ok: true, email: emailStatus })
  }

  return res.status(400).json({ error: 'unsupported_event' })
})

/* ----------------------------- Verification requests ---------------------- */
app.post('/api/verification/request', async (req, res) => {
  try {
    const { name, instagram, phone, email, message, attachments } = req.body || {}
    if (!name || !email || !message) {
      return res.status(400).json({ error: 'missing_fields' })
    }
    if (!isMailConfigured()) {
      return res.status(503).json({ error: 'mail_not_configured' })
    }
    const adminTo = process.env.VERIFICATION_INBOX || 'admin@ciclomarket.ar'
    const safeMsg = String(message || '').slice(0, 4000)
    const attachList = Array.isArray(attachments) ? attachments.filter((u) => typeof u === 'string' && /^https?:\/\//i.test(u)) : []
    const listItems = attachList.map((u) => `<li><a href="${u}" style="color:#0c72ff">${u}</a></li>`).join('')
    const html = `
      <div style="font-family:Arial,sans-serif;line-height:1.6;color:#14212e">
        <h2>Solicitud de verificación</h2>
        <p><b>Nombre:</b> ${escapeHtml(name)}</p>
        ${instagram ? `<p><b>Instagram:</b> ${escapeHtml(instagram)}</p>` : ''}
        ${phone ? `<p><b>Teléfono:</b> ${escapeHtml(phone)}</p>` : ''}
        <p><b>Email:</b> ${escapeHtml(email)}</p>
        <p><b>Mensaje:</b><br />${escapeHtml(safeMsg).replace(/\n/g,'<br />')}</p>
        ${attachList.length ? `<p><b>Adjuntos (${attachList.length}):</b><ul>${listItems}</ul></p>` : ''}
        <hr style="margin:16px 0;border:none;border-top:1px solid #e1e5eb" />
        <p style="font-size:12px;color:#6b7280">Este correo fue generado desde el panel del vendedor.</p>
      </div>
    `
    const text = [
      'Solicitud de verificación',
      `Nombre: ${name}`,
      instagram ? `Instagram: ${instagram}` : null,
      phone ? `Teléfono: ${phone}` : null,
      `Email: ${email}`,
      '',
      'Mensaje:',
      safeMsg,
      '',
      attachList.length ? `Adjuntos:\n${attachList.join('\n')}` : null,
    ].filter(Boolean).join('\n')

    await sendMail({
      from: process.env.SMTP_FROM || `Ciclo Market <${process.env.SMTP_USER || 'no-reply@ciclomarket.ar'}>`,
      to: adminTo,
      subject: 'Solicitud de verificación de vendedor',
      text,
      html,
      headers: email ? { 'Reply-To': email } : undefined,
    })
    return res.json({ ok: true })
  } catch (err) {
    console.error('[verification] request failed', err)
    return res.status(500).json({ error: 'unexpected_error' })
  }
})

/* ----------------------------- Newsletter (Resend Audience) --------------- */
// Env required: RESEND_API_KEY, RESEND_AUDIENCE_GENERAL_ID
app.post('/api/newsletter/subscribe', async (req, res) => {
  try {
    const apiKey = process.env.RESEND_API_KEY
    const audienceId = process.env.RESEND_AUDIENCE_GENERAL_ID
    if (!apiKey || !audienceId) {
      return res.status(503).json({ ok: false, error: 'newsletter_not_configured' })
    }
    const { email, name, audienceId: overrideAudience, hp } = req.body || {}
    // Honeypot: si viene relleno, ignorar silenciosamente
    if (typeof hp === 'string' && hp.trim()) {
      return res.json({ ok: true })
    }
    const trimmedEmail = typeof email === 'string' ? email.trim() : ''
    if (!trimmedEmail || !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(trimmedEmail)) {
      return res.status(400).json({ ok: false, error: 'invalid_email' })
    }
    const firstName = typeof name === 'string' ? name.trim() : ''
    const audience = (typeof overrideAudience === 'string' && /[0-9a-fA-F-]{36}/.test(overrideAudience))
      ? overrideAudience
      : audienceId

    const resp = await fetch(`https://api.resend.com/audiences/${encodeURIComponent(audience)}/contacts`, {
      method: 'POST',
      headers: {
        Authorization: `Bearer ${apiKey}`,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({
        email: trimmedEmail,
        first_name: firstName || undefined,
        unsubscribed: false,
      }),
    })
    const data = await resp.json().catch(() => ({}))
    if (!resp.ok) {
      const code = data?.error?.code || data?.name
      const message = data?.error?.message || data?.message || 'resend_error'
      return res.status(502).json({ ok: false, error: message, code })
    }
    return res.json({ ok: true })
  } catch (err) {
    console.error('[newsletter] subscribe failed', err)
    return res.status(500).json({ ok: false, error: 'unexpected_error' })
  }
})

/* ----------------------------- Newsletter: send latest -------------------- */
// Admin-triggered endpoint: env CRON_SECRET as simple auth (header: x-cron-secret)
// Sends an email to the configured Resend audience with the latest 3 listings
app.post('/api/newsletter/send-latest', async (req, res) => {
  try {
    const secret = String(req.headers['x-cron-secret'] || '')
    if (!secret || secret !== String(process.env.CRON_SECRET || '')) {
      return res.status(401).json({ ok: false, error: 'unauthorized' })
    }
    const sent = await runDigestOnce()
    return res.json({ ok: true, sent: sent ?? null })
  } catch (err) {
    console.error('[newsletter] send-latest failed', err)
    return res.status(500).json({ ok: false, error: 'unexpected_error' })
  }
})

/* ----------------------------- Newsletter: unsubscribe -------------------- */
app.get('/api/newsletter/unsubscribe', async (req, res) => {
  try {
    const apiKey = process.env.RESEND_API_KEY
    const audienceId = process.env.RESEND_AUDIENCE_GENERAL_ID
    if (!apiKey || !audienceId) {
      res.status(503)
      return res.send('<!doctype html><title>No disponible</title><p>Newsletter no configurado.</p>')
    }
    const email = String(req.query.e || '').trim()
    const token = String(req.query.t || '').trim()
    if (!email || !token) {
      res.status(400)
      return res.send('<!doctype html><title>Solicitud inválida</title><p>Faltan parámetros.</p>')
    }
    const secret = String(process.env.NEWSLETTER_UNSUB_SECRET || process.env.CRON_SECRET || '')
    const expected = require('crypto').createHmac('sha256', secret).update(email).digest('base64url')
    if (token !== expected) {
      res.status(401)
      return res.send('<!doctype html><title>No autorizado</title><p>Token inválido.</p>')
    }

    // Buscar contacto por email para obtener su ID
    const listRes = await fetch(`https://api.resend.com/audiences/${encodeURIComponent(audienceId)}/contacts`, {
      headers: { Authorization: `Bearer ${apiKey}` },
    })
    const listData = await listRes.json().catch(() => ({}))
    const contacts = Array.isArray(listData.data || listData.contacts) ? (listData.data || listData.contacts) : []
    const match = contacts.find((c) => String(c.email).toLowerCase() === email.toLowerCase())
    if (!match) {
      // Ya no está o nunca estuvo: mostrar estado ok
      return res.send('<!doctype html><title>Desuscripción</title><p>Tu correo ya no recibe nuestras novedades. Gracias.</p>')
    }
    // Eliminar el contacto (o podríamos marcar unsubscribed si hubiera endpoint de update)
    const delRes = await fetch(`https://api.resend.com/audiences/${encodeURIComponent(audienceId)}/contacts/${encodeURIComponent(match.id)}`, {
      method: 'DELETE',
      headers: { Authorization: `Bearer ${apiKey}` },
    })
    if (!delRes.ok) {
      const data = await delRes.json().catch(() => ({}))
      console.warn('[newsletter] unsubscribe delete failed', data)
    }
    return res.send('<!doctype html><title>Desuscripción</title><p>Listo, te desuscribimos correctamente. ¡Gracias!</p>')
  } catch (err) {
    console.error('[newsletter] unsubscribe failed', err)
    res.status(500)
    return res.send('<!doctype html><title>Error</title><p>No pudimos procesar la desuscripción. Intentá más tarde.</p>')
  }
})

/* ----------------------------- Mercado Pago -------------------------------- */
const accessToken = process.env.MERCADOPAGO_ACCESS_TOKEN
if (!accessToken) {
  console.warn('[checkout] MERCADOPAGO_ACCESS_TOKEN not configured – payments will fail.')
}
const mpClient = new MercadoPagoConfig({ accessToken: accessToken || '' })
const preferenceClient = new Preference(mpClient)

const PLAN_CODE_ALIASES = {
  free: 'free',
  gratis: 'free',
  basic: 'basic',
  basica: 'basic',
  featured: 'basic',
  destacada: 'basic',
  premium: 'premium',
  pro: 'premium',
}
const PLAN_CODES = new Set(['free', 'basic', 'premium'])

function normalisePlanCode(value) {
  if (!value) return null
  const key = String(value)
    .toLowerCase()
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
  if (PLAN_CODE_ALIASES[key]) return PLAN_CODE_ALIASES[key]
  if (PLAN_CODES.has(key)) return key
  return null
}

function fallbackPriceFor(code) {
  if (!code) return 0
  const envKey = code === 'basic' ? 'BASIC_PLAN_PRICE' : code === 'premium' ? 'PREMIUM_PLAN_PRICE' : 'FREE_PLAN_PRICE'
  const fromEnv = envKey && process.env[envKey] ? Number(process.env[envKey]) : 0
  if (Number.isFinite(fromEnv) && fromEnv > 0) return Math.round(fromEnv)
  if (code === 'premium') return 13000
  if (code === 'basic') return 9000
  return 0
}

async function userIsModerator(userId, clientOverride) {
  if (!userId) return false
  let client = clientOverride || null
  if (!client) {
    try {
      client = supabaseService || getServerSupabaseClient()
    } catch {
      return false
    }
  }
  try {
    const { data, error } = await client
      .from('user_roles')
      .select('role')
      .eq('user_id', userId)
      .maybeSingle()
    if (error) return false
    return data?.role === 'moderator' || data?.role === 'admin'
  } catch {
    return false
  }
}

function normalizeWhatsappForStorage(raw) {
  if (!raw) return null
  const digits = String(raw).match(/\d+/g)
  if (!digits) return null
  let normalized = digits.join('')
  normalized = normalized.replace(/^00+/, '')
  normalized = normalized.replace(/^0+/, '')
  if (!normalized) return null
  if (!normalized.startsWith('54')) normalized = `54${normalized}`
  return normalized
}

function ensureWhatsappInContactMethods(methods) {
  const base = Array.isArray(methods) ? methods.filter(Boolean).map((m) => String(m)) : []
  const set = new Set(base)
  if (!set.has('email')) set.add('email')
  if (!set.has('chat')) set.add('chat')
  set.add('whatsapp')
  return Array.from(set)
}

async function applyCheckoutUpgrade({
  planCode,
  listingId,
  listingSlug,
  userId,
  providerRef,
  preferenceId
}) {
  if (!supabaseService) return { ok: false, reason: 'service_unavailable' }
  const targetPlan = normalisePlanCode(planCode)
  if (targetPlan !== 'basic' && targetPlan !== 'premium') {
    return { ok: false, reason: 'invalid_plan' }
  }

  const supabase = supabaseService
  const targetUserId = userId ? String(userId) : null
  let creditRow = null

  try {
    if (providerRef) {
      const { data } = await supabase
        .from('publish_credits')
        .select('id,status,listing_id,used_at')
        .eq('provider_ref', String(providerRef))
        .eq('provider', 'mercadopago')
        .maybeSingle()
      creditRow = data || null
      if (creditRow && creditRow.status === 'used' && creditRow.listing_id) {
        return { ok: true, reason: 'already_applied' }
      }
    }
    if (!creditRow && preferenceId) {
      const { data } = await supabase
        .from('publish_credits')
        .select('id,status,listing_id,used_at')
        .eq('preference_id', String(preferenceId))
        .eq('provider', 'mercadopago')
        .maybeSingle()
      creditRow = data || null
      if (creditRow && creditRow.status === 'used' && creditRow.listing_id) {
        return { ok: true, reason: 'already_applied' }
      }
    }
  } catch (lookupErr) {
    console.warn('[upgrade/checkout] credit lookup failed', lookupErr?.message || lookupErr)
  }

  let targetListingId = listingId ? String(listingId) : null
  let listing = null

  try {
    if (targetListingId) {
      const { data } = await supabase
        .from('listings')
        .select('id,seller_id,plan,plan_code,seller_plan,expires_at,highlight_expires,seller_whatsapp,contact_methods')
        .eq('id', targetListingId)
        .maybeSingle()
      listing = data || null
    }
    if (!listing && listingSlug) {
      const { data } = await supabase
        .from('listings')
        .select('id,seller_id,plan,plan_code,seller_plan,expires_at,highlight_expires,seller_whatsapp,contact_methods')
        .eq('slug', String(listingSlug))
        .maybeSingle()
      if (data && data.id) {
        listing = data
        targetListingId = String(data.id)
      }
    }
  } catch (fetchErr) {
    console.error('[upgrade/checkout] listing lookup failed', fetchErr?.message || fetchErr)
    return { ok: false, reason: 'listing_lookup_failed' }
  }

  if (!listing || !targetListingId) {
    return { ok: false, reason: 'listing_not_found' }
  }

  if (targetUserId && String(listing.seller_id) !== targetUserId) {
    console.warn('[upgrade/checkout] ownership mismatch', { listingId: targetListingId, sellerId: listing.seller_id, userId: targetUserId })
    return { ok: false, reason: 'ownership_mismatch' }
  }

  let planRow = null
  try {
    const { data } = await supabase
      .from('plans')
      .select('code, listing_duration_days, period_days, featured_days, featured_slots, whatsapp_enabled')
      .eq('code', targetPlan)
      .maybeSingle()
    planRow = data || null
  } catch (planErr) {
    console.warn('[upgrade/checkout] plan lookup failed', planErr?.message || planErr)
  }

  const defaultDuration = 60
  const listingDays = Number(planRow?.listing_duration_days || planRow?.period_days || defaultDuration) || defaultDuration
  const defaultHighlight = targetPlan === 'premium' ? 14 : 7
  const includedHighlightDays = Number(planRow?.featured_days || planRow?.featured_slots || defaultHighlight) || 0

  const now = Date.now()
  const nextExpires = new Date(now + listingDays * 24 * 60 * 60 * 1000).toISOString()
  const existingHighlight = listing.highlight_expires ? new Date(listing.highlight_expires).getTime() : null
  const baseHighlight = Number.isFinite(existingHighlight) ? Math.max(existingHighlight, now) : now
  const nextHighlightIso = includedHighlightDays > 0
    ? new Date(baseHighlight + includedHighlightDays * 24 * 60 * 60 * 1000).toISOString()
    : (listing.highlight_expires || null)

  let sellerWhatsapp = normalizeWhatsappForStorage(listing.seller_whatsapp || '')
  if (!sellerWhatsapp) {
    try {
      const { data: profile } = await supabase
        .from('users')
        .select('whatsapp_number, store_phone')
        .eq('id', listing.seller_id)
        .maybeSingle()
      const fallbackWhatsapp = profile?.whatsapp_number || profile?.store_phone || ''
      sellerWhatsapp = normalizeWhatsappForStorage(fallbackWhatsapp)
    } catch (profileErr) {
      console.warn('[upgrade/checkout] profile lookup failed', profileErr?.message || profileErr)
    }
  }

  if (!sellerWhatsapp) {
    console.warn('[upgrade/checkout] missing whatsapp for upgrade', { listingId: targetListingId })
    return { ok: false, reason: 'missing_whatsapp' }
  }

  const contactMethods = ensureWhatsappInContactMethods(listing.contact_methods || ['email', 'chat'])

  try {
    const { error: updateErr } = await supabase
      .from('listings')
      .update({
        plan: targetPlan,
        plan_code: targetPlan,
        seller_plan: targetPlan,
        seller_plan_expires: nextExpires,
        seller_whatsapp: sellerWhatsapp,
        contact_methods: contactMethods,
        expires_at: nextExpires,
        highlight_expires: nextHighlightIso,
        status: 'active'
      })
      .eq('id', targetListingId)

    if (updateErr) {
      console.error('[upgrade/checkout] failed to update listing', updateErr)
      return { ok: false, reason: 'update_failed' }
    }
  } catch (e) {
    console.error('[upgrade/checkout] exception updating listing', e?.message || e)
    return { ok: false, reason: 'update_exception' }
  }

  const nowIso = new Date().toISOString()
  try {
    if (providerRef) {
      await supabase
        .from('publish_credits')
        .update({ status: 'used', used_at: nowIso, listing_id: targetListingId })
        .eq('provider_ref', String(providerRef))
        .eq('provider', 'mercadopago')
    }
    if (preferenceId) {
      await supabase
        .from('publish_credits')
        .update({ status: 'used', used_at: nowIso, listing_id: targetListingId })
        .eq('preference_id', String(preferenceId))
        .eq('provider', 'mercadopago')
    }
  } catch (markErr) {
    console.warn('[upgrade/checkout] failed to mark credit used', markErr?.message || markErr)
  }

  return { ok: true }
}

app.post('/api/checkout', async (req, res) => {
  const startedAt = Date.now()
  try {
    let requestPlanCode = normalisePlanCode(req.body?.planCode || req.body?.plan || req.body?.planId)
    const requestPlanId = req.body?.planId || req.body?.plan || requestPlanCode || 'premium'
    const amountFromBody = Number(req.body?.amount)
    const autoRenew = Boolean(req.body?.autoRenew ?? true)
    const requestUserId = (req.body?.userId ? String(req.body.userId) : '').trim() || null
    const upgradeListingIdRaw = req.body?.listingId ?? req.body?.listing_id ?? null
    const upgradeListingId = typeof upgradeListingIdRaw === 'string'
      ? upgradeListingIdRaw.trim()
      : (upgradeListingIdRaw ? String(upgradeListingIdRaw) : null)
    const upgradeListingSlugRaw = req.body?.listingSlug ?? req.body?.listing_slug ?? null
    const upgradeListingSlug = typeof upgradeListingSlugRaw === 'string'
      ? upgradeListingSlugRaw.trim()
      : (upgradeListingSlugRaw ? String(upgradeListingSlugRaw) : null)
    const upgradePlanOverride = normalisePlanCode(req.body?.upgradePlanCode || req.body?.upgrade_plan_code)
    if (upgradePlanOverride) requestPlanCode = upgradePlanOverride
    const upgradeListingTitleRaw = req.body?.listingTitle ?? req.body?.listing_title ?? null
    const upgradeListingTitle = typeof upgradeListingTitleRaw === 'string'
      ? upgradeListingTitleRaw.trim()
      : (upgradeListingTitleRaw ? String(upgradeListingTitleRaw) : null)
    const upgradeIntent = upgradeListingId ? 'listing_upgrade' : null

    let amount = Number.isFinite(amountFromBody) && amountFromBody > 0 ? amountFromBody : 0

    if (!amount) {
      try {
        if (process.env.AVAILABLE_PLANS) {
          const parsed = JSON.parse(process.env.AVAILABLE_PLANS)
          if (Array.isArray(parsed)) {
            const match = parsed.find((plan) => {
              const planCode = normalisePlanCode(plan.code || plan.id || plan.name)
              return (
                plan.id === requestPlanId ||
                plan.code === requestPlanId ||
                (planCode && requestPlanCode && planCode === requestPlanCode)
              )
            })
            if (match && typeof match.price === 'number' && match.price > 0) {
              amount = match.price
            }
          }
        }
      } catch (parseErr) {
        console.warn('[checkout] AVAILABLE_PLANS parse failed', parseErr)
      }
    }
    if (!amount && requestPlanCode) amount = fallbackPriceFor(requestPlanCode)
    if (!amount && process.env.DEFAULT_PLAN_PRICE) {
      const fallback = Number(process.env.DEFAULT_PLAN_PRICE)
      if (!Number.isNaN(fallback) && fallback > 0) amount = fallback
    }

    const unitPrice = Number.isFinite(amount) && amount > 0 ? Math.round(amount) : 0

    const baseFront = (process.env.FRONTEND_URL || '').split(',')[0]?.trim()
    const redirectUrls = req.body?.redirectUrls ?? {}
    const successUrl = redirectUrls.success || (baseFront ? `${baseFront}/checkout/success` : undefined)
    const failureUrl = redirectUrls.failure || (baseFront ? `${baseFront}/checkout/failure` : undefined)
    const pendingUrl = redirectUrls.pending || (baseFront ? `${baseFront}/checkout/pending` : undefined)

    if (!successUrl || !failureUrl || !pendingUrl) {
      console.error('[checkout] missing redirect URLs. FRONTEND_URL=', process.env.FRONTEND_URL)
      return res.status(400).json({ error: 'missing_redirect_urls' })
    }

    // Prefer explicit SERVER_BASE_URL, fallback to Render's public URL
    const publicBase = (process.env.SERVER_BASE_URL || process.env.RENDER_EXTERNAL_URL || '').replace(/\/$/, '')
    const notificationUrl = publicBase ? `${publicBase}/api/webhooks/mercadopago` : undefined

    const extraMetadata = (() => {
      const source = req.body?.metadata
      if (!source || typeof source !== 'object' || Array.isArray(source)) return {}
      const result = {}
      for (const [key, value] of Object.entries(source)) {
        if (!key || typeof key !== 'string') continue
        if (['planId', 'planCode', 'userId', 'autoRenew', 'intent', 'listingId', 'listingSlug'].includes(key)) continue
        if (value === undefined || value === null) continue
        if (typeof value === 'object') continue
        result[key] = value
      }
      return result
    })()

    if (typeof req.body?.metadata?.listingSlug === 'string' && req.body.metadata.listingSlug) {
      extraMetadata.listingSlug = String(req.body.metadata.listingSlug)
    }
    if (req.body?.metadata?.listingId && typeof req.body.metadata.listingId === 'string') {
      extraMetadata.listingId = String(req.body.metadata.listingId)
    }
    if (Number.isFinite(Number(req.body?.metadata?.highlightDays))) {
      extraMetadata.highlightDays = Number(req.body.metadata.highlightDays)
    }

    const preference = {
      items: [
        {
          id: String(requestPlanId),
          title: upgradeIntent
            ? `Upgrade ${requestPlanCode === 'premium' ? 'Premium' : 'Básico'}`
            : `Plan ${String(requestPlanId).toUpperCase()}`,
          quantity: 1,
          unit_price: unitPrice,
          currency_id: 'ARS',
        },
      ],
      back_urls: { success: successUrl, failure: failureUrl, pending: pendingUrl },
      auto_return: 'approved',
      metadata: {
        planId: requestPlanId,
        planCode: requestPlanCode,
        userId: requestUserId,
        autoRenew,
        ...(upgradeIntent ? {
          intent: upgradeIntent,
          listingId: upgradeListingId,
          listingSlug: upgradeListingSlug,
        } : {}),
        ...extraMetadata,
      },
      // external_reference ayuda a correlacionar en MP (visible en pago)
      external_reference: [
        requestUserId || 'anon',
        requestPlanCode || requestPlanId || 'unknown',
        upgradeListingId ? `listing-${upgradeListingId}` : null,
        String(Date.now()),
      ].filter(Boolean).join(':'),
      ...(notificationUrl ? { notification_url: notificationUrl } : {}),
    }

    if (upgradeIntent && upgradeListingTitle) {
      try {
        preference.items[0].title = `Upgrade ${requestPlanCode === 'premium' ? 'Premium' : 'Básico'} · ${upgradeListingTitle}`
      } catch { /* noop */ }
    }

    const mpStart = Date.now()
    const mpRes = await preferenceClient.create({ body: preference })
    console.log('[checkout] preferenceClient.create duration:', Date.now() - mpStart, 'ms')
    if (notificationUrl) console.log('[checkout] notification_url:', notificationUrl)
    const url = mpRes.init_point || null
    const preferenceId = mpRes.id || null

    if (!url) {
      console.error('checkout error: missing_init_point', mpRes)
      return res.status(502).json({ error: 'missing_init_point' })
    }
    if (url.includes('sandbox.mercadopago.com')) {
      console.error('Received sandbox init_point unexpectedly:', url)
      return res.status(500).json({ error: 'received_sandbox_init_point' })
    }

    console.log('[checkout] init_point:', url)
    // Crear crédito pendiente (best-effort) para poder recuperar el flujo
    try {
      const planCode = requestPlanCode
      if (supabaseService && requestUserId && (planCode === 'basic' || planCode === 'premium')) {
        const expiresAt = new Date(Date.now() + 30 * 24 * 60 * 60 * 1000).toISOString()
        const payload = {
          user_id: requestUserId,
          plan_code: planCode,
          status: 'pending',
          provider: 'mercadopago',
          preference_id: preferenceId || null,
          expires_at: expiresAt,
          ...(upgradeListingId ? { listing_id: upgradeListingId } : {}),
        }
        await supabaseService.from('publish_credits').insert(payload)
      }
    } catch (e) {
      console.warn('[checkout] pending credit insert failed (non-fatal)', e?.message || e)
    }
    return res.json({ url })
  } catch (e) {
    console.error('[checkout] init failed', e?.message || e)
    return res.status(500).json({ error: 'checkout_failed' })
  } finally {
    console.log('[checkout] total handler duration:', Date.now() - startedAt, 'ms')
  }
})

/* ----------------------------- Webhooks MP --------------------------------- */
app.post('/api/webhooks/mercadopago', async (req, res) => {
  try {
    console.log('[MP webhook]', JSON.stringify(req.body))
    const topic = typeof req.body?.topic === 'string' ? req.body.topic : (typeof req.query?.topic === 'string' ? req.query.topic : null)
    const action = typeof req.body?.action === 'string' ? req.body.action : null
    const type = req.body?.type || req.query?.type || topic || null
    let paymentId = req.body?.data?.id || req.query?.id || null
    if (!paymentId) {
      const resource = typeof req.body?.resource === 'string' ? req.body.resource : null
      if (resource) {
        const match = resource.match(/(\d+)$/)
        if (match) paymentId = match[1]
      }
    }
    const isPaymentNotification =
      type === 'payment' ||
      topic === 'payment' ||
      (typeof action === 'string' && action.startsWith('payment.'))
    if (isPaymentNotification && paymentId) {
      try {
        const { Payment } = require('mercadopago')
        const paymentClient = new Payment(mpClient)
        const mpPayment = await paymentClient.get({ id: String(paymentId) })
        const statusRaw = (mpPayment && mpPayment.status) ? String(mpPayment.status) : 'pending'
        const status = statusRaw === 'approved' ? 'succeeded' : statusRaw
        const amount = typeof mpPayment?.transaction_amount === 'number' ? mpPayment.transaction_amount : null
        const currency = mpPayment?.currency_id || 'ARS'
        // Extraer metadata útil
        const meta = (mpPayment && typeof mpPayment.metadata === 'object') ? mpPayment.metadata : {}
        console.log('[MP webhook] payment metadata', { paymentId: String(paymentId), meta })
        const externalRef = (mpPayment && mpPayment.external_reference) ? String(mpPayment.external_reference) : null
        let userId = typeof meta?.userId === 'string' && meta.userId ? meta.userId : null
        let planCode = normalisePlanCode(meta?.planCode || meta?.planId)
        const listingIdRaw = meta?.listingId ?? meta?.listing_id ?? null
        const listingSlugRaw = meta?.listingSlug ?? meta?.listing_slug ?? null
        let upgradeListingId = typeof listingIdRaw === 'string'
          ? listingIdRaw.trim() || null
          : (listingIdRaw ? String(listingIdRaw) : null)
        let upgradeListingSlug = typeof listingSlugRaw === 'string'
          ? listingSlugRaw.trim() || null
          : (listingSlugRaw ? String(listingSlugRaw) : null)
        const metaIntent = typeof meta?.intent === 'string' ? meta.intent : null

        if ((!userId || !planCode || !upgradeListingId) && externalRef) {
          try {
            const parts = externalRef
              .split(':')
              .map((p) => p.trim())
              .filter(Boolean)
            if (!userId) {
              const candidate = parts.find((p) => UUID_REGEX.test(p))
              if (candidate) userId = candidate
            }
            if (!planCode) {
              const planCandidate = parts
                .map((p) => normalisePlanCode(p))
                .find((code) => code === 'basic' || code === 'premium')
              if (planCandidate) planCode = planCandidate
            }
            if (!upgradeListingId) {
              const listingPart = parts.find((p) => p.toLowerCase().startsWith('listing-'))
              if (listingPart) {
                const candidate = listingPart.slice('listing-'.length)
                if (candidate) {
                  if (UUID_REGEX.test(candidate)) {
                    upgradeListingId = candidate
                  } else if (!upgradeListingSlug) {
                    upgradeListingSlug = candidate
                  }
                }
              }
            }
          } catch (refErr) {
            console.warn('[MP webhook] external_reference fallback failed', refErr?.message || refErr)
          }
        }

        // Intentar resolver correctamente el preference_id a partir del merchant_order
        // Nota: mpPayment.order.id es merchant_order id, NO el preference_id
        let prefId = null
        try {
          const merchantOrderId = mpPayment?.order?.id ? String(mpPayment.order.id) : null
          if (merchantOrderId) {
            const moAc = new AbortController()
            const moTimer = setTimeout(() => moAc.abort(), 5000)
            const moRes = await fetch(`https://api.mercadolibre.com/merchant_orders/${merchantOrderId}`, {
              headers: { Authorization: `Bearer ${String(process.env.MERCADOPAGO_ACCESS_TOKEN || '')}` },
              signal: moAc.signal,
            })
            clearTimeout(moTimer)
            if (moRes.ok) {
              const mo = await moRes.json()
              if (mo && typeof mo.preference_id === 'string' && mo.preference_id) {
                prefId = mo.preference_id
              }
            } else {
              console.warn('[MP webhook] merchant_order fetch failed', merchantOrderId, moRes.status)
            }
          }
        } catch (e) {
          console.warn('[MP webhook] merchant_order resolve error', e?.message || e)
        }
        // Registrar pago con userId cuando esté disponible
        await recordPayment({ userId, listingId: upgradeListingId, amount, currency, status, providerRef: String(paymentId) })
        // Upsert/Update crédito según estado del pago
        if (supabaseService && (planCode === 'basic' || planCode === 'premium')) {
          const creditStatus = status === 'succeeded' ? 'available' : (status === 'pending' ? 'pending' : 'cancelled')
          // Intentar actualizar crédito existente (pendiente) por preference_id; si no existe, crear/upsert por provider_ref
          const baseUpdate = {
            user_id: userId,
            plan_code: planCode,
            status: creditStatus,
            provider: 'mercadopago',
            provider_ref: String(paymentId),
            preference_id: prefId,
            expires_at: new Date(Date.now() + 30 * 24 * 60 * 60 * 1000).toISOString(),
            ...(upgradeListingId ? { listing_id: upgradeListingId } : {}),
          }
          let updatedCount = 0
          if (prefId) {
            try {
              const { data: updRows, error: updErr } = await supabaseService
                .from('publish_credits')
                .update({
                  status: creditStatus,
                  provider_ref: String(paymentId),
                  preference_id: prefId,
                  expires_at: baseUpdate.expires_at,
                  ...(upgradeListingId ? { listing_id: upgradeListingId } : {}),
                })
                .eq('provider', 'mercadopago')
                .eq('preference_id', prefId)
                .select('id')
              if (!updErr && Array.isArray(updRows)) updatedCount = updRows.length
              if (updatedCount > 0) console.log('[webhook] credit updated by preference_id', updatedCount)
            } catch (eUpd) {
              console.warn('[webhook] update by preference_id failed', eUpd?.message || eUpd)
            }
          }
          if (updatedCount === 0) {
            // Fallback idempotente por provider_ref
            try {
              await supabaseService
                .from('publish_credits')
                .upsert(baseUpdate, { onConflict: 'provider_ref,provider' })
              console.log('[webhook] credit upserted by provider_ref')
            } catch (e1) {
              console.warn('[webhook] upsert by provider_ref failed', e1?.message || e1)
            }
            if (prefId) {
              try {
                await supabaseService
                  .from('publish_credits')
                  .upsert(baseUpdate, { onConflict: 'preference_id,provider' })
                console.log('[webhook] credit upserted by preference_id')
              } catch (e2) {
                console.warn('[webhook] upsert by preference_id failed', e2?.message || e2)
              }
            }
          }

          // Limpieza: si el pago quedó aprobado, cancelar otros créditos pendientes del mismo usuario/plan
          if (creditStatus === 'available' && userId && planCode) {
            try {
              const { error: cancelErr } = await supabaseService
                .from('publish_credits')
                .update({ status: 'cancelled' })
                .eq('user_id', userId)
                .eq('plan_code', planCode)
                .eq('status', 'pending')
                .neq('provider_ref', String(paymentId))
              if (cancelErr) console.warn('[webhook] cleanup pending credits failed', cancelErr)
            } catch (e) {
              console.warn('[webhook] cleanup pending credits error', e?.message || e)
            }
          }
          if (status === 'succeeded' && metaIntent === 'listing_upgrade' && upgradeListingId) {
            try {
              const applyResult = await applyCheckoutUpgrade({
                planCode,
                listingId: upgradeListingId,
                listingSlug: upgradeListingSlug,
                userId,
                providerRef: String(paymentId),
                preferenceId: prefId
              })
              if (!applyResult.ok && applyResult.reason !== 'already_applied') {
                console.warn('[webhook] failed to auto-apply upgrade', applyResult)
              }
            } catch (applyErr) {
              console.error('[webhook] auto apply upgrade failed', applyErr?.message || applyErr)
            }
          }
        }

        // Auto-aplicar destaque para pagos de "Highlight" (idempotente)
        try {
          if (supabaseService && status === 'succeeded') {
            const listingSlug = typeof meta?.listingSlug === 'string' ? meta.listingSlug : null
            const highlightDaysRaw = meta?.highlightDays ?? meta?.highlight_days ?? 0
            const highlightDays = Number(highlightDaysRaw || 0)

            if (listingSlug && Number.isFinite(highlightDays) && highlightDays > 0) {
              console.log('[webhook/highlight] applying', { listingSlug, highlightDays, paymentId: String(paymentId) })
              // Evitar aplicar más de una vez por pago
              let alreadyApplied = false
              try {
                const { data: payRow } = await supabaseService
                  .from('payments')
                  .select('applied')
                  .eq('provider', 'mercadopago')
                  .eq('provider_ref', String(paymentId))
                  .maybeSingle()
                alreadyApplied = Boolean(payRow?.applied)
              } catch {}

              if (!alreadyApplied) {
                // Buscar listing por slug o id
                const { data: listingBySlug } = await supabaseService
                  .from('listings')
                  .select('id, highlight_expires')
                  .eq('slug', listingSlug)
                  .maybeSingle()
                let listing = listingBySlug
                if (!listing) {
                  const { data: listingById } = await supabaseService
                    .from('listings')
                    .select('id, highlight_expires')
                    .eq('id', listingSlug)
                    .maybeSingle()
                  listing = listingById || null
                }

                if (listing && listing.id) {
                  const now = Date.now()
                  const base = listing.highlight_expires ? Math.max(new Date(listing.highlight_expires).getTime(), now) : now
                  const next = new Date(base + highlightDays * 24 * 60 * 60 * 1000).toISOString()
                  const { error: upd } = await supabaseService
                    .from('listings')
                    .update({ highlight_expires: next })
                    .eq('id', listing.id)
                  if (upd) {
                    console.error('[webhook/highlight] failed to update listing', upd)
                  } else {
                    console.log('[webhook/highlight] updated listing', { listingId: listing.id, prev: listing.highlight_expires, next })
                    // Marcar crédito como aplicado (si existe)
                    try {
                      const nowIso = new Date().toISOString()
                      await supabaseService
                        .from('payments')
                        .update({ applied: true, applied_at: nowIso })
                        .eq('provider', 'mercadopago')
                        .eq('provider_ref', String(paymentId))
                    } catch (e3) {
                      console.warn('[webhook/highlight] mark applied failed', e3?.message || e3)
                    }
                  }
                } else {
                  console.warn('[webhook/highlight] listing not found for', listingSlug)
                }
              }
            }
          }
        } catch (e) {
          console.warn('[webhook/highlight] handler error', e?.message || e)
        }
      } catch (err) {
        console.error('[MP webhook] payment fetch/record failed', err)
      }
    }
  } catch (e) {
    console.error('[MP webhook] handler error', e)
  } finally {
    res.sendStatus(200)
  }
})

/* ----------------------------- Credits API -------------------------------- */
// Simple healthcheck to validate credits infra from the server side
app.get('/api/credits/health', async (_req, res) => {
  try {
    if (!supabaseService) return res.status(503).json({ ok: false, error: 'service_unavailable' })
    const { data, error } = await supabaseService
      .from('publish_credits')
      .select('id')
      .limit(1)
    if (error) return res.status(500).json({ ok: false, error: 'db_error' })
    return res.json({ ok: true, supabase: true, table: 'publish_credits', readable: true })
  } catch (err) {
    console.warn('[credits/health] failed', err)
    return res.status(500).json({ ok: false, error: 'unexpected_error' })
  }
})
// List available credits for a user
app.get('/api/credits/me', async (req, res) => {
  try {
    if (!supabaseService) return res.json([])
    const userId = String(req.query.userId || req.query.user_id || '').trim()
    if (!userId) return res.json([])
    const nowIso = new Date().toISOString()
    const { data, error } = await supabaseService
      .from('publish_credits')
      .select('id, created_at, plan_code, status')
      .eq('user_id', userId)
      .eq('status', 'available')
      .gte('expires_at', nowIso)
      .order('created_at', { ascending: true })
    if (error || !Array.isArray(data)) return res.json([])
    return res.json(data)
  } catch (err) {
    console.warn('[credits/me] failed', err)
    return res.json([])
  }
})
/* ----------------------------- Market search (server-ordered) ------------- */
// GET /api/market/search
// Query params (subset used by Marketplace):
// - cat: category exact match (optional)
// - q: free-text contains in title/brand/model/description (optional)
// - deal=1: only discounted (original_price > price)
// - store=1: only official stores (users.store_enabled=true)
// - limit (default 48, max 200), offset (default 0)
// Returns: { items: Listing[], total?: number } with likes_count and storeEnabled flags
app.get('/api/market/search', async (req, res) => {
  try {
    const supabase = supabaseService || getServerSupabaseClient()
    const limit = Math.min(Math.max(Number(req.query.limit || 48), 1), 200)
    const offset = Math.max(Number(req.query.offset || 0), 0)
    const onlyStore = String(req.query.store || '') === '1'
    const cat = (req.query.cat ? String(req.query.cat) : '').trim()
    const q = (req.query.q ? String(req.query.q) : '').trim().toLowerCase()
    const deal = String(req.query.deal || '') === '1'
    const sort = (() => {
      const v = String(req.query.sort || 'relevance')
      return v === 'newest' || v === 'asc' || v === 'desc' ? v : 'relevance'
    })()
    const priceCur = (() => {
      const c = String(req.query.price_cur || '').toUpperCase()
      return c === 'USD' || c === 'ARS' ? c : undefined
    })()
    const priceMinRaw = Number(req.query.price_min)
    const priceMaxRaw = Number(req.query.price_max)
    const priceMin = Number.isFinite(priceMinRaw) ? priceMinRaw : undefined
    const priceMax = Number.isFinite(priceMaxRaw) ? priceMaxRaw : undefined
    // FX: query param > env > DB app_settings > default
    let fx = (() => {
      const envFx = Number(process.env.USD_ARS_FX || process.env.VITE_USD_ARS_FX)
      const fxOverride = Number(req.query.fx)
      return Number.isFinite(fxOverride) && fxOverride > 0
        ? fxOverride
        : (Number.isFinite(envFx) && envFx > 0 ? envFx : NaN)
    })()
    if (!Number.isFinite(fx) || fx <= 0) {
      try {
        const { data: fxRow } = await supabase
          .from('app_settings')
          .select('value')
          .eq('key', 'usd_ars_fx')
          .maybeSingle()
        if (fxRow && typeof fxRow.value !== 'undefined') {
          const n = Number(fxRow.value)
          if (Number.isFinite(n) && n > 0) fx = n
        }
      } catch {}
      if (!Number.isFinite(fx) || fx <= 0) fx = 1000
    }

    // Advanced filters (multi)
    const toArray = (v) => Array.isArray(v) ? v : (v ? [v] : [])
    const fBrand = toArray(req.query.brand).map((s) => String(s))
    const fMaterial = toArray(req.query.material).map((s) => String(s))
    const fFrameSize = toArray(req.query.frameSize).map((s) => String(s))
    const fWheelSize = toArray(req.query.wheelSize).map((s) => String(s))
    const fDrivetrain = toArray(req.query.drivetrain).map((s) => String(s))
    const fYear = toArray(req.query.year).map((s) => Number(s)).filter((n) => Number.isFinite(n))
    const fLocation = toArray(req.query.location).map((s) => String(s))
    const fCondition = toArray(req.query.condition).map((s) => String(s))
    const fBrake = toArray(req.query.brake).map((s) => String(s))
    const fSize = toArray(req.query.size).map((s) => String(s))
    const subcat = (req.query.subcat ? String(req.query.subcat) : '').trim()

    // Base: publicaciones visibles (activas o publicadas)
    let query = supabase
      .from('listings')
      .select('*')
      .in('status', ['active', 'published'])

    if (cat) query = query.eq('category', cat)
    if (subcat) query = query.eq('subcategory', subcat)
    if (deal) query = query.gt('original_price', 0).gt('original_price', 'price')
    if (fBrand.length) query = query.in('brand', fBrand)
    if (fMaterial.length) query = query.in('material', fMaterial)
    if (fFrameSize.length) query = query.in('frame_size', fFrameSize)
    if (fWheelSize.length) query = query.in('wheel_size', fWheelSize)
    if (fDrivetrain.length) query = query.in('drivetrain', fDrivetrain)
    if (fYear.length) query = query.in('year', fYear)

    // Nota: filtro de texto y de tienda se aplican en servidor (post-query)
    // Orden preliminar por campos útiles para luego reordenar de forma estable
    // Primero destacados por fecha, luego recientes
    query = query
      .order('highlight_expires', { ascending: false, nullsFirst: true })
      .order('created_at', { ascending: false })

    // Evitar cargar demasiadas filas en memoria: ajustar pool en función del "limit" solicitado
    const poolSize = Math.min(Math.max(limit * 5, 100), 300)
    const { data: rows, error } = await query.limit(poolSize) // recuperar un pool suficiente para ordenar y paginar sin exceder memoria
    if (error) return res.status(500).json({ ok: false, error: 'query_failed' })
    const listings = Array.isArray(rows) ? rows : []
    if (!listings.length) return res.json({ items: [] })

    // Filtro por tienda oficial (y metadata de tiendas)
    const sellerIds = Array.from(new Set(listings.map((r) => r.seller_id).filter(Boolean)))
    const storeMap = {}
    if (sellerIds.length) {
      try {
        const { data: stores } = await supabase
          .from('users')
          .select('id, store_enabled')
          .in('id', sellerIds)
        for (const row of stores || []) {
          storeMap[String(row.id)] = Boolean(row.store_enabled)
        }
      } catch {}
    }

    // Filtro de texto + precio + tienda
    let filtered = listings.filter((l) => {
      if (onlyStore && !storeMap[String(l.seller_id)]) return false
      if (q) {
        const bucket = [l.title, l.brand, l.model, l.description].filter(Boolean).join(' ').toLowerCase()
        if (!bucket.includes(q)) return false
      }
      // location contains any token
      if (fLocation.length) {
        const needle = fLocation.map((s) => s.toLowerCase())
        const hay = [l.seller_location || '', l.location || ''].join(',').toLowerCase()
        if (!needle.some((n) => hay.includes(n))) return false
      }
      // extras/description contains conditions
      if (fCondition.length || fBrake.length || fSize.length) {
        const text = [l.extras || '', l.description || ''].join(' \n ').toLowerCase()
        if (fCondition.length && !fCondition.some((n) => text.includes(String(n).toLowerCase()))) return false
        if (fBrake.length && !fBrake.some((n) => text.includes(String(n).toLowerCase()))) return false
        if (fSize.length && !fSize.some((n) => text.includes(String(n).toLowerCase()))) return false
      }
      if (priceCur && (typeof priceMin === 'number' || typeof priceMax === 'number')) {
        const cur = String(l.price_currency || 'ARS').toUpperCase()
        const price = Number(l.price) || 0
        const toSelected = (value) => {
          if (priceCur === cur) return value
          return priceCur === 'USD' ? value / fx : value * fx
        }
        const p = toSelected(price)
        if (typeof priceMin === 'number' && p < priceMin) return false
        if (typeof priceMax === 'number' && p > priceMax) return false
      }
      return true
    })

    // Likes count por lote
    const idMap = new Map()
    const ids = filtered.map((l) => String(l.id))
    const likeCounts = {}
    if (ids.length) {
      try {
        const { data: likes } = await supabase
          .from('listing_likes')
          .select('listing_id')
          .in('listing_id', ids)
        for (const row of likes || []) {
          const id = String(row.listing_id)
          likeCounts[id] = (likeCounts[id] || 0) + 1
        }
      } catch {}
    }

    // Orden final
    const now = Date.now()
    filtered.sort((a, b) => {
      if (sort === 'newest') {
        const aCr = a.created_at ? new Date(a.created_at).getTime() : 0
        const bCr = b.created_at ? new Date(b.created_at).getTime() : 0
        return bCr - aCr
      }
      if (sort === 'asc' || sort === 'desc') {
        const toSelected = (row) => {
          const cur = String(row.price_currency || 'ARS').toUpperCase()
          const price = Number(row.price) || 0
          return priceCur && priceCur !== cur
            ? (priceCur === 'USD' ? price / fx : price * fx)
            : price
        }
        const pa = toSelected(a)
        const pb = toSelected(b)
        return sort === 'asc' ? (pa - pb) : (pb - pa)
      }
      // Relevancia: destacadas -> tiendas -> resto; dentro likes desc, luego recientes y vencimiento de destaque
      const aHl = a.highlight_expires ? new Date(a.highlight_expires).getTime() > now : false
      const bHl = b.highlight_expires ? new Date(b.highlight_expires).getTime() > now : false
      const aStore = storeMap[String(a.seller_id)] ? 1 : 0
      const bStore = storeMap[String(b.seller_id)] ? 1 : 0
      const rA = aHl ? 2 : (aStore ? 1 : 0)
      const rB = bHl ? 2 : (bStore ? 1 : 0)
      if (rB !== rA) return rB - rA
      const la = likeCounts[String(a.id)] || 0
      const lb = likeCounts[String(b.id)] || 0
      if (lb !== la) return lb - la
      if (rA === 2) {
        const aHex = a.highlight_expires ? new Date(a.highlight_expires).getTime() : 0
        const bHex = b.highlight_expires ? new Date(b.highlight_expires).getTime() : 0
        if (bHex !== aHex) return bHex - aHex
      }
      const aCr = a.created_at ? new Date(a.created_at).getTime() : 0
      const bCr = b.created_at ? new Date(b.created_at).getTime() : 0
      return bCr - aCr
    })

    const total = filtered.length
    const slice = filtered.slice(offset, offset + limit)
    const items = slice.map((row) => ({
      id: row.id,
      slug: row.slug,
      title: row.title,
      brand: row.brand,
      model: row.model,
      year: row.year,
      category: row.category,
      subcategory: row.subcategory,
      price: row.price,
      price_currency: row.price_currency,
      original_price: row.original_price,
      images: row.images,
      location: row.location,
      description: row.description,
      material: row.material,
      frame_size: row.frame_size,
      wheel_size: row.wheel_size,
      drivetrain: row.drivetrain,
      drivetrain_detail: row.drivetrain_detail,
      wheelset: row.wheelset,
      extras: row.extras,
      seller_id: row.seller_id,
      seller_name: row.seller_name,
      seller_location: row.seller_location,
      seller_email: row.seller_email,
      seller_whatsapp: row.seller_whatsapp,
      seller_avatar: row.seller_avatar,
      plan: row.plan || row.plan_code || row.seller_plan,
      highlight_expires: row.highlight_expires,
      seller_plan_expires: row.seller_plan_expires,
      status: row.status,
      created_at: row.created_at,
      expires_at: row.expires_at,
      renewal_notified_at: row.renewal_notified_at,
      likes_count: likeCounts[String(row.id)] || 0,
      store_enabled: storeMap[String(row.seller_id)] || false,
    }))
    return res.json({ items, total })
  } catch (err) {
    console.error('[market/search] failed', err)
    return res.status(500).json({ ok: false, error: 'unexpected_error' })
  }
})

// Redeem one available credit for the given plan
app.post('/api/credits/redeem', async (req, res) => {
  try {
    if (!supabaseService) return res.status(500).json({ ok: false, error: 'service_unavailable' })
    const userId = String(req.body?.userId || '').trim()
    const planCode = normalisePlanCode(req.body?.planCode || req.body?.plan)
    if (!userId || !(planCode === 'basic' || planCode === 'premium')) {
      return res.status(400).json({ ok: false, error: 'invalid_params' })
    }
    // Buscar el crédito más antiguo disponible y marcar como usado
    const nowIso = new Date().toISOString()
    const { data: rows } = await supabaseService
      .from('publish_credits')
      .select('id')
      .eq('user_id', userId)
      .eq('plan_code', planCode)
      .eq('status', 'available')
      .gte('expires_at', nowIso)
      .order('created_at', { ascending: true })
      .limit(1)
    const credit = Array.isArray(rows) && rows[0] ? rows[0] : null
    if (!credit?.id) return res.status(409).json({ ok: false, error: 'no_available_credit' })
    const { data: updated, error } = await supabaseService
      .from('publish_credits')
      .update({ status: 'used', used_at: new Date().toISOString() })
      .eq('id', credit.id)
      .eq('user_id', userId)
      .eq('plan_code', planCode)
      .eq('status', 'available')
      .select('id')
      .single()
    if (error || !updated) return res.status(409).json({ ok: false, error: 'race_conflict' })
    return res.json({ ok: true, creditId: updated.id, planCode })
  } catch (err) {
    console.error('[credits/redeem] failed', err)
    return res.status(500).json({ ok: false, error: 'unexpected_error' })
  }
})

// Full history (simple): list all credits for a user
app.get('/api/credits/history', async (req, res) => {
  try {
    if (!supabaseService) return res.json([])
    const userId = String(req.query.userId || req.query.user_id || '').trim()
    if (!userId) return res.json([])
    const { data, error } = await supabaseService
      .from('publish_credits')
      .select('id, created_at, plan_code, status, used_at, expires_at, listing_id')
      .eq('user_id', userId)
      .order('created_at', { ascending: false })
      .limit(200)
    if (error || !Array.isArray(data)) return res.json([])
    return res.json(data)
  } catch (err) {
    console.warn('[credits/history] failed', err)
    return res.json([])
  }
})

// Attach listing to a redeemed credit (best-effort)
app.post('/api/credits/attach', async (req, res) => {
  try {
    if (!supabaseService) return res.status(500).json({ ok: false, error: 'service_unavailable' })
    const creditId = String(req.body?.creditId || '').trim()
    const listingId = String(req.body?.listingId || '').trim()
    const userId = String(req.body?.userId || '').trim()
    if (!creditId || !listingId || !userId) return res.status(400).json({ ok: false, error: 'invalid_params' })
    const { error } = await supabaseService
      .from('publish_credits')
      .update({ listing_id: listingId })
      .eq('id', creditId)
      .eq('user_id', userId)
      .eq('status', 'used')
    if (error) return res.status(400).json({ ok: false, error: 'attach_failed' })
    return res.json({ ok: true })
  } catch (err) {
    console.error('[credits/attach] failed', err)
    return res.status(500).json({ ok: false, error: 'unexpected_error' })
  }
})

// Revertir créditos canjeados sin adjuntar a listing luego de 1 hora (gracia)
// Protegido con x-cron-secret, pensado para ejecutar desde Render Cron
app.post('/api/credits/revert-unused', async (req, res) => {
  try {
    const secret = String(req.headers['x-cron-secret'] || '')
    if (!secret || secret !== String(process.env.CRON_SECRET || '')) {
      return res.status(401).json({ ok: false, error: 'unauthorized' })
    }
    if (!supabaseService) return res.status(500).json({ ok: false, error: 'service_unavailable' })

    const cutoffIso = new Date(Date.now() - 60 * 60 * 1000).toISOString() // 1 hora
    const nowIso = new Date().toISOString()
    const { data, error } = await supabaseService
      .from('publish_credits')
      .update({ status: 'available', used_at: null })
      .eq('status', 'used')
      .is('listing_id', null)
      .lt('used_at', cutoffIso)
      .gte('expires_at', nowIso)
      .select('id')

    if (error) return res.status(500).json({ ok: false, error: 'update_failed' })
    const reverted = Array.isArray(data) ? data.length : 0
    return res.json({ ok: true, reverted, cutoff: cutoffIso })
  } catch (err) {
    console.error('[credits/revert-unused] failed', err)
    return res.status(500).json({ ok: false, error: 'unexpected_error' })
  }
})

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
    const { Payment } = require('mercadopago')
    const paymentClient = new Payment(mpClient)
    const mpPayment = await paymentClient.get({ id: String(paymentId) })
    const statusRaw = (mpPayment && mpPayment.status) ? String(mpPayment.status) : 'pending'
    const status = statusRaw === 'approved' ? 'succeeded' : statusRaw
    const amount = typeof mpPayment?.transaction_amount === 'number' ? mpPayment.transaction_amount : null
    const currency = mpPayment?.currency_id || 'ARS'
    await recordPayment({ userId: null, listingId: null, amount, currency, status, providerRef: String(paymentId) })
    // Best-effort: también actualizar créditos si corresponde
    try {
      const meta = (mpPayment && typeof mpPayment.metadata === 'object') ? mpPayment.metadata : {}
      const userId = typeof meta?.userId === 'string' && meta.userId ? meta.userId : null
      const planCode = normalisePlanCode(meta?.planCode || meta?.planId)
      const listingIdRaw = meta?.listingId ?? meta?.listing_id ?? null
      const upgradeListingId = typeof listingIdRaw === 'string' ? listingIdRaw.trim() || null : (listingIdRaw ? String(listingIdRaw) : null)
      const merchantOrderId = mpPayment?.order?.id ? String(mpPayment.order.id) : null
      let prefId = null
      if (merchantOrderId) {
        try {
          const moAc = new AbortController()
          const moTimer = setTimeout(() => moAc.abort(), 5000)
          const moRes = await fetch(`https://api.mercadolibre.com/merchant_orders/${merchantOrderId}`, {
            headers: { Authorization: `Bearer ${String(process.env.MERCADOPAGO_ACCESS_TOKEN || '')}` },
            signal: moAc.signal,
          })
          clearTimeout(moTimer)
          if (moRes.ok) {
            const mo = await moRes.json()
            if (mo && typeof mo.preference_id === 'string' && mo.preference_id) prefId = mo.preference_id
          }
        } catch {}
      }
      if (supabaseService && (planCode === 'basic' || planCode === 'premium')) {
        const creditStatus = status === 'succeeded' ? 'available' : (status === 'pending' ? 'pending' : 'cancelled')
        const expiresAt = new Date(Date.now() + 30 * 24 * 60 * 60 * 1000).toISOString()
        let updatedCount = 0
        if (prefId) {
          try {
            const { data: updRows } = await supabaseService
              .from('publish_credits')
              .update({ status: creditStatus, provider_ref: String(paymentId), preference_id: prefId, expires_at: expiresAt, ...(upgradeListingId ? { listing_id: upgradeListingId } : {}) })
              .eq('provider', 'mercadopago')
              .eq('preference_id', prefId)
              .select('id')
            updatedCount = Array.isArray(updRows) ? updRows.length : 0
          } catch {}
        }
        if (updatedCount === 0) {
          const baseUpdate = { user_id: userId, plan_code: planCode, status: creditStatus, provider: 'mercadopago', provider_ref: String(paymentId), preference_id: prefId, expires_at: expiresAt, ...(upgradeListingId ? { listing_id: upgradeListingId } : {}) }
          try { await supabaseService.from('publish_credits').upsert(baseUpdate, { onConflict: 'provider_ref,provider' }) } catch {}
          if (prefId) { try { await supabaseService.from('publish_credits').upsert(baseUpdate, { onConflict: 'preference_id,provider' }) } catch {} }
        }

        // Limpieza: si el pago quedó aprobado, cancelar otros créditos pendientes del mismo usuario/plan
        if (creditStatus === 'available' && userId && planCode) {
          try {
            const { error: cancelErr } = await supabaseService
              .from('publish_credits')
              .update({ status: 'cancelled' })
              .eq('user_id', userId)
              .eq('plan_code', planCode)
              .eq('status', 'pending')
              .neq('provider_ref', String(paymentId))
            if (cancelErr) console.warn('[payments/confirm] cleanup pending credits failed', cancelErr)
          } catch {}
        }
      }
    } catch {}
    return res.json({ ok: true, status, amount, currency })
  } catch (err) {
    console.error('[payments/confirm] failed', err)
    return res.status(500).json({ ok: false, error: 'unexpected_error' })
  }
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

// Upgrade or renew a publication to a paid plan (owner with credit or moderator)
app.post('/api/listings/:id/upgrade', async (req, res) => {
  try {
    const { id } = req.params
    const supabase = getServerSupabaseClient()
    const user = await getAuthUser(req, supabase)
    if (!user) return res.status(401).json({ error: 'unauthorized' })

    const { data: listing, error: listingError } = await supabase
      .from('listings')
      .select('id,seller_id,plan,plan_code,seller_plan,expires_at,highlight_expires,seller_whatsapp,contact_methods')
      .eq('id', id)
      .maybeSingle()
    if (listingError || !listing) return res.status(404).json({ error: 'not_found' })

    const isOwner = listing.seller_id === user.id
    let isModeratorUser = false
    if (!isOwner) {
      isModeratorUser = await userIsModerator(user.id, supabase)
    }
    if (!isOwner && !isModeratorUser) return res.status(403).json({ error: 'forbidden' })

    const planCode = normalisePlanCode(req.body?.planCode || req.body?.plan)
    if (!planCode || (planCode !== 'basic' && planCode !== 'premium')) {
      return res.status(400).json({ error: 'invalid_plan' })
    }

    const useCredit = Boolean(req.body?.useCredit)
    if (useCredit && !supabaseService) return res.status(500).json({ error: 'service_unavailable' })

    let creditId = null
    const ownerId = listing.seller_id
    if (useCredit) {
      const nowIso = new Date().toISOString()
      const { data: creditRows, error: creditErr } = await supabaseService
        .from('publish_credits')
        .select('id')
        .eq('user_id', ownerId)
        .eq('plan_code', planCode)
        .eq('status', 'available')
        .gte('expires_at', nowIso)
        .order('created_at', { ascending: true })
        .limit(1)
      if (creditErr) return res.status(500).json({ error: 'credit_lookup_failed' })
      const credit = Array.isArray(creditRows) && creditRows[0] ? creditRows[0] : null
      if (!credit?.id) return res.status(409).json({ error: 'no_available_credit' })
      const { data: creditUpdate, error: creditUseErr } = await supabaseService
        .from('publish_credits')
        .update({ status: 'used', used_at: nowIso })
        .eq('id', credit.id)
        .eq('status', 'available')
        .select('id')
        .maybeSingle()
      if (creditUseErr || !creditUpdate) return res.status(409).json({ error: 'credit_conflict' })
      creditId = creditUpdate.id
    } else if (!isModeratorUser) {
      return res.status(409).json({ error: 'credit_required' })
    }

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
    if ((planCode === 'basic' || planCode === 'premium') && !profileWhatsapp) {
      if (creditId && supabaseService) {
        await supabaseService
          .from('publish_credits')
          .update({ status: 'available', used_at: null })
          .eq('id', creditId)
      }
      return res.status(409).json({ error: 'missing_whatsapp' })
    }
    if (!sellerWhatsapp) {
      sellerWhatsapp = profileWhatsapp
    }
    if (!sellerWhatsapp) {
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
      })
      .eq('id', id)
      .select('*')
      .maybeSingle()
    if (upd || !updated) return res.status(500).json({ error: 'update_failed' })
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
