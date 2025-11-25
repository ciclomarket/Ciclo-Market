const cron = require('node-cron')
const { getServerSupabaseClient } = require('../lib/supabaseClient')
const { sendMail, isMailConfigured } = require('../lib/mail')
const { buildListingCardHtml, buildListingCardText, escapeHtml, formatPrice } = require('../emails/listingCard')

const DEFAULT_TZ = 'America/Argentina/Buenos_Aires'
const DEFAULT_CRON = '30 10 * * 1' // lunes 10:30 semanal

const PLAN_CODE_ALIASES = {
  free: 'free',
  gratis: 'free',
  basic: 'basic',
  basica: 'basic',
  destacada: 'basic',
  featured: 'basic',
  premium: 'premium',
}

const SCENARIOS = {
  expired: { code: 'expired', cooldownHours: 168, maxPerRun: 100 },
  freeExpiring: { code: 'free_expiring', cooldownHours: 96, maxPerRun: 120 },
  highlight: { code: 'highlight_upsell', cooldownHours: 168, maxPerRun: 120 },
}

function canonicalPlanCode(value) {
  if (!value) return null
  const normalized = String(value)
    .toLowerCase()
    .normalize('NFD')
    .replace(/\p{Diacritic}/gu, '')
  return PLAN_CODE_ALIASES[normalized] || null
}

function coerceDate(input) {
  if (!input) return null
  const date = new Date(input)
  return Number.isFinite(date.getTime()) ? date : null
}

function differenceInDays(targetDate, referenceDate = new Date()) {
  if (!targetDate) return null
  const diffMs = targetDate.getTime() - referenceDate.getTime()
  return Math.floor(diffMs / (24 * 60 * 60 * 1000))
}

async function fetchSellerProfiles(supabase, sellerIds) {
  if (!sellerIds.length) return new Map()
  try {
    const { data, error } = await supabase
      .from('users')
      .select('id,email,full_name,store_enabled')
      .in('id', sellerIds)
    if (error) {
      console.warn('[marketingAutomations] no se pudieron obtener perfiles', error)
      return new Map()
    }
    const map = new Map()
    for (const row of data || []) {
      if (!row?.id) continue
      map.set(row.id, {
        email: typeof row.email === 'string' ? row.email.trim() : null,
        fullName: typeof row.full_name === 'string' ? row.full_name.trim() : null,
        storeEnabled: Boolean(row.store_enabled),
      })
    }
    return map
  } catch (err) {
    console.warn('[marketingAutomations] error inesperado al obtener perfiles', err)
    return new Map()
  }
}

async function fetchAutomationLogMap(supabase, scenarioCode, listingIds, cooldownHours) {
  if (!listingIds.length) return new Set()
  const sentAfter = new Date(Date.now() - cooldownHours * 60 * 60 * 1000).toISOString()
  try {
    const { data, error } = await supabase
      .from('marketing_automations')
      .select('listing_id')
      .eq('scenario', scenarioCode)
      .gte('sent_at', sentAfter)
      .in('listing_id', listingIds)
    if (error) {
      console.warn('[marketingAutomations] no se pudo consultar marketing_automations', error)
      return new Set()
    }
    return new Set((data || []).map((row) => row?.listing_id).filter(Boolean))
  } catch (err) {
    // Tabla inexistente u otros errores: loggear pero continuar sin bloquear
    console.warn('[marketingAutomations] error al consultar tabla de logs', err?.message || err)
    return new Set()
  }
}

async function recordAutomationLog(supabase, scenarioCode, listingId, sellerId, email) {
  try {
    const payload = {
      scenario: scenarioCode,
      listing_id: listingId,
      seller_id: sellerId ?? null,
      email_to: email ?? null,
    }
    const { error } = await supabase
      .from('marketing_automations')
      .insert(payload)
    if (error) {
      console.warn('[marketingAutomations] no se pudo registrar marketing_automations', error, payload)
    }
  } catch (err) {
    console.warn('[marketingAutomations] error inesperado al registrar log', err)
  }
}

function listingHasPlan(listing, codes) {
  const values = [listing?.plan, listing?.plan_code, listing?.seller_plan]
  for (const raw of values) {
    const canonical = canonicalPlanCode(raw)
    if (canonical && codes.includes(canonical)) return true
  }
  return false
}

