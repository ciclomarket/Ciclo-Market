/**
 * Runner compartido para las campañas de email simplificadas.
 *
 * Cada campaña es un script standalone (node scripts/campaigns/x.js),
 * disparado por su propio Cron Job de Render — sin orquestador central,
 * sin node-cron corriendo dentro del web service. Este archivo solo
 * junta las 3 partes repetidas: el loop de envío con guard atómico, y un
 * layout de email mínimo compartido.
 */

const { getServerSupabaseClient } = require('../../src/lib/supabaseClient')
const { sendMail, isMailConfigured, getDefaultSenderFrom } = require('../../src/lib/mail')
const {
  claimIdempotencyKey,
  reserveDailyBudget,
  releaseSend,
  recordProviderMessageId,
} = require('../../src/lib/emailGuard')

function resolveBaseFront() {
  const raw = String(process.env.FRONTEND_URL || '').trim()
  const parts = raw.split(',').map((s) => s.trim()).filter(Boolean)
  if (!parts.length) return 'https://www.ciclomarket.ar'
  const preferred = parts.find((url) => /https:\/\/www\.ciclomarket\.ar/i.test(url))
  return (preferred || parts[0]).replace(/\/$/, '')
}

function escapeHtml(input) {
  return String(input ?? '')
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
}

function formatPrice(amount, currency = 'ARS') {
  const n = Number(amount)
  if (!Number.isFinite(n)) return ''
  try {
    return new Intl.NumberFormat('es-AR', { style: 'currency', currency, maximumFractionDigits: 0 }).format(n)
  } catch {
    return `${currency} ${n}`
  }
}

// Layout mínimo: logo + título + intro + cuerpo + footer. Nada de sistema
// de bloques genérico — si una campaña necesita algo distinto, lo arma en
// su propio buildEmail() y listo.
function buildLayout({ baseFront, title, introHtml, bodyHtml }) {
  const logoUrl = `${baseFront}/logo-azul.png`
  return `
<div style="background:#f2f4f8;margin:0;padding:0;font-family:Arial, sans-serif;color:#0c1723">
  <table role="presentation" cellspacing="0" cellpadding="0" border="0" align="center" style="width:100%;max-width:640px;margin:0 auto">
    <tr><td style="padding:24px;text-align:center">
      <img src="${logoUrl}" alt="Ciclo Market" style="height:52px;width:auto;display:inline-block" />
    </td></tr>
    <tr><td style="background:#fff;border-radius:16px;padding:28px 32px">
      <h1 style="margin:0 0 12px;font-size:21px;font-weight:700;color:#0c1723">${escapeHtml(title)}</h1>
      <div style="font-size:15px;line-height:1.6;color:#334155">${introHtml || ''}</div>
      ${bodyHtml || ''}
    </td></tr>
    <tr><td style="padding:18px 24px 30px;color:#64748b;font-size:11px;text-align:center">
      © ${new Date().getFullYear()} Ciclo Market
    </td></tr>
  </table>
</div>`
}

function buildListingCardHtml(listing, baseFront) {
  const image = listing.images?.[0] || `${baseFront}/logo-azul.png`
  const link = `${baseFront}/listing/${encodeURIComponent(listing.slug || listing.id)}`
  const price = formatPrice(listing.price, listing.price_currency)
  return `
<table role="presentation" width="100%" cellspacing="0" cellpadding="0" style="border:1px solid #e2e8f0;border-radius:12px;overflow:hidden;margin:8px 0">
  <tr>
    <td style="width:96px"><a href="${link}"><img src="${image}" alt="" width="96" height="96" style="display:block;object-fit:cover;width:96px;height:96px" /></a></td>
    <td style="padding:0 14px">
      <div style="font-size:14px;font-weight:600;color:#0f172a">${escapeHtml(listing.title)}</div>
      <div style="font-size:14px;color:#334155;margin-top:2px">${price}</div>
      <a href="${link}" style="display:inline-block;margin-top:6px;font-size:13px;color:#14212e;font-weight:600;text-decoration:underline">Ver publicación</a>
    </td>
  </tr>
</table>`
}

