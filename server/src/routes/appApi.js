const express = require('express')
const crypto = require('crypto')
const { getServerSupabaseClient } = require('../lib/supabaseClient')
const { sendMail, isMailConfigured } = require('../lib/mail')
const { resolveFrontendBaseUrl } = require('../lib/savedSearch')

const router = express.Router()

const ALLOWED_TRACK_TYPES = new Set(['site_view', 'listing_view', 'store_view', 'wa_click'])
const SHARE_BOOST_ALLOWED_TYPES = new Set(['story', 'post'])
const SHARE_BOOST_ALLOWED_REWARDS = new Set(['boost7', 'photos2'])
const LISTING_QUESTION_EVENTS = new Set([
  'asked',
  'answered',
  'moderator_deleted_question',
  'moderator_cleared_answer',
])

function clamp(value, maxLength) {
  if (value == null) return null
  const text = String(value)
  return text.length > maxLength ? text.slice(0, maxLength) : text
}

function validateEmail(email) {
  if (!email) return false
  return /^[^@\s]+@[^@\s]+\.[^@\s]+$/.test(String(email).trim())
}

function isUuid(value) {
  if (!value) return false
  return /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(String(value).trim())
}

function normalizeUuidLike(value) {
  if (!value) return null
  const text = String(value).trim()
  if (!text) return null
  if (isUuid(text)) return text.toLowerCase()
  const match = text.match(/[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}/i)
  return match ? match[0].toLowerCase() : null
}

function escapeHtml(value) {
  return String(value ?? '')
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#39;')
}

async function resolveUserEmail(supabase, userId) {
  if (!userId) return null
  try {
    const { data } = await supabase.from('users').select('email').eq('id', userId).maybeSingle()
    if (data?.email) return data.email
  } catch {}
  try {
    const { data, error } = await supabase.auth.admin.getUserById(userId)
    if (!error && data?.user?.email) return data.user.email
  } catch {}
  return null
}

async function resolveUserName(supabase, userId) {
  try {
    const { data } = await supabase.from('users').select('full_name').eq('id', userId).maybeSingle()
    return (data?.full_name || '').trim() || null
  } catch {
    return null
  }
}

