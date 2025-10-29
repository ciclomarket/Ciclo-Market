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

function buildSweepstakeParticipantEmail({ name, sweepstakeTitle, endAt, listingTitle, listingUrl }) {
  const formattedEnd = formatDate(endAt)
  const friendlyName = name || '¡Hola!'
  const subject = `${sweepstakeTitle}: tu publicación ya está participando`
  const headerColor = '#14212e'
  const accent = '#ff6b00'
  const safeListingTitle = listingTitle || 'tu bicicleta publicada'
  const endCopy = formattedEnd ? `hasta el ${formattedEnd}` : 'hasta la fecha de cierre'
  const bodyCopy = `Tu publicación ${safeListingTitle} ya quedó registrada en el sorteo. Seguimos contando participaciones ${endCopy}.`

  const html = `<!doctype html>
<html lang="es">
  <head>
    <meta charset="utf-8" />
    <title>${subject}</title>
  </head>
  <body style="margin:0;padding:0;background:#f6f7fb;font-family:'Segoe UI',Roboto,Helvetica,Arial,sans-serif;color:#14212e;">
    <table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="background:#f6f7fb;padding:24px 0;">
      <tr>
        <td align="center">
          <table role="presentation" width="92%" cellpadding="0" cellspacing="0" style="max-width:520px;background:#ffffff;border-radius:16px;overflow:hidden;box-shadow:0 18px 42px rgba(20,33,46,0.14);">
            <tr>
              <td style="background:${headerColor};padding:24px 32px;color:#ffffff;">
                <p style="margin:0;font-size:12px;letter-spacing:0.32em;text-transform:uppercase;color:${accent};font-weight:600;">Sorteo Strava Premium</p>
                <h1 style="margin:12px 0 0;font-size:26px;line-height:1.32;">${sweepstakeTitle}</h1>
              </td>
            </tr>
            <tr>
              <td style="padding:28px 32px 16px;color:#14212e;font-size:15px;line-height:1.6;">
                <p style="margin:0;">${friendlyName},</p>
                <p style="margin:18px 0 0;">${bodyCopy}</p>
                ${
                  formattedEnd
                    ? `<p style="margin:18px 0 0;">Guardate la fecha: ese día anunciamos al ganador y te vamos a avisar por email.</p>`
                    : ''
                }
                <p style="margin:18px 0 0;">Podés editar tu publicación cuando quieras desde el panel de Ciclo Market.</p>
              </td>
            </tr>
            ${
              listingUrl
                ? `<tr>
              <td style="padding:0 32px 28px;">
                <a href="${listingUrl}" style="display:inline-flex;align-items:center;gap:8px;background:${headerColor};color:#ffffff;text-decoration:none;padding:12px 22px;border-radius:999px;font-weight:600;">Ver mi publicación</a>
              </td>
            </tr>`
                : ''
            }
            <tr>
              <td style="padding:0 32px 28px;color:#64748b;font-size:12px;line-height:1.6;">
                <p style="margin:0;">Si tenés dudas, escribinos a <a href="mailto:admin@ciclomarket.ar" style="color:${headerColor};text-decoration:none;font-weight:600;">admin@ciclomarket.ar</a>.</p>
              </td>
            </tr>
          </table>
          <p style="margin:24px 0 0;font-size:11px;color:#94a3b8;">Recibiste este email porque participás del sorteo de Strava Premium en Ciclo Market.</p>
        </td>
      </tr>
    </table>
  </body>
</html>`

  const text = `${sweepstakeTitle}\n\n${friendlyName}, tu publicación ${safeListingTitle} ya quedó registrada en el sorteo.${formattedEnd ? ` Seguimos sumando participaciones hasta el ${formattedEnd}.` : ''}\n\nPodés editar tu publicación cuando quieras desde ciclomarket.ar.\n\nConsultas: admin@ciclomarket.ar`

  return { subject, html, text }
}

module.exports = {
  buildSweepstakeParticipantEmail,
}
