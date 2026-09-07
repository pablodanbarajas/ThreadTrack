import { useEffect, useState } from 'react'
import { useParams, Link } from 'react-router-dom'
import { ArrowLeft, Waves, Replace, ChevronDown, ChevronUp, Loader2, Download } from 'lucide-react'
import { useRole } from '../contexts/AuthContext'
import { useHoseCache } from '../contexts/HoseCacheContext'
import { hoseService } from '../services/hoseService'
import { getHoseLifePercent, getHoseLifeStatus } from '../lib/hoseLifeStatus'
import { generateHoseDetailExcel } from '../services/reportService'
import type { HoseLifeStatus } from '../lib/hoseLifeStatus'
import type { Hose, HosePositionWithDetails, Equipment, HoseAction } from '../types'

const lifeStatusStyles: Record<HoseLifeStatus, { label: string; bar: string; text: string }> = {
  verde: { label: 'Verde', bar: 'bg-green-500', text: 'text-green-700' },
  amarillo: { label: 'Amarillo', bar: 'bg-yellow-400', text: 'text-yellow-700' },
  naranja: { label: 'Naranja', bar: 'bg-orange-500', text: 'text-orange-700' },
  rojo: { label: 'Rojo', bar: 'bg-red-500', text: 'text-red-700' },
}

const ActionRow = ({ action }: { action: HoseAction }) => (
  <li className="py-2 text-sm flex justify-between">
    <div>
      <span className="font-medium capitalize">{action.action_type}</span>
      {action.cycle_after !== undefined && action.cycle_after !== null && (
        <span className="text-gray-500"> — ciclo {action.cycle_after}</span>
      )}
      {action.notes && <span className="text-gray-500"> — {action.notes}</span>}
    </div>
    <div className="text-right text-gray-500">
      <div>{action.performed_by}</div>
      <div>{new Date(action.created_at).toLocaleString()}</div>
    </div>
  </li>
)

