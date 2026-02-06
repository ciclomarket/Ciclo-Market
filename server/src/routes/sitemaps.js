const express = require('express')
const { getServerSupabaseClient } = require('../lib/supabaseClient')
const { resolveFrontendBaseUrl } = require('../lib/savedSearch')

const router = express.Router()

const XML_HEADER = '<?xml version="1.0" encoding="UTF-8"?>'
const DEFAULT_CACHE_TTL = 10 * 60 * 1000 // 10 minutes
const LISTINGS_PER_PAGE = 500
const SHOPPING_LIMIT = 200

const STATIC_ROUTES = [
  '/',
  '/marketplace',
  '/publicar',
  '/blog',
  '/ayuda',
  '/como-publicar',
  '/tienda-oficial',
  '/tiendas',
  '/faq',
  '/terminos',
  '/privacidad',
  '/eliminar-datos',
  '/comparar',
]

const CATEGORY_ROUTES = [
  '/bicicletas-usadas',
  '/bicicletas-ruta',
  '/bicicletas-mtb',
  '/bicicletas-gravel',
  '/fixie',
  '/clasificados-bicicletas',
  '/accesorios',
  '/indumentaria',
  '/bicicletas-triatlon',
  '/ofertas-destacadas',
  '/tiendas-oficiales',
  '/nutricion',
]

const cache = new Map()

function setCache(key, value, ttl = DEFAULT_CACHE_TTL) {
  cache.set(key, { value, expiresAt: Date.now() + ttl })
}

function getCache(key) {
  const entry = cache.get(key)
  if (!entry) return null
  if (Date.now() > entry.expiresAt) {
    cache.delete(key)
    return null
  }
  return entry.value
}

function escapeXml(value) {
  return String(value ?? '')
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&apos;')
}

function formatDate(value) {
  if (!value) return undefined
  const ms = Date.parse(value)
  if (Number.isNaN(ms)) return undefined
  return new Date(ms).toISOString()
}

function buildUrlElement({ loc, lastmod, changefreq, priority }) {
  const parts = [`    <url>`, `      <loc>${escapeXml(loc)}</loc>`]
  if (lastmod) parts.push(`      <lastmod>${escapeXml(lastmod)}</lastmod>`)
  if (changefreq) parts.push(`      <changefreq>${escapeXml(changefreq)}</changefreq>`)
  if (priority) parts.push(`      <priority>${escapeXml(priority)}</priority>`)
  parts.push('    </url>')
  return parts.join('\n')
}

function buildUrlSet(urls, fallbackEntry) {
  const entries = Array.isArray(urls) ? [...urls] : []
  if (entries.length === 0) {
    const fallback =
      fallbackEntry && fallbackEntry.loc
        ? fallbackEntry
        : {
            loc: resolveFrontendBaseUrl(),
            changefreq: 'weekly',
            priority: '0.3',
          }
    entries.push(fallback)
  }
  return `${XML_HEADER}\n<urlset xmlns="http://www.sitemaps.org/schemas/sitemap/0.9">\n${entries
    .map(buildUrlElement)
    .join('\n')}\n</urlset>`
}

function buildSitemapIndex(entries) {
  const payload = entries
    .map(({ loc, lastmod }) => {
      const parts = [`  <sitemap>`, `    <loc>${escapeXml(loc)}</loc>`]
      if (lastmod) parts.push(`    <lastmod>${escapeXml(lastmod)}</lastmod>`)
      parts.push('  </sitemap>')
      return parts.join('\n')
    })
    .join('\n')
  return `${XML_HEADER}\n<sitemapindex xmlns="http://www.sitemaps.org/schemas/sitemap/0.9">\n${payload}\n</sitemapindex>`
}

async function getStaticSitemap() {
  const cached = getCache('static')
  if (cached) return cached
  const origin = resolveFrontendBaseUrl()
  const urls = STATIC_ROUTES.map((path) => ({
    loc: `${origin}${path}`,
    changefreq: 'weekly',
    priority: '0.8',
  }))
  const xml = buildUrlSet(urls)
  const payload = { xml, lastmod: new Date().toISOString() }
  setCache('static', payload)
  return payload
}

