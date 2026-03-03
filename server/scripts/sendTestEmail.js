#!/usr/bin/env node
/**
 * Send Test Email - Script CLI universal para probar templates de email
 * 
 * Uso:
 *   node scripts/sendTestEmail.js --template monday --to test@example.com --dry-run
 *   node scripts/sendTestEmail.js --template wednesday --to test@example.com --seller-id <uuid>
 *   node scripts/sendTestEmail.js --template friday --to test@example.com --seller-id <uuid>
 * 
 * Opciones:
 *   --template    monday|wednesday|friday
 *   --to          Email destino
 *   --seller-id   UUID del seller (para wednesday/friday)
 *   --dry-run     No enviar, solo mostrar preview
 *   --limit       Límite de destinatarios en modo dry-run (default: 5)
 *   --frontend    Override de FRONTEND_URL
 */

const path = require('path')

// Load .env from server directory
require('dotenv').config({ path: path.join(__dirname, '..', '.env') })

const { sendMondayEmails } = require('../src/jobs/mondayNewArrivals')
const { sendWednesdayEmails } = require('../src/jobs/wednesdayListingUpdate')
const { sendFridayEmails } = require('../src/jobs/fridayUpgradeOffer')
const { getServerSupabaseClient } = require('../src/lib/supabaseClient')
const { sendMail, isMailConfigured } = require('../src/lib/mail')

// ============================================================================
// CLI ARGS
// ============================================================================

function getArgs() {
  const args = {}
  for (let i = 2; i < process.argv.length; i++) {
    const arg = process.argv[i]
    if (arg.startsWith('--')) {
      const key = arg.slice(2)
      const next = process.argv[i + 1]
      if (next && !next.startsWith('--')) {
        args[key] = next
        i++
      } else {
        args[key] = true
      }
    }
  }
  return args
}

// ============================================================================
// TEMPLATES (Standalone versions for single-email testing)
// ============================================================================

const { BRAND, escapeHtml, buildUnsubscribeLink, formatPrice, normaliseImageUrl } = require('../src/emails/emailBase')

async function buildMondayTemplate(supabase, to, baseFront) {
  // Fetch últimos 8 listings
  const since = new Date(Date.now() - 7 * 24 * 60 * 60 * 1000).toISOString()
  const { data: listings } = await supabase
    .from('listings')
    .select('id,title,slug,price,price_currency,images,brand,model,location,seller_location')
    .in('status', ['active', 'published'])
    .gte('created_at', since)
    .order('created_at', { ascending: false })
    .limit(8)
  
  const items = (listings || []).map(l => buildListingCard(l, baseFront)).join('')
  
  const html = `<!DOCTYPE html>
<html lang="es">
<head><meta charset="UTF-8"><title>Nuevos ingresos</title></head>
<body style="margin:0;padding:0;background:#f5f5f5;font-family:Inter,Arial,sans-serif;">
  <table role="presentation" cellspacing="0" cellpadding="0" border="0" align="center" style="width:100%;max-width:640px;margin:0 auto;background:#ffffff;">
    <tr><td style="padding:24px;text-align:center;border-bottom:1px solid #e5ebf3;">
      <img src="${baseFront}/site-logo.png" alt="Ciclo Market" style="height:56px;">
    </td></tr>
    <tr><td style="padding:32px 24px 16px;">
      <h1 style="margin:0 0 8px;font-size:26px;color:#0c1723;">¡Nuevos ingresos de la semana!</h1>
      <p style="margin:0;color:#64748b;">Hola, estas son las últimas bicis que ingresaron al marketplace.</p>
    </td></tr>
    <tr><td style="padding:0 24px 24px;">${items}</td></tr>
    <tr><td style="padding:0 24px 32px;text-align:center;">
      <a href="${baseFront}/marketplace" style="padding:14px 28px;background:#14212e;color:#fff;text-decoration:none;border-radius:12px;font-weight:700;">Ver todas las bicis</a>
    </td></tr>
    <tr><td style="padding:24px;background:#f6f8fb;border-top:1px solid #e5ebf3;text-align:center;">
      <p style="margin:0;font-size:12px;color:#94a3b8;">© ${new Date().getFullYear()} Ciclo Market</p>
    </td></tr>
  </table>
</body></html>`

  return {
    subject: `Nuevos ingresos en CicloMarket (${listings?.length || 0} bicis)`,
    html,
    text: `Nuevos ingresos de la semana:\n\n${(listings || []).map(l => `- ${l.title}`).join('\n')}`,
  }
}

