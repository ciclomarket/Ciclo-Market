import { useEffect, useMemo, useState } from 'react'
import { Link, useLocation } from 'react-router-dom'
import Container from '../../components/Container'
import Button from '../../components/Button'
import { useAuth } from '../../context/AuthContext'
import { CheckCircle2, ChevronRight, Circle, CircleCheck, Copy, ExternalLink, PlayCircle, Store, Zap } from 'lucide-react'

type GuideState = {
  version: 1
  completed: Record<string, boolean>
}

const STORAGE_KEY = 'cm_stores_guide_v1'

function safeParseState(raw: string | null): GuideState | null {
  if (!raw) return null
  try {
    const parsed = JSON.parse(raw) as Partial<GuideState>
    if (!parsed || parsed.version !== 1 || typeof parsed.completed !== 'object' || !parsed.completed) return null
    return { version: 1, completed: parsed.completed as Record<string, boolean> }
  } catch {
    return null
  }
}

function buildDashboardLink(tab: string) {
  return `/dashboard?tab=${encodeURIComponent(tab)}`
}

function copyToClipboard(text: string) {
  if (typeof navigator === 'undefined' || !navigator.clipboard) return Promise.reject(new Error('clipboard_unavailable'))
  return navigator.clipboard.writeText(text)
}

const GUIDE_STEPS = [
  {
    id: 'registro',
    title: '1) Registro y acceso',
    description:
      'Creá tu cuenta, confirmá el email e iniciá sesión. Esto te habilita el panel para cargar y gestionar tu catálogo.',
    image: '/guides/tiendas/step-registro.svg',
    actions: [
      { label: 'Crear cuenta', to: '/register', icon: ChevronRight },
      { label: 'Iniciar sesión', to: '/login', icon: ChevronRight },
    ],
  },
  {
    id: 'perfil-tienda',
    title: '2) Configurar perfil de Tienda',
    description:
      'Entrá al dashboard y completá tu perfil de tienda (nombre, banner, redes, dirección). Un perfil completo genera más confianza y mejora la conversión.',
    image: '/guides/tiendas/step-dashboard.svg',
    actions: [
      { label: 'Abrir “Editar tienda”', to: buildDashboardLink('Editar tienda'), icon: Store },
      { label: 'Abrir “Editar perfil”', to: buildDashboardLink('Editar perfil'), icon: ChevronRight },
    ],
  },
  {
    id: 'cargar-productos',
    title: '3) Cargar productos (publicar)',
    description:
      'Publicá tus productos desde “Publicar”. Vas a poder subir fotos, descripción, ubicación y precio. Tip: fotos bien iluminadas aumentan los contactos.',
    image: '/guides/tiendas/step-publicar.svg',
    actions: [{ label: 'Ir a “Publicar”', to: '/publicar', icon: Zap }],
  },
  {
    id: 'gestionar',
    title: '4) Gestionar publicaciones',
    description:
      'Desde “Publicaciones” podés editar, pausar, marcar como vendida y optimizar tu aviso. Mantener el catálogo actualizado mejora el ranking.',
    image: '/guides/tiendas/step-publicaciones.svg',
    actions: [{ label: 'Abrir “Publicaciones”', to: buildDashboardLink('Publicaciones'), icon: ChevronRight }],
  },
  {
    id: 'precios',
    title: '5) Modificar precio y bajar precio (estrategia)',
    description:
      'Si notás pocas visitas o consultas, probá ajustar el precio. Bajar precio suele reactivar el interés y te devuelve visibilidad en el marketplace.',
    image: '/guides/tiendas/step-precios.svg',
    actions: [{ label: 'Cambiar precio desde “Publicaciones”', to: buildDashboardLink('Publicaciones'), icon: ChevronRight }],
  },
  {
    id: 'whatsapp',
    title: '6) Contacto directo (WhatsApp) y velocidad de respuesta',
    description:
      'Te están escribiendo por email por tu publicación y eso a la gente no le gusta: es lento y poco práctico. Activar WhatsApp acelera la respuesta, sube la confianza y mejora la conversión.',
    image: '/guides/tiendas/step-whatsapp.svg',
    actions: [{ label: 'Activar WhatsApp (desde Publicaciones)', to: buildDashboardLink('Publicaciones'), icon: ChevronRight }],
  },
] as const

