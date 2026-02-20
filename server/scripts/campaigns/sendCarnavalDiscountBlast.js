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

const SCENARIO_CODE = 'carnaval_discount_upsell_v1'

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

function isFreePlan(plan) {
  return normalizePlan(plan) === 'free'
}

function isPaidPlan(plan) {
  const canonical = normalizePlan(plan)
  return canonical === 'premium' || canonical === 'pro'
}

function formatMoney(amount, currency = 'ARS') {
  const n = Number(amount)
  if (!Number.isFinite(n) || n <= 0) return null
  const cur = typeof currency === 'string' && currency.trim() ? currency.trim().toUpperCase() : 'ARS'
  try {
    return new Intl.NumberFormat('es-AR', {
      style: 'currency',
      currency: cur,
      maximumFractionDigits: cur === 'ARS' ? 0 : 2,
    }).format(n)
  } catch {
    return `${n.toLocaleString('es-AR')} ${cur}`
  }
}

function signCarnavalLink({ sellerId, listingId, planCode, expMs }) {
  const secret = String(process.env.CRON_SECRET || '').trim()
  if (!secret) return null
  const payload = `${sellerId}.${listingId}.${planCode}.${expMs}`
  return crypto.createHmac('sha256', secret).update(payload).digest('base64url')
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
  const cooldownIndex = argv.findIndex((a) => a === '--cooldown-days')
  const cooldownDays = cooldownIndex >= 0 ? Number(argv[cooldownIndex + 1]) : null
  const lookbackIndex = argv.findIndex((a) => a === '--lookback-days')
  const lookbackDays = lookbackIndex >= 0 ? Number(argv[lookbackIndex + 1]) : null
  const delayIndex = argv.findIndex((a) => a === '--delay')
  const delayMs = delayIndex >= 0 ? Number(argv[delayIndex + 1]) : null
  const limitIndex = argv.findIndex((a) => a === '--limit')
  const limit = limitIndex >= 0 ? Number(argv[limitIndex + 1]) : null
  const testToIndex = argv.findIndex((a) => a === '--test-to')
  const testTo = testToIndex >= 0 ? String(argv[testToIndex + 1] || '').trim() : null
  const onlyEmailIndex = argv.findIndex((a) => a === '--only-email')
  const onlyEmail = onlyEmailIndex >= 0 ? String(argv[onlyEmailIndex + 1] || '').trim() : null
  const onlySellerIdIndex = argv.findIndex((a) => a === '--only-seller-id')
  const onlySellerId = onlySellerIdIndex >= 0 ? String(argv[onlySellerIdIndex + 1] || '').trim() : null

  return {
    live,
    debug,
    force,
    cooldownDays: Number.isFinite(cooldownDays) && cooldownDays > 0 ? cooldownDays : (Number(process.env.CARNAVAL_COOLDOWN_DAYS) || 30),
    lookbackDays: Number.isFinite(lookbackDays) && lookbackDays > 0 ? lookbackDays : (Number(process.env.CARNAVAL_LOOKBACK_DAYS) || 30),
    delayMs: Number.isFinite(delayMs) && delayMs >= 0 ? delayMs : (Number(process.env.CAMPAIGN_DELAY_MS) || 700),
    limit: Number.isFinite(limit) && limit > 0 ? Math.floor(limit) : null,
    testTo: testTo || null,
    onlyEmail: onlyEmail || null,
    onlySellerId: onlySellerId || null,
  }
}

