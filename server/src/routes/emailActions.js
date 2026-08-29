/**
 * Acciones de un click desde emails de campaña (sin login).
 * Hoy solo sold-followup ("¿seguís vendiendo?" -> marcar vendida / confirmar).
 */

const express = require('express')
const { getServerSupabaseClient } = require('../lib/supabaseClient')
const { verifyUnsubscribeToken } = require('../email/unsubscribe')

const router = express.Router()

function renderResultPage({ title, message }) {
  return `<!doctype html><html><head><meta charset="utf-8"><title>${title}</title></head>
<body style="font-family:system-ui,Arial,sans-serif;padding:2.5rem;max-width:480px;margin:0 auto;text-align:center;color:#0c1723">
  <img src="https://www.ciclomarket.ar/logo-azul.png" alt="Ciclo Market" style="height:44px;margin-bottom:24px" />
  <h1 style="font-size:20px">${title}</h1>
  <p style="color:#475569;font-size:15px">${message}</p>
  <a href="https://www.ciclomarket.ar/dashboard?tab=Publicaciones" style="display:inline-block;margin-top:20px;padding:11px 20px;background:#14212e;color:#fff;text-decoration:none;border-radius:999px;font-weight:600">Ir a mi panel</a>
</body></html>`
}

router.get('/api/email-actions/sold-followup', async (req, res) => {
  const token = String(req.query.token || '')
  const action = String(req.query.action || '')
  const payload = verifyUnsubscribeToken(token)

  if (!payload || payload.type !== 'sold_followup' || !payload.listingId || !payload.userId) {
    return res.status(400).type('text/html').send(renderResultPage({
      title: 'Link inválido o vencido',
      message: 'Este link ya no es válido. Podés gestionar tu publicación directamente desde tu panel.',
    }))
  }

  if (!['sold', 'still_selling'].includes(action)) {
    return res.status(400).type('text/html').send(renderResultPage({ title: 'Acción desconocida', message: 'No reconocemos esta acción.' }))
  }

  try {
    const supabase = getServerSupabaseClient()

    if (action === 'sold') {
      const { error } = await supabase
        .from('listings')
        .update({ status: 'sold' })
        .eq('id', payload.listingId)
        .eq('seller_id', payload.userId)
      if (error) throw error
      return res.type('text/html').send(renderResultPage({
        title: '¡Listo, felicitaciones por la venta!',
        message: 'Marcamos tu publicación como vendida. Ya no va a aparecer en el marketplace.',
      }))
    }

    // still_selling: no hace falta tocar nada, solo confirmar.
    return res.type('text/html').send(renderResultPage({
      title: 'Gracias por confirmar',
      message: 'Tu publicación sigue activa y visible en el marketplace.',
    }))
  } catch (err) {
    console.error('[emailActions] sold-followup failed', err)
    return res.status(500).type('text/html').send(renderResultPage({
      title: 'Algo salió mal',
      message: 'No pudimos procesar la acción. Intentá de nuevo desde tu panel.',
    }))
  }
})

module.exports = { emailActionsRouter: router }
