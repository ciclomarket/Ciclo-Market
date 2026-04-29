'use strict'

const express = require('express')
const { getServerSupabaseClient } = require('../lib/supabaseClient')
const { renderListingCard } = require('../lib/instagramCard/render')

const router = express.Router()

const INSTAGRAM_CARDS_BUCKET = process.env.INSTAGRAM_CARDS_BUCKET || 'instagram-cards'
const SUPABASE_URL = process.env.SUPABASE_SERVICE_URL || process.env.SUPABASE_URL || ''

// ── helpers ──────────────────────────────────────────────────────────────────

function getSupabaseOrFail(res) {
  try {
    return getServerSupabaseClient()
  } catch (err) {
    console.error('[instagram-card] supabase init failed', err?.message)
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
  } catch {
    return null
  }
}

async function isModerator(supabase, userId) {
  if (!userId) return false
  try {
    const { data } = await supabase
      .from('user_roles')
      .select('role')
      .eq('user_id', userId)
      .maybeSingle()
    const role = String(data?.role || '').toLowerCase()
    return role === 'moderator' || role === 'admin'
  } catch {
    return false
  }
}

// ── POST /api/listings/:id/instagram-card ─────────────────────────────────

router.post('/listings/:id/instagram-card', async (req, res) => {
  const { id } = req.params

  const supabase = getSupabaseOrFail(res)
  if (!supabase) return

  // Auth
  const authUser = await getAuthUser(req, supabase)
  if (!authUser) {
    return res.status(401).json({ ok: false, error: 'not_authenticated' })
  }

  // Load listing
  const { data: listing, error: listingErr } = await supabase
    .from('listings')
    .select('id, title, brand, model, year, category, price, price_currency, seller_id, seller_name, images')
    .eq('id', id)
    .maybeSingle()

  if (listingErr) {
    console.error('[instagram-card] listing fetch error', listingErr.message)
    return res.status(500).json({ ok: false, error: 'listing_fetch_failed' })
  }
  if (!listing) {
    return res.status(404).json({ ok: false, error: 'listing_not_found' })
  }

  // Authorize: must be owner or moderator/admin
  const isOwner = authUser.id === listing.seller_id
  const isMod = isOwner ? false : await isModerator(supabase, authUser.id)
  if (!isOwner && !isMod) {
    return res.status(403).json({ ok: false, error: 'forbidden' })
  }

  // Validate image availability
  const imageUrl = Array.isArray(listing.images) && listing.images.length > 0
    ? listing.images[0]
    : null
  if (!imageUrl) {
    return res.status(400).json({ ok: false, error: 'no_image', message: 'La publicación no tiene imágenes para generar el post.' })
  }

  // Map listing → template data shape
  const cardData = {
    title: listing.title || '',
    brand: listing.brand || '',
    model: listing.model || '',
    year: listing.year || null,
    category: listing.category || '',
    price: Number(listing.price) || 0,
    currency: String(listing.price_currency || 'ARS').toUpperCase(),
    sellerName: listing.seller_name || '',
    imageUrl,
  }

  // Render PNG
  let pngBuffer
  try {
    pngBuffer = await renderListingCard(cardData)
  } catch (err) {
    const detail = err?.message || String(err)
    console.error('[instagram-card] render failed:', detail)
    if (err?.code === 'RENDER_TIMEOUT') {
      return res.status(503).json({ ok: false, error: 'render_timeout', message: 'Timeout al generar el post. Intentá de nuevo.', detail })
    }
    return res.status(503).json({ ok: false, error: 'render_failed', message: 'No pudimos generar el post. Intentá de nuevo.', detail })
  }

  // Upload to Supabase storage
  const storagePath = `instagram-cards/${listing.id}/${Date.now()}.png`
  const { error: uploadErr } = await supabase.storage
    .from(INSTAGRAM_CARDS_BUCKET)
    .upload(storagePath, pngBuffer, {
      contentType: 'image/png',
      upsert: false,
      cacheControl: '31536000',
    })

  if (uploadErr) {
    console.error('[instagram-card] storage upload failed', uploadErr.message)
    return res.status(500).json({ ok: false, error: 'upload_failed', message: 'No pudimos guardar el post. Intentá de nuevo.' })
  }

  // Build public URL
  const publicUrl = `${SUPABASE_URL}/storage/v1/object/public/${INSTAGRAM_CARDS_BUCKET}/${storagePath}`

  console.log(`[instagram-card] generated for listing ${listing.id} → ${storagePath}`)

  return res.status(200).json({
    ok: true,
    url: publicUrl,
    width: 1080,
    height: 1350,
    generatedAt: new Date().toISOString(),
  })
})

module.exports = router
