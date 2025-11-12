import { Navigate, Route, Routes } from 'react-router-dom'
import { AdminAuthProvider } from '@admin/context/AdminAuthContext'
import { ProtectedRoute } from '@admin/routes/ProtectedRoute'
import LoginPage from '@admin/pages/Login'
import OverviewPage from '@admin/pages/Overview'
import AnalyticsPage from '@admin/pages/Analytics'
import EngagementPage from '@admin/pages/Engagement'
import ListingsPage from '@admin/pages/Listings'
import StoresPage from '@admin/pages/Stores'
import StoreDetailPage from '@admin/pages/StoreDetail'
import { AdminLayout } from '@admin/components/AdminLayout'

function ProtectedApp() {
  return (
    <Routes>
      <Route element={<AdminLayout />}>
        <Route path="/" element={<OverviewPage />} />
        <Route path="/analytics" element={<AnalyticsPage />} />
        <Route path="/listings" element={<ListingsPage />} />
        <Route path="/engagement" element={<EngagementPage />} />
        <Route path="/stores" element={<StoresPage />} />
        <Route path="/stores/:id" element={<StoreDetailPage />} />
      </Route>
      <Route path="*" element={<Navigate to="/" replace />} />
    </Routes>
  )
}

export default function App() {
  return (
    <AdminAuthProvider>
      <Routes>
        <Route path="/login" element={<LoginPage />} />
        <Route
          path="/*"
          element={(
            <ProtectedRoute>
              <ProtectedApp />
            </ProtectedRoute>
          )}
        />
      </Routes>
    </AdminAuthProvider>
  )
}
