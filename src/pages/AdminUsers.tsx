import { useCallback, useEffect, useMemo, useState } from 'react'
import { useNavigate } from 'react-router-dom'
import {
  Users, Loader2, Plus, Building2, X, UserX, UserCheck, Unlock, Lock, KeyRound, Copy, Check, Trash2, Pencil, ShieldAlert,
} from 'lucide-react'
import { useAuth, useRole, ALL_MODULES, moduleLabels } from '../contexts/AuthContext'
import type { UserRole, AppModule } from '../contexts/AuthContext'
import { roleBadges, roleDescriptions } from '../lib/rbac'
import { userService } from '../services/userService'
import type { UserProfile } from '../services/userService'
import { accessService } from '../services/accessService'
import type { Team, Organization } from '../types'

const ASSIGNABLE_ROLES: UserRole[] = ['operador', 'supervisor', 'jefe', 'administrador']

const ModuleChecks = ({ value, options, onChange, disabled }: {
  value: AppModule[]; options: AppModule[]; onChange: (m: AppModule[]) => void; disabled?: boolean
}) => (
  <div className="flex flex-wrap gap-3">
    {options.map((m) => (
      <label key={m} className="flex items-center gap-1 text-sm">
        <input
          type="checkbox"
          checked={value.includes(m)}
          disabled={disabled}
          onChange={(e) => onChange(e.target.checked ? [...value, m] : value.filter((x) => x !== m))}
        />
        {moduleLabels[m]}
      </label>
    ))}
  </div>
)

