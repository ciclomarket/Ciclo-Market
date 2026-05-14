'use strict'

const fs   = require('fs')
const path = require('path')
const cfg  = require('./config')

// ── Logo ─────────────────────────────────────────────────────────────────────
let _logoDataUri = null
function getLogoDataUri() {
  if (_logoDataUri !== null) return _logoDataUri
  const candidates = [
    { p: path.join(__dirname, 'assets', 'logo-blanco.png'), mime: 'image/png'  },
    { p: path.join(process.cwd(), 'public', 'blanco.png'),  mime: 'image/png'  },
    { p: path.join(__dirname, 'assets', 'site-logo.webp'),  mime: 'image/webp' },
  ]
  for (const { p, mime } of candidates) {
    try { _logoDataUri = `data:${mime};base64,${fs.readFileSync(p).toString('base64')}`; return _logoDataUri }
    catch { /* next */ }
  }
  _logoDataUri = ''; return _logoDataUri
}

// ── Helpers ───────────────────────────────────────────────────────────────────

function formatPrice(currency, price) {
  const n = typeof price === 'number' ? price : Number(price)
  const s = n.toLocaleString('es-AR', { maximumFractionDigits: 0 })
  return currency === 'USD' ? `U$D ${s}` : `$${s}`
}

// Brand: Archivo Black, calibrated for 612px content width
function brandFontSize(brand) {
  const len = String(brand || '').length
  if (len <= 7)  return '96px'
  if (len <= 11) return '80px'
  if (len <= 15) return '68px'
  return '56px'
}

// Dossard price: calibrated for 272px usable width (320px - 48px padding).
// Sizes match the widest fallback (Arial Black ~0.62em/char), so Bebas Neue
// (narrower, ~0.40em/char) will always have breathing room.
function dossardPriceFontSize(str) {
  const len = str.replace(/\s/g, '').length
  if (len <= 6)  return '64px'   // $9.500
  if (len <= 8)  return '52px'   // U$D 2.000, $850.000
  if (len <= 11) return '44px'   // $8.500.000, U$D 12.000
  return '36px'
}

// Serial: 4-digit race number derived deterministically from listing id.
// Uses last 6 hex chars of UUID (without hyphens), mod 9000 + 1000 → #1000–#9999
function deriveSerial(id) {
  if (!id) return '0000'
  const hex = String(id).replace(/-/g, '').slice(-6)
  const n = parseInt(hex, 16)
  if (isNaN(n)) return '0000'
  return String((n % 9000) + 1000)
}

// ── Template ──────────────────────────────────────────────────────────────────
/**
 * @param {object} data
 * @param {string} data.id
 * @param {string} data.title
 * @param {string} data.brand
 * @param {string} data.model
 * @param {number|null} data.year
 * @param {string} data.category
 * @param {string|null} data.size        — frame_size (talle)
 * @param {string|null} data.drivetrain  — groupset (SRAM GX Eagle, etc.)
 * @param {string|null} data.location    — ciudad / provincia
 * @param {string|null} data.sellerName  — users.full_name
 * @param {number} data.price
 * @param {string} data.currency
 * @param {string|null} data.imageUrl
 */
