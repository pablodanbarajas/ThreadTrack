import { useEffect, useState } from 'react'
import { Link } from 'react-router-dom'
import type { LucideIcon } from 'lucide-react'
import { Waves, Package, CheckCircle2, AlertTriangle, RefreshCw, Activity, OctagonAlert, ChevronRight } from 'lucide-react'
import { hoseService } from '../services/hoseService'
import { MAX_HOSE_CYCLES } from '../lib/hoseLifeStatus'
import type { HoseStats } from '../types'
import { StatusDot } from '../components/ui/StatusBadge'
import { Skeleton, SkeletonStats } from '../components/ui/Skeleton'
import type { IndicatorTone } from '../lib/tones'
import { dotColor, iconTint } from '../lib/tones'

const Kpi = ({ icon: Icon, label, value, tone, to }: {
  icon: LucideIcon; label: string; value: number; tone?: IndicatorTone; to?: string
}) => {
  const body = (
    <div className="flex h-full items-center gap-3 rounded-xl border border-gray-200 bg-white p-4 shadow-sm transition-shadow hover:shadow-md">
      <div className={`flex h-10 w-10 shrink-0 items-center justify-center rounded-lg ${iconTint[tone ?? 'blue']}`}>
        <Icon className="h-5 w-5" />
      </div>
      <div className="min-w-0">
        <p className="text-2xl font-bold leading-none text-gray-900">{value}</p>
        <p className="mt-1 text-xs font-medium text-gray-500">{label}</p>
      </div>
      {to && <ChevronRight className="ml-auto h-4 w-4 text-gray-300" />}
    </div>
  )
  return to ? <Link to={to}>{body}</Link> : body
}

const lifeBands: { key: 'verde' | 'amarillo' | 'naranja' | 'rojo'; label: string; range: string; tone: IndicatorTone }[] = [
  { key: 'verde', label: 'Verde', range: '0–49 ciclos', tone: 'green' },
  { key: 'amarillo', label: 'Amarillo', range: '50–99 ciclos', tone: 'yellow' },
  { key: 'naranja', label: 'Naranja', range: '100–149 ciclos', tone: 'orange' },
  { key: 'rojo', label: 'Rojo', range: '150+ ciclos', tone: 'red' },
]

const HoseHome = () => {
  // Totales calculados en la base (una sola consulta)
  const [stats, setStats] = useState<HoseStats | null>(null)

  useEffect(() => {
    hoseService.stats().then(setStats).catch((error) => console.error('Error cargando totales:', error))
  }, [])

  const n = (k: keyof Omit<HoseStats, 'life'>) => (stats ? Number(stats[k]) : 0)
  const lifeCounts = stats?.life ?? { verde: 0, amarillo: 0, naranja: 0, rojo: 0 }
  const active = n('active')
  const pct = (v: number) => (active > 0 ? Math.round((v / active) * 100) : 0)

  return (
    <div className="w-full space-y-6">
      <div>
        <p className="text-xs font-semibold uppercase tracking-widest text-gray-400">Resumen operativo</p>
        <h1 className="text-2xl font-bold text-gray-900">Inicio · Mangueras</h1>
      </div>

      <section>
        <h2 className="mb-3 text-sm font-semibold uppercase tracking-wide text-gray-500">Inventario</h2>
        {stats === null ? (
          <SkeletonStats count={6} />
        ) : (
          <div className="grid grid-cols-2 gap-3 lg:grid-cols-3 xl:grid-cols-6">
            <Kpi icon={Package} label="Productos" value={n('equipment')} to="/mangueras" />
            <Kpi icon={CheckCircle2} label="Mangueras activas" value={active} tone="green" />
            <Kpi icon={AlertTriangle} label="Posiciones sin manguera" value={n('without_hose')} tone="yellow" />
            <Kpi icon={OctagonAlert} label={`En el límite (${MAX_HOSE_CYCLES})`} value={n('at_limit')} tone="red" />
            <Kpi icon={Activity} label="Usos (30 días)" value={n('uses_30d')} tone="blue" />
            <Kpi icon={RefreshCw} label="Reemplazos y bajas (30 días)" value={n('replaced_30d')} tone="orange" />
          </div>
        )}
      </section>

      <section className="overflow-hidden rounded-xl border border-gray-200 bg-white shadow-sm">
        <div className="card-header flex-wrap">
          <div>
            <h2 className="text-base font-semibold text-gray-900">Semáforo de vida útil</h2>
            <p className="text-sm text-gray-500">Ciclos de uso por manguera activa (límite: {MAX_HOSE_CYCLES})</p>
          </div>
          <span className="inline-flex items-center gap-1.5 rounded-full bg-blue-50 px-2.5 py-1 text-xs font-medium text-blue-700 ring-1 ring-inset ring-blue-600/20">
            <Waves className="h-3.5 w-3.5" /> {active} mangueras activas
          </span>
        </div>
        <div className="p-5">
          {stats === null ? (
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
                  <div key={b.key} className="relative overflow-hidden rounded-lg border border-gray-200 p-3 pl-4">
                    <span className={`absolute inset-y-0 left-0 w-1 ${dotColor[b.tone]}`} />
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
        </div>
      </section>
    </div>
  )
}

export default HoseHome
