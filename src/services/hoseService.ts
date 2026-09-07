import { supabase } from '../lib/supabase'
import { MAX_HOSE_CYCLES } from '../lib/hoseLifeStatus'
import type {
  Equipment,
  EquipmentInsert,
  Hose,
  HoseAction,
  HoseActionType,
  HosePosition,
  HosePositionWithDetails,
} from '../types'

export const hoseService = {
  // Obtener todos los equipos
  async getAllEquipment(): Promise<Equipment[]> {
    const { data, error } = await supabase
      .from('equipment')
      .select('*')
      .order('created_at', { ascending: false })

    if (error) throw error
    return data || []
  },

  async getEquipmentById(id: string): Promise<Equipment | null> {
    const { data, error } = await supabase
      .from('equipment')
      .select('*')
      .eq('id', id)
      .single()

    if (error && error.code !== 'PGRST116') throw error
    return data || null
  },

  // Crear equipo (siembra sus 5 posiciones/mangueras vía RPC)
  async createEquipment(equipment: EquipmentInsert): Promise<Equipment> {
    const { data, error } = await supabase
      .rpc('create_equipment', {
        p_code: equipment.code,
        p_name: equipment.name,
        p_calibers: equipment.calibers ?? ['1', '2', '3', '4', '5'],
        p_team_id: equipment.team_id ?? null,
        p_lengths: equipment.lengths ?? null,
      })

    if (error) throw error
    return data
  },

  // Editar código/nombre del equipo
  async updateEquipment(id: string, updates: { code?: string; name?: string }): Promise<Equipment> {
    const { data, error } = await supabase
      .from('equipment')
      .update({ ...updates, updated_at: new Date().toISOString() })
      .eq('id', id)
      .select()
      .single()

    if (error) throw error
    return data
  },

  // Editar el calibre/longitud/etiqueta de una posición
  async updatePosition(id: string, updates: { caliber?: string; length?: string; label?: string }): Promise<HosePosition> {
    const { data, error } = await supabase
      .from('hose_positions')
      .update(updates)
      .eq('id', id)
      .select()
      .single()

    if (error) throw error
    return data
  },

  // Eliminar equipo (elimina en cascada sus posiciones, mangueras e historial)
  async deleteEquipment(id: string): Promise<void> {
    const { error } = await supabase
      .from('equipment')
      .delete()
      .eq('id', id)

    if (error) throw error
  },

  // Posiciones de un equipo, con su manguera activa e historial embebidos
  async getPositionsByEquipment(equipmentId: string): Promise<HosePositionWithDetails[]> {
    const { data: positions, error: positionsError } = await supabase
      .from('hose_positions')
      .select('*')
      .eq('equipment_id', equipmentId)
      .order('caliber', { ascending: true })

    if (positionsError) throw positionsError
    if (!positions || positions.length === 0) return []

    const positionIds = positions.map((p: HosePosition) => p.id)
    const { data: hoses, error: hosesError } = await supabase
      .from('hoses')
      .select('*')
      .in('position_id', positionIds)
      .order('installed_at', { ascending: false })

    if (hosesError) throw hosesError

    return positions.map((position: HosePosition) => {
      const history = (hoses || []).filter((h: Hose) => h.position_id === position.id)
      return {
        ...position,
        activeHose: history.find((h: Hose) => h.status === 'activa'),
        history,
      }
    })
  },

  // Una posición con su equipo, manguera activa e historial
  async getPositionById(positionId: string): Promise<(HosePositionWithDetails & { equipment?: Equipment }) | null> {
    const { data: position, error: positionError } = await supabase
      .from('hose_positions')
      .select('*')
      .eq('id', positionId)
      .single()

    if (positionError && positionError.code !== 'PGRST116') throw positionError
    if (!position) return null

    const equipment = await this.getEquipmentById(position.equipment_id)

    const { data: hoses, error: hosesError } = await supabase
      .from('hoses')
      .select('*')
      .eq('position_id', positionId)
      .order('installed_at', { ascending: false })

    if (hosesError) throw hosesError

    return {
      ...position,
      equipment: equipment || undefined,
      activeHose: (hoses || []).find((h: Hose) => h.status === 'activa'),
      history: hoses || [],
    }
  },

  async getHoseById(id: string): Promise<Hose | null> {
    const { data, error } = await supabase
      .from('hoses')
      .select('*')
      .eq('id', id)
      .single()

    if (error && error.code !== 'PGRST116') throw error
    return data || null
  },

  async getHoseByShortCode(shortCode: string): Promise<Hose | null> {
    const normalized = shortCode.trim().toUpperCase()
    if (!normalized) return null
    const { data, error } = await supabase
      .from('hoses')
      .select('*')
      .eq('short_code', normalized)
      .single()

    if (error && error.code !== 'PGRST116') throw error
    return data || null
  },

  async getHoseActions(hoseId: string): Promise<HoseAction[]> {
    const { data, error } = await supabase
      .from('hose_actions')
      .select('*')
      .eq('hose_id', hoseId)
      .order('created_at', { ascending: false })

    if (error) throw error
    return data || []
  },

  // Registrar acción sobre una manguera (uso/inspección/baja manual)
  async registerHoseAction(
    hoseId: string,
    actionType: HoseActionType,
    options?: { notes?: string; performedBy?: string }
  ): Promise<HoseAction> {
    const performedBy = options?.performedBy?.trim()
    if (!performedBy) {
      throw new Error('El campo RESPONSABLE es obligatorio')
    }

    const current = await this.getHoseById(hoseId)
    if (!current) throw new Error('Manguera no encontrada')

    let cycleAfter = current.current_cycle
    if (actionType === 'uso') {
      cycleAfter = Math.min(current.current_cycle + 1, MAX_HOSE_CYCLES)
      await supabase
        .from('hoses')
        .update({ current_cycle: cycleAfter, updated_at: new Date().toISOString() })
        .eq('id', hoseId)
    } else if (actionType === 'baja') {
      await supabase
        .from('hoses')
        .update({
          status: 'baja',
          baja_reason: options?.notes,
          baja_date: new Date().toISOString(),
          updated_at: new Date().toISOString(),
        })
        .eq('id', hoseId)
    }

    const { data, error } = await supabase
      .from('hose_actions')
      .insert({
        hose_id: hoseId,
        action_type: actionType,
        cycle_after: cycleAfter,
        notes: options?.notes,
        performed_by: performedBy,
      })
      .select()
      .single()

    if (error) throw error
    return data
  },

  // Registrar un ciclo de uso a varias mangueras a la vez (ej. las 5 de un equipo)
  async registerBulkUse(hoseIds: string[], options: { notes?: string; performedBy?: string }): Promise<HoseAction[]> {
    const performedBy = options?.performedBy?.trim()
    if (!performedBy) {
      throw new Error('El campo RESPONSABLE es obligatorio')
    }

    return Promise.all(hoseIds.map((hoseId) => this.registerHoseAction(hoseId, 'uso', options)))
  },

  // Reemplazar la manguera activa de una posición (vía RPC, atómico)
  async replaceHose(positionId: string, reason: string, performedBy: string): Promise<Hose> {
    if (!performedBy?.trim()) {
      throw new Error('El campo RESPONSABLE es obligatorio')
    }

    const { data, error } = await supabase
      .rpc('replace_hose', {
        p_position_id: positionId,
        p_reason: reason,
        p_performed_by: performedBy,
      })

    if (error) throw error
    return data
  },

  // Búsqueda por short code, código de equipo o nombre
  async search(term: string): Promise<Equipment[]> {
    const normalized = term.trim()
    if (!normalized) return []

    const { data, error } = await supabase
      .from('equipment')
      .select('*')
      .or(`code.ilike.%${normalized}%,name.ilike.%${normalized}%`)
      .order('created_at', { ascending: false })

    if (error) throw error
    return data || []
  },
}
