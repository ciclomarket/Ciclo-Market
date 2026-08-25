const crypto = require('crypto')
const { MercadoPagoConfig, Preference } = require('mercadopago')
const { getServerSupabaseClient } = require('../lib/supabaseClient')
const { getDecryptedSellerToken } = require('./sellerMpOauthService')

const DEFAULT_COMMISSION_PCT = Number(process.env.PROTECTED_PAYMENT_COMMISSION_PCT || 3)

function round2(n) {
  return Math.round(n * 100) / 100
}

async function createProtectedOrderCheckout({ buyerId, listingId, publicBase, frontendBase }) {
  const supabase = getServerSupabaseClient()

  const { data: listing, error: listingErr } = await supabase
    .from('listings')
    .select('id, title, price, price_currency, seller_id, protected_payment_eligible, slug')
    .eq('id', listingId)
    .maybeSingle()
  if (listingErr) throw listingErr
  if (!listing) return { ok: false, error: 'listing_not_found' }
  if (!listing.protected_payment_eligible) return { ok: false, error: 'not_eligible' }
  if (String(listing.seller_id) === String(buyerId)) return { ok: false, error: 'cannot_buy_own_listing' }

  const { data: buyerRow, error: buyerErr } = await supabase
    .from('users')
    .select('verified')
    .eq('id', buyerId)
    .maybeSingle()
  if (buyerErr) throw buyerErr
  if (!buyerRow?.verified) return { ok: false, error: 'buyer_not_verified' }

  const { data: sellerRow, error: sellerErr } = await supabase
    .from('users')
    .select('verified')
    .eq('id', listing.seller_id)
    .maybeSingle()
  if (sellerErr) throw sellerErr
  if (!sellerRow?.verified) return { ok: false, error: 'seller_not_verified' }

  const sellerToken = await getDecryptedSellerToken(listing.seller_id)
  if (!sellerToken) return { ok: false, error: 'seller_not_connected' }

  const amount = Number(listing.price)
  if (!Number.isFinite(amount) || amount <= 0) return { ok: false, error: 'invalid_amount' }
  const currency = listing.price_currency === 'USD' ? 'USD' : 'ARS'

  const commissionPct = DEFAULT_COMMISSION_PCT
  const commissionAmount = round2(amount * (commissionPct / 100))
  const sellerNetAmount = round2(amount - commissionAmount)
  const checkoutRef = crypto.randomUUID()

  const { data: orderRow, error: insErr } = await supabase
    .from('protected_orders')
    .insert({
      listing_id: listing.id,
      buyer_id: buyerId,
      seller_id: listing.seller_id,
      amount,
      currency,
      commission_pct: commissionPct,
      commission_amount: commissionAmount,
      seller_net_amount: sellerNetAmount,
      status: 'pending',
      checkout_ref: checkoutRef,
      live_mode: sellerToken.liveMode,
    })
    .select('id')
    .maybeSingle()
  if (insErr) throw insErr
  if (!orderRow?.id) return { ok: false, error: 'order_insert_failed' }

  const backBase = (frontendBase || 'https://www.ciclomarket.ar').replace(/\/$/, '')
  const notificationUrl = publicBase ? `${publicBase}/api/mp/webhook` : undefined

  try {
    const sellerMpClient = new MercadoPagoConfig({ accessToken: sellerToken.accessToken })
    const pref = new Preference(sellerMpClient)
    const mp = await pref.create({
      body: {
        external_reference: checkoutRef,
        items: [
          {
            id: `protected_order_${orderRow.id}`,
            title: `Pago Protegido - ${listing.title}`,
            quantity: 1,
            unit_price: amount,
            currency_id: currency,
          },
        ],
        marketplace_fee: commissionAmount,
        metadata: { type: 'protected_order', protectedOrderId: orderRow.id, checkoutRef },
        back_urls: {
          success: `${backBase}/listing/${listing.slug}?protected_payment=success`,
          failure: `${backBase}/listing/${listing.slug}?protected_payment=failure`,
          pending: `${backBase}/listing/${listing.slug}?protected_payment=pending`,
        },
        ...(notificationUrl ? { notification_url: notificationUrl } : {}),
        auto_return: 'approved',
        statement_descriptor: 'CICLO MARKET',
      },
    })

    const initPoint = mp?.init_point || mp?.sandbox_init_point || null
    if (!initPoint) {
      await supabase.from('protected_orders').update({ status: 'cancelled' }).eq('id', orderRow.id)
      return { ok: false, error: 'mp_init_point_missing' }
    }

    await supabase.from('protected_orders').update({ mp_preference_id: mp?.id || null }).eq('id', orderRow.id)
    await supabase.from('protected_order_events').insert({
      order_id: orderRow.id,
      event_type: 'created',
      actor: 'buyer',
      actor_user_id: buyerId,
      payload: { checkoutRef, preferenceId: mp?.id || null },
    })

    return { ok: true, url: initPoint, protectedOrderId: orderRow.id }
  } catch (err) {
    await supabase.from('protected_orders').update({ status: 'cancelled' }).eq('id', orderRow.id)
    console.error('[protected-orders] preference creation failed', err?.message || err)
    return { ok: false, error: 'mp_preference_failed' }
  }
}

async function processProtectedOrderPayment(mpPayment) {
  const supabase = getServerSupabaseClient()
  const checkoutRef = mpPayment?.external_reference ? String(mpPayment.external_reference).trim() : null
  const protectedOrderId = mpPayment?.metadata?.protectedOrderId ? String(mpPayment.metadata.protectedOrderId) : null
  if (!checkoutRef && !protectedOrderId) return { ok: false, error: 'missing_reference' }

  let query = supabase.from('protected_orders').select('id,status')
  query = protectedOrderId ? query.eq('id', protectedOrderId) : query.eq('checkout_ref', checkoutRef)
  const { data: order, error } = await query.maybeSingle()
  if (error) throw error
  if (!order) return { ok: false, error: 'protected_order_not_found' }

  const mpStatus = String(mpPayment?.status || '').toLowerCase()
  if (mpStatus !== 'approved') return { ok: true, status: mpStatus }
  if (order.status !== 'pending') return { ok: true, status: 'already_processed' }

  const { data: updated, error: updErr } = await supabase
    .from('protected_orders')
    .update({ status: 'paid_held', mp_payment_id: String(mpPayment.id), updated_at: new Date().toISOString() })
    .eq('id', order.id)
    .eq('status', 'pending')
    .select('id')
    .maybeSingle()
  if (updErr) throw updErr
  if (!updated?.id) return { ok: true, status: 'already_processed' }

  await supabase.from('protected_order_events').insert({
    order_id: order.id,
    event_type: 'paid',
    actor: 'system',
    payload: { mp_payment_id: String(mpPayment.id) },
  })

  return { ok: true, status: 'paid_held' }
}

module.exports = { createProtectedOrderCheckout, processProtectedOrderPayment }
