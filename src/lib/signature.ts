/** Significado de la firma electrónica para una acción de prenda, o null si no requiere firma. */
export const garmentSignatureMeaning = (actionType: string, inspectionResult?: string): string | null => {
  if (actionType === 'baja') return 'Autorizo la baja definitiva de la prenda'
  if (actionType === 'inspeccion' && inspectionResult === 'baja') return 'Autorizo la baja definitiva de la prenda'
  if (actionType === 'inspeccion' && inspectionResult) return `Certifico el resultado de inspección: ${inspectionResult}`
  return null
}
