const { onRequest } = require('firebase-functions/v2/https')
const { Readable } = require('stream')
const { Resend } = require('resend')

// Canonical site origin (force www)
const SITE_ORIGIN = 'https://www.ciclomarket.ar'
const SUPABASE_URL = process.env.SUPABASE_URL || 'https://jmtsgywgeysagnfgdovr.supabase.co'
const SUPABASE_SERVICE_ROLE_KEY = process.env.SUPABASE_SERVICE_ROLE_KEY || ''
const FACEBOOK_APP_ID = '1873135236620793'

async function getSupabase() {
  if (!SUPABASE_URL || !SUPABASE_SERVICE_ROLE_KEY) {
    throw new Error('Supabase env vars missing')
  }
  const mod = await import('@supabase/supabase-js')
  return mod.createClient(SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY, { auth: { persistSession: false } })
}

const BOT_UA_RE = /(facebookexternalhit|facebot|whatsapp|twitterbot|linkedinbot|slackbot|discordbot|telegrambot|pinterest|googlebot)/i

function isBot(req) {
  const ua = String(req.get('user-agent') || '')
  return BOT_UA_RE.test(ua)
}

function escapeHtml(value) {
  return String(value || '')
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#39;')
}

function toAbsoluteUrl(value, origin = SITE_ORIGIN) {
  if (!value) return null
  try { return new URL(value, origin).toString() } catch { return value }
}

function buildCache(res) {
  res.set('Cache-Control', 'public, max-age=300, s-maxage=3600')
}

// Email template: aviso con prioridad, 90 días y contacto abierto
function buildUpgradeEmailHtml({
  title,
  image,
  price,
  currency = 'ARS',
  listingUrl,
  dashboardUrl = 'https://www.ciclomarket.ar/dashboard',
  location,
}) {
  const safeTitle = escapeHtml(title || 'Tu publicación')
  const safeImage = escapeHtml(image || `${SITE_ORIGIN}/logo-azul.png`)
  const safePrice = escapeHtml(price != null ? String(price) : '')
  const safeCurrency = escapeHtml(currency)
  const safeListingUrl = escapeHtml(listingUrl || SITE_ORIGIN)
  const safeDashboardUrl = escapeHtml(dashboardUrl)
  const safeLocation = escapeHtml(location || '')

  return `<!doctype html>
<html lang="es">
<head>
  <meta charset="UTF-8" />
  <title>Ciclo Market – Tu aviso ahora con prioridad</title>
  <style>
    body { margin:0; padding:0; background:#f5f7fb; font-family: 'Inter', Arial, sans-serif; color:#0f172a; }
    .container { max-width:640px; margin:0 auto; padding:32px 20px; }
    .card { background:#fff; border:1px solid #e5e7eb; border-radius:16px; padding:24px; box-shadow:0 10px 30px rgba(15,23,42,0.08); }
    h1 { margin:0 0 12px; font-size:24px; line-height:1.3; color:#0f172a; }
    p { margin:0 0 12px; font-size:15px; line-height:1.6; color:#1f2937; }
    .highlight { color:#0b7bff; font-weight:700; }
    .listing { display:flex; gap:16px; align-items:flex-start; margin:16px 0; }
    .listing img { width:160px; height:120px; object-fit:cover; border-radius:12px; border:1px solid #e5e7eb; }
    .badge { display:inline-block; padding:6px 10px; background:#0b7bff; color:#fff; border-radius:999px; font-weight:700; font-size:12px; letter-spacing:0.2px; }
    .cta-row { display:flex; gap:12px; flex-wrap:wrap; margin-top:16px; }
    .btn { display:inline-block; padding:12px 18px; border-radius:10px; font-weight:700; text-decoration:none; text-align:center; }
    .btn-primary { background:#0b7bff; color:#fff; }
    .btn-secondary { background:#0f172a; color:#fff; }
    .small { font-size:13px; color:#475569; }
    .footer { margin-top:24px; font-size:12px; color:#94a3b8; text-align:center; }
    .social a { color:#0b7bff; text-decoration:none; margin:0 8px; }
  </style>
</head>
<body>
  <div class="container">
    <div style="text-align:center; margin-bottom:16px;">
      <img src="${SITE_ORIGIN}/logo-azul.png" alt="Ciclo Market" style="height:38px;" />
    </div>
    <div class="card">
      <div style="margin-bottom:12px;">
        <span class="badge">Actualización de tu aviso</span>
      </div>
      <h1>Tu publicación ahora tiene prioridad</h1>
      <p>En <strong>Ciclo Market</strong> nos reinventamos todos los días para ofrecer el mejor servicio a nuestra comunidad.</p>
      <p><span class="highlight">¿Qué cambió?</span></p>
      <ul style="margin:0 0 16px 18px; padding:0; color:#1f2937; line-height:1.5; font-size:15px;">
        <li>Las publicaciones Básica o Premium ahora suben de prioridad en las búsquedas.</li>
        <li>Renovamos los vencimientos: tu aviso se mantiene visible por <strong>90 días</strong>.</li>
        <li>Los compradores ya no necesitan crear cuenta para ver tus datos de contacto, generando más leads.</li>
      </ul>

      <div class="listing">
        <img src="${safeImage}" alt="Foto de ${safeTitle}" />
        <div>
          <p style="margin:0 0 6px; font-size:16px; font-weight:700; color:#0f172a;">${safeTitle}</p>
          <p style="margin:0 0 8px; font-size:15px; color:#0b7bff; font-weight:700;">${safePrice ? `${safePrice} ${safeCurrency}` : ''}</p>
          ${safeLocation ? `<p class="small" style="margin:0;">${safeLocation}</p>` : ''}
        </div>
      </div>

      <div class="cta-row">
        <a class="btn btn-primary" href="${safeListingUrl}" target="_blank" rel="noreferrer">Ver publicación</a>
        <a class="btn btn-secondary" href="${safeDashboardUrl}" target="_blank" rel="noreferrer">¿Ya la vendiste? Marcala como vendida</a>
      </div>

      <p class="small" style="margin-top:18px;">Gracias por confiar en Ciclo Market. Seguimos optimizando para que vendas más rápido y con mejor experiencia.</p>
    </div>
    <div class="footer">
      <div class="social" style="margin-bottom:8px;">
        <a href="https://www.instagram.com/ciclomarket.ar" target="_blank" rel="noreferrer">Instagram</a> ·
        <a href="https://www.facebook.com/ciclomarket.ar" target="_blank" rel="noreferrer">Facebook</a>
      </div>
      Ciclo Market · Marketplace de bicicletas · <a href="${SITE_ORIGIN}" style="color:#0b7bff; text-decoration:none;">www.ciclomarket.ar</a>
    </div>
  </div>
</body>
</html>`
}

