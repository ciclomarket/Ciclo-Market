const { onRequest } = require('firebase-functions/v2/https')

// Render origin for backend that generates OG meta tags
const RENDER_ORIGIN = process.env.RENDER_ORIGIN || 'https://ciclo-market.onrender.com'

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
