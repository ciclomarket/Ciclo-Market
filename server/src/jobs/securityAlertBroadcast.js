/**
 * Security Alert Broadcast - One-shot email to ALL users
 * Triggered manually via POST /cron/security-alert
 * No cooldown, no marketing_emails filter — this is an operational alert.
 */

const { getServerSupabaseClient } = require('../lib/supabaseClient')
const { sendMail, isMailConfigured } = require('../lib/mail')

const AUTOMATION_TYPE = 'security_alert_broadcast'
const RATE_LIMIT_MS = 1500

// ============================================================================
// HELPERS
// ============================================================================

function escapeHtml(str) {
  if (!str) return ''
  return String(str)
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#39;')
}

// ============================================================================
// DATA FETCHING
// ============================================================================

async function fetchAllUsers(supabase, { limit = 5000, offset = 0 } = {}) {
  const { data, error } = await supabase
    .from('users')
    .select('id,email,full_name')
    .not('email', 'is', null)
    .range(offset, offset + limit - 1)
    .order('created_at', { ascending: true })

  if (error) {
    console.warn(`[${AUTOMATION_TYPE}] error fetching users`, error)
    return []
  }

  return (data || [])
    .map(row => ({ userId: row.id, email: row.email, fullName: row.full_name || 'Ciclista' }))
    .filter(u => u.email)
}

// ============================================================================
// EMAIL TEMPLATE
// ============================================================================

