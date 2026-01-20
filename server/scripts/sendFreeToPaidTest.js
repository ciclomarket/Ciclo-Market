#!/usr/bin/env node
try { require('dotenv').config() } catch {}

const { getServerSupabaseClient } = require('../src/lib/supabaseClient')
const { sendMail, isMailConfigured } = require('../src/lib/mail')
const { buildEmailHtml, buildEmailText } = require('../src/jobs/campaignFreeToPaid')
const { resolveFrontendBaseUrl } = require('../src/lib/savedSearch')

async function main() {
  if (!isMailConfigured()) {
    console.error('Mail no configurado. Definí RESEND_API_KEY o SMTP_*')
    process.exit(1)
  }

  const to = process.env.TEST_EMAIL_TO || process.argv[2]
  if (!to) {
    console.error('Uso: TEST_EMAIL_TO=dest@example.com npm run campaign:free2paid:test')
    console.error('   o:  npm run campaign:free2paid:test -- dest@example.com')
    process.exit(1)
  }

  const supabase = getServerSupabaseClient()
  const { data: rows } = await supabase
    .from('listings')
    .select('id,seller_id,title,price,price_currency,images,plan,plan_code,seller_plan,status,slug,location,seller_location,updated_at')
    .or('status.in.(active,published),status.is.null')
    .or('plan.eq.free,plan_code.eq.free,seller_plan.eq.free')
    .order('updated_at', { ascending: false, nullsLast: true })
    .limit(1)
  const listing = Array.isArray(rows) && rows[0] ? rows[0] : null
  let profile = null
  if (listing?.seller_id) {
    const { data } = await supabase
      .from('users')
      .select('id,full_name,email')
      .eq('id', listing.seller_id)
      .maybeSingle()
    profile = data
  }

  const baseFront = resolveFrontendBaseUrl()
  const html = buildEmailHtml({ baseFront, profile, listing })
  const text = buildEmailText({ baseFront, listing })
  const defaultSubject = `Test Dark · Oferta de planes ${new Date().toLocaleString('es-AR')}`
  const subject = process.env.TEST_EMAIL_SUBJECT || defaultSubject

  const res = await sendMail({ to, subject, html, text })
  console.log('OK', res)
}

main().catch((e) => { console.error(e); process.exit(1) })
