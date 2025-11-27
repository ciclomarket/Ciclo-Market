const cron = require('node-cron')
const { getServerSupabaseClient } = require('../lib/supabaseClient')
const { sendMail, isMailConfigured } = require('../lib/mail')
const { buildListingCardHtml, buildListingCardText, escapeHtml, formatPrice } = require('../emails/listingCard')

const DEFAULT_TZ = 'America/Argentina/Buenos_Aires'
const DEFAULT_CRON = '30 10 * * 1' // lunes 10:30 semanal

const PLAN_CODE_ALIASES = {
  free: 'free',
  gratis: 'free',
  basic: 'basic',
  basica: 'basic',
  destacada: 'basic',
  featured: 'basic',
  premium: 'premium',
}

const SCENARIOS = {
  expired: { code: 'expired', cooldownHours: 168, maxPerRun: 100 },
  freeExpiring: { code: 'free_expiring', cooldownHours: 96, maxPerRun: 120 },
  paidExpiring: { code: 'paid_expiring', cooldownHours: 96, maxPerRun: 120 },
  highlight: { code: 'highlight_upsell', cooldownHours: 168, maxPerRun: 120 },
}

function canonicalPlanCode(value) {
  if (!value) return null
  const normalized = String(value)
    .toLowerCase()
    .normalize('NFD')
    .replace(/\p{Diacritic}/gu, '')
  return PLAN_CODE_ALIASES[normalized] || null
}

function coerceDate(input) {
  if (!input) return null
  const date = new Date(input)
  return Number.isFinite(date.getTime()) ? date : null
}

function differenceInDays(targetDate, referenceDate = new Date()) {
  if (!targetDate) return null
  const diffMs = targetDate.getTime() - referenceDate.getTime()
  return Math.floor(diffMs / (24 * 60 * 60 * 1000))
}

async function fetchSellerProfiles(supabase, sellerIds) {
  if (!sellerIds.length) return new Map()
  try {
    const { data, error } = await supabase
      .from('users')
      .select('id,email,full_name,store_enabled')
      .in('id', sellerIds)
    if (error) {
      console.warn('[marketingAutomations] no se pudieron obtener perfiles', error)
      return new Map()
    }
    const map = new Map()
    for (const row of data || []) {
      if (!row?.id) continue
      map.set(row.id, {
        email: typeof row.email === 'string' ? row.email.trim() : null,
        fullName: typeof row.full_name === 'string' ? row.full_name.trim() : null,
        storeEnabled: Boolean(row.store_enabled),
      })
    }
    return map
  } catch (err) {
    console.warn('[marketingAutomations] error inesperado al obtener perfiles', err)
    return new Map()
  }
}

async function fetchAutomationLogMap(supabase, scenarioCode, listingIds, cooldownHours) {
  if (!listingIds.length) return new Set()
  const sentAfter = new Date(Date.now() - cooldownHours * 60 * 60 * 1000).toISOString()
  try {
    const { data, error } = await supabase
      .from('marketing_automations')
      .select('listing_id')
      .eq('scenario', scenarioCode)
      .gte('sent_at', sentAfter)
      .in('listing_id', listingIds)
    if (error) {
      console.warn('[marketingAutomations] no se pudo consultar marketing_automations', error)
      return new Set()
    }
    return new Set((data || []).map((row) => row?.listing_id).filter(Boolean))
  } catch (err) {
    // Tabla inexistente u otros errores: loggear pero continuar sin bloquear
    console.warn('[marketingAutomations] error al consultar tabla de logs', err?.message || err)
    return new Set()
  }
}

async function recordAutomationLog(supabase, scenarioCode, listingId, sellerId, email) {
  try {
    const payload = {
      scenario: scenarioCode,
      listing_id: listingId,
      seller_id: sellerId ?? null,
      email_to: email ?? null,
    }
    const { error } = await supabase
      .from('marketing_automations')
      .insert(payload)
    if (error) {
      console.warn('[marketingAutomations] no se pudo registrar marketing_automations', error, payload)
    }
  } catch (err) {
    console.warn('[marketingAutomations] error inesperado al registrar log', err)
  }
}

function listingHasPlan(listing, codes) {
  const values = [listing?.plan, listing?.plan_code, listing?.seller_plan]
  for (const raw of values) {
    const canonical = canonicalPlanCode(raw)
    if (canonical && codes.includes(canonical)) return true
  }
  return false
}

function buildEmailLayout({ baseFront, title, introHtml, bodyHtml, extraFooterHtml }) {
  const cleanBase = (baseFront || 'https://www.ciclomarket.ar').replace(/\/$/, '')
  const bikesUrl = `${cleanBase}/marketplace`
  const partsUrl = `${cleanBase}/marketplace?cat=Accesorios`
  const apparelUrl = `${cleanBase}/marketplace?cat=Indumentaria`
  const logoUrl = `${cleanBase}/site-logo.png`

  return `
    <div style="background:#f2f4f8;margin:0;padding:0;font-family:Arial, sans-serif;color:#0c1723">
      <table role="presentation" cellspacing="0" cellpadding="0" border="0" align="center" style="width:100%;max-width:680px;margin:0 auto">
        <tr>
          <td style="padding:24px;text-align:center;">
            <img src="${logoUrl}" alt="Ciclo Market" style="height:60px;width:auto;display:inline-block" />
          </td>
        </tr>
        <tr>
          <td style="padding:0 24px 12px">
            <table role="presentation" width="100%" cellspacing="0" cellpadding="0" style="background:#14212e;border-radius:14px;overflow:hidden">
              <tr>
                <td style="padding:10px 16px;text-align:center">
                  <a href="${bikesUrl}" style="color:#fff;text-decoration:none;font-size:14px;margin:0 12px">Bicicletas</a>
                  <a href="${partsUrl}" style="color:#fff;text-decoration:none;font-size:14px;margin:0 12px">Accesorios</a>
                  <a href="${apparelUrl}" style="color:#fff;text-decoration:none;font-size:14px;margin:0 12px">Indumentaria</a>
                </td>
              </tr>
            </table>
          </td>
        </tr>
        <tr>
          <td style="background:#fff;border-radius:20px;padding:28px 32px">
            <h1 style="margin:0 0 12px;font-size:22px;font-weight:700;color:#0c1723">${title}</h1>
            <div style="font-size:15px;line-height:1.6;color:#334155">
              ${introHtml}
              ${bodyHtml}
            </div>
          </td>
        </tr>
        <tr>
          <td style="padding:20px 24px 32px;color:#64748b;font-size:12px;text-align:center">
            ${extraFooterHtml || ''}
            <div style="margin-top:12px">© ${new Date().getFullYear()} Ciclo Market</div>
          </td>
        </tr>
      </table>
    </div>
  `
}

