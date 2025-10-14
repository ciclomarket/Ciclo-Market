const cron = require('node-cron')
const { getServerSupabaseClient } = require('../lib/supabaseClient')

async function fetchLatestListings(limit = 4) {
  const supabase = getServerSupabaseClient()
  const { data, error } = await supabase
    .from('listings')
    .select('id,title,slug,price,price_currency,images,category,created_at,status')
    .eq('status', 'active')
    .order('created_at', { ascending: false })
    .limit(limit)
  if (error) throw error
  return data || []
}

function toPrice(amount, currency) {
  try {
    return new Intl.NumberFormat(currency === 'ARS' ? 'es-AR' : 'en-US', {
      style: 'currency',
      currency: currency || 'USD',
      maximumFractionDigits: 0,
    }).format(amount)
  } catch {
    return `${currency || 'USD'} ${amount}`
  }
}

async function sendEmailToAudience({ apiKey, audienceId, from, subject, html, text }) {
  // Fetch contacts in audience (Resend)
  const listRes = await fetch(`https://api.resend.com/audiences/${encodeURIComponent(audienceId)}/contacts`, {
    headers: { Authorization: `Bearer ${apiKey}` },
  })
  const listData = await listRes.json().catch(() => ({}))
  if (!listRes.ok) {
    const msg = listData?.error?.message || listData?.message || 'audience_fetch_failed'
    const err = new Error(msg)
    err.code = listData?.error?.code
    throw err
  }
  const contacts = Array.isArray(listData.data || listData.contacts) ? (listData.data || listData.contacts) : []
  const recipients = contacts.filter((c) => c && c.email && !c.unsubscribed).map((c) => c.email)
  if (recipients.length === 0) return 0

  // Send in chunks to avoid huge payloads
  const size = 50
  let sent = 0
  for (let i = 0; i < recipients.length; i += size) {
    const toChunk = recipients.slice(i, i + size)
    const resp = await fetch('https://api.resend.com/emails', {
      method: 'POST',
      headers: { Authorization: `Bearer ${apiKey}`, 'Content-Type': 'application/json' },
      body: JSON.stringify({ from, to: toChunk, subject, html, text }),
    })
    if (resp.ok) sent += toChunk.length
  }
  return sent
}