async function getCategoriesSitemap() {
  const cached = getCache('categories')
  if (cached) return cached
  const origin = resolveFrontendBaseUrl()
  const urls = CATEGORY_ROUTES.map((path) => ({
    loc: `${origin}${path}`,
    changefreq: 'weekly',
    priority: '0.6',
  }))
  const xml = buildUrlSet(urls)
  const payload = { xml, lastmod: new Date().toISOString() }
  setCache('categories', payload)
  return payload
}

async function getStoresSitemap() {
  const cached = getCache('stores')
  if (cached) return cached
  const origin = resolveFrontendBaseUrl()
  try {
    const supabase = getServerSupabaseClient()
    const { data, error } = await supabase
      .from('users')
      .select('store_slug, updated_at')
      .eq('store_enabled', true)
      .not('store_slug', 'is', null)
      .order('updated_at', { ascending: false })
    if (error) throw error
    const urls = []
    let latest = 0
    for (const row of data || []) {
      const slug = String(row.store_slug || '').trim()
      if (!slug) continue
      const lastmod = formatDate(row.updated_at) || undefined
      if (lastmod) {
        const ts = Date.parse(lastmod)
        if (!Number.isNaN(ts) && ts > latest) latest = ts
      }
      urls.push({
        loc: `${origin}/tienda/${encodeURIComponent(slug)}`,
        lastmod,
        changefreq: 'weekly',
        priority: '0.5',
      })
    }
    const xml = buildUrlSet(urls)
    const payload = { xml, lastmod: latest ? new Date(latest).toISOString() : new Date().toISOString() }
    setCache('stores', payload)
    return payload
  } catch (err) {
    console.warn('[sitemap] stores fetch failed', err?.message || err)
    const fallback = { xml: buildUrlSet([]), lastmod: new Date().toISOString() }
    setCache('stores', fallback, 2 * 60 * 1000)
    return fallback
  }
}

async function getBlogSitemap() {
  const cached = getCache('blog')
  if (cached) return cached
  const origin = resolveFrontendBaseUrl()
  try {
    const supabase = getServerSupabaseClient()
    const { data, error } = await supabase
      .from('blog_posts')
      .select('slug, published_at, updated_at')
      .eq('status', 'published')
      .order('published_at', { ascending: false })
    if (error) throw error
    const urls = []
    let latest = 0
    for (const row of data || []) {
      const slug = String(row.slug || '').trim()
      if (!slug) continue
      const lastmod = formatDate(row.updated_at || row.published_at) || undefined
      if (lastmod) {
        const ts = Date.parse(lastmod)
        if (!Number.isNaN(ts) && ts > latest) latest = ts
      }
      urls.push({
        loc: `${origin}/blog/${encodeURIComponent(slug)}`,
        lastmod,
        changefreq: 'weekly',
        priority: '0.7',
      })
    }
    const xml = buildUrlSet(urls)
    const payload = { xml, lastmod: latest ? new Date(latest).toISOString() : new Date().toISOString() }
    setCache('blog', payload)
    return payload
  } catch (err) {
    console.warn('[sitemap] blog fetch failed', err?.message || err)
    const fallback = { xml: buildUrlSet([]), lastmod: new Date().toISOString() }
    setCache('blog', fallback, 2 * 60 * 1000)
    return fallback
  }
}

async function getListingsPageData(page) {
  const key = `listings:${page}`
  const cached = getCache(key)
  if (cached) return cached

  const origin = resolveFrontendBaseUrl()
  const from = (page - 1) * LISTINGS_PER_PAGE
  const to = from + LISTINGS_PER_PAGE - 1

  try {
    const supabase = getServerSupabaseClient()
    const { data, error, count } = await supabase
      .from('listings')
      .select('slug, created_at, updated_at, status', { count: 'exact' })
      .eq('status', 'active')
      .order('created_at', { ascending: false })
      .range(from, to)
    if (error) throw error
    const items = []
    let latest = 0
    for (const row of data || []) {
      const slug = String(row.slug || '').trim()
      if (!slug) continue
      const lastmod = formatDate(row.updated_at || row.created_at) || undefined
      if (lastmod) {
        const ts = Date.parse(lastmod)
        if (!Number.isNaN(ts) && ts > latest) latest = ts
      }
      items.push({
        loc: `${origin}/listing/${encodeURIComponent(slug)}`,
        lastmod,
        changefreq: 'daily',
        priority: '0.9',
      })
    }
    const totalItems = typeof count === 'number' && count > 0 ? count : items.length
    const totalPages = totalItems > 0 ? Math.max(1, Math.ceil(totalItems / LISTINGS_PER_PAGE)) : 1
    const payload = {
      items,
      totalPages,
      lastmod: latest ? new Date(latest).toISOString() : new Date().toISOString(),
    }
    setCache(key, payload, 5 * 60 * 1000)
    return payload
  } catch (err) {
    console.warn('[sitemap] listings fetch failed', err?.message || err)
    const fallback = { items: [], totalPages: 1, lastmod: new Date().toISOString() }
    setCache(key, fallback, 2 * 60 * 1000)
    return fallback
  }
}

