import { Routes, Route, Navigate, useLocation } from 'react-router-dom'
import Header from './components/Header'
import Footer from './components/Footer'
import Home from './pages/Home'
import Plans from './pages/Publish/Plans'
import NewListingForm from './pages/Publish/NewListingForm'
import ListingDetail from './pages/ListingDetail'
import Dashboard from './pages/Dashboard'
import Profile from './pages/Profile'
import Login from './pages/Auth/Login'
import Register from './pages/Auth/Register'
import VerifyEmail from './pages/Auth/VerifyEmail'
import Help from './pages/Help'
import OfficialStore from './pages/OfficialStore'
import FAQ from './pages/FAQ'
import Terms from './pages/Terms'
import Privacy from './pages/Privacy'
import { AuthProvider } from './context/AuthContext'
import { CurrencyProvider } from './context/CurrencyContext'
import ProtectedRoute from './components/ProtectedRoute'
import Marketplace from './pages/Marketplace'
import Compare from './pages/Compare'
import { CompareProvider } from './context/CompareContext'
import CompareTray from './components/CompareTray'
import { PlanProvider } from './context/PlanContext'

// Helper opcional por si quisieras redirigir preservando query-string
function RedirectWithSearch({ to }: { to: string }) {
  const { search } = useLocation()
  return <Navigate to={`${to}${search}`} replace />
}

export default function App() {
  return (
    <AuthProvider>
      <PlanProvider>
        <CurrencyProvider>
          <CompareProvider>
        <div className="min-h-screen flex flex-col">
          <Header />

          <main className="flex-1">
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
              <Route path="/publish/new" element={<Navigate to="/publicar/nueva" replace />} />

              {/* Detalle */}
              <Route path="/listing/:slug" element={<ListingDetail />} />

              {/* Cuenta / Dashboard */}
              <Route
                path="/dashboard"
                element={
                  <ProtectedRoute>
                    <Dashboard />
                  </ProtectedRoute>
                }
              />
              <Route path="/profile/:uid" element={<Profile />} />

              {/* Auth */}
              <Route path="/login" element={<Login />} />
              <Route path="/register" element={<Register />} />
              <Route path="/verificar-email" element={<VerifyEmail />} />
              <Route path="/ayuda" element={<Help />} />
              <Route path="/tienda-oficial" element={<OfficialStore />} />

              {/* Info */}
              <Route path="/faq" element={<FAQ />} />
              <Route path="/terminos" element={<Terms />} />
              <Route path="/privacidad" element={<Privacy />} />
              <Route path="/comparar" element={<Compare />} />

              {/* Fallback */}
              <Route path="*" element={<Navigate to="/" replace />} />
            </Routes>
          </main>

          <CompareTray />
          <Footer />
        </div>
          </CompareProvider>
        </CurrencyProvider>
      </PlanProvider>
    </AuthProvider>
  )
}
