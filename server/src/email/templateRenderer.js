const {
  BRAND,
  escapeHtml,
  formatPrice,
  normaliseImageUrl,
  buildHeroSection,
} = require('../emails/emailBase')
const { buildWednesdayTemplateBase } = require('../jobs/wednesdayListingUpdate')
const { safeUrl, toAbsoluteUrl } = require('./assetResolver')

function truncate(text, max = 90) {
  const value = String(text || '').trim()
  if (!value) return ''
  if (value.length <= max) return value
  return `${value.slice(0, max - 1)}…`
}

function buildListingCard(item, baseFront, { compact = false, viewsOnly = false } = {}) {
  if (!item) return ''
  const image = safeUrl(normaliseImageUrl(item.image || item.images?.[0], baseFront))
  const title = escapeHtml(truncate(item.title || 'Publicación', 78))
  const price = formatPrice(Number(item.price || 0), item.price_currency || 'ARS')
  const location = escapeHtml(item.location || item.seller_location || '')
  const planBadge = String(item.planBadge || '').trim()
  const stats = []

  if (Number.isFinite(Number(item.views7d))) {
    const label = item.statsLabel ? String(item.statsLabel) : (viewsOnly ? 'Vistas últimos 7 días' : 'visitas')
    if (viewsOnly) stats.push(`${Number(item.views7d)} ${label}`)
    else stats.push(`${Number(item.views7d)} visitas`)
  }
  if (!viewsOnly && Number.isFinite(Number(item.contacts7d))) stats.push(`${Number(item.contacts7d)} contactos`)
  if (!viewsOnly && Number.isFinite(Number(item.likes7d))) stats.push(`${Number(item.likes7d)} favoritos`)
  if (!viewsOnly && Number.isFinite(Number(item.waClicks7d))) stats.push(`${Number(item.waClicks7d)} clics WA`)

  const link = toAbsoluteUrl(item.link || `${baseFront}/listing/${encodeURIComponent(item.slug || item.id || '')}`, baseFront)
  const imageSize = compact ? 240 : 300

  return `
  <table role="presentation" width="100%" cellspacing="0" cellpadding="0" style="border:1px solid #e5e7eb;border-radius:14px;overflow:hidden;background:#ffffff;">
    <tr>
      <td>
        <a href="${link}" target="_blank" style="text-decoration:none;display:block;">
          <img src="${image}" alt="${title}" width="${imageSize}" height="${imageSize}" style="display:block;width:100%;max-width:${imageSize}px;height:${imageSize}px;object-fit:cover;object-position:center;margin:0 auto;background:#f3f4f6;">
        </a>
      </td>
    </tr>
    <tr>
      <td style="padding:10px 12px;">
        ${planBadge ? `<div style="margin:0 0 6px;"><span style="display:inline-block;padding:3px 8px;border-radius:999px;background:#eaf2ff;color:#1d4ed8;font-family:Helvetica,Arial,sans-serif;font-size:11px;font-weight:700;">${escapeHtml(planBadge)}</span></div>` : ''}
        <p style="margin:0 0 6px;font-family:Helvetica,Arial,sans-serif;font-size:14px;font-weight:700;line-height:130%;color:#0f172a;min-height:36px;">${title}</p>
        ${price ? `<p style="margin:0 0 2px;font-family:Helvetica,Arial,sans-serif;font-size:18px;font-weight:800;color:#111827;">${price}</p>` : ''}
        ${(price || location) ? `<div style="height:1px;background:#e5e7eb;margin:5px 0;"></div>` : ''}
        ${location ? `<p style="margin:0 0 4px;font-family:Helvetica,Arial,sans-serif;font-size:12px;color:#64748b;">${location}</p>` : ''}
        ${stats.length ? `<p style="margin:0;font-family:Helvetica,Arial,sans-serif;font-size:12px;color:#475569;">${escapeHtml(stats.join(' · '))}</p>` : ''}
      </td>
    </tr>
  </table>`
}

