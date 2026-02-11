const { MercadoPagoConfig, Payment } = require('mercadopago')
const { getServerSupabaseClient } = require('../lib/supabaseClient')
const { sendMail } = require('../lib/mail')

const mpClient = (() => {
  const token = String(process.env.MERCADOPAGO_ACCESS_TOKEN || '').trim()
  if (!token) return null
  try {
    return new MercadoPagoConfig({ accessToken: token })
  } catch {
    return null
  }
})()

const inFlightPayments = new Set()

const PHONE_REGEX = /\d+/g
function normalizeWhatsappForStorage(raw) {
  if (!raw) return null
  const digits = String(raw).match(PHONE_REGEX)
  if (!digits) return null
  let normalized = digits.join('')
  normalized = normalized.replace(/^00+/, '')
  normalized = normalized.replace(/^0+/, '')
  if (!normalized) return null
  if (!normalized.startsWith('54')) normalized = `54${normalized}`
  return normalized
}

function ensureWhatsappInContactMethods(methods) {
  const base = Array.isArray(methods) ? methods.filter(Boolean).map((m) => String(m)) : ['email', 'chat']
  const set = new Set(base)
  if (!set.has('email')) set.add('email')
  if (!set.has('chat')) set.add('chat')
  set.add('whatsapp')
  return Array.from(set)
}

function normalizePlanCode(value) {
  const v = String(value || '').trim().toLowerCase()
  if (v === 'basic' || v === 'premium' || v === 'pro') return v
  return null
}

function mapMpStatus(mpStatus) {
  const raw = String(mpStatus || '').toLowerCase()
  if (raw === 'approved') return 'succeeded'
  if (raw === 'rejected' || raw === 'cancelled' || raw === 'charged_back' || raw === 'refunded') return 'failed'
  return 'pending'
}

function extractMetadata(mpPayment) {
  const meta = (mpPayment && typeof mpPayment.metadata === 'object' && mpPayment.metadata) ? mpPayment.metadata : {}

  const paymentId = mpPayment?.id ? String(mpPayment.id) : null
  const externalReference = mpPayment?.external_reference ? String(mpPayment.external_reference).trim() : null
  const userIdRaw = meta.userId ?? meta.user_id ?? null
  const listingIdRaw = meta.listingId ?? meta.listing_id ?? null
  const planRaw = meta.planCode ?? meta.plan_code ?? meta.planId ?? meta.plan_id ?? meta.upgradePlanCode ?? meta.upgrade_plan_code

  const userId = userIdRaw ? String(userIdRaw).trim() : null
  const listingId = listingIdRaw ? String(listingIdRaw).trim() : null
  const planCode = normalizePlanCode(planRaw)

  const amount = typeof mpPayment?.transaction_amount === 'number' ? mpPayment.transaction_amount : null
  const currency = mpPayment?.currency_id ? String(mpPayment.currency_id) : 'ARS'
  const status = mapMpStatus(mpPayment?.status)

  return { paymentId, externalReference, userId, listingId, planCode, amount, currency, status }
}

async function upsertPaymentRecord(supabase, payload) {
  const provider = 'mercadopago'
  const providerRef = String(payload.provider_ref || payload.providerRef || '').trim()
  if (!providerRef) throw new Error('missing_provider_ref')
  const externalReference = String(payload.external_reference || payload.externalReference || '').trim() || null

  const { data: existing, error: selErr } = await supabase
    .from('payments')
    .select('id,applied,status')
    .eq('provider', provider)
    .eq('provider_ref', providerRef)
    .maybeSingle()
  if (selErr) throw selErr

  const row = {
    user_id: payload.user_id || null,
    listing_id: payload.listing_id || null,
    amount: typeof payload.amount === 'number' ? payload.amount : null,
    currency: payload.currency || 'ARS',
    status: payload.status || 'pending',
    provider,
    provider_ref: providerRef,
  }

  if (existing?.id) {
    const { error: updErr } = await supabase.from('payments').update(row).eq('id', existing.id)
    if (updErr) throw updErr
    return { id: existing.id, applied: Boolean(existing.applied), status: existing.status }
  }

  // If we created a "pending" record during checkout using `external_reference`,
  // reconcile it to the actual Mercado Pago payment id to avoid duplicates.
  if (externalReference && externalReference !== providerRef) {
    const { data: byExternal, error: extErr } = await supabase
      .from('payments')
      .select('id,applied')
      .eq('provider', provider)
      .eq('provider_ref', externalReference)
      .maybeSingle()
    if (extErr) throw extErr
    if (byExternal?.id) {
      const { error: updErr } = await supabase.from('payments').update(row).eq('id', byExternal.id)
      if (updErr) throw updErr
      return { id: byExternal.id, applied: Boolean(byExternal.applied), status: row.status }
    }
  }

  const { data: inserted, error: insErr } = await supabase
    .from('payments')
    .insert({ ...row, applied: false })
    .select('id,applied,status')
    .maybeSingle()
  if (insErr) throw insErr
  return { id: inserted?.id || null, applied: Boolean(inserted?.applied), status: inserted?.status || null }
}

