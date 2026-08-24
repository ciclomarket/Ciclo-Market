#!/usr/bin/env node
// One-off: extiende 30 días las publicaciones "activas/aprobadas" que ya
// vencieron (expires_at pasado) pero nunca se movieron a un estado que las
// saque del catálogo — quedaron invisibles en el Marketplace sin que nadie
// se enterara. Extiende expires_at y le avisa al vendedor por mail.
//
// Uso:
//   node server/scripts/campaigns/reviveExpiredListings30d.js --dry-run
//   node server/scripts/campaigns/reviveExpiredListings30d.js
const path = require('path')
const fs = require('fs')

try {
  const dotenv = require('dotenv')
  const serverEnvPath = path.resolve(__dirname, '../../.env')
  const rootEnvPath = path.resolve(__dirname, '../../../.env')
  if (fs.existsSync(serverEnvPath)) dotenv.config({ path: serverEnvPath })
  if (fs.existsSync(rootEnvPath)) dotenv.config({ path: rootEnvPath })
} catch {}

const { getServerSupabaseClient } = require('../../src/lib/supabaseClient')
const { sendMail, isMailConfigured } = require('../../src/lib/mail')
const {
  escapeHtml,
  buildBaseLayout,
  buildHeroSection,
  buildCTAButton,
  buildUnsubscribeLink,
} = require('../../src/emails/emailBase')

const DRY_RUN = process.argv.includes('--dry-run')
const EMAILS_ONLY = process.argv.includes('--emails-only')
// expires_at exacto que dejó la corrida anterior (extensión ya aplicada) —
// con --emails-only, reencontramos exactamente el mismo lote de 160 por este
// valor en vez de "< now()", que ya no los matchea.
const EMAILS_ONLY_MARKER = '2026-09-20T00:40:50.904Z'
const EXTEND_DAYS = 30
const SEND_DELAY_MS = 400

// Dedupe persistido: reusa email_logs (misma tabla/patrón que el
// orquestador en src/email/orchestrator.js) para que una re-corrida de este
// script (manual o por un Render Cron Job externo) no vuelva a mandarle el
// mismo mail "extendimos tu publicación" a un vendedor cuya publicación ya
// fue avisada. Ventana de 25 días: un poco menos que los 30 días de la
// extensión, así si la publicación vuelve a vencer y se re-extiende, sí
// puede recibir un aviso nuevo.
const CAMPAIGN = 'revive_expired_30d'
const DEDUP_WINDOW_DAYS = 25

function sleep(ms) {
  return new Promise((r) => setTimeout(r, ms))
}

function buildIdempotencyKey(listingId) {
  return `${CAMPAIGN}:${listingId}`
}

// ISO year/week de "ahora" — email_logs los exige NOT NULL; acá solo se usan
// para bookkeeping/consistencia con el resto de las filas de la tabla, no
// para lógica de negocio de este script.
function currentIsoYearWeek() {
  const now = new Date()
  const d = new Date(Date.UTC(now.getUTCFullYear(), now.getUTCMonth(), now.getUTCDate()))
  const dayNum = d.getUTCDay() || 7
  d.setUTCDate(d.getUTCDate() + 4 - dayNum)
  const isoYear = d.getUTCFullYear()
  const yearStart = new Date(Date.UTC(isoYear, 0, 1))
  const isoWeek = Math.ceil((((d - yearStart) / 86400000) + 1) / 7)
  return { isoYear, isoWeek }
}

async function fetchAlreadyEmailedListingIds(supabase, listingIds) {
  if (!listingIds.length) return new Set()
  const cutoffIso = new Date(Date.now() - DEDUP_WINDOW_DAYS * 86400000).toISOString()
  const keys = listingIds.map(buildIdempotencyKey)
  const alreadySent = new Set()
  for (let i = 0; i < keys.length; i += 200) {
    const chunk = keys.slice(i, i + 200)
    const { data, error } = await supabase
      .from('email_logs')
      .select('idempotency_key')
      .in('idempotency_key', chunk)
      .eq('status', 'sent')
      .gte('created_at', cutoffIso)
    if (error) throw error
    for (const row of data || []) alreadySent.add(String(row.idempotency_key))
  }
  // idempotency_key -> listingId (reverso del prefijo CAMPAIGN:)
  const prefix = `${CAMPAIGN}:`
  return new Set(
    [...alreadySent]
      .filter((k) => k.startsWith(prefix))
      .map((k) => k.slice(prefix.length))
  )
}