function wrapSection(title, bodyHtml) {
  if (!bodyHtml) return ''
  return `
  <table align="center" border="0" cellpadding="0" cellspacing="0" role="presentation" style="width:100%;background:#ffffff;">
    ${title ? `<tr><td style="padding:16px 20px 6px;"><h2 style="margin:0;font-family:'Times New Roman',Times,serif;font-size:28px;font-weight:400;color:#111827;line-height:110%;">${escapeHtml(title)}</h2></td></tr>` : ''}
    <tr><td style="padding:0 20px 8px;">${bodyHtml}</td></tr>
  </table>`
}

function buildIntro(intro = '') {
  const value = String(intro || '').trim()
  if (!value) return ''
  return `<p style="margin:0;font-family:Helvetica,Arial,sans-serif;font-size:15px;line-height:145%;color:#334155;">${escapeHtml(value)}</p>`
}

function buildCardsSection(cards = [], baseFront, options = {}) {
  if (!cards.length) return ''
  const maxCards = cards.slice(0, 8)
  if (maxCards.length === 1) {
    return wrapSection('', `<table role="presentation" width="100%" cellspacing="0" cellpadding="0"><tr><td>${buildListingCard(maxCards[0], baseFront, options)}</td></tr></table>`)
  }

  const rows = []
  for (let i = 0; i < maxCards.length; i += 2) {
    const left = maxCards[i]
    const right = maxCards[i + 1]
    rows.push(`
    <tr>
      <td class="mj-column-per-50 stack-col" style="width:50%;max-width:50%;vertical-align:top;padding:0 6px 12px 6px;">${buildListingCard(left, baseFront, { ...options, compact: true })}</td>
      <td class="mj-column-per-50 stack-col" style="width:50%;max-width:50%;vertical-align:top;padding:0 6px 12px 6px;">${right ? buildListingCard(right, baseFront, { ...options, compact: true }) : ''}</td>
    </tr>`)
  }

  return wrapSection('', `<table role="presentation" width="100%" cellspacing="0" cellpadding="0">${rows.join('')}</table>`)
}

function buildComparisonSection(comparison, baseFront) {
  if (!comparison?.current || !comparison?.benchmark) return ''
  const current = buildListingCard(comparison.current, baseFront, { compact: true, viewsOnly: true })
  const benchmark = buildListingCard(comparison.benchmark, baseFront, { compact: true, viewsOnly: true })
  return wrapSection(
    'Comparativa real de rendimiento',
    `<p style="margin:0 0 8px;font-family:Helvetica,Arial,sans-serif;font-size:13px;color:#64748b;">Vistas de los últimos 7 días</p>
    <table role="presentation" width="100%" cellspacing="0" cellpadding="0">
      <tr>
        <td class="mj-column-per-50 stack-col" style="width:50%;max-width:50%;vertical-align:top;padding:0 6px 10px 6px;"><div style="font-family:Helvetica,Arial,sans-serif;font-size:12px;color:#64748b;margin:0 0 6px;">Tu publicación</div>${current}</td>
        <td class="mj-column-per-50 stack-col" style="width:50%;max-width:50%;vertical-align:top;padding:0 6px 10px 6px;"><div style="font-family:Helvetica,Arial,sans-serif;font-size:12px;color:#64748b;margin:0 0 6px;">Referencia con más tracción</div>${benchmark}</td>
      </tr>
    </table>`
  )
}

function buildFeatureChecklist(features = []) {
  const rows = features.slice(0, 6).map((item) => `<tr><td style="padding:0 0 6px;font-family:Helvetica,Arial,sans-serif;font-size:14px;line-height:145%;color:#1f2937;">• ${escapeHtml(item)}</td></tr>`).join('')
  if (!rows) return ''
  return wrapSection('Qué ganás con el upgrade', `<table role="presentation" width="100%" cellspacing="0" cellpadding="0">${rows}</table>`)
}

function buildSingleCta(text, url) {
  return `<table role="presentation" cellpadding="0" cellspacing="0"><tr><td bgcolor="#0ea5e9" style="border-radius:999px;"><a href="${url}" target="_blank" style="display:inline-block;background:#0ea5e9;color:#ffffff;font-family:Helvetica,Arial,sans-serif;font-size:14px;font-weight:700;line-height:130%;text-decoration:none;padding:12px 18px;border-radius:999px;">${escapeHtml(text)}</a></td></tr></table>`
}

