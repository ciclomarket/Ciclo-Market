'use strict'

const fs = require('fs')
const path = require('path')
const { renderTemplate } = require('./template')
const cfg = require('./config')

const RENDER_TIMEOUT_MS = 15_000

/**
 * Find the Chrome binary installed by `puppeteer browsers install chrome`.
 * Puppeteer may resolve executablePath() to the wrong location when
 * PUPPETEER_CACHE_DIR is a relative path at build time but resolves
 * differently at runtime. We scan the cache directory directly.
 */
function findChrome() {
  // Candidate cache dirs in order of preference
  const candidates = [
    process.env.PUPPETEER_CACHE_DIR,          // explicit env var (may be relative)
    path.join(process.cwd(), 'node_modules', '.cache', 'puppeteer'),
    path.join(process.env.HOME || '/opt/render', '.cache', 'puppeteer'),
    '/opt/render/.cache/puppeteer',
  ].filter(Boolean).map((p) => path.resolve(p))

  for (const cacheDir of candidates) {
    try {
      const chromeBucket = path.join(cacheDir, 'chrome')
      if (!fs.existsSync(chromeBucket)) continue
      const versions = fs.readdirSync(chromeBucket)
      for (const ver of versions) {
        const binary = path.join(chromeBucket, ver, 'chrome-linux64', 'chrome')
        if (fs.existsSync(binary)) {
          console.log(`[instagram-card] found Chrome at ${binary}`)
          return binary
        }
      }
    } catch { /* try next */ }
  }
  return undefined
}

// Singleton browser — lazy-init, shared across requests
let _browserPromise = null

function getBrowser() {
  if (_browserPromise) return _browserPromise
  _browserPromise = (async () => {
    const puppeteer = require('puppeteer')
    const executablePath = findChrome()

    if (!executablePath) {
      throw Object.assign(
        new Error('Chrome binary not found. Run: ./node_modules/.bin/puppeteer browsers install chrome'),
        { code: 'CHROME_NOT_FOUND' }
      )
    }

    const launchOpts = {
      headless: 'new',
      executablePath,
      args: [
        '--no-sandbox',
        '--disable-setuid-sandbox',
        '--disable-dev-shm-usage',
        '--disable-gpu',
        '--no-zygote',
        '--disable-accelerated-2d-canvas',
        '--disable-extensions',
        '--font-render-hinting=none',
        '--hide-scrollbars',
        '--mute-audio',
      ],
    }

    console.log(`[instagram-card] launching browser → ${executablePath}`)
    const browser = await puppeteer.launch(launchOpts)
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
