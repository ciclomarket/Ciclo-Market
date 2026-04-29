const { createUpgradeToken, createBundleUpgradeToken, resolvePlanPrice } = require('../mercadopagoCheckout')

const CAMPAIGN = 'payment_abandon_20off'
const PRIORITY = 1

const SUBJECT_POOL = [
  'Tu publicación está lista para destacar',
  'Un último paso para activar tu anuncio',
  'Activá WhatsApp y mejorá tu visibilidad',
  'Optimizá tu publicación en 1 minuto',
  'Tu anuncio puede rendir mejor',
]
const ACTIVE_SUBJECTS = SUBJECT_POOL.slice(0, 2)

// Para listings FREE recientes sin pago asociado
const FREE_LISTING_WINDOW_HOURS = 24

function inferSellerId(payment) {
  return String(
    payment?.user_id ||
    payment?.seller_id ||
    payment?.metadata?.userId ||
    payment?.metadata?.sellerId ||
    ''
  ).trim() || null
}

function inferListingId(payment) {
  return String(payment?.listing_id || payment?.metadata?.listingId || '').trim() || null
}

function inferPlanCode(payment) {
  const raw = String(payment?.plan_code || payment?.plan || payment?.metadata?.planCode || payment?.metadata?.plan_code || '').toLowerCase()
  if (raw === 'premium' || raw === 'pro') return raw
  return null
}

function isListingFreeStrict(listing) {
  const plan = String(listing?.plan || '').toLowerCase()
  const planCode = String(listing?.plan_code || '').toLowerCase()
  const sellerPlan = String(listing?.seller_plan || '').toLowerCase()
  if (plan && plan !== 'free') return false
  if (planCode && planCode !== 'free') return false
  if (sellerPlan && sellerPlan !== 'free') return false
  return plan === 'free' || planCode === 'free' || sellerPlan === 'free'
}

function buildIdempotencyKey(email, uniqueId) {
  return `payment_abandon:${email}:${uniqueId}`
}

function buildIdempotencyKeyForListing(email, listingId) {
  return `payment_abandon_free:${email}:${listingId}`
}

function buildIdempotencyKeyForUser(email) {
  return `payment_abandon_user:${email}:${new Date().toISOString().split('T')[0]}`
}

function selectSubject(paymentId) {
  const base = String(paymentId || '')
  let hash = 0
  for (let i = 0; i < base.length; i += 1) hash = ((hash << 5) - hash) + base.charCodeAt(i)
  const idx = Math.abs(hash) % ACTIVE_SUBJECTS.length
  return ACTIVE_SUBJECTS[idx]
}

function buildFeatureChecklist() {
  return [
    'WhatsApp habilitado para contacto directo',
    'Más visibilidad en resultados del marketplace',
    'Tu anuncio aparece más arriba',
    'Más chances de venta con un flujo constante',
    'Destaque visual y mejor confianza',
  ]
}

async function fetchRecentFreeListingsWithoutPayment(supabase, sinceIso) {
  // Buscar listings FREE creados recientemente que no tengan un pago asociado
  const { data, error } = await supabase
    .from('listings')
    .select('id,slug,seller_id,title,images,price,price_currency,plan,plan_code,seller_plan,status,created_at')
    .in('status', ['active', 'published'])
    .or('plan.eq.free,plan_code.eq.free,seller_plan.eq.free')
    .gte('created_at', sinceIso)
    .order('created_at', { ascending: false })
    .limit(500)

  if (error) {
    console.warn(`[${CAMPAIGN}] listings fetch error`, error.message)
    return []
  }

  const listings = (data || []).filter(isListingFreeStrict)
  if (!listings.length) return []

  // Verificar cuáles no tienen pago asociado (pendiente o completado)
  const listingIds = listings.map(l => l.id)
  const { data: payments } = await supabase
    .from('payments')
    .select('listing_id,status')
    .in('listing_id', listingIds)

  const listingsWithPayments = new Set((payments || []).map(p => p.listing_id))
  
  return listings.filter(l => !listingsWithPayments.has(l.id))
}

function buildPlansForCandidate({ sellerId, listing, preferredPlan = 'premium', serverBase, paymentId = null }) {
  return ['premium', 'pro'].map((planCode) => {
    const original = resolvePlanPrice(planCode)
    const discounted = Math.round(original * 0.8)
    const token = createUpgradeToken({
      userId: sellerId,
      listingId: listing.id,
      planCode,
      campaign: CAMPAIGN,
      discountPct: 20,
      paymentId: paymentId || listing.id, // Usar listing.id como fallback para tracking
      exp: Date.now() + 48 * 60 * 60 * 1000,
    })
    return {
      planCode,
      title: planCode === 'pro' ? 'Plan Pro' : 'Plan Premium',
      originalPrice: original,
      discountPrice: discounted,
      highlighted: planCode === preferredPlan,
      url: `${serverBase}/api/checkout/listing-upgrade?token=${encodeURIComponent(token)}`,
      listingId: listing.id, // Para identificar a qué listing pertenece
    }
  })
}

