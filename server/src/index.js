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
const { sendMail, isMailConfigured } = require('./lib/mail')
const { getServerSupabaseClient } = require('./lib/supabaseClient')
const { startRenewalNotificationJob } = (() => {
  try { return require('./jobs/renewalNotifier') } catch { return {} }
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

app.get('/sitemap.xml', (_req, res) => {
  res.type('application/xml')
  res.sendFile(path.join(publicDir, 'sitemap.xml'))
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
    const { data: listing, error } = await supabase
      .from('listings')
      .select('id, title, price, price_currency, description, images, status')
      .eq('id', id)
      .single()

    const baseFront = (process.env.FRONTEND_URL || '').split(',')[0]?.trim() || 'https://ciclomarket.ar'
    const canonicalUrl = `${baseFront}/listing/${encodeURIComponent(id)}`
    const fallbackImg = process.env.SHARE_FALLBACK_IMAGE || `${baseFront}/og-preview.png`

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

    // Imagen principal
    let ogImage = null
    if (Array.isArray(listing.images)) {
      const first = listing.images[0]
      ogImage = typeof first === 'string' ? first : (first && first.url) || null
    }
    if (!ogImage) ogImage = fallbackImg

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
    const desc =
      (listing.description || '').replace(/\s+/g, ' ').slice(0, 180) ||
      'Mirá los detalles en Ciclo Market.'

    const html = `<!doctype html><html lang="es"><head>
<meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1">
<title>${escapeHtml(title)} | Ciclo Market</title>

<meta property="og:title" content="${escapeHtml(title)}" />
<meta property="og:description" content="${escapeHtml(desc)}" />
<meta property="og:image" content="${ogImage}" />
<meta property="og:url" content="${canonicalUrl}" />
<meta property="og:type" content="product" />
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
  const userId = req.params.id
  if (!userId) return res.status(400).json({ error: 'missing_user_id' })
  try {
    const supabase = getServerSupabaseClient()
    const { data, error } = await supabase.auth.admin.getUserById(userId)
    if (error) {
      console.warn('[users] admin getUser failed', error)
      return res.status(500).json({ error: 'lookup_failed' })
    }
    const email = data?.user?.email ?? null
    if (!email) return res.status(404).json({ error: 'email_not_found' })
    return res.json({ email })
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
      // Aplicar destaque 7 días: setear seller_plan básico por 7 días desde hoy
      const expires = new Date(Date.now() + 7 * 24 * 60 * 60 * 1000).toISOString()
      const { error: upd } = await supabase
        .from('listings')
        .update({ seller_plan: 'basic', seller_plan_expires: expires })
        .eq('id', data.listing_id)
      if (upd) console.warn('[share-boost] apply boost failed', upd)
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

/* ----------------------------- Contacts + Reviews ------------------------- */
// Registra un evento de contacto (whatsapp/email) para habilitar reseñas 24h después
app.post('/api/contacts/log', async (req, res) => {
  try {
    const { sellerId, listingId, buyerId, type } = req.body || {}
    if (!sellerId || !type) return res.status(400).json({ error: 'missing_fields' })
    const supabase = getServerSupabaseClient()
    const payload = {
      seller_id: sellerId,
      buyer_id: buyerId || null,
      listing_id: listingId || null,
      type,
    }
    const { error } = await supabase.from('contact_events').insert([payload])
    if (error) {
      console.warn('[contacts] insert failed', error)
    }
    return res.json({ ok: true })
  } catch (err) {
    console.warn('[contacts] log failed', err)
    return res.status(500).json({ error: 'unexpected_error' })
  }
})

// Devuelve reseñas + resumen por vendedor
app.get('/api/reviews/:sellerId', async (req, res) => {
  try {
    const { sellerId } = req.params
    const supabase = getServerSupabaseClient()
    const { data: reviews, error } = await supabase
      .from('reviews')
      .select('id,seller_id,buyer_id,listing_id,rating,tags,comment,created_at')
      .eq('seller_id', sellerId)
      .order('created_at', { ascending: false })
    if (error) return res.status(500).json({ error: 'fetch_failed' })
    const count = reviews?.length || 0
    const avgRating = count ? (reviews.reduce((acc, r) => acc + (r.rating || 0), 0) / count) : 0
    return res.json({ reviews: reviews || [], summary: { sellerId, count, avgRating } })
  } catch (err) {
    console.warn('[reviews] fetch failed', err)
    return res.status(500).json({ error: 'unexpected_error' })
  }
})

// ¿Puede buyer reseñar a seller? Requiere evento de contacto > 24h y no haber reseñado antes
app.get('/api/reviews/can-review', async (req, res) => {
  try {
    const buyerId = String(req.query.buyerId || '')
    const sellerId = String(req.query.sellerId || '')
    if (!buyerId || !sellerId) return res.status(400).json({ allowed: false })
    const supabase = getServerSupabaseClient()
    const cutoffIso = new Date(Date.now() - 24 * 60 * 60 * 1000).toISOString()
    const { data: contacts } = await supabase
      .from('contact_events')
      .select('id,created_at')
      .eq('seller_id', sellerId)
      .eq('buyer_id', buyerId)
      .lte('created_at', cutoffIso)
      .limit(1)
    if (!contacts || contacts.length === 0) return res.json({ allowed: false, reason: 'Esperá 24 h desde el primer contacto.' })
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
    const supabase = getServerSupabaseClient()
    const payload = {
      seller_id: sellerId,
      buyer_id: buyerId,
      listing_id: listingId || null,
      rating: r,
      tags: Array.isArray(tags) ? tags : null,
      comment: typeof comment === 'string' && comment.trim() ? String(comment).slice(0, 1000) : null,
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

    const notificationUrl = process.env.SERVER_BASE_URL
      ? `${process.env.SERVER_BASE_URL.replace(/\/$/, '')}/api/webhooks/mercadopago`
      : undefined

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
      metadata: { planId: requestPlanId, planCode: requestPlanCode, autoRenew },
      ...(notificationUrl ? { notification_url: notificationUrl } : {}),
    }

    const mpStart = Date.now()
    const mpRes = await preferenceClient.create({ body: preference })
    console.log('[checkout] preferenceClient.create duration:', Date.now() - mpStart, 'ms')
    const url = mpRes.init_point || null

    if (!url) {
      console.error('checkout error: missing_init_point', mpRes)
      return res.status(502).json({ error: 'missing_init_point' })
    }
    if (url.includes('sandbox.mercadopago.com')) {
      console.error('Received sandbox init_point unexpectedly:', url)
      return res.status(500).json({ error: 'received_sandbox_init_point' })
    }

    console.log('[checkout] init_point:', url)
    return res.json({ url })
  } catch (e) {
    console.error('[checkout] init failed', e?.message || e)
    return res.status(500).json({ error: 'checkout_failed' })
  } finally {
    console.log('[checkout] total handler duration:', Date.now() - startedAt, 'ms')
  }
})

/* ----------------------------- Webhooks MP --------------------------------- */
app.post('/api/webhooks/mercadopago', (req, res) => {
  console.log('[MP webhook]', JSON.stringify(req.body))
  res.sendStatus(200)
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