async function logEmailSent(supabase, { listing, seller, subject }) {
  const { isoYear, isoWeek } = currentIsoYearWeek()
  try {
    await supabase.from('email_logs').insert({
      campaign: CAMPAIGN,
      priority: 5,
      user_id: seller?.id || null,
      email_to: seller.email,
      listing_id: listing.id,
      idempotency_key: buildIdempotencyKey(listing.id),
      iso_year: isoYear,
      iso_week: isoWeek,
      status: 'sent',
      provider: 'smtp',
      subject,
      metadata: { extendDays: EXTEND_DAYS },
    })
  } catch (err) {
    // No debe tumbar la corrida: si el insert de log falla (p. ej. carrera de
    // unique constraint), el mail ya salió; solo se pierde el dedupe fino.
    console.warn(`[revive] no se pudo registrar email_logs para listing ${listing.id}:`, err?.message || err)
  }
}

function resolveFrontendBaseUrl() {
  const raw = (process.env.FRONTEND_URL || process.env.PUBLIC_FRONTEND_URL || '').split(',')[0]?.trim()
  return (raw || 'https://www.ciclomarket.ar').replace(/\/$/, '')
}

async function fetchExpiredButActive(supabase) {
  const query = supabase
    .from('listings')
    .select('id, title, slug, expires_at, seller_id, status, moderation_state, archived_at')
  const { data, error } = EMAILS_ONLY
    ? await query.eq('expires_at', EMAILS_ONLY_MARKER)
    : await query.lt('expires_at', new Date().toISOString())
  if (error) throw error

  const rows = (data || []).filter((row) => {
    const status = String(row.status || 'active').trim().toLowerCase()
    if (['draft', 'deleted', 'archived', 'expired'].includes(status)) return false
    if (row.archived_at) return false
    const mod = String(row.moderation_state || 'approved').trim().toLowerCase()
    if (mod !== 'approved') return false
    return true
  })

  const sellerIds = Array.from(new Set(rows.map((r) => r.seller_id)))
  const sellerMap = {}
  for (let i = 0; i < sellerIds.length; i += 200) {
    const chunk = sellerIds.slice(i, i + 200)
    const { data: sellers, error: sellersErr } = await supabase
      .from('users')
      .select('id, email, full_name')
      .in('id', chunk)
    if (sellersErr) throw sellersErr
    for (const s of sellers || []) sellerMap[s.id] = s
  }

  return rows.map((row) => ({ ...row, seller: sellerMap[row.seller_id] || null }))
}

function buildEmailContent({ sellerName, listings, baseFront }) {
  const greeting = sellerName ? `Hola ${sellerName},` : 'Hola,'
  const itemsHtml = listings
    .map(
      (l) => `<li style="margin:0 0 8px;font-family:Helvetica,Arial,sans-serif;font-size:15px;color:#000000;">
        <a href="${baseFront}/listing/${encodeURIComponent(l.slug || l.id)}" style="color:#000000;text-decoration:underline;">${escapeHtml(l.title)}</a>
      </li>`,
    )
    .join('')
  const plural = listings.length > 1

  return `
  ${buildHeroSection({
    title: plural ? 'Extendimos tus publicaciones' : 'Extendimos tu publicación',
    subtitle: `${EXTEND_DAYS} días más, sin que hagas nada`,
    baseFront,
  })}
  <table align="center" border="0" cellpadding="0" cellspacing="0" role="presentation" style="width:100%;">
    <tr>
      <td class="mobile-padding" style="padding:0 30px 10px;">
        <p style="margin:0 0 16px;font-family:Helvetica,Arial,sans-serif;font-size:15px;line-height:150%;color:#000000;">
          ${escapeHtml(greeting)}
        </p>
        <p style="margin:0 0 16px;font-family:Helvetica,Arial,sans-serif;font-size:15px;line-height:150%;color:#000000;">
          ${plural ? 'Estas publicaciones tuyas' : 'Esta publicación tuya'} había vencido y ya no se mostraba en el Marketplace de Ciclo Market. La extendimos ${EXTEND_DAYS} días más para que sigas recibiendo consultas:
        </p>
        <ul style="margin:0 0 20px;padding-left:20px;">
          ${itemsHtml}
        </ul>
        <p style="margin:0 0 8px;font-family:Helvetica,Arial,sans-serif;font-size:15px;line-height:150%;color:#000000;">
          Si ya la vendiste o el precio cambió, aprovechá para actualizarla desde tu panel — así no perdés tiempo respondiendo consultas de algo que ya no está disponible.
        </p>
      </td>
    </tr>
  </table>
  ${buildCTAButton({ text: 'Marcar como vendida o mejorar precio', url: `${baseFront}/dashboard?tab=Publicaciones` })}
  `
}

