const { sendMail, isMailConfigured } = require('../src/lib/mail')

function getArg(name) {
  const idx = process.argv.indexOf(`--${name}`)
  if (idx === -1) return null
  const next = process.argv[idx + 1]
  if (!next || next.startsWith('--')) return null
  return next
}

async function main() {
  const to = getArg('to')
  const sellerId = getArg('sellerId')
  const sellerName = getArg('sellerName') || 'Ciclo Market'
  const frontOverride = getArg('frontend')

  if (!to || !sellerId) {
    console.error('Uso: node server/scripts/sendTestReviewEmail.js --to <email> --sellerId <uuid> [--sellerName \"...\"] [--frontend https://www.ciclomarket.ar]')
    process.exit(1)
  }

  if (!isMailConfigured()) {
    console.error('Mail no configurado: falta RESEND_API_KEY o SMTP_*')
    process.exit(1)
  }

  const baseFront = String(frontOverride || (process.env.FRONTEND_URL || 'https://www.ciclomarket.ar').split(',')[0] || '')
    .trim()
    .replace(/\/$/, '')

  const vendorUrl = `${baseFront}/vendedor/${sellerId}`
  const starLinks = Array.from({ length: 5 })
    .map((_, idx) => {
      const rating = idx + 1
      const href = `${vendorUrl}?review=true&rating=${rating}`
      return `<a href="${href}" style="display:inline-block;font-size:34px;line-height:1;color:#f59e0b;text-decoration:none;padding:0 4px;" title="${rating} de 5">★</a>`
    })
    .join('')

  const from = process.env.SMTP_FROM || `Ciclo Market <${process.env.SMTP_USER || 'no-reply@ciclomarket.ar'}>`

  await sendMail({
    from,
    to,
    subject: `¿Qué tal tu experiencia con ${sellerName}?`,
    html: `
      <div style="font-family:Arial,sans-serif;line-height:1.6;color:#14212e;">
        <h2 style="margin:0 0 10px 0;">Dejá tu reseña</h2>
        <p style="margin:0 0 12px 0;">Elegí una calificación:</p>
        <div style="margin:6px 0 16px 0;">${starLinks}</div>
        <div style="margin:0 0 18px 0;">
          <a href="${vendorUrl}" style="display:inline-block;padding:10px 16px;background:#14212e;color:#fff;text-decoration:none;border-radius:10px;font-weight:700;">Ver perfil del vendedor</a>
        </div>
        <p style="margin:0;color:#475569;font-size:13px;">Gracias por ayudar a la comunidad Ciclo Market.</p>
      </div>
    `,
  })

  console.log('sent', { to, vendorUrl })
}

main().catch((err) => {
  console.error('send failed', err?.message || err)
  process.exit(1)
})