function buildListingCard(item, baseFront) {
  const image = normaliseImageUrl(item.images?.[0], baseFront)
  const link = `${baseFront}/listing/${encodeURIComponent(item.slug || item.id)}`
  const price = formatPrice(item.price, item.price_currency)
  const location = escapeHtml(item.location || item.seller_location || '')
  const brand = escapeHtml(item.brand || '')
  const title = escapeHtml(item.title)
  
  return `
    <table role="presentation" width="100%" cellspacing="0" cellpadding="0" style="border:1px solid #e5ebf3;border-radius:12px;margin-bottom:16px;overflow:hidden;">
      <tr>
        <td><a href="${link}"><img src="${image}" style="width:100%;height:180px;object-fit:cover;display:block;"></a></td>
      </tr>
      <tr>
        <td style="padding:16px;">
          ${brand ? `<div style="font-size:12px;color:#64748b;text-transform:uppercase;">${brand}</div>` : ''}
          <div style="font-weight:600;color:#0c1723;font-size:16px;">${title}</div>
          ${price ? `<div style="color:#2563eb;font-weight:700;font-size:18px;">${price}</div>` : ''}
          ${location ? `<div style="color:#64748b;font-size:13px;">📍 ${location}</div>` : ''}
          <a href="${link}" style="display:inline-block;margin-top:12px;padding:10px 18px;background:#14212e;color:#fff;text-decoration:none;border-radius:8px;font-weight:600;">Ver publicación</a>
        </td>
      </tr>
    </table>
  `
}

// ============================================================================
// MAIN
// ============================================================================

