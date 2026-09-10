import { useState, useEffect, useRef, useCallback } from 'react'
import { Package, PackageCheck, Droplets, ClipboardCheck, Scissors, PackageX, Loader2, Trash2, FileClock, X, ScanBarcode, Download, Copy, Upload, Check, AlertCircle, FileArchive, Users, Pencil, AlertTriangle, Search, ChevronDown } from 'lucide-react'
import QRCode from 'qrcode.react'
import JSZip from 'jszip'
import { saveAs } from 'file-saver'
import { useRole } from '../contexts/AuthContext'
import { useGarmentCache } from '../contexts/GarmentCacheContext'
import { garmentService } from '../services/garmentService'
import { generateReportExcel } from '../services/reportService'
import { userService } from '../services/userService'
import type { UserProfile } from '../services/userService'
import BarcodeScanner from '../components/BarcodeScanner'
import { generateQRUrl, extractGarmentId } from '../lib/qrGenerator'
import { parseGarmentCode, GARMENT_TYPES, COLORS, type GarmentType, type Color, type Size } from '../lib/garmentCodeParser'
import { WASH_STERILIZATION_CYCLE_LIMIT, getCycleCount, getCycleLifePercent, getCycleLifeStatus } from '../lib/lifeStatus'
import type { CycleLifeStatus } from '../lib/lifeStatus'
import type { Garment, GarmentAction, ActionType, InspectionResult, GarmentStatus, LegacyActionType } from '../types'

const compactHex = (value: string) => value.toLowerCase().replace(/[^a-f0-9]/g, '')

const isOneEditAway = (a: string, b: string): boolean => {
  const aLen = a.length
  const bLen = b.length

  if (Math.abs(aLen - bLen) > 1) return false
  if (a === b) return true

  if (aLen === bLen) {
    let diffs = 0
    for (let i = 0; i < aLen; i++) {
      if (a[i] !== b[i]) {
        diffs++
        if (diffs > 1) return false
      }
    }
    return diffs === 1
  }

  const shorter = aLen < bLen ? a : b
  const longer = aLen < bLen ? b : a
  let i = 0
  let j = 0
  let skipped = false

  while (i < shorter.length && j < longer.length) {
    if (shorter[i] === longer[j]) {
      i++
      j++
      continue
    }
    if (skipped) return false
    skipped = true
    j++
  }

  return true
}

const isUuidLikeMatch = (garmentId: string, candidate: string): boolean => {
  const id = compactHex(garmentId)
  const query = compactHex(candidate)

  if (!query || query.length < 24) return false
  if (id.includes(query) || query.includes(id)) return true
  return isOneEditAway(id, query)
}

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
  showDateFilters: boolean
  filterGarmentType: GarmentType | ''
  filterColor: Color | ''
  filterSize: Size | ''
  filterBatch: string
  showCodeFilters: boolean
  filterTeamId: string
  filterLifeStatuses: CycleLifeStatus[]
}

