#!/usr/bin/env node
const path = require('path')
const fs = require('fs')

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
  if (!loaded) {
    dotenv.config()
  }
} catch {}

const { getServerSupabaseClient } = require('../../src/lib/supabaseClient')
const { sendMail, isMailConfigured } = require('../../src/lib/mail')
const { buildListingCardHtml } = require('../../src/emails/listingCard')

const CAMPAIGN_CODE = 'trust_level_blast_v2'

function sleep(ms) {
  return new Promise((r) => setTimeout(r, ms))
}

function resolveFrontendBaseUrl() {
  const raw = (process.env.FRONTEND_URL || process.env.FRONTEND_URL_BASE || process.env.PUBLIC_FRONTEND_URL || '')
    .split(',')[0]
    ?.trim()
  if (!raw) return 'https://www.ciclomarket.ar'
  return raw.replace(/\/$/, '')
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
  return normalized
}

function isPaidPlan(plan) {
  const canonical = normalizePlan(plan)
  return canonical === 'premium' || canonical === 'pro'
}

function computeTrustScore({ identityVerified, paidPlan, profileComplete, activity, isStore }) {
  // Matches the frontend's CicloTrust component logic.
  // Stores (official shops) always get maximum trust.
  if (isStore) return 5
  let score = 0
  if (identityVerified) score += 2
  if (paidPlan) score += 1.5
  if (profileComplete) score += 1
  if (activity) score += 0.5
  score = Math.max(0, Math.min(5, score))
  return Math.round(score * 10) / 10
}

