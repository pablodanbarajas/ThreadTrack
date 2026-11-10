import { useState } from 'react'
import type { LucideIcon } from 'lucide-react'
import { FileSpreadsheet, CalendarClock, History, ShieldCheck, KeyRound, Loader2, Waves } from 'lucide-react'
import { useAuth, useRole } from '../contexts/AuthContext'
import { useFeedback } from '../components/ui/feedback-context'
import { IconTile } from '../components/ui/StatusBadge'
import type { IndicatorTone } from '../lib/tones'
import { historyReportService, startOfDay, endOfDay } from '../services/historyReportService'

const today = () => new Date().toISOString().slice(0, 10)
const daysAgo = (n: number) => new Date(Date.now() - n * 86400000).toISOString().slice(0, 10)

type Job = 'status' | 'hoseStatus' | 'actions' | 'hoses' | 'audit' | 'access'

interface RangeReport {
  job: Job
  icon: LucideIcon
  title: string
  description: string
  adminOnly?: boolean
  tone: IndicatorTone
  run: (fromIso: string, toIso: string, email: string) => Promise<number>
}

const Reports = () => {
  const { user } = useAuth()
  const { isAdministrador, canViewReports, canViewPrendas, canViewMangueras } = useRole()
  const email = user?.email ?? ''
  const feedback = useFeedback()

  const [statusDate, setStatusDate] = useState(today())
  const [from, setFrom] = useState(daysAgo(30))
  const [to, setTo] = useState(today())
  const [running, setRunning] = useState<Job | null>(null)

  if (!canViewReports) {
    return <div className="card text-center text-gray-600">No tienes permisos para consultar reportes históricos.</div>
  }

  const run = async (job: Job, fn: () => Promise<number>) => {
    setRunning(job)
    try {
      const n = await fn()
      feedback.success(`Reporte generado (${n} registros)`)
    } catch (err) {
      feedback.error((err as Error).message || 'Error generando el reporte')
    } finally {
      setRunning(null)
    }
  }

  const rangeValid = !!from && !!to && from <= to

  const ExportButton = ({ job, onClick, disabled }: { job: Job; onClick: () => void; disabled?: boolean }) => (
    <button
      onClick={onClick}
      disabled={!!running || disabled}
      className="btn-excel flex shrink-0 items-center justify-center gap-2 text-sm disabled:opacity-50"
    >
      {running === job ? <Loader2 className="h-4 w-4 animate-spin" /> : <FileSpreadsheet className="h-4 w-4" />}
      Exportar Excel
    </button>
  )

  const pointReports: { job: Job; icon: LucideIcon; title: string; description: string; tone: IndicatorTone; run: (atIso: string, email: string) => Promise<number> }[] = [
    ...(canViewPrendas ? [{
      job: 'status' as Job, icon: CalendarClock, title: 'Estado del inventario de prendas', tone: 'green' as IndicatorTone,
      description: 'Estado de cada prenda y ciclos de lavado/esterilización acumulados.',
      run: historyReportService.exportInventoryStatusAt.bind(historyReportService),
    }] : []),
    ...(canViewMangueras ? [{
      job: 'hoseStatus' as Job, icon: CalendarClock, title: 'Estado de las mangueras', tone: 'green' as IndicatorTone,
      description: 'Estado de cada manguera (activa, reemplazada o baja) y ciclos de uso acumulados, por producto y calibre.',
      run: historyReportService.exportHoseStatusAt.bind(historyReportService),
    }] : []),
  ]

  const rangeReports: RangeReport[] = [
    ...(canViewPrendas ? [{
      job: 'actions' as Job, icon: History, title: 'Historial de acciones de prendas', tone: 'blue' as IndicatorTone,
      description: 'Lavados/esterilizaciones, inspecciones, reparaciones y bajas, con responsable, usuario que capturó y firma.',
      run: historyReportService.exportGarmentActions.bind(historyReportService),
    }] : []),
    ...(canViewMangueras ? [{
      job: 'hoses' as Job, icon: Waves, title: 'Historial de acciones de mangueras', tone: 'blue' as IndicatorTone,
      description: 'Usos (ciclos), inspecciones, reemplazos y bajas por equipo y calibre.',
      run: historyReportService.exportHoseActions.bind(historyReportService),
    }] : []),
    ...(isAdministrador ? [
      {
        job: 'audit' as Job, icon: ShieldCheck, title: 'Audit trail', adminOnly: true, tone: 'purple' as IndicatorTone,
        description: 'Todos los cambios: usuario, fecha y hora, valor anterior, valor nuevo y motivo.',
        run: historyReportService.exportAuditTrail.bind(historyReportService),
      },
      {
        job: 'access' as Job, icon: KeyRound, title: 'Bitácora de accesos y firmas', adminOnly: true, tone: 'purple' as IndicatorTone,
        description: 'Intentos de inicio de sesión (exitosos y fallidos) y firmas electrónicas emitidas.',
        run: historyReportService.exportAccessLog.bind(historyReportService),
      },
    ] : []),
  ]

  return (
    <div className="w-full space-y-5">
      <div>
        <h1 className="text-2xl font-bold text-gray-900">Reportes históricos</h1>
        <p className="text-sm text-gray-500">
          Se generan del historial inmutable. Cada archivo incluye quién lo generó, cuándo y con qué filtros.
        </p>
      </div>

      {/* Reportes a una fecha */}
      {pointReports.length > 0 && (
        <section className="overflow-hidden rounded-xl border border-gray-200 bg-white shadow-sm">
          <div className="card-header flex-col md:flex-row md:items-center">
            <div>
              <h2 className="font-semibold text-gray-900">Estado a una fecha</h2>
              <p className="text-xs text-gray-500">Reconstruido del historial al cierre del día elegido.</p>
            </div>
            <label className="flex items-center gap-2 text-sm text-gray-600">
              Fecha
              <input
                type="date"
                aria-label="Fecha del reporte"
                value={statusDate}
                max={today()}
                onChange={(e) => setStatusDate(e.target.value)}
                className="input-field w-auto bg-white py-1.5 text-sm"
              />
            </label>
          </div>
          <ul className="divide-y divide-gray-100">
            {pointReports.map((r) => (
              <li key={r.job} className="flex flex-col gap-3 px-4 py-3 md:flex-row md:items-center">
                <div className="flex min-w-0 flex-1 items-start gap-3">
                  <IconTile icon={r.icon} tone={r.tone} />
                  <div className="min-w-0">
                    <p className="font-medium text-gray-900">{r.title}</p>
                    <p className="text-sm text-gray-500">{r.description}</p>
                  </div>
                </div>
                <ExportButton job={r.job} disabled={!statusDate}
                  onClick={() => run(r.job, () => r.run(endOfDay(statusDate), email))} />
              </li>
            ))}
          </ul>
        </section>
      )}

      {/* Reportes por periodo */}
      {rangeReports.length > 0 && (
        <section className="overflow-hidden rounded-xl border border-gray-200 bg-white shadow-sm">
          <div className="card-header flex-col md:flex-row md:items-center">
            <div>
              <h2 className="font-semibold text-gray-900">Reportes por periodo</h2>
              <p className="text-xs text-gray-500">El rango de fechas se aplica a todos los reportes de esta lista.</p>
            </div>
            <div className="flex flex-wrap items-center gap-2 text-sm text-gray-600">
              <label className="flex items-center gap-2">
                Desde
                <input type="date" value={from} max={to} onChange={(e) => setFrom(e.target.value)} className="input-field w-auto bg-white py-1.5 text-sm" />
              </label>
              <label className="flex items-center gap-2">
                hasta
                <input type="date" value={to} min={from} max={today()} onChange={(e) => setTo(e.target.value)} className="input-field w-auto bg-white py-1.5 text-sm" />
              </label>
            </div>
          </div>
          {!rangeValid && (
            <p className="border-b border-gray-200 px-4 py-2 text-sm text-gray-600">
              La fecha inicial debe ser anterior o igual a la final.
            </p>
          )}

          <ul className="divide-y divide-gray-100">
            {rangeReports.map((r) => (
              <li key={r.job} className="flex flex-col gap-3 px-4 py-3 md:flex-row md:items-center">
                <div className="flex min-w-0 flex-1 items-start gap-3">
                  <IconTile icon={r.icon} tone={r.tone} />
                  <div className="min-w-0">
                    <p className="flex flex-wrap items-center gap-2 font-medium text-gray-900">
                      {r.title}
                      {r.adminOnly && (
                        <span className="rounded-full bg-violet-50 px-2 py-0.5 text-[11px] font-medium text-violet-700 ring-1 ring-inset ring-violet-600/20">
                          Solo administrador
                        </span>
                      )}
                    </p>
                    <p className="text-sm text-gray-500">{r.description}</p>
                  </div>
                </div>
                <ExportButton job={r.job} disabled={!rangeValid}
                  onClick={() => run(r.job, () => r.run(startOfDay(from), endOfDay(to), email))} />
              </li>
            ))}
          </ul>
        </section>
      )}
    </div>
  )
}

export default Reports
