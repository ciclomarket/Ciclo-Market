import { useCallback, useMemo, useState } from 'react'
import type { ReactNode } from 'react'
import { useNavigate, useSearchParams } from 'react-router-dom'

import Button from '../../components/Button'
import Container from '../../components/Container'
import { useAuth } from '../../context/AuthContext'
import { useEffect } from 'react'
import { fetchUserProfile } from '../../services/users'
import { usePlans } from '../../context/PlanContext'
import { validateGift } from '../../services/gifts'
import type { Plan } from '../../types'
import { trackMetaPixel } from '../../lib/metaPixel'
import { PLAN_ORDER, type PlanCode, canonicalPlanCode, resolvePlanCode } from '../../utils/planCodes'
import { fetchMyCredits } from '../../services/credits'

const PLAN_LABEL: Record<PlanCode, string> = {
  free: 'Gratis',
  basic: 'Básica',
  premium: 'Premium'
}

function planScore(plan: Plan & { _code: PlanCode }): number {
  let score = 0
  if (canonicalPlanCode(plan.code) === plan._code) score += 8
  if (canonicalPlanCode(plan.id) === plan._code) score += 4
  if (canonicalPlanCode(plan.name) === plan._code) score += 2
  if (plan.description) score += 1
  return score
}

function formatPrice(price: number, currency: string): string {
  if (price === 0) return 'Gratis'
  return new Intl.NumberFormat(currency === 'USD' ? 'en-US' : 'es-AR', {
    style: 'currency',
    currency,
    maximumFractionDigits: 0
  }).format(price)
}

const BASE = import.meta.env.VITE_API_BASE_URL || ''
const CHECKOUT_REQUEST_TIMEOUT_MS = 15000

type ListingType = 'bike' | 'accessory' | 'apparel'

const LISTING_TYPE_COPY: Record<ListingType, { tag: string; title: string; blurb: string; cta: string }> = {
  bike: {
    tag: 'Publicá tu bici',
    title: 'Elegí la visibilidad de tu bicicleta',
    blurb: 'Pagás solo cuando querés destacar tu bici. Todas las opciones incluyen una única publicación por aviso.',
    cta: 'Publicar bicicleta'
  },
  accessory: {
    tag: 'Componentes y repuestos',
    title: 'Mostrá tus accesorios al mundo',
    blurb: 'Vendé ruedas, componentes, electrónica y repuestos con visibilidad destacada.',
    cta: 'Publicar accesorio'
  },
  apparel: {
    tag: 'Indumentaria ciclista',
    title: 'Mostrá tu equipamiento',
    blurb: 'Publicá jerseys, cascos, zapatillas y ropa técnica con información clara de talle y uso.',
    cta: 'Publicar indumentaria'
  }
}

const BikeIcon = (
  <svg
    viewBox="0 0 24 24"
    aria-hidden="true"
    className="h-6 w-6"
    fill="none"
    stroke="currentColor"
    strokeWidth={1.6}
  >
    <circle cx="6.5" cy="16.5" r="3.5" />
    <circle cx="17.5" cy="16.5" r="3.5" />
    <path d="M9.5 6.5h3.8l3.2 5.5" strokeLinecap="round" strokeLinejoin="round" />
    <path d="M10.5 10.5 9 6.5" strokeLinecap="round" />
    <path d="M10.5 10.5h4.5l-3.2 6" strokeLinecap="round" strokeLinejoin="round" />
  </svg>
)

const AccessoryIcon = (
  <svg
    viewBox="0 0 24 24"
    aria-hidden="true"
    className="h-6 w-6"
    fill="none"
    stroke="currentColor"
    strokeWidth={1.6}
  >
    <circle cx="12" cy="12" r="7" />
    <circle cx="12" cy="12" r="2.6" />
    <path d="M12 5v4" strokeLinecap="round" />
    <path d="M12 15v4" strokeLinecap="round" />
    <path d="m7.5 7.5 2.8 2.8" strokeLinecap="round" />
    <path d="m13.7 13.7 2.8 2.8" strokeLinecap="round" />
    <path d="m5 12h4" strokeLinecap="round" />
    <path d="m15 12h4" strokeLinecap="round" />
    <path d="m7.5 16.5 2.8-2.8" strokeLinecap="round" />
    <path d="m13.7 10.3 2.8-2.8" strokeLinecap="round" />
  </svg>
)

