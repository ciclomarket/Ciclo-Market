const { getServerSupabaseClient } = require('./supabaseClient')

function normalize(row) {
  if (!row) return null
  return {
    id: row.id,
    slug: row.slug,
    title: row.title,
    start_at: row.start_at ? new Date(row.start_at).toISOString() : null,
    end_at: row.end_at ? new Date(row.end_at).toISOString() : null,
    created_at: row.created_at ? new Date(row.created_at).toISOString() : null,
  }
}

function normalizeParticipant(row) {
  return {
    sweepstake_id: row.sweepstake_id,
    user_id: row.user_id,
    first_listing_id: row.first_listing_id,
    created_at: row.created_at ? new Date(row.created_at).toISOString() : null,
  }
}

function normalizeWinner(row) {
  return {
    sweepstake_id: row.sweepstake_id,
    user_id: row.user_id,
    selected_at: row.selected_at ? new Date(row.selected_at).toISOString() : null,
  }
}

function resolveSupabase(provided) {
  if (provided) return provided
  return getServerSupabaseClient()
}

async function getActiveSweepstake(client) {
  let supabase
  try {
    supabase = resolveSupabase(client)
  } catch (error) {
    console.warn('[sweepstakes] supabase unavailable', error?.message || error)
    return null
  }

  const nowIso = new Date().toISOString()
  try {
    const { data, error } = await supabase
      .from('sweepstakes')
      .select('*')
      .lte('start_at', nowIso)
      .gte('end_at', nowIso)
      .order('start_at', { ascending: true })
      .limit(1)
      .maybeSingle()
    if (error) {
      console.warn('[sweepstakes] active lookup failed', error)
      return null
    }
    return normalize(data)
  } catch (err) {
    console.warn('[sweepstakes] active lookup unexpected', err)
    return null
  }
}

async function getSweepstakeBySlug(slug, client) {
  if (!slug) return null
  let supabase
  try {
    supabase = resolveSupabase(client)
  } catch (error) {
    console.warn('[sweepstakes] supabase unavailable', error?.message || error)
    return null
  }
  try {
    const { data, error } = await supabase
      .from('sweepstakes')
      .select('*')
      .eq('slug', slug)
      .maybeSingle()
    if (error) {
      console.warn('[sweepstakes] slug lookup failed', error)
      return null
    }
    return normalize(data)
  } catch (err) {
    console.warn('[sweepstakes] slug lookup unexpected', err)
    return null
  }
}

function ensureIso(value) {
  if (!value) return null
  const date = new Date(value)
  if (Number.isNaN(date.getTime())) return null
  return date.toISOString()
}

async function upsertSweepstake(payload, client) {
  let supabase
  try {
    supabase = resolveSupabase(client)
  } catch (error) {
    console.warn('[sweepstakes] supabase unavailable', error?.message || error)
    throw error
  }

  const slug = (payload.slug || '').trim()
  const title = (payload.title || '').trim()
  const startAtIso = ensureIso(payload.start_at || payload.startAt)
  const endAtIso = ensureIso(payload.end_at || payload.endAt)

  if (!slug || !title || !startAtIso || !endAtIso) {
    const missing = {
      slug: !slug,
      title: !title,
      startAt: !startAtIso,
      endAt: !endAtIso,
    }
    const error = new Error('invalid_payload')
    error.details = missing
    throw error
  }

  if (new Date(startAtIso).getTime() >= new Date(endAtIso).getTime()) {
    const error = new Error('invalid_range')
    error.details = { startAt: startAtIso, endAt: endAtIso }
    throw error
  }

  try {
    const { data, error } = await supabase
      .from('sweepstakes')
      .upsert(
        {
          slug,
          title,
          start_at: startAtIso,
          end_at: endAtIso,
        },
        { onConflict: 'slug', defaultToNull: false }
      )
      .select('*')
      .maybeSingle()
    if (error) {
      console.warn('[sweepstakes] upsert failed', error)
      throw error
    }
    return normalize(data)
  } catch (err) {
    console.warn('[sweepstakes] upsert unexpected', err)
    throw err
  }
}

async function listParticipantsBySweepstakeId(sweepstakeId, client) {
  if (!sweepstakeId) return []
  let supabase
  try {
    supabase = resolveSupabase(client)
  } catch (error) {
    console.warn('[sweepstakes] supabase unavailable', error?.message || error)
    return []
  }
  try {
    const { data, error } = await supabase
      .from('sweepstakes_participants')
      .select('sweepstake_id, user_id, first_listing_id, created_at')
      .eq('sweepstake_id', sweepstakeId)
      .order('created_at', { ascending: true })
    if (error) {
      console.warn('[sweepstakes] participants fetch failed', error)
      return []
    }
    return Array.isArray(data) ? data.map(normalizeParticipant) : []
  } catch (err) {
    console.warn('[sweepstakes] participants fetch unexpected', err)
    return []
  }
}

async function getParticipantByUserId(sweepstakeId, userId, client) {
  if (!sweepstakeId || !userId) return null
  let supabase
  try {
    supabase = resolveSupabase(client)
  } catch (error) {
    console.warn('[sweepstakes] supabase unavailable', error?.message || error)
    return null
  }
  try {
    const { data, error } = await supabase
      .from('sweepstakes_participants')
      .select('sweepstake_id, user_id, first_listing_id, created_at')
      .eq('sweepstake_id', sweepstakeId)
      .eq('user_id', userId)
      .maybeSingle()
    if (error) {
      console.warn('[sweepstakes] participant lookup failed', error)
      return null
    }
    return normalizeParticipant(data)
  } catch (err) {
    console.warn('[sweepstakes] participant lookup unexpected', err)
    return null
  }
}

async function upsertWinner({ sweepstakeId, userId }, client) {
  if (!sweepstakeId || !userId) {
    const error = new Error('invalid_payload')
    throw error
  }
  let supabase
  try {
    supabase = resolveSupabase(client)
  } catch (error) {
    console.warn('[sweepstakes] supabase unavailable', error?.message || error)
    throw error
  }
  try {
    const { data, error } = await supabase
      .from('sweepstakes_winners')
      .upsert(
        {
          sweepstake_id: sweepstakeId,
          user_id: userId,
        },
        { onConflict: 'sweepstake_id', defaultToNull: false }
      )
      .select('*')
      .maybeSingle()
    if (error) {
      console.warn('[sweepstakes] winner upsert failed', error)
      throw error
    }
    return normalizeWinner(data)
  } catch (err) {
    console.warn('[sweepstakes] winner upsert unexpected', err)
    throw err
  }
}

async function getWinnerBySweepstakeId(sweepstakeId, client) {
  if (!sweepstakeId) return null
  let supabase
  try {
    supabase = resolveSupabase(client)
  } catch (error) {
    console.warn('[sweepstakes] supabase unavailable', error?.message || error)
    return null
  }
  try {
    const { data, error } = await supabase
      .from('sweepstakes_winners')
      .select('sweepstake_id, user_id, selected_at')
      .eq('sweepstake_id', sweepstakeId)
      .maybeSingle()
    if (error) {
      console.warn('[sweepstakes] winner lookup failed', error)
      return null
    }
    return normalizeWinner(data)
  } catch (err) {
    console.warn('[sweepstakes] winner lookup unexpected', err)
    return null
  }
}

module.exports = {
  getActiveSweepstake,
  getSweepstakeBySlug,
  upsertSweepstake,
  listParticipantsBySweepstakeId,
  getParticipantByUserId,
  upsertWinner,
  getWinnerBySweepstakeId,
}
