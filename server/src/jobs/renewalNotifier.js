const cron = require('node-cron')
const { createClient } = require('@supabase/supabase-js')
const { getServerSupabaseClient } = require('../lib/supabaseClient')
const { sendMail, isMailConfigured, isSMTPConfigured, isResendConfigured } = require('../lib/mail')

const UUID_REGEX = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i
const DEFAULT_WINDOW_HOURS = 24
const DEFAULT_COOLDOWN_HOURS = 24
const DEFAULT_CRON_SCHEDULE = '0 * * * *' // cada hora

const supabaseServiceClient = (() => {
  const url = process.env.SUPABASE_URL || process.env.VITE_SUPABASE_URL
  const serviceKey = process.env.SUPABASE_SERVICE_ROLE_KEY
  if (!url || !serviceKey) {
    console.warn('[renewalNotifier] SUPABASE_SERVICE_ROLE_KEY no configurada; no se registrarán pagos')
    return null
  }
  return createClient(url, serviceKey)
})()

function coerceUuid(value) {
  if (!value) return null
  const str = typeof value === 'string' ? value.trim() : String(value)
  return UUID_REGEX.test(str) ? str : null
}

async function recordPayment({ userId, listingId, amount, currency = 'ARS', status = 'succeeded', provider = 'mercadopago', providerRef = null }) {
  if (!supabaseServiceClient) return
  try {
    const payload = {
      user_id: coerceUuid(userId),
      listing_id: coerceUuid(listingId),
      amount: typeof amount === 'number' ? amount : null,
      currency,
      status,
      provider,
      provider_ref: providerRef,
    }
    const { error } = await supabaseServiceClient.from('payments').insert(payload)
    if (error) {
      console.error('[renewalNotifier] recordPayment insert failed', error, { payload })
    }
  } catch (err) {
    console.error('[renewalNotifier] recordPayment unexpected error', err)
  }
}

async function fetchExpiringListings({ supabase, windowHours, cooldownHours }) {
  const now = new Date()
  const upperBound = new Date(now.getTime() + windowHours * 60 * 60 * 1000)
  const cooldownThreshold = new Date(now.getTime() - cooldownHours * 60 * 60 * 1000)

  const { data, error } = await supabase
    .from('listings')
    .select('id,title,seller_id,expires_at,renewal_notified_at,status')
    .eq('status', 'active')
    .not('expires_at', 'is', null)
    .gte('expires_at', now.toISOString())
    .lte('expires_at', upperBound.toISOString())

  if (error) {
    console.error('[renewalNotifier] error al buscar publicaciones', error)
    return []
  }

  return (data || []).filter((item) => {
    if (!item.expires_at) return false
    if (!item.renewal_notified_at) return true
    const lastNotified = new Date(item.renewal_notified_at)
    return Number.isFinite(lastNotified.getTime()) && lastNotified < cooldownThreshold
  })
}

async function fetchSellerProfiles(supabase, sellerIds) {
  if (!sellerIds.length) return new Map()
  const { data, error } = await supabase
    .from('users')
    .select('id,email,full_name')
    .in('id', sellerIds)
  if (error) {
    console.error('[renewalNotifier] error al buscar perfiles', error)
    return new Map()
  }
  const map = new Map()
  for (const profile of data || []) {
    if (profile?.id) {
      map.set(profile.id, profile)
    }
  }
  return map
}

