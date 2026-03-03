/**
 * Email Base - Layout y helpers compartidos para automatizaciones de email
 * CicloMarket - 2026
 */

const crypto = require('crypto')

// ============================================================================
// CONFIG
// ============================================================================

const BRAND = {
  name: 'Ciclo Market',
  url: 'https://www.ciclomarket.ar',
  email: 'admin@ciclomarket.ar',
  instagram: '@ciclomarket.ar',
  instagramUrl: 'https://instagram.com/ciclomarket.ar',
  logoPath: '/site-logo.png',
  colors: {
    primary: '#14212e',
    accent: '#2563eb',
    text: '#0c1723',
    muted: '#64748b',
    light: '#f6f8fb',
    border: '#e5ebf3',
  }
}

// ============================================================================
// HELPERS
// ============================================================================

function escapeHtml(input) {
  if (input == null) return ''
  return String(input)
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
}

function formatPrice(amount, currency = 'ARS') {
  if (typeof amount !== 'number' || Number.isNaN(amount)) return ''
  const locale = currency === 'USD' ? 'en-US' : 'es-AR'
  const curr = currency === 'USD' ? 'USD' : 'ARS'
  try {
    return new Intl.NumberFormat(locale, {
      style: 'currency',
      currency: curr,
      maximumFractionDigits: 0,
    }).format(amount)
  } catch {
    return `${curr} ${amount}`
  }
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

function signUnsubscribe(email) {
  const secret = String(process.env.NEWSLETTER_UNSUB_SECRET || process.env.CRON_SECRET || '')
  if (!secret) return null
  return crypto.createHmac('sha256', secret).update(email).digest('base64url')
}

function buildUnsubscribeLink(email, baseUrl) {
  const token = signUnsubscribe(email)
  if (!token) return `${BRAND.url}/ayuda`
  const cleanBase = (baseUrl || process.env.SERVER_BASE_URL || BRAND.url).replace(/\/$/, '')
  return `${cleanBase}/api/newsletter/unsubscribe?e=${encodeURIComponent(email)}&t=${encodeURIComponent(token)}`
}

// ============================================================================
// LAYOUT BASE
// ============================================================================

function buildBaseLayout({ title, content, baseFront, unsubscribeUrl, userEmail, extraFooter = '' }) {
  const year = new Date().getFullYear()
  const viewInBrowser = `${baseFront}/email/view?type=preview&t=${Date.now()}`
  
  return `<!DOCTYPE html>
<html lang="es">
<head>
  <meta charset="UTF-8">
  <meta name="viewport" content="width=device-width, initial-scale=1.0">
  <meta name="color-scheme" content="light">
  <meta name="supported-color-schemes" content="light">
  <title>${escapeHtml(title)}</title>
</head>
<body style="margin:0;padding:0;background:#f5f5f5;font-family:Inter,-apple-system,BlinkMacSystemFont,'Segoe UI',Arial,sans-serif;-webkit-font-smoothing:antialiased;">
  <!-- Preview text (oculto) -->
  <div style="display:none;max-height:0;overflow:hidden;mso-hide:all;">${escapeHtml(title)}</div>
  
  <table role="presentation" cellspacing="0" cellpadding="0" border="0" align="center" style="width:100%;max-width:640px;margin:0 auto;background:#ffffff;">
    <!-- Header -->
    <tr>
      <td style="padding:24px;text-align:center;border-bottom:1px solid ${BRAND.colors.border};">
        <a href="${baseFront}" style="text-decoration:none;">
          <img src="${baseFront}${BRAND.logoPath}" alt="${BRAND.name}" style="height:56px;width:auto;display:block;margin:0 auto;">
        </a>
      </td>
    </tr>
    
    <!-- Content -->
    ${content}
    
    <!-- Footer -->
    <tr>
      <td style="padding:24px;background:${BRAND.colors.light};border-top:1px solid ${BRAND.colors.border};text-align:center;">
        <p style="margin:0 0 12px;font-size:13px;color:${BRAND.colors.muted};">
          <a href="${viewInBrowser}" style="color:${BRAND.colors.accent};text-decoration:underline;">Ver en navegador</a>
          ${unsubscribeUrl ? ` · <a href="${unsubscribeUrl}" style="color:${BRAND.colors.accent};text-decoration:underline;">Desuscribirme</a>` : ''}
        </p>
        ${extraFooter ? `<p style="margin:0 0 12px;font-size:13px;color:${BRAND.colors.muted};">${extraFooter}</p>` : ''}
        <p style="margin:0;font-size:12px;color:#94a3b8;line-height:1.5;">
          <strong>${BRAND.name}</strong> · Marketplace de bicicletas para Argentina<br>
          Seguinos en Instagram: <a href="${BRAND.instagramUrl}" style="color:${BRAND.colors.accent};text-decoration:none;">${BRAND.instagram}</a><br>
          © ${year} ${BRAND.name}. Todos los derechos reservados.
        </p>
      </td>
    </tr>
  </table>
</body>
</html>`
}

// ============================================================================
// COMPONENTES REUTILIZABLES
// ============================================================================

function buildListingCard(item, baseFront) {
  const image = normaliseImageUrl(item.images?.[0], baseFront)
  const link = `${baseFront}/listing/${encodeURIComponent(item.slug || item.id)}`
  const price = formatPrice(item.price, item.price_currency)
  const location = escapeHtml(item.location || item.seller_location || '')
  const brand = escapeHtml(item.brand || '')
  const model = escapeHtml(item.model || '')
  const title = escapeHtml(item.title || 'Publicación en Ciclo Market')
  
  return `
    <table role="presentation" width="100%" cellspacing="0" cellpadding="0" style="border:1px solid ${BRAND.colors.border};border-radius:12px;overflow:hidden;margin-bottom:12px;">
      <tr>
        <td style="padding:0;vertical-align:top;">
          <a href="${link}" style="display:block;text-decoration:none;">
            <img src="${image}" alt="${title}" style="width:100%;height:160px;object-fit:cover;display:block;">
          </a>
        </td>
      </tr>
      <tr>
        <td style="padding:16px;">
          ${brand ? `<div style="font-size:12px;color:${BRAND.colors.muted};text-transform:uppercase;letter-spacing:0.05em;margin-bottom:4px;">${brand}</div>` : ''}
          <div style="font-weight:600;color:${BRAND.colors.text};font-size:15px;line-height:1.3;margin-bottom:4px;">${title}</div>
          ${price ? `<div style="color:${BRAND.colors.accent};font-weight:700;font-size:18px;margin-bottom:4px;">${price}</div>` : ''}
          ${location ? `<div style="color:${BRAND.colors.muted};font-size:13px;margin-bottom:12px;">📍 ${location}</div>` : ''}
          <a href="${link}" style="display:inline-block;padding:10px 18px;background:${BRAND.colors.primary};color:#fff;text-decoration:none;border-radius:8px;font-size:13px;font-weight:600;">Ver publicación</a>
        </td>
      </tr>
    </table>
  `
}

function buildListingRow(item, baseFront, opts = {}) {
  const { showStats = false, views7d = 0, contacts7d = 0 } = opts
  const image = normaliseImageUrl(item.images?.[0], baseFront)
  const link = `${baseFront}/listing/${encodeURIComponent(item.slug || item.id)}`
  const price = formatPrice(item.price, item.price_currency)
  const location = escapeHtml(item.location || item.seller_location || '')
  const title = escapeHtml(item.title || 'Publicación')
  const status = item.status || 'active'
  const statusLabel = status === 'active' ? 'Activa' : status === 'published' ? 'Publicada' : status
  const statusColor = status === 'active' ? '#22c55e' : '#f59e0b'
  
  return `
    <table role="presentation" width="100%" cellspacing="0" cellpadding="0" style="border:1px solid ${BRAND.colors.border};border-radius:12px;margin-bottom:12px;">
      <tr>
        <td style="padding:16px;">
          <table role="presentation" width="100%" cellspacing="0" cellpadding="0">
            <tr>
              <td style="width:90px;vertical-align:top;">
                <a href="${link}">
                  <img src="${image}" style="width:90px;height:70px;object-fit:cover;border-radius:8px;display:block;">
                </a>
              </td>
              <td style="padding-left:14px;vertical-align:top;">
                <div style="font-weight:600;color:${BRAND.colors.text};font-size:15px;margin-bottom:4px;">${title}</div>
                ${price ? `<div style="color:${BRAND.colors.accent};font-weight:700;margin-bottom:4px;">${price}</div>` : ''}
                <div style="font-size:12px;color:${BRAND.colors.muted};margin-bottom:6px;">
                  <span style="display:inline-block;padding:2px 8px;background:${statusColor}20;color:${statusColor};border-radius:12px;font-weight:600;">${statusLabel}</span>
                  ${location ? `· ${location}` : ''}
                </div>
                ${showStats ? `
                <div style="font-size:12px;color:${BRAND.colors.muted};">
                  👁 ${views7d} visitas · 📞 ${contacts7d} contactos (7d)
                </div>
                ` : ''}
              </td>
            </tr>
          </table>
        </td>
      </tr>
    </table>
  `
}

// ============================================================================
// TEXT VERSIONS (fallback)
// ============================================================================

function buildListingText(item, baseFront) {
  const link = `${baseFront}/listing/${encodeURIComponent(item.slug || item.id)}`
  const price = formatPrice(item.price, item.price_currency)
  const parts = [
    item.brand || item.title,
    price,
    item.location || item.seller_location,
    link
  ].filter(Boolean)
  return parts.join(' · ')
}

// ============================================================================
// EXPORTS
// ============================================================================

module.exports = {
  BRAND,
  escapeHtml,
  formatPrice,
  normaliseImageUrl,
  signUnsubscribe,
  buildUnsubscribeLink,
  buildBaseLayout,
  buildListingCard,
  buildListingRow,
  buildListingText,
}
