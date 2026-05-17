import { useEffect, useMemo, useState } from 'react'
import { Link } from 'react-router-dom'
import { motion, AnimatePresence } from 'framer-motion'
import {
  ArrowRight, BadgeCheck, CheckCircle, ChevronDown, Globe, Package,
  ShieldCheck, Users, Zap,
} from 'lucide-react'
import Button from '../components/Button'
import SeoHead from '../components/SeoHead'
import { getSupabaseClient, supabaseEnabled } from '../services/supabase'
import { fetchPlans, FALLBACK_PLANS } from '../services/plans'

type Plan = (typeof FALLBACK_PLANS)[number]

// ─── Animation ────────────────────────────────────────────────────────────────

const fadeUp = {
  hidden: { opacity: 0, y: 20 },
  show:   { opacity: 1, y: 0 },
} as const

function Section({ children, className = '' }: { children: React.ReactNode; className?: string }) {
  return (
    <motion.section
      variants={fadeUp}
      initial="hidden"
      whileInView="show"
      viewport={{ once: true, amount: 0.15 }}
      transition={{ duration: 0.5, ease: 'easeOut' }}
      className={className}
    >
      {children}
    </motion.section>
  )
}

// ─── Accordion ────────────────────────────────────────────────────────────────

function AccordionItem({ q, a }: { q: string; a: string }) {
  const [open, setOpen] = useState(false)
  return (
    <div className="border-b border-gray-200 last:border-0">
      <button
        className="flex w-full items-center justify-between gap-4 py-5 text-left text-[15px] font-medium text-gray-900 hover:text-[#14212e]"
        onClick={() => setOpen(v => !v)}
        aria-expanded={open}
      >
        <span>{q}</span>
        <ChevronDown
          className={`h-5 w-5 flex-shrink-0 text-gray-400 transition-transform duration-200 ${open ? 'rotate-180' : ''}`}
        />
      </button>
      <AnimatePresence initial={false}>
        {open && (
          <motion.div
            key="content"
            initial={{ height: 0, opacity: 0 }}
            animate={{ height: 'auto', opacity: 1 }}
            exit={{ height: 0, opacity: 0 }}
            transition={{ duration: 0.22, ease: 'easeOut' }}
            className="overflow-hidden"
          >
            <p className="pb-5 text-[15px] leading-relaxed text-gray-600">{a}</p>
          </motion.div>
        )}
      </AnimatePresence>
    </div>
  )
}

// ─── Check item ───────────────────────────────────────────────────────────────

function Check({ children, light = false }: { children: React.ReactNode; light?: boolean }) {
  return (
    <li className={`flex items-start gap-3 text-[15px] ${light ? 'text-white/85' : 'text-gray-700'}`}>
      <BadgeCheck className={`mt-0.5 h-5 w-5 flex-shrink-0 ${light ? 'text-amber-400' : 'text-emerald-500'}`} />
      <span>{children}</span>
    </li>
  )
}

// ─── Comparison cell ──────────────────────────────────────────────────────────

function Cell({ v }: { v: string }) {
  const colors: Record<string, string> = {
    '✅': 'text-emerald-600',
    '❌': 'text-red-400',
    '⚡': 'text-amber-500',
  }
  const firstChar = v.charAt(0)
  return (
    <td className={`px-4 py-3 text-center text-sm ${colors[firstChar] ?? 'text-gray-700'}`}>
      {v}
    </td>
  )
}

// ─── Hooks ────────────────────────────────────────────────────────────────────

function usePlatformStats() {
  const [stats, setStats] = useState({ listings: 0, stores: 0, provinces: 0 })
  const [loaded, setLoaded] = useState(false)

  useEffect(() => {
    if (!supabaseEnabled) return
    const supabase = getSupabaseClient()

    async function load() {
      const [listingsRes, storesRes, locRes] = await Promise.allSettled([
        supabase.from('listings').select('id', { count: 'exact', head: true }).in('status', ['active', 'published']),
        supabase.from('users').select('id', { count: 'exact', head: true }).eq('store_enabled', true),
        supabase.from('listings').select('location').in('status', ['active', 'published']).limit(1000),
      ])

      const listings = listingsRes.status === 'fulfilled' ? (listingsRes.value.count ?? 0) : 0
      const stores   = storesRes.status   === 'fulfilled' ? (storesRes.value.count   ?? 0) : 0

      let provinces = 0
      if (locRes.status === 'fulfilled' && Array.isArray(locRes.value.data)) {
        const seen = new Set<string>()
        for (const row of locRes.value.data) {
          if (!row.location) continue
          const parts = String(row.location).split(',').map((p: string) => p.trim())
          const prov = parts.length > 1 ? parts[parts.length - 1] : parts[0]
          if (prov) seen.add(prov)
        }
        provinces = seen.size
      }

      setStats({ listings, stores, provinces })
      setLoaded(true)
    }

    load().catch(() => setLoaded(true))
  }, [])

  return { stats, loaded }
}