export default function StoresGuide() {
  const { user, loading } = useAuth()
  const location = useLocation()

  const [state, setState] = useState<GuideState>(() => {
    if (typeof window === 'undefined') return { version: 1, completed: {} }
    return safeParseState(window.localStorage.getItem(STORAGE_KEY)) || { version: 1, completed: {} }
  })

  useEffect(() => {
    try {
      window.localStorage.setItem(STORAGE_KEY, JSON.stringify(state))
    } catch {
      // ignore
    }
  }, [state])

  const completedCount = useMemo(() => {
    return GUIDE_STEPS.reduce((acc, step) => acc + (state.completed[step.id] ? 1 : 0), 0)
  }, [state.completed])

  const progressPct = Math.round((completedCount / GUIDE_STEPS.length) * 100)

  function toggleStep(id: string) {
    setState((prev) => ({
      version: 1,
      completed: { ...prev.completed, [id]: !prev.completed[id] },
    }))
  }

  const shareUrl = useMemo(() => {
    if (typeof window === 'undefined') return 'https://ciclomarket.ar/guia/tiendas'
    return `${window.location.origin}${location.pathname}`
  }, [location.pathname])

  const isAuthed = Boolean(user?.id)

  return (
    <div className="relative overflow-hidden">
      <div className="pointer-events-none absolute inset-0 bg-[radial-gradient(circle_at_top,rgba(37,99,235,0.14),transparent_55%),radial-gradient(circle_at_bottom,rgba(124,58,237,0.10),transparent_55%)]" />
      <Container className="relative">
        <div className="mx-auto max-w-5xl">
          <div className="rounded-3xl border border-gray-200 bg-white/80 p-6 shadow-[0_18px_45px_rgba(15,23,42,0.08)] backdrop-blur md:p-10">
            <div className="flex flex-col gap-6 md:flex-row md:items-start md:justify-between">
              <div className="min-w-0">
                <div className="inline-flex items-center gap-2 rounded-full border border-gray-200 bg-white px-3 py-1 text-xs font-semibold text-gray-700">
                  <Store className="h-4 w-4 text-[#14212e]" />
                  Guía rápida para Tiendas
                </div>
                <h1 className="mt-3 text-balance text-3xl font-extrabold tracking-tight text-[#14212e] md:text-4xl">
                  De 0 a catálogo online en Ciclo Market
                </h1>
                <p className="mt-3 max-w-2xl text-pretty text-sm leading-relaxed text-gray-600 md:text-base">
                  Esta guía te acompaña paso a paso desde el registro hasta la carga y gestión de productos. Sin llamada, sin vueltas:
                  entrás, configurás y empezás a vender.
                </p>
                <div className="mt-5 flex flex-wrap gap-2">
                  <Button
                    variant="primary"
                    className="bg-[#14212e] shadow-[0_18px_40px_rgba(20,33,46,0.22)] hover:bg-[#1b2f3f]"
                    to={isAuthed ? buildDashboardLink('Publicaciones') : '/login'}
                  >
                    {isAuthed ? 'Abrir mi dashboard' : 'Iniciar sesión'}
                  </Button>
                  <Button variant="secondary" className="border-gray-200 bg-white" to="/publicar">
                    Publicar un producto
                  </Button>
                  <button
                    type="button"
                    className="inline-flex items-center gap-2 rounded-xl border border-gray-200 bg-white px-4 py-3 text-sm font-semibold text-gray-700 shadow-sm hover:bg-gray-50"
                    onClick={async () => {
                      try {
                        await copyToClipboard(shareUrl)
                      } catch {
                        // noop
                      }
                    }}
                  >
                    <Copy className="h-4 w-4" />
                    Copiar link
                  </button>
                </div>
              </div>

              <div className="w-full max-w-sm shrink-0 rounded-2xl border border-gray-200 bg-white p-4">
                <div className="flex items-center justify-between">
                  <div className="text-sm font-semibold text-gray-800">Progreso</div>
                  <div className="text-sm font-semibold text-gray-600">
                    {completedCount}/{GUIDE_STEPS.length}
                  </div>
                </div>
                <div className="mt-3 h-2 w-full overflow-hidden rounded-full bg-gray-100">
                  <div className="h-full rounded-full bg-gradient-to-r from-blue-600 via-indigo-600 to-violet-600" style={{ width: `${progressPct}%` }} />
                </div>
                <div className="mt-3 text-xs text-gray-600">
                  Marcá cada paso como completado para llevar el seguimiento.
                </div>
                <div className="mt-4 rounded-xl bg-gradient-to-br from-[#0b1220] to-[#14212e] p-4 text-white">
                  <div className="flex items-start gap-3">
                    <PlayCircle className="mt-0.5 h-5 w-5 text-white/90" />
                    <div className="min-w-0">
                      <div className="text-sm font-extrabold">Video corto (recomendado)</div>
                      <div className="mt-1 text-xs leading-relaxed text-white/80">
                        Pegá acá tu video Loom/Drive con un recorrido del dashboard y edición de precio.
                      </div>
                      <a
                        className="mt-3 inline-flex items-center gap-2 rounded-lg bg-white/10 px-3 py-2 text-xs font-semibold text-white hover:bg-white/15"
                        href="https://ciclomarket.ar/ayuda"
                        target="_blank"
                        rel="noreferrer"
                      >
                        Placeholder link <ExternalLink className="h-4 w-4" />
                      </a>
                    </div>
                  </div>
                </div>
              </div>
            </div>

            <div className="mt-10 grid gap-4 md:gap-6">
              {!loading && !isAuthed ? (
                <div className="rounded-2xl border border-amber-200 bg-amber-50 p-4 text-sm text-amber-900">
                  Para que los botones “Abrir dashboard” funcionen, primero iniciá sesión.
                  <div className="mt-3 flex flex-wrap gap-2">
                    <Button to="/login" variant="primary" className="bg-amber-600 hover:bg-amber-700">
                      Iniciar sesión
                    </Button>
                    <Button to="/register" variant="secondary" className="border-amber-200 bg-white">
                      Crear cuenta
                    </Button>
                  </div>
                </div>
              ) : null}

              {GUIDE_STEPS.map((step) => {
                const done = Boolean(state.completed[step.id])
                return (
                  <section
                    key={step.id}
                    id={step.id}
                    className="group rounded-2xl border border-gray-200 bg-white p-5 shadow-sm transition hover:shadow-md md:p-6"
                  >
                    <div className="flex flex-col gap-4 md:flex-row md:items-start md:justify-between">
                      <div className="min-w-0">
                        <button
                          type="button"
                          className="flex w-full items-start gap-3 text-left"
                          onClick={() => toggleStep(step.id)}
                        >
                          {done ? (
                            <CircleCheck className="mt-0.5 h-6 w-6 text-emerald-600" />
                          ) : (
                            <Circle className="mt-0.5 h-6 w-6 text-gray-300" />
                          )}
                          <div className="min-w-0">
                            <h2 className="text-lg font-extrabold text-[#14212e] md:text-xl">{step.title}</h2>
                            <p className="mt-1 text-sm leading-relaxed text-gray-600">{step.description}</p>
                          </div>
                        </button>

                        <div className="mt-4 flex flex-wrap gap-2">
                          {step.actions.map((a) => {
                            const Icon = a.icon
                            const resolvedTo =
                              !isAuthed && a.to.startsWith('/dashboard')
                                ? `/login?next=${encodeURIComponent(a.to)}`
                                : a.to
                            return (
                              <Button
                                key={`${step.id}:${a.to}`}
                                to={resolvedTo}
                                variant="secondary"
                                className="border-gray-200 bg-white text-[#14212e] hover:bg-gray-50"
                              >
                                <span className="inline-flex items-center gap-2">
                                  <Icon className="h-4 w-4" />
                                  {a.label}
                                </span>
                              </Button>
                            )
                          })}
                          <Link
                            className="inline-flex items-center gap-2 rounded-xl px-3 py-3 text-sm font-semibold text-gray-600 hover:text-gray-800"
                            to={`#${step.id}`}
                          >
                            Enlace directo <ChevronRight className="h-4 w-4" />
                          </Link>
                        </div>
                      </div>

                      <div className="w-full max-w-sm overflow-hidden rounded-xl border border-gray-200 bg-gray-50">
                        <img
                          src={step.image}
                          alt={step.title}
                          className="h-auto w-full object-cover"
                          loading="lazy"
                        />
                      </div>
                    </div>
                  </section>
                )
              })}
            </div>

            <div className="mt-10 grid gap-4 md:grid-cols-2">
              <div className="rounded-2xl border border-gray-200 bg-white p-6 shadow-sm">
                <div className="flex items-start gap-3">
                  <CheckCircle2 className="mt-0.5 h-6 w-6 text-emerald-600" />
                  <div>
                    <div className="text-lg font-extrabold text-[#14212e]">Checklist final</div>
                    <ul className="mt-2 list-disc space-y-1 pl-5 text-sm text-gray-600">
                      <li>Perfil de tienda completo (banner + redes)</li>
                      <li>Al menos 10 publicaciones activas</li>
                      <li>Precios actualizados y competitivos</li>
                      <li>WhatsApp activado y respuestas rápidas</li>
                    </ul>
                  </div>
                </div>
              </div>

              <div className="rounded-2xl border border-gray-200 bg-gradient-to-br from-blue-600 via-indigo-600 to-violet-600 p-6 text-white shadow-[0_18px_45px_rgba(37,99,235,0.18)]">
                <div className="flex items-start gap-3">
                  <Zap className="mt-0.5 h-6 w-6 text-white" />
                  <div>
                    <div className="text-lg font-extrabold">Tip de performance</div>
                    <p className="mt-2 text-sm leading-relaxed text-white/90">
                      Si bajás el precio de un producto, aprovechá para actualizar la primera foto y el título. Eso suele mejorar el CTR y reactivar consultas.
                    </p>
                    <div className="mt-4 flex flex-wrap gap-2">
                      <Button
                        to={buildDashboardLink('Publicaciones')}
                        variant="primary"
                        className="bg-white text-[#14212e] hover:bg-white/90"
                      >
                        Ir a Publicaciones
                      </Button>
                      <Button to="/publicar" variant="secondary" className="border-white/20 bg-white/10 text-white hover:bg-white/15">
                        Publicar otro producto
                      </Button>
                    </div>
                  </div>
                </div>
              </div>
            </div>
          </div>
        </div>
      </Container>
    </div>
  )
}
