import { useEffect } from 'react'
import { Link } from 'react-router-dom'
import { useAuth } from '../context/AuthContext'

type Step = {
  id: string
  title: string
  bullets: string[]
  Mock: () => JSX.Element
  mockWrapperClass?: string
}

const STEPS: Step[] = [
  {
    id: 'account',
    title: 'Creá tu cuenta o iniciá sesión',
    bullets: [
      'Ingresá desde el botón Ingresar en la esquina superior derecha.',
      'Usá tu email y contraseña o accedé con Google.',
      'Al entrar, llegás directo a tu dashboard para empezar a publicar.'
    ],
    Mock: MockRegister,
    mockWrapperClass:
      'border border-white/15 bg-white/10 text-white shadow-[0_25px_60px_rgba(9,18,27,0.45)] ring-0 backdrop-blur hover:ring-white/20'
  },
  {
    id: 'plans',
    title: 'Elegí el plan que más te convenga',
    bullets: [
      'Free: publicación básica por 15 días.',
      'Básico y Premium: más fotos, prioridad y contacto directo por WhatsApp.',
      'Pagás solo cuando querés destacar tu bici.'
    ],
    Mock: MockPlans,
    mockWrapperClass:
      'overflow-hidden bg-[#0f1729]/85 text-white shadow-[0_30px_80px_rgba(8,14,24,0.55)] ring-0 backdrop-blur hover:ring-cyan-400/20'
  },
  {
    id: 'form',
    title: 'Completá los datos de tu bici y publicá',
    bullets: [
      'Elegí la categoría y completá marca, modelo, año y componentes.',
      'Subí fotos claras: lateral, transmisión y detalles importantes.',
      'Previsualizá cómo se verá tu aviso antes de publicarlo.'
    ],
    Mock: MockPublishForm
  },
  {
    id: 'profile',
    title: 'Completá tu perfil y sumá badges de confianza',
    bullets: [
      'Mientras más completo tu perfil, más chances tenés de vender.',
      'Sumá insignias: Amateur, Semi-pro, Pro y Verificado.',
      'Los compradores confían más en perfiles con historial y reputación.'
    ],
    Mock: MockProfile
  }
]

export default function HowToPublish() {
  useEffect(() => {
    const observer = new IntersectionObserver(
      (entries, obs) => {
        entries.forEach((entry) => {
          if (entry.isIntersecting) {
            entry.target.classList.add('opacity-100', 'translate-y-0', 'scale-100')
            obs.unobserve(entry.target)
          }
        })
      },
      { threshold: 0.18 }
    )

    document
      .querySelectorAll<HTMLElement>('.animate-on-scroll')
      .forEach((el) => observer.observe(el))

    return () => observer.disconnect()
  }, [])

  const { user } = useAuth()

  return (
    <main className="relative min-h-screen overflow-hidden bg-gradient-to-b from-[#0f1729] via-[#101b2d] to-[#0f1729] text-white">
      <div className="pointer-events-none absolute inset-0">
        <div className="absolute inset-x-0 top-0 h-64 bg-gradient-to-b from-[#15263e] via-transparent to-transparent" />
        <div className="absolute -left-32 top-48 h-72 w-72 rounded-full bg-cyan-500/15 blur-3xl" />
        <div className="absolute right-[-15%] top-[30%] h-96 w-96 rounded-full bg-indigo-600/20 blur-3xl" />
      </div>
      <section className="relative mx-auto max-w-6xl px-4 py-16 sm:px-8 sm:py-20 lg:py-24">
        <header className="mb-16 text-center sm:mb-20">
          <h1 className="text-3xl font-bold tracking-tight text-white sm:text-4xl lg:text-5xl">Cómo publicar tu bicicleta</h1>
          <p className="mx-auto mt-4 max-w-2xl text-base text-slate-300 sm:text-lg">
            Recorré estos pasos y publicá tu bici en menos de 2 minutos.
          </p>
        </header>

        <div className="relative">
          <div className="hidden lg:block absolute left-8 top-0 bottom-0">
            <div className="h-full w-px bg-gradient-to-b from-sky-500 via-indigo-500 to-purple-500 opacity-60" />
          </div>

          <div className="space-y-16 lg:space-y-24">
            {STEPS.map((step, idx) => (
              <StepRow key={step.id} index={idx} step={step} />
            ))}
          </div>
        </div>

        <section className="mt-48 text-center sm:mt-56 lg:mt-64">
          <h3 className="text-2xl font-semibold text-white sm:text-3xl">¿Listo para publicar tu bicicleta?</h3>
          <p className="mx-auto mt-3 max-w-xl text-sm text-slate-300 sm:text-base">
            Creá tu aviso ahora mismo y seguí estos pasos mientras completás la publicación.
          </p>
          <Link
            to={user ? '/publicar' : '/register'}
            className="mt-6 inline-flex items-center gap-2 rounded-full bg-[#2563eb] px-8 py-3 text-sm font-semibold text-white shadow-lg transition hover:scale-[1.02] hover:bg-[#1d4ed8] sm:px-10 sm:py-3.5 sm:text-base"
          >
            Ir a publicar bicicleta →
          </Link>
        </section>
      </section>
    </main>
  )
}