function buildExpiredEmail({ listing, profile, baseFront }) {
  const cleanBase = (baseFront || 'https://www.ciclomarket.ar').replace(/\/$/, '')
  const dashboardUrl = `${cleanBase}/dashboard?tab=${encodeURIComponent('Publicaciones')}`

  const html = `
<div style="background:#eff3f8;margin:0;padding:0;font-family:Arial, sans-serif;color:#0f172a;">
  <table role="presentation" cellspacing="0" cellpadding="0" border="0" align="center" style="width:100%;max-width:680px;margin:0 auto;">
    <tr>
      <td style="padding:24px 24px 12px;text-align:center;">
        <img src="${cleanBase}/site-logo.png" alt="Ciclo Market" style="height:60px;width:auto;display:inline-block;" />
      </td>
    </tr>
    <tr>
      <td style="padding:0 24px 20px;">
        <table role="presentation" width="100%" cellspacing="0" cellpadding="0" style="background:#14212e;border-radius:999px;overflow:hidden;">
          <tr>
            <td style="padding:10px 16px;text-align:center;">
              <a href="${cleanBase}/marketplace?bikes=1" style="color:#e5e7eb;text-decoration:none;font-size:13px;margin:0 10px;">Bicicletas</a>
              <a href="${cleanBase}/marketplace?cat=Accesorios" style="color:#e5e7eb;text-decoration:none;font-size:13px;margin:0 10px;">Accesorios</a>
              <a href="${cleanBase}/marketplace?cat=Indumentaria" style="color:#e5e7eb;text-decoration:none;font-size:13px;margin:0 10px;">Indumentaria</a>
              <a href="${cleanBase}/marketplace?cat=Nutrici%C3%B3n" style="color:#e5e7eb;text-decoration:none;font-size:13px;margin:0 10px;">Nutrición</a>
            </td>
          </tr>
        </table>
      </td>
    </tr>
    <tr>
      <td style="padding:0 24px 32px;">
        <table role="presentation" width="100%" cellspacing="0" cellpadding="0" style="border-radius:20px;overflow:hidden;background:#ffffff;">
          <tr>
            <td style="background:#14212e;height:4px;"></td>
          </tr>
          <tr>
            <td style="padding:18px 24px 0;background:#ffffff;">
              <div style="display:inline-block;padding:4px 10px;border-radius:999px;background:#fef3c7;color:#b45309;font-size:11px;font-weight:600;text-transform:uppercase;letter-spacing:0.05em;">
                Tu aviso fue pausado automáticamente
              </div>
            </td>
          </tr>
          <tr>
            <td style="background:#ffffff;padding:16px 24px 8px;">
              <h1 style="margin:0 0 10px;font-size:22px;font-weight:700;color:#0f172a;">
                Tu publicación venció (pero podés renovarla en 1 clic)
              </h1>
              <div style="font-size:14px;line-height:1.7;color:#334155;">
                <p style="margin:0 0 10px;">Hola ${escapeHtml(profile?.fullName || 'vendedor')},</p>
                <p style="margin:0 0 10px;">
                  Tu publicación <strong>${escapeHtml(listing.title)}</strong> llegó a la fecha de vencimiento y la
                  <strong>pausamos automáticamente</strong> para que no siga apareciendo en el marketplace si la bici ya se vendió.
                </p>
                <p style="margin:0 0 18px;">
                  Si todavía la tenés disponible, podés <strong>renovarla desde tu panel</strong> y aprovechar para elegir un
                  plan Básico o Premium para ganar visibilidad extra.
                </p>
              </div>
            </td>
          </tr>
          <tr>
            <td style="background:#ffffff;padding:0 24px 12px;">
              ${buildListingCardHtml(listing, cleanBase)}
            </td>
          </tr>
          <tr>
            <td style="background:#ffffff;padding:4px 24px 20px;text-align:center;">
              <a href="${dashboardUrl}"
                 style="display:inline-block;padding:12px 22px;background:#14212e;color:#ffffff;text-decoration:none;border-radius:999px;font-weight:600;font-size:14px;margin:4px 6px;">
                Ir al panel y renovar
              </a>
            </td>
          </tr>
          <tr>
            <td style="background:#ffffff;padding:0 24px 22px;">
              <div style="margin:0;padding:16px 16px 14px;border:1px solid #e2e8f0;border-radius:16px;background:#f8fafc;">
                <div style="margin:0 0 8px;font-size:15px;color:#0f172a;font-weight:700;">
                  ¿Por qué renovar y mejorar tu plan?
                </div>
                <ul style="margin:0;padding-left:18px;color:#475569;font-size:13px;line-height:1.6;">
                  <li style="margin-bottom:6px;">
                    <strong>Plan Básico</strong>: publicación por 60 días, botón de WhatsApp y prioridad en listados.
                  </li>
                  <li style="margin-bottom:6px;">
                    <strong>Plan Premium</strong>: todo lo anterior + destaque extendido, difusión en redes y soporte prioritario.
                  </li>
                  <li>
                    Más exposición = más consultas de ciclistas reales y mejores chances de cerrar la venta.
                  </li>
                </ul>
              </div>
            </td>
          </tr>
          <tr>
            <td style="background:#ffffff;padding:0 24px 24px;border-top:1px solid #e5ebf3;">
              <div style="padding-top:16px;">
                <div style="font-size:14px;font-weight:700;color:#0f172a;margin:0 0 6px;">
                  ¿Por qué Ciclo Market es la mejor opción para vender tu bici?
                </div>
                <ul style="margin:0;padding-left:18px;font-size:12px;color:#64748b;line-height:1.6;">
                  <li style="margin-bottom:4px;">Comunidad 100% ciclista: tu anuncio llega a gente que realmente pedalea.</li>
                  <li style="margin-bottom:4px;">Herramientas pensadas para bicicletas usadas y tiendas oficiales.</li>
                  <li>Contacto directo con compradores por WhatsApp y mensajes internos.</li>
                </ul>
              </div>
            </td>
          </tr>
          <tr>
            <td style="padding:16px 24px 22px;color:#94a3b8;font-size:11px;text-align:center;background:#ffffff;">
              <p style="margin:0 0 6px;">
                Podés actualizar tus preferencias desde
                <a href="${cleanBase}/dashboard?tab=${encodeURIComponent('Perfil')}" style="color:#64748b;text-decoration:underline;">tu perfil</a>.
              </p>
              <p style="margin:0 0 4px;">
                Instagram:
                <a href="https://www.instagram.com/ciclomarket.ar" style="color:#64748b;text-decoration:none;">@ciclomarket.ar</a>
                &nbsp;·&nbsp;
                LinkedIn:
                <a href="https://www.linkedin.com/company/ciclo-market" style="color:#64748b;text-decoration:none;">Ciclo Market</a>
              </p>
              <p style="margin:4px 0 0;">
                © ${new Date().getFullYear()} Ciclo Market
              </p>
            </td>
          </tr>
        </table>
      </td>
    </tr>
  </table>
</div>
`

  const text = [
    `Hola ${profile?.fullName || 'vendedor'},`,
    `Tu publicación "${listing.title}" venció y la pausamos.`,
    `Renová desde tu panel: ${dashboardUrl}`,
    buildListingCardText(listing, cleanBase),
    'Beneficios:',
    '- Plan Básico: 60 días, WhatsApp y prioridad.',
    '- Plan Premium: destaque extendido y difusión.',
  ].join('\n')

  return {
    subject: `Tu publicación "${listing.title}" venció – reactivala cuando quieras`,
    html,
    text,
  }
}

