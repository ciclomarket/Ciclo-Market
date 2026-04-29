const crypto = require('crypto')
const { MercadoPagoConfig, Preference } = require('mercadopago')

function getMpClient() {
  const token = String(process.env.MERCADOPAGO_ACCESS_TOKEN || '').trim()
  if (!token) return null
  try {
    return new MercadoPagoConfig({ accessToken: token })
  } catch {
    return null
  }
}

function parseAvailablePlans() {
  const raw = String(process.env.AVAILABLE_PLANS || '').trim()
  if (!raw) return []
  try {
    const normalized = raw.replace(/^['"]|['"]$/g, '').replace(/\\n/g, '\n')
    const parsed = JSON.parse(normalized)
    if (Array.isArray(parsed)) return parsed
    if (parsed && typeof parsed === 'object') {
      const values = Object.values(parsed)
      if (values.every((v) => v && typeof v === 'object')) {
        return values.map((v, idx) => ({ id: Object.keys(parsed)[idx], ...(v || {}) }))
      }
    }
    return []
  } catch {
    return []
  }
}

function resolvePublicFrontendUrl() {
  const raw = String(process.env.FRONTEND_URL || '').trim()
  const parts = raw.split(',').map((s) => s.trim()).filter(Boolean)
  if (!parts.length) return 'https://www.ciclomarket.ar'
  const preferred = parts.find((url) => /https:\/\/www\.ciclomarket\.ar/i.test(url))
  return (preferred || parts[0]).replace(/\/$/, '')
}

function fallbackPrice(planCode) {
  if (planCode === 'premium') return 13000
  if (planCode === 'pro') return 16000
  if (planCode === 'basic') return 9000
  return 0
}

function resolvePlanPrice(planCode) {
  const plans = parseAvailablePlans()
  const match = plans.find((p) => String(p?.code || p?.id || '').toLowerCase() === String(planCode).toLowerCase())
  const price = Number(match?.price)
  if (Number.isFinite(price) && price > 0) return price
  return fallbackPrice(planCode)
}

function createUpgradeToken(payload) {
  const secret = String(process.env.CRON_SECRET || process.env.NEWSLETTER_UNSUB_SECRET || '').trim()
  if (!secret) throw new Error('checkout_secret_missing')
  const body = Buffer.from(JSON.stringify(payload)).toString('base64url')
  const sig = crypto.createHmac('sha256', secret).update(body).digest('base64url')
  return `v1.${body}.${sig}`
}

function createBundleUpgradeToken({ userId, listingIds, planCode, campaign, discountPct = 50, exp }) {
  const secret = String(process.env.CRON_SECRET || process.env.NEWSLETTER_UNSUB_SECRET || '').trim()
  if (!secret) throw new Error('checkout_secret_missing')
  const payload = { userId, listingIds, planCode, campaign, discountPct, bundle: true, exp }
  const body = Buffer.from(JSON.stringify(payload)).toString('base64url')
  const sig = crypto.createHmac('sha256', secret).update(body).digest('base64url')
  return `v1.${body}.${sig}`
}

function verifyUpgradeToken(token) {
  const secret = String(process.env.CRON_SECRET || process.env.NEWSLETTER_UNSUB_SECRET || '').trim()
  if (!secret || !token) return null
  const [v, body, sig] = String(token).split('.')
  if (v !== 'v1' || !body || !sig) return null
  const expected = crypto.createHmac('sha256', secret).update(body).digest('base64url')
  if (expected !== sig) return null
  try {
    const payload = JSON.parse(Buffer.from(body, 'base64url').toString('utf8'))
    if (payload?.exp && Number(payload.exp) < Date.now()) return null
    return payload
  } catch {
    return null
  }
}

async function createListingUpgradePreference({
  userId,
  userEmail,
  listingId,
  planCode,
  campaign,
  discountPct = 0,
  metadata = {},
}) {
  const mpClient = getMpClient()
  if (!mpClient) throw new Error('payments_unavailable')

  const cleanPlan = String(planCode || '').trim().toLowerCase()
  if (!['premium', 'pro', 'basic'].includes(cleanPlan)) throw new Error('invalid_plan')

  const baseAmount = resolvePlanPrice(cleanPlan)
  if (!Number.isFinite(baseAmount) || baseAmount <= 0) throw new Error('amount_not_configured')

  const pct = Math.max(0, Math.min(90, Number(discountPct) || 0))
  const finalAmount = Math.round(baseAmount * (1 - pct / 100))
  const checkoutRef = typeof crypto.randomUUID === 'function'
    ? `mb_${crypto.randomUUID()}`
    : `mb_${Date.now()}_${Math.random().toString(16).slice(2)}`

  const front = resolvePublicFrontendUrl()
  const publicBase = String(process.env.PUBLIC_BASE_URL || process.env.SERVER_BASE_URL || '').trim().replace(/\/$/, '')

  const pref = new Preference(mpClient)
  const response = await pref.create({
    body: {
      external_reference: checkoutRef,
      items: [
        {
          id: `plan_${cleanPlan}_${campaign || 'email'}`,
          title: cleanPlan === 'pro' ? 'Plan Pro' : cleanPlan === 'premium' ? 'Plan Premium' : 'Plan Básico',
          description: `Upgrade listing ${listingId}`,
          quantity: 1,
          unit_price: finalAmount,
          currency_id: 'ARS',
        },
      ],
      payer: { email: userEmail || undefined },
      metadata: {
        userId,
        listingId,
        planCode: cleanPlan,
        campaign: campaign || null,
        discount_pct: pct,
        checkoutRef,
        ...metadata,
      },
      back_urls: {
        success: `${front}/checkout/success`,
        failure: `${front}/checkout/failure`,
        pending: `${front}/checkout/pending`,
      },
      ...(publicBase ? { notification_url: `${publicBase}/api/mp/webhook` } : {}),
      auto_return: 'approved',
      statement_descriptor: 'CICLO MARKET',
    },
  })

  const initPoint = response?.init_point || response?.sandbox_init_point
  if (!initPoint) throw new Error('mp_init_point_missing')

  return {
    url: initPoint,
    preferenceId: response?.id || null,
    amount: finalAmount,
    baseAmount,
    discountPct: pct,
    checkoutRef,
  }
}

async function createBundleUpgradePreference({
  userId,
  userEmail,
  listingIds,
  planCode,
  campaign,
  bundleDiscountPct = 50,
  metadata = {},
}) {
  const mpClient = getMpClient()
  if (!mpClient) throw new Error('payments_unavailable')

  const cleanPlan = String(planCode || '').trim().toLowerCase()
  if (!['premium', 'pro', 'basic'].includes(cleanPlan)) throw new Error('invalid_plan')

  const count = Math.max(1, Array.isArray(listingIds) ? listingIds.length : 1)
  const unitPrice = resolvePlanPrice(cleanPlan)
  if (!Number.isFinite(unitPrice) || unitPrice <= 0) throw new Error('amount_not_configured')

  const baseAmount = unitPrice * count
  const pct = Math.max(0, Math.min(90, Number(bundleDiscountPct) || 0))
  const finalAmount = Math.round(baseAmount * (1 - pct / 100))
  
  const checkoutRef = typeof crypto.randomUUID === 'function'
    ? `bundle_${crypto.randomUUID()}`
    : `bundle_${Date.now()}_${Math.random().toString(16).slice(2)}`

  const front = resolvePublicFrontendUrl()
  const publicBase = String(process.env.PUBLIC_BASE_URL || process.env.SERVER_BASE_URL || '').trim().replace(/\/$/, '')

  const planLabel = cleanPlan === 'pro' ? 'Plan Pro' : cleanPlan === 'premium' ? 'Plan Premium' : 'Plan Básico'

  const pref = new Preference(mpClient)
  const response = await pref.create({
    body: {
      external_reference: checkoutRef,
      items: [
        {
          id: `bundle_${cleanPlan}_${count}x_${campaign || 'email'}`,
          title: `${planLabel} Bundle (${count} publicaciones)`,
          description: `Upgrade ${count} listings: ${(listingIds || []).join(', ')}`,
          quantity: 1,
          unit_price: finalAmount,
          currency_id: 'ARS',
        },
      ],
      payer: { email: userEmail || undefined },
      metadata: {
        userId,
        listingIds: listingIds || [],
        planCode: cleanPlan,
        campaign: campaign || null,
        bundle: true,
        bundle_count: count,
        discount_pct: pct,
        checkoutRef,
        ...metadata,
      },
      back_urls: {
        success: `${front}/checkout/success`,
        failure: `${front}/checkout/failure`,
        pending: `${front}/checkout/pending`,
      },
      ...(publicBase ? { notification_url: `${publicBase}/api/mp/webhook` } : {}),
      auto_return: 'approved',
      statement_descriptor: 'CICLO MARKET',
    },
  })

  const initPoint = response?.init_point || response?.sandbox_init_point
  if (!initPoint) throw new Error('mp_init_point_missing')

  return {
    url: initPoint,
    preferenceId: response?.id || null,
    amount: finalAmount,
    baseAmount,
    discountPct: pct,
    checkoutRef,
    count,
  }
}

module.exports = {
  createListingUpgradePreference,
  createBundleUpgradePreference,
  createUpgradeToken,
  createBundleUpgradeToken,
  verifyUpgradeToken,
  resolvePlanPrice,
}
