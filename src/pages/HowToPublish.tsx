import { useEffect } from 'react'
import { Link } from 'react-router-dom'
import { useAuth } from '../context/AuthContext'

type Step = {
  id: string
  title: string
  description: string
  bullets: string[]
  Visual: () => JSX.Element
}

const STEPS: Step[] = [
  {
    id: 'step-1',
    title: 'Creá tu cuenta en segundos.',
    description:
      'Sumate a la comunidad. Solo necesitamos tus datos básicos o podés ingresar con Google. Sin formularios eternos.',
    bullets: ['Ingresá con Google o con tu email.', 'Queda todo listo para publicar.', 'Empezá gratis en minutos.'],
    Visual: GoogleCardMock,
  },
  {
    id: 'step-2',
    title: 'Cargá las fotos y detalles.',
    description:
      'Nuestro sistema te guía para que tu aviso se vea profesional: categoría, componentes y estado.',
    bullets: ['Subí fotos claras.', 'Completá marca, modelo y año.', 'Previsualizá antes de publicar.'],
    Visual: PublishFormMock,
  },
  {
    id: 'step-3',
    title: 'Hablá directo con interesados.',
    description:
      'Recibí contactos y coordiná con compradores reales. Si activás Premium, habilitás WhatsApp directo.',
    bullets: ['Contacto por email (gratis).', 'Premium: WhatsApp directo.', 'Premium: difusión en redes.'],
    Visual: BuyBoxMock,
  },
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
  const startLink = user ? '/publicar' : '/login?redirect=%2Fpublicar'

  return (
    <main className="min-h-screen bg-gray-50 text-mb-ink">
      <section className="relative mx-auto max-w-6xl px-4 py-16 sm:px-8 sm:py-20">
        <div className="pointer-events-none absolute inset-0 -z-10">
          <div className="absolute -left-24 top-16 h-72 w-72 rounded-full bg-mb-primary/10 blur-3xl" />
          <div className="absolute right-[-10%] top-44 h-96 w-96 rounded-full bg-blue-500/10 blur-3xl" />
        </div>

        <header className="text-center">
          <h1 className="text-3xl font-extrabold tracking-tight text-mb-ink sm:text-4xl lg:text-5xl">
            Vender tu bicicleta nunca fue tan simple.
          </h1>
          <p className="mx-auto mt-4 max-w-2xl text-base text-gray-600 sm:text-lg">
            Publicá gratis, conectá con miles de ciclistas y vendé seguro.
          </p>
          <div className="mt-8 flex items-center justify-center gap-3">
            <Link
              to={startLink}
              className="inline-flex items-center justify-center rounded-full bg-mb-primary px-8 py-3 text-sm font-bold text-white shadow-sm transition hover:bg-mb-primary/90 sm:px-10 sm:py-3.5 sm:text-base"
            >
              Empezar ahora
            </Link>
            <Link
              to="/marketplace"
              className="inline-flex items-center justify-center rounded-full border border-gray-300 bg-white px-8 py-3 text-sm font-semibold text-gray-700 shadow-sm transition hover:bg-gray-50 sm:px-10 sm:py-3.5 sm:text-base"
            >
              Explorar catálogo
            </Link>
          </div>
        </header>

        <div className="relative mt-14 space-y-10 sm:mt-16 sm:space-y-12">
          <div className="absolute left-6 top-0 hidden h-full w-px bg-gray-200 lg:block" />
          {STEPS.map((step, idx) => (
            <StepRow key={step.id} index={idx} step={step} />
          ))}
        </div>
      </section>

      <section className="bg-white py-16">
        <div className="mx-auto max-w-6xl px-4 sm:px-8">
          <div className="mx-auto max-w-3xl text-center">
            <h2 className="text-3xl font-bold tracking-tight text-mb-ink">¿Querés vender más rápido?</h2>
            <p className="mt-3 text-base text-gray-600">
              Podés potenciar tu aviso para habilitar WhatsApp directo y sumar difusión en redes.
            </p>
          </div>

          <div className="mt-10 grid gap-6 lg:grid-cols-2">
            <div className="rounded-2xl border border-gray-200 bg-gray-50 p-6 shadow-sm">
              <p className="text-sm font-semibold text-gray-700">Publicación Estándar</p>
              <p className="mt-1 text-3xl font-extrabold text-mb-ink">$0</p>
              <ul className="mt-4 space-y-2 text-sm text-gray-600">
                <li>Publicación Standard</li>
                <li>Contacto por Email</li>
                <li>Duración ilimitada (hasta que vendas)</li>
              </ul>
            </div>

            <div className="relative rounded-2xl border border-mb-primary/25 bg-white p-6 shadow-sm ring-1 ring-mb-primary/10">
              <span className="absolute -top-3 left-6 inline-flex items-center rounded-full bg-mb-primary px-3 py-1 text-xs font-bold text-white">
                Recomendado
              </span>
              <p className="text-sm font-semibold text-gray-700">🚀 Plan Premium/Pro</p>
              <p className="mt-1 text-3xl font-extrabold text-mb-ink">Más ventas</p>
              <ul className="mt-4 space-y-2 text-sm text-gray-600">
                <li>
                  <span className="font-semibold text-mb-ink">WhatsApp Directo</span> con interesados
                </li>
                <li>Prioridad en listados</li>
                <li>Difusión en redes</li>
              </ul>
              <div className="mt-6">
                <Link
                  to={startLink}
                  className="inline-flex w-full items-center justify-center rounded-xl bg-mb-primary px-4 py-3 text-sm font-bold text-white shadow-sm transition hover:bg-mb-primary/90"
                >
                  Potenciar mi publicación
                </Link>
              </div>
              <p className="mt-3 text-center text-xs text-gray-500">Podés empezar gratis y potenciar cuando quieras.</p>
            </div>
          </div>
        </div>
      </section>
    </main>
  )
}

