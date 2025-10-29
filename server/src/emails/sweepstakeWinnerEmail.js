function formatDate(iso) {
  if (!iso) return null
  try {
    return new Intl.DateTimeFormat('es-AR', {
      day: 'numeric',
      month: 'long',
      year: 'numeric',
    }).format(new Date(iso))
  } catch (error) {
    return null
  }
}

function buildSweepstakeWinnerEmail({ name, sweepstakeTitle, endAt, claimInstructions }) {
  const formattedEnd = formatDate(endAt)
  const friendlyName = name || '¡Felicitaciones!'
  const subject = `¡Ganaste ${sweepstakeTitle}!`
  const headerColor = '#14212e'
  const accent = '#ff6b00'
  const instructions =
    claimInstructions ||
    'Respondé este correo para coordinar la activación de Strava Premium por 12 meses. Nuestro equipo te va a acompañar en todo el proceso.'

  const html = `<!doctype html>
<html lang="es">
  <head>
    <meta charset="utf-8" />
    <title>${subject}</title>
  </head>
  <body style="margin:0;padding:0;background:#0f1724;font-family:'Segoe UI',Roboto,Helvetica,Arial,sans-serif;color:#14212e;">
    <table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="background:#0f1724;padding:32px 0;">
      <tr>
        <td align="center">
          <table role="presentation" width="92%" cellpadding="0" cellspacing="0" style="max-width:520px;background:#ffffff;border-radius:20px;overflow:hidden;box-shadow:0 20px 48px rgba(0,0,0,0.24);">
            <tr>
              <td style="background:${headerColor};padding:28px 32px;color:#ffffff;">
                <p style="margin:0;font-size:12px;letter-spacing:0.32em;text-transform:uppercase;color:${accent};font-weight:600;">Ganaste el sorteo</p>
                <h1 style="margin:12px 0 0;font-size:28px;line-height:1.32;">${sweepstakeTitle}</h1>
              </td>
            </tr>
            <tr>
              <td style="padding:30px 34px 18px;color:#14212e;font-size:15px;line-height:1.7;">
                <p style="margin:0;">${friendlyName}</p>
                <p style="margin:18px 0 0;">Tu publicación quedó como ganadora del sorteo de Strava Premium. 🌟</p>
                ${
                  formattedEnd
                    ? `<p style="margin:18px 0 0;">El sorteo cerró el ${formattedEnd} y elegimos al ganador entre todas las bicicletas publicadas durante ese período.</p>`
                    : ''
                }
                <p style="margin:18px 0 0;">${instructions}</p>
              </td>
            </tr>
            <tr>
              <td style="padding:0 34px 30px;">
                <a href="mailto:admin@ciclomarket.ar" style="display:inline-flex;align-items:center;gap:8px;background:${accent};color:#ffffff;text-decoration:none;padding:12px 22px;border-radius:999px;font-weight:600;">Responder a Ciclo Market</a>
              </td>
            </tr>
            <tr>
              <td style="padding:0 34px 34px;color:#64748b;font-size:12px;line-height:1.6;">
                <p style="margin:0;">Gracias por ser parte de la comunidad de Ciclo Market. Cualquier consulta podés escribirnos a <a href="mailto:admin@ciclomarket.ar" style="color:${headerColor};text-decoration:none;font-weight:600;">admin@ciclomarket.ar</a>.</p>
              </td>
            </tr>
          </table>
          <p style="margin:26px 0 0;font-size:11px;color:#cbd5f5;">Este email fue enviado automáticamente cuando registramos al ganador del sorteo.</p>
        </td>
      </tr>
    </table>
  </body>
</html>`

  const text = `${subject}\n\n${friendlyName}\n\nTu publicación quedó como ganadora del sorteo de Strava Premium.${formattedEnd ? ` El sorteo cerró el ${formattedEnd}.` : ''}\n\n${instructions}\n\nEscribinos a admin@ciclomarket.ar si necesitás ayuda.`

  return { subject, html, text }
}

module.exports = {
  buildSweepstakeWinnerEmail,
}