const ApparelIcon = (
  <svg
    viewBox="0 0 24 24"
    aria-hidden="true"
    className="h-6 w-6"
    fill="none"
    stroke="currentColor"
    strokeWidth={1.6}
  >
    <path d="M9 4.5 12 6l3-1.5 2.5 2.5L16 9h-1v9a1 1 0 0 1-1 1H10a1 1 0 0 1-1-1V9H8L5.5 7z" strokeLinecap="round" strokeLinejoin="round" />
    <path d="M9 12h6" strokeLinecap="round" />
  </svg>
)

const TYPE_OPTIONS: Array<{ value: ListingType; title: string; description: string; icon: ReactNode }> = [
  {
    value: 'bike',
    title: 'Bicicleta completa',
    description: 'Ideal para vender tu bici lista para salir a rodar. Sumá fotos, especificaciones y upgrades.',
    icon: BikeIcon
  },
  {
    value: 'accessory',
    title: 'Accesorios / Componentes',
    description: 'Ruedas, componentes, herramientas, electrónicos y piezas para equipar cualquier bici.',
    icon: AccessoryIcon
  },
  {
    value: 'apparel',
    title: 'Indumentaria',
    description: 'Jerseys, cascos, zapatillas y todo lo que tu equipo necesita para rodar cómodo.',
    icon: ApparelIcon
  }
]

