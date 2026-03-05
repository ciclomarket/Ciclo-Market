const CAMPAIGN = 'external_lead_weekly'
const PRIORITY = 7

function shouldRunToday(dateCtx) {
  return dateCtx.dayOfWeek === 3 // miércoles
}

function buildIdempotencyKey(email, isoYear, isoWeek) {
  return `external_lead:${email}:${isoYear}-${isoWeek}`
}

async function fetchWeeklyListings(supabase, sinceIso) {
  const { data } = await supabase
    .from('listings')
    .select('id,slug,title,images,price,price_currency,created_at')
    .in('status', ['active', 'published'])
    .gte('created_at', sinceIso)
    .order('created_at', { ascending: false })
    .limit(12)
  return data || []
}

async function buildCandidates({ supabase, dateCtx, baseFront, forceWeekly = false }) {
  if (!forceWeekly && !shouldRunToday(dateCtx)) return []

  const [leadsRes, listings] = await Promise.all([
    supabase.from('external_leads').select('id,email,status,last_sent_at').eq('status', 'active').limit(2000),
    fetchWeeklyListings(supabase, dateCtx.since7d),
  ])

  const leads = leadsRes.data || []
  if (!leads.length || !listings.length) return []

  const minLastSent = new Date(dateCtx.now.getTime() - 14 * 24 * 60 * 60 * 1000)

  return leads
    .filter((lead) => {
      if (!lead?.email) return false
      if (!lead.last_sent_at) return true
      return new Date(lead.last_sent_at) <= minLastSent
    })
    .map((lead) => ({
      campaign: CAMPAIGN,
      priority: PRIORITY,
      email: lead.email,
      leadEmail: lead.email,
      idempotencyKey: buildIdempotencyKey(lead.email, dateCtx.isoYear, dateCtx.isoWeek),
      payload: {
        subject: 'Nuevos ingresos en Ciclo Market',
        title: 'Nuevos ingresos de la semana',
        subtitle: 'Entraron publicaciones nuevas que pueden interesarte.',
        cards: listings.map((l) => ({
          id: l.id,
          slug: l.slug,
          title: l.title,
          image: l.images?.[0],
          price: l.price,
          price_currency: l.price_currency,
          link: `${baseFront}/listing/${encodeURIComponent(l.slug || l.id)}`,
        })),
        ctas: [
          { text: 'Explorar bicis', url: `${baseFront}/marketplace` },
          { text: 'Crear cuenta', url: `${baseFront}/register` },
        ],
      },
    }))
}

module.exports = {
  CAMPAIGN,
  PRIORITY,
  buildCandidates,
}
