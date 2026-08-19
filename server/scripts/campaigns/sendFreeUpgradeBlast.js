#!/usr/bin/env node
/**
 * sendFreeUpgradeBlast.js — Blast manual ÚNICO: mail de descuento de upgrade
 * a todas las bicis FREE publicadas en los últimos N días que NO hicieron upgrade.
 *
 * Uso (desde el entorno del server, con credenciales en server/.env o Render):
 *   node scripts/campaigns/sendFreeUpgradeBlast.js --dry-run
 *   node scripts/campaigns/sendFreeUpgradeBlast.js --days 7
 *   node scripts/campaigns/sendFreeUpgradeBlast.js --days 7 --limit 100
 *   node scripts/campaigns/sendFreeUpgradeBlast.js --days 7 --to test@example.com
 *
 * Reglas:
 *   - Solo listings FREE (plan free, sin pago asociado), activos/publicados.
 *   - Ventana: created_at >= hoy - days (default 7).
 *   - Dedupe: UNA sola vez por usuario. Usa la misma idempotency_key que la
 *     campaña automática (free_upgrade_offer:{email}), así nadie recibe el mail
 *     dos veces (ni por este blast ni por la campaña diaria).
 *   - Mismo checkout MercadoPago con descuento (20% individual / 50% bundle).
 */

const path = require('path')
const fs = require('fs')

const envPath = path.join(__dirname, '..', '..', '.env')
if (fs.existsSync(envPath)) {
  require('dotenv').config({ path: envPath })
} else {
  require('dotenv').config()
}

const {
  createUpgradeToken,
  createBundleUpgradeToken,
  resolvePlanPrice,
} = require('../../src/email/mercadopagoCheckout')
const { getServerSupabaseClient } = require('../../src/lib/supabaseClient')
const { sendMail, isMailConfigured } = require('../../src/lib/mail')
const { renderEmailTemplate } = require('../../src/email/templateRenderer')

const CAMPAIGN = 'free_upgrade_offer'
const DISCOUNT_PCT = 20
const BUNDLE_DISCOUNT_PCT = 50
const TOKEN_TTL_MS = 7 * 24 * 60 * 60 * 1000
const SLEEP_MS = 1500 // rate limit Resend

function getArgs() {
  const args = {}
  for (let i = 2; i < process.argv.length; i++) {
    const arg = process.argv[i]
    if (arg.startsWith('--')) {
      const key = arg.slice(2)
      const next = process.argv[i + 1]
      if (next && !next.startsWith('--')) { args[key] = next; i++ } else { args[key] = true }
    }
  }
  return args
}

const args = getArgs()
const DAYS = Math.max(1, Number(args.days) || 7)
const LIMIT = Number(args.limit) || 500
const DRY_RUN = args['dry-run'] === true
const TEST_TO = args.to ? String(args.to).trim().toLowerCase() : null

const baseFront = (String(process.env.FRONTEND_URL || 'https://www.ciclomarket.ar').split(',')[0] || '').replace(/\/$/, '')
const serverBase = String(process.env.SERVER_BASE_URL || process.env.PUBLIC_BASE_URL || 'https://ciclo-market.onrender.com').replace(/\/$/, '')

function isFreePlan(listing) {
  const plan = String(listing?.plan || '').toLowerCase()
  const planCode = String(listing?.plan_code || '').toLowerCase()
  const sellerPlan = String(listing?.seller_plan || '').toLowerCase()
  if (plan && plan !== 'free') return false
  if (planCode && planCode !== 'free') return false
  if (sellerPlan && sellerPlan !== 'free') return false
  return plan === 'free' || planCode === 'free' || sellerPlan === 'free'
}

function buildFeatureChecklist() {
  return [
    'WhatsApp habilitado para contacto directo',
    'Más visibilidad en resultados del marketplace',
    'Tu anuncio aparece más arriba',
    'Destaque visual y mejor confianza',
  ]
}

