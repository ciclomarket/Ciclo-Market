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

  const listingCard = buildListingCardHtml(listing, cleanBase)

  // Dark-mode helpers (Apple Mail, iOS Mail, Gmail mobile)
  const styleBlock = `
  <style>
    :root { color-scheme: light dark; supported-color-schemes: light dark; }
    @media (prefers-color-scheme: dark) {
      .dm-bg { background: #0b1a28 !important; }
      .dm-hero { background: linear-gradient(135deg,#0b1220,#122133) !important; }
      .dm-card { background: #0f1729 !important; border-color: #233041 !important; }
      .dm-text { color: #e6edf5 !important; }
      .dm-subtle { color: #9fb2c7 !important; }
      .dm-muted { color: #7a8ea5 !important; }
    }
    [data-ogsc] .dm-bg { background: #0b1a28 !important; }
    [data-ogsc] .dm-hero { background: linear-gradient(135deg,#0b1220,#122133) !important; }
    [data-ogsc] .dm-card { background: #0f1729 !important; border-color: #233041 !important; }
    [data-ogsc] .dm-text { color: #e6edf5 !important; }
    [data-ogsc] .dm-subtle { color: #9fb2c7 !important; }
    [data-ogsc] .dm-muted { color: #7a8ea5 !important; }
  </style>`

  return `
  ${styleBlock}
  <div class="dm-bg" style="background:#f2f4f8;margin:0;padding:0;font-family:Arial, sans-serif;color:#0c1723">
    <table role="presentation" cellspacing="0" cellpadding="0" border="0" align="center" style="width:100%;max-width:720px;margin:0 auto">
      <tr>
        <td style="padding:24px;text-align:center;">
          <img src="${cleanBase}/site-logo.png" alt="Ciclo Market" style="height:56px;width:auto;display:inline-block" />
        </td>
      </tr>
      <tr>
        <td style="padding:0 24px 24px">
          <table role="presentation" width="100%" cellspacing="0" cellpadding="0" class="dm-hero" style="background:linear-gradient(135deg,#0f1729,#14212e);border-radius:22px;overflow:hidden;color:#fff">
            <tr>
              <td style="padding:26px 28px">
                <div class="dm-text" style="font-size:12px;letter-spacing:0.3em;text-transform:uppercase;opacity:.85;margin-bottom:6px">Oferta exclusiva</div>
                <h1 class="dm-text" style="margin:0 0 8px;font-size:22px;font-weight:800;line-height:1.2">${escapeHtml(profile?.fullName || 'Ciclista')}, potenciá tu publicación con descuento</h1>
                <p class="dm-subtle" style="margin:0;color:#e5e7eb;line-height:1.6">Mejorá a un plan pago por única vez y activá WhatsApp, destaque y prioridad en listados.</p>
                <div style="margin-top:14px;display:flex;gap:10px;flex-wrap:wrap">
                  <a href="${ctaBasic}" style="display:inline-block;background:#22c55e;color:#0b1a28;text-decoration:none;font-weight:800;padding:12px 16px;border-radius:999px;font-size:13px">Básica ${basicOff}% OFF</a>
                  <a href="${ctaPremium}" style="display:inline-block;background:#38bdf8;color:#0b1a28;text-decoration:none;font-weight:800;padding:12px 16px;border-radius:999px;font-size:13px">Premium ${premiumOff}% OFF</a>
                </div>
              </td>
            </tr>
          </table>
        </td>
      </tr>
      <tr>
        <td style="padding:0 24px 8px">
          <div class="dm-card dm-text" style="background:#fff;border-radius:20px;padding:22px">
            <div class="dm-text" style="font-size:13px;color:#0c1723;font-weight:700;margin-bottom:10px">Tu publicación</div>
            <div class="dm-card dm-text">${listingCard}</div>
          </div>
        </td>
      </tr>
      <tr>
        <td style="padding:10px 24px 28px">
          <div class="dm-card dm-text" style="background:#fff;border-radius:20px;padding:22px">
            <div class="dm-text" style="font-size:14px;color:#0c1723;font-weight:700;margin-bottom:8px">¿Qué ganás al mejorar?</div>
            <ul class="dm-text" style="margin:0;padding-left:18px;color:#334155;line-height:1.7;font-size:14px">
              <li>Contacto directo por WhatsApp para cerrar más rápido.</li>
              <li>Prioridad en el marketplace y hasta 14 días de destaque.</li>
              <li>Hasta 8 fotos y difusión en redes (Premium).</li>
            </ul>
            <div style="margin-top:14px">
              <a href="${ctaBasic}" style="display:inline-block;background:#14212e;color:#fff;text-decoration:none;font-weight:700;padding:10px 14px;border-radius:12px;font-size:13px">Aprovechar descuento</a>
            </div>
          </div>
          <div class="dm-muted" style="margin-top:12px;text-align:center;color:#64748b;font-size:12px">Si ya actualizaste tu plan, ignorá este mensaje.</div>
        </td>
      </tr>
      <tr>
        <td class="dm-muted" style="padding:0 24px 28px;color:#64748b;font-size:12px;text-align:center">© ${new Date().getFullYear()} Ciclo Market</td>
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
