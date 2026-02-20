#!/usr/bin/env node
const path = require('path')
const fs = require('fs')
const crypto = require('crypto')

try {
  const dotenv = require('dotenv')
  const serverEnvPath = path.resolve(__dirname, '../../.env') // server/.env
  const rootEnvPath = path.resolve(__dirname, '../../../.env') // repo-root .env

  let loaded = false
  if (fs.existsSync(serverEnvPath)) {
    dotenv.config({ path: serverEnvPath })
    loaded = true
  }
  if (fs.existsSync(rootEnvPath)) {
    dotenv.config({ path: rootEnvPath })
    loaded = true
  }
  if (!loaded) dotenv.config()
} catch {}

const { getServerSupabaseClient } = require('../../src/lib/supabaseClient')
const { sendMail, isMailConfigured } = require('../../src/lib/mail')
const { buildListingCardHtml } = require('../../src/emails/listingCard')

const SCENARIO_CODE = 'upsell_free_recent_whatsapp_v1'

function sleep(ms) {
  return new Promise((r) => setTimeout(r, ms))
}

function escapeHtml(value) {
  if (value === null || value === undefined) return ''
  return String(value)
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#39;')
}

function resolveFrontendBaseUrl() {
  const raw = (process.env.FRONTEND_URL || process.env.FRONTEND_URL_BASE || process.env.PUBLIC_FRONTEND_URL || '')
    .split(',')[0]
    ?.trim()
  if (!raw) return 'https://www.ciclomarket.ar'
  return raw.replace(/\/$/, '')
}

function resolveServerBaseUrl() {
  const raw = (
    process.env.PUBLIC_BASE_URL ||
    process.env.SERVER_BASE_URL ||
    process.env.API_BASE_URL ||
    process.env.RENDER_EXTERNAL_URL ||
    ''
  )
    .toString()
    .split(',')[0]
    .trim()
  if (!raw) return null
  return raw.replace(/\/$/, '')
}

function normalizePlan(value) {
  if (!value) return null
  const normalized = String(value)
    .toLowerCase()
    .normalize('NFD')
    .replace(/\p{Diacritic}/gu, '')
    .trim()
  if (!normalized) return null
  if (normalized === 'free' || normalized === 'gratis') return 'free'
  if (normalized === 'premium') return 'premium'
  if (normalized === 'pro' || normalized === 'profesional' || normalized === 'professional') return 'pro'
  if (normalized === 'basic' || normalized === 'basica' || normalized === 'destacada' || normalized === 'featured') return 'basic'
  return normalized
}

function isFreeListing(listing) {
  const values = [listing?.plan, listing?.plan_code, listing?.seller_plan]
  return values.some((v) => normalizePlan(v) === 'free')
}

function listingIsActive(listing) {
  const s = String(listing?.status || '').toLowerCase().trim()
  return !s || s === 'active' || s === 'published'
}

function listingNeedsWhatsapp(listing) {
  const enabled = listing?.whatsapp_enabled === true
  const userDisabled = listing?.whatsapp_user_disabled === true
  return !enabled || userDisabled
}

function chunkArray(values, chunkSize) {
  const out = []
  for (let i = 0; i < values.length; i += chunkSize) out.push(values.slice(i, i + chunkSize))
  return out
}

