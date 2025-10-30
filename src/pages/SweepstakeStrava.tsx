import { useMemo, useState, useEffect } from 'react'
import { Link } from 'react-router-dom'
import Container from '../components/Container'
import Button from '../components/Button'
import { useReveal } from '../hooks/useReveal'
import { useSweepstakes } from '../context/SweepstakesContext'

type CountdownParts = {
  days: number
  hours: number
  minutes: number
  seconds: number
}

function useCountdown(target: number | null) {
  const [now, setNow] = useState(() => Date.now())

  useEffect(() => {
    if (!target) return
    setNow(Date.now())
    const id = window.setInterval(() => {
      setNow(Date.now())
    }, 1000)
    return () => {
      window.clearInterval(id)
    }
  }, [target])

  return useMemo(() => {
    if (!target) {
      return { parts: null as CountdownParts | null, ended: false }
    }
    const diff = target - now
    if (diff <= 0) {
      return { parts: null, ended: true }
    }
    const totalSeconds = Math.floor(diff / 1000)
    const days = Math.floor(totalSeconds / 86400)
    const hours = Math.floor((totalSeconds % 86400) / 3600)
    const minutes = Math.floor((totalSeconds % 3600) / 60)
    const seconds = totalSeconds % 60
    return {
      parts: { days, hours, minutes, seconds },
      ended: false,
    }
  }, [now, target])
}

function formatDate(value?: number | null, options?: Intl.DateTimeFormatOptions): string | null {
  if (!value) return null
  try {
    return new Intl.DateTimeFormat('es-AR', options ?? { day: 'numeric', month: 'long', year: 'numeric' }).format(new Date(value))
  } catch {
    return null
  }
}

function formatDateRange(startAt?: number | null, endAt?: number | null): string | null {
  if (!startAt || !endAt) return null
  const sameMonth =
    new Date(startAt).getMonth() === new Date(endAt).getMonth() &&
    new Date(startAt).getFullYear() === new Date(endAt).getFullYear()
  const startLabel = formatDate(startAt, sameMonth ? { day: 'numeric' } : { day: 'numeric', month: 'long' })
  const endLabel = formatDate(endAt, { day: 'numeric', month: 'long', year: 'numeric' })
  if (!startLabel || !endLabel) return null
  return `${startLabel} al ${endLabel}`
}

const steps = [
  {
    title: 'Registrate y completá tus datos',
    description: 'Creá tu cuenta gratuita y verificá tus datos de contacto para habilitar la participación.',
  },
  {
    title: 'Subí tu bicicleta con el crédito disponible',
    description: 'Usá el crédito incluido para publicar tu bici durante la ventana del sorteo.',
  },
  {
    title: 'Ya estás participando',
    description: 'Nosotros registramos la publicación y quedás automáticamente en el sorteo de Strava Premium.',
  },
]

function computeFallbackEnd(): number {
  const now = new Date()
  const y = now.getFullYear()
  // 15 de noviembre (hora local 23:59:59)
  const end = new Date(y, 10, 15, 23, 59, 59)
  if (end.getTime() < now.getTime()) {
    // si ya pasó, usar el año próximo
    return new Date(y + 1, 10, 15, 23, 59, 59).getTime()
  }
  return end.getTime()
}