// Para usuarios (no bots): servir el index.html de la SPA y evitar bucles de redirect
async function sendSpaIndexHtml(res) {
  try {
    const upstream = await fetch(`${SITE_ORIGIN}/index.html`, {
      method: 'GET',
      headers: { 'Accept': 'text/html,application/xhtml+xml,application/xml;q=0.9,*/*;q=0.8' },
    })
    const text = await upstream.text()
    const ct = upstream.headers.get('content-type') || 'text/html; charset=utf-8'
    res.set('Content-Type', ct)
    const cc = upstream.headers.get('cache-control') || 'no-cache, no-store, must-revalidate'
    res.set('Cache-Control', cc)
    return res.status(200).send(text)
  } catch (err) {
    console.error('[functions] failed to proxy index.html', err)
    return res.status(200).send('<!doctype html><title>Ciclo Market</title><div id="root"></div>')
  }
}

function setBotHeaders(res) {
  // Allow indexing of these server-rendered previews and be permissive to scrapers
  res.set('X-Robots-Tag', 'all')
  res.set('Access-Control-Allow-Origin', '*')
  res.set('X-Content-Type-Options', 'nosniff')
}

function redirectToSpa(res, pathWithQuery) {
  const target = new URL(pathWithQuery.startsWith('/') ? pathWithQuery : `/${pathWithQuery}`, SITE_ORIGIN)
  return res.redirect(302, target.toString())
}