function buildEmailLayout({ baseFront, title, introHtml, bodyHtml, extraFooterHtml }) {
  const cleanBase = (baseFront || 'https://www.ciclomarket.ar').replace(/\/$/, '')
  const bikesUrl = `${cleanBase}/marketplace`
  const partsUrl = `${cleanBase}/marketplace?cat=Accesorios`
  const apparelUrl = `${cleanBase}/marketplace?cat=Indumentaria`
  const logoUrl = `${cleanBase}/site-logo.png`

  return `
    <div style="background:#f2f4f8;margin:0;padding:0;font-family:Arial, sans-serif;color:#0c1723">
      <table role="presentation" cellspacing="0" cellpadding="0" border="0" align="center" style="width:100%;max-width:680px;margin:0 auto">
        <tr>
          <td style="padding:24px;text-align:center;">
            <img src="${logoUrl}" alt="Ciclo Market" style="height:60px;width:auto;display:inline-block" />
          </td>
        </tr>
        <tr>
          <td style="padding:0 24px 12px">
            <table role="presentation" width="100%" cellspacing="0" cellpadding="0" style="background:#14212e;border-radius:14px;overflow:hidden">
              <tr>
                <td style="padding:10px 16px;text-align:center">
                  <a href="${bikesUrl}" style="color:#fff;text-decoration:none;font-size:14px;margin:0 12px">Bicicletas</a>
                  <a href="${partsUrl}" style="color:#fff;text-decoration:none;font-size:14px;margin:0 12px">Accesorios</a>
                  <a href="${apparelUrl}" style="color:#fff;text-decoration:none;font-size:14px;margin:0 12px">Indumentaria</a>
                </td>
              </tr>
            </table>
          </td>
        </tr>
        <tr>
          <td style="background:#fff;border-radius:20px;padding:28px 32px">
            <h1 style="margin:0 0 12px;font-size:22px;font-weight:700;color:#0c1723">${title}</h1>
            <div style="font-size:15px;line-height:1.6;color:#334155">
              ${introHtml}
              ${bodyHtml}
            </div>
          </td>
        </tr>
        <tr>
          <td style="padding:20px 24px 32px;color:#64748b;font-size:12px;text-align:center">
            ${extraFooterHtml || ''}
            <div style="margin-top:12px">© ${new Date().getFullYear()} Ciclo Market</div>
          </td>
        </tr>
      </table>
    </div>
  `
}

function buildExpiredEmail({ listing, profile, baseFront }) {
  const cleanBase = (baseFront || 'https://www.ciclomarket.ar').replace(/\/$/, '')
  const dashboardUrl = `${cleanBase}/dashboard?tab=${encodeURIComponent('Publicaciones')}`
  const intro = `
    <p style="margin:0 0 12px">Hola ${escapeHtml(profile?.fullName || 'vendedor')},</p>
    <p style="margin:0 0 12px">Tu publicación <strong>${escapeHtml(listing.title)}</strong> venció y la pausamos para que no siga apareciendo en el marketplace.</p>
    <p style="margin:0 0 18px">Si todavía la tenés disponible, entrá al panel y reactivala desde “Opciones &gt; Renovar publicación”. Desde ese mismo menú podés elegir un plan Básico o Premium para ganar visibilidad extra.</p>
  `
  const buttons = `
    <div style="margin:18px 0;text-align:center">
      <a href="${dashboardUrl}" style="display:inline-block;padding:12px 18px;background:#14212e;color:#fff;text-decoration:none;border-radius:12px;font-weight:600;margin:4px">Renovar desde el panel</a>
    </div>
  `
  const listingCard = buildListingCardHtml(listing, cleanBase)
  const benefits = `
    <div style="margin:24px 0;padding:18px;border:1px solid #e5ebf3;border-radius:16px;background:#f8fafc">
      <h2 style="margin:0 0 10px;font-size:17px;color:#0c1723">¿Por qué mejorar tu plan?</h2>
      <ul style="margin:0;padding-left:20px;color:#475569;font-size:14px">
        <li style="margin-bottom:8px"><strong>Plan Básico</strong>: publicación por 60 días, botón de WhatsApp y prioridad en listados.</li>
        <li style="margin-bottom:8px"><strong>Plan Premium</strong>: todo lo anterior + destaque extendido, difusión en redes y soporte prioritario.</li>
      </ul>
    </div>
  `
  const html = buildEmailLayout({
    baseFront: cleanBase,
    title: 'Tu publicación venció',
    introHtml: `${intro}${listingCard}${buttons}`,
    bodyHtml: benefits,
    extraFooterHtml: `<a href="${cleanBase}/dashboard?tab=${encodeURIComponent('Perfil')}" style="color:#64748b;text-decoration:underline">Actualizar preferencias</a>`,
  })

  const text = [
    `Hola ${profile?.fullName || 'vendedor'},`,
    `Tu publicación "${listing.title}" venció y la pausamos.`,
    `Renová desde tu panel: ${dashboardUrl}`,
    buildListingCardText(listing, cleanBase),
    'Beneficios:',
    '- Plan Básico: 60 días, WhatsApp y prioridad.',
    '- Plan Premium: destaque extendido y difusión.',
  ].join('\n')

  return {
    subject: `Tu publicación "${listing.title}" venció – reactivala cuando quieras`,
    html,
    text,
  }
}

