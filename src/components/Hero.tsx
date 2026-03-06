import { Link } from 'react-router-dom'
import { ArrowRight, CheckCircle, Users, Store } from 'lucide-react'

export default function Hero() {
  return (
    <section className="relative min-h-[500px] lg:min-h-[560px] overflow-hidden bg-[#14212E]">
      {/* Imagen de bicicleta - Desktop */}
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

      {/* Contenido */}
      <div className="relative z-[3] w-full lg:w-[55%] px-6 sm:px-8 lg:px-[4%] py-12 sm:py-16 lg:py-[60px]">
        {/* Mobile: imagen como fondo con overlay */}
        <div 
          className="lg:hidden absolute inset-0 z-[-1]"
          style={{
            background: 'linear-gradient(180deg, rgba(20,33,46,0.95) 0%, rgba(20,33,46,0.85) 40%, rgba(20,33,46,0.7) 100%), url(/images/hero-bike.webp)',
            backgroundSize: 'cover',
            backgroundPosition: 'center 60%'
          }}
        />

        <div className="max-w-xl mx-auto lg:mx-0 text-center lg:text-left">
          {/* Título */}
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
          <div className="flex flex-col sm:flex-row gap-3 mb-8">
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

          {/* Features */}
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
    </section>
  )
}
