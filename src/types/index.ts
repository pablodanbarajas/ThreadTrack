export type GarmentStatus = 'disponible' | 'lavado' | 'esterilizacion' | 'inspeccion' | 'reparacion' | 'baja'
export type ActionType = 'lavado' | 'esterilizacion' | 'inspeccion' | 'reparacion' | 'baja'
export type InspectionResult = 'aprobado' | 'reparacion' | 'baja'

export interface Garment {
  id: string
  code: string
  name: string
  description?: string
  status: GarmentStatus
  client_name?: string
  client_phone?: string
  notes?: string
  baja_reason?: string
  baja_date?: string
  created_at: string
  updated_at: string
}

export interface GarmentAction {
  id: string
  garment_id: string
  action_type: ActionType
  result?: InspectionResult
  notes?: string
  performed_by?: string
  created_at: string
}

export interface Movement {
  id: string
  garment_id: string
  previous_status?: string
  new_status: string
  notes?: string
  created_at: string
}

export interface GarmentInsert {
  code: string
  name: string
  description?: string
  status?: GarmentStatus
  client_name?: string
  client_phone?: string
  notes?: string
}

export interface GarmentUpdate {
  name?: string
  description?: string
  status?: GarmentStatus
  client_name?: string
  client_phone?: string
  notes?: string
  baja_reason?: string
  baja_date?: string
}