function formatCurrency(value, currency) {
  const n = Number(value)
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

function barsHtml(score) {
  const filled = Math.max(0, Math.min(5, Math.floor(Number(score) || 0)))
  const cells = []
  for (let i = 0; i < 5; i += 1) {
    const color = i < filled ? '#F59E0B' : '#E5E7EB'
    cells.push(`<td bgcolor="${color}" style="height:10px;border-radius:6px;${i < 4 ? 'padding-right:4px;' : ''}"></td>`)
  }
  return `
    <table role="presentation" cellspacing="0" cellpadding="0" border="0" style="width:100%;max-width:260px;margin:10px auto 0 auto">
      <tr>${cells.join('')}</tr>
    </table>
  `
}

function emailPreheaderForScore(trustScore) {
  const n = Number(trustScore) || 0
  if (n >= 4.5) return 'Tu perfil ya genera confianza. Sumá visibilidad agregando redes sociales.'
  return 'Tu Nivel de Confianza es bajo. Aumentalo ahora.'
}

function buildDashboardTabLink(baseFront, tab) {
  const cleanBase = baseFront.replace(/\/$/, '')
  return `${cleanBase}/dashboard?tab=${encodeURIComponent(tab)}`
}

function segmentColor(idx) {
  if (idx <= 2) return '#FBBF24' // amber-400
  if (idx === 3) return '#84CC16' // lime-500
  return '#10B981' // emerald-500
}

function trustSegmentsHtml(trustScore) {
  const score = Number(trustScore) || 0
  const tds = []
  for (let i = 0; i < 5; i += 1) {
    const idx = i + 1
    const filled = score >= idx - 0.5
    const color = filled ? segmentColor(idx) : '#E5E7EB'
    tds.push(`<td bgcolor="${color}" style="height:8px;border-radius:999px;"></td>`)
    if (i < 4) tds.push('<td width="6" style="width:6px;font-size:0;line-height:0;">&nbsp;</td>')
  }
  return `
    <table role="presentation" cellspacing="0" cellpadding="0" border="0" style="width:100%;max-width:280px;margin:12px auto 0 auto">
      <tr>${tds.join('')}</tr>
    </table>
  `
}

function buildEmailHtml({
  baseFront,
  userName,
  productName,
  productPrice,
  trustScore,
  checklistItems,
  headlineMsg,
  listingUrl,
  editProfileUrl,
  verifyUrl,
  listingCardHtml,
}) {
  const preheader = emailPreheaderForScore(trustScore)
  const safeName = escapeHtml(userName || 'Hola')
  const safeProductName = escapeHtml(productName || 'tu publicación')
  const safePrice = escapeHtml(productPrice || '')
  const safeScore = escapeHtml(Number(trustScore).toFixed(1))
  const segments = trustSegmentsHtml(trustScore)
  const safeListingUrl = escapeHtml(listingUrl || baseFront)
  const stateLabel = Number(trustScore) >= 4.5 ? 'Estado: Muy confiable' : 'Estado: Incompleto'
  const stateColors = Number(trustScore) >= 4.5 ? { fg: '#16A34A', bg: '#F0FDF4' } : { fg: '#EF4444', bg: '#FEF2F2' }

  const checklistHtml = checklistItems || ''
  const safeHeadline = escapeHtml(headlineMsg || '')
  const safePriceLine = safePrice || '—'
  const isHigh = Number(trustScore) >= 4.5
  const introCopy = isHigh
    ? 'Tu aviso ya se ve confiable. Ahora el objetivo es <strong>subir visibilidad</strong> para recibir más consultas.'
    : 'Los compradores suelen filtrar publicaciones que no parecen seguras. Tu aviso actual tiene <strong>baja credibilidad</strong>.'

  const editCta = typeof editProfileUrl === 'string' && editProfileUrl.trim() ? escapeHtml(editProfileUrl) : ''
  const verifyCta = typeof verifyUrl === 'string' && verifyUrl.trim() ? escapeHtml(verifyUrl) : ''
  const showEdit = Boolean(editCta)
  const showVerify = Boolean(verifyCta)

  return `<!DOCTYPE html>
<html>
<head>
  <meta charset="utf-8">
  <meta name="viewport" content="width=device-width, initial-scale=1.0">
  <title>Aumentá tus ventas</title>
	  <style>
	    body { margin:0; padding:0; background-color:#F3F4F6; font-family:-apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, Helvetica, Arial, sans-serif; }
	    .btn-main { background-color:#14212E; color:#ffffff; display:block; padding:16px 24px; text-decoration:none; border-radius:8px; font-weight:bold; text-align:center; font-size:16px; margin-top:20px; box-shadow: 0 4px 6px rgba(0,0,0,0.15); }
	    .score-container { background:#F8FAFC; border:1px solid #E2E8F0; border-radius:12px; padding:20px; margin:20px 0; text-align:center; }
	  </style>
	</head>
	<body>
	  <span style="display:none!important;visibility:hidden;opacity:0;color:transparent;height:0;width:0;overflow:hidden;mso-hide:all">${escapeHtml(preheader)}</span>
	  <div style="max-width:600px; margin:0 auto; background:#ffffff; border-radius:12px; overflow:hidden; margin-top:20px; box-shadow:0 10px 15px -3px rgba(0,0,0,0.05);">
	    <div style="background-color:#F1F5F9; padding:20px; text-align:center; border-bottom: 2px solid #E2E8F0;">
	       <img src="${baseFront}/site-logo.png" alt="Ciclo Market" style="height:35px; width:auto; border:0; display:block; margin:0 auto;">
	    </div>

    <div style="padding:30px 24px;">
      <h1 style="color:#111827; font-size:22px; margin:0 0 10px 0; line-height:1.3; text-align:center;">
        ⚠️ ${safeName}, estás dejando dinero sobre la mesa.
      </h1>

      <p style="color:#4B5563; font-size:16px; line-height:1.5; text-align:center; margin-bottom:0;">
        ${introCopy}
      </p>

      <div class="score-container">
        <div style="font-size:12px; text-transform:uppercase; color:#64748B; font-weight:700; letter-spacing:1px; margin-bottom:10px;">
          TU NIVEL DE CONFIANZA ACTUAL
        </div>

        <div style="font-size:36px; font-weight:800; color:#111827; margin-bottom:10px;">
          ${safeScore}/5
        </div>

        ${segments}

        <div style="margin-top:12px; font-size:14px; color:${stateColors.fg}; font-weight:600; background:${stateColors.bg}; display:inline-block; padding:6px 12px; border-radius:20px;">
          ${escapeHtml(stateLabel)}
        </div>

        ${safeHeadline ? `<div style="margin-top:12px;font-size:14px;color:#111827;font-weight:600">${safeHeadline}</div>` : ''}
      </div>

      <a href="${safeListingUrl}" class="btn-main">
        🚀 ACTIVAR NIVEL DE CONFIANZA 5/5
      </a>

      <p style="font-size:13px; color:#9CA3AF; text-align:center; margin-top:20px;">
        Al hacer clic irás directo a tu publicación para aplicar las mejoras.
      </p>

      <div style="margin:22px 0;">
        <div style="font-size:12px; color:#64748B; margin-bottom:8px;">Detalle de tu publicación:</div>
        ${listingCardHtml || `
          <div style="border-left:4px solid #14212E;padding-left:12px;text-align:left">
            <div style="font-size:16px; font-weight:700; color:#111827;">${safeProductName}</div>
            <div style="font-size:15px; color:#14212E;">${safePriceLine}</div>
          </div>
        `}
      </div>

	      <div style="background-color:#F9FAFB; padding:15px; border-radius:8px; font-size:14px; color:#374151;">
	        {{checklistItems}}
	      </div>

      ${
        showEdit || showVerify
          ? `<div style="text-align:center;margin-top:10px;font-size:13px;color:#6B7280;line-height:1.6">
              ${showEdit ? `<a href="${editCta}" style="color:#14212E;font-weight:700;text-decoration:none">Agregar redes</a>` : ''}
              ${showEdit && showVerify ? ' · ' : ''}
              ${showVerify ? `<a href="${verifyCta}" style="color:#14212E;font-weight:700;text-decoration:none">Verificar cuenta</a>` : ''}
            </div>`
          : ''
      }
    </div>
  </div>

	  <div style="text-align:center; padding:20px; font-size:12px; color:#9CA3AF;">
	    Enviado por Ciclo Market · <a href="#" style="color:#9CA3AF;">Darse de baja</a>
	  </div>
	</body>
	</html>`
    .replace('{{checklistItems}}', checklistHtml)
}

function buildChecklistHtml({ identityVerified, paidPlan }) {
  const idLine = identityVerified ? '✅ Identidad Verificada' : '❌ Identidad Verificada'
  const planLine = paidPlan ? '✅ Miembro Premium' : '❌ Miembro Premium'
  return `<div>${escapeHtml(idLine)}</div><div>${escapeHtml(planLine)}</div>`
}

function buildEmailText({
  baseFront,
  userName,
  productName,
  productPrice,
  trustScore,
  identityVerified,
  paidPlan,
  profileComplete,
  listingUrl,
}) {
  const utm = 'utm_source=trust_level_blast&utm_medium=email&utm_campaign=trust_level'
  const editProfileUrl = `${buildDashboardTabLink(baseFront, 'Editar perfil')}&${utm}`
  const verifyUrl = `${buildDashboardTabLink(baseFront, 'Verificá tu perfil')}&${utm}`
  const listingCta = listingUrl ? `${listingUrl}${listingUrl.includes('?') ? '&' : '?'}${utm}` : null
  const who = userName || 'Hola'
  const scoreLine =
    Number(trustScore) >= 4.5
      ? `Tu Nivel de Confianza actual es ${trustScore}/5. Ahora podés aumentar visibilidad agregando redes sociales.`
      : `Tu Nivel de Confianza actual es ${trustScore}/5. Con un par de cambios podés llegar a 5/5.`
  const checklist = [
    identityVerified ? '✅ Identidad verificada' : '❌ Identidad verificada',
    paidPlan ? '✅ Miembro Premium' : '❌ Miembro Premium',
    profileComplete ? '✅ Perfil completo (redes/bio)' : '❌ Perfil incompleto (sumá redes/bio)',
  ].join('\n')
  return [
    `${who}, tu publicación "${productName || 'tu publicación'}" está perdiendo visitas.`,
    scoreLine,
    productPrice ? `Precio: ${productPrice}` : null,
    '',
    checklist,
    '',
    listingCta ? `Abrir publicación: ${listingCta}` : null,
    `Agregar redes: ${editProfileUrl}`,
    identityVerified ? 'Verificación: ya estás verificado ✅' : `Verificar cuenta: ${verifyUrl}`,
  ]
    .filter(Boolean)
    .join('\n')
}

async function fetchActiveListings(supabase) {
  const pageSize = Math.max(1, Math.min(1000, Number(process.env.CAMPAIGN_PAGE_SIZE) || 1000))
  const maxPages = Math.max(1, Math.min(50, Number(process.env.CAMPAIGN_MAX_PAGES) || 50))
  const rows = []

  const selectAttempts = [
    'id,seller_id,slug,title,price,price_currency,images,location,seller_location,whatsapp_enabled,plan,plan_code,seller_plan,status,created_at',
    'id,seller_id,slug,title,price,price_currency,images,location,seller_location,plan,plan_code,seller_plan,status,created_at',
    'id,seller_id,slug,title,price,price_currency,images,location,seller_location,plan,plan_code,seller_plan,status',
    'id,seller_id,slug,title,price,price_currency,images,plan,plan_code,seller_plan,status',
    'id,seller_id,slug,title,price,price_currency,plan,plan_code,seller_plan,status',
  ]
  let resolvedSelect = null

  for (let page = 0; page < maxPages; page += 1) {
    const from = page * pageSize
    const to = from + pageSize - 1
    let data = null
    let error = null

    if (!resolvedSelect) {
      for (const sel of selectAttempts) {
        const res = await supabase
          .from('listings')
          .select(sel)
          .or('status.in.(active,published),status.is.null')
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
        .from('listings')
        .select(resolvedSelect)
        .or('status.in.(active,published),status.is.null')
        .range(from, to)
      data = res.data
      error = res.error
    }

    if (error) throw new Error(`Error fetching listings: ${error.message || String(error)}`)

    const batch = Array.isArray(data) ? data : []
    rows.push(...batch)
    if (batch.length < pageSize) break
  }

  return rows
}

async function fetchUsersMap(supabase, sellerIds) {
  if (!sellerIds.length) return new Map()

  const selectAttempts = [
    'id,email,full_name,verified,bio,plan,plan_code,avatar_url,store_enabled,instagram_handle,facebook_handle,website_url,whatsapp_number,store_instagram,store_facebook,store_website',
    'id,email,full_name,verified,bio,plan,plan_code,avatar_url,store_enabled,instagram_handle,facebook_handle,website_url,store_instagram,store_facebook,store_website',
    // More resilient fallbacks when some store_* columns don't exist
    'id,email,full_name,verified,bio,plan,plan_code,avatar_url,store_enabled,instagram_handle,facebook_handle,website_url,whatsapp_number',
    'id,email,full_name,verified,bio,plan,plan_code,avatar_url,store_enabled,instagram_handle,facebook_handle,website_url',
    'id,email,full_name,verified,bio,plan,plan_code,avatar_url,store_enabled,instagram_handle,website_url',
    'id,email,full_name,verified,bio,plan,plan_code,avatar_url,store_enabled,instagram_handle',
    'id,email,full_name,verified,plan,plan_code,avatar_url,store_enabled',
    'id,email,full_name,verified,plan,plan_code,store_enabled',
    'id,email,full_name,verified,plan,store_enabled',
    'id,email,full_name,verified,store_enabled',
    // Legacy fallback if a project still uses identity_verified
    'id,email,full_name,identity_verified,bio,plan,plan_code,avatar_url,store_enabled,instagram_handle,store_instagram',
    'id,email,full_name,identity_verified,bio,plan,plan_code,avatar_url,store_enabled',
    'id,email,full_name,identity_verified,plan,store_enabled',
    'id,email,full_name,store_enabled',
    'id,email,full_name',
  ]

  let data = null
  let lastError = null

  for (const sel of selectAttempts) {
    const res = await supabase.from('users').select(sel).in('id', sellerIds)
    if (!res.error) {
      data = res.data || []
      lastError = null
      break
    }
    lastError = res.error
  }

  if (lastError) {
    throw new Error(`Error fetching users: ${lastError.message || String(lastError)}`)
  }

  const map = new Map()
  for (const row of data || []) {
    if (!row?.id) continue
    map.set(row.id, row)
  }
  return map
}

function pickHeroListing(existing, candidate) {
  if (!existing) return candidate
  const a = Number(existing?.price) || 0
  const b = Number(candidate?.price) || 0
  if (b > a) return candidate
  return existing
}

function resolveIdentityVerified(user) {
  if (user?.verified === true) return true
  if (user?.identity_verified === true) return true
  return false
}

function generateChecklist(user, listing, score) {
  const items = []

  const whatsappEnabled = Boolean(listing?.whatsapp_enabled)
  if (!whatsappEnabled) {
    items.push('❌ <strong>WhatsApp Directo:</strong> Activá el chat para vender ya.')
  }

  const identityVerified = resolveIdentityVerified(user)
  if (!identityVerified) {
    items.push('❌ <strong>Identidad:</strong> Tu comprador no sabe quién sos.')
  }

  const nScore = Number(score) || 0
  if (items.length === 0 && nScore < 4.5) {
    items.push('❌ <strong>Redes Sociales:</strong> Vinculá tu Instagram para dar confianza.')
  }

  const fillers = [
    '✅ <strong>Usuario Activo:</strong> Ya tenés avisos publicados.',
    '✅ <strong>Miembro de la Comunidad:</strong> Cuenta activa.',
  ]
  let fillIdx = 0
  while (items.length < 3) {
    items.push(fillers[fillIdx % fillers.length])
    fillIdx += 1
  }

  return items
    .slice(0, 3)
    .map((line) => `<div style="margin-bottom:8px;">${line}</div>`)
    .join('')
}

function chunkArray(values, chunkSize) {
  const out = []
  for (let i = 0; i < values.length; i += chunkSize) out.push(values.slice(i, i + chunkSize))
  return out
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
        console.warn('[trustBlast] no se pudo consultar marketing_automations (no dedupe)', error)
        return new Set()
      }
      for (const row of data || []) {
        if (!row?.seller_id) continue
        sent.add(String(row.seller_id))
      }
    } catch (err) {
      console.warn('[trustBlast] error al consultar marketing_automations (no dedupe)', err?.message || err)
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
    if (error) console.warn('[trustBlast] recordSend failed', error, payload)
  } catch (err) {
    console.warn('[trustBlast] recordSend threw', err?.message || err)
  }
}

