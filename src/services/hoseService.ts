import { supabase } from '../lib/supabase'
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
  // Equipos paginados con posiciones y mangueras en una sola consulta
  async listEquipment(search: string, page: number, pageSize: number): Promise<{ rows: (Equipment & { positions: HosePositionWithDetails[] })[]; total: number }> {
    const { data, error } = await supabase.rpc('list_equipment', {
      p_search: search.trim() || null,
      p_limit: pageSize,
      p_offset: (page - 1) * pageSize,
    })
    if (error) throw error
    const rows = (data || []).map((r: any) => ({ ...r, positions: (r.positions || []) as HosePositionWithDetails[] }))
    return { rows, total: rows.length ? Number((data as any[])[0].total_count) : 0 }
  },

  async listAllEquipment(search = ''): Promise<(Equipment & { positions: HosePositionWithDetails[] })[]> {
    const all: (Equipment & { positions: HosePositionWithDetails[] })[] = []
    for (let page = 1; ; page++) {
      const { rows, total } = await this.listEquipment(search, page, 500)
      all.push(...rows)
      if (all.length >= total || rows.length === 0) break
    }
    return all
  },

  // Obtener todos los equipos
  async getAllEquipment(): Promise<Equipment[]> {
    const { data, error } = await supabase
      .from('equipment')
      .select('*')
      .is('archived_at', null)
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

  // Editar código/nombre del equipo (vía RPC, motivo obligatorio)
  async updateEquipment(id: string, updates: { code?: string; name?: string }, reason: string): Promise<Equipment> {
    if (!reason?.trim()) throw new Error('El MOTIVO DEL CAMBIO es obligatorio')
    const { data, error } = await supabase.rpc('update_equipment', {
      p_equipment_id: id,
      p_code: updates.code ?? null,
      p_name: updates.name ?? null,
      p_reason: reason,
    })

    if (error) throw error
    return data
  },

  // Editar el calibre/longitud/etiqueta de una posición (vía RPC, motivo obligatorio)
  async updatePosition(
    id: string,
    updates: { caliber?: string; length?: string; label?: string },
    reason: string
  ): Promise<HosePosition> {
    if (!reason?.trim()) throw new Error('El MOTIVO DEL CAMBIO es obligatorio')
    const { data, error } = await supabase.rpc('update_hose_position', {
      p_position_id: id,
      p_caliber: updates.caliber ?? null,
      p_length: updates.length ?? null,
      p_label: updates.label ?? null,
      p_reason: reason,
    })

    if (error) throw error
    return data
  },

  // Archivar equipo. Ya no se borra: sus mangueras e historial se conservan.
  async archiveEquipment(id: string, reason: string): Promise<void> {
    if (!reason?.trim()) throw new Error('El MOTIVO es obligatorio')
    const { error } = await supabase.rpc('archive_equipment', {
      p_equipment_id: id,
      p_reason: reason,
    })

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

  // Registrar acción sobre una manguera (uso/inspección/baja manual).
  // El ciclo se incrementa en el servidor con la fila bloqueada, así dos
  // escaneos simultáneos no pierden conteos.
  async registerHoseAction(
    hoseId: string,
    actionType: Exclude<HoseActionType, 'reemplazo'>,
    options?: { notes?: string; signatureToken?: string }
  ): Promise<HoseAction> {
    const { data, error } = await supabase.rpc('register_hose_action', {
      p_hose_id: hoseId,
      p_action_type: actionType,
      p_responsible: null, // lo fija la base
      p_notes: options?.notes ?? null,
      p_signature_token: options?.signatureToken ?? null,
    })

    if (error) throw error
    return data
  },

  // Registrar un ciclo de uso a varias mangueras a la vez (todo o nada)
  async registerBulkUse(hoseIds: string[], options: { notes?: string }): Promise<HoseAction[]> {
    const { data, error } = await supabase.rpc('register_bulk_hose_use', {
      p_hose_ids: hoseIds,
      p_responsible: null, // lo fija la base
      p_notes: options?.notes ?? null,
    })

    if (error) throw error
    return data || []
  },

  // Reemplazar la manguera activa de una posición (vía RPC, atómico)
  async replaceHose(positionId: string, reason: string, signatureToken: string): Promise<Hose> {
    const { data, error } = await supabase
      .rpc('replace_hose', {
        p_position_id: positionId,
        p_reason: reason,
        p_performed_by: null, // lo fija la base
        p_signature_token: signatureToken,
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
      .is('archived_at', null)
      .or(`code.ilike.%${normalized}%,name.ilike.%${normalized}%`)
      .order('created_at', { ascending: false })

    if (error) throw error
    return data || []
  },
}
