'use strict'

const https   = require('https')
const http    = require('http')
const express = require('express')
const { getServerSupabaseClient } = require('../lib/supabaseClient')
const { renderListingCard } = require('../lib/instagramCard/render')

const router = express.Router()

const INSTAGRAM_CARDS_BUCKET = process.env.INSTAGRAM_CARDS_BUCKET || 'instagram-cards'
const SUPABASE_URL = process.env.SUPABASE_SERVICE_URL || process.env.SUPABASE_URL || ''

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
    return (error || !data?.user) ? null : data.user
  } catch { return null }
}

async function isModerator(supabase, userId) {
  if (!userId) return false
  try {
    const { data } = await supabase.from('user_roles').select('role').eq('user_id', userId).maybeSingle()
    const role = String(data?.role || '').toLowerCase()
    return role === 'moderator' || role === 'admin'
  } catch { return false }
}

// ── Fetch remote image → base64 data URI (used for seller avatar) ─────────────

async function fetchAsDataUri(url) {
  if (!url) return null
  return new Promise((resolve) => {
    const client = url.startsWith('https') ? https : http
    const req = client.get(url, { timeout: 6000 }, (res) => {
      if (res.statusCode !== 200) { resolve(null); return }
      const chunks = []
      res.on('data', (c) => chunks.push(c))
      res.on('end', () => {
        const mime = res.headers['content-type'] || 'image/jpeg'
        resolve(`data:${mime};base64,${Buffer.concat(chunks).toString('base64')}`)
      })
      res.on('error', () => resolve(null))
    })
    req.on('error', () => resolve(null))
    req.on('timeout', () => { req.destroy(); resolve(null) })
  })
}

// ── Trust level (mirrors frontend utils/user.ts) ──────────────────────────────

function computeTrustLevel(user, reviews) {
  if (!user) return 'basic'
  if (user.verified === true) return 'verified'
  const count = reviews?.count ?? 0
  const avg   = reviews?.avg   ?? 0
  if (count >= 1 && avg >= 4) return 'pro'
  const hasSocial = [user.instagram_handle, user.whatsapp_number, user.website_url]
    .some((v) => typeof v === 'string' && v.trim().length > 0)
  return hasSocial ? 'semi_pro' : 'basic'
}

// ── Business-logic helpers ────────────────────────────────────────────────────

function formatPublishedLabel(updatedAt) {
  if (!updatedAt) return null
  const now  = Date.now()
  const then = new Date(updatedAt).getTime()
  if (isNaN(then)) return null
  const days = (now - then) / 86_400_000
  if (days < 1)   return 'Publicada hoy'
  if (days < 2)   return 'Publicada ayer'
  if (days < 7)   return `Publicada hace ${Math.floor(days)} días`
  return null
}

function shouldShowFeaturedBadge(listing) {
  const now = Date.now()
  if (listing.featured_until && new Date(listing.featured_until).getTime() > now) return true
  if (listing.highlight_expires && new Date(listing.highlight_expires).getTime() > now) return true
  return false
}

// Opportunity: only if listing explicitly flagged or social_boost active
function shouldShowOpportunityBadge(listing) {
  return listing.social_boost === true
}

// ── Caption generator ─────────────────────────────────────────────────────────

const CATEGORY_HASHTAGS = {
  'Ruta':        ['#ciclismoderuta', '#roadbike'],
  'MTB':         ['#mtb', '#mountainbike'],
  'Gravel':      ['#gravel', '#gravelbike'],
  'Urbana':      ['#bicicletaurbana', '#urbancycling'],
  'Fixie':       ['#fixie', '#fixedgear'],
  'E-Bike':      ['#ebike', '#electricbike'],
  'Niños':       ['#bicicletaninos'],
  'Pista':       ['#pista', '#trackcycling'],
  'Triatlón':    ['#triatlon', '#triathlete'],
  'Indumentaria':['#indumentariaciclismo'],
  'Accesorios':  ['#accesoriosciclismo'],
}

function buildCaption(listing) {
  const currency      = String(listing.price_currency || 'ARS').toUpperCase()
  const formattedPrice = Number(listing.price).toLocaleString('es-AR', { maximumFractionDigits: 0 })
  const priceStr      = currency === 'USD' ? `U$D ${formattedPrice}` : `$${formattedPrice} ARS`

  const specs = []
  if (listing.brand)             specs.push(`Marca: ${listing.brand}`)
  if (listing.model)             specs.push(`Modelo: ${listing.model}`)
  if (listing.year)              specs.push(`Año: ${listing.year}`)
  if (listing.category)         specs.push(`Categoría: ${listing.category}`)
  if (listing.material)         specs.push(`Material: ${listing.material}`)
  if (listing.frame_size)       specs.push(`Talle: ${listing.frame_size}`)
  if (listing.wheel_size)       specs.push(`Rodado: ${listing.wheel_size}`)
  if (listing.drivetrain)       specs.push(`Transmisión: ${listing.drivetrain}`)
  if (listing.drivetrain_detail) specs.push(`Grupo: ${listing.drivetrain_detail}`)
  if (listing.location)         specs.push(`Ubicación: ${listing.location}`)

  const categoryTags = CATEGORY_HASHTAGS[listing.category] || []
  const brandTag = listing.brand
    ? `#${listing.brand.toLowerCase().replace(/[^a-z0-9]/g, '')}`
    : ''
  const hashtags = ['#ciclismo', '#bicicletasenventa', '#ciclomarket', brandTag, ...categoryTags, '#argentina']
    .filter(Boolean).join(' ')

  return [
    `🚲 ${listing.title} | En venta`,
    '',
    `💰 Precio: ${priceStr}`,
    '',
    specs.length ? `📋 Especificaciones:\n${specs.map(s => `• ${s}`).join('\n')}` : '',
    '',
    listing.seller_name ? `🤝 Vendido por ${listing.seller_name}` : '',
    '',
    '👉 Ver publicación completa en ciclomarket.ar',
    '📩 Consultá por DM o encontranos en la bio',
    '',
    hashtags,
  ].filter(l => l !== null).join('\n').replace(/\n{3,}/g, '\n\n').trim()
}

