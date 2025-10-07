const cron = require('node-cron')
const nodemailer = require('nodemailer')
const { getServerSupabaseClient } = require('../lib/supabaseClient')

const DEFAULT_WINDOW_HOURS = 48
const DEFAULT_COOLDOWN_HOURS = 24
const DEFAULT_CRON_SCHEDULE = '0 * * * *' // cada hora

function createTransport() {
  const host = process.env.SMTP_HOST
  const port = process.env.SMTP_PORT ? Number(process.env.SMTP_PORT) : undefined
  const user = process.env.SMTP_USER
  const pass = process.env.SMTP_PASSWORD

  if (!host || !port || !user || !pass) {
    console.warn('[renewalNotifier] SMTP incompleto: definí SMTP_HOST, SMTP_PORT, SMTP_USER y SMTP_PASSWORD para enviar emails.')
    return null
  }

  return nodemailer.createTransport({
    host,
    port,
    secure: process.env.SMTP_SECURE === 'true' || port === 465,
    auth: { user, pass }
  })
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

async function sendReminder({ transporter, listing, profile }) {
  if (!profile?.email) {
    console.warn('[renewalNotifier] publicación sin email de contacto', listing.id)
    return false
  }

  const expiresDate = listing.expires_at ? new Date(listing.expires_at) : null
  const expiresLabel = expiresDate && Number.isFinite(expiresDate.getTime())
    ? expiresDate.toLocaleString('es-AR', { dateStyle: 'long', timeStyle: 'short' })
    : 'los próximos días'

  const mailOptions = {
    from: process.env.SMTP_FROM || `Ciclo Market <${process.env.SMTP_USER}>`,
    to: profile.email,
    subject: `Tu publicación "${listing.title}" está por vencer`,
    html: `
      <p>Hola ${profile.full_name || ''},</p>
      <p>Te avisamos que tu publicación <strong>${listing.title}</strong> vence el ${expiresLabel}.</p>
      <p>Podés renovarla o actualizarla entrando a tu panel de vendedor:</p>
      <p><a href="${process.env.FRONTEND_URL?.split(',')[0] || ''}/dashboard">Ir al dashboard</a></p>
      <p>Gracias por usar Ciclo Market.</p>
    `
  }

  try {
    await transporter.sendMail(mailOptions)
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

  const transporter = createTransport()
  if (!transporter) {
    console.warn('[renewalNotifier] no se configuró transporte SMTP, el job no se iniciará')
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
          const sent = await sendReminder({ transporter, listing, profile })
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
