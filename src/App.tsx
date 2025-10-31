import { useMemo, useEffect, Suspense, lazy } from 'react'
import { Routes, Route, Navigate, useLocation } from 'react-router-dom'
import Header from './components/Header'
import Footer from './components/Footer'
import Newsletter from './components/Newsletter'
import CookieConsent from './components/CookieConsent'
import ErrorBoundary from './components/ErrorBoundary'
import Home from './pages/Home'
import { lazyWithRetry } from './utils/lazyWithRetry'
const Plans = lazyWithRetry(() => import('./pages/Publish/Plans'))
const NewListingForm = lazyWithRetry(() => import('./pages/Publish/NewListingForm'))
const ListingDetail = lazyWithRetry(() => import('./pages/ListingDetail'))
const HighlightListing = lazyWithRetry(() => import('./pages/HighlightListing'))
const Dashboard = lazyWithRetry(() => import('./pages/Dashboard'))
const Profile = lazyWithRetry(() => import('./pages/Profile'))
const Login = lazyWithRetry(() => import('./pages/Auth/Login'))
const Register = lazyWithRetry(() => import('./pages/Auth/Register'))
const VerifyEmail = lazyWithRetry(() => import('./pages/Auth/VerifyEmail'))
const Help = lazyWithRetry(() => import('./pages/Help'))
const HowToPublish = lazyWithRetry(() => import('./pages/HowToPublish'))
const OfficialStore = lazyWithRetry(() => import('./pages/OfficialStore'))
const Store = lazyWithRetry(() => import('./pages/Store'))
const Tiendas = lazyWithRetry(() => import('./pages/Tiendas'))
const StoresLanding = lazyWithRetry(() => import('./pages/StoresLanding'))
const FAQ = lazyWithRetry(() => import('./pages/FAQ'))
const Terms = lazyWithRetry(() => import('./pages/Terms'))
const Privacy = lazyWithRetry(() => import('./pages/Privacy'))
const DataDeletion = lazyWithRetry(() => import('./pages/DataDeletion'))
// SEO landings
const BicicletasUsadas = lazyWithRetry(() => import('./pages/seo/BicicletasUsadas'))
const BicicletasRuta = lazyWithRetry(() => import('./pages/seo/BicicletasRuta'))
const BicicletasMTB = lazyWithRetry(() => import('./pages/seo/BicicletasMTB'))
const BicicletasGravel = lazyWithRetry(() => import('./pages/seo/BicicletasGravel'))
const Fixie = lazyWithRetry(() => import('./pages/seo/Fixie'))
const ClasificadosBicicletas = lazyWithRetry(() => import('./pages/seo/ClasificadosBicicletas'))
const Accesorios = lazyWithRetry(() => import('./pages/seo/Accesorios'))
const Indumentaria = lazyWithRetry(() => import('./pages/seo/Indumentaria'))
const BicicletasTriatlon = lazyWithRetry(() => import('./pages/seo/BicicletasTriatlon'))
const OfertasDestacadas = lazyWithRetry(() => import('./pages/seo/OfertasDestacadas'))
const SweepstakeStrava = lazyWithRetry(() => import('./pages/SweepstakeStrava'))
import { AuthProvider } from './context/AuthContext'
import { CurrencyProvider } from './context/CurrencyContext'
import ProtectedRoute from './components/ProtectedRoute'
const Marketplace = lazy(() => import('./pages/Marketplace'))
const Compare = lazy(() => import('./pages/Compare'))
import { CompareProvider } from './context/CompareContext'
import CompareTray from './components/CompareTray'
import { PlanProvider } from './context/PlanContext'
import { NotificationsProvider } from './context/NotificationContext'
import { ToastProvider } from './context/ToastContext'
import { SweepstakesProvider } from './context/SweepstakesContext'
const CheckoutSuccess = lazy(() => import('./pages/Checkout/Success'))
const CheckoutFailure = lazy(() => import('./pages/Checkout/Failure'))
const CheckoutPending = lazy(() => import('./pages/Checkout/Pending'))
import SEO, { type SEOProps } from './components/SEO'
import GlobalJsonLd from './components/GlobalJsonLd'
import { useRef } from 'react'
import { trackMetaPixel } from './lib/metaPixel'

