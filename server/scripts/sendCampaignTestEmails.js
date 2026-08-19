#!/usr/bin/env node
/**
 * sendCampaignTestEmails.js
 * -------------------------
 * Envía (o renderiza) un email de prueba por cada campaña del engine v2.
 *
 * Uso:
 *   node scripts/sendCampaignTestEmails.js --to rodrigozalazarml@gmail.com
 *   node scripts/sendCampaignTestEmails.js --to test@example.com --dry-run
 *
 * - Con `server/.env` configurado (RESEND_API_KEY + Supabase) intenta armar
 *   candidatos REALES de la base; si una campaña no tiene candidatos, usa un
 *   payload de ejemplo para que igual veas el diseño.
 * - Con `--dry-run` (o sin credenciales) renderiza los 4 HTML en
 *   `server/email-previews/` sin enviar nada.
 */

const path = require('path')
const fs = require('fs')

// Load .env from server directory (si existe)
const envPath = path.join(__dirname, '..', '.env')
if (fs.existsSync(envPath)) {
  require('dotenv').config({ path: envPath })
} else {
  console.warn('[testEmails] No hay server/.env → modo preview (sin envío real).')
}

function getArgs() {
  const args = {}
  for (let i = 2; i < process.argv.length; i++) {
    const arg = process.argv[i]
    if (arg.startsWith('--')) {
      const key = arg.slice(2)
      const next = process.argv[i + 1]
      if (next && !next.startsWith('--')) { args[key] = next; i++ } else { args[key] = true }
    }
  }
  return args
}

const args = getArgs()
const TO = String(args.to || 'rodrigozalazarml@gmail.com').trim().toLowerCase()
const DRY_RUN = args['dry-run'] === true || !process.env.RESEND_API_KEY

const baseFront = (String(process.env.FRONTEND_URL || 'https://www.ciclomarket.ar').split(',')[0] || '').replace(/\/$/, '')
const serverBase = String(process.env.SERVER_BASE_URL || process.env.PUBLIC_BASE_URL || 'https://ciclo-market.onrender.com').replace(/\/$/, '')
const PREVIEW_DIR = path.join(__dirname, '..', 'email-previews')

// ============================================================================
// Payloads de ejemplo (para ver el diseño aunque no haya datos en la DB)
// ============================================================================

function sampleListing(id, title, price) {
  return {
    id,
    slug: id,
    title,
    image: '',
    price,
    price_currency: 'ARS',
    location: 'Buenos Aires',
    link: `${baseFront}/listing/${id}`,
  }
}

function buildSamplePayload(campaign) {
  const base = { unsubscribeUrl: `${serverBase}/unsubscribe?token=TEST` }
  switch (campaign) {
    case 'free_upgrade_offer':
      return {
        ...base,
        subject: 'Mejorá tu publicación con un upgrade de plan',
        title: 'Tu publicación está en plan Free',
        subtitle: 'Pasate a Premium o Pro con descuento y conseguí más visibilidad y contacto directo con compradores.',
        intro: 'Vimos que publicaste en el plan gratuito y todavía no activaste el upgrade. Aprovechá este descuento por tiempo limitado y vendé más rápido.',
        cards: [{ ...sampleListing('sample-bici', 'Specialized Rockhopper 29" 2020', 450000), planBadge: 'Free' }],
        features: ['WhatsApp habilitado para contacto directo', 'Más visibilidad en resultados', 'Tu anuncio aparece más arriba', 'Destaque visual y mejor confianza'],
        planOffers: [{
          listingId: 'sample-bici',
          listingTitle: 'Specialized Rockhopper 29" 2020',
          plans: [
            { planCode: 'premium', title: 'Plan Premium', originalPrice: 9000, discountPrice: 7200, highlighted: true, url: `${serverBase}/api/checkout/listing-upgrade?token=TEST` },
            { planCode: 'pro', title: 'Plan Pro', originalPrice: 13000, discountPrice: 10400, highlighted: false, url: `${serverBase}/api/checkout/listing-upgrade?token=TEST` },
          ],
        }],
        isBundle: false,
        ctas: [],
      }
    case 'sold_followup':
      return {
        ...base,
        subject: '¿Aún tenés tu bicicleta en venta?',
        title: '¿Seguís vendiendo esta bicicleta?',
        subtitle: 'Ayudanos a mantener el marketplace actualizado.',
        intro: 'Hace un tiempo publicaste esta bicicleta en Ciclo Market. Si ya la vendiste, marcala como vendida para que deje de recibir consultas.',
        cards: [sampleListing('sample-bici', 'Specialized Rockhopper 29" 2020', 450000)],
        ctas: [
          { text: 'Sí, sigue en venta', url: `${serverBase}/api/email/sold-followup?token=TEST&action=still_selling` },
          { text: 'Ya la vendí', url: `${serverBase}/api/email/sold-followup?token=TEST&action=sold`, secondary: true },
        ],
      }
    case 'new_arrivals_weekly':
      return {
        ...base,
        subject: 'Nuevos ingresos de esta semana',
        title: 'Nuevos ingresos de esta semana',
        subtitle: 'Ingresaron 4 bicis esta semana en Ciclo Market.',
        intro: 'El marketplace de bicis más grande de Argentina. Encontrá nuevas oportunidades antes que nadie.',
        cards: [
          sampleListing('b1', 'Trek Marlin 7 2021', 520000),
          sampleListing('b2', 'Vairo XR 3.8 29"', 380000),
          sampleListing('b3', 'Giant Escape 3 City', 290000),
          sampleListing('b4', 'Venzo R29 Comp', 330000),
        ],
        ctas: [{ text: 'Ver más bicicletas', url: `${baseFront}/marketplace` }],
      }
    case 'whatsapp_upsell':
      return {
        ...base,
        subject: '¿Sabías que WhatsApp aumenta tus ventas un 70%?',
        title: 'El botón de WhatsApp aumenta tus ventas',
        subtitle: 'Detectamos que tu publicación no tiene WhatsApp activado.',
        intro: '¿Sabías que el simple hecho de tener el botón de WhatsApp aumenta las ventas un 70%? Detectamos un abandono del 70% comparado a usuarios que se contactan mediante WhatsApp.',
        cards: [sampleListing('sample-bici', 'Specialized Rockhopper 29" 2020', 450000)],
        ctas: [{ text: 'Activar WhatsApp', url: `${baseFront}/dashboard?tab=Publicaciones` }],
      }
    default:
      return { ...base, subject: campaign, title: campaign, subtitle: '', intro: '', cards: [], ctas: [] }
  }
}

