/**
 * WhatsApp API Routes
 * - POST /api/admin/whatsapp/send - Enviar mensaje
 * - GET /api/webhooks/whatsapp - Verificación del webhook
 * - POST /api/webhooks/whatsapp - Recibir eventos
 */

const { Router } = require('express')
const { getServerSupabaseClient } = require('../lib/supabaseClient')
const whatsappService = require('../services/whatsappService')

const router = Router()

// POST /api/admin/whatsapp/send
// Envía un mensaje de WhatsApp
router.post('/api/admin/whatsapp/send', async (req, res) => {
  try {
    if (!whatsappService.isConfigured()) {
      return res.status(503).json({ 
        error: 'WhatsApp not configured',
        message: 'WHATSAPP_API_TOKEN and WHATSAPP_PHONE_NUMBER_ID required'
      })
    }

    const { sellerId, message, useTemplate } = req.body
    if (!sellerId || !message) {
      return res.status(400).json({ error: 'sellerId and message required' })
    }

    const supabase = getServerSupabaseClient()

    // Obtener datos del seller
    const { data: seller, error: sellerError } = await supabase
      .from('users')
      .select('whatsapp_number, full_name')
      .eq('id', sellerId)
      .maybeSingle()

    if (sellerError || !seller?.whatsapp_number) {
      return res.status(404).json({ error: 'Seller not found or no WhatsApp number' })
    }

    // Verificar opt-out
    const { data: summary } = await supabase
      .from('crm_seller_summary')
      .select('whatsapp_opt_out')
      .eq('seller_id', sellerId)
      .maybeSingle()

    if (summary?.whatsapp_opt_out) {
      return res.status(403).json({ error: 'Seller has opted out of WhatsApp' })
    }

    const phone = whatsappService.formatPhoneNumber(seller.whatsapp_number)

    // Decidir si podemos usar mensaje de sesión o template
    let result
    if (useTemplate) {
      // Usar template aprobado
      result = await whatsappService.sendTemplateMessage(phone, message)
    } else {
      // Verificar ventana de 24h
      const canUseSession = await whatsappService.canSendSessionMessage(sellerId, supabase)
      if (!canUseSession) {
        return res.status(403).json({ 
          error: 'Session expired',
          message: 'Debes usar un template aprobado o esperar a que el usuario te escriba'
        })
      }
      result = await whatsappService.sendTextMessage(phone, message)
    }

    // Guardar en la base de datos
    await supabase.from('seller_outreach').insert({
      seller_id: sellerId,
      channel: 'whatsapp',
      message_preview: message.substring(0, 200),
      status: 'sent',
      sent_at: new Date().toISOString(),
      meta: {
        whatsapp_message_id: result.messageId,
        source: 'admin_api',
      },
    })

    // Actualizar o crear conversación
    await supabase.from('whatsapp_conversations').upsert({
      seller_id: sellerId,
      phone_number: phone,
      last_outbound_at: new Date().toISOString(),
      last_message_preview: message.substring(0, 100),
      updated_at: new Date().toISOString(),
    }, { onConflict: 'seller_id' })

    res.json({ success: true, messageId: result.messageId })
  } catch (err) {
    console.error('[whatsapp] send failed:', err)
    res.status(500).json({ error: err.message || 'Failed to send message' })
  }
})

// GET /api/webhooks/whatsapp
// Verificación del webhook por Meta
router.get('/api/webhooks/whatsapp', (req, res) => {
  const mode = req.query['hub.mode']
  const token = req.query['hub.verify_token']
  const challenge = req.query['hub.challenge']

  const cfg = whatsappService.getConfig()

  if (mode === 'subscribe' && token === cfg.webhookVerifyToken) {
    console.log('[whatsapp] webhook verified')
    res.status(200).send(challenge)
  } else {
    res.status(403).send('Verification failed')
  }
})

