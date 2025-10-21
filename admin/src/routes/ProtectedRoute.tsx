import { Navigate, useLocation } from 'react-router-dom'
import { useAdminAuth } from '@admin/context/AdminAuthContext'
import { LoadingScreen } from '@admin/components/LoadingScreen'
import { FullScreenMessage } from '@admin/components/FullScreenMessage'
import { supabaseEnabled } from '@app/services/supabase'

export function ProtectedRoute({ children }: { children: JSX.Element }) {
  const location = useLocation()
  const { loading, user, isModerator } = useAdminAuth()

  if (!supabaseEnabled) {
    return (
      <FullScreenMessage
        title="Panel deshabilitado"
        message="Configurá VITE_SUPABASE_URL y VITE_SUPABASE_ANON_KEY antes de utilizar el panel de moderación."
      />
    )
  }

  if (loading) {
    return <LoadingScreen />
  }

  if (!user) {
    return <Navigate to="/login" replace state={{ from: location }} />
  }

  if (!isModerator) {
    return (
      <FullScreenMessage
        title="Acceso restringido"
        message="Necesitás permisos de moderador o administrador para ingresar."
        action={<a href="/login" style={{ color: '#61dfff', fontWeight: 600 }}>Volver al login</a>}
      />
    )
  }

  return children
}