function buildFreeExpiringEmail({ listing, profile, baseFront, daysLeft }) {
  const cleanBase = (baseFront || 'https://www.ciclomarket.ar').replace(/\/$/, '')
  const dashboardUrl = `${cleanBase}/dashboard?tab=${encodeURIComponent('Publicaciones')}`
  const plural = daysLeft === 1 ? 'día' : 'días'
  const intro = `
    <p style="margin:0 0 12px">Hola ${escapeHtml(profile?.fullName || 'vendedor')},</p>
    <p style="margin:0 0 12px">Tu publicación <strong>${escapeHtml(listing.title)}</strong> está en plan Gratis y vence en <strong>${daysLeft} ${plural}</strong>.</p>
    <p style="margin:0 0 18px">Mejorando al plan Básico o Premium triplicás tus chances de venta, activás el botón de WhatsApp y extendés la duración a 60 días.</p>
  `
  const buttons = `
    <div style="margin:18px 0;text-align:center">
      <a href="${dashboardUrl}" style="display:inline-block;padding:12px 20px;background:#14212e;color:#fff;text-decoration:none;border-radius:12px;font-weight:600;margin:4px">Renovar desde el panel</a>
    </div>
  `
  const listingCard = buildListingCardHtml(listing, cleanBase)
  const benefits = `
    <div style="margin:24px 0;padding:18px;border:1px solid #e5ebf3;border-radius:16px;background:#f8fafc">
      <h2 style="margin:0 0 10px;font-size:17px;color:#0c1723">Ventajas al destacar:</h2>
      <ul style="margin:0;padding-left:20px;color:#475569;font-size:14px">
        <li style="margin-bottom:8px">Botón de WhatsApp para responder al instante.</li>
        <li style="margin-bottom:8px">Publicación activa durante 60 días.</li>
        <li style="margin-bottom:8px">Mejor ubicación en los listados y mayor exposición.</li>
      </ul>
    </div>
  `
  const html = buildEmailLayout({
    baseFront: cleanBase,
    title: `Tu plan Gratis vence en ${daysLeft} ${plural}`,
    introHtml: `${intro}${listingCard}${buttons}`,
    bodyHtml: benefits,
    extraFooterHtml: `<a href="${cleanBase}/publicar?type=bike" style="color:#64748b;text-decoration:underline">Ver planes disponibles</a>`,
  })

  const text = [
    `Hola ${profile?.fullName || 'vendedor'},`,
    `Tu publicación "${listing.title}" vence en ${daysLeft} ${plural}.`,
    `Abrí tu panel para renovarla o hacer upgrade: ${dashboardUrl}`,
    buildListingCardText(listing, cleanBase),
    'Beneficios: WhatsApp activo, 60 días de duración, más exposición.',
  ].join('\n')

  return {
    subject: `Tu publicación vence en ${daysLeft} ${plural} – activá WhatsApp y 60 días extras`,
    html,
    text,
  }
}