function StepRow({ index, step }: { index: number; step: Step }) {
  const reverse = index % 2 === 1
  const { title, description, bullets, Visual } = step

  return (
    <section
      className={`animate-on-scroll relative grid gap-6 rounded-3xl border border-gray-200 bg-white p-6 shadow-sm opacity-0 translate-y-3 scale-[0.99] transition-all duration-700 lg:grid-cols-2 lg:items-center lg:gap-10 lg:p-10 ${
        reverse ? 'lg:[&_.step-text]:order-2 lg:[&_.step-visual]:order-1' : ''
      }`}
    >
      <div className="step-text">
        <div className="flex items-center gap-3">
          <div className="hidden lg:flex h-12 w-12 items-center justify-center rounded-full border border-gray-200 bg-white text-sm font-bold text-mb-ink shadow-sm">
            {index + 1}
          </div>
          <h3 className="text-xl font-bold text-mb-ink sm:text-2xl">{title}</h3>
        </div>
        <p className="mt-3 text-sm text-gray-600 sm:text-base">{description}</p>
        <ul className="mt-4 space-y-2 text-sm text-gray-600">
          {bullets.map((bullet) => (
            <li key={bullet} className="flex items-start gap-2">
              <span className="mt-1 inline-flex h-4 w-4 items-center justify-center rounded-full bg-emerald-50 text-emerald-700 ring-1 ring-emerald-600/20">
                ✓
              </span>
              <span>{bullet}</span>
            </li>
          ))}
        </ul>
      </div>

      <div className="step-visual">
        <div className="rounded-xl border border-gray-100 bg-white p-4 shadow-md sm:p-5">
          <Visual />
        </div>
      </div>
    </section>
  )
}

