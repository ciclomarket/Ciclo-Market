const path = require('path')
try {
  // Cargar variables desde .env en la raíz del proyecto (tres niveles arriba)
  require('dotenv').config({ path: path.resolve(__dirname, '../../../.env') })
  // Fallback por si la ejecución ya expone variables de entorno
  require('dotenv').config()
} catch {}
const { getServerSupabaseClient } = require('../lib/supabaseClient')
const { sendMail, isMailConfigured } = require('../lib/mail')

function sleep(ms) {
  return new Promise((resolve) => setTimeout(resolve, ms))
}

function isRateLimitError(err) {
  const msg = String(err?.message || '').toLowerCase()
  const code = String(err?.code || '').toLowerCase()
  return code.includes('rate') || msg.includes('too many requests') || msg.includes('rate limit')
}

let _lastEmailAt = 0
async function sendMailThrottled(options) {
  const rpsRaw = Number(process.env.EMAIL_RPS)
  const rps = Number.isFinite(rpsRaw) && rpsRaw > 0 ? rpsRaw : 2
  const minDelay = Math.ceil(1000 / rps)
  const toWait = _lastEmailAt + minDelay - Date.now()
  if (toWait > 0) await sleep(toWait)

  let attempt = 0
  let backoff = Math.max(minDelay, 600)
  for (;;) {
    try {
      const res = await sendMail(options)
      _lastEmailAt = Date.now()
      return res
    } catch (e) {
      attempt += 1
      if (isRateLimitError(e) && attempt < 6) {
        const jitter = Math.floor(Math.random() * 200)
        const wait = backoff + jitter
        console.warn('[extendExpired90d] rate limited, retry', attempt, 'in', wait, 'ms')
        await sleep(wait)
        backoff *= 2
        continue
      }
      throw e
    }
  }
}

function chunk(arr, size) {
  const out = []
  for (let i = 0; i < arr.length; i += size) out.push(arr.slice(i, i + size))
  return out
}

function coerceDate(input) {
  if (!input) return null
  const d = new Date(input)
  return Number.isFinite(d.getTime()) ? d : null
}

function formatMoney(amount, currency) {
  if (typeof amount !== 'number' || Number.isNaN(amount)) return null
  const cur = currency === 'USD' ? 'USD' : 'ARS'
  return new Intl.NumberFormat(cur === 'USD' ? 'en-US' : 'es-AR', { style: 'currency', currency: cur, maximumFractionDigits: 0 }).format(amount)
}

function escapeHtml(input) {
  return String(input ?? '')
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
}