function buildFreeExpiringEmail({ listing, profile, baseFront, daysLeft }) {
  const cleanBase = (baseFront || 'https://www.ciclomarket.ar').replace(/\/$/, '')
  const dashboardUrl = `${cleanBase}/dashboard?tab=${encodeURIComponent('Publicaciones')}`
  const plural = daysLeft === 1 ? 'día' : 'días'
  const html = `
<div style="background:#eff3f8;margin:0;padding:0;font-family:Arial, sans-serif;color:#0f172a;">
  <table role="presentation" cellspacing="0" cellpadding="0" border="0" align="center" style="width:100%;max-width:680px;margin:0 auto;">
    <tr>
      <td style="padding:24px 24px 12px;text-align:center;">
        <img src="${cleanBase}/site-logo.png" alt="Ciclo Market" style="height:60px;width:auto;display:inline-block;" />
      </td>
    </tr>
    <tr>
      <td style="padding:0 24px 20px;">
        <table role="presentation" width="100%" cellspacing="0" cellpadding="0"
               style="background:#14212e;border-radius:999px;overflow:hidden;">
          <tr>
            <td style="padding:10px 16px;text-align:center;">
              <a href="${cleanBase}/marketplace?bikes=1" style="color:#e5e7eb;text-decoration:none;font-size:13px;margin:0 10px;">Bicicletas</a>
              <a href="${cleanBase}/marketplace?cat=Accesorios" style="color:#e5e7eb;text-decoration:none;font-size:13px;margin:0 10px;">Accesorios</a>
              <a href="${cleanBase}/marketplace?cat=Indumentaria" style="color:#e5e7eb;text-decoration:none;font-size:13px;margin:0 10px;">Indumentaria</a>
              <a href="${cleanBase}/marketplace?cat=Nutrici%C3%B3n" style="color:#e5e7eb;text-decoration:none;font-size:13px;margin:0 10px;">Nutrición</a>
            </td>
          </tr>
        </table>
      </td>
    </tr>
    <tr>
      <td style="padding:0 24px 32px;">
        <table role="presentation" width="100%" cellspacing="0" cellpadding="0"
               style="border-radius:20px;overflow:hidden;background:#ffffff;">
          <tr>
            <td style="background:#14212e;height:4px;"></td>
          </tr>
          <tr>
            <td style="padding:18px 24px 0;background:#ffffff;">
              <div style="display:inline-block;padding:4px 10px;border-radius:999px;background:#dbeafe;color:#1e40af;font-size:11px;font-weight:600;text-transform:uppercase;letter-spacing:0.05em;">
                Tu plan Gratis está por vencer
              </div>
            </td>
          </tr>
          <tr>
            <td style="background:#ffffff;padding:16px 24px 8px;">
              <h1 style="margin:0 0 10px;font-size:22px;font-weight:700;color:#0f172a;">
                Tu plan Gratis vence en ${daysLeft} ${plural}
              </h1>

              <div style="font-size:14px;line-height:1.7;color:#334155;">
                <p style="margin:0 0 10px;">Hola ${escapeHtml(profile?.fullName || 'vendedor')},</p>

                <p style="margin:0 0 10px;">
                  Tu publicación <strong>${escapeHtml(listing.title)}</strong> está en plan Gratis y vence en
                  <strong>${daysLeft} ${plural}</strong>.
                </p>

                <p style="margin:0 0 18px;">
                  Mejorando al plan <strong>Básico</strong> o <strong>Premium</strong> triplicás tus chances de venta, activás
                  el botón de WhatsApp y extendés la duración a <strong>60 días</strong>.
                </p>
              </div>
            </td>
          </tr>
          <tr>
            <td style="background:#ffffff;padding:0 24px 12px;">
              ${buildListingCardHtml(listing, cleanBase)}
            </td>
          </tr>
          <tr>
            <td style="background:#ffffff;padding:4px 24px 20px;text-align:center;">
              <a href="${dashboardUrl}"
                 style="display:inline-block;padding:12px 22px;background:#14212e;color:#ffffff;text-decoration:none;border-radius:999px;font-weight:600;font-size:14px;margin:4px 6px;">
                Renovar desde el panel
              </a>
            </td>
          </tr>
          <tr>
            <td style="background:#ffffff;padding:0 24px 22px;">
              <div style="margin:0;padding:16px 16px 14px;border:1px solid #e2e8f0;border-radius:16px;background:#f8fafc;">
                <div style="margin:0 0 8px;font-size:15px;color:#0f172a;font-weight:700;">
                  Ventajas de mejorar tu plan
                </div>
                <ul style="margin:0;padding-left:18px;color:#475569;font-size:13px;line-height:1.6;">
                  <li style="margin-bottom:6px;">Botón de WhatsApp para responder al instante.</li>
                  <li style="margin-bottom:6px;">Publicación activa durante 60 días.</li>
                  <li style="margin-bottom:6px;">Mejor posición en la categoría y más exposición.</li>
                  <li>Más consultas = más chances de cerrar la venta.</li>
                </ul>
              </div>
            </td>
          </tr>
          <tr>
            <td style="background:#ffffff;padding:0 24px 24px;border-top:1px solid #e5ebf3;">
              <div style="padding-top:16px;">
                <div style="font-size:14px;font-weight:700;color:#0f172a;margin:0 0 6px;">
                  ¿Por qué publicar en Ciclo Market?
                </div>
                <ul style="margin:0;padding-left:18px;font-size:12px;color:#64748b;line-height:1.6;">
                  <li style="margin-bottom:4px;">Público 100% ciclista: compradores reales buscando bicicletas reales.</li>
                  <li style="margin-bottom:4px;">Tu anuncio no compite contra muebles ni autos.</li>
                  <li>Contacto directo con compradores por WhatsApp y mensajes internos.</li>
                </ul>
              </div>
            </td>
          </tr>
          <tr>
            <td style="padding:16px 24px 22px;color:#94a3b8;font-size:11px;text-align:center;background:#ffffff;">
              <p style="margin:0 0 6px;">
                Ver planes disponibles:
                <a href="${cleanBase}/publicar?type=bike" style="color:#64748b;text-decoration:underline;">Ver planes</a>
              </p>

              <p style="margin:0 0 4px;">
                Instagram:
                <a href="https://www.instagram.com/ciclomarket.ar" style="color:#64748b;text-decoration:none;">@ciclomarket.ar</a>
                &nbsp;·&nbsp;
                LinkedIn:
                <a href="https://www.linkedin.com/company/ciclo-market" style="color:#64748b;text-decoration:none;">Ciclo Market</a>
              </p>

              <p style="margin:4px 0 0;">
                © ${new Date().getFullYear()} Ciclo Market
              </p>
            </td>
          </tr>

        </table>
      </td>
    </tr>
  </table>
</div>
`

  const text = [
    `Hola ${profile?.fullName || 'vendedor'},`,
    `Tu publicación "${listing.title}" vence en ${daysLeft} ${plural}.`,
    `Abrí tu panel para renovarla o hacer upgrade: ${dashboardUrl}`,
    buildListingCardText(listing, cleanBase),
    'Beneficios: WhatsApp activo, 60 días de duración, más exposición.',
  ].join('\n')

  return {
    subject: `Tu publicación vence en ${daysLeft} ${plural} – activá WhatsApp y 60 días extras`,
    html,
    text,
  }
}

