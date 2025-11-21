const BIKE_CATEGORY_SET = new Set(['Ruta', 'MTB', 'Gravel', 'Triatlón', 'Urbana', 'Fixie', 'E-Bike', 'Niños', 'Pista'])

function resolveFrontendBaseUrl() {
  const raw = (process.env.FRONTEND_URL || process.env.FRONTEND_URL_BASE || '').split(',')[0]?.trim()
  if (!raw) return 'https://www.ciclomarket.ar'
  return raw.replace(/\/$/, '')
}

function formatCurrency(value, currency) {
  const n = Number(value)
  if (!Number.isFinite(n) || n <= 0) return null
  const cur = typeof currency === 'string' && currency.trim() ? currency.trim().toUpperCase() : 'ARS'
  try {
    return new Intl.NumberFormat('es-AR', {
      style: 'currency',
      currency: cur,
      maximumFractionDigits: cur === 'ARS' ? 0 : 2,
    }).format(n)
  } catch {
    return `${n.toLocaleString('es-AR')} ${cur}`
  }
}

function normalizeString(value) {
  if (value === null || value === undefined) return ''
  return String(value).trim()
}

function normalizeKey(value) {
  const txt = normalizeString(value)
  return txt ? txt.normalize('NFD').replace(/[\u0300-\u036f]/g, '').toLowerCase() : ''
}

function arrayToNormalizedSet(values) {
  const set = new Set()
  if (!values) return set
  const arr = Array.isArray(values) ? values : [values]
  for (const item of arr) {
    const key = normalizeKey(item)
    if (key) set.add(key)
  }
  return set
}

function extractExtrasMapBackend(extras) {
  const map = {}
  if (!extras || typeof extras !== 'string') return map
  extras
    .split('•')
    .map((part) => part.trim())
    .filter(Boolean)
    .forEach((part) => {
      const [rawKey, ...rawValue] = part.split(':')
      if (!rawKey || !rawValue.length) return
      const key = normalizeKey(rawKey)
      const value = rawValue.join(':').trim()
      if (!key || !value) return
      map[key] = value
    })
  return map
}

function inferTransmissionTypeBackend(text) {
  const t = normalizeKey(text)
  if (!t) return null
  if (t.includes('di2') || t.includes('etap') || t.includes('axs') || t.includes('eps') || t.includes('steps')) return 'Electrónico'
  return 'Mecánico'
}

function extractConditionBackend(listing, extrasMap) {
  if (extrasMap.condicion) return extrasMap.condicion.trim()
  const description = normalizeString(listing?.description)
  if (description) {
    const match = description.match(/condici[oó]n:\s*([^\n•]+)/i)
    if (match && match[1]) return match[1].trim()
  }
  return null
}

function extractBrakeBackend(listing, extrasMap) {
  if (extrasMap['tipo de freno']) return extrasMap['tipo de freno'].trim()
  if (extrasMap.freno) return extrasMap.freno.trim()
  const description = normalizeString(listing?.description)
  if (description) {
    const match = description.match(/freno[s]?\s*:?[\s-]*([^\n•]+)/i)
    if (match && match[1]) return match[1].trim()
  }
  return null
}

function extractApparelSizesBackend(extrasMap) {
  const value = extrasMap.talle || extrasMap.talles || null
  if (!value) return []
  return value.split(',').map((v) => v.trim()).filter(Boolean)
}

function parseListingLocationBackend(location) {
  const values = []
  const raw = normalizeString(location)
  if (!raw) return values
  raw
    .split(/[,/·]/)
    .map((part) => part.trim())
    .filter(Boolean)
    .forEach((part) => values.push(part))
  return values
}

function parseImagesArrayBackend(images) {
  if (Array.isArray(images)) return images
  if (typeof images === 'string') {
    try {
      const parsed = JSON.parse(images)
      return Array.isArray(parsed) ? parsed : []
    } catch {
      return []
    }
  }
  return []
}

