const nodemailer = require('nodemailer')
let cachedTransport = null

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
  cachedTransport = nodemailer.createTransport({
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
  const { Resend } = require('resend')
  const resend = new Resend(process.env.RESEND_API_KEY)
  const from = options.from || process.env.SMTP_FROM || process.env.SMTP_USER
  const payload = {
    from,
    to: Array.isArray(options.to) ? options.to : [options.to],
    subject: options.subject,
    html: options.html,
    text: options.text,
  }
  if (process.env.SMTP_LOGGER === 'true') {
    console.info('[mail] sending via Resend', { to: payload.to, subject: payload.subject })
  }
  const result = await resend.emails.send(payload)
  if (result.error) {
    const err = new Error(result.error?.message || 'Resend email failed')
    err.code = result.error?.code
    throw err
  }
  return result
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
}
