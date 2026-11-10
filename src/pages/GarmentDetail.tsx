import { useState, useEffect } from 'react'
import { useParams, Link } from 'react-router-dom'
import { AlertCircle, Home, ArrowLeft, Droplets, Scissors, ClipboardCheck, PackageX, PackageCheck, X, Pencil, ShieldCheck, FileSpreadsheet } from 'lucide-react'
import { garmentService } from '../services/garmentService'
import SignatureField from '../components/SignatureField'
import { garmentSignatureMeaning } from '../lib/signature'
import { signatureService } from '../services/accessService'
import { documentService } from '../services/documentService'
import { parseGarmentCode } from '../lib/garmentCodeParser'
import { getCycleCount } from '../lib/lifeStatus'
import { useRole, useAuth } from '../contexts/AuthContext'
import { StatusBadge, StatusDot, Notice } from '../components/ui/StatusBadge'
import { Skeleton, SkeletonPanel } from '../components/ui/Skeleton'
import { garmentStatusTone, garmentStatusLabel } from '../lib/tones'
import { historyReportService, describeChanges } from '../services/historyReportService'
import { useGarmentCache } from '../contexts/GarmentCacheContext'
import type { Garment, Document, GarmentAction, ActionType, InspectionResult, AuditLogEntry } from '../types'

const auditOpLabel: Record<string, string> = { INSERT: 'Alta', UPDATE: 'Modificación', DELETE: 'Eliminación' }
const auditTableLabel: Record<string, string> = {
  garments: 'Prenda', garment_actions: 'Acción', movements: 'Movimiento',
  documents: 'Documento', garment_assignments: 'Asignación',
}

