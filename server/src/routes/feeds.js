const express = require('express')
const { getServerSupabaseClient } = require('../lib/supabaseClient')

const router = express.Router()

const XML_HEADER = '<?xml version="1.0" encoding="UTF-8"?>'
const GOOGLE_NS = 'http://base.google.com/ns/1.0'
const DEFAULT_ORIGIN = 'https://www.ciclomarket.ar'

const cache = new Map()

function setCache(key, value, ttlMs) {
  cache.set(key, { value, expiresAt: Date.now() + ttlMs })
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

function stripHtml(value) {
  if (!value) return ''
  return String(value)
    .replace(/<script\b[^<]*(?:(?!<\/script>)<[^<]*)*<\/script>/gi, ' ')
    .replace(/<style\b[^<]*(?:(?!<\/style>)<[^<]*)*<\/style>/gi, ' ')
    .replace(/<\/?[^>]+>/g, ' ')
    .replace(/\s+/g, ' ')
    .trim()
}

function cdata(value) {
  const text = String(value ?? '')
  // Prevent breaking out of CDATA if content includes "]]>"
  return `<![CDATA[${text.replaceAll(']]>', ']]]]><![CDATA[>')}]]>`
}

function extractFirstImage(images) {
  if (!Array.isArray(images)) return null
  for (const item of images) {
    if (!item) continue
    if (typeof item === 'string') return item
    const url = item.url || item.uri || item.src || item.path || item.key
    if (typeof url === 'string' && url) return url
  }
  return null
}

function formatPrice(value, currency) {
  const cur = String(currency || 'ARS').toUpperCase()
  const num = typeof value === 'number' ? value : Number(value)
  if (!Number.isFinite(num) || num <= 0) return null
  const rendered = Number.isInteger(num) ? String(num) : num.toFixed(2)
  return `${rendered} ${cur}`
}

async function fetchAllActiveListings(supabase) {
  const pageSize = 1000
  const out = []
  for (let offset = 0; ; offset += pageSize) {
    const from = offset
    const to = offset + pageSize - 1
    const { data, error } = await supabase
      .from('listings')
      .select('id,slug,title,description,price,price_currency,images,brand,status')
      .in('status', ['active', 'published'])
      .order('created_at', { ascending: false })
      .range(from, to)
    if (error) throw error
    const rows = Array.isArray(data) ? data : []
    out.push(...rows)
    if (rows.length < pageSize) break
  }
  return out
}

function buildGoogleRss(listings, origin = DEFAULT_ORIGIN) {
  const channelTitle = 'Ciclo Market'
  const channelLink = origin
  const channelDescription = 'Bicicletas publicadas en Ciclo Market'

  const itemsXml = (listings || [])
    .map((row) => {
      const id = row?.id ? String(row.id) : null
      const slug = row?.slug ? String(row.slug).trim() : null
      const title = row?.title ? String(row.title).trim() : null
      const brand = row?.brand ? String(row.brand).trim() : ''
      const descriptionText = stripHtml(row?.description || '')
      const link = slug ? `${origin}/listing/${encodeURIComponent(slug)}` : `${origin}/listing/${encodeURIComponent(String(id || ''))}`
      const imageLink = extractFirstImage(row?.images) || ''
      const price = formatPrice(row?.price, row?.price_currency)

      if (!id || !title || !price) return null

      return [
        '    <item>',
        `      <g:id>${escapeXml(id)}</g:id>`,
        `      <g:title>${cdata(title)}</g:title>`,
        `      <g:description>${cdata(descriptionText || title)}</g:description>`,
        `      <g:link>${escapeXml(link)}</g:link>`,
        ...(imageLink ? [`      <g:image_link>${escapeXml(imageLink)}</g:image_link>`] : []),
        `      <g:price>${escapeXml(price)}</g:price>`,
        '      <g:availability>in_stock</g:availability>',
        '      <g:condition>used</g:condition>',
        '      <g:identifier_exists>false</g:identifier_exists>',
        ...(brand ? [`      <g:brand>${cdata(brand)}</g:brand>`] : []),
        '    </item>',
      ].join('\n')
    })
    .filter(Boolean)
    .join('\n')

  return [
    XML_HEADER,
    `<rss xmlns:g="${GOOGLE_NS}" version="2.0">`,
    '  <channel>',
    `    <title>${escapeXml(channelTitle)}</title>`,
    `    <link>${escapeXml(channelLink)}</link>`,
    `    <description>${escapeXml(channelDescription)}</description>`,
    itemsXml,
    '  </channel>',
    '</rss>',
  ]
    .filter((line) => line !== '')
    .join('\n')
}

router.get(['/api/feed/google.xml', '/feed/google.xml'], async (_req, res) => {
  try {
    const cached = getCache('google')
    if (cached) {
      res.setHeader('Content-Type', 'application/xml; charset=utf-8')
      return res.status(200).send(cached)
    }

    const supabase = getServerSupabaseClient()
    const listings = await fetchAllActiveListings(supabase)
    const xml = buildGoogleRss(listings, DEFAULT_ORIGIN)

    setCache('google', xml, 5 * 60 * 1000)

    res.setHeader('Content-Type', 'application/xml; charset=utf-8')
    return res.status(200).send(xml)
  } catch (err) {
    console.error('[feed] google.xml failed', err?.message || err)
    return res.status(500).type('text/plain').send('feed_error')
  }
})

module.exports = router

