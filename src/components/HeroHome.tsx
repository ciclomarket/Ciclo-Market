import { Link } from 'react-router-dom'
import { ArrowRight, ShieldCheck } from 'lucide-react'
import type { Listing } from '../types'
import ListingCard from './ListingCard'

export default function HeroHome({
  offerListing,
  storeListing,
  storeLogoUrl,
}: {
  offerListing?: Listing | null
  storeListing?: Listing | null
  storeLogoUrl?: string | null
}) {
  return (
    <section className="relative w-full overflow-hidden bg-[#14212E] text-white">
      <div className="absolute inset-0 pointer-events-none">
        <div className="absolute inset-0 bg-[radial-gradient(circle_at_center,_var(--tw-gradient-stops))] from-[#1c2e3f] to-[#14212E] opacity-70" />
        <div className="absolute inset-0 bg-[url('data:image/svg+xml;base64,PHN2ZyB4bWxucz0iaHR0cDovL3d3dy53My5vcmcvMjAwMC9zdmciIHdpZHRoPSI0IiBoZWlnaHQ9IjQiIHZpZXdCb3g9IjAgMCA0IDQiPjxwYXRoIGZpbGw9IiM5YzkyOTkiIGZpbGwtb3BhY2l0eT0iMC4wNSIgZD0iTTEgM2gxdjFIMXptMiAwaDF2MUgzem0wLTJoMXYxSDN6bS0xIDFIMXYxSDF6Ii8+PC9zdmc+')] opacity-20 mix-blend-overlay" />
      </div>

      <div className="container relative z-10 mx-auto grid min-h-[560px] lg:min-h-[450px] max-w-7xl grid-cols-1 gap-12 px-6 py-16 lg:grid-cols-12 lg:items-center lg:py-16">
        <div className="flex flex-col justify-center lg:col-span-7">
          <div className="mb-6 inline-flex items-center self-start rounded-full border border-cyan-500/30 bg-cyan-500/10 px-3 py-1 text-sm font-medium text-cyan-300 backdrop-blur-sm">
            <ShieldCheck className="mr-2 h-4 w-4" />
            Compra y venta 100% segura
          </div>

          <h1 className="text-4xl font-extrabold tracking-tight leading-tight sm:text-5xl lg:text-6xl xl:text-[3.5rem]">
            EL MARKETPLACE DE <br className="hidden md:block" />
            CICLISMO N°1 DE
            <span className="text-transparent bg-clip-text bg-gradient-to-r from-cyan-400 to-blue-500 ml-2">
              ARGENTINA
            </span>
            .
          </h1>

          <p className="mt-5 max-w-2xl text-base text-gray-300 sm:text-lg leading-relaxed">
            La comunidad más grande para comprar y vender bicicletas de Ruta, MTB y Gravel. Verificamos usuarios para
            que operes con total tranquilidad.
          </p>

          <div className="mt-8 flex flex-col sm:flex-row gap-4">
            <Link
              to="/marketplace"
              className="group inline-flex items-center justify-center rounded-full bg-cyan-500 px-8 py-4 text-lg font-bold text-[#14212E] transition-all hover:bg-cyan-400 hover:scale-105 hover:shadow-[0_0_20px_rgba(6,182,212,0.5)]"
            >
              Explorar bicicletas
              <ArrowRight className="ml-2 h-5 w-5 transition-transform group-hover:translate-x-1" />
            </Link>
            <Link
              to="/publicar"
              className="inline-flex items-center justify-center rounded-full border-2 border-gray-600 px-8 py-4 text-lg font-bold text-white transition-all hover:border-cyan-400 hover:text-cyan-400"
            >
              Vender mi bici
            </Link>
          </div>

          <div className="mt-10 hidden flex-wrap items-center text-xs text-gray-300 sm:flex sm:text-sm">
            <span>Publicá de manera gratuita</span>
            <span className="before:content-['·'] before:mx-2 before:text-gray-500">Sin comisiones ocultas</span>
            <span className="before:content-['·'] before:mx-2 before:text-gray-500">Tiendas oficiales</span>
          </div>
        </div>

        <div className="relative hidden lg:block lg:col-span-5">
          <div className="grid grid-cols-2 gap-4 items-start">
            <div className="-translate-y-6">
              {offerListing ? (
                <ListingCard l={offerListing} />
              ) : (
                <div className="h-[340px] rounded-2xl border border-white/10 bg-white/5" />
              )}
            </div>
            <div className="translate-y-6">
              {storeListing ? (
                <ListingCard l={storeListing} storeLogoUrl={storeLogoUrl || null} />
              ) : (
                <div className="h-[340px] rounded-2xl border border-white/10 bg-white/5" />
              )}
            </div>
          </div>
        </div>
      </div>
    </section>
  )
}
