import { supabase } from '../lib/supabase'
import type { UserRole, AccessModule, AppModule } from '../contexts/AuthContext'
import type { Team, Organization } from '../types'

export interface UserProfile {
  id: string
  email: string
  full_name: string | null
  role: UserRole
  team_id: string | null
  access_module: AccessModule
  modules: AppModule[]
  organization_id: string | null
  organization_name: string | null
  must_change_password: boolean
  password_changed_at: string | null
  can_manage: boolean
  is_active: boolean
  deactivation_reason?: string | null
  locked_until?: string | null
  last_login_at?: string | null
  created_at: string
  updated_at: string
}

// Mensaje de error legible de una Edge Function
async function functionErrorMessage(error: any): Promise<string> {
  try {
    const body = await error?.context?.json?.()
    if (body?.error) return body.error
  } catch {
    /* sin cuerpo */
  }
  return error?.message || 'Error en el servidor'
}

export const userService = {
  // Obtener lista de todos los usuarios
  async getAllUsers(): Promise<UserProfile[]> {
    const { data, error } = await supabase
      .rpc('get_all_users')

    if (error) {
      console.error('Error obteniendo usuarios:', error)
      throw error
    }

    return data || []
  },

  // Actualizar rol de usuario
  async updateUserRole(userId: string, newRole: UserRole): Promise<boolean> {
    const { data, error } = await supabase
      .rpc('update_user_role', {
        user_id: userId,
        new_role: newRole
      })

    if (error) {
      console.error('Error actualizando rol:', error)
      throw error
    }

    return data.success ?? false
  },

  // Nombre completo (nombre impreso en registros y firmas)
  async updateUserFullName(userId: string, fullName: string): Promise<void> {
    const { error } = await supabase.rpc('update_user_full_name', { p_user_id: userId, p_full_name: fullName })
    if (error) throw error
  },

  // El propio usuario registra su nombre si aún no lo tiene
  async setMyFullName(fullName: string): Promise<void> {
    const { error } = await supabase.rpc('set_my_full_name', { p_full_name: fullName })
    if (error) throw error
  },

  // Módulos del usuario (solo dentro de los que administra quien los asigna)
  async updateUserModules(userId: string, modules: AppModule[]): Promise<void> {
    const { error } = await supabase.rpc('update_user_modules', { p_user_id: userId, p_modules: modules })
    if (error) throw error
  },

  // Alta de usuario (Edge Function admin-users): devuelve la contraseña temporal
  async createUser(input: {
    email: string
    fullName: string
    role: Exclude<UserRole, never>
    modules: AppModule[]
    organizationId?: string | null
    teamId?: string | null
  }): Promise<{ userId: string; temporaryPassword: string }> {
    const { data, error } = await supabase.functions.invoke('admin-users', {
      body: {
        action: 'create',
        email: input.email,
        full_name: input.fullName,
        role: input.role,
        modules: input.modules,
        organization_id: input.organizationId ?? null,
        team_id: input.teamId ?? null,
      },
    })
    if (error) throw new Error(await functionErrorMessage(error))
    if (!data?.ok) throw new Error(data?.error || 'No se pudo crear el usuario')
    return { userId: data.user_id, temporaryPassword: data.temporary_password }
  },

  // Restablecer contraseña: el usuario deberá cambiarla en su siguiente acceso
  async resetPassword(userId: string): Promise<string> {
    const { data, error } = await supabase.functions.invoke('admin-users', {
      body: { action: 'reset_password', user_id: userId },
    })
    if (error) throw new Error(await functionErrorMessage(error))
    if (!data?.ok) throw new Error(data?.error || 'No se pudo restablecer la contraseña')
    return data.temporary_password
  },

  // ============================================================
  // Empresas y licencias
  // ============================================================
  async listOrganizations(): Promise<Organization[]> {
    const { data, error } = await supabase.rpc('list_organizations')
    if (error) throw error
    return (data || []).map((o: any) => ({ ...o, active_users: Number(o.active_users) }))
  },

  async saveOrganization(org: {
    id?: string | null
    name: string
    maxUsers: number
    modules: AppModule[]
    isActive: boolean
    reason: string
  }): Promise<void> {
    const { error } = await supabase.rpc('save_organization', {
      p_id: org.id ?? null,
      p_name: org.name,
      p_max_users: org.maxUsers,
      p_modules: org.modules,
      p_is_active: org.isActive,
      p_reason: org.reason,
    })
    if (error) throw error
  },

  // Desactivar / reactivar usuario (bloquea también el login en Supabase Auth)
  async setUserActive(userId: string, active: boolean, reason: string): Promise<void> {
    const { error } = await supabase.rpc('set_user_active', {
      p_user_id: userId,
      p_active: active,
      p_reason: reason,
    })
    if (error) throw error
  },

  // Actualizar módulo asignado a un usuario (prendas/mangueras/ambos)
  async updateUserModule(userId: string, newModule: AccessModule): Promise<boolean> {
    const { data, error } = await supabase
      .rpc('update_user_module', {
        p_user_id: userId,
        p_module: newModule
      })

    if (error) {
      console.error('Error actualizando módulo:', error)
      throw error
    }

    return data.success ?? false
  },

  // Obtener IDs de usuarios asignados a una prenda
  async getGarmentAssignments(garmentId: string): Promise<string[]> {
    const { data, error } = await supabase
      .from('garment_assignments')
      .select('user_id')
      .eq('garment_id', garmentId)
    if (error) throw error
    return (data || []).map((row: any) => row.user_id)
  },

  // Reemplazar el set completo de asignaciones de una prenda
  async setGarmentAssignments(garmentId: string, userIds: string[]): Promise<void> {
    const { error: delError } = await supabase
      .from('garment_assignments')
      .delete()
      .eq('garment_id', garmentId)
    if (delError) throw delError
    if (userIds.length === 0) return
    const { error: insError } = await supabase
      .from('garment_assignments')
      .insert(userIds.map(user_id => ({ garment_id: garmentId, user_id })))
    if (insError) throw insError
  },

  // ============================================================
  // Gestión de equipos
  // ============================================================

  async getTeams(): Promise<Team[]> {
    const { data, error } = await supabase
      .from('teams')
      .select('*')
      .order('name')
    if (error) throw error
    return data || []
  },

  async createTeam(name: string, description?: string, organizationId?: string | null): Promise<Team> {
    const { data, error } = await supabase
      .rpc('create_team', { p_name: name, p_description: description ?? null, p_organization_id: organizationId ?? null })
    if (error) throw error
    return data as Team
  },

  async deleteTeam(teamId: string): Promise<void> {
    const { error } = await supabase
      .rpc('delete_team', { p_team_id: teamId })
    if (error) throw error
  },

  async assignUserToTeam(userId: string, teamId: string | null): Promise<void> {
    const { error } = await supabase
      .rpc('assign_user_to_team', { p_user_id: userId, p_team_id: teamId })
    if (error) throw error
  },
}