function buildPaidExpiringEmail({ listing, profile, baseFront, daysLeft }) {
  const cleanBase = (baseFront || 'https://www.ciclomarket.ar').replace(/\/$/, '')
  const dashboardUrl = `${cleanBase}/dashboard?tab=${encodeURIComponent('Publicaciones')}`
  const plural = daysLeft === 1 ? 'día' : 'días'
  const canonical = canonicalPlanCode(listing?.plan || listing?.plan_code || listing?.seller_plan)
  const planName = canonical === 'premium' ? 'Plan Premium' : 'Plan Básico'

  const html = `
<div style="background:#eff3f8;margin:0;padding:0;font-family:Arial, sans-serif;color:#0f172a;">
  <table role="presentation" cellspacing="0" cellpadding="0" border="0" align="center" style="width:100%;max-width:680px;margin:0 auto;">
    <tr>
      <td style="padding:24px 24px 12px;text-align:center;">
        <img src="${cleanBase}/site-logo.png" alt="Ciclo Market" style="height:60px;width:auto;display:inline-block;" />
      </td>
    </tr>
    <tr>
      <td style="padding:0 24px 20px;">
        <table role="presentation" width="100%" cellspacing="0" cellpadding="0"
               style="background:#14212e;border-radius:999px;overflow:hidden;">
          <tr>
            <td style="padding:10px 16px;text-align:center;">
              <a href="${cleanBase}/marketplace?bikes=1" style="color:#e5e7eb;text-decoration:none;font-size:13px;margin:0 10px;">Bicicletas</a>
              <a href="${cleanBase}/marketplace?cat=Accesorios" style="color:#e5e7eb;text-decoration:none;font-size:13px;margin:0 10px;">Accesorios</a>
              <a href="${cleanBase}/marketplace?cat=Indumentaria" style="color:#e5e7eb;text-decoration:none;font-size:13px;margin:0 10px;">Indumentaria</a>
              <a href="${cleanBase}/marketplace?cat=Nutrici%C3%B3n" style="color:#e5e7eb;text-decoration:none;font-size:13px;margin:0 10px;">Nutrición</a>
            </td>
          </tr>
        </table>
      </td>
    </tr>
    <tr>
      <td style="padding:0 24px 32px;">
        <table role="presentation" width="100%" cellspacing="0" cellpadding="0"
               style="border-radius:20px;overflow:hidden;background:#ffffff;">
          <tr>
            <td style="background:#14212e;height:4px;"></td>
          </tr>
          <tr>
            <td style="padding:18px 24px 0;background:#ffffff;">
              <div style="display:inline-block;padding:4px 10px;border-radius:999px;background:#fee2e2;color:#b91c1c;font-size:11px;font-weight:600;text-transform:uppercase;letter-spacing:0.05em;">
                ${planName} vence en breve
              </div>
            </td>
          </tr>
          <tr>
            <td style="background:#ffffff;padding:16px 24px 8px;">
              <h1 style="margin:0 0 10px;font-size:22px;font-weight:700;color:#0f172a;">
                Tu publicación vence en ${daysLeft} ${plural}
              </h1>

              <div style="font-size:14px;line-height:1.7;color:#334155;">
                <p style="margin:0 0 10px;">Hola ${escapeHtml(profile?.fullName || 'vendedor')},</p>

                <p style="margin:0 0 10px;">
                  El ${planName} de <strong>${escapeHtml(listing.title)}</strong> vence en
                  <strong>${daysLeft} ${plural}</strong>. Si querés que siga visible, renovalo ahora para mantener WhatsApp activo y la prioridad en listados.
                </p>

                <p style="margin:0 0 18px;">
                  Renovar a tiempo evita que tu aviso se pause y te permite seguir aprovechando la visibilidad extra y el destaque incluido en tu plan.
                </p>
              </div>
            </td>
          </tr>
          <tr>
            <td style="background:#ffffff;padding:0 24px 12px;">
              ${buildListingCardHtml(listing, cleanBase)}
            </td>
          </tr>
          <tr>
            <td style="background:#ffffff;padding:4px 24px 20px;text-align:center;">
              <a href="${dashboardUrl}"
                 style="display:inline-block;padding:12px 22px;background:#14212e;color:#ffffff;text-decoration:none;border-radius:999px;font-weight:600;font-size:14px;margin:4px 6px;">
                Renovar publicación
              </a>
            </td>
          </tr>
          <tr>
            <td style="background:#ffffff;padding:0 24px 22px;">
              <div style="margin:0;padding:16px 16px 14px;border:1px solid #e2e8f0;border-radius:16px;background:#f8fafc;">
                <div style="margin:0 0 8px;font-size:15px;color:#0f172a;font-weight:700;">
                  Recordá lo que incluye tu plan
                </div>
                <ul style="margin:0;padding-left:18px;color:#475569;font-size:13px;line-height:1.6;">
                  <li style="margin-bottom:6px;">WhatsApp directo para cerrar ventas sin fricción.</li>
                  <li style="margin-bottom:6px;">60 días de publicación activa y prioridad en listados.</li>
                  <li style="margin-bottom:6px;">${canonical === 'premium' ? '14 días de destaque y difusión extra en redes.' : '7 días de destaque para posicionarte mejor.'}</li>
                  <li>Seguimiento y soporte del equipo de Ciclo Market cuando lo necesites.</li>
                </ul>
              </div>
            </td>
          </tr>
          <tr>
            <td style="background:#ffffff;padding:0 24px 24px;border-top:1px solid #e5ebf3;">
              <div style="padding-top:16px;">
                <div style="font-size:14px;font-weight:700;color:#0f172a;margin:0 0 6px;">
                  Aprovechá el impulso de Ciclo Market
                </div>
                <ul style="margin:0;padding-left:18px;font-size:12px;color:#64748b;line-height:1.6;">
                  <li style="margin-bottom:4px;">Seguís apareciendo primero frente a otros avisos similares.</li>
                  <li style="margin-bottom:4px;">La insignia de destaque le da confianza extra a los compradores.</li>
                  <li>Los recordatorios automáticos te ayudan a responder más rápido.</li>
                </ul>
              </div>
            </td>
          </tr>
          <tr>
            <td style="padding:16px 24px 22px;color:#94a3b8;font-size:11px;text-align:center;background:#ffffff;">
              <p style="margin:0 0 6px;">
                ¿Necesitás ayuda con la renovación? Escribinos a
                <a href="mailto:hola@ciclomarket.ar" style="color:#64748b;text-decoration:underline;">hola@ciclomarket.ar</a>.
              </p>

              <p style="margin:0 0 4px;">
                Instagram:
                <a href="https://www.instagram.com/ciclomarket.ar" style="color:#64748b;text-decoration:none;">@ciclomarket.ar</a>
                &nbsp;·&nbsp;
                LinkedIn:
                <a href="https://www.linkedin.com/company/ciclo-market" style="color:#64748b;text-decoration:none;">Ciclo Market</a>
              </p>

              <p style="margin:4px 0 0;">
                © ${new Date().getFullYear()} Ciclo Market
              </p>
            </td>
          </tr>
        </table>
      </td>
    </tr>
  </table>
</div>
`

  const text = [
    `Hola ${profile?.fullName || 'vendedor'},`,
    `El ${planName} de "${listing.title}" vence en ${daysLeft} ${plural}.`,
    `Renová desde tu panel: ${dashboardUrl}`,
    buildListingCardText(listing, cleanBase),
    'Recordá: WhatsApp activo, 60 días vigentes y destaque incluido.',
  ].join('\n')

  return {
    subject: `Tu publicación vence en ${daysLeft} ${plural} – renová tu ${planName}`,
    html,
    text,
  }
}