function buildListingMatchContext(listing, { storeEnabled }) {
  const extrasMap = extractExtrasMapBackend(listing?.extras)
  const sizes = new Set()
  const frameSize = normalizeString(listing?.frame_size)
  if (frameSize) sizes.add(frameSize)
  for (const value of extractApparelSizesBackend(extrasMap)) {
    if (value) sizes.add(value)
  }

  const locationSet = arrayToNormalizedSet(parseListingLocationBackend(listing?.location))
  const brandSet = arrayToNormalizedSet(listing?.brand)
  const materialSet = arrayToNormalizedSet(listing?.material)
  const wheelSizeSet = arrayToNormalizedSet(listing?.wheel_size)
  const drivetrainSet = arrayToNormalizedSet([listing?.drivetrain, listing?.drivetrain_detail])
  const condition = extractConditionBackend(listing, extrasMap)
  const conditionSet = arrayToNormalizedSet(condition ? [condition] : [])
  const brake = extractBrakeBackend(listing, extrasMap)
  const brakeSet = arrayToNormalizedSet(brake ? [brake] : [])
  const transmissionType = inferTransmissionTypeBackend(listing?.drivetrain_detail) || inferTransmissionTypeBackend(listing?.drivetrain)
  const transmissionSet = arrayToNormalizedSet(transmissionType ? [transmissionType] : [])
  const yearValue = listing?.year ? String(listing.year) : null
  const searchText = [listing?.title, listing?.brand, listing?.model, listing?.description]
    .map((part) => normalizeString(part).toLowerCase())
    .filter(Boolean)
    .join(' ')

  return {
    listing,
    price: Number(listing?.price) || 0,
    priceCurrency: normalizeString(listing?.price_currency).toUpperCase() || 'ARS',
    originalPrice: Number(listing?.original_price) || 0,
    category: normalizeString(listing?.category) || null,
    subcategory: normalizeString(listing?.subcategory) || null,
    brandSet,
    materialSet,
    wheelSizeSet,
    drivetrainSet,
    conditionSet,
    brakeSet,
    transmissionSet,
    yearValue,
    sizesNormalized: arrayToNormalizedSet(Array.from(sizes)),
    locationSet,
    storeEnabled: Boolean(storeEnabled),
    isDeal: Number(listing?.original_price) > Number(listing?.price || 0),
    searchText,
    firstImage: parseImagesArrayBackend(listing?.images)[0] || null,
  }
}

