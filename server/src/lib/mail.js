let cachedTransport = null
let _nodemailer = null

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

function isMailConfigured() {
  return isResendConfigured() || isSMTPConfigured()
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

async function sendViaSMTP(options) {
  const transporter = getMailTransport()
  if (process.env.SMTP_LOGGER === 'true') {
    console.info('[mail] sending via SMTP', {
      to: options.to,
      subject: options.subject,
    })
  }
  return transporter.sendMail(options)
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

async function sendMail(options) {
  if (isResendConfigured()) return sendViaResend(options)
  if (isSMTPConfigured()) return sendViaSMTP(options)
  throw new Error('Mail no configurado: definí RESEND_API_KEY o SMTP_*')
}

module.exports = {
  getMailTransport,
  sendMail,
  isMailConfigured,
  // Export for diagnostics (no secrets exposed)
  isSMTPConfigured,
  isResendConfigured,
}