function buildHighlightEmail({ listing, profile, baseFront }) {
  const cleanBase = (baseFront || 'https://www.ciclomarket.ar').replace(/\/$/, '')
  const highlightUrl = `${cleanBase}/listing/${encodeURIComponent(listing.slug || listing.id)}/destacar`
  const option7 = `${highlightUrl}?utm_source=crm&utm_medium=email&utm_campaign=highlight&utm_content=7`
  const option14 = `${highlightUrl}?utm_source=crm&utm_medium=email&utm_campaign=highlight&utm_content=14`
  const html = `
<div style="background:#eff3f8;margin:0;padding:0;font-family:Arial, sans-serif;color:#0f172a">
  <table role="presentation" cellspacing="0" cellpadding="0" border="0" align="center" style="width:100%;max-width:680px;margin:0 auto">
    <tr>
      <td style="padding:24px 24px 12px;text-align:center;">
        <img src="${cleanBase}/site-logo.png" alt="Ciclo Market" style="height:60px;width:auto;display:inline-block;" />
      </td>
    </tr>
    <tr>
      <td style="padding:0 24px 20px;">
        <table role="presentation" width="100%" cellspacing="0" cellpadding="0" style="background:#14212e;border-radius:999px;overflow:hidden;">
          <tr>
            <td style="padding:10px 16px;text-align:center;">
              <a href="${cleanBase}/marketplace?bikes=1" style="color:#e5e7eb;text-decoration:none;font-size:13px;margin:0 10px;">Bicicletas</a>
              <a href="${cleanBase}/marketplace?cat=Accesorios" style="color:#e5e7eb;text-decoration:none;font-size:13px;margin:0 10px;">Accesorios</a>
              <a href="${cleanBase}/marketplace?cat=Indumentaria" style="color:#e5e7eb;text-decoration:none;font-size:13px;margin:0 10px;">Indumentaria</a>
              <a href="${cleanBase}/marketplace?cat=Nutrici%C3%B3n" style="color:#e5e7eb;text-decoration:none;font-size:13px;margin:0 10px;">Nutrición</a>
            </td>
          </tr>
        </table>
      </td>
    </tr>
    <tr>
      <td style="padding:0 24px 32px;">
        <table role="presentation" width="100%" cellspacing="0" cellpadding="0" style="border-radius:20px;overflow:hidden;background:#ffffff;">
          <tr>
            <td style="background:#14212e;height:4px;"></td>
          </tr>
          <tr>
            <td style="padding:18px 24px 0;background:#ffffff;">
              <div style="display:inline-block;padding:4px 10px;border-radius:999px;background:#e5efff;color:#1d4ed8;font-size:11px;font-weight:600;text-transform:uppercase;letter-spacing:0.05em;">
                Tu bici está activa, pero sin destaque
              </div>
            </td>
          </tr>
          <tr>
            <td style="background:#ffffff;padding:16px 24px 8px;">
              <h1 style="margin:0 0 10px;font-size:22px;font-weight:700;color:#0f172a;">
                Destacá tu publicación y vendé más rápido
              </h1>
              <div style="font-size:14px;line-height:1.7;color:#334155;">
                <p style="margin:0 0 10px;">Hola ${escapeHtml(profile?.fullName || 'vendedor')},</p>
                <p style="margin:0 0 10px;">
                  Tu publicación <strong>${escapeHtml(listing.title)}</strong> está activa, pero todavía
                  <strong>no cuenta con destaque</strong>. Al destacarla, ganás visibilidad inmediata frente a otros avisos similares.
                </p>
                <p style="margin:0 0 18px;">
                  Mientras está destacada, tu anuncio sube al top de la categoría y aparece con una etiqueta visual que mejora el click-through-rate (CTR).
                </p>
              </div>
            </td>
          </tr>
          <tr>
            <td style="background:#ffffff;padding:0 24px 12px;">
              ${buildListingCardHtml(listing, cleanBase)}
            </td>
          </tr>
          <tr>
            <td style="background:#ffffff;padding:4px 24px 20px;text-align:center;">
              <a href="${option7}" style="display:inline-block;padding:12px 18px;background:#14212e;color:#ffffff;text-decoration:none;border-radius:999px;font-weight:600;font-size:14px;margin:4px 6px;">
                Destacar 7 días · $ 3.000
              </a>
              <a href="${option14}" style="display:inline-block;padding:12px 18px;background:#1d4ed8;color:#ffffff;text-decoration:none;border-radius:999px;font-weight:600;font-size:14px;margin:4px 6px;">
                Destacar 14 días · $ 5.000
              </a>
            </td>
          </tr>
          <tr>
            <td style="background:#ffffff;padding:0 24px 22px;">
              <div style="margin:0;padding:16px 16px 14px;border:1px solid #e2e8f0;border-radius:16px;background:#f8fafc;">
                <div style="margin:0 0 8px;font-size:15px;color:#0f172a;font-weight:700;">
                  Ventajas de destacar tu bici en Ciclo Market
                </div>
                <ul style="margin:0;padding-left:18px;color:#475569;font-size:13px;line-height:1.6;">
                  <li style="margin-bottom:6px;">Tu aviso aparece antes en la categoría y en búsquedas relevantes.</li>
                  <li style="margin-bottom:6px;">Recibe una insignia “Destacado” y diseño especial que llama la atención.</li>
                  <li style="margin-bottom:6px;">Mejora la tasa de consultas y acelera el tiempo hasta la venta.</li>
                </ul>
              </div>
            </td>
          </tr>
          <tr>
            <td style="background:#ffffff;padding:0 24px 24px;border-top:1px solid #e5ebf3;">
              <div style="padding-top:16px;">
                <div style="font-size:14px;font-weight:700;color:#0f172a;margin:0 0 6px;">
                  ¿Por qué Ciclo Market es la mejor opción?
                </div>
                <ul style="margin:0;padding-left:18px;font-size:12px;color:#64748b;line-height:1.6;">
                  <li style="margin-bottom:4px;">Comunidad 100% ciclista: tus avisos no compiten contra muebles o autos.</li>
                  <li style="margin-bottom:4px;">Herramientas pensadas para vender bicicletas usadas y de tiendas oficiales.</li>
                  <li>Contacto directo con compradores reales por WhatsApp y mensajes internos.</li>
                </ul>
              </div>
            </td>
          </tr>
          <tr>
            <td style="padding:16px 24px 22px;color:#94a3b8;font-size:11px;text-align:center;background:#ffffff;">
              <p style="margin:0 0 6px;">
                ¿Tenés dudas sobre el destaque? Encontrá más info en
                <a href="${cleanBase}/ayuda#destacar" style="color:#64748b;text-decoration:underline;">Centro de ayuda</a>.
              </p>
              <p style="margin:0 0 4px;">
                Instagram:
                <a href="https://www.instagram.com/ciclomarket.ar" style="color:#64748b;text-decoration:none;">@ciclomarket.ar</a>
                &nbsp;·&nbsp;
                LinkedIn:
                <a href="https://www.linkedin.com/company/ciclo-market" style="color:#64748b;text-decoration:none;">Ciclo Market</a>
              </p>
              <p style="margin:4px 0 0;">
                © ${new Date().getFullYear()} Ciclo Market
              </p>
            </td>
          </tr>
        </table>
      </td>
    </tr>
  </table>
</div>
`

  const text = [
    `Hola ${profile?.fullName || 'vendedor'},`,
    `Destacá "${listing.title}" para ganar visibilidad.`,
    `Destacar 7 días ($3.000): ${option7}`,
    `Destacar 14 días ($5.000): ${option14}`,
    buildListingCardText(listing, cleanBase),
  ].join('\n')

  return {
    subject: `Destacá "${listing.title}" por 7 o 14 días`,
    html,
    text,
  }
}

