import Container from '../components/Container'
import Button from '../components/Button'
import SeoHead from '../components/SeoHead'
import ImageCarousel from '../components/ImageCarousel'
import { Link } from 'react-router-dom'
import GoogleStoresMap from '../components/GoogleStoresMap'
import StoresMap from '../components/StoresMap'
import { useMemo } from 'react'
import { useEffect, useRef, useState } from 'react'
import { fetchStores, type StoreSummary } from '../services/users'

export default function StoresLanding() {
  const [stores, setStores] = useState<StoreSummary[]>([])
  const visibleStores = stores.filter((s) => typeof s.store_slug === 'string' && !!s.store_slug)
  const stripRef = useRef<HTMLDivElement | null>(null)
  const [activeStoreId, setActiveStoreId] = useState<string | null>(null)
  const mapStores = useMemo(() => visibleStores.map((store) => ({
    id: store.id,
    name: (store.store_name || store.store_slug || 'Tienda').toString(),
    slug: store.store_slug,
    avatarUrl: store.store_avatar_url || null,
    address: (store as any).store_address ?? null,
    city: store.city ?? null,
    province: store.province ?? null,
    lat: typeof (store as any).store_lat === 'number' ? (store as any).store_lat : ((store as any).store_lat ? Number((store as any).store_lat) : null),
    lon: typeof (store as any).store_lon === 'number' ? (store as any).store_lon : ((store as any).store_lon ? Number((store as any).store_lon) : null),
    phone: (store as any).store_phone ?? null,
    website: (store as any).store_website ?? null,
  })), [visibleStores])
  useEffect(() => {
    if (!activeStoreId && mapStores.length) setActiveStoreId(mapStores[0].id)
  }, [mapStores, activeStoreId])

  useEffect(() => {
    let active = true
    ;(async () => {
      try {
        const data = await fetchStores()
        if (active) setStores(data)
      } catch { /* noop */ }
    })()
    return () => { active = false }
  }, [])

  return (
    <div className="bg-[#0c1723] text-white">
      <SeoHead
        title="Tiendas oficiales: cómo funciona y beneficios"
        description="Sumá tu local como tienda oficial en Ciclo Market y accedé a catálogo destacado, métricas de rendimiento, soporte humano y campañas para atraer ciclistas verificados."
        image="/hero-tiendas.webp"
        keywords={[
          'tienda oficial bicicletas',
          'sumar tienda ciclomarket',
          'prueba gratuita tienda',
          'vender bicicletas online tienda',
        ]}
        canonicalPath="/tiendas-oficiales"
      />
      {/* Intro 2 columnas (90% width), sin hero */}
      <section className="bg-[#0f1729]">
        <Container>
          <div className="mx-auto w-[95%] md:w-[90%] max-w-6xl rounded-none md:rounded-[32px] border-0 md:border md:border-white/10 bg-transparent md:bg-white/10 p-0 md:p-8 shadow-none md:shadow-[0_25px_60px_rgba(9,18,27,0.45)] md:backdrop-blur">
            <div className="grid items-center gap-8 md:grid-cols-2">
            {/* Columna izquierda: texto */}
            <div className="space-y-5">
              <h1 className="text-3xl font-extrabold leading-tight tracking-tight sm:text-4xl">Empezá a vender en Ciclo Market</h1>
              <p className="max-w-2xl text-white/85 text-lg">
                ¿Te imaginás un shopping donde todas las tiendas venden ciclismo? Eso somos y vos podés ser parte.
                Llegá a miles de ciclistas verificados con contacto directo, sin comisiones ocultas y con soporte humano.
              </p>
              <div className="rounded-3xl border border-white/10 bg-white/5 -mx-3 p-3 md:mx-0 md:p-5">
                <p className="text-sm font-semibold">El paso a paso y los beneficios:</p>
                <ul className="mt-2 space-y-2">
                  <li className="flex items-start gap-3">
                    <span className="mt-0.5 inline-flex h-6 w-6 shrink-0 items-center justify-center rounded-full bg-gradient-to-r from-[#0ea5e9] to-[#2563eb] text-[12px] font-bold text-white shadow-[0_6px_18px_rgba(37,99,235,0.35)]">1</span>
                    <span className="text-sm text-white/80">Verificamos tu tienda y activamos el sello oficial.</span>
                  </li>
                  <li className="flex items-start gap-3">
                    <span className="mt-0.5 inline-flex h-6 w-6 shrink-0 items-center justify-center rounded-full bg-gradient-to-r from-[#0ea5e9] to-[#2563eb] text-[12px] font-bold text-white shadow-[0_6px_18px_rgba(37,99,235,0.35)]">2</span>
                    <span className="text-sm text-white/80">Configurás tu perfil (logo, portada, horarios y WhatsApp).</span>
                  </li>
                  <li className="flex items-start gap-3">
                    <span className="mt-0.5 inline-flex h-6 w-6 shrink-0 items-center justify-center rounded-full bg-gradient-to-r from-[#0ea5e9] to-[#2563eb] text-[12px] font-bold text-white shadow-[0_6px_18px_rgba(37,99,235,0.35)]">3</span>
                    <span className="text-sm text-white/80">Publicás tu catálogo y destacás ofertas o lanzamientos.</span>
                  </li>
                  <li className="flex items-start gap-3">
                    <span className="mt-0.5 inline-flex h-6 w-6 shrink-0 items-center justify-center rounded-full bg-gradient-to-r from-[#0ea5e9] to-[#2563eb] text-[12px] font-bold text-white shadow-[0_6px_18px_rgba(37,99,235,0.35)]">4</span>
                    <span className="text-sm text-white/80">Aparecés en el mapa y ganás visibilidad por cercanía.</span>
                  </li>
                  <li className="flex items-start gap-3">
                    <span className="mt-0.5 inline-flex h-6 w-6 shrink-0 items-center justify-center rounded-full bg-gradient-to-r from-[#0ea5e9] to-[#2563eb] text-[12px] font-bold text-white shadow-[0_6px_18px_rgba(37,99,235,0.35)]">5</span>
                    <span className="text-sm text-white/80">Recibís consultas directas y notificaciones en tiempo real.</span>
                  </li>
                  <li className="flex items-start gap-3">
                    <span className="mt-0.5 inline-flex h-6 w-6 shrink-0 items-center justify-center rounded-full bg-gradient-to-r from-[#0ea5e9] to-[#2563eb] text-[12px] font-bold text-white shadow-[0_6px_18px_rgba(37,99,235,0.35)]">6</span>
                    <span className="text-sm text-white/80">Medís resultados con métricas claras para optimizar.</span>
                  </li>
                </ul>
              </div>
            </div>
            {/* Columna derecha: imagen translúcida + CTA */}
            <div>
              <div className="relative overflow-hidden rounded-3xl border border-white/10 bg-white/5 p-2 shadow-[0_20px_60px_rgba(8,14,22,0.45)]">
                <div className="relative h-64 w-full overflow-hidden rounded-2xl md:h-80">
                  {(import.meta as any).env?.VITE_GOOGLE_MAPS_KEY ? (
                    <GoogleStoresMap stores={mapStores as any} focusStoreId={activeStoreId} />
                  ) : (
                    <StoresMap stores={mapStores} focusStoreId={activeStoreId} onStoreClick={(id) => setActiveStoreId(id)} />
                  )}
                </div>
              </div>
              {/* CTAs se renderizan al pie del box, antes del slider */}
            </div>
            </div>
            {/* CTAs arriba del slider, alineados a la derecha */}
            <div className="mt-6 flex justify-end">
              <div className="inline-flex gap-3 rounded-2xl border border-white/10 bg-white/10 p-2 backdrop-blur">
                <Button
                  to={
                    'mailto:admin@ciclomarket.ar?subject=Solicitar%20demo%20Tienda%20Oficial&body=Hola%20Ciclo%20Market%2C%20quiero%20solicitar%20una%20demo%20para%20mi%20tienda.%0A%0ANombre%20de%20la%20tienda%3A%0ACiudad%3A%0AInstagram%20o%20Web%3A%0ATel%C3%A9fono%3A%0A%0AGracias!'
                  }
                  className="bg-white text-[#14212e] hover:bg-white/90"
                >
                  Solicitá una demo
                </Button>
                <Button
                  to="/tiendas"
                  variant="ghost"
                  className="bg-gradient-to-r from-[#38bdf8] via-[#2563eb] to-[#1d4ed8] text-white shadow-[0_14px_40px_rgba(37,99,235,0.35)] hover:brightness-110"
                >
                  Ver tiendas activas
                </Button>
              </div>
            </div>
            {/* Slider de tiendas dentro del mismo box para mayor contraste */}
            <div className="mt-8 border-t border-white/10 pt-6">
              <div className="mb-3 flex items-center justify-between">
                <h3 className="text-lg font-semibold">Tiendas que ya venden en Ciclo Market</h3>
                <div className="hidden gap-2 sm:flex">
                  <button
                    type="button"
                    onClick={() => stripRef.current?.scrollBy({ left: -320, behavior: 'smooth' })}
                    className="rounded-full border border-white/20 px-3 py-1 text-sm text-white hover:border-white/40"
                  >
                    ‹
                  </button>
                  <button
                    type="button"
                    onClick={() => stripRef.current?.scrollBy({ left: 320, behavior: 'smooth' })}
                    className="rounded-full border border-white/20 px-3 py-1 text-sm text-white hover:border-white/40"
                  >
                    ›
                  </button>
                </div>
              </div>
              <div ref={stripRef} className="flex gap-5 overflow-x-auto pb-2">
                {visibleStores.length ? (
                  visibleStores.map((s) => {
                    const name = (s.store_name || s.store_slug || 'Tienda').toString()
                    const avatar = s.store_avatar_url || '/site-logo.webp'
                    return (
                      <Link
                        key={s.id}
                        to={`/tienda/${s.store_slug}`}
                        className="flex shrink-0 items-center gap-3 rounded-2xl border border-white/10 bg-white/5 px-3 py-2 hover:border-white/30 hover:bg-white/10"
                      >
                        <img src={avatar} alt={`Logo de ${name}`} className="h-10 w-10 rounded-full object-cover" loading="lazy" />
                        <span className="text-sm text-white/90">{name}</span>
                      </Link>
                    )
                  })
                ) : (
                  <div className="text-sm text-white/60">Pronto vas a ver acá los logos de tiendas verificadas.</div>
                )}
              </div>
            </div>
          </div>
        </Container>
      </section>

      {/* (Sección 'Cómo funciona' removida por pedido) */}

      {/* Beneficios */}
      <section className="bg-[#0f1729]">
        <Container>
          <div className="py-12">
            <h2 className="text-2xl font-bold">Beneficios para tu tienda</h2>
            <div className="mt-6 grid gap-4 md:grid-cols-3">
              {[
                {
                  title: 'Perfil verificado',
                  desc: 'Sello de tienda oficial, confianza y mejor conversión.',
                  icon: (
                    <svg viewBox="0 0 24 24" className="h-5 w-5" fill="currentColor" aria-hidden>
                      <path d="M12 2 4.5 5v6c0 5.25 3.75 10 7.5 11c3.75-1 7.5-5.75 7.5-11V5L12 2Zm-1 14-3.5-3.5l1.4-1.4L11 12.8l4.6-4.6l1.4 1.4L11 16Z" />
                    </svg>
                  ),
                },
                {
                  title: 'Catálogo destacado',
                  desc: 'Mejores posiciones y vitrinas de categorías.',
                  icon: (
                    <svg viewBox="0 0 24 24" className="h-5 w-5" fill="currentColor" aria-hidden>
                      <path d="M12 2 9.19 8.26 2 9.27l5.46 4.73L5.82 21 12 17.77 18.18 21l-1.64-6.99L22 9.27l-7.19-1.01L12 2Z" />
                    </svg>
                  ),
                },
                {
                  title: 'Métricas y reportes',
                  desc: 'Seguimiento de visitas, consultas y favoritos.',
                  icon: (
                    <svg viewBox="0 0 24 24" className="h-5 w-5" fill="currentColor" aria-hidden>
                      <path d="M3 3h2v18H3V3Zm4 10h2v8H7v-8Zm4-6h2v14h-2V7Zm4-4h2v18h-2V3Zm4 8h2v10h-2V11Z" />
                    </svg>
                  ),
                },
                {
                  title: 'Mapa y SEO local',
                  desc: 'Encontrá clientes por ubicación y horario.',
                  icon: (
                    <svg viewBox="0 0 24 24" className="h-5 w-5" fill="currentColor" aria-hidden>
                      <path d="M12 2a7 7 0 0 0-7 7c0 5.25 7 13 7 13s7-7.75 7-13a7 7 0 0 0-7-7Zm0 9.5A2.5 2.5 0 1 1 12 6a2.5 2.5 0 0 1 0 5.5Z" />
                    </svg>
                  ),
                },
                {
                  title: 'Difusión en redes',
                  desc: 'Mayor alcance con campañas y contenidos.',
                  icon: (
                    <svg viewBox="0 0 24 24" className="h-5 w-5" fill="currentColor" aria-hidden>
                      <path d="M3 10v4h4l5 5V5l-5 5H3Zm13.5 2a2.5 2.5 0 0 0 0-5v5Zm0 7a2.5 2.5 0 0 0 0-5v5Z" />
                    </svg>
                  ),
                },
                {
                  title: 'Soporte dedicado',
                  desc: 'Acompañamiento humano para crecer más rápido.',
                  icon: (
                    <svg viewBox="0 0 24 24" className="h-5 w-5" fill="currentColor" aria-hidden>
                      <path d="M12 2a7 7 0 0 0-7 7v3a3 3 0 0 0 3 3h.5a.5.5 0 0 0 .5-.5V11a.5.5 0 0 0-.5-.5H8V9a4 4 0 1 1 8 0v1.5h-.5a.5.5 0 0 0-.5.5v3.5a.5.5 0 0 0 .5.5H16a3 3 0 0 0 3-3V9a7 7 0 0 0-7-7Zm-6 15h3v2H6v-2Zm9 0h3v2h-3v-2Z" />
                    </svg>
                  ),
                },
              ].map((b) => (
                <div
                  key={b.title}
                  className="group rounded-2xl border border-white/10 bg-gradient-to-br from-white/10 to-white/5 p-5 shadow-[0_10px_28px_rgba(6,12,24,0.18)] transition hover:-translate-y-0.5 hover:shadow-[0_18px_42px_rgba(6,12,24,0.28)]"
                >
                  <div className="mb-2 flex items-center gap-3">
                    <span className="inline-flex h-9 w-9 items-center justify-center rounded-2xl bg-gradient-to-br from-white/15 to-white/5 text-[#93c5fd] ring-1 ring-white/10 shadow-[0_6px_16px_rgba(12,20,32,0.25)]">
                      {b.icon}
                    </span>
                    <div className="text-lg font-semibold tracking-tight">{b.title}</div>
                  </div>
                  <p className="text-sm text-white/80">{b.desc}</p>
                </div>
              ))}
            </div>
          </div>
        </Container>
      </section>

      {/* (Sección 'Cómo se ve tu tienda' removida por pedido) */}

      {/* CTA final */}
      <section className="bg-[#0f1729]">
        <Container>
          <div className="py-14 text-center">
            <h2 className="text-2xl font-bold">Probá Ciclo Market para tu tienda</h2>
            <p className="mx-auto mt-2 max-w-2xl text-white/80">
              Te ayudamos a crear tu presencia oficial y a convertir visitas en ventas con herramientas simples y soporte humano.
            </p>
            <div className="mt-5 flex justify-center">
              <Button to="mailto:hola@ciclomarket.ar?subject=Solicitud%20prueba%20gratuita%20de%20Tienda%20Oficial&body=Contanos%20tu%20nombre%2C%20tienda%2C%20ciudad%20y%20web%2FInstagram." className="bg-white text-[#14212e] hover:bg-white/90">
                Solicitar prueba gratuita
              </Button>
            </div>
          </div>
        </Container>
      </section>
    </div>
  )
}
