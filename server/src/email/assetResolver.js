const DEFAULT_STORAGE_BASE = 'https://jmtsgywgeysagnfgdovr.supabase.co/storage/v1/object/public'

const STATIC_ASSETS = {
  footerAvatar: `${DEFAULT_STORAGE_BASE}/emails/ciclo-avatar.png`,
  instagramIcon: `${DEFAULT_STORAGE_BASE}/emails/instagram.png`,
  fallbackListing: `${DEFAULT_STORAGE_BASE}/emails/fallback-listing.png`,
}

function getAllowedHosts() {
  const raw = String(process.env.ALLOWED_IMAGE_HOSTS || '').trim()
  if (!raw) return new Set(['jmtsgywgeysagnfgdovr.supabase.co'])
  const hosts = raw.split(',').map((s) => s.trim()).filter(Boolean)
  return new Set(hosts)
}

function safeUrl(url, fallback = STATIC_ASSETS.fallbackListing) {
  const allowedHosts = getAllowedHosts()
  const value = String(url || '').trim()
  if (!value) return fallback
  try {
    const parsed = new URL(value)
    if (!allowedHosts.has(parsed.hostname)) return fallback
    return parsed.toString()
  } catch {
    return fallback
  }
}

function toAbsoluteUrl(pathOrUrl, baseUrl) {
  const raw = String(pathOrUrl || '').trim()
  if (!raw) return ''
  if (/^https?:\/\//i.test(raw)) return raw
  const base = String(baseUrl || '').trim().replace(/\/$/, '')
  if (!base) return raw
  if (raw.startsWith('/')) return `${base}${raw}`
  return `${base}/${raw}`
}

module.exports = {
  STATIC_ASSETS,
  safeUrl,
  toAbsoluteUrl,
}
