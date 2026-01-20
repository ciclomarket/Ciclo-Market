const { getServerSupabaseClient } = require('../lib/supabaseClient')
const { sendMail, isMailConfigured } = require('../lib/mail')
const { buildListingCardHtml, buildListingCardText, escapeHtml } = require('../emails/listingCard')
const { resolveFrontendBaseUrl } = require('../lib/savedSearch')

// Campaign config
const CAMPAIGN_CODE = 'free_to_paid_offer'
const BASIC_ORIG = 9000
const BASIC_PROMO = 5000 // 44.44% OFF
const PREMIUM_ORIG = 13000
const PREMIUM_PROMO = 9000 // 30.77% OFF

function pctOff(orig, promo) {
  if (!orig || !promo || promo >= orig) return 0
  return Math.round(((orig - promo) / orig) * 10000) / 100 // 2 decimals
}

function canonical(value) {
  if (!value) return null
  const normalized = String(value)
    .toLowerCase()
    .normalize('NFD')
    .replace(/\p{Diacritic}/gu, '')
  if (normalized === 'free' || normalized === 'gratis') return 'free'
  if (normalized === 'basic' || normalized === 'basica' || normalized === 'destacada' || normalized === 'featured') return 'basic'
  if (normalized === 'premium') return 'premium'
  return null
}

async function fetchFreeActiveListings(supabase, limit = 1000) {
  const { data, error } = await supabase
    .from('listings')
    .select(
      'id,seller_id,title,price,price_currency,images,plan,plan_code,seller_plan,status,slug,updated_at,created_at,location,seller_location'
    )
    .or('status.in.(active,published),status.is.null')
    .or('plan.eq.free,plan_code.eq.free,seller_plan.eq.free')
    .order('updated_at', { ascending: false, nullsLast: true })
    .limit(limit)
  if (error) {
    console.warn('[campaign] error fetching free listings', error)
    return []
  }
  return data || []
}

async function fetchProfiles(supabase, sellerIds) {
  if (!sellerIds.length) return new Map()
  const { data, error } = await supabase
    .from('users')
    .select('id,email,full_name')
    .in('id', sellerIds)
  if (error) {
    console.warn('[campaign] profiles fetch failed', error)
    return new Map()
  }
  const map = new Map()
  for (const row of data || []) {
    if (!row?.id) continue
    map.set(row.id, {
      email: typeof row.email === 'string' ? row.email.trim() : null,
      fullName: typeof row.full_name === 'string' ? row.full_name.trim() : null,
    })
  }
  return map
}

async function fetchRecentSendsMap(supabase, scenarioCode) {
  try {
    const since = new Date(Date.now() - 14 * 24 * 60 * 60 * 1000).toISOString() // 14d cooldown
    const { data, error } = await supabase
      .from('marketing_automations')
      .select('seller_id')
      .eq('scenario', scenarioCode)
      .gte('sent_at', since)
    if (error) return new Set()
    return new Set((data || []).map((r) => r?.seller_id).filter(Boolean))
  } catch {
    return new Set()
  }
}

async function recordSend(supabase, scenarioCode, listingId, sellerId, email) {
  try {
    const payload = { scenario: scenarioCode, listing_id: listingId ?? null, seller_id: sellerId ?? null, email_to: email ?? null }
    const { error } = await supabase.from('marketing_automations').insert(payload)
    if (error) console.warn('[campaign] recordSend failed', error)
  } catch (e) {
    console.warn('[campaign] recordSend threw', e?.message || e)
  }
}

