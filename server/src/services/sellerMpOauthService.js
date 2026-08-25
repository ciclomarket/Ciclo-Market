const crypto = require('crypto')
const { getServerSupabaseClient } = require('../lib/supabaseClient')
const { encryptSecret, decryptSecret } = require('../lib/crypto')

const MP_OAUTH_AUTHORIZE_URL = 'https://auth.mercadopago.com/authorization'
const MP_OAUTH_TOKEN_URL = 'https://api.mercadopago.com/oauth/token'

function isLiveModeEnabled() {
  // Kill switch explícito: hasta que se habilite, todo OAuth de Split corre en sandbox.
  return String(process.env.MP_MARKETPLACE_LIVE_MODE || '').trim() === 'true'
}

function getMarketplaceCredentials() {
  const clientId = String(process.env.MP_MARKETPLACE_CLIENT_ID || '').trim()
  const clientSecret = String(process.env.MP_MARKETPLACE_CLIENT_SECRET || '').trim()
  const redirectUri = String(process.env.MP_MARKETPLACE_REDIRECT_URI || '').trim()
  if (!clientId || !clientSecret || !redirectUri) return null
  return { clientId, clientSecret, redirectUri }
}

function signState(sellerId) {
  const secret = String(process.env.MP_OAUTH_STATE_SECRET || process.env.APP_ENCRYPTION_KEY || '').trim()
  if (!secret) throw new Error('MP_OAUTH_STATE_SECRET no configurado')
  const nonce = crypto.randomBytes(8).toString('hex')
  const payload = `${sellerId}.${nonce}`
  const sig = crypto.createHmac('sha256', secret).update(payload).digest('hex')
  return Buffer.from(`${payload}.${sig}`).toString('base64url')
}

function verifyState(state) {
  const secret = String(process.env.MP_OAUTH_STATE_SECRET || process.env.APP_ENCRYPTION_KEY || '').trim()
  if (!secret || !state) return null
  try {
    const decoded = Buffer.from(String(state), 'base64url').toString('utf8')
    const [sellerId, nonce, sig] = decoded.split('.')
    if (!sellerId || !nonce || !sig) return null
    const expected = crypto.createHmac('sha256', secret).update(`${sellerId}.${nonce}`).digest('hex')
    const sigBuf = Buffer.from(sig)
    const expectedBuf = Buffer.from(expected)
    if (sigBuf.length !== expectedBuf.length || !crypto.timingSafeEqual(sigBuf, expectedBuf)) return null
    return sellerId
  } catch {
    return null
  }
}

function buildAuthorizationUrl(sellerId) {
  const creds = getMarketplaceCredentials()
  if (!creds) throw new Error('mp_marketplace_credentials_missing')
  const state = signState(sellerId)
  const params = new URLSearchParams({
    client_id: creds.clientId,
    response_type: 'code',
    platform_id: 'mp',
    redirect_uri: creds.redirectUri,
    state,
  })
  return `${MP_OAUTH_AUTHORIZE_URL}?${params.toString()}`
}

async function exchangeCodeForToken(code) {
  const creds = getMarketplaceCredentials()
  if (!creds) throw new Error('mp_marketplace_credentials_missing')
  const liveMode = isLiveModeEnabled()
  const res = await fetch(MP_OAUTH_TOKEN_URL, {
    method: 'POST',
    headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
    body: new URLSearchParams({
      client_id: creds.clientId,
      client_secret: creds.clientSecret,
      grant_type: 'authorization_code',
      code,
      redirect_uri: creds.redirectUri,
      // Fuerza tokens de sandbox aunque la app tenga credenciales de producción,
      // hasta que se habilite MP_MARKETPLACE_LIVE_MODE explícitamente.
      test_token: liveMode ? 'false' : 'true',
    }),
  })
  const body = await res.json().catch(() => null)
  if (!res.ok || !body?.access_token) {
    throw new Error(`mp_oauth_token_exchange_failed: ${body?.message || res.status}`)
  }
  return body
}

async function saveSellerMpAccount(sellerId, tokenResponse) {
  const supabase = getServerSupabaseClient()
  const expiresInSec = Number(tokenResponse.expires_in) || 0
  const row = {
    seller_id: sellerId,
    mp_user_id: tokenResponse.user_id ? String(tokenResponse.user_id) : null,
    access_token: encryptSecret(tokenResponse.access_token),
    refresh_token: tokenResponse.refresh_token ? encryptSecret(tokenResponse.refresh_token) : null,
    public_key: tokenResponse.public_key || null,
    scopes: tokenResponse.scope ? String(tokenResponse.scope).split(' ').filter(Boolean) : [],
    token_expires_at: expiresInSec ? new Date(Date.now() + expiresInSec * 1000).toISOString() : null,
    live_mode: tokenResponse.live_mode === true && isLiveModeEnabled(),
    status: 'connected',
    connected_at: new Date().toISOString(),
    last_error: null,
    updated_at: new Date().toISOString(),
  }
  const { error } = await supabase.from('seller_mp_accounts').upsert(row, { onConflict: 'seller_id' })
  if (error) throw error
  return { ok: true }
}

async function getDecryptedSellerToken(sellerId) {
  const supabase = getServerSupabaseClient()
  const { data, error } = await supabase
    .from('seller_mp_accounts')
    .select('access_token,status,live_mode')
    .eq('seller_id', sellerId)
    .maybeSingle()
  if (error) throw error
  if (!data?.access_token || data.status !== 'connected') return null
  return { accessToken: decryptSecret(data.access_token), liveMode: Boolean(data.live_mode) }
}

module.exports = {
  buildAuthorizationUrl,
  verifyState,
  exchangeCodeForToken,
  saveSellerMpAccount,
  getDecryptedSellerToken,
  isLiveModeEnabled,
}