const defaultInventoryFilters: InventoryFilters = {
  searchTerm: '',
  filterStatus: 'all',
  filterDateFrom: '',
  filterDateTo: '',
  showDateFilters: false,
  filterGarmentType: '',
  filterColor: '',
  filterSize: '',
  filterBatch: '',
  showCodeFilters: false,
  filterTeamId: 'all',
  filterLifeStatuses: [],
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
  const { garments, loading, loadGarments: loadCachedGarments, refreshGarments } = useGarmentCache()
  const storedFilters = useRef(getStoredInventoryFilters()).current
  const [searchTerm, setSearchTerm] = useState(storedFilters.searchTerm)
  const [filterStatus] = useState<string>(storedFilters.filterStatus)
  const [filterDateFrom] = useState(storedFilters.filterDateFrom)
  const [filterDateTo] = useState(storedFilters.filterDateTo)
  const [showDateFilters] = useState(storedFilters.showDateFilters)
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
  const [actionResponsible, setActionResponsible] = useState('')
  const [newGarment, setNewGarment] = useState({ code: '', name: '', client_name: '' })
  const [newGarmentTeamId, setNewGarmentTeamId] = useState<string>('')
  const [showQRModal, setShowQRModal] = useState(false)
  const [copiedQR, setCopiedQR] = useState(false)
  const qrRef = useRef<HTMLDivElement>(null)
  // Filtros para códigos de prenda
  const [filterGarmentType] = useState<GarmentType | ''>(storedFilters.filterGarmentType)
  const [filterColor] = useState<Color | ''>(storedFilters.filterColor)
  const [filterSize] = useState<Size | ''>(storedFilters.filterSize)
  const [filterBatch] = useState(storedFilters.filterBatch)
  const [showCodeFilters] = useState(storedFilters.showCodeFilters)
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
  const [filterTeamId] = useState<string>(storedFilters.filterTeamId)
  const [teams, setTeams] = useState<{ id: string; name: string }[]>([])
  const [filterLifeStatuses, setFilterLifeStatuses] = useState<CycleLifeStatus[]>(storedFilters.filterLifeStatuses)
  const [showLifeStatusFilter, setShowLifeStatusFilter] = useState(false)
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
      await loadGarments(true)
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

  const loadGarments = useCallback(async (force = false) => {
    try {
      if (force) {
        await refreshGarments()
      } else {
        await loadCachedGarments()
      }
    } catch (error) {
      console.error('Error cargando prendas:', error)
    }
  }, [loadCachedGarments, refreshGarments])

  useEffect(() => {
    loadGarments()
  }, [loadGarments])

  useEffect(() => {
    const filters: InventoryFilters = {
      searchTerm,
      filterStatus,
      filterDateFrom,
      filterDateTo,
      showDateFilters,
      filterGarmentType,
      filterColor,
      filterSize,
      filterBatch,
      showCodeFilters,
      filterTeamId,
      filterLifeStatuses,
    }
    sessionStorage.setItem(INVENTORY_FILTERS_STORAGE_KEY, JSON.stringify(filters))
  }, [searchTerm, filterStatus, filterDateFrom, filterDateTo, showDateFilters, filterGarmentType, filterColor, filterSize, filterBatch, showCodeFilters, filterTeamId, filterLifeStatuses])

  useEffect(() => {
    if (isAdministrador) {
      userService.getTeams().then(setTeams).catch(() => {})
    }
  }, [isAdministrador])

  const resolvedSearch = (extractGarmentId(searchTerm) || searchTerm).trim().toLowerCase()
  const resolvedUuidCandidate = buildUuidCandidate(searchTerm)

  const getSearchRelevance = (garment: any): number => {
    if (!resolvedSearch) return 999

    const shortCode = (garment.short_code || '').toLowerCase()
    const code = (garment.code || '').toLowerCase()
    const name = (garment.name || '').toLowerCase()
    const clientName = (garment.client_name || '').toLowerCase()
    const id = (garment.id || '').toLowerCase()

    if (shortCode === resolvedSearch) return 0
    if (code === resolvedSearch) return 1
    if (id === resolvedSearch) return 2
    if (resolvedUuidCandidate && isUuidLikeMatch(id, resolvedUuidCandidate)) return 3

    if (shortCode.startsWith(resolvedSearch)) return 10 + shortCode.length
    if (code.startsWith(resolvedSearch)) return 30 + code.length
    if (name.startsWith(resolvedSearch)) return 50 + name.length
    if (clientName.startsWith(resolvedSearch)) return 60 + clientName.length

    if (shortCode.includes(resolvedSearch)) return 70 + shortCode.indexOf(resolvedSearch)
    if (code.includes(resolvedSearch)) return 80 + code.indexOf(resolvedSearch)
    if (name.includes(resolvedSearch)) return 90 + name.indexOf(resolvedSearch)
    if (clientName.includes(resolvedSearch)) return 100 + clientName.indexOf(resolvedSearch)
    if (id.includes(resolvedSearch)) return 110 + id.indexOf(resolvedSearch)

    return 999
  }

  const filteredGarments = garments.filter((garment) => {
    const matchesSearch =
      !resolvedSearch ||
      garment.id.toLowerCase().includes(resolvedSearch) ||
      (resolvedUuidCandidate ? isUuidLikeMatch(garment.id, resolvedUuidCandidate) : false) ||
      garment.code.toLowerCase().includes(resolvedSearch) ||
      garment.name.toLowerCase().includes(resolvedSearch) ||
      (garment.short_code?.toLowerCase().includes(resolvedSearch) ?? false) ||
      (garment.client_name?.toLowerCase().includes(resolvedSearch) ?? false)
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

    const matchesLifeStatus =
      filterLifeStatuses.length === 0 ||
      filterLifeStatuses.includes(getCycleLifeStatus(getCycleCount(garment.actions || [])))

    return matchesSearch && matchesFilter && matchesDateFrom && matchesDateTo && matchesCodeFilters && matchesTeam && matchesLifeStatus
  }).sort((a, b) => {
    if (!resolvedSearch) return 0

    const scoreA = getSearchRelevance(a)
    const scoreB = getSearchRelevance(b)

    if (scoreA !== scoreB) return scoreA - scoreB

    // Desempate para short codes parecidos: primero el más corto (X1 antes que X199)
    const shortA = (a.short_code || '').toString()
    const shortB = (b.short_code || '').toString()
    if (shortA.length !== shortB.length) return shortA.length - shortB.length

    return 0
  })

  const totalPages = Math.ceil(filteredGarments.length / ITEMS_PER_PAGE)
  const paginatedGarments = filteredGarments.slice(
    (currentPage - 1) * ITEMS_PER_PAGE,
    currentPage * ITEMS_PER_PAGE
  )

  // Resetear página al cambiar filtros
  useEffect(() => { setCurrentPage(1) }, [searchTerm, filterStatus, filterDateFrom, filterDateTo, filterGarmentType, filterColor, filterSize, filterBatch, filterTeamId, filterLifeStatuses])

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
      loadGarments(true)
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
      loadGarments(true)
    } catch (error: any) {
      console.error('Error eliminando prenda:', error)
      setDeleteError(error.message || 'Error al eliminar la prenda')
    }
  }

  const openActionModal = (garment: Garment, action: ActionType) => {
    setSelectedGarment(garment)
    setActionType(action)
    setActionNotes('')
    setActionResponsible('')
    setInspectionResult('aprobado')
    setShowActionModal(true)
  }

  const handleAction = async () => {
    if (!selectedGarment) return
    try {
      await garmentService.registerAction(selectedGarment.id, actionType, {
        result: actionType === 'inspeccion' ? inspectionResult : undefined,
        notes: actionNotes || undefined,
        responsible: actionResponsible,
      })
      setShowActionModal(false)
      setSelectedGarment(null)
      loadGarments(true)
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
      await generateReportExcel(filteredGarments)
    } catch (error) {
      console.error('Error generando reporte:', error)
      alert('Error al generar el reporte Excel')
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
      loadGarments(true)
    } catch (error) {
      console.error('Error en ingreso masivo:', error)
      alert('Error al crear prendas')
    } finally {
      setBulkLoading(false)
    }
  }

  return (
    <div className="w-full pb-20 md:pb-0">
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

      <div className="flex flex-col gap-3 mb-6 sm:flex-row sm:items-center sm:justify-between">
        <div className="flex items-center gap-3">
          <Package className="w-6 h-6 text-blue-600" />
          <h1 className="text-xl font-bold text-gray-800">Inventario</h1>
        </div>
        <div className="flex flex-wrap gap-2 w-full sm:w-auto sm:items-center">
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
              className="btn-secondary flex-1 flex items-center justify-center gap-2 whitespace-nowrap sm:flex-none"
            >
              <Upload className="w-4 h-4" />
              Ingreso Masivo
            </button>
          )}

          <div className="relative flex-1 sm:flex-none">
            <button
              onClick={() => setShowLifeStatusFilter((prev) => !prev)}
              className={`w-full px-4 py-2 rounded-lg font-medium transition-colors flex items-center justify-center gap-2 text-sm whitespace-nowrap ${
                filterLifeStatuses.length > 0
                  ? 'bg-indigo-600 text-white hover:bg-indigo-700'
                  : 'bg-indigo-100 text-indigo-700 hover:bg-indigo-200'
              }`}
            >
              Vida útil{filterLifeStatuses.length > 0 ? ` (${filterLifeStatuses.length})` : ''}
              <ChevronDown className={`w-4 h-4 transition-transform ${showLifeStatusFilter ? 'rotate-180' : ''}`} />
            </button>
            {showLifeStatusFilter && (
              <div className="absolute left-0 z-20 mt-2 w-48 bg-white rounded-lg shadow-lg border border-gray-200 p-2">
                {(Object.entries(lifeStatusStyles) as [CycleLifeStatus, typeof lifeStatusStyles['verde']][]).map(([key, style]) => (
                  <label key={key} className="flex items-center gap-2 px-2 py-1.5 rounded hover:bg-gray-50 cursor-pointer">
                    <input
                      type="checkbox"
                      checked={filterLifeStatuses.includes(key)}
                      onChange={(e) => {
                        setFilterLifeStatuses((prev) =>
                          e.target.checked ? [...prev, key] : prev.filter((s) => s !== key)
                        )
                      }}
                    />
                    <span className={`h-2.5 w-2.5 rounded-full ${style.dot}`} />
                    <span className="text-sm text-gray-700">{style.label}</span>
                  </label>
                ))}
                {filterLifeStatuses.length > 0 && (
                  <button
                    onClick={() => setFilterLifeStatuses([])}
                    className="mt-1 w-full text-center text-xs text-blue-600 hover:text-blue-800 font-medium px-2 py-1"
                  >
                    Limpiar selección
                  </button>
                )}
              </div>
            )}
          </div>

          <button
            onClick={downloadFilteredReport}
            disabled={downloadingReport || filteredGarments.length === 0}
            className="btn-secondary flex-1 flex items-center justify-center gap-2 whitespace-nowrap sm:flex-none disabled:opacity-50 disabled:cursor-not-allowed"
          >
            {downloadingReport ? <Loader2 className="w-4 h-4 animate-spin" /> : <Download className="w-4 h-4" />}
            Exportar
          </button>

          {isAdministrador && (
            <button
              onClick={downloadFilteredQRs}
              disabled={downloadingQRs || filteredGarments.length === 0}
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
      </div>

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
              const cycleCount = getCycleCount(selActions)
              const newCycleCount = actionType === 'lavado' ? cycleCount + 1 : cycleCount
              const alreadyExpired = cycleCount >= 100
              const willExpire = !alreadyExpired && newCycleCount >= 100
              if (!willExpire && !alreadyExpired) return null
              return (
                <div className={`mb-4 p-3 rounded-lg border flex gap-3 ${alreadyExpired ? 'bg-red-50 border-red-300' : 'bg-orange-50 border-orange-300'}`}>
                  <AlertTriangle className={`w-5 h-5 flex-shrink-0 mt-0.5 ${alreadyExpired ? 'text-red-600' : 'text-orange-500'}`} />
                  <div>
                    <p className={`text-sm font-bold ${alreadyExpired ? 'text-red-700' : 'text-orange-700'}`}>
                      {alreadyExpired ? 'Esta prenda ya superó su vida útil' : 'Esta acción alcanzará el límite de vida útil'}
                    </p>
                    <p className={`text-xs mt-0.5 ${alreadyExpired ? 'text-red-600' : 'text-orange-600'}`}>
                      {alreadyExpired
                        ? `Tiene ${cycleCount} ciclos de lavado y esterilización. Se recomienda darla de baja.`
                        : `Alcanzará ${newCycleCount} ciclos de lavado y esterilización. Considera darla de baja.`
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
                disabled={!actionResponsible.trim() || (inspectionResult === 'baja' && !actionNotes)}
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
                      {action.performed_by && (
                        <p className="text-sm text-gray-600 mt-1">Responsable: {action.performed_by}</p>
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
            const cycleCount = getCycleCount(actions)
            const reparacionCount = actions.filter((a) =>
              a.action_type === 'reparacion' ||
              (a.action_type === 'inspeccion' && a.result === 'reparacion')
            ).length
            const LIFE_LIMIT = 100
            const LIFE_WARN = 80
            const lifeExpired = cycleCount >= LIFE_LIMIT
            const lifeNearEnd = !lifeExpired && cycleCount >= LIFE_WARN
            const cycleLifeStatus = getCycleLifeStatus(cycleCount)
            const cycleLifePercent = getCycleLifePercent(cycleCount)
            const cycleLifeStyle = lifeStatusStyles[cycleLifeStatus]
            return (
              <div key={garment.id} className={`card p-4 ${lifeExpired ? 'border-2 border-red-400' : lifeNearEnd ? 'border-2 border-orange-300' : ''}`}>
                {/* Banner fin de vida útil */}
                {lifeExpired && (
                  <div className="flex items-center gap-2 mb-3 px-3 py-2 bg-red-50 border border-red-200 rounded-lg">
                    <AlertTriangle className="w-4 h-4 text-red-600 flex-shrink-0" />
                    <div className="min-w-0">
                      <p className="text-xs font-bold text-red-700">Fin de vida útil alcanzado</p>
                      <p className="text-xs text-red-600">
                        {cycleCount} ciclos de lavado y esterilización
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
                        {cycleCount}/100 ciclos de lavado y esterilización
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

                {/* Código + Código corto */}
                <div className="flex items-center justify-between gap-2 mb-2">
                  <div className="font-mono text-sm font-semibold text-gray-800 truncate">{garment.code}</div>
                  {garment.short_code && (
                    <span className="shrink-0 font-mono font-bold text-base tracking-wider text-indigo-700 bg-indigo-50 border border-indigo-200 px-2 py-0.5 rounded-lg">
                      {garment.short_code}
                    </span>
                  )}
                </div>

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

                {/* Semáforo de vida útil por ciclos */}
                <div className="mb-3 flex items-center justify-between gap-2 rounded-lg border border-gray-200 bg-gray-50 px-2 py-1.5">
                  <div className="inline-flex items-center gap-1.5 min-w-0">
                    <span className={`h-2.5 w-2.5 rounded-full ${cycleLifeStyle.dot}`} />
                    <p className="text-xs font-semibold text-gray-600">
                      Vida útil: <span className={cycleLifeStyle.text}>{cycleLifeStyle.label}</span>
                    </p>
                  </div>
                  <p className="text-xs font-semibold whitespace-nowrap text-gray-500">
                    {cycleCount}/{WASH_STERILIZATION_CYCLE_LIMIT} ({cycleLifePercent}%)
                  </p>
                </div>

                {/* Contadores - Grid 2 columnas */}
                {actions.length > 0 && (
                  <div className="grid grid-cols-2 gap-2 mb-3">
                    <div className={`p-2 rounded text-center ${cycleCount >= LIFE_LIMIT ? 'bg-red-100' : cycleCount >= LIFE_WARN ? 'bg-orange-100' : 'bg-blue-50'}`}>
                      <div className="flex justify-center mb-0.5">
                        <Droplets className={`w-3 h-3 ${cycleCount >= LIFE_LIMIT ? 'text-red-600' : cycleCount >= LIFE_WARN ? 'text-orange-500' : 'text-blue-600'}`} />
                      </div>
                      <p className={`text-sm font-bold ${cycleCount >= LIFE_LIMIT ? 'text-red-600' : cycleCount >= LIFE_WARN ? 'text-orange-600' : 'text-blue-600'}`}>{cycleCount}</p>
                      <p className={`text-xs ${cycleCount >= LIFE_LIMIT ? 'text-red-700' : cycleCount >= LIFE_WARN ? 'text-orange-700' : 'text-blue-700'}`}>Lavados y Esterilizaciones</p>
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
                  {availableActions.filter(a => a === 'lavado' || a === 'inspeccion' || a === 'reparacion').map((action) => {
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
                          {action === 'lavado' ? 'Lav/Ester' : action === 'inspeccion' ? 'Inspección' : 'Reparación'}
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
                className="bg-white border border-gray-200 p-4 rounded-lg mb-4 flex flex-col items-center"
              >
                <QRCode
                  value={generateQRUrl(selectedGarment.id)}
                  size={200}
                  level="H"
                  includeMargin={true}
                />
                {selectedGarment.short_code && (
                  <p className="text-3xl font-bold font-mono tracking-widest text-indigo-700 mt-1">
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