function buildSecurityAlertHtml({ recipientName }) {
  const greeting = recipientName
    ? `Hola <strong>${escapeHtml(recipientName)}</strong>,`
    : 'Hola,'

  return `<!DOCTYPE html>
<html lang="es">
  <head>
    <meta charset="utf-8" />
    <meta name="viewport" content="width=device-width, initial-scale=1" />
    <title>Aviso de seguridad - Ciclo Market</title>
  </head>
  <body style="margin:0; padding:0; background-color:#F4F5F7;">
    <table role="presentation" width="100%" cellspacing="0" cellpadding="0" border="0" style="background-color:#F4F5F7;">
      <tr>
        <td align="center" style="padding:24px 12px;">
          <table role="presentation" width="100%" cellspacing="0" cellpadding="0" border="0" style="max-width:600px; background-color:#FFFFFF; border-radius:12px; overflow:hidden;">

            <!-- LOGO -->
            <tr>
              <td align="center" style="padding:20px 20px 10px 20px; background-color:#FFFFFF;">
                <img src="https://www.ciclomarket.ar/_static/email-logo-ciclomarket.png" alt="Ciclo Market" width="120" style="display:block; max-width:120px; height:auto; margin:0 auto;" />
              </td>
            </tr>

            <!-- NAV -->
            <tr>
              <td align="center" style="background-color:#FFFFFF; padding:0 20px 16px 20px;">
                <table role="presentation" cellspacing="0" cellpadding="0" border="0">
                  <tr>
                    <td style="padding:0 8px;">
                      <a href="https://www.ciclomarket.ar/marketplace?bikes=1" style="font-family:Arial, sans-serif; font-size:13px; color:#14212E; text-decoration:none;">Bicicletas</a>
                    </td>
                    <td style="padding:0 8px;">
                      <a href="https://www.ciclomarket.ar/marketplace?cat=Accesorios" style="font-family:Arial, sans-serif; font-size:13px; color:#14212E; text-decoration:none;">Accesorios</a>
                    </td>
                    <td style="padding:0 8px;">
                      <a href="https://www.ciclomarket.ar/marketplace?cat=Indumentaria" style="font-family:Arial, sans-serif; font-size:13px; color:#14212E; text-decoration:none;">Indumentaria</a>
                    </td>
                  </tr>
                </table>
              </td>
            </tr>

            <!-- ALERT HEADER -->
            <tr>
              <td style="padding:24px 24px 8px 24px; background-color:#7F1D1D;">
                <p style="margin:0 0 4px 0; font-family:Arial, sans-serif; font-size:13px; color:#FCA5A5; font-weight:bold; text-transform:uppercase; letter-spacing:1px;">
                  ⚠ Aviso de seguridad
                </p>
                <h1 style="margin:0; font-family:Arial, sans-serif; font-size:22px; line-height:1.3; color:#FFFFFF; font-weight:bold;">
                  Detectamos un intento de estafa en comentarios
                </h1>
              </td>
            </tr>

            <!-- BODY -->
            <tr>
              <td style="padding:20px 24px 8px 24px; background-color:#FFFFFF;">
                <p style="margin:0 0 12px 0; font-family:Arial, sans-serif; font-size:14px; color:#111111;">
                  ${greeting}
                </p>
                <p style="margin:0 0 12px 0; font-family:Arial, sans-serif; font-size:14px; color:#111111;">
                  Identificamos que algunos usuarios están recibiendo el siguiente mensaje fraudulento en la sección de consultas de sus publicaciones:
                </p>
              </td>
            </tr>

            <!-- SCAM MESSAGE BLOCK -->
            <tr>
              <td style="padding:0 24px 20px 24px; background-color:#FFFFFF;">
                <div style="border-radius:8px; border:2px solid #FCA5A5; background-color:#FFF1F2; padding:16px 18px; font-family:Arial, sans-serif; font-size:13px; color:#450a0a; line-height:1.6;">
                  <p style="margin:0 0 6px 0; font-weight:bold; color:#7F1D1D; font-size:12px; text-transform:uppercase; letter-spacing:0.5px;">Mensaje fraudulento — no hagas clic</p>
                  <p style="margin:0;">🚲 Estimado vendedor,<br/>
                  ¡Enhorabuena! 🎉 Su bicicleta ha sido pagada a través de Ciclomarket, gracias a nuestro sistema de pago seguro. ✅<br/><br/>
                  Para recibir el importe y contactar con el comprador, solo tiene que realizar una breve verificación y confirmar la transacción. 🔐<br/><br/>
                  👉 Para ello, copie el siguiente enlace y péguelo en su navegador:<br/>
                  🔗 https://tinyurl.com/ciclomarketorder<br/><br/>
                  ⏰ Tiene 24 horas</p>
                </div>
              </td>
            </tr>

            <!-- WARNING BOX -->
            <tr>
              <td style="padding:0 24px 20px 24px; background-color:#FFFFFF;">
                <div style="border-radius:8px; background-color:#14212E; padding:16px 18px;">
                  <p style="margin:0 0 10px 0; font-family:Arial, sans-serif; font-size:14px; color:#FFFFFF; font-weight:bold;">
                    ¿Recibiste este mensaje? Seguí estas instrucciones:
                  </p>
                  <ul style="margin:0; padding-left:18px; font-family:Arial, sans-serif; font-size:13px; color:#E2E8F0; line-height:1.7;">
                    <li><strong>No hagas clic</strong> en el enlace bajo ninguna circunstancia.</li>
                    <li>Ciclo Market <strong>nunca</strong> pide verificaciones ni pagos a través de links externos.</li>
                    <li>Los pagos de Ciclo Market solo se gestionan desde tu panel oficial en ciclomarket.ar.</li>
                    <li>Reportá el mensaje respondiendo a este correo o escribiéndonos a <strong>admin@ciclomarket.ar</strong>.</li>
                  </ul>
                </div>
              </td>
            </tr>

            <!-- CTA -->
            <tr>
              <td align="center" style="padding:0 24px 24px 24px; background-color:#FFFFFF;">
                <a href="https://www.ciclomarket.ar/dashboard" style="display:inline-block; padding:12px 28px; background-color:#14212E; color:#FFFFFF; font-family:Arial, sans-serif; font-size:14px; font-weight:bold; text-decoration:none; border-radius:999px;">
                  Ir a mi cuenta
                </a>
              </td>
            </tr>

            <!-- FOOTER -->
            <tr>
              <td style="padding:16px 24px 20px 24px; background-color:#FFFFFF; border-top:1px solid #E2E4E8;">
                <p style="margin:0 0 8px 0; font-family:Arial, sans-serif; font-size:12px; color:#777777;">
                  ¿Tenés dudas? Escribinos a <a href="mailto:hola@ciclomarket.ar" style="color:#14212E; text-decoration:none;">hola@ciclomarket.ar</a>.
                </p>
                <p style="margin:0 0 6px 0; font-family:Arial, sans-serif; font-size:12px; color:#777777;">
                  Instagram: <a href="https://www.instagram.com/ciclomarket.ar" style="color:#14212E; text-decoration:none;">@ciclomarket.ar</a>
                </p>
                <p style="margin:0; font-family:Arial, sans-serif; font-size:12px; color:#777777;">
                  LinkedIn: <a href="https://www.linkedin.com/company/ciclo-market" style="color:#14212E; text-decoration:none;">Ciclo Market</a>
                </p>
              </td>
            </tr>

          </table>
        </td>
      </tr>
    </table>
  </body>
</html>`
}