async function markPaymentAppliedOnce(supabase, paymentId) {
  const providerRef = String(paymentId || '').trim()
  if (!providerRef) return false
  const nowIso = new Date().toISOString()
  const { data, error } = await supabase
    .from('payments')
    .update({ applied: true, applied_at: nowIso, status: 'succeeded' })
    .eq('provider', 'mercadopago')
    .eq('provider_ref', providerRef)
    .eq('applied', false)
    .select('id')
    .maybeSingle()
  if (error) throw error
  return Boolean(data?.id)
}

async function sendPaymentSuccessEmail({ supabase, userId, planCode, listingId, amount, currency }) {
  if (!userId) return
  const { data: userRow, error } = await supabase
    .from('users')
    .select('id,email,full_name')
    .eq('id', userId)
    .maybeSingle()
  if (error) throw error
  const to = userRow?.email ? String(userRow.email) : null
  if (!to) return

  const from = process.env.SMTP_FROM || `Ciclo Market <${process.env.SMTP_USER || 'no-reply@ciclomarket.ar'}>`
  const planLabel = planCode ? planCode.toUpperCase() : 'PLAN'
  const amountTxt = (typeof amount === 'number' && Number.isFinite(amount)) ? `${amount} ${currency || 'ARS'}` : null

  const subject = `Pago confirmado (${planLabel})`
  const text = [
    '¡Gracias por tu compra!',
    '',
    `Plan: ${planLabel}`,
    ...(amountTxt ? [`Monto: ${amountTxt}`] : []),
    ...(listingId ? [`Publicación: ${listingId}`] : []),
    '',
    'Tu plan ya fue aplicado.',
  ].join('\n')

  await sendMail({ from, to, subject, text })
}

