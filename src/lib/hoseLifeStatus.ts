import type { Hose } from '../types'

export const MAX_HOSE_CYCLES = 200

export type HoseLifeStatus = 'verde' | 'amarillo' | 'naranja' | 'rojo'

export const getHoseCycleCount = (hose: Pick<Hose, 'current_cycle'>): number => {
  return hose.current_cycle ?? 0
}

// Umbrales proporcionales a los usados en lifeStatus.ts (25/50/75% del límite)
export const getHoseLifeStatus = (cycleCount: number): HoseLifeStatus => {
  if (cycleCount >= 150) return 'rojo'
  if (cycleCount >= 100) return 'naranja'
  if (cycleCount >= 50) return 'amarillo'
  return 'verde'
}

export const getHoseLifePercent = (cycleCount: number): number => {
  const rawPercent = (cycleCount / MAX_HOSE_CYCLES) * 100
  return Math.max(0, Math.min(100, Math.round(rawPercent)))
}