async function loadSuppressions(supabase, candidates) {
  const emails = [...new Set(candidates.map((c) => String(c.email || '').toLowerCase()).filter(Boolean))]
  const userIds = [...new Set(candidates.map((c) => c.userId).filter(Boolean))]

  const [suppRes, prefRes] = await Promise.all([
    emails.length ? supabase.from('email_suppressions').select('email').in('email', emails) : Promise.resolve({ data: [] }),
    userIds.length
      ? supabase.from('user_notification_settings').select('user_id,marketing_emails_enabled,marketing_emails').in('user_id', userIds)
      : Promise.resolve({ data: [] }),
  ])

  const suppressedEmails = new Set((suppRes.data || []).map((r) => String(r.email || '').toLowerCase()))
  const optedOutUsers = new Set(
    (prefRes.data || [])
      .filter((r) => r.marketing_emails_enabled === false || r.marketing_emails === false)
      .map((r) => String(r.user_id))
  )
  return { suppressedEmails, optedOutUsers }
}

/**
 * @param {string} campaign - nombre de la campaña (para logs y prefijo de idempotency key)
 * @param {() => Promise<Array>} buildCandidates - devuelve candidatos con
 *   { idempotencyKey, email, userId, listingId, subject, html, text }
 */
async function runCampaign(campaign, buildCandidates) {
  const dryRun = process.argv.includes('--dry-run')

  if (!dryRun && !isMailConfigured()) {
    console.info(`[${campaign}] mail no configurado, se omite`)
    return
  }

  const supabase = getServerSupabaseClient()
  const candidates = await buildCandidates(supabase)
  console.info(`[${campaign}] candidatos: ${candidates.length}${dryRun ? ' (dry-run, no se manda ni se reserva nada)' : ''}`)

  if (dryRun) {
    for (const c of candidates.slice(0, 5)) {
      console.info(`  -> ${c.email} | ${c.subject} | key=${c.idempotencyKey}`)
    }
    return
  }

  const { suppressedEmails, optedOutUsers } = await loadSuppressions(supabase, candidates)

  let sent = 0
  let skippedDuplicate = 0
  let skippedBudget = 0
  let skippedSuppressed = 0
  let failed = 0

  for (const c of candidates) {
    const email = String(c.email || '').trim().toLowerCase()
    if (!email || suppressedEmails.has(email) || (c.userId && optedOutUsers.has(String(c.userId)))) {
      skippedSuppressed += 1
      continue
    }

    const claimed = await claimIdempotencyKey(supabase, {
      idempotencyKey: c.idempotencyKey,
      campaign,
      emailTo: email,
      listingId: c.listingId || null,
      userId: c.userId || null,
    })
    if (!claimed) {
      skippedDuplicate += 1
      continue
    }

    const hasBudget = await reserveDailyBudget(supabase)
    if (!hasBudget) {
      await releaseSend(supabase, c.idempotencyKey)
      skippedBudget += 1
      // Sin cupo hoy: cortamos el resto de los candidatos de esta corrida
      // en vez de seguir gastando reads/writes en algo que va a fallar igual.
      break
    }

    try {
      const response = await sendMail({
        from: getDefaultSenderFrom(),
        to: email,
        subject: c.subject,
        html: c.html,
        text: c.text,
      })
      await recordProviderMessageId(supabase, c.idempotencyKey, response?.id || response?.messageId || null)
      sent += 1
    } catch (err) {
      console.warn(`[${campaign}] fallo envío a ${email}`, err?.message || err)
      await releaseSend(supabase, c.idempotencyKey)
      failed += 1
    }
  }

  console.info(`[${campaign}] resultado`, { sent, skippedDuplicate, skippedBudget, skippedSuppressed, failed })
}

module.exports = {
  resolveBaseFront,
  escapeHtml,
  formatPrice,
  buildLayout,
  buildListingCardHtml,
  runCampaign,
}
