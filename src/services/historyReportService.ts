import { saveAs } from 'file-saver'
import * as XLSX from 'xlsx'
import { supabase } from '../lib/supabase'
import type { AuditLogEntry } from '../types'

type Row = Record<string, string | number | null>

const fmt = (date?: string | null) => (date ? new Date(date).toLocaleString('es-MX') : '')
const stamp = () => new Date().toISOString().slice(0, 19).replace(/[:T]/g, '-')

// Fin del día seleccionado (para que "hasta 2026-11-10" incluya todo ese día)
export const endOfDay = (yyyyMmDd: string) => new Date(`${yyyyMmDd}T23:59:59.999`).toISOString()
export const startOfDay = (yyyyMmDd: string) => new Date(`${yyyyMmDd}T00:00:00`).toISOString()

const PAGE = 1000

// Supabase devuelve máx. 1000 filas por consulta: paginar
async function fetchAll<T>(build: (from: number, to: number) => PromiseLike<{ data: T[] | null; error: unknown }>): Promise<T[]> {
  const out: T[] = []
  for (let from = 0; ; from += PAGE) {
    const { data, error } = await build(from, from + PAGE - 1)
    if (error) throw error
    out.push(...(data || []))
    if (!data || data.length < PAGE) break
  }
  return out
}

function download(sheets: { name: string; rows: Row[] }[], filename: string, meta: Row) {
  const wb = XLSX.utils.book_new()
  for (const sheet of sheets) {
    const ws = XLSX.utils.json_to_sheet(sheet.rows.length ? sheet.rows : [{ Resultado: 'Sin registros en el periodo' }])
    XLSX.utils.book_append_sheet(wb, ws, sheet.name.slice(0, 31))
  }
  // Hoja de control: quién generó el reporte, cuándo y con qué parámetros
  XLSX.utils.book_append_sheet(wb, XLSX.utils.json_to_sheet([{ ...meta, 'Generado': fmt(new Date().toISOString()) }]), 'Parametros')
  const buf = XLSX.write(wb, { bookType: 'xlsx', type: 'array' })
  saveAs(new Blob([buf], { type: 'application/octet-stream' }), `${filename}_${stamp()}.xlsx`)
}

const statusLabel = (s?: string | null) =>
  !s ? '' : s === 'lavado' || s === 'esterilizacion' ? 'Lavado y esterilización' : s.charAt(0).toUpperCase() + s.slice(1)