function buildSecurityAlertText({ recipientName }) {
  const greeting = recipientName ? `Hola ${recipientName},` : 'Hola,'
  return [
    `⚠ AVISO DE SEGURIDAD - Ciclo Market`,
    ``,
    greeting,
    ``,
    `Detectamos un intento de estafa en la sección de consultas.`,
    ``,
    `El mensaje fraudulento que están enviando es:`,
    `---`,
    `🚲 Estimado vendedor, ¡Enhorabuena! Su bicicleta ha sido pagada a través de Ciclomarket...`,
    `👉 https://tinyurl.com/ciclomarketorder`,
    `---`,
    ``,
    `NO hagas clic en ese enlace. Ciclo Market nunca pide verificaciones por links externos.`,
    `Reportalo a hola@ciclomarket.ar`,
    ``,
    `Ir a tu cuenta: https://www.ciclomarket.ar/dashboard`,
  ].join('\n')
}

// ============================================================================
// CORE FUNCTION
// ============================================================================

async function sendSecurityAlert({ dryRun = false, limit = 5000, batchOffset = 0 } = {}) {
  if (!isMailConfigured()) {
    throw new Error('Mail no configurado (RESEND_API_KEY o SMTP_*)')
  }

  const supabase = getServerSupabaseClient()
  const recipients = await fetchAllUsers(supabase, { limit, offset: batchOffset })

  if (!recipients.length) {
    console.info(`[${AUTOMATION_TYPE}] no recipients found`)
    return { sent: 0, skipped: 0, recipients: [], dryRun }
  }

  console.info(`[${AUTOMATION_TYPE}] preparing to send to ${recipients.length} users (dryRun=${dryRun})`)

  const results = []
  let sent = 0
  let skipped = 0

  for (const recipient of recipients) {
    const firstName = (recipient.fullName || '').split(' ')[0] || 'Ciclista'
    const subject = '⚠️ Aviso de seguridad importante - Ciclo Market'
    const html = buildSecurityAlertHtml({ recipientName: firstName })
    const text = buildSecurityAlertText({ recipientName: firstName })

    if (dryRun) {
      results.push({ userId: recipient.userId, email: recipient.email, subject })
      continue
    }

    try {
      await sendMail({
        from: process.env.SMTP_FROM || 'Ciclo Market <hola@ciclomarket.ar>',
        to: recipient.email,
        subject,
        html,
        text,
      })
      sent++
      await new Promise(r => setTimeout(r, RATE_LIMIT_MS))
    } catch (err) {
      console.warn(`[${AUTOMATION_TYPE}] send failed for ${recipient.email}`, err?.message)
      skipped++
    }
  }

  console.info(`[${AUTOMATION_TYPE}] done — sent: ${sent}, skipped: ${skipped}, dryRun: ${dryRun}`)
  return {
    sent,
    skipped,
    dryRun,
    recipients: dryRun ? results : recipients.map(r => ({ userId: r.userId, email: r.email })),
  }
}

// ============================================================================
// TARGETED ALERT — for users who received the scam comment directly
// ============================================================================

