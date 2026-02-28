import { Navigate, useLocation } from 'react-router-dom'
import { useAdminAuth } from '@admin/context/AdminAuthContext'
import { LoadingScreen } from '@admin/components/LoadingScreen'
import { FullScreenMessage } from '@admin/components/FullScreenMessage'
import { supabaseEnabled } from '@app/services/supabase'

export function ProtectedRoute({ children }: { children: JSX.Element }) {
  const location = useLocation()
  const { loading, user, isModerator, roleStatus, refreshRole } = useAdminAuth()

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

  if (roleStatus === 'unknown') {
    return <LoadingScreen label="Validando permisos…" />
  }

  if (roleStatus === 'error') {
    return (
      <FullScreenMessage
        title="No pudimos validar permisos"
        message="Reintentá en unos segundos. Si el problema persiste, revisá conectividad con Supabase."
        action={(
          <button
            type="button"
            onClick={() => void refreshRole()}
            style={{ color: '#61dfff', fontWeight: 700, background: 'transparent', border: 0, cursor: 'pointer' }}
          >
            Reintentar
          </button>
        )}
      />
    )
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
