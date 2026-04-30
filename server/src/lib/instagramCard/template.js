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

function getPriceClass(str) {
  const len = str.replace(/\s/g, '').length
  if (len <= 8)  return 'price-xl'
  if (len <= 11) return 'price-lg'
  return 'price-md'
}

function renderStars(avg, count) {
  if (!count || !avg) return ''
  const full  = Math.min(Math.round(avg), 5)
  const stars = '★'.repeat(full) + '☆'.repeat(5 - full)
  return `<span class="stars">${stars}</span><span class="review-count"> (${count})</span>`
}

function trustLabelShort(level) {
  switch (level) {
    case 'verified': return 'Verificado'
    case 'pro':      return 'Pro'
    case 'semi_pro': return 'Completo'
    default:         return null
  }
}

// ── Template ──────────────────────────────────────────────────────────────────
function renderTemplate(data) {
  const title     = String(data.title    || '').trim()
  const brandName = String(data.brand    || '').trim()
  const model     = String(data.model    || '').trim()
  const year      = data.year ? String(data.year) : null
  const category  = String(data.category || '').trim()
  const currency  = String(data.currency || 'ARS').toUpperCase()
  const price     = typeof data.price === 'number' ? data.price : Number(data.price)
  const sellerName = String(data.sellerName || '').trim()
  const imageUrl  = data.imageUrl || null

  const publishedLabel  = data.publishedLabel  || null
  const isFeatured      = Boolean(data.isFeatured)
  const isOpportunity   = Boolean(data.isOpportunity)
  const sellerVerified  = Boolean(data.sellerVerified)
  const avatarUri       = data.sellerAvatarUri || null
  const reviewCount     = Number(data.sellerReviewCount) || 0
  const reviewAvg       = Number(data.sellerReviewAvg)   || 0
  const trustLevel      = String(data.trustLevel || 'basic')
  const condition       = data.condition ? String(data.condition).trim() : null

  const priceDisplay = formatPrice(currency, price)
  const pc           = getPriceClass(priceDisplay)
  const metaLine     = [brandName, model, year].filter(Boolean).join(' · ')
  const logoUri      = getLogoDataUri()
  const trustShort   = trustLabelShort(trustLevel)
  const hasSellerInfo = Boolean(sellerName)

  // Badges — only real data, no placeholders
  const badges = []
  if (condition)
    badges.push({ label: 'Estado', value: condition })
  if (publishedLabel)
    badges.push({ label: 'Publicación', value: publishedLabel })
  if (isFeatured)
    badges.push({ label: 'Destacada', value: 'Mayor visibilidad' })
  if (isOpportunity)
    badges.push({ label: 'Oportunidad', value: 'Precio competitivo' })

  // Zones: accent(6) + hero(675) + content(669) = 1350
  const HERO_H    = 675
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
    -moz-osx-font-smoothing: grayscale;
    text-rendering: optimizeLegibility;
  }
  .card { width: 1080px; height: 1350px; overflow: hidden; display: flex; flex-direction: column; background: #0B111A; }

  /* ── Accent bar ── */
  .accent-bar { flex: 0 0 6px; background: linear-gradient(90deg, #00BFFF 0%, #7C3AED 100%); }

  /* ── Hero ── */
  .hero { flex: 0 0 ${HERO_H}px; position: relative; overflow: hidden; background: #0f1923; }
  .hero-img { width: 100%; height: 100%; object-fit: cover; display: block; }
  .hero-fallback { width: 100%; height: 100%; display: flex; align-items: center; justify-content: center; }
  .hero-scrim {
    position: absolute; bottom: 0; left: 0; right: 0; height: 220px;
    background: linear-gradient(to bottom, transparent 0%, rgba(11,17,26,0.72) 50%, #0B111A 100%);
    pointer-events: none; z-index: 2;
  }
  .hero-logo {
    position: absolute; top: 42px; left: 50px;
    width: 140px; height: auto; object-fit: contain; z-index: 10;
    filter: drop-shadow(0 2px 12px rgba(0,0,0,0.65));
  }
  .hero-logo-text {
    position: absolute; top: 42px; left: 50px;
    font-size: 28px; font-weight: 800; color: #fff; z-index: 10;
    text-shadow: 0 2px 10px rgba(0,0,0,0.6);
  }
  .hero-logo-text span { color: #00BFFF; }
  .hero-pill {
    position: absolute; top: 42px; right: 50px;
    background: rgba(11,17,26,0.72); border: 1px solid rgba(255,255,255,0.20);
    border-radius: 999px; padding: 11px 26px;
    font-size: 22px; font-weight: 700; color: #FFFFFF; z-index: 10; white-space: nowrap;
  }

  /* ── Content ── */
  .content {
    flex: 0 0 ${CONTENT_H}px;
    display: flex; flex-direction: column;
    padding: 24px 50px 32px;
    background: #0B111A; overflow: hidden;
  }

  /* Status label */
  .status-label {
    display: flex; align-items: center; gap: 8px;
    margin-bottom: 10px; flex-shrink: 0;
  }
  .status-dot { width: 8px; height: 8px; border-radius: 50%; background: #00BFFF; flex-shrink: 0; }
  .status-text { font-size: 15px; font-weight: 700; letter-spacing: 3px; text-transform: uppercase; color: #94A3B8; }

  /* Price card */
  .price-card {
    height: 132px; flex-shrink: 0;
    display: flex; flex-direction: column; justify-content: center;
    padding: 0 28px;
    border-radius: 22px;
    border: 1px solid rgba(0,191,255,0.35);
    background: radial-gradient(circle at 20% 50%, rgba(0,191,255,0.18), rgba(0,191,255,0.04) 45%, rgba(255,255,255,0.025) 100%);
    margin-bottom: 16px;
  }
  .price-label { font-size: 13px; font-weight: 700; letter-spacing: 0.18em; text-transform: uppercase; color: #64748B; margin-bottom: 5px; }
  .price-value {
    font-family: 'Arial Black', Impact, 'Helvetica Neue', sans-serif; font-weight: 900;
    color: #00BFFF; line-height: 1; letter-spacing: -0.025em; white-space: nowrap;
    text-shadow: 0 0 60px rgba(0,191,255,0.3);
  }
  .price-xl { font-size: 72px; }
  .price-lg { font-size: 60px; }
  .price-md { font-size: 52px; }

  /* Title block */
  .brand-chip {
    display: inline-flex; align-self: flex-start;
    background: rgba(0,191,255,0.08); border: 1px solid rgba(0,191,255,0.28);
    border-radius: 8px; padding: 5px 14px;
    font-size: 15px; font-weight: 800; letter-spacing: 0.13em; text-transform: uppercase; color: #00BFFF;
    margin-bottom: 8px; flex-shrink: 0; white-space: nowrap; overflow: hidden; text-overflow: ellipsis; max-width: 100%;
  }
  .title {
    font-family: 'Arial Black', Impact, 'Helvetica Neue', sans-serif;
    font-size: 54px; font-weight: 900; line-height: 1.06; letter-spacing: -0.02em; color: #FFFFFF;
    margin-bottom: 8px;
    display: -webkit-box; -webkit-line-clamp: 2; -webkit-box-orient: vertical; overflow: hidden;
    flex-shrink: 0;
  }
  .meta {
    font-size: 22px; font-weight: 500; color: #94A3B8;
    white-space: nowrap; overflow: hidden; text-overflow: ellipsis;
    flex-shrink: 0;
  }

  /* Badges row */
  .badges {
    display: flex; gap: 10px;
    margin-top: 16px; flex-shrink: 0;
  }
  .badge {
    flex: 1;
    height: 64px;
    display: flex; flex-direction: column; justify-content: center;
    padding: 0 14px;
    border-radius: 16px;
    background: rgba(255,255,255,0.045);
    border: 1px solid rgba(255,255,255,0.08);
    overflow: hidden;
  }
  .badge-title { font-size: 18px; font-weight: 700; color: #E2E8F0; white-space: nowrap; overflow: hidden; text-overflow: ellipsis; }
  .badge-sub   { font-size: 13px; font-weight: 400; color: #94A3B8; white-space: nowrap; overflow: hidden; text-overflow: ellipsis; margin-top: 1px; }

  /* Spacer */
  .spacer { flex: 1; min-height: 10px; }

  /* Seller card */
  .seller-card {
    height: 98px; flex-shrink: 0;
    display: flex; align-items: center; gap: 14px;
    background: rgba(255,255,255,0.04);
    border: 1px solid rgba(255,255,255,0.09);
    border-radius: 20px; padding: 0 18px;
    margin-bottom: 14px; overflow: hidden;
  }
  .seller-avatar {
    width: 58px; height: 58px; flex-shrink: 0;
    border-radius: 50%; overflow: hidden;
    background: rgba(255,255,255,0.08);
    border: 2px solid rgba(255,255,255,0.14);
    display: flex; align-items: center; justify-content: center;
  }
  .seller-avatar img { width: 100%; height: 100%; object-fit: cover; display: block; }
  .seller-body { flex: 1; min-width: 0; overflow: hidden; }
  .seller-pub  { font-size: 13px; font-weight: 600; letter-spacing: 0.13em; text-transform: uppercase; color: #475569; margin-bottom: 3px; }
  .seller-name-row { display: flex; align-items: center; gap: 8px; overflow: hidden; margin-bottom: 3px; }
  .seller-name { font-size: 24px; font-weight: 700; color: #FFFFFF; white-space: nowrap; overflow: hidden; text-overflow: ellipsis; }
  .v-badge {
    display: inline-flex; align-items: center; flex-shrink: 0;
    background: rgba(0,191,255,0.12); border: 1px solid rgba(0,191,255,0.30);
    border-radius: 999px; padding: 2px 9px;
    font-size: 13px; font-weight: 700; color: #00BFFF; white-space: nowrap;
  }
  .seller-meta { display: flex; align-items: center; gap: 6px; }
  .stars { font-size: 15px; color: #F59E0B; }
  .review-count { font-size: 14px; color: #64748B; }
  .seller-right { flex-shrink: 0; text-align: right; padding-left: 14px; border-left: 1px solid rgba(255,255,255,0.07); }
  .trust-lbl { font-size: 13px; font-weight: 600; color: #475569; margin-bottom: 3px; }
  .trust-val { font-size: 18px; font-weight: 700; color: #94A3B8; }

  /* Footer */
  .footer {
    display: flex; align-items: center; justify-content: space-between;
    border-top: 1px solid rgba(255,255,255,0.07);
    padding-top: 13px; flex-shrink: 0;
  }
  .footer-l { font-size: 19px; font-weight: 700; color: rgba(148,163,184,0.6); }
  .footer-r { font-size: 15px; color: rgba(148,163,184,0.35); }
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
          <svg width="64" height="64" viewBox="0 0 24 24" fill="none" stroke="rgba(255,255,255,0.06)" stroke-width="0.5">
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

    <!-- Status label -->
    <div class="status-label">
      <div class="status-dot"></div>
      <span class="status-text">En venta</span>
    </div>

    <!-- Price card -->
    <div class="price-card">
      <div class="price-label">Precio</div>
      <div class="price-value ${pc}">${escHtml(priceDisplay)}</div>
    </div>

    <!-- Title block -->
    ${brandName ? `<div class="brand-chip">${escHtml(brandName)}</div>` : ''}
    <div class="title">${escHtml(title)}</div>
    ${metaLine ? `<div class="meta">${escHtml(metaLine)}</div>` : ''}

    <!-- Badges (only when real data exists) -->
    ${badges.length > 0 ? `
    <div class="badges">
      ${badges.slice(0, 4).map(b => `
      <div class="badge">
        <div class="badge-title">${escHtml(b.value)}</div>
        <div class="badge-sub">${escHtml(b.label)}</div>
      </div>`).join('')}
    </div>` : ''}

    <div class="spacer"></div>

    <!-- Seller card -->
    ${hasSellerInfo ? `
    <div class="seller-card">
      <div class="seller-avatar">
        ${avatarUri
          ? `<img src="${escAttr(avatarUri)}" alt="" />`
          : `<svg width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="rgba(255,255,255,0.4)" stroke-width="1.5">
              <path d="M20 21v-2a4 4 0 0 0-4-4H8a4 4 0 0 0-4 4v2"/>
              <circle cx="12" cy="7" r="4"/>
             </svg>`
        }
      </div>
      <div class="seller-body">
        <div class="seller-pub">Publicado por</div>
        <div class="seller-name-row">
          <span class="seller-name">${escHtml(sellerName)}</span>
          ${sellerVerified ? `<span class="v-badge">✓ Verificado</span>` : ''}
        </div>
        ${reviewCount > 0 ? `
        <div class="seller-meta">
          ${renderStars(reviewAvg, reviewCount)}
        </div>` : ''}
      </div>
      ${trustShort ? `
      <div class="seller-right">
        <div class="trust-lbl">Confianza</div>
        <div class="trust-val">${escHtml(trustShort)}</div>
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