async function fetchFreeListings(supabase, lookbackDays, maxRows = 1500) {
  const selectAttempts = [
    'id,seller_id,slug,title,price,price_currency,images,location,seller_location,plan,plan_code,seller_plan,status,created_at',
    'id,seller_id,slug,title,price,price_currency,images,plan,plan_code,seller_plan,status,created_at',
    'id,seller_id,slug,title,price,price_currency,images,plan,plan_code,seller_plan,status',
    'id,seller_id,slug,title,price,price_currency,images,plan,plan_code,seller_plan',
    'id,seller_id,slug,title,price,images,plan,plan_code',
    'id,seller_id,slug,title,images,plan,plan_code',
    'id,seller_id,slug,title,plan,plan_code',
    'id,seller_id,slug,title',
    'id,seller_id',
  ]

  const sinceIso = new Date(Date.now() - lookbackDays * 24 * 60 * 60 * 1000).toISOString()

  for (const sel of selectAttempts) {
    const res = await supabase
      .from('listings')
      .select(sel)
      .or('status.in.(active,published),status.is.null')
      .or('plan.eq.free,plan_code.eq.free,seller_plan.eq.free')
      .gte('created_at', sinceIso)
      .order('created_at', { ascending: false, nullsFirst: false })
      .limit(maxRows)
    if (!res.error) return Array.isArray(res.data) ? res.data : []
  }

  const fallback = await supabase
    .from('listings')
    .select('id,seller_id,slug,title,plan,plan_code,seller_plan,status,created_at')
    .or('status.in.(active,published),status.is.null')
    .or('plan.eq.free,plan_code.eq.free,seller_plan.eq.free')
    .gte('created_at', sinceIso)
    .order('created_at', { ascending: false })
    .limit(maxRows)

  if (fallback.error) throw new Error(`[carnaval] Error fetching listings: ${fallback.error.message || String(fallback.error)}`)
  return Array.isArray(fallback.data) ? fallback.data : []
}

async function fetchUsersMap(supabase, sellerIds) {
  if (!sellerIds.length) return new Map()
  const selectAttempts = [
    'id,email,full_name,store_enabled,plan,plan_code',
    'id,email,full_name,store_enabled,plan',
    'id,email,full_name,store_enabled',
    'id,email,full_name',
  ]

  const map = new Map()
  const chunks = chunkArray(sellerIds.map(String), 500)
  for (const chunk of chunks) {
    let data = null
    let lastError = null
    for (const sel of selectAttempts) {
      const res = await supabase.from('users').select(sel).in('id', chunk)
      if (!res.error) {
        data = res.data || []
        lastError = null
        break
      }
      lastError = res.error
    }
    if (lastError) throw new Error(`[carnaval] Error fetching users: ${lastError.message || String(lastError)}`)
    for (const row of data || []) {
      if (!row?.id) continue
      map.set(String(row.id), row)
    }
  }
  return map
}

async function fetchRecentSendsSetBySeller(supabase, scenarioCode, sellerIds, cooldownDays) {
  if (!sellerIds.length) return new Set()
  const days = Number.isFinite(Number(cooldownDays)) && Number(cooldownDays) > 0 ? Number(cooldownDays) : 30
  const sinceIso = new Date(Date.now() - days * 24 * 60 * 60 * 1000).toISOString()

  const sent = new Set()
  const chunks = chunkArray(sellerIds.map(String), 500)
  for (const chunk of chunks) {
    const { data, error } = await supabase
      .from('marketing_automations')
      .select('seller_id')
      .eq('scenario', scenarioCode)
      .gte('sent_at', sinceIso)
      .in('seller_id', chunk)
    if (error) {
      console.warn('[carnaval] no se pudo consultar marketing_automations (no dedupe)', error)
      return new Set()
    }
    for (const row of data || []) {
      if (!row?.seller_id) continue
      sent.add(String(row.seller_id))
    }
  }
  return sent
}

async function recordSend(supabase, scenarioCode, listingId, sellerId, email) {
  try {
    const payload = {
      scenario: scenarioCode,
      listing_id: listingId ?? null,
      seller_id: sellerId ?? null,
      email_to: email ?? null,
      sent_at: new Date().toISOString(),
    }
    const { error } = await supabase.from('marketing_automations').insert(payload)
    if (error) {
      console.warn('[carnaval] recordSend failed', error, payload)
      return false
    }
    return true
  } catch (err) {
    console.warn('[carnaval] recordSend threw', err?.message || err)
    return false
  }
}

