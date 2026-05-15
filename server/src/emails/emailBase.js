/**
 * Email Base - Layout profesional inspirado en The Pros Closet
 * CicloMarket - 2026
 * 
 * Características:
 * - Max-width: 600px (responsive)
 * - Fuentes: Times New Roman para headers, Helvetica para body
 * - Colores: Beige #F8F7F3, Negro #000000, Blanco #ffffff
 * - Cards de producto: 2 columnas en desktop, 1 en mobile
 * - Botones: Negros con border-radius 100px
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
  logoUrl: 'https://www.ciclomarket.ar/logo-azul.png',
  footerAvatarUrl: 'https://www.ciclomarket.ar/favicon-96x96.png',
  instagramIconUrl: 'https://www.ciclomarket.ar/icons/instagram.svg',
  colors: {
    black: '#000000',
    white: '#ffffff',
    beige: '#F8F7F3',
    accent: '#22c55e',
    muted: '#64748b',
    lightGray: '#f5f5f5',
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
// LAYOUT BASE - Estilo The Pros Closet
// ============================================================================

function buildBaseLayout({ title, content, baseFront, unsubscribeUrl, userEmail, preheader = '' }) {
  const year = new Date().getFullYear()
  const viewInBrowser = `${baseFront}/email/view?type=preview&t=${Date.now()}`
  
  return `<!DOCTYPE html>
<html lang="es" xmlns="http://www.w3.org/1999/xhtml" xmlns:v="urn:schemas-microsoft-com:vml" xmlns:o="urn:schemas-microsoft-com:office:office">
<head>
  <meta charset="UTF-8">
  <meta http-equiv="X-UA-Compatible" content="IE=edge">
  <meta name="viewport" content="width=device-width, initial-scale=1">
  <meta name="color-scheme" content="light">
  <meta name="supported-color-schemes" content="light">
  <title>${escapeHtml(title)}</title>
  <style type="text/css">
    #outlook a { padding: 0; }
    body {
      margin: 0;
      padding: 0;
      -webkit-text-size-adjust: 100%;
      -ms-text-size-adjust: 100%;
      background-color: #ffffff;
    }
    table, td {
      border-collapse: collapse;
      mso-table-lspace: 0pt;
      mso-table-rspace: 0pt;
    }
    img {
      border: 0;
      height: auto;
      line-height: 100%;
      outline: none;
      text-decoration: none;
      -ms-interpolation-mode: bicubic;
      max-width: 100%;
    }
    p { display: block; margin: 13px 0; }
    
    /* Desktop */
    @media only screen and (min-width:600px) {
      .mj-column-per-100 { width: 100% !important; max-width: 100%; }
      .mj-column-per-50 { width: 50% !important; max-width: 50%; }
    }
    
    /* Mobile */
    @media only screen and (max-width:599px) {
      .mj-column-per-50 { width: 100% !important; max-width: 100%; }
      .stack-col { display:block !important; width:100% !important; max-width:100% !important; padding-left:0 !important; padding-right:0 !important; }
      .col-product { width: 100% !important; float: none !important; }
      .nav-text { font-size: 14px !important; }
      .header-headline { font-size: 32px !important; }
      .mobile-padding { padding: 20px !important; }
    }
    
    /* Product grid */
    .col-product {
      width: 50%;
      float: left;
      box-sizing: border-box;
    }
    .col-product img {
      max-width: 100%;
      height: auto;
      display: block;
    }
    .col-product a {
      text-decoration: none;
      color: #000000;
    }
    
    /* Utils */
    a { color: #000000; text-decoration: none; }
    a.nav-text { color: #ffffff !important; text-decoration: none !important; }
  </style>
  <!--[if mso]>
    <noscript>
    <xml>
    <o:OfficeDocumentSettings>
      <o:AllowPNG/>
      <o:PixelsPerInch>96</o:PixelsPerInch>
    </o:OfficeDocumentSettings>
    </xml>
    </noscript>
  <![endif]-->
</head>
<body style="word-spacing:normal;background-color:#ffffff;max-width:600px;margin:0 auto;">
  
  <!-- Preview text (oculto) -->
  ${preheader ? `<div style="display:none;font-size:1px;color:#ffffff;line-height:1px;max-height:0px;max-width:0px;opacity:0;overflow:hidden;">${escapeHtml(preheader)}</div>` : ''}
  
  <!-- LOGO -->
  <table align="center" border="0" cellpadding="0" cellspacing="0" role="presentation" style="width:100%;">
    <tr>
      <td align="center" style="padding:30px 20px;">
        <a href="${baseFront}" target="_blank">
          <img src="${BRAND.logoUrl}" alt="${BRAND.name}" style="height:70px;width:auto;display:block;">
        </a>
      </td>
    </tr>
  </table>
  
  <!-- NAV BAR NEGRA -->
  <table align="center" border="0" cellpadding="0" cellspacing="0" role="presentation" style="width:100%;background:#000000;">
    <tr style="height:55px;">
      <td align="center" style="padding:0;">
        <table border="0" cellpadding="0" cellspacing="0" role="presentation">
          <tr>
            <td style="padding:0 15px;">
              <a href="${baseFront}/marketplace" class="nav-text" style="font-family:Helvetica,Arial,sans-serif;font-size:16px;color:#ffffff;text-decoration:none;">Bicicletas</a>
            </td>
            <td style="padding:0 15px;">
              <a href="${baseFront}/marketplace?cat=Accesorios" class="nav-text" style="font-family:Helvetica,Arial,sans-serif;font-size:16px;color:#ffffff;text-decoration:none;">Accesorios</a>
            </td>
            <td style="padding:0 15px;">
              <a href="${baseFront}/tiendas" class="nav-text" style="font-family:Helvetica,Arial,sans-serif;font-size:16px;color:#ffffff;text-decoration:none;">Tiendas</a>
            </td>
          </tr>
        </table>
      </td>
    </tr>
  </table>
  
  ${content}
  
  <!-- FOOTER NEGRO - Update Settings -->
  <table align="center" border="0" cellpadding="0" cellspacing="0" role="presentation" style="width:100%;background:#000000;margin-top:16px;">
    <tr>
      <td style="padding:30px;direction:ltr;font-size:0px;text-align:center;">
        <!--[if mso | IE]><table role="presentation" border="0" cellpadding="0" cellspacing="0"><tr><td style="vertical-align:top;width:300px;" ><![endif]-->
        <div style="display:inline-block;width:100%;max-width:300px;vertical-align:top;">
          <table border="0" cellpadding="0" cellspacing="0" role="presentation" width="100%">
            <tr>
              <td align="center" style="padding:10px 0;">
                <div style="display:inline-block;padding:8px 14px;border:1px solid #ffffff;border-radius:999px;color:#ffffff;font-family:Helvetica,Arial,sans-serif;font-size:12px;">Ciclo Market</div>
              </td>
            </tr>
          </table>
        </div>
        <!--[if mso | IE]></td><td style="vertical-align:top;width:300px;" ><![endif]-->
        <div style="display:inline-block;width:100%;max-width:300px;vertical-align:top;">
          <table border="0" cellpadding="0" cellspacing="0" role="presentation" width="100%">
            <tr>
              <td align="left" style="padding:10px 0 10px 25px;">
                <div style="font-family:Helvetica,Arial,sans-serif;font-size:14px;font-weight:400;line-height:130%;text-align:left;color:#ffffff;">
                  Para desuscribirte o cambiar tus preferencias de notificación, actualizá tu cuenta.
                </div>
              </td>
            </tr>
            <tr>
              <td align="left" style="padding:20px 0 10px 25px;">
                <table border="0" cellpadding="0" cellspacing="0" role="presentation">
                  <tr>
                    <td align="center" bgcolor="#ffffff" style="border-radius:100px;background:#ffffff;">
                      <a href="${unsubscribeUrl}" style="display:inline-block;background:#ffffff;color:#000000;font-family:Helvetica,Arial,sans-serif;font-size:14px;font-weight:600;line-height:130%;margin:0;text-decoration:none;text-transform:none;padding:12px 24px;border-radius:100px;">Desuscribirme</a>
                    </td>
                  </tr>
                </table>
              </td>
            </tr>
          </table>
        </div>
        <!--[if mso | IE]></td></tr></table><![endif]-->
      </td>
    </tr>
  </table>
  
  <!-- ICONOS / BENEFICIOS -->
  <table align="center" border="0" cellpadding="0" cellspacing="0" role="presentation" style="width:100%;">
    <tr>
      <td id="multi_icon_container" align="center" style="padding:35px 20px 20px;text-align:center;">
        <div style="display:inline-block;margin:0 30px;text-align:center;">
          <div style="font-size:32px;margin-bottom:8px;">🚚</div>
          <p style="font-family:Helvetica,Arial,sans-serif;font-size:14px;font-weight:400;line-height:130%;text-align:center;color:#000000;margin:0;">Publicaciones<br>Verificadas</p>
        </div>
        <div style="display:inline-block;margin:0 30px;text-align:center;">
          <div style="font-size:32px;margin-bottom:8px;">🛡️</div>
          <p style="font-family:Helvetica,Arial,sans-serif;font-size:14px;font-weight:400;line-height:130%;text-align:center;color:#000000;margin:0;">Compra Segura<br>en Argentina</p>
        </div>
        <div style="display:inline-block;margin:0 30px;text-align:center;">
          <div style="font-size:32px;margin-bottom:8px;">💬</div>
          <p style="font-family:Helvetica,Arial,sans-serif;font-size:14px;font-weight:400;line-height:130%;text-align:center;color:#000000;margin:0;">Contacto Directo<br>con Vendedores</p>
        </div>
      </td>
    </tr>
  </table>
  
  <!-- CONTACTO -->
  <table align="center" border="0" cellpadding="0" cellspacing="0" role="presentation" style="width:100%;">
    <tr>
      <td style="border-top:1px solid #000000;padding:30px 20px;">
        <div style="font-family:'Times New Roman',Times,serif;font-size:22px;font-weight:400;line-height:130%;text-align:left;color:#000000;margin-bottom:16px;">¿Tenés preguntas?</div>
        <div style="font-family:Helvetica,Arial,sans-serif;font-size:14px;font-weight:400;line-height:130%;text-align:left;color:#000000;">
          Nuestro equipo está aquí para ayudarte vía email o Instagram.<br>
          <a href="${BRAND.instagramUrl}" style="color:#000000;text-decoration:underline;">${BRAND.instagram}</a>
        </div>
      </td>
    </tr>
  </table>
  
  <!-- SOCIAL / DIRECCION -->
  <table align="center" border="0" cellpadding="0" cellspacing="0" role="presentation" style="width:100%;background:#F8F7F3;">
    <tr>
      <td style="padding:30px 20px;">
        <a href="${BRAND.instagramUrl}" target="_blank" style="font-family:Helvetica,Arial,sans-serif;font-size:13px;color:#000000;text-decoration:underline;">Instagram ${BRAND.instagram}</a>
      </td>
    </tr>
    <tr>
      <td style="padding:0 20px 30px;">
        <div style="font-family:Helvetica,Arial,sans-serif;font-size:12px;font-weight:400;line-height:130%;text-align:left;color:#64748b;">
          <a href="${viewInBrowser}" style="color:#000000;text-decoration:underline;">Ver en navegador</a> · 
          <a href="${unsubscribeUrl}" style="color:#000000;text-decoration:underline;">Desuscribirme</a>
        </div>
        <div style="font-family:Helvetica,Arial,sans-serif;font-size:12px;font-weight:400;line-height:130%;text-align:left;color:#64748b;margin-top:12px;">
          © ${year} ${BRAND.name} · Marketplace de bicicletas para Argentina
        </div>
      </td>
    </tr>
  </table>
  
</body>
</html>`
}

// ============================================================================
// COMPONENTES REUTILIZABLES
// ============================================================================

function buildHeroSection({ title, subtitle, baseFront }) {
  return `
  <!-- HERO SECTION -->
  <table align="center" border="0" cellpadding="0" cellspacing="0" role="presentation" style="width:100%;background:#F8F7F3;">
    <tr>
      <td class="mobile-padding" style="padding:40px 30px;">
        <h1 class="header-headline" style="margin:0 0 16px;font-family:'Times New Roman',Times,serif;font-size:40px;font-weight:400;line-height:110%;color:#000000;text-align:center;letter-spacing:-0.01em;">
          ${escapeHtml(title)}
        </h1>
        ${subtitle ? `<p style="margin:0;font-family:Helvetica,Arial,sans-serif;font-size:18px;font-weight:400;line-height:130%;color:#000000;text-align:center;">${escapeHtml(subtitle)}</p>` : ''}
      </td>
    </tr>
  </table>`
}

function buildProductGrid(items, baseFront) {
  // items: array de { image, title, price, location, link }
  const rows = []
  for (let i = 0; i < items.length; i += 2) {
    const rowItems = items.slice(i, i + 2)
    const rowHtml = rowItems.map(item => {
      const image = normaliseImageUrl(item.image, baseFront)
      const price = formatPrice(item.price, item.price_currency)
      const title = escapeHtml(item.title)
      const location = escapeHtml(item.location || '')
      
      return `
        <div class="col-product" style="padding:10px;box-sizing:border-box;">
          <a href="${item.link}" target="_blank">
            <img src="${image}" alt="${title}" style="width:100%;height:auto;display:block;margin-bottom:12px;">
          </a>
          <p style="margin:0 0 4px;font-family:Helvetica,Arial,sans-serif;font-size:14px;line-height:130%;color:#000000;">
            <a href="${item.link}" target="_blank" style="color:#000000;text-decoration:none;">${title}</a>
          </p>
          ${price ? `<p style="margin:0 0 4px;font-family:Helvetica,Arial,sans-serif;font-size:16px;font-weight:700;color:#000000;">${price}</p>` : ''}
          ${location ? `<p style="margin:0;font-family:Helvetica,Arial,sans-serif;font-size:13px;color:#64748b;">📍 ${location}</p>` : ''}
        </div>
      `
    }).join('')
    
    rows.push(`<div style="overflow:hidden;">${rowHtml}</div>`)
  }
  
  return `
  <!-- PRODUCT GRID -->
  <table align="center" border="0" cellpadding="0" cellspacing="0" role="presentation" style="width:100%;">
    <tr>
      <td style="padding:20px 20px 0;">
        ${rows.join('')}
      </td>
    </tr>
  </table>`
}

function buildCTAButton({ text, url, align = 'center' }) {
  return `
  <!-- CTA BUTTON -->
  <table align="${align}" border="0" cellpadding="0" cellspacing="0" role="presentation" style="width:100%;margin:20px 0;">
    <tr>
      <td align="${align}" style="padding:20px 30px;">
        <table border="0" cellpadding="0" cellspacing="0" role="presentation">
          <tr>
            <td align="center" bgcolor="#000000" style="border-radius:100px;background:#000000;">
              <a href="${url}" target="_blank" style="display:inline-block;background:#000000;color:#ffffff;font-family:Helvetica,Arial,sans-serif;font-size:16px;font-weight:400;line-height:130%;margin:0;text-decoration:none;padding:14px 32px;border-radius:100px;">${escapeHtml(text)}</a>
            </td>
          </tr>
        </table>
      </td>
    </tr>
  </table>`
}

// ============================================================================
// TEXT VERSIONS (fallback)
// ============================================================================

function buildListingText(item, baseFront) {
  const link = `${baseFront}/listing/${encodeURIComponent(item.slug || item.id)}`
  const price = formatPrice(item.price, item.price_currency)
  const parts = [item.title, price, item.location || item.seller_location, link].filter(Boolean)
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
  buildHeroSection,
  buildProductGrid,
  buildCTAButton,
  buildListingText,
}
