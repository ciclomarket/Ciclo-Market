import { useCallback, useMemo, useState } from 'react'
import { useNavigate, useSearchParams } from 'react-router-dom'

import Button from '../../components/Button'
import Container from '../../components/Container'
import { useAuth } from '../../context/AuthContext'
import { usePlans } from '../../context/PlanContext'
import type { Plan } from '../../types'
import { PLAN_ORDER, type PlanCode, canonicalPlanCode, resolvePlanCode } from '../../utils/planCodes'

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

export default function Plans() {
  const { plans, loading } = usePlans()
  const { user } = useAuth()
  const navigate = useNavigate()
  const [searchParams, setSearchParams] = useSearchParams()
  const [processingPlan, setProcessingPlan] = useState<PlanCode | null>(null)

  const paymentStatus = searchParams.get('payment') ?? undefined
  const paymentPlanParam = canonicalPlanCode(searchParams.get('plan'))

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

  const handleSelect = useCallback(async (plan: Plan & { _code: PlanCode }) => {
    const planCode = plan._code
    if (!user) {
      navigate('/login', {
        state: {
          from: { pathname: '/publicar', search: `?plan=${encodeURIComponent(planCode)}` }
        }
      })
      return
    }

    if (plan.price === 0) {
      clearPaymentParams()
      navigate(`/publicar/nueva?plan=${encodeURIComponent(planCode)}`)
      return
    }

    if (!BASE) {
      alert('Configurá VITE_API_BASE_URL en tu entorno para iniciar el pago.')
      return
    }

    try {
      setProcessingPlan(planCode)
      const response = await fetch(`${BASE}/api/checkout`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          planId: plan.id ?? planCode,
          planCode,
          planName: plan.name,
          planCurrency: plan.currency,
          userId: user.id,
          autoRenew: false,
          amount: typeof plan.price === 'number' ? plan.price : undefined,
          redirectUrls: {
            success: `${window.location.origin}/publicar?payment=success&plan=${planCode}`,
            failure: `${window.location.origin}/publicar?payment=failure&plan=${planCode}`,
            pending: `${window.location.origin}/publicar?payment=pending&plan=${planCode}`
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
      console.error('[plans] init checkout failed', error)
      alert('No pudimos iniciar el pago. Revisá tu conexión e intentá de nuevo.')
    } finally {
      setProcessingPlan(null)
    }
  }, [user, navigate, clearPaymentParams])

  const planFromQuery = useMemo(() => {
    if (!paymentPlanParam) return null
    return visiblePlans.find((plan) => plan._code === paymentPlanParam) ?? null
  }, [paymentPlanParam, visiblePlans])

  return (
    <div className="min-h-[calc(100vh-120px)] bg-[#0c1723] py-12">
      <Container>
        <div className="text-center text-white">
          <span className="inline-flex items-center gap-2 rounded-full border border-white/20 bg-white/10 px-3 py-1 text-xs uppercase tracking-[0.4em] text-white/70">
            Destacados por publicación
          </span>
          <h1 className="mt-4 text-3xl font-bold sm:text-4xl">
            Elegí la visibilidad de tu aviso
          </h1>
          <p className="mt-3 mx-auto max-w-2xl text-sm text-white/70">
            Pagás solo cuando querés destacar tu bicicleta. Todas las opciones incluyen una única publicación por aviso.
          </p>
        </div>

        {planFromQuery && paymentStatus === 'success' && (
          <div className="mt-8 rounded-3xl border border-white/20 bg-white/90 p-6 text-[#14212e] shadow">
            <h2 className="text-lg font-semibold">Pago confirmado</h2>
            <p className="mt-2 text-sm text-[#14212e]/80">
              Tu plan {PLAN_LABEL[planFromQuery._code]} está activo. Completá el formulario para publicar tu bicicleta.
            </p>
            <div className="mt-4 flex flex-wrap gap-3">
              <Button
                className="bg-[#14212e] text-white hover:bg-[#1b2f3f]"
                onClick={() => {
                  clearPaymentParams()
                  navigate(`/publicar/nueva?plan=${planFromQuery._code}`)
                }}
              >
                Publicar ahora
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
              Iniciá el pago para habilitar la publicación de tu bicicleta.
            </p>
            <div className="mt-4">
              <Button className="bg-[#14212e] text-white hover:bg-[#1b2f3f]" onClick={() => handleSelect(planFromQuery)}>
                Ir al checkout
              </Button>
            </div>
          </div>
        )}

        <div className="mt-10 grid gap-6 md:grid-cols-3">
          {visiblePlans.map((plan) => {
            const planCode = plan._code
            const listingDuration = plan.listingDurationDays ?? plan.periodDays
            const priceLabel = formatPrice(plan.price, plan.currency)
            const displayName = PLAN_LABEL[planCode] ?? plan.name ?? planCode

            const accent =
              planCode === 'premium'
                ? '#d97706'
                : planCode === 'basic'
                ? '#2563eb'
                : '#1b2f3f'

            const features: string[] = []

            features.push(`Hasta ${plan.maxPhotos} fotos por publicación`)
            features.push(
              plan.featuredDays > 0
                ? `Destacada ${plan.featuredDays} ${plan.featuredDays === 1 ? 'día' : 'días'} en portada`
                : 'Sin destaque en portada'
            )
            features.push(
              plan.whatsappEnabled
                ? 'Botón de WhatsApp habilitado'
                : 'Contacto por email y chat'
            )
            features.push(`Duración ${listingDuration} días`)
            if (plan.socialBoost) features.push('Publicación en Instagram y Facebook')
            if (plan.description) features.push(plan.description)

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
