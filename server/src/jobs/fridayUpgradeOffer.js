/**
 * Friday Upgrade Offer - Email Automation #3
 * Frecuencia: Viernes 11am (cron: 0 11 * * 5)
 * Audiencia: Usuarios con plan Free y listings activos
 * Contenido: Incentivo a upgrade con link directo a checkout MP
 */

const cron = require('node-cron')
const crypto = require('crypto')
const { getServerSupabaseClient } = require('../lib/supabaseClient')
const { sendMail, isMailConfigured } = require('../lib/mail')
const {
  BRAND,
  escapeHtml,
  formatPrice,
  normaliseImageUrl,
  buildUnsubscribeLink,
  buildBaseLayout,
} = require('../emails/emailBase')

// ============================================================================
// CONFIG
// ============================================================================

const AUTOMATION_TYPE = 'friday_upgrade'
const DEFAULT_CRON = '0 11 * * 5' // Viernes 11am
const DEFAULT_BATCH_LIMIT = 200
const COOLDOWN_DAYS = 14 // No spamear, 14 días entre envíos

const BENEFITS = [
  'Contacto directo por WhatsApp para cerrar más rápido',
  'Prioridad en el marketplace y hasta 14 días de destaque',
  'Hasta 8 fotos y difusión en redes sociales',
]

