/**
 * WhatsApp Cloud API Integration
 * Para enviar y recibir mensajes de WhatsApp
 * 
 * Requiere:
 * - WHATSAPP_API_TOKEN (token de acceso de Meta)
 * - WHATSAPP_PHONE_NUMBER_ID (ID del número de teléfono registrado)
 * - WHATSAPP_WEBHOOK_VERIFY_TOKEN (para verificar webhooks)
 */

const WHATSAPP_API_BASE = 'https://graph.facebook.com/v18.0'

function getConfig() {
  return {
    token: process.env.WHATSAPP_API_TOKEN || '',
    phoneNumberId: process.env.WHATSAPP_PHONE_NUMBER_ID || '',
    webhookVerifyToken: process.env.WHATSAPP_WEBHOOK_VERIFY_TOKEN || '',
  }
}

function isConfigured() {
  const cfg = getConfig()
  return Boolean(cfg.token && cfg.phoneNumberId)
}

/**
 * Envía un mensaje de texto por WhatsApp
 * @param {string} to - Número de teléfono del destinatario (con código de país, sin +)
 * @param {string} text - Texto del mensaje
 * @returns {Promise<{messageId: string, status: string}>}
 */
async function sendTextMessage(to, text) {
  const cfg = getConfig()
  if (!isConfigured()) {
    throw new Error('WhatsApp not configured')
  }

  const url = `${WHATSAPP_API_BASE}/${cfg.phoneNumberId}/messages`
  
  const response = await fetch(url, {
    method: 'POST',
    headers: {
      'Authorization': `Bearer ${cfg.token}`,
      'Content-Type': 'application/json',
    },
    body: JSON.stringify({
      messaging_product: 'whatsapp',
      recipient_type: 'individual',
      to,
      type: 'text',
      text: { body: text },
    }),
  })

  if (!response.ok) {
    const error = await response.json().catch(() => ({}))
    throw new Error(error.error?.message || `WhatsApp API error: ${response.status}`)
  }

  const data = await response.json()
  return {
    messageId: data.messages?.[0]?.id,
    status: 'sent',
  }
}

/**
 * Envía un mensaje de template aprobado
 * Los templates deben ser aprobados previamente por Meta
 * 
 * @param {string} to - Número de teléfono
 * @param {string} templateName - Nombre del template
 * @param {string} languageCode - Código de idioma (ej: 'es_AR')
 * @param {Array} components - Parámetros del template (opcional)
 */
async function sendTemplateMessage(to, templateName, languageCode = 'es_AR', components = []) {
  const cfg = getConfig()
  if (!isConfigured()) {
    throw new Error('WhatsApp not configured')
  }

  const url = `${WHATSAPP_API_BASE}/${cfg.phoneNumberId}/messages`
  
  const body = {
    messaging_product: 'whatsapp',
    recipient_type: 'individual',
    to,
    type: 'template',
    template: {
      name: templateName,
      language: { code: languageCode },
    },
  }

  if (components.length > 0) {
    body.template.components = components
  }

  const response = await fetch(url, {
    method: 'POST',
    headers: {
      'Authorization': `Bearer ${cfg.token}`,
      'Content-Type': 'application/json',
    },
    body: JSON.stringify(body),
  })

  if (!response.ok) {
    const error = await response.json().catch(() => ({}))
    throw new Error(error.error?.message || `WhatsApp API error: ${response.status}`)
  }

  const data = await response.json()
  return {
    messageId: data.messages?.[0]?.id,
    status: 'sent',
  }
}

/**
 * Obtiene el estado de un mensaje enviado
 */
async function getMessageStatus(messageId) {
  const cfg = getConfig()
  if (!isConfigured()) {
    throw new Error('WhatsApp not configured')
  }

  const url = `${WHATSAPP_API_BASE}/${messageId}`
  
  const response = await fetch(url, {
    headers: {
      'Authorization': `Bearer ${cfg.token}`,
    },
  })

  if (!response.ok) {
    throw new Error(`Failed to get message status: ${response.status}`)
  }

  return response.json()
}

/**
 * Verifica la firma del webhook de Meta
 * (Opcional pero recomendado para seguridad)
 */
function verifyWebhookSignature(signature, body, appSecret) {
  // Implementación básica - en producción usar crypto para validar
  return true
}

/**
 * Procesa un webhook entrante de WhatsApp
 * Tipos de eventos:
 * - messages (mensaje recibido)
 * - message_status_updates (entregado, leído, fallido)
 * 
 * @param {Object} payload - Payload del webhook
 * @returns {Array} Eventos procesados
 */
function processWebhook(payload) {
  const events = []

  if (!payload.entry) return events

  for (const entry of payload.entry) {
    for (const change of entry.changes || []) {
      const value = change.value

      // Mensajes recibidos
      if (value.messages) {
        for (const msg of value.messages) {
          events.push({
            type: 'message_received',
            from: msg.from,
            timestamp: msg.timestamp,
            messageId: msg.id,
            content: {
              type: msg.type,
              text: msg.text?.body,
              // Puede haber otros tipos: image, document, etc.
            },
            metadata: value.metadata,
          })
        }
      }

      // Actualizaciones de estado
      if (value.statuses) {
        for (const status of value.statuses) {
          events.push({
            type: 'status_update',
            messageId: status.id,
            status: status.status, // sent, delivered, read, failed
            timestamp: status.timestamp,
            recipientId: status.recipient_id,
            error: status.errors?.[0],
          })
        }
      }
    }
  }

  return events
}

/**
 * Formatea un número de teléfono para WhatsApp
 * Remueve el + y cualquier caracter no numérico
 */
function formatPhoneNumber(phone) {
  return phone.replace(/[^\d]/g, '')
}

/**
 * Verifica si podemos iniciar una conversación
 * Reglas de WhatsApp:
 * - Si el usuario envió un mensaje en las últimas 24h: podemos responder (session message)
 * - Si no: debemos usar un template aprobado
 */
async function canSendSessionMessage(sellerId, supabase) {
  // Verificar último mensaje recibido del seller
  const { data, error } = await supabase
    .from('whatsapp_conversations')
    .select('last_inbound_at')
    .eq('seller_id', sellerId)
    .maybeSingle()

  if (error || !data?.last_inbound_at) return false

  const lastInbound = new Date(data.last_inbound_at)
  const now = new Date()
  const hoursDiff = (now.getTime() - lastInbound.getTime()) / (1000 * 60 * 60)

  return hoursDiff <= 24
}

module.exports = {
  sendTextMessage,
  sendTemplateMessage,
  getMessageStatus,
  processWebhook,
  verifyWebhookSignature,
  formatPhoneNumber,
  canSendSessionMessage,
  isConfigured,
  getConfig,
}