function buildListingUrl(baseFront, listing) {
  const cleanBase = (baseFront || 'https://www.ciclomarket.ar').replace(/\/$/, '')
  const slugOrId = listing?.slug || listing?.id
  if (!slugOrId) return `${cleanBase}/marketplace`
  return `${cleanBase}/listing/${encodeURIComponent(String(slugOrId))}`
}

function buildCarnavalCheckoutUrl({ serverBase, sellerId, listingId, planCode, expMs }) {
  if (!serverBase) return null
  const token = signCarnavalLink({ sellerId, listingId, planCode, expMs })
  if (!token) return null
  return `${serverBase}/api/checkout/carnaval?sid=${encodeURIComponent(sellerId)}&lid=${encodeURIComponent(listingId)}&plan=${encodeURIComponent(planCode)}&exp=${encodeURIComponent(String(expMs))}&t=${encodeURIComponent(token)}`
}

function buildEmailHtml({ baseFront, userName, listing, premiumUrl, proUrl, premiumBase, proBase, premiumDiscounted, proDiscounted }) {
  const cleanBase = (baseFront || 'https://www.ciclomarket.ar').replace(/\/$/, '')
  const logoUrl = `${cleanBase}/site-logo.png`

  const safeName = escapeHtml(userName || 'Hola')
  const listingUrl = buildListingUrl(cleanBase, listing)
  const safeListingUrl = escapeHtml(listingUrl)

  const premiumBaseLabel = premiumBase ? formatMoney(premiumBase, 'ARS') : null
  const premiumNowLabel = premiumDiscounted ? formatMoney(premiumDiscounted, 'ARS') : null
  const proBaseLabel = proBase ? formatMoney(proBase, 'ARS') : null
  const proNowLabel = proDiscounted ? formatMoney(proDiscounted, 'ARS') : null
  const premiumSavings = premiumBase && premiumDiscounted ? Math.max(0, premiumBase - premiumDiscounted) : 0
  const proSavings = proBase && proDiscounted ? Math.max(0, proBase - proDiscounted) : 0
  const premiumSavingsLabel = premiumSavings ? formatMoney(premiumSavings, 'ARS') : null
  const proSavingsLabel = proSavings ? formatMoney(proSavings, 'ARS') : null

  const listingCardHtml = (() => {
    try {
      return buildListingCardHtml(listing, cleanBase)
    } catch {
      return ''
    }
  })()

  return `<!doctype html>
  <html>
  <head>
    <meta charset="utf-8" />
    <meta name="viewport" content="width=device-width,initial-scale=1" />
    <title>CARNAVAL · Descuento exclusivo</title>
  </head>
  <body style="margin:0;padding:0;background:#f3f4f6;font-family:-apple-system,BlinkMacSystemFont,'Segoe UI',Inter,Helvetica,Arial,sans-serif;color:#0f172a;">
    <span style="display:none!important;visibility:hidden;opacity:0;color:transparent;height:0;width:0;overflow:hidden;mso-hide:all">
      Activá WhatsApp y respondé más rápido. Descuento CARNAVAL aplicado directo a tu publicación.
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
                    <td style="background:#0b1220;padding:18px 24px;">
                      <div style="display:inline-block;background:linear-gradient(135deg,#fb7185,#f59e0b,#22c55e);color:#0b1220;border-radius:999px;padding:7px 12px;font-size:11px;font-weight:900;letter-spacing:0.06em;text-transform:uppercase;">
                        Promo CARNAVAL
                      </div>
                      <div style="margin-top:10px;font-size:18px;line-height:1.3;font-weight:900;color:#ffffff;">
                        ${safeName}, te están escribiendo por email por tu publicación.
                      </div>
                      <div style="margin-top:8px;font-size:13px;line-height:1.6;color:#cbd5e1;">
                        Y eso baja la conversión: el email es lento y poco práctico. Los compradores prefieren la inmediatez de WhatsApp y suelen elegir publicaciones con contacto directo.
                      </div>
                    </td>
                  </tr>
                  <tr>
                    <td style="padding:18px 24px 10px;">
                      <div style="font-size:14px;line-height:1.7;color:#334155;">
                        Activá un plan con descuento para <strong>mejorar visibilidad</strong> y habilitar <strong>WhatsApp</strong>.
                        Los botones te llevan <strong>directo a Mercado Pago</strong> y el upgrade se aplica automáticamente a <strong>esta</strong> publicación.
                      </div>
                    </td>
                  </tr>
                  <tr>
                    <td style="padding:0 24px 12px;">
                      ${listingCardHtml || ''}
                    </td>
                  </tr>
                  <tr>
                    <td style="padding:6px 24px 20px;">
                      <table role="presentation" width="100%" cellspacing="0" cellpadding="0" border="0">
                        <tr>
                          <td width="50%" style="width:50%;padding-right:7px;vertical-align:top;">
                            <table role="presentation" width="100%" cellspacing="0" cellpadding="0" border="0" style="border:1px solid #e5e7eb;border-radius:16px;overflow:hidden;box-shadow:0 10px 20px rgba(2,6,23,0.08);">
                              <tr>
                                <td style="padding:14px 14px;background:#ffffff;">
                                  <div style="font-size:12px;font-weight:900;color:#2563eb;text-transform:uppercase;letter-spacing:0.08em;">
                                    Premium <span style="color:#16a34a;">-40%</span> <span style="color:#0f172a;">· Recomendado</span>
                                  </div>
                                  <div style="margin-top:8px;font-size:12px;color:#64748b;">
                                    ${premiumBaseLabel ? `<span style="text-decoration:line-through;">${escapeHtml(premiumBaseLabel)}</span> ` : ''}${premiumNowLabel ? `<span style="font-weight:900;color:#0f172a;">${escapeHtml(premiumNowLabel)}</span>` : ''}
                                  </div>
                                  ${premiumSavingsLabel ? `<div style="margin-top:6px;font-size:12px;color:#16a34a;font-weight:900;">Ahorrás ${escapeHtml(premiumSavingsLabel)}</div>` : ''}
                                  <div style="margin-top:8px;font-size:13px;color:#334155;line-height:1.55;">
                                    Más visibilidad + WhatsApp para responder rápido y cerrar ventas.
                                  </div>
                                  <div style="margin-top:12px;">
                                    <a href="${escapeHtml(premiumUrl)}"
                                      style="display:block;background:linear-gradient(135deg,#2563eb,#4f46e5);color:#ffffff;text-decoration:none;padding:12px 14px;border-radius:12px;font-weight:900;font-size:13px;text-align:center;">
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
                                  <div style="font-size:12px;font-weight:900;color:#7c3aed;text-transform:uppercase;letter-spacing:0.08em;">
                                    Pro <span style="color:#16a34a;">-50%</span>
                                  </div>
                                  <div style="margin-top:8px;font-size:12px;color:#64748b;">
                                    ${proBaseLabel ? `<span style="text-decoration:line-through;">${escapeHtml(proBaseLabel)}</span> ` : ''}${proNowLabel ? `<span style="font-weight:900;color:#0f172a;">${escapeHtml(proNowLabel)}</span>` : ''}
                                  </div>
                                  ${proSavingsLabel ? `<div style="margin-top:6px;font-size:12px;color:#16a34a;font-weight:900;">Ahorrás ${escapeHtml(proSavingsLabel)}</div>` : ''}
                                  <div style="margin-top:8px;font-size:13px;color:#334155;line-height:1.55;">
                                    Máxima exposición y mejor posicionamiento para acelerar la venta.
                                  </div>
                                  <div style="margin-top:12px;">
                                    <a href="${escapeHtml(proUrl)}"
                                      style="display:block;background:linear-gradient(135deg,#7c3aed,#ec4899);color:#ffffff;text-decoration:none;padding:12px 14px;border-radius:12px;font-weight:900;font-size:13px;text-align:center;">
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
                            <a href="${safeListingUrl}" style="color:#334155;text-decoration:underline;font-size:12px;">
                              Ver tu publicación
                            </a>
                          </td>
                        </tr>
                      </table>
                    </td>
                  </tr>
                  <tr>
                    <td style="padding:0 24px 20px;">
                      <table role="presentation" width="100%" cellspacing="0" cellpadding="0" border="0" style="border:1px solid #e2e8f0;border-radius:16px;background:#f8fafc;">
                        <tr>
                          <td style="padding:14px 16px;">
                            <div style="font-size:12px;font-weight:900;color:#0f172a;text-transform:uppercase;letter-spacing:0.08em;margin-bottom:8px;">
                              Qué ganás al activar ahora
                            </div>
                            <div style="font-size:13px;line-height:1.7;color:#334155;">
                              • Más contactos por WhatsApp (respuesta inmediata)<br/>
                              • Mejor posicionamiento y visibilidad de tu publicación<br/>
                              • Pago seguro con Mercado Pago
                            </div>
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
  </body>
  </html>`
}