// POST /api/webhooks/whatsapp
// Recibe eventos de WhatsApp
router.post('/api/webhooks/whatsapp', async (req, res) => {
  try {
    console.log('[whatsapp] webhook received:', JSON.stringify(req.body, null, 2))

    const events = whatsappService.processWebhook(req.body)
    const supabase = getServerSupabaseClient()

    for (const event of events) {
      if (event.type === 'message_received') {
        // Buscar seller por número de teléfono
        const phone = event.from
        const { data: seller } = await supabase
          .from('users')
          .select('id')
          .ilike('whatsapp_number', `%${phone}%`)
          .maybeSingle()

        if (seller) {
          // Guardar mensaje recibido
          await supabase.from('whatsapp_messages').insert({
            seller_id: seller.id,
            direction: 'inbound',
            message_id: event.messageId,
            content: event.content.text || '',
            timestamp: new Date(parseInt(event.timestamp) * 1000).toISOString(),
            metadata: event.metadata,
          })

          // Actualizar conversación
          await supabase.from('whatsapp_conversations').upsert({
            seller_id: seller.id,
            phone_number: phone,
            last_inbound_at: new Date().toISOString(),
            last_message_preview: event.content.text?.substring(0, 100) || '',
            unread_count: supabase.rpc('increment', { amount: 1 }),
            updated_at: new Date().toISOString(),
          }, { onConflict: 'seller_id' })

          // Crear notificación para admins
          await supabase.from('notifications').insert({
            user_id: null, // null = para todos los admins
            type: 'whatsapp_inbound',
            title: 'Nuevo mensaje de WhatsApp',
            body: event.content.text?.substring(0, 100) || 'Nuevo mensaje',
            data: { seller_id: seller.id, phone },
          })
        }
      }

      if (event.type === 'status_update') {
        // Actualizar estado del mensaje
        await supabase
          .from('seller_outreach')
          .update({
            status: event.status,
            delivered_at: event.status === 'delivered' ? new Date().toISOString() : undefined,
            read_at: event.status === 'read' ? new Date().toISOString() : undefined,
            error_message: event.error?.message,
          })
          .eq('meta->>whatsapp_message_id', event.messageId)
      }
    }

    // Responder 200 OK rápidamente a Meta
    res.status(200).send('EVENT_RECEIVED')
  } catch (err) {
    console.error('[whatsapp] webhook processing failed:', err)
    // Aún así respondemos 200 para que Meta no reintente
    res.status(200).send('EVENT_RECEIVED')
  }
})

// GET /api/admin/whatsapp/conversations/:sellerId
// Obtener historial de conversación con un seller
router.get('/api/admin/whatsapp/conversations/:sellerId', async (req, res) => {
  try {
    const { sellerId } = req.params
    const supabase = getServerSupabaseClient()

    const { data, error } = await supabase
      .from('whatsapp_messages')
      .select('*')
      .eq('seller_id', sellerId)
      .order('timestamp', { ascending: true })
      .limit(100)

    if (error) throw error

    res.json(data || [])
  } catch (err) {
    console.error('[whatsapp] fetch conversation failed:', err)
    res.status(500).json({ error: 'Failed to fetch conversation' })
  }
})

// GET /api/admin/whatsapp/templates
// Lista templates disponibles (en producción, fetch from Meta API)
router.get('/api/admin/whatsapp/templates', async (req, res) => {
  // Templates de ejemplo - en producción obtener de Meta
  const templates = [
    {
      name: 'hello_world',
      language: 'es_AR',
      category: 'MARKETING',
      components: [{ type: 'BODY', text: 'Hola {{1}}, bienvenido a Ciclo Market!' }],
    },
    {
      name: 'seller_followup',
      language: 'es_AR',
      category: 'UTILITY',
      components: [{ type: 'BODY', text: 'Hola {{1}}, ¿vendiste tu {{2}}? Respondé 1 (Sí), 2 (No), 3 (Todavía no).' }],
    },
    {
      name: 'renewal_reminder',
      language: 'es_AR',
      category: 'UTILITY',
      components: [{ type: 'BODY', text: 'Tu publicación {{1}} vence en {{2}} días. Renovala desde tu panel.' }],
    },
  ]

  res.json(templates)
})

module.exports = { whatsappRouter: router }
