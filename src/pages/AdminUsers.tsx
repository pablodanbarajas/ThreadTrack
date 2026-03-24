import { useEffect, useState } from 'react'
import { useNavigate } from 'react-router-dom'
import { Users, Edit2, Trash2, Loader2, AlertTriangle, Plus, Building2, X } from 'lucide-react'
import { useRole } from '../contexts/AuthContext'
import type { UserRole } from '../contexts/AuthContext'
import { roleBadges, roleDescriptions } from '../lib/rbac'
import { userService } from '../services/userService'
import type { UserProfile } from '../services/userService'
import type { Team } from '../types'

const AdminUsers = () => {
  const navigate = useNavigate()
  const { isAdministrador } = useRole()
  const [users, setUsers] = useState<UserProfile[]>([])
  const [teams, setTeams] = useState<Team[]>([])
  const [loading, setLoading] = useState(true)
  const [editingUserId, setEditingUserId] = useState<string | null>(null)
  const [newRole, setNewRole] = useState<UserRole>('operador')
  const [message, setMessage] = useState<{ type: 'success' | 'error'; text: string } | null>(null)
  const [deleting, setDeleting] = useState<string | null>(null)
  const [assigningTeam, setAssigningTeam] = useState<string | null>(null)

  // Nuevo equipo
  const [showNewTeam, setShowNewTeam] = useState(false)
  const [newTeamName, setNewTeamName] = useState('')
  const [newTeamDesc, setNewTeamDesc] = useState('')
  const [savingTeam, setSavingTeam] = useState(false)
  const [deletingTeam, setDeletingTeam] = useState<string | null>(null)

  useEffect(() => {
    if (!isAdministrador) navigate('/')
  }, [isAdministrador, navigate])

  useEffect(() => {
    loadAll()
  }, [])

  const loadAll = async () => {
    try {
      setLoading(true)
      const [usersData, teamsData] = await Promise.all([
        userService.getAllUsers(),
        userService.getTeams(),
      ])
      setUsers(usersData)
      setTeams(teamsData)
    } catch {
      setMessage({ type: 'error', text: 'Error cargando datos' })
    } finally {
      setLoading(false)
    }
  }

  const handleUpdateRole = async (userId: string, role: UserRole) => {
    try {
      await userService.updateUserRole(userId, role)
      setMessage({ type: 'success', text: 'Rol actualizado exitosamente' })
      setEditingUserId(null)
      loadAll()
    } catch {
      setMessage({ type: 'error', text: 'Error actualizando rol' })
    }
  }

  const handleDeleteUser = async (userId: string) => {
    if (!window.confirm('¿Estás seguro? Esta acción no se puede deshacer.')) return
    try {
      setDeleting(userId)
      await userService.deleteUser(userId)
      setMessage({ type: 'success', text: 'Usuario eliminado' })
      loadAll()
    } catch {
      setMessage({ type: 'error', text: 'Error eliminando usuario' })
    } finally {
      setDeleting(null)
    }
  }

  const handleAssignTeam = async (userId: string, teamId: string | null) => {
    try {
      setAssigningTeam(userId)
      await userService.assignUserToTeam(userId, teamId)
      setMessage({ type: 'success', text: 'Equipo actualizado' })
      loadAll()
    } catch {
      setMessage({ type: 'error', text: 'Error asignando equipo' })
    } finally {
      setAssigningTeam(null)
    }
  }

  const handleCreateTeam = async () => {
    if (!newTeamName.trim()) return
    try {
      setSavingTeam(true)
      await userService.createTeam(newTeamName.trim(), newTeamDesc.trim() || undefined)
      setMessage({ type: 'success', text: `Equipo "${newTeamName}" creado` })
      setNewTeamName('')
      setNewTeamDesc('')
      setShowNewTeam(false)
      loadAll()
    } catch {
      setMessage({ type: 'error', text: 'Error creando equipo' })
    } finally {
      setSavingTeam(false)
    }
  }

  const handleDeleteTeam = async (teamId: string, teamName: string) => {
    if (!window.confirm(`¿Eliminar el equipo "${teamName}"? Los usuarios quedarán sin equipo asignado.`)) return
    try {
      setDeletingTeam(teamId)
      await userService.deleteTeam(teamId)
      setMessage({ type: 'success', text: `Equipo "${teamName}" eliminado` })
      loadAll()
    } catch {
      setMessage({ type: 'error', text: 'Error eliminando equipo' })
    } finally {
      setDeletingTeam(null)
    }
  }

  return (
    <div className="max-w-6xl mx-auto pb-20 md:pb-0">
      {/* Header */}
      <div className="flex items-center gap-3 mb-6 md:mb-8">
        <Users className="w-8 h-8 text-blue-600" />
        <div>
          <h1 className="text-2xl font-bold text-gray-800">Administración de Usuarios</h1>
          <p className="text-gray-600 text-sm">Gestiona usuarios, roles y equipos</p>
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
          <div className="flex-1"><p className="text-sm">{message.text}</p></div>
          <button onClick={() => setMessage(null)} className="text-lg hover:opacity-60">×</button>
        </div>
      )}

      {loading ? (
        <div className="flex items-center justify-center py-12">
          <Loader2 className="w-8 h-8 text-blue-600 animate-spin" />
        </div>
      ) : (
        <>
          {/* ── EQUIPOS ── */}
          <section className="mb-8">
            <div className="flex items-center justify-between mb-4">
              <h2 className="text-lg font-bold text-gray-800 flex items-center gap-2">
                <Building2 className="w-5 h-5 text-purple-600" />
                Equipos / Empresas ({teams.length})
              </h2>
              <button
                onClick={() => setShowNewTeam(true)}
                className="btn-primary flex items-center gap-2 text-sm px-3 py-2"
              >
                <Plus className="w-4 h-4" />
                Nuevo equipo
              </button>
            </div>

            {/* Formulario nuevo equipo */}
            {showNewTeam && (
              <div className="card p-4 mb-3 border-2 border-purple-200">
                <h3 className="font-medium text-gray-800 mb-3">Nuevo equipo</h3>
                <div className="flex flex-col sm:flex-row gap-2">
                  <input
                    type="text"
                    placeholder="Nombre del equipo / empresa *"
                    value={newTeamName}
                    onChange={e => setNewTeamName(e.target.value)}
                    className="input-field flex-1"
                  />
                  <input
                    type="text"
                    placeholder="Descripción (opcional)"
                    value={newTeamDesc}
                    onChange={e => setNewTeamDesc(e.target.value)}
                    className="input-field flex-1"
                  />
                  <button
                    onClick={handleCreateTeam}
                    disabled={savingTeam || !newTeamName.trim()}
                    className="btn-primary flex items-center gap-2 text-sm px-4 py-2 disabled:opacity-50"
                  >
                    {savingTeam ? <Loader2 className="w-4 h-4 animate-spin" /> : <Plus className="w-4 h-4" />}
                    Crear
                  </button>
                  <button
                    onClick={() => { setShowNewTeam(false); setNewTeamName(''); setNewTeamDesc('') }}
                    className="p-2 text-gray-500 hover:bg-gray-100 rounded-lg"
                  >
                    <X className="w-4 h-4" />
                  </button>
                </div>
              </div>
            )}

            {teams.length === 0 ? (
              <div className="card p-6 text-center text-gray-500 text-sm">
                No hay equipos creados. Crea uno para agrupar usuarios.
              </div>
            ) : (
              <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-3">
                {teams.map(team => {
                  const memberCount = users.filter(u => u.team_id === team.id).length
                  return (
                    <div key={team.id} className="card p-4 flex items-start justify-between gap-2">
                      <div className="min-w-0">
                        <div className="font-medium text-gray-800 truncate">{team.name}</div>
                        {team.description && (
                          <div className="text-xs text-gray-500 truncate">{team.description}</div>
                        )}
                        <div className="text-xs text-purple-600 mt-1">
                          {memberCount} {memberCount === 1 ? 'miembro' : 'miembros'}
                        </div>
                      </div>
                      <button
                        onClick={() => handleDeleteTeam(team.id, team.name)}
                        disabled={deletingTeam === team.id}
                        className="p-1.5 text-red-500 hover:bg-red-50 rounded-lg flex-shrink-0 disabled:opacity-50"
                        title="Eliminar equipo"
                      >
                        {deletingTeam === team.id
                          ? <Loader2 className="w-4 h-4 animate-spin" />
                          : <Trash2 className="w-4 h-4" />}
                      </button>
                    </div>
                  )
                })}
              </div>
            )}
          </section>

          {/* ── USUARIOS ── */}
          <section>
            <h2 className="text-lg font-bold text-gray-800 mb-4">
              Usuarios ({users.length})
            </h2>

            {users.length === 0 ? (
              <div className="card p-6 text-center">
                <p className="text-gray-600">No hay usuarios registrados</p>
              </div>
            ) : (
              <div className="space-y-3">
                {users.map((user) => {
                  const badge = roleBadges[user.role]
                  const isEditing = editingUserId === user.id
                  const userTeam = teams.find(t => t.id === user.team_id)

                  return (
                    <div
                      key={user.id}
                      className="card p-4 flex flex-col md:flex-row md:items-center gap-4"
                    >
                      {/* Info usuario */}
                      <div className="flex-1 min-w-0">
                        <div className="font-medium text-gray-800 break-words">{user.email}</div>
                        <div className="text-sm text-gray-500">ID: {user.id.substring(0, 8)}...</div>
                        <div className="flex items-center gap-2 mt-1 flex-wrap">
                          <span className={`px-2 py-0.5 rounded-full text-xs font-medium ${badge.color}`}>
                            {badge.label}
                          </span>
                          {userTeam ? (
                            <span className="px-2 py-0.5 rounded-full text-xs font-medium bg-purple-100 text-purple-700 flex items-center gap-1">
                              <Building2 className="w-3 h-3" />
                              {userTeam.name}
                            </span>
                          ) : (
                            <span className="text-xs text-gray-400">Sin equipo</span>
                          )}
                        </div>
                      </div>

                      {/* Acciones */}
                      <div className="flex flex-wrap items-center gap-2">
                        {/* Selector de equipo */}
                        <select
                          value={user.team_id ?? ''}
                          onChange={e => handleAssignTeam(user.id, e.target.value || null)}
                          disabled={assigningTeam === user.id}
                          className="input-field text-sm py-1 pr-8"
                          title="Asignar equipo"
                        >
                          <option value="">Sin equipo</option>
                          {teams.map(t => (
                            <option key={t.id} value={t.id}>{t.name}</option>
                          ))}
                        </select>
                        {assigningTeam === user.id && <Loader2 className="w-4 h-4 animate-spin text-purple-500" />}

                        {/* Editar rol */}
                        {isEditing ? (
                          <div className="flex flex-wrap gap-2">
                            <select
                              value={newRole}
                              onChange={e => setNewRole(e.target.value as UserRole)}
                              className="input-field text-sm"
                            >
                              <option value="operador">Operador</option>
                              <option value="supervisor">Supervisor</option>
                              <option value="jefe">Jefe</option>
                              <option value="administrador">Administrador</option>
                            </select>
                            <button
                              onClick={() => handleUpdateRole(user.id, newRole)}
                              className="px-3 py-1 bg-green-600 hover:bg-green-700 text-white rounded text-sm font-medium"
                            >
                              Guardar
                            </button>
                            <button
                              onClick={() => setEditingUserId(null)}
                              className="px-3 py-1 bg-gray-300 hover:bg-gray-400 text-gray-800 rounded text-sm font-medium"
                            >
                              Cancelar
                            </button>
                          </div>
                        ) : (
                          <div className="flex items-center gap-1">
                            <button
                              onClick={() => { setEditingUserId(user.id); setNewRole(user.role) }}
                              className="p-2 text-blue-600 hover:bg-blue-50 rounded-lg"
                              title="Cambiar rol"
                            >
                              <Edit2 className="w-4 h-4" />
                            </button>
                            <button
                              onClick={() => handleDeleteUser(user.id)}
                              disabled={deleting === user.id}
                              className="p-2 text-red-600 hover:bg-red-50 rounded-lg disabled:opacity-50"
                              title="Eliminar usuario"
                            >
                              {deleting === user.id
                                ? <Loader2 className="w-4 h-4 animate-spin" />
                                : <Trash2 className="w-4 h-4" />}
                            </button>
                          </div>
                        )}
                      </div>
                    </div>
                  )
                })}
              </div>
            )}
          </section>
        </>
      )}

      {/* Info roles */}
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