async function runDigestOnce() {
  const apiKey = process.env.RESEND_API_KEY
  const audienceId = process.env.RESEND_AUDIENCE_GENERAL_ID
  if (!apiKey || !audienceId) {
    console.warn('[newsletterDigest] not configured (RESEND_API_KEY / RESEND_AUDIENCE_GENERAL_ID)')
    return
  }

  const baseFront = (process.env.FRONTEND_URL || '').split(',')[0]?.trim() || 'https://ciclomarket.ar'

  const items = await fetchLatestListings(4)
  const cards = items.map((l) => {
    const img = Array.isArray(l.images) && l.images[0]
      ? (typeof l.images[0] === 'string' ? l.images[0] : l.images[0]?.url)
      : null
    const link = `${baseFront}/listing/${encodeURIComponent(l.slug || l.id)}`
    const priceLabel = toPrice(l.price, l.price_currency)
    return { title: l.title, image: img, link, priceLabel }
  })

  const logoUrl = `${baseFront}/site-logo.png`
  const bikesUrl = `${baseFront}/marketplace`
  const partsUrl = `${baseFront}/marketplace?cat=Accesorios`
  const apparelUrl = `${baseFront}/marketplace?cat=Indumentaria`

  const cardTd = (c) => `
    <td style="padding:8px;vertical-align:top;width:50%">
      <table role="presentation" width="100%" cellspacing="0" cellpadding="0" style="border:1px solid #e1e5eb;border-radius:14px;overflow:hidden">
        ${c.image ? `<tr><td><img src="${c.image}" alt="${(c.title || '').replace(/"/g,'&quot;')}" style="width:100%;height:180px;object-fit:cover;display:block" /></td></tr>` : ''}
        <tr>
          <td style="padding:12px">
            <div style="font-weight:600;color:#0c1723;line-height:1.3">${(c.title || '').replace(/</g,'&lt;')}</div>
            <div style="color:#475569;margin:6px 0 12px">${c.priceLabel}</div>
            <a href="${c.link}" style="display:inline-block;padding:10px 16px;border-radius:10px;background:#14212e;color:#ffffff;text-decoration:none">Ver publicación</a>
          </td>
        </tr>
      </table>
    </td>`

  const row1 = cards.slice(0, 2)
  const row2 = cards.slice(2, 4)

  const html = `
    <div style="background:#ffffff;margin:0 auto;max-width:640px;font-family:Inter,Arial,sans-serif;color:#14212e">
      <table role="presentation" cellspacing="0" cellpadding="0" border="0" align="center" style="width:100%">
        <tr>
          <td style="padding:20px 24px;text-align:center">
            <img src="${logoUrl}" alt="Ciclo Market" style="height:64px;width:auto;display:inline-block" />
          </td>
        </tr>
        <tr>
          <td style="background:#14212e;color:#fff;text-align:center;padding:12px">
            <a href="${bikesUrl}" style="color:#fff;text-decoration:none;margin:0 10px;font-size:14px">Bicicletas</a>
            <a href="${partsUrl}" style="color:#fff;text-decoration:none;margin:0 10px;font-size:14px">Accesorios</a>
            <a href="${apparelUrl}" style="color:#fff;text-decoration:none;margin:0 10px;font-size:14px">Indumentaria</a>
          </td>
        </tr>
        <tr>
          <td style="padding:24px">
            <h2 style="margin:0 0 8px;font-size:20px;color:#0c1723">Te presentamos estos cuatro últimos ingresos</h2>
            <p style="margin:0 0 16px;color:#475569">Elegí tu favorita y mirá los detalles desde el marketplace.</p>
            <table role="presentation" width="100%" cellspacing="0" cellpadding="0">
              <tr>${row1.map(cardTd).join('')}</tr>
              <tr>${row2.map(cardTd).join('')}</tr>
            </table>
          </td>
        </tr>
        <tr>
          <td style="padding:16px 24px;border-top:1px solid #e1e5eb">
            <div style="font-size:16px;margin:0 0 6px;color:#0c1723"><b>¿Tenés consultas?</b></div>
            <div style="font-size:14px;color:#475569;margin:0">Respondé este correo con tu consulta o escribinos en Instagram.</div>
          </td>
        </tr>
        <tr>
          <td style="padding:16px 24px;background:#f6f8fb">
            <div style="font-size:14px;color:#0c1723;margin:0 0 8px"><b>Seguinos</b></div>
            <div style="font-size:13px;color:#475569;line-height:1.6">
              Instagram: <a href="https://instagram.com/ciclomarket.ar" style="color:#0c72ff;text-decoration:underline">@ciclomarket.ar</a>
            </div>
          </td>
        </tr>
      </table>
    </div>
  `
  const text = [
    'Nuevos ingresos en Ciclo Market',
    ...cards.map(c => `- ${c.title} · ${c.priceLabel}: ${c.link}`)
  ].join('\n')

  const from = process.env.SMTP_FROM || `Ciclo Market <${process.env.SMTP_USER || 'no-reply@ciclomarket.ar'}>`
  const subject = 'Nuevos ingresos de la semana · Ciclo Market'

  const sent = await sendEmailToAudience({ apiKey, audienceId, from, subject, html, text })
  console.info('[newsletterDigest] sent to contacts:', sent)
}

function startNewsletterDigestJob() {
  if (process.env.NEWSLETTER_DIGEST_ENABLED !== 'true') {
    console.info('[newsletterDigest] disabled (NEWSLETTER_DIGEST_ENABLED != "true")')
    return
  }
  const schedule = process.env.NEWSLETTER_DIGEST_CRON || '33 20 * * 2' // Tuesdays 20:33
  const tz = process.env.NEWSLETTER_DIGEST_TZ || 'America/Argentina/Buenos_Aires'

  const task = cron.schedule(schedule, async () => {
    try {
      await runDigestOnce()
    } catch (err) {
      console.error('[newsletterDigest] job failed', err)
    }
  }, { timezone: tz })
  task.start()
  console.info('[newsletterDigest] job started with cron', schedule, 'tz', tz)
}

module.exports = { startNewsletterDigestJob, runDigestOnce }
