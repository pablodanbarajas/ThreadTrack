import type { AuditLogEntry } from '../types'

// Presentación legible del audit trail: etiquetas en español, sin campos
// técnicos y con identificadores convertidos a códigos o nombres.

export const auditOpLabel: Record<string, string> = { INSERT: 'Alta', UPDATE: 'Modificación', DELETE: 'Eliminación' }

export const auditTableLabel: Record<string, string> = {
  garments: 'Prenda', garment_actions: 'Acción de prenda', movements: 'Movimiento', documents: 'Documento',
  garment_assignments: 'Asignación', equipment: 'Producto de mangueras', hose_positions: 'Posición de manguera',
  hoses: 'Manguera', hose_actions: 'Acción de manguera', user_profiles: 'Usuario', teams: 'Equipo de trabajo',
  organizations: 'Empresa', account_locks: 'Bloqueo de cuenta', electronic_signatures: 'Firma electrónica',
}

const fieldLabel: Record<string, string> = {
  code: 'Código', name: 'Nombre', description: 'Descripción', status: 'Estado', notes: 'Notas',
  short_code: 'Código corto', client_name: 'Cliente', client_phone: 'Teléfono del cliente',
  baja_reason: 'Motivo de baja', baja_date: 'Fecha de baja', action_type: 'Acción', result: 'Resultado',
  performed_by: 'Responsable', previous_status: 'Estado anterior', new_status: 'Estado nuevo',
  garment_id: 'Prenda', hose_id: 'Manguera', equipment_id: 'Producto', position_id: 'Posición',
  caliber: 'Calibre', length: 'Longitud', label: 'Etiqueta', current_cycle: 'Ciclos', cycle_after: 'Ciclo después',
  installed_at: 'Instalada', team_id: 'Equipo de trabajo', organization_id: 'Empresa',
  role: 'Rol', modules: 'Módulos', is_active: 'Activo', full_name: 'Nombre completo', email: 'Correo',
  must_change_password: 'Cambio de contraseña obligatorio', password_changed_at: 'Contraseña cambiada',
  max_users: 'Usuarios contratados', active: 'Activa',
  archived_at: 'Archivado', archive_reason: 'Motivo de archivo', archived_by: 'Archivado por',
  meaning: 'Significado', user_name: 'Firmante', user_email: 'Correo del firmante', user_role: 'Rol del firmante',
  signed_at: 'Firmado', locked_until: 'Bloqueado hasta', unlock_reason: 'Motivo de desbloqueo',
  type: 'Tipo', file_name: 'Archivo', url: 'Enlace', signature_id: 'Firma electrónica',
}

// Campos técnicos que no aportan al lector (siguen en la hoja de detalle técnico)
const hiddenFields = new Set([
  'id', 'created_at', 'updated_at', 'recorded_by', 'recorded_by_email', 'recorded_by_name',
  'user_id', 'last_sign_in_at', 'failed_attempts', 'record_id', 'table_name', 'occurred_at',
])

const valueLabel: Record<string, string> = {
  disponible: 'Disponible', lavado: 'En lavado', esterilizacion: 'Esterilización', inspeccion: 'En inspección',
  reparacion: 'En reparación', baja: 'Baja', aprobado: 'Aprobado', rechazado: 'Rechazado',
  activa: 'Activa', danada: 'Dañada', reemplazada: 'Reemplazada', uso: 'Uso', reemplazo: 'Reemplazo',
  operador: 'Operador', supervisor: 'Supervisor', jefe: 'Jefe', administrador: 'Administrador',
  prendas: 'Prendas', mangueras: 'Mangueras',
}

// Para el campo "Acción" se usa el verbo, no el estado
const actionLabel: Record<string, string> = {
  lavado: 'Lavado', esterilizacion: 'Esterilización', inspeccion: 'Inspección', reparacion: 'Reparación',
  baja: 'Baja', uso: 'Uso', reemplazo: 'Reemplazo',
}
const fieldValue = (f: string, v: unknown, resolve?: AuditResolver) =>
  f === 'action_type' && typeof v === 'string' ? actionLabel[v] ?? v : fmtValue(v, resolve)

