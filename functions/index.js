const { onRequest } = require('firebase-functions/v2/https')
const { Readable } = require('stream')

// Render origin for backend that generates OG meta tags
const RENDER_ORIGIN = process.env.RENDER_ORIGIN || 'https://www.ciclomarket.ar'
const SUPABASE_URL = process.env.SUPABASE_URL || 'https://jmtsgywgeysagnfgdovr.supabase.co'

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

exports.shareListing = onRequest({ region: 'us-central1', memory: '256MiB' }, async (req, res) => {
  try {
    if (req.method !== 'GET') {
      res.set('Allow', 'GET')
      return res.status(405).send('Method Not Allowed')
    }

    // Build target URL preserving path and query
    const target = new URL(req.originalUrl || req.url, RENDER_ORIGIN)

    // Forward essential headers, especially User-Agent so backend detects bots
    const headers = {
      'User-Agent': req.get('user-agent') || '',
      'Accept': req.get('accept') || 'text/html,application/xhtml+xml,application/xml;q=0.9,*/*;q=0.8',
      'Accept-Language': req.get('accept-language') || 'es-AR,es;q=0.9',
    }

    const upstream = await fetch(target.toString(), { method: 'GET', headers })
    const text = await upstream.text()

    // Pass through content-type and cache headers if present
    const ct = upstream.headers.get('content-type') || 'text/html; charset=utf-8'
    res.set('Content-Type', ct)

    const cc = upstream.headers.get('cache-control')
    if (cc) res.set('Cache-Control', cc)
    res.status(upstream.status)
    return res.send(text)
  } catch (err) {
    console.error('[functions/shareListing] error', err)
    res.set('Content-Type', 'text/html; charset=utf-8')
    return res.status(500).send('<!doctype html><title>Error</title>')
  }
})
