const { PostHog } = require('posthog-node')

let client = null

function getPostHogClient() {
  if (client) return client

  const apiKey = String(process.env.POSTHOG_API_KEY || '').trim()
  const host = String(process.env.POSTHOG_HOST || 'https://app.posthog.com').trim()
  if (!apiKey) return null

  client = new PostHog(apiKey, { host: host || 'https://app.posthog.com' })
  return client
}

function captureServerEvent({ distinctId, event, properties }) {
  const ph = getPostHogClient()
  if (!ph || !distinctId || !event) return
  try {
    ph.capture({
      distinctId: String(distinctId),
      event: String(event),
      properties: properties && typeof properties === 'object' ? properties : {},
    })
  } catch (err) {
    console.warn('[posthog] capture failed', err?.message || err)
  }
}

module.exports = { captureServerEvent }
