import { Link } from 'react-router-dom'
import { motion } from 'framer-motion'
import { ArrowRight, BadgeCheck, BarChart3, Heart, MessageCircle, Search, ShieldCheck, SlidersHorizontal } from 'lucide-react'

const ADMIN_WHATSAPP_URL = 'https://wa.me/5493764748459'
const APPLY_MESSAGE = encodeURIComponent('Hola! Quiero aplicar para abrir una Tienda Oficial en Ciclomarket. ¿Cómo seguimos?')
const APPLY_URL = `${ADMIN_WHATSAPP_URL}?text=${APPLY_MESSAGE}`

const fadeUp = {
  hidden: { opacity: 0, y: 18 },
  show: { opacity: 1, y: 0 },
} as const

function Section({ children }: { children: React.ReactNode }) {
  return (
    <motion.section
      variants={fadeUp}
      initial="hidden"
      whileInView="show"
      viewport={{ once: true, amount: 0.25 }}
      transition={{ duration: 0.5, ease: 'easeOut' }}
      className="py-14 md:py-20"
    >
      {children}
    </motion.section>
  )
}

function DeviceMock({ children }: { children: React.ReactNode }) {
  return (
    <div className="relative mx-auto max-w-[520px]">
      <div className="absolute -inset-6 rounded-[2.75rem] bg-gradient-to-br from-cyan-500/20 via-blue-500/10 to-transparent blur-2xl" />
      <div className="relative overflow-hidden rounded-[2.25rem] border border-gray-200 bg-white shadow-[0_24px_70px_-30px_rgba(20,33,46,0.65)]">
        <div className="flex items-center gap-2 border-b border-gray-100 bg-gray-50 px-5 py-4">
          <div className="h-3 w-3 rounded-full bg-red-400/80" />
          <div className="h-3 w-3 rounded-full bg-amber-400/80" />
          <div className="h-3 w-3 rounded-full bg-emerald-400/80" />
          <div className="ml-3 h-2.5 w-40 rounded-full bg-gray-200" />
        </div>
        <div className="p-6">{children}</div>
      </div>
    </div>
  )
}

function StorePreviewCard({
  bannerSrc,
  avatarSrc,
  storeName,
  location,
  bannerPositionY = 50,
}: {
  bannerSrc: string
  avatarSrc: string
  storeName: string
  location: string
  bannerPositionY?: number
}) {
  return (
    <div className="overflow-hidden rounded-2xl border border-gray-100 bg-white shadow-sm">
      <div className="relative h-32">
        <img
          src={bannerSrc}
          alt=""
          className="h-full w-full object-cover"
          style={{ objectPosition: `center ${bannerPositionY}%` }}
          loading="lazy"
          decoding="async"
        />
        <div className="absolute inset-0 bg-gradient-to-r from-[#14212E]/55 to-[#14212E]/10" />
      </div>
      <div className="relative px-5 pb-5">
        <div className="-mt-10">
          <div className="h-16 w-16 rounded-full bg-white p-1 shadow-sm ring-4 ring-white">
            <img src={avatarSrc} alt="" className="h-full w-full rounded-full object-contain bg-white" loading="lazy" decoding="async" />
          </div>
        </div>

        <div className="mt-4">
          <div className="flex flex-wrap items-center gap-2">
            <p className="text-base font-bold text-mb-ink">{storeName}</p>
            <span className="inline-flex items-center gap-1 rounded-full bg-cyan-50 px-2 py-0.5 text-xs font-semibold text-cyan-700">
              <BadgeCheck className="h-4 w-4" />
              Tienda Oficial
            </span>
          </div>
          <p className="mt-1 text-sm text-gray-500">{location}</p>
        </div>

        <div className="mt-4 grid grid-cols-3 gap-3">
          <div className="rounded-xl border border-gray-100 bg-gray-50 p-3">
            <p className="text-xs font-semibold text-gray-900">Catálogo</p>
            <p className="mt-1 text-sm text-gray-600">Publicaciones ilimitadas</p>
          </div>
          <div className="rounded-xl border border-gray-100 bg-gray-50 p-3">
            <p className="text-xs font-semibold text-gray-900">Contacto</p>
            <p className="mt-1 text-sm text-gray-600">WhatsApp directo</p>
          </div>
          <div className="rounded-xl border border-gray-100 bg-gray-50 p-3">
            <p className="text-xs font-semibold text-gray-900">Confianza</p>
            <p className="mt-1 text-sm text-gray-600">Identidad verificada</p>
          </div>
        </div>

        <div className="mt-5 flex items-center justify-between">
          <p className="text-sm text-gray-500">4.8 ★ · 120 reseñas</p>
          <button
            type="button"
            className="inline-flex items-center justify-center rounded-full bg-[#14212E] px-4 py-2 text-sm font-semibold text-white"
          >
            Ver Tienda
          </button>
        </div>
      </div>
    </div>
  )
}

