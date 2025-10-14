const cron = require('node-cron')
const { getServerSupabaseClient } = require('../lib/supabaseClient')

async function fetchLatestListings(limit = 3) {
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

  const items = await fetchLatestListings(3)
  const cards = items.map((l) => {
    const img = Array.isArray(l.images) && l.images[0]
      ? (typeof l.images[0] === 'string' ? l.images[0] : l.images[0]?.url)
      : null
    const link = `${baseFront}/listing/${encodeURIComponent(l.slug || l.id)}`
    const priceLabel = toPrice(l.price, l.price_currency)
    return { title: l.title, image: img, link, priceLabel }
  })

  const style = `
    .card{border:1px solid #e5e7eb;border-radius:14px;overflow:hidden}
    .btn{display:inline-block;padding:10px 16px;border-radius:10px;background:#14212e;color:#fff;text-decoration:none}
    .grid{display:grid;gap:12px}
    @media(min-width:640px){.grid{grid-template-columns:repeat(3,1fr)}}
  `
  const cardHtml = cards.map(c => `
    <div class="card">
      ${c.image ? `<img src="${c.image}" alt="${(c.title || '').replace(/"/g,'&quot;')}" style="width:100%;height:180px;object-fit:cover" />` : ''}
      <div style="padding:12px">
        <div style="font-weight:600;color:#0c1723;">${(c.title || '').replace(/</g,'&lt;')}</div>
        <div style="color:#475569;margin:6px 0 10px">${c.priceLabel}</div>
        <a class="btn" href="${c.link}">Ver publicación</a>
      </div>
    </div>
  `).join('')

  const html = `
    <div style="font-family:Inter,Arial,sans-serif;line-height:1.5;color:#14212e">
      <h2 style="margin:0 0 6px">Nuevos ingresos en Ciclo Market</h2>
      <p style="margin:0 0 16px;color:#475569">Te compartimos las últimas publicaciones destacadas.</p>
      <div class="grid">${cardHtml}</div>
      <p style="margin:18px 0 0;color:#6b7280;font-size:12px">Recibís este correo por estar suscripto a nuestras novedades.</p>
    </div>
    <style>${style}</style>
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

