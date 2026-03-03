/**
 * Monday New Arrivals - Email Automation #1
 * Frecuencia: Lunes 9am (cron: 0 9 * * 1)
 * Audiencia: Usuarios con user_notification_settings.marketing_emails = true
 * Contenido: Últimos 8 ingresos de la semana
 */

const cron = require('node-cron')
const { getServerSupabaseClient } = require('../lib/supabaseClient')
const { sendMail, isMailConfigured } = require('../lib/mail')
const {
  BRAND,
  escapeHtml,
  buildUnsubscribeLink,
  buildBaseLayout,
  buildHeroSection,
  buildProductGrid,
  buildCTAButton,
  buildListingText,
} = require('../emails/emailBase')

// ============================================================================
// CONFIG
// ============================================================================

const AUTOMATION_TYPE = 'monday_new_arrivals'
const DEFAULT_CRON = '0 9 * * 1' // Lunes 9am
const DEFAULT_BATCH_LIMIT = 200
const LISTINGS_COUNT = 8
const COOLDOWN_DAYS = 7 // No reenviar a mismo usuario en 7 días

// ============================================================================
// DATA FETCHING
// ============================================================================

async function fetchLatestListings(supabase, limit = LISTINGS_COUNT) {
  const since = new Date(Date.now() - 7 * 24 * 60 * 60 * 1000).toISOString() // Últimos 7 días
  
  const { data, error } = await supabase
    .from('listings')
    .select('id,title,slug,price,price_currency,images,brand,model,location,seller_location,created_at,status')
    .in('status', ['active', 'published'])
    .gte('created_at', since)
    .order('created_at', { ascending: false })
    .limit(limit)
  
  if (error) {
    console.warn(`[${AUTOMATION_TYPE}] error fetching listings`, error)
    return []
  }
  return data || []
}