function buildHighlightEmail({ listing, profile, baseFront }) {
  const cleanBase = (baseFront || 'https://www.ciclomarket.ar').replace(/\/$/, '')
  const highlightUrl = `${cleanBase}/listing/${encodeURIComponent(listing.slug || listing.id)}/destacar`
  const option7 = `${highlightUrl}?utm_source=crm&utm_medium=email&utm_campaign=highlight&utm_content=7`
  const option14 = `${highlightUrl}?utm_source=crm&utm_medium=email&utm_campaign=highlight&utm_content=14`
  const intro = `
    <p style="margin:0 0 12px">Hola ${escapeHtml(profile?.fullName || 'vendedor')},</p>
    <p style="margin:0 0 12px">Tu publicación <strong>${escapeHtml(listing.title)}</strong> está activa pero sin destaque. Aumentá su visibilidad destacándola por 7 o 14 días.</p>
    <p style="margin:0 0 18px">Mientras está destacada, tu aviso sube al top de la categoría y recibe una etiqueta visual que mejora el CTR.</p>
  `
  const buttons = `
    <div style="margin:18px 0;text-align:center">
      <a href="${option7}" style="display:inline-block;padding:12px 18px;background:#ef4444;color:#fff;text-decoration:none;border-radius:12px;font-weight:600;margin:4px">Destacar 7 días · $ 3.000</a>
      <a href="${option14}" style="display:inline-block;padding:12px 18px;background:#7c3aed;color:#fff;text-decoration:none;border-radius:12px;font-weight:600;margin:4px">Destacar 14 días · $ 5.000</a>
    </div>
  `
  const listingCard = buildListingCardHtml(listing, cleanBase)
  const html = buildEmailLayout({
    baseFront: cleanBase,
    title: 'Destacá tu publicación para vender más rápido',
    introHtml: `${intro}${listingCard}${buttons}`,
    bodyHtml: `
      <div style="margin:24px 0;padding:18px;border:1px solid #e5ebf3;border-radius:16px;background:#f8fafc;font-size:14px;color:#475569">
        <ul style="margin:0;padding-left:20px">
          <li style="margin-bottom:8px">Tu aviso aparece antes en la categoría y búsquedas relacionadas.</li>
          <li style="margin-bottom:8px">Recibe una insignia “Destacado” y fondo de color que llama la atención.</li>
          <li>Incluye recordatorios automáticos para responder más rápido y cerrar la venta.</li>
        </ul>
      </div>
    `,
    extraFooterHtml: `<a href="${cleanBase}/ayuda#destacar" style="color:#64748b;text-decoration:underline">Cómo funciona el destaque</a>`,
  })

  const text = [
    `Hola ${profile?.fullName || 'vendedor'},`,
    `Destacá "${listing.title}" para ganar visibilidad.`,
    `Destacar 7 días ($3.000): ${option7}`,
    `Destacar 14 días ($5.000): ${option14}`,
    buildListingCardText(listing, cleanBase),
  ].join('\n')

  return {
    subject: `Destacá "${listing.title}" por 7 o 14 días`,
    html,
    text,
  }
}

async function fetchExpiredListings(supabase, limit) {
  const now = new Date()
  const nowIso = now.toISOString()
  const lowerBoundIso = new Date(now.getTime() - 14 * 24 * 60 * 60 * 1000).toISOString()
  const { data, error } = await supabase
    .from('listings')
    .select('id,seller_id,title,price,price_currency,images,plan,plan_code,seller_plan,status,slug,expires_at,highlight_expires,location,seller_location')
    // Considerar vencidas por status=expired o por fecha vencida
    .or(`status.eq.expired,expires_at.lte.${nowIso}`)
    // Nunca incluir SOLD ni DELETED
    .neq('status', 'sold')
    .neq('status', 'deleted')
    .not('seller_id', 'is', null)
    // Ventana: últimos 14 días desde el vencimiento
    .not('expires_at', 'is', null)
    .gte('expires_at', lowerBoundIso)
    .lte('expires_at', nowIso)
    .order('expires_at', { ascending: false, nullsLast: false })
    .limit(limit)
  if (error) {
    console.warn('[marketingAutomations] error consultando publicaciones vencidas', error)
    return []
  }
  return (data || []).filter((row) => row?.id && row?.seller_id)
}

