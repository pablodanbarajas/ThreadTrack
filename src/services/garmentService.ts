import { supabase } from '../lib/supabase'
import type { Garment, GarmentInsert, GarmentUpdate, GarmentAction, ActionType, InspectionResult } from '../types'

export const garmentService = {
  // Obtener todas las prendas (incluyendo bajas para estadísticas)
  async getAll(): Promise<Garment[]> {
    const { data, error } = await supabase
      .from('garments')
      .select('*')
      .order('created_at', { ascending: false })

    if (error) throw error
    return data || []
  },

  // Obtener prendas dadas de baja
  async getBajas(): Promise<Garment[]> {
    const { data, error } = await supabase
      .from('garments')
      .select('*')
      .eq('status', 'baja')
      .order('baja_date', { ascending: false })

    if (error) throw error
    return data || []
  },

  // Obtener prenda por código
  async getByCode(code: string): Promise<Garment | null> {
    const { data, error } = await supabase
      .from('garments')
      .select('*')
      .eq('code', code)
      .single()

    if (error && error.code !== 'PGRST116') throw error
    return data
  },

  // Obtener prenda por ID
  async getById(id: string): Promise<Garment | null> {
    const { data, error } = await supabase
      .from('garments')
      .select('*')
      .eq('id', id)
      .single()

    if (error) throw error
    return data
  },

  // Crear nueva prenda
  async create(garment: GarmentInsert): Promise<Garment> {
    const { data, error } = await supabase
      .rpc('create_garment', {
        p_code: garment.code,
        p_name: garment.name,
        p_description: garment.description ?? null,
        p_client_name: garment.client_name ?? null,
        p_client_phone: garment.client_phone ?? null,
        p_notes: garment.notes ?? null,
      })

    if (error) throw error
    return data as Garment
  },

  // Actualizar prenda
  async update(id: string, updates: GarmentUpdate): Promise<Garment> {
    const { data, error } = await supabase
      .from('garments')
      .update({ ...updates, updated_at: new Date().toISOString() })
      .eq('id', id)
      .select()
      .single()

    if (error) throw error
    return data
  },

  // Registrar acción (lavado, esterilización, etc.)
  async registerAction(
    garmentId: string, 
    actionType: ActionType, 
    options?: { 
      result?: InspectionResult
      notes?: string
      performedBy?: string 
    }
  ): Promise<GarmentAction> {
    // Obtener estado actual
    const current = await this.getById(garmentId)
    if (!current) throw new Error('Prenda no encontrada')

    // Determinar nuevo estado
    let newStatus = actionType as string
    if (actionType === 'inspeccion' && options?.result) {
      if (options.result === 'aprobado') {
        newStatus = 'disponible'
      } else {
        newStatus = options.result // 'reparacion' o 'baja'
      }
    }

    // Actualizar estado de la prenda
    const updateData: GarmentUpdate = { status: newStatus as any }
    if (newStatus === 'baja') {
      updateData.baja_reason = options?.notes
      updateData.baja_date = new Date().toISOString()
    }
    await this.update(garmentId, updateData)

    // Registrar la acción
    const { data, error } = await supabase
      .from('garment_actions')
      .insert({
        garment_id: garmentId,
        action_type: actionType,
        result: options?.result,
        notes: options?.notes,
        performed_by: options?.performedBy
      })
      .select()
      .single()

    if (error) throw error

    // Registrar en movimientos también
    await supabase.from('movements').insert({
      garment_id: garmentId,
      previous_status: current.status,
      new_status: newStatus,
      notes: options?.notes
    })

    return data
  },

  // Obtener historial de acciones de una prenda
  async getActions(garmentId: string): Promise<GarmentAction[]> {
    const { data, error } = await supabase
      .from('garment_actions')
      .select('*')
      .eq('garment_id', garmentId)
      .order('created_at', { ascending: false })

    if (error) throw error
    return data || []
  },

  // Eliminar prenda
  async delete(id: string): Promise<void> {
    const { error, count } = await supabase
      .from('garments')
      .delete({ count: 'exact' })
      .eq('id', id)

    if (error) throw error
    if (count === 0) throw new Error('No tienes permisos para eliminar esta prenda o ya no existe.')
  },

  // Obtener estadísticas
  async getStats(): Promise<{ 
    total: number
    disponible: number
    lavado: number
    esterilizacion: number
    inspeccion: number
    reparacion: number
    baja: number 
  }> {
    const { data, error } = await supabase
      .from('garments')
      .select('status')

    if (error) throw error

    const stats = {
      total: data?.filter(g => g.status !== 'baja').length || 0,
      disponible: data?.filter(g => g.status === 'disponible').length || 0,
      lavado: data?.filter(g => g.status === 'lavado').length || 0,
      esterilizacion: data?.filter(g => g.status === 'esterilizacion').length || 0,
      inspeccion: data?.filter(g => g.status === 'inspeccion').length || 0,
      reparacion: data?.filter(g => g.status === 'reparacion').length || 0,
      baja: data?.filter(g => g.status === 'baja').length || 0
    }

    return stats
  },

  // Buscar prendas
  async search(term: string): Promise<Garment[]> {
    const { data, error } = await supabase
      .from('garments')
      .select('*')
      .neq('status', 'baja')
      .or(`code.ilike.%${term}%,name.ilike.%${term}%,client_name.ilike.%${term}%`)
      .order('created_at', { ascending: false })

    if (error) throw error
    return data || []
  }
}
