import { useState, useEffect } from 'react'
import { useParams, Link } from 'react-router-dom'
import { Loader, AlertCircle, Home, Download, Copy, ArrowLeft, Droplets, Sparkles, Scissors, ClipboardCheck, PackageCheck, Trash2, X } from 'lucide-react'
import QRCode from 'qrcode.react'
import { garmentService } from '../services/garmentService'
import { documentService } from '../services/documentService'
import { generateQRUrl } from '../lib/qrGenerator'
import { parseGarmentCode } from '../lib/garmentCodeParser'
import type { Garment, Document, GarmentAction, ActionType, InspectionResult } from '../types'

const GarmentDetail = () => {
  const { id } = useParams<{ id: string }>()
  const [garment, setGarment] = useState<Garment | null>(null)
  const [documents, setDocuments] = useState<Document[]>([])
  const [actions, setActions] = useState<GarmentAction[]>([])
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)
  const [copied, setCopied] = useState(false)
  const [showActionModal, setShowActionModal] = useState(false)
  const [actionType, setActionType] = useState<ActionType>('lavado')
  const [inspectionResult, setInspectionResult] = useState<InspectionResult>('aprobado')
  const [actionNotes, setActionNotes] = useState('')
  const [actionLoading, setActionLoading] = useState(false)

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

  const copyQRUrl = () => {
    if (!garment) return
    const url = generateQRUrl(garment.id)
    navigator.clipboard.writeText(url)
    setCopied(true)
    setTimeout(() => setCopied(false), 2000)
  }

  const openActionModal = (type: ActionType) => {
    setActionType(type)
    setActionNotes('')
    setInspectionResult('aprobado')
    setShowActionModal(true)
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

  const downloadQR = () => {
    if (!garment) return
    const canvas = document.querySelector('canvas')
    if (!canvas) return

    const link = document.createElement('a')
    link.href = canvas.toDataURL('image/png')
    link.download = `qr-${garment.code}.png`
    document.body.appendChild(link)
    link.click()
    document.body.removeChild(link)
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
    <div className="min-h-screen bg-gradient-to-br from-blue-50 to-indigo-100 p-4">
      <div className="max-w-2xl mx-auto">
        {/* Header */}
        <div className="mb-6">
          <Link
            to="/"
            className="inline-flex items-center gap-2 text-blue-600 hover:text-blue-800 transition-colors mb-4"
          >
            <ArrowLeft className="w-5 h-5" />
            Volver
          </Link>
        </div>

        <div className="bg-white rounded-xl shadow-lg overflow-hidden">
          <div className="bg-gradient-to-r from-blue-600 to-indigo-600 text-white p-6">
            <div className="flex flex-col md:flex-row md:items-start md:justify-between gap-3 mb-4">
              <div className="min-w-0">
                <h1 className="text-2xl md:text-3xl font-bold mb-2 break-words">{garment.name}</h1>
                <p className="text-blue-100">Código: <span className="font-mono font-semibold">{garment.code}</span></p>
              </div>
              <span className={`px-4 py-2 rounded-full text-sm font-semibold whitespace-nowrap ${getStatusColor(garment.status)}`}>
                {garment.status.charAt(0).toUpperCase() + garment.status.slice(1)}
              </span>
            </div>
            
            {garment.client_name && (
              <div className="pt-4 border-t border-blue-400">
                <p className="text-blue-100 text-sm">Cliente</p>
                <p className="text-white font-semibold">{garment.client_name}</p>
                {garment.client_phone && (
                  <p className="text-blue-100 text-sm">{garment.client_phone}</p>
                )}
              </div>
            )}
          </div>

          {/* Content */}
          <div className="p-6 space-y-6">
            {/* Estadísticas de Acciones */}
            {actions.length > 0 && (
              <div className="grid grid-cols-3 gap-2 md:gap-3">
                <div className="p-3 md:p-4 bg-blue-50 rounded-lg text-center">
                  <div className="flex items-center justify-center gap-1 md:gap-2 mb-1">
                    <Droplets className="w-4 md:w-5 h-4 md:h-5 text-blue-600" />
                    <span className="text-xl md:text-2xl font-bold text-blue-600">
                      {actions.filter(a => a.action_type === 'lavado').length}
                    </span>
                  </div>
                  <p className="text-xs md:text-sm text-blue-700 font-medium break-words">Lavados</p>
                </div>
                <div className="p-3 md:p-4 bg-purple-50 rounded-lg text-center">
                  <div className="flex items-center justify-center gap-1 md:gap-2 mb-1">
                    <Sparkles className="w-4 md:w-5 h-4 md:h-5 text-purple-600" />
                    <span className="text-xl md:text-2xl font-bold text-purple-600">
                      {actions.filter(a => a.action_type === 'esterilizacion').length}
                    </span>
                  </div>
                  <p className="text-xs md:text-sm text-purple-700 font-medium break-words">Esterilizaciones</p>
                </div>
                <div className="p-3 md:p-4 bg-orange-50 rounded-lg text-center">
                  <div className="flex items-center justify-center gap-1 md:gap-2 mb-1">
                    <Scissors className="w-4 md:w-5 h-4 md:h-5 text-orange-600" />
                    <span className="text-xl md:text-2xl font-bold text-orange-600">
                      {actions.filter(a => 
                        a.action_type === 'reparacion' || 
                        (a.action_type === 'inspeccion' && a.result === 'reparacion')
                      ).length}
                    </span>
                  </div>
                  <p className="text-xs md:text-sm text-orange-700 font-medium break-words">Reparaciones</p>
                </div>
              </div>
            )}

            {/* Información del código de prenda */}
            {(() => {
              const parsed = parseGarmentCode(garment.code)
              if (parsed.valid) {
                return (
                  <div className="bg-indigo-50 border border-indigo-200 rounded-lg p-4">
                    <h3 className="font-semibold text-indigo-900 mb-3">Información del Código</h3>
                    <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
                      <div className="bg-white p-3 rounded-lg">
                        <p className="text-xs text-indigo-600 font-medium mb-1">Prenda</p>
                        <p className="text-sm font-semibold text-gray-800">{parsed.garmentName}</p>
                        <p className="text-xs text-gray-500">{parsed.garmentType}</p>
                      </div>
                      <div className="bg-white p-3 rounded-lg">
                        <p className="text-xs text-indigo-600 font-medium mb-1">Talla</p>
                        <p className="text-sm font-semibold text-gray-800">{parsed.sizeName}</p>
                        <p className="text-xs text-gray-500">{parsed.size}</p>
                      </div>
                      <div className="bg-white p-3 rounded-lg">
                        <p className="text-xs text-indigo-600 font-medium mb-1">Color</p>
                        <p className="text-sm font-semibold text-gray-800">{parsed.colorName}</p>
                        <p className="text-xs text-gray-500">{parsed.color}</p>
                      </div>
                      <div className="bg-white p-3 rounded-lg">
                        <p className="text-xs text-indigo-600 font-medium mb-1">Lote</p>
                        <p className="text-sm font-semibold text-gray-800">{parsed.batchCode}</p>
                        <p className="text-xs text-gray-500">#{parsed.sequenceNumber.toString().padStart(3, '0')}</p>
                      </div>
                      <div className="col-span-2 bg-white p-3 rounded-lg">
                        <p className="text-xs text-indigo-600 font-medium mb-1">Mes del Lote</p>
                        <p className="text-sm font-semibold text-gray-800">
                          {new Date(parsed.batchYear, parsed.batchMonth - 1).toLocaleDateString('es-ES', { month: 'long', year: 'numeric' })}
                        </p>
                      </div>
                      <div className="col-span-2 bg-white p-3 rounded-lg">
                        <p className="text-xs text-indigo-600 font-medium mb-1">Código Completo</p>
                        <p className="text-sm font-mono font-semibold text-gray-800 break-all">{parsed.fullCode}</p>
                      </div>
                    </div>
                  </div>
                )
              }
              return null
            })()}

            {/* Acciones Rápidas */}
            {garment.status !== 'baja' && (
              <div className="pt-4 border-t">
                <h2 className="font-semibold text-gray-800 mb-3">Registrar Acción</h2>
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
                    className={`flex flex-col items-center gap-1.5 p-3 border rounded-lg transition-colors ${
                      garment.status === 'inspeccion'
                        ? 'bg-yellow-50 hover:bg-yellow-100 border-yellow-300'
                        : 'bg-yellow-50 hover:bg-yellow-100 border-yellow-200'
                    }`}
                  >
                    <ClipboardCheck className="w-6 h-6 text-yellow-600" />
                    <span className="text-xs font-medium text-yellow-700 text-center">
                      {garment.status === 'inspeccion' ? 'Registrar Resultado' : 'Enviar a Inspección'}
                    </span>
                  </button>
                </div>
              </div>
            )}

            {/* QR Section */}
            <div className="flex flex-col items-center p-4 bg-gray-50 rounded-lg">
              <div className="mb-4">
                <QRCode
                  value={generateQRUrl(garment.id)}
                  size={150}
                  level="H"
                  includeMargin={true}
                />
              </div>
              <div className="space-y-2 w-full">
                <button
                  onClick={copyQRUrl}
                  className="w-full px-4 py-2 bg-blue-600 text-white rounded-lg hover:bg-blue-700 transition-colors flex items-center justify-center gap-2 text-sm"
                >
                  <Copy className="w-4 h-4" />
                  {copied ? 'URL Copiada!' : 'Copiar URL del QR'}
                </button>
                <button
                  onClick={downloadQR}
                  className="w-full px-4 py-2 bg-indigo-600 text-white rounded-lg hover:bg-indigo-700 transition-colors flex items-center justify-center gap-2 text-sm"
                >
                  <Download className="w-4 h-4" />
                  Descargar QR
                </button>
              </div>
            </div>

            {/* Información detallada */}
            <div className="grid md:grid-cols-2 gap-4 pt-4 border-t">
              {garment.description && (
                <div>
                  <p className="text-sm font-medium text-gray-600 mb-2">Descripción</p>
                  <p className="text-gray-800 bg-gray-50 p-3 rounded-lg">{garment.description}</p>
                </div>
              )}

              {garment.notes && (
                <div>
                  <p className="text-sm font-medium text-gray-600 mb-2">Notas</p>
                  <p className="text-gray-800 bg-gray-50 p-3 rounded-lg">{garment.notes}</p>
                </div>
              )}
            </div>

            {/* Historial de acciones */}
            {actions.length > 0 && (
              <div className="pt-4 border-t">
                <h2 className="font-semibold text-gray-800 mb-3">Historial de Acciones ({actions.length})</h2>
                <div className="space-y-2 max-h-64 overflow-y-auto">
                  {actions.map((action, idx) => (
                    <div key={idx} className="p-3 bg-gray-50 rounded-lg text-sm">
                      <div className="flex items-center justify-between mb-1">
                        <span className="font-medium text-gray-800">
                          {action.action_type.charAt(0).toUpperCase() + action.action_type.slice(1)}
                        </span>
                        <span className="text-xs text-gray-500">
                          {new Date(action.created_at).toLocaleString()}
                        </span>
                      </div>
                      {action.result && (
                        <p className="text-xs text-gray-600">Resultado: {action.result}</p>
                      )}
                      {action.notes && (
                        <p className="text-xs text-gray-600 mt-1">Notas: {action.notes}</p>
                      )}
                    </div>
                  ))}
                </div>
              </div>
            )}

            {/* Timestamps */}
            <div className="pt-4 border-t space-y-1 text-xs text-gray-500">
              <p>Creado: {new Date(garment.created_at).toLocaleString()}</p>
              <p>Actualizado: {new Date(garment.updated_at).toLocaleString()}</p>
            </div>

            {/* Documents */}
            {documents.length > 0 && (
              <div className="pt-4 border-t">
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
          </div>
        </div>

        {/* Footer */}
        <div className="mt-6 text-center text-sm text-gray-600">
          <p>ThreadTrack - Sistema de Rastreo de Prendas</p>
        </div>
      </div>

      {/* Modal de Acción */}
      {showActionModal && garment && (
        <div className="fixed inset-0 bg-black/50 flex items-center justify-center z-50 p-4">
          <div className="bg-white rounded-xl p-6 w-full max-w-md">
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