// Precios desde AVAILABLE_PLANS o fallback
function getPlanPrices() {
  try {
    const raw = process.env.AVAILABLE_PLANS
    if (!raw) throw new Error('No AVAILABLE_PLANS')
    const normalized = String(raw).trim()
      .replace(/^["']|["']$/g, '')
      .replace(/\\n/g, '\n')
    const plans = JSON.parse(normalized)
    const basic = plans.find(p => ['basic', 'destacada'].includes(String(p.code || p.id).toLowerCase()))
    const premium = plans.find(p => String(p.code || p.id).toLowerCase() === 'premium')
    return {
      basic: basic?.price || 9000,
      premium: premium?.price || 13000,
    }
  } catch {
    return { basic: 9000, premium: 13000 }
  }
}

// ============================================================================
// CHECKOUT LINK BUILDER
// ============================================================================

function buildUpgradeCheckoutLink({ sellerId, listingId, planTarget = 'basic', baseFront, baseApi }) {
  const prices = getPlanPrices()
  const amount = prices[planTarget] || prices.basic
  
  // Token firmado para seguridad
  const secret = String(process.env.CRON_SECRET || '')
  const exp = Date.now() + 7 * 24 * 60 * 60 * 1000 // 7 días
  const payload = `${sellerId}.${listingId}.${planTarget}.${exp}`
  const token = secret 
    ? crypto.createHmac('sha256', secret).update(payload).digest('base64url')
    : ''
  
  // Usar endpoint de checkout existente o crear preferencia MP directa
  // Por ahora usamos el endpoint de checkout con parámetros
  const params = new URLSearchParams({
    sid: sellerId,
    lid: listingId,
    plan: planTarget,
    exp: String(exp),
    t: token,
    utm_source: 'email',
    utm_medium: 'email',
    utm_campaign: 'friday_upgrade',
  })
  
  const cleanApi = (baseApi || process.env.SERVER_BASE_URL || baseFront).replace(/\/$/, '')
  return `${cleanApi}/api/checkout/upsell-whatsapp?${params.toString()}`
}

// ============================================================================
// DATA FETCHING
// ============================================================================

async function fetchFreePlanSellers(supabase, limit = DEFAULT_BATCH_LIMIT, excludeUserIds = []) {
  // Listings con plan free
  const { data: listings, error: listingsError } = await supabase
    .from('listings')
    .select('seller_id,id,title,price,price_currency,images,slug,plan,plan_code,created_at')
    .or('plan.eq.free,plan_code.eq.free')
    .in('status', ['active', 'published'])
    .order('created_at', { ascending: false })
    .limit(limit * 2)
  
  if (listingsError) {
    console.warn(`[${AUTOMATION_TYPE}] error fetching listings`, listingsError)
    return []
  }
  
  // Agrupar por seller, tomar el listing más reciente
  const bySeller = new Map()
  for (const l of listings || []) {
    if (!bySeller.has(l.seller_id)) {
      bySeller.set(l.seller_id, l)
    }
  }
  
  const sellerIds = [...bySeller.keys()]
  if (!sellerIds.length) return []
  
  // Excluir recent recipients
  const filteredIds = excludeUserIds.length
    ? sellerIds.filter(id => !excludeUserIds.includes(id))
    : sellerIds
  
  if (!filteredIds.length) return []
  
  // Fetch users
  const { data: users, error: usersError } = await supabase
    .from('users')
    .select('id,email,full_name')
    .in('id', filteredIds.slice(0, limit))
  
  if (usersError) {
    console.warn(`[${AUTOMATION_TYPE}] error fetching users`, usersError)
    return []
  }
  
  return (users || []).map(u => ({
    userId: u.id,
    email: u.email,
    fullName: u.full_name || 'Ciclista',
    listing: bySeller.get(u.id),
  })).filter(u => u.email && u.listing)
}

async function fetchRecentRecipients(supabase, days = COOLDOWN_DAYS) {
  const since = new Date(Date.now() - days * 24 * 60 * 60 * 1000).toISOString()
  const { data, error } = await supabase
    .from('email_automation_logs')
    .select('user_id')
    .eq('automation_type', AUTOMATION_TYPE)
    .gte('sent_at', since)
  
  if (error) return new Set()
  return new Set((data || []).map(r => r.user_id).filter(Boolean))
}

// ============================================================================
// EMAIL BUILDING
// ============================================================================

function buildFridayEmail({ seller, baseFront, baseApi }) {
  const userName = escapeHtml(seller.fullName?.split(' ')[0] || 'Ciclista')
  const listing = seller.listing
  const prices = getPlanPrices()
  
  const listingImage = normaliseImageUrl(listing.images?.[0], baseFront)
  const listingLink = `${baseFront}/listing/${encodeURIComponent(listing.slug || listing.id)}`
  const listingPrice = formatPrice(listing.price, listing.price_currency)
  
  // Checkout links para cada plan
  const checkoutBasic = buildUpgradeCheckoutLink({
    sellerId: seller.userId,
    listingId: listing.id,
    planTarget: 'basic',
    baseFront,
    baseApi,
  })
  
  const checkoutPremium = buildUpgradeCheckoutLink({
    sellerId: seller.userId,
    listingId: listing.id,
    planTarget: 'premium',
    baseFront,
    baseApi,
  })
  
  // Benefits list
  const benefitsHtml = BENEFITS.map(b => `
    <tr>
      <td style="padding:8px 0;vertical-align:top;width:28px;">
        <span style="display:inline-block;width:22px;height:22px;background:#22c55e;color:#fff;border-radius:50%;text-align:center;line-height:22px;font-size:14px;font-weight:700;">✓</span>
      </td>
      <td style="padding:8px 0;vertical-align:top;">
        <span style="color:${BRAND.colors.text};font-size:15px;line-height:1.5;">${escapeHtml(b)}</span>
      </td>
    </tr>
  `).join('')
  
  const content = `
    <tr>
      <td style="padding:32px 24px 16px;">
        <div style="display:inline-block;background:#fef3c7;color:#92400e;padding:6px 14px;border-radius:20px;font-size:12px;font-weight:700;margin-bottom:12px;letter-spacing:0.02em;">OFERTA ESPECIAL</div>
        <h1 style="margin:0 0 8px;font-size:26px;color:${BRAND.colors.text};font-weight:700;">Tu publicación puede rendir más</h1>
        <p style="margin:0;color:${BRAND.colors.muted};font-size:15px;line-height:1.5;">
          Hola ${userName}, pasate a un plan pago y conseguí comprador más rápido.
        </p>
      </td>
    </tr>
    
    <!-- Listing preview -->
    <tr>
      <td style="padding:0 24px 24px;">
        <table role="presentation" width="100%" cellspacing="0" cellpadding="0" style="border:1px solid ${BRAND.colors.border};border-radius:12px;background:${BRAND.colors.light};">
          <tr>
            <td style="padding:20px;">
              <table role="presentation" width="100%" cellspacing="0" cellpadding="0">
                <tr>
                  <td style="width:120px;vertical-align:top;">
                    <a href="${listingLink}">
                      <img src="${listingImage}" style="width:120px;height:90px;object-fit:cover;border-radius:8px;display:block;">
                    </a>
                  </td>
                  <td style="padding-left:18px;vertical-align:top;">
                    <div style="font-weight:600;color:${BRAND.colors.text};font-size:16px;margin-bottom:6px;">${escapeHtml(listing.title)}</div>
                    ${listingPrice ? `<div style="color:${BRAND.colors.accent};font-weight:700;font-size:20px;margin-bottom:6px;">${listingPrice}</div>` : ''}
                    <div style="font-size:13px;color:#dc2626;font-weight:600;">⚠️ Plan actual: Gratis</div>
                  </td>
                </tr>
              </table>
            </td>
          </tr>
        </table>
      </td>
    </tr>
    
    <!-- Benefits -->
    <tr>
      <td style="padding:0 24px 24px;">
        <h2 style="margin:0 0 16px;font-size:18px;color:${BRAND.colors.text};">¿Qué ganás al hacer upgrade?</h2>
        <table role="presentation" width="100%" cellspacing="0" cellpadding="0">
          ${benefitsHtml}
        </table>
      </td>
    </tr>
    
    <!-- Pricing cards -->
    <tr>
      <td style="padding:0 24px 24px;">
        <table role="presentation" width="100%" cellspacing="0" cellpadding="0">
          <tr>
            <td style="padding:8px;width:50%;vertical-align:top;">
              <div style="border:2px solid ${BRAND.colors.border};border-radius:12px;padding:20px;text-align:center;">
                <div style="font-size:14px;color:${BRAND.colors.muted};margin-bottom:8px;">Plan Básico</div>
                <div style="font-size:28px;font-weight:700;color:${BRAND.colors.text};margin-bottom:4px;">${formatPrice(prices.basic)}</div>
                <div style="font-size:12px;color:${BRAND.colors.muted};margin-bottom:16px;">por publicación</div>
                <a href="${checkoutBasic}" style="display:block;padding:12px;background:${BRAND.colors.primary};color:#fff;text-decoration:none;border-radius:8px;font-weight:700;font-size:14px;">Elegir Básico</a>
              </div>
            </td>
            <td style="padding:8px;width:50%;vertical-align:top;">
              <div style="border:2px solid ${BRAND.colors.accent};border-radius:12px;padding:20px;text-align:center;position:relative;">
                <div style="position:absolute;top:-10px;left:50%;transform:translateX(-50%);background:${BRAND.colors.accent};color:#fff;padding:4px 12px;border-radius:12px;font-size:11px;font-weight:700;">RECOMENDADO</div>
                <div style="font-size:14px;color:${BRAND.colors.muted};margin-bottom:8px;">Plan Premium</div>
                <div style="font-size:28px;font-weight:700;color:${BRAND.colors.text};margin-bottom:4px;">${formatPrice(prices.premium)}</div>
                <div style="font-size:12px;color:${BRAND.colors.muted};margin-bottom:16px;">por publicación</div>
                <a href="${checkoutPremium}" style="display:block;padding:12px;background:${BRAND.colors.accent};color:#fff;text-decoration:none;border-radius:8px;font-weight:700;font-size:14px;">Elegir Premium</a>
              </div>
            </td>
          </tr>
        </table>
      </td>
    </tr>
    
    <!-- Main CTA -->
    <tr>
      <td style="padding:0 24px 32px;text-align:center;">
        <a href="${checkoutPremium}" style="display:inline-block;padding:18px 36px;background:${BRAND.colors.primary};color:#fff;text-decoration:none;border-radius:12px;font-weight:700;font-size:16px;">Hacer upgrade en 1 clic →</a>
        <p style="margin:12px 0 0;font-size:12px;color:#94a3b8;">Link seguro · Checkout con MercadoPago</p>
      </td>
    </tr>
  `
  
  const unsubscribeUrl = buildUnsubscribeLink(seller.email, baseFront)
  const html = buildBaseLayout({
    title: `Tu publicación puede rendir más · ${BRAND.name}`,
    content,
    baseFront,
    unsubscribeUrl,
    userEmail: seller.email,
  })
  
  // Text version
  const textLines = [
    `Tu publicación puede rendir más`,
    ``,
    `Hola ${userName},`,
    ``,
    `Tu publicación "${listing.title}" está en plan Gratis.`,
    ``,
    `Al hacer upgrade obtenés:`,
    ...BENEFITS.map(b => `✓ ${b}`),
    ``,
    `Plan Básico: ${formatPrice(prices.basic)}`,
    `${checkoutBasic}`,
    ``,
    `Plan Premium: ${formatPrice(prices.premium)}`,
    `${checkoutPremium}`,
    ``,
    `Desuscribirse: ${unsubscribeUrl}`,
  ]
  
  return {
    subject: `Tu publicación puede rendir más (upgrade en 1 clic)`,
    html,
    text: textLines.join('\n'),
  }
}

// ============================================================================
// CORE FUNCTIONS
// ============================================================================

async function recordSend(supabase, userId, email, metadata = {}) {
  try {
    await supabase.from('email_automation_logs').insert({
      automation_type: AUTOMATION_TYPE,
      user_id: userId,
      email_to: email,
      metadata,
    })
  } catch (e) {
    console.warn(`[${AUTOMATION_TYPE}] failed to record send`, e?.message)
  }
}

async function sendFridayEmails({ dryRun = false, limit = DEFAULT_BATCH_LIMIT, force = false } = {}) {
  if (!isMailConfigured()) {
    throw new Error('Mail no configurado (RESEND_API_KEY o SMTP_*)')
  }
  
  const supabase = getServerSupabaseClient()
  const baseFront = (process.env.FRONTEND_URL || BRAND.url).split(',')[0].trim().replace(/\/$/, '')
  const baseApi = process.env.SERVER_BASE_URL || baseFront
  
  // Fetch recent recipients (cooldown)
  const recentRecipients = force ? new Set() : await fetchRecentRecipients(supabase, COOLDOWN_DAYS)
  
  // Fetch free plan sellers
  const sellers = await fetchFreePlanSellers(supabase, limit, Array.from(recentRecipients))
  if (!sellers.length) {
    console.info(`[${AUTOMATION_TYPE}] no free plan sellers to email`)
    return { sent: 0, recipients: [], dryRun }
  }
  
  const results = []
  let sent = 0
  
  for (const seller of sellers) {
    const { subject, html, text } = buildFridayEmail({ seller, baseFront, baseApi })
    
    if (dryRun) {
      results.push({
        userId: seller.userId,
        email: seller.email,
        subject,
        listingTitle: seller.listing.title,
        preview: html.substring(0, 500) + '...',
      })
      continue
    }
    
    try {
      await sendMail({
        from: process.env.SMTP_FROM || `${BRAND.name} <${BRAND.email}>`,
        to: seller.email,
        subject,
        html,
        text,
        headers: { 'List-Unsubscribe': `<${buildUnsubscribeLink(seller.email, baseFront)}>` },
      })
      await recordSend(supabase, seller.userId, seller.email, {
        listing_id: seller.listing.id,
        listing_title: seller.listing.title,
      })
      sent++
      await new Promise(r => setTimeout(r, 1500))
    } catch (e) {
      console.warn(`[${AUTOMATION_TYPE}] send failed for ${seller.email}`, e?.message)
    }
  }
  
  console.info(`[${AUTOMATION_TYPE}] sent: ${sent}, dryRun: ${dryRun}`)
  return {
    sent,
    dryRun,
    recipients: dryRun ? results : sellers.map(s => ({ userId: s.userId, email: s.email })),
  }
}

// ============================================================================
// CRON JOB
// ============================================================================

function startFridayUpgradeOfferJob() {
  if (process.env.FRIDAY_UPGRADE_ENABLED !== 'true') {
    console.info(`[${AUTOMATION_TYPE}] disabled (FRIDAY_UPGRADE_ENABLED != "true")`)
    return
  }
  
  const schedule = process.env.FRIDAY_UPGRADE_CRON || DEFAULT_CRON
  const tz = process.env.FRIDAY_UPGRADE_TZ || 'America/Argentina/Buenos_Aires'
  
  const task = cron.schedule(schedule, async () => {
    try {
      await sendFridayEmails()
    } catch (err) {
      console.error(`[${AUTOMATION_TYPE}] job failed`, err)
    }
  }, { timezone: tz })
  
  task.start()
  console.info(`[${AUTOMATION_TYPE}] job started with cron ${schedule} tz ${tz}`)
}

// ============================================================================
// EXPORTS
// ============================================================================

module.exports = {
  startFridayUpgradeOfferJob,
  sendFridayEmails,
  AUTOMATION_TYPE,
}
