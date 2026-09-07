import { saveAs } from 'file-saver'
import * as XLSX from 'xlsx'
import { parseGarmentCode } from '../lib/garmentCodeParser'
import { getCycleCount } from '../lib/lifeStatus'
import type { Equipment, HoseAction, HosePositionWithDetails } from '../types'

type ReportRow = Record<string, string | number>

const monthNames = [
  'Enero',
  'Febrero',
  'Marzo',
  'Abril',
  'Mayo',
  'Junio',
  'Julio',
  'Agosto',
  'Septiembre',
  'Octubre',
  'Noviembre',
  'Diciembre',
]

const formatStatus = (status?: string) => {
  if (!status) return ''
  if (status === 'lavado' || status === 'esterilizacion') return 'Lavado y esterilizacion'
  return status.charAt(0).toUpperCase() + status.slice(1)
}

const formatDate = (date?: string) => {
  if (!date) return ''
  return new Date(date).toLocaleString('es-AR')
}

const formatActionType = (actionType?: string) => {
  if (!actionType) return ''
  if (actionType === 'lavado' || actionType === 'esterilizacion') return 'Lavado y esterilizacion'
  return actionType.charAt(0).toUpperCase() + actionType.slice(1)
}

const getActionCount = (actions: any[] = [], actionType: string) => {
  return actions.filter((action) => action.action_type === actionType).length
}

const getInspectionResultCount = (actions: any[] = [], result: string) => {
  return actions.filter((action) => action.action_type === 'inspeccion' && action.result === result).length
}

const formatBatchMonth = (month: number, year: number) => `${monthNames[month - 1]} ${year}`

export async function generateReportExcel(garments: any[]) {
  try {
    const rows: ReportRow[] = garments.map((garment) => {
      const actions = garment.actions || []
      const parsed = parseGarmentCode(garment.code || '')
      const lastAction = actions[0]

      return {
        'Codigo corto': garment.short_code || '',
        'Codigo': garment.code || '',
        'Nombre': garment.name || '',
        'Descripcion': garment.description || '',
        'Prenda': parsed.valid ? parsed.garmentName : '',
        'Tipo prenda': parsed.valid ? parsed.garmentType : '',
        'Talla': parsed.valid ? parsed.sizeName : '',
        'Codigo talla': parsed.valid ? parsed.size : '',
        'Color': parsed.valid ? parsed.colorName : '',
        'Codigo color': parsed.valid ? parsed.color : '',
        'Lote': parsed.valid ? parsed.batchCode : '',
        'Mes lote': parsed.valid ? formatBatchMonth(parsed.batchMonth, parsed.batchYear) : '',
        'Secuencia': parsed.valid ? parsed.sequenceNumber.toString().padStart(3, '0') : '',
        'Cliente': garment.client_name || '',
        'Telefono cliente': garment.client_phone || '',
        'Estado': formatStatus(garment.status),
        'Ciclos lavado y esterilizacion': getCycleCount(actions),
        'Inspecciones': getActionCount(actions, 'inspeccion'),
        'Inspecciones aprobadas': getInspectionResultCount(actions, 'aprobado'),
        'Reparaciones': getActionCount(actions, 'reparacion') + getInspectionResultCount(actions, 'reparacion'),
        'Bajas registradas': getActionCount(actions, 'baja') + getInspectionResultCount(actions, 'baja'),
        'Total acciones': actions.length,
        'Ultima accion': formatActionType(lastAction?.action_type),
        'Resultado ultima accion': lastAction?.result || '',
        'Responsable ultima accion': lastAction?.performed_by || '',
        'Fecha ultima accion': formatDate(lastAction?.created_at),
        'Notas': garment.notes || '',
        'Motivo baja': garment.baja_reason || '',
        'Fecha baja': formatDate(garment.baja_date),
        'Creado': formatDate(garment.created_at),
        'Actualizado': formatDate(garment.updated_at),
      }
    })

    const worksheet = XLSX.utils.json_to_sheet(rows)
    worksheet['!cols'] = [
      { wch: 14 },
      { wch: 22 },
      { wch: 28 },
      { wch: 28 },
      { wch: 18 },
      { wch: 12 },
      { wch: 14 },
      { wch: 12 },
      { wch: 14 },
      { wch: 12 },
      { wch: 14 },
      { wch: 12 },
      { wch: 10 },
      { wch: 20 },
      { wch: 16 },
      { wch: 24 },
      { wch: 28 },
      { wch: 14 },
      { wch: 22 },
      { wch: 14 },
      { wch: 16 },
      { wch: 14 },
      { wch: 22 },
      { wch: 22 },
      { wch: 24 },
      { wch: 20 },
      { wch: 30 },
      { wch: 30 },
      { wch: 20 },
      { wch: 20 },
      { wch: 20 },
    ]

    if (worksheet['!ref']) {
      worksheet['!autofilter'] = { ref: worksheet['!ref'] }
    }

    const workbook = XLSX.utils.book_new()
    XLSX.utils.book_append_sheet(workbook, worksheet, 'Prendas')

    const excelBuffer = XLSX.write(workbook, { bookType: 'xlsx', type: 'array' })
    const blob = new Blob([excelBuffer], {
      type: 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
    })
    const filename = `ThreadTrack_Reporte_${new Date().toISOString().split('T')[0]}.xlsx`
    saveAs(blob, filename)
  } catch (error) {
    console.error('Error en generateReportExcel:', error)
    throw error
  }
}

