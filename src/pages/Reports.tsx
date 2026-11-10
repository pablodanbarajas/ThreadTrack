import { useState } from 'react'
import type { LucideIcon } from 'lucide-react'
import { FileSpreadsheet, CalendarClock, History, ShieldCheck, KeyRound, Loader2, Waves } from 'lucide-react'
import { useAuth, useRole } from '../contexts/AuthContext'
import { useFeedback } from '../components/ui/feedback-context'
import { historyReportService, startOfDay, endOfDay } from '../services/historyReportService'

const today = () => new Date().toISOString().slice(0, 10)
const daysAgo = (n: number) => new Date(Date.now() - n * 86400000).toISOString().slice(0, 10)

type Job = 'status' | 'actions' | 'hoses' | 'audit' | 'access'

interface RangeReport {
  job: Job
  icon: LucideIcon
  title: string
  description: string
  adminOnly?: boolean
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
    } catch (err: any) {
      feedback.error(err.message || 'Error generando el reporte')
    } finally {
      setRunning(null)
    }
  }

  const rangeValid = !!from && !!to && from <= to

  const ExportButton = ({ job, onClick, disabled }: { job: Job; onClick: () => void; disabled?: boolean }) => (
    <button
      onClick={onClick}
      disabled={!!running || disabled}
      className="btn-secondary flex shrink-0 items-center justify-center gap-2 text-sm disabled:opacity-50"
    >
      {running === job ? <Loader2 className="h-4 w-4 animate-spin" /> : <FileSpreadsheet className="h-4 w-4 text-gray-500" />}
      Exportar Excel
    </button>
  )

  const rangeReports: RangeReport[] = [
    ...(canViewPrendas ? [{
      job: 'actions' as Job, icon: History, title: 'Historial de acciones de prendas',
      description: 'Lavados/esterilizaciones, inspecciones, reparaciones y bajas, con responsable, usuario que capturó y firma.',
      run: historyReportService.exportGarmentActions.bind(historyReportService),
    }] : []),
    ...(canViewMangueras ? [{
      job: 'hoses' as Job, icon: Waves, title: 'Historial de acciones de mangueras',
      description: 'Usos (ciclos), inspecciones, reemplazos y bajas por equipo y calibre.',
      run: historyReportService.exportHoseActions.bind(historyReportService),
    }] : []),
    ...(isAdministrador ? [
      {
        job: 'audit' as Job, icon: ShieldCheck, title: 'Audit trail', adminOnly: true,
        description: 'Todos los cambios: usuario, fecha y hora, valor anterior, valor nuevo y motivo.',
        run: historyReportService.exportAuditTrail.bind(historyReportService),
      },
      {
        job: 'access' as Job, icon: KeyRound, title: 'Bitácora de accesos y firmas', adminOnly: true,
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

      {/* Reporte a una fecha */}
      {canViewPrendas && (
        <section className="flex flex-col gap-4 rounded-xl border border-gray-200 bg-white p-4 md:flex-row md:items-center">
          <div className="flex min-w-0 flex-1 items-start gap-3">
            <div className="flex h-9 w-9 shrink-0 items-center justify-center rounded-lg bg-gray-100 text-gray-600">
              <CalendarClock className="h-5 w-5" />
            </div>
            <div className="min-w-0">
              <h2 className="font-semibold text-gray-900">Estado del inventario en una fecha</h2>
              <p className="text-sm text-gray-500">Estado de cada prenda y ciclos acumulados al cierre del día elegido.</p>
            </div>
          </div>
          <div className="flex items-center gap-2">
            <input
              type="date"
              aria-label="Fecha del reporte"
              value={statusDate}
              max={today()}
              onChange={(e) => setStatusDate(e.target.value)}
              className="input-field w-auto py-1.5 text-sm"
            />
            <ExportButton job="status" disabled={!statusDate}
              onClick={() => run('status', () => historyReportService.exportInventoryStatusAt(endOfDay(statusDate), email))} />
          </div>
        </section>
      )}

      {/* Reportes por periodo */}
      {rangeReports.length > 0 && (
        <section className="overflow-hidden rounded-xl border border-gray-200 bg-white">
          <div className="flex flex-col gap-3 border-b border-gray-200 bg-gray-50 px-4 py-3 md:flex-row md:items-center md:justify-between">
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
                  <div className="flex h-9 w-9 shrink-0 items-center justify-center rounded-lg bg-gray-100 text-gray-600">
                    <r.icon className="h-5 w-5" />
                  </div>
                  <div className="min-w-0">
                    <p className="flex flex-wrap items-center gap-2 font-medium text-gray-900">
                      {r.title}
                      {r.adminOnly && (
                        <span className="rounded-full border border-gray-200 px-2 py-0.5 text-[11px] font-medium text-gray-500">
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