const GarmentDetail = () => {
  const { id } = useParams<{ id: string }>()
  const { canEditGarment, canViewReports } = useRole()
  const { user } = useAuth()
  const [auditTrail, setAuditTrail] = useState<AuditLogEntry[] | null>(null)
  const [auditLoading, setAuditLoading] = useState(false)
  const [auditError, setAuditError] = useState<string | null>(null)
  const { invalidateGarments } = useGarmentCache()
  const [garment, setGarment] = useState<Garment | null>(null)
  const [documents, setDocuments] = useState<Document[]>([])
  const [actions, setActions] = useState<GarmentAction[]>([])
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)
  const [showActionModal, setShowActionModal] = useState(false)
  const [actionType, setActionType] = useState<ActionType>('lavado')
  const [inspectionResult, setInspectionResult] = useState<InspectionResult>('aprobado')
  const [actionNotes, setActionNotes] = useState('')
  const [actionResponsible, setActionResponsible] = useState('')
  const [actionLoading, setActionLoading] = useState(false)
  const [actionError, setActionError] = useState<string | null>(null)
  const [signaturePassword, setSignaturePassword] = useState('')

  // Edit modal state
  const [showEditModal, setShowEditModal] = useState(false)
  const [editForm, setEditForm] = useState({ name: '', description: '', client_name: '', client_phone: '', notes: '', reason: '' })
  const [editLoading, setEditLoading] = useState(false)
  const [editError, setEditError] = useState<string | null>(null)

  useEffect(() => {
    loadGarmentData()
  }, [id])

  const loadAuditTrail = async () => {
    if (!id) return
    setAuditLoading(true)
    setAuditError(null)
    try {
      setAuditTrail(await garmentService.getAuditTrail(id))
    } catch (err: any) {
      setAuditError(err.message || 'No se pudo cargar el audit trail')
    } finally {
      setAuditLoading(false)
    }
  }

  const loadGarmentData = async () => {
    if (!id) {
      setError('ID de prenda no válido')
      setLoading(false)
      return
    }

    try {
      setLoading(true)
      setError(null)

      // Obtener prenda
      const foundGarment = await garmentService.getById(id)
      if (!foundGarment) {
        setError('Prenda no encontrada')
        setLoading(false)
        return
      }

      setGarment(foundGarment)

      // Obtener documentos
      const docs = await documentService.getByGarmentId(id)

      // Obtener acciones
      const garmentActions = await garmentService.getActions(id)
      setActions(garmentActions)
      setDocuments(docs)
    } catch (err: any) {
      console.error('Error:', err)
      setError(err.message || 'Error al cargar la prenda')
    } finally {
      setLoading(false)
    }
  }


  const openActionModal = (type: ActionType) => {
    setActionType(type)
    setActionNotes('')
    setActionResponsible('')
    setInspectionResult('aprobado')
    setActionError(null)
    setSignaturePassword('')
    setShowActionModal(true)
  }

  const openEditModal = () => {
    if (!garment) return
    setEditForm({
      name: garment.name,
      description: garment.description ?? '',
      client_name: garment.client_name ?? '',
      client_phone: garment.client_phone ?? '',
      notes: garment.notes ?? '',
      reason: '',
    })
    setEditError(null)
    setShowEditModal(true)
  }

  const handleEditSave = async () => {
    if (!garment) return
    if (!editForm.name.trim()) { setEditError('El nombre es obligatorio'); return }
    if (!editForm.reason.trim()) { setEditError('El motivo del cambio es obligatorio'); return }
    setEditLoading(true)
    setEditError(null)
    try {
      await garmentService.update(garment.id, {
        name: editForm.name.trim(),
        description: editForm.description.trim() || undefined,
        client_name: editForm.client_name.trim() || undefined,
        client_phone: editForm.client_phone.trim() || undefined,
        notes: editForm.notes.trim() || undefined,
      }, editForm.reason.trim())
      invalidateGarments()
      setShowEditModal(false)
      await loadGarmentData()
    } catch (err: any) {
      setEditError(err.message || 'Error al guardar los cambios')
    } finally {
      setEditLoading(false)
    }
  }

  const signatureMeaning = garmentSignatureMeaning(actionType, actionType === 'inspeccion' ? inspectionResult : undefined)

  const handleAction = async () => {
    if (!garment) return
    setActionLoading(true)
    setActionError(null)
    try {
      const signatureToken = signatureMeaning ? await signatureService.sign(signaturePassword) : undefined
      await garmentService.registerAction(garment.id, actionType, {
        result: actionType === 'inspeccion' ? inspectionResult : undefined,
        notes: actionNotes || undefined,
        responsible: actionResponsible,
        signatureToken,
      })
      invalidateGarments()
      setShowActionModal(false)
      setSignaturePassword('')
      await loadGarmentData()
    } catch (err: any) {
      console.error('Error registrando acción:', err)
      setActionError(err.message || 'Error al registrar la acción')
    } finally {
      setActionLoading(false)
    }
  }

  if (loading) {
    return (
      <div className="w-full space-y-4">
        <Skeleton className="h-4 w-20" />
        <div className="rounded-xl border border-gray-200 bg-white p-6">
          <Skeleton className="h-7 w-64" />
          <Skeleton className="mt-2 h-4 w-40" />
        </div>
        <div className="grid gap-4 lg:grid-cols-2">
          <SkeletonPanel lines={5} />
          <SkeletonPanel lines={5} />
        </div>
      </div>
    )
  }

  if (error || !garment) {
    return (
      <div className="flex items-center justify-center py-16">
        <div className="bg-white rounded-xl border border-gray-200 p-8 max-w-md w-full">
          <div className="flex items-center gap-3 mb-4">
            <AlertCircle className="w-6 h-6 text-red-600" />
            <h1 className="text-xl font-bold text-gray-800">Error</h1>
          </div>
          <p className="text-gray-600 mb-6">{error || 'Prenda no encontrada'}</p>
          <Link
            to="/"
            className="inline-flex items-center gap-2 px-4 py-2 bg-blue-600 text-white rounded-lg hover:bg-blue-700 transition-colors"
          >
            <Home className="w-5 h-5" />
            Ir al inicio
          </Link>
        </div>
      </div>
    )
  }

  return (
    <div className="w-full">
      <div className="max-w-6xl">
        {/* Back link */}
        <div className="mb-2 md:mb-4">
          <Link to="/inventory" className="inline-flex items-center gap-1.5 text-gray-500 hover:text-gray-900 transition-colors text-sm">
            <ArrowLeft className="w-4 h-4" />
            Volver
          </Link>
        </div>

        {/* Header card – full width */}
        <div className="bg-white rounded-xl border border-gray-200 overflow-hidden mb-2 md:mb-4">
          <div className="p-3 md:p-6">
            <div className="flex items-start justify-between gap-2">
              <div className="min-w-0">
                <h1 className="text-lg md:text-2xl font-bold leading-tight break-words text-gray-900">{garment.name}</h1>
                <p className="text-gray-500 text-xs md:text-sm mt-0.5">Código: <span className="font-mono font-semibold">{garment.code}</span></p>
                {garment.short_code && (
                  <p className="text-gray-500 text-xs mt-1">
                    Código corto: <span className="font-mono font-bold text-gray-900 border border-gray-200 px-2 py-0.5 rounded-md tracking-wider">{garment.short_code}</span>
                  </p>
                )}
              </div>
              <div className="flex items-center gap-2 shrink-0">
                <StatusBadge tone={garmentStatusTone[garment.status] ?? 'gray'}>
                  {garmentStatusLabel[garment.status] ?? garment.status}
                </StatusBadge>
                {canEditGarment && (
                  <button
                    onClick={openEditModal}
                    className="flex items-center gap-1.5 px-2.5 py-1.5 border border-gray-200 hover:bg-gray-50 text-gray-700 rounded-lg transition-colors text-xs font-medium"
                    title="Editar prenda"
                  >
                    <Pencil className="w-3.5 h-3.5" />
                    Editar
                  </button>
                )}
              </div>
            </div>
            {garment.client_name && (
              <div className="mt-2 pt-2 border-t border-gray-100 flex flex-wrap gap-x-6 gap-y-1 text-gray-600">
                <div className="flex items-center gap-1.5">
                  <span className="text-blue-200 text-xs">Cliente:</span>
                  <span className="text-white text-xs font-semibold">{garment.client_name}</span>
                </div>
                {garment.client_phone && (
                  <div className="flex items-center gap-1.5">
                    <span className="text-blue-200 text-xs">Tel. cliente:</span>
                    <span className="text-white text-xs font-semibold">{garment.client_phone}</span>
                  </div>
                )}
              </div>
            )}
          </div>
        </div>

        {/* Two-column layout on desktop */}
        <div className="grid md:grid-cols-2 gap-2 md:gap-4 items-start">

          {/* ── LEFT COLUMN ── */}
          <div className="space-y-2 md:space-y-4">

            {/* Información del código */}
            {(() => {
              const parsed = parseGarmentCode(garment.code)
              if (!parsed.valid) return null
              return (
                <div className="bg-white rounded-xl border border-gray-200 p-3 md:p-5">
                  <h3 className="font-semibold text-indigo-900 text-sm md:text-base mb-2">Información del Código</h3>
                  <div className="grid grid-cols-3 md:grid-cols-2 gap-1.5 md:gap-3">
                    <div className="border border-gray-200 p-2 md:p-3 rounded-lg">
                      <p className="text-xs text-gray-500 font-medium">Prenda</p>
                      <p className="text-xs md:text-sm font-semibold text-gray-800 leading-tight">{parsed.garmentName}</p>
                      <p className="text-xs text-gray-400">{parsed.garmentType}</p>
                    </div>
                    <div className="border border-gray-200 p-2 md:p-3 rounded-lg">
                      <p className="text-xs text-gray-500 font-medium">Talla</p>
                      <p className="text-xs md:text-sm font-semibold text-gray-800 leading-tight">{parsed.sizeName}</p>
                      <p className="text-xs text-gray-400">{parsed.size}</p>
                    </div>
                    <div className="border border-gray-200 p-2 md:p-3 rounded-lg">
                      <p className="text-xs text-gray-500 font-medium">Color</p>
                      <p className="text-xs md:text-sm font-semibold text-gray-800 leading-tight">{parsed.colorName}</p>
                      <p className="text-xs text-gray-400">{parsed.color}</p>
                    </div>
                    <div className="border border-gray-200 p-2 md:p-3 rounded-lg">
                      <p className="text-xs text-gray-500 font-medium">Lote</p>
                      <p className="text-xs md:text-sm font-semibold text-gray-800 leading-tight">{parsed.batchCode} <span className="text-gray-400">#{parsed.sequenceNumber.toString().padStart(3, '0')}</span></p>
                    </div>
                    <div className="border border-gray-200 p-2 md:p-3 rounded-lg">
                      <p className="text-xs text-gray-500 font-medium">Mes del Lote</p>
                      <p className="text-xs md:text-sm font-semibold text-gray-800 leading-tight">
                        {new Date(parsed.batchYear, parsed.batchMonth - 1).toLocaleDateString('es-ES', { month: 'short', year: 'numeric' })}
                      </p>
                    </div>
                    <div className="border border-gray-200 p-2 md:p-3 rounded-lg">
                      <p className="text-xs text-gray-500 font-medium">Código</p>
                      <p className="text-xs font-mono font-semibold text-gray-800 break-all leading-tight">{parsed.fullCode}</p>
                    </div>
                  </div>
                </div>
              )
            })()}

            {/* Acciones rápidas */}
            {garment.status !== 'baja' && (() => {
              const cycleCount = getCycleCount(actions)
              const reparacionCount = actions.filter(a => a.action_type === 'reparacion' || (a.action_type === 'inspeccion' && a.result === 'reparacion')).length
              const LIFE_LIMIT = 100
              const LIFE_WARN = 80
              const lifeExpired = cycleCount >= LIFE_LIMIT
              const lifeNearEnd = !lifeExpired && cycleCount >= LIFE_WARN
              return (
              <div className="bg-white rounded-xl border border-gray-200 p-3 md:p-5">
                {/* Banner advertencia fin de vida */}
                {lifeExpired && (
                  <Notice tone="error" title="Fin de vida útil alcanzado" className="mb-3">
                    {cycleCount} ciclos de lavado y esterilización. Se recomienda dar de baja.
                  </Notice>
                )}
                {lifeNearEnd && (
                  <Notice tone="warning" title="Próximo a fin de vida útil" className="mb-3">
                    {cycleCount}/100 ciclos de lavado y esterilización
                  </Notice>
                )}
                <div className="flex items-center justify-between mb-2">
                  <h2 className="font-semibold text-gray-800 text-sm md:text-base">Registrar Acción</h2>
                  {/* Contadores inline — solo mobile */}
                  <div className="flex items-center gap-2 md:hidden">
                    <span className={`flex items-center gap-0.5 text-xs font-semibold ${cycleCount >= LIFE_LIMIT ? 'text-red-600' : cycleCount >= LIFE_WARN ? 'text-orange-500' : 'text-blue-600'}`}>
                      <Droplets className="w-3.5 h-3.5" />{cycleCount}
                    </span>
                    <span className="flex items-center gap-0.5 text-xs text-orange-600 font-semibold">
                      <Scissors className="w-3.5 h-3.5" />{reparacionCount}
                    </span>
                  </div>
                </div>
                <div className="grid grid-cols-2 gap-2">
                  <button
                    onClick={() => openActionModal('lavado')}
                    disabled={garment.status === 'lavado'}
                    className={`flex flex-col items-center gap-1.5 p-3 border rounded-lg transition-colors ${
                      garment.status === 'lavado'
                        ? 'bg-gray-50 border-gray-200 opacity-40 cursor-not-allowed'
                        : 'bg-blue-50 hover:bg-blue-100 border-blue-200'
                    }`}
                  >
                    <Droplets className={`w-6 h-6 ${garment.status === 'lavado' ? 'text-gray-400' : 'text-blue-600'}`} />
                    <span className={`text-xs font-medium text-center ${garment.status === 'lavado' ? 'text-gray-400' : 'text-blue-700'}`}>
                      {garment.status === 'lavado' ? 'Ya en Lavado y Esterilización' : 'Lavado y Esterilización'}
                    </span>
                  </button>
                  <button
                    onClick={() => openActionModal('inspeccion')}
                    className="flex flex-col items-center gap-1.5 p-3 bg-yellow-50 hover:bg-yellow-100 border border-yellow-200 rounded-lg transition-colors"
                  >
                    <ClipboardCheck className="w-6 h-6 text-yellow-600" />
                    <span className="text-xs font-medium text-yellow-700 text-center">
                      {garment.status === 'inspeccion' ? 'Registrar Resultado' : 'Inspección'}
                    </span>
                  </button>
                </div>
              </div>
            )})()}

            {/* Descripción y Notas */}
            {(garment.description || garment.notes) && (
              <div className="bg-white rounded-xl border border-gray-200 p-3 md:p-5 space-y-2 md:space-y-3">
                {garment.description && (
                  <div>
                    <p className="text-sm font-medium text-gray-600 mb-1">Descripción</p>
                    <p className="text-gray-800 bg-gray-50 p-3 rounded-lg text-sm">{garment.description}</p>
                  </div>
                )}
                {garment.notes && (
                  <div>
                    <p className="text-sm font-medium text-gray-600 mb-1">Notas</p>
                    <p className="text-gray-800 bg-gray-50 p-3 rounded-lg text-sm">{garment.notes}</p>
                  </div>
                )}
              </div>
            )}
          </div>

          {/* ── RIGHT COLUMN ── */}
          <div className="space-y-2 md:space-y-4">

            {/* Estadísticas — solo desktop (en mobile se muestran inline en la tarjeta de acciones) */}
            <div className="hidden md:block bg-white rounded-xl border border-gray-200 p-5">
              <h2 className="font-semibold text-gray-800 mb-3">Resumen de Ciclos</h2>
              <div className="grid grid-cols-2 gap-3">
                {(() => {
                  const cycleCount = getCycleCount(actions)
                  const rc = actions.filter(a => a.action_type === 'reparacion' || (a.action_type === 'inspeccion' && a.result === 'reparacion')).length
                  const L = 100, W = 80
                  return (
                    <>
                      <div className="p-4 rounded-lg border border-gray-200 text-center">
                        <div className="flex items-center justify-center gap-2 mb-1">
                          <Droplets className="w-5 h-5 text-gray-400" />
                          <span className="text-2xl font-bold text-gray-900">{cycleCount}</span>
                          {cycleCount >= W && <StatusDot tone={cycleCount >= L ? 'red' : 'orange'} />}
                        </div>
                        <p className="text-xs font-medium text-gray-500">Lavado y esterilización</p>
                      </div>
                      <div className="p-4 rounded-lg border border-gray-200 text-center">
                        <div className="flex items-center justify-center gap-2 mb-1">
                          <Scissors className="w-5 h-5 text-gray-400" />
                          <span className="text-2xl font-bold text-gray-900">{rc}</span>
                        </div>
                        <p className="text-xs text-gray-500 font-medium">Reparaciones</p>
                      </div>
                    </>
                  )
                })()}
              </div>
            </div>

            {/* Historial de acciones */}
            <div className="bg-white rounded-xl border border-gray-200 p-3 md:p-5">
              <h2 className="font-semibold text-gray-800 text-sm md:text-base mb-2">
                Historial de Acciones {actions.length > 0 && `(${actions.length})`}
              </h2>
              {actions.length === 0 ? (
                <p className="text-sm text-gray-400 text-center py-3">Sin acciones registradas</p>
              ) : (
                <div className="space-y-1.5 max-h-60 md:max-h-72 overflow-y-auto pr-1">
                  {actions.map((action, idx) => (
                    <div key={idx} className="p-2 md:p-3 bg-gray-50 rounded-lg">
                      <div className="flex items-center justify-between">
                        <span className="text-xs font-semibold text-gray-800">
                          {action.action_type === 'lavado' || action.action_type === 'esterilizacion'
                            ? 'Lavado y esterilización'
                            : action.action_type.charAt(0).toUpperCase() + action.action_type.slice(1)}
                        </span>
                        <span className="text-xs text-gray-400">
                          {new Date(action.created_at).toLocaleString()}
                        </span>
                      </div>
                      {action.result && (
                        <p className="text-xs text-gray-500">Resultado: {action.result}</p>
                      )}
                      {action.notes && (
                        <p className="text-xs text-gray-500">Notas: {action.notes}</p>
                      )}
                      {action.performed_by && (
                        <p className="text-xs text-gray-500">Responsable: {action.performed_by}</p>
                      )}
                      {action.recorded_by_email && (
                        <p className="text-xs text-gray-400">Capturó: {action.recorded_by_email}</p>
                      )}
                      {action.signature_id && (
                        <p className="text-xs text-indigo-600 font-medium">Firmado electrónicamente</p>
                      )}
                    </div>
                  ))}
                </div>
              )}
            </div>

            {/* Audit trail (supervisor / jefe / administrador) */}
            {canViewReports && garment && (
              <div className="bg-white rounded-xl border border-gray-200 p-3 md:p-5">
                <div className="flex items-center justify-between gap-2 mb-2">
                  <h2 className="font-semibold text-gray-800 text-sm md:text-base flex items-center gap-2">
                    <ShieldCheck className="w-4 h-4 text-gray-500" />
                    Audit trail {auditTrail && `(${auditTrail.length})`}
                  </h2>
                  <div className="flex gap-2">
                    {!auditTrail ? (
                      <button onClick={loadAuditTrail} disabled={auditLoading} className="text-xs px-3 py-1 rounded-lg border border-gray-200 text-gray-700 hover:bg-gray-50 disabled:opacity-50">
                        {auditLoading ? 'Cargando...' : 'Ver cambios'}
                      </button>
                    ) : (
                      <button
                        onClick={() => historyReportService.exportGarmentAuditTrail(garment.code, auditTrail, user?.email ?? '')}
                        className="text-xs px-3 py-1 rounded-lg border border-gray-200 text-gray-700 hover:bg-gray-50 flex items-center gap-1"
                      >
                        <FileSpreadsheet className="w-3 h-3" /> Exportar
                      </button>
                    )}
                  </div>
                </div>
                {auditError && <p className="text-xs text-red-600">{auditError}</p>}
                {auditTrail && (
                  auditTrail.length === 0 ? (
                    <p className="text-sm text-gray-400 text-center py-3">Sin cambios registrados desde que se activó el audit trail</p>
                  ) : (
                    <div className="space-y-1.5 max-h-72 overflow-y-auto pr-1">
                      {[...auditTrail].reverse().map((e) => (
                        <div key={e.id} className="p-2 border border-gray-100 rounded-lg text-xs">
                          <div className="flex justify-between gap-2">
                            <span className="font-semibold text-gray-800">
                              {auditOpLabel[e.operation]} · {auditTableLabel[e.table_name] ?? e.table_name}
                            </span>
                            <span className="text-gray-400">{new Date(e.occurred_at).toLocaleString()}</span>
                          </div>
                          <p className="text-gray-600">{e.user_email ?? 'Sistema / mantenimiento'}{e.user_role ? ` (${e.user_role})` : ''}</p>
                          {describeChanges(e) && <p className="text-gray-600 break-words">{describeChanges(e)}</p>}
                          {e.reason && <p className="text-gray-500">Motivo: {e.reason}</p>}
                        </div>
                      ))}
                    </div>
                  )
                )}
              </div>
            )}

            {/* Documentos */}
            {documents.length > 0 && (
              <div className="bg-white rounded-xl border border-gray-200 p-5">
                <h2 className="font-semibold text-gray-800 mb-3">Documentos ({documents.length})</h2>
                <div className="space-y-2">
                  {documents.map((doc) => (
                    <a
                      key={doc.id}
                      href={doc.url}
                      target="_blank"
                      rel="noopener noreferrer"
                      className="block p-3 bg-gray-50 hover:bg-gray-100 rounded-lg transition-colors"
                    >
                      <p className="text-sm font-medium text-blue-600 hover:underline">
                        {doc.file_name || `Documento (${doc.type})`}
                      </p>
                      <p className="text-xs text-gray-500 mt-1">
                        {new Date(doc.created_at).toLocaleDateString()}
                      </p>
                    </a>
                  ))}
                </div>
              </div>
            )}

            {/* Timestamps */}
            <div className="bg-white rounded-xl border border-gray-200 p-2 md:p-4 flex flex-wrap gap-x-4 gap-y-1 text-xs text-gray-400">
              <span>Creado: {new Date(garment.created_at).toLocaleString()}</span>
              <span>Actualizado: {new Date(garment.updated_at).toLocaleString()}</span>
            </div>
          </div>
        </div>

        {/* Footer */}
        <div className="mt-4 text-center text-xs text-gray-400">
          <p>ThreadTrack - Sistema de Rastreo de Prendas</p>
        </div>
      </div>

      {/* Modal de Edición */}
      {showEditModal && garment && (
        <div className="fixed inset-0 bg-black/50 flex items-center justify-center z-50 p-4">
          <div className="bg-white rounded-xl p-4 sm:p-6 w-full max-w-lg">
            <div className="flex items-center justify-between mb-4">
              <h2 className="text-xl font-bold flex items-center gap-2">
                <Pencil className="w-5 h-5 text-blue-600" />
                Editar Prenda
              </h2>
              <button onClick={() => setShowEditModal(false)} className="p-1 hover:bg-gray-100 rounded">
                <X className="w-5 h-5" />
              </button>
            </div>

            <div className="mb-3 px-3 py-2 bg-gray-50 rounded-lg">
              <span className="text-xs text-gray-500">Código: </span>
              <span className="font-mono text-sm font-semibold text-gray-800">{garment.code}</span>
            </div>

            <div className="space-y-3 mb-4">
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1">Nombre *</label>
                <input
                  type="text"
                  value={editForm.name}
                  onChange={e => setEditForm(f => ({ ...f, name: e.target.value }))}
                  className="input-field"
                  placeholder="Nombre de la prenda"
                />
              </div>
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1">Descripción</label>
                <input
                  type="text"
                  value={editForm.description}
                  onChange={e => setEditForm(f => ({ ...f, description: e.target.value }))}
                  className="input-field"
                  placeholder="Descripción (opcional)"
                />
              </div>
              <div className="grid grid-cols-2 gap-3">
                <div>
                  <label className="block text-sm font-medium text-gray-700 mb-1">Cliente</label>
                  <input
                    type="text"
                    value={editForm.client_name}
                    onChange={e => setEditForm(f => ({ ...f, client_name: e.target.value }))}
                    className="input-field"
                    placeholder="Nombre del cliente"
                  />
                </div>
                <div>
                  <label className="block text-sm font-medium text-gray-700 mb-1">Teléfono del cliente</label>
                  <input
                    type="text"
                    value={editForm.client_phone}
                    onChange={e => setEditForm(f => ({ ...f, client_phone: e.target.value }))}
                    className="input-field"
                    placeholder="Teléfono (opcional)"
                  />
                </div>
              </div>
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1">Notas</label>
                <textarea
                  value={editForm.notes}
                  onChange={e => setEditForm(f => ({ ...f, notes: e.target.value }))}
                  className="input-field min-h-[70px]"
                  placeholder="Notas adicionales (opcional)"
                />
              </div>
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1">Motivo del cambio *</label>
                <textarea
                  value={editForm.reason}
                  onChange={e => setEditForm(f => ({ ...f, reason: e.target.value }))}
                  className="input-field min-h-[60px]"
                  placeholder="Ej. corrección del nombre del cliente"
                />
                <p className="text-xs text-gray-500 mt-1">Queda registrado en el audit trail junto con el valor anterior y el nuevo.</p>
              </div>
            </div>

            {editError && (
              <Notice tone="error" className="mb-3">{editError}</Notice>
            )}

            <div className="flex gap-3">
              <button onClick={() => setShowEditModal(false)} className="btn-secondary flex-1" disabled={editLoading}>
                Cancelar
              </button>
              <button onClick={handleEditSave} className="btn-primary flex-1" disabled={editLoading}>
                {editLoading ? 'Guardando...' : 'Guardar cambios'}
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Modal de Acción */}
      {showActionModal && garment && (
        <div className="fixed inset-0 bg-black/50 flex items-center justify-center z-50 p-4">
          <div className="bg-white rounded-xl p-4 sm:p-6 w-full max-w-md">
            <div className="flex items-center justify-between mb-4">
              <h2 className="text-xl font-bold">
                {actionType === 'lavado' && 'Lavado y Esterilización'}
                {actionType === 'inspeccion' && 'Resultado de Inspección'}
              </h2>
              <button onClick={() => setShowActionModal(false)} className="p-1 hover:bg-gray-100 rounded">
                <X className="w-5 h-5" />
              </button>
            </div>

            <div className="mb-4 p-3 bg-gray-50 rounded-lg">
              <div className="font-mono text-lg">{garment.code}</div>
              <div className="text-gray-600">{garment.name}</div>
            </div>

            {/* Advertencia fin de vida útil */}
            {(() => {
              const cycleCount = getCycleCount(actions)
              const newCycleCount = actionType === 'lavado' ? cycleCount + 1 : cycleCount
              const alreadyExpired = cycleCount >= 100
              const willExpire = !alreadyExpired && newCycleCount >= 100
              if (!willExpire && !alreadyExpired) return null
              return (
                <Notice
                  tone={alreadyExpired ? 'error' : 'warning'}
                  title={alreadyExpired ? 'Esta prenda ya superó su vida útil' : 'Esta acción alcanzará el límite de vida útil'}
                  className="mb-4"
                >
                  {alreadyExpired
                    ? `Tiene ${cycleCount} ciclos de lavado y esterilización. Se recomienda darla de baja.`
                    : `Alcanzará ${newCycleCount} ciclos de lavado y esterilización. Considera darla de baja.`}
                </Notice>
              )
            })()}

            {actionType === 'inspeccion' && (
              <div className="mb-4">
                <label className="block text-sm font-medium text-gray-700 mb-2">Resultado</label>
                <div className="space-y-2">
                  <label className="flex items-center gap-3 p-3 border rounded-lg cursor-pointer hover:bg-gray-50">
                    <input type="radio" name="result" value="aprobado" checked={inspectionResult === 'aprobado'} onChange={() => setInspectionResult('aprobado')} />
                    <PackageCheck className="w-5 h-5 text-green-600" />
                    <span>Aprobado - Vuelve a Disponible</span>
                  </label>
                  <label className="flex items-center gap-3 p-3 border rounded-lg cursor-pointer hover:bg-gray-50">
                    <input type="radio" name="result" value="reparacion" checked={inspectionResult === 'reparacion'} onChange={() => setInspectionResult('reparacion')} />
                    <Scissors className="w-5 h-5 text-orange-600" />
                    <span>Requiere Reparación</span>
                  </label>
                  <label className="flex items-center gap-3 p-3 border rounded-lg cursor-pointer hover:bg-gray-50">
                    <input type="radio" name="result" value="baja" checked={inspectionResult === 'baja'} onChange={() => setInspectionResult('baja')} />
                    <PackageX className="w-5 h-5 text-red-600" />
                    <span>Dar de Baja</span>
                  </label>
                </div>
              </div>
            )}

            <div className="mb-4">
              <label className="block text-sm font-medium text-gray-700 mb-1">Responsable *</label>
              <input
                type="text"
                value={actionResponsible}
                onChange={(e) => setActionResponsible(e.target.value)}
                className="input-field"
                placeholder="Nombre de quien ejecuta la acción"
              />
            </div>

            <div className="mb-4">
              <label className="block text-sm font-medium text-gray-700 mb-1">
                {actionType === 'inspeccion' && inspectionResult === 'baja' ? 'Motivo de Baja *' : 'Notas (opcional)'}
              </label>
              <textarea
                value={actionNotes}
                onChange={(e) => setActionNotes(e.target.value)}
                className="input-field min-h-[80px]"
                placeholder={actionType === 'inspeccion' && inspectionResult === 'baja' ? 'Describe el motivo de la baja...' : 'Agregar notas...'}
              />
            </div>

            {signatureMeaning && (
              <div className="mb-4">
                <SignatureField meaning={signatureMeaning} password={signaturePassword} onChange={setSignaturePassword} />
              </div>
            )}

            {actionError && (
              <Notice tone="error" className="mb-4">{actionError}</Notice>
            )}

            <div className="flex gap-3">
              <button onClick={() => setShowActionModal(false)} className="btn-secondary flex-1">
                Cancelar
              </button>
              <button
                onClick={handleAction}
                className="btn-primary flex-1"
                disabled={actionLoading || !actionResponsible.trim() || (actionType === 'inspeccion' && inspectionResult === 'baja' && !actionNotes) || (!!signatureMeaning && !signaturePassword)}
              >
                {actionLoading ? 'Guardando...' : signatureMeaning ? 'Firmar y confirmar' : 'Confirmar'}
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  )
}

export default GarmentDetail