function buildEmailText({ baseFront, userName, listingTitle, premiumUrl, proUrl }) {
  const cleanBase = (baseFront || 'https://www.ciclomarket.ar').replace(/\/$/, '')
  const who = userName || 'Hola'
  return [
    `${who}, te están escribiendo por email por tu publicación.`,
    'Eso baja la conversión: el email es lento y poco práctico. Los compradores prefieren la inmediatez de WhatsApp.',
    'Promo CARNAVAL: Premium -40% / Pro -50% (pago directo con Mercado Pago, se aplica automáticamente a esta publicación).',
    '',
    listingTitle ? `Tu publicación: ${listingTitle}` : null,
    premiumUrl ? `Premium -40% (Mercado Pago): ${premiumUrl}` : null,
    proUrl ? `Pro -50% (Mercado Pago): ${proUrl}` : null,
    '',
    cleanBase,
  ]
    .filter(Boolean)
    .join('\n')
}

function listingIsActive(listing) {
  const s = String(listing?.status || '').toLowerCase().trim()
  return !s || s === 'active' || s === 'published'
}

function pickHero(existing, candidate) {
  if (!candidate) return existing
  if (!existing) return candidate
  const at = String(existing?.created_at || '')
  const bt = String(candidate?.created_at || '')
  if (bt > at) return candidate
  const a = Number(existing?.price) || 0
  const b = Number(candidate?.price) || 0
  if (b > a) return candidate
  return existing
}