function renderOgHtml({
  title,
  description,
  image,
  url,
  type = 'website',
  siteName = 'Ciclo Market',
  extraMeta = '',
}) {
  const safeTitle = escapeHtml(title)
  const safeDesc = escapeHtml(description)
  const safeImage = escapeHtml(image)
  const safeUrl = escapeHtml(url)
  return `<!doctype html>
<html lang="es">
  <head>
    <meta charset="utf-8" />
    <title>${safeTitle}</title>
    <meta name="description" content="${safeDesc}" />
    <link rel="canonical" href="${safeUrl}" />

    <meta property="og:site_name" content="${siteName}" />
    <meta property="og:type" content="${type}" />
    <meta property="og:title" content="${safeTitle}" />
    <meta property="og:description" content="${safeDesc}" />
    <meta property="og:url" content="${safeUrl}" />
    <meta property="og:image" content="${safeImage}" />
    <meta property="og:image:width" content="1200" />
    <meta property="og:image:height" content="630" />
    <meta property="og:locale" content="es_AR" />
    ${FACEBOOK_APP_ID ? `<meta property=\"fb:app_id\" content=\"${FACEBOOK_APP_ID}\" />` : ''}
    ${extraMeta || ''}

    <meta name="twitter:card" content="summary_large_image" />
    <meta name="twitter:title" content="${safeTitle}" />
    <meta name="twitter:description" content="${safeDesc}" />
    <meta name="twitter:image" content="${safeImage}" />
    <style>
      body { font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, sans-serif; padding: 2rem; color: #14212e; }
      a { color: #0c72ff; }
      .card { max-width: 520px; margin: 0 auto; border-radius: 16px; border: 1px solid #e5e7eb; padding: 1.5rem; text-align: center; box-shadow: 0 18px 40px -16px rgba(12, 23, 35, 0.18); }
      img { max-width: 100%; border-radius: 12px; margin-bottom: 1rem; }
    </style>
  </head>
  <body>
    <div class="card">
      <img src="${safeImage}" alt="${safeTitle}" loading="lazy" />
      <h1>${safeTitle}</h1>
      <p>Vista previa para compartir.</p>
      <p><a href="${safeUrl}">Abrir en Ciclo Market →</a></p>
    </div>
  </body>
</html>`
}

exports.imageProxy = onRequest({ region: 'us-central1' }, async (req, res) => {
  if (req.method !== 'GET') {
    res.set('Allow', 'GET')
    return res.status(405).send('Method Not Allowed')
  }

  try {
    const upstreamUrl = new URL(req.originalUrl || req.url, SUPABASE_URL)

    const headers = {}
    const authHeader = req.get('authorization')
    if (authHeader) headers.authorization = authHeader

    const upstream = await fetch(upstreamUrl.toString(), { method: 'GET', headers })

    if (!upstream.body) {
      const fallbackText = await upstream.text().catch(() => '')
      return res.status(upstream.status || 502).send(fallbackText || 'Upstream error')
    }

    res.status(upstream.status)

    const contentType = upstream.headers.get('content-type')
    if (contentType) res.setHeader('Content-Type', contentType)

    res.setHeader(
      'Cache-Control',
      'public, max-age=2592000, s-maxage=2592000, immutable'
    )

    Readable.fromWeb(upstream.body).pipe(res)
  } catch (err) {
    console.error('[functions/imageProxy] error', err)
    res.status(502).send('Bad Gateway')
  }
})

// Share: Blog posts (robust)
exports.shareBlog = onRequest({ region: 'us-central1', memory: '256MiB', secrets: ['SUPABASE_URL','SUPABASE_SERVICE_ROLE_KEY'] }, async (req, res) => {
  // Respuesta varía por UA
  res.set('Vary', 'User-Agent')

  const FALLBACK_IMAGE = `${SITE_ORIGIN}/OG-Marketplace.png`
  const FALLBACK_LOGO = `${SITE_ORIGIN}/logo-azul.png`
  const SITE_HOST = new URL(SITE_ORIGIN).host

  function safeDecode(segment) {
    try { return decodeURIComponent(segment) } catch { return segment || '' }
  }
  function clamp(text, max) {
    const t = String(text || '').replace(/\s+/g, ' ').trim()
    return t.length <= max ? t : `${t.slice(0, max - 1).trimEnd()}…`
  }
  function stripHtml(html) {
    return String(html || '')
      .replace(/<style[^>]*>[\s\S]*?<\/style>/gi, ' ')
      .replace(/<script[^>]*>[\s\S]*?<\/script>/gi, ' ')
      .replace(/<!--[\s\S]*?-->/g, ' ')
      .replace(/<[^>]+>/g, ' ')
  }
  function ensureSiteUrl(pathOrUrl, fallbackPath) {
    const candidate = toAbsoluteUrl(pathOrUrl || fallbackPath, SITE_ORIGIN)
    try {
      const u = new URL(candidate)
      return u.host === SITE_HOST ? u.toString() : new URL(fallbackPath, SITE_ORIGIN).toString()
    } catch {
      return new URL(fallbackPath, SITE_ORIGIN).toString()
    }
  }

  // Parseo slug seguro
  const rawPath = req.originalUrl || req.url || '/blog'
  let urlObj
  try { urlObj = new URL(rawPath, SITE_ORIGIN) } catch { urlObj = new URL('/blog', SITE_ORIGIN) }
  const rawSlug = urlObj.pathname.replace(/^\/blog\//, '').replace(/\/+$/, '')
  const slug = safeDecode(rawSlug)

  // Usuarios reales: devolver index.html de la SPA (evita bucles de redirect con rewrites)
  if (!isBot(req)) {
    return sendSpaIndexHtml(res)
  }

  // Fallback HTML (nunca 5xx para bots)
  function sendFallback(statusOk = 200) {
    const canonical = new URL(`/blog/${slug || ''}`, SITE_ORIGIN).toString()
    const title = clamp('Artículo · Ciclo Market', 90)
    const description = clamp('Leé historias y guías en el blog de Ciclo Market.', 220)
    const image = FALLBACK_IMAGE
    const extraMeta = `<meta property="og:image:secure_url" content="${escapeHtml(image)}" />`
    setBotHeaders(res)
    buildCache(res)
    res.set('Content-Type', 'text/html; charset=utf-8')
    const html = renderOgHtml({ title, description, image, url: canonical, type: 'article', extraMeta })
    return res.status(statusOk).send(html)
  }

  // Early fallback si faltan envs
  if (!SUPABASE_URL || !SUPABASE_SERVICE_ROLE_KEY) {
    console.error('[shareBlog] missing Supabase env')
    return sendFallback(200)
  }

  try {
    const supabase = await getSupabase()
    let row, error
    try {
      const q = await supabase
        .from('blog_posts')
        .select('title, slug, excerpt, cover_image_url, html_content, status, seo_title, seo_description, canonical_url, og_image_url')
        .eq('slug', slug)
        .maybeSingle()
      row = q.data; error = q.error
      if (error) throw error
    } catch (e) {
      console.warn('[shareBlog] fetch with seo columns failed, retrying minimal set', e)
      const q2 = await supabase
        .from('blog_posts')
        .select('title, slug, excerpt, cover_image_url, html_content, status')
        .eq('slug', slug)
        .maybeSingle()
      row = q2.data; error = q2.error
      if (error) console.warn('[shareBlog] minimal fetch error', error)
    }

    const isPublished = row && String(row.status || '').toLowerCase() === 'published'
    if (!row || !isPublished) {
      console.warn('[shareBlog] post not published or missing', slug)
      return sendFallback(200)
    }

    const canonical = ensureSiteUrl(row.canonical_url, `/blog/${row.slug}`)
    const baseTitle = row.seo_title || row.title || 'Artículo · Ciclo Market'
    const title = clamp(`${baseTitle} | Ciclo Market`, 90)
    const fallbackDesc = row.seo_description || row.excerpt || stripHtml(row.html_content) || 'Leé historias y guías en el blog de Ciclo Market.'
    const description = clamp(fallbackDesc, 220)
    const image = toAbsoluteUrl(row.og_image_url || row.cover_image_url || FALLBACK_IMAGE, SITE_ORIGIN) || FALLBACK_LOGO
    const extraMeta = `<meta property="og:image:secure_url" content="${escapeHtml(image)}" />`

    const html = renderOgHtml({ title, description, image, url: canonical, type: 'article', extraMeta })
    setBotHeaders(res)
    buildCache(res)
    res.set('Content-Type', 'text/html; charset=utf-8')
    return res.status(200).send(html)
  } catch (err) {
    console.error('[functions/shareBlog] unexpected error', err)
    return sendFallback(200)
  }
})

// Share: Listings (products) robust
exports.shareListing = onRequest({ region: 'us-central1', memory: '256MiB', secrets: ['SUPABASE_URL','SUPABASE_SERVICE_ROLE_KEY'] }, async (req, res) => {
  // Diferenciar caché por User-Agent (evita servir HTML de bot a usuarios)
  res.set('Vary', 'User-Agent')

  // Helpers defensivos locales
  const FALLBACK_IMAGE = `${SITE_ORIGIN}/OG-Marketplace.png`
  const FALLBACK_LOGO = `${SITE_ORIGIN}/logo-azul.png`
  const SITE_HOST = new URL(SITE_ORIGIN).host

  function safeDecode(segment) {
    try { return decodeURIComponent(segment) } catch { return segment || '' }
  }
  function clamp(text, max) {
    const t = String(text || '').replace(/\s+/g, ' ').trim()
    return t.length <= max ? t : `${t.slice(0, max - 1).trimEnd()}…`
  }
  function stripHtml(html) {
    return String(html || '')
      .replace(/<style[^>]*>[\s\S]*?<\/style>/gi, ' ')
      .replace(/<script[^>]*>[\s\S]*?<\/script>/gi, ' ')
      .replace(/<!--[\s\S]*?-->/g, ' ')
      .replace(/<[^>]+>/g, ' ')
  }
  function firstImage(images) {
    if (Array.isArray(images) && images.length) {
      const first = images[0]
      if (first && typeof first === 'object' && 'url' in first) return first.url
      return String(first)
    }
    return null
  }
  function ensureSiteUrl(pathOrUrl, fallbackPath) {
    const candidate = toAbsoluteUrl(pathOrUrl || fallbackPath, SITE_ORIGIN)
    try {
      const u = new URL(candidate)
      return u.host === SITE_HOST ? u.toString() : new URL(fallbackPath, SITE_ORIGIN).toString()
    } catch {
      return new URL(fallbackPath, SITE_ORIGIN).toString()
    }
  }

  // Parseo de URL/slug seguro
  const rawPath = req.originalUrl || req.url || '/listing'
  let urlObj
  try { urlObj = new URL(rawPath, SITE_ORIGIN) } catch { urlObj = new URL('/listing', SITE_ORIGIN) }
  const rawSlug = urlObj.pathname.replace(/^\/listing\//, '').replace(/\/+$/, '')
  const slug = safeDecode(rawSlug)

  // Usuarios normales: devolver index.html de la SPA (evita bucles de redirect con rewrites)
  if (!isBot(req)) {
    return sendSpaIndexHtml(res)
  }

  // HTML fallback para bots (nunca 5xx)
  function sendFallback(statusOk = 200) {
    const canonical = new URL(`/listing/${slug || ''}`, SITE_ORIGIN).toString()
    const title = clamp('Publicación en Ciclo Market', 90)
    const description = clamp('Bicicleta publicada en Ciclo Market. Descubrí fotos, precio y especificaciones.', 220)
    const image = FALLBACK_IMAGE
    const extraMeta = `<meta property="product:availability" content="instock" />\n<meta property="og:image:secure_url" content="${escapeHtml(image)}" />`
    setBotHeaders(res)
    buildCache(res)
    res.set('Content-Type', 'text/html; charset=utf-8')
    const html = renderOgHtml({ title, description, image, url: canonical, type: 'product', extraMeta })
    return res.status(statusOk).send(html)
  }

  // Early fallback si faltan envs de Supabase
  if (!SUPABASE_URL || !SUPABASE_SERVICE_ROLE_KEY) {
    console.error('[shareListing] missing Supabase env')
    return sendFallback(200)
  }

  try {
    const supabase = await getSupabase()

    function isUuid(value) {
      return /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i.test(String(value || ''))
    }

    async function fetchListing(slugOrParam) {
      const param = String(slugOrParam || '').trim()

      // 1) Intento por slug (columna TEXT)
      try {
        const bySlug = await supabase
          .from('listings')
          .select('*')
          .eq('slug', param)
          .maybeSingle()
        if (bySlug?.data) return bySlug.data
      } catch (e) {
        console.warn('[shareListing] slug query error', e)
      }

      // 2) Si el parámetro es un UUID válido, probar por id directamente
      if (isUuid(param)) {
        try {
          const byId = await supabase
            .from('listings')
            .select('*')
            .eq('id', param)
            .maybeSingle()
          if (byId?.data) return byId.data
        } catch (e) {
          console.warn('[shareListing] direct id query error', e)
        }
      }

      // 3) Compatibilidad: slugs del tipo "...--<uuid>"
      try {
        const delim = '--'
        const idx = param.lastIndexOf(delim)
        if (idx !== -1) {
          const idGuess = param.slice(idx + delim.length)
          if (isUuid(idGuess)) {
            const byId = await supabase
              .from('listings')
              .select('*')
              .eq('id', idGuess)
              .maybeSingle()
            if (byId?.data) return byId.data
          }
        }
      } catch (e) {
        console.warn('[shareListing] legacy id query error', e)
      }

      return null
    }

    const row = await fetchListing(slug)
    if (!row) {
      console.warn('[shareListing] listing not found', slug)
      return sendFallback(200)
    }

    const brand = String(row.brand || '').trim()
    const model = String(row.model || '').trim()
    const year = row.year ? String(row.year) : ''
    const typeMap = { ruta: 'Ruta', gravel: 'Gravel', mtb: 'MTB', urbana: 'Urbana' }
    const rawCat = (row.category || '').toString().toLowerCase()
    const type = typeMap[rawCat] || (row.category || '').toString()
    const group = (row.drivetrain_detail || row.drivetrain || '').toString()

    const parts = [brand, model, year].filter(Boolean)
    const titleCore = parts.length ? parts.join(' ') : (row.title || 'Publicación')
    const title = clamp(`${titleCore} – Ciclo Market`, 90)

    const fragments = [year || null, type || null, group || null].filter(Boolean)
    const descriptionRaw = `${[brand, model].filter(Boolean).join(' ')}${fragments.length ? ' · ' + fragments.join(' · ') : ''} · Publicada en Ciclo Market.`
    const description = clamp(descriptionRaw || stripHtml(row.description) || 'Publicada en Ciclo Market.', 220)

    let rawImg = firstImage(row.images) || FALLBACK_IMAGE
    // Si la imagen proviene de Supabase y no tiene query, solicitar versión optimizada (ancho 1200)
    if (rawImg && rawImg.includes('supabase.co') && !rawImg.includes('?')) {
      rawImg = `${rawImg}?width=1200&quality=80&resize=contain`
    }
    const image = toAbsoluteUrl(rawImg, SITE_ORIGIN) || FALLBACK_LOGO

    const canonical = ensureSiteUrl(`/listing/${row.slug || row.id}`, `/listing/${slug || ''}`)

    const priceAmount = typeof row.price === 'number' && Number.isFinite(row.price) ? row.price.toString() : ''
    const currency = (row.price_currency || 'ARS').toString().toUpperCase()
    const availability = String(row.status || '').toLowerCase() === 'sold' ? 'oos' : 'instock'
    const extraMeta = `${priceAmount ? `<meta property=\"product:price:amount\" content=\"${escapeHtml(priceAmount)}\" />` : ''}
${priceAmount ? `<meta property=\"product:price:currency\" content=\"${escapeHtml(currency)}\" />` : ''}
<meta property=\"product:availability\" content=\"${escapeHtml(availability)}\" />
<meta property=\"og:image:secure_url\" content=\"${escapeHtml(image)}\" />`

    const html = renderOgHtml({ title, description, image, url: canonical, type: 'product', extraMeta })
    setBotHeaders(res)
    buildCache(res)
    res.set('Content-Type', 'text/html; charset=utf-8')
    return res.status(200).send(html)
  } catch (err) {
    console.error('[shareListing] unexpected error', err)
    return sendFallback(200)
  }
})

// Share: Stores (profiles) robust
exports.shareStore = onRequest({ region: 'us-central1', memory: '256MiB', secrets: ['SUPABASE_URL','SUPABASE_SERVICE_ROLE_KEY'] }, async (req, res) => {
  res.set('Vary', 'User-Agent')

  const FALLBACK_IMAGE = `${SITE_ORIGIN}/og-preview.png`
  const FALLBACK_LOGO = `${SITE_ORIGIN}/logo-azul.png`

  function safeDecode(segment) {
    try { return decodeURIComponent(segment) } catch { return segment || '' }
  }
  function clamp(text, max) {
    const t = String(text || '').replace(/\s+/g, ' ').trim()
    return t.length <= max ? t : `${t.slice(0, max - 1).trimEnd()}…`
  }

  // Parse slug
  const rawPath = req.originalUrl || req.url || '/tienda'
  let urlObj
  try { urlObj = new URL(rawPath, SITE_ORIGIN) } catch { urlObj = new URL('/tienda', SITE_ORIGIN) }
  const rawSlug = urlObj.pathname.replace(/^\/tienda\//, '').replace(/\/+$/, '')
  const slug = safeDecode(rawSlug)

  // Humans → SPA
  if (!isBot(req)) {
    return sendSpaIndexHtml(res)
  }

  // Fallback for bots
  function sendFallback(statusOk = 200) {
    const canonical = new URL(`/tienda/${slug || ''}`, SITE_ORIGIN).toString()
    const title = clamp('Tienda oficial · Ciclo Market', 90)
    const description = clamp('Conocé información del local, contacto y productos publicados por esta tienda en Ciclo Market.', 220)
    const image = FALLBACK_IMAGE
    const extraMeta = `<meta property=\"og:image:secure_url\" content=\"${escapeHtml(image)}\" />`
    setBotHeaders(res)
    buildCache(res)
    res.set('Content-Type', 'text/html; charset=utf-8')
    const html = renderOgHtml({ title, description, image, url: canonical, type: 'profile', extraMeta })
    return res.status(statusOk).send(html)
  }

  if (!SUPABASE_URL || !SUPABASE_SERVICE_ROLE_KEY) {
    console.error('[shareStore] missing Supabase env')
    return sendFallback(200)
  }

  try {
    const supabase = await getSupabase()
    // Buscar perfil de tienda por store_slug
    const slugLower = String(slug || '').toLowerCase()
    const { data: row, error } = await supabase
      .from('users')
      .select('id, store_slug, store_name, store_avatar_url, bio, store_enabled, city, province')
      .eq('store_slug', slugLower)
      .maybeSingle()
    if (error) console.warn('[shareStore] fetch error', error)

    if (!row) {
      console.warn('[shareStore] store not found', slug)
      return sendFallback(200)
    }

    const name = String(row.store_name || '').trim() || 'Tienda oficial'
    const location = [row.city, row.province].filter(Boolean).join(', ')
    const baseTitle = `${name} – Ciclo Market`
    const canonical = new URL(`/tienda/${row.store_slug || slug}`, SITE_ORIGIN).toString()
    const descSource = row.bio || (location ? `Tienda en ${location}.` : '') || 'Perfil de tienda en Ciclo Market.'
    const description = clamp(descSource, 220)

    let rawImg = row.store_avatar_url || FALLBACK_IMAGE
    if (rawImg && rawImg.includes('supabase.co') && !rawImg.includes('?')) {
      rawImg = `${rawImg}?width=1200&quality=80&resize=contain`
    }
    const image = toAbsoluteUrl(rawImg, SITE_ORIGIN) || FALLBACK_LOGO

    const html = renderOgHtml({ title: clamp(baseTitle, 90), description, image, url: canonical, type: 'profile' })
    setBotHeaders(res)
    buildCache(res)
    res.set('Content-Type', 'text/html; charset=utf-8')
    return res.status(200).send(html)
  } catch (err) {
    console.error('[shareStore] unexpected error', err)
    return sendFallback(200)
  }
})

// Exponer template para uso desde backend (cron / envíos masivos)
exports.buildUpgradeEmailHtml = buildUpgradeEmailHtml

// Endpoint manual para disparar emails de upgrade por vendedor (usar desde Render/cron)
exports.sendUpgradeEmail = onRequest(
  {
    region: 'us-central1',
    timeoutSeconds: 120,
    memory: '256MiB',
    secrets: ['SUPABASE_URL', 'SUPABASE_SERVICE_ROLE_KEY', 'RESEND_API_KEY'],
  },
  async (req, res) => {
    if (req.method !== 'POST') {
      res.set('Allow', 'POST')
      return res.status(405).send('Method Not Allowed')
    }

    const email =
      (req.body && (req.body.email || req.body.target)) ||
      req.query.email ||
      ''
    const targetEmail = String(email).trim().toLowerCase()
    if (!targetEmail) {
      return res.status(400).json({ ok: false, error: 'email_required' })
    }

    try {
      const supabase = await getSupabase()
      const { data: rows, error } = await supabase
        .from('listings')
        .select('id,title,slug,price,price_currency,images,location,seller_email,status')
        .eq('seller_email', targetEmail)
        .in('status', ['active', 'published'])
        .order('created_at', { ascending: false })

      if (error) throw error
      if (!rows || rows.length === 0) {
        return res.status(404).json({ ok: false, error: 'no_listings' })
      }

      const cards = rows
        .map((row) => {
          const firstImg = Array.isArray(row.images) && row.images.length
            ? (typeof row.images[0] === 'string'
              ? row.images[0]
              : (row.images[0] && row.images[0].url) || `${SITE_ORIGIN}/logo-azul.png`)
            : `${SITE_ORIGIN}/logo-azul.png`
          return buildUpgradeEmailHtml({
            title: row.title,
            image: firstImg,
            price: row.price,
            currency: row.price_currency || 'ARS',
            listingUrl: `${SITE_ORIGIN}/listing/${row.slug || row.id}`,
            location: row.location,
          })
        })
        .join('\n<hr style="border:none; border-top:1px solid #e5e7eb; margin:32px 0;" />\n')

      const resendApiKey = process.env.RESEND_API_KEY
      if (!resendApiKey) {
        return res.status(500).json({ ok: false, error: 'missing_resend_key' })
      }

      const resend = new Resend(resendApiKey)
      await resend.emails.send({
        from: 'Ciclo Market <admin@ciclomarket.ar>',
        to: targetEmail,
        subject: 'Tu publicación ahora tiene prioridad en Ciclo Market',
        html: cards,
      })

      return res.status(200).json({ ok: true, sent: rows.length })
    } catch (err) {
      console.error('[sendUpgradeEmail] error', err)
      return res.status(500).json({ ok: false, error: 'internal_error' })
    }
  }
)

// Sitemap proxy (evita redirects cross-domain en Firebase Hosting)
exports.sitemapProxy = onRequest({ region: 'us-central1', memory: '256MiB' }, async (req, res) => {
  if (req.method !== 'GET' && req.method !== 'HEAD') {
    res.set('Allow', 'GET, HEAD')
    return res.status(405).send('Method Not Allowed')
  }

  const upstreamBase = (process.env.SITEMAP_UPSTREAM_ORIGIN || 'https://ciclo-market.onrender.com').replace(/\/$/, '')
  const upstreamUrl = `${upstreamBase}${req.originalUrl || req.url || '/sitemap.xml'}`

  try {
    const upstream = await fetch(upstreamUrl, {
      method: req.method,
      headers: {
        'user-agent': req.get('user-agent') || 'Mozilla/5.0',
        accept: req.get('accept') || 'application/xml,text/xml,*/*',
      },
      redirect: 'manual',
    })

    // Nunca redirigir al cliente
    if (upstream.status >= 300 && upstream.status < 400) {
      console.warn('[sitemapProxy] upstream redirect blocked', {
        status: upstream.status,
        location: upstream.headers.get('location'),
      })
      return res.status(502).type('text/plain').send('Bad Gateway')
    }

    res.set('Content-Type', upstream.headers.get('content-type') || 'application/xml; charset=utf-8')
    res.set('Cache-Control', upstream.headers.get('cache-control') || 'public, max-age=300, s-maxage=3600')
    res.set('X-Robots-Tag', 'all')

    if (req.method === 'HEAD') {
      return res.status(upstream.status).end()
    }

    const text = await upstream.text()
    return res.status(upstream.status).send(text)
  } catch (err) {
    console.error('[sitemapProxy] fetch failed', err)
    return res.status(502).type('text/plain').send('Bad Gateway')
  }
})