async function main() {
  const args = getArgs()
  
  // Validaciones
  if (!args.template || !['monday', 'wednesday', 'friday'].includes(args.template)) {
    console.error('❌ Error: --template debe ser monday|wednesday|friday')
    console.error('')
    console.error('Uso:')
    console.error('  node scripts/sendTestEmail.js --template monday --to test@example.com --dry-run')
    console.error('  node scripts/sendTestEmail.js --template wednesday --to test@example.com --seller-id <uuid>')
    console.error('  node scripts/sendTestEmail.js --template friday --to test@example.com --seller-id <uuid>')
    process.exit(1)
  }
  
  if (!args.to) {
    console.error('❌ Error: Falta --to <email>')
    process.exit(1)
  }
  
  const dryRun = args['dry-run'] === true
  const baseFront = (args.frontend || process.env.FRONTEND_URL || BRAND.url).replace(/\/$/, '')
  
  console.log('📧 Email Test Script')
  console.log('====================')
  console.log(`Template: ${args.template}`)
  console.log(`To: ${args.to}`)
  console.log(`Dry run: ${dryRun}`)
  console.log(`Frontend: ${baseFront}`)
  console.log('')
  
  // Single email test con template personalizado
  if (args.template === 'monday') {
    if (!isMailConfigured()) {
      console.error('❌ Mail no configurado')
      process.exit(1)
    }
    
    const supabase = getServerSupabaseClient()
    const { subject, html, text } = await buildMondayTemplate(supabase, args.to, baseFront)
    
    console.log('📋 Subject:', subject)
    console.log('')
    
    if (dryRun) {
      console.log('📝 HTML Preview (primeros 2000 chars):')
      console.log(html.substring(0, 2000))
      console.log('...')
      console.log('')
      console.log('📝 Text Preview:')
      console.log(text)
    } else {
      await sendMail({
        from: process.env.SMTP_FROM || `Ciclo Market <admin@ciclomarket.ar>`,
        to: args.to,
        subject,
        html,
        text,
      })
      console.log('✅ Email enviado exitosamente')
    }
    return
  }
  
  // Para wednesday/friday, usamos las funciones del job con dry-run
  const limit = Number(args.limit || 5)
  const force = true // Forzar envío al email específico
  
  let result
  
  if (args.template === 'wednesday') {
    if (!args['seller-id']) {
      console.error('❌ Para wednesday se requiere --seller-id <uuid>')
      process.exit(1)
    }
    
    console.log(`Buscando seller: ${args['seller-id']}`)
    result = await sendWednesdayEmails({ dryRun: true, limit, force })
    
    // Filtrar solo el seller solicitado para preview
    const sellerData = result.recipients?.find(r => r.userId === args['seller-id'])
    if (!sellerData) {
      console.error('❌ Seller no encontrado o no tiene publicaciones activas')
      process.exit(1)
    }
    
    console.log('📋 Subject:', sellerData.subject)
    console.log('')
    console.log('📊 Stats:')
    console.log(`  - Publicaciones: ${sellerData.totalListings}`)
    console.log(`  - Visitas (7d): ${sellerData.totalViews}`)
    console.log('')
    
    if (dryRun) {
      console.log('📝 HTML Preview:')
      console.log(sellerData.preview)
    } else {
      // Reconstruir y enviar al email especificado
      const supabase = getServerSupabaseClient()
      const { buildWednesdayEmail } = require('../src/jobs/wednesdayListingUpdate')
      const { fetchUserListingsWithStats } = require('../src/jobs/wednesdayListingUpdate')
      
      const stats = await fetchUserListingsWithStats(supabase, args['seller-id'])
      const { subject, html, text } = buildWednesdayEmail({
        seller: { userId: args['seller-id'], email: args.to, fullName: sellerData.fullName || 'Ciclista' },
        stats,
        baseFront,
      })
      
      await sendMail({
        from: process.env.SMTP_FROM || `Ciclo Market <admin@ciclomarket.ar>`,
        to: args.to,
        subject,
        html,
        text,
      })
      console.log('✅ Email enviado exitosamente')
    }
  }
  
  if (args.template === 'friday') {
    if (!args['seller-id']) {
      console.error('❌ Para friday se requiere --seller-id <uuid>')
      process.exit(1)
    }
    
    console.log(`Buscando seller: ${args['seller-id']}`)
    result = await sendFridayEmails({ dryRun: true, limit, force })
    
    const sellerData = result.recipients?.find(r => r.userId === args['seller-id'])
    if (!sellerData) {
      console.error('❌ Seller no encontrado o no tiene plan free')
      process.exit(1)
    }
    
    console.log('📋 Subject:', sellerData.subject)
    console.log('📦 Listing:', sellerData.listingTitle)
    console.log('')
    
    if (dryRun) {
      console.log('📝 HTML Preview:')
      console.log(sellerData.preview)
    } else {
      const supabase = getServerSupabaseClient()
      const { buildFridayEmail } = require('../src/jobs/fridayUpgradeOffer')
      
      // Fetch listing
      const { data: listing } = await supabase
        .from('listings')
        .select('id,title,slug,price,price_currency,images,status,location,seller_location')
        .eq('seller_id', args['seller-id'])
        .in('status', ['active', 'published'])
        .or('plan.eq.free,plan_code.eq.free')
        .order('created_at', { ascending: false })
        .limit(1)
        .single()
      
      if (!listing) {
        console.error('❌ No se encontró listing free para este seller')
        process.exit(1)
      }
      
      const baseApi = process.env.SERVER_BASE_URL || baseFront
      const { subject, html, text } = buildFridayEmail({
        seller: { userId: args['seller-id'], email: args.to, fullName: 'Ciclista', listing },
        baseFront,
        baseApi,
      })
      
      await sendMail({
        from: process.env.SMTP_FROM || `Ciclo Market <admin@ciclomarket.ar>`,
        to: args.to,
        subject,
        html,
        text,
      })
      console.log('✅ Email enviado exitosamente')
    }
  }
  
  console.log('')
  console.log('🏁 Done')
}

main().catch(err => {
  console.error('❌ Error:', err.message)
  console.error(err.stack)
  process.exit(1)
})