function buildReviewReceivedEmailHtml({ sellerName, buyerName, rating, comment, tags, profileUrl, assetsBase }) {
  const greeting = sellerName ? `Hola <strong>${escapeHtml(sellerName)}</strong>,` : 'Hola,'
  const stars = '★★★★★'.slice(0, Math.max(1, Math.min(5, Number(rating) || 0)))
  const safeComment = comment ? escapeHtml(comment).replace(/\r?\n/g, '<br />') : '<em style="color:#64748b;">(sin comentario)</em>'
  const tagsHtml = Array.isArray(tags) && tags.length
    ? `<p style=\"margin:8px 0 0 0;font-family:Arial,sans-serif;font-size:12px;color:#475569;\">Etiquetas: ${tags.map((t)=>`<span style=\"display:inline-block;margin-right:6px;padding:2px 8px;border-radius:999px;background:#f1f5f9;color:#0f1724;\">${escapeHtml(String(t).replace(/_/g,' '))}</span>`).join('')}</p>`
    : ''
  const base = (assetsBase || resolveFrontendBaseUrl() || '').replace(/\/$/, '')
  const logoUrl = `${base}/site-logo.png`
  const ctaUrl = profileUrl
  return `<!DOCTYPE html>
<html lang="es">
  <head>
    <meta charset="utf-8" />
    <meta name="viewport" content="width=device-width, initial-scale=1" />
    <title>Recibiste una reseña</title>
  </head>
  <body style="margin:0; padding:0; background-color:#F4F5F7;">
    <table role="presentation" width="100%" cellspacing="0" cellpadding="0" border="0" style="background-color:#F4F5F7;">
      <tr>
        <td align="center" style="padding:24px 12px;">
          <table role="presentation" width="100%" cellspacing="0" cellpadding="0" border="0" style="max-width:600px; background-color:#FFFFFF; border-radius:12px; overflow:hidden;">
            <tr>
              <td align="center" style="padding:20px 20px 10px 20px; background-color:#FFFFFF;">
                <img src="${logoUrl}" alt="Ciclo Market" width="120" style="display:block; max-width:120px; height:auto; margin:0 auto;" />
              </td>
            </tr>
            <tr>
              <td style="padding:24px 24px 8px 24px; background-color:#14212E;">
                <h1 style="margin:0; font-family:Arial, sans-serif; font-size:22px; line-height:1.3; color:#FFFFFF; font-weight:bold;">
                  ¡Recibiste una nueva reseña!
                </h1>
              </td>
            </tr>
            <tr>
              <td style="padding:16px 24px 0 24px; background-color:#FFFFFF;">
                <p style="margin:0 0 12px 0; font-family:Arial, sans-serif; font-size:14px; color:#0f1724;">
                  ${greeting} ${buyerName ? `${escapeHtml(buyerName)} ` : ''}dejó una reseña sobre tu atención.
                </p>
                <p style="margin:0 0 8px 0; font-family:Arial, sans-serif; font-size:16px; color:#0f1724; font-weight:bold;">
                  ${stars} (${Number(rating) || 0}/5)
                </p>
                <div style="border-radius:8px; background-color:#F4F5F7; padding:14px 16px; font-family:Arial, sans-serif; font-size:14px; color:#111111;">
                  ${safeComment}
                </div>
                ${tagsHtml}
              </td>
            </tr>
            <tr>
              <td align="center" style="padding:16px 24px 24px 24px; background-color:#FFFFFF;">
                <a href="${ctaUrl}" style="display:inline-block; padding:12px 24px; background-color:#14212E; color:#FFFFFF; font-family:Arial, sans-serif; font-size:14px; font-weight:bold; text-decoration:none; border-radius:999px;">
                  Ver reseña en mi perfil
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

function buildReviewReceivedEmailText({ buyerName, rating, comment, profileUrl }) {
  const lines = []
  lines.push('¡Recibiste una nueva reseña en Ciclo Market!')
  if (buyerName) lines.push(`De: ${buyerName}`)
  lines.push(`Puntaje: ${Number(rating) || 0}/5`)
  if (comment) lines.push('Comentario:')
  if (comment) lines.push(String(comment))
  if (profileUrl) lines.push(`Ver reseña: ${profileUrl}`)
  return lines.join('\n')
}

function getSupabaseOrFail(res) {
  try {
    return getServerSupabaseClient()
  } catch (err) {
    console.error('[api] supabase client init failed', err?.message || err)
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
    console.warn('[api] getAuthUser failed', err?.message || err)
    return null
  }
}

async function isModerator(supabase, userId) {
  if (!userId) return false
  try {
    const { data, error } = await supabase
      .from('user_roles')
      .select('role')
      .eq('user_id', userId)
      .maybeSingle()
    if (error) return false
    const role = String(data?.role || '').toLowerCase()
    return role === 'moderator' || role === 'admin'
  } catch (err) {
    console.warn('[api] isModerator check failed', err?.message || err)
    return false
  }
}

/* -------------------------------------------------------------------------- */
/* Analytics events                                                           */
/* -------------------------------------------------------------------------- */

router.post('/api/track', async (req, res) => {
  try {
    const payload = req.body || {}
    const type = typeof payload.type === 'string' ? payload.type.trim() : ''
    if (!ALLOWED_TRACK_TYPES.has(type)) {
      return res.status(400).json({ ok: false, error: 'invalid_type' })
    }
    const supabase = getSupabaseOrFail(res)
    if (!supabase) return
    const insertPayload = {
      type,
      anon_id: clamp(payload.anon_id, 128),
      listing_id: payload.listing_id || null,
      store_user_id: payload.store_user_id || null,
      user_id: payload.user_id || null,
      source: clamp(payload.source || 'web', 32),
      path: clamp(payload.path, 512),
      referrer: clamp(payload.referrer, 512),
      ua: clamp(req.headers['user-agent'] || '', 768),
      meta:
        payload.meta && typeof payload.meta === 'object' && Object.keys(payload.meta).length
          ? payload.meta
          : null,
    }
    const { error } = await supabase.from('events').insert(insertPayload)
    if (error) {
      console.error('[api] track insert failed', error)
      return res.status(500).json({ ok: false, error: 'insert_failed' })
    }
    return res.json({ ok: true })
  } catch (err) {
    console.error('[api] track unexpected error', err)
    return res.status(500).json({ ok: false, error: 'unexpected_error' })
  }
})

/* -------------------------------------------------------------------------- */
/* Contact events (para habilitar reseñas y analytics)                        */
/* -------------------------------------------------------------------------- */

// Algunos navegadores envían navigator.sendBeacon con content-type text/plain
// o application/octet-stream. Agregamos un body parser específico para este
// endpoint y convertimos JSON string -> objeto cuando sea necesario.
const beaconBodyParser = express.text({
  type: (req) => {
    const ct = String(req.headers['content-type'] || '').toLowerCase()
    return ct.startsWith('text/plain') || ct.startsWith('application/octet-stream')
  },
  limit: '256kb',
})

function coerceJsonBody(req, _res, next) {
  if (typeof req.body === 'string') {
    try {
      req.body = JSON.parse(req.body)
    } catch {
      // dejar como string; el handler devolverá missing_fields
    }
  }
  next()
}

router.post('/api/contacts/log', beaconBodyParser, coerceJsonBody, async (req, res) => {
  try {
    const { sellerId, buyerId, listingId, type } = req.body || {}
    if (!sellerId || typeof type !== 'string') {
      return res.status(400).json({ ok: false, error: 'missing_fields' })
    }
    const sellerUuid = normalizeUuidLike(sellerId)
    if (!sellerUuid) {
      return res.status(400).json({ ok: false, error: 'invalid_seller' })
    }
    const normalizedType = String(type).toLowerCase()
    if (normalizedType !== 'whatsapp' && normalizedType !== 'email') {
      return res.status(400).json({ ok: false, error: 'invalid_type' })
    }
    const supabase = getSupabaseOrFail(res)
    if (!supabase) return
    const listingUuid = normalizeUuidLike(listingId)
    const omitListingId = String(process.env.CONTACT_EVENTS_OMIT_LISTING_ID || '').toLowerCase() === 'true'
    const payload = {
      seller_id: sellerUuid,
      buyer_id: normalizeUuidLike(buyerId),
      listing_id: omitListingId ? null : listingUuid,
      type: normalizedType,
    }
    const { error } = await supabase.from('contact_events').insert(payload)
    if (error) {
      if (error.code === '42804' && payload.listing_id) {
        console.warn('[api] contact_events insert retry without listing_id', {
          listingId,
          normalized: listingUuid,
          message: error.message,
        })
        const retryPayload = { ...payload, listing_id: null }
        const { error: retryError } = await supabase.from('contact_events').insert(retryPayload)
        if (!retryError) return res.json({ ok: true })
        console.error('[api] contact_events retry insert still failed', {
          code: retryError?.code,
          message: retryError?.message,
          details: retryError?.details,
          hint: retryError?.hint,
        })
      }
      console.error('[api] contact_events insert failed', error)
      return res.status(500).json({ ok: false, error: 'insert_failed' })
    }
    return res.json({ ok: true })
  } catch (err) {
    console.error('[api] contacts/log unexpected error', err)
    return res.status(500).json({ ok: false, error: 'unexpected_error' })
  }
})

/* -------------------------------------------------------------------------- */
/* Reviews                                                                    */
/* -------------------------------------------------------------------------- */

async function fetchReviewsWithBuyerData(supabase, sellerId) {
  const { data, error } = await supabase
    .from('reviews')
    .select('*')
    .eq('seller_id', sellerId)
    .order('created_at', { ascending: false })

  if (error) throw error
  const reviews = Array.isArray(data) ? data : []

  const buyerIds = Array.from(
    new Set(
      reviews
        .map((r) => r.buyer_id)
        .filter((id) => typeof id === 'string' && id.length > 0),
    ),
  )
  const buyerMap = {}
  if (buyerIds.length) {
    const { data: buyers } = await supabase
      .from('users')
      .select('id, full_name, avatar_url')
      .in('id', buyerIds)
    for (const buyer of buyers || []) {
      buyerMap[buyer.id] = {
        buyer_name: buyer.full_name || null,
        buyer_avatar_url: buyer.avatar_url || null,
      }
    }
  }
  return reviews.map((review) => ({
    ...review,
    ...(buyerMap[review.buyer_id] || {}),
  }))
}

// Match only UUID-like sellerId to avoid catching '/api/reviews/can-review'
router.get('/api/reviews/:sellerId([0-9a-fA-F-]{36})', async (req, res) => {
  try {
    const { sellerId } = req.params
    if (!sellerId) return res.status(400).json({ ok: false, error: 'missing_seller' })
    const supabase = getSupabaseOrFail(res)
    if (!supabase) return

    const reviews = await fetchReviewsWithBuyerData(supabase, sellerId)
    const count = reviews.length
    const avgRating =
      count === 0
        ? 0
        : reviews.reduce((acc, review) => acc + Number(review.rating || 0), 0) / count
    const dist = {}
    const tagsCount = {}
    for (const review of reviews) {
      const rating = Number(review.rating || 0)
      if (Number.isFinite(rating)) {
        dist[rating] = (dist[rating] || 0) + 1
      }
      if (Array.isArray(review.tags)) {
        for (const tag of review.tags) {
          const key = String(tag || '').trim()
          if (key) tagsCount[key] = (tagsCount[key] || 0) + 1
        }
      }
    }

    const mappedReviews = reviews.map((review) => ({
      id: review.id,
      seller_id: review.seller_id,
      buyer_id: review.buyer_id,
      listing_id: review.listing_id,
      rating: Number(review.rating || 0),
      tags: Array.isArray(review.tags) ? review.tags : [],
      comment: review.comment || null,
      buyer_name: review.buyer_name || review['buyer_name'] || null,
      buyer_avatar_url: review.buyer_avatar_url || review['buyer_avatar_url'] || null,
      created_at: review.created_at,
      status: review.status || 'published',
    }))

    return res.json({
      reviews: mappedReviews,
      summary: {
        sellerId,
        count,
        avgRating: count ? Number(avgRating.toFixed(2)) : 0,
        dist,
        tagsCount,
      },
    })
  } catch (err) {
    console.error('[api] reviews list error', err)
    return res.status(500).json({ ok: false, error: 'unexpected_error' })
  }
})

router.get('/api/reviews/can-review', async (req, res) => {
  try {
    const rawSeller = String(req.query.sellerId || '').trim()
    const rawBuyer = String(req.query.buyerId || '').trim()
    if (!rawSeller || !rawBuyer) {
      return res.status(400).json({ allowed: false, reason: 'missing_fields' })
    }
    // Intentar normalizar a UUID cuando sea posible (acepta ids con caracteres extra)
    const sellerId = normalizeUuidLike(rawSeller) || rawSeller
    const buyerId = normalizeUuidLike(rawBuyer) || rawBuyer
    if (sellerId === buyerId) {
      return res.json({ allowed: false, reason: 'self_review' })
    }
    const supabase = getSupabaseOrFail(res)
    if (!supabase) return

    const { data: existing } = await supabase
      .from('reviews')
      .select('id')
      .eq('seller_id', sellerId)
      .eq('buyer_id', buyerId)
      .maybeSingle()
    if (existing) {
      return res.json({ allowed: false, reason: 'already_reviewed' })
    }

    // Si existe un recordatorio de reseña para este par, permitir directamente.
    // Cubre casos donde el contacto existe pero no quedó registrado por listing_id u otros detalles.
    const { data: reminder } = await supabase
      .from('review_reminders')
      .select('id')
      .eq('seller_id', sellerId)
      .eq('buyer_id', buyerId)
      .limit(1)
      .maybeSingle()
    if (reminder) {
      return res.json({ allowed: true })
    }

    const { data: contact } = await supabase
      .from('contact_events')
      .select('id')
      .eq('seller_id', sellerId)
      .eq('buyer_id', buyerId)
      .limit(1)
      .maybeSingle()
    if (!contact) {
      return res.json({ allowed: false, reason: 'no_contact' })
    }
    return res.json({ allowed: true })
  } catch (err) {
    console.error('[api] can-review error', err)
    return res.status(500).json({ allowed: false, reason: 'unexpected_error' })
  }
})

router.post('/api/reviews/submit', async (req, res) => {
  try {
    const { sellerId, buyerId, listingId, rating, tags, comment } = req.body || {}
    if (!sellerId || !buyerId || !Number.isFinite(Number(rating))) {
      return res.status(400).json({ ok: false, error: 'missing_fields' })
    }
    const normalizedRating = Math.min(Math.max(Number(rating), 1), 5)
    const supabase = getSupabaseOrFail(res)
    if (!supabase) return

    const insertPayload = {
      seller_id: sellerId,
      buyer_id: buyerId,
      listing_id: listingId || null,
      rating: normalizedRating,
      tags: Array.isArray(tags) ? tags : [],
      comment: comment ? String(comment).trim() : null,
      status: 'published',
    }

    const { data: existing } = await supabase
      .from('reviews')
      .select('id')
      .eq('seller_id', sellerId)
      .eq('buyer_id', buyerId)
      .maybeSingle()

    if (existing?.id) {
      const { data, error } = await supabase
        .from('reviews')
        .update({
          ...insertPayload,
          updated_at: new Date().toISOString(),
        })
        .eq('id', existing.id)
        .select('*')
        .maybeSingle()
      if (error) {
        console.error('[api] review update failed', error)
        return res.status(500).json({ ok: false, error: 'update_failed' })
      }
      return res.json({ ok: true, review: data })
    }

    const { data, error } = await supabase
      .from('reviews')
      .insert(insertPayload)
      .select('*')
      .maybeSingle()
    if (error) {
      console.error('[api] review insert failed', error)
      return res.status(500).json({ ok: false, error: 'insert_failed' })
    }
    // Notificar al vendedor por email (si está configurado)
    try {
      if (isMailConfigured()) {
        const sellerEmail = await resolveUserEmail(supabase, sellerId)
        if (sellerEmail) {
          const sellerName = await resolveUserName(supabase, sellerId)
          const buyerName = await resolveUserName(supabase, buyerId)
          const baseFront = resolveFrontendBaseUrl()
          const profileUrl = `${baseFront.replace(/\/$/, '')}/vendedor/${encodeURIComponent(sellerId)}?tab=Reseñas`
          const subject = 'Recibiste una nueva reseña en Ciclo Market'
          const html = buildReviewReceivedEmailHtml({
            sellerName,
            buyerName,
            rating: normalizedRating,
            comment: insertPayload.comment,
            tags: insertPayload.tags,
            profileUrl,
            assetsBase: baseFront,
          })
          const text = buildReviewReceivedEmailText({ buyerName, rating: normalizedRating, comment: insertPayload.comment, profileUrl })
          await sendMail({
            from: process.env.SMTP_FROM || `Ciclo Market <${process.env.SMTP_USER || 'no-reply@ciclomarket.ar'}>`,
            to: sellerEmail,
            subject,
            html,
            text,
          })
        }
      }
    } catch (mailErr) {
      console.warn('[api] review notify seller failed (non-fatal)', mailErr?.message || mailErr)
    }
    return res.json({ ok: true, review: data })
  } catch (err) {
    console.error('[api] review submit unexpected error', err)
    return res.status(500).json({ ok: false, error: 'unexpected_error' })
  }
})

/* -------------------------------------------------------------------------- */
/* Share Boost                                                                */
/* -------------------------------------------------------------------------- */

router.post('/api/share-boost/submit', async (req, res) => {
  try {
    const { listingId, sellerId, type, handle, proofUrl, note, reward } = req.body || {}
    if (!listingId || !sellerId || !SHARE_BOOST_ALLOWED_TYPES.has(type)) {
      return res.status(400).json({ ok: false, error: 'invalid_payload' })
    }
    if (reward && !SHARE_BOOST_ALLOWED_REWARDS.has(reward)) {
      return res.status(400).json({ ok: false, error: 'invalid_reward' })
    }
    const supabase = getSupabaseOrFail(res)
    if (!supabase) return
    const payload = {
      listing_id: listingId,
      seller_id: sellerId,
      type,
      handle: handle || null,
      proof_url: proofUrl || null,
      note: note || null,
      reward: reward || null,
      status: 'pending',
    }
    const { data, error } = await supabase
      .from('share_boosts')
      .insert(payload)
      .select('*')
      .maybeSingle()
    if (error) {
      console.error('[api] share boost insert failed', error)
      return res.status(500).json({ ok: false, error: 'insert_failed' })
    }
    return res.json({ ok: true, item: data })
  } catch (err) {
    console.error('[api] share boost submit unexpected error', err)
    return res.status(500).json({ ok: false, error: 'unexpected_error' })
  }
})

router.get('/api/share-boost/pending', async (req, res) => {
  try {
    const supabase = getSupabaseOrFail(res)
    if (!supabase) return
    const user = await getAuthUser(req, supabase)
    const isMod = await isModerator(supabase, user?.id)
    if (!isMod) {
      return res.status(403).json({ ok: false, error: 'forbidden' })
    }
    const { data, error } = await supabase
      .from('share_boosts')
      .select('*')
      .eq('status', 'pending')
      .order('created_at', { ascending: true })
    if (error) {
      console.error('[api] share boost pending failed', error)
      return res.status(500).json({ ok: false, error: 'query_failed' })
    }
    return res.json({ ok: true, items: data || [] })
  } catch (err) {
    console.error('[api] share boost pending unexpected error', err)
    return res.status(500).json({ ok: false, error: 'unexpected_error' })
  }
})

router.post('/api/share-boost/review', async (req, res) => {
  try {
    const { id, approve, reviewerId } = req.body || {}
    if (!id || typeof approve !== 'boolean') {
      return res.status(400).json({ ok: false, error: 'invalid_payload' })
    }
    const supabase = getSupabaseOrFail(res)
    if (!supabase) return
    const user = await getAuthUser(req, supabase)
    const reviewer = reviewerId || user?.id || null
    const isMod = await isModerator(supabase, reviewer)
    if (!isMod) {
      return res.status(403).json({ ok: false, error: 'forbidden' })
    }
    const status = approve ? 'approved' : 'rejected'
    const updates = {
      status,
      reviewer_id: reviewer,
      reviewed_at: new Date().toISOString(),
    }
    const { data, error } = await supabase
      .from('share_boosts')
      .update(updates)
      .eq('id', id)
      .select('*')
      .maybeSingle()
    if (error) {
      console.error('[api] share boost review failed', error)
      return res.status(500).json({ ok: false, error: 'update_failed' })
    }
    return res.json({ ok: true, item: data })
  } catch (err) {
    console.error('[api] share boost review unexpected error', err)
    return res.status(500).json({ ok: false, error: 'unexpected_error' })
  }
})

/* -------------------------------------------------------------------------- */
/* Users                                                                      */
/* -------------------------------------------------------------------------- */

router.get('/api/users/:id/contact-email', async (req, res) => {
  try {
    const { id } = req.params
    if (!id) return res.status(400).json({ ok: false, error: 'missing_id' })
    const supabase = getSupabaseOrFail(res)
    if (!supabase) return
    const { data, error } = await supabase
      .from('users')
      .select('email')
      .eq('id', id)
      .maybeSingle()
    if (error) {
      console.error('[api] user contact lookup failed', error)
    }
    let email = data?.email || null
    if (!email) {
      try {
        const { data: authUser, error: authError } = await supabase.auth.admin.getUserById(id)
        if (!authError && authUser?.user?.email) {
          email = authUser.user.email
        }
      } catch (err) {
        console.warn('[api] auth admin getUserById failed', err?.message || err)
      }
    }
    if (!email) {
      return res.status(404).json({ ok: false, error: 'not_found' })
    }
    return res.json({ ok: true, email })
  } catch (err) {
    console.error('[api] user contact unexpected error', err)
    return res.status(500).json({ ok: false, error: 'unexpected_error' })
  }
})

/* -------------------------------------------------------------------------- */
/* Listing questions notifications                                            */
/* -------------------------------------------------------------------------- */

async function fetchQuestionContext(supabase, questionId) {
  const { data: question, error } = await supabase
    .from('listing_questions')
    .select('*')
    .eq('id', questionId)
    .maybeSingle()
  if (error) throw error
  if (!question) return null

  const { data: listing } = await supabase
    .from('listings')
    .select('id,title,slug,seller_id')
    .eq('id', question.listing_id)
    .maybeSingle()
  let seller = null
  if (listing?.seller_id) {
    const { data: sellerData } = await supabase
      .from('users')
      .select('id,email,full_name')
      .eq('id', listing.seller_id)
      .maybeSingle()
    seller = sellerData || null
  }
  let asker = null
  if (question.asker_id) {
    const { data: askerData } = await supabase
      .from('users')
      .select('id,email,full_name')
      .eq('id', question.asker_id)
      .maybeSingle()
    asker = askerData || null
  }

  return { question, listing, seller, asker }
}

function buildQuestionEmailHtml({ recipientName, listingTitle, questionBody, listingUrl, assetsBase }) {
  const greeting = recipientName ? `Hola <strong>${escapeHtml(recipientName)}</strong>,` : 'Hola,'
  const safeTitle = escapeHtml(listingTitle || '')
  const safeQuestion =
    questionBody && questionBody.trim()
      ? escapeHtml(questionBody).replace(/\r?\n/g, '<br />')
      : '<em style="color:#64748b;">(sin contenido)</em>'
  const ctaUrl = escapeHtml(`${listingUrl}?tab=preguntas`)
  const base = (assetsBase || resolveFrontendBaseUrl() || '').replace(/\/$/, '')
  const logoUrl = `${base}/site-logo.png`
  return `<!DOCTYPE html>
<html lang="es">
  <head>
    <meta charset="utf-8" />
    <meta name="viewport" content="width=device-width, initial-scale=1" />
    <title>Nueva consulta en Ciclo Market</title>
  </head>
  <body style="margin:0; padding:0; background-color:#F4F5F7;">
    <table role="presentation" width="100%" cellspacing="0" cellpadding="0" border="0" style="background-color:#F4F5F7;">
      <tr>
        <td align="center" style="padding:24px 12px;">
          <table role="presentation" width="100%" cellspacing="0" cellpadding="0" border="0" style="max-width:600px; background-color:#FFFFFF; border-radius:12px; overflow:hidden;">
            <tr>
              <td align="center" style="padding:20px 20px 10px 20px; background-color:#FFFFFF;">
                <img src="${logoUrl}" alt="Ciclo Market" width="120" style="display:block; max-width:120px; height:auto; margin:0 auto;" />
              </td>
            </tr>
            <tr>
              <td align="center" style="background-color:#FFFFFF; padding:0 20px 16px 20px;">
                <table role="presentation" cellspacing="0" cellpadding="0" border="0">
                  <tr>
                    <td style="padding:0 8px;">
                      <a href="https://www.ciclomarket.ar/marketplace?bikes=1" style="font-family:Arial, sans-serif; font-size:13px; color:#14212E; text-decoration:none;">Bicicletas</a>
                    </td>
                    <td style="padding:0 8px;">
                      <a href="https://www.ciclomarket.ar/marketplace?cat=Accesorios" style="font-family:Arial, sans-serif; font-size:13px; color:#14212E; text-decoration:none;">Accesorios</a>
                    </td>
                    <td style="padding:0 8px;">
                      <a href="https://www.ciclomarket.ar/marketplace?cat=Indumentaria" style="font-family:Arial, sans-serif; font-size:13px; color:#14212E; text-decoration:none;">Indumentaria</a>
                    </td>
                    <td style="padding:0 8px;">
                      <a href="https://www.ciclomarket.ar/marketplace?cat=Nutrici%C3%B3n" style="font-family:Arial, sans-serif; font-size:13px; color:#14212E; text-decoration:none;">Nutrición</a>
                    </td>
                  </tr>
                </table>
              </td>
            </tr>
            <tr>
              <td style="padding:24px 24px 8px 24px; background-color:#14212E;">
                <h1 style="margin:0; font-family:Arial, sans-serif; font-size:22px; line-height:1.3; color:#FFFFFF; font-weight:bold;">
                  Recibiste una pregunta sobre tu publicación
                </h1>
              </td>
            </tr>
            <tr>
              <td style="padding:20px 24px 8px 24px; background-color:#FFFFFF;">
                <p style="margin:0 0 12px 0; font-family:Arial, sans-serif; font-size:14px; color:#111111;">
                  ${greeting}
                </p>
                <p style="margin:0 0 12px 0; font-family:Arial, sans-serif; font-size:14px; color:#111111;">
                  Recibiste una nueva consulta en <strong>${safeTitle}</strong>:
                </p>
              </td>
            </tr>
            <tr>
              <td style="padding:0 24px 20px 24px; background-color:#FFFFFF;">
                <div style="border-radius:8px; background-color:#F4F5F7; padding:14px 16px; font-family:Arial, sans-serif; font-size:14px; color:#111111;">
                  ${safeQuestion}
                </div>
              </td>
            </tr>
            <tr>
              <td align="center" style="padding:0 24px 20px 24px; background-color:#FFFFFF;">
                <a href="${ctaUrl}" style="display:inline-block; padding:12px 24px; background-color:#14212E; color:#FFFFFF; font-family:Arial, sans-serif; font-size:14px; font-weight:bold; text-decoration:none; border-radius:999px;">
                  Ver consulta y responder
                </a>
              </td>
            </tr>
            <tr>
              <td style="padding:0 24px 24px 24px; background-color:#FFFFFF;">
                <div style="border-radius:8px; background-color:#14212E; padding:14px 16px;">
                  <p style="margin:0; font-family:Arial, sans-serif; font-size:13px; color:#FFFFFF;">
                    <strong>Tip:</strong> las respuestas rápidas mejoran tu conversión. Si la consulta requiere fotos extra, podés adjuntarlas en la misma conversación.
                  </p>
                </div>
              </td>
            </tr>
            <tr>
              <td style="padding:20px 24px 8px 24px; background-color:#FFFFFF; border-top:1px solid #E2E4E8;">
                <h2 style="margin:0 0 8px 0; font-family:Arial, sans-serif; font-size:16px; color:#14212E;">
                  ¿Por qué vender en Ciclo Market?
                </h2>
                <ul style="margin:8px 0 0 18px; padding:0; font-family:Arial, sans-serif; font-size:13px; color:#444444; line-height:1.5;">
                  <li>Público 100% ciclista, sin ruido de otros rubros.</li>
                  <li>Tu bici se muestra en un entorno pensado para vender más rápido.</li>
                  <li>Contacto directo con compradores reales por WhatsApp o mensajes internos.</li>
                </ul>
              </td>
            </tr>
            <tr>
              <td style="padding:16px 24px 20px 24px; background-color:#FFFFFF;">
                <p style="margin:0 0 8px 0; font-family:Arial, sans-serif; font-size:12px; color:#777777;">
                  Si necesitás ayuda, escribinos a <a href="mailto:hola@ciclomarket.ar" style="color:#14212E; text-decoration:none;">hola@ciclomarket.ar</a>.
                </p>
                <p style="margin:0 0 6px 0; font-family:Arial, sans-serif; font-size:12px; color:#777777;">
                  Instagram: <a href="https://www.instagram.com/ciclomarket.ar" style="color:#14212E; text-decoration:none;">@ciclomarket.ar</a>
                </p>
                <p style="margin:0; font-family:Arial, sans-serif; font-size:12px; color:#777777;">
                  LinkedIn: <a href="https://www.linkedin.com/company/ciclo-market" style="color:#14212E; text-decoration:none;">Ciclo Market</a>
                </p>
              </td>
            </tr>
          </table>
        </td>
      </tr>
    </table>
  </body>
</html>`
}

function buildAnswerEmailHtml({ recipientName, listingTitle, answerBody, listingUrl, assetsBase }) {
  const greeting = recipientName ? `Hola <strong>${escapeHtml(recipientName)}</strong>,` : 'Hola,'
  const safeTitle = escapeHtml(listingTitle || '')
  const safeAnswer =
    answerBody && answerBody.trim()
      ? escapeHtml(answerBody).replace(/\r?\n/g, '<br />')
      : '<em style="color:#64748b;">(sin respuesta)</em>'
  const ctaUrl = escapeHtml(`${listingUrl}?tab=preguntas`)
  const base = (assetsBase || resolveFrontendBaseUrl() || '').replace(/\/$/, '')
  const logoUrl = `${base}/site-logo.png`
  return `<!DOCTYPE html>
<html lang="es">
  <head>
    <meta charset="utf-8" />
    <meta name="viewport" content="width=device-width, initial-scale=1" />
    <title>Respuesta recibida en Ciclo Market</title>
  </head>
  <body style="margin:0; padding:0; background-color:#F4F5F7;">
    <table role="presentation" width="100%" cellspacing="0" cellpadding="0" border="0" style="background-color:#F4F5F7;">
      <tr>
        <td align="center" style="padding:24px 12px;">
          <table role="presentation" width="100%" cellspacing="0" cellpadding="0" border="0" style="max-width:600px; background-color:#FFFFFF; border-radius:12px; overflow:hidden;">
            <tr>
              <td align="center" style="padding:20px 20px 10px 20px; background-color:#FFFFFF;">
                <img src="${logoUrl}" alt="Ciclo Market" width="120" style="display:block; max-width:120px; height:auto; margin:0 auto;" />
              </td>
            </tr>
            <tr>
              <td align="center" style="background-color:#FFFFFF; padding:0 20px 16px 20px;">
                <table role="presentation" cellspacing="0" cellpadding="0" border="0">
                  <tr>
                    <td style="padding:0 8px;">
                      <a href="https://www.ciclomarket.ar/marketplace?bikes=1" style="font-family:Arial, sans-serif; font-size:13px; color:#14212E; text-decoration:none;">Bicicletas</a>
                    </td>
                    <td style="padding:0 8px;">
                      <a href="https://www.ciclomarket.ar/marketplace?cat=Accesorios" style="font-family:Arial, sans-serif; font-size:13px; color:#14212E; text-decoration:none;">Accesorios</a>
                    </td>
                    <td style="padding:0 8px;">
                      <a href="https://www.ciclomarket.ar/marketplace?cat=Indumentaria" style="font-family:Arial, sans-serif; font-size:13px; color:#14212E; text-decoration:none;">Indumentaria</a>
                    </td>
                    <td style="padding:0 8px;">
                      <a href="https://www.ciclomarket.ar/marketplace?cat=Nutrici%C3%B3n" style="font-family:Arial, sans-serif; font-size:13px; color:#14212E; text-decoration:none;">Nutrición</a>
                    </td>
                  </tr>
                </table>
              </td>
            </tr>
            <tr>
              <td style="padding:24px 24px 8px 24px; background-color:#14212E;">
                <h1 style="margin:0; font-family:Arial, sans-serif; font-size:22px; line-height:1.3; color:#FFFFFF; font-weight:bold;">
                  El vendedor respondió tu consulta
                </h1>
              </td>
            </tr>
            <tr>
              <td style="padding:20px 24px 8px 24px; background-color:#FFFFFF;">
                <p style="margin:0 0 12px 0; font-family:Arial, sans-serif; font-size:14px; color:#111111;">
                  ${greeting}
                </p>
                <p style="margin:0 0 12px 0; font-family:Arial, sans-serif; font-size:14px; color:#111111;">
                  Recibiste una respuesta sobre <strong>${safeTitle}</strong>:
                </p>
              </td>
            </tr>
            <tr>
              <td style="padding:0 24px 20px 24px; background-color:#FFFFFF;">
                <div style="border-radius:8px; background-color:#F4F5F7; padding:14px 16px; font-family:Arial, sans-serif; font-size:14px; color:#111111;">
                  ${safeAnswer}
                </div>
              </td>
            </tr>
            <tr>
              <td align="center" style="padding:0 24px 20px 24px; background-color:#FFFFFF;">
                <a href="${ctaUrl}" style="display:inline-block; padding:12px 24px; background-color:#14212E; color:#FFFFFF; font-family:Arial, sans-serif; font-size:14px; font-weight:bold; text-decoration:none; border-radius:999px;">
                  Ver conversación completa
                </a>
              </td>
            </tr>
            <tr>
              <td style="padding:0 24px 24px 24px; background-color:#FFFFFF;">
                <div style="border-radius:8px; background-color:#14212E; padding:14px 16px;">
                  <p style="margin:0; font-family:Arial, sans-serif; font-size:13px; color:#FFFFFF;">
                    Coordiná la próxima etapa desde la publicación para organizar pruebas, envíos o cerrar la operación con tranquilidad.
                  </p>
                </div>
              </td>
            </tr>
            <tr>
              <td style="padding:20px 24px 8px 24px; background-color:#FFFFFF; border-top:1px solid #E2E4E8;">
                <h2 style="margin:0 0 8px 0; font-family:Arial, sans-serif; font-size:16px; color:#14212E;">
                  ¿Por qué comprar en Ciclo Market?
                </h2>
                <ul style="margin:8px 0 0 18px; padding:0; font-family:Arial, sans-serif; font-size:13px; color:#444444; line-height:1.5;">
                  <li>Solo productos pensados para ciclistas, curados por la comunidad.</li>
                  <li>Publicaciones con fotos, detalles reales y vendedores verificados.</li>
                  <li>Contacto directo para coordinar pagos, envíos y pruebas sin intermediarios.</li>
                </ul>
              </td>
            </tr>
            <tr>
              <td style="padding:16px 24px 20px 24px; background-color:#FFFFFF;">
                <p style="margin:0 0 8px 0; font-family:Arial, sans-serif; font-size:12px; color:#777777;">
                  ¿Necesitás ayuda? Escribinos a <a href="mailto:hola@ciclomarket.ar" style="color:#14212E; text-decoration:none;">hola@ciclomarket.ar</a>.
                </p>
                <p style="margin:0 0 6px 0; font-family:Arial, sans-serif; font-size:12px; color:#777777;">
                  Instagram: <a href="https://www.instagram.com/ciclomarket.ar" style="color:#14212E; text-decoration:none;">@ciclomarket.ar</a>
                </p>
                <p style="margin:0; font-family:Arial, sans-serif; font-size:12px; color:#777777;">
                  LinkedIn: <a href="https://www.linkedin.com/company/ciclo-market" style="color:#14212E; text-decoration:none;">Ciclo Market</a>
                </p>
              </td>
            </tr>
          </table>
        </td>
      </tr>
    </table>
  </body>
</html>`
}

router.post('/api/questions/notify', async (req, res) => {
  try {
    const { questionId, event } = req.body || {}
    if (!questionId || !LISTING_QUESTION_EVENTS.has(event)) {
      return res.status(400).json({ ok: false, error: 'invalid_payload' })
    }
    const supabase = getSupabaseOrFail(res)
    if (!supabase) return
    if (!isMailConfigured()) {
      return res.json({ ok: true, skipped: 'mail_not_configured' })
    }

    const context = await fetchQuestionContext(supabase, questionId)
    if (!context) return res.status(404).json({ ok: false, error: 'question_not_found' })
    const { question, listing, seller, asker } = context
    if (!listing) return res.status(404).json({ ok: false, error: 'listing_not_found' })

    const frontBase = resolveFrontendBaseUrl()
    const listingUrl = `${frontBase}/listing/${encodeURIComponent(listing.slug || listing.id)}`
    const subjectPrefix = 'Consulta en tu publicación'

    if (event === 'asked' && seller?.email) {
      const html = buildQuestionEmailHtml({
        recipientName: seller.full_name || seller.email,
        listingTitle: listing.title || '',
        questionBody: question.question_body || '',
        listingUrl,
        assetsBase: frontBase,
      })
      await sendMail({
        to: seller.email,
        subject: `${subjectPrefix}: ${listing.title}`,
        html,
        text: `${seller.full_name ? `Hola ${seller.full_name},` : 'Hola,'}

Recibiste una nueva consulta en tu publicación "${listing.title}":

"${question.question_body || '(sin contenido)'}"

Respondela desde tu panel: ${listingUrl}?tab=preguntas

— Equipo Ciclo Market`,
      })
    } else if (event === 'answered' && asker?.email) {
      const html = buildAnswerEmailHtml({
        recipientName: asker.full_name || asker.email,
        listingTitle: listing.title || '',
        answerBody: question.answer_body || '',
        listingUrl,
        assetsBase: frontBase,
      })
      await sendMail({
        to: asker.email,
        subject: `Respondieron tu consulta: ${listing.title}`,
        html,
        text: `${asker.full_name ? `Hola ${asker.full_name},` : 'Hola,'}

El vendedor respondió tu consulta sobre "${listing.title}":
"${question.answer_body || '(sin respuesta)'}"

Seguí la conversación desde la publicación: ${listingUrl}?tab=preguntas

— Equipo Ciclo Market`,
      })
    }

    return res.json({ ok: true })
  } catch (err) {
    console.error('[api] questions notify unexpected error', err)
    return res.status(500).json({ ok: false, error: 'unexpected_error' })
  }
})

/* -------------------------------------------------------------------------- */
/* Verificación de vendedores                                                 */
/* -------------------------------------------------------------------------- */

router.post('/api/verification/request', async (req, res) => {
  try {
    const { name, instagram, phone, email, message, attachments } = req.body || {}
    if (!name || !validateEmail(email) || !message) {
      return res.status(400).json({ ok: false, error: 'invalid_payload' })
    }
    const supabase = getSupabaseOrFail(res)
    if (!supabase) return

    const insertPayload = {
      name,
      email,
      instagram: instagram || null,
      phone: phone || null,
      message: message.trim(),
      attachments: Array.isArray(attachments) ? attachments : [],
    }
    const { error } = await supabase.from('verification_requests').insert(insertPayload)
    if (error) {
      console.error('[api] verification insert failed', error)
    }

    if (isMailConfigured()) {
      const to = process.env.VERIFICATION_ALERT_EMAIL || process.env.SMTP_USER || email
      try {
        await sendMail({
          to,
          subject: 'Nueva solicitud de verificación · Ciclo Market',
          html: `<p>Recibimos una nueva solicitud de verificación:</p>
<ul>
  <li><strong>Nombre:</strong> ${name}</li>
  <li><strong>Email:</strong> ${email}</li>
  ${instagram ? `<li><strong>Instagram:</strong> ${instagram}</li>` : ''}
  ${phone ? `<li><strong>Teléfono:</strong> ${phone}</li>` : ''}
</ul>
<p><strong>Mensaje:</strong></p>
<pre>${message}</pre>
${Array.isArray(attachments) && attachments.length ? `<p><strong>Adjuntos:</strong><br>${attachments.map((a) => `<a href="${a}">${a}</a>`).join('<br>')}</p>` : ''}`,
          text: `Nueva solicitud de verificación
Nombre: ${name}
Email: ${email}
${instagram ? `Instagram: ${instagram}\n` : ''}${phone ? `Teléfono: ${phone}\n` : ''}
Mensaje:
${message}
${Array.isArray(attachments) && attachments.length ? `Adjuntos:\n${attachments.join('\n')}` : ''}`,
        })
      } catch (mailError) {
        console.warn('[api] verification mail failed', mailError?.message || mailError)
      }
    }

    return res.json({ ok: true })
  } catch (err) {
    console.error('[api] verification request unexpected error', err)
    return res.status(500).json({ ok: false, error: 'unexpected_error' })
  }
})

/* -------------------------------------------------------------------------- */
/* Newsletter                                                                 */
/* -------------------------------------------------------------------------- */

async function upsertAudienceContact({ apiKey, audienceId, email, name, unsubscribed }) {
  const payload = {
    email,
    ...(name ? { first_name: name } : {}),
    unsubscribed: Boolean(unsubscribed),
  }
  const url = `https://api.resend.com/audiences/${encodeURIComponent(audienceId)}/contacts`
  const res = await fetch(url, {
    method: 'POST',
    headers: {
      Authorization: `Bearer ${apiKey}`,
      'Content-Type': 'application/json',
    },
    body: JSON.stringify(payload),
  })
  if (!res.ok) {
    const data = await res.json().catch(() => ({}))
    const message = data?.error?.message || data?.message || 'resend_error'
    throw new Error(message)
  }
}

