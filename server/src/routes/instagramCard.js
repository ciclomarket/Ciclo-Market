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

// ── Caption generator ─────────────────────────────────────────────────────────

const CATEGORY_HASHTAGS = {
  'Ruta':        ['#ciclismoderuta', '#roadbike', '#roadcycling'],
  'MTB':         ['#mtb', '#mountainbike', '#trailbike'],
  'Gravel':      ['#gravel', '#gravelbike', '#gravelcycling'],
  'Urbana':      ['#bicicletaurbana', '#urbancycling', '#commuter'],
  'Fixie':       ['#fixie', '#fixedgear', '#trackbike'],
  'E-Bike':      ['#ebike', '#electricbike', '#eciclo'],
  'Niños':       ['#bicicletaninos', '#kidsride'],
  'Pista':       ['#pista', '#trackcycling', '#velodrome'],
  'Triatlón':    ['#triatlon', '#triathlete', '#ironman'],
  'Indumentaria':['#indumentariaciclismo', '#cyclingapparel'],
  'Accesorios':  ['#accesoriosciclismo', '#cyclinggear'],
}

function buildCaption(listing) {
  const currency = String(listing.price_currency || 'ARS').toUpperCase()
  const formattedPrice = Number(listing.price).toLocaleString('es-AR', { maximumFractionDigits: 0 })
  const priceStr = currency === 'USD' ? `U$D ${formattedPrice}` : `$${formattedPrice} ARS`

  // Spec lines — only include fields that exist
  const specs = []
  if (listing.brand)           specs.push(`Marca: ${listing.brand}`)
  if (listing.model)           specs.push(`Modelo: ${listing.model}`)
  if (listing.year)            specs.push(`Año: ${listing.year}`)
  if (listing.category)        specs.push(`Categoría: ${listing.category}`)
  if (listing.material)        specs.push(`Material: ${listing.material}`)
  if (listing.frame_size)      specs.push(`Talle: ${listing.frame_size}`)
  if (listing.wheel_size)      specs.push(`Rodado: ${listing.wheel_size}`)
  if (listing.drivetrain)      specs.push(`Transmisión: ${listing.drivetrain}`)
  if (listing.drivetrain_detail) specs.push(`Grupo: ${listing.drivetrain_detail}`)
  if (listing.wheelset)        specs.push(`Ruedas: ${listing.wheelset}`)
  if (listing.location)        specs.push(`Ubicación: ${listing.location}`)

  // Hashtags
  const categoryTags = CATEGORY_HASHTAGS[listing.category] || []
  const brandTag = listing.brand
    ? `#${listing.brand.toLowerCase().replace(/[^a-z0-9]/g, '')}`
    : ''
  const hashtags = [
    '#ciclismo',
    '#bicicletasenventa',
    '#ciclomarket',
    brandTag,
    ...categoryTags,
    '#argentina',
    '#ciclismoargentina',
  ].filter(Boolean).join(' ')

  const sellerLine = listing.seller_name ? `Vendido por ${listing.seller_name}` : ''

  return [
    `🚲 ${listing.title} | En venta`,
    '',
    `💰 Precio: ${priceStr}`,
    '',
    specs.length ? `📋 Especificaciones:\n${specs.map(s => `• ${s}`).join('\n')}` : '',
    '',
    sellerLine ? `🤝 ${sellerLine}` : '',
    '',
    '👉 Ver publicación completa en ciclomarket.ar',
    '📩 Consultá por DM o encontranos en la bio',
    '',
    hashtags,
  ].filter(l => l !== null).join('\n').replace(/\n{3,}/g, '\n\n').trim()
}

// ── POST /api/listings/:id/instagram-card ─────────────────────────────────

router.post('/listings/:id/instagram-card', async (req, res) => {
  const { id } = req.params

  const supabase = getSupabaseOrFail(res)
  if (!supabase) return

  const authUser = await getAuthUser(req, supabase)
  if (!authUser) {
    return res.status(401).json({ ok: false, error: 'not_authenticated' })
  }

  // Fetch all fields needed for card + caption
  const { data: listing, error: listingErr } = await supabase
    .from('listings')
    .select(`
      id, title, brand, model, year, category, subcategory,
      price, price_currency,
      seller_id, seller_name, seller_location,
      images, location, created_at,
      material, frame_size, wheel_size,
      drivetrain, drivetrain_detail, wheelset,
      extras
    `)
    .eq('id', id)
    .maybeSingle()

  if (listingErr) {
    console.error('[instagram-card] listing fetch error', listingErr.message)
    return res.status(500).json({ ok: false, error: 'listing_fetch_failed' })
  }
  if (!listing) {
    return res.status(404).json({ ok: false, error: 'listing_not_found' })
  }

  const isOwner = authUser.id === listing.seller_id
  const isMod = isOwner ? false : await isModerator(supabase, authUser.id)
  if (!isOwner && !isMod) {
    return res.status(403).json({ ok: false, error: 'forbidden' })
  }

  const imageUrl = Array.isArray(listing.images) && listing.images.length > 0
    ? listing.images[0]
    : null
  if (!imageUrl) {
    return res.status(400).json({ ok: false, error: 'no_image', message: 'La publicación no tiene imágenes para generar el post.' })
  }

  // Badge: "Publicada hoy" / "Nuevo ingreso" / "En venta"
  function getBadge() {
    if (!listing.created_at) return 'En venta'
    const days = (Date.now() - new Date(listing.created_at).getTime()) / 86_400_000
    if (days < 1) return 'Publicada hoy'
    if (days < 7) return 'Nuevo ingreso'
    return 'En venta'
  }

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
    badge: getBadge(),
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

  const publicUrl = `${SUPABASE_URL}/storage/v1/object/public/${INSTAGRAM_CARDS_BUCKET}/${storagePath}`
  const caption = buildCaption(listing)

  console.log(`[instagram-card] generated for listing ${listing.id} → ${storagePath}`)

  return res.status(200).json({
    ok: true,
    url: publicUrl,
    caption,
    width: 1080,
    height: 1350,
    generatedAt: new Date().toISOString(),
  })
})

module.exports = router
