const puppeteerExtra = require('puppeteer-extra')
const StealthPlugin = require('puppeteer-extra-plugin-stealth')
const puppeteer = require('puppeteer')

puppeteerExtra.use(StealthPlugin())

function normalizeMeliUrl(rawUrl) {
  const input = String(rawUrl || '').trim()
  if (!input) return null
  if (input.startsWith('http://') || input.startsWith('https://')) return input
  return `https://${input}`
}

function extractExternalId(urlString) {
  try {
    const u = new URL(urlString)
    const wid = String(u.searchParams.get('wid') || '')
      .toUpperCase()
      .match(/MLA\d+/)?.[0]
    if (wid) return wid
  } catch {
    // ignore
  }
  const match = String(urlString || '')
    .toUpperCase()
    .match(/MLA-?\d+/g)
  if (!match || !match.length) return null
  return match[match.length - 1].replace('-', '')
}

function parsePriceToNumber(value) {
  if (value == null) return null
  const raw = String(value)
    .replace(/\u00a0/g, ' ')
    .replace(/[^\d.,]/g, '')
    .trim()
  if (!raw) return null

  const hasComma = raw.includes(',')
  const hasDot = raw.includes('.')
  let normalized = raw

  if (hasComma && hasDot) {
    normalized = raw.replace(/\./g, '').replace(',', '.')
  } else if (hasComma && !hasDot) {
    normalized = raw.replace(',', '.')
  } else {
    normalized = raw
  }

  const num = Number(normalized)
  return Number.isFinite(num) ? num : null
}

async function launchBrowser() {
  const executablePathEnv = String(process.env.PUPPETEER_EXECUTABLE_PATH || process.env.CHROME_EXECUTABLE_PATH || '').trim()
  const executablePath = executablePathEnv || (typeof puppeteer.executablePath === 'function' ? puppeteer.executablePath() : '')
  const args = [
    '--no-sandbox',
    '--disable-setuid-sandbox',
    '--disable-dev-shm-usage',
    '--single-process',
    '--no-zygote',
    '--disable-gpu',
    '--disable-features=site-per-process,IsolateOrigins',
  ]

  try {
    return await puppeteerExtra.launch({
      headless: 'new',
      executablePath: executablePath || undefined,
      args,
      ignoreHTTPSErrors: true,
    })
  } catch (err) {
    const e = err instanceof Error ? err : new Error(String(err || 'browser_launch_failed'))
    e.code = 'browser_launch_failed'
    e.details = {
      executablePath: executablePath || null,
      executablePathEnv: executablePathEnv || null,
      cacheDir: process.env.PUPPETEER_CACHE_DIR || null,
    }
    throw e
  }
}

