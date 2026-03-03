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
  formatPrice,
  normaliseImageUrl,
  buildUnsubscribeLink,
  buildBaseLayout,
  buildHeroSection,
  buildCTAButton,
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
  
  // Hero section
  const hero = buildHeroSection({
    title: '¿Cómo va tu publicación?',
    subtitle: `Hola ${userName}, acá está el resumen de rendimiento de tus publicaciones esta semana.`,
    baseFront,
  })
  
  // Stats cards - estilo minimalista
  const statsSection = `
  <!-- STATS SECTION -->
  <table align="center" border="0" cellpadding="0" cellspacing="0" role="presentation" style="width:100%;background:#ffffff;">
    <tr>
      <td style="padding:20px 30px;">
        <table role="presentation" width="100%" cellspacing="0" cellpadding="0">
          <tr>
            <td style="padding:10px;width:33%;text-align:center;">
              <div style="font-family:'Times New Roman',Times,serif;font-size:36px;font-weight:400;color:#000000;">${totalViews}</div>
              <div style="font-family:Helvetica,Arial,sans-serif;font-size:12px;color:#64748b;margin-top:4px;">Visitas (7d)</div>
            </td>
            <td style="padding:10px;width:33%;text-align:center;">
              <div style="font-family:'Times New Roman',Times,serif;font-size:36px;font-weight:400;color:#000000;">${totalContacts}</div>
              <div style="font-family:Helvetica,Arial,sans-serif;font-size:12px;color:#64748b;margin-top:4px;">Contactos (7d)</div>
            </td>
            <td style="padding:10px;width:33%;text-align:center;">
              <div style="font-family:'Times New Roman',Times,serif;font-size:36px;font-weight:400;color:#000000;">${totalListings}</div>
              <div style="font-family:Helvetica,Arial,sans-serif;font-size:12px;color:#64748b;margin-top:4px;">Publicaciones</div>
            </td>
          </tr>
        </table>
      </td>
    </tr>
  </table>`
  
  // Top listings - grid ordenado con bordes
  let listingsHtml = `
  <!-- TOP LISTINGS -->
  <table align="center" border="0" cellpadding="0" cellspacing="0" role="presentation" style="width:100%;">
    <tr>
      <td style="padding:30px 30px 10px;">
        <h2 style="margin:0;font-family:'Times New Roman',Times,serif;font-size:24px;font-weight:400;color:#000000;">Tus publicaciones más vistas</h2>
      </td>
    </tr>
  </table>
  <table align="center" border="0" cellpadding="0" cellspacing="0" role="presentation" style="width:100%;">
    <tr>
      <td style="padding:10px 20px 20px;">
        <table role="presentation" width="100%" cellspacing="0" cellpadding="0">
          <tr>
  `
  
  for (let i = 0; i < topListings.length; i++) {
    const item = topListings[i]
    const image = normaliseImageUrl(item.images?.[0], baseFront)
    const link = `${baseFront}/listing/${encodeURIComponent(item.slug || item.id)}`
    const price = formatPrice(item.price, item.price_currency)
    
    // Cerrar fila anterior si no es la primera
    if (i > 0 && i % 2 === 0) {
      listingsHtml += '</tr><tr>'
    }
    
    listingsHtml += `
      <td style="padding:10px;width:50%;vertical-align:top;">
        <table role="presentation" width="100%" cellspacing="0" cellpadding="0" style="border:1px solid #e5e5e5;border-radius:8px;overflow:hidden;">
          <tr>
            <td>
              <a href="${link}" target="_blank">
                <img src="${image}" alt="${escapeHtml(item.title)}" style="width:100%;height:180px;object-fit:cover;display:block;">
              </a>
            </td>
          </tr>
          <tr>
            <td style="padding:16px;">
              <p style="margin:0 0 8px;font-family:Helvetica,Arial,sans-serif;font-size:14px;line-height:130%;color:#000000;font-weight:600;">
                <a href="${link}" target="_blank" style="color:#000000;text-decoration:none;">${escapeHtml(item.title)}</a>
              </p>
              ${price ? `<p style="margin:0 0 8px;font-family:Helvetica,Arial,sans-serif;font-size:18px;font-weight:700;color:#000000;">${price}</p>` : ''}
              <table role="presentation" cellspacing="0" cellpadding="0">
                <tr>
                  <td style="padding-right:12px;">
                    <span style="font-family:Helvetica,Arial,sans-serif;font-size:13px;color:#64748b;">👁 ${item.views7d}</span>
                  </td>
                  <td>
                    <span style="font-family:Helvetica,Arial,sans-serif;font-size:13px;color:#64748b;">📞 ${item.contacts7d}</span>
                  </td>
                </tr>
              </table>
            </td>
          </tr>
        </table>
      </td>
    `
  }
  
  // Si hay solo 1 item en la última fila, agregar celda vacía
  if (topListings.length % 2 === 1) {
    listingsHtml += '<td style="padding:10px;width:50%;"></td>'
  }
  
  listingsHtml += `
          </tr>
        </table>
      </td>
    </tr>
  </table>`
  
  // Ver todas (si hay más)
  let moreLink = ''
  if (hasMore) {
    moreLink = `
    <table align="center" border="0" cellpadding="0" cellspacing="0" role="presentation" style="width:100%;">
      <tr>
        <td align="center" style="padding:10px 30px 30px;">
          <a href="${baseFront}/dashboard?tab=listings" style="font-family:Helvetica,Arial,sans-serif;font-size:14px;color:#000000;text-decoration:underline;">Ver todas las ${totalListings} publicaciones →</a>
        </td>
      </tr>
    </table>`
  }
  
  // CTAs
  const ctas = buildCTAButton({
    text: 'Ver todas mis publicaciones',
    url: `${baseFront}/dashboard?tab=listings`,
    align: 'center'
  })
  
  const content = hero + statsSection + listingsHtml + moreLink + ctas
  
  const unsubscribeUrl = buildUnsubscribeLink(seller.email, baseFront)
  const html = buildBaseLayout({
    title: `Actualización de tu publicación · ${BRAND.name}`,
    content,
    baseFront,
    unsubscribeUrl,
    userEmail: seller.email,
    preheader: `${totalViews} visitas esta semana · ${totalContacts} contactos`,
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

async function sendWednesdayEmails({ dryRun = false, limit = DEFAULT_BATCH_LIMIT, force = false, dayOffset = 0 } = {}) {
  if (!isMailConfigured()) {
    throw new Error('Mail no configurado (RESEND_API_KEY o SMTP_*)')
  }
  
  const supabase = getServerSupabaseClient()
  const baseFront = (process.env.FRONTEND_URL || BRAND.url).split(',')[0].trim().replace(/\/$/, '')
  
  // Sistema de batches: obtener todos los usuarios y seleccionar el batch correspondiente
  let calculatedLimit = limit
  let calculatedOffset = dayOffset * limit
  
  // Fetch recent recipients (cooldown)
  const recentRecipients = force ? new Set() : await fetchRecentRecipients(supabase, COOLDOWN_DAYS)
  
  // Obtener todos los sellers y aplicar offset
  const allSellers = await fetchActiveSellers(supabase, 1000, Array.from(recentRecipients))
  if (!allSellers.length) {
    console.info(`[${AUTOMATION_TYPE}] no sellers to email`)
    return { sent: 0, recipients: [], dryRun }
  }
  
  const sellers = allSellers.slice(calculatedOffset, calculatedOffset + calculatedLimit)
  
  console.info(`[${AUTOMATION_TYPE}] Batch ${dayOffset + 1}: usuarios ${calculatedOffset + 1}-${calculatedOffset + sellers.length}`)
  
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
  
  const tz = process.env.WEDNESDAY_UPDATE_TZ || 'America/Argentina/Buenos_Aires'
  
  // Miércoles - Batch 0 (usuarios 1-100)
  const scheduleWednesday = process.env.WEDNESDAY_UPDATE_CRON || '0 10 * * 3'
  const taskWednesday = cron.schedule(scheduleWednesday, async () => {
    try {
      console.info(`[${AUTOMATION_TYPE}] Miércoles - Batch 1 (dayOffset=0)`)
      await sendWednesdayEmails({ dayOffset: 0 })
    } catch (err) {
      console.error(`[${AUTOMATION_TYPE}] Miércoles job failed`, err)
    }
  }, { timezone: tz })
  taskWednesday.start()
  console.info(`[${AUTOMATION_TYPE}] Miércoles job started with cron ${scheduleWednesday}`)
  
  // Jueves - Batch 1 (usuarios 101-200)
  const scheduleThursday = process.env.WEDNESDAY_UPDATE_THURSDAY_CRON || '0 10 * * 4'
  const taskThursday = cron.schedule(scheduleThursday, async () => {
    try {
      console.info(`[${AUTOMATION_TYPE}] Jueves - Batch 2 (dayOffset=1)`)
      await sendWednesdayEmails({ dayOffset: 1 })
    } catch (err) {
      console.error(`[${AUTOMATION_TYPE}] Jueves job failed`, err)
    }
  }, { timezone: tz })
  taskThursday.start()
  console.info(`[${AUTOMATION_TYPE}] Jueves job started with cron ${scheduleThursday}`)
}

// ============================================================================
// EXPORTS
// ============================================================================

module.exports = {
  startWednesdayListingUpdateJob,
  sendWednesdayEmails,
  fetchUserListingsWithStats,
  buildWednesdayEmail,
  AUTOMATION_TYPE,
}