async function fetchFreeListingsExpiring(supabase, limit) {
  const now = new Date()
  const windowEnd = new Date(now.getTime() + 7 * 24 * 60 * 60 * 1000).toISOString()
  const { data, error } = await supabase
    .from('listings')
    .select('id,seller_id,title,price,price_currency,images,plan,plan_code,seller_plan,status,slug,expires_at,highlight_expires,location,seller_location')
    .in('status', ['active','published'])
    .or('plan.eq.free,plan_code.eq.free,seller_plan.eq.free')
    .not('expires_at', 'is', null)
    .lte('expires_at', windowEnd)
    .order('expires_at', { ascending: true })
    .limit(limit)
  if (error) {
    console.warn('[marketingAutomations] error consultando publicaciones free', error)
    return []
  }
  return (data || []).filter((row) => row?.id && row?.seller_id)
}

async function fetchListingsWithoutHighlight(supabase, limit) {
  const { data, error } = await supabase
    .from('listings')
    .select('id,seller_id,title,price,price_currency,images,plan,plan_code,seller_plan,status,slug,expires_at,highlight_expires,location,seller_location,created_at')
    .in('status', ['active','published'])
    .order('created_at', { ascending: false, nullsLast: false })
    .limit(limit)
  if (error) {
    console.warn('[marketingAutomations] error consultando publicaciones sin destaque', error)
    return []
  }
  return (data || []).filter((row) => row?.id && row?.seller_id)
}

