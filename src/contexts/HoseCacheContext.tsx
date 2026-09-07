import { createContext, useCallback, useContext, useEffect, useRef, useState } from 'react'
import type { ReactNode } from 'react'
import { hoseService } from '../services/hoseService'
import type { Equipment, HosePositionWithDetails } from '../types'

type CachedEquipment = Equipment & { positions?: HosePositionWithDetails[] }

interface HoseCacheContextType {
  equipmentList: CachedEquipment[]
  loading: boolean
  loadedAt: number | null
  error: string | null
  loadEquipment: (options?: { force?: boolean }) => Promise<CachedEquipment[]>
  refreshEquipment: () => Promise<CachedEquipment[]>
  invalidateEquipment: () => void
}

const CACHE_TTL_MS = 5 * 60 * 1000

const HoseCacheContext = createContext<HoseCacheContextType | undefined>(undefined)

export const HoseCacheProvider = ({ children }: { children: ReactNode }) => {
  const [equipmentList, setEquipmentList] = useState<CachedEquipment[]>([])
  const [loading, setLoading] = useState(false)
  const [loadedAt, setLoadedAt] = useState<number | null>(null)
  const [error, setError] = useState<string | null>(null)

  const equipmentRef = useRef<CachedEquipment[]>([])
  const loadedAtRef = useRef<number | null>(null)
  const inFlightRef = useRef<Promise<CachedEquipment[]> | null>(null)

  useEffect(() => {
    equipmentRef.current = equipmentList
  }, [equipmentList])

  useEffect(() => {
    loadedAtRef.current = loadedAt
  }, [loadedAt])

  const loadEquipment = useCallback(async (options?: { force?: boolean }) => {
    const force = options?.force ?? false
    const now = Date.now()
    const cacheIsFresh = loadedAtRef.current !== null && now - loadedAtRef.current < CACHE_TTL_MS

    if (!force && cacheIsFresh) {
      return equipmentRef.current
    }

    if (!force && inFlightRef.current) {
      return inFlightRef.current
    }

    const request = (async () => {
      setLoading(true)
      setError(null)

      try {
        const data = await hoseService.getAllEquipment()
        const equipmentWithPositions = await Promise.all(
          data.map(async (equipment) => {
            const positions = await hoseService.getPositionsByEquipment(equipment.id)
            return { ...equipment, positions }
          })
        )

        setEquipmentList(equipmentWithPositions)
        setLoadedAt(Date.now())
        return equipmentWithPositions
      } catch (err: any) {
        setError(err.message || 'Error cargando equipos')
        throw err
      } finally {
        setLoading(false)
        inFlightRef.current = null
      }
    })()

    inFlightRef.current = request
    return request
  }, [])

  const refreshEquipment = useCallback(() => loadEquipment({ force: true }), [loadEquipment])

  const invalidateEquipment = useCallback(() => {
    setLoadedAt(null)
    loadedAtRef.current = null
  }, [])

  return (
    <HoseCacheContext.Provider value={{ equipmentList, loading, loadedAt, error, loadEquipment, refreshEquipment, invalidateEquipment }}>
      {children}
    </HoseCacheContext.Provider>
  )
}

export const useHoseCache = () => {
  const context = useContext(HoseCacheContext)
  if (!context) {
    throw new Error('useHoseCache debe usarse dentro de HoseCacheProvider')
  }
  return context
}