async function fetchNewsletterSubscribers(supabase, limit = DEFAULT_BATCH_LIMIT, excludeUserIds = []) {
  let query = supabase
    .from('user_notification_settings')
    .select('user_id, marketing_emails, users!inner(id,email,full_name)')
    .eq('marketing_emails', true)
    .limit(limit)
  
  if (excludeUserIds.length > 0) {
    query = query.not('user_id', 'in', `(${excludeUserIds.join(',')})`)
  }
  
  const { data, error } = await query
  
  if (error) {
    console.warn(`[${AUTOMATION_TYPE}] error fetching subscribers`, error)
    return []
  }
  
  return (data || []).map(row => ({
    userId: row.user_id,
    email: row.users?.email,
    fullName: row.users?.full_name || 'Ciclista',
  })).filter(u => u.email)
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

function buildMondayEmail({ subscriber, listings, baseFront }) {
  const userName = escapeHtml(subscriber.fullName?.split(' ')[0] || 'Ciclista')
  const year = new Date().getFullYear()
  
  // Construir contenido con grid ordenado
  const hero = buildHeroSection({
    title: '¡Nuevos ingresos de la semana!',
    subtitle: `Hola ${userName}, estas son las últimas bicis que ingresaron al marketplace.`,
    baseFront,
  })
  
  // Grid de productos - 2 columnas ordenado
  let productGrid = `
  <!-- PRODUCT GRID -->
  <table align="center" border="0" cellpadding="0" cellspacing="0" role="presentation" style="width:100%;">
    <tr>
      <td style="padding:10px 20px 20px;">
        <table role="presentation" width="100%" cellspacing="0" cellpadding="0">
          <tr>
  `
  
  for (let i = 0; i < listings.length; i++) {
    const item = listings[i]
    const image = normaliseImageUrl(item.images?.[0], baseFront)
    const link = `${baseFront}/listing/${encodeURIComponent(item.slug || item.id)}`
    const price = formatPrice(item.price, item.price_currency)
    const location = escapeHtml(item.location || item.seller_location || '')
    
    // Cerrar fila anterior si no es la primera y es par
    if (i > 0 && i % 2 === 0) {
      productGrid += '</tr><tr>'
    }
    
    productGrid += `
      <td style="padding:10px;width:50%;vertical-align:top;">
        <table role="presentation" width="100%" cellspacing="0" cellpadding="0" style="border:1px solid #e5e5e5;border-radius:8px;overflow:hidden;">
          <tr>
            <td>
              <a href="${link}" target="_blank">
                <img src="${image}" alt="${escapeHtml(item.title)}" style="width:100%;height:200px;object-fit:cover;display:block;">
              </a>
            </td>
          </tr>
          <tr>
            <td style="padding:16px;">
              <p style="margin:0 0 8px;font-family:Helvetica,Arial,sans-serif;font-size:14px;line-height:130%;color:#000000;font-weight:600;">
                <a href="${link}" target="_blank" style="color:#000000;text-decoration:none;">${escapeHtml(item.title)}</a>
              </p>
              ${price ? `<p style="margin:0 0 8px;font-family:Helvetica,Arial,sans-serif;font-size:18px;font-weight:700;color:#000000;">${price}</p>` : ''}
              ${location ? `<p style="margin:0;font-family:Helvetica,Arial,sans-serif;font-size:13px;color:#64748b;">📍 ${location}</p>` : ''}
            </td>
          </tr>
        </table>
      </td>
    `
  }
  
  // Si hay cantidad impar, completar con celda vacía
  if (listings.length % 2 === 1) {
    productGrid += '<td style="padding:10px;width:50%;"></td>'
  }
  
  productGrid += `
          </tr>
        </table>
      </td>
    </tr>
  </table>`
  
  const ctaButton = buildCTAButton({
    text: 'Ver todas las bicis',
    url: `${baseFront}/marketplace`,
    align: 'center'
  })
  
  const content = hero + productGrid + ctaButton
  
  const unsubscribeUrl = buildUnsubscribeLink(subscriber.email, baseFront)
  const html = buildBaseLayout({
    title: `Nuevos ingresos en ${BRAND.name} (${listings.length} bicis)`,
    content,
    baseFront,
    unsubscribeUrl,
    userEmail: subscriber.email,
    preheader: `${listings.length} nuevas bicicletas ingresaron esta semana.`,
  })
  
  // Text version
  const textLines = [
    `¡Nuevos ingresos de la semana!`,
    ``,
    `Hola ${userName}, estas son las últimas bicis que ingresaron:`,
    ``,
    ...listings.map(item => buildListingText(item, baseFront)),
    ``,
    `Ver todas: ${baseFront}/marketplace`,
    ``,
    `Desuscribirse: ${unsubscribeUrl}`,
    `© ${year} ${BRAND.name}`,
  ]
  
  return {
    subject: `Nuevos ingresos en CicloMarket (${listings.length} bicis)`,
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

async function sendMondayEmails({ dryRun = false, limit = DEFAULT_BATCH_LIMIT, force = false } = {}) {
  if (!isMailConfigured()) {
    throw new Error('Mail no configurado (RESEND_API_KEY o SMTP_*)')
  }
  
  const supabase = getServerSupabaseClient()
  const baseFront = (process.env.FRONTEND_URL || BRAND.url).split(',')[0].trim().replace(/\/$/, '')
  
  // Fetch listings
  const listings = await fetchLatestListings(supabase, LISTINGS_COUNT)
  if (!listings.length) {
    console.info(`[${AUTOMATION_TYPE}] no new listings this week`)
    return { sent: 0, recipients: [], dryRun, listingsCount: 0 }
  }
  
  // Fetch recent recipients (cooldown)
  const recentRecipients = force ? new Set() : await fetchRecentRecipients(supabase, COOLDOWN_DAYS)
  
  // Fetch subscribers
  const subscribers = await fetchNewsletterSubscribers(supabase, limit, Array.from(recentRecipients))
  if (!subscribers.length) {
    console.info(`[${AUTOMATION_TYPE}] no subscribers to email`)
    return { sent: 0, recipients: [], dryRun, listingsCount: listings.length }
  }
  
  const results = []
  let sent = 0
  
  for (const subscriber of subscribers) {
    const { subject, html, text } = buildMondayEmail({ subscriber, listings, baseFront })
    
    if (dryRun) {
      results.push({
        userId: subscriber.userId,
        email: subscriber.email,
        subject,
        preview: html.substring(0, 500) + '...',
      })
      continue
    }
    
    try {
      await sendMail({
        from: process.env.SMTP_FROM || `${BRAND.name} <${BRAND.email}>`,
        to: subscriber.email,
        subject,
        html,
        text,
        headers: { 'List-Unsubscribe': `<${buildUnsubscribeLink(subscriber.email, baseFront)}>` },
      })
      await recordSend(supabase, subscriber.userId, subscriber.email, { listings_count: listings.length })
      sent++
      // Rate limit: 1 email cada 1.5s para no saturar Resend
      await new Promise(r => setTimeout(r, 1500))
    } catch (e) {
      console.warn(`[${AUTOMATION_TYPE}] send failed for ${subscriber.email}`, e?.message)
    }
  }
  
  console.info(`[${AUTOMATION_TYPE}] sent: ${sent}, dryRun: ${dryRun}`)
  return {
    sent,
    dryRun,
    listingsCount: listings.length,
    recipients: dryRun ? results : subscribers.map(s => ({ userId: s.userId, email: s.email })),
  }
}

// ============================================================================
// CRON JOB
// ============================================================================

function startMondayNewArrivalsJob() {
  if (process.env.MONDAY_NEW_ARRIVALS_ENABLED !== 'true') {
    console.info(`[${AUTOMATION_TYPE}] disabled (MONDAY_NEW_ARRIVALS_ENABLED != "true")`)
    return
  }
  
  const schedule = process.env.MONDAY_NEW_ARRIVALS_CRON || DEFAULT_CRON
  const tz = process.env.MONDAY_NEW_ARRIVALS_TZ || 'America/Argentina/Buenos_Aires'
  
  const task = cron.schedule(schedule, async () => {
    try {
      await sendMondayEmails()
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
  startMondayNewArrivalsJob,
  sendMondayEmails,
  AUTOMATION_TYPE,
}