function buildSinglePlanOfferCard(offer, baseFront, idx) {
  const title = escapeHtml(offer.title || String(offer.planCode || '').toUpperCase())
  const original = Number.isFinite(Number(offer.originalPrice)) ? formatPrice(Number(offer.originalPrice), 'ARS') : ''
  const discounted = Number.isFinite(Number(offer.discountPrice)) ? formatPrice(Number(offer.discountPrice), 'ARS') : ''
  const url = toAbsoluteUrl(offer.url, baseFront)
  const buttonColor = idx === 0 ? '#0ea5e9' : '#16a34a'
  return `
  <td class="mj-column-per-50 stack-col" style="width:50%;max-width:50%;vertical-align:top;padding:0 6px 10px 6px;">
    <table role="presentation" width="100%" cellspacing="0" cellpadding="0" style="border:1px solid #e5e7eb;border-radius:12px;">
      <tr><td style="padding:12px;">
        <div style="font-family:Helvetica,Arial,sans-serif;font-size:16px;font-weight:800;color:#111827;margin:0 0 6px;">${title}</div>
        ${discounted ? `<div style="font-family:Helvetica,Arial,sans-serif;font-size:20px;font-weight:800;color:#0f172a;margin:0 0 4px;">${discounted}</div>` : ''}
        ${original ? `<div style="font-family:Helvetica,Arial,sans-serif;font-size:12px;color:#64748b;text-decoration:line-through;margin:0 0 10px;">${original}</div>` : ''}
        <table role="presentation" cellpadding="0" cellspacing="0" width="100%"><tr><td bgcolor="${buttonColor}" style="border-radius:10px;text-align:center;"><a href="${url}" target="_blank" style="display:block;background:${buttonColor};color:#ffffff;font-family:Helvetica,Arial,sans-serif;font-size:13px;font-weight:700;line-height:120%;text-decoration:none;padding:10px 8px;border-radius:10px;">Elegir ${title}</a></td></tr></table>
      </td></tr>
    </table>
  </td>`
}

function buildBundleOfferCard(offer, baseFront, idx) {
  const title = escapeHtml(offer.title || 'Bundle')
  const subtitle = escapeHtml(offer.subtitle || '')
  const original = Number.isFinite(Number(offer.originalPrice)) ? formatPrice(Number(offer.originalPrice), 'ARS') : ''
  const discounted = Number.isFinite(Number(offer.discountPrice)) ? formatPrice(Number(offer.discountPrice), 'ARS') : ''
  const url = toAbsoluteUrl(offer.url, baseFront)
  const buttonColor = idx === 0 ? '#dc2626' : '#16a34a' // Rojo para bundle destacado
  
  return `
  <td class="mj-column-per-50 stack-col" style="width:50%;max-width:50%;vertical-align:top;padding:0 6px 10px 6px;">
    <table role="presentation" width="100%" cellspacing="0" cellpadding="0" style="border:2px solid ${buttonColor};border-radius:12px;background:#fef2f2;">
      <tr><td style="padding:12px;">
        <div style="font-family:Helvetica,Arial,sans-serif;font-size:16px;font-weight:800;color:#111827;margin:0 0 4px;">${title}</div>
        ${subtitle ? `<div style="font-family:Helvetica,Arial,sans-serif;font-size:12px;color:#dc2626;margin:0 0 8px;font-weight:600;">${subtitle}</div>` : ''}
        ${discounted ? `<div style="font-family:Helvetica,Arial,sans-serif;font-size:24px;font-weight:800;color:#dc2626;margin:0 0 4px;">${discounted}</div>` : ''}
        ${original ? `<div style="font-family:Helvetica,Arial,sans-serif;font-size:14px;color:#64748b;text-decoration:line-through;margin:0 0 10px;">${original}</div>` : ''}
        <table role="presentation" cellpadding="0" cellspacing="0" width="100%"><tr><td bgcolor="${buttonColor}" style="border-radius:10px;text-align:center;"><a href="${url}" target="_blank" style="display:block;background:${buttonColor};color:#ffffff;font-family:Helvetica,Arial,sans-serif;font-size:14px;font-weight:700;line-height:120%;text-decoration:none;padding:12px 8px;border-radius:10px;">Aprovechar Bundle</a></td></tr></table>
      </td></tr>
    </table>
  </td>`
}

