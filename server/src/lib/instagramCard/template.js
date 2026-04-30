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
    try {
      const data = fs.readFileSync(p)
      _logoDataUri = `data:${mime};base64,${data.toString('base64')}`
      return _logoDataUri
    } catch { /* next */ }
  }
  _logoDataUri = ''
  return _logoDataUri
}

// ── Adaptive price font-size ──────────────────────────────────────────────────
function priceClass(str) {
  const len = str.replace(/\s/g, '').length
  if (len <= 8)  return 'price-lg'
  if (len <= 11) return 'price-md'
  return 'price-sm'
}

// ── Template ──────────────────────────────────────────────────────────────────
function renderTemplate(data) {
  const title      = String(data.title      || '').trim()
  const brandName  = String(data.brand      || '').trim()
  const model      = String(data.model      || '').trim()
  const year       = data.year ? String(data.year) : null
  const category   = String(data.category   || '').trim()
  const price      = typeof data.price === 'number' ? data.price : Number(data.price)
  const currency   = String(data.currency   || 'ARS').toUpperCase()
  const sellerName = String(data.sellerName || '').trim()
  const imageUrl   = data.imageUrl || null

  const formattedPrice = price.toLocaleString('es-AR', { maximumFractionDigits: 0 })
  const priceDisplay   = currency === 'USD' ? `U$D ${formattedPrice}` : `$${formattedPrice}`
  const metaLine       = [brandName, model, year].filter(Boolean).join(' · ')
  const logoUri        = getLogoDataUri()
  const pc             = priceClass(priceDisplay)

  // Zone heights: accent(6) + hero(730) + content(614) = 1350
  const HERO_H    = 730
  const CONTENT_H = cfg.height - 6 - HERO_H   // 614

  // Spec grid always 4 cells (shows dash if missing)
  const specs = [
    { label: 'Marca',     value: brandName || '—' },
    { label: 'Modelo',    value: model     || '—' },
    { label: 'Año',       value: year      || '—' },
    { label: 'Categoría', value: category  || '—' },
  ]

  const heroFallback = `
    <div style="width:100%;height:100%;background:#1a2535;display:flex;align-items:center;justify-content:center;">
      <svg width="90" height="90" viewBox="0 0 24 24" fill="none" stroke="rgba(255,255,255,0.08)" stroke-width="0.6">
        <circle cx="5.5" cy="17.5" r="3.5"/>
        <circle cx="18.5" cy="17.5" r="3.5"/>
        <path d="M8 17.5h7M15 6l2 5.5M5.5 14l3-8 2.5 8"/>
        <circle cx="12" cy="6" r="1"/>
      </svg>
    </div>`

  return `<!DOCTYPE html>
<html>
<head>
<meta charset="utf-8">
<style>
  *, *::before, *::after { margin: 0; padding: 0; box-sizing: border-box; }

  html, body {
    width: 1080px;
    height: 1350px;
    overflow: hidden;
    background: #0B111A;
    font-family: 'Helvetica Neue', Helvetica, Arial, sans-serif;
    -webkit-font-smoothing: antialiased;
  }

  .card {
    width: 1080px;
    height: 1350px;
    overflow: hidden;
    display: flex;
    flex-direction: column;
    background: #0B111A;
  }

  /* ── 1. Accent bar ── */
  .accent-bar {
    flex: 0 0 6px;
    background: linear-gradient(90deg, #00BFFF 0%, #7C3AED 100%);
  }

  /* ── 2. Hero ── */
  .hero {
    flex: 0 0 ${HERO_H}px;
    position: relative;
    overflow: hidden;
    background: #1a2535;
  }
  .hero-img {
    width: 100%;
    height: 100%;
    object-fit: cover;
    display: block;
  }
  .hero-gradient {
    position: absolute;
    bottom: 0; left: 0; right: 0;
    height: 200px;
    background: linear-gradient(to bottom, transparent 0%, #0B111A 100%);
    pointer-events: none;
    z-index: 2;
  }
  .hero-logo {
    position: absolute;
    top: 44px;
    left: 52px;
    width: 150px;
    height: auto;
    object-fit: contain;
    z-index: 10;
    filter: drop-shadow(0 2px 12px rgba(0,0,0,0.6));
  }
  .hero-logo-text {
    position: absolute;
    top: 44px;
    left: 52px;
    font-size: 32px;
    font-weight: 800;
    color: #fff;
    z-index: 10;
    text-shadow: 0 2px 12px rgba(0,0,0,0.6);
  }
  .hero-logo-text span { color: #00BFFF; }
  .hero-pill {
    position: absolute;
    top: 44px;
    right: 52px;
    background: rgba(11,17,26,0.65);
    border: 1px solid rgba(255,255,255,0.18);
    border-radius: 999px;
    padding: 12px 26px;
    font-size: 22px;
    font-weight: 700;
    letter-spacing: 0.2px;
    color: #FFFFFF;
    z-index: 10;
    white-space: nowrap;
  }

  /* ── 3. Content ── */
  .content {
    flex: 0 0 ${CONTENT_H}px;
    display: flex;
    flex-direction: column;
    padding: 24px 52px 40px;
    background: #0B111A;
    overflow: hidden;
  }

  /* Brand row */
  .brand-row {
    display: flex;
    align-items: center;
    justify-content: space-between;
    margin-bottom: 10px;
    flex-shrink: 0;
  }
  .brand-chip {
    display: inline-flex;
    align-items: center;
    background: rgba(0,191,255,0.08);
    border: 1px solid rgba(0,191,255,0.32);
    border-radius: 8px;
    padding: 5px 14px;
    font-size: 15px;
    font-weight: 800;
    letter-spacing: 0.14em;
    text-transform: uppercase;
    color: #00BFFF;
    white-space: nowrap;
    max-width: 460px;
    overflow: hidden;
    text-overflow: ellipsis;
  }
  .site-url {
    font-size: 17px;
    font-weight: 500;
    color: rgba(148,163,184,0.55);
    white-space: nowrap;
  }

  /* Title */
  .title {
    font-family: 'Arial Black', Impact, 'Helvetica Neue', sans-serif;
    font-size: 56px;
    font-weight: 900;
    line-height: 1.06;
    letter-spacing: -0.02em;
    color: #FFFFFF;
    margin-bottom: 8px;
    display: -webkit-box;
    -webkit-line-clamp: 2;
    -webkit-box-orient: vertical;
    overflow: hidden;
    flex-shrink: 0;
  }

  /* Meta */
  .meta {
    font-size: 20px;
    font-weight: 400;
    color: #94A3B8;
    margin-bottom: 16px;
    white-space: nowrap;
    overflow: hidden;
    text-overflow: ellipsis;
    flex-shrink: 0;
  }

  /* Spec grid */
  .spec-grid {
    display: grid;
    grid-template-columns: repeat(4, 1fr);
    gap: 10px;
    margin-bottom: 18px;
    flex-shrink: 0;
  }
  .spec-card {
    background: rgba(255,255,255,0.035);
    border: 1px solid rgba(255,255,255,0.07);
    border-radius: 14px;
    padding: 11px 14px;
    display: flex;
    flex-direction: column;
    gap: 5px;
    overflow: hidden;
  }
  .spec-label {
    font-size: 10px;
    font-weight: 700;
    letter-spacing: 0.13em;
    text-transform: uppercase;
    color: #475569;
  }
  .spec-value {
    font-size: 16px;
    font-weight: 700;
    color: #CBD5E1;
    white-space: nowrap;
    overflow: hidden;
    text-overflow: ellipsis;
  }

  /* Price + Seller */
  .price-seller-row {
    display: flex;
    align-items: center;
    justify-content: space-between;
    gap: 20px;
    margin-bottom: 18px;
    flex-shrink: 0;
  }
  .price-block { flex-shrink: 0; }
  .price-label {
    font-size: 11px;
    font-weight: 700;
    letter-spacing: 0.18em;
    text-transform: uppercase;
    color: #475569;
    margin-bottom: 3px;
  }
  .price-value {
    font-family: 'Arial Black', Impact, sans-serif;
    font-weight: 900;
    color: #00BFFF;
    line-height: 1;
    letter-spacing: -0.02em;
    white-space: nowrap;
  }
  .price-lg { font-size: 64px; }
  .price-md { font-size: 54px; }
  .price-sm { font-size: 44px; }

  .seller-card {
    background: rgba(255,255,255,0.05);
    border: 1px solid rgba(255,255,255,0.09);
    border-radius: 18px;
    padding: 14px 20px;
    text-align: right;
    flex-shrink: 1;
    min-width: 0;
    max-width: 380px;
  }
  .seller-label {
    font-size: 11px;
    font-weight: 700;
    letter-spacing: 0.14em;
    text-transform: uppercase;
    color: #475569;
    margin-bottom: 4px;
  }
  .seller-name {
    font-size: 24px;
    font-weight: 700;
    color: #FFFFFF;
    white-space: nowrap;
    overflow: hidden;
    text-overflow: ellipsis;
  }

  /* Footer */
  .footer {
    border-top: 1px solid rgba(255,255,255,0.07);
    padding-top: 14px;
    display: flex;
    align-items: center;
    justify-content: space-between;
    flex-shrink: 0;
  }
  .footer-logo {
    height: 28px;
    width: auto;
    max-width: 160px;
    object-fit: contain;
    object-position: left center;
    display: block;
  }
  .footer-logo-text {
    font-size: 20px;
    font-weight: 700;
    color: rgba(148,163,184,0.7);
  }
  .footer-right { text-align: right; }
  .footer-tagline {
    display: block;
    font-size: 16px;
    font-weight: 500;
    color: rgba(148,163,184,0.65);
  }
  .footer-sub {
    display: block;
    font-size: 13px;
    color: rgba(148,163,184,0.35);
    margin-top: 2px;
  }
</style>
</head>
<body>
<div class="card">

  <!-- Accent bar -->
  <div class="accent-bar"></div>

  <!-- Hero -->
  <div class="hero">
    ${imageUrl ? `<img src="${escAttr(imageUrl)}" class="hero-img" alt="" />` : heroFallback}
    <div class="hero-gradient"></div>
    ${logoUri
      ? `<img src="${logoUri}" class="hero-logo" alt="Ciclo Market" />`
      : `<div class="hero-logo-text">ciclo<span>market</span>.ar</div>`
    }
    ${category ? `<div class="hero-pill">${escHtml(category)}</div>` : ''}
  </div>

  <!-- Content -->
  <div class="content">

    <!-- Brand row -->
    <div class="brand-row">
      ${brandName ? `<div class="brand-chip">${escHtml(brandName)}</div>` : '<div></div>'}
      <div class="site-url">www.ciclomarket.ar</div>
    </div>

    <!-- Title -->
    <div class="title">${escHtml(title)}</div>

    <!-- Meta line -->
    ${metaLine ? `<div class="meta">${escHtml(metaLine)}</div>` : ''}

    <!-- Spec grid -->
    <div class="spec-grid">
      ${specs.map(s => `
      <div class="spec-card">
        <div class="spec-label">${escHtml(s.label)}</div>
        <div class="spec-value">${escHtml(s.value)}</div>
      </div>`).join('')}
    </div>

    <!-- Price + Seller -->
    <div class="price-seller-row">
      <div class="price-block">
        <div class="price-label">Precio</div>
        <div class="price-value ${pc}">${escHtml(priceDisplay)}</div>
      </div>
      ${sellerName ? `
      <div class="seller-card">
        <div class="seller-label">Publicado por</div>
        <div class="seller-name">${escHtml(sellerName)}</div>
      </div>` : ''}
    </div>

    <!-- Footer -->
    <div class="footer">
      <span class="footer-logo-text">ciclomarket.ar</span>
      <div class="footer-right">
        <span class="footer-tagline">Marketplace de ciclismo</span>
        <span class="footer-sub">Comprá y vendé bicicletas en Argentina</span>
      </div>
    </div>

  </div>
</div>
</body>
</html>`
}

function escHtml(str) {
  return String(str ?? '')
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#39;')
}

function escAttr(str) {
  return String(str ?? '').replace(/"/g, '&quot;').replace(/'/g, '&#39;')
}

module.exports = { renderTemplate }