function matchesSavedSearchCriteria(criteria, context) {
  if (!criteria || typeof criteria !== 'object') return false

  const cat = typeof criteria.cat === 'string' ? criteria.cat.trim() : ''
  if (cat && context.category && cat !== 'Todos') {
    if (normalizeKey(cat) !== normalizeKey(context.category)) return false
  }
  if (cat && !context.category && cat !== 'Todos') return false

  const subcat = typeof criteria.subcat === 'string' ? criteria.subcat.trim() : ''
  if (subcat) {
    if (!context.subcategory || normalizeKey(subcat) !== normalizeKey(context.subcategory)) return false
  }

  if (Array.isArray(criteria.brand) && criteria.brand.length) {
    const want = criteria.brand.map((v) => normalizeKey(v)).filter(Boolean)
    if (!want.length || !want.some((v) => context.brandSet.has(v))) return false
  }

  if (Array.isArray(criteria.material) && criteria.material.length) {
    const want = criteria.material.map((v) => normalizeKey(v)).filter(Boolean)
    if (!want.length || !want.some((v) => context.materialSet.has(v))) return false
  }

  if (Array.isArray(criteria.wheelSize) && criteria.wheelSize.length) {
    const want = criteria.wheelSize.map((v) => normalizeKey(v)).filter(Boolean)
    if (!want.length || !want.some((v) => context.wheelSizeSet.has(v))) return false
  }

  if (Array.isArray(criteria.drivetrain) && criteria.drivetrain.length) {
    const want = criteria.drivetrain.map((v) => normalizeKey(v)).filter(Boolean)
    if (!want.length || !want.some((v) => context.drivetrainSet.has(v))) return false
  }

  if (Array.isArray(criteria.condition) && criteria.condition.length) {
    const want = criteria.condition.map((v) => normalizeKey(v)).filter(Boolean)
    if (!want.length || !want.some((v) => context.conditionSet.has(v))) return false
  }

  if (Array.isArray(criteria.brake) && criteria.brake.length) {
    const want = criteria.brake.map((v) => normalizeKey(v)).filter(Boolean)
    if (!want.length || !want.some((v) => context.brakeSet.has(v))) return false
  }

  if (Array.isArray(criteria.transmissionType) && criteria.transmissionType.length) {
    const want = criteria.transmissionType.map((v) => normalizeKey(v)).filter(Boolean)
    if (!want.length || !want.some((v) => context.transmissionSet.has(v))) return false
  }

  if (Array.isArray(criteria.size) && criteria.size.length) {
    const want = criteria.size.map((v) => normalizeKey(v)).filter(Boolean)
    if (!want.length || !want.some((v) => context.sizesNormalized.has(v))) return false
  }

  if (Array.isArray(criteria.frameSize) && criteria.frameSize.length) {
    const want = criteria.frameSize.map((v) => normalizeKey(v)).filter(Boolean)
    if (!want.length || !want.some((v) => context.sizesNormalized.has(v))) return false
  }

  if (Array.isArray(criteria.location) && criteria.location.length) {
    const want = criteria.location.map((v) => normalizeKey(v)).filter(Boolean)
    if (!want.length || !want.some((v) => context.locationSet.has(v))) return false
  }

  if (Array.isArray(criteria.year) && criteria.year.length) {
    const want = criteria.year.map((v) => String(v).trim()).filter(Boolean)
    if (!want.length || !context.yearValue || !want.includes(context.yearValue)) return false
  }

  if (criteria.priceCur) {
    const cur = String(criteria.priceCur).trim().toUpperCase()
    if (cur && cur !== context.priceCurrency) return false
  }

  if (typeof criteria.priceMin === 'number' && Number.isFinite(criteria.priceMin)) {
    if (context.price < Number(criteria.priceMin)) return false
  }

  if (typeof criteria.priceMax === 'number' && Number.isFinite(criteria.priceMax)) {
    if (context.price > Number(criteria.priceMax)) return false
  }

  if (criteria.deal === '1' && !context.isDeal) return false
  if (criteria.store === '1' && !context.storeEnabled) return false
  if (criteria.bikes === '1' && context.category && !BIKE_CATEGORY_SET.has(context.category)) return false

  if (criteria.q && typeof criteria.q === 'string') {
    const needle = criteria.q.trim().toLowerCase()
    if (needle && !context.searchText.includes(needle)) return false
  }

  return true
}

