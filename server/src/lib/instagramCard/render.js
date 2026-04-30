'use strict'

const { renderTemplate } = require('./template')
const cfg = require('./config')

const RENDER_TIMEOUT_MS = 15_000

// Singleton browser — lazy-init, shared across requests
let _browserPromise = null

async function launchBrowser() {
  const isLinux = process.platform === 'linux'

  if (isLinux) {
    // Production (Render): use @sparticuz/chromium — binary bundled inside npm package,
    // no separate install step, no path guessing.
    const chromium = require('@sparticuz/chromium')
    const puppeteer = require('puppeteer-core')
    const executablePath = await chromium.executablePath()
    console.log(`[instagram-card] linux → sparticuz chromium at ${executablePath}`)
    return puppeteer.launch({
      args: chromium.args,
      executablePath,
      headless: chromium.headless,
      defaultViewport: { width: cfg.width, height: cfg.height },
    })
  }

  // Local dev (macOS / Windows): use the full puppeteer package which manages its own Chrome.
  const puppeteer = require('puppeteer')
  console.log('[instagram-card] local dev → system puppeteer')
  return puppeteer.launch({
    headless: 'new',
    args: [
      '--no-sandbox',
      '--disable-setuid-sandbox',
      '--disable-dev-shm-usage',
      '--disable-gpu',
    ],
    defaultViewport: { width: cfg.width, height: cfg.height },
  })
}

function getBrowser() {
  if (_browserPromise) return _browserPromise
  _browserPromise = launchBrowser()
    .then((browser) => {
      console.log('[instagram-card] browser ready')
      browser.on('disconnected', () => {
        console.warn('[instagram-card] browser disconnected — will re-init on next request')
        _browserPromise = null
      })
      return browser
    })
    .catch((err) => {
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
    // deviceScaleFactor: 2 → renders at 2160x2700, giving crisp text and edges
    await page.setViewport({ width: cfg.width, height: cfg.height, deviceScaleFactor: 2 })
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
    // fullPage: false captures exactly the viewport at 2x DPI → 2160×2700 PNG
    const buffer = await page.screenshot({ type: 'png', fullPage: false })
    return buffer
  } catch (err) {
    if (!err.code) err.code = 'RENDER_FAILED'
    throw err
  } finally {
    await page.close().catch(() => {})
  }
}

module.exports = { renderListingCard }
