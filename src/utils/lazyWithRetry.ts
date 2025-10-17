import { lazy } from 'react'

function isTransientChunkError(err: unknown): boolean {
  const msg = String((err as any)?.message || err || '')
  return /Failed to fetch dynamically imported module|ChunkLoadError|Loading chunk [^ ]+ failed/i.test(msg)
}

export function lazyWithRetry<T extends React.ComponentType<any>>(
  importer: () => Promise<{ default: T }>,
  options: { retries?: number; delayMs?: number } = {}
) {
  const { retries = 1, delayMs = 400 } = options
  return lazy(async () => {
    let attempt = 0
    while (attempt <= retries) {
      try {
        const mod = await importer()
        // Clear one-shot retry flag on success
        if (sessionStorage.getItem('cm_chunk_retry')) sessionStorage.removeItem('cm_chunk_retry')
        return mod
      } catch (err) {
        attempt++
        if (!isTransientChunkError(err) || attempt > retries) {
          // If we already retried once, force a hard reload once to bust caches
          const reloaded = sessionStorage.getItem('cm_chunk_retry') === '1'
          if (isTransientChunkError(err) && !reloaded) {
            sessionStorage.setItem('cm_chunk_retry', '1')
            if (typeof window !== 'undefined') window.location.reload()
            // Return a pending promise to avoid rendering error content during reload
            return new Promise(() => {}) as Promise<any>
          }
          throw err
        }
        // Small backoff before retrying import
        await new Promise((r) => setTimeout(r, delayMs))
      }
    }
  })
}