function parseArgs(argv) {
  const args = new Set(argv)
  const live = args.has('--live')
  const debug = args.has('--debug')
  const force = args.has('--force')
  const includeWhatsappEnabled = args.has('--include-whatsapp-enabled')
  const daysIndex = argv.findIndex((a) => a === '--days')
  const listingDays = daysIndex >= 0 ? Number(argv[daysIndex + 1]) : null
  const delayIndex = argv.findIndex((a) => a === '--delay')
  const delayMs = delayIndex >= 0 ? Number(argv[delayIndex + 1]) : null
  const limitIndex = argv.findIndex((a) => a === '--limit')
  const limit = limitIndex >= 0 ? Number(argv[limitIndex + 1]) : null
  const cooldownIndex = argv.findIndex((a) => a === '--cooldown-days')
  const cooldownDays = cooldownIndex >= 0 ? Number(argv[cooldownIndex + 1]) : null
  const testToIndex = argv.findIndex((a) => a === '--test-to')
  const testTo = testToIndex >= 0 ? String(argv[testToIndex + 1] || '').trim() : null
  const onlySellerIdIndex = argv.findIndex((a) => a === '--only-seller-id')
  const onlySellerId = onlySellerIdIndex >= 0 ? String(argv[onlySellerIdIndex + 1] || '').trim() : null

  return {
    live,
    debug,
    force,
    includeWhatsappEnabled,
    listingDays: Number.isFinite(listingDays) && listingDays > 0 ? listingDays : (Number(process.env.FREE_RECENT_LISTING_DAYS) || 20),
    cooldownDays: Number.isFinite(cooldownDays) && cooldownDays > 0 ? cooldownDays : (Number(process.env.WHATSAPP_UPSELL_COOLDOWN_DAYS) || 90),
    delayMs: Number.isFinite(delayMs) && delayMs >= 0 ? delayMs : (Number(process.env.CAMPAIGN_DELAY_MS) || 700),
    limit: Number.isFinite(limit) && limit > 0 ? Math.floor(limit) : null,
    testTo: testTo || null,
    onlySellerId: onlySellerId || null,
  }
}

async function fetchFreeRecentListings(supabase, listingDays, maxRows = 2500) {
  const sinceIso = new Date(Date.now() - listingDays * 24 * 60 * 60 * 1000).toISOString()
  const selectAttempts = [
    'id,seller_id,slug,title,price,price_currency,images,location,seller_location,plan,plan_code,seller_plan,whatsapp_enabled,whatsapp_user_disabled,status,created_at',
    'id,seller_id,slug,title,price,price_currency,images,plan,plan_code,seller_plan,whatsapp_enabled,whatsapp_user_disabled,status,created_at',
    'id,seller_id,slug,title,price,price_currency,images,plan,plan_code,seller_plan,status,created_at',
    'id,seller_id,slug,title,images,plan,plan_code,seller_plan,status,created_at',
    'id,seller_id,slug,title,plan,plan_code,seller_plan,status,created_at',
    'id,seller_id,slug,title,plan,plan_code,status,created_at',
    'id,seller_id,slug,title,plan,status,created_at',
    'id,seller_id,slug,title,status,created_at',
    'id,seller_id,slug,title',
    'id,seller_id',
  ]

  for (const sel of selectAttempts) {
    const res = await supabase
      .from('listings')
      .select(sel)
      .or('status.in.(active,published),status.is.null')
      .or('plan.eq.free,plan_code.eq.free,seller_plan.eq.free')
      .gte('created_at', sinceIso)
      .order('created_at', { ascending: false })
      .limit(maxRows)
    if (!res.error) return Array.isArray(res.data) ? res.data : []
  }

  const { error } = await supabase
    .from('listings')
    .select(selectAttempts[0])
    .or('status.in.(active,published),status.is.null')
    .or('plan.eq.free,plan_code.eq.free,seller_plan.eq.free')
    .gte('created_at', sinceIso)
    .order('created_at', { ascending: false })
    .limit(maxRows)
  if (error) throw new Error(`[freeRecentUpsell] Error fetching listings: ${error.message || String(error)}`)
  return []
}

async function fetchUsersMap(supabase, sellerIds) {
  if (!sellerIds.length) return new Map()
  const chunks = chunkArray(sellerIds.map(String), 500)
  const map = new Map()

  for (const chunk of chunks) {
    const { data, error } = await supabase
      .from('users')
      .select('id,email,full_name,store_enabled')
      .in('id', chunk)
    if (error) throw new Error(`[freeRecentUpsell] Error fetching users: ${error.message || String(error)}`)
    for (const row of data || []) {
      if (!row?.id) continue
      map.set(String(row.id), row)
    }
  }
  return map
}