function resolveHasSocials(user) {
  const fields = [
    user?.instagram_handle,
    user?.facebook_handle,
    user?.website_url,
    user?.store_instagram,
    user?.store_facebook,
    user?.store_website,
  ]
  return fields
    .map((v) => (typeof v === 'string' ? v.trim() : ''))
    .some((v) => v.length > 0)
}

function socialsKnown(user) {
  const keys = [
    'instagram_handle',
    'facebook_handle',
    'website_url',
    'store_instagram',
    'store_facebook',
    'store_website',
  ]
  return keys.some((k) => Object.prototype.hasOwnProperty.call(user || {}, k))
}

function profileCompleteKnown(user) {
  const keys = ['instagram_handle', 'store_instagram', 'bio']
  return keys.some((k) => Object.prototype.hasOwnProperty.call(user || {}, k))
}

function resolveProfileComplete(user) {
  const hasIg =
    (typeof user?.instagram_handle === 'string' && user.instagram_handle.trim()) ||
    (typeof user?.store_instagram === 'string' && user.store_instagram.trim())
  const hasBio = typeof user?.bio === 'string' && user.bio.trim().length >= 10
  return Boolean(hasIg || hasBio)
}

function buildListingUrl(baseFront, listing) {
  const cleanBase = baseFront.replace(/\/$/, '')
  const slugOrId = listing?.slug || listing?.id
  if (!slugOrId) return `${cleanBase}/marketplace`
  return `${cleanBase}/listing/${encodeURIComponent(String(slugOrId))}`
}