function usePlansData() {
  const [plans, setPlans] = useState<Plan[]>([])
  const [loaded, setLoaded] = useState(false)

  useEffect(() => {
    fetchPlans()
      .then(p => { setPlans(p); setLoaded(true) })
      .catch(() => setLoaded(true))
  }, [])

  // Filter out the store plan, keep individual listing plans sorted by price
  const listingPlans = useMemo(
    () => plans.filter(p => p.code !== 'tienda').sort((a, b) => a.price - b.price),
    [plans],
  )

  return { listingPlans, plansLoaded: loaded }
}

// ─── Static data ──────────────────────────────────────────────────────────────

const COMPARISON = [
  { feature: 'Audiencia 100% ciclista',   cm: '✅ Sí',         generic: '❌ No' },
  { feature: 'Sin comisión por venta',    cm: '✅ Sí',         generic: '❌ Hasta 17%' },
  { feature: 'Indexado en Google',        cm: '✅ Automático', generic: '✅ Sí' },
  { feature: 'Compradores con intención', cm: '✅ Solo bicis',  generic: '❌ Todo mezclado' },
  { feature: 'Plan gratis disponible',    cm: '✅ Siempre',    generic: '⚡ Limitado' },
]

const STEPS = [
  {
    n: '1',
    title: 'Completá el formulario',
    desc: 'Fotos, descripción y precio de tu bici. Todo en un solo lugar.',
    highlight: false,
  },
  {
    n: '2',
    title: 'Login con Google — un clic',
    desc: 'Te pedimos el registro recién al subir. Primero ves cómo queda, después confirmás.',
    highlight: true,
  },
  {
    n: '3',
    title: 'Tu bici queda publicada',
    desc: 'Aparece en el marketplace y empieza a indexarse en Google.',
    highlight: false,
  },
  {
    n: '4',
    title: '¿Querés más visibilidad?',
    desc: 'Un popup te ofrece destacarla con Basic o Pro — WhatsApp, Instagram y primera posición.',
    highlight: false,
  },
]

const FAQS = [
  {
    q: '¿Tiene algún costo publicar?',
    a: 'Podés publicar tu bici completamente gratis con 4 fotos. Una vez publicada, si querés más visibilidad — aparecer primero, mostrar tu WhatsApp y que @ciclomarket.ar la comparta en Instagram — podés elegir un plan Basic o Pro. Se pagan por publicación, no como suscripción mensual.',
  },
  {
    q: '¿Necesito crear una cuenta antes de publicar?',
    a: 'No. Completás el formulario con los datos de tu bici y al final, cuando apretás "Subir bicicleta", te pedimos login con Google. Un solo clic y tu bici queda publicada.',
  },
  {
    q: '¿Cobran comisión por cada venta?',
    a: 'No cobramos comisión. El contacto es directo entre vos y el comprador — acordás precio y forma de pago entre ustedes.',
  },
  {
    q: '¿En cuánto tiempo aparezco en Google?',
    a: 'Las páginas de Ciclo Market están optimizadas para buscadores con SEO técnico automático. En general, los listings nuevos aparecen indexados entre 1 y 2 semanas después de publicarse.',
  },
  {
    q: '¿Puedo publicar accesorios y repuestos además de bicis?',
    a: 'Sí. Podés publicar bicicletas, componentes, indumentaria, accesorios y cualquier producto relacionado al ciclismo.',
  },
  {
    q: '¿Cómo me contactan los compradores?',
    a: 'Directamente por WhatsApp (en planes Basic y Pro) o por el chat interno de Ciclo Market (en todos los planes), según lo que configurés.',
  },
]

// ─── Plan card helpers ────────────────────────────────────────────────────────

function formatPlanPrice(plan: Plan): string {
  if (plan.price === 0) return 'Gratis'
  return '$' + plan.price.toLocaleString('es-AR')
}

type PlanTier = 'free' | 'mid' | 'top'