async function fetchRecentSendsSetBySeller(supabase, sellerIds, cooldownDays) {
  if (!sellerIds.length) return new Set()
  const days = Number.isFinite(Number(cooldownDays)) && Number(cooldownDays) > 0 ? Number(cooldownDays) : 90
  const sinceIso = new Date(Date.now() - days * 24 * 60 * 60 * 1000).toISOString()

  const { data, error } = await supabase
    .from('marketing_automations')
    .select('seller_id')
    .eq('scenario', SCENARIO_CODE)
    .gte('sent_at', sinceIso)
    .in('seller_id', sellerIds.map(String))

  if (error) {
    console.warn('[freeRecentUpsell] no se pudo consultar marketing_automations (no dedupe)', error)
    return new Set()
  }

  return new Set((data || []).map((r) => r?.seller_id).filter(Boolean).map(String))
}

async function recordSend(supabase, listingId, sellerId, email) {
  try {
    const payload = {
      scenario: SCENARIO_CODE,
      listing_id: listingId ?? null,
      seller_id: sellerId ?? null,
      email_to: email ?? null,
      sent_at: new Date().toISOString(),
    }
    const { error } = await supabase.from('marketing_automations').insert(payload)
    if (error) {
      console.warn('[freeRecentUpsell] recordSend failed', error, payload)
      return false
    }
    return true
  } catch (err) {
    console.warn('[freeRecentUpsell] recordSend threw', err?.message || err)
    return false
  }
}

function signUpsellLink({ sellerId, listingId, planCode, expMs }) {
  const secret = String(process.env.CRON_SECRET || '').trim()
  if (!secret) return null
  const payload = `${sellerId}.${listingId}.${planCode}.${expMs}`
  return crypto.createHmac('sha256', secret).update(payload).digest('base64url')
}

function buildCheckoutUrl({ serverBase, sellerId, listingId, planCode, expMs }) {
  const token = signUpsellLink({ sellerId, listingId, planCode, expMs })
  if (!serverBase || !token) return null
  return `${serverBase}/api/checkout/upsell-whatsapp?sid=${encodeURIComponent(sellerId)}&lid=${encodeURIComponent(listingId)}&plan=${encodeURIComponent(planCode)}&exp=${encodeURIComponent(String(expMs))}&t=${encodeURIComponent(token)}`
}

function buildListingUrl(baseFront, listing) {
  const cleanBase = (baseFront || 'https://www.ciclomarket.ar').replace(/\/$/, '')
  const slugOrId = listing?.slug || listing?.id
  if (!slugOrId) return `${cleanBase}/marketplace`
  return `${cleanBase}/listing/${encodeURIComponent(String(slugOrId))}`
}

