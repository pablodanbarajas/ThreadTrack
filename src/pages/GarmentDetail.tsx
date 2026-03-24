import { useState, useEffect } from 'react'
import { useParams, Link } from 'react-router-dom'
import { Loader, AlertCircle, Home, ArrowLeft, Droplets, Sparkles, Scissors, ClipboardCheck, PackageCheck, Trash2, X, Pencil, AlertTriangle } from 'lucide-react'
import { garmentService } from '../services/garmentService'
import { documentService } from '../services/documentService'
import { parseGarmentCode } from '../lib/garmentCodeParser'
import { useRole } from '../contexts/AuthContext'
import type { Garment, Document, GarmentAction, ActionType, InspectionResult } from '../types'

const GarmentDetail = () => {
  const { id } = useParams<{ id: string }>()
  const { isAdministrador, canEditGarment } = useRole()
  const [garment, setGarment] = useState<Garment | null>(null)
  const [documents, setDocuments] = useState<Document[]>([])
  const [actions, setActions] = useState<GarmentAction[]>([])
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)
  const [showActionModal, setShowActionModal] = useState(false)
  const [actionType, setActionType] = useState<ActionType>('lavado')
  const [inspectionResult, setInspectionResult] = useState<InspectionResult>('aprobado')
  const [actionNotes, setActionNotes] = useState('')
  const [actionLoading, setActionLoading] = useState(false)

  // Edit modal state
  const [showEditModal, setShowEditModal] = useState(false)
  const [editForm, setEditForm] = useState({ name: '', description: '', client_name: '', client_phone: '', notes: '' })
  const [editLoading, setEditLoading] = useState(false)
  const [editError, setEditError] = useState<string | null>(null)

  useEffect(() => {
    loadGarmentData()
  }, [id])

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

  const getStatusColor = (status: string) => {
    const colors: Record<string, string> = {
      disponible: 'bg-green-100 text-green-800',
      lavado: 'bg-blue-100 text-blue-800',
      esterilizacion: 'bg-purple-100 text-purple-800',
      inspeccion: 'bg-yellow-100 text-yellow-800',
      reparacion: 'bg-orange-100 text-orange-800',
      baja: 'bg-red-100 text-red-800',
    }
    return colors[status] || 'bg-gray-100 text-gray-800'
  }

  const openActionModal = (type: ActionType) => {
    setActionType(type)
    setActionNotes('')
    setInspectionResult('aprobado')
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
    })
    setEditError(null)
    setShowEditModal(true)
  }

  const handleEditSave = async () => {
    if (!garment) return
    if (!editForm.name.trim()) { setEditError('El nombre es obligatorio'); return }
    setEditLoading(true)
    setEditError(null)
    try {
      await garmentService.update(garment.id, {
        name: editForm.name.trim(),
        description: editForm.description.trim() || undefined,
        client_name: editForm.client_name.trim() || undefined,
        client_phone: editForm.client_phone.trim() || undefined,
        notes: editForm.notes.trim() || undefined,
      })
      setShowEditModal(false)
      await loadGarmentData()
    } catch (err: any) {
      setEditError(err.message || 'Error al guardar los cambios')
    } finally {
      setEditLoading(false)
    }
  }

  const handleAction = async () => {
    if (!garment) return
    setActionLoading(true)
    try {
      await garmentService.registerAction(garment.id, actionType, {
        result: actionType === 'inspeccion' ? inspectionResult : undefined,
        notes: actionNotes || undefined,
      })
      setShowActionModal(false)
      await loadGarmentData()
    } catch (err) {
      console.error('Error registrando acción:', err)
    } finally {
      setActionLoading(false)
    }
  }

  if (loading) {
    return (
      <div className="min-h-screen flex items-center justify-center bg-gradient-to-br from-blue-50 to-indigo-100">
        <div className="text-center">
          <Loader className="w-12 h-12 text-blue-600 animate-spin mx-auto mb-4" />
          <p className="text-gray-600">Cargando prenda...</p>
        </div>
      </div>
    )
  }

  if (error || !garment) {
    return (
      <div className="min-h-screen flex items-center justify-center bg-gradient-to-br from-blue-50 to-indigo-100 p-4">
        <div className="bg-white rounded-xl shadow-lg p-8 max-w-md w-full">
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
    <div className="min-h-screen bg-gradient-to-br from-blue-50 to-indigo-100 p-2 md:p-4">
      <div className="max-w-6xl mx-auto">
        {/* Back link */}
        <div className="mb-2 md:mb-4">
          <Link to="/" className="inline-flex items-center gap-1.5 text-blue-600 hover:text-blue-800 transition-colors text-sm">
            <ArrowLeft className="w-4 h-4" />
            Volver
          </Link>
        </div>

        {/* Header card – full width */}
        <div className="bg-white rounded-xl shadow-lg overflow-hidden mb-2 md:mb-4">
          <div className="bg-gradient-to-r from-blue-600 to-indigo-600 text-white p-3 md:p-6">
            <div className="flex items-start justify-between gap-2">
              <div className="min-w-0">
                <h1 className="text-lg md:text-3xl font-bold leading-tight break-words">{garment.name}</h1>
                <p className="text-blue-100 text-xs md:text-sm mt-0.5">Código: <span className="font-mono font-semibold">{garment.code}</span></p>
              </div>
              <div className="flex items-center gap-2 shrink-0">
                <span className={`px-2.5 py-1 rounded-full text-xs font-semibold whitespace-nowrap ${getStatusColor(garment.status)}`}>
                  {garment.status.charAt(0).toUpperCase() + garment.status.slice(1)}
                </span>
                {canEditGarment && (
                  <button
                    onClick={openEditModal}
                    className="flex items-center gap-1.5 px-2.5 py-1.5 bg-white/20 hover:bg-white/30 text-white rounded-lg transition-colors text-xs font-medium"
                    title="Editar prenda"
                  >
                    <Pencil className="w-3.5 h-3.5" />
                    Editar
                  </button>
                )}
              </div>
            </div>
            {garment.client_name && (
              <div className="mt-2 pt-2 border-t border-blue-400 flex flex-wrap gap-x-6 gap-y-1">
                <div className="flex items-center gap-1.5">
                  <span className="text-blue-200 text-xs">Cliente:</span>
                  <span className="text-white text-xs font-semibold">{garment.client_name}</span>
                </div>
                {garment.client_phone && (
                  <div className="flex items-center gap-1.5">
                    <span className="text-blue-200 text-xs">Tel:</span>
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
                <div className="bg-white rounded-xl shadow-lg p-3 md:p-5">
                  <h3 className="font-semibold text-indigo-900 text-sm md:text-base mb-2">Información del Código</h3>
                  <div className="grid grid-cols-3 md:grid-cols-2 gap-1.5 md:gap-3">
                    <div className="bg-indigo-50 p-2 md:p-3 rounded-lg">
                      <p className="text-xs text-indigo-500 font-medium">Prenda</p>
                      <p className="text-xs md:text-sm font-semibold text-gray-800 leading-tight">{parsed.garmentName}</p>
                      <p className="text-xs text-gray-400">{parsed.garmentType}</p>
                    </div>
                    <div className="bg-indigo-50 p-2 md:p-3 rounded-lg">
                      <p className="text-xs text-indigo-500 font-medium">Talla</p>
                      <p className="text-xs md:text-sm font-semibold text-gray-800 leading-tight">{parsed.sizeName}</p>
                      <p className="text-xs text-gray-400">{parsed.size}</p>
                    </div>
                    <div className="bg-indigo-50 p-2 md:p-3 rounded-lg">
                      <p className="text-xs text-indigo-500 font-medium">Color</p>
                      <p className="text-xs md:text-sm font-semibold text-gray-800 leading-tight">{parsed.colorName}</p>
                      <p className="text-xs text-gray-400">{parsed.color}</p>
                    </div>
                    <div className="bg-indigo-50 p-2 md:p-3 rounded-lg">
                      <p className="text-xs text-indigo-500 font-medium">Lote</p>
                      <p className="text-xs md:text-sm font-semibold text-gray-800 leading-tight">{parsed.batchCode} <span className="text-gray-400">#{parsed.sequenceNumber.toString().padStart(3, '0')}</span></p>
                    </div>
                    <div className="bg-indigo-50 p-2 md:p-3 rounded-lg">
                      <p className="text-xs text-indigo-500 font-medium">Mes del Lote</p>
                      <p className="text-xs md:text-sm font-semibold text-gray-800 leading-tight">
                        {new Date(parsed.batchYear, parsed.batchMonth - 1).toLocaleDateString('es-ES', { month: 'short', year: 'numeric' })}
                      </p>
                    </div>
                    <div className="bg-indigo-50 p-2 md:p-3 rounded-lg">
                      <p className="text-xs text-indigo-500 font-medium">Código</p>
                      <p className="text-xs font-mono font-semibold text-gray-800 break-all leading-tight">{parsed.fullCode}</p>
                    </div>
                  </div>
                </div>
              )
            })()}

            {/* Acciones rápidas */}
            {garment.status !== 'baja' && (() => {
              const lavadoCount = actions.filter(a => a.action_type === 'lavado').length
              const esterilizacionCount = actions.filter(a => a.action_type === 'esterilizacion').length
              const reparacionCount = actions.filter(a => a.action_type === 'reparacion' || (a.action_type === 'inspeccion' && a.result === 'reparacion')).length
              const LIFE_LIMIT = 100
              const LIFE_WARN = 80
              const lifeExpired = lavadoCount >= LIFE_LIMIT || esterilizacionCount >= LIFE_LIMIT
              const lifeNearEnd = !lifeExpired && (lavadoCount >= LIFE_WARN || esterilizacionCount >= LIFE_WARN)
              return (
              <div className="bg-white rounded-xl shadow-lg p-3 md:p-5">
                {/* Banner advertencia fin de vida */}
                {lifeExpired && (
                  <div className="flex items-start gap-2 mb-3 px-3 py-2 bg-red-50 border border-red-200 rounded-lg">
                    <AlertTriangle className="w-4 h-4 text-red-600 flex-shrink-0 mt-0.5" />
                    <div>
                      <p className="text-xs font-bold text-red-700">⚠ Fin de vida útil alcanzado</p>
                      <p className="text-xs text-red-600">
                        {lavadoCount >= LIFE_LIMIT && `${lavadoCount} lavados`}{lavadoCount >= LIFE_LIMIT && esterilizacionCount >= LIFE_LIMIT && ' · '}{esterilizacionCount >= LIFE_LIMIT && `${esterilizacionCount} esterilizaciones`}. Se recomienda dar de baja.
                      </p>
                    </div>
                  </div>
                )}
                {lifeNearEnd && (
                  <div className="flex items-start gap-2 mb-3 px-3 py-2 bg-orange-50 border border-orange-200 rounded-lg">
                    <AlertTriangle className="w-4 h-4 text-orange-500 flex-shrink-0 mt-0.5" />
                    <div>
                      <p className="text-xs font-bold text-orange-700">Próximo a fin de vida útil</p>
                      <p className="text-xs text-orange-600">
                        {lavadoCount >= LIFE_WARN && `${lavadoCount}/100 lavados`}{lavadoCount >= LIFE_WARN && esterilizacionCount >= LIFE_WARN && ' · '}{esterilizacionCount >= LIFE_WARN && `${esterilizacionCount}/100 esterilizaciones`}
                      </p>
                    </div>
                  </div>
                )}
                <div className="flex items-center justify-between mb-2">
                  <h2 className="font-semibold text-gray-800 text-sm md:text-base">Registrar Acción</h2>
                  {/* Contadores inline — solo mobile */}
                  <div className="flex items-center gap-2 md:hidden">
                    <span className={`flex items-center gap-0.5 text-xs font-semibold ${lavadoCount >= LIFE_LIMIT ? 'text-red-600' : lavadoCount >= LIFE_WARN ? 'text-orange-500' : 'text-blue-600'}`}>
                      <Droplets className="w-3.5 h-3.5" />{lavadoCount}
                    </span>
                    <span className={`flex items-center gap-0.5 text-xs font-semibold ${esterilizacionCount >= LIFE_LIMIT ? 'text-red-600' : esterilizacionCount >= LIFE_WARN ? 'text-orange-500' : 'text-purple-600'}`}>
                      <Sparkles className="w-3.5 h-3.5" />{esterilizacionCount}
                    </span>
                    <span className="flex items-center gap-0.5 text-xs text-orange-600 font-semibold">
                      <Scissors className="w-3.5 h-3.5" />{reparacionCount}
                    </span>
                  </div>
                </div>
                <div className="grid grid-cols-3 gap-2">
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
                      {garment.status === 'lavado' ? 'Ya en Lavado' : 'Enviar a Lavado'}
                    </span>
                  </button>
                  <button
                    onClick={() => openActionModal('esterilizacion')}
                    disabled={garment.status === 'esterilizacion'}
                    className={`flex flex-col items-center gap-1.5 p-3 border rounded-lg transition-colors ${
                      garment.status === 'esterilizacion'
                        ? 'bg-gray-50 border-gray-200 opacity-40 cursor-not-allowed'
                        : 'bg-purple-50 hover:bg-purple-100 border-purple-200'
                    }`}
                  >
                    <Sparkles className={`w-6 h-6 ${garment.status === 'esterilizacion' ? 'text-gray-400' : 'text-purple-600'}`} />
                    <span className={`text-xs font-medium text-center ${garment.status === 'esterilizacion' ? 'text-gray-400' : 'text-purple-700'}`}>
                      {garment.status === 'esterilizacion' ? 'Ya en Esterilización' : 'Enviar a Esterilización'}
                    </span>
                  </button>
                  <button
                    onClick={() => openActionModal('inspeccion')}
                    className="flex flex-col items-center gap-1.5 p-3 bg-yellow-50 hover:bg-yellow-100 border border-yellow-200 rounded-lg transition-colors"
                  >
                    <ClipboardCheck className="w-6 h-6 text-yellow-600" />
                    <span className="text-xs font-medium text-yellow-700 text-center">
                      {garment.status === 'inspeccion' ? 'Registrar Resultado' : 'Enviar a Inspección'}
                    </span>
                  </button>
                </div>
              </div>
            )})()}

            {/* Descripción y Notas */}
            {(garment.description || garment.notes) && (
              <div className="bg-white rounded-xl shadow-lg p-3 md:p-5 space-y-2 md:space-y-3">
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
            <div className="hidden md:block bg-white rounded-xl shadow-lg p-5">
              <h2 className="font-semibold text-gray-800 mb-3">Resumen de Ciclos</h2>
              <div className="grid grid-cols-3 gap-3">
                {(() => {
                  const lc = actions.filter(a => a.action_type === 'lavado').length
                  const ec = actions.filter(a => a.action_type === 'esterilizacion').length
                  const rc = actions.filter(a => a.action_type === 'reparacion' || (a.action_type === 'inspeccion' && a.result === 'reparacion')).length
                  const L = 100, W = 80
                  return (
                    <>
                      <div className={`p-4 rounded-lg text-center ${lc >= L ? 'bg-red-100' : lc >= W ? 'bg-orange-100' : 'bg-blue-50'}`}>
                        <div className="flex items-center justify-center gap-1 mb-1">
                          <Droplets className={`w-5 h-5 ${lc >= L ? 'text-red-600' : lc >= W ? 'text-orange-500' : 'text-blue-600'}`} />
                          <span className={`text-2xl font-bold ${lc >= L ? 'text-red-600' : lc >= W ? 'text-orange-600' : 'text-blue-600'}`}>{lc}</span>
                        </div>
                        <p className={`text-xs font-medium ${lc >= L ? 'text-red-700' : lc >= W ? 'text-orange-700' : 'text-blue-700'}`}>Lavados{lc >= L ? ' ⚠' : ''}</p>
                      </div>
                      <div className={`p-4 rounded-lg text-center ${ec >= L ? 'bg-red-100' : ec >= W ? 'bg-orange-100' : 'bg-purple-50'}`}>
                        <div className="flex items-center justify-center gap-1 mb-1">
                          <Sparkles className={`w-5 h-5 ${ec >= L ? 'text-red-600' : ec >= W ? 'text-orange-500' : 'text-purple-600'}`} />
                          <span className={`text-2xl font-bold ${ec >= L ? 'text-red-600' : ec >= W ? 'text-orange-600' : 'text-purple-600'}`}>{ec}</span>
                        </div>
                        <p className={`text-xs font-medium ${ec >= L ? 'text-red-700' : ec >= W ? 'text-orange-700' : 'text-purple-700'}`}>Esterilizaciones{ec >= L ? ' ⚠' : ''}</p>
                      </div>
                      <div className="p-4 bg-orange-50 rounded-lg text-center">
                        <div className="flex items-center justify-center gap-1 mb-1">
                          <Scissors className="w-5 h-5 text-orange-600" />
                          <span className="text-2xl font-bold text-orange-600">{rc}</span>
                        </div>
                        <p className="text-xs text-orange-700 font-medium">Reparaciones</p>
                      </div>
                    </>
                  )
                })()}
              </div>
            </div>

            {/* Historial de acciones */}
            <div className="bg-white rounded-xl shadow-lg p-3 md:p-5">
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
                          {action.action_type.charAt(0).toUpperCase() + action.action_type.slice(1)}
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
                    </div>
                  ))}
                </div>
              )}
            </div>

            {/* Documentos */}
            {documents.length > 0 && (
              <div className="bg-white rounded-xl shadow-lg p-5">
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
            <div className="bg-white rounded-xl shadow-lg p-2 md:p-4 flex flex-wrap gap-x-4 gap-y-1 text-xs text-gray-400">
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
                  <label className="block text-sm font-medium text-gray-700 mb-1">Teléfono</label>
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
            </div>

            {editError && (
              <div className="mb-3 px-3 py-2 bg-red-50 border border-red-200 text-red-700 text-sm rounded-lg">{editError}</div>
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
                {actionType === 'lavado' && 'Enviar a Lavado'}
                {actionType === 'esterilizacion' && 'Enviar a Esterilización'}
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
              const lavadoCount = actions.filter(a => a.action_type === 'lavado').length
              const esterilizacionCount = actions.filter(a => a.action_type === 'esterilizacion').length
              const newLavado = actionType === 'lavado' ? lavadoCount + 1 : lavadoCount
              const newEsteril = actionType === 'esterilizacion' ? esterilizacionCount + 1 : esterilizacionCount
              const alreadyExpired = lavadoCount >= 100 || esterilizacionCount >= 100
              const willExpire = !alreadyExpired && (newLavado >= 100 || newEsteril >= 100)
              if (!willExpire && !alreadyExpired) return null
              return (
                <div className={`mb-4 p-3 rounded-lg border flex gap-3 ${alreadyExpired ? 'bg-red-50 border-red-300' : 'bg-orange-50 border-orange-300'}`}>
                  <AlertTriangle className={`w-5 h-5 flex-shrink-0 mt-0.5 ${alreadyExpired ? 'text-red-600' : 'text-orange-500'}`} />
                  <div>
                    <p className={`text-sm font-bold ${alreadyExpired ? 'text-red-700' : 'text-orange-700'}`}>
                      {alreadyExpired ? '⚠ Esta prenda ya superó su vida útil' : '⚠ Esta acción alcanzará el límite de vida útil'}
                    </p>
                    <p className={`text-xs mt-0.5 ${alreadyExpired ? 'text-red-600' : 'text-orange-600'}`}>
                      {alreadyExpired
                        ? `Tiene ${lavadoCount >= 100 ? lavadoCount + ' lavados' : ''}${lavadoCount >= 100 && esterilizacionCount >= 100 ? ' y ' : ''}${esterilizacionCount >= 100 ? esterilizacionCount + ' esterilizaciones' : ''}. Se recomienda darla de baja.`
                        : `Alcanzará ${newLavado >= 100 ? newLavado + ' lavados' : ''}${newLavado >= 100 && newEsteril >= 100 ? ' y ' : ''}${newEsteril >= 100 ? newEsteril + ' esterilizaciones' : ''}. Considera darla de baja.`
                      }
                    </p>
                  </div>
                </div>
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
                    <Trash2 className="w-5 h-5 text-red-600" />
                    <span>Dar de Baja</span>
                  </label>
                </div>
              </div>
            )}

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

            <div className="flex gap-3">
              <button onClick={() => setShowActionModal(false)} className="btn-secondary flex-1">
                Cancelar
              </button>
              <button
                onClick={handleAction}
                className="btn-primary flex-1"
                disabled={actionLoading || (actionType === 'inspeccion' && inspectionResult === 'baja' && !actionNotes)}
              >
                {actionLoading ? 'Guardando...' : 'Confirmar'}
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  )
}

export default GarmentDetail

