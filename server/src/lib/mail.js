const nodemailer = require('nodemailer')

let cachedTransport = null

function smtpEnabled() {
  return process.env.SMTP_ENABLED === 'true'
}

function isMailConfigured() {
  if (!smtpEnabled()) return false
  return Boolean(
    process.env.SMTP_HOST &&
    process.env.SMTP_PORT &&
    process.env.SMTP_USER &&
    process.env.SMTP_PASSWORD
  )
}

function getMailTransport() {
  if (!isMailConfigured()) {
    throw new Error('SMTP no configurado correctamente')
  }
  if (cachedTransport) return cachedTransport

  const port = Number(process.env.SMTP_PORT)
  const secure = process.env.SMTP_SECURE === 'true' || port === 465
  const loggerEnabled = process.env.SMTP_LOGGER === 'true'
  if (loggerEnabled) {
    console.info('[mail] creating transport', {
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

async function sendMail(options) {
  const transporter = getMailTransport()
  if (process.env.SMTP_LOGGER === 'true') {
    console.info('[mail] sending message', {
      to: options.to,
      subject: options.subject,
    })
  }
  return transporter.sendMail(options)
}

module.exports = {
  getMailTransport,
  sendMail,
  isMailConfigured
}