async function runMarketingAutomationsOnce() {
  if (!isMailConfigured()) {
    console.info('[marketingAutomations] mail no configurado, se omite el job')
    return { sent: 0 }
  }

  const supabase = getServerSupabaseClient()
  const baseFront = (process.env.FRONTEND_URL || '').split(',')[0]?.trim() || 'https://www.ciclomarket.ar'
  let totalSent = 0

  // 1) Publicaciones vencidas
  const expiredRows = await fetchExpiredListings(supabase, SCENARIOS.expired.maxPerRun)
  if (expiredRows.length) {
    const expiredListingIds = expiredRows.map((row) => row.id)
    const already = await fetchAutomationLogMap(supabase, SCENARIOS.expired.code, expiredListingIds, SCENARIOS.expired.cooldownHours)
    const filtered = expiredRows.filter((row) => !already.has(row.id))
    const sellerIds = [...new Set(filtered.map((row) => row.seller_id))].filter(Boolean)
    const profiles = await fetchSellerProfiles(supabase, sellerIds)
    for (const listing of filtered) {
      const profile = profiles.get(listing.seller_id)
      if (!profile?.email || profile?.storeEnabled) continue
      try {
        const email = buildExpiredEmail({ listing, profile, baseFront })
        await sendMail({
          from: process.env.SMTP_FROM || `Ciclo Market <${process.env.SMTP_USER || 'no-reply@ciclomarket.ar'}>`,
          to: profile.email,
          subject: email.subject,
          html: email.html,
          text: email.text,
        })
        totalSent += 1
        await recordAutomationLog(supabase, SCENARIOS.expired.code, listing.id, listing.seller_id, profile.email)
      } catch (err) {
        console.warn('[marketingAutomations] fallo email expired', listing.id, err?.message || err)
      }
    }
  }

  // 2) Publicaciones en plan Gratis por vencer
  const freeRows = await fetchFreeListingsExpiring(supabase, SCENARIOS.freeExpiring.maxPerRun)
  if (freeRows.length) {
    const now = new Date()
    const filteredByTime = freeRows
      .map((row) => {
        const expiresAt = coerceDate(row.expires_at)
        const daysLeft = differenceInDays(expiresAt, now)
        return { row, expiresAt, daysLeft }
      })
      .filter(({ expiresAt, daysLeft }) => expiresAt && typeof daysLeft === 'number' && daysLeft >= 0 && daysLeft <= 7)
      .map(({ row, daysLeft }) => ({ listing: row, daysLeft }))
    const listingIds = filteredByTime.map((item) => item.listing.id)
    const already = await fetchAutomationLogMap(supabase, SCENARIOS.freeExpiring.code, listingIds, SCENARIOS.freeExpiring.cooldownHours)
    const candidates = filteredByTime.filter((item) => !already.has(item.listing.id))
    const sellerIds = [...new Set(candidates.map((item) => item.listing.seller_id))].filter(Boolean)
    const profiles = await fetchSellerProfiles(supabase, sellerIds)
    for (const { listing, daysLeft } of candidates) {
      const profile = profiles.get(listing.seller_id)
      if (!profile?.email || profile?.storeEnabled) continue
      try {
        const email = buildFreeExpiringEmail({ listing, profile, baseFront, daysLeft })
        await sendMail({
          from: process.env.SMTP_FROM || `Ciclo Market <${process.env.SMTP_USER || 'no-reply@ciclomarket.ar'}>`,
          to: profile.email,
          subject: email.subject,
          html: email.html,
          text: email.text,
        })
        totalSent += 1
        await recordAutomationLog(supabase, SCENARIOS.freeExpiring.code, listing.id, listing.seller_id, profile.email)
      } catch (err) {
        console.warn('[marketingAutomations] fallo email free_expiring', listing.id, err?.message || err)
      }
    }
  }

  // 3) Publicaciones basic/premium sin destaque
  const highlightRowsRaw = await fetchListingsWithoutHighlight(supabase, SCENARIOS.highlight.maxPerRun)
  if (highlightRowsRaw.length) {
    const now = new Date()
    const eligible = highlightRowsRaw.filter((row) => {
      if (!listingHasPlan(row, ['basic', 'premium'])) return false
      const highlightExpiry = coerceDate(row.highlight_expires)
      if (highlightExpiry && highlightExpiry.getTime() > now.getTime()) return false
      return true
    })
    const listingIds = eligible.map((row) => row.id)
    const already = await fetchAutomationLogMap(supabase, SCENARIOS.highlight.code, listingIds, SCENARIOS.highlight.cooldownHours)
    const candidates = eligible.filter((row) => !already.has(row.id))
    const sellerIds = [...new Set(candidates.map((row) => row.seller_id))].filter(Boolean)
    const profiles = await fetchSellerProfiles(supabase, sellerIds)
    for (const listing of candidates) {
      const profile = profiles.get(listing.seller_id)
      if (!profile?.email || profile?.storeEnabled) continue
      try {
        const email = buildHighlightEmail({ listing, profile, baseFront })
        await sendMail({
          from: process.env.SMTP_FROM || `Ciclo Market <${process.env.SMTP_USER || 'no-reply@ciclomarket.ar'}>`,
          to: profile.email,
          subject: email.subject,
          html: email.html,
          text: email.text,
        })
        totalSent += 1
        await recordAutomationLog(supabase, SCENARIOS.highlight.code, listing.id, listing.seller_id, profile.email)
      } catch (err) {
        console.warn('[marketingAutomations] fallo email highlight', listing.id, err?.message || err)
      }
    }
  }

  console.info('[marketingAutomations] envíos realizados', totalSent)
  return { sent: totalSent }
}

function startMarketingAutomationsJob() {
  if (process.env.MARKETING_AUTOMATIONS_ENABLED !== 'true') {
    console.info('[marketingAutomations] deshabilitado (MARKETING_AUTOMATIONS_ENABLED != "true")')
    return
  }
  const cronExpression = process.env.MARKETING_AUTOMATIONS_CRON || DEFAULT_CRON
  const timezone = process.env.MARKETING_AUTOMATIONS_TZ || DEFAULT_TZ
  try {
    const task = cron.schedule(cronExpression, async () => {
      try {
        await runMarketingAutomationsOnce()
      } catch (err) {
        console.error('[marketingAutomations] job error', err)
      }
    }, { timezone })
    task.start()
    console.info('[marketingAutomations] job iniciado con cron', cronExpression, 'tz', timezone)
  } catch (err) {
    console.error('[marketingAutomations] no se pudo iniciar el cron', err)
  }
}

module.exports = {
  startMarketingAutomationsJob,
  runMarketingAutomationsOnce,
}
