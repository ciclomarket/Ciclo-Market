'use strict'

const fs   = require('fs')
const path = require('path')
const cfg  = require('./config')

// ── Logo (loaded once at module init) ────────────────────────────────────────
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

// Brand name: calibrated for 612px content width with Archivo Black ~0.60em/char
function brandFontSize(brand) {
  const len = String(brand || '').length
  if (len <= 7)  return '96px'   // BIANCHI, TREK, CANYON
  if (len <= 11) return '80px'   // CANNONDALE, SPECIALIZED
  if (len <= 15) return '68px'   // SANTA CRUZ BIKES
  return '56px'
}

// Dossard price: calibrated for 280px usable width (320px dossard - 40px padding)
// Archivo Black: letters ~0.68em, digits ~0.58em, space ~0.30em
function dossardPriceFontSize(str) {
  const len = str.replace(/\s/g, '').length
  if (len <= 6)  return '64px'   // $9.500 (6) · $850.000 (7 → tier below)
  if (len <= 8)  return '52px'   // U$D9.500 (8), $850.000 (7)
  if (len <= 11) return '44px'   // $8.500.000 (10), U$D12.000 (10)
  return '36px'
}

// ── Template ──────────────────────────────────────────────────────────────────
/**
 * @param {object} data
 * @param {string} data.title
 * @param {string} data.brand
 * @param {string} data.model
 * @param {number|null} data.year
 * @param {string} data.category
 * @param {string|null} data.condition
 * @param {string|null} data.size      — talle / frame_size
 * @param {number} data.price
 * @param {string} data.currency
 * @param {string|null} data.imageUrl
 */
