import { validateNewGarmentCode } from '../lib/garmentCodeParser'
import { supabase } from '../lib/supabase'
import type {
  Garment, GarmentInsert, GarmentUpdate, GarmentAction, ActionType, InspectionResult, AuditLogEntry,
  GarmentListItem, GarmentListFilters, GarmentStats, Paged,
} from '../types'

const normalizeGarment = (garment: any): Garment => ({
  ...garment,
  status: garment.status === 'esterilizacion' ? 'lavado' : garment.status,
})

export const garmentService = {
  // ------------------------------------------------------------
  // Listas paginadas (filtros, contadores y total calculados en la base)
  // ------------------------------------------------------------
  async list(filters: GarmentListFilters, page: number, pageSize: number): Promise<Paged<GarmentListItem>> {
    const { data, error } = await supabase.rpc('list_garments', {
      p_search: filters.search?.trim() || null,
      p_status: filters.status || null,
      p_date_from: filters.dateFrom || null,
      p_date_to: filters.dateTo || null,
      p_garment_type: filters.garmentType || null,
      p_color: filters.color || null,
      p_size: filters.size || null,
      p_batch: filters.batch || null,
      p_team_id: filters.teamId || null,
      p_life: filters.life && filters.life.length ? filters.life : null,
      p_limit: pageSize,
      p_offset: (page - 1) * pageSize,
      p_client: filters.client?.trim() || null,
      p_idle_days: filters.idleDays || null,
      p_sort: filters.sort || 'recientes',
    })
    if (error) throw error
    const rows = (data || []).map((r: any) => ({
      ...normalizeGarment(r),
      wash_count: Number(r.wash_count ?? 0),
      repair_count: Number(r.repair_count ?? 0),
    })) as GarmentListItem[]
    return { rows, total: rows.length ? Number((data as any[])[0].total_count) : 0 }
  },

  /** Todas las prendas que cumplen los filtros (para exportar), opcionalmente con su historial */
  async listAll(filters: GarmentListFilters, withActions = false): Promise<GarmentListItem[]> {
    const all: GarmentListItem[] = []
    for (let page = 1; ; page++) {
      const { rows, total } = await this.list(filters, page, 1000)
      all.push(...rows)
      if (all.length >= total || rows.length === 0) break
    }
    if (withActions && all.length) {
      const byGarment = new Map<string, GarmentAction[]>()
      for (let i = 0; i < all.length; i += 200) {
        const ids = all.slice(i, i + 200).map((g) => g.id)
        for (let from = 0; ; from += 1000) {
          const { data, error } = await supabase
            .from('garment_actions').select('*').in('garment_id', ids)
            .order('created_at', { ascending: false }).range(from, from + 999)
          if (error) throw error
          for (const a of data || []) {
            const list = byGarment.get(a.garment_id) ?? []
            list.push(a)
            byGarment.set(a.garment_id, list)
          }
          if (!data || data.length < 1000) break
        }
      }
      for (const g of all) g.actions = byGarment.get(g.id) ?? []
    }
    return all
  },

  /** De una lista de códigos, los que ya existen (para validar una importación) */
  async existingCodes(codes: string[]): Promise<Set<string>> {
    const found = new Set<string>()
    for (let i = 0; i < codes.length; i += 1000) {
      const { data, error } = await supabase.rpc('existing_garment_codes', { p_codes: codes.slice(i, i + 1000) })
      if (error) throw error
      for (const c of (data || []) as string[]) found.add(c)
    }
    return found
  },

  async stats(): Promise<GarmentStats> {
    const { data, error } = await supabase.rpc('garment_stats')
    if (error) throw error
    return {
      active: 0, disponible: 0, lavado: 0, inspeccion: 0, reparacion: 0, baja: 0,
      ...(data || {}),
      life: { verde: 0, amarillo: 0, naranja: 0, rojo: 0, ...(data?.life || {}) },
    }
  },

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
    const check = validateNewGarmentCode(garment.code.trim().toUpperCase())
    if (!check.valid) throw new Error(check.error)
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
      signatureToken?: string // requerido para bajas y resultados de inspección
    }
  ): Promise<GarmentAction> {
    const { data, error } = await supabase.rpc('register_garment_action', {
      p_garment_id: garmentId,
      p_action_type: actionType,
      p_responsible: null, // lo fija la base: usuario en sesión
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