function buildEmailHtml({ profile, items, baseFront }) {
  const cleanBase = (baseFront || 'https://www.ciclomarket.ar').replace(/\/$/, '')
  const dashboardUrl = `${cleanBase}/dashboard?tab=${encodeURIComponent('Publicaciones')}`
  const allListingsUrl = dashboardUrl

  const listingBlocks = items
    .map((l) => {
      const slugOrId = l.slug || l.id
      const viewUrl = `${cleanBase}/listing/${encodeURIComponent(slugOrId)}`
      const featureUrl = `${cleanBase}/listing/${encodeURIComponent(slugOrId)}/destacar?utm_source=email&utm_medium=crm&utm_campaign=extendidos90`
      const manageUrl = `${dashboardUrl}&utm_source=email&utm_medium=crm&utm_campaign=extendidos90`
      const soldUrl = manageUrl
      const price = formatMoney(l.price, l.price_currency)
      const newExpiry = new Date(Date.now() + 90 * 24 * 60 * 60 * 1000)
      const newExpiryLabel = new Intl.DateTimeFormat('es-AR', { dateStyle: 'medium' }).format(newExpiry)
      return `
        <tr>
          <td style="padding:0 24px 0 24px;">
            <table role="presentation" width="100%" cellspacing="0" cellpadding="0" style="border:1px solid #e6e8eb;border-radius:8px;margin:12px 0;overflow:hidden;">
              <tr>
                <td style="padding:12px 16px;">
                  <p style="margin:0 0 4px 0;font-weight:bold;font-size:15px;">
                    <a href="${viewUrl}" style="color:#15212a;text-decoration:none;">${escapeHtml(l.title)}</a>
                  </p>
                  <p style="margin:0 0 8px 0;color:#425466;font-size:13px;">
                    ${price ? `Precio: ${price} • ` : ''}Nueva fecha de vencimiento: ${newExpiryLabel}
                  </p>
                  <table role="presentation" cellspacing="0" cellpadding="0">
                    <tr>
                      <td style="padding-right:8px;">
                        <a href="${featureUrl}"
                           style="display:inline-block;background:#1769ff;color:#fff;text-decoration:none;border-radius:6px;padding:10px 14px;font-size:14px;">
                          Destacar publicación
                        </a>
                      </td>
                      <td style="padding-right:8px;">
                        <a href="${soldUrl}"
                           style="display:inline-block;background:#0a7f5a;color:#fff;text-decoration:none;border-radius:6px;padding:10px 14px;font-size:14px;">
                          Marcar como vendida
                        </a>
                      </td>
                      <td>
                        <a href="${manageUrl}"
                           style="display:inline-block;background:#eef2ff;color:#1f3a93;text-decoration:none;border-radius:6px;padding:10px 14px;font-size:14px;">
                          Administrar publicación
                        </a>
                      </td>
                    </tr>
                  </table>
                </td>
              </tr>
            </table>
          </td>
        </tr>`
    })
    .join('\n')

  return `
<!doctype html>
<html lang="es">
  <body style="margin:0;padding:0;background:#f6f7f9;font-family:Arial,Helvetica,sans-serif;color:#15212a;">
    <table role="presentation" width="100%" cellspacing="0" cellpadding="0" style="background:#f6f7f9;">
      <tr>
        <td align="center" style="padding:24px;">
          <table role="presentation" width="600" cellspacing="0" cellpadding="0" style="background:#ffffff;border-radius:8px;overflow:hidden;">
            <tr>
              <td style="padding:24px 24px 8px 24px;">
                <img src="${cleanBase}/site-logo.png" alt="Ciclo Market" height="28" style="display:block;">
              </td>
            </tr>
            <tr>
              <td style="padding:0 24px 8px 24px;">
                <h1 style="margin:0 0 8px 0;font-size:22px;line-height:1.3;">¡Extendimos tus publicaciones 90 días más!</h1>
                <p style="margin:0 0 12px 0;font-size:15px;line-height:1.55;">
                  Hola ${escapeHtml(profile?.full_name || 'vendedor')},<br>
                  Para que tengas más chances de vender, reactivamos tus publicaciones vencidas por <strong>90 días adicionales</strong>.
                </p>
                <p style="margin:0 0 16px 0;font-size:15px;line-height:1.55;">
                  Además, <strong>Ciclo Market ahora rinde más</strong>: más visitas, mejor exposición y mejores resultados para quienes destacan sus avisos.
                </p>
              </td>
            </tr>
            ${listingBlocks}
            <tr>
              <td style="padding:12px 24px 8px 24px;">
                <p style="margin:0 0 6px 0;font-size:14px;line-height:1.5;">
                  Tip: Las publicaciones destacadas logran <strong>hasta 2x más exposición</strong> gracias a su prioridad en listados y en la Home.
                </p>
              </td>
            </tr>
            <tr>
              <td style="padding:0 24px 24px 24px;">
                <a href="${allListingsUrl}"
                   style="display:inline-block;background:#15212a;color:#fff;text-decoration:none;border-radius:6px;padding:12px 16px;font-size:14px;">
                  Ver todas mis publicaciones
                </a>
              </td>
            </tr>
          </table>
        </td>
      </tr>
    </table>
  </body>
</html>`
}

async function fetchExpiredListings(supabase, limit = 500) {
  const nowIso = new Date().toISOString()
  const { data, error } = await supabase
    .from('listings')
    .select('id,seller_id,title,slug,price,price_currency,images,status,expires_at')
    .or(`status.eq.expired,expires_at.lte.${nowIso}`)
    .neq('status', 'deleted')
    .neq('status', 'sold')
    .order('expires_at', { ascending: true, nullsLast: true })
    .limit(limit)
  if (error) throw error
  return data || []
}

