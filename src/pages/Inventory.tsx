import { useState, useEffect, useRef } from 'react'
import { Package, PackageCheck, Droplets, Sparkles, ClipboardCheck, Scissors, PackageX, Loader2, Trash2, History, X, Calendar, ScanBarcode, Download, Copy, ChevronDown, Filter, Upload, Check, AlertCircle, FileArchive, Users, Pencil, AlertTriangle } from 'lucide-react'
import QRCode from 'qrcode.react'
import JSZip from 'jszip'
import { saveAs } from 'file-saver'
import { useRole } from '../contexts/AuthContext'
import { garmentService } from '../services/garmentService'
import { generateReportPDF } from '../services/reportService'
import { userService } from '../services/userService'
import type { UserProfile } from '../services/userService'
import BarcodeScanner from '../components/BarcodeScanner'
import { generateQRUrl, extractGarmentIdFromUrl } from '../lib/qrGenerator'
import { parseGarmentCode, GARMENT_TYPES, COLORS, SIZES, type GarmentType, type Color, type Size } from '../lib/garmentCodeParser'
import type { Garment, GarmentAction, ActionType, InspectionResult, GarmentStatus } from '../types'

const Inventory = () => {
  const { canCreateGarment, canDeleteGarment, canRecordAction, canEditGarment, isAdministrador } = useRole()
  const [garments, setGarments] = useState<any[]>([])
  const [searchTerm, setSearchTerm] = useState('')
  const [filterStatus, setFilterStatus] = useState<string>('all')
  const [filterDateFrom, setFilterDateFrom] = useState('')
  const [filterDateTo, setFilterDateTo] = useState('')
  const [showDateFilters, setShowDateFilters] = useState(false)
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
  const [newGarmentTeamId, setNewGarmentTeamId] = useState<string>('')
  const [showQRModal, setShowQRModal] = useState(false)
  const [copiedQR, setCopiedQR] = useState(false)
  const qrRef = useRef<HTMLDivElement>(null)
  // Filtros para códigos de prenda
  const [filterGarmentType, setFilterGarmentType] = useState<GarmentType | ''>('')
  const [filterColor, setFilterColor] = useState<Color | ''>('')
  const [filterSize, setFilterSize] = useState<Size | ''>('')
  const [filterBatch, setFilterBatch] = useState('')
  const [showCodeFilters, setShowCodeFilters] = useState(false)
  // Ingreso masivo de prendas
  const [showBulkModal, setShowBulkModal] = useState(false)
  const [bulkInput, setBulkInput] = useState('')
  const [bulkClientName, setBulkClientName] = useState('')
  const [bulkTeamId, setBulkTeamId] = useState<string>('')
  const [bulkGarments, setBulkGarments] = useState<any[]>([])
  const [bulkLoading, setBulkLoading] = useState(false)
  // Descarga masiva de QR
  const [downloadingQRs, setDownloadingQRs] = useState(false)
  const [downloadingReport, setDownloadingReport] = useState(false)
  // Asignación de usuarios a prendas
  const [showAssignModal, setShowAssignModal] = useState(false)
  const [assignTargetGarment, setAssignTargetGarment] = useState<Garment | null>(null)
  const [assignedUserIds, setAssignedUserIds] = useState<string[]>([])
  const [allUsersForAssign, setAllUsersForAssign] = useState<UserProfile[]>([])
  const [deleteError, setDeleteError] = useState<string | null>(null)
  const [loadingAssign, setLoadingAssign] = useState(false)
  const [savingAssign, setSavingAssign] = useState(false)
  const [bulkAssignUserIds, setBulkAssignUserIds] = useState<string[]>([])
  const [filterTeamId, setFilterTeamId] = useState<string>('all')
  const [teams, setTeams] = useState<{ id: string; name: string }[]>([])
  // Paginación
  const ITEMS_PER_PAGE = 12
  const [currentPage, setCurrentPage] = useState(1)
  // Edit garment modal
  const [showEditModal, setShowEditModal] = useState(false)
  const [editTargetGarment, setEditTargetGarment] = useState<Garment | null>(null)
  const [editForm, setEditForm] = useState({ name: '', description: '', client_name: '', client_phone: '', notes: '' })
  const [editLoading, setEditLoading] = useState(false)
  const [editError, setEditError] = useState<string | null>(null)

  const openEditModal = (garment: Garment) => {
    setEditTargetGarment(garment)
    setEditForm({
      name: garment.name,
      description: (garment as any).description ?? '',
      client_name: garment.client_name ?? '',
      client_phone: garment.client_phone ?? '',
      notes: garment.notes ?? '',
    })
    setEditError(null)
    setShowEditModal(true)
  }

  const handleEditSave = async () => {
    if (!editTargetGarment) return
    if (!editForm.name.trim()) { setEditError('El nombre es obligatorio'); return }
    setEditLoading(true)
    setEditError(null)
    try {
      await garmentService.update(editTargetGarment.id, {
        name: editForm.name.trim(),
        description: editForm.description.trim() || undefined,
        client_name: editForm.client_name.trim() || undefined,
        client_phone: editForm.client_phone.trim() || undefined,
        notes: editForm.notes.trim() || undefined,
      })
      setShowEditModal(false)
      await loadGarments()
    } catch (err: any) {
      setEditError(err.message || 'Error al guardar los cambios')
    } finally {
      setEditLoading(false)
    }
  }

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

  useEffect(() => {
    if (isAdministrador) {
      userService.getTeams().then(setTeams).catch(() => {})
    }
  }, [isAdministrador])

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
      garment.id.toLowerCase().includes(searchTerm.toLowerCase()) ||
      garment.code.toLowerCase().includes(searchTerm.toLowerCase()) ||
      garment.name.toLowerCase().includes(searchTerm.toLowerCase()) ||
      (garment.client_name?.toLowerCase().includes(searchTerm.toLowerCase()) ?? false)
    const matchesFilter = filterStatus === 'all' || garment.status === filterStatus
    
    // Filtro por fecha
    const garmentDate = new Date(garment.updated_at || garment.created_at).setHours(0, 0, 0, 0)
    const matchesDateFrom = !filterDateFrom || garmentDate >= new Date(filterDateFrom).setHours(0, 0, 0, 0)
    const matchesDateTo = !filterDateTo || garmentDate <= new Date(filterDateTo).setHours(23, 59, 59, 999)
    
    // Filtro por código de prenda (si está configurado)
    let matchesCodeFilters = true
    if (filterGarmentType || filterColor || filterSize || filterBatch) {
      const parsed = parseGarmentCode(garment.code)
      if (parsed.valid) {
        if (filterGarmentType && parsed.garmentType !== filterGarmentType) matchesCodeFilters = false
        if (filterColor && parsed.color !== filterColor) matchesCodeFilters = false
        if (filterSize && parsed.size !== filterSize) matchesCodeFilters = false
        if (filterBatch && parsed.batchCode !== filterBatch) matchesCodeFilters = false
      } else {
        // Si el código no es válido y hay filtros activos, excluir
        matchesCodeFilters = false
      }
    }
    
    const matchesTeam = !isAdministrador || filterTeamId === 'all' || garment.team_id === filterTeamId

    return matchesSearch && matchesFilter && matchesDateFrom && matchesDateTo && matchesCodeFilters && matchesTeam
  })

  const totalPages = Math.ceil(filteredGarments.length / ITEMS_PER_PAGE)
  const paginatedGarments = filteredGarments.slice(
    (currentPage - 1) * ITEMS_PER_PAGE,
    currentPage * ITEMS_PER_PAGE
  )

  // Resetear página al cambiar filtros
  useEffect(() => { setCurrentPage(1) }, [searchTerm, filterStatus, filterDateFrom, filterDateTo, filterGarmentType, filterColor, filterSize, filterBatch, filterTeamId])

  const handleAddGarment = async () => {
    if (!canCreateGarment) {
      alert('No tienes permisos para crear prendas')
      return
    }
    if (!newGarment.code || !newGarment.name) return
    try {
      await garmentService.create({
        code: newGarment.code,
        name: newGarment.name,
        client_name: newGarment.client_name || undefined,
        team_id: (isAdministrador && newGarmentTeamId) ? newGarmentTeamId : undefined,
      })
      setNewGarment({ code: '', name: '', client_name: '' })
      setNewGarmentTeamId('')
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
    if (!canDeleteGarment) {
      setDeleteError('No tienes permisos para eliminar prendas')
      return
    }
    try {
      await garmentService.delete(id)
      setShowDeleteModal(false)
      setGarmentToDelete(null)
      setDeleteError(null)
      loadGarments()
    } catch (error: any) {
      console.error('Error eliminando prenda:', error)
      setDeleteError(error.message || 'Error al eliminar la prenda')
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
      // Extrae el ID de la URL del QR, si es una URL válida
      const extractedId = extractGarmentIdFromUrl(code)
      // Si es una URL con ID, usa el ID; si no, busca el código como antes
      setSearchTerm(extractedId || code)
    } else {
      setNewGarment((prev) => ({ ...prev, code }))
      setTimeout(() => setShowModal(true), 100)
    }
    setShowScanner(false)
  }

  const downloadFilteredQRs = async () => {
    if (filteredGarments.length === 0) {
      alert('No hay prendas para descargar')
      return
    }

    try {
      setDownloadingQRs(true)
      const zip = new JSZip()
      const qrFolder = zip.folder('QR_Prendas')
      const QRCodeLib = await import('qrcode')

      for (const garment of filteredGarments) {
        const qrUrl = generateQRUrl(garment.id)

        try {
          // Crear canvas y generar QR
          const canvas = document.createElement('canvas')
          await QRCodeLib.default.toCanvas(canvas, qrUrl, {
            width: 300,
            margin: 10,
            color: { dark: '#000000', light: '#FFFFFF' },
          })

          // Convertir canvas a blob
          await new Promise<void>((resolve) => {
            canvas.toBlob((blob) => {
              if (blob) {
                // Parsear el código para generar nombre legible
                const parsed = parseGarmentCode(garment.code)
                let fileName: string
                
                if (parsed.valid) {
                  const sequenceStr = parsed.sequenceNumber.toString().padStart(3, '0')
                  fileName = `${parsed.garmentName} - Talla ${parsed.sizeName} - ${parsed.colorName} - ${sequenceStr}`
                } else {
                  fileName = garment.code
                }
                
                qrFolder?.file(`${fileName}.png`, blob)
              }
              resolve()
            }, 'image/png')
          })
        } catch (error) {
          console.error(`Error generando QR para ${garment.code}:`, error)
        }
      }

      // Generar nombre del ZIP con información de filtros
      let zipName = 'QR_Prendas'
      if (filterGarmentType || filterColor || filterSize || filterBatch) {
        const filters = []
        if (filterGarmentType) filters.push(GARMENT_TYPES[filterGarmentType])
        if (filterSize) filters.push(`Talla${filterSize}`)
        if (filterColor) filters.push(COLORS[filterColor])
        if (filterBatch) filters.push(filterBatch)
        zipName = `QR_${filters.join('_')}`
      }

      const zipBlob = await zip.generateAsync({ type: 'blob' })
      saveAs(zipBlob, `${zipName}_${new Date().toISOString().split('T')[0]}.zip`)
      alert(`Descargados ${filteredGarments.length} QR en formato ZIP`)
    } catch (error) {
      console.error('Error descargando QR:', error)
      alert('Error al descargar QR')
    } finally {
      setDownloadingQRs(false)
    }
  }

  const downloadFilteredReport = async () => {
    if (filteredGarments.length === 0) {
      alert('No hay prendas para reportar')
      return
    }
    try {
      setDownloadingReport(true)
      await generateReportPDF(filteredGarments)
    } catch (error) {
      console.error('Error generando reporte:', error)
      alert('Error al generar el reporte PDF')
    } finally {
      setDownloadingReport(false)
    }
  }

  const openDeleteModal = (garment: Garment) => {
    setGarmentToDelete(garment)
    setDeleteError(null)
    setShowDeleteModal(true)
  }

  const openAssignModal = async (garment: Garment) => {
    setAssignTargetGarment(garment)
    setShowAssignModal(true)
    setLoadingAssign(true)
    try {
      const [users, assignments] = await Promise.all([
        userService.getAllUsers(),
        userService.getGarmentAssignments(garment.id)
      ])
      setAllUsersForAssign(users.filter(u => u.role !== 'administrador'))
      setAssignedUserIds(assignments)
    } catch (err) {
      console.error('Error cargando asignaciones:', err)
    } finally {
      setLoadingAssign(false)
    }
  }

  const saveAssignments = async () => {
    if (!assignTargetGarment) return
    setSavingAssign(true)
    try {
      await userService.setGarmentAssignments(assignTargetGarment.id, assignedUserIds)
      setShowAssignModal(false)
    } catch (err) {
      console.error('Error guardando asignaciones:', err)
    } finally {
      setSavingAssign(false)
    }
  }

  const processBulkCodes = (input: string) => {
    const codes = input
      .split('\n')
      .map((line) => line.trim())
      .filter((line) => line.length > 0)

    const processed = codes.map((code) => {
      const parsed = parseGarmentCode(code)
      if (parsed.valid) {
        const name = `${parsed.garmentName} - Talla ${parsed.sizeName} - ${parsed.colorName}`
        return {
          code: parsed.fullCode,
          name,
          client_name: bulkClientName,
          parsed,
          valid: true,
        }
      } else {
        return {
          code,
          name: '',
          client_name: bulkClientName,
          error: parsed.error,
          valid: false,
        }
      }
    })

    setBulkGarments(processed)
  }

  const handleBulkCreate = async () => {
    const validGarments = bulkGarments.filter((g) => g.valid)

    if (validGarments.length === 0) {
      alert('No hay prendas válidas para crear')
      return
    }

    if (!canCreateGarment) {
      alert('No tienes permisos para crear prendas')
      return
    }

    try {
      setBulkLoading(true)
      let successCount = 0
      let errorCount = 0

      for (const garment of validGarments) {
        try {
          const created = await garmentService.create({
            code: garment.code,
            name: garment.name,
            client_name: garment.client_name || undefined,
            team_id: (isAdministrador && bulkTeamId) ? bulkTeamId : undefined,
          })
          if (isAdministrador && bulkAssignUserIds.length > 0) {
            await userService.setGarmentAssignments(created.id, bulkAssignUserIds)
          }
          successCount++
        } catch (error: any) {
          console.error(`Error creando ${garment.code}:`, error)
          errorCount++
        }
      }

      alert(`Creadas ${successCount} prendas. Errores: ${errorCount}`)
      setBulkInput('')
      setBulkClientName('')
      setBulkTeamId('')
      setBulkGarments([])
      setShowBulkModal(false)
      loadGarments()
    } catch (error) {
      console.error('Error en ingreso masivo:', error)
      alert('Error al crear prendas')
    } finally {
      setBulkLoading(false)
    }
  }

  return (
    <div className="max-w-6xl mx-auto pb-20 md:pb-0">
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
              {deleteError && (
                <div className="mb-4 px-3 py-2 bg-red-50 border border-red-200 text-red-700 text-sm rounded-lg">{deleteError}</div>
              )}
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

      {/* Modal de Asignación de Usuarios */}
      {showAssignModal && assignTargetGarment && (
        <div className="fixed inset-0 bg-black/50 flex items-center justify-center z-50 p-4">
          <div className="bg-white rounded-xl p-6 w-full max-w-md">
            <div className="flex items-center justify-between mb-4">
              <h3 className="font-semibold text-gray-800 flex items-center gap-2 min-w-0">
                <Users className="w-5 h-5 shrink-0 text-green-600" />
                <span className="truncate">Asignar: {assignTargetGarment.code}</span>
              </h3>
              <button onClick={() => setShowAssignModal(false)} className="p-1 hover:bg-gray-100 rounded ml-2 shrink-0">
                <X className="w-5 h-5" />
              </button>
            </div>
            {loadingAssign ? (
              <div className="flex justify-center py-8">
                <Loader2 className="w-8 h-8 text-blue-600 animate-spin" />
              </div>
            ) : (
              <>
                <p className="text-xs text-gray-500 mb-3">Usuarios que podrán ver y operar esta prenda:</p>
                <div className="space-y-1 max-h-64 overflow-y-auto border rounded-lg p-2 mb-4">
                  {allUsersForAssign.length === 0 ? (
                    <p className="text-sm text-gray-400 text-center py-4">No hay usuarios disponibles</p>
                  ) : (
                    allUsersForAssign.map(user => (
                      <label key={user.id} className="flex items-center gap-3 p-2 rounded hover:bg-gray-50 cursor-pointer">
                        <input
                          type="checkbox"
                          checked={assignedUserIds.includes(user.id)}
                          onChange={e => setAssignedUserIds(prev =>
                            e.target.checked ? [...prev, user.id] : prev.filter(id => id !== user.id)
                          )}
                          className="rounded"
                        />
                        <span className="flex-1 text-sm truncate">{user.email}</span>
                        <span className="text-xs bg-gray-100 text-gray-600 px-1.5 py-0.5 rounded capitalize shrink-0">{user.role}</span>
                      </label>
                    ))
                  )}
                </div>
                <div className="flex gap-2">
                  <button onClick={() => setShowAssignModal(false)} className="btn-secondary flex-1">Cancelar</button>
                  <button
                    onClick={saveAssignments}
                    disabled={savingAssign}
                    className="btn-primary flex-1 flex items-center justify-center gap-2"
                  >
                    {savingAssign && <Loader2 className="w-4 h-4 animate-spin" />}
                    Guardar ({assignedUserIds.length})
                  </button>
                </div>
              </>
            )}
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

      <div className="flex items-center gap-3 mb-4">
        <Package className="w-6 h-6 text-blue-600" />
        <h1 className="text-xl font-bold text-gray-800">Inventario</h1>
      </div>

      {/* Fila 1: búsqueda + filtros de equipo y fecha */}
      <div className="flex flex-col sm:flex-row gap-2 mb-3">
        {/* Buscador */}
        <div className="flex gap-2 flex-1">
          <input
            type="text"
            value={searchTerm}
            onChange={(e) => setSearchTerm(e.target.value)}
            placeholder="Buscar código, nombre..."
            className="input-field flex-1 py-2"
          />
          <button
            type="button"
            onClick={openScannerForSearch}
            className="px-3 py-2 bg-blue-100 hover:bg-blue-200 text-blue-700 rounded-lg transition-colors flex-shrink-0"
            title="Escanear QR/código para buscar"
          >
            <ScanBarcode className="w-5 h-5" />
          </button>
        </div>

        {/* Filtros secundarios alineados a la derecha */}
        <div className="flex gap-2 flex-shrink-0">
          {isAdministrador && teams.length > 0 && (
            <select
              value={filterTeamId}
              onChange={e => setFilterTeamId(e.target.value)}
              className="input-field text-sm py-2 w-auto"
            >
              <option value="all">Todos los equipos</option>
              {teams.map(t => (
                <option key={t.id} value={t.id}>{t.name}</option>
              ))}
            </select>
          )}
          <button
            onClick={() => setShowDateFilters(!showDateFilters)}
            className={`px-3 py-2 rounded-lg font-medium transition-colors flex items-center gap-2 text-sm whitespace-nowrap ${
              showDateFilters || filterDateFrom || filterDateTo
                ? 'bg-blue-100 text-blue-700 hover:bg-blue-200'
                : 'bg-gray-100 text-gray-700 hover:bg-gray-200'
            }`}
          >
            <Calendar className="w-4 h-4" />
            Fechas
            <ChevronDown className={`w-4 h-4 transition-transform ${showDateFilters ? 'rotate-180' : ''}`} />
          </button>
        </div>
      </div>

      {/* Fila 2 (colapsable): filtros de fecha */}
      {showDateFilters && (
        <div className="flex flex-wrap gap-3 mb-3 p-3 bg-gray-50 rounded-lg border border-gray-200">
          <div className="flex items-center gap-2">
            <label className="text-xs font-medium text-gray-600 whitespace-nowrap">Desde</label>
            <input
              type="date"
              value={filterDateFrom}
              onChange={(e) => setFilterDateFrom(e.target.value)}
              className="input-field text-xs py-1 px-2"
            />
          </div>
          <div className="flex items-center gap-2">
            <label className="text-xs font-medium text-gray-600 whitespace-nowrap">Hasta</label>
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
              className="text-xs text-blue-600 hover:text-blue-800 font-medium"
            >
              Limpiar fechas
            </button>
          )}
        </div>
      )}

      {/* Fila 3: filtros de estado */}
      <div className="flex gap-2 mb-3 overflow-x-auto pb-1">
        {[
          { key: 'all',           label: 'Total',          short: 'Total',    count: garments.length,                                          active: 'bg-blue-600 text-white' },
          { key: 'disponible',    label: 'Disponible',     short: 'Disp.',    count: garments.filter(g => g.status === 'disponible').length,    active: 'bg-green-600 text-white' },
          { key: 'lavado',        label: 'Lavado',         short: 'Lavado',   count: garments.filter(g => g.status === 'lavado').length,        active: 'bg-blue-600 text-white' },
          { key: 'esterilizacion',label: 'Esterilización', short: 'Esteril.', count: garments.filter(g => g.status === 'esterilizacion').length, active: 'bg-purple-600 text-white' },
          { key: 'inspeccion',    label: 'Inspección',     short: 'Insp.',    count: garments.filter(g => g.status === 'inspeccion').length,    active: 'bg-yellow-600 text-white' },
          { key: 'reparacion',    label: 'Reparación',     short: 'Repar.',   count: garments.filter(g => g.status === 'reparacion').length,    active: 'bg-orange-600 text-white' },
          { key: 'baja',          label: 'Bajas',          short: 'Bajas',    count: garments.filter(g => g.status === 'baja').length,          active: 'bg-red-600 text-white' },
        ].map(({ key, label, short, count, active }) => (
          <button
            key={key}
            onClick={() => setFilterStatus(key)}
            className={`px-3 py-1.5 rounded-lg text-xs font-medium transition-all whitespace-nowrap flex-shrink-0 ${filterStatus === key ? active : 'bg-gray-100 text-gray-700 hover:bg-gray-200'}`}
          >
            <span className="hidden md:inline">{label}</span>
            <span className="md:hidden">{short}</span>
            {' '}({count})
          </button>
        ))}
      </div>

      {/* Fila 4: filtro de código + botones de acción */}
      <div className="flex flex-wrap items-center gap-2 mb-4">
        <button
          onClick={() => setShowCodeFilters(!showCodeFilters)}
          className={`px-3 py-2 rounded-lg font-medium transition-colors flex items-center gap-2 text-sm ${
            showCodeFilters || filterGarmentType || filterColor || filterSize || filterBatch
              ? 'bg-indigo-100 text-indigo-700 hover:bg-indigo-200'
              : 'bg-gray-100 text-gray-700 hover:bg-gray-200'
          }`}
        >
          <Filter className="w-4 h-4" />
          Filtrar código
          <ChevronDown className={`w-4 h-4 transition-transform ${showCodeFilters ? 'rotate-180' : ''}`} />
        </button>
        {(filterGarmentType || filterColor || filterSize || filterBatch) && (
          <button
            onClick={() => { setFilterGarmentType(''); setFilterColor(''); setFilterSize(''); setFilterBatch('') }}
            className="text-xs text-indigo-600 hover:text-indigo-800 font-medium px-2 py-2"
          >
            Limpiar filtros
          </button>
        )}

        <div className="flex-1" />

        {isAdministrador && (
          <button
            onClick={async () => {
              setShowBulkModal(true)
              setBulkInput('')
              setBulkClientName('')
              setBulkGarments([])
              setBulkAssignUserIds([])
              if (allUsersForAssign.length === 0) {
                try {
                  const users = await userService.getAllUsers()
                  setAllUsersForAssign(users.filter(u => u.role !== 'administrador'))
                } catch {}
              }
            }}
            className="px-4 py-2 rounded-lg font-medium transition-colors flex items-center gap-2 text-sm bg-green-100 text-green-700 hover:bg-green-200"
          >
            <Upload className="w-4 h-4" />
            Ingreso Masivo
          </button>
        )}

        <button
          onClick={downloadFilteredReport}
          disabled={downloadingReport || filteredGarments.length === 0}
          className={`px-4 py-2 rounded-lg font-medium transition-colors flex items-center gap-2 text-sm ${
            downloadingReport || filteredGarments.length === 0
              ? 'bg-gray-300 text-gray-600 cursor-not-allowed'
              : 'bg-orange-100 text-orange-700 hover:bg-orange-200'
          }`}
        >
          {downloadingReport ? <Loader2 className="w-4 h-4 animate-spin" /> : <Download className="w-4 h-4" />}
          {downloadingReport ? 'Generando...' : `Reporte PDF (${filteredGarments.length})`}
        </button>

        {isAdministrador && (
          <button
            onClick={downloadFilteredQRs}
            disabled={downloadingQRs || filteredGarments.length === 0}
            className={`px-4 py-2 rounded-lg font-medium transition-colors flex items-center gap-2 text-sm ${
              downloadingQRs || filteredGarments.length === 0
                ? 'bg-gray-300 text-gray-600 cursor-not-allowed'
                : 'bg-blue-100 text-blue-700 hover:bg-blue-200'
            }`}
          >
            {downloadingQRs && <Loader2 className="w-4 h-4 animate-spin" />}
            {!downloadingQRs && <FileArchive className="w-4 h-4" />}
            {downloadingQRs ? 'Generando...' : `Descargar QR (${filteredGarments.length})`}
          </button>
        )}
      </div>

      {showCodeFilters && (
        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-3 mb-4 p-4 bg-indigo-50 rounded-lg border border-indigo-200">
          {/* Filtro por tipo de prenda */}
          <div>
            <label className="block text-xs font-medium text-gray-600 mb-2">Prenda</label>
            <select
              value={filterGarmentType}
              onChange={(e) => setFilterGarmentType(e.target.value as GarmentType | '')}
              className="input-field text-sm"
            >
              <option value="">Todas</option>
              {Object.entries(GARMENT_TYPES).map(([code, name]) => (
                <option key={code} value={code}>
                  {name}
                </option>
              ))}
            </select>
          </div>

          {/* Filtro por talla */}
          <div>
            <label className="block text-xs font-medium text-gray-600 mb-2">Talla</label>
            <select
              value={filterSize}
              onChange={(e) => setFilterSize(e.target.value as Size | '')}
              className="input-field text-sm"
            >
              <option value="">Todas</option>
              {Object.entries(SIZES).map(([code, name]) => (
                <option key={code} value={code}>
                  {name}
                </option>
              ))}
            </select>
          </div>

          {/* Filtro por color */}
          <div>
            <label className="block text-xs font-medium text-gray-600 mb-2">Color</label>
            <select
              value={filterColor}
              onChange={(e) => setFilterColor(e.target.value as Color | '')}
              className="input-field text-sm"
            >
              <option value="">Todos</option>
              {Object.entries(COLORS).map(([code, name]) => (
                <option key={code} value={code}>
                  {name}
                </option>
              ))}
            </select>
          </div>

          {/* Filtro por lote */}
          <div>
            <label className="block text-xs font-medium text-gray-600 mb-2">Lote</label>
            <input
              type="text"
              value={filterBatch}
              onChange={(e) => setFilterBatch(e.target.value.toUpperCase())}
              placeholder="Ej: 202512A"
              className="input-field text-sm"
            />
          </div>
        </div>
      )}

      {/* Modal de Ingreso Masivo */}
      {showBulkModal && (
        <div className="fixed inset-0 bg-black/50 flex items-center justify-center z-50 p-4 overflow-y-auto">
          <div className="bg-white rounded-xl p-6 w-full max-w-2xl my-8">
            <div className="flex items-center justify-between mb-4">
              <h2 className="text-xl font-bold">Ingreso Masivo de Prendas</h2>
              <button onClick={() => setShowBulkModal(false)} className="p-1 hover:bg-gray-100 rounded">
                <X className="w-5 h-5" />
              </button>
            </div>

            <div className="space-y-4">
              {/* Cliente */}
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-2">Cliente (opcional)</label>
                <input
                  type="text"
                  value={bulkClientName}
                  onChange={(e) => {
                    setBulkClientName(e.target.value)
                    processBulkCodes(bulkInput)
                  }}
                  placeholder="Nombre del cliente"
                  className="input-field w-full"
                />
                <p className="text-xs text-gray-500 mt-1">Se aplicará a todas las prendas de este lote</p>
              </div>

              {/* Equipo (solo admin) */}
              {isAdministrador && teams.length > 0 && (
                <div>
                  <label className="block text-sm font-medium text-gray-700 mb-2">Equipo / Empresa</label>
                  <select
                    value={bulkTeamId}
                    onChange={(e) => setBulkTeamId(e.target.value)}
                    className="input-field w-full"
                  >
                    <option value="">Sin equipo asignado</option>
                    {teams.map(t => (
                      <option key={t.id} value={t.id}>{t.name}</option>
                    ))}
                  </select>
                  <p className="text-xs text-gray-500 mt-1">Se aplicará a todas las prendas de este lote</p>
                </div>
              )}

              {/* Textarea */}
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-2">
                  Códigos de Prendas (uno por línea)
                </label>
                <textarea
                  value={bulkInput}
                  onChange={(e) => {
                    setBulkInput(e.target.value)
                    processBulkCodes(e.target.value)
                  }}
                  placeholder="202512A-OV-M-NE-001&#10;202512A-FI-L-AC-002&#10;202512A-PA-S-AM-003"
                  className="input-field w-full h-32 font-mono text-sm resize-none"
                />
                <p className="text-xs text-gray-500 mt-1">Formato: LOTE-PRENDA-TALLA-COLOR-NNN</p>
              </div>

              {/* Preview Table */}
              {bulkGarments.length > 0 && (
                <div className="overflow-x-auto">
                  <h3 className="text-sm font-semibold text-gray-800 mb-2">
                    Preview ({bulkGarments.filter((g) => g.valid).length} válidos de {bulkGarments.length})
                  </h3>
                  <table className="w-full text-xs border-collapse">
                    <thead>
                      <tr className="bg-gray-100">
                        <th className="border border-gray-300 px-2 py-1 text-left">Código</th>
                        <th className="border border-gray-300 px-2 py-1 text-left">Prenda</th>
                        <th className="border border-gray-300 px-2 py-1 text-left">Talla</th>
                        <th className="border border-gray-300 px-2 py-1 text-left">Color</th>
                        <th className="border border-gray-300 px-2 py-1 text-left">Lote</th>
                        <th className="border border-gray-300 px-2 py-1 text-left">Cliente</th>
                        <th className="border border-gray-300 px-2 py-1 text-center">Estado</th>
                      </tr>
                    </thead>
                    <tbody>
                      {bulkGarments.map((garment, idx) => (
                        <tr key={idx} className={garment.valid ? 'bg-green-50' : 'bg-red-50'}>
                          <td className="border border-gray-300 px-2 py-1 font-mono">{garment.code}</td>
                          <td className="border border-gray-300 px-2 py-1">
                            {garment.valid ? garment.parsed.garmentName : '-'}
                          </td>
                          <td className="border border-gray-300 px-2 py-1">
                            {garment.valid ? garment.parsed.sizeName : '-'}
                          </td>
                          <td className="border border-gray-300 px-2 py-1">
                            {garment.valid ? garment.parsed.colorName : '-'}
                          </td>
                          <td className="border border-gray-300 px-2 py-1">
                            {garment.valid ? garment.parsed.batchCode : '-'}
                          </td>
                          <td className="border border-gray-300 px-2 py-1 text-sm">
                            {garment.client_name || '-'}
                          </td>
                          <td className="border border-gray-300 px-2 py-1 text-center">
                            {garment.valid ? (
                              <Check className="w-4 h-4 text-green-600 mx-auto" />
                            ) : (
                              <div className="text-red-600" title={garment.error}>
                                <AlertCircle className="w-4 h-4 mx-auto" />
                              </div>
                            )}
                          </td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              )}

              {/* Asignación de usuarios — solo administrador */}
              {isAdministrador && (
                <div>
                  <label className="block text-sm font-medium text-gray-700 mb-2 flex items-center gap-2">
                    <Users className="w-4 h-4 text-green-600" />
                    Asignar acceso a usuarios
                  </label>
                  {allUsersForAssign.length === 0 ? (
                    <p className="text-xs text-gray-400">Cargando usuarios...</p>
                  ) : (
                    <div className="space-y-1 max-h-40 overflow-y-auto border rounded-lg p-2">
                      {allUsersForAssign.map(user => (
                        <label key={user.id} className="flex items-center gap-3 p-1.5 rounded hover:bg-gray-50 cursor-pointer">
                          <input
                            type="checkbox"
                            checked={bulkAssignUserIds.includes(user.id)}
                            onChange={e => setBulkAssignUserIds(prev =>
                              e.target.checked ? [...prev, user.id] : prev.filter(id => id !== user.id)
                            )}
                            className="rounded"
                          />
                          <span className="flex-1 text-sm truncate">{user.email}</span>
                          <span className="text-xs bg-gray-100 text-gray-600 px-1.5 py-0.5 rounded capitalize shrink-0">{user.role}</span>
                        </label>
                      ))}
                    </div>
                  )}
                  {bulkAssignUserIds.length > 0 && (
                    <p className="text-xs text-green-700 mt-1">Se asignarán a {bulkAssignUserIds.length} usuario{bulkAssignUserIds.length !== 1 ? 's' : ''}</p>
                  )}
                </div>
              )}

              {/* Botones */}
              <div className="flex gap-3">
                <button
                  onClick={() => setShowBulkModal(false)}
                  className="btn-secondary flex-1"
                >
                  Cancelar
                </button>
                <button
                  onClick={handleBulkCreate}
                  disabled={bulkLoading || bulkGarments.filter((g) => g.valid).length === 0}
                  className={`flex-1 px-4 py-2 rounded-lg font-medium transition-colors flex items-center justify-center gap-2 ${
                    bulkLoading || bulkGarments.filter((g) => g.valid).length === 0
                      ? 'bg-gray-300 text-gray-600 cursor-not-allowed'
                      : 'bg-green-600 hover:bg-green-700 text-white'
                  }`}
                >
                  {bulkLoading && <Loader2 className="w-4 h-4 animate-spin" />}
                  {bulkLoading ? 'Creando...' : 'Crear Prendas'}
                </button>
              </div>
            </div>
          </div>
        </div>
      )}

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
              {isAdministrador && teams.length > 0 && (
                <div>
                  <label className="block text-sm font-medium text-gray-700 mb-1">Equipo / Empresa</label>
                  <select
                    value={newGarmentTeamId}
                    onChange={(e) => setNewGarmentTeamId(e.target.value)}
                    className="input-field"
                  >
                    <option value="">Sin equipo asignado</option>
                    {teams.map(t => (
                      <option key={t.id} value={t.id}>{t.name}</option>
                    ))}
                  </select>
                </div>
              )}
            </div>
            <div className="flex gap-3 mt-6">
              <button onClick={() => setShowModal(false)} className="btn-secondary flex-1">
                Cancelar
              </button>
              <button 
                onClick={handleAddGarment} 
                disabled={!canCreateGarment}
                className={`flex-1 px-4 py-2 rounded-lg font-medium transition-colors ${
                  canCreateGarment
                    ? 'bg-blue-600 hover:bg-blue-700 text-white'
                    : 'bg-gray-200 text-gray-500 cursor-not-allowed'
                }`}
              >
                {canCreateGarment ? 'Guardar' : 'Sin permiso'}
              </button>
            </div>
          </div>
        </div>
      )}

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

            {/* Advertencia fin de vida útil en el modal */}
            {(() => {
              const selActions = (selectedGarment as any).actions ?? []
              const selLavado = selActions.filter((a: any) => a.action_type === 'lavado').length
              const selEsteril = selActions.filter((a: any) => a.action_type === 'esterilizacion').length
              const newLavado = actionType === 'lavado' ? selLavado + 1 : selLavado
              const newEsteril = actionType === 'esterilizacion' ? selEsteril + 1 : selEsteril
              const alreadyExpired = selLavado >= 100 || selEsteril >= 100
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
                        ? `Tiene ${selLavado >= 100 ? selLavado + ' lavados' : ''}${selLavado >= 100 && selEsteril >= 100 ? ' y ' : ''}${selEsteril >= 100 ? selEsteril + ' esterilizaciones' : ''}. Se recomienda darla de baja.`
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
        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-3">
          {paginatedGarments.map((garment) => {
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
            const LIFE_LIMIT = 100
            const LIFE_WARN = 80
            const lifeExpired = lavadoCount >= LIFE_LIMIT || esterilizacionCount >= LIFE_LIMIT
            const lifeNearEnd = !lifeExpired && (lavadoCount >= LIFE_WARN || esterilizacionCount >= LIFE_WARN)
            return (
              <div key={garment.id} className={`card p-4 ${lifeExpired ? 'border-2 border-red-400' : lifeNearEnd ? 'border-2 border-orange-300' : ''}`}>
                {/* Banner fin de vida útil */}
                {lifeExpired && (
                  <div className="flex items-center gap-2 mb-3 px-3 py-2 bg-red-50 border border-red-200 rounded-lg">
                    <AlertTriangle className="w-4 h-4 text-red-600 flex-shrink-0" />
                    <div className="min-w-0">
                      <p className="text-xs font-bold text-red-700">⚠ Fin de vida útil alcanzado</p>
                      <p className="text-xs text-red-600">
                        {lavadoCount >= LIFE_LIMIT && `${lavadoCount} lavados`}{lavadoCount >= LIFE_LIMIT && esterilizacionCount >= LIFE_LIMIT && ' · '}{esterilizacionCount >= LIFE_LIMIT && `${esterilizacionCount} esterilizaciones`}
                      </p>
                    </div>
                  </div>
                )}
                {lifeNearEnd && (
                  <div className="flex items-center gap-2 mb-3 px-3 py-2 bg-orange-50 border border-orange-200 rounded-lg">
                    <AlertTriangle className="w-4 h-4 text-orange-500 flex-shrink-0" />
                    <div className="min-w-0">
                      <p className="text-xs font-bold text-orange-700">Próximo a fin de vida útil</p>
                      <p className="text-xs text-orange-600">
                        {lavadoCount >= LIFE_WARN && `${lavadoCount}/100 lavados`}{lavadoCount >= LIFE_WARN && esterilizacionCount >= LIFE_WARN && ' · '}{esterilizacionCount >= LIFE_WARN && `${esterilizacionCount}/100 esterilizaciones`}
                      </p>
                    </div>
                  </div>
                )}
                {/* Botones de acción */}
                <div className="flex justify-end gap-1 mb-3 pb-3 border-b">
                  <button
                    onClick={() => openQRModal(garment)}
                    className="p-1.5 text-indigo-600 hover:bg-indigo-50 rounded-lg transition-colors"
                    title="Ver QR"
                  >
                    <ScanBarcode className="w-4 h-4" />
                  </button>
                  <button
                    onClick={() => openHistoryModal(garment)}
                    className="p-1.5 text-gray-500 hover:bg-gray-100 rounded-lg transition-colors"
                    title="Ver historial"
                  >
                    <History className="w-4 h-4" />
                  </button>
                  {canEditGarment && (
                    <button
                      onClick={() => openEditModal(garment)}
                      className="p-1.5 text-blue-600 hover:bg-blue-50 rounded-lg transition-colors"
                      title="Editar prenda"
                    >
                      <Pencil className="w-4 h-4" />
                    </button>
                  )}
                  {isAdministrador && (
                    <button
                      onClick={() => openAssignModal(garment)}
                      className="p-1.5 text-green-600 hover:bg-green-50 rounded-lg transition-colors"
                      title="Asignar usuarios"
                    >
                      <Users className="w-4 h-4" />
                    </button>
                  )}
                  {canDeleteGarment && (
                    <button
                      onClick={() => openDeleteModal(garment)}
                      className="p-1.5 text-red-500 hover:bg-red-50 rounded-lg transition-colors"
                      title="Eliminar"
                    >
                      <Trash2 className="w-4 h-4" />
                    </button>
                  )}
                </div>

                {/* Código */}
                <div className="font-mono text-sm font-semibold text-gray-800 mb-2">{garment.code}</div>

                {/* Información extraída del código */}
                {(() => {
                  const parsed = parseGarmentCode(garment.code)
                  if (parsed.valid) {
                    return (
                      <div className="text-xs text-gray-600 mb-2 space-y-0.5 p-2 bg-gray-50 rounded">
                        <div><strong>Prenda:</strong> {parsed.garmentName}</div>
                        <div><strong>Talla:</strong> {parsed.sizeName}</div>
                        <div><strong>Color:</strong> {parsed.colorName}</div>
                        <div><strong>Lote:</strong> {parsed.batchCode}</div>
                      </div>
                    )
                  }
                  return null
                })()}

                {/* Nombre */}
                <p className="text-sm font-medium text-gray-700 line-clamp-2 mb-2">{garment.name}</p>

                {/* Cliente */}
                {garment.client_name && (
                  <div className="text-xs text-gray-600 mb-2 line-clamp-1">
                    {garment.client_name}
                  </div>
                )}

                {/* Estado */}
                <div className="mb-3">
                  <span className={`inline-flex items-center gap-1 px-2 py-1 rounded-full text-xs font-medium ${statusLabels[garment.status as GarmentStatus]?.color || 'bg-gray-100'}`}>
                    <StatusIcon className="w-3 h-3" />
                    {statusLabels[garment.status as GarmentStatus]?.label || garment.status}
                  </span>
                </div>

                {/* Contadores - Grid 3 columnas */}
                {actions.length > 0 && (
                  <div className="grid grid-cols-3 gap-2 mb-3">
                    <div className={`p-2 rounded text-center ${lavadoCount >= LIFE_LIMIT ? 'bg-red-100' : lavadoCount >= LIFE_WARN ? 'bg-orange-100' : 'bg-blue-50'}`}>
                      <div className="flex justify-center mb-0.5">
                        <Droplets className={`w-3 h-3 ${lavadoCount >= LIFE_LIMIT ? 'text-red-600' : lavadoCount >= LIFE_WARN ? 'text-orange-500' : 'text-blue-600'}`} />
                      </div>
                      <p className={`text-sm font-bold ${lavadoCount >= LIFE_LIMIT ? 'text-red-600' : lavadoCount >= LIFE_WARN ? 'text-orange-600' : 'text-blue-600'}`}>{lavadoCount}</p>
                      <p className={`text-xs ${lavadoCount >= LIFE_LIMIT ? 'text-red-700' : lavadoCount >= LIFE_WARN ? 'text-orange-700' : 'text-blue-700'}`}>Lavados</p>
                    </div>
                    <div className={`p-2 rounded text-center ${esterilizacionCount >= LIFE_LIMIT ? 'bg-red-100' : esterilizacionCount >= LIFE_WARN ? 'bg-orange-100' : 'bg-purple-50'}`}>
                      <div className="flex justify-center mb-0.5">
                        <Sparkles className={`w-3 h-3 ${esterilizacionCount >= LIFE_LIMIT ? 'text-red-600' : esterilizacionCount >= LIFE_WARN ? 'text-orange-500' : 'text-purple-600'}`} />
                      </div>
                      <p className={`text-sm font-bold ${esterilizacionCount >= LIFE_LIMIT ? 'text-red-600' : esterilizacionCount >= LIFE_WARN ? 'text-orange-600' : 'text-purple-600'}`}>{esterilizacionCount}</p>
                      <p className={`text-xs ${esterilizacionCount >= LIFE_LIMIT ? 'text-red-700' : esterilizacionCount >= LIFE_WARN ? 'text-orange-700' : 'text-purple-700'}`}>Esterilizaciones</p>
                    </div>
                    <div className="p-2 bg-orange-50 rounded text-center">
                      <div className="flex justify-center mb-0.5">
                        <Scissors className="w-3 h-3 text-orange-600" />
                      </div>
                      <p className="text-sm font-bold text-orange-600">{reparacionCount}</p>
                      <p className="text-xs text-orange-700">Reparaciones</p>
                    </div>
                  </div>
                )}

                {/* Botones de acciones - Grid 2 columnas */}
                <div className="grid grid-cols-2 gap-2">
                  {/* Todos los botones de acciones */}
                  {availableActions.filter(a => a === 'lavado' || a === 'esterilizacion' || a === 'inspeccion' || a === 'reparacion').map((action) => {
                    const ActionIcon = actionLabels[action].icon
                    const isCurrentAction = garment.status === action
                    return (
                      <button
                        key={action}
                        onClick={() => openActionModal(garment, action)}
                        disabled={isCurrentAction || !canRecordAction}
                        className={`w-full inline-flex items-center justify-center gap-1 px-2 py-1.5 rounded text-xs font-medium transition-colors ${
                          isCurrentAction || !canRecordAction
                            ? 'bg-gray-200 text-gray-500 cursor-not-allowed opacity-60' 
                            : 'bg-gray-100 hover:bg-gray-200 cursor-pointer'
                        }`}
                        title={!canRecordAction ? 'No tienes permiso para registrar acciones' : undefined}
                      >
                        <ActionIcon className="w-3 h-3" />
                        <span className="hidden md:inline">{actionLabels[action].label}</span>
                        <span className="md:hidden text-xs">
                          {action === 'lavado' ? 'Lavado' : action === 'esterilizacion' ? 'Esteriliz.' : action === 'inspeccion' ? 'Inspección' : 'Reparación'}
                        </span>
                      </button>
                    )
                  })}

                  {/* Resultado de Inspección */}
                  {garment.status === 'inspeccion' && canRecordAction && (
                    <button
                      onClick={() => openActionModal(garment, 'inspeccion')}
                      className="col-span-2 w-full inline-flex items-center justify-center gap-1 px-2 py-1.5 bg-yellow-100 hover:bg-yellow-200 text-yellow-800 rounded text-xs font-medium transition-colors cursor-pointer"
                    >
                      <ClipboardCheck className="w-3 h-3" />
                      <span>Registrar Resultado</span>
                    </button>
                  )}
                </div>
              </div>
            )
          })}
        </div>
      )}

      {/* Paginación */}
      {!loading && filteredGarments.length > 0 && totalPages > 1 && (
        <div className="flex items-center justify-between mt-4 px-1">
          <p className="text-sm text-gray-500">
            Mostrando {(currentPage - 1) * ITEMS_PER_PAGE + 1}–{Math.min(currentPage * ITEMS_PER_PAGE, filteredGarments.length)} de {filteredGarments.length} prendas
          </p>
          <div className="flex items-center gap-1">
            <button
              onClick={() => setCurrentPage(1)}
              disabled={currentPage === 1}
              className="px-2 py-1 rounded text-sm font-medium disabled:opacity-40 disabled:cursor-not-allowed bg-gray-100 hover:bg-gray-200 text-gray-700"
            >
              «
            </button>
            <button
              onClick={() => setCurrentPage(p => Math.max(1, p - 1))}
              disabled={currentPage === 1}
              className="px-3 py-1 rounded text-sm font-medium disabled:opacity-40 disabled:cursor-not-allowed bg-gray-100 hover:bg-gray-200 text-gray-700"
            >
              ‹
            </button>
            {Array.from({ length: totalPages }, (_, i) => i + 1)
              .filter(p => p === 1 || p === totalPages || Math.abs(p - currentPage) <= 1)
              .reduce<(number | '...')[]>((acc, p, idx, arr) => {
                if (idx > 0 && typeof arr[idx - 1] === 'number' && (p as number) - (arr[idx - 1] as number) > 1) acc.push('...')
                acc.push(p)
                return acc
              }, [])
              .map((p, idx) =>
                p === '...' ? (
                  <span key={`ellipsis-${idx}`} className="px-2 py-1 text-sm text-gray-400">…</span>
                ) : (
                  <button
                    key={p}
                    onClick={() => setCurrentPage(p as number)}
                    className={`px-3 py-1 rounded text-sm font-medium transition-colors ${
                      currentPage === p
                        ? 'bg-blue-600 text-white'
                        : 'bg-gray-100 hover:bg-gray-200 text-gray-700'
                    }`}
                  >
                    {p}
                  </button>
                )
              )}
            <button
              onClick={() => setCurrentPage(p => Math.min(totalPages, p + 1))}
              disabled={currentPage === totalPages}
              className="px-3 py-1 rounded text-sm font-medium disabled:opacity-40 disabled:cursor-not-allowed bg-gray-100 hover:bg-gray-200 text-gray-700"
            >
              ›
            </button>
            <button
              onClick={() => setCurrentPage(totalPages)}
              disabled={currentPage === totalPages}
              className="px-2 py-1 rounded text-sm font-medium disabled:opacity-40 disabled:cursor-not-allowed bg-gray-100 hover:bg-gray-200 text-gray-700"
            >
              »
            </button>
          </div>
        </div>
      )}

      {/* Edit Garment Modal */}
      {showEditModal && editTargetGarment && (
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
              <span className="font-mono text-sm font-semibold text-gray-800">{editTargetGarment.code}</span>
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

      {/* QR Modal */}
      {showQRModal && selectedGarment && (
        <div className="fixed inset-0 bg-black/50 flex items-center justify-center z-50 p-4">
          <div className="bg-white rounded-xl max-w-md w-full overflow-hidden">
            {/* Header */}
            <div className="flex items-center justify-between p-4 border-b">
              <h3 className="font-semibold text-gray-800 truncate min-w-0">QR de {selectedGarment.name}</h3>
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