async function sendReminder({ listing, profile }) {
  if (!profile?.email) {
    console.warn('[renewalNotifier] publicación sin email de contacto', listing.id)
    return false
  }

  const expiresDate = listing.expires_at ? new Date(listing.expires_at) : null
  const expiresLabel = expiresDate && Number.isFinite(expiresDate.getTime())
    ? expiresDate.toLocaleString('es-AR', { dateStyle: 'long', timeStyle: 'short' })
    : 'los próximos días'

  const baseFront = (process.env.FRONTEND_URL || '').split(',')[0]?.trim() || ''
  const highlightUrl = `${baseFront}/listing/${listing.id}/destacar`
  const renewApiHint = `${baseFront}/dashboard?tab=Publicaciones` // Llevar directo a Publicaciones en el panel

  const baseFront = (process.env.FRONTEND_URL || '').split(',')[0]?.trim() || 'https://ciclomarket.ar'
  const bikesUrl = `${baseFront.replace(/\/$/, '')}/marketplace?cat=Ruta`
  const partsUrl = `${baseFront.replace(/\/$/, '')}/marketplace?cat=Accesorios`
  const apparelUrl = `${baseFront.replace(/\/$/, '')}/marketplace?cat=Indumentaria`

  const mailOptions = {
    from: process.env.SMTP_FROM || `Ciclo Market <${process.env.SMTP_USER}>`,
    to: profile.email,
    subject: `Tu publicación "${listing.title}" está por vencer`,
    html: `
      <div style="background:#ffffff;margin:0 auto;max-width:640px;font-family:Arial, sans-serif;color:#14212e">
        <table role="presentation" cellspacing="0" cellpadding="0" border="0" align="center" style="width:100%">
          <tr>
            <td style="padding:20px 24px;text-align:center">
              <img src="${baseFront.replace(/\/$/, '')}/site-logo.png" alt="Ciclo Market" style="height:64px;width:auto;display:inline-block" />
            </td>
          </tr>
          <tr>
            <td style="background:#14212e;color:#fff;text-align:center;padding:10px 12px">
              <a href="${bikesUrl}" style="color:#fff;text-decoration:none;margin:0 10px;font-size:14px">Bicicletas</a>
              <a href="${partsUrl}" style="color:#fff;text-decoration:none;margin:0 10px;font-size:14px">Accesorios</a>
              <a href="${apparelUrl}" style="color:#fff;text-decoration:none;margin:0 10px;font-size:14px">Indumentaria</a>
            </td>
          </tr>
          <tr>
            <td style="padding:24px">
              <h2 style="margin:0 0 8px;font-size:20px;color:#0c1723">Tu publicación está por vencer</h2>
              <p style="margin:0 0 8px">Hola ${profile.full_name || 'vendedor'},</p>
              <p style="margin:0 0 12px">Tu aviso <strong>${listing.title}</strong> vence el <strong>${expiresLabel}</strong>.</p>
              <p style="margin:0 0 12px">Podés mantenerla activa y ganar visibilidad con estas opciones:</p>
              <p style="margin:0 0 16px;text-align:center">
                <a href="${renewApiHint}" style="display:inline-block;padding:12px 18px;background:#14212e;color:#fff;text-decoration:none;border-radius:10px;margin-right:8px;font-weight:600">Renovar publicación</a>
                <a href="${highlightUrl}" style="display:inline-block;padding:12px 18px;background:#2563eb;color:#fff;text-decoration:none;border-radius:10px;font-weight:600">Destacar ahora</a>
              </p>

              <div style="margin-top:18px;padding:14px 16px;background:#f6f8fb;border:1px solid #e5ebf3;border-radius:10px">
                <h3 style="margin:0 0 8px;font-size:16px;color:#0c1723">Planes recomendados</h3>
                <ul style="margin:0;padding-left:18px;color:#374151">
                  <li style="margin:6px 0"><b>Básica</b>: 60 días de publicación, 7 días de destaque, botón de WhatsApp habilitado.</li>
                  <li style="margin:6px 0"><b>Premium</b>: 60 días de publicación, 14 días de destaque, WhatsApp + difusión en redes.</li>
                </ul>
              </div>

              <div style="margin-top:18px;padding:14px 16px;background:#fdfcf8;border:1px solid #f0e6c3;border-radius:10px">
                <h3 style="margin:0 0 8px;font-size:16px;color:#0c1723">Preguntas y respuestas</h3>
                <p style="margin:0 0 8px;color:#374151">Recordá responder rápido las consultas para mejorar tu conversión. Las respuestas ayudan a todos los interesados.</p>
                <p style="margin:0;color:#6b7280;font-size:12px">Consejo: habilitá el botón de WhatsApp con un plan destacado para cerrar ventas más rápido.</p>
              </div>

              <p style="margin:16px 0 0;font-size:12px;color:#6b7280">Si los botones no funcionan, ingresá a tu panel: <a href="${renewApiHint}" style="color:#0c72ff;text-decoration:underline">${renewApiHint}</a></p>
            </td>
          </tr>
          <tr>
            <td style="background:#0b1724;color:#fff;padding:12px 24px;text-align:center;font-size:12px">
              © ${new Date().getFullYear()} Ciclo Market · <a href="${baseFront.replace(/\/$/, '')}/privacidad" style="color:#fff">Privacidad</a>
            </td>
          </tr>
        </table>
      </div>
    `
  }

  try {
    await sendMail(mailOptions)
    return true
  } catch (error) {
    console.error('[renewalNotifier] error al enviar email', error)
    return false
  }
}

async function markAsNotified(supabase, listingIds) {
  if (!listingIds.length) return
  const { error } = await supabase
    .from('listings')
    .update({ renewal_notified_at: new Date().toISOString() })
    .in('id', listingIds)
  if (error) {
    console.error('[renewalNotifier] error al actualizar renewal_notified_at', error)
  }
}

function startRenewalNotificationJob() {
  if (process.env.RENEWAL_NOTIFIER_ENABLED !== 'true') {
    console.info('[renewalNotifier] deshabilitado (RENEWAL_NOTIFIER_ENABLED !== "true")')
    return
  }

  let supabase
  try {
    supabase = getServerSupabaseClient()
  } catch (error) {
    console.warn('[renewalNotifier] no se pudo inicializar Supabase:', error.message)
    return
  }

  if (!isMailConfigured()) {
    const smtpOk = isSMTPConfigured()
    const resendOk = isResendConfigured()
    console.warn('[renewalNotifier] mail no configurado (SMTP o Resend), el job no se iniciará', { smtpOk, resendOk, smtpEnabled: process.env.SMTP_ENABLED === 'true' })
    return
  }

  const windowHours = Number(process.env.RENEWAL_REMINDER_WINDOW_HOURS || DEFAULT_WINDOW_HOURS)
  const cooldownHours = Number(process.env.RENEWAL_REMINDER_COOLDOWN_HOURS || DEFAULT_COOLDOWN_HOURS)
  const cronSchedule = process.env.RENEWAL_REMINDER_CRON || DEFAULT_CRON_SCHEDULE

  const task = cron.schedule(
    cronSchedule,
    async () => {
      try {
        const listings = await fetchExpiringListings({ supabase, windowHours, cooldownHours })
        if (!listings.length) return

        const sellerIds = [...new Set(listings.map((item) => item.seller_id).filter(Boolean))]
        const profilesMap = await fetchSellerProfiles(supabase, sellerIds)

        const notifiedIds = []
        for (const listing of listings) {
          const profile = profilesMap.get(listing.seller_id)
          const sent = await sendReminder({ listing, profile })
          if (sent) notifiedIds.push(listing.id)
        }

        await markAsNotified(supabase, notifiedIds)
      } catch (error) {
        console.error('[renewalNotifier] job failed', error)
      }
    },
    {
      timezone: process.env.RENEWAL_REMINDER_TZ || 'America/Argentina/Buenos_Aires'
    }
  )

  task.start()
  console.info('[renewalNotifier] job iniciado con cron', cronSchedule)
}

module.exports = {
  startRenewalNotificationJob
}