function parseArgs(argv) {
  const args = new Set(argv)
  const live = args.has('--live')
  const debug = args.has('--debug')
  const force = args.has('--force')
  const includeStores = args.has('--include-stores')
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
    includeStores,
    cooldownDays: Number.isFinite(cooldownDays) && cooldownDays > 0 ? cooldownDays : (Number(process.env.TRUST_BLAST_COOLDOWN_DAYS) || 90),
    lookbackDays: Number.isFinite(lookbackDays) && lookbackDays > 0 ? lookbackDays : (Number(process.env.TRUST_BLAST_LOOKBACK_DAYS) || null),
    delayMs: Number.isFinite(delayMs) && delayMs >= 0 ? delayMs : (Number(process.env.CAMPAIGN_DELAY_MS) || 500),
    limit: Number.isFinite(limit) && limit > 0 ? Math.floor(limit) : null,
    testTo: testTo || null,
    onlyEmail: onlyEmail || null,
    onlySellerId: onlySellerId || null,
  }
}

async function main() {
  const { live, debug, force, includeStores, cooldownDays, lookbackDays, delayMs, limit, testTo, onlyEmail, onlySellerId } = parseArgs(process.argv.slice(2))
  const dryRun = !live

  if (live && !isMailConfigured()) {
    console.error('[trustBlast] Mail no configurado. Definí RESEND_API_KEY o SMTP_* (ver server/.env.example)')
    process.exit(1)
  }

  const baseFront = resolveFrontendBaseUrl()
  const utm = 'utm_source=trust_level_blast&utm_medium=email&utm_campaign=trust_level'
  const editProfileUrl = `${buildDashboardTabLink(baseFront, 'Editar perfil')}&${utm}`
  const verifyUrl = `${buildDashboardTabLink(baseFront, 'Verificá tu perfil')}&${utm}`
  const supabase = getServerSupabaseClient()

  let listings = await fetchActiveListings(supabase)
  if (!listings.length) {
    console.info('[trustBlast] No se encontraron publicaciones activas')
    return
  }

  if (lookbackDays) {
    const sinceMs = Date.now() - lookbackDays * 24 * 60 * 60 * 1000
    const before = listings.length
    listings = listings.filter((l) => {
      const raw = l?.created_at
      if (!raw) return false
      const ts = Date.parse(String(raw))
      if (Number.isNaN(ts)) return false
      return ts >= sinceMs
    })
    console.info('[trustBlast] lookback filter', { lookbackDays, before, after: listings.length })
    if (!listings.length) {
      console.info('[trustBlast] No hay publicaciones dentro del lookback')
      return
    }
  }

  const bySeller = new Map()
  for (const listing of listings) {
    const sellerId = listing?.seller_id
    if (!sellerId) continue
    const prev = bySeller.get(sellerId)
    bySeller.set(sellerId, pickHeroListing(prev, listing))
  }

  let sellerIds = Array.from(bySeller.keys())
  if (onlyEmail) {
    const needle = onlyEmail.trim().toLowerCase()
    const { data, error } = await supabase.from('users').select('id,email').ilike('email', needle).limit(5)
    if (error) {
      console.error('[trustBlast] Error buscando user por email', error?.message || error)
      process.exit(1)
    }
    const match = (data || []).find((r) => (r?.email ? String(r.email).trim().toLowerCase() : '') === needle)
    const resolvedId = match?.id ? String(match.id) : null
    if (!resolvedId) {
      console.error('[trustBlast] No se encontró seller para --only-email', { onlyEmail })
      process.exit(1)
    }
    if (!bySeller.has(resolvedId)) {
      console.error('[trustBlast] El seller existe, pero no tiene publicaciones activas para esta campaña', { onlyEmail, sellerId: resolvedId })
      process.exit(1)
    }
    sellerIds = [resolvedId]
  } else if (onlySellerId) {
    sellerIds = sellerIds.filter((id) => String(id) === onlySellerId)
  } else if (limit) {
    sellerIds = sellerIds.slice(0, limit)
  }

  const users = await fetchUsersMap(supabase, sellerIds)

  if ((onlyEmail || onlySellerId) && testTo) {
    console.info('[trustBlast] test-to activo: enviando a email de prueba, pero con contenido del seller filtrado', {
      onlyEmail: onlyEmail || null,
      onlySellerId: onlySellerId || null,
      testTo,
    })
  }

  const recentSends = (!force && !testTo) ? await fetchRecentSendsSetBySeller(supabase, CAMPAIGN_CODE, sellerIds, cooldownDays) : new Set()
  if (recentSends.size) {
    console.info('[trustBlast] dedupe enabled', { scenario: CAMPAIGN_CODE, cooldownDays, alreadySent: recentSends.size })
  }

  let processed = 0
  let skippedPerfect = 0
  let skippedNoEmail = 0
  let skippedOfficialStores = 0
  let skippedCooldown = 0
  let attempted = 0
  let sent = 0
  let failed = 0

  for (let idx = 0; idx < sellerIds.length; idx += 1) {
    const sellerId = sellerIds[idx]
    if (!force && !testTo && recentSends.has(String(sellerId))) {
      processed += 1
      skippedCooldown += 1
      console.log(`[${processed}/${sellerIds.length}] Saltando (ya enviado) seller_id=${sellerId}`)
      continue
    }
    const hero = bySeller.get(sellerId)
    const user = users.get(sellerId) || {}

    processed += 1

    const emailRaw = typeof user.email === 'string' ? user.email.trim() : ''
    const isOfficialStore = Boolean(user.store_enabled)

    if (isOfficialStore && !includeStores) {
      skippedOfficialStores += 1
      console.log(`[${processed}/${sellerIds.length}] Saltando tienda oficial: seller_id=${sellerId} (${emailRaw || 'sin email'})`)
      continue
    }
    if (!emailRaw) {
      skippedNoEmail += 1
      console.log(`[${processed}/${sellerIds.length}] (sin email) seller_id=${sellerId}`)
      continue
    }

    const userName =
      (typeof user.full_name === 'string' && user.full_name.trim()) ||
      (emailRaw.includes('@') ? emailRaw.split('@')[0] : 'Usuario')

    const planCandidate = user.plan || user.plan_code || hero?.seller_plan || hero?.plan_code || hero?.plan
    const paidPlan = isPaidPlan(planCandidate)
    const identityVerified = resolveIdentityVerified(user)
    const socialsAreKnown = socialsKnown(user)
    const hasSocials = resolveHasSocials(user)
    const completeKnown = profileCompleteKnown(user)
    const profileComplete = resolveProfileComplete(user)
    const activity = true // campaign targets sellers with active listings

    if (debug) {
      console.info('[trustBlast][debug] socials snapshot', {
        sellerId,
        email: emailRaw,
        socialsAreKnown,
        completeKnown,
        profileComplete,
        bioLen: typeof user?.bio === 'string' ? user.bio.trim().length : null,
        instagram_handle: user?.instagram_handle,
        facebook_handle: user?.facebook_handle,
        website_url: user?.website_url,
        store_instagram: user?.store_instagram,
        store_facebook: user?.store_facebook,
        store_website: user?.store_website,
      })
    }

    const trustScore = computeTrustScore({ identityVerified, paidPlan, profileComplete, activity, isStore: isOfficialStore })
    if (trustScore >= 4.5 && !testTo) {
      skippedPerfect += 1
      console.log(
        `[${processed}/${sellerIds.length}] Saltando a ${userName} (Score: ${trustScore}) - Bici: ${hero?.title || '—'} (perfecto)`
      )
      continue
    }

    const productName = hero?.title || 'tu publicación'
    const productPrice = formatCurrency(hero?.price, hero?.price_currency)
    const listingUrl = buildListingUrl(baseFront, hero)

    const headlineMsg = (() => {
      if (trustScore >= 4.5) return 'Tu perfil ya genera confianza. Ahora subí visibilidad agregando tus redes sociales.'
      if (!identityVerified && !paidPlan) {
        return 'Tu perfil genera desconfianza. Verificá tu identidad y completá tu perfil para vender más rápido.'
      }
      if (!identityVerified) return 'Verificá tu identidad para que el comprador confíe más y te contacte.'
      if (completeKnown && !profileComplete) return 'Completá tu perfil (redes/bio) para subir visibilidad y recibir más consultas.'
      return 'Sumá confianza completando tu perfil y activando todos los datos de contacto.'
    })()

    const checklistItems = generateChecklist(user, hero, trustScore)

    const listingCardHtml = (() => {
      try {
        return buildListingCardHtml(hero, baseFront)
      } catch {
        return null
      }
    })()

    const html = buildEmailHtml({
      baseFront,
      userName,
      productName,
      productPrice,
      trustScore,
      checklistItems,
      headlineMsg,
      listingUrl,
      editProfileUrl,
      verifyUrl: !identityVerified ? verifyUrl : '',
      listingCardHtml,
    })
    const text = buildEmailText({
      baseFront,
      userName,
      productName,
      productPrice,
      trustScore,
      identityVerified,
      paidPlan,
      profileComplete,
      listingUrl,
    })
    const subjectBase = `⚠️ Tu publicación ${productName} está perdiendo visitas`
    const subject = testTo ? `[TEST] ${subjectBase}` : subjectBase

    attempted += 1
    const prefix = `[${processed}/${sellerIds.length}] Enviando a ${userName} (Score: ${trustScore}) - Bici: ${productName}`

    const targetTo = testTo || emailRaw
    if (dryRun) {
      console.log(`${prefix} — DRY RUN ✅ (${targetTo}${testTo ? ` (original: ${emailRaw})` : ''})`)
      continue
    }

    try {
      await sendMail({ to: targetTo, subject, html, text })
      if (!testTo) await recordSend(supabase, CAMPAIGN_CODE, hero?.id ?? null, sellerId, emailRaw)
      sent += 1
      console.log(`${prefix} ✅ (${targetTo}${testTo ? `, original: ${emailRaw}` : ''})`)
    } catch (e) {
      failed += 1
      console.warn(`${prefix} ❌`, e?.message || e)
    }

    await sleep(delayMs)
  }

  console.info('[trustBlast] done', {
    dryRun,
    delayMs,
    sellers: sellerIds.length,
    processed,
    attempted,
    sent,
    failed,
    skippedPerfect,
    skippedOfficialStores,
    skippedNoEmail,
    skippedCooldown,
  })
}

if (require.main === module) {
  main().catch((e) => {
    console.error('[trustBlast] fatal', e)
    process.exit(1)
  })
}

module.exports = {
  computeTrustScore,
  buildEmailHtml,
  buildEmailText,
}
