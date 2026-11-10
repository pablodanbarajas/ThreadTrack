import { supabase } from '../lib/supabase'
import type { Garment, GarmentInsert, GarmentUpdate, GarmentAction, ActionType, InspectionResult, AuditLogEntry } from '../types'

const normalizeGarment = (garment: any): Garment => ({
  ...garment,
  status: garment.status === 'esterilizacion' ? 'lavado' : garment.status,
})

export const garmentService = {
  // Obtener todas las prendas (incluyendo bajas para estadísticas)
  async getAll(): Promise<Garment[]> {
    const { data, error } = await supabase
      .from('garments')
      .select('*')
      .is('archived_at', null)
      .order('created_at', { ascending: false })

    if (error) throw error
    return (data || []).map(normalizeGarment)
  },

  // Obtener prendas dadas de baja
  async getBajas(): Promise<Garment[]> {
    const { data, error } = await supabase
      .from('garments')
      .select('*')
      .eq('status', 'baja')
      .is('archived_at', null)
      .order('baja_date', { ascending: false })

    if (error) throw error
    return (data || []).map(normalizeGarment)
  },

  // Obtener prenda por código
  async getByCode(code: string): Promise<Garment | null> {
    const { data, error } = await supabase
      .from('garments')
      .select('*')
      .eq('code', code)
      .single()

    if (error && error.code !== 'PGRST116') throw error
    return data ? normalizeGarment(data) : null
  },

  // Obtener prenda por código corto de respaldo (ej: S1, G12, V3)
  async getByShortCode(shortCode: string): Promise<Garment | null> {
    const normalized = shortCode.trim().toUpperCase()
    if (!normalized) return null
    const { data, error } = await supabase
      .from('garments')
      .select('*')
      .eq('short_code', normalized)
      .single()

    if (error && error.code !== 'PGRST116') throw error
    return data ? normalizeGarment(data) : null
  },

  // Obtener prenda por ID
  async getById(id: string): Promise<Garment | null> {
    const { data, error } = await supabase
      .from('garments')
      .select('*')
      .eq('id', id)
      .single()

    if (error && error.code !== 'PGRST116') throw error
    return data ? normalizeGarment(data) : null
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
        p_team_id: garment.team_id ?? null,
      })

    if (error) throw error
    return normalizeGarment(data)
  },

  // Actualizar datos descriptivos de la prenda (vía RPC; el motivo queda en el audit trail)
  async update(id: string, updates: GarmentUpdate, reason: string): Promise<Garment> {
    if (!reason?.trim()) throw new Error('El MOTIVO DEL CAMBIO es obligatorio')
    if (!updates.name?.trim()) throw new Error('El nombre es obligatorio')

    const { data, error } = await supabase.rpc('update_garment', {
      p_garment_id: id,
      p_name: updates.name,
      p_description: updates.description ?? null,
      p_client_name: updates.client_name ?? null,
      p_client_phone: updates.client_phone ?? null,
      p_notes: updates.notes ?? null,
      p_reason: reason,
    })

    if (error) throw error
    return normalizeGarment(data)
  },

  // Registrar acción (lavado/esterilización, inspección, reparación, baja).
  // El servidor cambia el estado, guarda la acción y el movimiento en una sola
  // transacción, y registra quién la capturó a partir de la sesión.
  async registerAction(
    garmentId: string,
    actionType: ActionType,
    options?: {
      result?: InspectionResult
      notes?: string
      responsible?: string
      performedBy?: string
      signatureToken?: string // requerido para bajas y resultados de inspección
    }
  ): Promise<GarmentAction> {
    const responsible = options?.responsible?.trim() || options?.performedBy?.trim()
    if (!responsible) {
      throw new Error('El campo RESPONSABLE es obligatorio')
    }

    const { data, error } = await supabase.rpc('register_garment_action', {
      p_garment_id: garmentId,
      p_action_type: actionType,
      p_responsible: responsible,
      p_result: options?.result ?? null,
      p_notes: options?.notes ?? null,
      p_signature_token: options?.signatureToken ?? null,
    })

    if (error) throw error
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

  // Archivar prenda. Ya no se borra físicamente: su historial se conserva.
  async archive(id: string, reason: string): Promise<void> {
    if (!reason?.trim()) throw new Error('El MOTIVO es obligatorio')
    const { error } = await supabase.rpc('archive_garment', {
      p_garment_id: id,
      p_reason: reason,
    })
    if (error) throw error
  },

  // Audit trail completo de la prenda (jefe/supervisor/administrador)
  async getAuditTrail(garmentId: string): Promise<AuditLogEntry[]> {
    const { data, error } = await supabase.rpc('get_garment_audit_trail', {
      p_garment_id: garmentId,
    })
    if (error) throw error
    return data || []
  },

  // Obtener estadísticas
  async getStats(): Promise<{ 
    total: number
    disponible: number
    lavado: number
    inspeccion: number
    reparacion: number
    baja: number 
  }> {
    const { data, error } = await supabase
      .from('garments')
      .select('status')
      .is('archived_at', null)

    if (error) throw error

    const stats = {
      total: data?.filter(g => g.status !== 'baja').length || 0,
      disponible: data?.filter(g => g.status === 'disponible').length || 0,
      lavado: data?.filter(g => g.status === 'lavado' || g.status === 'esterilizacion').length || 0,
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
      .is('archived_at', null)
      .or(`code.ilike.%${term}%,name.ilike.%${term}%,client_name.ilike.%${term}%`)
      .order('created_at', { ascending: false })

    if (error) throw error
    return data || []
  }
}
