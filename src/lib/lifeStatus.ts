import type { GarmentAction } from '../types'

export const WASH_STERILIZATION_CYCLE_LIMIT = 100
export const STERILIZATION_LIFE_LIMIT = WASH_STERILIZATION_CYCLE_LIMIT

export type CycleLifeStatus = 'verde' | 'amarillo' | 'naranja' | 'rojo'
export type SterilizationLifeStatus = CycleLifeStatus

export const getCycleCount = (actions: Pick<GarmentAction, 'action_type'>[] = []): number => {
  return actions.filter((action) => action.action_type === 'lavado' || action.action_type === 'esterilizacion').length
}

export const getCycleLifeStatus = (cycleCount: number): CycleLifeStatus => {
  if (cycleCount >= 75) return 'rojo'
  if (cycleCount >= 50) return 'naranja'
  if (cycleCount >= 25) return 'amarillo'
  return 'verde'
}

export const getCycleLifePercent = (cycleCount: number): number => {
  const rawPercent = (cycleCount / WASH_STERILIZATION_CYCLE_LIMIT) * 100
  return Math.max(0, Math.min(100, Math.round(rawPercent)))
}

export const getSterilizationLifeStatus = getCycleLifeStatus
export const getSterilizationLifePercent = getCycleLifePercent