const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i
const ISO_RE = /^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}/

/** Traduce identificadores (UUID) a códigos o nombres legibles */
export type AuditResolver = (id: string) => string | undefined

const fmtValue = (v: unknown, resolve?: AuditResolver): string => {
  if (v === null || v === undefined || v === '') return '(vacío)'
  if (typeof v === 'boolean') return v ? 'Sí' : 'No'
  if (Array.isArray(v)) return v.length ? v.map((x) => fmtValue(x, resolve)).join(', ') : '(ninguno)'
  if (typeof v === 'object') return JSON.stringify(v)
  const s = String(v)
  if (UUID_RE.test(s)) return resolve?.(s) ?? 'registro ' + s.slice(0, 8)
  if (ISO_RE.test(s)) return new Date(s).toLocaleString('es-MX')
  return valueLabel[s] ?? s
}

const label = (f: string) => fieldLabel[f] ?? f.replace(/_/g, ' ')

/** Qué cambió, en palabras: "Estado: Disponible → En lavado" */
export const describeChanges = (e: AuditLogEntry, resolve?: AuditResolver): string => {
  if (e.operation === 'UPDATE') {
    const fields = (e.changed_fields ?? []).filter((f) => !hiddenFields.has(f))
    if (fields.length === 0) return ''
    return fields
      .map((f) => {
        if (f === 'signature_id') return 'Firmado electrónicamente'
        return `${label(f)}: ${fieldValue(f, e.old_data?.[f], resolve)} → ${fieldValue(f, e.new_data?.[f], resolve)}`
      })
      .join('; ')
  }
  const data = (e.operation === 'INSERT' ? e.new_data : e.old_data) ?? {}
  return Object.entries(data)
    .filter(([f, v]) => !hiddenFields.has(f) && v !== null && v !== '' && !(Array.isArray(v) && v.length === 0))
    .map(([f, v]) => (f === 'signature_id' ? 'Con firma electrónica' : `${label(f)}: ${fieldValue(f, v, resolve)}`))
    .join('; ')
}

/** Nombre legible del registro afectado (código de prenda, manguera, correo…) */
export const describeRecord = (e: AuditLogEntry, resolve?: AuditResolver): string => {
  const d = (e.new_data ?? e.old_data ?? {}) as Record<string, unknown>
  const r = (id: unknown) => (typeof id === 'string' ? resolve?.(id) : undefined)
  switch (e.table_name) {
    case 'garments': return String(d.code ?? '')
    case 'garment_actions': case 'movements': case 'documents': case 'garment_assignments':
      return r(d.garment_id) ?? ''
    case 'equipment': return String(d.code ?? '')
    case 'hose_positions': return [r(d.equipment_id), d.caliber && `calibre ${d.caliber}`].filter(Boolean).join(' · ')
    case 'hoses': return String(d.short_code ?? '')
    case 'hose_actions': return r(d.hose_id) ?? ''
    case 'user_profiles': return String(d.email ?? d.full_name ?? '')
    case 'teams': case 'organizations': return String(d.name ?? '')
    case 'electronic_signatures': return String(d.user_name ?? d.user_email ?? '')
    case 'account_locks': return String(d.email ?? '')
    default: return ''
  }
}

/** Identificadores que conviene resolver para un conjunto de entradas */
export const collectAuditIds = (entries: AuditLogEntry[]) => {
  const ids = { garments: new Set<string>(), hoses: new Set<string>(), equipment: new Set<string>(), orgs: new Set<string>(), teams: new Set<string>() }
  for (const e of entries) {
    for (const d of [e.new_data, e.old_data]) {
      if (!d) continue
      const add = (set: Set<string>, v: unknown) => { if (typeof v === 'string' && UUID_RE.test(v)) set.add(v) }
      add(ids.garments, d.garment_id)
      add(ids.hoses, d.hose_id)
      add(ids.equipment, d.equipment_id)
      add(ids.orgs, d.organization_id)
      add(ids.teams, d.team_id)
    }
  }
  return ids
}