// Helper opcional por si quisieras redirigir preservando query-string
function RedirectWithSearch({ to }: { to: string }) {
  const { search } = useLocation()
  return <Navigate to={`${to}${search}`} replace />
}

function resolveSeoForPath(pathname: string, search: string): SEOProps {
  const normalized = pathname.toLowerCase()

  if (normalized === '/' || normalized === '') {
    return {
      title: 'Marketplace de bicicletas en Argentina',
      description:
        'Comprá, vendé y compará bicicletas nuevas y usadas en Ciclo Market. Encontrá gravel, ruta, MTB y accesorios verificados con contacto directo al vendedor.',
      image: '/OG-Marketplace.png',
      keywords: [
        'venta de bicicletas usadas',
        'bicicletas usadas',
        'bicicletas de ruta',
        'bicicletas de mtb',
        'bicicletas de gravel',
        'fixie',
        'clasificados de bicicletas'
      ]
    }
  }

  if (
    normalized.startsWith('/marketplace') ||
    normalized.startsWith('/market') ||
    normalized.startsWith('/buscar') ||
    normalized.startsWith('/ofertas')
  ) {
    // Si hay filtros dinámicos en query, marcamos noindex y canonical sin query
    const hasFilters = /[?&](cat|brand|deal|q|min|max|sub)=/i.test(search)
    return {
      title: 'Comprar bicicletas nuevas y usadas',
      description:
        'Explorá cientos de bicicletas verificadas por tipo, talle, ubicación y rango de precio. Filtrá por gravel, ruta, MTB, e-bikes y accesorios para encontrar tu próxima bici.',
      image: '/OG-Marketplace.png',
      url: hasFilters ? '/marketplace' : undefined,
      noIndex: hasFilters,
      keywords: [
        'venta de bicicletas usadas',
        'bicicletas usadas',
        'bicicletas de ruta',
        'bicicletas de mtb',
        'bicicletas de gravel',
        'fixie',
        'clasificados de bicicletas'
      ]
    }
  }

  if (normalized.startsWith('/publicar')) {
    return {
      title: 'Planes para publicar tu bicicleta',
      description:
        'Elegí el plan ideal para publicar tu bicicleta en Ciclo Market: fotos destacadas, botón de WhatsApp y difusión en redes para vender más rápido.',
      image: '/og-preview.png',
      keywords: [
        'publicar bicicleta online',
        'plan destacado ciclomarket',
        'vender bici argentina',
        'planes de publicación bicicletas'
      ]
    }
  }

  if (normalized.startsWith('/sorteo-strava')) {
    return {
      title: 'Sorteo Strava Premium · Ciclo Market',
      description:
        'Publicá tu bici durante la campaña Sorteo Strava Premium y participá automáticamente por 1 año de Strava Premium sin pasos extra.',
      image: '/og-preview.png',
      keywords: [
        'sorteo strava premium',
        'strava ciclomarket',
        'sorteo publicar bicicleta',
        'strava argentina'
      ]
    }
  }

  if (normalized.startsWith('/comparar') || normalized.startsWith('/compare')) {
    return {
      title: 'Comparar bicicletas',
      description:
        'Seleccioná tus bicicletas favoritas y compará especificaciones, precios y beneficios en una sola vista para decidir con confianza.',
      image: '/og-preview.png',
      keywords: [
        'comparar bicicletas',
        'comparador de bicicletas',
        'bicicletas ruta vs gravel',
        'comparar precios bicicletas'
      ]
    }
  }

  if (normalized.startsWith('/ayuda')) {
    return {
      title: 'Centro de ayuda',
      description:
        'Respondemos tus dudas sobre envíos, publicaciones, pagos y seguridad para comprar y vender bicicletas con tranquilidad.',
      image: '/og-preview.png',
      keywords: [
        'ayuda ciclomarket',
        'dudas comprar bicicleta online',
        'soporte marketplace bicicletas'
      ]
    }
  }

  if (normalized.startsWith('/como-publicar')) {
    return {
      title: 'Cómo publicar tu bicicleta',
      description:
        'Guía paso a paso para sacar las mejores fotos, describir tu bicicleta y activar un plan destacado que acelere la venta.',
      image: '/og-preview.png',
      type: 'article',
      keywords: [
        'como vender bicicleta',
        'tips publicar bicicleta',
        'guia vendedor ciclomarket'
      ]
    }
  }

  if (normalized.startsWith('/tienda-oficial')) {
    return {
      title: 'Tienda oficial Ciclo Market',
      description:
        'Accedé a bicicletas seleccionadas con inspección, garantías y beneficios exclusivos dentro de la tienda oficial de Ciclo Market.',
      image: '/og-preview.png',
      keywords: [
        'tienda oficial bicicletas',
        'bicicletas certificadas',
        'ciclomarket tienda oficial'
      ]
    }
  }

  if (normalized.startsWith('/tiendas-oficiales')) {
    return {
      title: 'Tiendas oficiales: cómo funciona y beneficios',
      description:
        'Sumá tu local a Ciclo Market como tienda oficial: sello verificado, catálogo destacado, métricas y soporte. Solicitá prueba gratuita.',
      image: '/hero-tiendas.webp',
      keywords: [
        'tiendas oficiales',
        'sumar tienda oficial',
        'ciclomarket tiendas',
        'prueba gratuita tienda'
      ]
    }
  }

  if (normalized.startsWith('/tienda/')) {
    return {
      title: 'Tienda oficial del vendedor',
      description:
        'Conocé información del local, contacto y todos los productos publicados por esta tienda en Ciclo Market.',
      image: '/og-preview.png',
      type: 'profile',
      keywords: ['tienda oficial', 'vendedor verificado', 'productos del vendedor']
    }
  }

  if (normalized.startsWith('/listing/')) {
    return {
      title: 'Detalle del producto',
      description: 'Mirá fotos, precio y especificaciones técnicas de la publicación en Ciclo Market.',
      image: '/og-preview.png',
      type: 'product'
    }
  }

  if (normalized.startsWith('/faq')) {
    return {
      title: 'Preguntas frecuentes',
      description:
        'Respondemos las preguntas más comunes sobre pagos, publicación, seguridad y planes premium en Ciclo Market.',
      image: '/og-preview.png',
      keywords: [
        'preguntas frecuentes ciclomarket',
        'faq marketplace bicicletas',
        'ayuda vender bicicleta'
      ]
    }
  }

  if (normalized.startsWith('/tiendas')) {
    return {
      title: 'Tiendas oficiales',
      description: 'Descubrí todas las tiendas oficiales en Ciclo Market y mirá sus productos publicados, datos de contacto y redes.',
      image: '/og-preview.png',
      keywords: ['tiendas oficiales', 'tienda ciclomarket', 'vender bicicletas tienda']
    }
  }

  if (normalized.startsWith('/terminos')) {
    return {
      title: 'Términos y condiciones',
      description:
        'Conocé las reglas de uso, responsabilidades y condiciones legales para operar dentro de Ciclo Market.',
      image: '/og-preview.png',
      keywords: [
        'terminos ciclomarket',
        'condiciones marketplace bicicletas',
        'politicas de uso bicicletas'
      ]
    }
  }

  if (normalized.startsWith('/privacidad')) {
    return {
      title: 'Política de privacidad',
      description:
        'Descubrí cómo protegemos tus datos personales, cómo usamos tu información y qué herramientas tenés para gestionarla.',
      image: '/og-preview.png',
      keywords: [
        'privacidad ciclomarket',
        'proteccion datos bicicletas',
        'politica de privacidad marketplace'
      ]
    }
  }

  if (normalized.startsWith('/eliminar-datos')) {
    return {
      title: 'Eliminar datos de tu cuenta',
      description:
        'Aprendé cómo solicitar la eliminación de tu cuenta y datos personales en Ciclo Market por cuenta propia o por correo.',
      image: '/og-preview.png',
      keywords: [
        'eliminar datos',
        'borrar cuenta',
        'data deletion',
        'ciclomarket privacidad'
      ]
    }
  }

  if (normalized.startsWith('/profile') || normalized.startsWith('/vendedor')) {
    return {
      title: 'Perfil de vendedor',
      description:
        'Conocé la reputación del vendedor, sus bicicletas publicadas y los planes activos antes de iniciar contacto.',
      image: '/og-preview.png',
      type: 'profile',
      keywords: [
        'perfil vendedor bicicletas',
        'reputacion vendedor ciclomarket',
        'publicaciones vendedor bicicleta'
      ]
    }
  }

  if (normalized.startsWith('/dashboard')) {
    return {
      title: 'Panel del vendedor',
      description: 'Gestioná tus publicaciones, estadísticas y consultas en un solo lugar.',
      noIndex: true
    }
  }

  if (normalized.startsWith('/login')) {
    return {
      title: 'Ingresar a Ciclo Market',
      description: 'Accedé a tu cuenta para publicar bicicletas, responder consultas y revisar tus planes activos.',
      noIndex: true
    }
  }

  if (normalized.startsWith('/register')) {
    return {
      title: 'Crear cuenta en Ciclo Market',
      description: 'Registrate gratis para publicar bicicletas y recibir consultas de compradores verificados.',
      noIndex: true
    }
  }

  if (normalized.startsWith('/verificar-email')) {
    return {
      title: 'Verificar email',
      description: 'Confirmá tu correo electrónico para activar tu cuenta en Ciclo Market.',
      noIndex: true
    }
  }

  if (normalized.startsWith('/checkout')) {
    return {
      title: 'Estado del pago',
      description: 'Revisá el estado de tu pago y seguí los pasos para completar la operación.',
      noIndex: true
    }
  }

  return {}
}