function buildBundlePlans({ sellerId, listingIds, preferredPlan = 'premium', serverBase }) {
  const count = listingIds.length
  const bundleDiscountPct = 50 // 50% OFF en el total
  
  return ['premium', 'pro'].map((planCode) => {
    const unitPrice = resolvePlanPrice(planCode)
    const originalTotal = unitPrice * count
    const discountedTotal = Math.round(originalTotal * (1 - bundleDiscountPct / 100))
    
    const token = createBundleUpgradeToken({
      userId: sellerId,
      listingIds,
      planCode,
      campaign: CAMPAIGN,
      discountPct: bundleDiscountPct,
      exp: Date.now() + 48 * 60 * 60 * 1000,
    })
    
    return {
      planCode,
      title: planCode === 'pro' ? 'Plan Pro Bundle' : 'Plan Premium Bundle',
      subtitle: `${count} publicaciones · 50% OFF`,
      originalPrice: originalTotal,
      discountPrice: discountedTotal,
      highlighted: planCode === preferredPlan,
      url: `${serverBase}/api/checkout/bundle-upgrade?token=${encodeURIComponent(token)}`,
      bundle: true,
      count,
      unitPrice,
    }
  })
}

async function buildCandidates({ supabase, dateCtx, baseFront, serverBase }) {
  // ===== FUENTE 1: Pagos pendientes (abandono de checkout) =====
  const min = new Date(dateCtx.now.getTime() - (24 * 60 * 60 * 1000)).toISOString()
  const max = new Date(dateCtx.now.getTime() - (10 * 60 * 1000)).toISOString()

  const { data: paymentsData, error: paymentsError } = await supabase
    .from('payments')
    .select('*')
    .eq('status', 'pending')
    .gte('created_at', min)
    .lte('created_at', max)
    .order('created_at', { ascending: false })
    .limit(500)

  if (paymentsError) {
    console.warn(`[${CAMPAIGN}] payments error`, paymentsError.message)
  }

  const payments = paymentsData || []
  const paymentUserIds = [...new Set(payments.map(inferSellerId).filter(Boolean))]
  const paymentListingIds = [...new Set(payments.map(inferListingId).filter(Boolean))]

  // ===== FUENTE 2: Listings FREE recientes sin pago asociado =====
  const freeListingsSince = new Date(dateCtx.now.getTime() - (FREE_LISTING_WINDOW_HOURS * 60 * 60 * 1000)).toISOString()
  const freeListings = await fetchRecentFreeListingsWithoutPayment(supabase, freeListingsSince)
  
  // Combinar IDs únicos para batch fetch
  const allUserIds = [...new Set([...paymentUserIds, ...freeListings.map(l => l.seller_id)])].filter(Boolean)
  const allListingIds = [...new Set([...paymentListingIds, ...freeListings.map(l => l.id)])].filter(Boolean)

  const [{ data: users }, { data: listings }] = await Promise.all([
    allUserIds.length
      ? supabase.from('users').select('id,email,full_name').in('id', allUserIds)
      : Promise.resolve({ data: [] }),
    allListingIds.length
      ? supabase.from('listings').select('id,slug,seller_id,title,images,price,price_currency,plan,plan_code,seller_plan,status').in('id', allListingIds)
      : Promise.resolve({ data: [] }),
  ])

  const usersMap = new Map((users || []).map((u) => [String(u.id), u]))
  const listingMap = new Map((listings || []).map((l) => [String(l.id), l]))

  // ===== AGRUPAR POR USUARIO =====
  const listingsByUser = new Map() // userId -> { listings: [], hasPayment: boolean, paymentId: string|null, preferredPlan: string }
  const processedListingIds = new Set()

  // Procesar pagos pendientes primero (tienen prioridad)
  for (const payment of payments) {
    const sellerId = inferSellerId(payment)
    const listingId = inferListingId(payment)
    if (!sellerId || !listingId) continue

    const listing = listingMap.get(String(listingId))
    if (!listing) continue
    if (!['active', 'published'].includes(String(listing.status || '').toLowerCase())) continue
    if (!isListingFreeStrict(listing)) continue

    if (!listingsByUser.has(sellerId)) {
      listingsByUser.set(sellerId, { 
        listings: [], 
        hasPayment: true, 
        paymentId: payment.id,
        preferredPlan: inferPlanCode(payment) || 'premium'
      })
    }
    
    const userData = listingsByUser.get(sellerId)
    if (!processedListingIds.has(listingId)) {
      userData.listings.push(listing)
      processedListingIds.add(listingId)
    }
  }

  // Procesar listings FREE sin pago
  for (const listing of freeListings) {
    const sellerId = listing.seller_id
    if (!sellerId) continue

    // Verificar que el listing sigue activo y free
    const freshListing = listingMap.get(String(listing.id))
    if (!freshListing) continue
    if (!['active', 'published'].includes(String(freshListing.status || '').toLowerCase())) continue
    if (!isListingFreeStrict(freshListing)) continue

    // Si ya fue procesado por un pago, saltear
    if (processedListingIds.has(listing.id)) continue

    if (!listingsByUser.has(sellerId)) {
      listingsByUser.set(sellerId, { 
        listings: [], 
        hasPayment: false, 
        paymentId: null,
        preferredPlan: 'premium'
      })
    }
    
    const userData = listingsByUser.get(sellerId)
    userData.listings.push(freshListing)
    processedListingIds.add(listing.id)
  }

  // ===== CONSTRUIR CANDIDATOS AGRUPADOS =====
  const candidates = []
  
  for (const [sellerId, userData] of listingsByUser.entries()) {
    if (userData.listings.length === 0) continue

    const user = usersMap.get(String(sellerId))
    const email = String(user?.email || '').trim().toLowerCase()
    if (!email) continue

    const idempotencyKey = buildIdempotencyKeyForUser(email)

    // Construir cards para todas las publicaciones
    const cards = userData.listings.map(listing => ({
      id: listing.id,
      slug: listing.slug,
      title: listing.title,
      image: listing.images?.[0],
      price: listing.price,
      price_currency: listing.price_currency,
      link: `${baseFront}/listing/${encodeURIComponent(listing.slug || listing.id)}`,
      planBadge: 'Free',
    }))

    // Construir planes
    let planOffers
    let isBundle = false
    
    if (userData.listings.length >= 2) {
      // Bundle: 50% OFF en el total
      const listingIds = userData.listings.map(l => l.id)
      planOffers = buildBundlePlans({ 
        sellerId, 
        listingIds, 
        preferredPlan: userData.preferredPlan, 
        serverBase 
      })
      isBundle = true
    } else {
      // Individual: 20% OFF
      planOffers = []
      for (const listing of userData.listings) {
        const plans = buildPlansForCandidate({ 
          sellerId, 
          listing, 
          preferredPlan: userData.preferredPlan, 
          serverBase, 
          paymentId: userData.paymentId 
        })
        planOffers.push({ listingId: listing.id, listingTitle: listing.title, plans })
      }
    }

    const subject = userData.hasPayment 
      ? selectSubject(userData.paymentId)
      : (isBundle ? `¡Bundle especial! 50% OFF en tus ${cards.length} publicaciones` : 'Tus publicaciones están listas para destacar')
    
    const features = buildFeatureChecklist()

    candidates.push({
      campaign: CAMPAIGN,
      priority: PRIORITY,
      userId: sellerId,
      paymentId: userData.paymentId,
      listingId: userData.listings[0].id, // Primary listing para tracking
      email,
      idempotencyKey,
      payload: {
        subject,
        title: cards.length === 1 
          ? 'Un último paso para activar tu anuncio' 
          : (isBundle ? `¡Bundle especial! 50% OFF` : `Tenés ${cards.length} publicaciones listas para destacar`),
        subtitle: cards.length === 1
          ? 'Podés activarlo ahora con mejores beneficios para vender más rápido.'
          : (isBundle 
              ? `Paga $${Math.round(planOffers[0].discountPrice).toLocaleString('es-AR')} en lugar de $${Math.round(planOffers[0].originalPrice).toLocaleString('es-AR')} y destacá tus ${cards.length} publicaciones.` 
              : `Activá WhatsApp en tus ${cards.length} publicaciones para vender más rápido.`),
        intro: isBundle 
          ? 'Aprovechá este descuento especial por publicar múltiples bicis. El pago aplica el upgrade a TODAS tus publicaciones.' 
          : 'Esta mejora te da más visibilidad y contacto directo con compradores reales.',
        cards,
        features,
        planOffers, // Array de planes (o bundle)
        isBundle,
        ctas: [],
      },
    })
  }

  return candidates
}

module.exports = {
  CAMPAIGN,
  PRIORITY,
  SUBJECT_POOL,
  ACTIVE_SUBJECTS,
  buildCandidates,
}
