import { createContext, useCallback, useContext, useEffect, useMemo, useState, type ReactNode } from 'react'
import { fetchActiveSweepstake } from '../services/sweepstakes'
import type { Sweepstake } from '../types'

type SweepstakesContextValue = {
  active: Sweepstake | null
  loading: boolean
  refresh: () => Promise<void>
}

const defaultValue: SweepstakesContextValue = {
  active: null,
  loading: false,
  refresh: async () => {},
}

const SweepstakesContext = createContext<SweepstakesContextValue>(defaultValue)

export function SweepstakesProvider({ children }: { children: ReactNode }) {
  const [active, setActive] = useState<Sweepstake | null>(null)
  const [loading, setLoading] = useState<boolean>(true)

  const loadActive = useCallback(async (): Promise<Sweepstake | null> => {
    try {
      return await fetchActiveSweepstake()
    } catch (error) {
      console.warn('[sweepstakes] fetch active failed', error)
      return null
    }
  }, [])

  const refresh = useCallback(async () => {
    setLoading(true)
    try {
      const next = await loadActive()
      setActive(next)
    } finally {
      setLoading(false)
    }
  }, [loadActive])

  useEffect(() => {
    let alive = true
    setLoading(true)
    loadActive()
      .then((next) => {
        if (!alive) return
        setActive(next)
      })
      .catch((error) => {
        console.warn('[sweepstakes] initial load failed', error)
        if (!alive) return
        setActive(null)
      })
      .finally(() => {
        if (!alive) return
        setLoading(false)
      })
    return () => {
      alive = false
    }
  }, [loadActive])

  const value = useMemo<SweepstakesContextValue>(
    () => ({
      active,
      loading,
      refresh,
    }),
    [active, loading, refresh]
  )

  return <SweepstakesContext.Provider value={value}>{children}</SweepstakesContext.Provider>
}

export function useSweepstakes(): SweepstakesContextValue {
  return useContext(SweepstakesContext)
}
