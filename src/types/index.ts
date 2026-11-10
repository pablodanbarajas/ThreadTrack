export interface Team {
  id: string
  name: string
  description?: string
  organization_id?: string
  created_at: string
}

// Empresa (cliente) con su licencia
export interface Organization {
  id: string
  name: string
  max_users: number
  modules: ('prendas' | 'mangueras')[]
  is_active: boolean
  active_users: number
}

export type GarmentStatus = 'disponible' | 'lavado' | 'inspeccion' | 'reparacion' | 'baja'
export type LegacyActionType = 'esterilizacion'
export type ActionType = 'lavado' | 'inspeccion' | 'reparacion' | 'baja'
export type InspectionResult = 'aprobado' | 'reparacion' | 'baja'
export type DocumentType = 'etiqueta' | 'certificado' | 'factura' | 'otro'

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
  qr_code?: string // URL del QR generada dinámicamente
  short_code?: string // Código corto de respaldo (ej: S1, G12, V3)
  team_id?: string
  archived_at?: string
  archived_by?: string
  archive_reason?: string
  created_at: string
  updated_at: string
}

export interface Document {
  id: string
  garment_id: string
  type: DocumentType
  url: string
  file_name?: string
  created_at: string
  uploaded_by?: string
}

export interface GarmentWithDetails extends Garment {
  documents?: Document[]
  actions?: GarmentAction[]
  movements?: Movement[]
}

export interface GarmentAction {
  id: string
  garment_id: string
  action_type: ActionType | LegacyActionType
  result?: InspectionResult
  notes?: string
  performed_by?: string // responsable físico (lo escribe el usuario)
  recorded_by?: string // usuario autenticado que capturó el registro (lo fija la base)
  recorded_by_email?: string
  signature_id?: string // firma electrónica (bajas y resultados de inspección)
  created_at: string
}

export interface Movement {
  id: string
  garment_id: string
  previous_status?: string
  new_status: string
  notes?: string
  recorded_by?: string
  recorded_by_email?: string
  created_at: string
}

export interface AuditLogEntry {
  id: number
  occurred_at: string
  user_id?: string
  user_email?: string
  user_role?: string
  operation: 'INSERT' | 'UPDATE' | 'DELETE'
  table_name: string
  record_id?: string
  old_data?: Record<string, unknown>
  new_data?: Record<string, unknown>
  changed_fields?: string[]
  reason?: string
}

export interface GarmentInsert {
  code: string
  name: string
  description?: string
  status?: GarmentStatus
  client_name?: string
  client_phone?: string
  notes?: string
  team_id?: string
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

export interface DocumentInsert {
  garment_id: string
  type: DocumentType
  url: string
  file_name?: string
  uploaded_by?: string
}

// ============================================================
// Trazabilidad de mangueras
// ============================================================

export type HoseStatus = 'activa' | 'danada' | 'reemplazada' | 'baja'
export type HoseActionType = 'uso' | 'inspeccion' | 'reemplazo' | 'baja'

export interface Equipment {
  id: string
  code: string
  name: string
  team_id?: string
  archived_at?: string
  archived_by?: string
  archive_reason?: string
  created_at: string
  updated_at: string
}

export interface HosePosition {
  id: string
  equipment_id: string
  caliber: string
  length?: string
  label?: string
  created_at: string
}

export interface Hose {
  id: string
  position_id: string
  short_code?: string
  status: HoseStatus
  current_cycle: number
  installed_at: string
  baja_reason?: string
  baja_date?: string
  created_at: string
  updated_at: string
}

export interface HoseAction {
  id: string
  hose_id: string
  action_type: HoseActionType
  cycle_after?: number
  notes?: string
  performed_by: string
  recorded_by?: string
  recorded_by_email?: string
  signature_id?: string
  created_at: string
}

export interface HosePositionWithDetails extends HosePosition {
  activeHose?: Hose
  history?: Hose[]
}

export interface EquipmentWithDetails extends Equipment {
  positions?: HosePositionWithDetails[]
}

export interface EquipmentInsert {
  code: string
  name: string
  calibers?: string[]
  lengths?: string[]
  team_id?: string
}
