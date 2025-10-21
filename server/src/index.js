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
const path = require('path')

const app = express()
app.use(express.json())

/* ----------------------------- Static assets ------------------------------ */
const publicDir = path.join(__dirname, '../public')
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
const allowed = (process.env.FRONTEND_URL || '')
  .split(',')
  .map((s) => s.trim())
  .filter(Boolean)

const corsOptions = {
  origin: allowed.length ? allowed : (origin, cb) => cb(null, true),
  credentials: true,
  methods: ['GET', 'POST', 'PUT', 'PATCH', 'DELETE', 'OPTIONS'],
  allowedHeaders: ['Content-Type', 'Authorization', 'X-Requested-With'],
}

app.use(cors(corsOptions))
app.options('*', cors(corsOptions))

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

/* ----------------------------- Health ------------------------------------- */
app.get('/', (_req, res) => {
  res.send('Ciclo Market API ready')
})

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

async function recordPayment({ userId, listingId, amount, currency = 'ARS', status = 'succeeded', provider = 'mercadopago', providerRef = null }) {
  if (!supabaseService) return
  try {
    const payload = {
      user_id: userId ?? null,
      listing_id: listingId ?? null,
      amount: typeof amount === 'number' ? amount : null,
      currency,
      status,
      provider,
      provider_ref: providerRef,
    }
    const { error } = await supabaseService.from('payments').insert(payload)
    if (error) console.error('[payments] insert failed', error)
  } catch (err) {
    console.error('[payments] unexpected error', err)
  }
}

