import 'dotenv/config'
import nodemailer from 'nodemailer'

async function main() {
  const required = ['SMTP_HOST', 'SMTP_PORT', 'SMTP_USER', 'SMTP_PASSWORD', 'SMTP_FROM']
  const missing = required.filter((key) => !process.env[key])
  if (missing.length) {
    throw new Error(`Faltan variables SMTP: ${missing.join(', ')}`)
  }

  const transporter = nodemailer.createTransport({
    host: process.env.SMTP_HOST,
    port: Number(process.env.SMTP_PORT),
    secure: process.env.SMTP_SECURE === 'true' || Number(process.env.SMTP_PORT) === 465,
    auth: {
      user: process.env.SMTP_USER,
      pass: process.env.SMTP_PASSWORD
    }
  })

  const info = await transporter.sendMail({
    from: process.env.SMTP_FROM,
    to: 'rodrigozalazarml@gmail.com',
    subject: 'Test SMTP Brevo - Ciclo Market',
    text: 'Hola Rodrigo! Este es un test de envío usando Brevo desde Ciclo Market.',
    html: '<p>Hola Rodrigo!</p><p>Este es un test de envío usando Brevo desde <strong>Ciclo Market</strong>.</p>'
  })

  console.log('Mensaje enviado correctamente. ID:', info.messageId)
}

main().catch((error) => {
  console.error('Error enviando el test SMTP:', error)
  process.exitCode = 1
})