async function fetchTargets(supabase) {
  const since = new Date(Date.now() - DAYS * 24 * 60 * 60 * 1000).toISOString()
  const { data, error } = await supabase
    .from('listings')
    .select('id,slug,seller_id,title,images,price,price_currency,plan,plan_code,seller_plan,status,is_demo_listing,created_at')
    .in('status', ['active', 'published'])
    .eq('is_demo_listing', false)
    .gte('created_at', since)
    .order('created_at', { ascending: false })
    .limit(3000)

  if (error) {
    console.error('[freeUpgradeBlast] listings error', error.message)
    return []
  }

  const free = (data || []).filter(isFreePlan).filter((l) => l.seller_id)
  if (!free.length) return []

  const ids = free.map((l) => l.id)
  const { data: payments } = await supabase
    .from('payments')
    .select('listing_id')
    .in('listing_id', ids)
  const paidIds = new Set((payments || []).map((p) => p.listing_id))

  return free.filter((l) => !paidIds.has(l.id))
}

async function loadAlreadySent(supabase, emails) {
  if (!emails.length) return new Set()
  const keys = emails.map((e) => `${CAMPAIGN}:${e}`)
  const { data } = await supabase
    .from('email_logs')
    .select('idempotency_key')
    .in('idempotency_key', keys)
    .eq('status', 'sent')
  return new Set((data || []).map((r) => String(r.idempotency_key)))
}

async function logSent(supabase, { email, userId, listingId, subject }) {
  const now = new Date()
  const start = new Date(Date.UTC(now.getFullYear(), 0, 1))
  const isoYear = now.getUTCFullYear()
  const isoWeek = Math.ceil((((now - start) / 86400000) + start.getUTCDay() + 1) / 7)
  await supabase.from('email_logs').insert({
    campaign: CAMPAIGN,
    priority: 1,
    user_id: userId || null,
    email_to: email,
    listing_id: listingId || null,
    idempotency_key: `${CAMPAIGN}:${email}`,
    iso_year: isoYear,
    iso_week: isoWeek,
    status: 'sent',
    provider: 'smtp',
    subject: subject || null,
    metadata: { source: 'free_upgrade_blast' },
  }).catch((err) => console.warn('[freeUpgradeBlast] log insert failed', err?.message || err))
}

function sleep(ms) {
  return new Promise((r) => setTimeout(r, ms))
}

