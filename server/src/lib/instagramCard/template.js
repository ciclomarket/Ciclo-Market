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
  const formatted = n.toLocaleString('es-AR', { maximumFractionDigits: 0 })
  return currency === 'USD' ? `U$D ${formatted}` : `$${formatted}`
}

function getPriceClass(str) {
  const len = str.replace(/\s/g, '').length
  if (len <= 8)  return 'price-xl'
  if (len <= 11) return 'price-lg'
  return 'price-md'
}

function renderStars(avg, count) {
  if (!count || !avg) return ''
  const full  = Math.round(avg)
  const stars = '★'.repeat(Math.min(full, 5)) + '☆'.repeat(Math.max(0, 5 - full))
  return `<span class="stars">${stars}</span><span class="review-count">(${count})</span>`
}

function trustLabelText(level) {
  switch (level) {
    case 'verified':  return 'Vendedor verificado'
    case 'pro':       return 'Vendedor Pro'
    case 'semi_pro':  return 'Perfil completo'
    default:          return null
  }
}

// ── Template ──────────────────────────────────────────────────────────────────
function renderTemplate(data) {
  const title        = String(data.title      || '').trim()
  const brandName    = String(data.brand      || '').trim()
  const model        = String(data.model      || '').trim()
  const year         = data.year ? String(data.year) : null
  const category     = String(data.category   || '').trim()
  const currency     = String(data.currency   || 'ARS').toUpperCase()
  const price        = typeof data.price === 'number' ? data.price : Number(data.price)
  const sellerName   = String(data.sellerName || '').trim()
  const imageUrl     = data.imageUrl || null

  // Enriched fields
  const publishedLabel = data.publishedLabel || null
  const isFeatured     = Boolean(data.isFeatured)
  const isOpportunity  = Boolean(data.isOpportunity)
  const sellerVerified = Boolean(data.sellerVerified)
  const avatarUri      = data.sellerAvatarUri || null
  const reviewCount    = Number(data.sellerReviewCount) || 0
  const reviewAvg      = Number(data.sellerReviewAvg)   || 0
  const trustLevel     = String(data.trustLevel || 'basic')

  const priceDisplay = formatPrice(currency, price)
  const pc           = getPriceClass(priceDisplay)
  const metaLine     = [brandName, model, year].filter(Boolean).join(' · ')
  const logoUri      = getLogoDataUri()
  const trustText    = trustLabelText(trustLevel)

  // Selling-point items (right side of price card) — only real data
  const sellingPoints = []
  if (publishedLabel)
    sellingPoints.push({ icon: '📅', title: publishedLabel, sub: 'Lista para rodar' })
  if (isFeatured)
    sellingPoints.push({ icon: '⭐', title: 'Publicación destacada', sub: 'Mayor visibilidad' })
  if (isOpportunity)
    sellingPoints.push({ icon: '🔥', title: 'Oportunidad', sub: 'Precio competitivo' })
  if (sellerVerified)
    sellingPoints.push({ icon: '✓', title: 'Vendedor verificado', sub: 'Identidad confirmada' })

  // Zone heights: accent(6) + hero(700) + content(644) = 1350
  const HERO_H    = 700
  const CONTENT_H = cfg.height - 6 - HERO_H

  return `<!DOCTYPE html>
<html>
<head>
<meta charset="utf-8">
<style>
  *, *::before, *::after { margin: 0; padding: 0; box-sizing: border-box; }
  html, body {
    width: 1080px; height: 1350px; overflow: hidden;
    background: #0B111A;
    font-family: 'Helvetica Neue', Helvetica, Arial, sans-serif;
    -webkit-font-smoothing: antialiased;
  }
  .card { width: 1080px; height: 1350px; overflow: hidden; display: flex; flex-direction: column; background: #0B111A; }

  /* Accent bar */
  .accent-bar { flex: 0 0 6px; background: linear-gradient(90deg, #00BFFF 0%, #7C3AED 100%); }

  /* ── Hero ── */
  .hero { flex: 0 0 ${HERO_H}px; position: relative; overflow: hidden; background: #111b27; }
  .hero-img { width: 100%; height: 100%; object-fit: cover; display: block; }
  .hero-fallback { width: 100%; height: 100%; display: flex; align-items: center; justify-content: center; background: #111b27; }
  .hero-scrim {
    position: absolute; bottom: 0; left: 0; right: 0; height: 240px;
    background: linear-gradient(to bottom, transparent 0%, rgba(11,17,26,0.7) 55%, #0B111A 100%);
    pointer-events: none; z-index: 2;
  }
  .hero-logo {
    position: absolute; top: 40px; left: 48px;
    width: 120px; height: auto; object-fit: contain; z-index: 10;
    filter: drop-shadow(0 1px 10px rgba(0,0,0,0.6));
  }
  .hero-logo-text {
    position: absolute; top: 40px; left: 48px;
    font-size: 26px; font-weight: 800; color: rgba(255,255,255,0.9); z-index: 10;
    text-shadow: 0 1px 8px rgba(0,0,0,0.5);
  }
  .hero-logo-text span { color: #00BFFF; }
  .hero-pill {
    position: absolute; top: 40px; right: 48px;
    background: rgba(11,17,26,0.65); border: 1px solid rgba(255,255,255,0.18);
    border-radius: 999px; padding: 10px 24px;
    font-size: 20px; font-weight: 600; color: rgba(255,255,255,0.9); z-index: 10; white-space: nowrap;
  }

  /* ── Content ── */
  .content {
    flex: 0 0 ${CONTENT_H}px;
    display: flex; flex-direction: column;
    padding: 28px 52px 36px;
    background: #0B111A; overflow: hidden;
  }

  /* Status badge */
  .status-badge {
    display: flex; align-items: center; gap: 7px;
    margin-bottom: 10px; flex-shrink: 0;
  }
  .status-dot { width: 7px; height: 7px; border-radius: 50%; background: #00BFFF; flex-shrink: 0; }
  .status-text { font-size: 13px; font-weight: 700; letter-spacing: 0.16em; text-transform: uppercase; color: rgba(148,163,184,0.75); }

  /* Price card */
  .price-card {
    display: flex; align-items: stretch;
    background: rgba(0,191,255,0.065);
    border: 1px solid rgba(0,191,255,0.30);
    border-radius: 22px;
    margin-bottom: 20px; flex-shrink: 0;
    overflow: hidden;
  }
  .price-left {
    flex: 1; padding: 20px 24px;
    display: flex; flex-direction: column; justify-content: center;
    border-right: 1px solid rgba(0,191,255,0.15);
  }
  .price-label { font-size: 11px; font-weight: 700; letter-spacing: 0.18em; text-transform: uppercase; color: #475569; margin-bottom: 4px; }
  .price-value {
    font-family: 'Arial Black', Impact, sans-serif; font-weight: 900;
    color: #00BFFF; line-height: 1; letter-spacing: -0.025em; white-space: nowrap;
    text-shadow: 0 0 50px rgba(0,191,255,0.22);
  }
  .price-xl { font-size: 76px; }
  .price-lg { font-size: 62px; }
  .price-md { font-size: 50px; }

  /* Selling points (right side of price card) */
  .price-right {
    flex: 0 0 230px; padding: 14px 18px;
    display: flex; flex-direction: column; justify-content: center; gap: 10px;
  }
  .sp-item { display: flex; align-items: flex-start; gap: 8px; }
  .sp-icon { font-size: 14px; line-height: 1.4; flex-shrink: 0; }
  .sp-text { overflow: hidden; }
  .sp-title { font-size: 13px; font-weight: 700; color: #E2E8F0; white-space: nowrap; overflow: hidden; text-overflow: ellipsis; }
  .sp-sub   { font-size: 11px; font-weight: 400; color: #475569; white-space: nowrap; overflow: hidden; text-overflow: ellipsis; }

  /* Title block */
  .brand-chip {
    display: inline-flex; align-items: center; align-self: flex-start;
    background: rgba(0,191,255,0.08); border: 1px solid rgba(0,191,255,0.28);
    border-radius: 8px; padding: 4px 13px;
    font-size: 14px; font-weight: 800; letter-spacing: 0.13em; text-transform: uppercase; color: #00BFFF;
    margin-bottom: 8px; flex-shrink: 0;
    max-width: 100%; overflow: hidden; text-overflow: ellipsis; white-space: nowrap;
  }
  .title {
    font-family: 'Arial Black', Impact, 'Helvetica Neue', sans-serif;
    font-size: 54px; font-weight: 900; line-height: 1.06; letter-spacing: -0.02em; color: #FFFFFF;
    margin-bottom: 8px;
    display: -webkit-box; -webkit-line-clamp: 2; -webkit-box-orient: vertical; overflow: hidden;
    flex-shrink: 0;
  }
  .meta {
    font-size: 20px; font-weight: 500; color: #94A3B8;
    white-space: nowrap; overflow: hidden; text-overflow: ellipsis;
    flex-shrink: 0;
  }

  .spacer { flex: 1; min-height: 8px; }

  /* Seller card */
  .seller-card {
    display: flex; align-items: center; gap: 14px;
    background: rgba(255,255,255,0.04);
    border: 1px solid rgba(255,255,255,0.08);
    border-radius: 18px; padding: 14px 18px;
    margin-bottom: 16px; flex-shrink: 0; overflow: hidden;
  }
  .seller-avatar {
    width: 56px; height: 56px; border-radius: 50%; flex-shrink: 0;
    overflow: hidden; background: rgba(255,255,255,0.08);
    border: 2px solid rgba(255,255,255,0.12);
    display: flex; align-items: center; justify-content: center;
  }
  .seller-avatar img { width: 100%; height: 100%; object-fit: cover; }
  .seller-info { flex: 1; min-width: 0; overflow: hidden; }
  .seller-pub-label { font-size: 11px; font-weight: 600; letter-spacing: 0.13em; text-transform: uppercase; color: #475569; margin-bottom: 2px; }
  .seller-name-row { display: flex; align-items: center; gap: 7px; overflow: hidden; }
  .seller-name { font-size: 21px; font-weight: 700; color: #E2E8F0; white-space: nowrap; overflow: hidden; text-overflow: ellipsis; }
  .verified-badge {
    display: inline-flex; align-items: center; gap: 3px; flex-shrink: 0;
    background: rgba(0,191,255,0.12); border: 1px solid rgba(0,191,255,0.3);
    border-radius: 999px; padding: 2px 8px;
    font-size: 11px; font-weight: 700; color: #00BFFF; white-space: nowrap;
  }
  .seller-meta { display: flex; align-items: center; gap: 8px; margin-top: 3px; }
  .stars { font-size: 14px; color: #F59E0B; letter-spacing: 1px; }
  .review-count { font-size: 12px; color: #64748B; }
  .trust-text { font-size: 12px; color: #64748B; }
  /* Right side of seller card */
  .seller-trust {
    flex: 0 0 auto; text-align: right; flex-shrink: 0;
    padding-left: 12px; border-left: 1px solid rgba(255,255,255,0.07);
  }
  .trust-label { font-size: 10px; font-weight: 700; letter-spacing: 0.12em; text-transform: uppercase; color: #334155; margin-bottom: 3px; }
  .trust-level { font-size: 14px; font-weight: 700; color: #94A3B8; white-space: nowrap; }

  /* Footer */
  .footer {
    display: flex; align-items: center; justify-content: space-between;
    border-top: 1px solid rgba(255,255,255,0.07);
    padding-top: 13px; flex-shrink: 0;
  }
  .footer-l { font-size: 19px; font-weight: 700; color: rgba(148,163,184,0.55); letter-spacing: -0.01em; }
  .footer-r { font-size: 14px; color: rgba(148,163,184,0.3); }
</style>
</head>
<body>
<div class="card">

  <div class="accent-bar"></div>

  <!-- Hero -->
  <div class="hero">
    ${imageUrl
      ? `<img src="${escAttr(imageUrl)}" class="hero-img" alt="" />`
      : `<div class="hero-fallback">
          <svg width="72" height="72" viewBox="0 0 24 24" fill="none" stroke="rgba(255,255,255,0.05)" stroke-width="0.5">
            <circle cx="5.5" cy="17.5" r="3.5"/><circle cx="18.5" cy="17.5" r="3.5"/>
            <path d="M8 17.5h7M15 6l2 5.5M5.5 14l3-8 2.5 8"/><circle cx="12" cy="6" r="1"/>
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

  <!-- Content -->
  <div class="content">

    <!-- Status badge (always EN VENTA) -->
    <div class="status-badge">
      <div class="status-dot"></div>
      <span class="status-text">En venta</span>
    </div>

    <!-- Price card -->
    <div class="price-card">
      <div class="price-left">
        <div class="price-label">Precio</div>
        <div class="price-value ${pc}">${escHtml(priceDisplay)}</div>
      </div>
      ${sellingPoints.length > 0 ? `
      <div class="price-right">
        ${sellingPoints.slice(0, 4).map(sp => `
        <div class="sp-item">
          <span class="sp-icon">${sp.icon}</span>
          <div class="sp-text">
            <div class="sp-title">${escHtml(sp.title)}</div>
            <div class="sp-sub">${escHtml(sp.sub)}</div>
          </div>
        </div>`).join('')}
      </div>` : ''}
    </div>

    <!-- Title block -->
    ${brandName ? `<div class="brand-chip">${escHtml(brandName)}</div>` : ''}
    <div class="title">${escHtml(title)}</div>
    ${metaLine ? `<div class="meta">${escHtml(metaLine)}</div>` : ''}

    <div class="spacer"></div>

    <!-- Seller card -->
    ${sellerName ? `
    <div class="seller-card">
      <div class="seller-avatar">
        ${avatarUri
          ? `<img src="${escAttr(avatarUri)}" alt="" />`
          : `<svg width="26" height="26" viewBox="0 0 24 24" fill="none" stroke="rgba(255,255,255,0.4)" stroke-width="1.5">
              <path d="M20 21v-2a4 4 0 0 0-4-4H8a4 4 0 0 0-4 4v2"/>
              <circle cx="12" cy="7" r="4"/>
             </svg>`
        }
      </div>
      <div class="seller-info">
        <div class="seller-pub-label">Publicado por</div>
        <div class="seller-name-row">
          <span class="seller-name">${escHtml(sellerName)}</span>
          ${sellerVerified ? `<span class="verified-badge">✓ Verificado</span>` : ''}
        </div>
        ${(reviewCount > 0) ? `
        <div class="seller-meta">
          ${renderStars(reviewAvg, reviewCount)}
        </div>` : ''}
      </div>
      ${trustText ? `
      <div class="seller-trust">
        <div class="trust-label">Confianza</div>
        <div class="trust-level">${escHtml(trustText.replace('Vendedor ', '').replace('Perfil ', ''))}</div>
      </div>` : ''}
    </div>` : ''}

    <!-- Footer -->
    <div class="footer">
      <span class="footer-l">ciclomarket.ar</span>
      <span class="footer-r">Marketplace de ciclismo</span>
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