const CAMPAIGNS = ['free_upgrade_offer', 'sold_followup', 'new_arrivals_weekly', 'whatsapp_upsell']

// ============================================================================
// Modo envío real (requiere server/.env con credenciales)
// ============================================================================

async function buildRealCandidates(supabase) {
  const { buildDateContext } = require('../src/email/orchestrator')
  const dateCtx = buildDateContext()
  const out = {}
  for (const name of CAMPAIGNS) {
    try {
      const mod = require(`../src/email/campaigns/${name}`)
      const rows = await mod.buildCandidates({ supabase, dateCtx, baseFront, serverBase, forceWeekly: true })
      out[name] = rows && rows.length ? rows[0] : null
    } catch (err) {
      console.warn(`[testEmails] ${name} sin candidatos reales:`, err?.message)
      out[name] = null
    }
  }
  return out
}

async function run() {
  const { renderEmailTemplate } = require('../src/email/templateRenderer')
  const rendered = {}

  let realCandidates = {}
  let supabase = null

  if (!DRY_RUN) {
    try {
      const { getServerSupabaseClient } = require('../src/lib/supabaseClient')
      supabase = getServerSupabaseClient()
      realCandidates = await buildRealCandidates(supabase)
    } catch (err) {
      console.warn('[testEmails] No se pudieron armar candidatos reales:', err?.message)
    }
  }

  for (const name of CAMPAIGNS) {
    const real = realCandidates[name]
    const payload = real && real.payload ? real.payload : buildSamplePayload(name)
    rendered[name] = renderEmailTemplate({
      campaign: name,
      baseFront,
      recipient: { email: TO, userId: real?.userId || null },
      payload,
    })
  }

  if (DRY_RUN) {
    fs.mkdirSync(PREVIEW_DIR, { recursive: true })
    const files = []
    for (const name of CAMPAIGNS) {
      const file = path.join(PREVIEW_DIR, `${name}.html`)
      fs.writeFileSync(file, rendered[name].html)
      files.push(file)
    }
    console.log('📄 Preview renderizado (sin envío):')
    for (const f of files) console.log('  -', f)
    return
  }

  const { sendMail, isMailConfigured } = require('../src/lib/mail')
  if (!isMailConfigured()) {
    console.error('❌ Mail no configurado: falta RESEND_API_KEY o SMTP_* en server/.env')
    process.exit(1)
  }

  for (const name of CAMPAIGNS) {
    const subject = `[TEST] ${rendered[name].subject}`
    await sendMail({
      to: TO,
      subject,
      html: rendered[name].html,
      text: rendered[name].text,
    })
    console.log(`✅ Enviado: ${subject} → ${TO}`)
  }
  console.log('Listo.')
}

run().catch((err) => {
  console.error('[testEmails] error', err)
  process.exit(1)
})