function getPlanFeatures(plan: Plan, tier: PlanTier): string[] {
  const base = [
    `${plan.maxPhotos} fotos`,
    'Aparece en el marketplace',
    'Indexado en Google',
  ]
  if (tier === 'free') {
    return [...base, 'Contacto por chat interno']
  }
  if (tier === 'mid') {
    return [
      'Todo lo del plan Gratis',
      `${plan.maxPhotos} fotos`,
      'Botón de WhatsApp directo',
      'Aparece sobre las publicaciones gratis',
      'Publicación en Instagram @ciclomarket.ar',
    ]
  }
  return [
    'Todo lo del plan Basic',
    `${plan.maxPhotos} fotos`,
    'Máxima visibilidad — aparece primero',
    'Destacado visual en el listado',
    'Publicación en Instagram @ciclomarket.ar',
  ]
}

const TIER_META: Record<PlanTier, { badge: string | null; dark: boolean }> = {
  free: { badge: null,             dark: false },
  mid:  { badge: 'Más popular',    dark: false },
  top:  { badge: 'Vendé más rápido', dark: true },
}

// ─── Main component ───────────────────────────────────────────────────────────

export default function LandingVendedores() {
  const { stats, loaded: statsLoaded } = usePlatformStats()
  const { listingPlans, plansLoaded } = usePlansData()

  const seo = useMemo(() => ({
    title: 'Vendé tu bicicleta | Ciclo Market',
    description:
      'Publicá gratis en el único marketplace 100% dedicado al ciclismo en Argentina. Sin comisiones. Si querés vender más rápido, destacá tu publicación y aparecé primero.',
    canonicalPath: '/vender',
    keywords: [
      'vender bicicleta argentina', 'publicar bici gratis', 'marketplace ciclismo',
      'vender bicicleta usada', 'clasificados bicicletas',
    ],
    jsonLd: {
      '@context': 'https://schema.org',
      '@type': 'WebPage',
      name: 'Vendé tu bicicleta — Ciclo Market',
      description: 'Marketplace 100% dedicado al ciclismo en Argentina. Publicación gratuita, sin comisiones.',
      url: 'https://www.ciclomarket.ar/vender',
    },
  }), [])

  const statItems = [
    { value: statsLoaded ? stats.listings  : null, label: 'publicaciones activas' },
    { value: statsLoaded ? stats.stores    : null, label: 'tiendas oficiales' },
    { value: statsLoaded ? stats.provinces : null, label: 'provincias' },
  ]

  // Resolve the three plan tiers from whatever fetchPlans returned
  const freePlan = listingPlans.find(p => p.price === 0) ?? listingPlans[0]
  const paidPlans = listingPlans.filter(p => p.price > 0)
  const midPlan = paidPlans[0]
  const topPlan = paidPlans[1] ?? paidPlans[0]

  const planCards: Array<{ plan: Plan | undefined; tier: PlanTier }> = [
    { plan: freePlan, tier: 'free' },
    { plan: midPlan,  tier: 'mid'  },
    { plan: topPlan,  tier: 'top'  },
  ]

  return (
    <>
      <SeoHead {...seo} />

      {/* ── SECCIÓN 1: HERO — mismo visual que HeroHome ─────────────── */}
      <section className="relative min-h-[550px] lg:min-h-[560px] overflow-hidden bg-[#14212E]">
        {/* Imagen bici — Desktop: 45% derecha */}
        <div className="hidden lg:block absolute right-0 top-0 w-[45%] h-full z-[1]">
          <div
            className="absolute left-0 top-0 w-[80%] h-full z-[2]"
            style={{ background: 'linear-gradient(90deg, #14212E 0%, transparent 100%)' }}
          />
          <picture>
            <source srcSet="/images/hero-bike.webp" type="image/webp" />
            <img
              src="/bike.jpg"
              alt="Bicicleta en Ciclo Market"
              className="w-full h-full object-cover object-center"
              decoding="async"
              loading="eager"
              fetchPriority="high"
            />
          </picture>
        </div>

        {/* Imagen bici — Mobile: fondo con overlay */}
        <div
          className="lg:hidden absolute inset-0 z-[0]"
          style={{
            background: `linear-gradient(180deg, rgba(20,33,46,0.95) 0%, rgba(20,33,46,0.85) 40%, rgba(20,33,46,0.7) 100%), url(/images/hero-bike.webp)`,
            backgroundSize: 'cover',
            backgroundPosition: 'center 60%',
          }}
        />

        {/* Contenido — 55% ancho en desktop */}
        <div className="relative z-[3] w-full lg:w-[55%] px-6 sm:px-8 lg:px-[4%] py-12 sm:py-16 lg:py-[60px] flex items-center min-h-[550px] lg:min-h-[560px]">
          <div className="max-w-xl mx-auto lg:mx-0 text-center lg:text-left">

            {/* Badge */}
            <span className="inline-flex items-center gap-1.5 rounded-full border border-white/15 bg-white/10 px-4 py-1.5 text-sm font-medium text-white/80 mb-5">
              🚴 Vendé en el marketplace #1 de ciclismo
            </span>

            {/* Headline */}
            <h1 className="text-[clamp(36px,5vw,56px)] font-extrabold text-white leading-[1.1] tracking-[-0.02em] mb-5">
              Tu bicicleta frente a{' '}
              <span className="bg-gradient-to-r from-cyan-400 to-blue-500 bg-clip-text text-transparent">
                miles de ciclistas
              </span>
            </h1>

            {/* Subheadline */}
            <p className="text-base text-white/65 leading-relaxed mb-8 max-w-[420px] mx-auto lg:mx-0">
              Publicá gratis. Sin comisiones. Sin competir con heladeras ni zapatillas.
            </p>

            {/* CTA */}
            <div className="mb-3 flex justify-center lg:justify-start">
              <Link
                to="/publicar"
                className="group inline-flex items-center justify-center gap-2 px-6 py-3.5 rounded-xl bg-gradient-to-r from-cyan-400 to-blue-500 text-[#0a0a0a] font-semibold text-sm transition-all hover:-translate-y-0.5 hover:shadow-[0_8px_25px_rgba(0,150,255,0.4)]"
              >
                Publicar mi bici ahora
                <ArrowRight className="w-4 h-4 transition-transform group-hover:translate-x-1" />
              </Link>
            </div>
            <p className="text-xs text-white/40 text-center lg:text-left mb-8">
              Gratis. Sin tarjeta. El registro es al final.
            </p>

            {/* Feature badges */}
            <div className="flex flex-wrap justify-center lg:justify-start gap-4 sm:gap-6 pt-5 border-t border-white/[0.08]">
              <div className="flex items-center gap-2 text-[13px] text-white/60">
                <CheckCircle className="w-4 h-4 text-cyan-400 flex-shrink-0" />
                <span>Publicación gratuita</span>
              </div>
              <div className="flex items-center gap-2 text-[13px] text-white/60">
                <Users className="w-4 h-4 text-cyan-400 flex-shrink-0" />
                <span>Audiencia 100% ciclista</span>
              </div>
              <div className="flex items-center gap-2 text-[13px] text-white/60">
                <Globe className="w-4 h-4 text-cyan-400 flex-shrink-0" />
                <span>Indexado en Google</span>
              </div>
            </div>

          </div>
        </div>
      </section>

      {/* ── SECCIÓN 2: NÚMEROS ──────────────────────────────────────── */}
      <Section className="bg-white py-14 md:py-16">
        <div className="container mx-auto max-w-4xl px-4">
          <p className="mb-8 text-center text-sm font-medium uppercase tracking-widest text-gray-400">
            La comunidad en números
          </p>
          <div className="grid grid-cols-3 gap-6 md:gap-10">
            {statItems.map(({ value, label }) => (
              <div key={label} className="text-center">
                <div className="text-4xl font-extrabold text-[#14212e] md:text-5xl">
                  {value === null ? (
                    <span className="inline-block h-10 w-20 animate-pulse rounded-lg bg-gray-100" />
                  ) : (
                    value.toLocaleString('es-AR')
                  )}
                </div>
                <div className="mt-2 text-sm text-gray-500 md:text-base">{label}</div>
              </div>
            ))}
          </div>
        </div>
      </Section>

      {/* ── SECCIÓN 3: PLANES ───────────────────────────────────────── */}
      <Section className="bg-gray-50 py-16 md:py-20">
        <div className="container mx-auto max-w-5xl px-4">
          <h2 className="text-center text-3xl font-extrabold text-[#14212e] md:text-4xl">
            Elegís el plan cuando publicás
          </h2>
          <p className="mt-3 text-center text-gray-500">
            Primero publicás gratis. Después, si querés más visibilidad, elegís un plan.
          </p>

          <div className="mt-10 grid gap-5 md:grid-cols-3">
            {planCards.map(({ plan, tier }) => {
              const meta = TIER_META[tier]
              const features = plan ? getPlanFeatures(plan, tier) : []

              if (meta.dark) {
                // Dark card (top plan)
                return (
                  <div key={tier} className="relative rounded-2xl bg-[#14212e] p-7 shadow-xl">
                    {meta.badge && (
                      <div className="absolute -top-3 left-1/2 -translate-x-1/2">
                        <span className="rounded-full bg-amber-400 px-4 py-1 text-xs font-bold text-[#14212e] shadow-sm">
                          {meta.badge.toUpperCase()}
                        </span>
                      </div>
                    )}
                    <div className="flex items-center gap-2">
                      <span className="text-lg font-bold text-white">{plan?.name ?? 'Pro'}</span>
                      <Zap className="h-4 w-4 text-amber-400" />
                    </div>
                    <div className="mt-2 text-3xl font-black text-white">
                      {plansLoaded && plan ? formatPlanPrice(plan) : (
                        <span className="inline-block h-8 w-24 animate-pulse rounded-lg bg-white/10" />
                      )}
                    </div>
                    <p className="mt-1 text-xs text-white/40">por publicación</p>
                    <ul className="mt-5 space-y-2.5">
                      {features.map(f => <Check key={f} light>{f}</Check>)}
                    </ul>
                    <div className="mt-7">
                      <Button to="/publicar" variant="ghost" className="w-full justify-center border-white/20 py-2.5 text-white hover:bg-white/10">
                        Publicar ahora
                      </Button>
                    </div>
                  </div>
                )
              }

              // Light card (free and mid)
              return (
                <div
                  key={tier}
                  className={`relative rounded-2xl border p-7 shadow-sm ${
                    tier === 'mid'
                      ? 'border-2 border-[#14212e] bg-white'
                      : 'border-gray-200 bg-white'
                  }`}
                >
                  {meta.badge && (
                    <div className="absolute -top-3 left-1/2 -translate-x-1/2">
                      <span className="rounded-full bg-[#14212e] px-4 py-1 text-xs font-bold text-white shadow-sm">
                        {meta.badge.toUpperCase()}
                      </span>
                    </div>
                  )}
                  <div className="flex items-center gap-2">
                    <span className="text-lg font-bold text-[#14212e]">{plan?.name ?? (tier === 'free' ? 'Gratis' : 'Basic')}</span>
                    {tier === 'free' && (
                      <span className="rounded-full border border-gray-200 px-2 py-0.5 text-xs text-gray-400">Siempre</span>
                    )}
                  </div>
                  <div className="mt-2 text-3xl font-black text-[#14212e]">
                    {plansLoaded && plan ? formatPlanPrice(plan) : (
                      <span className="inline-block h-8 w-24 animate-pulse rounded-lg bg-gray-100" />
                    )}
                  </div>
                  {tier !== 'free' && <p className="mt-1 text-xs text-gray-400">por publicación</p>}
                  <ul className="mt-5 space-y-2.5">
                    {features.map(f => <Check key={f}>{f}</Check>)}
                  </ul>
                  <div className="mt-7">
                    <Button
                      to="/publicar"
                      variant={tier === 'mid' ? 'primary' : 'ghost'}
                      className="w-full justify-center py-2.5"
                    >
                      {tier === 'free' ? 'Publicar gratis' : 'Publicar ahora'}
                    </Button>
                  </div>
                </div>
              )
            })}
          </div>

          <p className="mt-6 text-center text-sm text-gray-400">
            Los precios son por publicación, no una suscripción mensual.
          </p>
        </div>
      </Section>

      {/* ── SECCIÓN 4: CÓMO FUNCIONA ────────────────────────────────── */}
      <Section className="bg-white py-16 md:py-20">
        <div className="container mx-auto max-w-4xl px-4">
          <h2 className="text-center text-3xl font-extrabold text-[#14212e] md:text-4xl">
            Cómo funciona
          </h2>
          <p className="mt-3 text-center text-gray-500">
            De cero a publicado en menos de 5 minutos.
          </p>

          <div className="mt-10 grid gap-5 sm:grid-cols-2 lg:grid-cols-4">
            {STEPS.map(({ n, title, desc, highlight }) => (
              <div
                key={n}
                className={`relative rounded-2xl border p-6 ${
                  highlight
                    ? 'border-amber-300 bg-amber-50'
                    : 'border-gray-200 bg-white shadow-sm'
                }`}
              >
                {highlight && (
                  <span className="absolute -top-3 left-4 rounded-full bg-amber-400 px-3 py-0.5 text-xs font-bold text-[#14212e]">
                    Sin fricción
                  </span>
                )}
                <div
                  className={`mb-4 flex h-10 w-10 items-center justify-center rounded-xl text-lg font-bold ${
                    highlight ? 'bg-amber-400 text-[#14212e]' : 'bg-[#14212e] text-white'
                  }`}
                >
                  {n}
                </div>
                <h3 className="text-base font-bold text-[#14212e]">{title}</h3>
                <p className="mt-1.5 text-sm leading-relaxed text-gray-500">{desc}</p>
              </div>
            ))}
          </div>

          <div className="mt-10 text-center">
            <Button to="/publicar" variant="primary" className="px-8 py-3 text-base">
              Publicar mi bici gratis
            </Button>
          </div>
        </div>
      </Section>

      {/* ── SECCIÓN 5: COMPARATIVA ──────────────────────────────────── */}
      <Section className="bg-gray-50 py-16 md:py-20">
        <div className="container mx-auto max-w-3xl px-4">
          <h2 className="text-center text-3xl font-extrabold text-[#14212e] md:text-4xl">
            Por qué Ciclo Market
          </h2>
          <p className="mt-3 text-center text-gray-500">
            No sos un vendedor más entre heladeras y zapatillas. Acá tu audiencia es 100% ciclista.
          </p>

          <div className="mt-10 overflow-x-auto rounded-2xl border border-gray-200 shadow-sm">
            <table className="w-full min-w-[380px] text-sm">
              <thead>
                <tr className="bg-[#14212e] text-white">
                  <th className="px-4 py-3.5 text-left font-semibold">Característica</th>
                  <th className="px-4 py-3.5 text-center font-semibold">Ciclo Market</th>
                  <th className="px-4 py-3.5 text-center font-medium text-white/70">Marketplace genérico</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-gray-100">
                {COMPARISON.map(row => (
                  <tr key={row.feature} className="hover:bg-gray-50/60">
                    <td className="px-4 py-3 text-sm font-medium text-gray-800">{row.feature}</td>
                    <Cell v={row.cm} />
                    <Cell v={row.generic} />
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>
      </Section>

      {/* ── SECCIÓN 6: FAQ ──────────────────────────────────────────── */}
      <Section className="bg-white py-16 md:py-20">
        <div className="container mx-auto max-w-2xl px-4">
          <h2 className="text-center text-3xl font-extrabold text-[#14212e] md:text-4xl">
            Preguntas frecuentes
          </h2>
          <div className="mt-10 rounded-2xl border border-gray-200 bg-white px-6 shadow-sm">
            {FAQS.map(({ q, a }) => (
              <AccordionItem key={q} q={q} a={a} />
            ))}
          </div>
        </div>
      </Section>

      {/* ── SECCIÓN 7: CTA FINAL ────────────────────────────────────── */}
      <section className="bg-[#14212e] py-20 text-center text-white md:py-28">
        <div className="container mx-auto max-w-xl px-4">
          <motion.div
            initial={{ opacity: 0, y: 20 }}
            whileInView={{ opacity: 1, y: 0 }}
            viewport={{ once: true }}
            transition={{ duration: 0.5 }}
          >
            <div className="mb-5 inline-flex h-14 w-14 items-center justify-center rounded-2xl bg-white/10">
              <ShieldCheck className="h-7 w-7 text-white" />
            </div>
            <h2 className="text-4xl font-extrabold md:text-5xl">¿Tenés una bici para vender?</h2>
            <p className="mt-4 text-lg text-white/70">
              Publicala gratis ahora. Miles de ciclistas la van a ver.
            </p>
            <div className="mt-10">
              <Link
                to="/publicar"
                className="inline-flex items-center gap-2 rounded-xl bg-white px-8 py-4 text-base font-bold text-[#14212e] shadow-lg transition hover:bg-white/90 active:scale-[.98]"
              >
                <Package className="h-5 w-5" />
                Publicar mi bici
                <ArrowRight className="h-4 w-4" />
              </Link>
            </div>
            <p className="mt-6 text-sm text-white/40">
              Sin tarjeta de crédito · Sin comisión · Gratis para siempre
            </p>
            <p className="mt-4 text-sm text-white/30">
              ¿Sos una bicicletería?{' '}
              <Link to="/vender/tiendas" className="text-white/60 underline underline-offset-2 hover:text-white/80">
                Abrí tu tienda oficial →
              </Link>
            </p>
          </motion.div>
        </div>
      </section>
    </>
  )
}