function ListingPreviewRow({
  title,
  badge,
  badgeTone,
  imageSrc,
}: {
  title: string
  badge: string
  badgeTone: 'cyan' | 'amber'
  imageSrc: string
}) {
  const tone =
    badgeTone === 'cyan'
      ? 'bg-cyan-50 text-cyan-700 ring-cyan-100'
      : 'bg-amber-50 text-amber-800 ring-amber-100'
  return (
    <div className="flex items-center gap-3 rounded-2xl border border-gray-100 bg-white p-4 shadow-sm">
      <img
        src={imageSrc}
        alt=""
        className="h-14 w-14 rounded-xl object-cover bg-gray-100"
        loading="lazy"
        decoding="async"
      />
      <div className="min-w-0 flex-1">
        <p className="truncate text-sm font-semibold text-mb-ink">{title}</p>
        <p className="mt-1 text-xs text-gray-500">CABA · Talle 54 · Carbono</p>
      </div>
      <span className={`hidden sm:inline-flex items-center rounded-full px-2.5 py-1 text-xs font-semibold ring-1 ${tone}`}>
        {badge}
      </span>
    </div>
  )
}

function CicloTrustMaxProof() {
  return (
    <div className="rounded-2xl border border-gray-100 bg-white p-5 shadow-sm">
      <p className="text-xs font-semibold uppercase tracking-wider text-gray-500">Publicado por:</p>
      <div className="mt-2 flex flex-wrap items-center gap-2">
        <p className="text-sm font-semibold text-mb-ink">Giant La Lucila</p>
        <span className="text-[#14212E]/35">|</span>
        <span className="inline-flex items-center gap-1 text-sm font-semibold text-cyan-700">
          <BadgeCheck className="h-4 w-4" />
          Tienda oficial
        </span>
        <a href="https://www.ciclomarket.ar/tienda/giant_lalucila" className="text-sm text-mb-primary underline">
          Sitio web
        </a>
      </div>

      <div className="mt-4 rounded-2xl border border-gray-100 bg-gray-50 p-4">
        <div className="flex items-center justify-between">
          <p className="text-xs font-semibold uppercase tracking-wider text-gray-500">Ciclo Trust</p>
          <p className="text-xs font-medium text-gray-500">5.0/5</p>
        </div>
        <div className="mt-3 grid grid-cols-5 gap-1.5" aria-hidden="true">
          {Array.from({ length: 5 }).map((_, i) => (
            <div key={i} className="h-1.5 rounded-full bg-emerald-500" />
          ))}
        </div>
      </div>
    </div>
  )
}

