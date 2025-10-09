const nodemailer = require('nodemailer')

let cachedTransport = null

function isMailConfigured() {
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
  cachedTransport = nodemailer.createTransport({
    host: process.env.SMTP_HOST,
    port,
    secure: process.env.SMTP_SECURE === 'true' || port === 465,
    auth: {
      user: process.env.SMTP_USER,
      pass: process.env.SMTP_PASSWORD
    }
  })
  return cachedTransport
}

async function sendMail(options) {
  const transporter = getMailTransport()
  return transporter.sendMail(options)
}

module.exports = {
  getMailTransport,
  sendMail,
  isMailConfigured
}