function buildPlanOffers(planOffers = [], baseFront, { isBundle = false } = {}) {
  if (!planOffers.length) return ''

  // Detectar formato bundle
  if (isBundle || planOffers[0]?.bundle) {
    const offers = planOffers.slice(0, 2)
    const cols = offers.map((offer, idx) => buildBundleOfferCard(offer, baseFront, idx))
    return wrapSection('¡Bundle especial! 50% OFF en el total', `
      <p style="margin:0 0 12px;font-family:Helvetica,Arial,sans-serif;font-size:14px;color:#374151;">Pagá una sola vez y aplicá el upgrade a TODAS tus publicaciones.</p>
      <table role="presentation" width="100%" cellspacing="0" cellpadding="0"><tr>${cols.join('')}</tr></table>
    `)
  }

  // Detectar formato nuevo: array de objetos con { listingId, listingTitle, plans }
  const isNewFormat = planOffers[0] && Array.isArray(planOffers[0].plans)

  if (!isNewFormat) {
    // Formato antiguo: array de planes directamente
    const offers = planOffers.slice(0, 2)
    const cols = offers.map((offer, idx) => buildSinglePlanOfferCard(offer, baseFront, idx))
    return wrapSection('', `<table role="presentation" width="100%" cellspacing="0" cellpadding="0"><tr>${cols.join('')}</tr></table>`)
  }

  // Formato nuevo: agrupado por listing
  const sections = []
  
  for (const group of planOffers.slice(0, 3)) { // Máximo 3 publicaciones con planes
    const listingTitle = escapeHtml(group.listingTitle || 'Publicación')
    const plans = (group.plans || []).slice(0, 2) // Máximo 2 planes por publicación
    
    if (!plans.length) continue

    const planCols = plans.map((offer, idx) => buildSinglePlanOfferCard(offer, baseFront, idx))
    
    const sectionHtml = `
    <table role="presentation" width="100%" cellspacing="0" cellpadding="0" style="margin-bottom:16px;">
      <tr><td style="padding:0 6px 8px;">
        <div style="font-family:Helvetica,Arial,sans-serif;font-size:14px;font-weight:600;color:#374151;">${listingTitle}</div>
      </td></tr>
      <tr>${planCols.join('')}</tr>
    </table>`
    
    sections.push(sectionHtml)
  }

  if (!sections.length) return ''
  
  return wrapSection('Planes disponibles para tus publicaciones', sections.join(''))
}

function buildCtaRow(ctas = [], baseFront) {
  const safe = ctas.slice(0, 2).map((cta) => ({ text: String(cta?.text || 'Ver más'), url: toAbsoluteUrl(cta?.url, baseFront) })).filter((c) => c.url)
  if (!safe.length) return ''
  if (safe.length === 1) {
    return wrapSection('', `<table role="presentation" width="100%" cellspacing="0" cellpadding="0"><tr><td align="center" style="padding:8px 0 0;">${buildSingleCta(safe[0].text, safe[0].url)}</td></tr></table>`)
  }
  return wrapSection('', `
  <table role="presentation" width="100%" cellspacing="0" cellpadding="0">
    <tr>
      <td class="mj-column-per-50 stack-col" style="width:50%;max-width:50%;vertical-align:top;padding:0 6px 0 6px;" align="center">${buildSingleCta(safe[0].text, safe[0].url)}</td>
      <td class="mj-column-per-50 stack-col" style="width:50%;max-width:50%;vertical-align:top;padding:0 6px 0 6px;" align="center">${buildSingleCta(safe[1].text, safe[1].url)}</td>
    </tr>
  </table>`)
}

function buildRecommendedActions(actions = []) {
  const list = actions.slice(0, 3)
  if (!list.length) return ''
  const rows = list.map((item) => `<tr><td style="padding:0 0 6px;font-family:Helvetica,Arial,sans-serif;font-size:14px;line-height:145%;color:#334155;">• ${escapeHtml(item)}</td></tr>`).join('')
  return wrapSection('Acciones recomendadas', `<table role="presentation" width="100%" cellspacing="0" cellpadding="0">${rows}</table>`)
}