async function processPayment(paymentIdRaw) {
  const paymentId = String(paymentIdRaw || '').trim()
  if (!paymentId) return { ok: false, error: 'missing_payment_id' }
  if (!mpClient) return { ok: false, error: 'payments_unavailable' }

  if (inFlightPayments.has(paymentId)) return { ok: true, status: 'in_flight' }
  inFlightPayments.add(paymentId)

  const supabase = getServerSupabaseClient()

  try {
    const { data: existing, error: existingErr } = await supabase
      .from('payments')
      .select('id,applied,status')
      .eq('provider', 'mercadopago')
      .eq('provider_ref', paymentId)
      .maybeSingle()
    if (existingErr) console.warn('[payments] idempotency lookup failed', existingErr?.message || existingErr)
    const alreadyApplied = Boolean(existing?.id && existing.applied)

    const paymentClient = new Payment(mpClient)
    const mpPayment = await paymentClient.get({ id: paymentId })
    const extracted = extractMetadata(mpPayment)
    const approvedBaseTs = (() => {
      const approved = mpPayment?.date_approved ? Date.parse(String(mpPayment.date_approved)) : NaN
      if (Number.isFinite(approved)) return approved
      const created = mpPayment?.date_created ? Date.parse(String(mpPayment.date_created)) : NaN
      if (Number.isFinite(created)) return created
      return Date.now()
    })()

    await upsertPaymentRecord(supabase, {
      user_id: extracted.userId,
      listing_id: extracted.listingId,
      amount: extracted.amount,
      currency: extracted.currency,
      status: extracted.status,
      provider_ref: paymentId,
      external_reference: extracted.externalReference,
    })

    if (extracted.status !== 'succeeded') return { ok: true, status: extracted.status }

    const listingId = extracted.listingId
    const planCode = extracted.planCode
    const userId = extracted.userId
    if (!listingId || !planCode) {
      console.warn('[payments] missing metadata to apply plan', { paymentId, listingId, planCode, userId })
      return { ok: false, error: 'missing_metadata' }
    }

    const targetCap = planCode === 'pro' ? 12 : planCode === 'premium' ? 8 : 6
    const listingDays = 60
    const expiresAt = new Date(approvedBaseTs + listingDays * 24 * 60 * 60 * 1000).toISOString()
    const rankBoostUntil = (planCode === 'premium' || planCode === 'pro')
      ? new Date(approvedBaseTs + 90 * 24 * 60 * 60 * 1000).toISOString()
      : null

    const { data: listingRow, error: listingErr } = await supabase
      .from('listings')
      .select('id,seller_id,images,granted_visible_photos,plan_photo_limit,whatsapp_user_disabled,whatsapp_enabled,contact_methods,seller_whatsapp')
      .eq('id', listingId)
      .maybeSingle()
    if (listingErr || !listingRow) throw (listingErr || new Error('listing_not_found'))

    const currentGranted = Number(listingRow.granted_visible_photos || 4)
    const nextGrantedPhotos = Math.max(currentGranted, targetCap)
    const currentPlanPhotoLimit = Number(listingRow.plan_photo_limit || 4)
    const nextPlanPhotoLimit = Math.max(currentPlanPhotoLimit, targetCap)
    const imagesArr = Array.isArray(listingRow.images) ? listingRow.images : []
    const nextVisibleCount = Math.min(imagesArr.length, nextPlanPhotoLimit)

    let sellerWhatsapp = normalizeWhatsappForStorage(listingRow.seller_whatsapp || '')
    if (!sellerWhatsapp && listingRow.seller_id) {
      try {
        const { data: profile, error: prErr } = await supabase
          .from('users')
          .select('whatsapp_number,store_phone')
          .eq('id', listingRow.seller_id)
          .maybeSingle()
        if (prErr) throw prErr
        const fallback = profile?.whatsapp_number || profile?.store_phone || ''
        sellerWhatsapp = normalizeWhatsappForStorage(fallback)
      } catch (err) {
        console.warn('[payments] whatsapp lookup failed (non-fatal)', err?.message || err)
      }
    }

    const nextWhatsappEnabled = listingRow.whatsapp_user_disabled ? Boolean(listingRow.whatsapp_enabled) : true
    const nextContactMethods = ensureWhatsappInContactMethods(listingRow.contact_methods)

    console.info('[payments] applying plan to listing', {
      paymentId,
      listingId,
      planCode,
      targetCap,
      nextGrantedPhotos,
      nextPlanPhotoLimit,
      nextWhatsappEnabled,
      hasSellerWhatsapp: Boolean(sellerWhatsapp),
      alreadyApplied,
    })

    const listingUpdate = {
      plan: planCode,
      plan_code: planCode,
      status: 'active',
      expires_at: expiresAt,
      plan_photo_limit: nextPlanPhotoLimit,
      granted_visible_photos: nextGrantedPhotos,
      visible_images_count: nextVisibleCount,
      whatsapp_cap_granted: true,
      whatsapp_enabled: nextWhatsappEnabled,
      contact_methods: nextContactMethods,
      ...(sellerWhatsapp ? { seller_whatsapp: sellerWhatsapp } : {}),
      ...(rankBoostUntil ? { rank_boost_until: rankBoostUntil } : {}),
    }

    const { error: updErr } = await supabase
      .from('listings')
      .update(listingUpdate)
      .eq('id', listingId)

    if (updErr) throw updErr

    if (!alreadyApplied) {
      const justApplied = await markPaymentAppliedOnce(supabase, paymentId)
      if (!justApplied) return { ok: true, status: 'already_applied' }

      try {
        await sendPaymentSuccessEmail({
          supabase,
          userId,
          planCode,
          listingId,
          amount: extracted.amount,
          currency: extracted.currency,
        })
      } catch (err) {
        console.warn('[payments] success email failed (non-fatal)', err?.message || err)
      }
    }

    return { ok: true, status: alreadyApplied ? 'reconciled' : 'applied' }
  } catch (err) {
    console.error('[payments] processPayment failed', { paymentId, error: err?.message || err })
    return { ok: false, error: 'unexpected_error' }
  } finally {
    inFlightPayments.delete(paymentId)
  }
}

async function recordPaymentIntent({ userId, listingId, amount, currency = 'ARS', providerRef, status = 'pending' }) {
  const supabase = getServerSupabaseClient()
  try {
    await upsertPaymentRecord(supabase, {
      user_id: userId || null,
      listing_id: listingId || null,
      amount: typeof amount === 'number' ? amount : null,
      currency,
      status,
      provider_ref: providerRef,
    })
    return { ok: true }
  } catch (err) {
    console.warn('[payments] recordPaymentIntent failed (non-fatal)', err?.message || err)
    return { ok: false }
  }
}

module.exports = { processPayment, recordPaymentIntent }
