const { getServerSupabaseClient } = require('./supabaseClient')

function extractListingId(slugOrId) {
  if (!slugOrId) return ''
  const delimiter = '--'
  const idx = slugOrId.lastIndexOf(delimiter)
  if (idx === -1) return slugOrId
  return slugOrId.slice(idx + delimiter.length)
}

function normalizeListingRow(row) {
  if (!row) return null
  return {
    id: row.id,
    slug: row.slug || null,
    title: row.title || 'Publicación en Ciclo Market',
    brand: row.brand || null,
    model: row.model || null,
    year: row.year || null,
    description: row.description || '',
    price: typeof row.price === 'number' ? row.price : null,
    priceCurrency: row.price_currency || null,
    location: row.location || null,
    status: row.status || null,
    images: Array.isArray(row.images) ? row.images : [],
    createdAt: row.created_at || null,
  }
}

async function fetchListingForShare(identifier) {
  if (!identifier) return null

  let supabase
  try {
    supabase = getServerSupabaseClient()
  } catch (error) {
    console.warn('[share] Supabase client unavailable', error?.message || error)
    return null
  }

  const slug = identifier.trim()
  if (!slug) return null

  try {
    const { data: bySlug, error: slugError } = await supabase
      .from('listings')
      .select('*')
      .eq('slug', slug)
      .maybeSingle()

    if (bySlug) return normalizeListingRow(bySlug)
    if (slugError && slugError.code && slugError.code !== 'PGRST116') {
      console.warn('[share] slug lookup error', slugError)
      return null
    }

    const lookupId = extractListingId(slug)
    const { data: byId, error: idError } = await supabase
      .from('listings')
      .select('*')
      .eq('id', lookupId)
      .maybeSingle()

    if (idError) {
      console.warn('[share] id lookup error', idError)
      return null
    }

    return normalizeListingRow(byId)
  } catch (error) {
    console.warn('[share] fetch listing failed', error)
    return null
  }
}

module.exports = {
  fetchListingForShare,
}
