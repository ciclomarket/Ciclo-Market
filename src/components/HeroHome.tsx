import { Link } from 'react-router-dom'
import { ArrowRight, CheckCircle, Users, Store, BadgeCheck, MapPin, Globe } from 'lucide-react'
import { useState, useEffect, useRef } from 'react'
import { AnimatePresence, motion } from 'framer-motion'

const WHATSAPP_DEMO_URL = `https://wa.me/5493764748459?text=${encodeURIComponent('Hola! Quiero ver una demo de Tienda Oficial en Ciclomarket. ¿Cómo seguimos?')}`

function StoreVisual() {
  return (
    <div className="relative mx-auto max-w-[480px]">
      <div className="absolute -inset-6 rounded-[2.75rem] bg-gradient-to-br from-cyan-500/20 via-blue-500/10 to-transparent blur-2xl" />
      <div className="relative overflow-hidden rounded-[2.25rem] border border-white/15 bg-white/10 shadow-[0_24px_70px_-30px_rgba(0,0,0,0.6)]">
        <div className="flex items-center gap-2 border-b border-white/10 bg-white/5 px-5 py-4">
          <div className="h-3 w-3 rounded-full bg-red-400/60" />
          <div className="h-3 w-3 rounded-full bg-amber-400/60" />
          <div className="h-3 w-3 rounded-full bg-emerald-400/60" />
          <div className="ml-3 h-2.5 w-40 rounded-full bg-white/20" />
        </div>
        <div className="p-5 space-y-3">
          <div className="overflow-hidden rounded-2xl bg-white shadow-sm">
            <div className="relative h-24">
              <img
                src="https://jmtsgywgeysagnfgdovr.supabase.co/storage/v1/object/public/avatars/banners/40014f13-b9e9-4041-a791-affb9a1531aa/1762378299572_1-1ef6caa4.webp"
                alt=""
                className="h-full w-full object-cover"
                style={{ objectPosition: 'center 75%' }}
                loading="lazy"
                decoding="async"
              />
              <div className="absolute inset-0 bg-gradient-to-r from-[#14212E]/55 to-[#14212E]/10" />
            </div>
            <div className="relative px-4 pb-4">
              <div className="-mt-8">
                <div className="h-14 w-14 rounded-full bg-white p-1 shadow-sm ring-4 ring-white">
                  <img
                    src="https://jmtsgywgeysagnfgdovr.supabase.co/storage/v1/object/public/avatars/stores/40014f13-b9e9-4041-a791-affb9a1531aa/avatar_1762378292509_IMG_3493.webp"
                    alt=""
                    className="h-full w-full rounded-full object-contain bg-white"
                    loading="lazy"
                    decoding="async"
                  />
                </div>
              </div>
              <div className="mt-3">
                <div className="flex flex-wrap items-center gap-2">
                  <p className="text-sm font-bold text-gray-900">Giant La Lucila</p>
                  <span className="inline-flex items-center gap-1 rounded-full bg-cyan-50 px-2 py-0.5 text-xs font-semibold text-cyan-700">
                    <BadgeCheck className="h-3 w-3" />
                    Tienda Oficial
                  </span>
                </div>
                <p className="mt-0.5 text-xs text-gray-500">La Lucila, Buenos Aires</p>
              </div>
              <div className="mt-3 grid grid-cols-3 gap-2">
                <div className="rounded-xl border border-gray-100 bg-gray-50 p-2">
                  <p className="text-[10px] font-semibold text-gray-900">Catálogo</p>
                  <p className="mt-0.5 text-[10px] text-gray-600">Ilimitado</p>
                </div>
                <div className="rounded-xl border border-gray-100 bg-gray-50 p-2">
                  <p className="text-[10px] font-semibold text-gray-900">Contacto</p>
                  <p className="mt-0.5 text-[10px] text-gray-600">WhatsApp</p>
                </div>
                <div className="rounded-xl border border-gray-100 bg-gray-50 p-2">
                  <p className="text-[10px] font-semibold text-gray-900">Confianza</p>
                  <p className="mt-0.5 text-[10px] text-gray-600">Verificada</p>
                </div>
              </div>
            </div>
          </div>
          <div className="rounded-2xl bg-white/90 p-3 shadow-sm">
            <p className="text-[10px] font-semibold uppercase tracking-wider text-gray-500">Indexado en Google</p>
            <p className="mt-1 text-xs font-bold text-gray-900">ciclomarket.ar/tienda/giant_lalucila</p>
            <p className="mt-0.5 text-[10px] text-gray-500">Posición 1 · "Giant La Lucila bicis"</p>
          </div>
        </div>
      </div>
    </div>
  )
}