function StepRow({ index, step }: { index: number; step: Step }) {
  const { title, bullets, Mock } = step
  const reverse = index % 2 === 1
  const textPadding = reverse ? 'lg:pr-20' : 'lg:pl-20'
  const mockupJustify = reverse ? 'lg:justify-start' : 'lg:justify-end'
  const textOrder = reverse ? 'lg:order-2' : 'lg:order-1'
  const mockupOrder = reverse ? 'lg:order-1' : 'lg:order-2'
  const baseWrapperClasses =
    'relative w-full max-w-md overflow-hidden rounded-3xl transition-transform duration-300 hover:-translate-y-1'
  const defaultWrapperClasses =
    'bg-white/95 shadow-2xl shadow-slate-950/30 ring-1 ring-sky-500/10 hover:ring-sky-400/30'
  const wrapperClasses = `${baseWrapperClasses} ${step.mockWrapperClass ?? defaultWrapperClasses}`

  return (
    <section className="animate-on-scroll relative grid grid-cols-1 items-center gap-10 opacity-0 translate-y-6 scale-[0.98] transition-all duration-700 ease-out lg:grid-cols-2 lg:gap-16">
      <div className={`relative ${textPadding} ${textOrder}`}>
        <span className="mb-3 inline-block text-sm font-semibold uppercase tracking-[0.2em] text-slate-400">
          Paso {index + 1}
        </span>
        <h2 className="text-2xl font-semibold text-white sm:text-3xl">{title}</h2>
        <ul className="mt-4 space-y-2 text-sm leading-relaxed text-slate-300 sm:text-base">
          {bullets.map((bullet, idx) => (
            <li key={idx} className="flex items-start gap-3">
              <span className="mt-[10px] inline-block h-1.5 w-1.5 flex-shrink-0 rounded-full bg-gradient-to-r from-sky-500 to-indigo-500" />
              <span>{bullet}</span>
            </li>
          ))}
        </ul>
      </div>
      <div className={`flex justify-center ${mockupJustify} ${mockupOrder}`}>
        <div className={wrapperClasses}>
          <Mock />
        </div>
      </div>
    </section>
  )
}

