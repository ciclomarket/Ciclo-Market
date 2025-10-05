import { createContext, useContext, useEffect, useMemo, useState } from 'react'

export type CompareContextValue = {
  ids: string[]
  add: (id: string) => void
  remove: (id: string) => void
  toggle: (id: string) => void
  clear: () => void
  setListings: (listings: Record<string, any>) => void
  listings: Record<string, any>
}

const CompareContext = createContext<CompareContextValue | undefined>(undefined)
const STORAGE_KEY = 'mb_compare'

function loadInitial(): string[] {
  if (typeof window === 'undefined') return []
  try {
    const raw = window.localStorage.getItem(STORAGE_KEY)
    if (!raw) return []
    const parsed = JSON.parse(raw)
    return Array.isArray(parsed) ? parsed.filter((x) => typeof x === 'string') : []
  } catch {
    return []
  }
}

export function CompareProvider({ children }: { children: React.ReactNode }) {
  const [ids, setIds] = useState<string[]>(loadInitial)
  const [listings, setListings] = useState<Record<string, any>>({})

  useEffect(() => {
    try {
      window.localStorage.setItem(STORAGE_KEY, JSON.stringify(ids))
    } catch {
      /* ignore */
    }
  }, [ids])

  const add = (id: string) => setIds((prev) => (prev.includes(id) ? prev : [...prev, id]))
  const remove = (id: string) => setIds((prev) => prev.filter((item) => item !== id))
  const toggle = (id: string) => setIds((prev) => (prev.includes(id) ? prev.filter((item) => item !== id) : [...prev, id]))
  const clear = () => setIds([])

  const value = useMemo(() => ({ ids, add, remove, toggle, clear, listings, setListings }), [ids, listings])

  return <CompareContext.Provider value={value}>{children}</CompareContext.Provider>
}

export function useCompare(): CompareContextValue {
  const ctx = useContext(CompareContext)
  if (!ctx) throw new Error('useCompare must be used within CompareProvider')
  return ctx
}
