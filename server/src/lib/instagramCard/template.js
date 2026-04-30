'use strict'

const fs = require('fs')
const path = require('path')
const cfg = require('./config')

// ── Logo: loaded once at module init, embedded as data URI ───────────────────
let _logoDataUri = null
function getLogoDataUri() {
  if (_logoDataUri !== null) return _logoDataUri
  const candidates = [
    path.join(__dirname, 'assets', 'site-logo.webp'),
    path.join(process.cwd(), 'public', 'site-logo.webp'),
  ]
  for (const p of candidates) {
    try {
      const data = fs.readFileSync(p)
      _logoDataUri = `data:image/webp;base64,${data.toString('base64')}`
      return _logoDataUri
    } catch { /* try next */ }
  }
  _logoDataUri = '' // no logo found — fall back to text
  return _logoDataUri
}

// ── Adaptive price font size ─────────────────────────────────────────────────
function priceFontSize(str) {
  const len = str.replace(/[\s]/g, '').length
  if (len <= 8)  return '64px'
  if (len <= 11) return '52px'
  return '44px'
}

/**
 * @param {object} data
 * @param {string} data.title
 * @param {string} data.brand
 * @param {string} data.model
 * @param {number|null} data.year
 * @param {string} data.category
 * @param {number} data.price
 * @param {string} data.currency   'ARS' | 'USD'
 * @param {string} data.sellerName
 * @param {string|null} data.imageUrl
 * @returns {string} full HTML document
 */