export const historyReportService = {
  // ---------- Estado del inventario en una fecha ----------
  async inventoryStatusAt(atIso: string, garmentId?: string) {
    const { data, error } = await supabase.rpc('get_inventory_status_at', {
      p_at: atIso,
      p_garment_id: garmentId ?? null,
    })
    if (error) throw error
    return (data || []) as {
      garment_id: string; code: string; short_code: string | null; name: string; client_name: string | null
      status_at: string; cycles_at: number; last_action_at: string | null; last_action: string | null; last_responsible: string | null
    }[]
  },

  async exportInventoryStatusAt(atIso: string, userEmail: string) {
    const rows = await this.inventoryStatusAt(atIso)
    download(
      [{
        name: 'Estado en fecha',
        rows: rows.map((r) => ({
          'Código': r.code,
          'Código corto': r.short_code,
          'Prenda': r.name,
          'Cliente': r.client_name,
          'Estado en la fecha': statusLabel(r.status_at),
          'Ciclos de lavado/esterilización a la fecha': Number(r.cycles_at),
          'Última acción': statusLabel(r.last_action),
          'Fecha última acción': fmt(r.last_action_at),
          'Responsable última acción': r.last_responsible,
        })),
      }],
      'estado_inventario',
      { Reporte: 'Estado del inventario en una fecha', 'Fecha consultada': fmt(atIso), 'Generado por': userEmail, Prendas: rows.length }
    )
    return rows.length
  },

  // ---------- Historial de acciones por rango ----------
  async exportGarmentActions(fromIso: string, toIso: string, userEmail: string) {
    const rows = await fetchAll<any>((a, b) =>
      supabase
        .from('garment_actions')
        .select('created_at, action_type, result, notes, performed_by, recorded_by_email, signature_id, garments(code, short_code, name, client_name)')
        .gte('created_at', fromIso)
        .lte('created_at', toIso)
        .order('created_at', { ascending: true })
        .range(a, b)
    )
    download(
      [{
        name: 'Acciones prendas',
        rows: rows.map((r) => ({
          'Fecha y hora': fmt(r.created_at),
          'Código': r.garments?.code ?? '',
          'Código corto': r.garments?.short_code ?? '',
          'Prenda': r.garments?.name ?? '',
          'Cliente': r.garments?.client_name ?? '',
          'Acción': statusLabel(r.action_type),
          'Resultado': r.result ?? '',
          'Notas': r.notes ?? '',
          'Responsable': r.performed_by ?? '',
          'Capturado por (usuario)': r.recorded_by_email ?? '',
          'Firma electrónica': r.signature_id ? 'Sí' : '',
        })),
      }],
      'historial_acciones_prendas',
      { Reporte: 'Historial de acciones de prendas', Desde: fmt(fromIso), Hasta: fmt(toIso), 'Generado por': userEmail, Registros: rows.length }
    )
    return rows.length
  },

  async exportHoseActions(fromIso: string, toIso: string, userEmail: string) {
    const rows = await fetchAll<any>((a, b) =>
      supabase
        .from('hose_actions')
        .select('created_at, action_type, cycle_after, notes, performed_by, recorded_by_email, signature_id, hoses(short_code, hose_positions(caliber, equipment(code, name)))')
        .gte('created_at', fromIso)
        .lte('created_at', toIso)
        .order('created_at', { ascending: true })
        .range(a, b)
    )
    download(
      [{
        name: 'Acciones mangueras',
        rows: rows.map((r) => ({
          'Fecha y hora': fmt(r.created_at),
          'Equipo': r.hoses?.hose_positions?.equipment?.code ?? '',
          'Nombre equipo': r.hoses?.hose_positions?.equipment?.name ?? '',
          'Calibre': r.hoses?.hose_positions?.caliber ?? '',
          'Manguera': r.hoses?.short_code ?? '',
          'Acción': statusLabel(r.action_type),
          'Ciclo después': r.cycle_after ?? '',
          'Notas': r.notes ?? '',
          'Responsable': r.performed_by ?? '',
          'Capturado por (usuario)': r.recorded_by_email ?? '',
          'Firma electrónica': r.signature_id ? 'Sí' : '',
        })),
      }],
      'historial_acciones_mangueras',
      { Reporte: 'Historial de acciones de mangueras', Desde: fmt(fromIso), Hasta: fmt(toIso), 'Generado por': userEmail, Registros: rows.length }
    )
    return rows.length
  },

  // ---------- Audit trail (administrador) ----------
  async exportAuditTrail(fromIso: string, toIso: string, userEmail: string) {
    const rows = await fetchAll<AuditLogEntry>((a, b) =>
      supabase
        .from('audit_log')
        .select('*')
        .gte('occurred_at', fromIso)
        .lte('occurred_at', toIso)
        .order('occurred_at', { ascending: true })
        .range(a, b)
    )
    download(
      [{ name: 'Audit trail', rows: rows.map(auditRow) }],
      'audit_trail',
      { Reporte: 'Audit trail del sistema', Desde: fmt(fromIso), Hasta: fmt(toIso), 'Generado por': userEmail, Registros: rows.length }
    )
    return rows.length
  },

  // ---------- Audit trail de una prenda ----------
  async exportGarmentAuditTrail(garmentCode: string, entries: AuditLogEntry[], userEmail: string) {
    download(
      [{ name: 'Audit trail', rows: entries.map(auditRow) }],
      `audit_trail_${garmentCode}`,
      { Reporte: 'Audit trail de la prenda', Prenda: garmentCode, 'Generado por': userEmail, Registros: entries.length }
    )
  },

  // ---------- Intentos de acceso y firmas (administrador) ----------
  async exportAccessLog(fromIso: string, toIso: string, userEmail: string) {
    const [attempts, signatures] = await Promise.all([
      fetchAll<any>((a, b) =>
        supabase.from('login_attempts').select('*').gte('occurred_at', fromIso).lte('occurred_at', toIso)
          .order('occurred_at', { ascending: true }).range(a, b)),
      fetchAll<any>((a, b) =>
        supabase.from('electronic_signatures').select('*').gte('signed_at', fromIso).lte('signed_at', toIso)
          .order('signed_at', { ascending: true }).range(a, b)),
    ])
    download(
      [
        {
          name: 'Intentos de acceso',
          rows: attempts.map((r) => ({
            'Fecha y hora': fmt(r.occurred_at),
            'Usuario': r.email,
            'Resultado': r.success ? 'Exitoso' : 'Fallido',
            'Origen': r.source === 'firma' ? 'Firma electrónica' : 'Inicio de sesión',
          })),
        },
        {
          name: 'Firmas electrónicas',
          rows: signatures.map((r) => ({
            'Fecha y hora': fmt(r.signed_at),
            'Firmante': r.user_email,
            'Rol': r.user_role,
            'Significado': r.meaning,
            'Registro firmado': `${r.table_name}:${r.record_id}`,
          })),
        },
      ],
      'bitacora_accesos_firmas',
      { Reporte: 'Bitácora de accesos y firmas', Desde: fmt(fromIso), Hasta: fmt(toIso), 'Generado por': userEmail,
        'Intentos': attempts.length, 'Firmas': signatures.length }
    )
    return attempts.length + signatures.length
  },
}

const opLabel: Record<string, string> = { INSERT: 'Alta', UPDATE: 'Modificación', DELETE: 'Eliminación' }
const tableLabel: Record<string, string> = {
  garments: 'Prenda', garment_actions: 'Acción de prenda', movements: 'Movimiento', documents: 'Documento',
  garment_assignments: 'Asignación', equipment: 'Equipo', hose_positions: 'Posición', hoses: 'Manguera',
  hose_actions: 'Acción de manguera', user_profiles: 'Usuario', teams: 'Equipo de trabajo',
  account_locks: 'Bloqueo de cuenta', electronic_signatures: 'Firma electrónica',
}

const show = (v: unknown) => (v === null || v === undefined ? '' : typeof v === 'object' ? JSON.stringify(v) : String(v))

export const describeChanges = (e: AuditLogEntry): string => {
  if (e.operation === 'UPDATE' && e.changed_fields?.length) {
    return e.changed_fields
      .map((f) => `${f}: "${show(e.old_data?.[f])}" → "${show(e.new_data?.[f])}"`)
      .join('; ')
  }
  return ''
}

const auditRow = (e: AuditLogEntry): Row => ({
  'Fecha y hora': fmt(e.occurred_at),
  'Usuario': e.user_email ?? (e.user_id ? e.user_id : 'Sistema / mantenimiento'),
  'Rol': e.user_role ?? '',
  'Operación': opLabel[e.operation] ?? e.operation,
  'Entidad': tableLabel[e.table_name] ?? e.table_name,
  'Registro': e.record_id ?? '',
  'Cambios (anterior → nuevo)': describeChanges(e),
  'Motivo': e.reason ?? '',
  'Valor anterior (completo)': e.old_data ? JSON.stringify(e.old_data) : '',
  'Valor nuevo (completo)': e.new_data ? JSON.stringify(e.new_data) : '',
})
