#!/usr/bin/env node
/**
 * migrateResendToBrevo.js — Migra la audiencia de Resend a una lista de Brevo.
 *
 * Uso:
 *   node scripts/migrateResendToBrevo.js --dry-run        # solo muestra conteos
 *   node scripts/migrateResendToBrevo.js                  # importa a Brevo
 *   node scripts/migrateResendToBrevo.js --list-id 5
 *
 * Requiere (env o CLI):
 *   RESEND_API_KEY / RESEND_AUDIENCE_GENERAL_ID  → origen
 *   BREVO_API_KEY / BREVO_LIST_ID                → destino
 *
 * Reglas:
 *   - Importa SOLO contactos activos (no unsubscribed) y no suprimidos en DB.
 *   - updateEnabled=true: si el email ya existe en Brevo, lo actualiza (no duplica).
 *   - Guarda un CSV de respaldo con todos los contactos (incl. unsubscribed).
 */

const path = require('path')
const fs = require('fs')

const envPath = path.join(__dirname, '..', '.env')
if (fs.existsSync(envPath)) {
  require('dotenv').config({ path: envPath })
} else {
  require('dotenv').config()
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
const DRY_RUN = args['dry-run'] === true
const LIST_ID = String(args['list-id'] || process.env.BREVO_LIST_ID || '').trim()

const brevo = require('../src/lib/brevo')

async function fetchResendContacts(apiKey, audienceId) {
  const all = []
  const seen = new Set()
  let offset = 0
  const limit = 100
  const maxPages = 20 // tope de seguridad (máx 2000 contactos)
  for (let page = 0; page < maxPages; page++) {
    const url = `https://api.resend.com/audiences/${encodeURIComponent(audienceId)}/contacts?limit=${limit}&offset=${offset}`
    const controller = new AbortController()
    const timer = setTimeout(() => controller.abort(), 30000)
    let res
    try {
      res = await fetch(url, { headers: { Authorization: `Bearer ${apiKey}` }, signal: controller.signal })
    } finally {
      clearTimeout(timer)
    }
    const data = await res.json().catch(() => ({}))
    if (!res.ok) {
      const msg = data?.error?.message || data?.message || `Resend error ${res.status}`
      throw new Error(msg)
    }
    const batch = Array.isArray(data.data) ? data.data : []
    console.log(`  · página ${page + 1}: ${batch.length} contactos`)
    const newOnes = batch.filter((c) => c && c.email && !seen.has(String(c.email).toLowerCase()))
    for (const c of newOnes) seen.add(String(c.email).toLowerCase())
    all.push(...newOnes)

    // Romper si no hay más, o si Resend devuelve siempre el mismo bloque (ignora offset)
    if (batch.length < limit) break
    if (newOnes.length === 0) break
    offset += limit
  }
  return all
}

async function loadSuppressed(supabase) {
  const { data } = await supabase.from('email_suppressions').select('email')
  return new Set((data || []).map((r) => String(r.email || '').toLowerCase()))
}

function escapeCsv(v) {
  const s = String(v ?? '')
  if (/[",\n]/.test(s)) return `"${s.replace(/"/g, '""')}"`
  return s
}

async function main() {
  const resendKey = process.env.RESEND_API_KEY
  const audienceId = process.env.RESEND_AUDIENCE_GENERAL_ID
  if (!resendKey || !audienceId) {
    console.error('❌ Faltan RESEND_API_KEY / RESEND_AUDIENCE_GENERAL_ID en .env')
    process.exit(1)
  }
  if (!LIST_ID) {
    console.error('❌ Falta BREVO_LIST_ID (o --list-id)')
    process.exit(1)
  }
  if (!brevo.isBrevoConfigured()) {
    console.error('❌ Falta BREVO_API_KEY')
    process.exit(1)
  }

  console.log('📥 Leyendo contactos de Resend...')
  const contacts = await fetchResendContacts(resendKey, audienceId)
  console.log(`  Total en Resend: ${contacts.length}`)

  const active = contacts.filter((c) => c && c.email && !c.unsubscribed)
  const unsubscribed = contacts.filter((c) => c && c.email && c.unsubscribed)
  console.log(`  Activos: ${active.length} · Unsubscribed (excluidos): ${unsubscribed.length}`)

  // Excluir suprimidos en la DB
  const supabase = require('../src/lib/supabaseClient').getServerSupabaseClient()
  const suppressed = await loadSuppressed(supabase)
  const toImport = active.filter((c) => !suppressed.has(String(c.email).toLowerCase()))
  const skippedSuppressed = active.length - toImport.length
  console.log(`  Suprimidos en DB (excluidos): ${skippedSuppressed} · A importar: ${toImport.length}`)

  // CSV de respaldo (todos)
  const dir = path.join(__dirname, '..', '..', 'scripts', 'backups')
  fs.mkdirSync(dir, { recursive: true })
  const stamp = new Date().toISOString().slice(0, 10)
  const csvPath = path.join(dir, `resend-audience-backup-${stamp}.csv`)
  const header = 'email,first_name,last_name,unsubscribed'
  const lines = [header, ...contacts.map((c) =>
    [c.email, escapeCsv(c.first_name), escapeCsv(c.last_name), c.unsubscribed ? '1' : '0'].join(',')
  )]
  fs.writeFileSync(csvPath, lines.join('\n'))
  console.log(`💾 Backup CSV: ${csvPath}`)

  if (DRY_RUN) {
    console.log('Dry-run OK (no se importó nada a Brevo).')
    return
  }

  let imported = 0
  let failed = 0
  for (const c of toImport) {
    const name = [c.first_name, c.last_name].filter(Boolean).join(' ').trim()
    try {
      await brevo.upsertContact({
        email: String(c.email).trim().toLowerCase(),
        name: name || undefined,
        listIds: [Number(LIST_ID)],
        unsubscribed: false,
      })
      imported += 1
    } catch (err) {
      failed += 1
      console.warn(`  ❌ ${c.email}: ${err?.message || err}`)
    }
    if (imported % 50 === 0) console.log(`  ... ${imported} importados`)
  }

  console.log(`\n✅ Migración finalizada · importados: ${imported} · fallidos: ${failed} · listId=${LIST_ID}`)
}

main().catch((err) => {
  console.error('[migrateResendToBrevo] error', err)
  process.exit(1)
})