function renderTemplate(data) {
  const { colors, fonts } = cfg

  const id         = String(data.id       || '')
  const brand      = String(data.brand    || '').trim()
  const model      = String(data.model    || '').trim()
  const year       = data.year       ? String(data.year)       : null
  const category   = String(data.category || '').trim()
  const size       = data.size       ? String(data.size).trim()       : null
  const drivetrain = data.drivetrain ? String(data.drivetrain).trim() : null
  const location   = data.location   ? String(data.location).trim()   : null
  const sellerName = data.sellerName ? String(data.sellerName).trim()  : null
  const currency   = String(data.currency || 'ARS').toUpperCase()
  const price      = typeof data.price === 'number' ? data.price : Number(data.price)
  const imageUrl   = data.imageUrl || null

  const priceDisplay  = formatPrice(currency, price)
  const brandSize     = brandFontSize(brand)
  const dossardPxSize = dossardPriceFontSize(priceDisplay)
  const serial        = deriveSerial(id)
  const logoUri       = getLogoDataUri()

  // Model line: model · year · location
  const modelLine = [model, year, location].filter(Boolean).join(' · ')

  // Serial line: AÑO {year} · #{serial}
  const serialLine = [year ? `AÑO ${year}` : null, `#${serial}`].filter(Boolean).join(' · ')

  // Zone heights: header(80) + hero(900) + content(370) = 1350
  const HEADER_H  = 80
  const HERO_H    = 900
  const CONTENT_H = 370

  return `<!DOCTYPE html>
<html>
<head>
<meta charset="utf-8">
<link rel="preconnect" href="https://fonts.googleapis.com">
<link rel="preconnect" href="https://fonts.gstatic.com" crossorigin>
<link href="https://fonts.googleapis.com/css2?family=Archivo+Black&family=Bebas+Neue&family=Inter:wght@400;500;600&family=JetBrains+Mono:wght@400;500&display=swap" rel="stylesheet">
<style>
  *, *::before, *::after { margin: 0; padding: 0; box-sizing: border-box; }
  html, body {
    width: 1080px; height: 1350px; overflow: hidden;
    background: ${colors.background};
    font-family: ${fonts.body};
    -webkit-font-smoothing: antialiased;
    text-rendering: optimizeLegibility;
  }

  .card {
    width: 1080px; height: 1350px; overflow: hidden;
    display: flex; flex-direction: column;
    background: ${colors.background};
  }

  /* ── Header (80px) — no gradient bar ── */
  .header {
    flex: 0 0 ${HEADER_H}px;
    display: flex; align-items: center; justify-content: space-between;
    padding: 0 28px;
    background: ${colors.background};
    border-bottom: 1px solid rgba(255,255,255,0.06);
  }
  .header-logo {
    height: 40px; width: auto; object-fit: contain; object-position: left center; display: block;
  }
  .header-logo-text {
    font-family: ${fonts.body}; font-size: 24px; font-weight: 700; color: ${colors.text};
  }
  .pill {
    background: rgba(255,255,255,0.08);
    border: 0.5px solid rgba(255,255,255,0.18);
    border-radius: 999px; padding: 8px 18px;
    font-family: ${fonts.body}; font-size: 13px; font-weight: 600;
    letter-spacing: 0.14em; text-transform: uppercase;
    color: ${colors.text}; white-space: nowrap;
  }

  /* ── Hero (900px) ── */
  .hero {
    flex: 0 0 ${HERO_H}px;
    position: relative; overflow: hidden;
    background: #0f1923;
  }
  .hero-img { width: 100%; height: 100%; object-fit: cover; display: block; }
  .hero-fallback {
    width: 100%; height: 100%;
    display: flex; align-items: center; justify-content: center;
    background: #0f1923;
  }
  .hero-scrim {
    position: absolute; bottom: 0; left: 0; right: 0; height: 120px;
    background: linear-gradient(to top, rgba(20,33,46,0.85) 0%, rgba(20,33,46,0) 100%);
    pointer-events: none; z-index: 1;
  }

  /* ── Content (370px) ── */
  .content {
    flex: 0 0 ${CONTENT_H}px;
    position: relative;
    overflow: visible;
    background: ${colors.background};
    display: flex; align-items: flex-end;
    padding: 32px 56px 48px;
  }

  /* Left column */
  .text-col {
    flex: 1; min-width: 0;
    padding-right: 356px;
  }
  .brand-name {
    font-family: ${fonts.display};
    font-size: ${brandSize};
    line-height: 0.9;
    letter-spacing: -0.03em;
    color: ${colors.text};
    text-transform: uppercase;
    white-space: nowrap; overflow: hidden; text-overflow: ellipsis;
    display: block;
    margin-bottom: 0;
  }
  .drivetrain-line {
    display: block;
    margin-top: 6px;
    font-family: ${fonts.body};
    font-size: 22px; font-weight: 500;
    color: rgba(255,255,255,0.7);
    white-space: nowrap; overflow: hidden; text-overflow: ellipsis;
    line-height: 1.2;
  }
  .model-line {
    display: block;
    margin-top: 14px;
    font-family: ${fonts.body};
    font-size: 26px; font-weight: 500;
    color: ${colors.textMuted};
    white-space: nowrap; overflow: hidden; text-overflow: ellipsis;
    line-height: 1.2;
  }
  .seller-line {
    display: block;
    margin-top: 10px;
    font-family: ${fonts.body};
    font-size: 16px; font-weight: 400;
    color: rgba(255,255,255,0.55);
    white-space: nowrap; overflow: hidden; text-overflow: ellipsis;
  }

  /* ── Dossard ── */
  .dossard {
    position: absolute;
    top: -100px; right: 56px;
    width: 320px; height: 380px;
    background: ${colors.paper};
    border-radius: 2px;
    box-shadow: 0 18px 40px rgba(0,0,0,0.5), 0 4px 12px rgba(0,0,0,0.3);
    overflow: hidden;
    z-index: 10;
    transform: rotate(-2.5deg);
    transform-origin: center;
    display: flex; flex-direction: column;
  }

  /* Sponsor strip */
  .sponsor-strip {
    flex: 0 0 44px;
    background: ${colors.ink};
    display: flex; align-items: center;
    padding: 0 16px;
    overflow: hidden;
  }
  .sponsor-text {
    font-family: ${fonts.display};
    font-size: 13px;
    letter-spacing: 0.08em;
    text-transform: uppercase;
    color: ${colors.paper};
    white-space: nowrap; overflow: hidden; text-overflow: ellipsis;
  }

  /* Pin row */
  .pin-row {
    flex: 0 0 36px;
    background: ${colors.paper};
    display: flex; align-items: center; justify-content: space-between;
    padding: 0 26px;
  }
  .pin-hole {
    width: 20px; height: 20px; border-radius: 50%;
    background: ${colors.ink};
    box-shadow: inset 0 1px 2px rgba(0,0,0,0.6), 0 0.5px 0 rgba(255,255,255,0.4);
  }

  /* Dossard body */
  .dossard-body {
    flex: 1;
    padding: 22px 24px 18px;
    display: flex; flex-direction: column;
    justify-content: space-between;
  }

  /* Price */
  .dossard-price {
    font-family: ${fonts.numeric};
    font-size: ${dossardPxSize};
    color: ${colors.ink};
    line-height: 0.9;
    letter-spacing: 0.01em;
    white-space: nowrap; overflow: hidden;
  }

  /* Talle */
  .talle-block { display: flex; flex-direction: column; }
  .talle-label {
    font-family: ${fonts.body};
    font-size: 13px; font-weight: 600;
    letter-spacing: 0.18em; text-transform: uppercase;
    color: ${colors.inkMuted};
    margin-bottom: 4px;
  }
  .talle-value {
    font-family: ${fonts.display};
    font-size: 40px; line-height: 0.9;
    color: ${colors.ink};
    text-transform: uppercase;
  }

  /* Serial */
  .serial-block {}
  .serial-divider {
    height: 1px;
    background: rgba(20,33,46,0.15);
    margin-bottom: 10px;
  }
  .serial-text {
    font-family: ${fonts.mono};
    font-size: 12px; font-weight: 500;
    color: rgba(20,33,46,0.65);
    letter-spacing: 0.02em;
  }
</style>
</head>
<body>
<div class="card">

  <!-- Header: no gradient bar -->
  <div class="header">
    ${logoUri
      ? `<img src="${logoUri}" class="header-logo" alt="Ciclo Market" />`
      : `<span class="header-logo-text">Ciclo Market</span>`
    }
    ${category ? `<div class="pill">${escHtml(category)}</div>` : ''}
  </div>

  <!-- Hero -->
  <div class="hero">
    ${imageUrl
      ? `<img src="${escAttr(imageUrl)}" class="hero-img" alt="" />`
      : `<div class="hero-fallback">
          <svg width="80" height="80" viewBox="0 0 24 24" fill="none" stroke="rgba(255,255,255,0.06)" stroke-width="0.5">
            <circle cx="5.5" cy="17.5" r="3.5"/><circle cx="18.5" cy="17.5" r="3.5"/>
            <path d="M8 17.5h7M15 6l2 5.5M5.5 14l3-8 2.5 8"/><circle cx="12" cy="6" r="1"/>
          </svg>
        </div>`
    }
    <div class="hero-scrim"></div>
  </div>

  <!-- Content -->
  <div class="content">

    <div class="text-col">
      ${brand      ? `<span class="brand-name">${escHtml(brand)}</span>` : ''}
      ${drivetrain ? `<span class="drivetrain-line">${escHtml(drivetrain)}</span>` : ''}
      ${modelLine  ? `<span class="model-line">${escHtml(modelLine)}</span>` : ''}
      ${sellerName ? `<span class="seller-line">Publicado por ${escHtml(sellerName)}</span>` : ''}
    </div>

    <!-- Dossard: dorsal de carrera, rotado -2.5deg, solapa 100px sobre el hero -->
    <div class="dossard">
      <div class="sponsor-strip">
        <span class="sponsor-text">CICLO MARKET - El Marketplace de Ciclismo</span>
      </div>
      <div class="pin-row">
        <div class="pin-hole"></div>
        <div class="pin-hole"></div>
      </div>
      <div class="dossard-body">
        <div class="dossard-price">${escHtml(priceDisplay)}</div>
        ${size ? `
        <div class="talle-block">
          <span class="talle-label">Talle</span>
          <span class="talle-value">${escHtml(size)}</span>
        </div>` : ''}
        <div class="serial-block">
          <div class="serial-divider"></div>
          <span class="serial-text">${escHtml(serialLine)}</span>
        </div>
      </div>
    </div>

  </div>
</div>
</body>
</html>`
}

function escHtml(str) {
  return String(str ?? '').replace(/&/g,'&amp;').replace(/</g,'&lt;').replace(/>/g,'&gt;').replace(/"/g,'&quot;').replace(/'/g,'&#39;')
}
function escAttr(str) {
  return String(str ?? '').replace(/"/g,'&quot;').replace(/'/g,'&#39;')
}

module.exports = { renderTemplate }
