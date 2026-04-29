'use strict'

const { renderTemplate } = require('./template')
const cfg = require('./config')

const RENDER_TIMEOUT_MS = 15_000

// Singleton browser — lazy-init, shared across requests
let _browserPromise = null

function getBrowser() {
  if (_browserPromise) return _browserPromise
  _browserPromise = (async () => {
    const puppeteer = require('puppeteer')

    // Resolve the Chrome executable installed by `puppeteer browsers install chrome`
    // On Render the cache dir is set via PUPPETEER_CACHE_DIR env var.
    let executablePath
    try {
      executablePath = puppeteer.executablePath()
    } catch {
      executablePath = undefined
    }

    const launchOpts = {
      headless: 'new',
      executablePath,
      args: [
        '--no-sandbox',
        '--disable-setuid-sandbox',
        '--disable-dev-shm-usage',  // use /tmp instead of /dev/shm (tiny on Render)
        '--disable-gpu',
        '--no-zygote',              // avoid zygote process that fails in some containers
        '--disable-accelerated-2d-canvas',
        '--disable-extensions',
        '--font-render-hinting=none',
        '--run-all-compositor-stages-before-draw',
        '--hide-scrollbars',
        '--mute-audio',
      ],
    }

    console.log('[instagram-card] launching browser', executablePath || '(default path)')
    const browser = await puppeteer.launch(launchOpts)
    console.log('[instagram-card] browser ready')
    browser.on('disconnected', () => {
      console.warn('[instagram-card] browser disconnected — will re-init on next request')
      _browserPromise = null
    })
    return browser
  })().catch((err) => {
    console.error('[instagram-card] browser launch failed:', err?.message || err)
    _browserPromise = null   // allow retry on next request
    throw err
  })
  return _browserPromise
}

/**
 * Render a listing card to PNG bytes.
 *
 * @param {object} data  — same shape as renderTemplate expects
 * @returns {Promise<Buffer>} PNG bytes
 * @throws {Error} with .code = 'RENDER_TIMEOUT' | 'RENDER_FAILED'
 */
async function renderListingCard(data) {
  const browser = await getBrowser()
  const page = await browser.newPage()
  try {
    await page.setViewport({ width: cfg.width, height: cfg.height, deviceScaleFactor: 1 })
    const html = renderTemplate(data)
    await Promise.race([
      page.setContent(html, { waitUntil: 'networkidle0' }),
      new Promise((_, reject) =>
        setTimeout(() => {
          const err = new Error('Instagram card render timed out after 15s')
          err.code = 'RENDER_TIMEOUT'
          reject(err)
        }, RENDER_TIMEOUT_MS)
      ),
    ])
    const buffer = await page.screenshot({ type: 'png', clip: { x: 0, y: 0, width: cfg.width, height: cfg.height } })
    return buffer
  } catch (err) {
    if (!err.code) err.code = 'RENDER_FAILED'
    throw err
  } finally {
    await page.close().catch(() => {})
  }
}

module.exports = { renderListingCard }
