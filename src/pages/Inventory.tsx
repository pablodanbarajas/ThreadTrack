import { useState, useEffect, useRef, useCallback, useMemo } from 'react'
import { Archive, Package, PackageCheck, Droplets, ClipboardCheck, Scissors, PackageX, Loader2, FileClock, X, ScanBarcode, Download, Copy, Upload, FileArchive, Pencil, Search } from 'lucide-react'
import QRCode from 'qrcode.react'
import JSZip from 'jszip'
import { saveAs } from 'file-saver'
import { useRole } from '../contexts/AuthContext'
import { useFeedback } from '../components/ui/feedback-context'
import { StatusBadge, StatusDot, Notice } from '../components/ui/StatusBadge'
import { SkeletonList } from '../components/ui/Skeleton'
import { garmentStatusTone, lifeTone, actionTone, softButton } from '../lib/tones'
import { garmentService } from '../services/garmentService'
import { useArchiveGarment } from '../hooks/useArchiveGarment'
import { useDebouncedValue } from '../hooks/useDebouncedValue'
import Pagination from '../components/ui/Pagination'
import ImportGarmentsModal from '../components/ImportGarmentsModal'
import InventoryFilterBar, { FilterField } from '../components/InventoryFilterBar'
import SignatureField from '../components/SignatureField'
import ActionAuthor from '../components/ActionAuthor'
import RecordedBy from '../components/RecordedBy'
import InspectionResultPicker from '../components/InspectionResultPicker'
import { garmentSignatureMeaning } from '../lib/signature'
import { signatureService } from '../services/accessService'
import { generateReportExcel } from '../services/reportService'
import { userService } from '../services/userService'
import BarcodeScanner from '../components/BarcodeScanner'
import { generateQRUrl, extractGarmentId } from '../lib/qrGenerator'
import { parseGarmentCode, GARMENT_TYPES, COLORS, SIZES, type GarmentType, type Color, type Size } from '../lib/garmentCodeParser'
import { WASH_STERILIZATION_CYCLE_LIMIT, getCycleLifePercent, getCycleLifeStatus } from '../lib/lifeStatus'
import type { CycleLifeStatus } from '../lib/lifeStatus'
import type { Garment, GarmentListItem, GarmentListFilters, LifeStatus, GarmentSort, GarmentAction, ActionType, InspectionResult, GarmentStatus, LegacyActionType } from '../types'

const compactHex = (value: string) => value.toLowerCase().replace(/[^a-f0-9]/g, '')


const buildUuidCandidate = (rawSearch: string): string => {
  const direct = extractGarmentId(rawSearch)
  if (direct) return direct.toLowerCase()

  const lower = rawSearch.toLowerCase()
  const marker = 'prenda'
  const base = lower.includes(marker) ? lower.slice(lower.lastIndexOf(marker) + marker.length) : lower
  const compact = compactHex(base)

  return compact.length >= 24 ? compact : ''
}

const INVENTORY_FILTERS_STORAGE_KEY = 'threadtrack.inventoryFilters'

interface InventoryFilters {
  searchTerm: string
  filterStatus: string
  filterDateFrom: string
  filterDateTo: string
  filterGarmentType: GarmentType | ''
  filterColor: Color | ''
  filterSize: Size | ''
  filterBatch: string
  filterLifeStatuses: CycleLifeStatus[]
  filterIdleDays: number
  sortBy: GarmentSort
}

const defaultInventoryFilters: InventoryFilters = {
  searchTerm: '',
  filterStatus: 'all',
  filterDateFrom: '',
  filterDateTo: '',
  filterGarmentType: '',
  filterColor: '',
  filterSize: '',
  filterBatch: '',
  filterLifeStatuses: [],
  filterIdleDays: 0,
  sortBy: 'recientes',
}

const getStoredInventoryFilters = (): InventoryFilters => {
  try {
    const stored = sessionStorage.getItem(INVENTORY_FILTERS_STORAGE_KEY)
    if (!stored) return defaultInventoryFilters
    const filters = { ...defaultInventoryFilters, ...JSON.parse(stored) }
    return {
      ...filters,
      filterStatus: filters.filterStatus === 'esterilizacion' ? 'lavado' : filters.filterStatus,
    }
  } catch {
    return defaultInventoryFilters
  }
}

