import { createContext, useCallback, useContext, useEffect, useMemo, useState } from 'react'

type Toast = { id: number; message: string; variant?: 'success' | 'error' | 'info' }

type ToastContextValue = {
  show: (message: string, opts?: { variant?: Toast['variant']; durationMs?: number }) => void
}

const ToastContext = createContext<ToastContextValue | undefined>(undefined)

export function ToastProvider({ children }: { children: React.ReactNode }) {
  const [toasts, setToasts] = useState<Toast[]>([])
  const [counter, setCounter] = useState(1)

  const show = useCallback((message: string, opts?: { variant?: Toast['variant']; durationMs?: number }) => {
    const id = counter
    setCounter((c) => c + 1)
    const variant = opts?.variant ?? 'success'
    const duration = Math.max(800, Math.min(opts?.durationMs ?? 2400, 8000))
    setToasts((prev) => [...prev, { id, message, variant }])
    window.setTimeout(() => {
      setToasts((prev) => prev.filter((t) => t.id !== id))
    }, duration)
  }, [counter])

  const value = useMemo(() => ({ show }), [show])

  return (
    <ToastContext.Provider value={value}>
      {children}
      {/* Container */}
      <div className="pointer-events-none fixed inset-x-0 bottom-6 z-[60] flex justify-center px-4">
        <div className="flex w-full max-w-md flex-col items-center gap-2">
          {toasts.map((t) => (
            <div
              key={t.id}
              className={
                `pointer-events-auto w-full rounded-xl border px-4 py-3 text-sm shadow-lg backdrop-blur ` +
                (t.variant === 'error'
                  ? 'border-red-200 bg-red-50/95 text-red-800'
                  : t.variant === 'info'
                    ? 'border-blue-200 bg-blue-50/95 text-blue-800'
                    : 'border-emerald-200 bg-emerald-50/95 text-emerald-800')
              }
              role="status"
              aria-live="polite"
            >
              {t.message}
            </div>
          ))}
        </div>
      </div>
    </ToastContext.Provider>
  )
}

export function useToast() {
  const ctx = useContext(ToastContext)
  if (!ctx) throw new Error('useToast debe usarse dentro de ToastProvider')
  return ctx
}

