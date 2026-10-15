'use strict'

// Borradores precargados para outreach ("link mágico").
// Admin: extrae datos con IA y genera un link /p/<token>.
// Público: el vendedor abre el link, revisa y publica desde el wizard normal.

const crypto = require('crypto')
const express = require('express')
const { getServerSupabaseClient } = require('../lib/supabaseClient')
const { resolveFrontendBaseUrl } = require('../lib/savedSearch')
const { extractListingFromSource, isExtractorConfigured, toWizardDraft } = require('../lib/listingExtractor')

const router = express.Router()

const MAX_TEXT_LENGTH = 6000
const MAX_IMAGES = 12

// ── Auth helpers ──────────────────────────────────────────────────────────────

function getSupabaseOrFail(res) {
  try { return getServerSupabaseClient() }
  catch (err) {
    res.status(500).json({ ok: false, error: 'supabase_not_configured' })
    return null
  }
}

async function getAuthUser(req, supabase) {
  const header = String(req.headers.authorization || '')
  if (!header.startsWith('Bearer ')) return null
  const token = header.slice(7).trim()
  if (!token) return null
  try {
    const { data, error } = await supabase.auth.getUser(token)
    if (error || !data?.user) return null
    return data.user
  } catch (err) {
    console.warn('[prefills] getAuthUser failed', err?.message || err)
    return null
  }
}

async function isModerator(supabase, userId) {
  if (!userId) return false
  try {
    const { data } = await supabase.from('user_roles').select('role').eq('user_id', userId).maybeSingle()
    const role = String(data?.role || '').toLowerCase()
    return role === 'moderator' || role === 'admin'
  } catch {
    return false
  }
}

async function requireModerator(req, res) {
  const supabase = getSupabaseOrFail(res)
  if (!supabase) return null
  const user = await getAuthUser(req, supabase)
  if (!user) {
    res.status(401).json({ ok: false, error: 'unauthorized' })
    return null
  }
  if (!(await isModerator(supabase, user.id))) {
    res.status(403).json({ ok: false, error: 'forbidden' })
    return null
  }
  return { supabase, user }
}

// ── Helpers ──────────────────────────────────────────────────────────────────