async function main() {
  const { live, debug, force, cooldownDays, lookbackDays, delayMs, limit, testTo, onlyEmail, onlySellerId } = parseArgs(
    process.argv.slice(2),
  )
  const dryRun = !live

  if (live && !isMailConfigured()) {
    console.error('[carnaval] Mail no configurado. Definí RESEND_API_KEY o SMTP_* (ver server/.env.example)')
    process.exit(1)
  }

  const baseFront = resolveFrontendBaseUrl()
  const serverBase = resolveServerBaseUrl()
  if (!serverBase) {
    console.error('[carnaval] Falta PUBLIC_BASE_URL/SERVER_BASE_URL para construir links a Mercado Pago')
    process.exit(1)
  }
  if (!String(process.env.CRON_SECRET || '').trim()) {
    console.error('[carnaval] Falta CRON_SECRET para firmar links')
    process.exit(1)
  }

  const supabase = getServerSupabaseClient()

  let listings = await fetchFreeListings(supabase, lookbackDays, 1500)
  listings = listings.filter(listingIsActive)
  if (!listings.length) {
    console.info('[carnaval] No se encontraron publicaciones free activas en el período', { lookbackDays })
    return
  }

  const bySeller = new Map()
  for (const row of listings) {
    const sellerId = row?.seller_id ? String(row.seller_id) : null
    if (!sellerId) continue
    bySeller.set(sellerId, pickHero(bySeller.get(sellerId), row))
  }

  let sellerIds = Array.from(bySeller.keys())

  if (onlyEmail) {
    const needle = onlyEmail.trim().toLowerCase()
    const { data, error } = await supabase.from('users').select('id,email').ilike('email', needle).limit(5)
    if (error) {
      console.error('[carnaval] Error buscando user por email', error?.message || error)
      process.exit(1)
    }
    const match = (data || []).find((r) => (r?.email ? String(r.email).trim().toLowerCase() : '') === needle)
    const resolvedId = match?.id ? String(match.id) : null
    if (!resolvedId) {
      console.error('[carnaval] No se encontró seller para --only-email', { onlyEmail })
      process.exit(1)
    }
    if (!bySeller.has(resolvedId)) {
      console.error('[carnaval] El seller existe, pero no tiene publicaciones free activas para esta campaña', { onlyEmail, sellerId: resolvedId })
      process.exit(1)
    }
    sellerIds = [resolvedId]
  } else if (onlySellerId) {
    sellerIds = sellerIds.filter((id) => String(id) === onlySellerId)
  } else if (limit) {
    sellerIds = sellerIds.slice(0, limit)
  }

  const users = await fetchUsersMap(supabase, sellerIds)

  // Filter out already paid users (extra safety).
  sellerIds = sellerIds.filter((id) => {
    const u = users.get(id)
    const planCandidate = u?.plan || u?.plan_code || bySeller.get(id)?.plan_code || bySeller.get(id)?.plan || bySeller.get(id)?.seller_plan
    return !isPaidPlan(planCandidate) && (isFreePlan(planCandidate) || isFreePlan(bySeller.get(id)?.plan_code) || true)
  })

  if (!sellerIds.length) {
    console.info('[carnaval] No hay sellers target luego de filtros')
    return
  }

  const recentSends = (!force && !testTo) ? await fetchRecentSendsSetBySeller(supabase, SCENARIO_CODE, sellerIds, cooldownDays) : new Set()
  if (recentSends.size) {
    console.info('[carnaval] dedupe enabled', { scenario: SCENARIO_CODE, cooldownDays, alreadySent: recentSends.size })
  }

  // Prices for displaying in email (derive from AVAILABLE_PLANS if present).
  const premiumBase = (() => {
    const raw = process.env.AVAILABLE_PLANS
    if (!raw) return 0
    try {
      const trimmed = String(raw).trim()
      const unquoted =
        (trimmed.startsWith('"') && trimmed.endsWith('"')) || (trimmed.startsWith("'") && trimmed.endsWith("'"))
          ? trimmed.slice(1, -1)
          : trimmed
      const normalized = unquoted.replace(/\\n/g, '\n')
      const parsed = JSON.parse(normalized)
      const arr = Array.isArray(parsed) ? parsed : []
      const match = arr.find((p) => String(p?.code || p?.id || '').trim().toLowerCase() === 'premium')
      return typeof match?.price === 'number' ? Number(match.price) : 0
    } catch {
      return 0
    }
  })()

  const proBase = (() => {
    const raw = process.env.AVAILABLE_PLANS
    if (!raw) return 0
    try {
      const trimmed = String(raw).trim()
      const unquoted =
        (trimmed.startsWith('"') && trimmed.endsWith('"')) || (trimmed.startsWith("'") && trimmed.endsWith("'"))
          ? trimmed.slice(1, -1)
          : trimmed
      const normalized = unquoted.replace(/\\n/g, '\n')
      const parsed = JSON.parse(normalized)
      const arr = Array.isArray(parsed) ? parsed : []
      const match = arr.find((p) => String(p?.code || p?.id || '').trim().toLowerCase() === 'pro')
      return typeof match?.price === 'number' ? Number(match.price) : 0
    } catch {
      return 0
    }
  })()

  const premiumDiscounted = premiumBase ? Math.max(1, Math.round(premiumBase * 0.6)) : 0
  const proDiscounted = proBase ? Math.max(1, Math.round(proBase * 0.5)) : 0

  let processed = 0
  let skippedCooldown = 0
  let skippedNoEmail = 0
  let attempted = 0
  let sent = 0
  let failed = 0

  for (let idx = 0; idx < sellerIds.length; idx += 1) {
    const sellerId = sellerIds[idx]
    processed += 1

    if (!force && !testTo && recentSends.has(String(sellerId))) {
      skippedCooldown += 1
      console.log(`[${processed}/${sellerIds.length}] Saltando (ya enviado) seller_id=${sellerId}`)
      continue
    }

    const listing = bySeller.get(sellerId)
    const user = users.get(sellerId) || {}
    const emailRaw = typeof user.email === 'string' ? user.email.trim() : ''
    if (!emailRaw) {
      skippedNoEmail += 1
      console.log(`[${processed}/${sellerIds.length}] (sin email) seller_id=${sellerId}`)
      continue
    }

    const userName =
      (typeof user.full_name === 'string' && user.full_name.trim()) ||
      (emailRaw.includes('@') ? emailRaw.split('@')[0] : 'Vendedor')

    const expMs = Date.now() + 10 * 24 * 60 * 60 * 1000
    const premiumUrl = buildCarnavalCheckoutUrl({
      serverBase,
      sellerId,
      listingId: String(listing?.id),
      planCode: 'premium',
      expMs,
    })
    const proUrl = buildCarnavalCheckoutUrl({
      serverBase,
      sellerId,
      listingId: String(listing?.id),
      planCode: 'pro',
      expMs,
    })

    if (!premiumUrl || !proUrl) {
      console.error('[carnaval] No se pudieron construir links firmados. Verificá CRON_SECRET y PUBLIC_BASE_URL.')
      process.exit(1)
    }

    const subjectBase = 'Activá WhatsApp en tu publicación (Promo CARNAVAL -40%/-50%)'
    const subject = testTo ? `[TEST] ${subjectBase}` : subjectBase
    const targetTo = testTo || emailRaw
    const prefix = `[${processed}/${sellerIds.length}] Enviando CARNAVAL a ${userName} - "${listing?.title || 'Publicación'}"`

    const html = buildEmailHtml({
      baseFront,
      userName,
      listing,
      premiumUrl,
      proUrl,
      premiumBase,
      proBase,
      premiumDiscounted,
      proDiscounted,
    })
    const text = buildEmailText({
      baseFront,
      userName,
      listingTitle: listing?.title || null,
      premiumUrl,
      proUrl,
    })

    attempted += 1

    if (dryRun) {
      console.log(`${prefix} — DRY RUN ✅ (${targetTo}${testTo ? ` (original: ${emailRaw})` : ''})`)
      continue
    }

    try {
      await sendMail({ to: targetTo, subject, html, text })
      if (!testTo) {
        const logged = await recordSend(supabase, SCENARIO_CODE, listing?.id ?? null, sellerId, emailRaw)
        if (!logged) {
          console.error('[carnaval] FATAL: se envió el mail pero no se pudo registrar en marketing_automations; abortando para evitar reenvíos.')
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

  console.info('[carnaval] done', {
    dryRun,
    lookbackDays,
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
    console.error('[carnaval] fatal', e)
    process.exit(1)
  })
}

module.exports = { main, buildEmailHtml, buildEmailText }
