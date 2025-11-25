// src/context/PlanContext.tsx
import { createContext, useCallback, useContext, useEffect, useMemo, useState } from 'react'
import type { Plan, Subscription } from '../types'
import { FALLBACK_PLANS, fetchPlans } from '../services/plans'

interface PlanContextValue {
  plans: Plan[]
  activeSubscription: Subscription | null
  loading: boolean
  // ✅ solo producción
  initiateCheckout: (
    planId: string,
    options?: { autoRenew?: boolean }
  ) => Promise<{ url: string } | null>
  activateFreePlan: (planId: string, options?: { autoRenew?: boolean }) => Promise<void>
  cancelSubscription: () => Promise<void>
  updateAutoRenew: (autoRenew: boolean) => Promise<void>
  refresh: () => Promise<void>
}

const PlanContext = createContext<PlanContextValue | undefined>(undefined)

const API_BASE = import.meta.env.VITE_API_BASE_URL

export function PlanProvider({ children }: { children: React.ReactNode }) {
  const [plans, setPlans] = useState<Plan[]>(FALLBACK_PLANS)
  const [activeSubscription, setActiveSubscription] = useState<Subscription | null>(null)
  const [loading, setLoading] = useState(true)

  const load = useCallback(async () => {
    try {
      setLoading(true)
      const planList = await fetchPlans()
      setPlans(planList)

      // Si tenés endpoint para la suscripción del usuario, descomentá:
      // const res = await fetch(`${API_BASE}/api/subscription/me`, { credentials: 'include' })
      // setActiveSubscription(res.ok ? await res.json() : null)
    } catch (e) {
      console.error('[plans] load error', e)
    } finally {
      setLoading(false)
    }
  }, [])

  useEffect(() => { void load() }, [load])

  const initiateCheckout = useCallback<PlanContextValue['initiateCheckout']>(async (planId, options = {}) => {
    try {
      if (!API_BASE) throw new Error('VITE_API_BASE_URL no está definido')
      let headers: Record<string, string> = { 'Content-Type': 'application/json' }
      try {
        const { getSupabaseClient, supabaseEnabled } = await import('../services/supabase')
        if (supabaseEnabled) {
          const client = getSupabaseClient()
          const { data } = await client.auth.getSession()
          const token = data.session?.access_token
          if (token) headers = { ...headers, Authorization: `Bearer ${token}` }
        }
      } catch { /* noop */ }
      const res = await fetch(`${API_BASE}/api/checkout`, {
        method: 'POST',
        headers,
        credentials: 'include',
        body: JSON.stringify({ planId, autoRenew: options.autoRenew ?? true })
      })
      if (!res.ok) throw new Error(`checkout_failed (${res.status})`)
      // El backend debe devolver { url: init_point } (prod)
      const data: Partial<{ url: string; init_point: string; sandbox_init_point: string }> = await res.json()
      const url = data.url ?? data.init_point
      if (!url) throw new Error('El backend no devolvió init_point/url')
      if (url.includes('sandbox.mercadopago.com')) {
        throw new Error('El backend envió sandbox_init_point; debe enviar init_point de producción')
      }
      return { url }
    } catch (e) {
      console.error('[plans] initiateCheckout error', e)
      return null
    }
  }, [])

  const activateFreePlan = useCallback<PlanContextValue['activateFreePlan']>(async (planId, options = {}) => {
    try {
      if (!API_BASE) throw new Error('VITE_API_BASE_URL no está definido')
      const res = await fetch(`${API_BASE}/api/subscription/activate-free`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        credentials: 'include',
        body: JSON.stringify({ planId, autoRenew: options.autoRenew ?? false })
      })
      if (!res.ok) throw new Error(`activate_free_failed (${res.status})`)
      await load()
    } catch (e) {
      console.error('[plans] activateFreePlan error', e)
    }
  }, [load])

  const cancelSubscription = useCallback(async () => {
    try {
      if (!API_BASE) throw new Error('VITE_API_BASE_URL no está definido')
      const res = await fetch(`${API_BASE}/api/subscription/cancel`, {
        method: 'POST',
        credentials: 'include'
      })
      if (!res.ok) throw new Error(`cancel_failed (${res.status})`)
      await load()
    } catch (e) {
      console.error('[plans] cancelSubscription error', e)
    }
  }, [load])

  const updateAutoRenew = useCallback(async (autoRenew: boolean) => {
    try {
      if (!API_BASE) throw new Error('VITE_API_BASE_URL no está definido')
      const res = await fetch(`${API_BASE}/api/subscription/auto-renew`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        credentials: 'include',
        body: JSON.stringify({ autoRenew })
      })
      if (!res.ok) throw new Error(`auto_renew_failed (${res.status})`)
      await load()
    } catch (e) {
      console.error('[plans] updateAutoRenew error', e)
    }
  }, [load])

  const value = useMemo<PlanContextValue>(() => ({
    plans,
    activeSubscription,
    loading,
    initiateCheckout,
    activateFreePlan,
    cancelSubscription,
    updateAutoRenew,
    refresh: load
  }), [plans, activeSubscription, loading, initiateCheckout, activateFreePlan, cancelSubscription, updateAutoRenew, load])

  return <PlanContext.Provider value={value}>{children}</PlanContext.Provider>
}

export function usePlans(): PlanContextValue {
  const ctx = useContext(PlanContext)
  if (!ctx) throw new Error('usePlans must be used within PlanProvider')
  return ctx
}