function buildSavedSearchEmail({ listing, listingUrl, searchUrl, alertName, context }) {
  const priceLabel = formatCurrency(context.price, context.priceCurrency)
  const subject = alertName ? `Nuevo ingreso: ${alertName}` : 'Nuevo ingreso en Ciclo Market'
  const title = normalizeString(listing?.title) || normalizeString([listing?.brand, listing?.model, listing?.year].filter(Boolean).join(' ')) || 'Nuevo producto'
  const pieces = [
    `<strong>${title}</strong>`,
    priceLabel ? `Precio: ${priceLabel}` : null,
    context.category ? `Categoría: ${context.category}` : null,
    context.subcategory ? `Subcategoría: ${context.subcategory}` : null,
  ].filter(Boolean)

  const heroImage = context.firstImage ? `<img src="${context.firstImage}" alt="${title}" style="max-width:100%;border-radius:16px;margin:0 0 16px" />` : ''
  const searchLink = searchUrl ? `<a href="${searchUrl}" style="display:inline-block;margin:8px 0 0;font-size:14px;color:#0c72ff;text-decoration:underline;">Ver búsqueda guardada</a>` : ''

  const html = `
    <div style="font-family:'Inter','Segoe UI',sans-serif;background:#f4f6fb;padding:24px;">
      <div style="max-width:560px;margin:0 auto;background:#ffffff;border-radius:20px;padding:28px;box-shadow:0 15px 40px rgba(15,23,36,0.08);">
        <h1 style="font-size:20px;margin:0 0 12px;color:#14212e;">Encontramos algo que coincide con tu alerta${alertName ? ` “${alertName}”` : ''}</h1>
        <p style="margin:0 0 20px;color:#4b5563;">Revisá la publicación y contactá al vendedor si te interesa. Actualizamos las alertas apenas ingresan nuevas coincidencias.</p>
        ${heroImage}
        <div style="margin-bottom:24px;color:#1f2937;font-size:15px;line-height:1.6;">${pieces.join('<br />')}</div>
        <a href="${listingUrl}" style="display:inline-block;padding:12px 20px;border-radius:9999px;background:#0c72ff;color:#ffffff;text-decoration:none;font-weight:600;">Ver publicación</a>
        ${searchLink}
        <p style="margin:24px 0 0;font-size:12px;color:#9ca3af;">Si ya no querés recibir alertas podés desactivar o borrar la búsqueda desde tu cuenta en Ciclo Market.</p>
      </div>
    </div>
  `

  const textParts = [
    'Encontramos una publicación que coincide con tu búsqueda guardada.',
    title ? `Título: ${title}` : null,
    priceLabel ? `Precio: ${priceLabel}` : null,
    listingUrl ? `Ver publicación: ${listingUrl}` : null,
    searchUrl ? `Ver búsqueda: ${searchUrl}` : null,
  ].filter(Boolean)

  return { subject, html, text: textParts.join('\n') }
}

