import { useMemo, useState, useEffect } from 'react'
import { Link } from 'react-router-dom'
import Container from '../components/Container'
import Button from '../components/Button'
import ListingCard from '../components/ListingCard'
import { mockListings } from '../mock/mockData'
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
    title: 'Subí tu bici',
    description: 'Creá tu publicación durante la ventana del sorteo seleccionando fotos y detalles de tu bici.',
  },
  {
    title: 'Completá tus datos',
    description: 'Confirmá tus datos de contacto para que podamos avisarte si ganás.',
  },
  {
    title: 'Participás automático',
    description: 'Listo. No necesitás subir historias ni comprobantes, nosotros registramos tu participación.',
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
  const isActive = Boolean(countdown.parts && !countdown.ended)
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
    <div className="relative overflow-hidden bg-[#14212e] text-white">
      <div className="pointer-events-none absolute inset-0 -z-10">
        <div className="absolute -top-32 -left-20 h-80 w-80 rounded-full bg-[#ff6b00]/30 blur-3xl md:h-96 md:w-96" aria-hidden />
        <div className="absolute inset-x-0 top-0 h-[380px] bg-gradient-to-b from-white/10 via-white/5 to-transparent" aria-hidden />
        <div className="absolute bottom-[-120px] right-[-80px] h-80 w-80 rounded-full bg-white/10 blur-3xl md:h-[420px] md:w-[420px]" aria-hidden />
      </div>
      <div className="bg-gradient-to-b from-white/10 via-transparent to-transparent">
        <Container className="py-16 md:py-24">
          <div className="grid gap-12 md:grid-cols-[minmax(0,1fr),minmax(0,420px)] md:items-center">
            <div>
              <p className="text-sm font-semibold uppercase tracking-[0.28em] text-[#ffb36b]">Campaña especial</p>
              <h1 className="mt-4 text-3xl font-extrabold leading-tight text-white sm:text-4xl lg:text-5xl">
                Publicá tu bici y ganá 1 año de Strava Premium
              </h1>
              <p className="mt-4 max-w-xl text-lg text-white/80">{statusText}</p>

              <div className="mt-6 flex items-center gap-4">
                <img src="/logo-azul.png" alt="Ciclo Market" className="h-12 w-auto rounded-lg bg-white/80 p-2 shadow-md shadow-black/20" loading="lazy" decoding="async" />
                <span className="text-3xl font-semibold text-white/40">×</span>
                <img src="/strava.png" alt="Strava" className="h-12 w-auto rounded-lg bg-white/80 p-2 shadow-md shadow-black/20" loading="lazy" decoding="async" />
              </div>

              {isActive && countdown.parts ? (
                <div className="mt-8">
                  <p className="text-sm font-semibold uppercase tracking-[0.2em] text-white/60">Falta para que cierre</p>
                  <div className="mt-4 flex gap-3">
                    {[
                      { label: 'Días', value: countdown.parts.days },
                      { label: 'Horas', value: countdown.parts.hours },
                      { label: 'Minutos', value: countdown.parts.minutes },
                      { label: 'Segundos', value: countdown.parts.seconds },
                    ].map((segment) => (
                      <div
                        key={segment.label}
                        className="flex min-w-[72px] flex-col items-center rounded-2xl bg-white/80 px-4 py-3 text-center shadow-md shadow-[#14212e]/5 backdrop-blur"
                      >
                        <span className="text-2xl font-bold tabular-nums text-[#14212e]">
                          {segment.label === 'Días' ? segment.value : String(segment.value).padStart(2, '0')}
                        </span>
                        <span className="mt-1 text-xs font-medium uppercase tracking-wider text-[#14212e]/80">
                          {segment.label}
                        </span>
                      </div>
                    ))}
                  </div>
                </div>
              ) : null}

              <Button to="/publicar" variant="accent" className="mt-10 inline-flex items-center gap-2 px-7 py-3.5 text-lg rounded-2xl">
                Publicá tu bici ahora
              </Button>
              <p className="mt-3 text-sm text-white/70">
                Participás automáticamente. No tenés que subir historias ni comprobantes.
              </p>
            </div>

            <div className="relative">
              <div className="absolute -top-10 -right-6 hidden h-40 w-40 rounded-full bg-[#ff6b00]/30 blur-3xl md:block" aria-hidden="true" />
              <div className="relative overflow-hidden rounded-3xl border border-white/40 bg-white/90 p-8 shadow-2xl shadow-black/20 backdrop-blur">
                <div className="flex items-center justify-between gap-4">
                  <div>
                    <p className="text-sm font-semibold text-[#14212e]/60">Ventana del sorteo</p>
                    <p className="mt-2 text-lg font-semibold text-[#14212e]">{displayRange}</p>
                  </div>
                  <span className="inline-flex h-12 w-12 items-center justify-center rounded-full bg-[#14212e] text-2xl shadow-lg shadow-[#14212e]/30" aria-hidden="true">
                    🏁
                  </span>
                </div>
                <div className="mt-6 rounded-2xl border border-[#14212e]/10 bg-gradient-to-br from-[#14212e] to-[#1b2f3f] p-5 text-white shadow-lg">
                  <p className="text-sm font-semibold uppercase tracking-[0.2em] text-white/70">Badge en tu publicación</p>
                  <div className="mt-3 inline-flex items-center gap-2 rounded-full bg-white/10 px-4 py-2 text-sm font-semibold shadow-inner shadow-black/20">
                    <span aria-hidden="true">🏆</span>
                    <span>Participa por 1 año de Strava Premium</span>
                  </div>
                  <p className="mt-4 text-sm text-white/80">
                    Lo vas a ver automáticamente en las publicaciones que entren en el rango del sorteo.
                  </p>
                </div>
              </div>
            </div>
          </div>
        </Container>
      </div>

      <Container className="py-16 md:py-20">
        <div className="mx-auto max-w-4xl text-center">
          <h2 className="text-3xl font-bold text-white">Cómo participar</h2>
          <p className="mt-4 text-base text-white/70">Publicás, completás tus datos y listo. Sin fricción.</p>
        </div>
        <div className="mt-12 grid grid-cols-1 lg:grid-cols-[minmax(0,1fr)]">
          <ol ref={timelineRef as any} className={`relative mx-auto w-full max-w-3xl border-l border-white/15 pl-6 transition duration-700 ${timelineVisible ? 'opacity-100 translate-y-0' : 'opacity-0 translate-y-3'}`}>
            {steps.map((step, idx) => (
              <li key={step.title} className="group relative mb-10 last:mb-0">
                <span className="absolute -left-[9px] mt-1 h-4 w-4 rounded-full bg-[#ff6b00] ring-4 ring-[#14212e] transition-transform group-hover:scale-110" />
                <div className="rounded-2xl bg-white/5 p-5 backdrop-blur transition-all duration-300 group-hover:bg-white/10 group-hover:translate-x-1">
                  <p className="text-xs font-semibold uppercase tracking-[0.3em] text-white/60">Paso {String(idx + 1).padStart(2, '0')}</p>
                  <h3 className="mt-1 text-lg font-semibold text-white">{step.title}</h3>
                  <p className="mt-2 text-sm text-white/70">{step.description}</p>
                </div>
              </li>
            ))}
          </ol>
        </div>
      </Container>

      <Container className="py-12 md:py-16">
        <div className="grid gap-8 md:grid-cols-2 md:items-center">
          <div>
            <h3 className="text-2xl font-semibold text-white">Badge de la campaña</h3>
            <p className="mt-3 text-sm text-white/70">
              Así se ve el distintivo que suma credibilidad y visibilidad a tu publicación mientras el sorteo está activo.
            </p>
            <ul className="mt-6 space-y-3 text-sm text-white/70">
              <li>• Se agrega automáticamente en bicicletas publicadas dentro del rango.</li>
              <li>• No requiere configuraciones adicionales ni pagar un plan premium.</li>
              <li>• Te avisamos por email en cuanto quedás inscripto.</li>
            </ul>
            <Link to="/legales/sorteo-strava" className="mt-6 inline-flex items-center text-sm font-semibold text-[#ffb36b] hover:text-[#ff8c32]">
              Ver bases y condiciones →
            </Link>
          </div>
          <div ref={previewRef as any} className={`rounded-3xl border border-white/10 bg-white/5 p-4 shadow-xl shadow-black/20 backdrop-blur transition duration-700 ${previewVisible ? 'opacity-100 translate-y-0' : 'opacity-0 translate-y-3'}`}>
            <div className="mx-auto max-w-[420px]">
              <ListingCard l={mockListings[0]} likeCount={12} />
            </div>
            <p className="mt-3 text-center text-xs text-white/70">* Vista de ejemplo. El badge se muestra en publicaciones creadas entre {displayRange}.</p>
          </div>
        </div>
      </Container>

      <Container className="py-12 md:py-20">
        <div className="grid gap-8 md:grid-cols-2">
          <div className="rounded-3xl bg-white p-8 shadow-lg shadow-[#14212e]/10">
            <h3 className="text-2xl font-semibold text-[#14212e]">Seguimiento transparente</h3>
            <p className="mt-3 text-sm text-[#14212e]/70">
              Registramos automáticamente a cada vendedor que publica una bicicleta en la ventana del sorteo. El equipo puede descargar
              el CSV con todos los participantes desde el panel interno.
            </p>
          </div>
          <div className="rounded-3xl bg-white p-8 shadow-lg shadow-[#14212e]/10">
            <h3 className="text-2xl font-semibold text-[#14212e]">Ganador confirmado por email</h3>
            <p className="mt-3 text-sm text-[#14212e]/70">
              Al cierre del sorteo seleccionamos al ganador en vivo, lo anunciamos por email y coordinamos la activación de Strava Premium durante 12 meses.
            </p>
          </div>
        </div>
      </Container>
    </div>
  )
}