export default function HeroHome() {
  const [slide, setSlide] = useState(0)
  const [autoScrollDone, setAutoScrollDone] = useState(false)
  const [hovering, setHovering] = useState(false)
  const timerRef = useRef<ReturnType<typeof setTimeout> | null>(null)

  useEffect(() => {
    if (autoScrollDone || hovering) return
    timerRef.current = setTimeout(() => {
      setSlide(1)
      setAutoScrollDone(true)
    }, 5000)
    return () => {
      if (timerRef.current) clearTimeout(timerRef.current)
    }
  }, [autoScrollDone, hovering])

  function goToSlide(index: number) {
    if (timerRef.current) clearTimeout(timerRef.current)
    setAutoScrollDone(true)
    setSlide(index)
  }

  return (
    <section
      className="relative min-h-[550px] lg:min-h-[560px] overflow-hidden bg-[#14212E]"
      onMouseEnter={() => setHovering(true)}
      onMouseLeave={() => setHovering(false)}
    >
      <AnimatePresence mode="wait" initial={false}>
        {slide === 0 ? (
          <motion.div
            key="slide-buyers"
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            transition={{ duration: 0.5 }}
            className="absolute inset-0"
          >
            {/* Imagen de bicicleta - Desktop (45% derecha) */}
            <div className="hidden lg:block absolute right-0 top-0 w-[45%] h-full z-[1]">
              {/* Gradiente de esfumado hacia el texto */}
              <div
                className="absolute left-0 top-0 w-[80%] h-full z-[2]"
                style={{
                  background: 'linear-gradient(90deg, #14212E 0%, transparent 100%)'
                }}
              />
              <picture>
                <source srcSet="/images/hero-bike.webp" type="image/webp" />
                <img
                  src="/bike.jpg"
                  alt="Bicicleta MTB profesional"
                  className="w-full h-full object-cover object-center"
                  decoding="async"
                  loading="eager"
                  fetchPriority="high"
                />
              </picture>
            </div>

            {/* Mobile: imagen como fondo con overlay oscuro */}
            <div
              className="lg:hidden absolute inset-0 z-[0]"
              style={{
                background: `linear-gradient(180deg, rgba(20,33,46,0.95) 0%, rgba(20,33,46,0.85) 40%, rgba(20,33,46,0.7) 100%), url(/images/hero-bike.webp)`,
                backgroundSize: 'cover',
                backgroundPosition: 'center 60%'
              }}
            />

            {/* Contenido - 55% ancho en desktop */}
            <div className="relative z-[3] w-full lg:w-[55%] px-6 sm:px-8 lg:px-[4%] py-12 sm:py-16 lg:py-[60px] flex items-center min-h-[550px] lg:min-h-[560px]">
              <div className="max-w-xl mx-auto lg:mx-0 text-center lg:text-left">
                {/* Título con gradiente en "#1 de ciclismo" */}
                <h1 className="text-[clamp(36px,5vw,56px)] font-extrabold text-white leading-[1.1] tracking-[-0.02em] mb-5">
                  El marketplace{' '}
                  <span className="bg-gradient-to-r from-cyan-400 to-blue-500 bg-clip-text text-transparent">
                    #1 de ciclismo
                  </span>{' '}
                  en Argentina
                </h1>

                {/* Subtítulo */}
                <p className="text-base text-white/65 leading-relaxed mb-8 max-w-[420px] mx-auto lg:mx-0">
                  Comprá y vendé bicicletas de ruta, MTB y gravel con total tranquilidad. Verificamos cada usuario.
                </p>

                {/* Botones CTA */}
                <div className="flex flex-col sm:flex-row gap-3 mb-8 justify-center lg:justify-start">
                  <Link
                    to="/marketplace"
                    className="group inline-flex items-center justify-center gap-2 px-6 py-3.5 rounded-xl bg-gradient-to-r from-cyan-400 to-blue-500 text-[#0a0a0a] font-semibold text-sm transition-all hover:-translate-y-0.5 hover:shadow-[0_8px_25px_rgba(0,150,255,0.4)]"
                  >
                    Explorar bicicletas
                    <ArrowRight className="w-4 h-4 transition-transform group-hover:translate-x-1" />
                  </Link>
                  <Link
                    to="/publicar"
                    className="inline-flex items-center justify-center gap-2 px-6 py-3.5 rounded-xl border-[1.5px] border-white/25 text-white font-semibold text-sm transition-all hover:bg-white/5 hover:border-white/40"
                  >
                    Vendé tu bici
                  </Link>
                </div>

                {/* 3 Features */}
                <div className="flex flex-wrap justify-center lg:justify-start gap-4 sm:gap-6 pt-5 border-t border-white/[0.08]">
                  <div className="flex items-center gap-2 text-[13px] text-white/60">
                    <CheckCircle className="w-4 h-4 text-cyan-400 flex-shrink-0" />
                    <span>Publicación gratuita</span>
                  </div>
                  <div className="flex items-center gap-2 text-[13px] text-white/60">
                    <Users className="w-4 h-4 text-cyan-400 flex-shrink-0" />
                    <span>Usuarios verificados</span>
                  </div>
                  <div className="flex items-center gap-2 text-[13px] text-white/60">
                    <Store className="w-4 h-4 text-cyan-400 flex-shrink-0" />
                    <span>Tiendas oficiales</span>
                  </div>
                </div>
              </div>
            </div>
          </motion.div>
        ) : (
          <motion.div
            key="slide-stores"
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            transition={{ duration: 0.5 }}
            className="absolute inset-0"
          >
            {/* Mobile: mismo fondo oscuro */}
            <div
              className="lg:hidden absolute inset-0 z-[0]"
              style={{
                background: `linear-gradient(180deg, rgba(20,33,46,0.95) 0%, rgba(20,33,46,0.85) 40%, rgba(20,33,46,0.7) 100%), url(/images/hero-bike.webp)`,
                backgroundSize: 'cover',
                backgroundPosition: 'center 60%'
              }}
            />

            {/* Desktop: mockup tienda en el 45% derecho */}
            <div className="hidden lg:flex absolute right-0 top-0 w-[45%] h-full z-[1] items-center justify-center px-10">
              <div
                className="absolute left-0 top-0 w-[55%] h-full z-[2]"
                style={{ background: 'linear-gradient(90deg, #14212E 0%, transparent 100%)' }}
              />
              <div className="relative z-[3] w-full">
                <StoreVisual />
              </div>
            </div>

            {/* Contenido - 55% ancho en desktop */}
            <div className="relative z-[3] w-full lg:w-[55%] px-6 sm:px-8 lg:px-[4%] py-12 sm:py-16 lg:py-[60px] flex items-center min-h-[550px] lg:min-h-[560px]">
              <div className="max-w-xl mx-auto lg:mx-0 text-center lg:text-left">
                {/* Badge */}
                <div className="inline-flex items-center gap-2 rounded-full border border-cyan-500/20 bg-cyan-500/10 px-3 py-1 text-sm font-semibold text-cyan-400 mb-5">
                  🏪 Para bicicleterías
                </div>

                {/* Headline */}
                <h1 className="text-[clamp(36px,5vw,56px)] font-extrabold text-white leading-[1.1] tracking-[-0.02em] mb-5">
                  Tu tienda oficial{' '}
                  <span className="bg-gradient-to-r from-cyan-400 to-blue-500 bg-clip-text text-transparent">
                    en el marketplace
                  </span>{' '}
                  de ciclismo
                </h1>

                {/* Subheadline */}
                <p className="text-base text-white/65 leading-relaxed mb-8 max-w-[420px] mx-auto lg:mx-0">
                  Sin comisiones. Sin intermediarios.<br />
                  Tus clientes te encuentran en Google.
                </p>

                {/* CTAs */}
                <div className="flex flex-col sm:flex-row gap-3 mb-8 justify-center lg:justify-start">
                  <Link
                    to="/vender/tiendas"
                    className="group inline-flex items-center justify-center gap-2 px-6 py-3.5 rounded-xl bg-gradient-to-r from-cyan-400 to-blue-500 text-[#0a0a0a] font-semibold text-sm transition-all hover:-translate-y-0.5 hover:shadow-[0_8px_25px_rgba(0,150,255,0.4)]"
                  >
                    Abrir mi tienda
                    <ArrowRight className="w-4 h-4 transition-transform group-hover:translate-x-1" />
                  </Link>
                  <a
                    href={WHATSAPP_DEMO_URL}
                    target="_blank"
                    rel="noreferrer"
                    className="inline-flex items-center justify-center gap-2 px-6 py-3.5 rounded-xl border-[1.5px] border-white/25 text-white font-semibold text-sm transition-all hover:bg-white/5 hover:border-white/40"
                  >
                    Ver demo
                  </a>
                </div>

                {/* Badges inferiores */}
                <div className="flex flex-wrap justify-center lg:justify-start gap-4 sm:gap-6 pt-5 border-t border-white/[0.08]">
                  <div className="flex items-center gap-2 text-[13px] text-white/60">
                    <Store className="w-4 h-4 text-cyan-400 flex-shrink-0" />
                    <span>Sin comisión mensual</span>
                  </div>
                  <div className="flex items-center gap-2 text-[13px] text-white/60">
                    <MapPin className="w-4 h-4 text-cyan-400 flex-shrink-0" />
                    <span>Tienda con tu marca</span>
                  </div>
                  <div className="flex items-center gap-2 text-[13px] text-white/60">
                    <Globe className="w-4 h-4 text-cyan-400 flex-shrink-0" />
                    <span>Indexado en Google</span>
                  </div>
                </div>
              </div>
            </div>
          </motion.div>
        )}
      </AnimatePresence>

      {/* Dots de navegación */}
      <div className="absolute bottom-5 left-0 right-0 flex justify-center gap-2 z-10">
        {[0, 1].map((i) => (
          <button
            key={i}
            type="button"
            onClick={() => goToSlide(i)}
            aria-label={`Ir al slide ${i + 1}`}
            className={`h-2 rounded-full transition-all duration-300 ${
              slide === i ? 'bg-white w-5' : 'bg-white/40 w-2'
            }`}
          />
        ))}
      </div>
    </section>
  )
}