export default function ForStores() {
  return (
    <div className="bg-gray-50 text-mb-ink">
      <div className="mx-auto max-w-7xl px-6">
        <Section>
          <div className="grid grid-cols-1 items-center gap-12 lg:grid-cols-12">
            <div className="lg:col-span-6">
              <div className="inline-flex items-center gap-2 rounded-full border border-cyan-500/20 bg-cyan-500/10 px-3 py-1 text-sm font-semibold text-cyan-700">
                <ShieldCheck className="h-4 w-4" />
                Tiendas Oficiales · Ciclo Trust
              </div>

              <h1 className="mt-5 text-4xl font-extrabold tracking-tight sm:text-5xl">
                Dejá de competir por likes. <span className="text-cyan-600">Empezá a cerrar ventas.</span>
              </h1>
              <p className="mt-5 max-w-xl text-lg leading-relaxed text-gray-600">
                La plataforma profesional para bicicleterías que quieren vender online sin el caos de las redes sociales.
                Tu propia tienda, tu marca, tus reglas.
              </p>

              <div className="mt-8 flex flex-col gap-3 sm:flex-row">
                <a
                  href={APPLY_URL}
                  target="_blank"
                  rel="noreferrer"
                  className="inline-flex items-center justify-center rounded-full bg-[#14212E] px-6 py-3 text-base font-semibold text-white shadow-sm transition hover:bg-[#1b2f3f]"
                >
                  Aplicar para Tienda Oficial <ArrowRight className="ml-2 h-5 w-5" />
                </a>
                <Link
                  to="/tienda/giant_lalucila"
                  className="inline-flex items-center justify-center rounded-full border border-gray-200 bg-white px-6 py-3 text-base font-semibold text-[#14212E] shadow-sm transition hover:border-gray-300"
                >
                  Ver ejemplo en vivo
                </Link>
              </div>

              <div className="mt-8 flex flex-wrap items-center gap-3 text-sm text-gray-500">
                <span className="rounded-full bg-white px-3 py-1 ring-1 ring-gray-200">Publicaciones ilimitadas</span>
                <span className="rounded-full bg-white px-3 py-1 ring-1 ring-gray-200">WhatsApp directo</span>
                <span className="rounded-full bg-white px-3 py-1 ring-1 ring-gray-200">Analítica real</span>
              </div>
            </div>

            <div className="lg:col-span-6">
              <DeviceMock>
                <div className="space-y-4">
                  <StorePreviewCard
                    bannerSrc="https://jmtsgywgeysagnfgdovr.supabase.co/storage/v1/object/public/avatars/banners/40014f13-b9e9-4041-a791-affb9a1531aa/1762378299572_1-1ef6caa4.webp"
                    avatarSrc="https://jmtsgywgeysagnfgdovr.supabase.co/storage/v1/object/public/avatars/stores/40014f13-b9e9-4041-a791-affb9a1531aa/avatar_1762378292509_IMG_3493.webp"
                    storeName="Giant La Lucila"
                    location="La Lucila, Buenos Aires"
                    bannerPositionY={75}
                  />
                  <CicloTrustMaxProof />
                  <div className="grid grid-cols-1 gap-3">
                    <ListingPreviewRow
                      title="Specialized Tarmac SL7"
                      badge="20% OFF"
                      badgeTone="amber"
                      imageSrc="https://jmtsgywgeysagnfgdovr.supabase.co/storage/v1/render/image/public/listings/2025/1762737120847_08de9555-6a36-4202-b67f-69abd96b1f28_IMG_0681.webp?width=1600&height=900&resize=cover"
                    />
                    <ListingPreviewRow title="Giant TCR Advanced" badge="Tienda Oficial" badgeTone="cyan" imageSrc="/gianttcr.webp" />
                  </div>
                </div>
              </DeviceMock>
            </div>
          </div>
        </Section>

        <Section>
          <div className="grid grid-cols-1 gap-6 lg:grid-cols-2">
            <div className="rounded-3xl border border-gray-200 bg-white p-8 shadow-sm">
              <p className="text-xs font-semibold uppercase tracking-wider text-gray-500">Redes Sociales</p>
              <h2 className="mt-2 text-2xl font-bold text-gray-900">El Caos</h2>
              <p className="mt-3 text-gray-600 leading-relaxed">
                Algoritmo impredecible, mensajes perdidos, consultas repetidas y ventas que dependen de “viralizar”.
              </p>
              <div className="mt-6 space-y-3">
                <div className="flex items-center gap-3 rounded-2xl bg-gray-50 p-4">
                  <Heart className="h-5 w-5 text-gray-500" />
                  <p className="text-sm text-gray-700">Competís por atención, no por intención de compra.</p>
                </div>
                <div className="flex items-center gap-3 rounded-2xl bg-gray-50 p-4">
                  <MessageCircle className="h-5 w-5 text-gray-500" />
                  <p className="text-sm text-gray-700">“¿Precio?” · “¿Envíos?” · “¿Aceptás permuta?” todo el día.</p>
                </div>
                <div className="flex items-center gap-3 rounded-2xl bg-gray-50 p-4">
                  <SlidersHorizontal className="h-5 w-5 text-gray-500" />
                  <p className="text-sm text-gray-700">Sin filtros: el comprador scrollea y se va.</p>
                </div>
              </div>
            </div>

            <div className="rounded-3xl border border-cyan-200 bg-gradient-to-b from-white to-cyan-50/40 p-8 shadow-sm">
              <p className="text-xs font-semibold uppercase tracking-wider text-cyan-700/70">Ciclomarket</p>
              <h2 className="mt-2 text-2xl font-bold text-gray-900">El Foco</h2>
              <p className="mt-3 text-gray-600 leading-relaxed">
                En Ciclomarket nadie entra a ver memes. Entran a comprar bicicletas: comparan, filtran y contactan.
              </p>
              <div className="mt-6 space-y-3">
                <div className="flex items-center gap-3 rounded-2xl bg-white/80 p-4 ring-1 ring-cyan-100">
                  <Search className="h-5 w-5 text-cyan-700" />
                  <p className="text-sm text-gray-700">Intención real: búsqueda por marca, talle y zona.</p>
                </div>
                <div className="flex items-center gap-3 rounded-2xl bg-white/80 p-4 ring-1 ring-cyan-100">
                  <SlidersHorizontal className="h-5 w-5 text-cyan-700" />
                  <p className="text-sm text-gray-700">Filtros pro: carbono, talle 54, Shimano, precio.</p>
                </div>
                <div className="flex items-center gap-3 rounded-2xl bg-white/80 p-4 ring-1 ring-cyan-100">
                  <MessageCircle className="h-5 w-5 text-cyan-700" />
                  <p className="text-sm text-gray-700">Contacto directo: el comprador hace clic y habla con tu equipo.</p>
                </div>
              </div>
            </div>
          </div>
        </Section>

        <Section>
          <div className="grid grid-cols-1 items-center gap-10 lg:grid-cols-12">
            <div className="lg:col-span-5">
              <h2 className="text-3xl font-extrabold tracking-tight text-gray-900">Tu sucursal digital</h2>
              <p className="mt-4 text-lg leading-relaxed text-gray-600">
                Tu marca se destaca. Badge de verificación, perfil personalizado y catálogo exclusivo separado de los
                vendedores particulares.
              </p>
              <div className="mt-6 space-y-3">
                <div className="flex items-start gap-3">
                  <BadgeCheck className="mt-0.5 h-5 w-5 text-cyan-600" />
                  <p className="text-gray-600">
                    <span className="font-semibold text-gray-900">Identidad verificada:</span> más confianza, menos fricción
                    y mejores conversaciones.
                  </p>
                </div>
                <div className="flex items-start gap-3">
                  <ShieldCheck className="mt-0.5 h-5 w-5 text-cyan-600" />
                  <p className="text-gray-600">
                    <span className="font-semibold text-gray-900">Branding pro:</span> banner, logo, links y una experiencia
                    ecommerce.
                  </p>
                </div>
              </div>
            </div>

            <div className="lg:col-span-7">
              <div className="rounded-3xl border border-gray-200 bg-white p-6 shadow-sm">
                <StorePreviewCard
                  bannerSrc="https://jmtsgywgeysagnfgdovr.supabase.co/storage/v1/object/public/avatars/banners/40014f13-b9e9-4041-a791-affb9a1531aa/1762378299572_1-1ef6caa4.webp"
                  avatarSrc="https://jmtsgywgeysagnfgdovr.supabase.co/storage/v1/object/public/avatars/stores/40014f13-b9e9-4041-a791-affb9a1531aa/avatar_1762378292509_IMG_3493.webp"
                  storeName="Giant La Lucila"
                  location="La Lucila, Buenos Aires"
                  bannerPositionY={75}
                />
              </div>
            </div>
          </div>
        </Section>

        <Section>
          <div className="grid grid-cols-1 items-center gap-10 lg:grid-cols-12">
            <div className="lg:col-span-6">
              <div className="rounded-3xl border border-emerald-200 bg-gradient-to-b from-white to-emerald-50/40 p-8 shadow-sm">
                <div className="flex items-center gap-3">
                  <img src="/whatsapp.webp" alt="" className="h-10 w-10" loading="lazy" decoding="async" />
                  <h2 className="text-2xl font-bold text-gray-900">WhatsApp directo, sin fricción</h2>
                </div>
                <p className="mt-4 text-gray-600 leading-relaxed">
                  Tus clientes, tu chat. Sin intermediarios ni comisiones por mensaje. El comprador hace clic y habla
                  directo con tu vendedor de salón.
                </p>
                <div className="mt-6 flex flex-col gap-3 sm:flex-row">
                  <a
                    href={APPLY_URL}
                    target="_blank"
                    rel="noreferrer"
                    className="inline-flex items-center justify-center rounded-full bg-emerald-600 px-6 py-3 text-base font-semibold text-white shadow-sm hover:bg-emerald-500"
                  >
                    Hablar por WhatsApp <ArrowRight className="ml-2 h-5 w-5" />
                  </a>
                  <Link
                    to="/marketplace"
                    className="inline-flex items-center justify-center rounded-full border border-emerald-200 bg-white px-6 py-3 text-base font-semibold text-emerald-700 shadow-sm hover:border-emerald-300"
                  >
                    Ver el Marketplace
                  </Link>
                </div>
              </div>
            </div>

            <div className="lg:col-span-6">
              <div className="space-y-4">
                <ListingPreviewRow
                  title="Cannondale SuperSix EVO"
                  badge="Tienda Oficial"
                  badgeTone="cyan"
                  imageSrc="https://d1mo5ln9tjltxq.cloudfront.net/-/media/images/my25/bikes/road/race/s6-collection-page-updates/c25_s6evo_collection_desktop_04.ashx?mh=2560&mw=1920&hash=F583811B57B35E328BF7E7C24A818654"
                />
                <ListingPreviewRow
                  title="Scott Addict RC"
                  badge="15% OFF"
                  badgeTone="amber"
                  imageSrc="https://jmtsgywgeysagnfgdovr.supabase.co/storage/v1/render/image/public/listings/2026/1768511637843_696f6c27-bcd9-4e65-a5a5-abc3b6a47fcf_IMG_1292.jpg?width=1600&height=900&resize=cover"
                />
                <ListingPreviewRow title="Giant TCR Advanced" badge="Tienda Oficial" badgeTone="cyan" imageSrc="/gianttcr.webp" />
              </div>
            </div>
          </div>
        </Section>

        <Section>
          <div className="grid grid-cols-1 items-center gap-10 lg:grid-cols-12">
            <div className="lg:col-span-5">
              <h2 className="text-3xl font-extrabold tracking-tight text-gray-900">Analítica real</h2>
              <p className="mt-4 text-lg leading-relaxed text-gray-600">
                Métricas que importan. Sabé exactamente qué modelos buscan tus clientes y optimizá tu stock.
              </p>
              <div className="mt-6 space-y-3 text-gray-600">
                <div className="flex items-start gap-3">
                  <BarChart3 className="mt-0.5 h-5 w-5 text-cyan-600" />
                  <p>
                    <span className="font-semibold text-gray-900">Vistas de catálogo</span> por semana y por producto.
                  </p>
                </div>
                <div className="flex items-start gap-3">
                  <MessageCircle className="mt-0.5 h-5 w-5 text-cyan-600" />
                  <p>
                    <span className="font-semibold text-gray-900">Clics en WhatsApp</span> y rendimiento por publicación.
                  </p>
                </div>
              </div>
            </div>

            <div className="lg:col-span-7">
              <div className="rounded-3xl border border-gray-200 bg-white p-8 shadow-sm">
                <div className="flex items-center justify-between">
                  <p className="text-sm font-semibold text-gray-900">Dashboard</p>
                  <p className="text-sm text-gray-500">Últimos 30 días</p>
                </div>
                <div className="mt-6 grid grid-cols-3 gap-3">
                  <div className="rounded-2xl border border-gray-100 bg-gray-50 p-4">
                    <p className="text-xs font-semibold text-gray-500">Vistas de catálogo</p>
                    <p className="mt-1 text-2xl font-extrabold text-gray-900">12.4k</p>
                  </div>
                  <div className="rounded-2xl border border-gray-100 bg-gray-50 p-4">
                    <p className="text-xs font-semibold text-gray-500">Clics WhatsApp</p>
                    <p className="mt-1 text-2xl font-extrabold text-gray-900">1.2k</p>
                  </div>
                  <div className="rounded-2xl border border-gray-100 bg-gray-50 p-4">
                    <p className="text-xs font-semibold text-gray-500">Conversión</p>
                    <p className="mt-1 text-2xl font-extrabold text-gray-900">9.8%</p>
                  </div>
                </div>
                <div className="mt-8 overflow-hidden rounded-2xl border border-gray-100 bg-white p-5">
                  <svg viewBox="0 0 600 140" className="h-28 w-full">
                    <path
                      d="M0 110 C 60 105, 120 95, 180 85 C 240 75, 300 60, 360 64 C 420 68, 480 52, 540 40 C 570 34, 590 30, 600 28"
                      fill="none"
                      stroke="#06b6d4"
                      strokeWidth="4"
                      strokeLinecap="round"
                    />
                    <path
                      d="M0 110 C 60 105, 120 95, 180 85 C 240 75, 300 60, 360 64 C 420 68, 480 52, 540 40 C 570 34, 590 30, 600 28 L600 140 L0 140 Z"
                      fill="rgba(6,182,212,0.12)"
                    />
                  </svg>
                  <div className="mt-2 flex items-center justify-between text-xs text-gray-500">
                    <span>Semana 1</span>
                    <span>Semana 2</span>
                    <span>Semana 3</span>
                    <span>Semana 4</span>
                  </div>
                </div>
              </div>
            </div>
          </div>
        </Section>

        <Section>
          <div className="rounded-3xl border border-gray-200 bg-white p-10 shadow-sm">
            <div className="mx-auto max-w-3xl text-center">
              <h2 className="text-3xl font-extrabold tracking-tight text-gray-900">Potencia ilimitada</h2>
              <p className="mt-4 text-lg leading-relaxed text-gray-600">
                Un plan pensado para negocios reales. Sumá tu tienda y vendé con una experiencia ecommerce, sin el caos de
                las redes.
              </p>
            </div>

            <div className="mx-auto mt-8 grid max-w-3xl grid-cols-1 gap-4 sm:grid-cols-2">
              {[
                'Publicaciones ilimitadas.',
                'Exposición prioritaria en búsquedas.',
                'Badge "Tienda Oficial" (Ciclo Trust Max).',
                'Soporte dedicado.',
              ].map((text) => (
                <div key={text} className="flex items-start gap-3 rounded-2xl border border-gray-100 bg-gray-50 p-4">
                  <span className="mt-0.5 inline-flex h-6 w-6 items-center justify-center rounded-full bg-cyan-600 text-white text-sm font-bold">
                    ✓
                  </span>
                  <p className="text-gray-700">{text}</p>
                </div>
              ))}
            </div>

            <div className="mt-10 flex justify-center">
              <a
                href={APPLY_URL}
                target="_blank"
                rel="noreferrer"
                className="inline-flex items-center justify-center rounded-full bg-[#14212E] px-8 py-4 text-lg font-semibold text-white shadow-sm transition hover:bg-[#1b2f3f]"
              >
                Hablemos de negocios <ArrowRight className="ml-2 h-5 w-5" />
              </a>
            </div>
          </div>
        </Section>
      </div>
    </div>
  )
}
