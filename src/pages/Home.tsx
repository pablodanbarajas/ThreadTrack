import { useEffect } from 'react'
import { Link } from 'react-router-dom'
import type { LucideIcon } from 'lucide-react'
import { Shirt, PackageCheck, Droplets, ClipboardCheck, Scissors, PackageX, ChevronRight } from 'lucide-react'
import { useGarmentCache } from '../contexts/GarmentCacheContext'
import { WASH_STERILIZATION_CYCLE_LIMIT, getCycleCount, getCycleLifeStatus } from '../lib/lifeStatus'
import { StatusDot } from '../components/ui/StatusBadge'
import { Skeleton, SkeletonStats } from '../components/ui/Skeleton'
import type { IndicatorTone } from '../lib/tones'
import { dotColor } from '../lib/tones'

const Kpi = ({ icon: Icon, label, value, tone, to }: {
  icon: LucideIcon; label: string; value: number; tone?: IndicatorTone; to?: string
}) => {
  const body = (
    <div className="flex h-full items-center gap-3 rounded-xl border border-gray-200 bg-white p-4 transition-shadow hover:shadow-sm">
      <div className="flex h-10 w-10 shrink-0 items-center justify-center rounded-lg bg-gray-100 text-gray-600">
        <Icon className="h-5 w-5" />
      </div>
      <div className="min-w-0">
        <p className="text-2xl font-bold leading-none text-gray-900">{value}</p>
        <p className="mt-1 flex items-center gap-1.5 text-xs text-gray-500">
          {tone && <StatusDot tone={tone} />}
          {label}
        </p>
      </div>
      {to && <ChevronRight className="ml-auto h-4 w-4 text-gray-300" />}
    </div>
  )
  return to ? <Link to={to}>{body}</Link> : body
}

const lifeBands: { key: 'verde' | 'amarillo' | 'naranja' | 'rojo'; label: string; range: string; tone: IndicatorTone }[] = [
  { key: 'verde', label: 'Verde', range: '0–24 ciclos', tone: 'green' },
  { key: 'amarillo', label: 'Amarillo', range: '25–49 ciclos', tone: 'yellow' },
  { key: 'naranja', label: 'Naranja', range: '50–74 ciclos', tone: 'orange' },
  { key: 'rojo', label: 'Rojo', range: '75+ ciclos', tone: 'red' },
]

const Home = () => {
  const { garments, loading, loadGarments } = useGarmentCache()

  useEffect(() => {
    loadGarments().catch((error) => console.error('Error cargando datos:', error))
  }, [loadGarments])

  const count = (status: string) => garments.filter((g) => g.status === status).length
  const activeGarments = garments.filter((g) => g.status !== 'baja')

  const lifeCounts = activeGarments.reduce(
    (acc, garment) => {
      acc[getCycleLifeStatus(getCycleCount(garment.actions || []))] += 1
      return acc
    },
    { verde: 0, amarillo: 0, naranja: 0, rojo: 0 }
  )
  const lifeTotal = activeGarments.length
  const pct = (n: number) => (lifeTotal > 0 ? Math.round((n / lifeTotal) * 100) : 0)

  const showSkeleton = loading && garments.length === 0

  return (
    <div className="w-full space-y-6">
      <div>
        <p className="text-xs font-semibold uppercase tracking-widest text-gray-400">Resumen operativo</p>
        <h1 className="text-2xl font-bold text-gray-900">Inicio</h1>
      </div>

      {/* Resumen de inventario */}
      <section>
        <h2 className="mb-3 text-sm font-semibold text-gray-700">Inventario</h2>
        {showSkeleton ? (
          <SkeletonStats count={6} />
        ) : (
          <div className="grid grid-cols-2 gap-3 lg:grid-cols-3 xl:grid-cols-6">
            <Kpi icon={Shirt} label="Prendas activas" value={activeGarments.length} />
            <Kpi icon={PackageCheck} label="Disponibles" value={count('disponible')} tone="green" />
            <Kpi icon={Droplets} label="En lavado" value={count('lavado')} tone="blue" />
            <Kpi icon={ClipboardCheck} label="En inspección" value={count('inspeccion')} tone="yellow" />
            <Kpi icon={Scissors} label="En reparación" value={count('reparacion')} tone="orange" />
            <Kpi icon={PackageX} label="Bajas" value={count('baja')} tone="red" to="/bajas" />
          </div>
        )}
      </section>

      {/* Semáforo de vida útil */}
      <section className="rounded-xl border border-gray-200 bg-white p-5">
        <div className="mb-4 flex flex-wrap items-start justify-between gap-3">
          <div>
            <h2 className="text-base font-semibold text-gray-900">Semáforo de vida útil</h2>
            <p className="text-sm text-gray-500">
              Ciclos de lavado y esterilización por prenda (límite: {WASH_STERILIZATION_CYCLE_LIMIT})
            </p>
          </div>
          <span className="rounded-md border border-gray-200 px-2 py-1 text-xs text-gray-500">{lifeTotal} prendas activas</span>
        </div>

        {showSkeleton ? (
          <>
            <Skeleton className="mb-4 h-2 w-full rounded-full" />
            <SkeletonStats count={4} />
          </>
        ) : (
          <>
            <div className="mb-4 flex h-2 w-full overflow-hidden rounded-full bg-gray-100">
              {lifeBands.map((b) => (
                <div key={b.key} className={dotColor[b.tone]} style={{ width: `${pct(lifeCounts[b.key])}%` }} />
              ))}
            </div>
            <div className="grid grid-cols-2 gap-3 lg:grid-cols-4">
              {lifeBands.map((b) => (
                <div key={b.key} className="rounded-lg border border-gray-200 p-3">
                  <p className="flex items-center gap-2 text-sm font-medium text-gray-700">
                    <StatusDot tone={b.tone} /> {b.label}
                  </p>
                  <p className="mt-1 text-2xl font-bold text-gray-900">{lifeCounts[b.key]}</p>
                  <p className="text-xs text-gray-500">{pct(lifeCounts[b.key])}% del total · {b.range}</p>
                </div>
              ))}
            </div>
          </>
        )}
      </section>
    </div>
  )
}

export default Home
