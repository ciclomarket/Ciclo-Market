const cron = require('node-cron')
const { getServerSupabaseClient } = require('../lib/supabaseClient')

const STORAGE_BUCKET = process.env.SUPABASE_STORAGE_BUCKET || 'listings'

function extractStorageKeysFromImages(images) {
  const keys = new Set()
  if (!Array.isArray(images)) return []
  for (const item of images) {
    if (!item) continue
    if (typeof item === 'string') {
      // Try to parse public URL into bucket key
      const m = item.match(/\/storage\/v1\/object\/public\/([^/]+)\/(.+)$/) || item.match(/\/object\/public\/([^/]+)\/(.+)$/)
      if (m && m[1] && m[2]) {
        // Ensure the bucket matches when present; otherwise assume from configured bucket
        const key = m[1] === STORAGE_BUCKET ? m[2] : m[2]
        keys.add(key)
      } else {
        // If it's a path stored already (e.g., images/uuid.jpg)
        keys.add(item.replace(/^\/+/, ''))
      }
      continue
    }
    if (typeof item === 'object') {
      const path = item.path || item.key || item.url || item.uri
      if (typeof path === 'string' && path) {
        const m = path.match(/\/storage\/v1\/object\/public\/([^/]+)\/(.+)$/) || path.match(/\/object\/public\/([^/]+)\/(.+)$/)
        if (m && m[2]) keys.add(m[2])
        else keys.add(String(path).replace(/^\/+/, ''))
      }
    }
  }
  return Array.from(keys)
}

async function purgeOnce() {
  const supabase = getServerSupabaseClient()
  const olderThanHours = Number(process.env.DELETED_PURGER_MIN_AGE_HOURS || 1)
  const threshold = new Date(Date.now() - olderThanHours * 60 * 60 * 1000).toISOString()

  // Fetch deleted listings older than threshold
  const { data: rows, error } = await supabase
    .from('listings')
    .select('id,images,created_at,updated_at,status')
    .eq('status', 'deleted')
    .lte('updated_at', threshold)
    .limit(200)
  if (error || !Array.isArray(rows) || rows.length === 0) return 0

  let purged = 0
  for (const row of rows) {
    try {
      const keys = extractStorageKeysFromImages(row.images || [])
      if (keys.length) {
        try { await supabase.storage.from(STORAGE_BUCKET).remove(keys) } catch (err) {
          console.warn('[deletedPurger] storage remove failed', row.id, err?.message || err)
        }
      }
      const { error: delErr } = await supabase.from('listings').delete().eq('id', row.id)
      if (delErr) {
        console.warn('[deletedPurger] delete row failed', row.id, delErr)
        continue
      }
      purged += 1
    } catch (err) {
      console.warn('[deletedPurger] unexpected for row', row?.id, err?.message || err)
    }
  }
  console.info('[deletedPurger] purged listings:', purged)
  return purged
}

function startDeletedPurgerJob() {
  if (process.env.DELETED_PURGER_ENABLED !== 'true') {
    console.info('[deletedPurger] disabled (DELETED_PURGER_ENABLED != "true")')
    return
  }
  const schedule = process.env.DELETED_PURGER_CRON || '17 * * * *' // hourly at minute 17
  const tz = process.env.DELETED_PURGER_TZ || 'America/Argentina/Buenos_Aires'
  const task = cron.schedule(schedule, async () => {
    try { await purgeOnce() } catch (err) { console.error('[deletedPurger] job failed', err) }
  }, { timezone: tz })
  task.start()
  console.info('[deletedPurger] job started with cron', schedule, 'tz', tz)
}

module.exports = { startDeletedPurgerJob, purgeOnce }