function buildEmailHtml({ baseFront, userName, listing, premiumUrl, proUrl, listingDays }) {
  const cleanBase = (baseFront || 'https://www.ciclomarket.ar').replace(/\/$/, '')
  const logoUrl = `${cleanBase}/site-logo.png`
  const safeName = escapeHtml(userName || 'Hola')
  const safeListingUrl = escapeHtml(buildListingUrl(cleanBase, listing))

  const listingCardHtml = (() => {
    try {
      return buildListingCardHtml(listing, cleanBase)
    } catch {
      return ''
    }
  })()

  return `
  <div style="background:#f3f4f6;margin:0;padding:0;font-family:Inter,Helvetica,Arial,sans-serif;color:#0f172a;">
    <span style="display:none!important;visibility:hidden;opacity:0;color:transparent;height:0;width:0;overflow:hidden;mso-hide:all">
      Activá WhatsApp en tu publicación y respondé más rápido para vender antes.
    </span>
    <table role="presentation" width="100%" cellspacing="0" cellpadding="0" border="0" style="background:#f3f4f6;padding:26px 0;">
      <tr>
        <td align="center" style="padding:0 12px;">
          <table role="presentation" width="600" cellspacing="0" cellpadding="0" border="0" style="width:600px;max-width:600px;">
            <tr>
              <td align="center" style="padding:10px 0 16px;">
                <img src="${logoUrl}" alt="Ciclo Market" style="height:44px;width:auto;display:block;border:0;" />
              </td>
            </tr>
            <tr>
              <td style="background:#ffffff;border-radius:18px;overflow:hidden;box-shadow:0 18px 38px rgba(15,23,42,0.10);border:1px solid #e5e7eb;">
                <table role="presentation" width="100%" cellspacing="0" cellpadding="0" border="0">
                  <tr>
                    <td style="background:#0b1220;">
                      <table role="presentation" width="100%" cellspacing="0" cellpadding="0" border="0">
                        <tr>
                          <td style="padding:18px 24px;">
                            <div style="display:inline-block;background:rgba(255,255,255,0.12);border:1px solid rgba(255,255,255,0.18);color:#e5e7eb;border-radius:999px;padding:6px 10px;font-size:11px;font-weight:800;letter-spacing:0.06em;text-transform:uppercase;">
                              Publicaste recientemente
                            </div>
                            <div style="margin-top:10px;font-size:18px;line-height:1.3;font-weight:900;color:#ffffff;">
                              ${safeName}, tu publicación sigue en Plan Gratis
                            </div>
                            <div style="margin-top:8px;font-size:13px;line-height:1.6;color:#cbd5e1;">
                              En los primeros ${escapeHtml(listingDays)} días se define la venta: WhatsApp acelera la respuesta y mejora la conversión.
                            </div>
                          </td>
                        </tr>
                      </table>
                    </td>
                  </tr>
                  <tr>
                    <td style="padding:16px 24px 10px;">
                      <div style="font-size:14px;line-height:1.7;color:#334155;">
                        Activá WhatsApp y ganá visibilidad. Los botones te llevan <strong>directo a Mercado Pago</strong> y el upgrade se aplica a <strong>esta publicación</strong>.
                      </div>
                    </td>
                  </tr>
                  <tr>
                    <td style="padding:0 24px 12px;">
                      ${listingCardHtml || ''}
                    </td>
                  </tr>
                  <tr>
                    <td style="padding:8px 24px 18px;">
                      <table role="presentation" width="100%" cellspacing="0" cellpadding="0" border="0">
                        <tr>
                          <td width="50%" style="width:50%;padding-right:7px;vertical-align:top;">
                            <table role="presentation" width="100%" cellspacing="0" cellpadding="0" border="0" style="border:1px solid #e5e7eb;border-radius:16px;overflow:hidden;box-shadow:0 10px 20px rgba(2,6,23,0.08);">
                              <tr>
                                <td style="padding:14px 14px;background:#ffffff;">
                                  <div style="font-size:12px;font-weight:900;color:#2563eb;text-transform:uppercase;letter-spacing:0.08em;">Plan Premium</div>
                                  <div style="margin-top:6px;font-size:13px;color:#334155;line-height:1.55;">
                                    Más visibilidad + WhatsApp para cerrar más rápido.
                                  </div>
                                  <div style="margin-top:12px;">
                                    <a href="${escapeHtml(premiumUrl)}" style="display:block;background:#2563eb;color:#ffffff;text-decoration:none;padding:12px 14px;border-radius:12px;font-weight:900;font-size:13px;text-align:center;">
                                      Pagar con Mercado Pago
                                    </a>
                                    <div style="margin-top:8px;font-size:11px;color:#94a3b8;text-align:center;">Se aplica a esta publicación</div>
                                  </div>
                                </td>
                              </tr>
                            </table>
                          </td>
                          <td width="50%" style="width:50%;padding-left:7px;vertical-align:top;">
                            <table role="presentation" width="100%" cellspacing="0" cellpadding="0" border="0" style="border:1px solid #e5e7eb;border-radius:16px;overflow:hidden;box-shadow:0 10px 20px rgba(2,6,23,0.08);">
                              <tr>
                                <td style="padding:14px 14px;background:#ffffff;">
                                  <div style="font-size:12px;font-weight:900;color:#7c3aed;text-transform:uppercase;letter-spacing:0.08em;">Plan Pro</div>
                                  <div style="margin-top:6px;font-size:13px;color:#334155;line-height:1.55;">
                                    Máxima exposición y mejor posicionamiento.
                                  </div>
                                  <div style="margin-top:12px;">
                                    <a href="${escapeHtml(proUrl)}" style="display:block;background:#7c3aed;color:#ffffff;text-decoration:none;padding:12px 14px;border-radius:12px;font-weight:900;font-size:13px;text-align:center;">
                                      Pagar con Mercado Pago
                                    </a>
                                    <div style="margin-top:8px;font-size:11px;color:#94a3b8;text-align:center;">Se aplica a esta publicación</div>
                                  </div>
                                </td>
                              </tr>
                            </table>
                          </td>
                        </tr>
                        <tr>
                          <td colspan="2" align="center" style="padding:12px 0 0;">
                            <a href="${safeListingUrl}" style="color:#334155;text-decoration:underline;font-size:12px;">Ver tu publicación</a>
                          </td>
                        </tr>
                      </table>
                    </td>
                  </tr>
                </table>
              </td>
            </tr>
            <tr>
              <td align="center" style="padding:16px 10px 0;color:#94a3b8;font-size:12px;line-height:1.6;">
                Este email es transaccional y fue enviado por Ciclo Market.
                <br />
                <a href="${cleanBase}" style="color:#94a3b8;text-decoration:underline;">ciclomarket.ar</a>
              </td>
            </tr>
          </table>
        </td>
      </tr>
    </table>
  </div>
  `
}