function buildEmailHtml({ baseFront, profile, listing }) {
  const cleanBase = baseFront.replace(/\/$/, '')
  const basicOff = pctOff(BASIC_ORIG, BASIC_PROMO)
  const premiumOff = pctOff(PREMIUM_ORIG, PREMIUM_PROMO)
  const promoQuery = 'promo=free2paid'
  const typeGuess = 'bike'
  const ctaBasic = `${cleanBase}/publicar?type=${typeGuess}&plan=basic&${promoQuery}`
  const ctaPremium = `${cleanBase}/publicar?type=${typeGuess}&plan=premium&${promoQuery}`

  // Build inline listing row (single-flow layout, high contrast)
  const listingImage = (() => {
    const src = listing?.images && Array.isArray(listing.images) && listing.images[0] ? listing.images[0] : null
    const url = src && /^https?:\/\//i.test(src) ? src : (src ? `${cleanBase}${src.startsWith('/') ? '' : '/'}${src}` : `${cleanBase}/og-preview.png`)
    return url
  })()
  const listingLink = `${cleanBase}/listing/${encodeURIComponent(listing?.slug || listing?.id || '')}`

  return `
  <div style=\"background:#ffffff;margin:0;padding:0;font-family:Arial, sans-serif;color:#0c1723\">
    <table role=\"presentation\" cellspacing=\"0\" cellpadding=\"0\" border=\"0\" align=\"center\" style=\"width:100%;max-width:720px;margin:0 auto\" bgcolor=\"#ffffff\">
      <tr>
        <td bgcolor=\"#ffffff\" style=\"padding:18px 24px;text-align:center;border-bottom:1px solid #e5ebf3;\">
          <img src=\"${cleanBase}/site-logo.png\" alt=\"Ciclo Market\" style=\"height:56px;width:auto;display:inline-block;background:#ffffff;padding:8px;border-radius:8px\" />
        </td>
      </tr>
      <tr>
        <td bgcolor=\"#ffffff\" style=\"padding:10px 12px;text-align:center;border-bottom:1px solid #e5ebf3;\">
          <a href=\"${cleanBase}/marketplace?bikes=1\" style=\"color:#0f1729;text-decoration:none;font-weight:700;font-size:13px;margin:0 10px;\">Bicicletas</a>
          <span style=\"color:#94a3b8\">|</span>
          <a href=\"${cleanBase}/marketplace?cat=Accesorios\" style=\"color:#0f1729;text-decoration:none;font-weight:700;font-size:13px;margin:0 10px;\">Accesorios</a>
          <span style=\"color:#94a3b8\">|</span>
          <a href=\"${cleanBase}/marketplace?cat=Indumentaria\" style=\"color:#0f1729;text-decoration:none;font-weight:700;font-size:13px;margin:0 10px;\">Indumentaria</a>
        </td>
      </tr>
      <tr>
        <td bgcolor=\"#ffffff\" style=\"padding:22px 24px 10px;color:#0c1723;\">
          <div style=\"display:inline-block;padding:6px 10px;border:1px solid #0c1723;border-radius:999px;font-size:11px;font-weight:700;text-transform:uppercase;letter-spacing:.08em;\">Oferta exclusiva</div>
          <h1 style=\"margin:12px 0 8px;font-size:22px;line-height:1.3;font-weight:800;\">${escapeHtml(profile?.fullName || 'Ciclista')}, potenciá tu publicación con descuento</h1>
          <p style=\"margin:0;color:#334155;font-size:14px;line-height:1.7;\">Mejorá a un plan pago por única vez y activá WhatsApp, destaque y prioridad en listados.</p>
        </td>
      </tr>
      <tr>
        <td bgcolor=\"#ffffff\" style=\"padding:14px 24px 18px;border-bottom:1px solid #e5ebf3;\">
          <a href=\"${ctaBasic}\" style=\"display:inline-block;background:#0ea5e9;color:#ffffff;text-decoration:none;font-weight:800;padding:12px 16px;border-radius:12px;font-size:13px;margin-right:8px;\">Básica ${basicOff}% OFF</a>
          <a href=\"${ctaPremium}\" style=\"display:inline-block;background:#0f1729;color:#ffffff;text-decoration:none;font-weight:800;padding:12px 16px;border-radius:12px;font-size:13px;\">Premium ${premiumOff}% OFF</a>
        </td>
      </tr>
      <tr>
        <td bgcolor=\"#ffffff\" style=\"padding:18px 24px;border-bottom:1px solid #e5ebf3;\">
          <table role=\"presentation\" cellpadding=\"0\" cellspacing=\"0\" border=\"0\" width=\"100%\" style=\"border-collapse:collapse;\">
            <tr>
              <td style=\"width:140px;vertical-align:top;padding-right:14px;\">
                <a href=\"${listingLink}\"><img src=\"${listingImage}\" alt=\"${escapeHtml(listing?.title || 'Publicación')}\" style=\"width:140px;height:100px;object-fit:cover;border:1px solid #e5ebf3;border-radius:8px;display:block\" /></a>
              </td>
              <td style=\"vertical-align:top;color:#0c1723;\">
                <a href=\"${listingLink}\" style=\"color:#0c1723;text-decoration:none;font-size:16px;font-weight:700;line-height:1.3;display:block;margin-bottom:4px;\">${escapeHtml(listing?.title || 'Publicación en Ciclo Market')}</a>
                ${listing?.price ? `<div style=\\\"font-size:15px;color:#0f1729;font-weight:700;margin-bottom:4px;\\\">${listing?.price_currency === 'USD' ? new Intl.NumberFormat('en-US', { style: 'currency', currency: 'USD', maximumFractionDigits: 0 }).format(Number(listing.price)) : new Intl.NumberFormat('es-AR', { style: 'currency', currency: 'ARS', maximumFractionDigits: 0 }).format(Number(listing.price))}</div>` : ''}
                ${listing?.location || listing?.seller_location ? `<div style=\\\"font-size:13px;color:#64748b;margin-bottom:8px;\\\">${escapeHtml(listing?.location || listing?.seller_location || '')}</div>` : ''}
                <a href=\"${listingLink}\" style=\"display:inline-block;background:#0f1729;color:#ffffff;text-decoration:none;font-weight:700;padding:10px 14px;border-radius:12px;font-size:12px;\">Ver publicación</a>
              </td>
            </tr>
          </table>
        </td>
      </tr>
      <tr>
        <td bgcolor=\"#ffffff\" style=\"padding:18px 24px;border-bottom:1px solid #e5ebf3;\">
          <div style=\"font-size:15px;font-weight:700;color:#0c1723;margin-bottom:8px;\">¿Qué ganás al mejorar?</div>
          <ul style=\"margin:0;padding-left:18px;color:#334155;line-height:1.7;font-size:14px\">
            <li>Contacto directo por WhatsApp para cerrar más rápido.</li>
            <li>Prioridad en el marketplace y hasta 14 días de destaque.</li>
            <li>Hasta 8 fotos y difusión en redes (Premium).</li>
          </ul>
        </td>
      </tr>
      <tr>
        <td bgcolor=\"#ffffff\" style=\"padding:16px 24px;border-bottom:1px solid #e5ebf3;\">
          <a href=\"${ctaBasic}\" style=\"display:inline-block;background:#0f1729;color:#ffffff;text-decoration:none;font-weight:700;padding:10px 14px;border-radius:12px;font-size:13px;\">Aprovechar descuento</a>
        </td>
      </tr>
      <tr>
        <td bgcolor=\"#ffffff\" style=\"padding:18px 24px;color:#64748b;font-size:12px;text-align:center;border-bottom:1px solid #e5ebf3;\">
          Si ya actualizaste tu plan, ignorá este mensaje.
        </td>
      </tr>
      <tr>
        <td bgcolor=\"#ffffff\" style=\"padding:14px 24px;text-align:center;color:#0c1723;font-size:12px;\">
          Seguinos en Instagram: <a href=\"https://www.instagram.com/ciclomarket.ar\" style=\"color:#0f1729;text-decoration:none;font-weight:700\">@ciclomarket.ar</a>
        </td>
      </tr>
      <tr>
        <td bgcolor=\"#ffffff\" style=\"padding:10px 24px 24px;color:#64748b;font-size:12px;text-align:center\">© ${new Date().getFullYear()} Ciclo Market</td>
      </tr>
    </table>
  </div>`
}

function buildEmailText({ baseFront, listing }) {
  const basicOff = pctOff(BASIC_ORIG, BASIC_PROMO)
  const premiumOff = pctOff(PREMIUM_ORIG, PREMIUM_PROMO)
  const promoQuery = 'promo=free2paid'
  const typeGuess = 'bike'
  const ctaBasic = `${baseFront}/publicar?type=${typeGuess}&plan=basic&${promoQuery}`
  const ctaPremium = `${baseFront}/publicar?type=${typeGuess}&plan=premium&${promoQuery}`
  const card = buildListingCardText(listing, baseFront)
  return [
    'Potenciá tu publicación con descuento:',
    `- Básica ${basicOff}% OFF`,
    `- Premium ${premiumOff}% OFF`,
    '',
    'Tu publicación:',
    card,
    '',
    `Elegí plan: ${ctaBasic} | ${ctaPremium}`,
  ].join('\n')
}

async function runOnce() {
  if (!isMailConfigured()) {
    throw new Error('Mail no configurado (RESEND_API_KEY o SMTP_*)')
  }
  const supabase = getServerSupabaseClient()
  const baseFront = resolveFrontendBaseUrl()
  const recentSends = await fetchRecentSendsMap(supabase, CAMPAIGN_CODE)

  const rows = await fetchFreeActiveListings(supabase, 1500)
  if (!rows.length) {
    console.info('[campaign] no free listings found')
    return { ok: true, processed: 0 }
  }
  const bySeller = new Map()
  for (const row of rows) {
    const sellerId = row?.seller_id
    if (!sellerId) continue
    if (!bySeller.has(sellerId)) bySeller.set(sellerId, row)
  }
  const sellerIds = Array.from(bySeller.keys())
  const profiles = await fetchProfiles(supabase, sellerIds)

  let sent = 0
  for (const sellerId of sellerIds) {
    if (recentSends.has(sellerId)) continue
    const profile = profiles.get(sellerId)
    const email = profile?.email
    if (!email) continue
    const listing = bySeller.get(sellerId)
    try {
      const html = buildEmailHtml({ baseFront, profile, listing })
      const text = buildEmailText({ baseFront, listing })
      const subject = `Hasta ${pctOff(BASIC_ORIG, BASIC_PROMO)}% OFF en planes — potenciá tu aviso`
      await sendMail({ to: email, subject, html, text })
      await recordSend(supabase, CAMPAIGN_CODE, listing?.id ?? null, sellerId, email)
      sent += 1
    } catch (e) {
      console.warn('[campaign] send failed', sellerId, e?.message || e)
    }
  }
  console.info('[campaign] finished', { sent, targeted: sellerIds.length })
  return { ok: true, processed: sent, targeted: sellerIds.length }
}

module.exports = { runOnce, buildEmailHtml, buildEmailText }
