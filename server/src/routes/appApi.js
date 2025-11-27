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

router.post('/api/contacts/log', async (req, res) => {
  try {
    const { sellerId, buyerId, listingId, type } = req.body || {}
    if (!sellerId || typeof type !== 'string') {
      return res.status(400).json({ ok: false, error: 'missing_fields' })
    }
    const supabase = getSupabaseOrFail(res)
    if (!supabase) return
    const basePayload = {
      seller_id: sellerId,
      buyer_id: buyerId || null,
      listing_id: listingId || null,
    }
    const attempts = [
      { ...basePayload, channel: type, meta: { source: 'web' } },
      { ...basePayload, contact_type: type },
      basePayload,
    ]
    let lastError = null
    for (const payload of attempts) {
      const { error } = await supabase.from('contact_events').insert(payload)
      if (!error) {
        return res.json({ ok: true })
      }
      lastError = error
      if (error?.message && !/column .* does not exist/i.test(error.message)) {
        break
      }
    }
    console.warn('[api] contact_events insert fallback failed', lastError)
    return res.status(500).json({ ok: false, error: 'insert_failed' })
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
      await sendMail({
        to: seller.email,
        subject: `${subjectPrefix}: ${listing.title}`,
        html: `<p>Hola${seller.full_name ? ` ${seller.full_name}` : ''},</p>
<p>Recibiste una nueva consulta en tu publicación <strong>${listing.title}</strong>:</p>
<blockquote>${question.question_body || '(sin contenido)'}</blockquote>
<p>Respondela desde <a href="${listingUrl}?tab=preguntas">tu panel</a> para que el comprador reciba la respuesta.</p>
<p>— Equipo Ciclo Market</p>`,
        text: `Hola${seller.full_name ? ` ${seller.full_name}` : ''},

Recibiste una nueva consulta en tu publicación "${listing.title}":

"${question.question_body || '(sin contenido)'}"

Respondela desde tu panel: ${listingUrl}?tab=preguntas

— Equipo Ciclo Market`,
      })
    } else if (event === 'answered' && asker?.email) {
      await sendMail({
        to: asker.email,
        subject: `Respondieron tu consulta: ${listing.title}`,
        html: `<p>Hola${asker.full_name ? ` ${asker.full_name}` : ''},</p>
<p>El vendedor respondió tu consulta sobre <strong>${listing.title}</strong>:</p>
<blockquote>${question.answer_body || '(sin respuesta)'}</blockquote>
<p>Seguí la conversación desde <a href="${listingUrl}?tab=preguntas">la publicación</a>.</p>
<p>— Equipo Ciclo Market</p>`,
        text: `Hola${asker.full_name ? ` ${asker.full_name}` : ''},

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
