function escapeHtml(value) {
  return String(value ?? '')
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#39;')
}

function buildSellerFollowupSoldEmail({ baseFront, sellerName }) {
  const cleanBase = (baseFront || 'https://www.ciclomarket.ar').replace(/\/$/, '')
  const dashboardUrl = `${cleanBase}/dashboard?tab=${encodeURIComponent('Publicaciones')}`
  const name = sellerName ? escapeHtml(sellerName) : '¡Hola!'

  const subject = '¿Vendiste tu bici? Contanos en 10 segundos'
  const html = `
  <div style="background:#f2f4f8;margin:0;padding:0;font-family:Inter,Arial,sans-serif;color:#0c1723">
    <table role="presentation" cellspacing="0" cellpadding="0" border="0" align="center" style="width:100%;max-width:680px;margin:0 auto">
      <tr>
        <td style="padding:22px 24px 10px;text-align:center">
          <img src="${cleanBase}/site-logo.png" alt="Ciclo Market" style="height:56px;width:auto;display:inline-block" />
        </td>
      </tr>
      <tr>
        <td style="padding:0 24px 24px">
          <div style="background:#ffffff;border-radius:18px;border:1px solid #e6edf6;padding:18px 18px 16px">
            <h2 style="margin:0 0 10px;font-size:18px;color:#0c1723">Hola ${name} 👋</h2>
            <p style="margin:0 0 12px;color:#334155;line-height:1.6">
              Vimos que tus publicaciones recibieron consultas estos días. ¿La vendiste?
            </p>
            <ol style="margin:0 0 14px;padding-left:18px;color:#334155;line-height:1.7">
              <li>Sí, por Ciclo Market ✅</li>
              <li>Sí, por fuera</li>
              <li>Todavía no</li>
              <li>La pausé</li>
            </ol>
            <p style="margin:0 0 16px;color:#334155;line-height:1.6">
              Si querés ayuda para venderla más rápido, respondé este mail con <strong>AYUDA</strong>.
            </p>
            <p style="margin:0;text-align:center">
              <a href="${dashboardUrl}" style="display:inline-block;padding:12px 18px;background:#14212e;color:#fff;text-decoration:none;border-radius:999px;font-weight:700">
                Ir a mi panel
              </a>
            </p>
          </div>
          <p style="margin:12px 0 0;color:#64748b;font-size:12px;text-align:center">
            Si no querés recibir estos mensajes, respondé STOP.
          </p>
        </td>
      </tr>
    </table>
  </div>`

  const text = [
    `Hola ${sellerName || ''}`.trim(),
    '',
    'Vimos que tus publicaciones recibieron consultas estos días. ¿La vendiste?',
    '1) Sí, por Ciclo Market ✅',
    '2) Sí, por fuera',
    '3) Todavía no',
    '4) La pausé',
    '',
    'Si querés ayuda para venderla más rápido, respondé AYUDA.',
    '',
    `Panel: ${dashboardUrl}`,
    '',
    'Para no recibir más, respondé STOP.',
  ].join('\n')

  return { subject, html, text }
}

module.exports = { buildSellerFollowupSoldEmail }

