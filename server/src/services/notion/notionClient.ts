import { Client } from '@notionhq/client'

const DEFAULT_MAX_RETRIES = Number(process.env.NOTION_RETRY_MAX || 4)
const DEFAULT_BASE_DELAY_MS = Number(process.env.NOTION_RETRY_BASE_MS || 700)

let singleton: Client | null = null

export function getEnv(name: string): string | null {
  const value = String(process.env[name] || '').trim()
  return value || null
}

export function getNotionClient(): Client {
  if (singleton) return singleton

  const token = getEnv('NOTION_TOKEN')
  if (!token) {
    throw new Error('NOTION_TOKEN no configurado')
  }

  singleton = new Client({ auth: token })
  return singleton
}

function sleep(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms))
}

function extractStatus(err: unknown): number | null {
  const e = err as { status?: unknown; statusCode?: unknown }
  if (typeof e?.status === 'number') return e.status
  if (typeof e?.statusCode === 'number') return e.statusCode
  return null
}

function extractRetryAfterSeconds(err: unknown): number | null {
  const e = err as {
    headers?: Record<string, unknown> | { get?: (name: string) => string | null }
    response?: { headers?: Record<string, unknown> }
  }

  const header =
    (typeof e?.headers === 'object' && !('get' in (e.headers as object))
      ? (e.headers as Record<string, unknown>)['retry-after']
      : undefined) ||
    (typeof (e?.headers as { get?: (name: string) => string | null })?.get === 'function'
      ? (e?.headers as { get: (name: string) => string | null }).get('retry-after')
      : undefined) ||
    e?.response?.headers?.['retry-after']

  const value = Number(header)
  return Number.isFinite(value) && value > 0 ? value : null
}

function isRetryable(err: unknown): boolean {
  const status = extractStatus(err)
  if (status === 429) return true
  if (status != null && status >= 500) return true

  const e = err as { code?: unknown }
  const code = String(e?.code || '').toLowerCase()
  return code === 'rate_limited' || code === 'service_unavailable' || code === 'internal_server_error'
}

function buildRetryDelayMs(err: unknown, attempt: number): number {
  const retryAfterSeconds = extractRetryAfterSeconds(err)
  if (retryAfterSeconds) return retryAfterSeconds * 1000

  const jitter = Math.floor(Math.random() * 200)
  return Math.min(12_000, DEFAULT_BASE_DELAY_MS * (2 ** attempt) + jitter)
}

export async function notionRequest<T>(
  operationName: string,
  fn: () => Promise<T>,
  opts?: { maxRetries?: number }
): Promise<T> {
  const maxRetries = Number.isFinite(opts?.maxRetries) ? Number(opts?.maxRetries) : DEFAULT_MAX_RETRIES

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
          error: err instanceof Error ? err.message : String(err),
        })
      )

      if (!retryable || isLastAttempt) throw err

      await sleep(buildRetryDelayMs(err, attempt))
    }
  }

  throw new Error(`[notion] max retries reached for ${operationName}`)
}
