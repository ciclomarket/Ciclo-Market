// server/src/lib/index.js
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

const app = express()
app.use(express.json())

// CORS — admite múltiples dominios (coma-separado) y cookies/sesión si las usás
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

app.get('/', (_req, res) => {
  res.send('Ciclo Market API ready')
})

// ---------- Mercado Pago (SDK v2) ----------
const accessToken = process.env.MERCADOPAGO_ACCESS_TOKEN
if (!accessToken) {
  console.warn('[checkout] MERCADOPAGO_ACCESS_TOKEN not configured – payments will fail.')
}
const mpClient = new MercadoPagoConfig({ accessToken: accessToken || '' })
const preferenceClient = new Preference(mpClient)

// Aliases y helpers de planes
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
  try {
    // --- Inputs ---
    const requestPlanCode = normalisePlanCode(req.body?.planCode || req.body?.plan || req.body?.planId)
    const requestPlanId = req.body?.planId || req.body?.plan || requestPlanCode || 'premium'
    const amountFromBody = Number(req.body?.amount)
    const autoRenew = Boolean(req.body?.autoRenew ?? true)

    // --- Monto ---
    let amount = Number.isFinite(amountFromBody) && amountFromBody > 0 ? amountFromBody : 0

    // 1) De AVAILABLE_PLANS (JSON en env)
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
    // 2) Fallback por código de plan
    if (!amount && requestPlanCode) {
      amount = fallbackPriceFor(requestPlanCode)
    }
    // 3) DEFAULT_PLAN_PRICE
    if (!amount && process.env.DEFAULT_PLAN_PRICE) {
      const fallback = Number(process.env.DEFAULT_PLAN_PRICE)
      if (!Number.isNaN(fallback) && fallback > 0) amount = fallback
    }

    const unitPrice = Number.isFinite(amount) && amount > 0 ? Math.round(amount) : 0

    // --- Back URLs ---
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
      back_urls: {
        success: successUrl,
        failure: failureUrl,
        pending: pendingUrl,
      },
      auto_return: 'approved',
      metadata: { planId: requestPlanId, planCode: requestPlanCode, autoRenew },
      ...(notificationUrl ? { notification_url: notificationUrl } : {}),
    }

    // Crear preferencia
    const mpRes = await preferenceClient.create({ body: preference })
    const url = mpRes.init_point || null

    if (!url) {
      console.error('checkout error: missing init_point', mpRes)
      return res.status(502).json({ error: 'missing_init_point' })
    }
    // Guard anti-sandbox
    if (url.includes('sandbox.mercadopago.com')) {
      console.error('Received sandbox init_point unexpectedly:', url)
      return res.status(500).json({ error: 'received_sandbox_init_point' })
    }

    // OK: solo producción
    console.log('[checkout] init_point:', url)
    return res.json({ url })
  } catch (e) {
    console.error('[checkout] init failed', e?.message || e)
    return res.status(500).json({ error: 'checkout_failed' })
  }
})

// Webhook de MP (si usás notificaciones)
app.post('/api/webhooks/mercadopago', (req, res) => {
  console.log('[MP webhook]', JSON.stringify(req.body))
  res.sendStatus(200)
})

const PORT = process.env.PORT || 4000
app.listen(PORT, '0.0.0.0', () => {
  console.log(`API on :${PORT}`)
  startRenewalNotificationJob()
})