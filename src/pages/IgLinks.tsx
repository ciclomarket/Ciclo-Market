import { Link } from 'react-router-dom'

const secondaryCtas = [
  { label: 'Publicar mi bicicleta', href: '/publicar?utm_source=instagram&utm_medium=bio', variant: 'solid' },
  { label: 'Ver ofertas y oportunidades', href: '/ofertas?utm_source=instagram&utm_medium=bio', variant: 'outline' },
  { label: 'Tiendas oficiales', href: '/tiendas-oficiales?utm_source=instagram&utm_medium=bio', variant: 'outline' },
  { label: 'Nutrición y suplementos', href: '/nutricion?utm_source=instagram&utm_medium=bio', variant: 'outline' },
  { label: 'Indumentaria ciclista', href: '/indumentaria?utm_source=instagram&utm_medium=bio', variant: 'outline' }
]

const featuredListings = [
  {
    title: 'Cannondale SuperSix EVO Ultegra Di2 2023',
    imageUrl: '/gianttcr.webp',
    href: '/listing/cannondale-supersix-evo-ultegra-di2',
    badge: 'Ver en Ciclo Market'
  },
  {
    title: 'Scott Spark 930 Carbon Trail',
    imageUrl: '/bicicletas-home-card.jpg',
    href: '/listing/scott-spark-930-carbon',
    badge: 'Ver publicación'
  },
  {
    title: 'Pack geles y sales 226ERS Endurance',
    imageUrl: '/call.webp',
    href: '/listing/pack-geles-226ers',
    badge: 'Ver en Ciclo Market',
    objectFit: 'object-contain'
  }
]

const communityLinks = [
  {
    label: 'Strava Club',
    href: 'https://www.strava.com/clubs/ciclomarket',
    icon: '/strava.webp'
  },
  {
    label: 'WhatsApp soporte',
    href: 'https://wa.me/5491136616555',
    icon: '/whatsapp.webp'
  }
]

const outlineBaseClasses =
  'w-full rounded-full border border-white/30 bg-white/[0.08] px-6 py-3 text-center text-sm font-medium text-white transition duration-150 hover:border-white/40 hover:bg-white/[0.14]'

const solidBaseClasses =
  'w-full rounded-full bg-white px-6 py-3 text-center text-sm font-semibold text-[#0f172a] shadow-lg shadow-black/20 transition duration-150 hover:bg-slate-100'

export default function IgLinksPage() {
  return (
    <div className="min-h-screen bg-[#0a1420] text-white">
      <div className="mx-auto flex min-h-screen w-full max-w-xl flex-col px-6 py-8">
        <header className="mb-8 space-y-5 text-center">
          <div className="flex justify-center">
            <img src="/site-logo.webp" alt="Ciclo Market" className="h-12 w-auto" loading="lazy" />
          </div>
          <div className="space-y-3">
            <p className="text-lg font-semibold tracking-wide text-white/90">Ciclo Market</p>
            <p className="text-sm text-white/70">
              El marketplace para comprar y vender bicicletas en Argentina.
            </p>
            <p className="text-xs uppercase tracking-[0.2em] text-white/50">Link en bio de Instagram</p>
          </div>
        </header>

        <section className="flex flex-col gap-4">
          <Link
            to="/marketplace?utm_source=instagram&utm_medium=bio&utm_campaign=ig_link"
            className={`${solidBaseClasses} text-base`}
          >
            Ver todas las bicicletas
          </Link>

          <div className="space-y-3">
            {secondaryCtas.map((cta) => (
              <Link
                key={cta.label}
                to={cta.href}
                className={cta.variant === 'solid' ? solidBaseClasses : outlineBaseClasses}
              >
                {cta.label}
              </Link>
            ))}
          </div>
        </section>

        <section className="mt-10 space-y-5">
          <div>
            <h2 className="text-sm font-semibold uppercase tracking-[0.3em] text-white/70">Visto en Instagram</h2>
            <p className="mt-2 text-base text-white/80">
              Destacados de la comunidad para que encuentres rápido lo que viste en nuestras historias.
            </p>
          </div>
          <div className="grid gap-4 sm:grid-cols-2">
            {featuredListings.map((listing) => (
              <Link
                key={listing.title}
                to={listing.href}
                className="group flex flex-col overflow-hidden rounded-3xl bg-white/5 p-4 backdrop-blur transition hover:bg-white/10"
              >
                <div className="relative aspect-square overflow-hidden rounded-2xl bg-gradient-to-br from-white/10 to-white/0">
                  <img
                    src={listing.imageUrl}
                    alt={listing.title}
                    loading="lazy"
                    className={`h-full w-full ${listing.objectFit ?? 'object-cover'} transition duration-200 group-hover:scale-[1.03]`}
                  />
                </div>
                <div className="mt-4 space-y-2">
                  <p className="text-base font-medium text-white/90 line-clamp-2">{listing.title}</p>
                  <span className="inline-flex items-center gap-2 text-xs font-semibold uppercase tracking-widest text-white/60">
                    {listing.badge}
                    <svg
                      xmlns="http://www.w3.org/2000/svg"
                      viewBox="0 0 24 24"
                      fill="none"
                      stroke="currentColor"
                      strokeWidth="1.5"
                      className="h-3 w-3"
                    >
                      <path strokeLinecap="round" strokeLinejoin="round" d="M8.25 4.5h11.25M8.25 4.5l7.5 7.5-7.5 7.5" />
                    </svg>
                  </span>
                </div>
              </Link>
            ))}
          </div>
        </section>

        <section className="mt-12 space-y-4">
          <h3 className="text-sm font-semibold uppercase tracking-[0.3em] text-white/70">Comunidad</h3>
          <div className="flex flex-wrap items-center gap-3">
            {communityLinks.map((item) => (
              <a
                key={item.label}
                href={item.href}
                target="_blank"
                rel="noreferrer"
                className="flex items-center gap-2 rounded-full border border-white/20 bg-white/5 px-5 py-2 text-xs font-medium text-white/80 transition hover:border-white/30 hover:bg-white/10"
              >
                <img src={item.icon} alt="" className="h-4 w-4" loading="lazy" />
                {item.label}
              </a>
            ))}
          </div>
        </section>

        <footer className="mt-12 border-t border-white/10 pt-6 text-center text-xs text-white/50">
          Hecho por ciclistas, para ciclistas.
        </footer>
      </div>
    </div>
  )
}