async function fetchProfiles(supabase, sellerIds) {
  if (!sellerIds.length) return new Map()
  const { data, error } = await supabase
    .from('users')
    .select('id,email,full_name')
    .in('id', sellerIds)
  if (error) throw error
  const map = new Map()
  for (const row of data || []) {
    if (row?.id) map.set(row.id, row)
  }
  return map
}

async function runOnce() {
  const supabase = getServerSupabaseClient()
  const dryRun = process.env.DRY_RUN === 'true'
  const now = Date.now()
  const next = new Date(now + 90 * 24 * 60 * 60 * 1000).toISOString()

  console.info('[extendExpired90d] buscando publicaciones vencidas…')
  const rows = await fetchExpiredListings(supabase, Number(process.env.EXTEND_LIMIT || 1000))
  if (!rows.length) {
    console.info('[extendExpired90d] no hay publicaciones para extender')
    return { updated: 0, emailed: 0 }
  }

  const ids = rows.map((r) => r.id)
  console.info('[extendExpired90d] candidatas:', ids.length)

  let updatedCount = 0
  if (!dryRun) {
    // Actualización masiva uniforme: vence en 90 días desde ahora y activar
    const { data: updData, error: updErr } = await supabase
      .from('listings')
      .update({ expires_at: next, status: 'active' })
      .in('id', ids)
      .select('id')
    if (updErr) throw updErr
    updatedCount = (updData || []).length
  } else {
    console.info('[extendExpired90d] DRY_RUN=true, no se ejecuta UPDATE')
    updatedCount = ids.length
  }

  // Emails agrupados por vendedor
  let emailed = 0
  if (isMailConfigured()) {
    const bySeller = new Map()
    for (const r of rows) {
      if (!r.seller_id) continue
      if (!bySeller.has(r.seller_id)) bySeller.set(r.seller_id, [])
      bySeller.get(r.seller_id).push(r)
    }
    const profiles = await fetchProfiles(supabase, Array.from(bySeller.keys()))
    const baseFront = (process.env.FRONTEND_URL || '').split(',')[0]?.trim() || 'https://www.ciclomarket.ar'
    for (const [sellerId, items] of bySeller.entries()) {
      const profile = profiles.get(sellerId)
      if (!profile?.email) continue
      const html = buildEmailHtml({ profile, items, baseFront })
      const subject = '¡Extendimos tus publicaciones 90 días más en Ciclo Market!'
      if (!dryRun) {
        try {
          await sendMailThrottled({
            from: process.env.SMTP_FROM || `Ciclo Market <${process.env.SMTP_USER}>`,
            to: profile.email,
            subject,
            html,
          })
          emailed += 1
        } catch (e) {
          console.warn('[extendExpired90d] fallo email', sellerId, e?.message || e)
        }
      } else {
        console.info('[extendExpired90d] DRY_RUN email →', profile.email, items.length, 'avisos')
        emailed += 1
      }
    }
  } else {
    console.info('[extendExpired90d] email no configurado; salteando envíos')
  }

  console.info('[extendExpired90d] listo. actualizadas:', updatedCount, 'emails:', emailed)
  return { updated: updatedCount, emailed }
}

async function main() {
  try {
    await runOnce()
    if (process.env.EXTEND_CRON && process.env.EXTEND_CRON !== 'false') {
      const cron = require('node-cron')
      const schedule = String(process.env.EXTEND_CRON)
      console.info('[extendExpired90d] modo cron', schedule)
      cron.schedule(schedule, () => {
        runOnce().catch((e) => console.error('[extendExpired90d] cron error', e))
      })
    } else {
      if (require.main === module) process.exit(0)
    }
  } catch (err) {
    console.error('[extendExpired90d] error', err)
    if (require.main === module) process.exit(1)
  }
}

if (require.main === module) {
  main()
}

module.exports = { runOnce }
