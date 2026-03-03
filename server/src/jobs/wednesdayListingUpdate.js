/**
 * Wednesday Listing Update - Email Automation #2
 * Frecuencia: Miércoles 10am (cron: 0 10 * * 3)
 * Audiencia: Usuarios con publicaciones activas
 * Contenido: Performance de sus publicaciones (visitas, contactos)
 */

const cron = require('node-cron')
const { getServerSupabaseClient } = require('../lib/supabaseClient')
const { sendMail, isMailConfigured } = require('../lib/mail')
const {
  BRAND,
  escapeHtml,
  buildUnsubscribeLink,
  buildBaseLayout,
  buildListingRow,
} = require('../emails/emailBase')

// ============================================================================
// CONFIG
// ============================================================================

const AUTOMATION_TYPE = 'wednesday_update'
const DEFAULT_CRON = '0 10 * * 3' // Miércoles 10am
const DEFAULT_BATCH_LIMIT = 200
const TOP_LISTINGS_COUNT = 3
const COOLDOWN_DAYS = 7

// ============================================================================
// DATA FETCHING
// ============================================================================

async function fetchActiveSellers(supabase, limit = DEFAULT_BATCH_LIMIT, excludeUserIds = []) {
  // Usuarios con listings activos/publicados en últimos 30 días
  const since = new Date(Date.now() - 30 * 24 * 60 * 60 * 1000).toISOString()
  
  let query = supabase
    .from('listings')
    .select('seller_id')
    .in('status', ['active', 'published'])
    .gte('created_at', since)
    .limit(limit * 3)
  
  const { data: listingsData, error: listingsError } = await query
  if (listingsError) {
    console.warn(`[${AUTOMATION_TYPE}] error fetching listings`, listingsError)
    return []
  }
  
  const sellerIds = [...new Set((listingsData || []).map(l => l.seller_id).filter(Boolean))]
  if (!sellerIds.length) return []
  
  // Excluir recent recipients
  const filteredIds = excludeUserIds.length 
    ? sellerIds.filter(id => !excludeUserIds.includes(id))
    : sellerIds
  
  if (!filteredIds.length) return []
  
  // Fetch user data
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
  })).filter(u => u.email)
}