async function fetchExpiredListings(supabase, limit) {
  const now = new Date()
  const nowIso = now.toISOString()
  const lowerBoundIso = new Date(now.getTime() - 14 * 24 * 60 * 60 * 1000).toISOString()
  const { data, error } = await supabase
    .from('listings')
    .select('id,seller_id,title,price,price_currency,images,plan,plan_code,seller_plan,status,slug,expires_at,highlight_expires,location,seller_location')
    // Considerar vencidas por status=expired o por fecha vencida
    .or(`status.eq.expired,expires_at.lte.${nowIso}`)
    // Nunca incluir SOLD ni DELETED
    .neq('status', 'sold')
    .neq('status', 'deleted')
    .not('seller_id', 'is', null)
    // Ventana: últimos 14 días desde el vencimiento
    .not('expires_at', 'is', null)
    .gte('expires_at', lowerBoundIso)
    .lte('expires_at', nowIso)
    .order('expires_at', { ascending: false, nullsLast: false })
    .limit(limit)
  if (error) {
    console.warn('[marketingAutomations] error consultando publicaciones vencidas', error)
    return []
  }
  return (data || []).filter((row) => row?.id && row?.seller_id)
}

async function fetchFreeListingsExpiring(supabase, limit) {
  const now = new Date()
  const windowEnd = new Date(now.getTime() + 7 * 24 * 60 * 60 * 1000).toISOString()
  const { data, error } = await supabase
    .from('listings')
    .select('id,seller_id,title,price,price_currency,images,plan,plan_code,seller_plan,status,slug,expires_at,highlight_expires,location,seller_location')
    .in('status', ['active','published'])
    .or('plan.eq.free,plan_code.eq.free,seller_plan.eq.free')
    .not('expires_at', 'is', null)
    .lte('expires_at', windowEnd)
    .order('expires_at', { ascending: true })
    .limit(limit)
  if (error) {
    console.warn('[marketingAutomations] error consultando publicaciones free', error)
    return []
  }
  return (data || []).filter((row) => row?.id && row?.seller_id)
}