// Fuerza scroll al tope en cada cambio de ruta
function ScrollToTop() {
  const location = useLocation()
  useEffect(() => {
    if (typeof window !== 'undefined') {
      window.scrollTo({ top: 0, left: 0, behavior: 'smooth' })
    }
  }, [location.pathname])
  return null
}

export default function App() {
  const location = useLocation()
  const seoConfig = useMemo(() => resolveSeoForPath(location.pathname, location.search), [location.pathname, location.search])
  useEffect(() => {
    const gtag = (window as any).gtag as ((...args: any[]) => void) | undefined
    if (typeof gtag === 'function') {
      const pagePath = location.pathname + location.search
      gtag('event', 'page_view', { page_path: pagePath, page_location: `${window.location.origin}${pagePath}` })
    }
    // Meta Pixel PageView
    trackMetaPixel('PageView')
  }, [location.pathname, location.search])

  return (
    <AuthProvider>
      <PlanProvider>
        <NotificationsProvider>
          <CurrencyProvider>
            <ToastProvider>
              <SweepstakesProvider>
                <CompareProvider>
                  <div className="min-h-screen flex flex-col">
                  <SEO {...seoConfig} />
                  <GlobalJsonLd />
                  <Header />
                  <ScrollToTop />

                  <main className="flex-1">
                    <ErrorBoundary>
                      <Suspense fallback={<div className="py-10 text-center text-[#14212e]/70">Cargando…</div>}>
                        <Routes>
                      {/* Home */}
                      <Route path="/" element={<Home />} />

                      {/* Marketplace (shop) */}
                      <Route path="/marketplace" element={<Marketplace />} />

                      {/* Alias/compatibilidad */}
                      {/* /market → /marketplace (preserva query) */}
                      <Route path="/market" element={<RedirectWithSearch to="/marketplace" />} />
                      {/* /buscar debe abrir el shop para que use ?q=... */}
                      <Route path="/buscar" element={<Marketplace />} />
                      {/* /ofertas va al shop con deal=1 */}
                      <Route path="/ofertas" element={<Navigate to="/marketplace?deal=1" replace />} />

                      {/* Publicar */}
                      <Route path="/publicar" element={<Plans />} />
                      {/* Campaña: Publicá gratis */}
                      
                      <Route
                        path="/publicar/nueva"
                        element={
                          <ProtectedRoute>
                            <NewListingForm />
                          </ProtectedRoute>
                        }
                      />
                      {/* Alias legado */}
                      <Route path="/publish" element={<Navigate to="/publicar" replace />} />
                      <Route path="/publish/new" element={<Navigate to="/publicar" replace />} />

                      {/* Detalle */}
                      <Route path="/listing/:slug" element={<ListingDetail />} />
                      <Route path="/listing/:slug/destacar" element={<HighlightListing />} />

                      {/* Cuenta / Dashboard */}
                      <Route
                        path="/dashboard"
                        element={
                          <ProtectedRoute>
                            <Dashboard />
                          </ProtectedRoute>
                        }
                      />
                      <Route path="/vendedor/:sellerId" element={<Profile />} />
                      <Route path="/profile/:sellerId" element={<Profile />} />

                      {/* Auth */}
                      <Route path="/login" element={<Login />} />
                      <Route path="/register" element={<Register />} />
                      <Route path="/verificar-email" element={<VerifyEmail />} />
                      <Route path="/ayuda" element={<Help />} />
                      <Route path="/como-publicar" element={<HowToPublish />} />
                      <Route path="/tienda-oficial" element={<OfficialStore />} />
                      <Route path="/tiendas" element={<Tiendas />} />
                      {/* SEO landings */}
                      <Route path="/bicicletas-usadas" element={<BicicletasUsadas />} />
                      <Route path="/bicicletas-ruta" element={<BicicletasRuta />} />
                      <Route path="/bicicletas-mtb" element={<BicicletasMTB />} />
                      <Route path="/bicicletas-gravel" element={<BicicletasGravel />} />
                      <Route path="/fixie" element={<Fixie />} />
                      <Route path="/clasificados-bicicletas" element={<ClasificadosBicicletas />} />
                      <Route path="/accesorios" element={<Accesorios />} />
                      <Route path="/indumentaria" element={<Indumentaria />} />
                      <Route path="/bicicletas-triatlon" element={<BicicletasTriatlon />} />
                      <Route path="/ofertas-destacadas" element={<OfertasDestacadas />} />
                      <Route path="/tiendas-oficiales" element={<StoresLanding />} />
                      <Route path="/tienda/:slug" element={<Store />} />
                      <Route path="/sorteo-strava" element={<SweepstakeStrava />} />

                      {/* Checkout status */}
                      <Route path="/checkout/success" element={<CheckoutSuccess />} />
                      <Route path="/checkout/failure" element={<CheckoutFailure />} />
                      <Route path="/checkout/pending" element={<CheckoutPending />} />

                      {/* Info */}
                      <Route path="/faq" element={<FAQ />} />
                      <Route path="/terminos" element={<Terms />} />
                      <Route path="/privacidad" element={<Privacy />} />
                      <Route path="/eliminar-datos" element={<DataDeletion />} />
                      <Route path="/comparar" element={<Compare />} />

                      {/* Fallback */}
                      <Route path="*" element={<Navigate to="/" replace />} />
                        </Routes>
                      </Suspense>
                    </ErrorBoundary>
                  </main>

                  <CompareTray />
                  <Newsletter />
                  <CookieConsent />
                  <Footer />
                </div>
                </CompareProvider>
              </SweepstakesProvider>
            </ToastProvider>
          </CurrencyProvider>
        </NotificationsProvider>
      </PlanProvider>
    </AuthProvider>
  )
}
