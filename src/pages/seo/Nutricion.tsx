import { Link } from 'react-router-dom'
import Container from '../../components/Container'
import SeoHead from '../../components/SeoHead'

export default function Nutricion() {
  const tiles = [
    { key: 'gel', label: 'Geles', desc: 'Energía inmediata', to: '/marketplace?q=gel', image: '/design/Banners/2.webp', imageMobile: '/design/Banners-Mobile/2.webp' },
    { key: 'hidra', label: 'Hidratación', desc: 'Isotónicas y sales', to: '/marketplace?q=isotonica%20hidratacion%20sales', image: '/design/Banners/1.webp', imageMobile: '/design/Banners-Mobile/1.webp' },
    { key: 'supp', label: 'Suplementación', desc: 'Recuperación post-entreno', to: '/marketplace?q=proteina%20bcaa%20recovery', image: '/design/Banners/3.webp', imageMobile: '/design/Banners-Mobile/3.webp' },
    { key: 'snack', label: 'Barras y snacks', desc: 'Carbohidratos por porción', to: '/marketplace?q=barra%20snack', image: '/design/Banners/2.webp', imageMobile: '/design/Banners-Mobile/2.webp' },
  ]
  return (
    <div className="bg-[#0c1723] text-white">
      <SeoHead
        title="Nutrición para ciclismo: geles, hidratación y recuperación"
        description="Catálogo de nutrición de tiendas oficiales: geles, bebidas isotónicas, sales y suplementos. Filtrá por cafeína, sodio, carbohidratos y porciones."
        canonicalPath="/nutricion"
        keywords={[
          'nutricion ciclismo',
          'geles energeticos',
          'hidratacion isotonica',
          'sales de hidratacion',
          'proteina recuperacion',
        ]}
      />

      {/* Hero simple con CTA */}
      <section className="relative overflow-hidden">
        <div className="absolute inset-0 bg-gradient-to-b from-[#0f1729] via-[#101b2d] to-[#0f1729]" />
        <div className="relative">
          <Container>
            <div className="mx-auto max-w-3xl py-10 text-center">
              <span className="inline-flex items-center gap-2 rounded-full border border-white/15 bg-white/10 px-3 py-1 text-xs font-semibold uppercase tracking-wide text-white/80">
                Tiendas oficiales
              </span>
              <h1 className="mt-4 text-3xl font-extrabold tracking-tight sm:text-4xl">Nutrición para ciclistas</h1>
              <p className="mt-3 text-white/80">Energía, hidratación y recuperación para cada salida. Comprá a tiendas verificadas.</p>
              <div className="mt-6 flex flex-wrap items-center justify-center gap-3">
                <Link to="/marketplace?q=nutricion" className="btn bg-white text-[#14212e] hover:bg-white/90">Ver todo</Link>
                <Link to="/marketplace?q=gel" className="btn bg-transparent border border-white/30 text-white hover:bg-white/10">Geles</Link>
              </div>
              <div className="pointer-events-none absolute inset-x-0 -bottom-6 mx-auto h-px max-w-3xl bg-gradient-to-r from-transparent via-white/40 to-transparent" />
            </div>
          </Container>
        </div>
      </section>

      {/* Tiles principales */}
      <section className="relative isolate overflow-hidden bg-gradient-to-b from-[#0f1729] via-[#101b2d] to-[#0f1729]">
        <div className="pointer-events-none absolute inset-0 -z-10 opacity-60">
          <div className="absolute -top-16 -left-16 h-64 w-64 rounded-full bg-[radial-gradient(circle,_rgba(37,99,235,0.25),_transparent_60%)] blur-2xl" />
          <div className="absolute -bottom-16 -right-10 h-64 w-64 rounded-full bg-[radial-gradient(circle,_rgba(14,165,233,0.20),_transparent_60%)] blur-2xl" />
        </div>
        <Container>
          <div className="py-8">
            <div className="grid grid-cols-2 gap-2 sm:grid-cols-4 sm:gap-4">
              {tiles.map((card) => (
                <Link
                  key={card.key}
                  to={card.to}
                  className="relative w-full overflow-hidden rounded-3xl border-2 border-white/15 bg-white/5 transition hover:border-white/30 hover:shadow-md focus:outline-none focus-visible:ring-2 focus-visible:ring-white/80 focus-visible:ring-offset-2 focus-visible:ring-offset-[#14212e]"
                >
                  <div className="relative aspect-square sm:aspect-[17/5]">
                    <picture className="block h-full w-full">
                      <source media="(max-width: 640px)" srcSet={card.imageMobile} />
                      <img src={card.image} alt={card.label} className="h-full w-full object-cover" loading="lazy" decoding="async" />
                    </picture>
                    <div className="absolute inset-0 bg-gradient-to-t from-[#050c18]/85 via-transparent to-transparent" aria-hidden />
                    <div className="absolute inset-0 flex items-end p-2 sm:p-4">
                      <div className="space-y-1 text-left">
                        <span className="text-sm font-semibold text-white sm:text-lg">{card.label}</span>
                        <span className="hidden text-xs text-white/80 sm:block">{card.desc}</span>
                      </div>
                    </div>
                  </div>
                </Link>
              ))}
            </div>
          </div>
        </Container>
      </section>

      {/* Guía breve */}
      <section className="bg-[#1d2f41]">
        <Container>
          <div className="py-10">
            <h2 className="text-xl font-semibold">Cómo elegir tu nutrición</h2>
            <ul className="mt-3 grid gap-3 text-sm text-white/85 md:grid-cols-2">
              <li>Carbohidratos por porción: 20–30 g para esfuerzos de 45–60 min.</li>
              <li>Sodio: 200–400 mg por porción según calor/ritmo.</li>
              <li>Cafeína: 50–100 mg como impulso (opcional).</li>
              <li>Porciones por pack y fecha de vencimiento visibles.</li>
            </ul>
            <p className="mt-3 text-xs text-white/60">Recordá consultar ingredientes y alérgenos. Evitá claims médicos.</p>
          </div>
        </Container>
      </section>
    </div>
  )
}
