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
const { startRenewalNotificationJob } = require('./jobs/renewalNotifier')
const { sendMail, isMailConfigured } = require('./lib/mail')
const { getServerSupabaseClient } = require('./lib/supabaseClient')
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
const allowed = (process.env.FRONTEND_URL || '')
  .split(',')
  .map((s) => s.trim())
  .filter(Boolean)

app.use(
  cors({
    origin: allowed.length ? allowed : true,
    credentials: true,
  })
)
// Preflight
app.options('*', cors())

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
  const event = typeof req.body?.event === 'string' ? req.body.event.toLowerCase() : ''
  const questionId = req.body?.questionId

  if (!questionId || (event !== 'asked' && event !== 'answered')) {
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

  const createNotification = async ({
    userId,
    title,
    body,
    cta,
    metadata,
  }) => {
    if (!userId) return
    try {
      await supabase
        .from('notifications')
        .insert({
          user_id: userId,
          type: 'question',
          title,
          body,
          metadata,
          cta_url: cta,
        })
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
    const html = `
      <div style="font-family: Arial, sans-serif; line-height: 1.5; color: #14212e;">
        <h2 style="color:#0c1723;">Tenés una nueva consulta sobre ${escapeHtml(listingTitle)}</h2>
        <p>Hola ${sellerName},</p>
        <p>Un comprador dejó la siguiente pregunta:</p>
        <blockquote style="margin:16px 0;padding:12px 16px;border-left:4px solid #0c72ff;background:#f3f6fb;">
          ${safeQuestion}
        </blockquote>
        <p>Respondé desde la publicación para que todos los interesados vean la respuesta.</p>
        <p>
          <a href="${listingUrl}" style="display:inline-block;margin-top:12px;padding:10px 16px;background:#0c72ff;color:#fff;text-decoration:none;border-radius:6px;">
            Ver publicación
          </a>
        </p>
        <hr style="margin:24px 0;border:none;border-top:1px solid #e1e5eb;" />
        <p style="font-size:12px;color:#6b7280;">Este correo se generó automáticamente desde Ciclo Market.</p>
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
        console.warn('[questions] email to seller failed', mailError)
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
    const html = `
      <div style="font-family: Arial, sans-serif; line-height: 1.5; color: #14212e;">
        <h2 style="color:#0c1723;">El vendedor respondió tu consulta</h2>
        <p>Consulta original:</p>
        <blockquote style="margin:16px 0;padding:12px 16px;border-left:4px solid #94a3b8;background:#f8fafc;">
          ${safeQuestion}
        </blockquote>
        <p>Respuesta del vendedor:</p>
        <blockquote style="margin:16px 0;padding:12px 16px;border-left:4px solid #10b981;background:#ecfdf5;">
          ${safeAnswer}
        </blockquote>
        <p>
          <a href="${listingUrl}" style="display:inline-block;margin-top:12px;padding:10px 16px;background:#0c72ff;color:#fff;text-decoration:none;border-radius:6px;">
            Ver publicación
          </a>
        </p>
        <hr style="margin:24px 0;border:none;border-top:1px solid #e1e5eb;" />
        <p style="font-size:12px;color:#6b7280;">Este correo se generó automáticamente desde Ciclo Market.</p>
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
        console.warn('[questions] email to buyer failed', mailError)
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
    })

    return res.json({ ok: true, email: emailStatus })
  }

  return res.status(400).json({ error: 'unsupported_event' })
})

app.get('/api/debug/smtp', async (_req, res) => {
  if (!isMailConfigured()) {
    return res.status(503).json({ ok: false, error: 'smtp_not_configured' })
  }
  try {
    await sendMail({
      from: process.env.SMTP_FROM || `Ciclo Market <${process.env.SMTP_USER}>`,
      to: process.env.SMTP_TEST_TO || process.env.SMTP_USER,
      subject: 'Brevo SMTP test',
      text: 'Probando conexión desde Render',
    })
    return res.json({ ok: true })
  } catch (error) {
    console.error('[debug] smtp test failed', error)
    return res.status(500).json({ ok: false, error: error.message || 'smtp_failed' })
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
  startRenewalNotificationJob()
})
