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

const SCENARIO_CODE = 'upsell_whatsapp_contacts_v1'

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

function signUpsellLink({ sellerId, listingId, planCode, expMs }) {
  const secret = String(process.env.UPSELL_WHATSAPP_LINK_SECRET || process.env.CRON_SECRET || '').trim()
  if (!secret) return null
  const payload = `${sellerId}.${listingId}.${planCode}.${expMs}`
  return crypto.createHmac('sha256', secret).update(payload).digest('base64url')
}

function isUuid(value) {
  return /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i.test(String(value || ''))
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
    cooldownDays: Number.isFinite(cooldownDays) && cooldownDays > 0
      ? cooldownDays
      : (Number(process.env.WHATSAPP_UPSELL_COOLDOWN_DAYS) || 90),
    lookbackDays: Number.isFinite(lookbackDays) && lookbackDays > 0
      ? lookbackDays
      : (Number(process.env.WHATSAPP_UPSELL_LOOKBACK_DAYS) || 30),
    delayMs: Number.isFinite(delayMs) && delayMs >= 0 ? delayMs : (Number(process.env.CAMPAIGN_DELAY_MS) || 500),
    limit: Number.isFinite(limit) && limit > 0 ? Math.floor(limit) : null,
    testTo: testTo || null,
    onlyEmail: onlyEmail || null,
    onlySellerId: onlySellerId || null,
  }
}

async function fetchEmailContactEvents(supabase, lookbackDays) {
  const pageSize = Math.max(1, Math.min(1000, Number(process.env.CAMPAIGN_PAGE_SIZE) || 1000))
  const maxPages = Math.max(1, Math.min(200, Number(process.env.CAMPAIGN_MAX_PAGES) || 200))
  const sinceIso = new Date(Date.now() - lookbackDays * 24 * 60 * 60 * 1000).toISOString()

  const sources = ['contact_events_enriched', 'contacts_events_enriched']
  const selectAttempts = [
    'seller_id,listing_id,type,created_at',
    'seller_id,listing_id,type',
    'seller_id,listing_id,created_at',
    'seller_id,listing_id',
  ]

  for (const source of sources) {
    let resolvedSelect = null
    const rows = []
    let lastError = null

    for (let page = 0; page < maxPages; page += 1) {
      const from = page * pageSize
      const to = from + pageSize - 1

      let data = null
      let error = null

      if (!resolvedSelect) {
        for (const sel of selectAttempts) {
          const res = await supabase
            .from(source)
            .select(sel)
            .eq('type', 'email')
            .gte('created_at', sinceIso)
            .range(from, to)
          if (!res.error) {
            resolvedSelect = sel
            data = res.data
            error = null
            break
          }
          error = res.error
        }
      } else {
        const res = await supabase
          .from(source)
          .select(resolvedSelect)
          .eq('type', 'email')
          .gte('created_at', sinceIso)
          .range(from, to)
        data = res.data
        error = res.error
      }

      if (error) {
        lastError = error
        break
      }

      const batch = Array.isArray(data) ? data : []
      rows.push(...batch)
      if (batch.length < pageSize) break
    }

    if (!lastError) return rows

    const msg = String(lastError?.message || '')
    if (!/does not exist/i.test(msg) && !/42P01/i.test(msg) && !/relation/i.test(msg)) {
      throw new Error(`[upsellWhatsapp] Error fetching ${source}: ${msg || JSON.stringify(lastError)}`)
    }
  }

  throw new Error(
    "[upsellWhatsapp] No existe la vista 'contact_events_enriched' (ver supabase/migrations/20260209_view_contact_events_enriched.sql)."
  )
}

