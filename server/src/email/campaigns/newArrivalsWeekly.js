const CAMPAIGN = 'new_arrivals_weekly'
const PRIORITY = 5

function buildIdempotencyKey(userId, isoYear, isoWeek) {
  return `${CAMPAIGN}:${userId}:${isoYear}-${isoWeek}`
}

function shouldRunToday(dateCtx) {
  return dateCtx.dayOfWeek === 6 // sábado
}

async function fetchRecentListings(supabase, sinceIso) {
  const { data, error } = await supabase
    .from('listings')
    .select('id,slug,title,images,price,price_currency,created_at,status,category')
    .in('status', ['active', 'published'])
    .gte('created_at', sinceIso)
    .order('created_at', { ascending: false })
    .limit(30)
  if (error) return []
  return data || []
}

async function fetchRecipients(supabase, limit = 2000) {
  let settings = []
  try {
    const { data } = await supabase
      .from('user_notification_settings')
      .select('user_id,marketing_emails,marketing_emails_enabled')
      .limit(limit)
    settings = data || []
  } catch {}

  const enabledByUser = new Map()
  for (const row of settings) {
    const enabled = row?.marketing_emails_enabled !== false && row?.marketing_emails !== false
    enabledByUser.set(String(row.user_id), enabled)
  }

  const { data: users } = await supabase
    .from('users')
    .select('id,email,full_name')
    .limit(limit)

  return (users || [])
    .filter((u) => u?.email)
    .filter((u) => {
      if (!enabledByUser.has(String(u.id))) return true
      return enabledByUser.get(String(u.id)) === true
    })
}

async function buildCandidates({ supabase, dateCtx, baseFront, forceWeekly = false }) {
  if (!forceWeekly && !shouldRunToday(dateCtx)) return []

  const listings = await fetchRecentListings(supabase, dateCtx.since7d)
  if (!listings.length) return []

  const users = await fetchRecipients(supabase)
  if (!users.length) return []

  const cards = listings.slice(0, 10).map((l) => ({
    id: l.id,
    slug: l.slug,
    title: l.title,
    image: l.images?.[0],
    price: l.price,
    price_currency: l.price_currency,
    link: `${baseFront}/listing/${encodeURIComponent(l.slug || l.id)}`,
  }))

  return users.map((user) => ({
    campaign: CAMPAIGN,
    priority: PRIORITY,
    userId: user.id,
    email: user.email,
    idempotencyKey: buildIdempotencyKey(user.id, dateCtx.isoYear, dateCtx.isoWeek),
    payload: {
      subject: 'Nuevos ingresos de esta semana',
      title: 'Nuevos ingresos de esta semana',
      subtitle: 'Bicis recién publicadas en Ciclo Market.',
      cards,
      ctas: [{ text: 'Ver todas', url: `${baseFront}/marketplace` }],
    },
  }))
}

module.exports = {
  CAMPAIGN,
  PRIORITY,
  buildCandidates,
}
