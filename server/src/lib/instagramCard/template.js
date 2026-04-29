'use strict'

const cfg = require('./config')

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

  const title = String(data.title || '').trim()
  const brandName = String(data.brand || '').trim()
  const model = String(data.model || '').trim()
  const year = data.year ? String(data.year) : null
  const category = String(data.category || '').trim()
  const price = typeof data.price === 'number' ? data.price : Number(data.price)
  const currency = String(data.currency || 'ARS').toUpperCase()
  const sellerName = String(data.sellerName || '').trim()
  const imageUrl = data.imageUrl || null

  const formattedPrice = price.toLocaleString('es-AR', { maximumFractionDigits: 0 })
  const priceDisplay = currency === 'USD' ? `U$D ${formattedPrice}` : `$${formattedPrice}`
  const subtitle = [brandName, model, year].filter(Boolean).join(' · ')

  return `<!DOCTYPE html>
<html>
<head>
<meta charset="utf-8">
<style>
  * { margin: 0; padding: 0; box-sizing: border-box; }
  html, body {
    width: ${width}px;
    height: ${height}px;
    overflow: hidden;
    background: ${colors.background};
    font-family: ${fonts.body};
    -webkit-font-smoothing: antialiased;
  }
  .card {
    position: relative;
    width: ${width}px;
    height: ${height}px;
    background: ${colors.background};
    display: flex;
    flex-direction: column;
    overflow: hidden;
  }

  /* ── Top bar ── */
  .top-bar {
    position: relative;
    z-index: 10;
    display: flex;
    align-items: center;
    justify-content: space-between;
    padding: 48px 64px 32px;
  }
  .brand-name {
    font-family: ${fonts.body};
    font-weight: 800;
    font-size: 36px;
    letter-spacing: -0.5px;
    color: ${colors.text};
  }
  .brand-name span {
    color: ${colors.accent};
  }
  .category-pill {
    background: ${colors.categoryBg};
    border: 1px solid rgba(255,255,255,0.12);
    border-radius: 999px;
    padding: 10px 28px;
    font-size: 26px;
    font-weight: 600;
    color: ${colors.categoryText};
    letter-spacing: 0.3px;
    backdrop-filter: blur(8px);
  }

  /* ── Image area ── */
  .image-wrap {
    position: relative;
    flex: 1;
    overflow: hidden;
    margin: 0 0 0 0;
  }
  .image-wrap img {
    width: 100%;
    height: 100%;
    object-fit: cover;
    display: block;
  }
  .image-fallback {
    width: 100%;
    height: 100%;
    background: ${colors.imageFallback};
    display: flex;
    align-items: center;
    justify-content: center;
  }
  .image-fallback svg {
    opacity: 0.15;
  }
  /* gradient overlay at bottom of image */
  .image-wrap::after {
    content: '';
    position: absolute;
    bottom: 0;
    left: 0;
    right: 0;
    height: 55%;
    background: linear-gradient(
      to bottom,
      transparent 0%,
      rgba(11,17,26,0.4) 30%,
      rgba(11,17,26,0.85) 65%,
      rgba(11,17,26,0.97) 90%,
      ${colors.background} 100%
    );
    pointer-events: none;
  }

  /* ── Bottom info panel (overlaid on image gradient) ── */
  .info-panel {
    position: absolute;
    bottom: 0;
    left: 0;
    right: 0;
    padding: 0 64px 56px;
    z-index: 5;
  }
  .title-text {
    font-family: ${fonts.title};
    font-size: 62px;
    font-weight: 900;
    line-height: 1.1;
    color: ${colors.text};
    letter-spacing: -1.5px;
    margin-bottom: 16px;
    /* clamp to 2 lines */
    display: -webkit-box;
    -webkit-line-clamp: 2;
    -webkit-box-orient: vertical;
    overflow: hidden;
  }
  .subtitle {
    font-size: 30px;
    font-weight: 500;
    color: ${colors.textMuted};
    margin-bottom: 36px;
    letter-spacing: 0.2px;
  }
  .price-row {
    display: flex;
    align-items: center;
    justify-content: space-between;
    gap: 24px;
  }
  .price-badge {
    display: inline-flex;
    align-items: center;
    background: ${colors.priceBg};
    color: ${colors.priceText};
    font-family: ${fonts.price};
    font-size: 72px;
    font-weight: 900;
    line-height: 1;
    letter-spacing: -2px;
    padding: 18px 44px;
    border-radius: 18px;
  }
  .seller-info {
    text-align: right;
    flex-shrink: 0;
    max-width: 340px;
  }
  .seller-label {
    font-size: 22px;
    color: ${colors.textMuted};
    margin-bottom: 4px;
  }
  .seller-name {
    font-size: 30px;
    font-weight: 700;
    color: ${colors.text};
    white-space: nowrap;
    overflow: hidden;
    text-overflow: ellipsis;
    max-width: 300px;
  }

  /* ── Divider + footer ── */
  .footer {
    position: absolute;
    bottom: 0;
    left: 0;
    right: 0;
    padding: 0 64px 32px;
    display: flex;
    align-items: center;
    justify-content: space-between;
    z-index: 6;
    border-top: 1px solid ${colors.divider};
    margin-top: 32px;
    padding-top: 28px;
    background: ${colors.background};
  }

  /* ── Accent line at top ── */
  .accent-line {
    position: absolute;
    top: 0;
    left: 0;
    right: 0;
    height: 6px;
    background: linear-gradient(90deg, ${colors.accent} 0%, ${colors.accentSecondary} 60%, ${colors.accent} 100%);
    z-index: 20;
  }

  /* ── Watermark on image ── */
  .watermark {
    position: absolute;
    top: 50%;
    left: 50%;
    transform: translate(-50%, -50%) rotate(-25deg);
    font-size: 48px;
    font-weight: 900;
    color: ${colors.watermarkText};
    white-space: nowrap;
    pointer-events: none;
    z-index: 3;
    letter-spacing: 2px;
    text-transform: uppercase;
  }
</style>
</head>
<body>
<div class="card">
  <div class="accent-line"></div>

  <!-- Top bar -->
  <div class="top-bar">
    <div class="brand-name">ciclo<span>market</span>.ar</div>
    ${category ? `<div class="category-pill">${escHtml(category)}</div>` : ''}
  </div>

  <!-- Image -->
  <div class="image-wrap">
    ${imageUrl
      ? `<img src="${escAttr(imageUrl)}" alt="" />`
      : `<div class="image-fallback">
          <svg width="200" height="200" viewBox="0 0 24 24" fill="none" stroke="white" stroke-width="1">
            <rect x="3" y="3" width="18" height="18" rx="2" ry="2"/>
            <circle cx="8.5" cy="8.5" r="1.5"/>
            <polyline points="21 15 16 10 5 21"/>
          </svg>
        </div>`
    }
    <div class="watermark">ciclomarket.ar</div>
  </div>

  <!-- Info panel overlaid on gradient -->
  <div class="info-panel">
    <div class="title-text">${escHtml(title)}</div>
    ${subtitle ? `<div class="subtitle">${escHtml(subtitle)}</div>` : ''}
    <div class="price-row">
      <div class="price-badge">${escHtml(priceDisplay)}</div>
      ${sellerName ? `
      <div class="seller-info">
        <div class="seller-label">Vendido por</div>
        <div class="seller-name">${escHtml(sellerName)}</div>
      </div>` : ''}
    </div>
  </div>

  <!-- Footer -->
  <div class="footer">
    <div style="font-size:24px; color:${colors.textMuted}; font-weight:500;">ciclomarket.ar</div>
    <div style="font-size:24px; color:${colors.textMuted};">${brand.tagline}</div>
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