function renderEmailTemplate({ campaign, baseFront, recipient, payload }) {
  const cleanFront = String(baseFront || BRAND.url).split(',')[0].trim().replace(/\/$/, '')
  const title = payload.title || 'Novedades de tu publicación'
  const subtitle = payload.subtitle || 'Tenemos novedades para vos.'

  const hero = buildHeroSection({ title, subtitle, baseFront: cleanFront })
  const intro = buildIntro(payload.intro)
  const comparison = buildComparisonSection(payload.comparison, cleanFront)
  const cards = buildCardsSection(payload.cards || [], cleanFront, { viewsOnly: payload.viewsOnly === true })
  const features = buildFeatureChecklist(payload.features || [])
  const actions = buildRecommendedActions(payload.recommendedActions || [])
  const offers = buildPlanOffers(payload.planOffers || [], cleanFront, { isBundle: payload.isBundle })
  const hasPlanOffers = Array.isArray(payload.planOffers) && payload.planOffers.length > 0
  const ctaRow = hasPlanOffers ? '' : buildCtaRow(Array.isArray(payload.ctas) ? payload.ctas : [], cleanFront)

  const content = `${hero}${intro ? wrapSection('', intro) : ''}${comparison}${cards}${features}${actions}${offers}${ctaRow}`

  const html = buildWednesdayTemplateBase({
    title: payload.subject || title,
    content,
    baseFront: cleanFront,
    unsubscribeUrl: payload.unsubscribeUrl,
    userEmail: recipient.email,
    preheader: payload.preheader || subtitle,
  })

  const textLines = [
    title,
    '',
    subtitle,
    payload.intro ? `\n${payload.intro}` : '',
    '',
    ...(payload.cards || []).slice(0, 8).map((item) => {
      const price = formatPrice(Number(item.price || 0), item.price_currency || 'ARS')
      const location = item.location || item.seller_location || ''
      const link = toAbsoluteUrl(item.link || `${cleanFront}/listing/${encodeURIComponent(item.slug || item.id || '')}`, cleanFront)
      return `${item.title || 'Publicación'}${price ? ` · ${price}` : ''}${location ? ` · ${location}` : ''} · ${link}`
    }),
    '',
    ...(payload.features || []).slice(0, 6).map((f) => `- ${f}`),
    '',
    ...((payload.planOffers || []).slice(0, 2).flatMap((offer) => {
      // Formato nuevo: objeto con plans array
      if (offer.plans && Array.isArray(offer.plans)) {
        return offer.plans.slice(0, 2).map((plan) => {
          const original = Number.isFinite(Number(plan.originalPrice)) ? formatPrice(Number(plan.originalPrice), 'ARS') : ''
          const discounted = Number.isFinite(Number(plan.discountPrice)) ? formatPrice(Number(plan.discountPrice), 'ARS') : ''
          return `${plan.title || plan.planCode} (${offer.listingTitle || 'Publicación'}): ${discounted || original} ${plan.url ? `· ${toAbsoluteUrl(plan.url, cleanFront)}` : ''}`
        })
      }
      // Formato antiguo: plan directamente
      const original = Number.isFinite(Number(offer.originalPrice)) ? formatPrice(Number(offer.originalPrice), 'ARS') : ''
      const discounted = Number.isFinite(Number(offer.discountPrice)) ? formatPrice(Number(offer.discountPrice), 'ARS') : ''
      return [`${offer.title || offer.planCode}: ${discounted || original} ${offer.url ? `· ${toAbsoluteUrl(offer.url, cleanFront)}` : ''}`]
    })),
    '',
    ...((payload.ctas || []).map((cta) => `${cta.text}: ${toAbsoluteUrl(cta.url, cleanFront)}`)),
    '',
    `Desuscribirse: ${payload.unsubscribeUrl}`,
  ].filter(Boolean)

  return {
    campaign,
    subject: payload.subject || title,
    html,
    text: textLines.join('\n'),
  }
}

module.exports = {
  renderEmailTemplate,
}