function buildTargetedAlertHtml({ recipientName }) {
  const greeting = recipientName
    ? `Hola <strong>${escapeHtml(recipientName)}</strong>,`
    : 'Hola,'

  return `<!DOCTYPE html>
<html lang="es">
  <head>
    <meta charset="utf-8" />
    <meta name="viewport" content="width=device-width, initial-scale=1" />
    <title>Aviso de seguridad - Ciclo Market</title>
  </head>
  <body style="margin:0; padding:0; background-color:#F4F5F7;">
    <table role="presentation" width="100%" cellspacing="0" cellpadding="0" border="0" style="background-color:#F4F5F7;">
      <tr>
        <td align="center" style="padding:24px 12px;">
          <table role="presentation" width="100%" cellspacing="0" cellpadding="0" border="0" style="max-width:600px; background-color:#FFFFFF; border-radius:12px; overflow:hidden;">

            <!-- LOGO -->
            <tr>
              <td align="center" style="padding:20px 20px 10px 20px; background-color:#FFFFFF;">
                <img src="https://www.ciclomarket.ar/_static/email-logo-ciclomarket.png" alt="Ciclo Market" width="120" style="display:block; max-width:120px; height:auto; margin:0 auto;" />
              </td>
            </tr>

            <!-- NAV -->
            <tr>
              <td align="center" style="background-color:#FFFFFF; padding:0 20px 16px 20px;">
                <table role="presentation" cellspacing="0" cellpadding="0" border="0">
                  <tr>
                    <td style="padding:0 8px;">
                      <a href="https://www.ciclomarket.ar/marketplace?bikes=1" style="font-family:Arial, sans-serif; font-size:13px; color:#14212E; text-decoration:none;">Bicicletas</a>
                    </td>
                    <td style="padding:0 8px;">
                      <a href="https://www.ciclomarket.ar/marketplace?cat=Accesorios" style="font-family:Arial, sans-serif; font-size:13px; color:#14212E; text-decoration:none;">Accesorios</a>
                    </td>
                    <td style="padding:0 8px;">
                      <a href="https://www.ciclomarket.ar/marketplace?cat=Indumentaria" style="font-family:Arial, sans-serif; font-size:13px; color:#14212E; text-decoration:none;">Indumentaria</a>
                    </td>
                  </tr>
                </table>
              </td>
            </tr>

            <!-- ALERT HEADER -->
            <tr>
              <td style="padding:24px 24px 8px 24px; background-color:#7F1D1D;">
                <p style="margin:0 0 4px 0; font-family:Arial, sans-serif; font-size:13px; color:#FCA5A5; font-weight:bold; text-transform:uppercase; letter-spacing:1px;">
                  ⚠ Aviso de seguridad
                </p>
                <h1 style="margin:0; font-family:Arial, sans-serif; font-size:22px; line-height:1.3; color:#FFFFFF; font-weight:bold;">
                  Encontramos un mensaje fraudulento en tu publicación
                </h1>
              </td>
            </tr>

            <!-- BODY -->
            <tr>
              <td style="padding:20px 24px 8px 24px; background-color:#FFFFFF;">
                <p style="margin:0 0 12px 0; font-family:Arial, sans-serif; font-size:14px; color:#111111;">
                  ${greeting}
                </p>
                <p style="margin:0 0 12px 0; font-family:Arial, sans-serif; font-size:14px; color:#111111;">
                  Detectamos que <strong>tu publicación recibió un mensaje fraudulento</strong> haciéndose pasar por Ciclo Market. Ya eliminamos el mensaje y dimos de baja la cuenta responsable.
                </p>
                <p style="margin:0 0 12px 0; font-family:Arial, sans-serif; font-size:14px; color:#111111;">
                  <strong>Tu cuenta está segura.</strong> No necesitás hacer nada.
                </p>
              </td>
            </tr>

            <!-- WARNING BOX -->
            <tr>
              <td style="padding:0 24px 20px 24px; background-color:#FFFFFF;">
                <div style="border-radius:8px; background-color:#14212E; padding:16px 18px;">
                  <p style="margin:0 0 10px 0; font-family:Arial, sans-serif; font-size:14px; color:#FFFFFF; font-weight:bold;">
                    ¿Hiciste clic en algún enlace del mensaje?
                  </p>
                  <ul style="margin:0; padding-left:18px; font-family:Arial, sans-serif; font-size:13px; color:#E2E8F0; line-height:1.7;">
                    <li>Si <strong>no hiciste clic</strong>: no hay nada más que hacer, estás seguro.</li>
                    <li>Si <strong>sí hiciste clic</strong> y completaste algún formulario: cambiá tu contraseña de Ciclo Market y revisá tus datos bancarios.</li>
                    <li>Ante cualquier duda escribinos a <strong>hola@ciclomarket.ar</strong>.</li>
                  </ul>
                  <p style="margin:12px 0 0 0; font-family:Arial, sans-serif; font-size:13px; color:#94A3B8;">
                    Recordá: Ciclo Market nunca pide verificaciones ni pagos a través de links externos.
                  </p>
                </div>
              </td>
            </tr>

            <!-- CTA -->
            <tr>
              <td align="center" style="padding:0 24px 24px 24px; background-color:#FFFFFF;">
                <a href="https://www.ciclomarket.ar/dashboard" style="display:inline-block; padding:12px 28px; background-color:#14212E; color:#FFFFFF; font-family:Arial, sans-serif; font-size:14px; font-weight:bold; text-decoration:none; border-radius:999px;">
                  Ir a mi cuenta
                </a>
              </td>
            </tr>

            <!-- FOOTER -->
            <tr>
              <td style="padding:16px 24px 20px 24px; background-color:#FFFFFF; border-top:1px solid #E2E4E8;">
                <p style="margin:0 0 8px 0; font-family:Arial, sans-serif; font-size:12px; color:#777777;">
                  ¿Tenés dudas? Escribinos a <a href="mailto:hola@ciclomarket.ar" style="color:#14212E; text-decoration:none;">hola@ciclomarket.ar</a>.
                </p>
                <p style="margin:0 0 6px 0; font-family:Arial, sans-serif; font-size:12px; color:#777777;">
                  Instagram: <a href="https://www.instagram.com/ciclomarket.ar" style="color:#14212E; text-decoration:none;">@ciclomarket.ar</a>
                </p>
                <p style="margin:0; font-family:Arial, sans-serif; font-size:12px; color:#777777;">
                  LinkedIn: <a href="https://www.linkedin.com/company/ciclo-market" style="color:#14212E; text-decoration:none;">Ciclo Market</a>
                </p>
              </td>
            </tr>

          </table>
        </td>
      </tr>
    </table>
  </body>
</html>`
}

