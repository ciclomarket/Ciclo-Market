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

function isUuid(value) {
  if (!value) return false
  return /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i.test(String(value))
}

function clamp(value, maxLength) {
  if (value == null) return null
  const text = String(value)
  return text.length > maxLength ? text.slice(0, maxLength) : text
}

function validateEmail(email) {
  if (!email) return false
  return /^[^@\s]+@[^@\s]+\.[^@\s]+$/.test(String(email).trim())
}

function escapeHtml(value) {
  return String(value ?? '')
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#39;')
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

    // Keep `public.listings.view_count` in sync via `public.listing_views` trigger.
    // This makes the UI counter (which reads from `listings_enriched.view_count`) reflect real traffic,
    // even if the client can't write directly to `listing_views` due to RLS/env issues.
    const dbCounted = payload.db_counted === true
    if (type === 'listing_view' && isUuid(payload.listing_id) && !dbCounted) {
      try {
        const { error: viewsError } = await supabase.from('listing_views').insert({ listing_id: payload.listing_id })
        if (viewsError) console.warn('[api] listing_views insert failed', viewsError)
      } catch (err) {
        console.warn('[api] listing_views insert unexpected error', err?.message || err)
      }
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

router.post('/api/contacts/log', async (req, res) => {
  try {
    const { sellerId, buyerId, listingId, type } = req.body || {}
    if (!sellerId || typeof type !== 'string') {
      return res.status(400).json({ ok: false, error: 'missing_fields' })
    }
    const normalizedType = String(type).toLowerCase()
    if (normalizedType !== 'whatsapp' && normalizedType !== 'email') {
      return res.status(400).json({ ok: false, error: 'invalid_type' })
    }
    const supabase = getSupabaseOrFail(res)
    if (!supabase) return
    const payload = {
      seller_id: String(sellerId),
      buyer_id: buyerId ? String(buyerId) : null,
      listing_id: listingId ? String(listingId) : null,
      type: normalizedType,
    }
    const { error } = await supabase.from('contact_events').insert(payload)
    if (error) {
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

router.get('/api/reviews/:sellerId', async (req, res) => {
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
    const sellerId = String(req.query.sellerId || '').trim()
    const buyerId = String(req.query.buyerId || '').trim()
    if (!sellerId || !buyerId) {
      return res.status(400).json({ allowed: false, reason: 'missing_fields' })
    }
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

function buildQuestionEmailHtml({ recipientName, listingTitle, questionBody, listingUrl }) {
  const greeting = recipientName ? `Hola <strong>${escapeHtml(recipientName)}</strong>,` : 'Hola,'
  const safeTitle = escapeHtml(listingTitle || '')
  const safeQuestion =
    questionBody && questionBody.trim()
      ? escapeHtml(questionBody).replace(/\r?\n/g, '<br />')
      : '<em style="color:#64748b;">(sin contenido)</em>'
  const ctaUrl = escapeHtml(`${listingUrl}?tab=preguntas`)
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
                <img src="https://www.ciclomarket.ar/_static/email-logo-ciclomarket.png" alt="Ciclo Market" width="120" style="display:block; max-width:120px; height:auto; margin:0 auto;" />
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
                  Si necesitás ayuda, escribinos a <a href="mailto:admin@ciclomarket.ar" style="color:#14212E; text-decoration:none;">hola@ciclomarket.ar</a>.
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

function buildAnswerEmailHtml({ recipientName, listingTitle, answerBody, listingUrl }) {
  const greeting = recipientName ? `Hola <strong>${escapeHtml(recipientName)}</strong>,` : 'Hola,'
  const safeTitle = escapeHtml(listingTitle || '')
  const safeAnswer =
    answerBody && answerBody.trim()
      ? escapeHtml(answerBody).replace(/\r?\n/g, '<br />')
      : '<em style="color:#64748b;">(sin respuesta)</em>'
  const ctaUrl = escapeHtml(`${listingUrl}?tab=preguntas`)
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
                <img src="https://www.ciclomarket.ar/_static/email-logo-ciclomarket.png" alt="Ciclo Market" width="120" style="display:block; max-width:120px; height:auto; margin:0 auto;" />
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

/* -------------------------------------------------------------------------- */
/* MercadoLibre import (POC)                                                  */
/* -------------------------------------------------------------------------- */

function pickAttributeValue(attributes, id) {
  if (!Array.isArray(attributes) || !id) return null
  const target = attributes.find((attr) => String(attr?.id || '').toUpperCase() === String(id).toUpperCase())
  const value = target?.value_name ?? target?.value_struct?.name ?? null
  return value ? String(value) : null
}

const meliAppTokenCache = {
  token: null,
  expiresAtMs: 0,
}

function decodeHtmlEntities(input) {
  if (!input) return ''
  return String(input)
    .replace(/&quot;/g, '"')
    .replace(/&#39;/g, "'")
    .replace(/&apos;/g, "'")
    .replace(/&lt;/g, '<')
    .replace(/&gt;/g, '>')
    .replace(/&amp;/g, '&')
}

function extractMetaTagContent(html, { name, property }) {
  if (!html) return null
  const key = name ? 'name' : 'property'
  const value = name || property
  if (!value) return null
  const re = new RegExp(`<meta[^>]+${key}=["']${String(value).replace(/[.*+?^${}()|[\\]\\\\]/g, '\\\\$&')}["'][^>]*>`, 'i')
  const tag = html.match(re)?.[0] || null
  if (!tag) return null
  const content = tag.match(/content=["']([^"']+)["']/i)?.[1] || null
  return content ? decodeHtmlEntities(content) : null
}

function normalizeSchemaCondition(value) {
  const v = String(value || '').toLowerCase()
  if (!v) return null
  if (v.includes('newcondition') || v === 'new') return 'new'
  if (v.includes('usedcondition') || v === 'used') return 'used'
  return null
}

function pickJsonLdProduct(payload) {
  if (!payload) return null
  const candidates = []

  function pushMaybe(node) {
    if (!node || typeof node !== 'object') return
    const type = node['@type']
    const types = Array.isArray(type) ? type : type ? [type] : []
    if (types.some((t) => String(t).toLowerCase() === 'product')) candidates.push(node)
  }

  function walk(node) {
    if (!node) return
    if (Array.isArray(node)) {
      for (const entry of node) walk(entry)
      return
    }
    if (typeof node !== 'object') return
    pushMaybe(node)
    if (node['@graph']) walk(node['@graph'])
  }

  walk(payload)
  return candidates[0] || null
}

async function importFromMeliHtml({ pageUrl, externalId }) {
  const headers = {
    Accept: 'text/html,application/xhtml+xml,application/xml;q=0.9,*/*;q=0.8',
    'Accept-Language': 'es-AR,es;q=0.9,en;q=0.8',
    'User-Agent':
      'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/122.0.0.0 Safari/537.36',
  }
  const resp = await fetch(pageUrl, { headers, redirect: 'follow' })
  const contentType = String(resp.headers.get('content-type') || '')
  const status = resp.status
  const html = await resp.text().catch(() => '')
  if (!resp.ok) {
    return { ok: false, status, contentType, error: 'html_fetch_failed' }
  }

  const scripts = [...html.matchAll(/<script[^>]*type=["']application\/ld\+json["'][^>]*>([\s\S]*?)<\/script>/gi)]
  let product = null
  for (const match of scripts) {
    const raw = match?.[1]
    if (!raw) continue
    try {
      const parsed = JSON.parse(raw.trim())
      product = pickJsonLdProduct(parsed)
      if (product) break
    } catch {
      // ignore invalid json-ld blocks
    }
  }

  const title = (typeof product?.name === 'string' && product.name) || extractMetaTagContent(html, { property: 'og:title' }) || null
  const description =
    (typeof product?.description === 'string' && product.description) || extractMetaTagContent(html, { property: 'og:description' }) || null

  const imagesRaw = product?.image ?? null
  const images = (Array.isArray(imagesRaw) ? imagesRaw : imagesRaw ? [imagesRaw] : [])
    .filter((u) => typeof u === 'string' && u.length)
    .slice(0, 20)

  const offer = Array.isArray(product?.offers) ? product.offers[0] : product?.offers || null
  const price =
    typeof offer?.price === 'number' ? offer.price : offer?.price != null && String(offer.price).trim() ? Number(offer.price) : null
  const currency = typeof offer?.priceCurrency === 'string' ? offer.priceCurrency : null
  const condition = normalizeSchemaCondition(offer?.itemCondition || product?.itemCondition)

  const brand =
    typeof product?.brand === 'string' ? product.brand : typeof product?.brand?.name === 'string' ? product.brand.name : null
  const model = typeof product?.model === 'string' ? product.model : null

  return {
    ok: true,
    normalized: {
      source: 'mercadolibre',
      external_id: externalId,
      title,
      price: Number.isFinite(price) ? price : null,
      currency,
      condition,
      description,
      images,
      brand,
      model,
    },
    meta: { status, contentType, scriptsFound: scripts.length },
  }
}

async function getMeliAppAccessToken({ forceRefresh = false } = {}) {
  const now = Date.now()
  if (!forceRefresh && meliAppTokenCache.token && meliAppTokenCache.expiresAtMs - now > 60_000) {
    return meliAppTokenCache.token
  }

  const clientId = String(process.env.MELI_CLIENT_ID || process.env.MERCADOLIBRE_CLIENT_ID || '').trim()
  const clientSecret = String(process.env.MELI_CLIENT_SECRET || process.env.MERCADOLIBRE_CLIENT_SECRET || '').trim()
  if (!clientId || !clientSecret) return null

  const body = new URLSearchParams()
  body.set('grant_type', 'client_credentials')
  body.set('client_id', clientId)
  body.set('client_secret', clientSecret)

  const resp = await fetch('https://api.mercadolibre.com/oauth/token', {
    method: 'POST',
    headers: {
      'Content-Type': 'application/x-www-form-urlencoded',
      Accept: 'application/json',
      'User-Agent':
        'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/122.0.0.0 Safari/537.36',
    },
    body,
  })

  const payload = await resp.json().catch(() => ({}))
  if (!resp.ok) {
    const msg = payload?.message || payload?.error || 'meli_oauth_failed'
    throw new Error(msg)
  }
  const token = typeof payload?.access_token === 'string' ? payload.access_token : null
  const expiresIn = typeof payload?.expires_in === 'number' ? payload.expires_in : Number(payload?.expires_in || 0)
  if (!token) throw new Error('meli_oauth_missing_token')

  meliAppTokenCache.token = token
  meliAppTokenCache.expiresAtMs = now + Math.max(0, expiresIn) * 1000
  return token
}

async function importMercadoLibreHandler(req, res) {
  try {
    const rawUrl = typeof req.body?.url === 'string' ? req.body.url.trim() : ''
    if (!rawUrl) {
      return res.status(400).json({ ok: false, error: 'missing_url', message: 'Falta `url` en el body.' })
    }
    const bodyToken = typeof req.body?.access_token === 'string' ? req.body.access_token.trim() : ''

    const normalizedForParse = rawUrl.startsWith('http://') || rawUrl.startsWith('https://') ? rawUrl : `https://${rawUrl}`
    let parsedUrl
    try {
      parsedUrl = new URL(normalizedForParse)
    } catch {
      return res.status(400).json({ ok: false, error: 'invalid_url', message: 'La URL ingresada no es válida.' })
    }

    const hostname = String(parsedUrl.hostname || '').toLowerCase()
    if (!hostname.endsWith('mercadolibre.com.ar')) {
      return res.status(400).json({ ok: false, error: 'invalid_domain', message: 'La URL debe ser de mercadolibre.com.ar.' })
    }

    const upperRawUrl = rawUrl.toUpperCase()
    const wid = String(parsedUrl.searchParams.get('wid') || '').toUpperCase().match(/MLA\d+/)?.[0] || null
    const itemIdFromUrl = upperRawUrl.match(/MLA-?\d+/g)?.map((m) => m.replace('-', '')) || []
    const lastMatch = itemIdFromUrl.length ? itemIdFromUrl[itemIdFromUrl.length - 1] : null

    const productMatch = parsedUrl.pathname.toUpperCase().match(/\/P\/(MLA\d+)/)
    const productId = productMatch ? productMatch[1] : null

    let externalId = wid || lastMatch
    if (!externalId && productId) {
      externalId = productId
    }
    if (!externalId) {
      return res.status(400).json({ ok: false, error: 'invalid_item_id', message: 'No pudimos extraer el ID (ej: MLA12345678).' })
    }

    if (productId && externalId === productId) {
      const productUrl = `https://api.mercadolibre.com/products/${encodeURIComponent(productId)}`
      let productRes = await fetch(productUrl, {
        headers: {
          Accept: 'application/json',
          'Accept-Language': 'es-AR,es;q=0.9,en;q=0.8',
          'User-Agent':
            'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/122.0.0.0 Safari/537.36',
        },
      })
      if (!productRes.ok && (productRes.status === 401 || productRes.status === 403 || productRes.status === 429)) {
        const token =
          bodyToken ||
          String(process.env.MERCADOLIBRE_ACCESS_TOKEN || process.env.MELI_ACCESS_TOKEN || '').trim() ||
          (await getMeliAppAccessToken().catch(() => null))
        if (token) {
          productRes = await fetch(productUrl, {
            headers: {
              Accept: 'application/json',
              'Accept-Language': 'es-AR,es;q=0.9,en;q=0.8',
              'User-Agent':
                'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/122.0.0.0 Safari/537.36',
              Authorization: `Bearer ${token}`,
            },
          })
        }
      }
      if (productRes.ok) {
        const product = await productRes.json().catch(() => null)
        const winnerItemId = product?.buy_box_winner?.item_id
        if (typeof winnerItemId === 'string' && /^MLA\d+$/i.test(winnerItemId)) {
          externalId = winnerItemId.toUpperCase()
        } else {
          return res.status(400).json({
            ok: false,
            error: 'product_url_requires_item',
            message: 'La URL es de producto (catálogo). Probá copiar el link de la publicación (ítem) o usá una URL que incluya `wid=MLA...`.',
          })
        }
      } else if (productRes.status === 404) {
        return res.status(404).json({ ok: false, error: 'product_not_found', message: 'No encontramos el producto en MercadoLibre.' })
      } else {
        const data = await productRes.json().catch(() => ({}))
        const message = data?.message || data?.error || 'meli_product_fetch_failed'
        return res.status(502).json({ ok: false, error: 'meli_error', message, status: productRes.status })
      }
    }

    async function fetchMeliJson(url, { token, useQueryToken = false }) {
      const headers = {
        Accept: 'application/json',
        'Accept-Language': 'es-AR,es;q=0.9,en;q=0.8',
        'User-Agent':
          'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/122.0.0.0 Safari/537.36',
        ...(token && !useQueryToken ? { Authorization: `Bearer ${token}` } : {}),
      }
      const finalUrl = (() => {
        if (!token || !useQueryToken) return url
        try {
          const u = new URL(url)
          u.searchParams.set('access_token', token)
          return u.toString()
        } catch {
          const join = url.includes('?') ? '&' : '?'
          return `${url}${join}access_token=${encodeURIComponent(token)}`
        }
      })()

      const response = await fetch(finalUrl, { headers })
      const contentType = String(response.headers.get('content-type') || '')
      const requestId = response.headers.get('x-request-id') || null
      const policyCode = response.headers.get('x-policy-agent-block-code') || null
      const policyReason = response.headers.get('x-policy-agent-block-reason') || null
      const payload = contentType.includes('application/json') ? await response.json().catch(() => null) : null
      return {
        ok: response.ok,
        status: response.status,
        payload,
        meta: {
          contentType,
          requestId,
          policyCode,
          policyReason,
          usedQueryToken: Boolean(useQueryToken),
          usedToken: Boolean(token),
        },
      }
    }

    const itemUrl = `https://api.mercadolibre.com/items/${encodeURIComponent(externalId)}`
    const descUrl = `https://api.mercadolibre.com/items/${encodeURIComponent(externalId)}/description`
    const bulkUrl = `https://api.mercadolibre.com/items?ids=${encodeURIComponent(externalId)}`
    const attempts = []

    let token =
      bodyToken ||
      String(process.env.MERCADOLIBRE_ACCESS_TOKEN || process.env.MELI_ACCESS_TOKEN || '').trim() ||
      (await getMeliAppAccessToken().catch((err) => {
        console.warn('[api] meli oauth token failed', err?.message || err)
        return null
      }))

    // Prefer anonymous fetch first (public endpoint). Only add token if needed.
    let itemAttempt = await fetchMeliJson(itemUrl, { token: null, useQueryToken: false })
    attempts.push({ step: 'item_anon', status: itemAttempt.status, meta: itemAttempt.meta })

    // If item endpoint is blocked, try the bulk endpoint anonymously (sometimes policies differ).
    if (!itemAttempt.ok && (itemAttempt.status === 403 || itemAttempt.status === 429)) {
      const bulkAnon = await fetchMeliJson(bulkUrl, { token: null, useQueryToken: false })
      attempts.push({ step: 'bulk_anon', status: bulkAnon.status, meta: bulkAnon.meta })
      if (bulkAnon.ok && Array.isArray(bulkAnon.payload) && bulkAnon.payload[0]?.body) {
        itemAttempt = { ...bulkAnon, payload: bulkAnon.payload[0].body }
      } else if (bulkAnon.ok && Array.isArray(bulkAnon.payload) && bulkAnon.payload[0]?.code && bulkAnon.payload[0]?.body) {
        itemAttempt = { ...bulkAnon, payload: bulkAnon.payload[0].body }
      }
    }

    if (!itemAttempt.ok && token && (itemAttempt.status === 401 || itemAttempt.status === 403 || itemAttempt.status === 429)) {
      // Try: Authorization header → query param token (some proxies/policies differ) → bulk endpoint fallback.
      itemAttempt = await fetchMeliJson(itemUrl, { token, useQueryToken: false })
      attempts.push({ step: 'item_auth_header', status: itemAttempt.status, meta: itemAttempt.meta })
    }
    if (!itemAttempt.ok && token && itemAttempt.status === 401) {
      const msg = String(itemAttempt.payload?.message || '').toLowerCase()
      if (msg.includes('invalid access token')) {
        token = await getMeliAppAccessToken({ forceRefresh: true }).catch(() => token)
        itemAttempt = await fetchMeliJson(itemUrl, { token, useQueryToken: false })
        attempts.push({ step: 'item_auth_header_refresh', status: itemAttempt.status, meta: itemAttempt.meta })
      }
    }
    if (!itemAttempt.ok && token && (itemAttempt.status === 401 || itemAttempt.status === 403)) {
      itemAttempt = await fetchMeliJson(itemUrl, { token, useQueryToken: true })
      attempts.push({ step: 'item_query_token', status: itemAttempt.status, meta: itemAttempt.meta })
    }
    if (!itemAttempt.ok && token && (itemAttempt.status === 401 || itemAttempt.status === 403)) {
      const bulkAttempt = await fetchMeliJson(bulkUrl, { token, useQueryToken: true })
      attempts.push({ step: 'bulk_query_token', status: bulkAttempt.status, meta: bulkAttempt.meta })
      if (bulkAttempt.ok && Array.isArray(bulkAttempt.payload) && bulkAttempt.payload[0]?.body) {
        itemAttempt = { ...bulkAttempt, payload: bulkAttempt.payload[0].body }
      } else if (bulkAttempt.ok && Array.isArray(bulkAttempt.payload) && bulkAttempt.payload[0]?.code && bulkAttempt.payload[0]?.body) {
        itemAttempt = { ...bulkAttempt, payload: bulkAttempt.payload[0].body }
      }
    }

    let descAttempt = await fetchMeliJson(descUrl, { token: null, useQueryToken: false })
    attempts.push({ step: 'desc_anon', status: descAttempt.status, meta: descAttempt.meta })
    if (!descAttempt.ok && token && (descAttempt.status === 401 || descAttempt.status === 403 || descAttempt.status === 429)) {
      descAttempt = await fetchMeliJson(descUrl, { token, useQueryToken: false })
      attempts.push({ step: 'desc_auth_header', status: descAttempt.status, meta: descAttempt.meta })
    }
    if (!descAttempt.ok && token && (descAttempt.status === 401 || descAttempt.status === 403)) {
      descAttempt = await fetchMeliJson(descUrl, { token, useQueryToken: true })
      attempts.push({ step: 'desc_query_token', status: descAttempt.status, meta: descAttempt.meta })
    }

    if (itemAttempt.status === 404) {
      return res.status(404).json({ ok: false, error: 'item_not_found', message: 'El ítem no existe en MercadoLibre.' })
    }
    if (!itemAttempt.ok) {
      const looksLikePolicyAgent =
        itemAttempt.status === 403 &&
        itemAttempt.payload &&
        typeof itemAttempt.payload === 'object' &&
        (itemAttempt.payload?.blocked_by === 'PolicyAgent' ||
          String(itemAttempt.payload?.code || '').toUpperCase().startsWith('PA_') ||
          String(itemAttempt.payload?.message || '').toLowerCase().includes('policy'))

      if (looksLikePolicyAgent) {
        const htmlFallback = await importFromMeliHtml({ pageUrl: parsedUrl.toString(), externalId }).catch((err) => ({
          ok: false,
          status: 0,
          contentType: null,
          error: err instanceof Error ? err.message : 'html_fallback_failed',
        }))
        if (htmlFallback?.ok && htmlFallback.normalized) {
          return res.json({ ...htmlFallback.normalized, meta: { html: htmlFallback.meta } })
        }
      }

      const data = itemAttempt.payload && typeof itemAttempt.payload === 'object' ? itemAttempt.payload : {}
      const message = data?.message || data?.error || 'meli_item_fetch_failed'
      if (itemAttempt.status === 401 || itemAttempt.status === 403) {
        return res.status(403).json({
          ok: false,
          error: 'meli_forbidden',
          message,
          status: itemAttempt.status,
          meta: itemAttempt.meta,
          attempts,
          hint:
            'MercadoLibre devolvió 401/403. Si el token es inválido, regeneralo; si estás usando `client_credentials`, podés configurar `MELI_CLIENT_ID`/`MELI_CLIENT_SECRET` para que el backend emita tokens automáticamente. Si persiste y ves `PolicyAgent`, suele ser bloqueo por políticas/IP y puede requerir OAuth Authorization Code (token de usuario) o un fallback por HTML.',
        })
      }
      return res
        .status(502)
        .json({ ok: false, error: 'meli_error', message, status: itemAttempt.status, meta: itemAttempt.meta, attempts })
    }

    const item = itemAttempt.payload
    if (!item || typeof item !== 'object') {
      return res.status(502).json({ ok: false, error: 'meli_error', message: 'Respuesta inválida de MercadoLibre (item).' })
    }

    const descriptionPayload = descAttempt.ok && descAttempt.payload && typeof descAttempt.payload === 'object' ? descAttempt.payload : {}
    const descriptionText =
      typeof descriptionPayload?.plain_text === 'string'
        ? descriptionPayload.plain_text
        : typeof descriptionPayload?.text === 'string'
          ? descriptionPayload.text
          : null

    const pictures = Array.isArray(item.pictures) ? item.pictures : []
    const images = pictures
      .map((p) => p?.secure_url || p?.url)
      .filter((u) => typeof u === 'string' && u.length)

    const rawCondition = String(item.condition || '').toLowerCase()
    const condition = rawCondition === 'new' ? 'new' : rawCondition === 'used' ? 'used' : null

    const normalized = {
      source: 'mercadolibre',
      external_id: externalId,
      title: typeof item.title === 'string' ? item.title : null,
      price: typeof item.price === 'number' ? item.price : item.price != null ? Number(item.price) : null,
      currency: typeof item.currency_id === 'string' ? item.currency_id : null,
      condition,
      description: descriptionText,
      images,
      brand: pickAttributeValue(item.attributes, 'BRAND'),
      model: pickAttributeValue(item.attributes, 'MODEL'),
    }

    return res.json(normalized)
  } catch (err) {
    console.error('[api] import mercadolibre unexpected error', err)
    return res.status(500).json({ ok: false, error: 'unexpected_error' })
  }
}

// MercadoLibre import endpoint moved to `./import` router (Puppeteer scraping).

module.exports = router
