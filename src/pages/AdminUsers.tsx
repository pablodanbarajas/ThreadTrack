import { useEffect, useState } from 'react'
import { useNavigate } from 'react-router-dom'
import { Users, Edit2, Trash2, Loader2, AlertTriangle } from 'lucide-react'
import { useRole } from '../contexts/AuthContext'
import type { UserRole } from '../contexts/AuthContext'
import { roleBadges, roleDescriptions } from '../lib/rbac'
import { userService } from '../services/userService'
import type { UserProfile } from '../services/userService'

const AdminUsers = () => {
  const navigate = useNavigate()
  const { isAdministrador } = useRole()
  const [users, setUsers] = useState<UserProfile[]>([])
  const [loading, setLoading] = useState(true)
  const [editingUserId, setEditingUserId] = useState<string | null>(null)
  const [newRole, setNewRole] = useState<UserRole>('operador')
  const [message, setMessage] = useState<{ type: 'success' | 'error'; text: string } | null>(null)
  const [deleting, setDeleting] = useState<string | null>(null)

  // Redirigir si no es administrador
  useEffect(() => {
    if (!isAdministrador) {
      navigate('/')
    }
  }, [isAdministrador, navigate])

  useEffect(() => {
    loadUsers()
  }, [])

  const loadUsers = async () => {
    try {
      setLoading(true)
      const data = await userService.getAllUsers()
      setUsers(data)
    } catch (error) {
      setMessage({ type: 'error', text: 'Error cargando usuarios' })
    } finally {
      setLoading(false)
    }
  }

  const handleUpdateRole = async (userId: string, role: UserRole) => {
    try {
      await userService.updateUserRole(userId, role)
      setMessage({ type: 'success', text: 'Rol actualizado exitosamente' })
      setEditingUserId(null)
      loadUsers()
    } catch (error) {
      setMessage({ type: 'error', text: 'Error actualizando rol' })
    }
  }

  const handleDeleteUser = async (userId: string) => {
    if (!window.confirm('¿Estás seguro? Esta acción no se puede deshacer.')) return

    try {
      setDeleting(userId)
      await userService.deleteUser(userId)
      setMessage({ type: 'success', text: 'Usuario eliminado' })
      loadUsers()
    } catch (error) {
      setMessage({ type: 'error', text: 'Error eliminando usuario' })
    } finally {
      setDeleting(null)
    }
  }

  return (
    <div className="max-w-6xl mx-auto pb-20 md:pb-0">
      {/* Header */}
      <div className="flex items-center gap-3 mb-6 md:mb-8">
        <Users className="w-8 h-8 text-blue-600" />
        <div>
          <h1 className="text-2xl font-bold text-gray-800">Administración de Usuarios</h1>
          <p className="text-gray-600 text-sm">Gestiona usuarios y asigna roles</p>
        </div>
      </div>

      {/* Mensaje */}
      {message && (
        <div className={`mb-4 p-4 rounded-lg flex items-start gap-3 ${
          message.type === 'success'
            ? 'bg-green-50 text-green-800 border border-green-200'
            : 'bg-red-50 text-red-800 border border-red-200'
        }`}>
          {message.type === 'error' && <AlertTriangle className="w-5 h-5 flex-shrink-0 mt-0.5" />}
          <div className="flex-1">
            <p className="text-sm">{message.text}</p>
          </div>
          <button
            onClick={() => setMessage(null)}
            className="text-lg hover:opacity-60"
          >
            ×
          </button>
        </div>
      )}



      {/* Lista de usuarios */}
      {loading ? (
        <div className="flex items-center justify-center py-12">
          <Loader2 className="w-8 h-8 text-blue-600 animate-spin" />
        </div>
      ) : (
        <div className="space-y-3">
          <h2 className="text-lg font-bold text-gray-800 mb-4">Usuarios ({users.length})</h2>
          
          {users.length === 0 ? (
            <div className="card p-6 text-center">
              <p className="text-gray-600">No hay usuarios registrados</p>
            </div>
          ) : (
            users.map((user) => {
              const badge = roleBadges[user.role]
              const isEditing = editingUserId === user.id

              return (
                <div
                  key={user.id}
                  className="card p-4 flex flex-col md:flex-row md:items-center md:justify-between gap-4"
                >
                  <div className="flex-1 min-w-0">
                    <div className="font-medium text-gray-800 break-words">{user.email}</div>
                    <div className="text-sm text-gray-500">
                      ID: {user.id.substring(0, 8)}...
                    </div>
                    <div className="text-xs text-gray-400 mt-1">
                      Creado: {new Date(user.created_at).toLocaleDateString('es-AR')}
                    </div>
                  </div>

                  <div className="flex flex-wrap items-center gap-2">
                    {/* Rol actual o selector */}
                    {isEditing ? (
                      <div className="flex flex-wrap gap-2">
                        <select
                          value={newRole}
                          onChange={(e) => setNewRole(e.target.value as UserRole)}
                          className="input-field text-sm"
                        >
                          <option value="operador">Operador</option>
                          <option value="supervisor">Supervisor</option>
                          <option value="jefe">Jefe</option>
                          <option value="administrador">Administrador</option>
                        </select>
                        <button
                          onClick={() => handleUpdateRole(user.id, newRole)}
                          className="px-3 py-1 bg-green-600 hover:bg-green-700 text-white rounded text-sm font-medium transition-colors"
                        >
                          Guardar
                        </button>
                        <button
                          onClick={() => setEditingUserId(null)}
                          className="px-3 py-1 bg-gray-300 hover:bg-gray-400 text-gray-800 rounded text-sm font-medium transition-colors"
                        >
                          Cancelar
                        </button>
                      </div>
                    ) : (
                      <>
                        <span className={`px-3 py-1 rounded-full text-sm font-medium ${badge.color}`}>
                          {badge.label}
                        </span>
                        <button
                          onClick={() => {
                            setEditingUserId(user.id)
                            setNewRole(user.role)
                          }}
                          className="p-2 text-blue-600 hover:bg-blue-50 rounded-lg transition-colors"
                          title="Cambiar rol"
                        >
                          <Edit2 className="w-4 h-4" />
                        </button>
                        <button
                          onClick={() => handleDeleteUser(user.id)}
                          disabled={deleting === user.id}
                          className="p-2 text-red-600 hover:bg-red-50 rounded-lg transition-colors disabled:opacity-50"
                          title="Eliminar usuario"
                        >
                          {deleting === user.id ? (
                            <Loader2 className="w-4 h-4 animate-spin" />
                          ) : (
                            <Trash2 className="w-4 h-4" />
                          )}
                        </button>
                      </>
                    )}
                  </div>
                </div>
              )
            })
          )}
        </div>
      )}

      {/* Información de roles */}
      <div className="mt-8 grid grid-cols-1 md:grid-cols-3 gap-4">
        {(['jefe', 'supervisor', 'operador'] as const).map((role) => (
          <div key={role} className="card p-4">
            <div className={`inline-block px-3 py-1 rounded-full text-sm font-medium mb-2 ${roleBadges[role as UserRole].color}`}>
              {roleBadges[role as UserRole].label}
            </div>
            <p className="text-sm text-gray-600">{roleDescriptions[role as UserRole]}</p>
          </div>
        ))}
      </div>
    </div>
  )
}

export default AdminUsers
