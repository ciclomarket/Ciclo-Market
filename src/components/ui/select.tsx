import * as React from 'react'
import { cn } from '@/lib/utils'

type SelectCtx = {
  value: string
  onValueChange: (value: string) => void
  open: boolean
  setOpen: (open: boolean) => void
  placeholder?: string
  registerItem: (value: string, label: string) => void
  items: Record<string, string>
}

const SelectContext = React.createContext<SelectCtx | null>(null)

function useSelectContext() {
  const ctx = React.useContext(SelectContext)
  if (!ctx) throw new Error('Select components must be used within <Select>')
  return ctx
}

export function Select({
  value,
  onValueChange,
  children,
}: {
  value: string
  onValueChange: (value: string) => void
  children: React.ReactNode
}) {
  const [open, setOpen] = React.useState(false)
  const [items, setItems] = React.useState<Record<string, string>>({})

  const registerItem = React.useCallback((itemValue: string, label: string) => {
    setItems((prev) => (prev[itemValue] === label ? prev : { ...prev, [itemValue]: label }))
  }, [])

  React.useEffect(() => {
    if (!open) return
    const onKeyDown = (e: KeyboardEvent) => {
      if (e.key === 'Escape') setOpen(false)
    }
    const onPointerDown = (e: PointerEvent) => {
      const target = e.target as HTMLElement | null
      if (!target) return
      if (target.closest('[data-select-root]')) return
      setOpen(false)
    }
    window.addEventListener('keydown', onKeyDown)
    window.addEventListener('pointerdown', onPointerDown)
    return () => {
      window.removeEventListener('keydown', onKeyDown)
      window.removeEventListener('pointerdown', onPointerDown)
    }
  }, [open])

  const ctx = React.useMemo<SelectCtx>(
    () => ({
      value,
      onValueChange,
      open,
      setOpen,
      registerItem,
      items,
    }),
    [value, onValueChange, open, registerItem, items]
  )

  return (
    <SelectContext.Provider value={ctx}>
      <div data-select-root className="relative">
        {children}
      </div>
    </SelectContext.Provider>
  )
}

export const SelectTrigger = React.forwardRef<
  HTMLButtonElement,
  React.ButtonHTMLAttributes<HTMLButtonElement>
>(({ className, children, ...props }, ref) => {
  const { open, setOpen } = useSelectContext()
  return (
    <button
      ref={ref}
      type="button"
      aria-haspopup="listbox"
      aria-expanded={open}
      onClick={() => setOpen(!open)}
      className={cn(
        'flex h-10 w-full items-center justify-between rounded-lg border border-slate-200 bg-white px-3 py-2 text-sm text-slate-900 shadow-sm outline-none ring-offset-white focus-visible:ring-2 focus-visible:ring-slate-900 focus-visible:ring-offset-2 disabled:cursor-not-allowed disabled:opacity-50',
        className
      )}
      {...props}
    >
      {children}
      <svg
        className="ml-2 h-4 w-4 text-slate-400"
        viewBox="0 0 20 20"
        fill="none"
        stroke="currentColor"
        strokeWidth="2"
      >
        <path strokeLinecap="round" strokeLinejoin="round" d="m6 8 4 4 4-4" />
      </svg>
    </button>
  )
})
SelectTrigger.displayName = 'SelectTrigger'

export function SelectValue({ placeholder }: { placeholder?: string }) {
  const { value, items } = useSelectContext()
  return <span className={cn('truncate', value ? 'text-slate-900' : 'text-slate-400')}>{value ? items[value] ?? value : placeholder}</span>
}

export function SelectContent({ className, children }: { className?: string; children: React.ReactNode }) {
  const { open } = useSelectContext()
  if (!open) return null
  return (
    <div
      role="listbox"
      className={cn(
        'absolute z-50 mt-2 max-h-64 w-full overflow-auto rounded-lg border border-slate-200 bg-white p-1 shadow-lg',
        className
      )}
    >
      {children}
    </div>
  )
}

export function SelectItem({ value, children }: { value: string; children: React.ReactNode }) {
  const { value: current, onValueChange, setOpen, registerItem } = useSelectContext()
  const label = typeof children === 'string' ? children : undefined

  React.useEffect(() => {
    if (label) registerItem(value, label)
  }, [label, registerItem, value])

  const selected = current === value
  return (
    <button
      type="button"
      role="option"
      aria-selected={selected}
      onClick={() => {
        onValueChange(value)
        setOpen(false)
      }}
      className={cn(
        'flex w-full items-center justify-between rounded-md px-3 py-2 text-left text-sm text-slate-700 hover:bg-slate-50',
        selected && 'bg-slate-100 text-slate-900'
      )}
    >
      <span className="truncate">{children}</span>
      {selected && (
        <svg className="h-4 w-4 text-slate-900" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
          <path strokeLinecap="round" strokeLinejoin="round" d="M20 6 9 17l-5-5" />
        </svg>
      )}
    </button>
  )
}

