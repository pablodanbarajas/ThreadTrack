export const STERILIZATION_LIFE_LIMIT = 100

export type SterilizationLifeStatus = 'verde' | 'amarillo' | 'naranja' | 'rojo'

export const getSterilizationLifeStatus = (sterilizationCount: number): SterilizationLifeStatus => {
  if (sterilizationCount >= 75) return 'rojo'
  if (sterilizationCount >= 50) return 'naranja'
  if (sterilizationCount >= 25) return 'amarillo'
  return 'verde'
}

export const getSterilizationLifePercent = (sterilizationCount: number): number => {
  const rawPercent = (sterilizationCount / STERILIZATION_LIFE_LIMIT) * 100
  return Math.max(0, Math.min(100, Math.round(rawPercent)))
}
