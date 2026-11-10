import { useCallback } from 'react'
import { useFeedback } from '../components/ui/feedback-context'
import { garmentService } from '../services/garmentService'
import type { Garment } from '../types'

/**
 * Archivar una prenda (mismo flujo desde Inventario y desde Bajas).
 * Archivar ≠ dar de baja: la baja es el fin de vida útil (sigue en Bajas y
 * reportes, con firma); archivar retira de toda lista un registro que no
 * debe estar en operación (p. ej. duplicado o capturado por error).
 * Nada se borra: el historial se conserva en el audit trail.
 */
export const useArchiveGarment = () => {
  const feedback = useFeedback()

  return useCallback(async (garment: Pick<Garment, 'id' | 'code' | 'name' | 'status'>): Promise<boolean> => {
    const isBaja = garment.status === 'baja'
    const reason = await feedback.prompt({
      title: `Archivar ${garment.code}`,
      message: isBaja
        ? `${garment.name}\n\nDejará de aparecer en Bajas y en las listas. Su historial completo se conserva para trazabilidad.`
        : `${garment.name}\n\nÚsalo solo para registros que no deben estar en operación (duplicados o capturados por error). ` +
          `Si la prenda llegó al fin de su vida útil o se dañó, usa "Dar de baja".\n\nNada se borra: el historial se conserva.`,
      label: 'Motivo del archivado',
      placeholder: isBaja ? 'Ej. depuración de bajas antiguas' : 'Ej. registrada por duplicado',
      required: true,
      confirmLabel: 'Archivar',
      variant: 'danger',
    })
    if (!reason) return false
    try {
      await garmentService.archive(garment.id, reason)
      feedback.success(`Prenda ${garment.code} archivada`)
      return true
    } catch (err) {
      feedback.error((err as Error).message || 'Error al archivar la prenda')
      return false
    }
  }, [feedback])
}
