import { UserCheck } from 'lucide-react'
import { useAuth } from '../contexts/AuthContext'

/**
 * Responsable de la acción: siempre el usuario en sesión (lo fija la base de
 * datos). Se muestra para que quede claro a nombre de quién se registra.
 */
const RecordedBy = ({ className = '' }: { className?: string }) => {
  const { displayName, user } = useAuth()
  return (
    <div className={`flex items-center gap-2 rounded-lg bg-slate-50 px-3 py-2 text-sm ring-1 ring-inset ring-gray-200 ${className}`}>
      <UserCheck className="h-4 w-4 shrink-0 text-blue-600" />
      <span className="text-gray-600">
        Se registrará a nombre de <span className="font-semibold text-gray-900">{displayName}</span>
        {displayName !== user?.email && <span className="text-gray-400"> · {user?.email}</span>}
      </span>
    </div>
  )
}

export default RecordedBy