// ── POST /api/listings/:id/instagram-card ─────────────────────────────────────

router.post('/listings/:id/instagram-card', async (req, res) => {
  const { id } = req.params

  const supabase = getSupabaseOrFail(res)
  if (!supabase) return

  const authUser = await getAuthUser(req, supabase)
  if (!authUser) return res.status(401).json({ ok: false, error: 'not_authenticated' })

  // Fetch listing
  const { data: listing, error: listingErr } = await supabase
    .from('listings')
    .select(`
      id, title, brand, model, year, category, subcategory,
      price, price_currency,
      seller_id, seller_name, seller_location, seller_avatar,
      images, location, created_at, updated_at,
      material, frame_size, wheel_size, drivetrain, drivetrain_detail, wheelset, extras,
      featured_until, highlight_expires, social_boost, plan_code, seller_plan
    `)
    .eq('id', id)
    .maybeSingle()

  if (listingErr) {
    console.error('[instagram-card] listing fetch error', listingErr.message)
    return res.status(500).json({ ok: false, error: 'listing_fetch_failed' })
  }
  if (!listing) return res.status(404).json({ ok: false, error: 'listing_not_found' })

  const isOwner = authUser.id === listing.seller_id
  const isMod   = isOwner ? false : await isModerator(supabase, authUser.id)
  if (!isOwner && !isMod) return res.status(403).json({ ok: false, error: 'forbidden' })

  const imageUrl = Array.isArray(listing.images) && listing.images.length > 0
    ? listing.images[0] : null
  if (!imageUrl) return res.status(400).json({ ok: false, error: 'no_image', message: 'La publicación no tiene imágenes para generar el post.' })

  // Fetch seller profile + reviews in parallel
  const [sellerResult, reviewsResult] = await Promise.allSettled([
    supabase.from('users')
      .select('id, full_name, avatar_url, verified, instagram_handle, whatsapp_number, website_url')
      .eq('id', listing.seller_id)
      .maybeSingle(),
    supabase.from('reviews')
      .select('rating')
      .eq('seller_id', listing.seller_id)
      .eq('status', 'published'),
  ])

  const sellerProfile = sellerResult.status === 'fulfilled' ? sellerResult.value.data : null
  const reviewRows    = reviewsResult.status === 'fulfilled' ? (reviewsResult.value.data || []) : []

  const reviewCount = reviewRows.length
  const reviewAvg   = reviewCount > 0
    ? reviewRows.reduce((s, r) => s + Number(r.rating), 0) / reviewCount
    : 0

  const trustLevel = computeTrustLevel(sellerProfile, { count: reviewCount, avg: reviewAvg })

  // Fetch seller avatar as base64 (so Puppeteer doesn't need outbound HTTP)
  const avatarSrc = sellerProfile?.avatar_url || listing.seller_avatar || null
  const avatarDataUri = await fetchAsDataUri(avatarSrc)

  const cardData = {
    title:       listing.title || '',
    brand:       listing.brand || '',
    model:       listing.model || '',
    year:        listing.year  || null,
    category:    listing.category || '',
    price:       Number(listing.price) || 0,
    currency:    String(listing.price_currency || 'ARS').toUpperCase(),
    sellerName:  sellerProfile?.full_name || listing.seller_name || '',
    imageUrl,
    // date badge
    publishedLabel: formatPublishedLabel(listing.updated_at),
    // badges
    isFeatured:   shouldShowFeaturedBadge(listing),
    isOpportunity: shouldShowOpportunityBadge(listing),
    // seller enriched
    sellerVerified:   sellerProfile?.verified === true,
    sellerAvatarUri:  avatarDataUri,
    sellerReviewCount: reviewCount,
    sellerReviewAvg:   reviewAvg,
    trustLevel,
  }

  // Render PNG
  let pngBuffer
  try {
    pngBuffer = await renderListingCard(cardData)
  } catch (err) {
    const detail = err?.message || String(err)
    console.error('[instagram-card] render failed:', detail)
    if (err?.code === 'RENDER_TIMEOUT')
      return res.status(503).json({ ok: false, error: 'render_timeout', message: 'Timeout al generar el post. Intentá de nuevo.', detail })
    return res.status(503).json({ ok: false, error: 'render_failed', message: 'No pudimos generar el post. Intentá de nuevo.', detail })
  }

  // Upload
  const storagePath = `instagram-cards/${listing.id}/${Date.now()}.png`
  const { error: uploadErr } = await supabase.storage
    .from(INSTAGRAM_CARDS_BUCKET)
    .upload(storagePath, pngBuffer, { contentType: 'image/png', upsert: false, cacheControl: '31536000' })

  if (uploadErr) {
    console.error('[instagram-card] storage upload failed', uploadErr.message)
    return res.status(500).json({ ok: false, error: 'upload_failed', message: 'No pudimos guardar el post. Intentá de nuevo.' })
  }

  const publicUrl = `${SUPABASE_URL}/storage/v1/object/public/${INSTAGRAM_CARDS_BUCKET}/${storagePath}`
  const caption   = buildCaption(listing)

  console.log(`[instagram-card] generated for listing ${listing.id} → ${storagePath}`)
  return res.status(200).json({ ok: true, url: publicUrl, caption, width: 1080, height: 1350, generatedAt: new Date().toISOString() })
})

module.exports = router
