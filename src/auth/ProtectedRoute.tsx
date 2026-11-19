import { Navigate, Outlet, useLocation } from 'react-router-dom'
import { useAuth } from './AuthProvider'
import { ErrorState, Spinner } from '../shared/ui'

export function ProtectedRoute() {
  const { session, loading, profile, profileLoading, signOut } = useAuth()
  const location = useLocation()

  if (loading) {
    return (
      <div className="min-h-dvh bg-stone-50">
        <Spinner label="Abriendo la app…" />
      </div>
    )
  }

  if (!session) {
    return <Navigate to="/login" replace state={{ from: location.pathname }} />
  }

  if (!profile && profileLoading) {
    return (
      <div className="min-h-dvh bg-stone-50">
        <Spinner label="Cargando tu perfil…" />
      </div>
    )
  }

  if (!profile) {
    return (
      <div className="min-h-dvh bg-stone-50">
        <ErrorState
          message="No encontramos tu perfil. Verifica que las migraciones incluyan el trigger handle_new_user y vuelve a iniciar sesión."
        />
        <div className="flex justify-center">
          <button className="text-sm font-semibold text-brand-700 underline" onClick={() => void signOut()}>
            Cerrar sesión
          </button>
        </div>
      </div>
    )
  }

  return <Outlet />
}