async function fetchListingsByIds(supabase, listingIds) {
  if (!listingIds.length) return new Map()

  const selectAttempts = [
    'id,seller_id,slug,title,price,price_currency,images,location,seller_location,whatsapp_enabled,whatsapp_user_disabled,status,created_at',
    'id,seller_id,slug,title,price,price_currency,images,location,seller_location,whatsapp_enabled,status,created_at',
    'id,seller_id,slug,title,price,price_currency,images,whatsapp_enabled,status',
    'id,seller_id,slug,title,price,price_currency,images,status',
    'id,seller_id,slug,title,price,price_currency,images',
    'id,seller_id,slug,title,price,images',
    'id,seller_id,slug,title',
    'id,seller_id',
  ]

  const chunks = chunkArray(listingIds, 500)
  let resolvedSelect = null
  const map = new Map()

  for (const chunk of chunks) {
    let data = null
    let lastError = null
    if (!resolvedSelect) {
      for (const sel of selectAttempts) {
        const res = await supabase.from('listings').select(sel).in('id', chunk)
        if (!res.error) {
          resolvedSelect = sel
          data = res.data || []
          lastError = null
          break
        }
        lastError = res.error
      }
    } else {
      const res = await supabase.from('listings').select(resolvedSelect).in('id', chunk)
      data = res.data || []
      lastError = res.error
    }
    if (lastError) throw new Error(`[upsellWhatsapp] Error fetching listings: ${lastError.message || String(lastError)}`)
    for (const row of data || []) {
      if (!row?.id) continue
      map.set(String(row.id), row)
    }
  }

  return map
}

function pickBestListing(existing, candidate) {
  if (!candidate) return existing
  if (!existing) return candidate
  const a = Number(existing?.price) || 0
  const b = Number(candidate?.price) || 0
  if (b > a) return candidate
  const at = String(existing?.created_at || '')
  const bt = String(candidate?.created_at || '')
  if (bt > at) return candidate
  return existing
}

async function fetchActiveListingsForSellers(supabase, sellerIds) {
  if (!sellerIds.length) return new Map()

  const selectAttempts = [
    'id,seller_id,slug,title,price,price_currency,images,location,seller_location,whatsapp_enabled,whatsapp_user_disabled,status,created_at',
    'id,seller_id,slug,title,price,price_currency,images,whatsapp_enabled,whatsapp_user_disabled,status,created_at',
    'id,seller_id,slug,title,price,price_currency,images,whatsapp_enabled,status,created_at',
    'id,seller_id,slug,title,price,price_currency,images,status,created_at',
    'id,seller_id,slug,title,price,price_currency,images,status',
    'id,seller_id,slug,title,price,images,status',
    'id,seller_id,slug,title,price,status',
    'id,seller_id,slug,title,status',
    'id,seller_id,slug,title',
    'id,seller_id',
  ]

  const chunks = chunkArray(sellerIds.map(String), 500)
  let resolvedSelect = null
  const bestBySeller = new Map()

  for (const chunk of chunks) {
    let data = null
    let lastError = null
    if (!resolvedSelect) {
      for (const sel of selectAttempts) {
        const res = await supabase
          .from('listings')
          .select(sel)
          .in('seller_id', chunk)
          .or('status.in.(active,published),status.is.null')
        if (!res.error) {
          resolvedSelect = sel
          data = res.data || []
          lastError = null
          break
        }
        lastError = res.error
      }
    } else {
      const res = await supabase
        .from('listings')
        .select(resolvedSelect)
        .in('seller_id', chunk)
        .or('status.in.(active,published),status.is.null')
      data = res.data || []
      lastError = res.error
    }
    if (lastError) throw new Error(`[upsellWhatsapp] Error fetching listings by seller_id: ${lastError.message || String(lastError)}`)

    for (const row of data || []) {
      const sellerId = row?.seller_id ? String(row.seller_id) : null
      if (!sellerId) continue
      if (!listingIsActive(row)) continue
      if (!listingNeedsWhatsapp(row)) continue
      bestBySeller.set(sellerId, pickBestListing(bestBySeller.get(sellerId), row))
    }
  }

  return bestBySeller
}

async function fetchUsersMap(supabase, sellerIds) {
  if (!sellerIds.length) return new Map()
  const chunks = chunkArray(sellerIds, 500)
  const map = new Map()

  for (const chunk of chunks) {
    const { data, error } = await supabase
      .from('users')
      .select('id,email,full_name,store_enabled')
      .in('id', chunk)
    if (error) throw new Error(`[upsellWhatsapp] Error fetching users: ${error.message || String(error)}`)
    for (const row of data || []) {
      if (!row?.id) continue
      map.set(String(row.id), row)
    }
  }
  return map
}