export default function SweepstakeStrava() {
  const { active, loading } = useSweepstakes()
  const startAt = active?.startAt ?? null
  const endAt = active?.endAt ?? computeFallbackEnd()
  const countdown = useCountdown(endAt)
  const activeRangeLabel = useMemo(() => formatDateRange(startAt, endAt), [startAt, endAt])
  const fallbackRangeLabel = 'Hoy al 15 de noviembre'
  const displayRange = activeRangeLabel ?? fallbackRangeLabel
  const [timelineRef, timelineVisible] = useReveal()
  const [previewRef, previewVisible] = useReveal()

  const statusText = useMemo(() => {
    if (loading) return 'Cargando fechas del sorteo…'
    if (activeRangeLabel) {
      return `Publicá tu bici entre el ${activeRangeLabel} y participás por 1 año de Strava Premium.`
    }
    return 'Publicá tu bici desde hoy hasta el 15 de noviembre y participás automáticamente por 1 año de Strava Premium.'
  }, [activeRangeLabel, loading])

  return (
    <div className="relative overflow-hidden bg-[#0b1321] text-white">
      <div className="pointer-events-none absolute inset-0 -z-10">
        <div className="absolute -top-40 left-[-18%] h-[420px] w-[420px] rounded-full bg-[#ff6b00]/25 blur-3xl md:h-[520px] md:w-[520px]" aria-hidden="true" />
        <div className="absolute top-[30%] right-[-12%] h-[360px] w-[360px] rounded-full bg-[#4f8cff]/20 blur-[140px] md:h-[420px] md:w-[420px]" aria-hidden="true" />
        <div className="absolute inset-x-0 bottom-0 h-[300px] bg-gradient-to-t from-[#0b1321] via-[#0b1321]/40 to-transparent" aria-hidden="true" />
        <div className="absolute inset-0 bg-[radial-gradient(circle_at_top,_rgba(255,255,255,0.08),_rgba(11,19,33,0))]" aria-hidden="true" />
      </div>
      <Container className="relative pb-20 pt-16 md:pb-28 md:pt-24">
        <div className="grid gap-16 lg:grid-cols-[minmax(0,1.1fr),minmax(0,0.9fr)] lg:items-center">
          <div className="max-w-xl">
            <span className="inline-flex items-center gap-2 rounded-full border border-white/10 bg-white/5 px-4 py-1 text-xs font-semibold uppercase tracking-[0.3em] text-white/70">
              Sorteo Strava Premium
            </span>
            <h1 className="mt-5 text-4xl font-black leading-tight sm:text-5xl md:text-[3.3rem]">
              <span className="bg-gradient-to-r from-white via-[#d8e7ff] to-white/80 bg-clip-text text-transparent">
                Badge oficial para destacar tu bici
              </span>
            </h1>
            <p className="mt-6 text-base text-white/75 sm:text-lg">
              Publicá tu bicicleta en Ciclo Market durante la ventana del sorteo y sumá un distintivo de confianza que aumenta clics y consultas. Si tu publicación califica, participás por 12 meses de Strava Premium.
            </p>
            <div className="mt-8 rounded-[20px] border border-white/10 bg-white/5 p-5 shadow-[0_20px_50px_-20px_rgba(0,0,0,0.4)] backdrop-blur">
              <p className="text-sm font-semibold text-white">{statusText}</p>
            </div>
            {countdown.parts ? (
              <div className="mt-8 flex flex-wrap gap-4 sm:flex-nowrap">
                {[
                  { label: 'Días', value: countdown.parts.days },
                  { label: 'Horas', value: countdown.parts.hours },
                  { label: 'Min', value: countdown.parts.minutes },
                  { label: 'Seg', value: countdown.parts.seconds },
                ].map((segment) => (
                  <div
                    key={segment.label}
                    className="relative flex-1 min-w-[70px] overflow-hidden rounded-2xl border border-white/10 bg-white/[0.08] px-5 py-4 shadow-inner shadow-black/20"
                  >
                    <div className="absolute inset-0 bg-[radial-gradient(circle_at_top,_rgba(255,255,255,0.18),_rgba(11,19,33,0))]" aria-hidden="true" />
                    <span className="relative block text-center text-3xl font-bold text-white">
                      {segment.label === 'Días' ? segment.value : String(segment.value).padStart(2, '0')}
                    </span>
                    <span className="relative mt-1 block text-center text-xs font-semibold uppercase tracking-[0.3em] text-white/60">
                      {segment.label}
                    </span>
                  </div>
                ))}
              </div>
            ) : (
              <p className="mt-8 text-sm font-medium uppercase tracking-[0.35em] text-white/60">Sorteo finalizado</p>
            )}
            <ul className="mt-8 space-y-3 text-sm text-white/70">
              {['Participación automática al publicar durante la ventana.', 'Badge optimizado para desktop y mobile.', 'Sin tareas extra: nosotros notificamos al ganador.'].map((item) => (
                <li key={item} className="flex items-start gap-3">
                  <span className="mt-1 inline-flex h-5 w-5 items-center justify-center rounded-full bg-[#ff6b00]/80 text-xs font-bold text-[#0b1321] shadow shadow-[#ff6b00]/30">
                    ✓
                  </span>
                  <span>{item}</span>
                </li>
              ))}
            </ul>
            <div className="mt-10 flex flex-col gap-3 sm:flex-row sm:items-center">
              <Button
                to="/register"
                variant="accent"
                className="inline-flex items-center gap-2 rounded-2xl px-8 py-3 text-base font-semibold shadow-lg shadow-[#ff6b00]/30"
              >
                Registrate y publicá gratis
              </Button>
              <Button
                to="/publicar"
                variant="secondary"
                className="inline-flex items-center gap-2 rounded-2xl border border-white/30 bg-white/10 px-8 py-3 text-base font-semibold text-white hover:bg-white/20"
              >
                Ya tengo cuenta
              </Button>
            </div>
            <p className="mt-3 text-sm text-white/70">
              ¿No tenés cuenta? Al registrarte te regalamos un crédito para publicar y participar sin pagar. Si ya sos usuario, publicá tu bici y sumate automáticamente al sorteo.
            </p>
          </div>
          <div className="relative flex justify-center">
            <div className="pointer-events-none absolute inset-x-10 top-[-10%] h-[260px] rounded-[200px] bg-gradient-to-br from-[#ff6b00]/40 via-transparent to-[#4f8cff]/30 blur-3xl" aria-hidden="true" />
            <div className="pointer-events-none absolute -bottom-12 left-1/2 h-64 w-64 -translate-x-1/2 rounded-full bg-[#4f8cff]/20 blur-3xl" aria-hidden="true" />
            <div className="relative w-full max-w-[480px] space-y-6">
              <div className="rounded-[28px] border border-white/20 bg-white/[0.07] p-6 shadow-[0_30px_80px_-40px_rgba(0,0,0,0.8)] backdrop-blur-xl">
                <div className="flex items-center justify-between gap-4">
                  <div>
                    <p className="text-xs font-semibold uppercase tracking-[0.35em] text-white/60">Ventana del sorteo</p>
                    <p className="mt-2 text-lg font-semibold text-white">{displayRange}</p>
                  </div>
                  <span className="inline-flex h-12 w-12 items-center justify-center rounded-full bg-white/10 text-2xl shadow-inner shadow-white/20" aria-hidden="true">
                    🏁
                  </span>
                </div>
                <p className="mt-4 text-sm text-white/70">
                  Todas las bicis publicadas durante este período muestran el badge de Strava Premium y entran automáticamente al sorteo.
                </p>
              </div>
              <div className="relative overflow-hidden rounded-[32px] border border-white/10 bg-gradient-to-br from-white/15 via-white/5 to-white/0 p-4 shadow-[0_40px_80px_-30px_rgba(15,23,42,0.75)] backdrop-blur-xl">
                <div className="absolute inset-0 bg-[radial-gradient(circle_at_top,_rgba(255,255,255,0.25),_transparent)]" aria-hidden="true" />
                <div className="relative rounded-[26px] border border-white/20 bg-[#0d1626] p-3">
                  <picture>
                    <source srcSet="/design/mobile-badge.PNG" media="(max-width: 768px)" />
                    <img
                      src="/design/desktop-badge.png"
                      alt="Previsualización del badge aplicado a una publicación"
                      className="mx-auto w-full max-w-[420px] rounded-2xl shadow-2xl shadow-black/40"
                      loading="lazy"
                      decoding="async"
                    />
                  </picture>
                </div>
              </div>
            </div>
          </div>
        </div>
      </Container>

      <Container className="py-16 md:py-24">
        <div className="mx-auto max-w-4xl text-center">
          <span className="inline-flex items-center gap-2 rounded-full border border-white/10 bg-white/5 px-4 py-1 text-xs font-semibold uppercase tracking-[0.3em] text-white/70">
            Proceso simple
          </span>
          <h2 className="mt-4 text-3xl font-bold text-white sm:text-4xl">Participar toma menos de 5 minutos</h2>
          <p className="mt-4 text-base text-white/70">
            Publicás tu bici, completás tus datos y listo. Nosotros registramos tu participación automáticamente.
          </p>
        </div>
        <div
          ref={timelineRef as any}
          className={`mt-12 grid gap-6 sm:grid-cols-2 lg:grid-cols-3 transition duration-700 ${timelineVisible ? 'opacity-100 translate-y-0' : 'opacity-0 translate-y-4'}`}
        >
          {steps.map((step, idx) => (
            <div
              key={step.title}
              className="group relative overflow-hidden rounded-[28px] border border-white/10 bg-white/5 p-6 shadow-[0_25px_60px_-30px_rgba(0,0,0,0.8)] backdrop-blur"
            >
              <div
                className="absolute inset-0 bg-[radial-gradient(circle_at_top,_rgba(255,255,255,0.18),_transparent)] opacity-0 transition-opacity duration-300 group-hover:opacity-100"
                aria-hidden="true"
              />
              <div className="relative flex items-center justify-between">
                <span className="inline-flex h-10 w-10 items-center justify-center rounded-2xl bg-[#ff6b00]/90 text-lg font-bold text-[#0b1321] shadow shadow-[#ff6b00]/40">
                  {String(idx + 1).padStart(2, '0')}
                </span>
                <span className="text-xs font-semibold uppercase tracking-[0.3em] text-white/50">Paso</span>
              </div>
              <h3 className="relative mt-5 text-xl font-semibold text-white">{step.title}</h3>
              <p className="relative mt-3 text-sm text-white/70">{step.description}</p>
            </div>
          ))}
        </div>
      </Container>

      <Container className="py-12 md:py-20">
        <div className="grid gap-12 lg:grid-cols-[minmax(0,0.9fr),minmax(0,1.1fr)] lg:items-center">
          <div>
            <span className="inline-flex items-center gap-2 rounded-full border border-white/10 bg-white/5 px-4 py-1 text-xs font-semibold uppercase tracking-[0.3em] text-white/70">
              Badge en tu anuncio
            </span>
            <h3 className="mt-4 text-3xl font-bold text-white sm:text-4xl">
              La insignia que convierte visitas en consultas
            </h3>
            <p className="mt-4 text-sm text-white/70 sm:text-base">
              El sello de Strava Premium aparece automáticamente en publicaciones creadas dentro del rango del sorteo. Muestra que tu bici participa en una campaña verificada y atrae más clics de compradores.
            </p>
            <ul className="mt-6 space-y-3 text-sm text-white/70">
              <li className="flex items-start gap-3">
                <span className="mt-1 inline-flex h-5 w-5 items-center justify-center rounded-full bg-white/15 text-xs text-white">●</span>
                Se aplica solo con publicar tu bici; no requiere planes adicionales.
              </li>
              <li className="flex items-start gap-3">
                <span className="mt-1 inline-flex h-5 w-5 items-center justify-center rounded-full bg-white/15 text-xs text-white">●</span>
                Visible en desktop y mobile con un diseño adaptado a cada vista.
              </li>
              <li className="flex items-start gap-3">
                <span className="mt-1 inline-flex h-5 w-5 items-center justify-center rounded-full bg-white/15 text-xs text-white">●</span>
                Te avisamos por email apenas quedás inscripto con tu publicación.
              </li>
            </ul>
            <Link to="/legales/sorteo-strava" className="mt-6 inline-flex items-center text-sm font-semibold text-[#ffb36b] hover:text-[#ff8c32]">
              Ver bases y condiciones →
            </Link>
          </div>
          <div
            ref={previewRef as any}
            className={`relative flex justify-center transition duration-700 ${previewVisible ? 'opacity-100 translate-y-0' : 'opacity-0 translate-y-3'}`}
          >
            <div className="relative w-full max-w-[540px]">
              <div className="absolute inset-0 rounded-[36px] bg-gradient-to-br from-[#ff6b00]/30 via-transparent to-[#4f8cff]/25 blur-2xl" aria-hidden="true" />
              <div className="relative overflow-hidden rounded-[32px] border border-white/15 bg-white/10 p-4 shadow-[0_35px_80px_-25px_rgba(0,0,0,0.75)] backdrop-blur">
                <div className="rounded-[26px] border border-white/15 bg-[#0d1626] p-3">
                  <img
                    src="/design/desktop-badge.png"
                    alt="Ejemplo de la publicación en desktop con el badge de Strava Premium"
                    className="w-full rounded-2xl shadow-2xl shadow-black/40"
                    loading="lazy"
                    decoding="async"
                  />
                </div>
              </div>
              <div className="absolute -bottom-10 left-[10%] w-[46%] max-w-[220px] overflow-hidden rounded-[24px] border border-white/20 bg-white/80 p-2 shadow-xl shadow-black/20 backdrop-blur">
                <img
                  src="/design/mobile-badge.PNG"
                  alt="Vista mobile del badge aplicado a una publicación"
                  className="w-full rounded-[18px] shadow-lg shadow-black/30"
                  loading="lazy"
                  decoding="async"
                />
              </div>
            </div>
          </div>
        </div>
        <p className="mt-12 text-center text-xs text-white/60">* El badge se muestra automáticamente en publicaciones creadas entre {displayRange}.</p>
      </Container>

      <Container className="pb-20">
        <div className="grid gap-6 md:grid-cols-2">
          <div className="overflow-hidden rounded-[28px] border border-white/10 bg-white/10 p-8 shadow-[0_30px_70px_-35px_rgba(0,0,0,0.8)] backdrop-blur">
            <div className="flex items-center gap-3">
              <span className="inline-flex h-10 w-10 items-center justify-center rounded-full bg-[#ff6b00]/20 text-lg">📊</span>
              <h3 className="text-xl font-semibold text-white">Seguimiento transparente</h3>
            </div>
            <p className="mt-4 text-sm text-white/70">
              Registramos automáticamente cada vendedor que publica una bicicleta en la ventana del sorteo. El equipo puede exportar el listado completo desde el panel interno en cualquier momento.
            </p>
          </div>
          <div className="overflow-hidden rounded-[28px] border border-white/10 bg-white/10 p-8 shadow-[0_30px_70px_-35px_rgba(0,0,0,0.8)] backdrop-blur">
            <div className="flex items-center gap-3">
              <span className="inline-flex h-10 w-10 items-center justify-center rounded-full bg-[#4f8cff]/25 text-lg">📬</span>
              <h3 className="text-xl font-semibold text-white">Ganador confirmado por email</h3>
            </div>
            <p className="mt-4 text-sm text-white/70">
              Al cierre del sorteo seleccionamos al ganador en vivo, lo anunciamos por email y coordinamos la activación de Strava Premium durante 12 meses junto al equipo de Strava.
            </p>
          </div>
        </div>
      </Container>
    </div>
  )
}