function buildEmailText({ baseFront, userName, listingTitle, premiumUrl, proUrl }) {
  const cleanBase = (baseFront || 'https://www.ciclomarket.ar').replace(/\/$/, '')
  const who = userName || 'Hola'
  return [
    `${who}, tu publicación sigue en Plan Gratis.`,
    'Activá WhatsApp y ganá visibilidad (pago directo con Mercado Pago; se aplica a esta publicación).',
    '',
    listingTitle ? `Tu publicación: ${listingTitle}` : null,
    premiumUrl ? `Premium (Mercado Pago): ${premiumUrl}` : null,
    proUrl ? `Pro (Mercado Pago): ${proUrl}` : null,
    '',
    cleanBase,
  ]
    .filter(Boolean)
    .join('\n')
}

async function main() {
  const { live, debug, force, includeWhatsappEnabled, listingDays, cooldownDays, delayMs, limit, testTo, onlySellerId } = parseArgs(
    process.argv.slice(2),
  )
  const dryRun = !live

  if (live && !isMailConfigured()) {
    console.error('[freeRecentUpsell] Mail no configurado. Definí RESEND_API_KEY o SMTP_* (ver server/.env.example)')
    process.exit(1)
  }

  const baseFront = resolveFrontendBaseUrl()
  const serverBase = resolveServerBaseUrl()
  if (!serverBase) {
    console.error('[freeRecentUpsell] Falta PUBLIC_BASE_URL/SERVER_BASE_URL para construir links a Mercado Pago')
    process.exit(1)
  }

  const supabase = getServerSupabaseClient()
  let listings = await fetchFreeRecentListings(supabase, listingDays, 2500)

  listings = listings.filter((l) => listingIsActive(l) && isFreeListing(l) && (includeWhatsappEnabled || listingNeedsWhatsapp(l)))

  if (onlySellerId) listings = listings.filter((l) => String(l?.seller_id || '') === onlySellerId)
  if (limit) listings = listings.slice(0, limit)

  const bySeller = new Map()
  for (const row of listings) {
    const sellerId = row?.seller_id ? String(row.seller_id) : null
    if (!sellerId) continue
    if (!bySeller.has(sellerId)) bySeller.set(sellerId, row)
  }

  let sellerIds = Array.from(bySeller.keys())
  if (!sellerIds.length) {
    console.info('[freeRecentUpsell] No se encontraron publicaciones free recientes para esta campaña', { listingDays })
    return
  }

  const users = await fetchUsersMap(supabase, sellerIds)
  const recentSends = (!force && !testTo) ? await fetchRecentSendsSetBySeller(supabase, sellerIds, cooldownDays) : new Set()
  if (recentSends.size) {
    console.info('[freeRecentUpsell] dedupe enabled', { scenario: SCENARIO_CODE, cooldownDays, alreadySent: recentSends.size })
  }

  let processed = 0
  let skippedCooldown = 0
  let skippedNoEmail = 0
  let attempted = 0
  let sent = 0
  let failed = 0

  for (const sellerId of sellerIds) {
    processed += 1
    if (!force && !testTo && recentSends.has(String(sellerId))) {
      skippedCooldown += 1
      console.log(`[${processed}/${sellerIds.length}] Saltando (ya enviado) seller_id=${sellerId}`)
      continue
    }

    const user = users.get(sellerId) || {}
    const emailRaw = typeof user.email === 'string' ? user.email.trim() : ''
    if (!emailRaw) {
      skippedNoEmail += 1
      console.log(`[${processed}/${sellerIds.length}] (sin email) seller_id=${sellerId}`)
      continue
    }

    const listing = bySeller.get(sellerId)
    const userName =
      (typeof user.full_name === 'string' && user.full_name.trim()) ||
      (emailRaw.includes('@') ? emailRaw.split('@')[0] : 'Vendedor')

    const expMs = Date.now() + 10 * 24 * 60 * 60 * 1000
    const premiumUrl = buildCheckoutUrl({ serverBase, sellerId, listingId: String(listing?.id), planCode: 'premium', expMs })
    const proUrl = buildCheckoutUrl({ serverBase, sellerId, listingId: String(listing?.id), planCode: 'pro', expMs })

    if (!premiumUrl || !proUrl) {
      console.error('[freeRecentUpsell] No se pudieron construir links firmados. Verificá CRON_SECRET y PUBLIC_BASE_URL.')
      process.exit(1)
    }

    const subjectBase = 'Activá WhatsApp en tu publicación y vendé más rápido'
    const subject = testTo ? `[TEST] ${subjectBase}` : subjectBase
    const targetTo = testTo || emailRaw

    const html = buildEmailHtml({
      baseFront,
      userName,
      listing,
      premiumUrl,
      proUrl,
      listingDays,
    })
    const text = buildEmailText({
      baseFront,
      userName,
      listingTitle: listing?.title || null,
      premiumUrl,
      proUrl,
    })

    attempted += 1
    const prefix = `[${processed}/${sellerIds.length}] Enviando free-recent upsell a ${userName} - "${listing?.title || 'Publicación'}"`

    if (debug) {
      console.info('[freeRecentUpsell][debug]', {
        sellerId,
        email: emailRaw,
        listingId: listing?.id,
        created_at: listing?.created_at || null,
        plan: listing?.plan || listing?.plan_code || listing?.seller_plan || null,
        whatsapp_enabled: listing?.whatsapp_enabled,
        whatsapp_user_disabled: listing?.whatsapp_user_disabled,
      })
    }

    if (dryRun) {
      console.log(`${prefix} — DRY RUN ✅ (${targetTo}${testTo ? ` (original: ${emailRaw})` : ''})`)
      continue
    }

    try {
      await sendMail({ to: targetTo, subject, html, text })
      if (!testTo) {
        const logged = await recordSend(supabase, listing?.id ?? null, sellerId, emailRaw)
        if (!logged) {
          console.error('[freeRecentUpsell] FATAL: se envió el mail pero no se pudo registrar en marketing_automations; abortando para evitar reenvíos.')
          process.exit(1)
        }
      }
      sent += 1
      console.log(`${prefix} ✅ (${targetTo}${testTo ? `, original: ${emailRaw}` : ''})`)
    } catch (e) {
      failed += 1
      console.warn(`${prefix} ❌`, e?.message || e)
    }

    if (delayMs) await sleep(delayMs)
  }

  console.info('[freeRecentUpsell] done', {
    dryRun,
    listingDays,
    cooldownDays,
    delayMs,
    sellers: sellerIds.length,
    processed,
    attempted,
    sent,
    failed,
    skippedCooldown,
    skippedNoEmail,
  })
}

if (require.main === module) {
  main().catch((e) => {
    console.error('[freeRecentUpsell] fatal', e)
    process.exit(1)
  })
}

module.exports = { main, buildEmailHtml, buildEmailText }

