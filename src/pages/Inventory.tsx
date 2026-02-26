import { useState, useEffect, useRef } from 'react'
import { Package, PackageCheck, Droplets, Sparkles, ClipboardCheck, Scissors, PackageX, Loader2, Trash2, History, X, Shirt, AlertTriangle, Calendar, ScanBarcode, Download, Copy } from 'lucide-react'
import QRCode from 'qrcode.react'
import { garmentService } from '../services/garmentService'
import BarcodeScanner from '../components/BarcodeScanner'
import { generateQRUrl } from '../lib/qrGenerator'
import type { Garment, GarmentAction, ActionType, InspectionResult, GarmentStatus } from '../types'

const Inventory = () => {
  const [garments, setGarments] = useState<any[]>([])
  const [searchTerm, setSearchTerm] = useState('')
  const [filterStatus, setFilterStatus] = useState<string>('all')
  const [filterDateFrom, setFilterDateFrom] = useState('')
  const [filterDateTo, setFilterDateTo] = useState('')
  const [loading, setLoading] = useState(true)
  const [showModal, setShowModal] = useState(false)
  const [showActionModal, setShowActionModal] = useState(false)
  const [showHistoryModal, setShowHistoryModal] = useState(false)
  const [showDeleteModal, setShowDeleteModal] = useState(false)
  const [garmentToDelete, setGarmentToDelete] = useState<Garment | null>(null)
  const [showScanner, setShowScanner] = useState(false)
  const [scannerTarget, setScannerTarget] = useState<'search' | 'newCode'>('search')
  const [selectedGarment, setSelectedGarment] = useState<Garment | null>(null)
  const [garmentHistory, setGarmentHistory] = useState<GarmentAction[]>([])
  const [actionType, setActionType] = useState<ActionType>('lavado')
  const [inspectionResult, setInspectionResult] = useState<InspectionResult>('aprobado')
  const [actionNotes, setActionNotes] = useState('')
  const [newGarment, setNewGarment] = useState({ code: '', name: '', client_name: '' })
  const [showQRModal, setShowQRModal] = useState(false)
  const [copiedQR, setCopiedQR] = useState(false)
  const qrRef = useRef<HTMLDivElement>(null)

  const statusLabels: Record<GarmentStatus, { label: string; color: string; icon: any }> = {
    disponible: { label: 'Disponible', color: 'bg-green-100 text-green-800', icon: PackageCheck },
    lavado: { label: 'En Lavado', color: 'bg-blue-100 text-blue-800', icon: Droplets },
    esterilizacion: { label: 'En Esterilización', color: 'bg-purple-100 text-purple-800', icon: Sparkles },
    inspeccion: { label: 'En Inspección', color: 'bg-yellow-100 text-yellow-800', icon: ClipboardCheck },
    reparacion: { label: 'En Reparación', color: 'bg-orange-100 text-orange-800', icon: Scissors },
    baja: { label: 'Baja', color: 'bg-red-100 text-red-800', icon: Trash2 },
  }

  const actionLabels: Record<ActionType, { label: string; icon: any }> = {
    lavado: { label: 'Enviar a Lavado', icon: Droplets },
    esterilizacion: { label: 'Enviar a Esterilización', icon: Sparkles },
    inspeccion: { label: 'Enviar a Inspección', icon: ClipboardCheck },
    reparacion: { label: 'Enviar a Reparación', icon: Scissors },
    baja: { label: 'Dar de Baja', icon: Trash2 },
  }

  useEffect(() => {
    loadGarments()
  }, [])

  // Cargar prendas y sus acciones
  const loadGarments = async () => {
    try {
      setLoading(true)
      const data = await garmentService.getAll()
      // Para cada prenda, cargar sus acciones
      const garmentsWithActions = await Promise.all(
        data.map(async (g) => {
          const actions = await garmentService.getActions(g.id)
          return { ...g, actions }
        })
      )
      setGarments(garmentsWithActions)
    } catch (error) {
      console.error('Error cargando prendas:', error)
    } finally {
      setLoading(false)
    }
  }

  const filteredGarments = garments.filter((garment) => {
    const matchesSearch =
      garment.code.toLowerCase().includes(searchTerm.toLowerCase()) ||
      garment.name.toLowerCase().includes(searchTerm.toLowerCase()) ||
      (garment.client_name?.toLowerCase().includes(searchTerm.toLowerCase()) ?? false)
    const matchesFilter = filterStatus === 'all' || garment.status === filterStatus
    
    // Filtro por fecha
    const garmentDate = new Date(garment.updated_at || garment.created_at).setHours(0, 0, 0, 0)
    const matchesDateFrom = !filterDateFrom || garmentDate >= new Date(filterDateFrom).setHours(0, 0, 0, 0)
    const matchesDateTo = !filterDateTo || garmentDate <= new Date(filterDateTo).setHours(23, 59, 59, 999)
    
    return matchesSearch && matchesFilter && matchesDateFrom && matchesDateTo
  })

  const handleAddGarment = async () => {
    if (!newGarment.code || !newGarment.name) return
    try {
      await garmentService.create({
        code: newGarment.code,
        name: newGarment.name,
        client_name: newGarment.client_name || undefined
      })
      setNewGarment({ code: '', name: '', client_name: '' })
      setShowModal(false)
      loadGarments()
    } catch (error: any) {
      if (error.code === '23505') {
        alert('Ya existe una prenda con ese código')
      } else {
        console.error('Error creando prenda:', error)
      }
    }
  }

  const downloadQR = () => {
    if (!selectedGarment || !qrRef.current) return

    const element = qrRef.current.querySelector('canvas')
    if (!element) return

    const link = document.createElement('a')
    link.href = element.toDataURL('image/png')
    link.download = `qr-${selectedGarment.code}.png`
    document.body.appendChild(link)
    link.click()
    document.body.removeChild(link)
  }

  const copyQRUrl = () => {
    if (!selectedGarment) return
    const url = generateQRUrl(selectedGarment.id)
    navigator.clipboard.writeText(url)
    setCopiedQR(true)
    setTimeout(() => setCopiedQR(false), 2000)
  }

  const openQRModal = (garment: Garment) => {
    setSelectedGarment(garment)
    setShowQRModal(true)
  }

  const handleDelete = async (id: string) => {
    try {
      await garmentService.delete(id)
      setShowDeleteModal(false)
      setGarmentToDelete(null)
      loadGarments()
    } catch (error) {
      console.error('Error eliminando prenda:', error)
    }
  }

  const openActionModal = (garment: Garment, action: ActionType) => {
    setSelectedGarment(garment)
    setActionType(action)
    setActionNotes('')
    setInspectionResult('aprobado')
    setShowActionModal(true)
  }

  const handleAction = async () => {
    if (!selectedGarment) return
    try {
      await garmentService.registerAction(selectedGarment.id, actionType, {
        result: actionType === 'inspeccion' ? inspectionResult : undefined,
        notes: actionNotes || undefined
      })
      setShowActionModal(false)
      setSelectedGarment(null)
      loadGarments()
    } catch (error) {
      console.error('Error registrando acción:', error)
    }
  }

  const openHistoryModal = async (garment: Garment) => {
    setSelectedGarment(garment)
    try {
      const history = await garmentService.getActions(garment.id)
      setGarmentHistory(history)
      setShowHistoryModal(true)
    } catch (error) {
      console.error('Error cargando historial:', error)
    }
  }

  const getAvailableActions = (status: GarmentStatus): ActionType[] => {
    // Desde cualquier estado activo se puede enviar a lavado, esterilización o inspección
    if (status === 'baja') return []
    if (status === 'inspeccion') return [] // En inspección se muestra el botón especial de resultado
    return ['lavado', 'esterilizacion', 'inspeccion']
  }

  const formatDate = (dateString: string) => {
    return new Date(dateString).toLocaleDateString('es-ES', {
      day: '2-digit',
      month: 'short',
      year: 'numeric',
      hour: '2-digit',
      minute: '2-digit'
    })
  }

  const openScannerForSearch = () => {
    setScannerTarget('search')
    setShowScanner(true)
  }

  const openScannerForNewCode = () => {
    setScannerTarget('newCode')
    setShowModal(false) // Oculta el modal de Nueva Prenda
    setTimeout(() => setShowScanner(true), 100) // Espera a que se oculte antes de mostrar el escáner
  }

  const handleScanResult = (code: string) => {
    if (scannerTarget === 'search') {
      setSearchTerm(code)
    } else {
      setNewGarment((prev) => ({ ...prev, code }))
      setTimeout(() => setShowModal(true), 100) // Vuelve a mostrar el modal de Nueva Prenda
    }
    setShowScanner(false)
  }

  const openDeleteModal = (garment: Garment) => {
    setGarmentToDelete(garment)
    setShowDeleteModal(true)
  }

  return (
    <div className="max-w-4xl mx-auto pb-20 md:pb-0">
      {/* Modal de Confirmación de Eliminación */}
      {showDeleteModal && garmentToDelete && (
        <div className="fixed inset-0 bg-black/50 flex items-center justify-center z-50 p-4">
          <div className="bg-white rounded-xl p-6 w-full max-w-sm">
            <div className="text-center">
              <div className="mx-auto w-12 h-12 bg-red-100 rounded-full flex items-center justify-center mb-4">
                <Trash2 className="w-6 h-6 text-red-600" />
              </div>
              <h3 className="text-lg font-semibold text-gray-800 mb-2">¿Eliminar prenda?</h3>
              <p className="text-gray-600 mb-2">Esta acción no se puede deshacer.</p>
              <div className="p-3 bg-gray-50 rounded-lg mb-4">
                <div className="font-mono text-sm">{garmentToDelete.code}</div>
                <div className="text-gray-600 text-sm">{garmentToDelete.name}</div>
              </div>
            </div>
            <div className="flex gap-3">
              <button
                onClick={() => { setShowDeleteModal(false); setGarmentToDelete(null); }}
                className="btn-secondary flex-1"
              >
                Cancelar
              </button>
              <button
                onClick={() => handleDelete(garmentToDelete.id)}
                className="flex-1 px-4 py-2 bg-red-600 hover:bg-red-700 text-white rounded-lg font-medium transition-colors"
              >
                Eliminar
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Scanner Modal */}
      {showScanner && (
        <BarcodeScanner
          onScan={handleScanResult}
          onClose={() => setShowScanner(false)}
        />
      )}

      <div className="flex items-center gap-3 mb-6">
        <Package className="w-8 h-8 text-blue-600" />
        <h1 className="text-2xl font-bold text-gray-800">Inventario</h1>
      </div>

      {/* Modal para agregar prenda */}
      {showModal && !showScanner && (
        <div className="fixed inset-0 bg-black/50 flex items-center justify-center z-50 p-4">
          <div className="bg-white rounded-xl p-6 w-full max-w-md">
            <h2 className="text-xl font-bold mb-4">Nueva Prenda</h2>
            <div className="space-y-4">
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1">Código *</label>
                <div className="flex gap-2">
                  <input
                    type="text"
                    value={newGarment.code}
                    onChange={(e) => setNewGarment({ ...newGarment, code: e.target.value })}
                    className="input-field flex-1"
                    placeholder="Ej: PRD-001"
                  />
                  <button
                    type="button"
                    onClick={openScannerForNewCode}
                    className="px-3 py-2 bg-blue-100 hover:bg-blue-200 text-blue-700 rounded-lg transition-colors"
                    title="Escanear código"
                  >
                    <ScanBarcode className="w-5 h-5" />
                  </button>
                </div>
              </div>
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1">Nombre *</label>
                <input
                  type="text"
                  value={newGarment.name}
                  onChange={(e) => setNewGarment({ ...newGarment, name: e.target.value })}
                  className="input-field"
                  placeholder="Ej: Camisa azul talla M"
                />
              </div>
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1">Cliente</label>
                <input
                  type="text"
                  value={newGarment.client_name}
                  onChange={(e) => setNewGarment({ ...newGarment, client_name: e.target.value })}
                  className="input-field"
                  placeholder="Nombre del cliente"
                />
              </div>
            </div>
            <div className="flex gap-3 mt-6">
              <button onClick={() => setShowModal(false)} className="btn-secondary flex-1">
                Cancelar
              </button>
              <button onClick={handleAddGarment} className="btn-primary flex-1">
                Guardar
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Search and Filter */}
      <div className="card mb-6">
        <div className="flex flex-col md:flex-row gap-4">
          <div className="flex-1">
            <label className="block text-sm font-medium text-gray-700 mb-1">
              Buscar
            </label>
            <div className="flex gap-2">
              <input
                type="text"
                value={searchTerm}
                onChange={(e) => setSearchTerm(e.target.value)}
                placeholder="Código o nombre..."
                className="input-field flex-1"
              />
              <button
                type="button"
                onClick={openScannerForSearch}
                className="px-3 py-2 bg-blue-100 hover:bg-blue-200 text-blue-700 rounded-lg transition-colors"
                title="Escanear código para buscar"
              >
                <ScanBarcode className="w-5 h-5" />
              </button>
            </div>
          </div>
          <div className="flex flex-col gap-1 min-w-[140px]">
            <div className="flex items-center gap-2">
              <label className="text-xs font-medium text-gray-600 whitespace-nowrap">
                <Calendar className="w-3 h-3 inline mr-1" />
                Desde
              </label>
              <input
                type="date"
                value={filterDateFrom}
                onChange={(e) => setFilterDateFrom(e.target.value)}
                className="input-field text-xs py-1 px-2"
              />
            </div>
            <div className="flex items-center gap-2">
              <label className="text-xs font-medium text-gray-600 whitespace-nowrap">
                <Calendar className="w-3 h-3 inline mr-1" />
                Hasta
              </label>
              <input
                type="date"
                value={filterDateTo}
                onChange={(e) => setFilterDateTo(e.target.value)}
                className="input-field text-xs py-1 px-2"
              />
            </div>
            {(filterDateFrom || filterDateTo) && (
              <button
                onClick={() => { setFilterDateFrom(''); setFilterDateTo(''); }}
                className="text-xs text-blue-600 hover:text-blue-800 text-right"
              >
                Limpiar fechas
              </button>
            )}
          </div>
        </div>
      </div>

      {/* Stats - Click para filtrar */}
      <div className="grid grid-cols-3 md:grid-cols-6 gap-3 mb-6">
        <button
          onClick={() => setFilterStatus('all')}
          className={`card text-center py-3 transition-all ${filterStatus === 'all' ? 'ring-2 ring-blue-500 bg-blue-50' : 'hover:bg-gray-50'}`}
        >
          <Shirt className="w-5 h-5 text-blue-600 mx-auto mb-1" />
          <div className="text-xl font-bold text-blue-600">
            {garments.length}
          </div>
          <div className="text-xs text-gray-600">Total</div>
        </button>
        <button
          onClick={() => setFilterStatus('disponible')}
          className={`card text-center py-3 transition-all ${filterStatus === 'disponible' ? 'ring-2 ring-green-500 bg-green-50' : 'hover:bg-gray-50'}`}
        >
          <PackageCheck className="w-5 h-5 text-green-600 mx-auto mb-1" />
          <div className="text-xl font-bold text-green-600">
            {garments.filter((g) => g.status === 'disponible').length}
          </div>
          <div className="text-xs text-gray-600">Disponible</div>
        </button>
        <button
          onClick={() => setFilterStatus('lavado')}
          className={`card text-center py-3 transition-all ${filterStatus === 'lavado' ? 'ring-2 ring-blue-500 bg-blue-50' : 'hover:bg-gray-50'}`}
        >
          <Droplets className="w-5 h-5 text-blue-600 mx-auto mb-1" />
          <div className="text-xl font-bold text-blue-600">
            {garments.filter((g) => g.status === 'lavado').length}
          </div>
          <div className="text-xs text-gray-600">Lavado</div>
        </button>
        <button
          onClick={() => setFilterStatus('esterilizacion')}
          className={`card text-center py-3 transition-all ${filterStatus === 'esterilizacion' ? 'ring-2 ring-purple-500 bg-purple-50' : 'hover:bg-gray-50'}`}
        >
          <Sparkles className="w-5 h-5 text-purple-600 mx-auto mb-1" />
          <div className="text-xl font-bold text-purple-600">
            {garments.filter((g) => g.status === 'esterilizacion').length}
          </div>
          <div className="text-xs text-gray-600">Esterilización</div>
        </button>
        <button
          onClick={() => setFilterStatus('reparacion')}
          className={`card text-center py-3 transition-all ${filterStatus === 'reparacion' ? 'ring-2 ring-orange-500 bg-orange-50' : 'hover:bg-gray-50'}`}
        >
          <Scissors className="w-5 h-5 text-orange-600 mx-auto mb-1" />
          <div className="text-xl font-bold text-orange-600">
            {garments.filter((g) => g.status === 'reparacion').length}
          </div>
          <div className="text-xs text-gray-600">Reparación</div>
        </button>
        <button
          onClick={() => setFilterStatus('baja')}
          className={`card text-center py-3 transition-all ${filterStatus === 'baja' ? 'ring-2 ring-red-500 bg-red-50' : 'hover:bg-gray-50'}`}
        >
          <AlertTriangle className="w-5 h-5 text-red-600 mx-auto mb-1" />
          <div className="text-xl font-bold text-red-600">
            {garments.filter((g) => g.status === 'baja').length}
          </div>
          <div className="text-xs text-gray-600">Bajas</div>
        </button>
      </div>

      {/* Modal de Acción */}
      {showActionModal && selectedGarment && (
        <div className="fixed inset-0 bg-black/50 flex items-center justify-center z-50 p-4">
          <div className="bg-white rounded-xl p-6 w-full max-w-md">
            <div className="flex items-center justify-between mb-4">
              <h2 className="text-xl font-bold">
                {actionType === 'inspeccion' ? 'Resultado de Inspección' : actionLabels[actionType].label}
              </h2>
              <button onClick={() => setShowActionModal(false)} className="p-1 hover:bg-gray-100 rounded">
                <X className="w-5 h-5" />
              </button>
            </div>
            
            <div className="mb-4 p-3 bg-gray-50 rounded-lg">
              <div className="font-mono text-lg">{selectedGarment.code}</div>
              <div className="text-gray-600">{selectedGarment.name}</div>
            </div>

            {actionType === 'inspeccion' && (
              <div className="mb-4">
                <label className="block text-sm font-medium text-gray-700 mb-2">Resultado</label>
                <div className="space-y-2">
                  <label className="flex items-center gap-3 p-3 border rounded-lg cursor-pointer hover:bg-gray-50">
                    <input
                      type="radio"
                      name="result"
                      value="aprobado"
                      checked={inspectionResult === 'aprobado'}
                      onChange={() => setInspectionResult('aprobado')}
                    />
                    <PackageCheck className="w-5 h-5 text-green-600" />
                    <span>Aprobado - Vuelve a Disponible</span>
                  </label>
                  <label className="flex items-center gap-3 p-3 border rounded-lg cursor-pointer hover:bg-gray-50">
                    <input
                      type="radio"
                      name="result"
                      value="reparacion"
                      checked={inspectionResult === 'reparacion'}
                      onChange={() => setInspectionResult('reparacion')}
                    />
                    <Scissors className="w-5 h-5 text-orange-600" />
                    <span>Requiere Reparación</span>
                  </label>
                  <label className="flex items-center gap-3 p-3 border rounded-lg cursor-pointer hover:bg-gray-50">
                    <input
                      type="radio"
                      name="result"
                      value="baja"
                      checked={inspectionResult === 'baja'}
                      onChange={() => setInspectionResult('baja')}
                    />
                    <Trash2 className="w-5 h-5 text-red-600" />
                    <span>Dar de Baja</span>
                  </label>
                </div>
              </div>
            )}

            <div className="mb-4">
              <label className="block text-sm font-medium text-gray-700 mb-1">
                {inspectionResult === 'baja' ? 'Motivo de Baja *' : 'Notas (opcional)'}
              </label>
              <textarea
                value={actionNotes}
                onChange={(e) => setActionNotes(e.target.value)}
                className="input-field min-h-[80px]"
                placeholder={inspectionResult === 'baja' ? 'Describe el motivo de la baja...' : 'Agregar notas...'}
              />
            </div>

            <div className="flex gap-3">
              <button onClick={() => setShowActionModal(false)} className="btn-secondary flex-1">
                Cancelar
              </button>
              <button 
                onClick={handleAction} 
                className="btn-primary flex-1"
                disabled={inspectionResult === 'baja' && !actionNotes}
              >
                Confirmar
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Modal de Historial */}
      {showHistoryModal && selectedGarment && (
        <div className="fixed inset-0 bg-black/50 flex items-center justify-center z-50 p-4">
          <div className="bg-white rounded-xl p-6 w-full max-w-md max-h-[80vh] overflow-hidden flex flex-col">
            <div className="flex items-center justify-between mb-4">
              <h2 className="text-xl font-bold">Historial de Acciones</h2>
              <button onClick={() => setShowHistoryModal(false)} className="p-1 hover:bg-gray-100 rounded">
                <X className="w-5 h-5" />
              </button>
            </div>
            
            <div className="mb-4 p-3 bg-gray-50 rounded-lg">
              <div className="font-mono text-lg">{selectedGarment.code}</div>
              <div className="text-gray-600">{selectedGarment.name}</div>
            </div>

            <div className="overflow-y-auto flex-1">
              {garmentHistory.length === 0 ? (
                <p className="text-center text-gray-500 py-4">Sin historial de acciones</p>
              ) : (
                <div className="space-y-3">
                  {garmentHistory.map((action) => (
                    <div key={action.id} className="p-3 border rounded-lg">
                      <div className="flex items-center gap-2 mb-1">
                        {actionLabels[action.action_type] && (
                          <>
                            {(() => {
                              const Icon = actionLabels[action.action_type].icon
                              return <Icon className="w-4 h-4" />
                            })()}
                            <span className="font-medium capitalize">{action.action_type}</span>
                          </>
                        )}
                        {action.result && (
                          <span className="text-sm text-gray-500">→ {action.result}</span>
                        )}
                      </div>
                      {action.notes && (
                        <p className="text-sm text-gray-600 mt-1">{action.notes}</p>
                      )}
                      <p className="text-xs text-gray-400 mt-2">{formatDate(action.created_at)}</p>
                    </div>
                  ))}
                </div>
              )}
            </div>
          </div>
        </div>
      )}

      {/* Garment List */}
      {loading ? (
        <div className="card text-center py-12">
          <Loader2 className="w-12 h-12 text-blue-600 mx-auto mb-4 animate-spin" />
          <p className="text-gray-600">Cargando prendas...</p>
        </div>
      ) : filteredGarments.length === 0 ? (
        <div className="card text-center py-12">
          <PackageX className="w-12 h-12 text-gray-400 mx-auto mb-4" />
          <p className="text-gray-600">
            {garments.length === 0
              ? 'No hay prendas en el inventario'
              : 'No se encontraron prendas con ese criterio'}
          </p>
        </div>
      ) : (
        <div className="space-y-3">
          {filteredGarments.map((garment) => {
            const StatusIcon = statusLabels[garment.status as GarmentStatus]?.icon || Package
            const availableActions = getAvailableActions(garment.status as GarmentStatus)
            // Contadores de acciones
            const actions = (garment.actions ?? []) as import('../types').GarmentAction[];
            const lavadoCount = actions.filter((a) => a.action_type === 'lavado').length
            const esterilizacionCount = actions.filter((a) => a.action_type === 'esterilizacion').length
            const reparacionCount = actions.filter((a) =>
              a.action_type === 'reparacion' ||
              (a.action_type === 'inspeccion' && a.result === 'reparacion')
            ).length
            return (
              <div key={garment.id} className="card">
                <div className="flex items-start justify-between mb-3">
                  <div>
                    <div className="font-mono text-lg text-gray-800">{garment.code}</div>
                    <div className="text-gray-600">{garment.name}</div>
                    {garment.client_name && (
                      <div className="text-sm text-gray-500">Cliente: {garment.client_name}</div>
                    )}
                  </div>
                  <div className="flex gap-1">
                    <button
                      onClick={() => openHistoryModal(garment)}
                      className="p-2 text-gray-500 hover:bg-gray-100 rounded-lg transition-colors"
                      title="Ver historial"
                    >
                      <History className="w-5 h-5" />
                    </button>
                    <button
                      onClick={() => openDeleteModal(garment)}
                      className="p-2 text-red-500 hover:bg-red-50 rounded-lg transition-colors"
                      title="Eliminar"
                    >
                      <Trash2 className="w-5 h-5" />
                    </button>
                  </div>
                </div>
                
                {/* Estado actual y resumen de acciones */}
                <div className="flex flex-col md:flex-row md:items-center md:gap-4 mb-3">
                  <div className="flex items-center gap-2 mb-1 md:mb-0">
                    <span className="text-sm text-gray-500">Estado:</span>
                    <span className={`inline-flex items-center gap-1 px-3 py-1 rounded-full text-sm font-medium ${statusLabels[garment.status as GarmentStatus]?.color || 'bg-gray-100'}`}>
                      <StatusIcon className="w-4 h-4" />
                      {statusLabels[garment.status as GarmentStatus]?.label || garment.status}
                    </span>
                  </div>
                  <div className="flex flex-wrap gap-2 text-xs text-gray-600 w-full">
                    <span className="inline-flex items-center gap-1 bg-blue-50 px-2 py-1 rounded whitespace-nowrap"><Droplets className="w-4 h-4 text-blue-500" /> {lavadoCount} Lavados</span>
                    <span className="inline-flex items-center gap-1 bg-purple-50 px-2 py-1 rounded whitespace-nowrap"><Sparkles className="w-4 h-4 text-purple-500" /> {esterilizacionCount} Esterilizaciones</span>
                    <span className="inline-flex items-center gap-1 bg-orange-50 px-2 py-1 rounded whitespace-nowrap"><Scissors className="w-4 h-4 text-orange-500" /> {reparacionCount} Reparaciones</span>
                  </div>
                </div>

                {/* Acciones disponibles */}
                <div className="flex flex-wrap gap-2">
                  {availableActions.map((action) => {
                    const ActionIcon = actionLabels[action].icon
                    // Resaltar el botón si la prenda ya está en ese estado
                    const isCurrentAction = garment.status === action
                    return (
                      <button
                        key={action}
                        onClick={() => openActionModal(garment, action)}
                        className={`inline-flex items-center gap-1 px-3 py-1.5 rounded-lg text-sm font-medium transition-colors ${
                          isCurrentAction 
                            ? 'bg-blue-100 text-blue-800 hover:bg-blue-200' 
                            : 'bg-gray-100 hover:bg-gray-200'
                        }`}
                      >
                        <ActionIcon className="w-4 h-4" />
                        {actionLabels[action].label}
                      </button>
                    )
                  })}
                  {garment.status === 'inspeccion' && (
                    <button
                      onClick={() => openActionModal(garment, 'inspeccion')}
                      className="inline-flex items-center gap-1 px-3 py-1.5 bg-yellow-100 hover:bg-yellow-200 text-yellow-800 rounded-lg text-sm font-medium transition-colors"
                    >
                      <ClipboardCheck className="w-4 h-4" />
                      Registrar Resultado
                    </button>
                  )}
                  <button
                    onClick={() => openQRModal(garment)}
                    className="inline-flex items-center gap-1 px-3 py-1.5 bg-indigo-100 hover:bg-indigo-200 text-indigo-800 rounded-lg text-sm font-medium transition-colors"
                    title="Ver/Descargar QR"
                  >
                    <ScanBarcode className="w-4 h-4" />
                    Ver QR
                  </button>
                </div>
              </div>
            )
          })}
        </div>
      )}

      {/* QR Modal */}
      {showQRModal && selectedGarment && (
        <div className="fixed inset-0 bg-black/50 flex items-center justify-center z-50 p-4">
          <div className="bg-white rounded-xl max-w-md w-full overflow-hidden">
            {/* Header */}
            <div className="flex items-center justify-between p-4 border-b">
              <h3 className="font-semibold text-gray-800">QR de {selectedGarment.name}</h3>
              <button
                onClick={() => setShowQRModal(false)}
                className="p-2 hover:bg-gray-100 rounded-lg transition-colors"
              >
                <X className="w-5 h-5" />
              </button>
            </div>

            {/* QR Display */}
            <div className="p-6 flex flex-col items-center">
              <div
                ref={qrRef}
                className="bg-gray-50 p-4 rounded-lg mb-4"
              >
                <QRCode
                  value={generateQRUrl(selectedGarment.id)}
                  size={200}
                  level="H"
                  includeMargin={true}
                />
              </div>
              <p className="text-sm text-gray-600 text-center font-mono break-all mb-4">
                {generateQRUrl(selectedGarment.id)}
              </p>
            </div>

            {/* Actions */}
            <div className="p-4 border-t space-y-2">
              <button
                onClick={downloadQR}
                className="btn-secondary w-full flex items-center justify-center gap-2"
              >
                <Download className="w-5 h-5" />
                Descargar QR
              </button>

              <button
                onClick={copyQRUrl}
                className="btn-secondary w-full flex items-center justify-center gap-2"
              >
                <Copy className="w-5 h-5" />
                {copiedQR ? 'Copiado!' : 'Copiar URL'}
              </button>

              <button
                onClick={() => setShowQRModal(false)}
                className="btn-outline w-full"
              >
                Cerrar
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  )
}

export default Inventory