async function fetchRecentSendsSetBySeller(supabase, scenarioCode, sellerIds, cooldownDays) {
  if (!sellerIds.length) return new Set()
  const days = Number.isFinite(Number(cooldownDays)) && Number(cooldownDays) > 0 ? Number(cooldownDays) : 90
  const sinceIso = new Date(Date.now() - days * 24 * 60 * 60 * 1000).toISOString()

  const sent = new Set()
  const chunks = chunkArray(sellerIds.map(String), 500)
  for (const chunk of chunks) {
    try {
      const { data, error } = await supabase
        .from('marketing_automations')
        .select('seller_id')
        .eq('scenario', scenarioCode)
        .gte('sent_at', sinceIso)
        .in('seller_id', chunk)
      if (error) {
        console.warn('[upsellWhatsapp] no se pudo consultar marketing_automations (no dedupe)', error)
        return new Set()
      }
      for (const row of data || []) {
        if (!row?.seller_id) continue
        sent.add(String(row.seller_id))
      }
    } catch (err) {
      console.warn('[upsellWhatsapp] error al consultar marketing_automations (no dedupe)', err?.message || err)
      return new Set()
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
    }
    const { error } = await supabase.from('marketing_automations').insert(payload)
    if (error) console.warn('[upsellWhatsapp] recordSend failed', error, payload)
  } catch (err) {
    console.warn('[upsellWhatsapp] recordSend threw', err?.message || err)
  }
}

function buildDashboardUrl(baseFront) {
  const cleanBase = (baseFront || 'https://www.ciclomarket.ar').replace(/\/$/, '')
  return `${cleanBase}/dashboard?tab=${encodeURIComponent('Publicaciones')}`
}

function buildListingUrl(baseFront, listing) {
  const cleanBase = (baseFront || 'https://www.ciclomarket.ar').replace(/\/$/, '')
  const slugOrId = listing?.slug || listing?.id
  if (!slugOrId) return `${cleanBase}/marketplace`
  return `${cleanBase}/listing/${encodeURIComponent(String(slugOrId))}`
}