async function fetchPaidListingsExpiring(supabase, limit) {
  const now = new Date()
  const windowEnd = new Date(now.getTime() + 7 * 24 * 60 * 60 * 1000).toISOString()
  const { data, error } = await supabase
    .from('listings')
    .select(
      'id,seller_id,title,price,price_currency,images,plan,plan_code,seller_plan,status,slug,expires_at,highlight_expires,location,seller_location',
    )
    .in('status', ['active', 'published'])
    .or(
      'plan.eq.basic,plan.eq.premium,plan_code.eq.basic,plan_code.eq.premium,seller_plan.eq.basic,seller_plan.eq.premium',
    )
    .not('expires_at', 'is', null)
    .lte('expires_at', windowEnd)
    .order('expires_at', { ascending: true })
    .limit(limit)
  if (error) {
    console.warn('[marketingAutomations] error consultando publicaciones pagas', error)
    return []
  }
  return (data || []).filter((row) => row?.id && row?.seller_id)
}

async function fetchListingsWithoutHighlight(supabase, limit) {
  const { data, error } = await supabase
    .from('listings')
    .select('id,seller_id,title,price,price_currency,images,plan,plan_code,seller_plan,status,slug,expires_at,highlight_expires,location,seller_location,created_at')
    .in('status', ['active','published'])
    .order('created_at', { ascending: false, nullsLast: false })
    .limit(limit)
  if (error) {
    console.warn('[marketingAutomations] error consultando publicaciones sin destaque', error)
    return []
  }
  return (data || []).filter((row) => row?.id && row?.seller_id)
}