function MockRegister() {
  return (
    <div className="relative space-y-6 rounded-[28px] p-6 text-white">
      <div className="pointer-events-none absolute inset-0 bg-[linear-gradient(180deg,rgba(255,255,255,0.12),transparent)]" />
      <div className="pointer-events-none absolute inset-0 bg-[radial-gradient(900px_420px_at_10%_-10%,rgba(168,216,255,0.25),transparent_65%)] opacity-70" />
      <div className="relative space-y-6">
        <div>
          <h3 className="text-xl font-semibold text-white">Crear cuenta</h3>
          <p className="mt-1 text-sm text-white/70">Elegí cómo querés registrarte.</p>
        </div>
        <button
          type="button"
          className="group relative flex w-full items-center justify-center gap-3 rounded-2xl border border-white/70 bg-white px-4 py-2.5 text-sm font-semibold text-[#14212e] shadow-[0_12px_30px_rgba(12,20,28,0.12)] transition hover:-translate-y-[1px] hover:border-[#14212e]/30"
        >
          <span className="rounded-full bg-white/50 p-2 group-hover:bg-white/70">
            <svg className="h-5 w-5" viewBox="0 0 24 24" aria-hidden="true">
              <path fill="#EA4335" d="M12 5.5c1.72 0 3.27.59 4.48 1.68l3.09-3.09C17.45 1.64 14.93.5 12 .5 6.87.5 2.54 3.82.98 8.36l3.74 2.91C5.47 7.93 8.46 5.5 12 5.5z" />
              <path fill="#34A853" d="M12 22.5c3.11 0 5.72-1.02 7.61-2.81l-3.52-2.88c-1.03.69-2.35 1.08-3.86 1.08-2.77 0-5.11-1.86-5.93-4.43H2.76v3.1C4.69 19.98 8.11 22.5 12 22.5z" />
              <path fill="#4285F4" d="M23.5 12c0-.8-.08-1.58-.23-2.32H12v4.64h6.51c-.29 1.48-1.1 2.74-2.29 3.6l3.52 2.88C21.92 18.93 23.5 15.8 23.5 12z" />
              <path fill="#FBBC05" d="M6.69 13.59A5.63 5.63 0 016.38 12c0-.55.09-1.09.26-1.59V7.36H2.76A9.97 9.97 0 002 12c0 1.59.36 3.1 1.03 4.43l3.66-2.84z" />
            </svg>
          </span>
          Registrarme con Google
        </button>
        <button
          type="button"
          className="group relative flex w-full items-center justify-center gap-3 rounded-2xl border border-[#1877F2] bg-[#1877F2] px-4 py-2.5 text-sm font-semibold text-white shadow-[0_12px_30px_rgba(24,119,242,0.35)] transition hover:-translate-y-[1px] hover:brightness-110"
        >
          <span className="rounded-full bg-white/10 p-2">
            <svg className="h-5 w-5" viewBox="0 0 24 24" aria-hidden="true">
              <path fill="#FFF" d="M16.671 15.563l.532-3.49h-3.328v-2.26c0-.952.465-1.88 1.954-1.88h1.513v-2.97s-1.374-.235-2.686-.235c-2.741 0-4.533 1.661-4.533 4.668v2.717H7.078v3.49h3.047V24h3.75v-8.437h2.796z" />
              <path fill="#1877F2" d="M24 12.073C24 5.405 18.627 0 12 0S0 5.405 0 12.073C0 18.1 4.388 23.094 10.125 24v-8.437H7.078v-3.49h3.047V9.356c0-3.007 1.792-4.668 4.533-4.668 1.312 0 2.686.235 2.686.235v2.97h-1.513c-1.49 0-1.954.928-1.954 1.88v2.26h3.328l-.532 3.49h-2.796V24C19.612 23.094 24 18.1 24 12.073z" />
            </svg>
          </span>
          Registrarme con Facebook
        </button>
        <div className="relative flex items-center gap-3 text-[11px] font-semibold uppercase tracking-[0.35em] text-white/45">
          <span className="h-px flex-1 bg-white/15" />
          <span>o completá tus datos</span>
          <span className="h-px flex-1 bg-white/15" />
        </div>
        <div className="space-y-4">
          <div>
            <label className="mb-1 block text-xs font-semibold uppercase tracking-[0.2em] text-white/70">
              Nombre completo
            </label>
            <div className="h-11 rounded-2xl border border-white/15 bg-white/10" />
          </div>
          <div>
            <label className="mb-1 block text-xs font-semibold uppercase tracking-[0.2em] text-white/70">
              Email
            </label>
            <div className="h-11 rounded-2xl border border-white/15 bg-white/10" />
          </div>
          <div>
            <label className="mb-1 block text-xs font-semibold uppercase tracking-[0.2em] text-white/70">
              Contraseña
            </label>
            <div className="h-11 rounded-2xl border border-white/15 bg-white/10" />
          </div>
        </div>
      </div>
    </div>
  )
}

function MockPlans() {
  const plans = [
    {
      name: 'Free',
      description: '15 días online · Hasta 4 fotos',
      accent: '#0f766e',
      price: '$0',
      textColor: 'text-white',
      badge: null
    },
    {
      name: 'Básica',
      description: '60 días · WhatsApp directo',
      accent: '#2563eb',
      price: '$9.000',
      textColor: 'text-white',
      badge: 'Recomendado'
    },
    {
      name: 'Premium',
      description: 'Difusión + redes sociales',
      accent: '#f97316',
      price: '$13.000',
      textColor: 'text-white',
      badge: null
    }
  ]

  return (
    <div className="grid gap-4">
      {plans.map((plan) => (
        <div
          key={plan.name}
          className="relative overflow-hidden rounded-[28px] bg-white/10 p-6 text-white shadow-[0_30px_80px_rgba(8,14,24,0.45)] backdrop-blur"
        >
          <div className="pointer-events-none absolute inset-0 bg-[radial-gradient(900px_420px_at_-10%_-20%,rgba(255,255,255,0.18),transparent_70%)] opacity-70" />
          {plan.badge ? (
            <span className="absolute right-4 top-4 rounded-full bg-white/90 px-3 py-1 text-xs font-semibold text-[#14212e] shadow-lg">
              {plan.badge}
            </span>
          ) : null}
          <div className="relative z-10 space-y-3">
            <div>
              <h3 className={`text-lg font-semibold drop-shadow-sm ${plan.textColor}`}>{plan.name}</h3>
              <p className="text-sm text-white/80 drop-shadow">{plan.description}</p>
            </div>
            <span className="block text-base font-semibold text-white drop-shadow">{plan.price}</span>
          </div>
          <div
            className="absolute inset-0 z-0 opacity-40"
            style={{ background: `radial-gradient(circle at top, ${plan.accent}, transparent 68%)` }}
            aria-hidden
          />
        </div>
      ))}
    </div>
  )
}

