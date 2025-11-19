function escapeHtml(input) {
  return String(input ?? '')
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
}

function normaliseImageUrl(url, baseFront) {
  if (!url) return `${baseFront}/og-preview.png`
  const trimmed = String(url).trim()
  if (!trimmed) return `${baseFront}/og-preview.png`
  if (/^https?:\/\//i.test(trimmed)) return trimmed
  const cleanBase = baseFront.replace(/\/$/, '')
  if (trimmed.startsWith('/')) return `${cleanBase}${trimmed}`
  return `${cleanBase}/${trimmed}`
}

function formatPrice(amount, currency) {
  if (typeof amount !== 'number' || Number.isNaN(amount)) return ''
  const targetCurrency = currency === 'USD' ? 'USD' : 'ARS'
  return new Intl.NumberFormat(targetCurrency === 'USD' ? 'en-US' : 'es-AR', {
    style: 'currency',
    currency: targetCurrency,
    maximumFractionDigits: 0,
  }).format(amount)
}

function buildListingCardHtml(listing, baseFront) {
  const cleanBase = (baseFront || 'https://www.ciclomarket.ar').replace(/\/$/, '')
  const slugOrId = listing?.slug || listing?.id
  const link = `${cleanBase}/listing/${encodeURIComponent(slugOrId)}`
  const title = escapeHtml(listing?.title || 'Publicación en Ciclo Market')
  const priceLabel = formatPrice(listing?.price, listing?.price_currency) || ''
  const location = escapeHtml(listing?.location || listing?.seller_location || '')
  const imageSrc = normaliseImageUrl(listing?.images?.[0], cleanBase)

  return `
    <table role="presentation" cellpadding="0" cellspacing="0" border="0" style="width:100%;border:1px solid #e5ebf3;border-radius:16px;overflow:hidden">
      <tr>
        <td style="width:160px;padding:0;vertical-align:top">
          <a href="${link}" style="display:block;width:160px;height:120px;background:#f5f7fb">
            <img src="${imageSrc}" alt="${title}" style="width:160px;height:120px;object-fit:cover;display:block" />
          </a>
        </td>
        <td style="padding:16px 18px;vertical-align:top">
          <a href="${link}" style="color:#0c1723;font-size:16px;font-weight:600;text-decoration:none;line-height:1.3;display:block;margin-bottom:4px">
            ${title}
          </a>
          ${priceLabel ? `<div style="font-size:15px;color:#2563eb;font-weight:600;margin-bottom:4px">${priceLabel}</div>` : ''}
          ${location ? `<div style="font-size:13px;color:#6b7280;margin-bottom:8px">${location}</div>` : ''}
          <a href="${link}" style="display:inline-block;padding:10px 16px;background:#14212e;color:#fff;text-decoration:none;border-radius:10px;font-weight:600;font-size:13px">Ver publicación</a>
        </td>
      </tr>
    </table>
  `
}

function buildListingCardText(listing, baseFront) {
  const cleanBase = (baseFront || 'https://www.ciclomarket.ar').replace(/\/$/, '')
  const slugOrId = listing?.slug || listing?.id
  const link = `${cleanBase}/listing/${encodeURIComponent(slugOrId)}`
  const title = listing?.title || 'Publicación en Ciclo Market'
  const priceLabel = formatPrice(listing?.price, listing?.price_currency) || ''
  const location = listing?.location || listing?.seller_location || ''

  const parts = [title]
  if (priceLabel) parts.push(priceLabel)
  if (location) parts.push(location)
  parts.push(link)
  return parts.filter(Boolean).join(' · ')
}

module.exports = {
  buildListingCardHtml,
  buildListingCardText,
  escapeHtml,
  formatPrice,
}
