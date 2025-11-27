// src/context/PlanContext.tsx
import { createContext, useCallback, useContext, useEffect, useMemo, useState } from 'react'
import type { Plan } from '../types'
import { FALLBACK_PLANS, fetchPlans } from '../services/plans'

interface PlanContextValue {
  plans: Plan[]
  loading: boolean
  refresh: () => Promise<void>
}

const PlanContext = createContext<PlanContextValue | undefined>(undefined)

export function PlanProvider({ children }: { children: React.ReactNode }) {
  const [plans, setPlans] = useState<Plan[]>(FALLBACK_PLANS)
  const [loading, setLoading] = useState(true)

  const load = useCallback(async () => {
    try {
      setLoading(true)
      const planList = await fetchPlans()
      setPlans(planList)
    } catch (e) {
      console.error('[plans] load error', e)
    } finally {
      setLoading(false)
    }
  }, [])

  useEffect(() => { void load() }, [load])

  const value = useMemo<PlanContextValue>(() => ({
    plans,
    loading,
    refresh: load
  }), [plans, loading, load])

  return <PlanContext.Provider value={value}>{children}</PlanContext.Provider>
}

export function usePlans(): PlanContextValue {
  const ctx = useContext(PlanContext)
  if (!ctx) throw new Error('usePlans must be used within PlanProvider')
  return ctx
}