async function runMarketingAutomationsOnce() {
  if (!isMailConfigured()) {
    console.info('[marketingAutomations] mail no configurado, se omite el job')
    return { sent: 0 }
  }

  const supabase = getServerSupabaseClient()
  const baseFront = (process.env.FRONTEND_URL || '').split(',')[0]?.trim() || 'https://www.ciclomarket.ar'
  let totalSent = 0

  // 1) Publicaciones vencidas
  const expiredRows = await fetchExpiredListings(supabase, SCENARIOS.expired.maxPerRun)
  if (expiredRows.length) {
    const expiredListingIds = expiredRows.map((row) => row.id)
    const already = await fetchAutomationLogMap(supabase, SCENARIOS.expired.code, expiredListingIds, SCENARIOS.expired.cooldownHours)
    const filtered = expiredRows.filter((row) => !already.has(row.id))
    const sellerIds = [...new Set(filtered.map((row) => row.seller_id))].filter(Boolean)
    const profiles = await fetchSellerProfiles(supabase, sellerIds)
    for (const listing of filtered) {
      const profile = profiles.get(listing.seller_id)
      if (!profile?.email || profile?.storeEnabled) continue
      try {
        const email = buildExpiredEmail({ listing, profile, baseFront })
        await sendMail({
          from: process.env.SMTP_FROM || `Ciclo Market <${process.env.SMTP_USER || 'no-reply@ciclomarket.ar'}>`,
          to: profile.email,
          subject: email.subject,
          html: email.html,
          text: email.text,
        })
        totalSent += 1
        await recordAutomationLog(supabase, SCENARIOS.expired.code, listing.id, listing.seller_id, profile.email)
      } catch (err) {
        console.warn('[marketingAutomations] fallo email expired', listing.id, err?.message || err)
      }
    }
  }

  // 2) Publicaciones en plan Gratis por vencer
  const freeRows = await fetchFreeListingsExpiring(supabase, SCENARIOS.freeExpiring.maxPerRun)
  if (freeRows.length) {
    const now = new Date()
    const filteredByTime = freeRows
      .map((row) => {
        const expiresAt = coerceDate(row.expires_at)
        const daysLeft = differenceInDays(expiresAt, now)
        return { row, expiresAt, daysLeft }
      })
      .filter(({ expiresAt, daysLeft }) => expiresAt && typeof daysLeft === 'number' && daysLeft >= 0 && daysLeft <= 7)
      .map(({ row, daysLeft }) => ({ listing: row, daysLeft }))
    const listingIds = filteredByTime.map((item) => item.listing.id)
    const already = await fetchAutomationLogMap(supabase, SCENARIOS.freeExpiring.code, listingIds, SCENARIOS.freeExpiring.cooldownHours)
    const candidates = filteredByTime.filter((item) => !already.has(item.listing.id))
    const sellerIds = [...new Set(candidates.map((item) => item.listing.seller_id))].filter(Boolean)
    const profiles = await fetchSellerProfiles(supabase, sellerIds)
    for (const { listing, daysLeft } of candidates) {
      const profile = profiles.get(listing.seller_id)
      if (!profile?.email || profile?.storeEnabled) continue
      try {
        const email = buildFreeExpiringEmail({ listing, profile, baseFront, daysLeft })
        await sendMail({
          from: process.env.SMTP_FROM || `Ciclo Market <${process.env.SMTP_USER || 'no-reply@ciclomarket.ar'}>`,
          to: profile.email,
          subject: email.subject,
          html: email.html,
          text: email.text,
        })
        totalSent += 1
        await recordAutomationLog(supabase, SCENARIOS.freeExpiring.code, listing.id, listing.seller_id, profile.email)
      } catch (err) {
        console.warn('[marketingAutomations] fallo email free_expiring', listing.id, err?.message || err)
      }
    }
  }

  // 3) Publicaciones en plan pago por vencer
  const paidRows = await fetchPaidListingsExpiring(supabase, SCENARIOS.paidExpiring.maxPerRun)
  if (paidRows.length) {
    const now = new Date()
    const filteredByTime = paidRows
      .map((row) => {
        const expiresAt = coerceDate(row.expires_at)
        const daysLeft = differenceInDays(expiresAt, now)
        return { row, expiresAt, daysLeft }
      })
      .filter(({ expiresAt, daysLeft }) => expiresAt && typeof daysLeft === 'number' && daysLeft >= 0 && daysLeft <= 7)
      .map(({ row, daysLeft }) => ({ listing: row, daysLeft }))
    const listingIds = filteredByTime.map((item) => item.listing.id)
    const already = await fetchAutomationLogMap(supabase, SCENARIOS.paidExpiring.code, listingIds, SCENARIOS.paidExpiring.cooldownHours)
    const candidates = filteredByTime.filter((item) => !already.has(item.listing.id))
    const sellerIds = [...new Set(candidates.map((item) => item.listing.seller_id))].filter(Boolean)
    const profiles = await fetchSellerProfiles(supabase, sellerIds)
    for (const { listing, daysLeft } of candidates) {
      const profile = profiles.get(listing.seller_id)
      if (!profile?.email || profile?.storeEnabled) continue
      try {
        const email = buildPaidExpiringEmail({ listing, profile, baseFront, daysLeft })
        await sendMail({
          from: process.env.SMTP_FROM || `Ciclo Market <${process.env.SMTP_USER || 'no-reply@ciclomarket.ar'}>`,
          to: profile.email,
          subject: email.subject,
          html: email.html,
          text: email.text,
        })
        totalSent += 1
        await recordAutomationLog(supabase, SCENARIOS.paidExpiring.code, listing.id, listing.seller_id, profile.email)
      } catch (err) {
        console.warn('[marketingAutomations] fallo email paid_expiring', listing.id, err?.message || err)
      }
    }
  }

  // 4) Publicaciones basic/premium sin destaque
  const highlightRowsRaw = await fetchListingsWithoutHighlight(supabase, SCENARIOS.highlight.maxPerRun)
  if (highlightRowsRaw.length) {
    const now = new Date()
    const eligible = highlightRowsRaw.filter((row) => {
      if (!listingHasPlan(row, ['basic', 'premium'])) return false
      const highlightExpiry = coerceDate(row.highlight_expires)
      if (highlightExpiry && highlightExpiry.getTime() > now.getTime()) return false
      return true
    })
    const listingIds = eligible.map((row) => row.id)
    const already = await fetchAutomationLogMap(supabase, SCENARIOS.highlight.code, listingIds, SCENARIOS.highlight.cooldownHours)
    const candidates = eligible.filter((row) => !already.has(row.id))
    const sellerIds = [...new Set(candidates.map((row) => row.seller_id))].filter(Boolean)
    const profiles = await fetchSellerProfiles(supabase, sellerIds)
    for (const listing of candidates) {
      const profile = profiles.get(listing.seller_id)
      if (!profile?.email || profile?.storeEnabled) continue
      try {
        const email = buildHighlightEmail({ listing, profile, baseFront })
        await sendMail({
          from: process.env.SMTP_FROM || `Ciclo Market <${process.env.SMTP_USER || 'no-reply@ciclomarket.ar'}>`,
          to: profile.email,
          subject: email.subject,
          html: email.html,
          text: email.text,
        })
        totalSent += 1
        await recordAutomationLog(supabase, SCENARIOS.highlight.code, listing.id, listing.seller_id, profile.email)
      } catch (err) {
        console.warn('[marketingAutomations] fallo email highlight', listing.id, err?.message || err)
      }
    }
  }

  console.info('[marketingAutomations] envíos realizados', totalSent)
  return { sent: totalSent }
}

function startMarketingAutomationsJob() {
  if (process.env.MARKETING_AUTOMATIONS_ENABLED !== 'true') {
    console.info('[marketingAutomations] deshabilitado (MARKETING_AUTOMATIONS_ENABLED != "true")')
    return
  }
  const cronExpression = process.env.MARKETING_AUTOMATIONS_CRON || DEFAULT_CRON
  const timezone = process.env.MARKETING_AUTOMATIONS_TZ || DEFAULT_TZ
  try {
    const task = cron.schedule(cronExpression, async () => {
      try {
        await runMarketingAutomationsOnce()
      } catch (err) {
        console.error('[marketingAutomations] job error', err)
      }
    }, { timezone })
    task.start()
    console.info('[marketingAutomations] job iniciado con cron', cronExpression, 'tz', timezone)
  } catch (err) {
    console.error('[marketingAutomations] no se pudo iniciar el cron', err)
  }
}

module.exports = {
  startMarketingAutomationsJob,
  runMarketingAutomationsOnce,
}