export default function Plans() {
  const { plans, loading } = usePlans()
  const { user } = useAuth()
  const navigate = useNavigate()
  const [searchParams, setSearchParams] = useSearchParams()
  const [isStore, setIsStore] = useState<boolean>(false)
  const [processingPlan, setProcessingPlan] = useState<PlanCode | null>(null)
  const [giftCode, setGiftCode] = useState<string | null>(null)
  const [giftPlan, setGiftPlan] = useState<PlanCode | null>(null)
  const [giftValidating, setGiftValidating] = useState(false)
  const [giftError, setGiftError] = useState<string | null>(null)
  const [availableCredits, setAvailableCredits] = useState<Array<{ plan_code: 'basic' | 'premium' }>>([])

  const typeParam = searchParams.get('type')
  const listingType: ListingType | null = ((): ListingType | null => {
    if (typeParam === 'bike' || typeParam === 'accessory' || typeParam === 'apparel') return typeParam
    return null
  })()

  useEffect(() => {
    let active = true
    ;(async () => {
      try {
        if (!user?.id) { setIsStore(false); return }
        const profile = await fetchUserProfile(user.id)
        if (!active) return
        setIsStore(Boolean(profile?.store_enabled))
      } catch {
        if (active) setIsStore(false)
      }
    })()
    return () => { active = false }
  }, [user?.id])

  // Cargar créditos disponibles del usuario (si hay API base)
  useEffect(() => {
    let active = true
    ;(async () => {
      try {
        if (!user?.id) { setAvailableCredits([]); return }
        const rows = await fetchMyCredits(user.id)
        if (!active) return
        setAvailableCredits(rows.map((r) => ({ plan_code: r.plan_code })))
      } catch {
        if (active) setAvailableCredits([])
      }
    })()
    return () => { active = false }
  }, [user?.id])

  // Si es tienda oficial y ya eligió tipo, saltamos la pantalla de planes
  useEffect(() => {
    if (isStore && listingType) {
      navigate(`/publicar/nueva?type=${listingType}&plan=pro`, { replace: true })
    }
  }, [isStore, listingType, navigate])

  const paymentStatus = searchParams.get('payment') ?? undefined
  const paymentPlanParam = canonicalPlanCode(searchParams.get('plan'))

  // Detectar y validar gift en esta pantalla también, así preselecciona y evita checkout
  useMemo(() => {
    const code = searchParams.get('gift')?.trim() || null
    if (!code) { setGiftCode(null); setGiftPlan(null); setGiftError(null); return null }
    const cancelled = false
    setGiftValidating(true)
    setGiftError(null)
    ;(async () => {
      try {
        const res = await validateGift(code)
        if (cancelled) return
        if (res.ok && (res.plan === 'basic' || res.plan === 'premium')) {
          setGiftCode(code)
          setGiftPlan(res.plan as PlanCode)
        } else {
          setGiftCode(null)
          setGiftPlan(null)
          setGiftError('El código de regalo no es válido o está vencido.')
        }
      } catch {
        if (!cancelled) setGiftError('No pudimos validar el código de regalo.')
      } finally {
        if (!cancelled) setGiftValidating(false)
      }
    })()
    return null
  }, [searchParams])

  const visiblePlans = useMemo(() => {
    const enriched = plans
      .map((plan) => {
        const code = resolvePlanCode(plan)
        if (!code) return null
        return { ...plan, _code: code }
      })
      .filter((plan): plan is Plan & { _code: PlanCode } => Boolean(plan))

    const deduped = new Map<PlanCode, { plan: Plan & { _code: PlanCode }; score: number }>()

    for (const plan of enriched) {
      const candidateScore = planScore(plan)
      const current = deduped.get(plan._code)
      if (!current) {
        deduped.set(plan._code, { plan, score: candidateScore })
        continue
      }
      if (candidateScore > current.score) {
        deduped.set(plan._code, { plan, score: candidateScore })
        continue
      }
      if (candidateScore === current.score && plan.price > current.plan.price) {
        deduped.set(plan._code, { plan, score: candidateScore })
      }
    }

    return Array.from(deduped.values())
      .map(({ plan }) => plan)
      .sort((a, b) => PLAN_ORDER.indexOf(a._code) - PLAN_ORDER.indexOf(b._code))
  }, [plans])

  const clearPaymentParams = useCallback(() => {
    const next = new URLSearchParams(searchParams)
    next.delete('payment')
    next.delete('plan')
    setSearchParams(next, { replace: true })
  }, [searchParams, setSearchParams])

  const setListingType = useCallback((type: ListingType) => {
    const next = new URLSearchParams(searchParams)
    next.set('type', type)
    next.delete('payment')
    next.delete('plan')
    setSearchParams(next, { replace: true })
  }, [searchParams, setSearchParams])

  const handleSelect = useCallback(async (plan: Plan & { _code: PlanCode }) => {
    if (!listingType) {
      alert('Seleccioná qué deseas vender antes de elegir un plan.')
      return
    }
    const planCode = plan._code
    if (!user) {
      navigate('/login', {
        state: {
          from: {
            pathname: '/publicar',
            search: `?type=${listingType}&plan=${encodeURIComponent(planCode)}`
          }
        }
      })
      return
    }

    // Bonificado por gift: saltar checkout y pasar el gift al form
    if (giftCode && giftPlan && giftPlan === planCode) {
      clearPaymentParams()
      const next = new URLSearchParams({ type: listingType, plan: planCode, gift: giftCode })
      navigate(`/publicar/nueva?${next.toString()}`)
      return
    }

    if (plan.price === 0) {
      clearPaymentParams()
      navigate(`/publicar/nueva?type=${listingType}&plan=${encodeURIComponent(planCode)}`)
      return
    }

    // Si tiene crédito disponible para este plan, saltar checkout
    const hasCredit = availableCredits.some((c) => c.plan_code === planCode)
    if (hasCredit && (planCode === 'basic' || planCode === 'premium')) {
      clearPaymentParams()
      const next = new URLSearchParams({ type: listingType, plan: planCode, credit: '1' })
      navigate(`/publicar/nueva?${next.toString()}`)
      return
    }

    if (!BASE) {
      alert('Configurá VITE_API_BASE_URL en tu entorno para iniciar el pago.')
      return
    }

    const controller = typeof AbortController !== 'undefined' ? new AbortController() : null
    const timeoutId = controller
      ? window.setTimeout(() => {
          controller?.abort()
        }, CHECKOUT_REQUEST_TIMEOUT_MS)
      : null

    try {
      setProcessingPlan(planCode)
      // Pixel: iniciar checkout (solo planes pagos)
      try {
        trackMetaPixel('InitiateCheckout', {
          content_ids: [plan.id || planCode],
          content_name: plan.name,
          content_type: 'product',
          value: typeof plan.price === 'number' ? plan.price : 0,
          currency: plan.currency || 'ARS'
        })
      } catch { /* noop */ }
      const response = await fetch(`${BASE}/api/checkout`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        signal: controller?.signal,
        body: JSON.stringify({
          planId: plan.id ?? planCode,
          planCode,
          planName: plan.name,
          planCurrency: plan.currency,
          userId: user.id,
          autoRenew: false,
          amount: typeof plan.price === 'number' ? plan.price : undefined,
          redirectUrls: {
            success: `${window.location.origin}/publicar?type=${listingType}&payment=success&plan=${planCode}`,
            failure: `${window.location.origin}/publicar?type=${listingType}&payment=failure&plan=${planCode}`,
            pending: `${window.location.origin}/publicar?type=${listingType}&payment=pending&plan=${planCode}`
          }
        })
      })
      const data = await response.json()
      const redirectUrl = data?.init_point ?? data?.url
      if (!response.ok || !redirectUrl) {
        console.error('[plans] init checkout error', data)
        alert('No pudimos iniciar el pago. Intentá nuevamente en unos minutos.')
        return
      }
      window.location.href = redirectUrl
    } catch (error) {
      const aborted = controller?.signal.aborted ?? false
      console.error('[plans] init checkout failed', error)
      if (aborted) {
        alert('No pudimos iniciar el pago a tiempo. Revisá tu conexión o intentá nuevamente.')
      } else {
        alert('No pudimos iniciar el pago. Revisá tu conexión e intentá de nuevo.')
      }
    } finally {
      if (timeoutId) window.clearTimeout(timeoutId)
      setProcessingPlan(null)
    }
  }, [user, navigate, clearPaymentParams, listingType, giftCode, giftPlan])

  const planFromQuery = useMemo(() => {
    if (!paymentPlanParam) return null
    return visiblePlans.find((plan) => plan._code === paymentPlanParam) ?? null
  }, [paymentPlanParam, visiblePlans])

  // Pixel: track resultado del checkout y limpiar query para evitar duplicados
  useMemo(() => {
    if (!paymentStatus || !planFromQuery) return null
    try {
      if (paymentStatus === 'success') {
        trackMetaPixel('Purchase', {
          content_ids: [planFromQuery.id || planFromQuery._code],
          content_name: planFromQuery.name,
          content_type: 'product',
          value: typeof planFromQuery.price === 'number' ? planFromQuery.price : 0,
          currency: planFromQuery.currency || 'ARS'
        })
      } else if (paymentStatus === 'failure') {
        trackMetaPixel('CheckoutFailure', {
          content_ids: [planFromQuery.id || planFromQuery._code],
          content_name: planFromQuery.name,
          content_type: 'product'
        })
      } else if (paymentStatus === 'pending') {
        trackMetaPixel('CheckoutPending', {
          content_ids: [planFromQuery.id || planFromQuery._code],
          content_name: planFromQuery.name,
          content_type: 'product'
        })
      }
    } catch { /* noop */ }
    // limpiar parámetros para no recontar
    clearPaymentParams()
    return null
  }, [paymentStatus, planFromQuery, clearPaymentParams])

  if (!listingType) {
    return (
      <div className="min-h-[calc(100vh-120px)] bg-[#0c1723] py-12 text-white">
        <Container>
          <div className="mx-auto max-w-6xl text-center space-y-6">
            <span className="inline-flex items-center justify-center gap-2 rounded-full border border-white/20 bg-white/10 px-3 py-1 text-xs uppercase tracking-[0.3em] text-white/70">
              ¿Qué querés publicar?
            </span>
            <h1 className="text-3xl font-bold sm:text-4xl">Elegí el tipo de aviso</h1>
            <p className="text-sm text-white/75">
              Organizamos la información según lo que vendas para que compradores encuentren rápido tu publicación.
            </p>
            <p className="text-xs text-white/60">
              Nota del plan Gratis: 15 días online, hasta 1 publicación activa, contacto por email (sin WhatsApp). Podés
              mejorar visibilidad con los planes Básico o Premium.
            </p>
            <div className="mx-auto grid w-full max-w-[80vw] gap-6 md:grid-cols-3">
              {TYPE_OPTIONS.map((option) => (
                <button
                  key={option.value}
                  type="button"
                  onClick={() => setListingType(option.value)}
                  className="group flex h-full flex-col gap-4 rounded-3xl border border-white/10 bg-white/5 p-6 text-left transition hover:border-white/30 hover:bg-white/10"
                >
                  <div className="flex items-start gap-3">
                    <div className="grid size-12 place-content-center rounded-2xl border border-white/15 bg-white/10 text-white/80 transition group-hover:border-white/40 group-hover:text-white">
                      {option.icon}
                    </div>
                    <div className="flex-1">
                      <div className="flex items-center justify-between gap-4">
                        <h2 className="text-xl font-semibold text-white">{option.title}</h2>
                      </div>
                      <p className="mt-2 text-sm text-white/70">{option.description}</p>
                    </div>
                  </div>
                  <div className="mt-auto flex w-full justify-center">
                    <span className="inline-flex items-center gap-2 rounded-full border border-white/20 bg-white/10 px-4 py-2 text-sm font-semibold text-white transition group-hover:border-white/40 group-hover:bg-white/20">
                      Seleccionar
                    </span>
                  </div>
                </button>
              ))}
            </div>
          </div>
        </Container>
      </div>
    )
  }

  const copy = LISTING_TYPE_COPY[listingType]

  if (isStore) {
    // Para tiendas, mostrar un CTA único y simple
    return (
      <div className="min-h-[calc(100vh-120px)] bg-[#0c1723] py-12">
        <Container>
          <div className="mx-auto max-w-3xl text-center space-y-6 text-white">
            <span className="inline-flex items-center justify-center gap-2 rounded-full border border-white/20 bg-white/10 px-3 py-1 text-xs uppercase tracking-[0.3em] text-white/70">Tienda oficial</span>
            <h1 className="text-3xl font-bold">Publicaciones ilimitadas sin costo</h1>
            <p className="text-sm text-white/75">Tu cuenta de tienda oficial tiene publicaciones ilimitadas y no vence. Elegí qué querés publicar y continuá.</p>
            <div className="flex flex-wrap justify-center gap-3">
              {(['bike','accessory','apparel'] as ListingType[]).map((t) => (
                <Button key={t} onClick={() => navigate(`/publicar/nueva?type=${t}&plan=pro`)} className="bg-white text-[#14212e] hover:bg-white/90">
                  {LISTING_TYPE_COPY[t].cta}
                </Button>
              ))}
            </div>
          </div>
        </Container>
      </div>
    )
  }

  return (
    <div className="min-h-[calc(100vh-120px)] bg-[#0c1723] py-12">
      <Container>
        <div className="text-center text-white">
          <span className="inline-flex items-center gap-2 rounded-full border border-white/20 bg-white/10 px-3 py-1 text-xs uppercase tracking-[0.4em] text-white/70">
            {copy.tag}
          </span>
          <h1 className="mt-4 text-3xl font-bold sm:text-4xl">
            {copy.title}
          </h1>
          <p className="mt-3 mx-auto max-w-2xl text-sm text-white/70">
            {copy.blurb}
          </p>
        </div>

        {planFromQuery && paymentStatus === 'success' && (
          <div className="mt-8 rounded-3xl border border-white/20 bg-white/90 p-6 text-[#14212e] shadow">
            <h2 className="text-lg font-semibold">Pago confirmado</h2>
            <p className="mt-2 text-sm text-[#14212e]/80">
              Tu plan {PLAN_LABEL[planFromQuery._code]} está activo. Completá el formulario para publicar tu aviso.
            </p>
            <div className="mt-4 flex flex-wrap gap-3">
              <Button
                className="bg-[#14212e] text-white hover:bg-[#1b2f3f]"
                onClick={() => {
                  clearPaymentParams()
                  navigate(`/publicar/nueva?type=${listingType}&plan=${planFromQuery._code}`)
                }}
              >
                {copy.cta}
              </Button>
              <Button
                variant="ghost"
                onClick={clearPaymentParams}
              >
                Cerrar
              </Button>
            </div>
          </div>
        )}

        {planFromQuery && paymentStatus === 'failure' && (
          <div className="mt-8 rounded-3xl border border-red-200 bg-red-50 p-6 text-red-900 shadow">
            <h2 className="text-lg font-semibold">El pago no se completó</h2>
            <p className="mt-2 text-sm">
              No pudimos procesar el pago de tu plan {PLAN_LABEL[planFromQuery._code]}. Revisá tus datos y probá nuevamente.
            </p>
            <div className="mt-4 flex flex-wrap gap-3">
              <Button
                className="bg-red-600 text-white hover:bg-red-700"
                onClick={() => handleSelect(planFromQuery)}
              >
                Reintentar pago
              </Button>
              <Button variant="ghost" onClick={clearPaymentParams}>
                Cerrar
              </Button>
            </div>
          </div>
        )}

        {planFromQuery && paymentStatus === 'pending' && (
          <div className="mt-8 rounded-3xl border border-amber-200 bg-amber-50 p-6 text-amber-900 shadow">
            <h2 className="text-lg font-semibold">Pago en revisión</h2>
            <p className="mt-2 text-sm">
              Mercado Pago está revisando tu operación. Te avisaremos por email cuando se confirme.
            </p>
            <div className="mt-4">
              <Button variant="ghost" onClick={clearPaymentParams}>
                Entendido
              </Button>
            </div>
          </div>
        )}

        {planFromQuery && !paymentStatus && (
          <div className="mt-8 rounded-3xl border border-white/20 bg-white/90 p-6 text-[#14212e] shadow">
            <h2 className="text-lg font-semibold">Plan {PLAN_LABEL[planFromQuery._code]} seleccionado</h2>
            <p className="mt-2 text-sm text-[#14212e]/80">
              Iniciá el pago para habilitar tu publicación.
            </p>
            <div className="mt-4">
              <Button className="bg-[#14212e] text-white hover:bg-[#1b2f3f]" onClick={() => handleSelect(planFromQuery)}>
                Ir al checkout
              </Button>
            </div>
          </div>
        )}

        {availableCredits.length > 0 && (
          <div className="mt-8 rounded-3xl border border-emerald-200 bg-emerald-50 p-6 text-emerald-900 shadow">
            <h2 className="text-lg font-semibold">Tenés créditos disponibles</h2>
            <p className="mt-2 text-sm">Podés crear tu publicación sin pagar nuevamente.</p>
            <div className="mt-3 flex flex-wrap gap-3">
              {['basic','premium'].map((code) => (
                availableCredits.some((c) => c.plan_code === code) ? (
                  <Button
                    key={code}
                    className="bg-emerald-600 text-white hover:bg-emerald-700"
                    onClick={() => navigate(`/publicar/nueva?type=${listingType || 'bike'}&plan=${code}&credit=1`)}
                  >
                    Usar crédito {code === 'basic' ? 'Básica' : 'Premium'}
                  </Button>
                ) : null
              ))}
            </div>
          </div>
        )}

        <div className="mt-10 grid gap-6 md:grid-cols-3">
          {visiblePlans.map((plan) => {
            const planCode = plan._code
            const listingDuration = plan.listingDurationDays ?? plan.periodDays
            const priceLabel = giftPlan === planCode && giftCode ? 'Bonificado' : formatPrice(plan.price, plan.currency)
            const displayName = PLAN_LABEL[planCode] ?? plan.name ?? planCode

            const accent =
              planCode === 'premium'
                ? '#d97706' // naranja (Premium)
                : planCode === 'basic'
                ? '#2563eb' // azul (Básica)
                : '#0f766e' // verde-teal (Gratis)

            const features: string[] = []

            features.push(`Hasta ${plan.maxPhotos} fotos por publicación`)
            features.push(
              plan.featuredDays > 0
                ? `Destacada ${plan.featuredDays} ${plan.featuredDays === 1 ? 'día' : 'días'} en portada`
                : 'Sin destaque en portada'
            )
            features.push(plan.whatsappEnabled ? 'WhatsApp directo habilitado' : 'Sin WhatsApp (contacto por email)')
            if (planCode !== 'free') {
              features.push(`Duración ${listingDuration} días`)
            }
            if (typeof plan.maxListings === 'number') {
              if (plan.maxListings > 0) {
                const plural = plan.maxListings === 1 ? '' : 'es'
                const activPlural = plan.maxListings === 1 ? 'a' : 'as'
                features.push(`Hasta ${plan.maxListings} publicación${plural} activ${activPlural}`)
              } else {
                features.push('Publicaciones ilimitadas')
              }
            }
            if (plan.socialBoost) features.push('Publicación en Instagram y Facebook')
            // Cierre descriptivo por plan
            if (planCode === 'free') features.push('Publicá gratis por 15 días. Hasta 4 fotos, contacto por email')
            if (planCode === 'basic') features.push('60 días online, y contacto directo por WhatsApp')
            if (planCode === 'premium') features.push('Difusión en redes y contacto por WhatsApp')

            const isRecommended = planCode === 'basic'

            return (
              <div
                key={planCode}
                className="relative overflow-hidden rounded-[30px] border border-white/10 bg-white/10 p-6 backdrop-blur shadow-[0_30px_80px_rgba(12,20,28,0.35)]"
              >
                {isRecommended && (
                  <div className="absolute right-4 top-4 z-10 rounded-full bg-white px-3 py-1 text-xs font-semibold text-[#14212e]">
                    Recomendado
                  </div>
                )}

                <div className="relative z-10 flex flex-col gap-4 text-white">
                  <div>
                    <h3 className="text-xl font-semibold">
                      {displayName}
                    </h3>
                    <p className="text-xs uppercase tracking-[0.3em] text-white/60">
                      {listingDuration} días activo
                    </p>
                  </div>

                  <div>
                    <span className="text-3xl font-bold">{priceLabel}</span>
                  </div>

                  {plan.description && (
                    <p className="text-sm text-white/70">{plan.description}</p>
                  )}

                  <ul className="mt-2 space-y-2 text-sm text-white/80">
                    {features.map((feature, index) => (
                      <li key={index} className="flex items-start gap-2">
                        <span
                          className="mt-1 h-2 w-2 rounded-full"
                          style={{ backgroundColor: accent }}
                        />
                        <span>{feature}</span>
                      </li>
                    ))}
                  </ul>

                  <Button
                    onClick={() => handleSelect(plan)}
                    disabled={loading || processingPlan === planCode}
                    className="mt-4 bg-white text-[#14212e] hover:bg-white/90"
                    aria-label={`Seleccionar plan ${displayName}`}
                  >
                    {processingPlan === planCode ? 'Redirigiendo…' : 'Elegir este plan'}
                  </Button>
                </div>

                <div
                  className="absolute inset-0 z-0 opacity-30"
                  style={{ background: `radial-gradient(circle at top, ${accent}, transparent 65%)` }}
                />
              </div>
            )
          })}
        </div>

        <div className="mt-16 overflow-hidden rounded-[28px] border border-white/10 bg-white/80 p-8 shadow-[0_25px_60px_rgba(12,20,28,0.45)]">
          <div className="grid gap-6 lg:grid-cols-[1fr_auto] lg:items-center">
            <div>
              <span className="text-xs font-semibold uppercase tracking-[0.4em] text-[#14212e]/60">
                Tienda oficial
              </span>
              <h2 className="mt-4 text-2xl font-bold text-[#14212e]">
                ¿Querés abrir tu tienda propia en Ciclo Market?
              </h2>
              <p className="mt-3 text-sm text-[#14212e]/70">
                Catálogo ilimitado, branding a medida, campañas de performance, analytics y soporte dedicado.
              </p>
            </div>
            <div className="flex flex-col gap-3 lg:text-right">
              <span className="text-sm font-semibold text-[#14212e]">
                Contactanos y recibí una demo personalizada.
              </span>
              <a
                href="mailto:admin@ciclomarket.ar"
                className="inline-flex items-center justify-center rounded-full bg-[#14212e] px-5 py-3 text-sm font-semibold text-white transition hover:bg-[#1d2d3f]"
              >
                Escribinos a admin@ciclomarket.ar
              </a>
            </div>
          </div>
        </div>
      </Container>
    </div>
  )
}
