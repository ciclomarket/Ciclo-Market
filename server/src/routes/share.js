const express = require('express')
const { fetchListingForShare } = require('../lib/listings')

const router = express.Router()

const SITE_NAME = 'Ciclo Market'
const FALLBACK_DESCRIPTION =
  'Publicá tu bici, encontrá ofertas y conectá con vendedores en Ciclo Market. Clasificados de bicicletas en Argentina.'
const DEFAULT_IMAGE = process.env.SHARE_DEFAULT_IMAGE || 'https://ciclomarket.ar/site-logo.png'
const DEFAULT_IMAGE_WIDTH = 1200
const DEFAULT_IMAGE_HEIGHT = 630

function getPrimaryFrontendOrigin() {
  const raw = process.env.FRONTEND_URL || ''
  const first = raw.split(',')[0] || ''
  const trimmed = first.trim()
  return trimmed ? trimmed.replace(/\/$/, '') : 'https://ciclomarket.ar'
}

const FRONTEND_ORIGIN = getPrimaryFrontendOrigin()

function escapeHtml(value) {
  return String(value || '')
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#39;')
}

function toAbsoluteUrl(value, origin) {
  if (!value) return null
  try {
    return new URL(value, origin).toString()
  } catch (error) {
    return value
  }
}

function buildShareHtml(listing) {
  const listingSlugOrId = listing.slug || listing.id
  const canonical = `${FRONTEND_ORIGIN}/listing/${listingSlugOrId}`
  const imageUrl = toAbsoluteUrl(listing.images?.[0], FRONTEND_ORIGIN) || DEFAULT_IMAGE
  const titleParts = [listing.brand, listing.model, listing.year].filter(Boolean)
  const descriptiveTitle = titleParts.length > 0 ? titleParts.join(' ') : listing.title
  const ogTitle = `${escapeHtml(descriptiveTitle)} | ${SITE_NAME}`
  const descriptionRaw = (listing.description || '')
    .replace(/\s+/g, ' ')
    .trim()
    .slice(0, 240)
  const ogDescription = escapeHtml(descriptionRaw || FALLBACK_DESCRIPTION)
  const priceAmount = typeof listing.price === 'number' && Number.isFinite(listing.price)
    ? listing.price.toString()
    : null
  const currency = (listing.priceCurrency || 'ARS').toUpperCase()
  const availability = listing.status === 'sold' ? 'oos' : 'instock'
  const fbAppId = process.env.FACEBOOK_APP_ID || process.env.VITE_FACEBOOK_APP_ID || ''

  return `<!doctype html>
<html lang="es">
  <head>
    <meta charset="utf-8" />
    <title>${ogTitle}</title>
    <meta name="description" content="${ogDescription}" />
    <meta property="og:site_name" content="${SITE_NAME}" />
    <meta property="og:type" content="product" />
    <meta property="og:title" content="${ogTitle}" />
    <meta property="og:description" content="${ogDescription}" />
    <meta property="og:url" content="${escapeHtml(canonical)}" />
    <meta property="og:image" content="${escapeHtml(imageUrl)}" />
    <meta property="og:image:width" content="${DEFAULT_IMAGE_WIDTH}" />
    <meta property="og:image:height" content="${DEFAULT_IMAGE_HEIGHT}" />
    <meta property="og:locale" content="es_AR" />
    <meta property="product:availability" content="${availability}" />
    ${priceAmount ? `<meta property="product:price:amount" content="${priceAmount}" />` : ''}
    ${priceAmount ? `<meta property="product:price:currency" content="${currency}" />` : ''}
    ${fbAppId ? `<meta property="fb:app_id" content="${fbAppId}" />` : ''}

    <meta name="twitter:card" content="summary_large_image" />
    <meta name="twitter:title" content="${ogTitle}" />
    <meta name="twitter:description" content="${ogDescription}" />
    <meta name="twitter:image" content="${escapeHtml(imageUrl)}" />

    <link rel="canonical" href="${escapeHtml(canonical)}" />
    <meta http-equiv="refresh" content="0; url=${escapeHtml(canonical)}" />
    <style>
      body { font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', sans-serif; padding: 2rem; color: #14212e; }
      a { color: #0c72ff; }
      .card { max-width: 420px; margin: 0 auto; border-radius: 16px; border: 1px solid #e5e7eb; padding: 1.5rem; text-align: center; box-shadow: 0 18px 40px -16px rgba(12, 23, 35, 0.18); }
      img { max-width: 100%; border-radius: 12px; margin-bottom: 1rem; }
    </style>
  </head>
  <body>
    <div class="card">
      <img src="${escapeHtml(imageUrl)}" alt="${ogTitle}" loading="lazy" />
      <h1>${ogTitle}</h1>
      <p>Estás siendo redirigido a la publicación original.</p>
      <p><a href="${escapeHtml(canonical)}">Ir a la bicicleta en Ciclo Market &rarr;</a></p>
    </div>
  </body>
</html>`
}

function buildNotFoundHtml() {
  const redirectUrl = `${FRONTEND_ORIGIN}/`
  return `<!doctype html>
<html lang="es">
  <head>
    <meta charset="utf-8" />
    <title>${SITE_NAME}</title>
    <meta http-equiv="refresh" content="0; url=${redirectUrl}" />
  </head>
  <body>
    <p>La publicación no existe o ya no está disponible. <a href="${redirectUrl}">Volver a Ciclo Market</a></p>
  </body>
</html>`
}

router.get('/listing/:identifier', async (req, res) => {
  const identifier = req.params.identifier
  if (!identifier) {
    res.status(400).send(buildNotFoundHtml())
    return
  }

  try {
    const listing = await fetchListingForShare(identifier)
    if (!listing) {
      res.status(404).send(buildNotFoundHtml())
      return
    }
    res.setHeader('Cache-Control', 'public, max-age=300, s-maxage=600, stale-while-revalidate=600')
    res.send(buildShareHtml(listing))
  } catch (error) {
    console.error('[share] unexpected error', error)
    res.status(500).send(buildNotFoundHtml())
  }
})

module.exports = router
