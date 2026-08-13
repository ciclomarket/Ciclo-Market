const express = require('express')
const crypto = require('crypto')
const { getServerSupabaseClient } = require('../lib/supabaseClient')

const router = express.Router()

const DIDIT_API_BASE = 'https://verification.didit.me/v3'

function getSupabaseOrFail(res) {
  try {
    return getServerSupabaseClient()
  } catch (err) {
    console.error('[didit] supabase client init failed', err?.message || err)
    res.status(500).json({ ok: false, error: 'supabase_not_configured' })
    return null
  }
}

async function getAuthUser(req, supabase) {
  const header = String(req.headers.authorization || '')
  if (!header.startsWith('Bearer ')) return null
  const token = header.slice(7).trim()
  if (!token) return null
  try {
    const { data, error } = await supabase.auth.getUser(token)
    if (error || !data?.user) return null
    return data.user
  } catch (err) {
    console.warn('[didit] getAuthUser failed', err?.message || err)
    return null
  }
}

function sortKeys(value) {
  if (Array.isArray(value)) return value.map(sortKeys)
  if (value && typeof value === 'object') {
    const sorted = {}
    for (const key of Object.keys(value).sort()) sorted[key] = sortKeys(value[key])
    return sorted
  }
  return value
}

// Didit signs a canonical re-serialization of the payload (sorted keys, compact
// separators), not the raw request bytes — so this can operate on the already
// express.json()-parsed req.body. See https://docs.didit.me/integration/api-full-flow
function verifyDiditSignature(req) {
  const secret = String(process.env.DIDIT_WEBHOOK_SECRET || '').trim()
  if (!secret) return false

  const provided = String(req.headers['x-signature-v2'] || '')
  const timestamp = Number(req.headers['x-timestamp'])
  if (!provided || !timestamp) return false
  if (Math.abs(Date.now() / 1000 - timestamp) > 300) return false

  const canonical = JSON.stringify(sortKeys(req.body))
  const expected = crypto.createHmac('sha256', secret).update(canonical, 'utf8').digest('hex')

  const a = Buffer.from(expected, 'utf8')
  const b = Buffer.from(provided, 'utf8')
  return a.length === b.length && crypto.timingSafeEqual(a, b)
}

function resolveCallbackBase() {
  const raw = String(process.env.FRONTEND_URL || 'https://www.ciclomarket.ar').trim()
  const first = raw.split(',')[0]?.trim() || 'https://www.ciclomarket.ar'
  return first.replace(/\/$/, '')
}

// Create a Didit verification session for the logged-in user
router.post('/api/verification/didit/session', async (req, res) => {
  try {
    const apiKey = String(process.env.DIDIT_API_KEY || '').trim()
    const workflowId = String(process.env.DIDIT_WORKFLOW_ID || '').trim()
    if (!apiKey || !workflowId) {
      return res.status(500).json({ ok: false, error: 'didit_not_configured' })
    }

    const supabase = getSupabaseOrFail(res)
    if (!supabase) return

    const authUser = await getAuthUser(req, supabase)
    if (!authUser) return res.status(401).json({ ok: false, error: 'unauthorized' })

    const diditRes = await fetch(`${DIDIT_API_BASE}/session/`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'x-api-key': apiKey,
      },
      body: JSON.stringify({
        workflow_id: workflowId,
        callback: `${resolveCallbackBase()}/dashboard?verification=complete`,
        vendor_data: authUser.id,
      }),
    })

    if (!diditRes.ok) {
      const errText = await diditRes.text().catch(() => '')
      console.error('[didit] session create failed', diditRes.status, errText)
      return res.status(502).json({ ok: false, error: 'didit_session_failed' })
    }

    const session = await diditRes.json()

    const { error: insertError } = await supabase.from('identity_verifications').insert({
      user_id: authUser.id,
      provider: 'didit',
      session_id: session.session_id,
      status: session.status || 'Not Started',
      verification_url: session.url,
    })
    if (insertError) console.error('[didit] identity_verifications insert failed', insertError)

    return res.json({ ok: true, url: session.url, sessionId: session.session_id })
  } catch (err) {
    console.error('[didit] session route unexpected error', err)
    return res.status(500).json({ ok: false, error: 'unexpected_error' })
  }
})

// Lets the Dashboard poll the logged-in user's latest verification status
router.get('/api/verification/didit/status', async (req, res) => {
  try {
    const supabase = getSupabaseOrFail(res)
    if (!supabase) return

    const authUser = await getAuthUser(req, supabase)
    if (!authUser) return res.status(401).json({ ok: false, error: 'unauthorized' })

    const { data, error } = await supabase
      .from('identity_verifications')
      .select('status,decision,created_at,updated_at')
      .eq('user_id', authUser.id)
      .order('created_at', { ascending: false })
      .limit(1)
      .maybeSingle()

    if (error) {
      console.error('[didit] status fetch failed', error)
      return res.status(500).json({ ok: false, error: 'status_fetch_failed' })
    }

    return res.json({ ok: true, verification: data || null })
  } catch (err) {
    console.error('[didit] status route unexpected error', err)
    return res.status(500).json({ ok: false, error: 'unexpected_error' })
  }
})

// Didit webhook — the single place that flips users.verified to true
router.post('/api/webhooks/didit', async (req, res) => {
  try {
    if (!verifyDiditSignature(req)) {
      console.warn('[didit] webhook signature verification failed')
      return res.status(401).json({ ok: false, error: 'invalid_signature' })
    }

    const { status, vendor_data: userId, session_id: sessionId, decision } = req.body || {}
    if (!userId || !sessionId) {
      return res.status(400).json({ ok: false, error: 'invalid_payload' })
    }

    const supabase = getSupabaseOrFail(res)
    if (!supabase) return

    const { error: updateError } = await supabase
      .from('identity_verifications')
      .update({
        status: status || 'Unknown',
        decision: decision || null,
        updated_at: new Date().toISOString(),
      })
      .eq('session_id', sessionId)
    if (updateError) console.error('[didit] identity_verifications update failed', updateError)

    if (status === 'Approved') {
      const { error: userError } = await supabase
        .from('users')
        .update({ verified: true })
        .eq('id', userId)
      if (userError) console.error('[didit] users.verified update failed', userError)
    }

    return res.json({ ok: true })
  } catch (err) {
    console.error('[didit] webhook unexpected error', err)
    return res.status(500).json({ ok: false, error: 'unexpected_error' })
  }
})

module.exports = { diditRouter: router }