async function main() {
  if (!isMailConfigured()) {
    console.error('Mail no configurado (BREVO_API_KEY / SMTP_* / RESEND_API_KEY). Abortando.')
    process.exit(1)
  }

  const supabase = getServerSupabaseClient()
  const rows = await fetchExpiredButActive(supabase)
  console.log(`[revive] ${rows.length} publicaciones vencidas-pero-activas encontradas.`)

  // Dedupe persistido: no le mandamos el mail de nuevo a una publicación que
  // ya fue avisada en los últimos DEDUP_WINDOW_DAYS días (email_logs).
  const alreadyEmailedIds = await fetchAlreadyEmailedListingIds(supabase, rows.map((r) => r.id))
  if (alreadyEmailedIds.size) {
    console.log(`[revive] ${alreadyEmailedIds.size} publicaciones ya avisadas en los últimos ${DEDUP_WINDOW_DAYS} días, se saltan del mail (igual se extiende expires_at).`)
  }
  const emailableRows = rows.filter((r) => !alreadyEmailedIds.has(String(r.id)))

  const bySeller = new Map()
  for (const row of emailableRows) {
    if (!bySeller.has(row.seller_id)) bySeller.set(row.seller_id, [])
    bySeller.get(row.seller_id).push(row)
  }
  console.log(`[revive] ${bySeller.size} vendedores distintos a notificar (post-dedupe).`)

  const nextExpiresIso = new Date(Date.now() + EXTEND_DAYS * 86400000).toISOString()
  const baseFront = resolveFrontendBaseUrl()

  if (DRY_RUN) {
    console.log('[revive] DRY RUN — no se actualiza la DB ni se manda mail.')
    for (const [sellerId, listings] of bySeller.entries()) {
      const seller = listings[0].seller
      console.log(`  - ${seller?.email || sellerId}: ${listings.map((l) => l.title).join(', ')}`)
    }
    return
  }

  if (EMAILS_ONLY) {
    console.log('[revive] --emails-only: no se toca expires_at (ya extendido en la corrida anterior).')
  } else {
    // 1) Extender expires_at de las 160 publicaciones.
    const ids = rows.map((r) => r.id)
    for (let i = 0; i < ids.length; i += 200) {
      const chunk = ids.slice(i, i + 200)
      const { error } = await supabase
        .from('listings')
        .update({ expires_at: nextExpiresIso })
        .in('id', chunk)
      if (error) throw error
    }
    console.log(`[revive] expires_at extendido a ${nextExpiresIso} para ${ids.length} publicaciones.`)
  }

  // 2) Un mail por vendedor (agrupa todas sus publicaciones extendidas).
  let sent = 0
  let failed = 0
  for (const [sellerId, listings] of bySeller.entries()) {
    const seller = listings[0].seller
    if (!seller?.email) {
      console.warn(`[revive] seller ${sellerId} sin email, se salta.`)
      continue
    }
    const content = buildEmailContent({ sellerName: seller.full_name, listings, baseFront })
    const html = buildBaseLayout({
      title: 'Extendimos tu publicación en Ciclo Market',
      content,
      baseFront,
      unsubscribeUrl: buildUnsubscribeLink(seller.email, baseFront),
      userEmail: seller.email,
      preheader: `${EXTEND_DAYS} días más para tu publicación en Ciclo Market`,
    })
    const subject =
      listings.length > 1
        ? `Extendimos ${listings.length} publicaciones tuyas ${EXTEND_DAYS} días más`
        : `Extendimos tu publicación "${listings[0].title}" ${EXTEND_DAYS} días más`

    try {
      await sendMail({ to: seller.email, subject, html })
      sent += 1
      // Registrar el envío por publicación para que una re-corrida (manual o
      // por un cron externo) no vuelva a mandar este mismo aviso.
      await Promise.all(listings.map((listing) => logEmailSent(supabase, { listing, seller, subject })))
    } catch (err) {
      failed += 1
      console.error(`[revive] mail a ${seller.email} falló:`, err?.message || err)
    }
    await sleep(SEND_DELAY_MS)
  }

  console.log(`[revive] listo. Mails enviados: ${sent}. Fallidos: ${failed}.`)
}

main()
  .then(() => process.exit(0))
  .catch((err) => {
    console.error('[revive] error fatal', err)
    process.exit(1)
  })