function renderTemplate(data) {
  const { colors, fonts } = cfg

  const brand    = String(data.brand    || '').trim()
  const model    = String(data.model    || '').trim()
  const year     = data.year    ? String(data.year)    : null
  const category = String(data.category || '').trim()
  const condition = data.condition ? String(data.condition).trim() : null
  const size     = data.size    ? String(data.size).trim()     : null
  const currency = String(data.currency || 'ARS').toUpperCase()
  const price    = typeof data.price === 'number' ? data.price : Number(data.price)
  const imageUrl = data.imageUrl || null

  const priceDisplay  = formatPrice(currency, price)
  const brandSize     = brandFontSize(brand)
  const dossardPxSize = dossardPriceFontSize(priceDisplay)
  const logoUri       = getLogoDataUri()

  // Pill: condition if available, else category
  const pillText = condition || category || null

  // Model line: model · year (no brand duplication)
  const modelLine = [model, year].filter(Boolean).join(' · ')

  // Dossard meta rows (only real data)
  const metaItems = []
  if (size) metaItems.push({ label: 'TALLE', value: size })
  if (year)  metaItems.push({ label: 'AÑO',   value: year })

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
<link href="https://fonts.googleapis.com/css2?family=Archivo+Black&family=Inter:wght@400;500;600&display=swap" rel="stylesheet">
<style>
  *, *::before, *::after { margin: 0; padding: 0; box-sizing: border-box; }
  html, body {
    width: 1080px; height: 1350px; overflow: hidden;
    background: ${colors.background};
    font-family: ${fonts.body};
    -webkit-font-smoothing: antialiased;
    text-rendering: optimizeLegibility;
  }

  /* ── Root canvas ── */
  .card {
    width: 1080px; height: 1350px; overflow: hidden;
    display: flex; flex-direction: column;
    background: ${colors.background};
  }

  /* ── Header (80px) ── */
  .header {
    flex: 0 0 ${HEADER_H}px;
    display: flex; flex-direction: column;
    background: ${colors.background};
  }
  .accent-bar {
    flex: 0 0 5px;
    background: linear-gradient(90deg, ${colors.accent} 0%, ${colors.accentSecondary} 100%);
  }
  .header-inner {
    flex: 1;
    display: flex; align-items: center; justify-content: space-between;
    padding: 0 28px;
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
    border-radius: 999px;
    padding: 8px 18px;
    font-family: ${fonts.body};
    font-size: 13px; font-weight: 600;
    letter-spacing: 0.14em; text-transform: uppercase;
    color: ${colors.text};
    white-space: nowrap;
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
  /* Subtle bottom scrim — only 120px, just enough to anchor dossard */
  .hero-scrim {
    position: absolute; bottom: 0; left: 0; right: 0; height: 120px;
    background: linear-gradient(to top, rgba(20,33,46,0.85) 0%, rgba(20,33,46,0) 100%);
    pointer-events: none; z-index: 1;
  }

  /* ── Content (370px) ── */
  .content {
    flex: 0 0 ${CONTENT_H}px;
    position: relative;
    overflow: visible;           /* allow dossard to overlap hero above */
    background: ${colors.background};
    display: flex;
    align-items: flex-end;       /* text sits at bottom */
    padding: 32px 56px 48px;
  }

  /* Left column: brand name + model */
  .text-col {
    flex: 1;
    min-width: 0;
    padding-right: 356px;        /* 320px dossard + 36px gap */
  }
  .brand-name {
    font-family: ${fonts.display};
    font-weight: 700;
    font-size: ${brandSize};
    line-height: 0.9;
    letter-spacing: -0.03em;
    color: ${colors.text};
    text-transform: uppercase;
    white-space: nowrap;
    overflow: hidden;
    text-overflow: ellipsis;
    display: block;
    margin-bottom: 14px;
  }
  .model-name {
    font-family: ${fonts.body};
    font-size: 32px;
    font-weight: 500;
    color: ${colors.textMuted};
    white-space: nowrap;
    overflow: hidden;
    text-overflow: ellipsis;
    display: block;
    line-height: 1.2;
  }

  /* ── Dossard ── */
  .dossard {
    position: absolute;
    top: -100px;           /* overlap 100px into the hero */
    right: 56px;
    width: 320px;
    height: 380px;
    background: ${colors.paper};
    border-radius: 6px;
    box-shadow: 0 12px 40px rgba(0,0,0,0.45), 0 2px 8px rgba(0,0,0,0.25);
    overflow: visible;
    z-index: 10;
  }

  /* Top band with pin holes */
  .dossard-band {
    position: relative;
    height: 28px;
    background: ${colors.ink};
    border-radius: 6px 6px 0 0;
    display: flex; align-items: center; justify-content: space-between;
    padding: 0 28px;
  }
  .pin-hole {
    width: 14px; height: 14px;
    border-radius: 50%;
    background: ${colors.paper};
  }

  /* Dossard body */
  .dossard-body {
    padding: 18px 20px 18px;
    display: flex; flex-direction: column;
    height: calc(100% - 28px);
  }
  .dossard-price-label {
    font-family: ${fonts.body};
    font-size: 13px; font-weight: 600;
    letter-spacing: 0.18em; text-transform: uppercase;
    color: ${colors.inkMuted};
    margin-bottom: 6px;
    flex-shrink: 0;
  }
  .dossard-price {
    font-family: ${fonts.display};
    font-size: ${dossardPxSize};
    font-weight: 800;
    color: ${colors.ink};
    line-height: 1;
    letter-spacing: -0.02em;
    white-space: nowrap;
    overflow: hidden;
    flex-shrink: 0;
  }

  /* Divider + meta */
  .dossard-divider {
    height: 1px;
    background: rgba(20,33,46,0.15);
    margin: 14px 0 12px;
    flex-shrink: 0;
  }
  .dossard-meta {
    display: flex; flex-direction: column; gap: 5px;
    flex-shrink: 0;
  }
  .meta-row {
    display: flex; align-items: baseline; gap: 8px;
  }
  .meta-label {
    font-family: ${fonts.body};
    font-size: 10px; font-weight: 600;
    letter-spacing: 0.16em; text-transform: uppercase;
    color: ${colors.inkMuted};
  }
  .meta-value {
    font-family: ${fonts.body};
    font-size: 14px; font-weight: 600;
    color: ${colors.ink};
  }

  /* Registration corner marks (bottom corners of dossard body) */
  .reg {
    position: absolute;
    width: 12px; height: 12px;
  }
  .reg::before, .reg::after {
    content: ''; position: absolute; background: ${colors.inkFaint};
  }
  .reg::before { width: 1.5px; height: 100%; left: 50%; transform: translateX(-50%); }
  .reg::after  { height: 1.5px; width: 100%; top: 50%;  transform: translateY(-50%); }
  .reg-bl { bottom: 10px; left: 10px; }
  .reg-br { bottom: 10px; right: 10px; }
</style>
</head>
<body>
<div class="card">

  <!-- Header -->
  <div class="header">
    <div class="accent-bar"></div>
    <div class="header-inner">
      ${logoUri
        ? `<img src="${logoUri}" class="header-logo" alt="Ciclo Market" />`
        : `<span class="header-logo-text">Ciclo Market</span>`
      }
      ${pillText ? `<div class="pill">${escHtml(pillText)}</div>` : ''}
    </div>
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

  <!-- Content: brand/model + dossard -->
  <div class="content">

    <div class="text-col">
      ${brand ? `<span class="brand-name">${escHtml(brand)}</span>` : ''}
      ${modelLine ? `<span class="model-name">${escHtml(modelLine)}</span>` : ''}
    </div>

    <!-- Dossard — positioned absolute, overlaps hero by 100px -->
    <div class="dossard">
      <div class="dossard-band">
        <div class="pin-hole"></div>
        <div class="pin-hole"></div>
      </div>
      <div class="dossard-body">
        <div class="dossard-price-label">Precio</div>
        <div class="dossard-price">${escHtml(priceDisplay)}</div>
        ${metaItems.length > 0 ? `
        <div class="dossard-divider"></div>
        <div class="dossard-meta">
          ${metaItems.map(m => `
          <div class="meta-row">
            <span class="meta-label">${escHtml(m.label)}</span>
            <span class="meta-value">${escHtml(m.value)}</span>
          </div>`).join('')}
        </div>` : ''}
      </div>
      <!-- Register corner marks -->
      <div class="reg reg-bl"></div>
      <div class="reg reg-br"></div>
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