async function scrapeMercadoLibre(url) {
  const normalizedUrl = normalizeMeliUrl(url)
  if (!normalizedUrl) {
    const err = new Error('missing_url')
    err.code = 'missing_url'
    throw err
  }

  let parsed
  try {
    parsed = new URL(normalizedUrl)
  } catch {
    const err = new Error('invalid_url')
    err.code = 'invalid_url'
    throw err
  }

  const host = String(parsed.hostname || '').toLowerCase()
  if (!host.endsWith('mercadolibre.com.ar')) {
    const err = new Error('invalid_domain')
    err.code = 'invalid_domain'
    throw err
  }

  const externalId = extractExternalId(normalizedUrl)
  const browser = await launchBrowser()
  const startedAt = Date.now()

  try {
    const page = await browser.newPage()
    await page.setViewport({ width: 1365, height: 768, deviceScaleFactor: 1 })
    await page.setExtraHTTPHeaders({
      'Accept-Language': 'es-AR,es;q=0.9,en;q=0.8',
    })

    await page.setRequestInterception(true)
    page.on('request', (request) => {
      try {
        const type = request.resourceType()
        if (type === 'image' || type === 'stylesheet' || type === 'font' || type === 'media') {
          return request.abort()
        }
        const reqUrl = request.url()
        if (/google-analytics|googletagmanager|doubleclick|facebook|hotjar|datadog/i.test(reqUrl)) {
          return request.abort()
        }
        return request.continue()
      } catch {
        try {
          return request.continue()
        } catch {
          return undefined
        }
      }
    })

    let response
    try {
      response = await page.goto(normalizedUrl, { waitUntil: 'domcontentloaded', timeout: 45_000 })
    } catch (err) {
      const e = err instanceof Error ? err : new Error(String(err || 'navigation_failed'))
      e.code = e.code || 'navigation_failed'
      throw e
    }
    const status = response ? response.status() : null

    await page.waitForTimeout(350)

    if (status && status >= 400) {
      const html = await page.content().catch(() => '')
      const excerpt = html ? html.slice(0, 1800) : ''
      const err = new Error('waf_blocked')
      err.code = 'waf_blocked'
      err.httpStatus = status
      err.excerpt = excerpt
      throw err
    }

    await page.waitForSelector('h1.ui-pdp-title, h1, [itemprop="name"]', { timeout: 20_000 })

    const scraped = await page.evaluate(() => {
      function textOf(sel) {
        const el = document.querySelector(sel)
        const txt = el && el.textContent ? el.textContent.trim() : ''
        return txt || null
      }

      function metaContent(nameOrProp) {
        const byProp = document.querySelector(`meta[property="${nameOrProp}"]`)
        if (byProp && byProp.getAttribute('content')) return byProp.getAttribute('content')
        const byName = document.querySelector(`meta[name="${nameOrProp}"]`)
        if (byName && byName.getAttribute('content')) return byName.getAttribute('content')
        return null
      }

      function collectImages() {
        const urls = new Set()
        const push = (u) => {
          if (!u || typeof u !== 'string') return
          const cleaned = u.trim()
          if (!cleaned) return
          urls.add(cleaned)
        }

        document.querySelectorAll('figure img, img').forEach((img) => {
          push(img.getAttribute('data-zoom'))
          push(img.getAttribute('data-src'))
          push(img.getAttribute('src'))
          const srcset = img.getAttribute('srcset')
          if (srcset) {
            const best = srcset
              .split(',')
              .map((entry) => entry.trim().split(' ')[0])
              .filter(Boolean)
              .pop()
            push(best)
          }
        })

        return Array.from(urls).filter((u) => /^https?:\/\//i.test(u)).slice(0, 20)
      }

      function collectCharacteristics() {
        const entries = []
        const push = (k, v) => {
          const key = (k || '').toString().trim()
          const val = (v || '').toString().trim()
          if (!key || !val) return
          entries.push({ key, value: val })
        }

        document.querySelectorAll('table tr').forEach((tr) => {
          const cells = tr.querySelectorAll('th,td')
          if (cells.length >= 2) push(cells[0].textContent, cells[1].textContent)
        })

        if (!entries.length) {
          document.querySelectorAll('.ui-pdp-specs__table .andes-table__row').forEach((row) => {
            const cols = row.querySelectorAll('.andes-table__column')
            if (cols.length >= 2) push(cols[0].textContent, cols[1].textContent)
          })
        }

        if (!entries.length) {
          document.querySelectorAll('dl').forEach((dl) => {
            const dts = dl.querySelectorAll('dt')
            const dds = dl.querySelectorAll('dd')
            for (let i = 0; i < Math.min(dts.length, dds.length); i += 1) {
              push(dts[i].textContent, dds[i].textContent)
            }
          })
        }

        const map = {}
        for (const e of entries) {
          if (!map[e.key]) map[e.key] = e.value
        }
        return map
      }

      const title = textOf('h1.ui-pdp-title') || textOf('h1') || textOf('[itemprop="name"]') || metaContent('og:title') || null

      const priceText =
        textOf('.ui-pdp-price__second-line .andes-money-amount__fraction') ||
        textOf('.andes-money-amount__fraction') ||
        textOf('[itemprop="price"]') ||
        metaContent('product:price:amount') ||
        metaContent('og:price:amount') ||
        null

      const currency =
        metaContent('product:price:currency') || metaContent('og:price:currency') || metaContent('priceCurrency') || 'ARS'

      const description =
        textOf('.ui-pdp-description__content') ||
        textOf('#description') ||
        metaContent('og:description') ||
        textOf('[itemprop="description"]') ||
        null

      const images = collectImages()
      const characteristics = collectCharacteristics()

      return { title, priceText, currency, description, images, characteristics }
    })

    return {
      source: 'mercadolibre',
      external_id: externalId,
      title: scraped.title || null,
      price: parsePriceToNumber(scraped.priceText),
      currency: scraped.currency || null,
      condition: null,
      description: scraped.description || null,
      images: Array.isArray(scraped.images) ? scraped.images : [],
      characteristics: scraped.characteristics && typeof scraped.characteristics === 'object' ? scraped.characteristics : {},
      meta: {
        ms: Date.now() - startedAt,
        url: normalizedUrl,
      },
    }
  } finally {
    await browser.close().catch(() => {})
  }
}

module.exports = { scrapeMercadoLibre }
