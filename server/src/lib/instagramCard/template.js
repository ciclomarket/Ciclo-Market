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

// ── Adaptive price size ───────────────────────────────────────────────────────
function priceClass(str) {
  const len = str.replace(/\s/g, '').length
  if (len <= 8)  return 'price-xl'
  if (len <= 11) return 'price-lg'
  return 'price-md'
}

// ── Template ──────────────────────────────────────────────────────────────────
/**
 * @param {object} data
 * @param {string} data.title
 * @param {string} data.brand
 * @param {string} data.model
 * @param {number|null} data.year
 * @param {string} data.category
 * @param {number} data.price
 * @param {string} data.currency
 * @param {string} data.sellerName
 * @param {string|null} data.imageUrl
 * @param {string} [data.badge]   — micro-copy label above price
 */
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
  const badge      = String(data.badge || 'En venta').trim()

  const formattedPrice = price.toLocaleString('es-AR', { maximumFractionDigits: 0 })
  const priceDisplay   = currency === 'USD' ? `U$D ${formattedPrice}` : `$${formattedPrice}`
  const metaLine       = [brandName, model, year].filter(Boolean).join(' · ')
  const logoUri        = getLogoDataUri()
  const pc             = priceClass(priceDisplay)

  // Zones: accent(6) + hero(806) + content(538) = 1350
  const HERO_H    = 806
  const CONTENT_H = cfg.height - 6 - HERO_H  // 538

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

  /* ─ Accent bar ─ */
  .accent-bar {
    flex: 0 0 6px;
    background: linear-gradient(90deg, #00BFFF 0%, #7C3AED 100%);
  }

  /* ─ Hero ─ */
  .hero {
    flex: 0 0 ${HERO_H}px;
    position: relative;
    overflow: hidden;
    background: #111b27;
  }
  .hero-img {
    width: 100%;
    height: 100%;
    object-fit: cover;
    display: block;
  }
  .hero-fallback {
    width: 100%;
    height: 100%;
    display: flex;
    align-items: center;
    justify-content: center;
    background: #111b27;
  }
  /* Bottom scrim — blends hero into content */
  .hero-scrim {
    position: absolute;
    bottom: 0; left: 0; right: 0;
    height: 260px;
    background: linear-gradient(to bottom,
      transparent 0%,
      rgba(11,17,26,0.55) 45%,
      #0B111A 100%);
    pointer-events: none;
    z-index: 2;
  }
  /* Logo — top left, small, branding only */
  .hero-logo {
    position: absolute;
    top: 40px;
    left: 48px;
    width: 110px;
    height: auto;
    object-fit: contain;
    z-index: 10;
    opacity: 0.92;
    filter: drop-shadow(0 1px 8px rgba(0,0,0,0.5));
  }
  .hero-logo-text {
    position: absolute;
    top: 40px;
    left: 48px;
    font-size: 26px;
    font-weight: 800;
    color: rgba(255,255,255,0.9);
    z-index: 10;
    text-shadow: 0 1px 8px rgba(0,0,0,0.5);
  }
  .hero-logo-text span { color: #00BFFF; }
  /* Category pill — top right */
  .hero-pill {
    position: absolute;
    top: 40px;
    right: 48px;
    background: rgba(11,17,26,0.60);
    border: 1px solid rgba(255,255,255,0.16);
    border-radius: 999px;
    padding: 10px 24px;
    font-size: 20px;
    font-weight: 600;
    color: rgba(255,255,255,0.88);
    z-index: 10;
    white-space: nowrap;
    letter-spacing: 0.02em;
  }

  /* ─ Content ─ */
  .content {
    flex: 0 0 ${CONTENT_H}px;
    display: flex;
    flex-direction: column;
    padding: 0 52px 40px;
    background: #0B111A;
    overflow: hidden;
  }

  /* Price block — the visual anchor of content */
  .price-block {
    flex-shrink: 0;
    margin-bottom: 20px;
  }
  .price-badge {
    display: inline-flex;
    align-items: center;
    gap: 6px;
    margin-bottom: 6px;
  }
  .price-badge-dot {
    width: 6px;
    height: 6px;
    border-radius: 50%;
    background: #00BFFF;
    flex-shrink: 0;
  }
  .price-badge-text {
    font-size: 13px;
    font-weight: 700;
    letter-spacing: 0.15em;
    text-transform: uppercase;
    color: rgba(148,163,184,0.7);
  }
  .price-card {
    display: inline-flex;
    align-items: baseline;
    gap: 0;
    background: rgba(0,191,255,0.06);
    border: 1px solid rgba(0,191,255,0.18);
    border-radius: 18px;
    padding: 14px 28px 14px 24px;
  }
  .price-value {
    font-family: 'Arial Black', Impact, 'Helvetica Neue', sans-serif;
    font-weight: 900;
    color: #00BFFF;
    line-height: 1;
    letter-spacing: -0.025em;
    white-space: nowrap;
    text-shadow: 0 0 48px rgba(0,191,255,0.25);
  }
  .price-xl { font-size: 86px; }
  .price-lg { font-size: 70px; }
  .price-md { font-size: 56px; }

  /* Title */
  .title {
    font-family: 'Arial Black', Impact, 'Helvetica Neue', sans-serif;
    font-size: 52px;
    font-weight: 900;
    line-height: 1.06;
    letter-spacing: -0.02em;
    color: #FFFFFF;
    margin-bottom: 10px;
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
    color: #64748B;
    white-space: nowrap;
    overflow: hidden;
    text-overflow: ellipsis;
    flex-shrink: 0;
  }

  /* Spacer */
  .spacer { flex: 1; min-height: 8px; }

  /* Seller row */
  .seller-row {
    display: flex;
    align-items: center;
    gap: 10px;
    margin-bottom: 16px;
    flex-shrink: 0;
    overflow: hidden;
  }
  .seller-avatar {
    width: 36px;
    height: 36px;
    border-radius: 50%;
    background: rgba(255,255,255,0.08);
    border: 1px solid rgba(255,255,255,0.10);
    flex-shrink: 0;
    display: flex;
    align-items: center;
    justify-content: center;
  }
  .seller-avatar svg { opacity: 0.5; }
  .seller-text { overflow: hidden; }
  .seller-label {
    font-size: 12px;
    font-weight: 600;
    letter-spacing: 0.12em;
    text-transform: uppercase;
    color: #475569;
    margin-bottom: 1px;
  }
  .seller-name {
    font-size: 20px;
    font-weight: 700;
    color: #CBD5E1;
    white-space: nowrap;
    overflow: hidden;
    text-overflow: ellipsis;
  }

  /* Footer */
  .footer {
    display: flex;
    align-items: center;
    justify-content: space-between;
    border-top: 1px solid rgba(255,255,255,0.06);
    padding-top: 14px;
    flex-shrink: 0;
  }
  .footer-left {
    font-size: 18px;
    font-weight: 700;
    color: rgba(148,163,184,0.5);
    letter-spacing: -0.01em;
  }
  .footer-right {
    font-size: 14px;
    color: rgba(148,163,184,0.3);
  }
</style>
</head>
<body>
<div class="card">

  <div class="accent-bar"></div>

  <!-- Hero: bike photo fills this zone -->
  <div class="hero">
    ${imageUrl
      ? `<img src="${escAttr(imageUrl)}" class="hero-img" alt="" />`
      : `<div class="hero-fallback">
          <svg width="80" height="80" viewBox="0 0 24 24" fill="none" stroke="rgba(255,255,255,0.06)" stroke-width="0.6">
            <circle cx="5.5" cy="17.5" r="3.5"/>
            <circle cx="18.5" cy="17.5" r="3.5"/>
            <path d="M8 17.5h7M15 6l2 5.5M5.5 14l3-8 2.5 8"/>
            <circle cx="12" cy="6" r="1"/>
          </svg>
        </div>`
    }
    <div class="hero-scrim"></div>
    ${logoUri
      ? `<img src="${logoUri}" class="hero-logo" alt="Ciclo Market" />`
      : `<div class="hero-logo-text">ciclo<span>market</span>.ar</div>`
    }
    ${category ? `<div class="hero-pill">${escHtml(category)}</div>` : ''}
  </div>

  <!-- Content: price → title → seller → footer -->
  <div class="content">

    <!-- Price — visual anchor -->
    <div class="price-block">
      <div class="price-badge">
        <div class="price-badge-dot"></div>
        <span class="price-badge-text">${escHtml(badge)}</span>
      </div>
      <div class="price-card">
        <span class="price-value ${pc}">${escHtml(priceDisplay)}</span>
      </div>
    </div>

    <!-- Title -->
    <div class="title">${escHtml(title)}</div>

    <!-- Meta -->
    ${metaLine ? `<div class="meta">${escHtml(metaLine)}</div>` : ''}

    <div class="spacer"></div>

    <!-- Seller -->
    ${sellerName ? `
    <div class="seller-row">
      <div class="seller-avatar">
        <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="white" stroke-width="1.5">
          <path d="M20 21v-2a4 4 0 0 0-4-4H8a4 4 0 0 0-4 4v2"/>
          <circle cx="12" cy="7" r="4"/>
        </svg>
      </div>
      <div class="seller-text">
        <div class="seller-label">Publicado por</div>
        <div class="seller-name">${escHtml(sellerName)}</div>
      </div>
    </div>` : ''}

    <!-- Footer -->
    <div class="footer">
      <span class="footer-left">ciclomarket.ar</span>
      <span class="footer-right">Marketplace de ciclismo</span>
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
