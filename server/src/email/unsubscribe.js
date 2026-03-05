const crypto = require('crypto')

function validateEmail(email) {
  if (!email) return false
  return /^[^@\s]+@[^@\s]+\.[^@\s]+$/.test(String(email).trim())
}

function getUnsubscribeSecret() {
  return String(process.env.NEWSLETTER_UNSUB_SECRET || process.env.CRON_SECRET || '').trim()
}

function createUnsubscribeToken(payload) {
  const secret = getUnsubscribeSecret()
  if (!secret) throw new Error('unsubscribe_secret_missing')
  const body = Buffer.from(JSON.stringify(payload)).toString('base64url')
  const sig = crypto.createHmac('sha256', secret).update(body).digest('base64url')
  return `v1.${body}.${sig}`
}

function verifyUnsubscribeToken(token) {
  const secret = getUnsubscribeSecret()
  if (!secret || !token) return null
  const parts = String(token).split('.')
  if (parts.length !== 3 || parts[0] !== 'v1') return null
  const [, body, sig] = parts
  const expected = crypto.createHmac('sha256', secret).update(body).digest('base64url')
  if (expected !== sig) return null
  try {
    const parsed = JSON.parse(Buffer.from(body, 'base64url').toString('utf8'))
    if (!parsed?.email || !validateEmail(parsed.email)) return null
    if (parsed.exp && Number(parsed.exp) < Date.now()) return null
    return parsed
  } catch {
    return null
  }
}

function verifyLegacyUnsubscribe(email, token) {
  const secret = getUnsubscribeSecret()
  if (!secret || !validateEmail(email) || !token) return false
  const expected = crypto.createHmac('sha256', secret).update(email).digest('base64url')
  return expected === token
}

async function applySuppression(supabase, { email, userId, reason = 'unsubscribe', source = 'unsubscribe_link' }) {
  const cleanEmail = String(email || '').trim().toLowerCase()
  if (!validateEmail(cleanEmail)) return { ok: false, error: 'invalid_email' }

  await supabase
    .from('email_suppressions')
    .upsert({
      email: cleanEmail,
      user_id: userId || null,
      reason,
      source,
      created_at: new Date().toISOString(),
    }, { onConflict: 'email' })

  if (userId) {
    await supabase
      .from('user_notification_settings')
      .upsert({
        user_id: userId,
        marketing_emails_enabled: false,
        marketing_emails: false,
        updated_at: new Date().toISOString(),
      }, { onConflict: 'user_id' })
  } else {
    const { data: user } = await supabase
      .from('users')
      .select('id')
      .eq('email', cleanEmail)
      .maybeSingle()

    if (user?.id) {
      await supabase
        .from('user_notification_settings')
        .upsert({
          user_id: user.id,
          marketing_emails_enabled: false,
          marketing_emails: false,
          updated_at: new Date().toISOString(),
        }, { onConflict: 'user_id' })
      await supabase
        .from('email_suppressions')
        .upsert({
          email: cleanEmail,
          user_id: user.id,
          reason,
          source,
          created_at: new Date().toISOString(),
        }, { onConflict: 'email' })
    }
  }

  return { ok: true }
}

function renderUnsubscribeHtml(email) {
  return `<html><body style="font-family:system-ui;padding:2rem;"><h1>Te desuscribimos correctamente</h1><p>${email} ya no recibirá emails de marketing de Ciclo Market.</p><p><a href="https://www.ciclomarket.ar">Volver al sitio</a></p></body></html>`
}

module.exports = {
  createUnsubscribeToken,
  verifyUnsubscribeToken,
  verifyLegacyUnsubscribe,
  applySuppression,
  validateEmail,
  renderUnsubscribeHtml,
}
