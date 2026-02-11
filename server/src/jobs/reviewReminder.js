const cron = require('node-cron')
const { getServerSupabaseClient } = require('../lib/supabaseClient')
const { sendMail, isMailConfigured, isSMTPConfigured, isResendConfigured } = require('../lib/mail')

const DEFAULT_CRON_SCHEDULE = '0 10 * * *' // una vez al día 10:00
const DEFAULT_BATCH_LIMIT = 200

async function emitInAppNotifications(supabase, limit) {
  try {
    const { data, error } = await supabase.rpc('review_reminders_emit_ready_notifications', { p_limit: limit })
    if (error) {
      console.warn('[reviewReminder] emit_ready_notifications error', error)
      return 0
    }
    const count = typeof data === 'number' ? data : 0
    if (count > 0) console.info('[reviewReminder] in-app notifications emitted:', count)
    return count
  } catch (err) {
    console.warn('[reviewReminder] emit_ready_notifications failed', err)
    return 0
  }
}

async function fetchReadyEmailReminders(supabase, limit) {
  const nowIso = new Date().toISOString()
  const { data, error } = await supabase
    .from('review_reminders')
    .select('id,buyer_id,seller_id,ready_at,sent_email')
    .lte('ready_at', nowIso)
    .eq('sent_email', false)
    .order('ready_at', { ascending: true })
    .limit(limit)
  if (error) {
    console.warn('[reviewReminder] fetch ready email reminders failed', error)
    return []
  }
  return data || []
}

async function fetchProfiles(supabase, ids) {
  if (!ids.length) return new Map()
  const { data, error } = await supabase
    .from('users')
    .select('id,email,full_name')
    .in('id', ids)
  if (error) {
    console.warn('[reviewReminder] fetchProfiles failed', error)
    return new Map()
  }
  const map = new Map()
  for (const row of data || []) {
    if (row?.id) map.set(row.id, row)
  }
  return map
}

async function sendEmailsForReminders(supabase, reminders) {
  if (!reminders.length) return 0
  const buyerIds = [...new Set(reminders.map((r) => r.buyer_id).filter(Boolean))]
  const sellerIds = [...new Set(reminders.map((r) => r.seller_id).filter(Boolean))]
  const profiles = await fetchProfiles(supabase, [...new Set([...buyerIds, ...sellerIds])])
  const baseFront = (process.env.FRONTEND_URL || '').split(',')[0]?.trim() || ''
  const sentIds = []
  for (const r of reminders) {
    const buyer = profiles.get(r.buyer_id)
    const seller = profiles.get(r.seller_id)
    const to = buyer?.email
    if (!to) continue
    const sellerName = String(seller?.full_name || '').trim() || 'este vendedor'
    const vendorUrl = baseFront ? `${baseFront}/vendedor/${r.seller_id}` : null
    const starLinks = baseFront
      ? Array.from({ length: 5 }).map((_, idx) => {
        const rating = idx + 1
        const href = `${baseFront}/vendedor/${r.seller_id}?review=true&rating=${rating}`
        return `<a href="${href}" style="display:inline-block;font-size:34px;line-height:1;color:#f59e0b;text-decoration:none;padding:0 4px;" title="${rating} de 5">★</a>`
      }).join('')
      : ''
    const mailOptions = {
      from: process.env.SMTP_FROM || `Ciclo Market <${process.env.SMTP_USER}>`,
      to,
      subject: `¿Qué tal tu experiencia con ${sellerName}?`,
      html: `
        <div style="font-family:Arial,sans-serif;line-height:1.6;color:#14212e;">
          <h2 style="margin:0 0 10px 0;">Dejá tu reseña</h2>
          <p style="margin:0 0 10px 0;">Hola ${buyer?.full_name || 'ciclista'},</p>
          <p style="margin:0 0 12px 0;">¿Qué tal tu experiencia con <strong>${sellerName}</strong>?</p>
          ${vendorUrl ? `<p style="margin:0 0 10px 0;font-size:13px;color:#334155;">Seleccioná una calificación:</p>` : ''}
          ${vendorUrl ? `<div style="margin:6px 0 16px 0;">${starLinks}</div>` : ''}
          ${vendorUrl ? `<div style="margin:0 0 18px 0;"><a href="${vendorUrl}" style="display:inline-block;padding:10px 16px;background:#14212e;color:#fff;text-decoration:none;border-radius:10px;font-weight:700;">Ver perfil del vendedor</a></div>` : ''}
          <p style="margin:0;color:#475569;font-size:13px;">Gracias por ayudar a la comunidad Ciclo Market.</p>
        </div>
      `,
    }
    try {
      await sendMail(mailOptions)
      sentIds.push(r.id)
    } catch (err) {
      console.warn('[reviewReminder] sendMail failed for reminder', r.id, err)
    }
  }

  if (sentIds.length) {
    try {
      // Marcar como enviados vía RPC helper (security definer)
      await supabase.rpc('review_reminders_mark_email_sent', { p_ids: sentIds })
    } catch (err) {
      console.warn('[reviewReminder] mark_email_sent failed', err)
    }
  }
  return sentIds.length
}