const HoseDetail = () => {
  const { positionId } = useParams<{ positionId: string }>()
  const { canReplaceHose } = useRole()
  const { invalidateEquipment } = useHoseCache()

  const [position, setPosition] = useState<(HosePositionWithDetails & { equipment?: Equipment }) | null>(null)
  const [actions, setActions] = useState<HoseAction[]>([])
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)

  const [expandedHoseId, setExpandedHoseId] = useState<string | null>(null)
  const [historyActions, setHistoryActions] = useState<Record<string, HoseAction[]>>({})
  const [loadingHistoryId, setLoadingHistoryId] = useState<string | null>(null)
  const [showFullActiveHistory, setShowFullActiveHistory] = useState(false)

  const [showReplaceModal, setShowReplaceModal] = useState(false)
  const [responsible, setResponsible] = useState('')
  const [notes, setNotes] = useState('')
  const [submitting, setSubmitting] = useState(false)
  const [modalError, setModalError] = useState<string | null>(null)
  const [exporting, setExporting] = useState(false)

  const loadData = async () => {
    if (!positionId) return
    setLoading(true)
    setError(null)
    try {
      const data = await hoseService.getPositionById(positionId)
      if (!data) throw new Error('Posición no encontrada')
      setPosition(data)
      if (data.activeHose) {
        setActions(await hoseService.getHoseActions(data.activeHose.id))
      } else {
        setActions([])
      }
    } catch (err: any) {
      setError(err.message || 'Error cargando la manguera')
    } finally {
      setLoading(false)
    }
  }

  useEffect(() => {
    loadData()
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [positionId])

  const openModal = (type: 'use' | 'replace') => {
    setResponsible('')
    setNotes(type === 'use' ? 'Lavado y Esterilización' : '')
    setModalError(null)
    if (type === 'replace') setShowReplaceModal(true)
  }

  const handleReplace = async (e: React.FormEvent) => {
    e.preventDefault()
    if (!position) return
    setSubmitting(true)
    setModalError(null)
    try {
      if (!notes.trim()) throw new Error('Indica el motivo del reemplazo')
      await hoseService.replaceHose(position.id, notes, responsible)
      invalidateEquipment()
      setShowReplaceModal(false)
      await loadData()
    } catch (err: any) {
      setModalError(err.message || 'Error al reemplazar la manguera')
    } finally {
      setSubmitting(false)
    }
  }

  const toggleHoseHistory = async (hoseId: string) => {
    if (expandedHoseId === hoseId) {
      setExpandedHoseId(null)
      return
    }
    setExpandedHoseId(hoseId)
    if (!historyActions[hoseId]) {
      setLoadingHistoryId(hoseId)
      try {
        const data = await hoseService.getHoseActions(hoseId)
        setHistoryActions((prev) => ({ ...prev, [hoseId]: data }))
      } finally {
        setLoadingHistoryId(null)
      }
    }
  }

  const handleExport = async () => {
    if (!position) return
    setExporting(true)
    setError(null)
    try {
      const allHistoryActions: Record<string, HoseAction[]> = {}
      for (const hose of position.history || []) {
        if (hose.id !== position.activeHose?.id) {
          allHistoryActions[hose.id] = await hoseService.getHoseActions(hose.id)
        }
      }
      await generateHoseDetailExcel(position, actions, allHistoryActions)
    } catch (err: any) {
      setError(err.message || 'Error al exportar la información')
    } finally {
      setExporting(false)
    }
  }

  if (loading) return <div className="text-center py-12 text-gray-500">Cargando...</div>
  if (error || !position) return <div className="text-center py-12 text-red-600">{error || 'Posición no encontrada'}</div>

  const activeHose = position.activeHose
  const cycle = activeHose?.current_cycle ?? 0
  const status = getHoseLifeStatus(cycle)
  const style = lifeStatusStyles[status]
  const percent = getHoseLifePercent(cycle)
  const replacedHoses = (position.history || []).filter((h: Hose) => h.id !== activeHose?.id)

  return (
    <div className="w-full pb-20 md:pb-0">
      <div className="flex items-center justify-between gap-3 mb-4">
        <Link to="/mangueras" className="inline-flex items-center gap-1 text-blue-600 hover:underline">
          <ArrowLeft className="w-4 h-4" /> Volver a Mangueras
        </Link>
        <button onClick={handleExport} className="btn-secondary flex items-center gap-2" disabled={exporting}>
          {exporting ? <Loader2 className="w-4 h-4 animate-spin" /> : <Download className="w-4 h-4" />}
          Exportar
        </button>
      </div>

      <div className="flex items-center gap-3 mb-6">
        <Waves className="w-8 h-8 text-blue-600" />
        <div>
          <h1 className="text-2xl font-bold text-gray-800">
            {position.equipment?.name} — Calibre {position.caliber}
          </h1>
          <p className="text-sm text-gray-500">
            {position.equipment?.code}
            {position.length && ` · Longitud: ${position.length}`}
          </p>
        </div>
      </div>

      <div className="card mb-6">
        {activeHose ? (
          <>
            <div className="flex items-center justify-between mb-3">
              <div>
                <p className="text-sm text-gray-500">Manguera activa · Código</p>
                <p className="text-lg font-mono font-semibold text-gray-800">{activeHose.short_code}</p>
              </div>
              <span className={`text-sm font-semibold ${style.text}`}>{style.label}</span>
            </div>
            <div className="w-full h-2 bg-gray-100 rounded-full overflow-hidden mb-2">
              <div className={`h-full ${style.bar}`} style={{ width: `${percent}%` }} />
            </div>
            <p className="text-sm text-gray-600 mb-4">{cycle} / 200 ciclos</p>

            <div className="flex flex-wrap gap-3">
              {canReplaceHose && (
                <button onClick={() => openModal('replace')} className="btn-secondary flex items-center gap-2 text-red-700">
                  <Replace className="w-4 h-4" /> Reemplazar
                </button>
              )}
            </div>
          </>
        ) : (
          <p className="text-gray-500">Esta posición no tiene manguera activa</p>
        )}
      </div>

      {activeHose && (
        <div className="card mb-6">
          <h2 className="font-semibold text-gray-700 mb-3">Historial de esta manguera</h2>
          {actions.length === 0 ? (
            <p className="text-sm text-gray-500">Sin registros aún</p>
          ) : (
            <>
              <ul className="divide-y divide-gray-100">
                {actions.slice(0, 3).map((action) => (
                  <ActionRow key={action.id} action={action} />
                ))}
              </ul>
              {actions.length > 3 && (
                <>
                  <button
                    onClick={() => setShowFullActiveHistory((prev) => !prev)}
                    className="flex items-center gap-1 text-sm text-blue-600 hover:underline mt-2"
                  >
                    {showFullActiveHistory ? (
                      <>Ocultar historial anterior <ChevronUp className="w-4 h-4" /></>
                    ) : (
                      <>Ver {actions.length - 3} registro{actions.length - 3 === 1 ? '' : 's'} anterior{actions.length - 3 === 1 ? '' : 'es'} <ChevronDown className="w-4 h-4" /></>
                    )}
                  </button>
                  {showFullActiveHistory && (
                    <ul className="divide-y divide-gray-100 mt-2">
                      {actions.slice(3).map((action) => (
                        <ActionRow key={action.id} action={action} />
                      ))}
                    </ul>
                  )}
                </>
              )}
            </>
          )}
        </div>
      )}

      {replacedHoses.length > 0 && (
        <div className="card">
          <h2 className="font-semibold text-gray-700 mb-3">Mangueras reemplazadas en esta posición</h2>
          <ul className="divide-y divide-gray-100">
            {replacedHoses.map((hose) => {
              const isExpanded = expandedHoseId === hose.id
              const cycles = historyActions[hose.id]
              return (
                <li key={hose.id} className="py-2 text-sm">
                  <button
                    onClick={() => toggleHoseHistory(hose.id)}
                    className="w-full flex items-center justify-between text-left"
                  >
                    <div>
                      <span className="font-mono font-medium">{hose.short_code}</span>
                      <span className="text-gray-500"> — {hose.current_cycle} ciclos al momento de la baja</span>
                      {hose.baja_reason && <span className="text-gray-500"> ({hose.baja_reason})</span>}
                    </div>
                    <div className="flex items-center gap-2 text-gray-500 flex-shrink-0">
                      <span>{hose.baja_date ? new Date(hose.baja_date).toLocaleDateString() : ''}</span>
                      {isExpanded ? <ChevronUp className="w-4 h-4" /> : <ChevronDown className="w-4 h-4" />}
                    </div>
                  </button>

                  {isExpanded && (
                    <div className="mt-2 pl-3 border-l-2 border-gray-200">
                      {loadingHistoryId === hose.id ? (
                        <div className="flex items-center gap-2 text-gray-500 py-2">
                          <Loader2 className="w-4 h-4 animate-spin" /> Cargando ciclos...
                        </div>
                      ) : !cycles || cycles.length === 0 ? (
                        <p className="text-gray-500 py-2">Sin registros de ciclos para esta manguera</p>
                      ) : (
                        <ul className="divide-y divide-gray-100">
                          {cycles.map((cycleAction) => (
                            <ActionRow key={cycleAction.id} action={cycleAction} />
                          ))}
                        </ul>
                      )}
                    </div>
                  )}
                </li>
              )
            })}
          </ul>
        </div>
      )}

      {showReplaceModal && (
        <div className="fixed inset-0 bg-black/40 flex items-center justify-center p-4 z-50">
          <div className="bg-white rounded-xl p-6 w-full max-w-md">
            <h2 className="text-lg font-semibold mb-4">Reemplazar manguera</h2>
            <p className="text-sm text-gray-500 mb-3">
              La manguera actual quedará dada de baja conservando su historial. Se creará una manguera nueva en esta posición con el ciclo en 0.
            </p>
            {modalError && <div className="mb-3 p-2 bg-red-50 border border-red-200 rounded-lg text-sm text-red-700">{modalError}</div>}
            <form onSubmit={handleReplace} className="space-y-3">
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1">Responsable *</label>
                <input value={responsible} onChange={(e) => setResponsible(e.target.value)} className="input-field" required />
              </div>
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1">Motivo del reemplazo *</label>
                <textarea value={notes} onChange={(e) => setNotes(e.target.value)} className="input-field" rows={2} required />
              </div>
              <div className="flex gap-3 pt-2">
                <button type="button" onClick={() => setShowReplaceModal(false)} className="btn-secondary flex-1">Cancelar</button>
                <button type="submit" className="btn-primary flex items-center justify-center gap-2 flex-1" disabled={submitting || !responsible.trim() || !notes.trim()}>
                  <Replace className="w-4 h-4" /> {submitting ? 'Reemplazando...' : 'Reemplazar'}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}
    </div>
  )
}

export default HoseDetail
