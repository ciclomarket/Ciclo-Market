/**
 * lib/brevo.js — Helper de Brevo (API HTTP) para Ciclo Market.
 * Reemplaza los usos directos de Resend: alta de contactos, listas y envíos.
 *
 * Requiere env:
 *   BREVO_API_KEY  → xkeysib-... (obligatorio)
 *   BREVO_LIST_ID  → id numérico de la lista de newsletter (para listas)
 *
 * Ventaja sobre SMTP: la API HTTP NO tiene allowlist de IPs.
 */

const BASE = 'https://api.brevo.com/v3'

function getApiKey() {
  return String(process.env.BREVO_API_KEY || '').trim()
}

function isBrevoConfigured() {
  return Boolean(getApiKey())
}

function buildHeaders(json = false) {
  return {
    'api-key': getApiKey(),
    'Content-Type': json ? 'application/json' : undefined,
    Accept: 'application/json',
  }
}

async function request(path, { method = 'GET', body } = {}) {
  const res = await fetch(`${BASE}${path}`, {
    method,
    headers: buildHeaders(Boolean(body)),
    ...(body ? { body: JSON.stringify(body) } : {}),
  })
  const data = await res.json().catch(() => ({}))
  if (!res.ok) {
    const message = data?.message || data?.error || `Brevo API error ${res.status}`
    const err = new Error(message)
    err.code = data?.code
    err.status = res.status
    throw err
  }
  return data
}

/**
 * Alta / actualización de un contacto en lista(s) de Brevo.
 * updateEnabled: si ya existe, lo actualiza (no duplica).
 */
async function upsertContact({ email, name, listIds = [], unsubscribed = false }) {
  if (!isBrevoConfigured()) throw new Error('BREVO_API_KEY no configurado')
  const attributes = {}
  if (name) {
    const parts = String(name).trim().split(/\s+/)
    if (parts[0]) attributes.FIRSTNAME = parts[0]
    if (parts.length > 1) attributes.LASTNAME = parts.slice(1).join(' ')
  }
  const body = {
    email,
    attributes,
    ...(listIds.length ? { listIds } : {}),
    updateEnabled: true,
  }
  if (unsubscribed) body.emailBlacklisted = true
  return request('/contacts', { method: 'POST', body })
}

/**
 * Contactos de una lista (paginado de a 500).
 * Devuelve [{ id, email, emailBlacklisted, listIds, attributes }].
 */
async function listContactsByList(listId, { limit = 500, offset = 0 } = {}) {
  if (!isBrevoConfigured()) throw new Error('BREVO_API_KEY no configurado')
  const data = await request(
    `/contacts/lists/${encodeURIComponent(listId)}/contacts?limit=${limit}&offset=${offset}`
  )
  return data?.contacts || []
}

/**
 * Envío de un email transaccional vía API de Brevo (sin allowlist de IPs).
 * from puede venir como "Nombre <email>" o "email@dominio".
 */
async function sendEmail({ from, to, subject, html, text, headers: extraHeaders }) {
  if (!isBrevoConfigured()) throw new Error('BREVO_API_KEY no configurado')

  const fromStr = String(from || '').trim()
  let sender = { email: process.env.SMTP_USER || 'avisos@ciclomarket.ar' }
  const match = fromStr.match(/^(.*?)\s*<([^>]+)>$/)
  if (match) {
    sender = { name: match[1].trim().replace(/["|]/g, '').trim(), email: match[2].trim() }
  } else if (fromStr && fromStr.includes('@')) {
    sender = { email: fromStr }
  }

  const toArr = Array.isArray(to) ? to : [to]

  const body = {
    sender,
    to: toArr.map((t) => (typeof t === 'string' ? { email: t } : t)),
    subject,
    htmlContent: html,
    ...(text ? { textContent: text } : {}),
    ...(extraHeaders ? { headers: extraHeaders } : {}),
  }
  return request('/smtp/email', { method: 'POST', body })
}

module.exports = {
  isBrevoConfigured,
  upsertContact,
  listContactsByList,
  sendEmail,
}
