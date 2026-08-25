const { onRequest } = require('firebase-functions/v2/https')
const { Readable } = require('stream')
const { Resend } = require('resend')

// Canonical site origin (force www)
const SITE_ORIGIN = 'https://www.ciclomarket.ar'
const SUPABASE_URL = process.env.SUPABASE_URL || 'https://jmtsgywgeysagnfgdovr.supabase.co'
const SUPABASE_SERVICE_ROLE_KEY = process.env.SUPABASE_SERVICE_ROLE_KEY || ''
const FACEBOOK_APP_ID = '1873135236620793'
const API_UPSTREAM_ORIGIN = (process.env.API_UPSTREAM_ORIGIN || 'https://ciclo-market.onrender.com').replace(/\/$/, '')

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
  res.set('X-Rendered-By', 'ciclomarket-ssr-v2')
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
  bodyHtml = null,
  jsonLd = '',
}) {
  const safeTitle = escapeHtml(title)
  const safeDesc = escapeHtml(description)
  const safeImage = escapeHtml(image)
  const safeUrl = escapeHtml(url)
  const defaultBody = `<div class="card">
      <img src="${safeImage}" alt="${safeTitle}" loading="lazy" />
      <h1>${safeTitle}</h1>
      <p>Vista previa para compartir.</p>
      <p><a href="${safeUrl}">Abrir en Ciclo Market →</a></p>
    </div>`
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
    ${FACEBOOK_APP_ID ? `<meta property="fb:app_id" content="${FACEBOOK_APP_ID}" />` : ''}
    ${extraMeta || ''}
    ${jsonLd || ''}

    <meta name="twitter:card" content="summary_large_image" />
    <meta name="twitter:title" content="${safeTitle}" />
    <meta name="twitter:description" content="${safeDesc}" />
    <meta name="twitter:image" content="${safeImage}" />
    <style>
      body { font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, sans-serif; padding: 2rem; color: #14212e; max-width: 860px; margin: 0 auto; line-height: 1.6; }
      nav { font-size: 0.875rem; margin-bottom: 1.5rem; color: #6b7280; }
      nav a { color: #0c72ff; text-decoration: none; }
      a { color: #0c72ff; }
      h1 { font-size: 1.75rem; margin: 0 0 1rem; }
      h2 { font-size: 1.125rem; margin: 1.5rem 0 0.375rem; color: #374151; }
      p { margin: 0.25rem 0; }
      .card { max-width: 520px; margin: 0 auto; border-radius: 16px; border: 1px solid #e5e7eb; padding: 1.5rem; text-align: center; box-shadow: 0 18px 40px -16px rgba(12, 23, 35, 0.18); }
      img { max-width: 100%; border-radius: 12px; margin-bottom: 1rem; }
    </style>
  </head>
  <body>
    ${bodyHtml !== null ? bodyHtml : defaultBody}
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

// API proxy: ensure `/api/*` works even when Hosting rewrites to SPA index.html.
// Forwards Authorization headers (needed for authenticated actions like submitting reviews).
exports.apiProxy = onRequest({ region: 'us-central1' }, async (req, res) => {
  const method = String(req.method || 'GET').toUpperCase()
  if (method === 'OPTIONS') {
    res.set('Access-Control-Allow-Origin', SITE_ORIGIN)
    res.set('Access-Control-Allow-Methods', 'GET,POST,PUT,PATCH,DELETE,OPTIONS')
    res.set('Access-Control-Allow-Headers', 'Content-Type, Authorization, X-Requested-With')
    res.set('Access-Control-Max-Age', '86400')
    return res.status(204).send('')
  }

  try {
    const upstreamUrl = new URL(req.originalUrl || req.url || '/api', API_UPSTREAM_ORIGIN)

    const headers = {
      accept: req.get('accept') || '*/*',
    }
    const authHeader = req.get('authorization')
    if (authHeader) headers.authorization = authHeader
    const contentType = req.get('content-type')
    if (contentType) headers['content-type'] = contentType
    const xrw = req.get('x-requested-with')
    if (xrw) headers['x-requested-with'] = xrw

    const init = { method, headers }
    if (method !== 'GET' && method !== 'HEAD') {
      // `rawBody` is available in Firebase Functions; fallback to empty buffer.
      init.body = req.rawBody || Buffer.from('')
    }

    const upstream = await fetch(upstreamUrl.toString(), init)

    res.status(upstream.status || 502)
    const upstreamCt = upstream.headers.get('content-type')
    if (upstreamCt) res.setHeader('Content-Type', upstreamCt)

    // Avoid caching API responses at the edge by default.
    res.setHeader('Cache-Control', 'no-store')

    if (!upstream.body) {
      const fallbackText = await upstream.text().catch(() => '')
      return res.send(fallbackText || 'Upstream error')
    }
    Readable.fromWeb(upstream.body).pipe(res)
  } catch (err) {
    console.error('[functions/apiProxy] error', err)
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
        .select('title, slug, excerpt, cover_image_url, html_content, status, seo_title, seo_description, canonical_url, og_image_url, created_at, updated_at')
        .eq('slug', slug)
        .maybeSingle()
      row = q.data; error = q.error
      if (error) throw error
    } catch (e) {
      console.warn('[shareBlog] fetch with seo columns failed, retrying minimal set', e)
      const q2 = await supabase
        .from('blog_posts')
        .select('title, slug, excerpt, cover_image_url, html_content, status, created_at, updated_at')
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
    // Title: "[Título] | Blog Ciclo Market"
    const title = clamp(`${baseTitle} | Blog Ciclo Market`, 90)

    // First real paragraph for description (max 155 chars)
    function firstParagraph(html) {
      if (!html) return null
      const match = String(html).match(/<p[^>]*>([\s\S]*?)<\/p>/i)
      const text = match ? stripHtml(match[1]) : stripHtml(html)
      return text.replace(/\s+/g, ' ').trim() || null
    }
    const rawDesc = row.seo_description || row.excerpt || firstParagraph(row.html_content) || 'Leé historias y guías en el blog de Ciclo Market.'
    const description = clamp(rawDesc, 155)

    const image = toAbsoluteUrl(row.og_image_url || row.cover_image_url || FALLBACK_IMAGE, SITE_ORIGIN) || FALLBACK_LOGO

    // Format date as "12 de mayo de 2025"
    function formatDateEs(iso) {
      if (!iso) return null
      try {
        const d = new Date(iso)
        const months = ['enero','febrero','marzo','abril','mayo','junio','julio','agosto','septiembre','octubre','noviembre','diciembre']
        return `${d.getDate()} de ${months[d.getMonth()]} de ${d.getFullYear()}`
      } catch { return null }
    }
    const publishedIso = row.created_at || null
    const modifiedIso = row.updated_at || row.created_at || null
    const publishedReadable = formatDateEs(publishedIso)

    // Build rich body HTML
    const articleTitle = escapeHtml(row.title || baseTitle)
    const bodyParts = [
      `<nav aria-label="breadcrumb"><a href="${SITE_ORIGIN}">Inicio</a> &rsaquo; <a href="${SITE_ORIGIN}/blog">Blog</a> &rsaquo; <span>${articleTitle}</span></nav>`,
      `<h1>${articleTitle}</h1>`,
    ]
    if (publishedReadable && publishedIso) {
      bodyParts.push(`<p><time datetime="${escapeHtml(publishedIso)}">${escapeHtml(publishedReadable)}</time></p>`)
    }
    const summaryText = row.excerpt || firstParagraph(row.html_content)
    if (summaryText) bodyParts.push(`<p>${escapeHtml(clamp(summaryText, 400))}</p>`)
    bodyParts.push(`<p><a href="${escapeHtml(canonical)}">Leer artículo completo en Ciclo Market</a></p>`)
    const bodyHtml = bodyParts.join('\n')

    // JSON-LD: Article schema
    const articleSchema = {
      '@context': 'https://schema.org',
      '@type': 'Article',
      headline: clamp(row.title || baseTitle, 110),
      description: clamp(rawDesc, 160),
      image,
      ...(publishedIso ? { datePublished: publishedIso } : {}),
      ...(modifiedIso ? { dateModified: modifiedIso } : {}),
      author: { '@type': 'Organization', name: 'Ciclo Market', url: SITE_ORIGIN },
      publisher: {
        '@type': 'Organization',
        name: 'Ciclo Market',
        logo: { '@type': 'ImageObject', url: `${SITE_ORIGIN}/logo-azul.png` },
      },
      mainEntityOfPage: { '@type': 'WebPage', '@id': canonical },
    }

    const jsonLd = `<script type="application/ld+json">${JSON.stringify(articleSchema)}</script>`
    const extraMeta = `<meta property="og:image:secure_url" content="${escapeHtml(image)}" />`

    const html = renderOgHtml({ title, description, image, url: canonical, type: 'article', extraMeta, bodyHtml, jsonLd })
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

    // Parse condition from extras string (e.g. "Condición: Usado • Talle: M • Rodado: 29")
    function getExtraValue(label) {
      const tokens = String(row.extras || '').split('•').map(t => t.trim()).filter(Boolean)
      const token = tokens.find(t => t.toLowerCase().startsWith(label.toLowerCase() + ':'))
      return token ? token.slice(label.length + 1).trim() : null
    }
    const condition = getExtraValue('Condición') || getExtraValue('Condicion') || null

    // Fetch seller store info for body and JSON-LD
    let sellerStoreSlug = null
    let sellerStoreName = String(row.seller_name || '').trim() || null
    if (row.seller_id) {
      try {
        const { data: sellerRow } = await supabase
          .from('users')
          .select('store_slug, store_name, store_enabled')
          .eq('id', row.seller_id)
          .maybeSingle()
        if (sellerRow?.store_slug) {
          sellerStoreSlug = sellerRow.store_slug
          sellerStoreName = String(sellerRow.store_name || sellerStoreName || '').trim() || sellerStoreName
        }
      } catch (e) {
        console.warn('[shareListing] seller store fetch error', e)
      }
    }

    const brand = String(row.brand || '').trim()
    const model = String(row.model || '').trim()
    const year = row.year ? String(row.year) : ''
    const catLabelMap = { ruta: 'Ruta', gravel: 'Gravel', mtb: 'MTB', urbana: 'Urbana', fixie: 'Fixie', pista: 'Pista', cicloturismo: 'Cicloturismo' }
    const catSlugMap = { ruta: 'bicicletas-ruta', gravel: 'bicicletas-gravel', mtb: 'bicicletas-mtb', urbana: 'bicicletas-urbanas', fixie: 'fixie' }
    const rawCat = (row.category || '').toString().toLowerCase()
    const categoryLabel = catLabelMap[rawCat] || (row.category || '').toString()
    const categorySeoSlug = catSlugMap[rawCat] || null
    const group = (row.drivetrain_detail || row.drivetrain || '').toString().trim()
    const wheelSize = (row.wheel_size || '').toString().trim()
    const frameSize = (row.frame_size || '').toString().trim()
    const location = (row.location || row.seller_location || '').toString().trim()

    const parts = [brand, model, year].filter(Boolean)
    const titleCore = parts.length ? parts.join(' ') : (row.title || 'Publicación')

    const priceNum = typeof row.price === 'number' && Number.isFinite(row.price) ? row.price : null
    const currency = (row.price_currency || 'ARS').toString().toUpperCase()
    const availability = String(row.status || '').toLowerCase() === 'sold' ? 'oos' : 'instock'
    const formattedPrice = priceNum != null
      ? '$' + String(Math.round(priceNum)).replace(/\B(?=(\d{3})+(?!\d))/g, '.')
      : null

    // Title: "[Marca] [Modelo] [Año] – $[Precio] | Ciclo Market" (max 60 chars)
    const titleWithPrice = formattedPrice
      ? `${titleCore} – ${formattedPrice} | Ciclo Market`
      : `${titleCore} | Ciclo Market`
    const title = titleWithPrice.length <= 60 ? titleWithPrice : clamp(`${titleCore} | Ciclo Market`, 60)

    // Meta description (max 155 chars)
    const descParts = []
    if (condition) descParts.push(condition)
    descParts.push([brand, model].filter(Boolean).join(' ') || 'Bicicleta')
    if (wheelSize) descParts.push(`rodado ${wheelSize}`)
    if (frameSize) descParts.push(`talle ${frameSize}`)
    const locationPart = location ? `. Ubicado en ${location}` : ''
    const description = clamp(
      descParts.join(', ') + locationPart + '. Contactá al vendedor en Ciclo Market.',
      155
    )

    // Images
    let rawImg = firstImage(row.images) || FALLBACK_IMAGE
    if (rawImg && rawImg.includes('supabase.co') && !rawImg.includes('?')) {
      rawImg = `${rawImg}?width=1200&quality=80&resize=contain`
    }
    const image = toAbsoluteUrl(rawImg, SITE_ORIGIN) || FALLBACK_LOGO

    let img2 = null
    if (Array.isArray(row.images) && row.images.length > 1) {
      let raw2 = row.images[1]
      if (raw2 && typeof raw2 === 'object' && 'url' in raw2) raw2 = raw2.url
      raw2 = String(raw2 || '').trim()
      if (raw2) {
        if (raw2.includes('supabase.co') && !raw2.includes('?')) raw2 = `${raw2}?width=1200&quality=80&resize=contain`
        img2 = toAbsoluteUrl(raw2, SITE_ORIGIN) || null
      }
    }

    const canonical = ensureSiteUrl(`/listing/${row.slug || row.id}`, `/listing/${slug || ''}`)

    // Build rich body HTML
    const breadcrumbNav = categorySeoSlug
      ? `<nav aria-label="breadcrumb"><a href="${SITE_ORIGIN}">Inicio</a> &rsaquo; <a href="${SITE_ORIGIN}/${categorySeoSlug}">${escapeHtml(categoryLabel)}</a> &rsaquo; <span>${escapeHtml(titleCore)}</span></nav>`
      : `<nav aria-label="breadcrumb"><a href="${SITE_ORIGIN}">Inicio</a> &rsaquo; <span>${escapeHtml(titleCore)}</span></nav>`

    const bodyParts = [breadcrumbNav, `<h1>${escapeHtml(titleCore)}</h1>`]
    if (formattedPrice) bodyParts.push(`<p><strong>Precio:</strong> ${escapeHtml(formattedPrice)} ${escapeHtml(currency)}</p>`)
    if (condition) bodyParts.push(`<p><strong>Estado:</strong> ${escapeHtml(condition)}</p>`)
    if (categoryLabel) bodyParts.push(`<p><strong>Categoría:</strong> ${escapeHtml(categoryLabel)}</p>`)
    if (wheelSize) bodyParts.push(`<p><strong>Rodado:</strong> ${escapeHtml(wheelSize)}</p>`)
    if (frameSize) bodyParts.push(`<p><strong>Talle:</strong> ${escapeHtml(frameSize)}</p>`)
    if (group) bodyParts.push(`<p><strong>Transmisión:</strong> ${escapeHtml(group)}</p>`)
    if (location) bodyParts.push(`<p><strong>Ubicación:</strong> ${escapeHtml(location)}, Argentina</p>`)
    if (row.description) {
      const descText = stripHtml(row.description).replace(/\s+/g, ' ').trim()
      if (descText) bodyParts.push(`<h2>Descripción</h2><p>${escapeHtml(descText)}</p>`)
    }
    if (sellerStoreName || sellerStoreSlug) {
      const sellerLink = sellerStoreSlug
        ? `<a href="${SITE_ORIGIN}/tienda/${escapeHtml(sellerStoreSlug)}">${escapeHtml(sellerStoreName || sellerStoreSlug)}</a>`
        : escapeHtml(sellerStoreName || '')
      bodyParts.push(`<h2>Vendedor</h2><p>${sellerLink}</p>`)
    }
    bodyParts.push(`<p><a href="${escapeHtml(canonical)}">Ver publicación completa en Ciclo Market</a></p>`)
    const bodyHtml = bodyParts.join('\n')

    // JSON-LD: Product schema
    const additionalProps = []
    if (wheelSize) additionalProps.push({ '@type': 'PropertyValue', name: 'Rodado', value: wheelSize })
    if (frameSize) additionalProps.push({ '@type': 'PropertyValue', name: 'Talle', value: frameSize })
    if (condition) additionalProps.push({ '@type': 'PropertyValue', name: 'Estado', value: condition })
    if (group) additionalProps.push({ '@type': 'PropertyValue', name: 'Transmisión', value: group })

    const productSchema = {
      '@context': 'https://schema.org',
      '@type': 'Product',
      name: titleCore,
      description: clamp(stripHtml(row.description) || description, 300),
      image: [image, img2].filter(Boolean),
      ...(brand ? { brand: { '@type': 'Brand', name: brand } } : {}),
      offers: {
        '@type': 'Offer',
        ...(priceNum != null ? { price: priceNum, priceCurrency: currency } : {}),
        availability: `https://schema.org/${availability === 'instock' ? 'InStock' : 'OutOfStock'}`,
        url: canonical,
        ...(sellerStoreName || sellerStoreSlug ? {
          seller: {
            '@type': 'Store',
            name: sellerStoreName || sellerStoreSlug,
            ...(sellerStoreSlug ? { url: `${SITE_ORIGIN}/tienda/${sellerStoreSlug}` } : {}),
          },
        } : {}),
      },
      ...(additionalProps.length ? { additionalProperty: additionalProps } : {}),
    }

    const breadcrumbItems = [{ '@type': 'ListItem', position: 1, name: 'Inicio', item: SITE_ORIGIN }]
    if (categorySeoSlug) {
      breadcrumbItems.push({ '@type': 'ListItem', position: 2, name: categoryLabel, item: `${SITE_ORIGIN}/${categorySeoSlug}` })
      breadcrumbItems.push({ '@type': 'ListItem', position: 3, name: titleCore, item: canonical })
    } else {
      breadcrumbItems.push({ '@type': 'ListItem', position: 2, name: titleCore, item: canonical })
    }
    const breadcrumbSchema = {
      '@context': 'https://schema.org',
      '@type': 'BreadcrumbList',
      itemListElement: breadcrumbItems,
    }

    const jsonLd = `<script type="application/ld+json">${JSON.stringify(productSchema)}</script>\n    <script type="application/ld+json">${JSON.stringify(breadcrumbSchema)}</script>`
    const extraMeta = `${priceNum != null ? `<meta property="product:price:amount" content="${escapeHtml(String(priceNum))}" />` : ''}
${priceNum != null ? `<meta property="product:price:currency" content="${escapeHtml(currency)}" />` : ''}
<meta property="product:availability" content="${escapeHtml(availability)}" />
<meta property="og:image:secure_url" content="${escapeHtml(image)}" />`

    const html = renderOgHtml({ title, description, image, url: canonical, type: 'product', extraMeta, bodyHtml, jsonLd })
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

    // Count active listings for this store
    let listingCount = null
    try {
      const { count } = await supabase
        .from('listings')
        .select('id', { count: 'exact', head: true })
        .eq('seller_id', row.id)
        .in('status', ['active', 'published'])
      listingCount = count
    } catch (e) {
      console.warn('[shareStore] listing count error', e)
    }

    const name = String(row.store_name || '').trim() || 'Tienda oficial'
    const city = String(row.city || '').trim()
    const province = String(row.province || '').trim()
    const location = [city, province].filter(Boolean).join(', ')
    const canonical = new URL(`/tienda/${row.store_slug || slug}`, SITE_ORIGIN).toString()

    // Title: "[Nombre Tienda] – Ciclería en [Ciudad] | Ciclo Market"
    const titleWithCity = city
      ? `${name} – Ciclería en ${city} | Ciclo Market`
      : `${name} – Tienda oficial | Ciclo Market`
    const title = clamp(titleWithCity, 65)

    // Meta description
    const countPart = listingCount != null && listingCount > 0 ? ` ${listingCount} productos disponibles.` : ''
    const descSource = row.bio
      ? clamp(row.bio, 100)
      : `Tienda oficial de ${name} en Ciclo Market.`
    const description = clamp(
      `${descSource}${countPart}${province ? ` Ciclería especializada, ${province}, Argentina.` : ''}`,
      155
    )

    let rawImg = row.store_avatar_url || FALLBACK_IMAGE
    if (rawImg && rawImg.includes('supabase.co') && !rawImg.includes('?')) {
      rawImg = `${rawImg}?width=1200&quality=80&resize=contain`
    }
    const image = toAbsoluteUrl(rawImg, SITE_ORIGIN) || FALLBACK_LOGO

    // Build rich body HTML
    const bodyParts = [
      `<nav aria-label="breadcrumb"><a href="${SITE_ORIGIN}">Inicio</a> &rsaquo; <a href="${SITE_ORIGIN}/tiendas">Tiendas</a> &rsaquo; <span>${escapeHtml(name)}</span></nav>`,
      `<h1>${escapeHtml(name)}</h1>`,
    ]
    if (row.bio) bodyParts.push(`<p>${escapeHtml(String(row.bio).trim())}</p>`)
    if (location) bodyParts.push(`<p><strong>Ubicación:</strong> ${escapeHtml(location)}, Argentina</p>`)
    if (listingCount != null && listingCount > 0) {
      bodyParts.push(`<p><strong>Productos publicados:</strong> ${listingCount} bicicletas y accesorios</p>`)
    }
    bodyParts.push(`<p><a href="${escapeHtml(canonical)}">Ver tienda completa en Ciclo Market</a></p>`)
    const bodyHtml = bodyParts.join('\n')

    // JSON-LD: Store schema
    const storeSchema = {
      '@context': 'https://schema.org',
      '@type': 'Store',
      name,
      ...(row.bio ? { description: clamp(row.bio, 200) } : {}),
      url: canonical,
      ...(row.store_avatar_url ? { logo: toAbsoluteUrl(row.store_avatar_url, SITE_ORIGIN) } : {}),
      ...(location ? {
        address: {
          '@type': 'PostalAddress',
          ...(city ? { addressLocality: city } : {}),
          ...(province ? { addressRegion: province } : {}),
          addressCountry: 'AR',
        },
      } : {}),
      hasOfferCatalog: {
        '@type': 'OfferCatalog',
        name: `Productos de ${name}`,
      },
    }

    const jsonLd = `<script type="application/ld+json">${JSON.stringify(storeSchema)}</script>`
    const extraMeta = `<meta property="og:image:secure_url" content="${escapeHtml(image)}" />`

    const html = renderOgHtml({ title, description, image, url: canonical, type: 'profile', extraMeta, bodyHtml, jsonLd })
    setBotHeaders(res)
    buildCache(res)
    res.set('Content-Type', 'text/html; charset=utf-8')
    return res.status(200).send(html)
  } catch (err) {
    console.error('[shareStore] unexpected error', err)
    return sendFallback(200)
  }
})

// ── shareMarca: SSR para bots en /marca/:brandSlug ─────────────────────────
exports.shareMarca = onRequest({ region: 'us-central1', memory: '256MiB', secrets: ['SUPABASE_URL','SUPABASE_SERVICE_ROLE_KEY'] }, async (req, res) => {
  res.set('Vary', 'User-Agent')

  function clamp(text, max) {
    const t = String(text || '').replace(/\s+/g, ' ').trim()
    return t.length <= max ? t : `${t.slice(0, max - 1).trimEnd()}…`
  }

  const rawPath = req.originalUrl || req.url || '/marca'
  let urlObj
  try { urlObj = new URL(rawPath, SITE_ORIGIN) } catch { urlObj = new URL('/marca', SITE_ORIGIN) }
  const brandSlug = urlObj.pathname.replace(/^\/marca\//, '').replace(/\/+$/, '')

  const BRAND_NAMES = {
    'specialized': 'Specialized', 'trek': 'Trek', 'giant': 'Giant', 'scott': 'Scott',
    'cervelo': 'Cervelo', 'cannondale': 'Cannondale', 'orbea': 'Orbea', 'merida': 'Merida',
    'pinarello': 'Pinarello', 'cube': 'Cube', 'bmc': 'BMC', 'canyon': 'Canyon',
    'bianchi': 'Bianchi', 'santa-cruz': 'Santa Cruz', 'colnago': 'Colnago',
  }
  const brandName = BRAND_NAMES[brandSlug.toLowerCase()]

  if (!isBot(req)) return sendSpaIndexHtml(res)

  const canonical = new URL(`/marca/${brandSlug}`, SITE_ORIGIN).toString()
  const fallbackTitle = brandName
    ? `Bicicletas ${brandName} en Argentina | Ciclo Market`
    : 'Bicicletas usadas en Argentina | Ciclo Market'
  const fallbackDesc = brandName
    ? `Encontrá bicicletas ${brandName} usadas en Argentina. MTB, ruta y gravel. Contacto directo.`
    : 'Encontrá bicicletas usadas en Argentina en Ciclo Market.'

  if (!brandName || !SUPABASE_URL || !SUPABASE_SERVICE_ROLE_KEY) {
    setBotHeaders(res)
    buildCache(res)
    res.set('Content-Type', 'text/html; charset=utf-8')
    return res.status(200).send(renderOgHtml({ title: clamp(fallbackTitle, 90), description: clamp(fallbackDesc, 220), image: `${SITE_ORIGIN}/OG-Marketplace.png`, url: canonical }))
  }

  try {
    const supabase = await getSupabase()
    const { data: rows, count } = await supabase
      .from('listings')
      .select('id,title,slug,price,price_currency,images,location', { count: 'estimated' })
      .ilike('brand', brandName)
      .in('status', ['active', 'published'])
      .order('created_at', { ascending: false })
      .limit(10)

    const total = count ?? (rows ? rows.length : 0)
    const title = clamp(`Bicicletas ${brandName} en Argentina | Ciclo Market`, 65)
    const description = clamp(`Encontrá ${total > 0 ? total + ' ' : ''}bicicletas ${brandName} en venta en Argentina. MTB, ruta y gravel. Contacto directo, sin comisiones.`, 155)
    const image = `${SITE_ORIGIN}/OG-Marketplace.png`

    const bodyParts = [
      `<nav><a href="${SITE_ORIGIN}">Inicio</a> &rsaquo; <a href="${SITE_ORIGIN}/bicicletas-usadas">Bicicletas usadas</a> &rsaquo; <span>Bicicletas ${escapeHtml(brandName)}</span></nav>`,
      `<h1>Bicicletas ${escapeHtml(brandName)} en Argentina</h1>`,
      `<p>${total > 0 ? total + ' bicicletas disponibles.' : ''} Nuevas y usadas · Toda Argentina.</p>`,
    ]
    if (rows && rows.length > 0) {
      bodyParts.push('<h2>Publicaciones recientes</h2><ul>')
      rows.forEach(r => {
        const href = `${SITE_ORIGIN}/listing/${encodeURIComponent(r.slug || r.id)}`
        const price = r.price ? ` · $${Number(r.price).toLocaleString('es-AR')} ${r.price_currency || 'ARS'}` : ''
        const loc = r.location ? ` · ${r.location}` : ''
        bodyParts.push(`<li><a href="${escapeHtml(href)}">${escapeHtml(r.title || 'Bicicleta')}${escapeHtml(price)}${escapeHtml(loc)}</a></li>`)
      })
      bodyParts.push('</ul>')
    }
    bodyParts.push(`<p><a href="${escapeHtml(canonical)}">Ver todas las bicicletas ${escapeHtml(brandName)} →</a></p>`)

    const itemListLd = rows && rows.length > 0 ? JSON.stringify({
      '@context': 'https://schema.org',
      '@type': 'ItemList',
      name: `Bicicletas ${brandName} en Argentina`,
      numberOfItems: total,
      itemListElement: rows.map((r, i) => ({
        '@type': 'ListItem',
        position: i + 1,
        name: r.title || `Bicicleta ${brandName}`,
        url: `${SITE_ORIGIN}/listing/${r.slug || r.id}`,
      })),
    }) : ''

    const jsonLd = itemListLd ? `<script type="application/ld+json">${itemListLd}</script>` : ''
    setBotHeaders(res)
    buildCache(res)
    res.set('Content-Type', 'text/html; charset=utf-8')
    return res.status(200).send(renderOgHtml({ title, description, image, url: canonical, bodyHtml: bodyParts.join('\n'), jsonLd }))
  } catch (err) {
    console.error('[shareMarca] error', err)
    setBotHeaders(res)
    buildCache(res)
    res.set('Content-Type', 'text/html; charset=utf-8')
    return res.status(200).send(renderOgHtml({ title: clamp(fallbackTitle, 90), description: clamp(fallbackDesc, 220), image: `${SITE_ORIGIN}/OG-Marketplace.png`, url: canonical }))
  }
})

// ── shareProvincia: SSR para bots en /provincia/:provinciaSlug ──────────────
exports.shareProvincia = onRequest({ region: 'us-central1', memory: '256MiB', secrets: ['SUPABASE_URL','SUPABASE_SERVICE_ROLE_KEY'] }, async (req, res) => {
  res.set('Vary', 'User-Agent')

  function clamp(text, max) {
    const t = String(text || '').replace(/\s+/g, ' ').trim()
    return t.length <= max ? t : `${t.slice(0, max - 1).trimEnd()}…`
  }

  const rawPath = req.originalUrl || req.url || '/provincia'
  let urlObj
  try { urlObj = new URL(rawPath, SITE_ORIGIN) } catch { urlObj = new URL('/provincia', SITE_ORIGIN) }
  const provinciaSlug = urlObj.pathname.replace(/^\/provincia\//, '').replace(/\/+$/, '')

  const PROVINCIA_NAMES = {
    'buenos-aires': 'Buenos Aires', 'cordoba': 'Córdoba', 'caba': 'Ciudad Autónoma de Buenos Aires',
    'entre-rios': 'Entre Ríos', 'santa-fe': 'Santa Fe', 'mendoza': 'Mendoza',
    'san-juan': 'San Juan', 'misiones': 'Misiones', 'la-rioja': 'La Rioja',
    'chaco': 'Chaco', 'neuquen': 'Neuquén', 'catamarca': 'Catamarca',
    'la-pampa': 'La Pampa', 'tucuman': 'Tucumán', 'rio-negro': 'Río Negro', 'san-luis': 'San Luis',
  }
  const provinciaNombre = PROVINCIA_NAMES[provinciaSlug.toLowerCase()]
  const displayName = provinciaNombre === 'Ciudad Autónoma de Buenos Aires' ? 'CABA' : provinciaNombre

  if (!isBot(req)) return sendSpaIndexHtml(res)

  const canonical = new URL(`/provincia/${provinciaSlug}`, SITE_ORIGIN).toString()
  const fallbackTitle = displayName
    ? `Bicicletas usadas en ${displayName} | Ciclo Market`
    : 'Bicicletas usadas en Argentina | Ciclo Market'
  const fallbackDesc = displayName
    ? `Comprá y vendé bicicletas en ${displayName}. Contacto directo con vendedores locales.`
    : 'Marketplace de bicicletas en Argentina.'

  if (!provinciaNombre || !SUPABASE_URL || !SUPABASE_SERVICE_ROLE_KEY) {
    setBotHeaders(res)
    buildCache(res)
    res.set('Content-Type', 'text/html; charset=utf-8')
    return res.status(200).send(renderOgHtml({ title: clamp(fallbackTitle, 90), description: clamp(fallbackDesc, 220), image: `${SITE_ORIGIN}/OG-Marketplace.png`, url: canonical }))
  }

  try {
    const supabase = await getSupabase()
    const { data: rows, count } = await supabase
      .from('listings')
      .select('id,title,slug,price,price_currency,brand,location', { count: 'estimated' })
      .ilike('location', `%${provinciaNombre}%`)
      .in('status', ['active', 'published'])
      .order('created_at', { ascending: false })
      .limit(10)

    const total = count ?? (rows ? rows.length : 0)
    const title = clamp(`Bicicletas usadas en ${displayName} | Ciclo Market`, 65)
    const description = clamp(`${total > 0 ? total + ' publicaciones activas' : 'Publicaciones activas'} de vendedores locales en ${displayName}. Comprá y vendé sin comisiones.`, 155)
    const image = `${SITE_ORIGIN}/OG-Marketplace.png`

    const bodyParts = [
      `<nav><a href="${SITE_ORIGIN}">Inicio</a> &rsaquo; <a href="${SITE_ORIGIN}/bicicletas-usadas">Bicicletas usadas</a> &rsaquo; <span>Bicicletas en ${escapeHtml(displayName || '')}</span></nav>`,
      `<h1>Bicicletas usadas en ${escapeHtml(displayName || '')}</h1>`,
      `<p>${total > 0 ? total + ' publicaciones activas.' : ''} Vendedores locales en ${escapeHtml(displayName || '')}.</p>`,
    ]
    if (rows && rows.length > 0) {
      bodyParts.push('<h2>Publicaciones recientes</h2><ul>')
      rows.forEach(r => {
        const href = `${SITE_ORIGIN}/listing/${encodeURIComponent(r.slug || r.id)}`
        const price = r.price ? ` · $${Number(r.price).toLocaleString('es-AR')} ${r.price_currency || 'ARS'}` : ''
        const brand = r.brand ? ` · ${r.brand}` : ''
        bodyParts.push(`<li><a href="${escapeHtml(href)}">${escapeHtml(r.title || 'Bicicleta')}${escapeHtml(brand)}${escapeHtml(price)}</a></li>`)
      })
      bodyParts.push('</ul>')
    }
    bodyParts.push(`<p><a href="${escapeHtml(canonical)}">Ver todas las bicicletas en ${escapeHtml(displayName || '')} →</a></p>`)

    const itemListLd = rows && rows.length > 0 ? JSON.stringify({
      '@context': 'https://schema.org',
      '@type': 'ItemList',
      name: `Bicicletas usadas en ${displayName}`,
      numberOfItems: total,
      itemListElement: rows.map((r, i) => ({
        '@type': 'ListItem',
        position: i + 1,
        name: r.title || `Bicicleta en ${displayName}`,
        url: `${SITE_ORIGIN}/listing/${r.slug || r.id}`,
      })),
    }) : ''

    const jsonLd = itemListLd ? `<script type="application/ld+json">${itemListLd}</script>` : ''
    setBotHeaders(res)
    buildCache(res)
    res.set('Content-Type', 'text/html; charset=utf-8')
    return res.status(200).send(renderOgHtml({ title, description, image, url: canonical, bodyHtml: bodyParts.join('\n'), jsonLd }))
  } catch (err) {
    console.error('[shareProvincia] error', err)
    setBotHeaders(res)
    buildCache(res)
    res.set('Content-Type', 'text/html; charset=utf-8')
    return res.status(200).send(renderOgHtml({ title: clamp(fallbackTitle, 90), description: clamp(fallbackDesc, 220), image: `${SITE_ORIGIN}/OG-Marketplace.png`, url: canonical }))
  }
})

// ── shareStatic: SSR para bots en páginas de categoría/info fijas ──────────
// Metadata portada 1:1 desde resolveSeoForPath() (src/App.tsx) y las páginas
// de src/pages/seo/*.tsx. Si se edita el copy ahí, replicar acá también.
const STATIC_PAGE_META = {
  '/marketplace': {
    title: 'Comprar bicicletas nuevas y usadas | Ciclo Market',
    description: 'Explorá cientos de bicicletas verificadas por tipo, talle, ubicación y rango de precio. Filtrá por gravel, ruta, MTB, e-bikes y accesorios para encontrar tu próxima bici.',
  },
  '/bicicletas-ruta': {
    title: 'Bicicletas de ruta usadas en venta | Ciclo Market',
    description: 'Encontrá bicicletas de ruta usadas: Specialized, Trek, Cannondale, Bianchi. Modelos aero, endurance y escaladoras. Contacto directo con vendedores.',
  },
  '/bicicletas-mtb': {
    title: 'Bicicletas MTB usadas en venta | Ciclo Market',
    description: 'Mountain bikes usadas para XC, Trail y Enduro. Rígidas y doble suspensión. Specialized, Trek, Santa Cruz, Scott y más.',
  },
  '/bicicletas-gravel': {
    title: 'Bicicletas Gravel usadas en venta | Ciclo Market',
    description: 'Bicicletas gravel usadas para bikepacking y aventura. Cuadros de carbono, aluminio y acero. Specialized Diverge, Canyon Grail, Trek Checkpoint.',
  },
  '/fixie': {
    title: 'Fixie y single speed usadas | Ciclo Market',
    description: 'Fixies y single speed urbanas listas para rodar, con cuadros livianos, componentes personalizables y asesoramiento para elegir relación y frenos adecuados.',
  },
  '/clasificados-bicicletas': {
    title: 'Clasificados de bicicletas | Ciclo Market',
    description: 'Explorá clasificados ciclistas en Argentina con publicaciones verificadas, precios en tiempo real y contacto directo con vendedores para coordinar prueba y envío.',
  },
  '/accesorios': {
    title: 'Accesorios para tu bicicleta | Ciclo Market',
    description: 'Componentes, rodillos inteligentes, ciclocomputadoras y repuestos premium con compatibilidades detalladas para que equipes tu bici sin sorpresas ni gastos extra.',
  },
  '/indumentaria': {
    title: 'Indumentaria de ciclismo | Ciclo Market',
    description: 'Indumentaria ciclista con talles exactos, tecnologías de ventilación y accesorios completos; encontrá jerseys, cascos y calzado listos para tu próxima salida.',
  },
  '/bicicletas-triatlon': {
    title: 'Bicicletas de triatlón (TT) | Ciclo Market',
    description: 'Bicicletas de triatlón y contrarreloj con datos de fitting, soporte para hidratación y grupos electrónicos, listas para competir y coordinar entrega segura.',
  },
  '/ofertas-destacadas': {
    title: 'Ofertas destacadas | Ciclo Market',
    description: 'Ofertas verificadas en bicicletas y accesorios con bajas de precio reales, estados detallados y opciones de envío asegurado para aprovechar oportunidades únicas.',
  },
  '/nutricion': {
    title: 'Nutrición para ciclismo: geles, hidratación y recuperación | Ciclo Market',
    description: 'Catálogo de nutrición de tiendas oficiales: geles, bebidas isotónicas, sales y suplementos. Filtrá por cafeína, sodio, carbohidratos y porciones.',
  },
  '/bicicletas-usadas': {
    title: 'Bicicletas usadas en venta Argentina | Ciclo Market',
    description: 'Comprá bicicletas usadas verificadas. Ruta, MTB, Gravel y más. Fotos reales, contacto directo con vendedores.',
  },
  '/tiendas': {
    title: 'Tiendas oficiales | Ciclo Market',
    description: 'Descubrí todas las tiendas oficiales en Ciclo Market y mirá sus productos publicados, datos de contacto y redes.',
  },
  '/tiendas-oficiales': {
    title: 'Tiendas oficiales: cómo funciona y beneficios | Ciclo Market',
    description: 'Sumá tu local a Ciclo Market como tienda oficial: sello verificado, catálogo destacado, métricas y soporte. Solicitá prueba gratuita.',
  },
  '/blog': {
    title: 'Blog de Ciclo Market',
    description: 'Notas, entrevistas, rutas recomendadas y tecnología para ciclistas en Argentina. Todo el universo de Ciclo Market en un solo lugar.',
  },
  '/vender': {
    title: 'Vendé tu bicicleta | Ciclo Market',
    description: 'Publicá tu bicicleta gratis y llegá a miles de compradores verificados en toda Argentina. Contacto directo por WhatsApp.',
  },
  '/vender/tiendas': {
    title: 'Tiendas Oficiales · Vendé online como e-commerce | Ciclo Market',
    description: 'Abrí tu Tienda Oficial en Ciclo Market: publicaciones ilimitadas, WhatsApp directo, analítica real y verificación para vender más.',
  },
  '/como-publicar': {
    title: 'Cómo publicar tu bicicleta | Ciclo Market',
    description: 'Guía paso a paso para sacar las mejores fotos, describir tu bicicleta y activar un plan destacado que acelere la venta.',
  },
  '/ayuda': {
    title: 'Centro de ayuda | Ciclo Market',
    description: 'Respondemos tus dudas sobre envíos, publicaciones, pagos y seguridad para comprar y vender bicicletas con tranquilidad.',
  },
  '/faq': {
    title: 'Preguntas frecuentes | Ciclo Market',
    description: 'Respondemos las preguntas más comunes sobre pagos, publicación, seguridad y planes premium en Ciclo Market.',
  },
  '/terminos': {
    title: 'Términos y condiciones | Ciclo Market',
    description: 'Conocé las reglas de uso, responsabilidades y condiciones legales para operar dentro de Ciclo Market.',
  },
  '/privacidad': {
    title: 'Política de privacidad | Ciclo Market',
    description: 'Descubrí cómo protegemos tus datos personales, cómo usamos tu información y qué herramientas tenés para gestionarla.',
  },
  '/comparar': {
    title: 'Comparar bicicletas | Ciclo Market',
    description: 'Seleccioná tus bicicletas favoritas y compará especificaciones, precios y beneficios en una sola vista para decidir con confianza.',
  },
  '/tasacion': {
    title: 'Tasación de bicicletas usadas · Ciclo Market',
    description: 'Estimá el precio de tu bicicleta usada según precio original, año, estado y marca. Basado en una curva de depreciación heurística.',
  },
}

// Mapeo de ?cat= a landing canónica — replica categoryToCanonicalPath() (src/utils/seo.ts)
const CATEGORY_CANONICAL_PATH = {
  'ruta': '/bicicletas-ruta',
  'mtb': '/bicicletas-mtb',
  'gravel': '/bicicletas-gravel',
  'fixie': '/fixie',
  'accesorios': '/accesorios',
  'indumentaria': '/indumentaria',
  'triatlón': '/bicicletas-triatlon',
  'triatlon': '/bicicletas-triatlon',
}

exports.shareStatic = onRequest({ region: 'us-central1', memory: '256MiB' }, async (req, res) => {
  res.set('Vary', 'User-Agent')

  if (!isBot(req)) {
    return sendSpaIndexHtml(res)
  }

  function clamp(text, max) {
    const t = String(text || '').replace(/\s+/g, ' ').trim()
    return t.length <= max ? t : `${t.slice(0, max - 1).trimEnd()}…`
  }

  const rawPath = req.originalUrl || req.url || '/'
  let urlObj
  try { urlObj = new URL(rawPath, SITE_ORIGIN) } catch { urlObj = new URL('/', SITE_ORIGIN) }
  let pathname = urlObj.pathname.replace(/\/+$/, '') || '/'

  // /marketplace con filtros: canonicalizar a la landing de categoría fija,
  // igual que hace Marketplace.tsx (canonicalPath) del lado del cliente.
  if (pathname === '/marketplace' || pathname === '/market' || pathname === '/buscar') {
    const deal = urlObj.searchParams.get('deal')
    const cat = urlObj.searchParams.get('cat')
    if (deal === '1') {
      pathname = '/ofertas-destacadas'
    } else if (cat && cat.toLowerCase() !== 'todos') {
      const mapped = CATEGORY_CANONICAL_PATH[cat.toLowerCase()]
      if (mapped) pathname = mapped
      else pathname = '/marketplace'
    } else {
      pathname = '/marketplace'
    }
  }

  const meta = STATIC_PAGE_META[pathname]
  const canonical = new URL(pathname, SITE_ORIGIN).toString()

  const title = clamp(meta?.title || 'Ciclo Market – Marketplace de bicicletas', 90)
  const description = clamp(
    meta?.description || 'Publicá tu bici, encontrá ofertas y conectá con vendedores en Ciclo Market.',
    220
  )
  const image = `${SITE_ORIGIN}/OG-Marketplace.png`

  setBotHeaders(res)
  buildCache(res)
  res.set('Content-Type', 'text/html; charset=utf-8')
  return res.status(200).send(renderOgHtml({ title, description, image, url: canonical }))
})

// ── shareProfile: SSR para bots en /vendedor/:id y /profile/:id ────────────
exports.shareProfile = onRequest({ region: 'us-central1', memory: '256MiB', secrets: ['SUPABASE_URL','SUPABASE_SERVICE_ROLE_KEY'] }, async (req, res) => {
  res.set('Vary', 'User-Agent')

  function clamp(text, max) {
    const t = String(text || '').replace(/\s+/g, ' ').trim()
    return t.length <= max ? t : `${t.slice(0, max - 1).trimEnd()}…`
  }

  const rawPath = req.originalUrl || req.url || '/vendedor'
  let urlObj
  try { urlObj = new URL(rawPath, SITE_ORIGIN) } catch { urlObj = new URL('/vendedor', SITE_ORIGIN) }
  const prefix = urlObj.pathname.startsWith('/profile/') ? '/profile/' : '/vendedor/'
  const sellerId = urlObj.pathname.replace(/^\/(vendedor|profile)\//, '').replace(/\/+$/, '')

  if (!isBot(req)) {
    return sendSpaIndexHtml(res)
  }

  const FALLBACK_IMAGE = `${SITE_ORIGIN}/og-preview.png`

  function sendFallback(statusOk = 200) {
    const canonical = new URL(`${prefix}${sellerId || ''}`, SITE_ORIGIN).toString()
    const title = clamp('Perfil de vendedor · Ciclo Market', 90)
    const description = clamp('Conocé la reputación del vendedor, sus bicicletas publicadas y los planes activos antes de iniciar contacto.', 220)
    setBotHeaders(res)
    buildCache(res)
    res.set('Content-Type', 'text/html; charset=utf-8')
    return res.status(statusOk).send(renderOgHtml({ title, description, image: FALLBACK_IMAGE, url: canonical, type: 'profile' }))
  }

  if (!SUPABASE_URL || !SUPABASE_SERVICE_ROLE_KEY || !sellerId) {
    return sendFallback(200)
  }

  try {
    const supabase = await getSupabase()
    const { data: row, error } = await supabase
      .from('users')
      .select('id, full_name, avatar_url, city, province')
      .eq('id', sellerId)
      .maybeSingle()
    if (error) console.warn('[shareProfile] fetch error', error)

    if (!row) {
      console.warn('[shareProfile] user not found', sellerId)
      return sendFallback(200)
    }

    let listingCount = null
    try {
      const { count } = await supabase
        .from('listings')
        .select('id', { count: 'exact', head: true })
        .eq('seller_id', row.id)
        .in('status', ['active', 'published'])
      listingCount = count
    } catch (e) {
      console.warn('[shareProfile] listing count error', e)
    }

    const name = String(row.full_name || '').trim() || 'Vendedor'
    const city = String(row.city || '').trim()
    const province = String(row.province || '').trim()
    const location = [city, province].filter(Boolean).join(', ')
    const canonical = new URL(`${prefix}${sellerId}`, SITE_ORIGIN).toString()

    const title = clamp(`${name} – Vendedor en Ciclo Market`, 65)
    const countPart = listingCount != null && listingCount > 0 ? ` ${listingCount} publicaciones activas.` : ''
    const description = clamp(
      `Perfil de ${name} en Ciclo Market.${countPart}${location ? ` ${location}, Argentina.` : ''}`,
      155
    )

    let rawImg = row.avatar_url || FALLBACK_IMAGE
    if (rawImg && rawImg.includes('supabase.co') && !rawImg.includes('?')) {
      rawImg = `${rawImg}?width=1200&quality=80&resize=contain`
    }
    const image = toAbsoluteUrl(rawImg, SITE_ORIGIN) || FALLBACK_IMAGE

    const bodyParts = [
      `<nav aria-label="breadcrumb"><a href="${SITE_ORIGIN}">Inicio</a> &rsaquo; <span>${escapeHtml(name)}</span></nav>`,
      `<h1>${escapeHtml(name)}</h1>`,
    ]
    if (location) bodyParts.push(`<p><strong>Ubicación:</strong> ${escapeHtml(location)}, Argentina</p>`)
    if (listingCount != null && listingCount > 0) {
      bodyParts.push(`<p><strong>Publicaciones activas:</strong> ${listingCount}</p>`)
    }
    bodyParts.push(`<p><a href="${escapeHtml(canonical)}">Ver perfil completo en Ciclo Market</a></p>`)
    const bodyHtml = bodyParts.join('\n')

    const personSchema = {
      '@context': 'https://schema.org',
      '@type': 'ProfilePage',
      name,
      url: canonical,
    }
    const jsonLd = `<script type="application/ld+json">${JSON.stringify(personSchema)}</script>`
    const extraMeta = `<meta property="og:image:secure_url" content="${escapeHtml(image)}" />`

    const html = renderOgHtml({ title, description, image, url: canonical, type: 'profile', extraMeta, bodyHtml, jsonLd })
    setBotHeaders(res)
    buildCache(res)
    res.set('Content-Type', 'text/html; charset=utf-8')
    return res.status(200).send(html)
  } catch (err) {
    console.error('[shareProfile] unexpected error', err)
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
    secrets: ['SUPABASE_URL', 'SUPABASE_SERVICE_ROLE_KEY', 'BREVO_API_KEY'],
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

      const brevoKey = process.env.BREVO_API_KEY
      if (!brevoKey) {
        return res.status(500).json({ ok: false, error: 'missing_brevo_key' })
      }

      const brevoRes = await fetch('https://api.brevo.com/v3/smtp/email', {
        method: 'POST',
        headers: {
          'api-key': brevoKey,
          'Content-Type': 'application/json',
          Accept: 'application/json',
        },
        body: JSON.stringify({
          sender: { name: 'Ciclo Market', email: 'avisos@ciclomarket.ar' },
          to: [{ email: targetEmail }],
          subject: 'Tu publicación ahora tiene prioridad en Ciclo Market',
          htmlContent: cards,
        }),
      })
      const brevoData = await brevoRes.json().catch(() => ({}))
      if (!brevoRes.ok) {
        throw new Error(brevoData?.message || `Brevo error ${brevoRes.status}`)
      }

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
