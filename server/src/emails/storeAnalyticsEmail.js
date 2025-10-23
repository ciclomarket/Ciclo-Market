function escapeHtml(s) {
  return String(s || '')
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
}

function toNumber(n) {
  const v = Number(n)
  return Number.isFinite(v) ? v : 0
}

function formatPct(value) {
  const n = toNumber(value)
  return `${n.toFixed(2)}%`
}

function buildStoreAnalyticsHTML({
  baseFront,
  storeName,
  periodLabel = 'últimos 30 días',
  summary,
  topListings,
  dashboardUrl,
  unsubscribeLink,
}) {
  const cleanBase = (baseFront || 'https://ciclomarket.ar').replace(/\/$/, '')
  const logoUrl = `${cleanBase}/site-logo.png`
  const bikesUrl = `${cleanBase}/marketplace`
  const partsUrl = `${cleanBase}/marketplace?cat=Accesorios`
  const apparelUrl = `${cleanBase}/marketplace?cat=Indumentaria`

  const storeViews = toNumber(summary?.store_views)
  const listingViews = toNumber(summary?.listing_views)
  const waClicks = toNumber(summary?.wa_clicks)
  const ctr = listingViews > 0 ? (waClicks / listingViews) * 100 : 0

  const topRows = Array.isArray(topListings) ? topListings.slice(0, 10) : []

  const html = `
  <div style="background:#ffffff;margin:0 auto;max-width:680px;font-family:Inter,Arial,sans-serif;color:#14212e">
    <table role="presentation" cellspacing="0" cellpadding="0" border="0" align="center" style="width:100%">
      <tr>
        <td style="padding:20px 24px;text-align:center">
          <img src="${logoUrl}" alt="Ciclo Market" style="height:64px;width:auto;display:inline-block" />
        </td>
      </tr>
      <tr>
        <td style="background:#14212e;color:#fff;text-align:center;padding:10px 12px">
          <a href="${bikesUrl}" style="color:#fff;text-decoration:none;margin:0 10px;font-size:14px">Bicicletas</a>
          <a href="${partsUrl}" style="color:#fff;text-decoration:none;margin:0 10px;font-size:14px">Accesorios</a>
          <a href="${apparelUrl}" style="color:#fff;text-decoration:none;margin:0 10px;font-size:14px">Indumentaria</a>
        </td>
      </tr>
      <tr>
        <td style="padding:24px">
          <h2 style="margin:0 0 6px;font-size:20px;color:#0c1723">Resumen de tu tienda${storeName ? `: ${escapeHtml(storeName)}` : ''}</h2>
          <p style="margin:0 0 14px;color:#475569">Período: ${escapeHtml(periodLabel)}</p>
          <table role="presentation" width="100%" cellspacing="0" cellpadding="0">
            <tr>
              <td style="width:25%;padding:8px">
                <div style="border:1px solid #e5ebf3;border-radius:12px;padding:10px;text-align:center">
                  <div style="font-size:12px;color:#6b7280">Vistas a tienda</div>
                  <div style="font-size:22px;font-weight:700;color:#0c1723">${storeViews.toLocaleString('es-AR')}</div>
                </div>
              </td>
              <td style="width:25%;padding:8px">
                <div style="border:1px solid #e5ebf3;border-radius:12px;padding:10px;text-align:center">
                  <div style="font-size:12px;color:#6b7280">Vistas a publicaciones</div>
                  <div style="font-size:22px;font-weight:700;color:#0c1723">${listingViews.toLocaleString('es-AR')}</div>
                </div>
              </td>
              <td style="width:25%;padding:8px">
                <div style="border:1px solid #e5ebf3;border-radius:12px;padding:10px;text-align:center">
                  <div style="font-size:12px;color:#6b7280">Clicks a WhatsApp</div>
                  <div style="font-size:22px;font-weight:700;color:#0c1723">${waClicks.toLocaleString('es-AR')}</div>
                </div>
              </td>
              <td style="width:25%;padding:8px">
                <div style="border:1px solid #e5ebf3;border-radius:12px;padding:10px;text-align:center">
                  <div style="font-size:12px;color:#6b7280">Conversión (WA / vistas)</div>
                  <div style="font-size:22px;font-weight:700;color:#0c1723">${formatPct(ctr)}</div>
                </div>
              </td>
            </tr>
          </table>

          <div style="margin:16px 0 8px">
            <h3 style="margin:0 0 8px;font-size:16px;color:#0c1723">Top publicaciones</h3>
            <table role="presentation" width="100%" cellspacing="0" cellpadding="0" style="border:1px solid #e5ebf3;border-radius:12px;overflow:hidden">
              <thead style="background:#f6f8fb">
                <tr>
                  <th align="left" style="padding:10px 12px;font-size:13px;color:#475569">Título</th>
                  <th align="right" style="padding:10px 12px;font-size:13px;color:#475569">Vistas</th>
                  <th align="right" style="padding:10px 12px;font-size:13px;color:#475569">WhatsApp</th>
                  <th align="right" style="padding:10px 12px;font-size:13px;color:#475569">CTR</th>
                </tr>
              </thead>
              <tbody>
                ${topRows.map((row) => {
                  const title = escapeHtml(row.title || row.listing_title || row.listing_id)
                  const views = toNumber(row.views)
                  const wa = toNumber(row.wa_clicks)
                  const pct = views > 0 ? (wa / views) * 100 : 0
                  const link = row.link || row.url || '#'
                  return `
                    <tr>
                      <td style="padding:10px 12px;border-top:1px solid #e5ebf3"><a href="${link}" style="color:#14212e;text-decoration:underline">${title}</a></td>
                      <td align="right" style="padding:10px 12px;border-top:1px solid #e5ebf3">${views.toLocaleString('es-AR')}</td>
                      <td align="right" style="padding:10px 12px;border-top:1px solid #e5ebf3">${wa.toLocaleString('es-AR')}</td>
                      <td align="right" style="padding:10px 12px;border-top:1px solid #e5ebf3">${formatPct(pct)}</td>
                    </tr>
                  `
                }).join('')}
              </tbody>
            </table>
          </div>

          <p style="margin:16px 0 8px;text-align:center">
            <a href="${dashboardUrl}" style="display:inline-block;padding:12px 18px;background:#14212e;color:#fff;text-decoration:none;border-radius:10px;font-weight:600">Ver analítica completa</a>
          </p>
        </td>
      </tr>
      <tr>
        <td style="padding:14px 24px">
          <div style="border-radius:14px;background:#f6f8fb;border:1px solid #e1e5eb;padding:12px;text-align:center;color:#475569;font-size:12px">
            ¿No querés recibir este resumen? <a href="${unsubscribeLink || (cleanBase + '/ayuda')}" style="color:#0c72ff;text-decoration:underline">Desuscribirme</a>.
          </div>
        </td>
      </tr>
    </table>
  </div>
  `

  const text = [
    `Resumen de tu tienda${storeName ? `: ${storeName}` : ''} – ${periodLabel}`,
    `Vistas tienda: ${storeViews}`,
    `Vistas publicaciones: ${listingViews}`,
    `Clicks WA: ${waClicks}`,
    `Conversión: ${formatPct(ctr)}`,
    '',
    'Top publicaciones:',
    ...topRows.map((r) => `- ${(r.title || r.listing_title || r.listing_id)} · vistas ${toNumber(r.views)} · WA ${toNumber(r.wa_clicks)}${r.link ? ` · ${r.link}` : ''}`),
    '',
    `Ver más: ${dashboardUrl}`,
  ].join('\n')

  return { html, text }
}

module.exports = { buildStoreAnalyticsHTML }