function startReviewReminderJob() {
  if (process.env.REVIEW_REMINDER_ENABLED !== 'true') {
    console.info('[reviewReminder] deshabilitado (REVIEW_REMINDER_ENABLED !== "true")')
    return
  }

  let supabase
  try {
    supabase = getServerSupabaseClient()
  } catch (error) {
    console.warn('[reviewReminder] no se pudo inicializar Supabase:', error.message)
    return
  }

  if (!isMailConfigured()) {
    const smtpOk = isSMTPConfigured()
    const resendOk = isResendConfigured()
    console.warn('[reviewReminder] mail no configurado (SMTP o Resend), el job se iniciará sólo para in-app', { smtpOk, resendOk })
  }

  const cronSchedule = process.env.REVIEW_REMINDER_CRON || DEFAULT_CRON_SCHEDULE
  const batchLimit = Number(process.env.REVIEW_REMINDER_BATCH_LIMIT || DEFAULT_BATCH_LIMIT)

  const task = cron.schedule(
    cronSchedule,
    async () => {
      try {
        await emitInAppNotifications(supabase, batchLimit)
        if (isMailConfigured()) {
          const reminders = await fetchReadyEmailReminders(supabase, batchLimit)
          await sendEmailsForReminders(supabase, reminders)
        }
      } catch (err) {
        console.error('[reviewReminder] job failed', err)
      }
    },
    { timezone: process.env.REVIEW_REMINDER_TZ || 'America/Argentina/Buenos_Aires' }
  )

  task.start()
  console.info('[reviewReminder] job iniciado con cron', cronSchedule)
}

async function runReviewReminderOnce(limit) {
  const batchLimit = Number(limit || process.env.REVIEW_REMINDER_BATCH_LIMIT || DEFAULT_BATCH_LIMIT)
  let supabase
  try {
    supabase = getServerSupabaseClient()
  } catch (error) {
    console.warn('[reviewReminder] no se pudo inicializar Supabase:', error.message)
    return { inapp: 0, emailed: 0 }
  }
  const inapp = await emitInAppNotifications(supabase, batchLimit)
  let emailed = 0
  try {
    if (isMailConfigured()) {
      const reminders = await fetchReadyEmailReminders(supabase, batchLimit)
      emailed = await sendEmailsForReminders(supabase, reminders)
    } else {
      console.warn('[reviewReminder] email no configurado; sólo se emitieron notificaciones in-app')
    }
  } catch (err) {
    console.error('[reviewReminder] runOnce failed while emailing', err)
  }
  console.info('[reviewReminder] once done', { inapp, emailed })
  return { inapp, emailed }
}

module.exports = { startReviewReminderJob, runReviewReminderOnce }
