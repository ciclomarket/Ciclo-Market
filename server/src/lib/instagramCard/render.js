'use strict'

const { renderTemplate } = require('./template')
const cfg = require('./config')

const RENDER_TIMEOUT_MS = 15_000

// Singleton browser — lazy-init, shared across requests
let _browserPromise = null

function getBrowser() {
  if (_browserPromise) return _browserPromise
  _browserPromise = (async () => {
    // Use @sparticuz/chromium — bundles Chromium inside the npm package,
    // no separate `puppeteer browsers install` step needed.
    const chromium = require('@sparticuz/chromium')
    const puppeteer = require('puppeteer-core')

    const executablePath = await chromium.executablePath()
    console.log(`[instagram-card] launching browser → ${executablePath}`)

    const browser = await puppeteer.launch({
      args: chromium.args,
      executablePath,
      headless: chromium.headless,
      defaultViewport: { width: cfg.width, height: cfg.height },
    })

    console.log('[instagram-card] browser ready')
    browser.on('disconnected', () => {
      console.warn('[instagram-card] browser disconnected — will re-init on next request')
      _browserPromise = null
    })
    return browser
  })().catch((err) => {
    console.error('[instagram-card] browser launch failed:', err?.message || err)
    _browserPromise = null
    throw err
  })
  return _browserPromise
}

/**
 * Render a listing card to PNG bytes.
 * @param {object} data  — same shape as renderTemplate expects
 * @returns {Promise<Buffer>} PNG bytes
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
    const buffer = await page.screenshot({
      type: 'png',
      clip: { x: 0, y: 0, width: cfg.width, height: cfg.height },
    })
    return buffer
  } catch (err) {
    if (!err.code) err.code = 'RENDER_FAILED'
    throw err
  } finally {
    await page.close().catch(() => {})
  }
}

module.exports = { renderListingCard }
