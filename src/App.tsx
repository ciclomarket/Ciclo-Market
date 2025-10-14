import { useMemo, useEffect, Suspense, lazy } from 'react'
import { Routes, Route, Navigate, useLocation } from 'react-router-dom'
import Header from './components/Header'
import Footer from './components/Footer'
import Home from './pages/Home'
const Plans = lazy(() => import('./pages/Publish/Plans'))
const NewListingForm = lazy(() => import('./pages/Publish/NewListingForm'))
const ListingDetail = lazy(() => import('./pages/ListingDetail'))
const HighlightListing = lazy(() => import('./pages/HighlightListing'))
const Dashboard = lazy(() => import('./pages/Dashboard'))
const Profile = lazy(() => import('./pages/Profile'))
const Login = lazy(() => import('./pages/Auth/Login'))
const Register = lazy(() => import('./pages/Auth/Register'))
const VerifyEmail = lazy(() => import('./pages/Auth/VerifyEmail'))
const Help = lazy(() => import('./pages/Help'))
const HowToPublish = lazy(() => import('./pages/HowToPublish'))
const OfficialStore = lazy(() => import('./pages/OfficialStore'))
const FAQ = lazy(() => import('./pages/FAQ'))
const Terms = lazy(() => import('./pages/Terms'))
const Privacy = lazy(() => import('./pages/Privacy'))
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
const CheckoutSuccess = lazy(() => import('./pages/Checkout/Success'))
const CheckoutFailure = lazy(() => import('./pages/Checkout/Failure'))
const CheckoutPending = lazy(() => import('./pages/Checkout/Pending'))
import SEO, { type SEOProps } from './components/SEO'

// Helper opcional por si quisieras redirigir preservando query-string
function RedirectWithSearch({ to }: { to: string }) {
  const { search } = useLocation()
  return <Navigate to={`${to}${search}`} replace />
}

function resolveSeoForPath(pathname: string): SEOProps {
  const normalized = pathname.toLowerCase()

  if (normalized === '/' || normalized === '') {
    return {
      title: 'Marketplace de bicicletas en Argentina',
      description:
        'Comprá, vendé y compará bicicletas nuevas y usadas en Ciclo Market. Encontrá gravel, ruta, MTB y accesorios verificados con contacto directo al vendedor.',
      image: '/bicicletas-home.jpg',
      keywords: [
        'marketplace bicicletas',
        'comprar bicicleta usada argentina',
        'vender bici online',
        'bicicletas gravel ruta mtb',
        'ciclo market'
      ]
    }
  }

  if (
    normalized.startsWith('/marketplace') ||
    normalized.startsWith('/market') ||
    normalized.startsWith('/buscar') ||
    normalized.startsWith('/ofertas')
  ) {
    return {
      title: 'Comprar bicicletas nuevas y usadas',
      description:
        'Explorá cientos de bicicletas verificadas por tipo, talle, ubicación y rango de precio. Filtrá por gravel, ruta, MTB, e-bikes y accesorios para encontrar tu próxima bici.',
      image: '/hero-market.jpg',
      keywords: [
        'comprar bicicletas argentina',
        'bicicletas usadas certificadas',
        'ofertas bicicletas',
        'gravel bike argentina',
        'bicicletas ruta mtb marketplace'
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
  const seoConfig = useMemo(() => resolveSeoForPath(location.pathname), [location.pathname])

  return (
    <AuthProvider>
      <PlanProvider>
        <NotificationsProvider>
          <CurrencyProvider>
            <ToastProvider>
            <CompareProvider>
                <div className="min-h-screen flex flex-col">
                  <SEO {...seoConfig} />
                  <Header />
                  <ScrollToTop />

                  <main className="flex-1">
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

                      {/* Checkout status */}
                      <Route path="/checkout/success" element={<CheckoutSuccess />} />
                      <Route path="/checkout/failure" element={<CheckoutFailure />} />
                      <Route path="/checkout/pending" element={<CheckoutPending />} />

                      {/* Info */}
                      <Route path="/faq" element={<FAQ />} />
                      <Route path="/terminos" element={<Terms />} />
                      <Route path="/privacidad" element={<Privacy />} />
                      <Route path="/comparar" element={<Compare />} />

                      {/* Fallback */}
                      <Route path="*" element={<Navigate to="/" replace />} />
                    </Routes>
                    </Suspense>
                  </main>

                  <CompareTray />
                  <Footer />
                </div>
            </CompareProvider>
            </ToastProvider>
          </CurrencyProvider>
        </NotificationsProvider>
      </PlanProvider>
    </AuthProvider>
  )
}
