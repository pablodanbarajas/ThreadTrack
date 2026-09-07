import { createContext, useCallback, useContext, useEffect, useRef, useState } from 'react'
import type { ReactNode } from 'react'
import { garmentService } from '../services/garmentService'
import type { Garment, GarmentAction } from '../types'

type CachedGarment = Garment & { actions?: GarmentAction[] }

interface GarmentCacheContextType {
  garments: CachedGarment[]
  loading: boolean
  loadedAt: number | null
  error: string | null
  loadGarments: (options?: { force?: boolean }) => Promise<CachedGarment[]>
  refreshGarments: () => Promise<CachedGarment[]>
  invalidateGarments: () => void
}

const CACHE_TTL_MS = 5 * 60 * 1000

const GarmentCacheContext = createContext<GarmentCacheContextType | undefined>(undefined)

export const GarmentCacheProvider = ({ children }: { children: ReactNode }) => {
  const [garments, setGarments] = useState<CachedGarment[]>([])
  const [loading, setLoading] = useState(false)
  const [loadedAt, setLoadedAt] = useState<number | null>(null)
  const [error, setError] = useState<string | null>(null)

  const garmentsRef = useRef<CachedGarment[]>([])
  const loadedAtRef = useRef<number | null>(null)
  const inFlightRef = useRef<Promise<CachedGarment[]> | null>(null)

  useEffect(() => {
    garmentsRef.current = garments
  }, [garments])

  useEffect(() => {
    loadedAtRef.current = loadedAt
  }, [loadedAt])

  const loadGarments = useCallback(async (options?: { force?: boolean }) => {
    const force = options?.force ?? false
    const now = Date.now()
    const cacheIsFresh = loadedAtRef.current !== null && now - loadedAtRef.current < CACHE_TTL_MS

    if (!force && cacheIsFresh) {
      return garmentsRef.current
    }

    if (!force && inFlightRef.current) {
      return inFlightRef.current
    }

    const request = (async () => {
      setLoading(true)
      setError(null)

      try {
        const data = await garmentService.getAll()
        const garmentsWithActions = await Promise.all(
          data.map(async (garment) => {
            const actions = await garmentService.getActions(garment.id)
            return { ...garment, actions }
          })
        )

        setGarments(garmentsWithActions)
        setLoadedAt(Date.now())
        return garmentsWithActions
      } catch (err: any) {
        setError(err.message || 'Error cargando prendas')
        throw err
      } finally {
        setLoading(false)
        inFlightRef.current = null
      }
    })()

    inFlightRef.current = request
    return request
  }, [])

  const refreshGarments = useCallback(() => loadGarments({ force: true }), [loadGarments])

  const invalidateGarments = useCallback(() => {
    setLoadedAt(null)
    loadedAtRef.current = null
  }, [])

  return (
    <GarmentCacheContext.Provider value={{ garments, loading, loadedAt, error, loadGarments, refreshGarments, invalidateGarments }}>
      {children}
    </GarmentCacheContext.Provider>
  )
}

export const useGarmentCache = () => {
  const context = useContext(GarmentCacheContext)
  if (!context) {
    throw new Error('useGarmentCache debe usarse dentro de GarmentCacheProvider')
  }
  return context
}