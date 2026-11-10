import { useState } from 'react'
import { FileSpreadsheet, CalendarClock, History, ShieldCheck, KeyRound, Loader2, Waves } from 'lucide-react'
import { useAuth, useRole } from '../contexts/AuthContext'
import { historyReportService, startOfDay, endOfDay } from '../services/historyReportService'

const today = () => new Date().toISOString().slice(0, 10)
const daysAgo = (n: number) => new Date(Date.now() - n * 86400000).toISOString().slice(0, 10)

type Job = 'status' | 'actions' | 'hoses' | 'audit' | 'access'

const Reports = () => {
  const { user } = useAuth()
  const { isAdministrador, canViewReports, canViewPrendas, canViewMangueras } = useRole()
  const email = user?.email ?? ''

  const [statusDate, setStatusDate] = useState(today())
  const [from, setFrom] = useState(daysAgo(30))
  const [to, setTo] = useState(today())
  const [running, setRunning] = useState<Job | null>(null)
  const [message, setMessage] = useState<{ type: 'ok' | 'error'; text: string } | null>(null)

  if (!canViewReports) {
    return <div className="card p-6 text-center text-gray-600">No tienes permisos para consultar reportes históricos.</div>
  }

  const run = async (job: Job, fn: () => Promise<number>) => {
    setRunning(job)
    setMessage(null)
    try {
      const n = await fn()
      setMessage({ type: 'ok', text: `Reporte generado (${n} registros).` })
    } catch (err: any) {
      setMessage({ type: 'error', text: err.message || 'Error generando el reporte' })
    } finally {
      setRunning(null)
    }
  }

  const rangeValid = from && to && from <= to

  const Btn = ({ job, onClick, disabled }: { job: Job; onClick: () => void; disabled?: boolean }) => (
    <button onClick={onClick} disabled={!!running || disabled} className="btn-primary flex items-center justify-center gap-2 disabled:opacity-50">
      {running === job ? <Loader2 className="w-4 h-4 animate-spin" /> : <FileSpreadsheet className="w-4 h-4" />}
      Exportar Excel
    </button>
  )

  return (
    <div className="w-full pb-20 md:pb-0 space-y-6">
      <div className="flex items-center gap-3">
        <History className="w-8 h-8 text-blue-600" />
        <div>
          <h1 className="text-2xl font-bold text-gray-800">Reportes históricos</h1>
          <p className="text-sm text-gray-500">Generados a partir del historial inmutable. Cada archivo incluye quién lo generó y cuándo.</p>
        </div>
      </div>

      {message && (
        <div className={`p-3 rounded-lg text-sm border ${message.type === 'ok' ? 'bg-green-50 border-green-200 text-green-800' : 'bg-red-50 border-red-200 text-red-700'}`}>
          {message.text}
        </div>
      )}

      {canViewPrendas && (
        <section className="card p-5 space-y-3">
          <h2 className="font-semibold text-gray-800 flex items-center gap-2"><CalendarClock className="w-5 h-5 text-blue-600" /> Estado del inventario en una fecha</h2>
          <p className="text-sm text-gray-500">Estado de cada prenda y ciclos de lavado/esterilización acumulados al cierre del día seleccionado.</p>
          <div className="flex flex-col sm:flex-row gap-3 sm:items-end">
            <label className="text-sm text-gray-700">
              Fecha
              <input type="date" value={statusDate} max={today()} onChange={(e) => setStatusDate(e.target.value)} className="input-field mt-1" />
            </label>
            <Btn job="status" disabled={!statusDate} onClick={() => run('status', () => historyReportService.exportInventoryStatusAt(endOfDay(statusDate), email))} />
          </div>
        </section>
      )}

      <section className="card p-5 space-y-3">
        <h2 className="font-semibold text-gray-800">Periodo para los reportes siguientes</h2>
        <div className="flex flex-col sm:flex-row gap-3">
          <label className="text-sm text-gray-700">
            Desde
            <input type="date" value={from} max={to} onChange={(e) => setFrom(e.target.value)} className="input-field mt-1" />
          </label>
          <label className="text-sm text-gray-700">
            Hasta
            <input type="date" value={to} min={from} max={today()} onChange={(e) => setTo(e.target.value)} className="input-field mt-1" />
          </label>
        </div>
        {!rangeValid && <p className="text-sm text-red-600">La fecha inicial debe ser anterior o igual a la final.</p>}
      </section>

      {canViewPrendas && (
        <section className="card p-5 space-y-3">
          <h2 className="font-semibold text-gray-800 flex items-center gap-2"><History className="w-5 h-5 text-blue-600" /> Historial de acciones de prendas</h2>
          <p className="text-sm text-gray-500">Lavados/esterilizaciones, inspecciones, reparaciones y bajas, con responsable, usuario que capturó y firma electrónica.</p>
          <Btn job="actions" disabled={!rangeValid} onClick={() => run('actions', () => historyReportService.exportGarmentActions(startOfDay(from), endOfDay(to), email))} />
        </section>
      )}

      {canViewMangueras && (
        <section className="card p-5 space-y-3">
          <h2 className="font-semibold text-gray-800 flex items-center gap-2"><Waves className="w-5 h-5 text-blue-600" /> Historial de acciones de mangueras</h2>
          <p className="text-sm text-gray-500">Usos (ciclos), inspecciones, reemplazos y bajas por equipo y calibre.</p>
          <Btn job="hoses" disabled={!rangeValid} onClick={() => run('hoses', () => historyReportService.exportHoseActions(startOfDay(from), endOfDay(to), email))} />
        </section>
      )}

      {isAdministrador && (
        <>
          <section className="card p-5 space-y-3 border-l-4 border-purple-400">
            <h2 className="font-semibold text-gray-800 flex items-center gap-2"><ShieldCheck className="w-5 h-5 text-purple-600" /> Audit trail del sistema</h2>
            <p className="text-sm text-gray-500">Todos los cambios: usuario, fecha y hora, valor anterior, valor nuevo y motivo.</p>
            <Btn job="audit" disabled={!rangeValid} onClick={() => run('audit', () => historyReportService.exportAuditTrail(startOfDay(from), endOfDay(to), email))} />
          </section>

          <section className="card p-5 space-y-3 border-l-4 border-purple-400">
            <h2 className="font-semibold text-gray-800 flex items-center gap-2"><KeyRound className="w-5 h-5 text-purple-600" /> Bitácora de accesos y firmas electrónicas</h2>
            <p className="text-sm text-gray-500">Intentos de inicio de sesión (exitosos y fallidos) y firmas electrónicas emitidas.</p>
            <Btn job="access" disabled={!rangeValid} onClick={() => run('access', () => historyReportService.exportAccessLog(startOfDay(from), endOfDay(to), email))} />
          </section>
        </>
      )}
    </div>
  )
}

export default Reports
