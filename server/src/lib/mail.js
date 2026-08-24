let cachedTransport = null
let _nodemailer = null
const brevo = require('./brevo')

function smtpEnabled() {
  return process.env.SMTP_ENABLED === 'true'
}

function isSMTPConfigured() {
  return (
    smtpEnabled() &&
    Boolean(
      process.env.SMTP_HOST &&
        process.env.SMTP_PORT &&
        process.env.SMTP_USER &&
        process.env.SMTP_PASSWORD
    )
  )
}

function isResendConfigured() {
  return Boolean(process.env.RESEND_API_KEY)
}

function isBrevoConfigured() {
  return brevo.isBrevoConfigured()
}

function isMailConfigured() {
  return isBrevoConfigured() || isResendConfigured() || isSMTPConfigured()
}

function getMailTransport() {
  if (!isSMTPConfigured()) {
    throw new Error('SMTP no configurado correctamente')
  }
  if (cachedTransport) return cachedTransport

  const port = Number(process.env.SMTP_PORT)
  const secure = process.env.SMTP_SECURE === 'true' || port === 465
  const loggerEnabled = process.env.SMTP_LOGGER === 'true'
  if (loggerEnabled) {
    console.info('[mail] creating SMTP transport', {
      host: process.env.SMTP_HOST,
      port,
      secure,
      user: process.env.SMTP_USER,
    })
  }
  if (!_nodemailer) {
    try {
      _nodemailer = require('nodemailer')
    } catch (e) {
      throw new Error('nodemailer no está instalado y se requiere para SMTP')
    }
  }
  cachedTransport = _nodemailer.createTransport({
    host: process.env.SMTP_HOST,
    port,
    secure,
    auth: {
      user: process.env.SMTP_USER,
      pass: process.env.SMTP_PASSWORD
    },
    logger: loggerEnabled,
    debug: loggerEnabled,
    tls: {
      rejectUnauthorized: false
    }
  })
  return cachedTransport
}

// Fallback compartido de remitente cuando el caller no pasa "from" explícito.
// SMTP_USER es el login SMTP de Brevo (<id>@smtp-brevo.com), no una dirección
// de remitente válida — nunca debe usarse como "from". Ver commit "Fix Brevo
// sender fallback". Todos los call sites de campañas/notificaciones deben usar
// esta función en vez de duplicar `process.env.SMTP_FROM || ...` a mano.
function getDefaultSenderFrom() {
  return process.env.SMTP_FROM || 'Ciclo Market <avisos@ciclomarket.ar>'
}

async function sendViaSMTP(options) {
  const transporter = getMailTransport()
  // Si el caller no indica "from", usar el fallback compartido.
  // Sin esto, nodemailer usa auth.user como remitente y Brevo lo rechaza ("Invalid from").
  const from = options.from || getDefaultSenderFrom()
  if (process.env.SMTP_LOGGER === 'true') {
    console.info('[mail] sending via SMTP', {
      to: options.to,
      subject: options.subject,
      from,
    })
  }
  return transporter.sendMail({ ...options, from })
}

async function sendViaResend(options) {
  const apiKey = process.env.RESEND_API_KEY
  if (!apiKey) throw new Error('RESEND_API_KEY no configurado')
  const fromEnv = process.env.RESEND_FROM || process.env.SMTP_FROM || process.env.SMTP_USER
  const from = options.from || fromEnv || 'Ciclo Market <onboarding@resend.dev>'
  const to = Array.isArray(options.to) ? options.to : [options.to]
  const payload = {
    from,
    to,
    subject: options.subject,
    html: options.html,
    text: options.text,
  }
  if (process.env.SMTP_LOGGER === 'true') {
    console.info('[mail] sending via Resend', { from, to, subject: options.subject })
  }
  const res = await fetch('https://api.resend.com/emails', {
    method: 'POST',
    headers: {
      Authorization: `Bearer ${apiKey}`,
      'Content-Type': 'application/json',
    },
    body: JSON.stringify(payload),
  })
  const data = await res.json().catch(() => ({}))
  if (!res.ok) {
    const err = new Error(data?.error?.message || data?.message || 'Resend API error')
    err.code = data?.error?.code
    throw err
  }
  return data
}

// Brevo HTTP API: sin allowlist de IPs (a diferencia del SMTP relay).
async function sendViaBrevo(options) {
  if (process.env.SMTP_LOGGER === 'true') {
    console.info('[mail] sending via Brevo API', { to: options.to, subject: options.subject })
  }
  // Si el caller no pasa "from", usar el fallback compartido (nunca SMTP_USER).
  const from = options.from || getDefaultSenderFrom()
  return brevo.sendEmail({
    from,
    to: options.to,
    subject: options.subject,
    html: options.html,
    text: options.text,
    replyTo: options.replyTo,
    headers: options.headers,
  })
}

async function sendMail(options) {
  // 1) Brevo HTTP API (preferido: sin allowlist de IPs).
  // 2) SMTP (Brevo u otro relay).
  // 3) Resend (fallback).
  if (brevo.isBrevoConfigured()) return sendViaBrevo(options)
  if (isSMTPConfigured()) return sendViaSMTP(options)
  if (isResendConfigured()) return sendViaResend(options)
  throw new Error('Mail no configurado: definí BREVO_API_KEY, SMTP_* o RESEND_API_KEY')
}

module.exports = {
  getMailTransport,
  sendMail,
  isMailConfigured,
  getDefaultSenderFrom,
  // Export for diagnostics (no secrets exposed)
  isSMTPConfigured,
  isResendConfigured,
  isBrevoConfigured,
}