function renderTemplate(data) {
  const { width, height, colors, fonts, brand } = cfg

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
  const priceSize      = priceFontSize(priceDisplay)

  // ── Zone heights (must sum to ${height}px) ─────────────────────────────
  // header: 80px  |  hero: 760px  |  content: 510px  =  1350px
  const HEADER_H  = 80
  const HERO_H    = 760
  const CONTENT_H = height - HEADER_H - HERO_H   // 510px

  return `<!DOCTYPE html>
<html>
<head>
<meta charset="utf-8">
<style>
  *, *::before, *::after { margin: 0; padding: 0; box-sizing: border-box; }

  html, body {
    width: ${width}px;
    height: ${height}px;
    overflow: hidden;
    background: ${colors.background};
    font-family: ${fonts.body};
    -webkit-font-smoothing: antialiased;
  }

  /* ── Root canvas ── */
  .card {
    width: ${width}px;
    height: ${height}px;
    overflow: hidden;
    display: flex;
    flex-direction: column;
    background: ${colors.background};
    position: relative;
  }

  /* ── Accent bar (top edge) ── */
  .accent-bar {
    position: absolute;
    top: 0; left: 0; right: 0;
    height: 5px;
    background: linear-gradient(90deg, ${colors.accent} 0%, ${colors.accentSecondary} 55%, ${colors.accent} 100%);
    z-index: 20;
  }

  /* ── Zone 1: Header (80px) ── */
  .header {
    flex: 0 0 ${HEADER_H}px;
    display: flex;
    align-items: center;
    justify-content: space-between;
    padding: 0 52px;
    background: ${colors.background};
    z-index: 10;
  }
  .header-logo {
    height: 34px;
    width: auto;
    display: block;
    object-fit: contain;
    object-position: left center;
  }
  .header-logo-text {
    font-size: 28px;
    font-weight: 800;
    color: ${colors.text};
    letter-spacing: -0.3px;
  }
  .header-logo-text span { color: ${colors.accent}; }
  .cat-pill {
    background: rgba(255,255,255,0.08);
    border: 1px solid rgba(255,255,255,0.14);
    border-radius: 999px;
    padding: 8px 24px;
    font-size: 22px;
    font-weight: 600;
    color: ${colors.categoryText};
    letter-spacing: 0.2px;
    white-space: nowrap;
  }

  /* ── Zone 2: Hero image (760px) ── */
  .hero {
    flex: 0 0 ${HERO_H}px;
    overflow: hidden;
    position: relative;
    background: ${colors.imageFallback};
  }
  .hero img {
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
  }
  /* Subtle bottom scrim so content area blends cleanly */
  .hero::after {
    content: '';
    position: absolute;
    bottom: 0; left: 0; right: 0;
    height: 80px;
    background: linear-gradient(to bottom, transparent 0%, ${colors.background} 100%);
    pointer-events: none;
  }

  /* ── Zone 3: Content area (510px) ── */
  .content {
    flex: 0 0 ${CONTENT_H}px;
    display: flex;
    flex-direction: column;
    padding: 24px 52px 44px;
    background: ${colors.background};
    overflow: hidden;
  }

  /* brand chip */
  .brand-chip {
    display: inline-flex;
    align-items: center;
    align-self: flex-start;
    background: ${colors.accent}18;
    border: 1px solid ${colors.accent}40;
    border-radius: 6px;
    padding: 4px 14px;
    font-size: 18px;
    font-weight: 700;
    letter-spacing: 0.12em;
    text-transform: uppercase;
    color: ${colors.accent};
    margin-bottom: 10px;
    white-space: nowrap;
    max-width: 100%;
    overflow: hidden;
    text-overflow: ellipsis;
  }

  /* title */
  .title {
    font-family: ${fonts.title};
    font-size: 58px;
    font-weight: 700;
    line-height: 1.05;
    letter-spacing: -0.02em;
    color: ${colors.text};
    margin-bottom: 10px;
    display: -webkit-box;
    -webkit-line-clamp: 2;
    -webkit-box-orient: vertical;
    overflow: hidden;
  }

  /* meta line */
  .meta {
    font-size: 20px;
    font-weight: 500;
    color: ${colors.textMuted};
    white-space: nowrap;
    overflow: hidden;
    text-overflow: ellipsis;
  }

  /* spacer pushes bottom block down */
  .spacer { flex: 1; min-height: 12px; }

  /* price + seller row */
  .bottom-block {
    display: flex;
    flex-direction: column;
    gap: 0;
  }

  .price-seller-row {
    display: flex;
    align-items: flex-end;
    justify-content: space-between;
    gap: 16px;
    margin-bottom: 20px;
  }

  .price-block { flex-shrink: 0; }
  .price-label {
    font-size: 13px;
    font-weight: 600;
    letter-spacing: 0.16em;
    text-transform: uppercase;
    color: ${colors.textMuted};
    margin-bottom: 4px;
  }
  .price-value {
    font-family: ${fonts.price};
    font-size: ${priceSize};
    font-weight: 900;
    line-height: 1;
    letter-spacing: -0.03em;
    color: ${colors.accent};
    white-space: nowrap;
  }

  .seller-block {
    text-align: right;
    flex-shrink: 1;
    min-width: 0;
  }
  .seller-label {
    font-size: 13px;
    font-weight: 600;
    letter-spacing: 0.14em;
    text-transform: uppercase;
    color: ${colors.textMuted};
    margin-bottom: 4px;
  }
  .seller-name {
    font-size: 24px;
    font-weight: 700;
    color: ${colors.text};
    white-space: nowrap;
    overflow: hidden;
    text-overflow: ellipsis;
    max-width: 340px;
  }

  /* footer strip */
  .footer {
    display: flex;
    align-items: center;
    justify-content: space-between;
    border-top: 1px solid rgba(255,255,255,0.10);
    padding-top: 16px;
  }
  .footer-logo {
    height: 26px;
    width: auto;
    object-fit: contain;
    object-position: left center;
    display: block;
  }
  .footer-logo-text {
    font-size: 18px;
    font-weight: 700;
    color: ${colors.textMuted};
    letter-spacing: -0.2px;
  }
  .footer-tagline {
    font-size: 16px;
    font-weight: 400;
    color: rgba(148,163,184,0.6);
  }
</style>
</head>
<body>
<div class="card">
  <div class="accent-bar"></div>

  <!-- Zone 1: Header -->
  <div class="header">
    ${logoUri
      ? `<img src="${logoUri}" class="header-logo" alt="Ciclo Market" />`
      : `<div class="header-logo-text">ciclo<span>market</span>.ar</div>`
    }
    ${category ? `<div class="cat-pill">${escHtml(category)}</div>` : ''}
  </div>

  <!-- Zone 2: Hero photo — no watermark, no overlays on the image itself -->
  <div class="hero">
    ${imageUrl
      ? `<img src="${escAttr(imageUrl)}" alt="" />`
      : `<div class="hero-fallback">
          <svg width="120" height="120" viewBox="0 0 24 24" fill="none" stroke="rgba(255,255,255,0.12)" stroke-width="0.8">
            <circle cx="5.5" cy="17.5" r="3.5"/><circle cx="18.5" cy="17.5" r="3.5"/>
            <path d="M8 17.5h7M15 6l2 5.5M5.5 14l3-8 2.5 8"/><circle cx="12" cy="6" r="1"/>
          </svg>
        </div>`
    }
  </div>

  <!-- Zone 3: Content -->
  <div class="content">
    ${brandName ? `<div class="brand-chip">${escHtml(brandName)}</div>` : ''}
    <div class="title">${escHtml(title)}</div>
    ${metaLine ? `<div class="meta">${escHtml(metaLine)}</div>` : ''}

    <div class="spacer"></div>

    <div class="bottom-block">
      <div class="price-seller-row">
        <div class="price-block">
          <div class="price-label">Precio</div>
          <div class="price-value">${escHtml(priceDisplay)}</div>
        </div>
        ${sellerName ? `
        <div class="seller-block">
          <div class="seller-label">Vendido por</div>
          <div class="seller-name">${escHtml(sellerName)}</div>
        </div>` : ''}
      </div>

      <div class="footer">
        ${logoUri
          ? `<img src="${logoUri}" class="footer-logo" alt="Ciclo Market" />`
          : `<span class="footer-logo-text">ciclomarket.ar</span>`
        }
        <span class="footer-tagline">${escHtml(brand.tagline)}</span>
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
