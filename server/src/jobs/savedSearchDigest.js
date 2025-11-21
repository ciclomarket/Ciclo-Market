const cron = require('node-cron')
const { getServerSupabaseClient } = require('../lib/supabaseClient')
const { sendMail, isMailConfigured } = require('../lib/mail')
const {
  resolveFrontendBaseUrl,
  buildListingMatchContext,
  matchesSavedSearchCriteria,
  buildSavedSearchDigestEmail,
} = require('../lib/savedSearch')

async function resolveUserEmail(supabase, userId) {
  if (!userId) return null
  try {
    const { data } = await supabase.from('users').select('email').eq('id', userId).maybeSingle()
    if (data?.email) return data.email
  } catch {}
  try {
    const { data, error } = await supabase.auth.admin.getUserById(userId)
    if (!error && data?.user?.email) return data.user.email
  } catch {}
  return null
}

async function fetchStoreFlags(supabase, sellerIds) {
  const unique = Array.from(new Set(sellerIds.filter(Boolean)))
  if (!unique.length) return new Map()
  try {
    const { data } = await supabase
      .from('users')
      .select('id, store_enabled')
      .in('id', unique)
    const map = new Map()
    for (const row of data || []) {
      if (!row?.id) continue
      map.set(String(row.id), Boolean(row.store_enabled))
    }
    return map
  } catch (err) {
    console.warn('[savedSearchDigest] store flags lookup failed', err?.message || err)
    return new Map()
  }
}

async function findMatchesForSavedSearch(supabase, criteria, frontendBase, limit = 4) {
  if (!criteria || typeof criteria !== 'object') return []

  const statuses = ['active', 'published']
  let query = supabase
    .from('listings')
    .select('id,slug,title,brand,model,year,category,subcategory,price,price_currency,original_price,location,description,material,frame_size,wheel_size,drivetrain,drivetrain_detail,extras,seller_id,images,status,created_at')
    .in('status', statuses)
    .order('created_at', { ascending: false })
    .limit(120)

  const cat = typeof criteria.cat === 'string' ? criteria.cat.trim() : ''
  if (cat && cat !== 'Todos') query = query.eq('category', cat)
  const subcat = typeof criteria.subcat === 'string' ? criteria.subcat.trim() : ''
  if (subcat) query = query.eq('subcategory', subcat)

  try {
    const { data, error } = await query
    if (error || !Array.isArray(data)) return []

    const sellerIds = data.map((row) => row?.seller_id).filter(Boolean)
    const storeMap = await fetchStoreFlags(supabase, sellerIds)

    const matches = []
    for (const listing of data) {
      if (!listing?.id) continue
      const sellerId = listing.seller_id ? String(listing.seller_id) : null
      const storeEnabled = sellerId ? Boolean(storeMap.get(sellerId)) : false
      const context = buildListingMatchContext(listing, { storeEnabled })
      if (!matchesSavedSearchCriteria(criteria, context)) continue

      const slugOrId = listing.slug || listing.id
      const listingUrl = `${frontendBase}/listing/${encodeURIComponent(slugOrId)}`
      matches.push({ listing, context, listingUrl })
      if (matches.length >= limit) break
    }
    return matches
  } catch (err) {
    console.error('[savedSearchDigest] listing fetch failed', err?.message || err)
    return []
  }
}

async function runSavedSearchDigestOnce() {
  if (!isMailConfigured()) {
    console.info('[savedSearchDigest] email not configured, skipping')
    return 0
  }

  const supabase = getServerSupabaseClient()
  const frontendBase = resolveFrontendBaseUrl()
  const { data: searches, error } = await supabase
    .from('saved_searches')
    .select('id,user_id,name,criteria,is_active')
    .eq('is_active', true)

  if (error) {
    console.error('[savedSearchDigest] saved_searches query failed', error)
    return 0
  }
  if (!Array.isArray(searches) || !searches.length) {
    console.info('[savedSearchDigest] no active saved searches')
    return 0
  }

  const emailCache = new Map()
  let sent = 0

  for (const search of searches) {
    const criteria = search?.criteria
    if (!criteria || typeof criteria !== 'object') continue
    const matches = await findMatchesForSavedSearch(supabase, criteria, frontendBase, 4)
    if (!matches.length) continue

    const userId = search.user_id ? String(search.user_id) : null
    if (!userId) continue

    let email = emailCache.get(userId)
    if (!email) {
      email = await resolveUserEmail(supabase, userId)
      if (!email) continue
      emailCache.set(userId, email)
    }

    const searchUrl = typeof criteria.url === 'string' ? criteria.url : null
    const { subject, html, text } = buildSavedSearchDigestEmail({
      alertName: search.name || null,
      matches,
      searchUrl,
      frontendBase,
    })

    try {
      await sendMail({
        from: process.env.SMTP_FROM || `Ciclo Market <${process.env.SMTP_USER || 'no-reply@ciclomarket.ar'}>`,
        to: email,
        subject,
        html,
        text,
      })
      sent += 1
    } catch (err) {
      console.error('[savedSearchDigest] send failed', { searchId: search?.id, userId, email }, err?.message || err)
    }
  }

  console.info('[savedSearchDigest] emails sent', sent)
  return sent
}

function startSavedSearchDigestJob() {
  if (process.env.SAVED_SEARCH_DIGEST_ENABLED !== 'true') {
    console.info('[savedSearchDigest] disabled (SAVED_SEARCH_DIGEST_ENABLED != \"true\")')
    return
  }
  const schedule = process.env.SAVED_SEARCH_DIGEST_CRON || '0 19 * * 3,6'
  const tz = process.env.SAVED_SEARCH_DIGEST_TZ || 'America/Argentina/Buenos_Aires'
  const task = cron.schedule(
    schedule,
    async () => {
      try {
        await runSavedSearchDigestOnce()
      } catch (err) {
        console.error('[savedSearchDigest] job failed', err)
      }
    },
    { timezone: tz },
  )
  task.start()
  console.info('[savedSearchDigest] job started with cron', schedule, 'tz', tz)
}

module.exports = {
  startSavedSearchDigestJob,
  runSavedSearchDigestOnce,
}
