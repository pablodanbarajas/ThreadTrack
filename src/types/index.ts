export interface Team {
  id: string
  name: string
  description?: string
  created_at: string
}

export type GarmentStatus = 'disponible' | 'lavado' | 'esterilizacion' | 'inspeccion' | 'reparacion' | 'baja'
export type ActionType = 'lavado' | 'esterilizacion' | 'inspeccion' | 'reparacion' | 'baja'
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
  team_id?: string
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

export interface DocumentInsert {
  garment_id: string
  type: DocumentType
  url: string
  file_name?: string
  uploaded_by?: string
}
