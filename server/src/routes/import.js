const express = require('express')

function normalizeMeliUrl(rawUrl) {
  const input = String(rawUrl || '').trim()
  if (!input) return null
  if (input.startsWith('http://') || input.startsWith('https://')) return input
  return `https://${input}`
}

async function parseWithAI(data) {
  return data
}

async function importMercadoLibre(req, res) {
  try {
    const rawUrl = typeof req.body?.url === 'string' ? req.body.url : ''
    const url = normalizeMeliUrl(rawUrl)
    if (!url) return res.status(400).json({ ok: false, error: 'missing_url', message: 'Falta `url` en el body.' })

    let scrapeMercadoLibre
    try {
      ;({ scrapeMercadoLibre } = require('../services/scraperService'))
    } catch (loadErr) {
      const msg = loadErr instanceof Error ? loadErr.message : String(loadErr || '')
      if (msg.includes('Cannot find module')) {
        return res.status(503).json({
          ok: false,
          error: 'scraper_unavailable',
          message: 'Scraper no disponible (dependencias faltantes).',
        })
      }
      throw loadErr
    }

    const scraped = await scrapeMercadoLibre(url)
    const parsed = await parseWithAI(scraped)
    return res.json(parsed)
  } catch (err) {
    const code = err && typeof err === 'object' ? err.code : null
    const status = err && typeof err === 'object' ? err.httpStatus : null

    if (code === 'invalid_domain' || code === 'invalid_url' || code === 'missing_url') {
      return res.status(400).json({ ok: false, error: code })
    }

    if (code === 'waf_blocked') {
      return res.status(403).json({
        ok: false,
        error: 'waf_blocked',
        status: status || 403,
        message: 'Bloqueado por WAF/anti-bot de MercadoLibre.',
        hint: 'Probá con stealth + puppeteer (ya activo) y revisá si ML muestra captcha/403. Puede requerir proxy residencial.',
        excerpt: err.excerpt || null,
      })
    }

    console.error('[import] mercadolibre failed', err)
    return res.status(500).json({ ok: false, error: 'unexpected_error' })
  }
}

const router = express.Router()
router.post('/api/import/mercadolibre', importMercadoLibre)
router.post('/import/mercadolibre', importMercadoLibre)

module.exports = router
