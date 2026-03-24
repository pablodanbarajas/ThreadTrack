import { supabase } from '../lib/supabase'
import type { UserRole } from '../contexts/AuthContext'

export interface UserProfile {
  id: string
  email: string
  role: UserRole
  created_at: string
  updated_at: string
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

  // Crear usuario (retorna instrucciones por ahora)
  async createUser(_email: string, _password: string, _role: UserRole) {
    // Por ahora, retornamos instrucciones
    // Para producción, implementar función Edge en Supabase
    console.warn('Crear usuarios debe hacerse vía función Edge de Supabase')
    return {
      success: false,
      message: 'Usa la función Edge create-user en Supabase'
    }
  },

  // Eliminar usuario
  async deleteUser(userId: string): Promise<boolean> {
    try {
      // Primero eliminar de user_profiles (cascada debería eliminar de auth.users)
      const { error } = await supabase
        .from('user_profiles')
        .delete()
        .eq('id', userId)

      if (error) {
        throw error
      }

      return true
    } catch (error) {
      console.error('Error eliminando usuario:', error)
      throw error
    }
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
}