const AdminUsers = () => {
  const navigate = useNavigate()
  const { user: me, modules: myModules, organizationId: myOrgId } = useAuth()
  const { isAdministrador, isSuperadmin } = useRole()

  const [orgs, setOrgs] = useState<Organization[]>([])
  const [selectedOrgId, setSelectedOrgId] = useState<string | null>(null)
  const [users, setUsers] = useState<UserProfile[]>([])
  const [teams, setTeams] = useState<Team[]>([])
  const [loading, setLoading] = useState(true)
  const [busy, setBusy] = useState<string | null>(null)
  const [message, setMessage] = useState<{ type: 'success' | 'error'; text: string } | null>(null)
  const [tempPassword, setTempPassword] = useState<{ email: string; password: string; isNew: boolean } | null>(null)
  const [copied, setCopied] = useState(false)

  // Alta de usuario
  const [showNewUser, setShowNewUser] = useState(false)
  const [newEmail, setNewEmail] = useState('')
  const [newRole, setNewRole] = useState<UserRole>('operador')
  const [newModules, setNewModules] = useState<AppModule[]>([])
  const [newTeamId, setNewTeamId] = useState('')

  // Empresa (superadmin)
  const [orgForm, setOrgForm] = useState<{ id: string | null; name: string; maxUsers: number; modules: AppModule[]; isActive: boolean } | null>(null)

  // Equipo nuevo
  const [newTeamName, setNewTeamName] = useState('')

  useEffect(() => {
    if (!isAdministrador) navigate('/')
  }, [isAdministrador, navigate])

  const loadAll = useCallback(async () => {
    try {
      setLoading(true)
      const [orgsData, usersData, teamsData] = await Promise.all([
        userService.listOrganizations(),
        userService.getAllUsers(),
        userService.getTeams(),
      ])
      setOrgs(orgsData)
      setUsers(usersData)
      setTeams(teamsData)
      setSelectedOrgId((prev) => prev ?? (isSuperadmin ? orgsData[0]?.id ?? null : myOrgId))
    } catch (err: any) {
      setMessage({ type: 'error', text: err.message || 'Error cargando datos' })
    } finally {
      setLoading(false)
    }
  }, [isSuperadmin, myOrgId])

  useEffect(() => { loadAll() }, [loadAll])

  const org = orgs.find((o) => o.id === selectedOrgId) ?? null
  const orgUsers = useMemo(() => users.filter((u) => u.organization_id === selectedOrgId && u.role !== ('superadmin' as UserRole)), [users, selectedOrgId])
  const orgTeams = teams.filter((t) => t.organization_id === selectedOrgId)
  // Módulos que puedo asignar en esta empresa: los míos ∩ los contratados
  const assignableModules = ALL_MODULES.filter((m) => myModules.includes(m) && (org?.modules ?? []).includes(m))
  const seatsFull = !!org && org.active_users >= org.max_users

  const run = async (key: string, fn: () => Promise<unknown>, ok: string) => {
    setBusy(key)
    setMessage(null)
    try {
      await fn()
      setMessage({ type: 'success', text: ok })
      await loadAll()
    } catch (err: any) {
      setMessage({ type: 'error', text: err.message || 'Error' })
    } finally {
      setBusy(null)
    }
  }

  const askReason = (text: string) => {
    const reason = window.prompt(`${text}\n\nMotivo:`)
    if (reason === null) return null
    if (!reason.trim()) {
      setMessage({ type: 'error', text: 'El motivo es obligatorio' })
      return null
    }
    return reason.trim()
  }

  // ---------- Acciones ----------
  const handleCreateUser = async () => {
    setBusy('new-user')
    setMessage(null)
    try {
      const email = newEmail.trim().toLowerCase()
      const res = await userService.createUser({
        email, role: newRole, modules: newModules, organizationId: selectedOrgId, teamId: newTeamId || null,
      })
      setTempPassword({ email, password: res.temporaryPassword, isNew: true })
      setShowNewUser(false)
      setNewEmail('')
      setNewModules([])
      setNewTeamId('')
      await loadAll()
    } catch (err: any) {
      setMessage({ type: 'error', text: err.message || 'No se pudo crear el usuario' })
    } finally {
      setBusy(null)
    }
  }

  const handleResetPassword = async (u: UserProfile) => {
    if (!window.confirm(`¿Restablecer la contraseña de ${u.email}? Se generará una contraseña temporal y deberá cambiarla al entrar.`)) return
    setBusy(u.id)
    setMessage(null)
    try {
      const password = await userService.resetPassword(u.id)
      setTempPassword({ email: u.email, password, isNew: false })
      await loadAll()
    } catch (err: any) {
      setMessage({ type: 'error', text: err.message || 'No se pudo restablecer' })
    } finally {
      setBusy(null)
    }
  }

  const handleToggleActive = (u: UserProfile) => {
    const reason = askReason(u.is_active
      ? `Desactivar a ${u.email}. No podrá iniciar sesión y libera un lugar de la licencia.`
      : `Reactivar a ${u.email}. Ocupará un lugar de la licencia.`)
    if (!reason) return
    run(u.id, () => userService.setUserActive(u.id, !u.is_active, reason), u.is_active ? 'Usuario desactivado' : 'Usuario reactivado')
  }

  const handleUnlock = (u: UserProfile) => {
    const reason = askReason(`Desbloquear a ${u.email} (bloqueado por intentos fallidos).`)
    if (!reason) return
    run(u.id, () => accessService.unlockAccount(u.email, reason), 'Cuenta desbloqueada')
  }

  const handleSaveOrg = () => {
    if (!orgForm) return
    const reason = askReason(orgForm.id ? `Actualizar la licencia de ${orgForm.name}.` : `Dar de alta la empresa ${orgForm.name}.`)
    if (!reason) return
    run('org', async () => {
      await userService.saveOrganization({ ...orgForm, reason })
      setOrgForm(null)
    }, 'Empresa guardada')
  }

  const copyPassword = async () => {
    if (!tempPassword) return
    await navigator.clipboard.writeText(tempPassword.password)
    setCopied(true)
    setTimeout(() => setCopied(false), 1500)
  }

  if (loading) {
    return <div className="flex justify-center py-20"><Loader2 className="w-8 h-8 animate-spin text-blue-600" /></div>
  }

  return (
    <div className="w-full pb-20 md:pb-0 space-y-6">
      <div className="flex items-center gap-3">
        <Users className="w-8 h-8 text-blue-600" />
        <div>
          <h1 className="text-2xl font-bold text-gray-800">Gestionar usuarios</h1>
          <p className="text-sm text-gray-500">
            {isSuperadmin ? 'Superadministrador: empresas, licencias y usuarios.' : `Administras: ${myModules.map((m) => moduleLabels[m]).join(', ')}`}
          </p>
        </div>
      </div>

      {message && (
        <div className={`p-3 rounded-lg text-sm border flex justify-between gap-2 ${message.type === 'success' ? 'bg-green-50 border-green-200 text-green-800' : 'bg-red-50 border-red-200 text-red-700'}`}>
          <span>{message.text}</span>
          <button onClick={() => setMessage(null)}><X className="w-4 h-4" /></button>
        </div>
      )}

      {/* Contraseña temporal: se muestra una sola vez */}
      {tempPassword && (
        <div className="card p-4 border-2 border-amber-300 bg-amber-50">
          <div className="flex items-start gap-3">
            <ShieldAlert className="w-6 h-6 text-amber-600 flex-shrink-0" />
            <div className="flex-1 min-w-0">
              <p className="font-semibold text-gray-800">
                {tempPassword.isNew ? 'Usuario creado' : 'Contraseña restablecida'}: {tempPassword.email}
              </p>
              <p className="text-sm text-gray-700 mt-1">
                Contraseña temporal (se muestra <b>una sola vez</b>). Entrégala al usuario por un medio seguro;
                al iniciar sesión deberá crear su propia contraseña.
              </p>
              <div className="mt-2 flex items-center gap-2">
                <code className="px-3 py-2 bg-white border rounded font-mono text-lg tracking-wide break-all">{tempPassword.password}</code>
                <button onClick={copyPassword} className="btn-secondary flex items-center gap-1 text-sm">
                  {copied ? <Check className="w-4 h-4" /> : <Copy className="w-4 h-4" />} {copied ? 'Copiada' : 'Copiar'}
                </button>
              </div>
            </div>
            <button onClick={() => setTempPassword(null)} title="Cerrar"><X className="w-5 h-5" /></button>
          </div>
        </div>
      )}

      {/* ── EMPRESA Y LICENCIA ── */}
      <section className="card p-4 space-y-3">
        <div className="flex flex-wrap items-center justify-between gap-3">
          <div className="flex items-center gap-2">
            <Building2 className="w-5 h-5 text-purple-600" />
            {isSuperadmin ? (
              <select value={selectedOrgId ?? ''} onChange={(e) => setSelectedOrgId(e.target.value)} className="input-field py-1">
                {orgs.map((o) => <option key={o.id} value={o.id}>{o.name}{o.is_active ? '' : ' (inactiva)'}</option>)}
              </select>
            ) : (
              <span className="font-semibold text-gray-800">{org?.name}</span>
            )}
          </div>
          {isSuperadmin && (
            <div className="flex gap-2">
              {org && (
                <button onClick={() => setOrgForm({ id: org.id, name: org.name, maxUsers: org.max_users, modules: org.modules, isActive: org.is_active })}
                  className="btn-secondary text-sm flex items-center gap-1"><Pencil className="w-4 h-4" /> Licencia</button>
              )}
              <button onClick={() => setOrgForm({ id: null, name: '', maxUsers: 5, modules: ['prendas'], isActive: true })}
                className="btn-secondary text-sm flex items-center gap-1"><Plus className="w-4 h-4" /> Empresa</button>
            </div>
          )}
        </div>

        {org && (
          <div className="flex flex-wrap gap-4 text-sm">
            <span className={`font-semibold ${seatsFull ? 'text-red-600' : 'text-gray-800'}`}>
              {org.active_users} de {org.max_users} usuarios activos
            </span>
            <span className="text-gray-600">Módulos contratados: {org.modules.map((m) => moduleLabels[m]).join(', ')}</span>
            {seatsFull && <span className="text-red-600">Licencia completa: desactiva un usuario o solicita ampliarla.</span>}
          </div>
        )}

        {orgForm && (
          <div className="border-t pt-3 grid gap-3 sm:grid-cols-2">
            <label className="text-sm text-gray-700">Nombre
              <input value={orgForm.name} onChange={(e) => setOrgForm({ ...orgForm, name: e.target.value })} className="input-field mt-1" />
            </label>
            <label className="text-sm text-gray-700">Usuarios contratados
              <input type="number" min={1} value={orgForm.maxUsers}
                onChange={(e) => setOrgForm({ ...orgForm, maxUsers: Math.max(1, Number(e.target.value)) })} className="input-field mt-1" />
            </label>
            <div className="text-sm text-gray-700">Módulos contratados
              <ModuleChecks value={orgForm.modules} options={ALL_MODULES} onChange={(m) => setOrgForm({ ...orgForm, modules: m })} />
            </div>
            <label className="text-sm text-gray-700 flex items-center gap-2">
              <input type="checkbox" checked={orgForm.isActive} onChange={(e) => setOrgForm({ ...orgForm, isActive: e.target.checked })} />
              Empresa activa (si se desactiva, ningún usuario de la empresa tiene acceso)
            </label>
            <div className="sm:col-span-2 flex gap-2">
              <button onClick={handleSaveOrg} disabled={busy === 'org' || !orgForm.name.trim() || orgForm.modules.length === 0} className="btn-primary text-sm disabled:opacity-50">Guardar</button>
              <button onClick={() => setOrgForm(null)} className="btn-secondary text-sm">Cancelar</button>
            </div>
          </div>
        )}
      </section>

      {/* ── ALTA DE USUARIO ── */}
      {org && (
        <section className="card p-4 space-y-3">
          <div className="flex items-center justify-between">
            <h2 className="font-semibold text-gray-800">Dar de alta usuario</h2>
            {!showNewUser && (
              <button onClick={() => { setShowNewUser(true); setNewModules(assignableModules.slice(0, 1)) }}
                disabled={seatsFull || assignableModules.length === 0}
                className="btn-primary text-sm flex items-center gap-1 disabled:opacity-50"
                title={seatsFull ? 'Licencia completa' : ''}>
                <Plus className="w-4 h-4" /> Nuevo usuario
              </button>
            )}
          </div>
          {showNewUser && (
            <div className="grid gap-3 sm:grid-cols-2">
              <label className="text-sm text-gray-700">Correo
                <input type="email" value={newEmail} onChange={(e) => setNewEmail(e.target.value)} className="input-field mt-1" placeholder="nombre@empresa.com" />
              </label>
              <label className="text-sm text-gray-700">Rol
                <select value={newRole} onChange={(e) => setNewRole(e.target.value as UserRole)} className="input-field mt-1">
                  {ASSIGNABLE_ROLES.map((r) => <option key={r} value={r}>{roleBadges[r].label}</option>)}
                </select>
              </label>
              <div className="text-sm text-gray-700">Módulos
                <ModuleChecks value={newModules} options={assignableModules} onChange={setNewModules} />
              </div>
              {orgTeams.length > 0 && (
                <label className="text-sm text-gray-700">Equipo (opcional)
                  <select value={newTeamId} onChange={(e) => setNewTeamId(e.target.value)} className="input-field mt-1">
                    <option value="">Sin equipo</option>
                    {orgTeams.map((t) => <option key={t.id} value={t.id}>{t.name}</option>)}
                  </select>
                </label>
              )}
              <p className="sm:col-span-2 text-xs text-gray-500">
                Se generará una contraseña temporal. El usuario deberá cambiarla en su primer acceso; nadie más conocerá su contraseña definitiva.
              </p>
              <div className="sm:col-span-2 flex gap-2">
                <button onClick={handleCreateUser} disabled={busy === 'new-user' || !newEmail.trim() || newModules.length === 0}
                  className="btn-primary text-sm flex items-center gap-1 disabled:opacity-50">
                  {busy === 'new-user' && <Loader2 className="w-4 h-4 animate-spin" />} Crear usuario
                </button>
                <button onClick={() => setShowNewUser(false)} className="btn-secondary text-sm">Cancelar</button>
              </div>
            </div>
          )}
        </section>
      )}

      {/* ── USUARIOS ── */}
      <section className="space-y-3">
        <h2 className="text-lg font-bold text-gray-800">Usuarios ({orgUsers.length})</h2>
        {orgUsers.length === 0 && <div className="card p-6 text-center text-gray-600">Sin usuarios en esta empresa</div>}
        {orgUsers.map((u) => {
          const badge = roleBadges[u.role] ?? roleBadges.operador
          const isMe = u.id === me?.id
          const disabled = !u.can_manage || busy === u.id
          return (
            <div key={u.id} className={`card p-4 flex flex-col lg:flex-row lg:items-center gap-3 ${u.is_active ? '' : 'opacity-60'}`}>
              <div className="flex-1 min-w-0">
                <div className="font-medium text-gray-800 break-words">{u.email}{isMe && ' (tú)'}</div>
                <div className="flex items-center gap-2 mt-1 flex-wrap text-xs">
                  <span className={`px-2 py-0.5 rounded-full font-medium ${badge.color}`}>{badge.label}</span>
                  {u.modules.map((m) => <span key={m} className="px-2 py-0.5 rounded-full bg-blue-50 text-blue-700">{moduleLabels[m]}</span>)}
                  {!u.is_active && <span className="px-2 py-0.5 rounded-full bg-gray-200 text-gray-700" title={u.deactivation_reason ?? ''}>Desactivado</span>}
                  {u.must_change_password && <span className="px-2 py-0.5 rounded-full bg-amber-100 text-amber-800">Contraseña temporal</span>}
                  {u.locked_until && (
                    <span className="px-2 py-0.5 rounded-full bg-red-100 text-red-700 flex items-center gap-1">
                      <Lock className="w-3 h-3" /> Bloqueado hasta {new Date(u.locked_until).toLocaleTimeString('es-MX', { hour: '2-digit', minute: '2-digit' })}
                    </span>
                  )}
                </div>
                <div className="text-xs text-gray-400 mt-1">
                  Último acceso: {u.last_login_at ? new Date(u.last_login_at).toLocaleString('es-MX') : 'nunca'}
                  {u.password_changed_at && ` · Contraseña cambiada: ${new Date(u.password_changed_at).toLocaleDateString('es-MX')}`}
                </div>
              </div>

              {u.can_manage ? (
                <div className="flex flex-wrap items-center gap-2">
                  <select value={u.role} disabled={disabled} title="Rol"
                    onChange={(e) => run(u.id, () => userService.updateUserRole(u.id, e.target.value as UserRole), 'Rol actualizado')}
                    className="input-field text-sm py-1">
                    {ASSIGNABLE_ROLES.map((r) => <option key={r} value={r}>{roleBadges[r].label}</option>)}
                  </select>
                  <ModuleChecks value={u.modules} options={assignableModules} disabled={disabled}
                    onChange={(m) => m.length > 0 && run(u.id, () => userService.updateUserModules(u.id, m), 'Módulos actualizados')} />
                  {orgTeams.length > 0 && (
                    <select value={u.team_id ?? ''} disabled={disabled} title="Equipo"
                      onChange={(e) => run(u.id, () => userService.assignUserToTeam(u.id, e.target.value || null), 'Equipo actualizado')}
                      className="input-field text-sm py-1">
                      <option value="">Sin equipo</option>
                      {orgTeams.map((t) => <option key={t.id} value={t.id}>{t.name}</option>)}
                    </select>
                  )}
                  <button onClick={() => handleResetPassword(u)} disabled={disabled} className="p-2 text-blue-600 hover:bg-blue-50 rounded-lg disabled:opacity-50" title="Restablecer contraseña">
                    <KeyRound className="w-4 h-4" />
                  </button>
                  {u.locked_until && (
                    <button onClick={() => handleUnlock(u)} disabled={disabled} className="p-2 text-amber-600 hover:bg-amber-50 rounded-lg" title="Desbloquear cuenta">
                      <Unlock className="w-4 h-4" />
                    </button>
                  )}
                  <button onClick={() => handleToggleActive(u)} disabled={disabled}
                    className={`p-2 rounded-lg disabled:opacity-50 ${u.is_active ? 'text-red-600 hover:bg-red-50' : 'text-green-600 hover:bg-green-50'}`}
                    title={u.is_active ? 'Desactivar usuario' : 'Reactivar usuario'}>
                    {busy === u.id ? <Loader2 className="w-4 h-4 animate-spin" /> : u.is_active ? <UserX className="w-4 h-4" /> : <UserCheck className="w-4 h-4" />}
                  </button>
                </div>
              ) : (
                <span className="text-xs text-gray-400">{isMe ? 'Tu cuenta' : 'Lo administra otro módulo'}</span>
              )}
            </div>
          )
        })}
      </section>

      {/* ── EQUIPOS (agrupador interno, opcional) ── */}
      {org && (
        <section className="card p-4 space-y-3">
          <h2 className="font-semibold text-gray-800">Equipos de {org.name} <span className="text-xs font-normal text-gray-500">(opcional: plantas o áreas)</span></h2>
          <div className="flex flex-wrap gap-2">
            {orgTeams.length === 0 && <span className="text-sm text-gray-400">Sin equipos</span>}
            {orgTeams.map((t) => (
              <span key={t.id} className="px-3 py-1 rounded-full bg-purple-50 text-purple-700 text-sm flex items-center gap-1">
                {t.name}
                {isSuperadmin && (
                  <button onClick={() => window.confirm(`¿Eliminar el equipo "${t.name}"? Solo es posible si no tiene prendas ni equipos.`) &&
                    run(t.id, () => userService.deleteTeam(t.id), 'Equipo eliminado')} title="Eliminar equipo">
                    <Trash2 className="w-3 h-3" />
                  </button>
                )}
              </span>
            ))}
          </div>
          <div className="flex gap-2">
            <input value={newTeamName} onChange={(e) => setNewTeamName(e.target.value)} placeholder="Nombre del equipo" className="input-field text-sm" />
            <button disabled={!newTeamName.trim() || busy === 'team'} className="btn-secondary text-sm disabled:opacity-50"
              onClick={() => run('team', async () => { await userService.createTeam(newTeamName.trim(), undefined, selectedOrgId); setNewTeamName('') }, 'Equipo creado')}>
              Agregar
            </button>
          </div>
        </section>
      )}

      <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-4">
        {(['administrador', 'jefe', 'supervisor', 'operador'] as const).map((r) => (
          <div key={r} className="card p-4">
            <div className={`inline-block px-3 py-1 rounded-full text-sm font-medium mb-2 ${roleBadges[r].color}`}>{roleBadges[r].label}</div>
            <p className="text-sm text-gray-600">{roleDescriptions[r]}</p>
          </div>
        ))}
      </div>
    </div>
  )
}

export default AdminUsers
