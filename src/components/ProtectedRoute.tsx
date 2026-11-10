import { Navigate, useLocation } from 'react-router-dom'
import { useAuth } from '../contexts/AuthContext'
import type { UserRole } from '../contexts/AuthContext'
import { Loader2 } from 'lucide-react'

interface ProtectedRouteProps {
  children: React.ReactNode
  requiredRole?: UserRole | UserRole[]
  requiredModule?: 'prendas' | 'mangueras'
}

const ProtectedRoute = ({ children, requiredRole, requiredModule }: ProtectedRouteProps) => {
  const { user, role, modules, isSuperadmin, mustChangePassword, loading } = useAuth()
  const location = useLocation()

  if (loading) {
    return (
      <div className="min-h-screen flex items-center justify-center bg-gray-50">
        <div className="text-center">
          <Loader2 className="w-12 h-12 text-blue-600 mx-auto mb-4 animate-spin" />
          <p className="text-gray-600">Cargando...</p>
        </div>
      </div>
    )
  }

  if (!user) {
    return <Navigate to="/login" state={{ from: location.pathname }} replace />
  }

  // Contraseña temporal o caducada: nada más hasta cambiarla
  if (mustChangePassword) {
    return <Navigate to="/cambiar-contrasena" replace />
  }

  // Validar rol si se requiere
  if (requiredRole) {
    const requiredRoles = typeof requiredRole === 'string' ? [requiredRole] : requiredRole
    if (!role || !requiredRoles.includes(role)) {
      return (
        <div className="min-h-screen flex items-center justify-center bg-gray-50">
          <div className="text-center">
            <h1 className="text-2xl font-bold text-gray-800 mb-4">Acceso Denegado</h1>
            <p className="text-gray-600">No tienes permisos para acceder a esta página.</p>
            <p className="text-sm text-gray-500 mt-2">Se requerido rol: {requiredRoles.join(', ')}</p>
          </div>
        </div>
      )
    }
  }

  // Redirigir si el módulo asignado al usuario no incluye esta ruta
  // (también aplica a administradores: cada uno administra solo sus módulos)
  if (requiredModule && !isSuperadmin && !modules.includes(requiredModule)) {
    if (requiredModule === 'prendas' && modules.includes('mangueras')) {
      return <Navigate to="/mangueras" replace />
    }
    if (requiredModule === 'mangueras' && modules.includes('prendas')) {
      return <Navigate to="/" replace />
    }
    return (
      <div className="min-h-screen flex items-center justify-center bg-gray-50">
        <div className="text-center">
          <h1 className="text-2xl font-bold text-gray-800 mb-4">Sin módulos asignados</h1>
          <p className="text-gray-600">Tu usuario no tiene acceso a ningún módulo. Contacta al administrador de tu empresa.</p>
        </div>
      </div>
    )
  }

  return <>{children}</>
}

export default ProtectedRoute