type HoseExportPosition = HosePositionWithDetails & {
  activeActions?: HoseAction[]
  historyActions?: Record<string, HoseAction[]>
}

type HoseExportEquipment = Equipment & { positions?: HoseExportPosition[] }

const formatHoseAction = (action?: HoseAction) => {
  if (!action) return ''
  return action.action_type === 'uso' ? 'Lavado y Esterilización' : action.action_type
}

export async function generateHoseInventoryExcel(equipmentList: HoseExportEquipment[]) {
  const productRows: ReportRow[] = []
  const hoseRows: ReportRow[] = []
  const historyRows: ReportRow[] = []
  const bajaRows: ReportRow[] = []
  const replacementRows: ReportRow[] = []

  for (const equipment of equipmentList) {
    const positions = equipment.positions || []
    productRows.push({
      'Producto': equipment.name,
      'Codigo producto': equipment.code,
      'Mangueras activas': positions.filter((position) => position.activeHose).length,
      'Creado': formatDate(equipment.created_at),
      'Actualizado': formatDate(equipment.updated_at),
    })

    for (const position of positions) {
      for (const hose of position.history || []) {
        const actions = hose.id === position.activeHose?.id
          ? (position.activeActions || [])
          : (position.historyActions?.[hose.id] || [])
        const lastAction = actions[0]
        if (hose.status === 'activa') {
          hoseRows.push({
            'Producto': equipment.name,
            'Codigo producto': equipment.code,
            'Calibre': position.caliber,
            'Longitud': position.length || '',
            'Codigo manguera': hose.short_code || '',
            'Estado': hose.status,
            'Manguera actual': 'Si',
            'Ciclos': hose.current_cycle,
            'Limite ciclos': 200,
            'Ultima accion': formatHoseAction(lastAction),
            'Responsable ultima accion': lastAction?.performed_by || '',
            'Fecha ultima accion': formatDate(lastAction?.created_at),
            'Fecha instalacion': formatDate(hose.installed_at),
            'Motivo baja': hose.baja_reason || '',
            'Fecha baja': formatDate(hose.baja_date),
          })
        }

        for (const action of actions) {
          if (action.action_type !== 'reemplazo') {
            historyRows.push({
              'Producto': equipment.name,
              'Codigo producto': equipment.code,
              'Calibre': position.caliber,
              'Longitud': position.length || '',
              'Codigo manguera': hose.short_code || '',
              'Tipo': formatHoseAction(action),
              'Ciclo': action.cycle_after ?? '',
              'Responsable': action.performed_by,
              'Fecha': formatDate(action.created_at),
              'Notas': action.notes || '',
              'Manguera actual': hose.id === position.activeHose?.id ? 'Si' : 'No',
            })
          }

          if (action.action_type === 'reemplazo') {
            replacementRows.push({
              'Producto': equipment.name,
              'Codigo producto': equipment.code,
              'Calibre': position.caliber,
              'Longitud': position.length || '',
              'Manguera reemplazada': hose.short_code || '',
              'Ciclos al reemplazo': action.cycle_after ?? hose.current_cycle,
              'Responsable': action.performed_by,
              'Fecha reemplazo': formatDate(action.created_at),
              'Motivo': action.notes || hose.baja_reason || '',
              'Manguera actual': 'No',
            })
          }
        }

        if (hose.status === 'baja' || hose.status === 'reemplazada') {
          bajaRows.push({
            'Producto': equipment.name,
            'Codigo producto': equipment.code,
            'Calibre': position.caliber,
            'Longitud': position.length || '',
            'Codigo manguera': hose.short_code || '',
            'Estado': hose.status,
            'Ciclos finales': hose.current_cycle,
            'Fecha instalacion': formatDate(hose.installed_at),
            'Motivo baja': hose.baja_reason || '',
            'Fecha baja': formatDate(hose.baja_date),
          })
        }
      }
    }
  }

  const workbook = XLSX.utils.book_new()
  const productSheet = XLSX.utils.json_to_sheet(productRows)
  const hoseSheet = XLSX.utils.json_to_sheet(hoseRows)
  const historySheet = XLSX.utils.json_to_sheet(historyRows)
  const bajaSheet = XLSX.utils.json_to_sheet(bajaRows)
  const replacementSheet = XLSX.utils.json_to_sheet(replacementRows)
  productSheet['!cols'] = [{ wch: 30 }, { wch: 22 }, { wch: 18 }, { wch: 22 }, { wch: 22 }]
  hoseSheet['!cols'] = [{ wch: 30 }, { wch: 22 }, { wch: 12 }, { wch: 12 }, { wch: 18 }, { wch: 14 }, { wch: 10 }, { wch: 16 }, { wch: 24 }, { wch: 26 }, { wch: 22 }, { wch: 22 }]
  historySheet['!cols'] = [{ wch: 30 }, { wch: 22 }, { wch: 12 }, { wch: 12 }, { wch: 18 }, { wch: 24 }, { wch: 10 }, { wch: 22 }, { wch: 22 }, { wch: 32 }, { wch: 16 }]
  bajaSheet['!cols'] = [{ wch: 30 }, { wch: 22 }, { wch: 12 }, { wch: 12 }, { wch: 18 }, { wch: 16 }, { wch: 16 }, { wch: 22 }, { wch: 28 }, { wch: 22 }]
  replacementSheet['!cols'] = [{ wch: 30 }, { wch: 22 }, { wch: 12 }, { wch: 12 }, { wch: 24 }, { wch: 20 }, { wch: 22 }, { wch: 22 }, { wch: 32 }, { wch: 16 }]
  XLSX.utils.book_append_sheet(workbook, productSheet, 'Productos')
  XLSX.utils.book_append_sheet(workbook, hoseSheet, 'Mangueras activas')
  XLSX.utils.book_append_sheet(workbook, historySheet, 'Historial ciclos')
  XLSX.utils.book_append_sheet(workbook, bajaSheet, 'Bajas')
  XLSX.utils.book_append_sheet(workbook, replacementSheet, 'Reemplazos')

  const excelBuffer = XLSX.write(workbook, { bookType: 'xlsx', type: 'array' })
  saveAs(new Blob([excelBuffer], { type: 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet' }), `ThreadTrack_Mangueras_${new Date().toISOString().split('T')[0]}.xlsx`)
}

export function generateHoseDetailExcel(
  position: HosePositionWithDetails & { equipment?: Equipment },
  activeActions: HoseAction[],
  historyActions: Record<string, HoseAction[]>
) {
  const hoseRows: ReportRow[] = []
  const historyRows: ReportRow[] = []
  const bajaRows: ReportRow[] = []
  const replacementRows: ReportRow[] = []
  const allHoses = position.history || []

  for (const hose of allHoses) {
    const actions = hose.id === position.activeHose?.id ? activeActions : (historyActions[hose.id] || [])
    hoseRows.push({
      'Producto': position.equipment?.name || '',
      'Codigo producto': position.equipment?.code || '',
      'Calibre': position.caliber,
      'Longitud': position.length || '',
      'Codigo manguera': hose.short_code || '',
      'Estado': hose.status,
      'Ciclos': hose.current_cycle,
      'Fecha instalacion': formatDate(hose.installed_at),
      'Motivo baja': hose.baja_reason || '',
      'Fecha baja': formatDate(hose.baja_date),
    })
    for (const action of actions) {
      if (action.action_type !== 'reemplazo') {
        historyRows.push({
          'Codigo manguera': hose.short_code || '',
          'Tipo': formatHoseAction(action),
          'Ciclo': action.cycle_after ?? '',
          'Responsable': action.performed_by,
          'Fecha': formatDate(action.created_at),
          'Notas': action.notes || '',
        })
      }
      if (action.action_type === 'reemplazo') {
        replacementRows.push({
          'Codigo manguera': hose.short_code || '',
          'Ciclos al reemplazo': action.cycle_after ?? hose.current_cycle,
          'Responsable': action.performed_by,
          'Fecha reemplazo': formatDate(action.created_at),
          'Motivo': action.notes || hose.baja_reason || '',
        })
      }
    }
    if (hose.status === 'baja' || hose.status === 'reemplazada') {
      bajaRows.push({
        'Codigo manguera': hose.short_code || '',
        'Estado': hose.status,
        'Ciclos finales': hose.current_cycle,
        'Fecha instalacion': formatDate(hose.installed_at),
        'Motivo baja': hose.baja_reason || '',
        'Fecha baja': formatDate(hose.baja_date),
      })
    }
  }

  const workbook = XLSX.utils.book_new()
  const hoseSheet = XLSX.utils.json_to_sheet(hoseRows)
  const historySheet = XLSX.utils.json_to_sheet(historyRows)
  const bajaSheet = XLSX.utils.json_to_sheet(bajaRows)
  const replacementSheet = XLSX.utils.json_to_sheet(replacementRows)
  hoseSheet['!cols'] = [{ wch: 30 }, { wch: 22 }, { wch: 12 }, { wch: 12 }, { wch: 18 }, { wch: 14 }, { wch: 10 }, { wch: 22 }, { wch: 28 }, { wch: 22 }]
  historySheet['!cols'] = [{ wch: 18 }, { wch: 24 }, { wch: 10 }, { wch: 22 }, { wch: 22 }, { wch: 32 }]
  bajaSheet['!cols'] = [{ wch: 18 }, { wch: 16 }, { wch: 16 }, { wch: 22 }, { wch: 28 }, { wch: 22 }]
  replacementSheet['!cols'] = [{ wch: 22 }, { wch: 20 }, { wch: 22 }, { wch: 22 }, { wch: 32 }]
  XLSX.utils.book_append_sheet(workbook, hoseSheet, 'Manguera')
  XLSX.utils.book_append_sheet(workbook, historySheet, 'Historial')
  XLSX.utils.book_append_sheet(workbook, bajaSheet, 'Bajas')
  XLSX.utils.book_append_sheet(workbook, replacementSheet, 'Reemplazos')

  const excelBuffer = XLSX.write(workbook, { bookType: 'xlsx', type: 'array' })
  const shortCode = position.activeHose?.short_code || 'manguera'
  saveAs(new Blob([excelBuffer], { type: 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet' }), `ThreadTrack_${shortCode}_${new Date().toISOString().split('T')[0]}.xlsx`)
}
