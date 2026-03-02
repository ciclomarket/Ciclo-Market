import { useEffect, useRef, useCallback } from 'react'

/**
 * Hook para manejar event listeners de forma optimizada
 * Usa passive listeners donde sea posible para mejorar INP
 */

interface EventOptions {
  passive?: boolean
  capture?: boolean
  once?: boolean
}

export function useOptimizedEvent<T extends Event>(
  eventName: string,
  handler: (event: T) => void,
  target: EventTarget | null = typeof window !== 'undefined' ? window : null,
  options: EventOptions = {}
) {
  const handlerRef = useRef(handler)
  handlerRef.current = handler

  useEffect(() => {
    if (!target) return

    // Usar passive por defecto para eventos de scroll/touch
    const isScrollOrTouch = ['scroll', 'touchstart', 'touchmove', 'wheel'].includes(eventName)
    const finalOptions = {
      passive: options.passive !== undefined ? options.passive : isScrollOrTouch,
      capture: options.capture,
      once: options.once,
    }

    const wrappedHandler = (event: Event) => {
      // Usar requestIdleCallback para no bloquear el main thread
      if ('requestIdleCallback' in window) {
        requestIdleCallback(() => {
          handlerRef.current(event as T)
        }, { timeout: 100 })
      } else {
        // Fallback para browsers sin requestIdleCallback
        setTimeout(() => {
          handlerRef.current(event as T)
        }, 0)
      }
    }

    target.addEventListener(eventName, wrappedHandler, finalOptions)

    return () => {
      target.removeEventListener(eventName, wrappedHandler, finalOptions)
    }
  }, [eventName, target, options.passive, options.capture, options.once])
}

/**
 * Hook para throttle de eventos (scroll, resize)
 */
export function useThrottledCallback<T extends (...args: any[]) => void>(
  callback: T,
  delay: number = 100
): (...args: Parameters<T>) => void {
  const timeoutRef = useRef<NodeJS.Timeout | null>(null)
  const lastCallRef = useRef<number>(0)

  return useCallback((...args: Parameters<T>) => {
    const now = Date.now()
    const timeSinceLastCall = now - lastCallRef.current

    if (timeSinceLastCall >= delay) {
      lastCallRef.current = now
      callback(...args)
    } else {
      if (timeoutRef.current) {
        clearTimeout(timeoutRef.current)
      }
      timeoutRef.current = setTimeout(() => {
        lastCallRef.current = Date.now()
        callback(...args)
      }, delay - timeSinceLastCall)
    }
  }, [callback, delay])
}

/**
 * Hook para debounce de eventos (search, input)
 */
export function useDebouncedCallback<T extends (...args: any[]) => void>(
  callback: T,
  delay: number = 300
): (...args: Parameters<T>) => void {
  const timeoutRef = useRef<NodeJS.Timeout | null>(null)

  return useCallback((...args: Parameters<T>) => {
    if (timeoutRef.current) {
      clearTimeout(timeoutRef.current)
    }
    timeoutRef.current = setTimeout(() => {
      callback(...args)
    }, delay)
  }, [callback, delay])
}

/**
 * Hook para medir y reportar INP (Interaction to Next Paint)
 */
export function useINPReporter() {
  useEffect(() => {
    if (typeof window === 'undefined' || !('PerformanceObserver' in window)) return

    let interactionCount = 0
    const interactions: { delay: number; target: string }[] = []

    const observer = new PerformanceObserver((list) => {
      for (const entry of list.getEntries()) {
        if (entry.entryType === 'event') {
          const delay = entry.processingEnd - entry.startTime
          interactionCount++
          interactions.push({
            delay,
            target: (entry.target as Element)?.tagName || 'unknown',
          })

          // Loguear interacciones lentas (> 200ms)
          if (delay > 200) {
            console.warn(`[INP] Slow interaction detected: ${delay.toFixed(2)}ms on ${entry.name}`, {
              target: entry.target,
              delay,
            })
          }
        }
      }
    })

    try {
      observer.observe({ entryTypes: ['event'] as any })
    } catch (e) {
      // Algunos browsers no soportan event timing
    }

    return () => {
      observer.disconnect()
    }
  }, [])
}

/**
 * Hook para usar Intersection Observer de forma eficiente (lazy loading)
 */
export function useIntersectionObserver(
  callback: (entries: IntersectionObserverEntry[]) => void,
  options: IntersectionObserverInit = {}
) {
  const callbackRef = useRef(callback)
  callbackRef.current = callback

  return useCallback((element: Element | null) => {
    if (!element || typeof window === 'undefined') return () => {}

    const observer = new IntersectionObserver(
      (entries) => callbackRef.current(entries),
      {
        root: options.root || null,
        rootMargin: options.rootMargin || '50px',
        threshold: options.threshold || 0,
      }
    )

    observer.observe(element)

    return () => {
      observer.unobserve(element)
      observer.disconnect()
    }
  }, [options.root, options.rootMargin, options.threshold])
}
