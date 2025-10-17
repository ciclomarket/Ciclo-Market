import { useEffect, useRef, useState, type ReactNode } from 'react'

type FilterDropdownProps = {
  label: string
  summary?: string
  align?: 'left' | 'right'
  disabled?: boolean
  className?: string
  buttonClassName?: string
  children: (helpers: { close: () => void }) => ReactNode
}

export default function FilterDropdown({
  label,
  summary,
  align = 'left',
  disabled = false,
  className,
  buttonClassName,
  children
}: FilterDropdownProps) {
  const [open, setOpen] = useState(false)
  const containerRef = useRef<HTMLDivElement | null>(null)

  useEffect(() => {
    if (!open) return
    const handleClickOutside = (event: MouseEvent) => {
      const target = event.target as Node | null
      if (!containerRef.current || !target) return
      if (!containerRef.current.contains(target)) {
        setOpen(false)
      }
    }
    const handleKey = (event: KeyboardEvent) => {
      if (event.key === 'Escape') {
        setOpen(false)
      }
    }
    document.addEventListener('mousedown', handleClickOutside)
    document.addEventListener('keyup', handleKey)
    return () => {
      document.removeEventListener('mousedown', handleClickOutside)
      document.removeEventListener('keyup', handleKey)
    }
  }, [open])

  return (
    <div ref={containerRef} className={`relative ${className ?? ''}`}>
      <button
        type="button"
        onClick={() => setOpen((prev) => !prev)}
        disabled={disabled}
        className={`group inline-flex items-center gap-2 rounded-full border border-white/15 bg-white/5 px-4 py-2 text-sm text-white transition focus:outline-none focus:ring-2 focus:ring-white/60 ${
          disabled ? 'cursor-not-allowed opacity-60' : 'hover:border-white/40 hover:bg-white/10'
        } ${buttonClassName ?? ''}`}
      >
        <span className="font-medium">{label}</span>
        <span className="text-xs text-white/60">{summary || 'Todos'}</span>
        <svg
          xmlns="http://www.w3.org/2000/svg"
          viewBox="0 0 24 24"
          className={`h-4 w-4 transition-transform ${open ? 'rotate-180' : ''}`}
          fill="none"
          stroke="currentColor"
          strokeWidth={1.6}
        >
          <path strokeLinecap="round" strokeLinejoin="round" d="m7 10 5 5 5-5" />
        </svg>
      </button>
      {open ? (
        <div
          className={`absolute z-30 mt-2 w-64 rounded-2xl border border-white/10 bg-[#0f1724] p-4 text-white shadow-xl backdrop-blur ${
            align === 'right' ? 'right-0' : 'left-0'
          }`}
        >
          {children({ close: () => setOpen(false) })}
        </div>
      ) : null}
    </div>
  )
}