function MockPublishForm() {
  return (
    <div className="rounded-3xl border border-slate-100 bg-white shadow-lg shadow-blue-950/10">
      <div className="relative overflow-hidden rounded-t-3xl bg-[#0f1729]">
        <img
          src="/gianttcr.webp"
          alt="Vista previa Giant TCR"
          className="h-48 w-full object-cover"
          loading="lazy"
          decoding="async"
        />
        <div className="absolute right-4 top-4 rounded-full bg-white/15 px-3 py-1 text-xs font-semibold text-white/90">
          Vista previa
        </div>
      </div>
      <div className="space-y-4 px-5 py-5 text-[#14212e]">
        <div>
          <h3 className="text-lg font-semibold">Giant TCR Advanced 2</h3>
          <p className="text-sm text-slate-500">Ruta · Carbono · Shimano 105</p>
        </div>
        <div className="grid grid-cols-2 gap-4 text-sm">
          {[
            ['Talle', 'M'],
            ['Rodado', '700c'],
            ['Material', 'Carbono'],
            ['Grupo', 'Shimano 105'],
            ['Año', '2022'],
            ['Estado', 'Como nuevo']
          ].map(([label, value]) => (
            <div key={label}>
              <span className="text-xs uppercase tracking-[0.24em] text-slate-500">{label}</span>
              <div className="mt-1 font-semibold text-slate-800">{value}</div>
            </div>
          ))}
        </div>
        <div className="rounded-2xl border border-slate-100 bg-slate-50 px-4 py-3 text-sm text-slate-600">
          “Lista para competir. Se entrega con ruedas de carbono y mantenimiento al día.”
        </div>
        <div className="flex items-center justify-between rounded-2xl border border-slate-100 bg-slate-50 px-4 py-3 text-sm">
          <span className="text-xs uppercase tracking-[0.24em] text-slate-500">Ubicación</span>
          <span className="text-base font-semibold text-slate-700">Palermo, Buenos Aires</span>
        </div>
      </div>
    </div>
  )
}

function MockProfile() {
  return (
    <div className="space-y-5 bg-white p-6 text-[#14212e]">
      <div className="flex items-center gap-4">
        <div className="h-14 w-14 rounded-full bg-gradient-to-br from-blue-500 to-indigo-500 shadow-lg" />
        <div>
          <div className="flex items-center gap-3">
            <h3 className="text-lg font-semibold text-[#14212e]">Lucía Fernández</h3>
            <span className="rounded-full bg-[#14212e] px-3 py-1 text-xs font-semibold text-white">Semi-pro</span>
          </div>
          <p className="text-sm text-slate-500">@lucia.bikes</p>
        </div>
      </div>

      <div className="grid gap-3 rounded-2xl bg-slate-50 px-4 py-4 text-sm text-slate-600 sm:grid-cols-3">
        <div>
          <span className="text-xs uppercase tracking-[0.24em] text-slate-400">Publicaciones</span>
          <div className="mt-1 text-lg font-semibold text-[#14212e]">18</div>
        </div>
        <div>
          <span className="text-xs uppercase tracking-[0.24em] text-slate-400">Reputación</span>
          <div className="mt-1 text-lg font-semibold text-[#14212e]">4.9 / 5</div>
        </div>
        <div>
          <span className="text-xs uppercase tracking-[0.24em] text-slate-400">Nivel</span>
          <div className="mt-1 text-lg font-semibold text-[#14212e]">Semi-pro</div>
        </div>
      </div>

      <div className="rounded-2xl border border-slate-100 bg-slate-50 px-5 py-4 text-sm text-slate-600">
        “Fanática del bike fitting y de las carreras de ruta. Todas mis bicis están revisadas por mecánicos certificados.”
      </div>

      <div className="rounded-2xl border border-slate-100 bg-white px-5 py-4">
        <span className="text-xs uppercase tracking-[0.24em] text-slate-400">Reviews</span>
        <div className="mt-3 flex items-center gap-2 text-xs font-semibold text-[#14212e]">
          <span className="inline-flex items-center rounded-full bg-amber-100 px-3 py-1 text-amber-700">★ 4.9</span>
          <span className="text-slate-500">Reputación destacada</span>
        </div>
      </div>
    </div>
  )
}