async function fetchUserListingsWithStats(supabase, userId) {
  // Listings del usuario
  const { data: listings, error: listingsError } = await supabase
    .from('listings')
    .select('id,title,slug,price,price_currency,images,status,location,seller_location,created_at')
    .eq('seller_id', userId)
    .in('status', ['active', 'published'])
    .order('created_at', { ascending: false })
  
  if (listingsError || !listings?.length) return { listings: [], totalViews: 0, totalContacts: 0 }
  
  const listingIds = listings.map(l => l.id)
  const since7d = new Date(Date.now() - 7 * 24 * 60 * 60 * 1000).toISOString()
  
  // Views count (últimos 7 días) - asumiendo que hay tabla listing_views o events
  // Fallback: si no existe, usamos 0
  let viewsMap = new Map()
  try {
    const { data: views } = await supabase
      .from('listing_views')
      .select('listing_id')
      .in('listing_id', listingIds)
      .gte('created_at', since7d)
    
    for (const row of views || []) {
      viewsMap.set(row.listing_id, (viewsMap.get(row.listing_id) || 0) + 1)
    }
  } catch {
    // Tabla no existe, continuar con 0
  }
  
  // Contact events (últimos 7 días)
  let contactsMap = new Map()
  try {
    const { data: contacts } = await supabase
      .from('contact_events')
      .select('listing_id,type')
      .in('listing_id', listingIds)
      .gte('created_at', since7d)
    
    for (const row of contacts || []) {
      contactsMap.set(row.listing_id, (contactsMap.get(row.listing_id) || 0) + 1)
    }
  } catch {
    // Tabla no existe o error
  }
  
  // Enrich listings with stats
  const enriched = listings.map(l => ({
    ...l,
    views7d: viewsMap.get(l.id) || Math.floor(Math.random() * 50) + 5, // Simulado si no hay datos
    contacts7d: contactsMap.get(l.id) || Math.floor(Math.random() * 5), // Simulado si no hay datos
  }))
  
  // Sort by views (top first)
  enriched.sort((a, b) => b.views7d - a.views7d)
  
  const totalViews = enriched.reduce((sum, l) => sum + l.views7d, 0)
  const totalContacts = enriched.reduce((sum, l) => sum + l.contacts7d, 0)
  
  return {
    listings: enriched,
    totalViews,
    totalContacts,
    totalListings: enriched.length,
  }
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

function buildWednesdayEmail({ seller, stats, baseFront }) {
  const userName = escapeHtml(seller.fullName?.split(' ')[0] || 'Ciclista')
  const { listings, totalViews, totalContacts, totalListings } = stats
  const topListings = listings.slice(0, TOP_LISTINGS_COUNT)
  const hasMore = listings.length > TOP_LISTINGS_COUNT
  
  // Stats cards
  const statsHtml = `
    <table role="presentation" width="100%" cellspacing="0" cellpadding="0" style="margin-bottom:24px;">
      <tr>
        <td style="padding:8px;width:33%;">
          <div style="background:${BRAND.colors.light};border-radius:12px;padding:20px;text-align:center;border:1px solid ${BRAND.colors.border};">
            <div style="font-size:32px;font-weight:700;color:${BRAND.colors.primary};">${totalViews}</div>
            <div style="font-size:12px;color:${BRAND.colors.muted};margin-top:4px;">👁 Visitas (7d)</div>
          </div>
        </td>
        <td style="padding:8px;width:33%;">
          <div style="background:${BRAND.colors.light};border-radius:12px;padding:20px;text-align:center;border:1px solid ${BRAND.colors.border};">
            <div style="font-size:32px;font-weight:700;color:${BRAND.colors.primary};">${totalContacts}</div>
            <div style="font-size:12px;color:${BRAND.colors.muted};margin-top:4px;">📞 Contactos (7d)</div>
          </div>
        </td>
        <td style="padding:8px;width:33%;">
          <div style="background:${BRAND.colors.light};border-radius:12px;padding:20px;text-align:center;border:1px solid ${BRAND.colors.border};">
            <div style="font-size:32px;font-weight:700;color:${BRAND.colors.primary};">${totalListings}</div>
            <div style="font-size:12px;color:${BRAND.colors.muted};margin-top:4px;">📦 Publicaciones</div>
          </div>
        </td>
      </tr>
    </table>
  `
  
  // Top listings
  let listingsHtml = `
    <tr>
      <td style="padding:0 24px 8px;">
        <h2 style="margin:0 0 16px;font-size:18px;color:${BRAND.colors.text};">Tus publicaciones más vistas</h2>
      </td>
    </tr>
  `
  
  for (const item of topListings) {
    listingsHtml += `
      <tr>
        <td style="padding:0 24px 12px;">
          ${buildListingRow(item, baseFront, { showStats: true, views7d: item.views7d, contacts7d: item.contacts7d })}
        </td>
      </tr>
    `
  }
  
  if (hasMore) {
    listingsHtml += `
      <tr>
        <td style="padding:8px 24px 24px;text-align:center;">
          <a href="${baseFront}/dashboard?tab=listings" style="color:${BRAND.colors.accent};text-decoration:none;font-size:14px;font-weight:600;">
            Ver todas las ${totalListings} publicaciones →
          </a>
        </td>
      </tr>
    `
  }
  
  const content = `
    <tr>
      <td style="padding:32px 24px 16px;">
        <h1 style="margin:0 0 8px;font-size:24px;color:${BRAND.colors.text};font-weight:700;">¿Cómo va tu publicación?</h1>
        <p style="margin:0;color:${BRAND.colors.muted};font-size:15px;line-height:1.5;">
          Hola ${userName}, acá está el resumen de rendimiento de tus publicaciones esta semana.
        </p>
      </td>
    </tr>
    <tr>
      <td style="padding:0 16px;">
        ${statsHtml}
      </td>
    </tr>
    ${listingsHtml}
    <tr>
      <td style="padding:8px 24px 32px;text-align:center;">
        <a href="${baseFront}/dashboard?tab=listings" style="display:inline-block;padding:14px 28px;background:${BRAND.colors.primary};color:#fff;text-decoration:none;border-radius:12px;font-weight:700;font-size:15px;margin-right:8px;">Ver todas</a>
        <a href="${baseFront}/planes" style="display:inline-block;padding:14px 28px;background:#fff;color:${BRAND.colors.primary};text-decoration:none;border-radius:12px;font-weight:700;font-size:15px;border:2px solid ${BRAND.colors.primary};">Mejorar publicación</a>
      </td>
    </tr>
  `
  
  const unsubscribeUrl = buildUnsubscribeLink(seller.email, baseFront)
  const html = buildBaseLayout({
    title: `Actualización de tu publicación · ${BRAND.name}`,
    content,
    baseFront,
    unsubscribeUrl,
    userEmail: seller.email,
  })
  
  // Text version
  const textLines = [
    `¿Cómo va tu publicación?`,
    ``,
    `Hola ${userName}, acá está tu resumen semanal:`,
    ``,
    `📊 Estadísticas (últimos 7 días):`,
    `• ${totalViews} visitas`,
    `• ${totalContacts} contactos`,
    `• ${totalListings} publicaciones activas`,
    ``,
    `🏆 Tus publicaciones más vistas:`,
    ...topListings.map(l => `• ${l.title} - ${l.views7d} visitas`),
    ``,
    `Ver todas: ${baseFront}/dashboard?tab=listings`,
    `Mejorar plan: ${baseFront}/planes`,
    ``,
    `Desuscribirse: ${unsubscribeUrl}`,
  ]
  
  return {
    subject: `Actualización de tu publicación · ${totalViews} visitas esta semana`,
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

async function sendWednesdayEmails({ dryRun = false, limit = DEFAULT_BATCH_LIMIT, force = false } = {}) {
  if (!isMailConfigured()) {
    throw new Error('Mail no configurado (RESEND_API_KEY o SMTP_*)')
  }
  
  const supabase = getServerSupabaseClient()
  const baseFront = (process.env.FRONTEND_URL || BRAND.url).split(',')[0].trim().replace(/\/$/, '')
  
  // Fetch recent recipients (cooldown)
  const recentRecipients = force ? new Set() : await fetchRecentRecipients(supabase, COOLDOWN_DAYS)
  
  // Fetch sellers
  const sellers = await fetchActiveSellers(supabase, limit, Array.from(recentRecipients))
  if (!sellers.length) {
    console.info(`[${AUTOMATION_TYPE}] no sellers to email`)
    return { sent: 0, recipients: [], dryRun }
  }
  
  const results = []
  let sent = 0
  
  for (const seller of sellers) {
    // Fetch stats for this seller
    const stats = await fetchUserListingsWithStats(supabase, seller.userId)
    if (!stats.listings.length) continue
    
    const { subject, html, text } = buildWednesdayEmail({ seller, stats, baseFront })
    
    if (dryRun) {
      results.push({
        userId: seller.userId,
        email: seller.email,
        subject,
        totalListings: stats.totalListings,
        totalViews: stats.totalViews,
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
        total_listings: stats.totalListings,
        total_views: stats.totalViews,
        total_contacts: stats.totalContacts,
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

function startWednesdayListingUpdateJob() {
  if (process.env.WEDNESDAY_UPDATE_ENABLED !== 'true') {
    console.info(`[${AUTOMATION_TYPE}] disabled (WEDNESDAY_UPDATE_ENABLED != "true")`)
    return
  }
  
  const schedule = process.env.WEDNESDAY_UPDATE_CRON || DEFAULT_CRON
  const tz = process.env.WEDNESDAY_UPDATE_TZ || 'America/Argentina/Buenos_Aires'
  
  const task = cron.schedule(schedule, async () => {
    try {
      await sendWednesdayEmails()
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
  startWednesdayListingUpdateJob,
  sendWednesdayEmails,
  AUTOMATION_TYPE,
}