function sanitizeImageUrls(raw) {
  if (!Array.isArray(raw)) return []
  return raw
    .filter((u) => typeof u === 'string' && /^https:\/\//i.test(u.trim()))
    .map((u) => u.trim())
    .slice(0, MAX_IMAGES)
}

function buildPrefillUrl(token) {
  return `${resolveFrontendBaseUrl()}/p/${token}`
}

function buildOutreachMessage({ sellerName, draft, url }) {
  const name = String(sellerName || '').trim()
  const bike = [draft?.brand, draft?.model].filter(Boolean).join(' ').trim() || 'bici'
  const greeting = name ? `¡Hola ${name}!` : '¡Hola!'
  return `${greeting} Vi que estás vendiendo tu ${bike} 🚲 Te armé la publicación gratis en Ciclo Market, un marketplace solo de bicis, con tus fotos y datos ya cargados. Si querés sumarla, solo revisala y confirmá acá: ${url}`
}

// ── Admin ────────────────────────────────────────────────────────────────────

router.post('/api/admin/prefills/extract', async (req, res) => {
  const ctx = await requireModerator(req, res)
  if (!ctx) return
  if (!isExtractorConfigured()) return res.status(503).json({ ok: false, error: 'ai_not_configured' })

  const text = typeof req.body?.text === 'string' ? req.body.text.slice(0, MAX_TEXT_LENGTH) : ''
  const images = sanitizeImageUrls(req.body?.images)
  if (!text.trim() && images.length === 0) {
    return res.status(400).json({ ok: false, error: 'missing_input' })
  }

  try {
    const extracted = await extractListingFromSource({ text, imageUrls: images })
    return res.json({
      ok: true,
      draft: toWizardDraft(extracted, images),
      sellerFirstName: extracted.sellerFirstName || '',
      isBike: extracted.is_bike !== false,
      missing: Array.isArray(extracted.missing) ? extracted.missing : [],
    })
  } catch (err) {
    console.error('[prefills] extract failed', err?.message || err)
    const code = err?.code && String(err.code).startsWith('ai_') ? err.code : 'ai_failed'
    return res.status(502).json({ ok: false, error: code })
  }
})

router.post('/api/admin/prefills', async (req, res) => {
  const ctx = await requireModerator(req, res)
  if (!ctx) return

  const body = req.body || {}
  const draft = body.draft && typeof body.draft === 'object' ? body.draft : null
  if (!draft) return res.status(400).json({ ok: false, error: 'missing_draft' })
  const images = sanitizeImageUrls(draft.images)
  const sellerName = typeof body.sellerName === 'string' ? body.sellerName.trim().slice(0, 80) : ''

  const token = crypto.randomBytes(9).toString('base64url')
  const { error } = await ctx.supabase.from('listing_prefills').insert({
    token,
    data: { ...draft, images },
    images,
    source_url: typeof body.sourceUrl === 'string' ? body.sourceUrl.trim().slice(0, 500) || null : null,
    source_text: typeof body.sourceText === 'string' ? body.sourceText.slice(0, MAX_TEXT_LENGTH) || null : null,
    seller_name: sellerName || null,
    created_by: ctx.user.id,
  })
  if (error) {
    console.error('[prefills] insert failed', error)
    return res.status(500).json({ ok: false, error: 'insert_failed' })
  }

  const url = buildPrefillUrl(token)
  return res.json({ ok: true, token, url, message: buildOutreachMessage({ sellerName, draft, url }) })
})

router.get('/api/admin/prefills', async (req, res) => {
  const ctx = await requireModerator(req, res)
  if (!ctx) return
  const { data, error } = await ctx.supabase
    .from('listing_prefills')
    .select('id,token,data,images,seller_name,source_url,created_at,first_opened_at,open_count,claimed_at,listing_id')
    .order('created_at', { ascending: false })
    .limit(100)
  if (error) return res.status(500).json({ ok: false, error: 'query_failed' })
  const rows = (data || []).map((r) => ({
    id: r.id,
    url: buildPrefillUrl(r.token),
    title: [r.data?.brand, r.data?.model].filter(Boolean).join(' ') || 'Sin título',
    thumbnail: r.images?.[0] || null,
    sellerName: r.seller_name,
    sourceUrl: r.source_url,
    createdAt: r.created_at,
    firstOpenedAt: r.first_opened_at,
    openCount: r.open_count,
    claimedAt: r.claimed_at,
    listingId: r.listing_id,
  }))
  return res.json({ ok: true, prefills: rows })
})

// ── Público ──────────────────────────────────────────────────────────────────

router.get('/api/prefills/:token', async (req, res) => {
  const supabase = getSupabaseOrFail(res)
  if (!supabase) return
  const token = String(req.params.token || '').trim()
  if (!/^[A-Za-z0-9_-]{8,32}$/.test(token)) return res.status(404).json({ ok: false, error: 'not_found' })

  const { data: row } = await supabase
    .from('listing_prefills')
    .select('id,data,seller_name,expires_at,first_opened_at,open_count,claimed_at,listing_id')
    .eq('token', token)
    .maybeSingle()
  if (!row) return res.status(404).json({ ok: false, error: 'not_found' })
  if (row.claimed_at) return res.json({ ok: true, status: 'claimed' })
  if (row.expires_at && new Date(row.expires_at).getTime() < Date.now()) {
    return res.json({ ok: true, status: 'expired' })
  }

  // Tracking de aperturas (no bloquea la respuesta).
  supabase
    .from('listing_prefills')
    .update({
      open_count: (row.open_count || 0) + 1,
      ...(row.first_opened_at ? {} : { first_opened_at: new Date().toISOString() }),
    })
    .eq('id', row.id)
    .then(({ error }) => { if (error) console.warn('[prefills] open tracking failed', error.message) })

  return res.json({ ok: true, status: 'open', draft: row.data, sellerName: row.seller_name })
})

router.post('/api/prefills/:token/claim', async (req, res) => {
  const supabase = getSupabaseOrFail(res)
  if (!supabase) return
  const user = await getAuthUser(req, supabase)
  if (!user) return res.status(401).json({ ok: false, error: 'unauthorized' })

  const token = String(req.params.token || '').trim()
  const listingId = typeof req.body?.listingId === 'string' ? req.body.listingId : ''
  if (!token || !listingId) return res.status(400).json({ ok: false, error: 'invalid_payload' })

  // Solo se puede reclamar con una publicación propia.
  const { data: listing } = await supabase.from('listings').select('id,seller_id').eq('id', listingId).maybeSingle()
  if (!listing || listing.seller_id !== user.id) return res.status(403).json({ ok: false, error: 'forbidden' })

  const { error } = await supabase
    .from('listing_prefills')
    .update({ claimed_at: new Date().toISOString(), claimed_by: user.id, listing_id: listingId })
    .eq('token', token)
    .is('claimed_at', null)
  if (error) return res.status(500).json({ ok: false, error: 'update_failed' })
  return res.json({ ok: true })
})

module.exports = router
