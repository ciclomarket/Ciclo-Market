import { createContext, useCallback, useContext, useEffect, useMemo, useState } from 'react'
import type { Plan, Subscription } from '../types'
import { FALLBACK_PLANS, fetchPlans } from '../services/plans'

interface PlanContextValue {
  plans: Plan[]
  activeSubscription: Subscription | null
  loading: boolean
  initiateCheckout: (planId: string, options?: { autoRenew?: boolean }) => Promise<{ init_point?: string; sandbox_init_point?: string } | null>
  activateFreePlan: (planId: string, options?: { autoRenew?: boolean }) => Promise<void>
  cancelSubscription: () => Promise<void>
  updateAutoRenew: (autoRenew: boolean) => Promise<void>
  refresh: () => Promise<void>
}

const PlanContext = createContext<PlanContextValue | undefined>(undefined)

export function PlanProvider({ children }: { children: React.ReactNode }) {
  const [plans, setPlans] = useState<Plan[]>(FALLBACK_PLANS)
  const [loading, setLoading] = useState(true)

  const load = useCallback(async () => {
    setLoading(true)
    const planList = await fetchPlans()
    setPlans(planList)
    setLoading(false)
  }, [])

  useEffect(() => {
    load()
  }, [load])

  const activateFreePlan = useCallback(async (planId: string, options: { autoRenew?: boolean } = {}) => {
    void planId
    void options
    await load()
  }, [load])

  const initiateCheckout = useCallback(async (planId: string, options: { autoRenew?: boolean } = {}) => {
    void planId
    void options
    console.warn('[plans] initiateCheckout called but subscriptions are deshabilitadas')
    return null
  }, [])

  const cancelSubscription = useCallback(async () => {
    console.warn('[plans] cancelSubscription llamado pero subscriptions deshabilitadas')
    await load()
  }, [load])

  const updateAutoRenew = useCallback(async (autoRenew: boolean) => {
    void autoRenew
    console.warn('[plans] updateAutoRenew llamado pero subscriptions deshabilitadas')
    await load()
  }, [load])

  const value = useMemo(() => ({
    plans,
    activeSubscription: null,
    loading,
    initiateCheckout,
    activateFreePlan,
    cancelSubscription,
    updateAutoRenew,
    refresh: load
  }), [plans, loading, initiateCheckout, activateFreePlan, cancelSubscription, updateAutoRenew, load])

  return <PlanContext.Provider value={value}>{children}</PlanContext.Provider>
}

export function usePlans(): PlanContextValue {
  const ctx = useContext(PlanContext)
  if (!ctx) throw new Error('usePlans must be used within PlanProvider')
  return ctx
}
