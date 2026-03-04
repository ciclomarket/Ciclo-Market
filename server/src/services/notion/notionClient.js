const { Client } = require('@notionhq/client')

const DEFAULT_MAX_RETRIES = Number(process.env.NOTION_RETRY_MAX || 4)
const DEFAULT_BASE_DELAY_MS = Number(process.env.NOTION_RETRY_BASE_MS || 700)

let singleton = null

function getEnv(name) {
  const value = String(process.env[name] || '').trim()
  return value || null
}

function getNotionClient() {
  if (singleton) return singleton

  const token = getEnv('NOTION_TOKEN')
  if (!token) {
    throw new Error('NOTION_TOKEN no configurado')
  }

  singleton = new Client({ auth: token })
  return singleton
}

function sleep(ms) {
  return new Promise((resolve) => setTimeout(resolve, ms))
}

function extractStatus(err) {
  if (typeof err?.status === 'number') return err.status
  if (typeof err?.statusCode === 'number') return err.statusCode
  return null
}

function extractRetryAfterSeconds(err) {
  const header = err?.headers?.['retry-after'] || err?.headers?.get?.('retry-after') || err?.response?.headers?.['retry-after']
  if (!header) return null
  const value = Number(header)
  return Number.isFinite(value) && value > 0 ? value : null
}

function isRetryable(err) {
  const status = extractStatus(err)
  if (status === 429) return true
  if (status != null && status >= 500) return true
  const code = String(err?.code || '').toLowerCase()
  return code === 'rate_limited' || code === 'service_unavailable' || code === 'internal_server_error'
}

function buildRetryDelayMs(err, attempt) {
  const retryAfter = extractRetryAfterSeconds(err)
  if (retryAfter) return retryAfter * 1000
  const jitter = Math.floor(Math.random() * 200)
  return Math.min(12_000, DEFAULT_BASE_DELAY_MS * (2 ** attempt) + jitter)
}

async function notionRequest(operationName, fn, opts = {}) {
  const maxRetries = Number.isFinite(opts.maxRetries) ? opts.maxRetries : DEFAULT_MAX_RETRIES

  for (let attempt = 0; attempt <= maxRetries; attempt += 1) {
    try {
      return await fn()
    } catch (err) {
      const retryable = isRetryable(err)
      const isLastAttempt = attempt === maxRetries

      console.error(
        JSON.stringify({
          level: 'error',
          msg: '[notion] request_failed',
          operation: operationName,
          attempt,
          retryable,
          status: extractStatus(err),
          code: err?.code || null,
          error: err?.message || String(err),
        })
      )

      if (!retryable || isLastAttempt) throw err

      const waitMs = buildRetryDelayMs(err, attempt)
      await sleep(waitMs)
    }
  }

  throw new Error(`[notion] max retries reached for ${operationName}`)
}

module.exports = {
  getNotionClient,
  notionRequest,
  getEnv,
}
