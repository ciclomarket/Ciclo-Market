const {
  BRAND,
  escapeHtml,
  formatPrice,
  normaliseImageUrl,
  buildHeroSection,
  buildCTAButton,
} = require('../emails/emailBase')
const { buildWednesdayTemplateBase } = require('../jobs/wednesdayListingUpdate')
const { safeUrl, toAbsoluteUrl } = require('./assetResolver')

function buildListingCard(item, baseFront) {
  if (!item) return ''
  const image = safeUrl(normaliseImageUrl(item.image || item.images?.[0], baseFront))
  const title = escapeHtml(item.title || 'Publicación')
  const price = formatPrice(Number(item.price || 0), item.price_currency || 'ARS')
  const stats = []
  if (Number.isFinite(Number(item.views7d))) stats.push(`${Number(item.views7d)} visitas`)
  if (Number.isFinite(Number(item.contacts7d))) stats.push(`${Number(item.contacts7d)} contactos`)
  if (Number.isFinite(Number(item.waClicks7d))) stats.push(`${Number(item.waClicks7d)} clics WA`)
  const link = toAbsoluteUrl(item.link || `${baseFront}/listing/${encodeURIComponent(item.slug || item.id || '')}`, baseFront)

  return `
  <table role="presentation" width="100%" cellspacing="0" cellpadding="0" style="border:1px solid #e5e5e5;border-radius:12px;overflow:hidden;background:#ffffff;">
    <tr>
      <td>
        <a href="${link}" target="_blank">
          <img src="${image}" alt="${title}" style="width:100%;height:180px;object-fit:cover;display:block;">
        </a>
      </td>
    </tr>
    <tr>
      <td style="padding:14px;">
        <p style="margin:0 0 6px;font-family:Helvetica,Arial,sans-serif;font-size:15px;font-weight:600;line-height:130%;color:#000000;">${title}</p>
        ${price ? `<p style="margin:0 0 6px;font-family:Helvetica,Arial,sans-serif;font-size:18px;font-weight:700;color:#000000;">${price}</p>` : ''}
        ${stats.length ? `<p style="margin:0;font-family:Helvetica,Arial,sans-serif;font-size:13px;color:#64748b;">${escapeHtml(stats.join(' · '))}</p>` : ''}
      </td>
    </tr>
  </table>`
}

function buildCardsSection(cards = [], baseFront) {
  if (!cards.length) return ''
  const rows = cards.slice(0, 12).map((card) => {
    return `<tr><td style="padding:10px 20px;">${buildListingCard(card, baseFront)}</td></tr>`
  }).join('')

  return `
  <table align="center" border="0" cellpadding="0" cellspacing="0" role="presentation" style="width:100%;background:#ffffff;">
    ${rows}
  </table>`
}

function buildComparisonSection(comparison, baseFront) {
  if (!comparison?.current || !comparison?.benchmark) return ''
  const current = buildListingCard(comparison.current, baseFront)
  const benchmark = buildListingCard(comparison.benchmark, baseFront)
  return `
  <table align="center" border="0" cellpadding="0" cellspacing="0" role="presentation" style="width:100%;background:#ffffff;">
    <tr>
      <td style="padding:30px 30px 10px;">
        <h2 style="margin:0;font-family:'Times New Roman',Times,serif;font-size:24px;font-weight:400;color:#000000;">Comparativa real de rendimiento</h2>
      </td>
    </tr>
  </table>
  <table align="center" border="0" cellpadding="0" cellspacing="0" role="presentation" style="width:100%;background:#ffffff;">
    <tr>
      <td style="padding:10px 20px;"><div style="font-family:Helvetica,Arial,sans-serif;font-size:13px;color:#64748b;margin-bottom:8px;">Tu publicación</div>${current}</td>
    </tr>
    <tr>
      <td style="padding:10px 20px 20px;"><div style="font-family:Helvetica,Arial,sans-serif;font-size:13px;color:#64748b;margin-bottom:8px;">Referencia con mejor tracción</div>${benchmark}</td>
    </tr>
  </table>`
}

function renderEmailTemplate({
  campaign,
  baseFront,
  recipient,
  payload,
}) {
  const cleanFront = String(baseFront || BRAND.url).split(',')[0].trim().replace(/\/$/, '')
  const title = payload.title || 'Novedades de tu publicación'
  const subtitle = payload.subtitle || 'Tenemos novedades para vos.'

  const hero = buildHeroSection({ title, subtitle, baseFront: cleanFront })
  const comparison = buildComparisonSection(payload.comparison, cleanFront)
  const cards = buildCardsSection(payload.cards || [], cleanFront)

  const ctas = Array.isArray(payload.ctas) ? payload.ctas : []
  const ctaBlocks = ctas.slice(0, 3).map((cta) => buildCTAButton({
    text: cta.text,
    url: toAbsoluteUrl(cta.url, cleanFront),
    align: 'center',
  })).join('')

  const content = `${hero}${comparison}${cards}${ctaBlocks}`
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
    '',
    ...(payload.cards || []).slice(0, 8).map((item) => {
      const price = formatPrice(Number(item.price || 0), item.price_currency || 'ARS')
      const link = toAbsoluteUrl(item.link || `${cleanFront}/listing/${encodeURIComponent(item.slug || item.id || '')}`, cleanFront)
      return `${item.title || 'Publicación'}${price ? ` · ${price}` : ''} · ${link}`
    }),
    '',
    ...ctas.map((cta) => `${cta.text}: ${toAbsoluteUrl(cta.url, cleanFront)}`),
    '',
    `Desuscribirse: ${payload.unsubscribeUrl}`,
  ]

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