function GoogleCardMock() {
  return (
    <div className="mx-auto w-full max-w-sm rounded-xl border border-gray-100 bg-white p-4 shadow-sm">
      <p className="text-sm font-bold text-mb-ink">Bienvenido</p>
      <p className="mt-1 text-xs text-gray-500">Ingresá con Google o con tu email.</p>
      <button
        type="button"
        className="mt-4 flex h-12 w-full items-center justify-center gap-3 rounded-xl border border-gray-300 bg-white text-sm font-medium text-gray-700 shadow-sm"
      >
        <svg viewBox="0 0 48 48" className="h-5 w-5" aria-hidden="true">
          <path fill="#FFC107" d="M43.611 20.083H42V20H24v8h11.303C33.648 32.657 29.164 36 24 36c-6.627 0-12-5.373-12-12s5.373-12 12-12c3.059 0 5.842 1.154 7.962 3.038l5.657-5.657C34.047 6.053 29.239 4 24 4 12.955 4 4 12.955 4 24s8.955 20 20 20 20-8.955 20-20c0-1.341-.138-2.65-.389-3.917z" />
          <path fill="#FF3D00" d="M6.306 14.691l6.571 4.819C14.655 16.108 18.961 12 24 12c3.059 0 5.842 1.154 7.962 3.038l5.657-5.657C34.047 6.053 29.239 4 24 4 16.318 4 9.656 8.337 6.306 14.691z" />
          <path fill="#4CAF50" d="M24 44c5.134 0 9.86-1.979 13.409-5.197l-6.192-5.238C29.173 35.091 26.715 36 24 36c-5.143 0-9.61-3.317-11.268-7.946l-6.52 5.025C9.52 39.556 16.227 44 24 44z" />
          <path fill="#1976D2" d="M43.611 20.083H42V20H24v8h11.303a12.07 12.07 0 0 1-4.087 5.565h.003l6.192 5.238C36.973 39.205 44 34 44 24c0-1.341-.138-2.65-.389-3.917z" />
        </svg>
        Ingresar con Google
      </button>

      <div className="my-4 flex items-center gap-3">
        <div className="h-px flex-1 bg-gray-200" />
        <span className="text-[11px] font-medium text-gray-400">O</span>
        <div className="h-px flex-1 bg-gray-200" />
      </div>

      <div className="space-y-3">
        <div className="h-12 w-full rounded-xl border border-gray-200 bg-gray-50" />
        <div className="h-12 w-full rounded-xl border border-gray-200 bg-gray-50" />
        <div className="h-12 w-full rounded-xl bg-mb-primary" />
      </div>
    </div>
  )
}

function PublishFormMock() {
  return (
    <div className="mx-auto w-full max-w-sm rounded-xl border border-gray-100 bg-white p-4 shadow-sm">
      <p className="text-sm font-bold text-mb-ink">Detalles de la bici</p>
      <p className="mt-1 text-xs text-gray-500">Completá lo esencial para publicar.</p>

      <div className="mt-4 grid gap-3 sm:grid-cols-2">
        <div className="h-12 w-full rounded-xl border border-gray-200 bg-gray-50" />
        <div className="h-12 w-full rounded-xl border border-gray-200 bg-gray-50" />
        <div className="sm:col-span-2 h-12 w-full rounded-xl border border-gray-200 bg-gray-50" />
      </div>

      <div className="mt-4 rounded-xl border-2 border-dashed border-gray-200 bg-gray-50 p-4 text-center">
        <p className="text-xs font-medium text-gray-600">Arrastrá tus fotos acá</p>
        <p className="mt-1 text-[11px] text-gray-500">o tocá para subir</p>
      </div>

      <div className="mt-4 h-12 w-full rounded-xl bg-mb-primary" />
    </div>
  )
}

function BuyBoxMock() {
  return (
    <div className="mx-auto w-full max-w-sm rounded-xl border border-gray-100 bg-white p-4 shadow-sm">
      <div className="flex items-center gap-3">
        <div className="h-12 w-12 rounded-lg bg-gray-100" />
        <div className="min-w-0 flex-1">
          <p className="text-xs font-medium text-gray-500">Bicicleta</p>
          <p className="truncate text-sm font-bold text-mb-ink">Canyon Aeroad CF SL</p>
        </div>
        <p className="text-sm font-extrabold text-mb-ink">$ 2.950.000</p>
      </div>

      <div className="mt-4 flex items-center gap-3 rounded-xl border border-gray-200 bg-gray-50 p-3">
        <div className="h-9 w-9 rounded-full bg-gray-200" />
        <div className="min-w-0">
          <p className="text-sm font-semibold text-mb-ink">Vendedor</p>
          <p className="text-xs text-gray-500">Respuesta rápida</p>
        </div>
      </div>

      <button
        type="button"
        className="mt-4 flex h-12 w-full items-center justify-center rounded-xl bg-green-500 text-sm font-bold text-white shadow-sm"
      >
        Contactar por WhatsApp
      </button>
      <p className="mt-2 text-center text-[11px] text-gray-500">Disponible con Premium</p>
    </div>
  )
}