async function main() {
  if (!isMailConfigured() && !DRY_RUN) {
    console.error('❌ Mail no configurado: falta RESEND_API_KEY o SMTP_* (server/.env o Render).')
    process.exit(1)
  }

  const supabase = getServerSupabaseClient()
  const targets = await fetchTargets(supabase)
  console.log(`[freeUpgradeBlast] Ventana: últimos ${DAYS} días · Listings free sin pago: ${targets.length}`)
  if (!targets.length) return

  const sellerIds = [...new Set(targets.map((l) => l.seller_id).filter(Boolean))]
  const { data: users } = await supabase.from('users').select('id,email,full_name').in('id', sellerIds)
  const usersMap = new Map((users || []).map((u) => [String(u.id), u]))

  const bySeller = new Map()
  for (const l of targets) {
    if (!bySeller.has(l.seller_id)) bySeller.set(l.seller_id, [])
    bySeller.get(l.seller_id).push(l)
  }

  const sellerEntries = [...bySeller.entries()]
    .map(([sellerId, listings]) => {
      const user = usersMap.get(String(sellerId))
      const email = String(user?.email || '').trim().toLowerCase()
      return { sellerId, listings, user, email }
    })
    .filter((x) => x.email)
    .sort((a, b) => {
      const aNew = Math.max(...a.listings.map((l) => new Date(l.created_at || 0).getTime()))
      const bNew = Math.max(...b.listings.map((l) => new Date(l.created_at || 0).getTime()))
      return bNew - aNew
    })
    .slice(0, LIMIT)

  const alreadySent = await loadAlreadySent(supabase, sellerEntries.map((x) => x.email))
  const pending = sellerEntries.filter((x) => !alreadySent.has(`${CAMPAIGN}:${x.email}`))

  console.log(`[freeUpgradeBlast] Destinatarios únicos: ${sellerEntries.length} · ya enviados: ${alreadySent.size} · a enviar: ${pending.length}`)

  if (DRY_RUN) {
    for (const { email, listings } of pending.slice(0, 10)) {
      console.log(`  [dry-run] ${email} · ${listings.length} publicación(es) · "${listings[0].title}"`)
    }
    if (pending.length > 10) console.log(`  ... y ${pending.length - 10} más`)
    console.log('Dry-run OK (no se envió nada).')
    return
  }

  let sent = 0
  let failed = 0
  for (const { sellerId, listings, email } of pending) {
    const primary = listings[0]
    const recipient = TEST_TO || email

    const cards = listings.slice(0, 8).map((l) => ({
      id: l.id,
      slug: l.slug,
      title: l.title,
      image: l.images?.[0],
      price: l.price,
      price_currency: l.price_currency,
      link: `${baseFront}/listing/${encodeURIComponent(l.slug || l.id)}`,
      planBadge: 'Free',
    }))

    let planOffers
    let isBundle = false
    let subject

    if (listings.length >= 2) {
      isBundle = true
      const count = listings.length
      const listingIds = listings.map((l) => l.id)
      planOffers = ['premium', 'pro'].map((planCode) => {
        const unitPrice = resolvePlanPrice(planCode)
        const original = unitPrice * count
        const token = createBundleUpgradeToken({
          userId: sellerId,
          listingIds,
          planCode,
          campaign: CAMPAIGN,
          discountPct: BUNDLE_DISCOUNT_PCT,
          exp: Date.now() + TOKEN_TTL_MS,
        })
        return {
          planCode,
          title: planCode === 'pro' ? 'Plan Pro Bundle' : 'Plan Premium Bundle',
          subtitle: `${count} publicaciones · ${BUNDLE_DISCOUNT_PCT}% OFF`,
          originalPrice: original,
          discountPrice: Math.round(original * (1 - BUNDLE_DISCOUNT_PCT / 100)),
          highlighted: planCode === 'premium',
          url: `${serverBase}/api/checkout/bundle-upgrade?token=${encodeURIComponent(token)}`,
          bundle: true,
          count,
          unitPrice,
        }
      })
      subject = `Tenés ${count} publicaciones en plan Free`
    } else {
      planOffers = [{
        listingId: primary.id,
        listingTitle: primary.title,
        plans: ['premium', 'pro'].map((planCode) => {
          const original = resolvePlanPrice(planCode)
          const discounted = Math.round(original * (1 - DISCOUNT_PCT / 100))
          const token = createUpgradeToken({
            userId: sellerId,
            listingId: primary.id,
            planCode,
            campaign: CAMPAIGN,
            discountPct: DISCOUNT_PCT,
            exp: Date.now() + TOKEN_TTL_MS,
          })
          return {
            planCode,
            title: planCode === 'pro' ? 'Plan Pro' : 'Plan Premium',
            originalPrice: original,
            discountPrice: discounted,
            highlighted: planCode === 'premium',
            url: `${serverBase}/api/checkout/listing-upgrade?token=${encodeURIComponent(token)}`,
            listingId: primary.id,
          }
        }),
      }]
      subject = 'Mejorá tu publicación con un upgrade de plan'
    }

    const rendered = renderEmailTemplate({
      campaign: CAMPAIGN,
      baseFront,
      recipient: { email: recipient, userId: sellerId },
      payload: {
        subject,
        title: isBundle ? `Tenés ${listings.length} publicaciones en plan Free` : 'Tu publicación está en plan Free',
        subtitle: 'Pasate a Premium o Pro con descuento y conseguí más visibilidad y contacto directo con compradores.',
        intro: 'Vimos que publicaste en el plan gratuito y todavía no activaste el upgrade. Aprovechá este descuento por tiempo limitado y vendé más rápido.',
        cards,
        features: buildFeatureChecklist(),
        planOffers,
        isBundle,
        ctas: [],
        unsubscribeUrl: `${serverBase}/unsubscribe?token=preview`,
      },
    })

    try {
      await sendMail({
        from: process.env.SMTP_FROM || 'Ciclo Market | El marketplace de ciclismo de Argentina <avisos@ciclomarket.ar>',
        to: recipient,
        subject,
        html: rendered.html,
        text: rendered.text,
      })
      if (TEST_TO) {
        console.log(`✅ [TEST→${recipient}] ${subject}`)
      } else {
        console.log(`✅ ${recipient} · "${primary.title}"`)
        await logSent(supabase, { email, userId: sellerId, listingId: primary.id, subject })
      }
      sent += 1
    } catch (err) {
      console.error(`❌ ${recipient}: ${err?.message || err}`)
      failed += 1
    }
    await sleep(SLEEP_MS)
  }

  console.log(`[freeUpgradeBlast] Finalizado · enviados: ${sent} · fallidos: ${failed}`)
}

main().catch((err) => {
  console.error('[freeUpgradeBlast] error', err)
  process.exit(1)
})