function buildTargetedAlertText({ recipientName }) {
  const greeting = recipientName ? `Hola ${recipientName},` : 'Hola,'
  return [
    `⚠ AVISO DE SEGURIDAD - Ciclo Market`,
    ``,
    greeting,
    ``,
    `Detectamos un mensaje fraudulento en tu publicación haciéndose pasar por Ciclo Market.`,
    `Ya eliminamos el mensaje y dimos de baja la cuenta responsable.`,
    `Tu cuenta está segura. No necesitás hacer nada.`,
    ``,
    `Si hiciste clic en el enlace del mensaje y completaste algún formulario,`,
    `cambiá tu contraseña y revisá tus datos bancarios.`,
    ``,
    `Ante cualquier duda: hola@ciclomarket.ar`,
    ``,
    `Ir a tu cuenta: https://www.ciclomarket.ar/dashboard`,
  ].join('\n')
}

async function sendTargetedSecurityAlert({ userIds = [], dryRun = false } = {}) {
  if (!isMailConfigured()) {
    throw new Error('Mail no configurado (RESEND_API_KEY o SMTP_*)')
  }
  if (!userIds.length) {
    throw new Error('userIds vacío')
  }

  const supabase = getServerSupabaseClient()
  const { data, error } = await supabase
    .from('users')
    .select('id,email,full_name')
    .in('id', userIds)

  if (error) throw error

  const recipients = (data || [])
    .map(row => ({ userId: row.id, email: row.email, fullName: row.full_name || 'Ciclista' }))
    .filter(u => u.email)

  console.info(`[${AUTOMATION_TYPE}:targeted] sending to ${recipients.length} users (dryRun=${dryRun})`)

  const results = []
  let sent = 0
  let skipped = 0

  for (const recipient of recipients) {
    const firstName = (recipient.fullName || '').split(' ')[0] || 'Ciclista'
    const subject = '⚠️ Encontramos un mensaje fraudulento en tu publicación - Ciclo Market'
    const html = buildTargetedAlertHtml({ recipientName: firstName })
    const text = buildTargetedAlertText({ recipientName: firstName })

    if (dryRun) {
      results.push({ userId: recipient.userId, email: recipient.email, subject })
      continue
    }

    try {
      await sendMail({
        from: process.env.SMTP_FROM || 'Ciclo Market <hola@ciclomarket.ar>',
        to: recipient.email,
        subject,
        html,
        text,
      })
      sent++
      await new Promise(r => setTimeout(r, RATE_LIMIT_MS))
    } catch (err) {
      console.warn(`[${AUTOMATION_TYPE}:targeted] send failed for ${recipient.email}`, err?.message)
      skipped++
    }
  }

  console.info(`[${AUTOMATION_TYPE}:targeted] done — sent: ${sent}, skipped: ${skipped}`)
  return {
    sent,
    skipped,
    dryRun,
    recipients: dryRun ? results : recipients.map(r => ({ userId: r.userId, email: r.email })),
  }
}

module.exports = { sendSecurityAlert, sendTargetedSecurityAlert, AUTOMATION_TYPE }