function buildEmailHtml({
  baseFront,
  userName,
  listing,
  dashboardUrl,
  listingUrl,
  checkoutPremiumUrl,
  checkoutProUrl,
  emailContactsCount,
  lookbackDays,
}) {
  const cleanBase = (baseFront || 'https://www.ciclomarket.ar').replace(/\/$/, '')
  const logoUrl = `${cleanBase}/site-logo.png`
  const safeName = escapeHtml(userName || 'Hola')
  const safeListingUrl = escapeHtml(listingUrl || cleanBase)
  const safeDashboardUrl = escapeHtml(dashboardUrl || cleanBase)
  const safeCheckoutPremiumUrl = escapeHtml(checkoutPremiumUrl || safeDashboardUrl)
  const safeCheckoutProUrl = escapeHtml(checkoutProUrl || safeDashboardUrl)
  const nContacts = Number(emailContactsCount) || 0
  const windowDays = Number(lookbackDays) || 30
  const signalLine =
    nContacts > 0
      ? `Registramos <strong>${escapeHtml(nContacts)}</strong> contacto${nContacts === 1 ? '' : 's'} por <strong>email</strong> en tus publicaciones en los últimos <strong>${escapeHtml(windowDays)}</strong> días.`
      : 'Detectamos que tus compradores todavía te están contactando por <strong>email</strong> desde tus publicaciones.'

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
      Activá WhatsApp y respondé más rápido para vender antes.
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
                              Oportunidad detectada
                            </div>
                            <div style="margin-top:10px;font-size:18px;line-height:1.3;font-weight:900;color:#ffffff;">
                              Te están escribiendo por email por tu publicación, y eso baja la conversión
                            </div>
                            <div style="margin-top:8px;font-size:13px;line-height:1.6;color:#cbd5e1;">
                              El email es lento y poco práctico. Los compradores prefieren la inmediatez de WhatsApp y suelen elegir publicaciones con contacto directo.
                            </div>
                          </td>
                        </tr>
                      </table>
                    </td>
                  </tr>
                  <tr>
                    <td style="padding:22px 24px 8px;">
                      <div style="font-size:14px;line-height:1.7;color:#334155;">
                        <div style="margin:0 0 10px;">
                          Hola <strong style="color:#0f172a;">${safeName}</strong>,
                        </div>
                        <div style="margin:0 0 10px;">
                          ${signalLine}
                        </div>
                        <div style="margin:0 0 0;">
                          Si activás WhatsApp, vas a responder en segundos y vas a vender más rápido.
                        </div>
                      </div>

                      <table role="presentation" width="100%" cellspacing="0" cellpadding="0" border="0" style="margin-top:14px;">
                        <tr>
                          <td style="background:#f8fafc;border:1px solid #e2e8f0;border-radius:14px;padding:14px 14px;">
                            <table role="presentation" width="100%" cellspacing="0" cellpadding="0" border="0">
                              <tr>
                                <td style="width:22px;vertical-align:top;padding-top:1px;">
                                  <div style="width:18px;height:18px;border-radius:6px;background:#dcfce7;border:1px solid #bbf7d0;"></div>
                                </td>
                                <td style="padding-left:10px;">
                                  <div style="font-size:13px;font-weight:800;color:#0f172a;margin-bottom:4px;">
                                    Qué cambia con WhatsApp
                                  </div>
                                  <div style="font-size:13px;line-height:1.6;color:#334155;">
                                    Respuesta instantánea → más confianza → más clics → más ventas.
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
                    <td style="padding:10px 24px 10px;">
                      ${listingCardHtml || ''}
                    </td>
                  </tr>
                  <tr>
                    <td style="padding:8px 24px 4px;">
                      <div style="font-size:13px;color:#334155;line-height:1.6;margin:0 0 10px;">
                        Elegí tu mejora:
                      </div>
                      <table role="presentation" width="100%" cellspacing="0" cellpadding="0" border="0">
                        <tr>
                          <td width="50%" style="width:50%;padding-right:7px;vertical-align:top;">
                            <table role="presentation" width="100%" cellspacing="0" cellpadding="0" border="0" style="border:1px solid #e5e7eb;border-radius:16px;overflow:hidden;box-shadow:0 10px 20px rgba(2,6,23,0.08);">
                              <tr>
                                <td style="padding:14px 14px;background:#ffffff;">
                                  <div style="font-size:12px;font-weight:900;color:#2563eb;text-transform:uppercase;letter-spacing:0.08em;">
                                    Plan Premium
                                  </div>
                                  <div style="margin-top:6px;font-size:13px;color:#334155;line-height:1.55;">
                                    Más visibilidad + WhatsApp habilitado para que te contacten directo.
                                  </div>
                                  <div style="margin-top:12px;">
                                    <a href="${safeCheckoutPremiumUrl}"
                                      style="display:block;background:#2563eb;color:#ffffff;text-decoration:none;padding:12px 14px;border-radius:12px;font-weight:900;font-size:13px;text-align:center;">
                                      Activar Premium
                                    </a>
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
                                    Plan Pro
                                  </div>
                                  <div style="margin-top:6px;font-size:13px;color:#334155;line-height:1.55;">
                                    Máxima exposición y mejor posicionamiento para acelerar la venta.
                                  </div>
                                  <div style="margin-top:12px;">
                                    <a href="${safeCheckoutProUrl}"
                                      style="display:block;background:#7c3aed;color:#ffffff;text-decoration:none;padding:12px 14px;border-radius:12px;font-weight:900;font-size:13px;text-align:center;">
                                      Activar Pro
                                    </a>
                                  </div>
                                </td>
                              </tr>
                            </table>
                          </td>
                        </tr>
                        <tr>
                          <td colspan="2" align="center" style="padding:12px 0 2px;">
                            <a href="${safeListingUrl}" style="color:#334155;text-decoration:underline;font-size:12px;">
                              Ver tu publicación
                            </a>
                          </td>
                        </tr>
                      </table>
                    </td>
                  </tr>
                  <tr>
                    <td style="padding:12px 24px 22px;">
                      <div style="background:#0b1220;border-radius:16px;padding:14px 16px;">
                        <div style="font-size:12px;color:#cbd5e1;font-weight:900;text-transform:uppercase;letter-spacing:0.08em;margin-bottom:8px;">
                          Tip rápido
                        </div>
                        <div style="font-size:13px;color:#e5e7eb;line-height:1.6;">
                          Entrá al panel → “Publicaciones” → editá la publicación → activá WhatsApp.
                        </div>
                      </div>
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

function buildEmailText({
  baseFront,
  userName,
  listingTitle,
  dashboardUrl,
  listingUrl,
  checkoutPremiumUrl,
  checkoutProUrl,
  emailContactsCount,
  lookbackDays,
}) {
  const cleanBase = (baseFront || 'https://www.ciclomarket.ar').replace(/\/$/, '')
  const who = userName || 'Hola'
  const nContacts = Number(emailContactsCount) || 0
  const windowDays = Number(lookbackDays) || 30
  const signalLine =
    nContacts > 0
      ? `Te contactaron ${nContacts} vez/veces por email por tu publicación en los últimos ${windowDays} días.`
      : 'Te están contactando por email por tu publicación.'
  return [
    `${who}: ${signalLine}`,
    'El email es lento y poco práctico. Los compradores prefieren la inmediatez de WhatsApp y suelen elegir publicaciones con contacto directo.',
    '',
    listingTitle ? `Tu publicación: ${listingTitle}` : null,
    listingUrl ? `Ver publicación: ${listingUrl}` : null,
    checkoutPremiumUrl ? `Plan Premium (Mercado Pago): ${checkoutPremiumUrl}` : null,
    checkoutProUrl ? `Plan Pro (Mercado Pago): ${checkoutProUrl}` : null,
    (!checkoutPremiumUrl && !checkoutProUrl && dashboardUrl) ? `Ir al panel: ${dashboardUrl}` : null,
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

function listingNeedsWhatsapp(listing) {
  const enabled = listing?.whatsapp_enabled === true
  const userDisabled = listing?.whatsapp_user_disabled === true
  return !enabled || userDisabled
}

async function main() {
  const { live, debug, force, cooldownDays, lookbackDays, delayMs, limit, testTo, onlyEmail, onlySellerId } = parseArgs(
    process.argv.slice(2),
  )
  const dryRun = !live

  if (live && !isMailConfigured()) {
    console.error('[upsellWhatsapp] Mail no configurado. Definí RESEND_API_KEY o SMTP_* (ver server/.env.example)')
    process.exit(1)
  }

  const baseFront = resolveFrontendBaseUrl()
  const cleanBase = baseFront.replace(/\/$/, '')
  const utm = 'utm_source=upsell_whatsapp&utm_medium=email&utm_campaign=whatsapp_contacts'
  const dashboardUrl = `${buildDashboardUrl(cleanBase)}&${utm}`
  const serverBase = resolveServerBaseUrl()
  const premiumPlanCode = 'premium'
  const proPlanCode = 'pro'

  const supabase = getServerSupabaseClient()

  const events = await fetchEmailContactEvents(supabase, lookbackDays)
  if (!events.length) {
    console.info('[upsellWhatsapp] No se encontraron contactos por email en el período', { lookbackDays })
    return
  }

  const countsBySeller = new Map()
  const sellerIdsSet = new Set()
  const listingIdsSet = new Set()
  const emailEventsBySeller = new Map()

  for (const row of events) {
    const sellerId = row?.seller_id ? String(row.seller_id) : null
    const listingId = row?.listing_id ? String(row.listing_id) : null
    if (!sellerId) continue
    if (!isUuid(sellerId)) continue

    sellerIdsSet.add(sellerId)
    if (listingId && isUuid(listingId)) listingIdsSet.add(listingId)

    const rawAt = row?.created_at ? String(row.created_at) : null

    const sellerPrev = emailEventsBySeller.get(sellerId) || { count: 0, lastAt: null }
    sellerPrev.count += 1
    if (rawAt && (!sellerPrev.lastAt || rawAt > sellerPrev.lastAt)) sellerPrev.lastAt = rawAt
    emailEventsBySeller.set(sellerId, sellerPrev)

    if (listingId && isUuid(listingId)) {
      const perSeller = countsBySeller.get(sellerId) || new Map()
      const prev = perSeller.get(listingId) || { count: 0, lastAt: null }
      prev.count += 1
      if (rawAt && (!prev.lastAt || rawAt > prev.lastAt)) prev.lastAt = rawAt
      perSeller.set(listingId, prev)
      countsBySeller.set(sellerId, perSeller)
    }
  }

  let sellerIds = Array.from(sellerIdsSet)
  if (!sellerIds.length) {
    console.info('[upsellWhatsapp] No hay seller_id/listing_id válidos para procesar')
    return
  }

  if (onlySellerId) sellerIds = sellerIds.filter((id) => id === onlySellerId)

  if (onlyEmail) {
    const needle = onlyEmail.trim().toLowerCase()
    const { data, error } = await supabase.from('users').select('id,email').ilike('email', needle).limit(5)
    if (error) {
      console.error('[upsellWhatsapp] Error buscando user por email', error?.message || error)
      process.exit(1)
    }
    const match = (data || []).find((r) => (r?.email ? String(r.email).trim().toLowerCase() : '') === needle)
    const resolvedId = match?.id ? String(match.id) : null
    if (!resolvedId) {
      console.error('[upsellWhatsapp] No se encontró seller para --only-email', { onlyEmail })
      process.exit(1)
    }
    sellerIds = [resolvedId]
  }

  if (limit) sellerIds = sellerIds.slice(0, limit)

  const listingIds = Array.from(listingIdsSet)
  const listingsMap = await fetchListingsByIds(supabase, listingIds)

  // Pick one hero listing per seller (most email contacts in lookback window).
  const heroListingBySeller = new Map()
  for (const sellerId of sellerIds) {
    const perSeller = countsBySeller.get(sellerId)
    if (!perSeller) continue
    let best = null
    for (const [listingId, stats] of perSeller.entries()) {
      const listing = listingsMap.get(String(listingId))
      if (!listing) continue
      if (!listingIsActive(listing)) continue
      if (!listingNeedsWhatsapp(listing)) continue
      const candidate = { listingId, count: stats.count || 0, lastAt: stats.lastAt || '' }
      if (!best) best = candidate
      else if (candidate.count > best.count) best = candidate
      else if (candidate.count === best.count && candidate.lastAt > best.lastAt) best = candidate
    }
    if (best?.listingId) heroListingBySeller.set(sellerId, best)
  }

  // Fallback: if events omitted listing_id (CONTACT_EVENTS_OMIT_LISTING_ID=true),
  // pick an active listing by seller_id so the campaign can still run.
  const missingHero = sellerIds.filter((id) => !heroListingBySeller.has(id))
  if (missingHero.length) {
    const bestListingBySeller = await fetchActiveListingsForSellers(supabase, missingHero)
    for (const sellerId of missingHero) {
      const listing = bestListingBySeller.get(sellerId)
      if (listing?.id) {
        // Reuse the same shape as the primary flow.
        heroListingBySeller.set(sellerId, { listingId: String(listing.id), count: emailEventsBySeller.get(sellerId)?.count || 0, lastAt: emailEventsBySeller.get(sellerId)?.lastAt || '' })
        listingsMap.set(String(listing.id), listing)
      }
    }
  }

  sellerIds = sellerIds.filter((id) => heroListingBySeller.has(id))
  if (!sellerIds.length) {
    console.info('[upsellWhatsapp] No se encontraron publicaciones activas sin WhatsApp para esta campaña')
    return
  }

  const users = await fetchUsersMap(supabase, sellerIds)
  const recentSends = (!force && !testTo)
    ? await fetchRecentSendsSetBySeller(supabase, SCENARIO_CODE, sellerIds, cooldownDays)
    : new Set()

  if (recentSends.size) {
    console.info('[upsellWhatsapp] dedupe enabled', { scenario: SCENARIO_CODE, cooldownDays, alreadySent: recentSends.size })
  }

  let processed = 0
  let skippedNoEmail = 0
  let skippedCooldown = 0
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

    const user = users.get(sellerId) || {}
    const emailRaw = typeof user.email === 'string' ? user.email.trim() : ''
    if (!emailRaw) {
      skippedNoEmail += 1
      console.log(`[${processed}/${sellerIds.length}] (sin email) seller_id=${sellerId}`)
      continue
    }

    const hero = heroListingBySeller.get(sellerId)
    const listing = listingsMap.get(String(hero?.listingId)) || null
    if (!listing) continue

    const userName =
      (typeof user.full_name === 'string' && user.full_name.trim()) ||
      (emailRaw.includes('@') ? emailRaw.split('@')[0] : 'Vendedor')

    const baseListingUrl = buildListingUrl(cleanBase, listing)
    const listingUrl = `${baseListingUrl}${listingUrlHasQuery(baseListingUrl) ? '&' : '?'}${utm}`

    const buildCheckoutUrl = (planCode) => {
      if (!serverBase) return null
      const expMs = Date.now() + 7 * 24 * 60 * 60 * 1000
      const token = signUpsellLink({ sellerId, listingId: String(listing.id), planCode, expMs })
      if (!token) return null
      return `${serverBase}/api/checkout/upsell-whatsapp?sid=${encodeURIComponent(sellerId)}&lid=${encodeURIComponent(String(listing.id))}&plan=${encodeURIComponent(planCode)}&exp=${encodeURIComponent(String(expMs))}&t=${encodeURIComponent(token)}`
    }

    const checkoutPremiumUrl = buildCheckoutUrl(premiumPlanCode) || dashboardUrl
    const checkoutProUrl = buildCheckoutUrl(proPlanCode) || dashboardUrl

    if (debug) {
      console.info('[upsellWhatsapp][debug] candidate', {
        sellerId,
        email: emailRaw,
        listingId: listing?.id,
        title: listing?.title,
        emailContacts: hero?.count || 0,
        lastAt: hero?.lastAt || null,
        whatsapp_enabled: listing?.whatsapp_enabled,
        whatsapp_user_disabled: listing?.whatsapp_user_disabled,
        hasServerBase: Boolean(serverBase),
        checkoutPremiumUrl: Boolean(checkoutPremiumUrl),
        checkoutProUrl: Boolean(checkoutProUrl),
      })
    }

    const subjectBase = 'Activá WhatsApp y vendé más rápido en Ciclo Market'
    const subject = testTo ? `[TEST] ${subjectBase}` : subjectBase

    const html = buildEmailHtml({
      baseFront: cleanBase,
      userName,
      listing,
      dashboardUrl,
      listingUrl,
      checkoutPremiumUrl,
      checkoutProUrl,
      emailContactsCount: hero?.count || 0,
      lookbackDays,
    })
    const text = buildEmailText({
      baseFront: cleanBase,
      userName,
      listingTitle: listing?.title || null,
      dashboardUrl,
      listingUrl,
      checkoutPremiumUrl,
      checkoutProUrl,
      emailContactsCount: hero?.count || 0,
      lookbackDays,
    })

    attempted += 1
    const targetTo = testTo || emailRaw
    const prefix = `[${processed}/${sellerIds.length}] Enviando upsell WhatsApp a ${userName} - "${listing?.title || 'Publicación'}"`

    if (dryRun) {
      console.log(`${prefix} — DRY RUN ✅ (${targetTo}${testTo ? ` (original: ${emailRaw})` : ''})`)
      continue
    }

    try {
      await sendMail({ to: targetTo, subject, html, text })
      if (!testTo) await recordSend(supabase, SCENARIO_CODE, listing?.id ?? null, sellerId, emailRaw)
      sent += 1
      console.log(`${prefix} ✅ (${targetTo}${testTo ? `, original: ${emailRaw}` : ''})`)
    } catch (e) {
      failed += 1
      console.warn(`${prefix} ❌`, e?.message || e)
    }

    await sleep(delayMs)
  }

  console.info('[upsellWhatsapp] done', {
    dryRun,
    lookbackDays,
    cooldownDays,
    delayMs,
    sellers: sellerIds.length,
    processed,
    attempted,
    sent,
    failed,
    skippedNoEmail,
    skippedCooldown,
  })
}

function listingUrlHasQuery(url) {
  return typeof url === 'string' && url.includes('?')
}

if (require.main === module) {
  main().catch((e) => {
    console.error('[upsellWhatsapp] fatal', e)
    process.exit(1)
  })
}

module.exports = {
  main,
  buildEmailHtml,
  buildEmailText,
}