router.post('/api/newsletter/subscribe', async (req, res) => {
  try {
    const { email, name, audienceId } = req.body || {}
    if (!validateEmail(email)) {
      return res.status(400).json({ ok: false, error: 'invalid_email' })
    }
    const apiKey = process.env.RESEND_API_KEY
    const targetAudience = audienceId || process.env.RESEND_AUDIENCE_GENERAL_ID
    if (!apiKey || !targetAudience) {
      console.warn('[api] newsletter subscribe without Resend configuration')
      return res.status(500).json({ ok: false, error: 'newsletter_not_configured' })
    }

    await upsertAudienceContact({
      apiKey,
      audienceId: targetAudience,
      email: email.trim(),
      name: name ? String(name).trim() : undefined,
      unsubscribed: false,
    })
    return res.json({ ok: true })
  } catch (err) {
    console.error('[api] newsletter subscribe failed', err)
    return res.status(500).json({ ok: false, error: err?.message || 'unexpected_error' })
  }
})

router.get('/api/newsletter/unsubscribe', async (req, res) => {
  try {
    const email = String(req.query.e || '').trim()
    const token = String(req.query.t || '').trim()
    if (!validateEmail(email) || !token) {
      return res.status(400).send('Solicitud inválida.')
    }
    const secret = String(process.env.NEWSLETTER_UNSUB_SECRET || process.env.CRON_SECRET || '')
    if (!secret) {
      return res.status(500).send('Servicio no configurado.')
    }
    const expected = crypto.createHmac('sha256', secret).update(email).digest('base64url')
    if (expected !== token) {
      return res.status(401).send('Token inválido.')
    }
    const apiKey = process.env.RESEND_API_KEY
    const audienceId = process.env.RESEND_AUDIENCE_GENERAL_ID
    if (!apiKey || !audienceId) {
      return res.status(500).send('Servicio no configurado.')
    }

    try {
      await upsertAudienceContact({
        apiKey,
        audienceId,
        email,
        unsubscribed: true,
      })
    } catch (err) {
      console.error('[api] newsletter unsubscribe failed', err)
      return res.status(500).send('No pudimos procesar la baja.')
    }

    return res.send(
      `<html><body style="font-family:system-ui;padding:2rem;"><h1>Te desuscribimos correctamente</h1><p>${email} ya no recibirá el newsletter de Ciclo Market.</p><p><a href="https://ciclomarket.ar">Volver al sitio</a></p></body></html>`,
    )
  } catch (err) {
    console.error('[api] newsletter unsubscribe unexpected error', err)
    return res.status(500).send('Ocurrió un error. Intentá nuevamente más tarde.')
  }
})

module.exports = router