async function getListingsSitemap(page) {
  const pageData = await getListingsPageData(page)
  const xml = buildUrlSet(pageData.items)
  return { xml, ...pageData }
}

async function getShoppingSitemap() {
  const cached = getCache('shopping')
  if (cached) return cached
  const pageData = await getListingsPageData(1)
  const items = pageData.items.slice(0, SHOPPING_LIMIT).map((entry) => ({
    ...entry,
    priority: '1.0',
  }))
  const xml = buildUrlSet(items)
  const payload = { xml, lastmod: pageData.lastmod }
  setCache('shopping', payload, 5 * 60 * 1000)
  return payload
}

async function getSitemapIndex() {
  const origin = resolveFrontendBaseUrl()
  const [staticInfo, categoriesInfo, storesInfo, blogInfo, shoppingInfo, listingsInfo] =
    await Promise.all([
      getStaticSitemap(),
      getCategoriesSitemap(),
      getStoresSitemap(),
      getBlogSitemap(),
      getShoppingSitemap(),
      getListingsPageData(1),
    ])

  const entries = [
    { loc: `${origin}/sitemap-static.xml`, lastmod: staticInfo.lastmod },
    { loc: `${origin}/sitemap-categories.xml`, lastmod: categoriesInfo.lastmod },
    { loc: `${origin}/sitemap-stores.xml`, lastmod: storesInfo.lastmod },
    { loc: `${origin}/sitemap-blog.xml`, lastmod: blogInfo.lastmod },
    { loc: `${origin}/sitemap-shopping.xml`, lastmod: shoppingInfo.lastmod },
  ]

  for (let page = 1; page <= (listingsInfo.totalPages || 1); page += 1) {
    entries.push({
      loc: `${origin}/sitemap-listings-${page}.xml`,
      lastmod: listingsInfo.lastmod,
    })
  }

  return buildSitemapIndex(entries)
}

function sendXml(res, xml) {
  return res.type('application/xml; charset=utf-8').send(xml)
}

router.get('/sitemap.xml', async (req, res, next) => {
  try {
    const xml = await getSitemapIndex()
    return sendXml(res, xml)
  } catch (err) {
    return next(err)
  }
})

router.get('/sitemap-static.xml', async (req, res, next) => {
  try {
    const { xml } = await getStaticSitemap()
    return sendXml(res, xml)
  } catch (err) {
    return next(err)
  }
})

router.get('/sitemap-categories.xml', async (req, res, next) => {
  try {
    const { xml } = await getCategoriesSitemap()
    return sendXml(res, xml)
  } catch (err) {
    return next(err)
  }
})

router.get('/sitemap-stores.xml', async (req, res, next) => {
  try {
    const { xml } = await getStoresSitemap()
    return sendXml(res, xml)
  } catch (err) {
    return next(err)
  }
})

router.get('/sitemap-blog.xml', async (req, res, next) => {
  try {
    const { xml } = await getBlogSitemap()
    return sendXml(res, xml)
  } catch (err) {
    return next(err)
  }
})

router.get('/sitemap-listings-:page.xml', async (req, res, next) => {
  try {
    const page = Number.parseInt(req.params.page, 10)
    if (!Number.isFinite(page) || page < 1) {
      return res.status(400).type('text/plain').send('Invalid page')
    }
    const { xml, items, totalPages } = await getListingsSitemap(page)
    if (items.length === 0 && page > totalPages) {
      return res.status(404).type('text/plain').send('Not Found')
    }
    return sendXml(res, xml)
  } catch (err) {
    return next(err)
  }
})

router.get('/sitemap-shopping.xml', async (req, res, next) => {
  try {
    const { xml } = await getShoppingSitemap()
    return sendXml(res, xml)
  } catch (err) {
    return next(err)
  }
})

module.exports = router