const Inventory = () => {
  const { canCreateGarment, canDeleteGarment, canRecordAction, canEditGarment, isAdministrador } = useRole()
  // Página actual de prendas (paginada y filtrada en el servidor)
  const [garments, setGarments] = useState<GarmentListItem[]>([])
  const [totalGarments, setTotalGarments] = useState(0)
  const [loading, setLoading] = useState(true)
  const [reloadKey, setReloadKey] = useState(0)
  const feedback = useFeedback()
  const storedFilters = useRef(getStoredInventoryFilters()).current
  const [searchTerm, setSearchTerm] = useState(storedFilters.searchTerm)
  const [filterStatus, setFilterStatus] = useState<string>(storedFilters.filterStatus)
  const [filterDateFrom, setFilterDateFrom] = useState(storedFilters.filterDateFrom)
  const [filterDateTo, setFilterDateTo] = useState(storedFilters.filterDateTo)
  const [showModal, setShowModal] = useState(false)
  const [showActionModal, setShowActionModal] = useState(false)
  const [showHistoryModal, setShowHistoryModal] = useState(false)
  const [showScanner, setShowScanner] = useState(false)
  const [scannerTarget, setScannerTarget] = useState<'search' | 'newCode'>('search')
  const [selectedGarment, setSelectedGarment] = useState<Garment | null>(null)
  const [garmentHistory, setGarmentHistory] = useState<GarmentAction[]>([])
  const [actionType, setActionType] = useState<ActionType>('lavado')
  const [inspectionResult, setInspectionResult] = useState<InspectionResult>('aprobado')
  const [actionNotes, setActionNotes] = useState('')
  const [actionLoading, setActionLoading] = useState(false)
  const [actionError, setActionError] = useState<string | null>(null)
  const [signaturePassword, setSignaturePassword] = useState('')
  const [newGarment, setNewGarment] = useState({ code: '', name: '', client_name: '' })
  const [newGarmentTeamId, setNewGarmentTeamId] = useState<string>('')
  const [showQRModal, setShowQRModal] = useState(false)
  const [copiedQR, setCopiedQR] = useState(false)
  const qrRef = useRef<HTMLDivElement>(null)
  // Filtros para códigos de prenda
  const [filterGarmentType, setFilterGarmentType] = useState<GarmentType | ''>(storedFilters.filterGarmentType)
  const [filterColor, setFilterColor] = useState<Color | ''>(storedFilters.filterColor)
  const [filterSize, setFilterSize] = useState<Size | ''>(storedFilters.filterSize)
  const [filterBatch, setFilterBatch] = useState(storedFilters.filterBatch)
  const [filterIdleDays, setFilterIdleDays] = useState<number>(storedFilters.filterIdleDays)
  const [sortBy, setSortBy] = useState<GarmentSort>(storedFilters.sortBy)
  const [showFilters, setShowFilters] = useState(false)
  const [showImport, setShowImport] = useState(false)
  // Descarga masiva de QR
  const [downloadingQRs, setDownloadingQRs] = useState(false)
  const [downloadingReport, setDownloadingReport] = useState(false)
  const [teams, setTeams] = useState<{ id: string; name: string }[]>([])
  const [filterLifeStatuses, setFilterLifeStatuses] = useState<CycleLifeStatus[]>(storedFilters.filterLifeStatuses)
  // Paginación
  const ITEMS_PER_PAGE = 12
  const [currentPage, setCurrentPage] = useState(1)
  // Edit garment modal
  const [showEditModal, setShowEditModal] = useState(false)
  const [editTargetGarment, setEditTargetGarment] = useState<Garment | null>(null)
  const [editForm, setEditForm] = useState({ name: '', description: '', client_name: '', client_phone: '', notes: '', reason: '' })
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
      reason: '',
    })
    setEditError(null)
    setShowEditModal(true)
  }

  const handleEditSave = async () => {
    if (!editTargetGarment) return
    if (!editForm.name.trim()) { setEditError('El nombre es obligatorio'); return }
    if (!editForm.reason.trim()) { setEditError('El motivo del cambio es obligatorio'); return }
    setEditLoading(true)
    setEditError(null)
    try {
      await garmentService.update(editTargetGarment.id, {
        name: editForm.name.trim(),
        description: editForm.description.trim() || undefined,
        client_name: editForm.client_name.trim() || undefined,
        client_phone: editForm.client_phone.trim() || undefined,
        notes: editForm.notes.trim() || undefined,
      }, editForm.reason.trim())
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
    lavado: { label: 'En Lavado y Esterilización', color: 'bg-blue-100 text-blue-800', icon: Droplets },
    inspeccion: { label: 'En Inspección', color: 'bg-yellow-100 text-yellow-800', icon: ClipboardCheck },
    reparacion: { label: 'En Reparación', color: 'bg-orange-100 text-orange-800', icon: Scissors },
    baja: { label: 'Baja', color: 'bg-red-100 text-red-800', icon: PackageX },
  }

  const actionLabels: Record<ActionType | LegacyActionType, { label: string; icon: any }> = {
    lavado: { label: 'Lavado y Esterilización', icon: Droplets },
    esterilizacion: { label: 'Lavado y Esterilización', icon: Droplets },
    inspeccion: { label: 'Inspección', icon: ClipboardCheck },
    reparacion: { label: 'Reparación', icon: Scissors },
    baja: { label: 'Dar de Baja', icon: PackageX },
  }

  const lifeStatusStyles: Record<
    ReturnType<typeof getCycleLifeStatus>,
    { label: string; dot: string; text: string }
  > = {
    verde: {
      label: 'Verde',
      dot: 'bg-green-500',
      text: 'text-green-700',
    },
    amarillo: {
      label: 'Amarillo',
      dot: 'bg-yellow-400',
      text: 'text-yellow-700',
    },
    naranja: {
      label: 'Naranja',
      dot: 'bg-orange-500',
      text: 'text-orange-700',
    },
    rojo: {
      label: 'Rojo',
      dot: 'bg-red-500',
      text: 'text-red-700',
    },
  }

  // Recargar la página actual (después de crear, editar o registrar acciones)
  const loadGarments = useCallback(() => { setReloadKey((k) => k + 1) }, [])

  useEffect(() => {
    const filters: InventoryFilters = {
      searchTerm,
      filterStatus,
      filterDateFrom,
      filterDateTo,
      filterGarmentType,
      filterColor,
      filterSize,
      filterBatch,
      filterLifeStatuses,
      filterIdleDays,
      sortBy,
    }
    try { sessionStorage.setItem(INVENTORY_FILTERS_STORAGE_KEY, JSON.stringify(filters)) } catch { /* sin almacenamiento */ }
  }, [searchTerm, filterStatus, filterDateFrom, filterDateTo, filterGarmentType, filterColor, filterSize, filterBatch, filterLifeStatuses, filterIdleDays, sortBy])

  useEffect(() => {
    if (isAdministrador) {
      userService.getTeams().then(setTeams).catch(() => {})
    }
  }, [isAdministrador])

  const debouncedSearch = useDebouncedValue(searchTerm)
  const [pageSize, setPageSize] = useState(ITEMS_PER_PAGE)

  const listFilters = useMemo<GarmentListFilters>(() => ({
    search: buildUuidCandidate(debouncedSearch) || extractGarmentId(debouncedSearch) || debouncedSearch,
    status: filterStatus === 'all' ? null : (filterStatus as GarmentStatus),
    dateFrom: filterDateFrom || null,
    dateTo: filterDateTo || null,
    garmentType: filterGarmentType || null,
    color: filterColor || null,
    size: filterSize || null,
    batch: filterBatch || null,
    life: filterLifeStatuses as LifeStatus[],
    idleDays: filterIdleDays || null,
  }), [debouncedSearch, filterStatus, filterDateFrom, filterDateTo, filterGarmentType, filterColor, filterSize, filterBatch, filterLifeStatuses, filterIdleDays])
  const listQuery = useMemo(() => ({ ...listFilters, sort: sortBy }), [listFilters, sortBy])

  useEffect(() => {
    let cancelled = false
    setLoading(true)
    garmentService.list(listQuery, currentPage, pageSize)
      .then((res) => {
        if (cancelled) return
        setGarments(res.rows)
        setTotalGarments(res.total)
      })
      .catch((error) => {
        console.error('Error cargando prendas:', error)
        if (!cancelled) feedback.error('No se pudo cargar el inventario')
      })
      .finally(() => { if (!cancelled) setLoading(false) })
    return () => { cancelled = true }
  }, [listQuery, currentPage, pageSize, reloadKey, feedback])

  const hasActiveFilters = Object.values(listFilters).some((v) => (Array.isArray(v) ? v.length > 0 : !!v))
  // Filtros del panel (sin contar la búsqueda ni el estado, que están a la vista)
  const panelFilterCount = [filterGarmentType, filterSize, filterColor, filterBatch, filterDateFrom, filterDateTo,
    filterIdleDays ? 'x' : '', filterLifeStatuses.length ? 'x' : ''].filter(Boolean).length
  const clearFilters = () => {
    setFilterStatus('all'); setFilterGarmentType(''); setFilterSize(''); setFilterColor(''); setFilterBatch('')
    setFilterDateFrom(''); setFilterDateTo(''); setFilterIdleDays(0)
    setFilterLifeStatuses([]); setSortBy('recientes')
  }

  // La página actual ya viene filtrada y ordenada desde el servidor
  const filteredGarments = garments
  const paginatedGarments = garments

  // Resetear página al cambiar filtros
  useEffect(() => { setCurrentPage(1) }, [debouncedSearch, filterIdleDays, sortBy, pageSize, filterStatus, filterDateFrom, filterDateTo, filterGarmentType, filterColor, filterSize, filterBatch, filterLifeStatuses])

  const handleAddGarment = async () => {
    if (!canCreateGarment) {
      feedback.error('No tienes permisos para crear prendas')
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
        feedback.error('Ya existe una prenda con ese código')
      } else {
        console.error('Error creando prenda:', error)
      }
    }
  }

  const downloadQR = () => {
    if (!selectedGarment || !qrRef.current) return

    const qrCanvas = qrRef.current.querySelector('canvas')
    if (!qrCanvas) return

    const shortCode = selectedGarment.short_code
    const pad = 16
    const textH = shortCode ? 56 : 0

    const out = document.createElement('canvas')
    out.width  = qrCanvas.width  + pad * 2
    out.height = qrCanvas.height + pad * 2 + textH
    const ctx = out.getContext('2d')!

    // Fondo blanco
    ctx.fillStyle = '#ffffff'
    ctx.fillRect(0, 0, out.width, out.height)

    // QR
    ctx.drawImage(qrCanvas, pad, pad)

    // Código corto centrado abajo del QR
    if (shortCode) {
      ctx.fillStyle = '#000000'
      ctx.font = 'bold 32px monospace'
      ctx.textAlign = 'center'
      ctx.textBaseline = 'middle'
      ctx.fillText(shortCode, out.width / 2, qrCanvas.height + pad + textH / 2)
    }

    const link = document.createElement('a')
    link.href = out.toDataURL('image/png')
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

  const openActionModal = (garment: Garment, action: ActionType) => {
    setSelectedGarment(garment)
    setActionType(action)
    setActionNotes('')
    setInspectionResult('aprobado')
    setActionError(null)
    setSignaturePassword('')
    setShowActionModal(true)
  }

  const signatureMeaning = garmentSignatureMeaning(actionType, actionType === 'inspeccion' ? inspectionResult : undefined)

  const handleAction = async () => {
    if (!selectedGarment) return
    setActionLoading(true)
    setActionError(null)
    try {
      const signatureToken = signatureMeaning ? await signatureService.sign(signaturePassword) : undefined
      await garmentService.registerAction(selectedGarment.id, actionType, {
        result: actionType === 'inspeccion' ? inspectionResult : undefined,
        notes: actionNotes || undefined,
        signatureToken,
      })
      setShowActionModal(false)
      setSelectedGarment(null)
      setSignaturePassword('')
      loadGarments()
    } catch (error: any) {
      console.error('Error registrando acción:', error)
      setActionError(error.message || 'Error al registrar la acción')
    } finally {
      setActionLoading(false)
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
    // Desde cualquier estado activo se puede enviar a lavado y esterilización o inspección
    if (status === 'baja') return []
    if (status === 'inspeccion') return [] // En inspección se muestra el botón especial de resultado
    return ['lavado', 'inspeccion']
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
      const extractedId = extractGarmentId(code)
      // Si es una URL con ID, usa el ID; si no, busca el código como antes
      setSearchTerm(extractedId || code)
    } else {
      setNewGarment((prev) => ({ ...prev, code }))
      setTimeout(() => setShowModal(true), 100)
    }
    setShowScanner(false)
  }

  const downloadFilteredQRs = async () => {
    if (totalGarments === 0) {
      feedback.toast('No hay prendas para descargar', 'warning')
      return
    }

    try {
      setDownloadingQRs(true)
      const zip = new JSZip()
      const qrFolder = zip.folder('QR_Prendas')
      const QRCodeLib = await import('qrcode')

      const allGarments = await garmentService.listAll(listFilters)
      for (const garment of allGarments) {
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
      feedback.success(`Descargados ${totalGarments} QR en formato ZIP`)
    } catch (error) {
      console.error('Error descargando QR:', error)
      feedback.error('Error al descargar QR')
    } finally {
      setDownloadingQRs(false)
    }
  }

  const downloadFilteredReport = async () => {
    if (totalGarments === 0) {
      feedback.toast('No hay prendas para reportar', 'warning')
      return
    }
    try {
      setDownloadingReport(true)
      await generateReportExcel(await garmentService.listAll(listFilters, true))
    } catch (error) {
      console.error('Error generando reporte:', error)
      feedback.error('Error al generar el reporte Excel')
    } finally {
      setDownloadingReport(false)
    }
  }

  const archiveGarment = useArchiveGarment()
  const openDeleteModal = async (garment: Garment) => {
    if (!canDeleteGarment) return
    if (await archiveGarment(garment)) loadGarments()
  }

  return (
    <div className="w-full pb-20 md:pb-0">
      {/* Modal de Confirmación de Eliminación */}
      {showScanner && (
        <BarcodeScanner
          onScan={handleScanResult}
          onClose={() => setShowScanner(false)}
        />
      )}

      <div className="flex flex-col gap-3 mb-6 sm:flex-row sm:items-center sm:justify-between">
        <div className="flex items-center gap-3">
          <Package className="w-6 h-6 text-blue-600" />
          <h1 className="text-xl font-bold text-gray-800">Inventario</h1>
        </div>
        <div className="flex flex-wrap gap-2 w-full sm:w-auto sm:items-center">
          {canCreateGarment && (
            <button
              onClick={() => setShowImport(true)}
              className="btn-secondary flex-1 flex items-center justify-center gap-2 whitespace-nowrap sm:flex-none"
            >
              <Upload className="w-4 h-4" />
              Importar
            </button>
          )}

          <button
            onClick={downloadFilteredReport}
            disabled={downloadingReport || totalGarments === 0}
            className="btn-excel flex-1 flex items-center justify-center gap-2 whitespace-nowrap sm:flex-none disabled:opacity-50 disabled:cursor-not-allowed"
          >
            {downloadingReport ? <Loader2 className="w-4 h-4 animate-spin" /> : <Download className="w-4 h-4" />}
            Exportar
          </button>

          {isAdministrador && (
            <button
              onClick={downloadFilteredQRs}
              disabled={downloadingQRs || totalGarments === 0}
              className="btn-secondary flex-1 flex items-center justify-center gap-2 whitespace-nowrap sm:flex-none disabled:opacity-50 disabled:cursor-not-allowed"
            >
              {downloadingQRs ? <Loader2 className="w-4 h-4 animate-spin" /> : <FileArchive className="w-4 h-4" />}
              Descargar QR
            </button>
          )}
        </div>
      </div>

      {/* Búsqueda */}
      <div className="card mb-6">
        <form onSubmit={(e) => e.preventDefault()} className="flex gap-2">
          <input
            type="text"
            value={searchTerm}
            onChange={(e) => setSearchTerm(e.target.value)}
            placeholder="Buscar código, nombre..."
            className="input-field flex-1"
          />
          <button
            type="button"
            onClick={openScannerForSearch}
            className="sm:hidden px-3 py-2 bg-blue-100 hover:bg-blue-200 text-blue-700 rounded-lg transition-colors flex-shrink-0"
            title="Escanear QR/código para buscar"
          >
            <ScanBarcode className="w-5 h-5" />
          </button>
          <button type="submit" className="btn-primary flex items-center gap-2">
            <Search className="w-4 h-4" />
            Buscar
          </button>
        </form>

        <InventoryFilterBar
          status={filterStatus} onStatus={setFilterStatus}
          sort={sortBy} onSort={setSortBy}
          open={showFilters} onToggle={() => setShowFilters((v) => !v)}
          activeCount={panelFilterCount}
          onClear={clearFilters}
          canClear={hasActiveFilters || sortBy !== 'recientes'}
        >
          <FilterField label="Tipo de prenda">
            <select value={filterGarmentType} onChange={(e) => setFilterGarmentType(e.target.value as GarmentType | '')} className="input-field py-1.5 text-sm">
              <option value="">Todos</option>
              {Object.entries(GARMENT_TYPES).map(([k, v]) => <option key={k} value={k}>{v}</option>)}
            </select>
          </FilterField>
          <FilterField label="Talla">
            <select value={filterSize} onChange={(e) => setFilterSize(e.target.value as Size | '')} className="input-field py-1.5 text-sm">
              <option value="">Todas</option>
              {Object.entries(SIZES).map(([k, v]) => <option key={k} value={k}>{v}</option>)}
            </select>
          </FilterField>
          <FilterField label="Color">
            <select value={filterColor} onChange={(e) => setFilterColor(e.target.value as Color | '')} className="input-field py-1.5 text-sm">
              <option value="">Todos</option>
              {Object.entries(COLORS).map(([k, v]) => <option key={k} value={k}>{v}</option>)}
            </select>
          </FilterField>
          <FilterField label="Lote">
            <input value={filterBatch} onChange={(e) => setFilterBatch(e.target.value.toUpperCase().trim())} placeholder="Ej. 202607A" className="input-field py-1.5 text-sm" />
          </FilterField>
          <FilterField label="Vida útil">
            <div className="flex flex-wrap gap-1.5">
              {(Object.entries(lifeStatusStyles) as [CycleLifeStatus, typeof lifeStatusStyles['verde']][]).map(([key, style]) => {
                const on = filterLifeStatuses.includes(key)
                return (
                  <button key={key} type="button"
                    onClick={() => setFilterLifeStatuses((prev) => on ? prev.filter((x) => x !== key) : [...prev, key])}
                    className={`inline-flex items-center gap-1.5 rounded-full px-2.5 py-1 text-xs font-medium ring-1 ring-inset ${on ? 'bg-blue-50 text-blue-700 ring-blue-300' : 'bg-white text-gray-600 ring-gray-200 hover:bg-gray-50'}`}>
                    <StatusDot tone={lifeTone[key]} /> {style.label}
                  </button>
                )
              })}
            </div>
          </FilterField>
          <FilterField label="Sin actividad">
            <select value={filterIdleDays} onChange={(e) => setFilterIdleDays(Number(e.target.value))} className="input-field py-1.5 text-sm">
              <option value={0}>Cualquiera</option>
              <option value={7}>Más de 7 días</option>
              <option value={30}>Más de 30 días</option>
              <option value={90}>Más de 90 días</option>
            </select>
          </FilterField>
          <FilterField label="Actualizada entre" className="sm:col-span-2">
            <div className="flex items-center gap-2">
              <input type="date" value={filterDateFrom} onChange={(e) => setFilterDateFrom(e.target.value)} className="input-field min-w-0 flex-1 py-1.5 text-sm" aria-label="Desde" />
              <span className="text-gray-400">–</span>
              <input type="date" value={filterDateTo} onChange={(e) => setFilterDateTo(e.target.value)} className="input-field min-w-0 flex-1 py-1.5 text-sm" aria-label="Hasta" />
            </div>
          </FilterField>
        </InventoryFilterBar>
      </div>

      {showImport && (
        <ImportGarmentsModal
          teams={isAdministrador ? teams : []}
          onClose={() => setShowImport(false)}
          onImported={() => loadGarments()}
        />
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
              const cycleCount = (selectedGarment as GarmentListItem).wash_count ?? 0
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
              <InspectionResultPicker value={inspectionResult} onChange={setInspectionResult} />
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

            {/* Confirmación: firma (incluye al firmante) o, si no aplica, a nombre de quién se registra */}
            <div className="mb-4">
              {signatureMeaning
                ? <SignatureField meaning={signatureMeaning} password={signaturePassword} onChange={setSignaturePassword} />
                : <RecordedBy />}
            </div>

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
                disabled={actionLoading || (inspectionResult === 'baja' && !actionNotes) || (!!signatureMeaning && !signaturePassword)}
              >
                {actionLoading ? 'Guardando...' : signatureMeaning ? 'Firmar y confirmar' : 'Confirmar'}
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
                            <span className="font-medium">{actionLabels[action.action_type].label}</span>
                          </>
                        )}
                        {action.result && (
                          <span className="text-sm text-gray-500">→ {action.result}</span>
                        )}
                      </div>
                      {action.notes && (
                        <p className="text-sm text-gray-600 mt-1">{action.notes}</p>
                      )}
                      <ActionAuthor
                        performedBy={action.performed_by}
                        recordedByName={action.recorded_by_name}
                        recordedByEmail={action.recorded_by_email}
                        signed={!!action.signature_id}
                        className="mt-1"
                      />
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
      {loading && garments.length === 0 ? (
        <SkeletonList rows={6} />
      ) : filteredGarments.length === 0 ? (
        <div className="card text-center py-12">
          <PackageX className="w-12 h-12 text-gray-400 mx-auto mb-4" />
          <p className="text-gray-600">
            {!hasActiveFilters
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
            const cycleCount = garment.wash_count
            const reparacionCount = garment.repair_count
            const LIFE_LIMIT = 100
            const LIFE_WARN = 80
            const lifeExpired = cycleCount >= LIFE_LIMIT
            const lifeNearEnd = !lifeExpired && cycleCount >= LIFE_WARN
            const cycleLifeStatus = getCycleLifeStatus(cycleCount)
            const cycleLifePercent = getCycleLifePercent(cycleCount)
            const cycleLifeStyle = lifeStatusStyles[cycleLifeStatus]
            return (
              <div key={garment.id} className="flex flex-col overflow-hidden rounded-xl border border-gray-200 bg-white shadow-sm transition-shadow hover:shadow-md">
                {/* Encabezado: código y acciones rápidas */}
                <div className="border-b border-gray-200 bg-slate-50 px-4 pt-2 pb-3">
                <div className="flex justify-end gap-1 mb-1">
                  <button
                    onClick={() => openQRModal(garment)}
                    className="p-1.5 text-blue-600 hover:bg-gray-100 rounded-lg transition-colors"
                    title="Ver QR"
                  >
                    <ScanBarcode className="w-4 h-4" />
                  </button>
                  <button
                    onClick={() => openHistoryModal(garment)}
                    className="p-1.5 text-gray-500 hover:bg-gray-100 rounded-lg transition-colors"
                    title="Ver historial"
                  >
                    <FileClock className="w-4 h-4" />
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
                  {canDeleteGarment && (
                    <button
                      onClick={() => openDeleteModal(garment)}
                      className="p-1.5 text-red-500 hover:bg-red-50 rounded-lg transition-colors"
                      title="Archivar (retirar un registro duplicado o erróneo)"
                    >
                      <Archive className="w-4 h-4" />
                    </button>
                  )}
                </div>

                {/* Código + Código corto */}
                <div className="flex items-center justify-between gap-2">
                  <div className="font-mono text-sm font-semibold text-gray-900 truncate">{garment.code}</div>
                  {garment.short_code && (
                    <span className="shrink-0 font-mono font-bold text-base tracking-wider text-blue-700 bg-blue-50 ring-1 ring-inset ring-blue-200 px-2 py-0.5 rounded-lg">
                      {garment.short_code}
                    </span>
                  )}
                </div>
                </div>

                <div className="flex flex-1 flex-col p-4">
                {/* Banner fin de vida útil */}
                {lifeExpired && (
                  <Notice tone="error" title="Fin de vida útil alcanzado" className="mb-3 text-xs">
                    {cycleCount} ciclos de lavado y esterilización
                  </Notice>
                )}
                {lifeNearEnd && (
                  <Notice tone="warning" title="Próximo a fin de vida útil" className="mb-3 text-xs">
                    {cycleCount}/{WASH_STERILIZATION_CYCLE_LIMIT} ciclos de lavado y esterilización
                  </Notice>
                )}

                {/* Información extraída del código */}
                {(() => {
                  const parsed = parseGarmentCode(garment.code)
                  if (parsed.valid) {
                    return (
                      <div className="mb-3 grid grid-cols-2 gap-x-3 gap-y-1 rounded-lg bg-blue-50/60 p-2.5 text-xs ring-1 ring-inset ring-blue-100">
                        <div><span className="text-blue-700/80">Prenda</span><p className="font-medium text-gray-900">{parsed.garmentName}</p></div>
                        <div><span className="text-blue-700/80">Talla</span><p className="font-medium text-gray-900">{parsed.sizeName}</p></div>
                        <div><span className="text-blue-700/80">Color</span><p className="font-medium text-gray-900">{parsed.colorName}</p></div>
                        <div><span className="text-blue-700/80">Lote</span><p className="font-medium text-gray-900">{parsed.batchCode}</p></div>
                      </div>
                    )
                  }
                  return null
                })()}

                {/* Nombre */}
                <p className="text-sm font-semibold text-gray-900 line-clamp-2 mb-0.5">{garment.name}</p>

                {/* Cliente */}
                {garment.client_name && (
                  <div className="text-xs text-gray-500 mb-2 line-clamp-1">
                    {garment.client_name}
                  </div>
                )}

                {/* Estado */}
                <div className="mb-3">
                  <StatusBadge tone={garmentStatusTone[garment.status] ?? 'gray'}>
                    <StatusIcon className="w-3 h-3 text-gray-500" />
                    {statusLabels[garment.status as GarmentStatus]?.label || garment.status}
                  </StatusBadge>
                </div>

                {/* Semáforo de vida útil por ciclos */}
                <div className="mb-3 flex items-center justify-between gap-2 rounded-lg border border-gray-200 bg-gray-50 px-2 py-1.5">
                  <div className="inline-flex items-center gap-1.5 min-w-0">
                    <StatusDot tone={lifeTone[cycleLifeStatus]} />
                    <p className="text-xs font-semibold text-gray-600">
                      Vida útil: <span className="text-gray-800">{cycleLifeStyle.label}</span>
                    </p>
                  </div>
                  <p className="text-xs font-semibold whitespace-nowrap text-gray-500">
                    {cycleCount}/{WASH_STERILIZATION_CYCLE_LIMIT} ({cycleLifePercent}%)
                  </p>
                </div>

                {/* Contadores - Grid 2 columnas */}
                {(cycleCount > 0 || reparacionCount > 0) && (
                  <div className="grid grid-cols-2 gap-2 mb-3">
                    <div className="flex items-center gap-2 rounded-lg border border-gray-200 p-2">
                      <span className={`flex h-7 w-7 shrink-0 items-center justify-center rounded-md ${lifeExpired ? 'bg-red-50 text-red-600' : lifeNearEnd ? 'bg-orange-50 text-orange-600' : 'bg-blue-50 text-blue-600'}`}>
                        <Droplets className="h-3.5 w-3.5" />
                      </span>
                      <div className="min-w-0">
                        <p className="text-sm font-bold leading-tight text-gray-900">{cycleCount}</p>
                        <p className="truncate text-[11px] text-gray-500">Lavado/esterilización</p>
                      </div>
                    </div>
                    <div className="flex items-center gap-2 rounded-lg border border-gray-200 p-2">
                      <span className="flex h-7 w-7 shrink-0 items-center justify-center rounded-md bg-orange-50 text-orange-600">
                        <Scissors className="h-3.5 w-3.5" />
                      </span>
                      <div className="min-w-0">
                        <p className="text-sm font-bold leading-tight text-gray-900">{reparacionCount}</p>
                        <p className="truncate text-[11px] text-gray-500">Reparaciones</p>
                      </div>
                    </div>
                  </div>
                )}

                {/* Botones de acciones - Grid 2 columnas */}
                <div className="mt-auto grid grid-cols-2 gap-2">
                  {/* Todos los botones de acciones */}
                  {availableActions.filter(a => a === 'lavado' || a === 'inspeccion' || a === 'reparacion').map((action) => {
                    const ActionIcon = actionLabels[action].icon
                    const isCurrentAction = garment.status === action
                    return (
                      <button
                        key={action}
                        onClick={() => openActionModal(garment, action)}
                        disabled={isCurrentAction || !canRecordAction}
                        className={`w-full inline-flex items-center justify-center gap-1.5 px-2 py-2 rounded-lg text-xs font-semibold transition-colors ${
                          isCurrentAction || !canRecordAction
                            ? 'bg-gray-100 text-gray-400 cursor-not-allowed'
                            : action === 'lavado'
                            ? 'bg-blue-600 text-white hover:bg-blue-700 shadow-sm cursor-pointer'
                            : `${softButton[actionTone[action] ?? 'gray']} cursor-pointer`
                        }`}
                        title={!canRecordAction ? 'No tienes permiso para registrar acciones' : undefined}
                      >
                        <ActionIcon className="w-3.5 h-3.5" />
                        <span className="hidden md:inline">{actionLabels[action].label}</span>
                        <span className="md:hidden text-xs">
                          {action === 'lavado' ? 'Lav/Ester' : action === 'inspeccion' ? 'Inspección' : 'Reparación'}
                        </span>
                      </button>
                    )
                  })}

                  {/* Resultado de Inspección */}
                  {garment.status === 'inspeccion' && canRecordAction && (
                    <button
                      onClick={() => openActionModal(garment, 'inspeccion')}
                      className="col-span-2 w-full inline-flex items-center justify-center gap-1.5 px-2 py-2 bg-amber-500 hover:bg-amber-600 text-white rounded-lg text-xs font-semibold shadow-sm transition-colors cursor-pointer"
                    >
                      <ClipboardCheck className="w-3 h-3" />
                      <span>Registrar Resultado</span>
                    </button>
                  )}
                </div>
                </div>
              </div>
            )
          })}
        </div>
      )}

      {/* Paginación (en el servidor) */}
      <Pagination
        page={currentPage}
        pageSize={pageSize}
        total={totalGarments}
        onPageChange={(p) => { setCurrentPage(p); window.scrollTo({ top: 0, behavior: 'smooth' }) }}
        onPageSizeChange={setPageSize}
        label="prendas"
      />

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
                className="bg-white border border-gray-200 p-4 rounded-lg mb-4 flex flex-col items-center"
              >
                <QRCode
                  value={generateQRUrl(selectedGarment.id)}
                  size={200}
                  level="H"
                  includeMargin={true}
                />
                {selectedGarment.short_code && (
                  <p className="text-3xl font-bold font-mono tracking-widest text-gray-900 mt-1">
                    {selectedGarment.short_code}
                  </p>
                )}
              </div>
              <p className="text-xs text-gray-400 text-center font-mono break-all mb-4">
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
