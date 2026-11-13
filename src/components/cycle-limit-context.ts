import { createContext, useContext } from 'react'

export type CycleLimitKind = 'prenda' | 'manguera'

/** Error que lanza withCycleLimit cuando el usuario cancela la autorización */
export class CycleLimitCancelled extends Error {
  constructor() {
    super('Registro cancelado: no se autorizó exceder el límite de ciclos')
    this.name = 'CycleLimitCancelled'
  }
}

/** Código del error que devuelve la base al llegar al límite de ciclos */
export const CYCLE_LIMIT_CODE = 'TT001'

export const isCycleLimitError = (err: unknown) =>
  typeof err === 'object' && err !== null && (err as { code?: string }).code === CYCLE_LIMIT_CODE

export interface CycleLimitApi {
  /**
   * Ejecuta una acción. Si la base la detiene por el límite de ciclos, muestra
   * la advertencia, pide la autorización de un superior para los registros
   * indicados y la reintenta. Si se cancela, lanza CycleLimitCancelled.
   */
  withCycleLimit: <T>(kind: CycleLimitKind, ids: string[], action: () => Promise<T>) => Promise<T>
}

export const CycleLimitContext = createContext<CycleLimitApi | null>(null)

export const useCycleLimit = (): CycleLimitApi => {
  const ctx = useContext(CycleLimitContext)
  if (!ctx) throw new Error('useCycleLimit debe usarse dentro de CycleLimitProvider')
  return ctx
}