function buildSavedSearchDigestEmail({ alertName, matches, searchUrl, frontendBase }) {
  const subjectBase = 'Nuevos ingresos que coinciden con tu búsqueda'
  const subject = alertName ? `${subjectBase} “${alertName}”` : subjectBase

  const safeSearchUrl = searchUrl
    ? (searchUrl.startsWith('http') ? searchUrl : `${frontendBase}${searchUrl.startsWith('/') ? '' : '/'}${searchUrl.replace(/^\//, '')}`)
    : null

  const logoUrl = `${frontendBase}/site-logo.png`

  const toHtmlCell = ({ listing, context, listingUrl }) => {
    const title = normalizeString(listing?.title) || normalizeString([listing?.brand, listing?.model, listing?.year].filter(Boolean).join(' ')) || 'Publicación'
    const priceLabel = formatCurrency(context.price, context.priceCurrency) || ''
    const categoryLabel = context.category || ''
    const locationLabel = context.locationSet.size ? Array.from(context.locationSet)[0] : ''
    const storeBadge = context.storeEnabled
      ? '<span style="display:inline-block;margin-right:6px;padding:4px 8px;border-radius:999px;background:#0c72ff1a;color:#0c72ff;font-size:11px;font-weight:600;">Tienda oficial</span>'
      : ''
    const image = context.firstImage
      ? `<img src="${context.firstImage}" alt="${title.replace(/"/g, '&quot;')}" style="width:100%;height:180px;object-fit:cover;border-radius:14px 14px 0 0;" />`
      : `<div style="width:100%;height:180px;border-radius:14px 14px 0 0;background:#e2e8f0;display:flex;align-items:center;justify-content:center;color:#475569;font-weight:600;">Ciclo Market</div>`
    return `
      <td style="padding:10px;vertical-align:top;">
        <a href="${listingUrl}" style="display:block;border-radius:18px;background:#ffffff;overflow:hidden;text-decoration:none;color:#111827;box-shadow:0 12px 28px rgba(15,23,42,0.08);">
          ${image}
          <div style="padding:18px;">
            <div style="margin-bottom:8px;display:flex;align-items:center;flex-wrap:wrap;gap:6px;">
              ${storeBadge}
              <span style="display:inline-block;border-radius:999px;background:#f1f5f9;color:#1e293b;font-size:11px;font-weight:600;padding:4px 10px;">${categoryLabel || 'General'}</span>
            </div>
            <h3 style="margin:0 0 6px;font-size:17px;font-weight:700;color:#0f172a;line-height:1.35;">${title.replace(/</g, '&lt;')}</h3>
            ${priceLabel ? `<p style="margin:0 0 6px;font-size:16px;font-weight:700;color:#0c1723;">${priceLabel}</p>` : ''}
            <p style="margin:0 0 16px;font-size:13px;color:#475569;">${locationLabel || 'Ubicación coordinable con el vendedor'}</p>
            <span style="display:inline-block;padding:10px 16px;border-radius:12px;background:#0c72ff;color:#ffffff;font-size:13px;font-weight:600;">Ver detalles</span>
          </div>
        </a>
      </td>
    `
  }

  const rows = []
  for (let i = 0; i < matches.length; i += 2) {
    const slice = matches.slice(i, i + 2)
    const cells = slice.map(toHtmlCell)
    if (cells.length === 1) cells.push('<td style="padding:10px;"></td>')
    rows.push(`<tr>${cells.join('')}</tr>`)
  }

  const html = `
    <div style="font-family:'Inter','Segoe UI',sans-serif;background:#eef2f7;padding:32px 16px;">
      <div style="max-width:660px;margin:0 auto;background:#ffffff;border-radius:24px;overflow:hidden;box-shadow:0 24px 48px rgba(15,23,42,0.12);">
        <div style="padding:28px 24px;text-align:center;background:#f8fafc;">
          <img src="${logoUrl}" alt="Ciclo Market" style="height:56px;width:auto;margin-bottom:12px;" />
          <h1 style="margin:0;font-size:22px;color:#0f172a;">${subjectBase}</h1>
          ${alertName ? `<p style="margin:8px 0 0;font-size:14px;color:#475569;">Alerta: “${alertName.replace(/</g, '&lt;')}”</p>` : ''}
        </div>
        <div style="padding:24px;">
          <table role="presentation" width="100%" cellspacing="0" cellpadding="0">
            ${rows.join('')}
          </table>
          ${safeSearchUrl ? `
            <p style="margin:28px 0 0;text-align:center;">
              <a href="${safeSearchUrl}" style="display:inline-block;padding:12px 28px;border-radius:999px;background:#0c72ff;color:#ffffff;text-decoration:none;font-weight:600;">Ver más coincidencias</a>
            </p>` : ''}
          <p style="margin:32px 0 0;font-size:12px;color:#94a3b8;text-align:center;">¿Querés ajustar o desactivar esta alerta? Iniciá sesión en Ciclo Market y editá tus búsquedas guardadas.</p>
        </div>
      </div>
    </div>
  `

  const textItems = matches.map(({ listing, context, listingUrl }) => {
    const title = normalizeString(listing?.title) || normalizeString([listing?.brand, listing?.model, listing?.year].filter(Boolean).join(' ')) || listingUrl
    const priceLabel = formatCurrency(context.price, context.priceCurrency)
    const locationLabel = context.locationSet.size ? Array.from(context.locationSet)[0] : ''
    return [
      `• ${title}`,
      priceLabel ? `  Precio: ${priceLabel}` : null,
      context.category ? `  Categoría: ${context.category}` : null,
      locationLabel ? `  Ubicación: ${locationLabel}` : null,
      `  Ver: ${listingUrl}`,
    ].filter(Boolean).join('\n')
  })

  const textParts = [
    alertName ? `Nuevos ingresos para tu alerta “${alertName}”.` : subjectBase,
    ...textItems,
    safeSearchUrl ? `Ver todas las coincidencias: ${safeSearchUrl}` : null,
  ].filter(Boolean)

  return { subject, html, text: textParts.join('\n\n') }
}

module.exports = {
  resolveFrontendBaseUrl,
  formatCurrency,
  buildListingMatchContext,
  matchesSavedSearchCriteria,
  buildSavedSearchEmail,
  buildSavedSearchDigestEmail,
}
