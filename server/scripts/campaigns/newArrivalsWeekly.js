#!/usr/bin/env node
/**
 * "Nuevos ingresos de esta semana"
 * Digest semanal a usuarios opt-in de marketing. Un tope propio (RUN_LIMIT)
 * además del presupuesto diario compartido — el bug que originó todo esto
 * fue justo esta campaña mandando a toda la base (hasta 2000) de una sola
 * vez un viernes a la mañana.
 *
 * Disparo: Render Cron Job, viernes ~10:00 ART.
 *   node scripts/campaigns/newArrivalsWeekly.js
 */
require('dotenv').config({ path: require('path').join(__dirname, '..', '..', '.env') })

const { createUnsubscribeToken } = require('../../src/email/unsubscribe')
const { resolveBaseFront, buildLayout, buildListingCardHtml, runCampaign } = require('./_shared')

const CAMPAIGN = 'new_arrivals_weekly'
const RUN_LIMIT = Number(process.env.NEW_ARRIVALS_WEEKLY_RUN_LIMIT) || 100

function isoWeekOf(date) {
  const d = new Date(Date.UTC(date.getFullYear(), date.getMonth(), date.getDate()))
  const dayNum = d.getUTCDay() || 7
  d.setUTCDate(d.getUTCDate() + 4 - dayNum)
  const yearStart = new Date(Date.UTC(d.getUTCFullYear(), 0, 1))
  const week = Math.ceil((((d - yearStart) / 86400000) + 1) / 7)
  return { isoYear: d.getUTCFullYear(), isoWeek: week }
}

async function fetchRecentListings(supabase, sinceIso) {
  const { data, error } = await supabase
    .from('listings')
    .select('id,slug,title,images,price,price_currency,status,created_at')
    .in('status', ['active', 'published'])
    .gte('created_at', sinceIso)
    .order('created_at', { ascending: false })
    .limit(30)
  if (error) return []
  return data || []
}

async function fetchOptedInRecipients(supabase, limit) {
  const { data: settings } = await supabase
    .from('user_notification_settings')
    .select('user_id,marketing_emails,marketing_emails_enabled')
    .limit(2000)

  const enabledByUser = new Map()
  for (const row of settings || []) {
    const enabled = row?.marketing_emails_enabled !== false && row?.marketing_emails !== false
    enabledByUser.set(String(row.user_id), enabled)
  }

  const { data: users } = await supabase.from('users').select('id,email').limit(2000)
  return (users || [])
    .filter((u) => u?.email)
    .filter((u) => enabledByUser.get(String(u.id)) !== false) // default true si no hay preferencia explícita
    .slice(0, limit)
}

async function buildCandidates(supabase) {
  const now = new Date()
  const baseFront = resolveBaseFront()
  const since7d = new Date(now.getTime() - 7 * 24 * 60 * 60 * 1000).toISOString()
  const { isoYear, isoWeek } = isoWeekOf(now)

  const listings = await fetchRecentListings(supabase, since7d)
  if (!listings.length) return []

  const users = await fetchOptedInRecipients(supabase, RUN_LIMIT)
  if (!users.length) return []

  const cardsHtml = listings.slice(0, 8).map((l) => buildListingCardHtml(l, baseFront)).join('')
  const marketplaceUrl = `${baseFront}/marketplace`

  return users.map((user) => {
    const email = String(user.email).trim().toLowerCase()
    const unsubscribeToken = createUnsubscribeToken({ email, userId: user.id, exp: Date.now() + 180 * 24 * 60 * 60 * 1000 })
    const bodyHtml = `
${cardsHtml}
<div style="text-align:center;margin-top:18px">
  <a href="${marketplaceUrl}" style="display:inline-block;padding:12px 22px;background:#14212e;color:#fff;text-decoration:none;border-radius:999px;font-weight:600;font-size:14px">
    Ver más bicicletas
  </a>
</div>
<p style="font-size:12px;color:#94a3b8;text-align:center;margin-top:16px">
  <a href="${baseFront}/unsubscribe?token=${encodeURIComponent(unsubscribeToken)}" style="color:#94a3b8">Dejar de recibir este resumen semanal</a>
</p>`

    return {
      idempotencyKey: `${CAMPAIGN}:${user.id}:${isoYear}-${isoWeek}`,
      email,
      userId: user.id,
      subject: 'Nuevos ingresos de esta semana',
      html: buildLayout({
        baseFront,
        title: 'Nuevos ingresos de esta semana',
        introHtml: `Ingresaron ${listings.length} bicis esta semana en Ciclo Market. Encontrá nuevas oportunidades antes que nadie.`,
        bodyHtml,
      }),
      text: `Nuevos ingresos de esta semana en Ciclo Market: ${marketplaceUrl}`,
    }
  })
}

if (require.main === module) {
  runCampaign(CAMPAIGN, buildCandidates)
    .then(() => process.exit(0))
    .catch((err) => {
      console.error(`[${CAMPAIGN}] error fatal`, err)
      process.exit(1)
    })
}

module.exports = { buildCandidates }