/* ----------------------------- Track events ------------------------------- */
app.post('/api/track', async (req, res) => {
  try {
    if (!supabaseService) return res.sendStatus(204)
    const { type, listing_id, store_user_id, path, referrer, anon_id, meta } = req.body || {}
    const clean = (s) => (typeof s === 'string' ? s.slice(0, 512) : null)
    const allowed = new Set(['site_view','listing_view','store_view','wa_click'])
    if (!allowed.has(type)) return res.status(400).json({ ok: false, error: 'invalid_type' })
    const ua = clean(req.headers['user-agent'] || '')
    const payload = {
      type,
      listing_id: listing_id || null,
      store_user_id: store_user_id || null,
      user_id: null,
      anon_id: clean(anon_id) || null,
      path: clean(path) || null,
      referrer: clean(referrer) || null,
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

// Sitemap index que referencia sitemaps por tipo
app.get('/sitemap.xml', async (_req, res) => {
  try {
    res.type('application/xml')
    const origin = (process.env.FRONTEND_URL || '').split(',')[0]?.trim() || 'https://ciclomarket.ar'

    // Calcular cantidad de páginas para listings
    let pages = 1
    const PAGE_SIZE = 1000
    try {
      const supabase = getServerSupabaseClient()
      const { count } = await supabase
        .from('listings')
        .select('id', { count: 'exact', head: true })
        .eq('status', 'active')
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
  const origin = (process.env.FRONTEND_URL || '').split(',')[0]?.trim() || 'https://ciclomarket.ar'
  const nowIso = new Date().toISOString().slice(0, 10)
  const staticPaths = [
    '/',
    '/marketplace',
    '/ofertas',
    '/publicar',
    '/como-publicar',
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
    const origin = (process.env.FRONTEND_URL || '').split(',')[0]?.trim() || 'https://ciclomarket.ar'
    const page = Math.max(1, parseInt(String(req.params.page || '1'), 10) || 1)
    const PAGE_SIZE = 1000
    const from = (page - 1) * PAGE_SIZE
    const to = from + PAGE_SIZE - 1
    const supabase = getServerSupabaseClient()
    const { data, error } = await supabase
      .from('listings')
      .select('id, slug, created_at', { count: 'exact' })
      .eq('status', 'active')
      .order('created_at', { ascending: false })
      .range(from, to)
    if (error) throw error
    const nowIso = new Date().toISOString().slice(0, 10)
    const urls = (data || [])
      .map((l) => {
        const slugOrId = l.slug || l.id
        const lastmod = l.created_at ? new Date(l.created_at).toISOString().slice(0, 10) : nowIso
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
    return res.status(500).send('')
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
  // Ya no listamos categorías como landings indexables.
  res.type('application/xml')
  const xml = `<?xml version="1.0" encoding="UTF-8"?>\n<urlset xmlns="http://www.sitemaps.org/schemas/sitemap/0.9"></urlset>`
  res.set('Cache-Control', 'public, max-age=1800')
  return res.send(xml)
})

app.get('/robots.txt', (_req, res) => {
  res.type('text/plain')
  res.sendFile(path.join(publicDir, 'robots.txt'))
})

/* ----------------------- Open Graph for Listings --------------------------- */
/**
 * Sirve meta-tags OG para /listing/:id y /share/listing/:id en el BACKEND.
 * - Si es un bot (WhatsApp/Facebook/etc.): devuelve HTML con <meta property="og:*">
 * - Si es un humano: redirige al front (FRONTEND_URL).
 */
app.get(['/share/listing/:id', '/listing/:id'], async (req, res) => {
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

    const baseFront = (process.env.FRONTEND_URL || '').split(',')[0]?.trim() || 'https://ciclomarket.ar'
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
    let listingUuid = null
    try {
      const raw = typeof listingId === 'string' ? listingId.trim() : ''
      const isUuid = /^[0-9a-fA-F]{8}-[0-9a-fA-F]{4}-[0-9a-fA-F]{4}-[0-9a-fA-F]{4}-[0-9a-fA-F]{12}$/.test(raw)
      if (raw) {
        if (isUuid) {
          listingUuid = raw
        } else {
          const { data: bySlug } = await supabase
            .from('listings')
            .select('id')
            .eq('slug', raw)
            .maybeSingle()
          if (bySlug?.id) listingUuid = bySlug.id
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
      console.warn('[contacts] insert failed', error)
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
            listing_id: listingUuid,
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
      if (!contacts || contacts.length === 0) return res.status(400).send('not_allowed')
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
                Instagram: <a href="https://instagram.com/ciclomarket" style="color:#0c72ff;text-decoration:underline">@ciclomarket</a><br />
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
                Instagram: <a href="https://instagram.com/ciclomarket" style="color:#0c72ff;text-decoration:underline">@ciclomarket</a><br />
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

app.post('/api/checkout', async (req, res) => {
  const startedAt = Date.now()
  try {
    const requestPlanCode = normalisePlanCode(req.body?.planCode || req.body?.plan || req.body?.planId)
    const requestPlanId = req.body?.planId || req.body?.plan || requestPlanCode || 'premium'
    const amountFromBody = Number(req.body?.amount)
    const autoRenew = Boolean(req.body?.autoRenew ?? true)
    const requestUserId = (req.body?.userId ? String(req.body.userId) : '').trim() || null

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

    const preference = {
      items: [
        {
          id: String(requestPlanId),
          title: `Plan ${String(requestPlanId).toUpperCase()}`,
          quantity: 1,
          unit_price: unitPrice,
          currency_id: 'ARS',
        },
      ],
      back_urls: { success: successUrl, failure: failureUrl, pending: pendingUrl },
      auto_return: 'approved',
      metadata: { planId: requestPlanId, planCode: requestPlanCode, userId: requestUserId, autoRenew },
      // external_reference ayuda a correlacionar en MP (visible en pago)
      external_reference: [requestUserId || 'anon', requestPlanCode || requestPlanId || 'unknown', String(Date.now())].join(':'),
      ...(notificationUrl ? { notification_url: notificationUrl } : {}),
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
    const type = req.body?.type || req.query?.type
    const paymentId = req.body?.data?.id || req.query?.id
    if (type === 'payment' && paymentId) {
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
        const externalRef = (mpPayment && mpPayment.external_reference) ? String(mpPayment.external_reference) : null
        const userId = typeof meta?.userId === 'string' && meta.userId ? meta.userId : null
        const planCode = normalisePlanCode(meta?.planCode || meta?.planId)
        // Registrar pago con userId cuando esté disponible
        await recordPayment({ userId, listingId: null, amount, currency, status, providerRef: String(paymentId) })
        // Upsert crédito según estado del pago
        if (supabaseService && (planCode === 'basic' || planCode === 'premium')) {
          const creditStatus = status === 'succeeded' ? 'available' : (status === 'pending' ? 'pending' : 'cancelled')
          const prefId = (mpPayment && mpPayment.order && mpPayment.order.id) ? String(mpPayment.order.id) : null
          // Intentar actualizar crédito existente por preference_id o provider_ref; si no existe, crear
          const baseUpdate = {
            user_id: userId,
            plan_code: planCode,
            status: creditStatus,
            provider: 'mercadopago',
            provider_ref: String(paymentId),
            preference_id: prefId,
            expires_at: new Date(Date.now() + 30 * 24 * 60 * 60 * 1000).toISOString(),
          }
          try {
            // Upsert por provider_ref (si backend lo soporta)
            await supabaseService
              .from('publish_credits')
              .upsert(baseUpdate, { onConflict: 'provider_ref,provider' })
          } catch (e1) {
            console.warn('[webhook] upsert by provider_ref failed', e1?.message || e1)
          }
          if (prefId) {
            try {
              await supabaseService
                .from('publish_credits')
                .upsert(baseUpdate, { onConflict: 'preference_id,provider' })
            } catch (e2) {
              console.warn('[webhook] upsert by preference_id failed', e2?.message || e2)
            }
          }
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
    return res.json({ ok: true, status, amount, currency })
  } catch (err) {
    console.error('[payments/confirm] failed', err)
    return res.status(500).json({ ok: false, error: 'unexpected_error' })
  }
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
      .select('id,seller_id,seller_plan_expires')
      .eq('id', id)
      .single()
    if (error || !listing) return res.status(404).json({ error: 'not_found' })
    if (listing.seller_id !== user.id) return res.status(403).json({ error: 'forbidden' })
    const now = Date.now()
    const base = listing.seller_plan_expires ? Math.max(new Date(listing.seller_plan_expires).getTime(), now) : now
    const next = new Date(base + days * 24 * 60 * 60 * 1000).toISOString()
    const { error: upd } = await supabase
      .from('listings')
      .update({ seller_plan: 'featured', seller_plan_expires: next })
      .eq('id', id)
    if (upd) return res.status(500).json({ error: 'update_failed' })
    return res.json({ ok: true, sellerPlan: 'featured', sellerPlanExpires: next })
  } catch (err) {
    console.error('[highlight] failed', err)
    return res.status(500).json({ error: 'unexpected_error' })
  }
})
