import { useCallback, useEffect, useMemo, useState } from 'react'
import { Link } from 'react-router-dom'
import { Waves, Plus, Search, Loader, Pencil, Archive, PlusCircle, Download, Upload, AlertTriangle, Clock } from 'lucide-react'
import { useRole } from '../contexts/AuthContext'
import { useDebouncedValue } from '../hooks/useDebouncedValue'
import Pagination from '../components/ui/Pagination'
import { hoseService } from '../services/hoseService'
import RecordedBy from '../components/RecordedBy'
import { SkeletonList } from '../components/ui/Skeleton'
import { Notice, StatusDot } from '../components/ui/StatusBadge'
import { lifeTone } from '../lib/tones'
import ImportEquipmentModal from '../components/ImportEquipmentModal'
import InventoryFilterBar, { FilterField, type FilterChip, type SortOption } from '../components/InventoryFilterBar'
import { getHoseLifeStatus } from '../lib/hoseLifeStatus'
import { generateHoseInventoryExcel } from '../services/reportService'
import type { HoseLifeStatus } from '../lib/hoseLifeStatus'
import type { Equipment, EquipmentListItem, EquipmentListFilters, EquipmentSort, HosePositionWithDetails, LifeStatus } from '../types'

const lifeLabel: Record<HoseLifeStatus, string> = { verde: 'Verde', amarillo: 'Amarillo', naranja: 'Naranja', rojo: 'Rojo' }

// Chips: vida útil de la manguera más usada del producto, o que requiere atención
const hoseChips: FilterChip[] = [
  { value: 'all', label: 'Todos' },
  { value: 'verde', label: 'Verde', tone: 'green' },
  { value: 'amarillo', label: 'Amarillo', tone: 'yellow' },
  { value: 'naranja', label: 'Naranja', tone: 'orange' },
  { value: 'rojo', label: 'Rojo', tone: 'red' },
  { value: 'atencion', label: 'Sin manguera activa', tone: 'gray' },
]
const hoseSortOptions: SortOption[] = [
  { value: 'recientes', label: 'Más recientes' },
  { value: 'ciclos', label: 'Más ciclos de uso' },
  { value: 'inactividad', label: 'Más tiempo sin actividad' },
  { value: 'codigo', label: 'Código (A–Z)' },
]

const STORAGE_KEY = 'threadtrack.hoses.filters'
interface StoredFilters { searchTerm: string; chip: string; caliber: string; idleDays: number; sort: EquipmentSort }
const defaults: StoredFilters = { searchTerm: '', chip: 'all', caliber: '', idleDays: 0, sort: 'recientes' }
const readStored = (): StoredFilters => {
  try { return { ...defaults, ...JSON.parse(sessionStorage.getItem(STORAGE_KEY) || '{}') } } catch { return defaults }
}
const fmtDate = (d?: string | null) => (d ? new Date(d).toLocaleDateString('es-MX', { day: '2-digit', month: 'short', year: 'numeric' }) : 'sin registros')

const HoseInventory = () => {
  const { canCreateEquipment, canDeleteEquipment, canRegisterHoseAction } = useRole()
  const [stored] = useState(readStored)
  const [searchTerm, setSearchTerm] = useState(stored.searchTerm)
  const search = useDebouncedValue(searchTerm)
  const [chip, setChip] = useState(stored.chip)
  const [caliber, setCaliber] = useState(stored.caliber)
  const [idleDays, setIdleDays] = useState(stored.idleDays)
  const [sort, setSort] = useState<EquipmentSort>(stored.sort)
  const [showFilters, setShowFilters] = useState(false)
  const [calibers, setCalibers] = useState<string[]>([])
  const [showImport, setShowImport] = useState(false)
  // Página actual de productos (paginada y filtrada en el servidor)
  const [equipmentList, setEquipmentList] = useState<EquipmentListItem[]>([])
  const [total, setTotal] = useState(0)
  const [page, setPage] = useState(1)
  const [pageSize, setPageSize] = useState(10)
  const [loading, setLoading] = useState(true)
  const [searching, setSearching] = useState(false)
  const [searchError, setSearchError] = useState<string | null>(null)
  const [deletingId, setDeletingId] = useState<string | null>(null)
  const [confirmDelete, setConfirmDelete] = useState<{ id: string; name: string } | null>(null)

  const [editingEquipment, setEditingEquipment] = useState<(Equipment & { positions?: HosePositionWithDetails[] }) | null>(null)
  const [editCode, setEditCode] = useState('')
  const [editName, setEditName] = useState('')
  const [editCalibers, setEditCalibers] = useState<Record<string, string>>({})
  const [editLengths, setEditLengths] = useState<Record<string, string>>({})
  const [editReason, setEditReason] = useState('')
  const [archiveReason, setArchiveReason] = useState('')
  const [savingEdit, setSavingEdit] = useState(false)
  const [editError, setEditError] = useState<string | null>(null)

  const [cycleEquipment, setCycleEquipment] = useState<(Equipment & { positions?: HosePositionWithDetails[] }) | null>(null)
  const [cycleNotes, setCycleNotes] = useState('')
  const [cycleSubmitting, setCycleSubmitting] = useState(false)
  const [cycleError, setCycleError] = useState<string | null>(null)
  const [exporting, setExporting] = useState(false)

  const filters = useMemo<EquipmentListFilters>(() => ({
    search,
    caliber: caliber || null,
    life: ['verde', 'amarillo', 'naranja', 'rojo'].includes(chip) ? [chip as LifeStatus] : [],
    attention: chip === 'atencion',
    idleDays: idleDays || null,
    sort,
  }), [search, chip, caliber, idleDays, sort])

  const loadEquipment = useCallback(async () => {
    setLoading(true)
    try {
      const res = await hoseService.listEquipment(filters, page, pageSize)
      setEquipmentList(res.rows)
      setTotal(res.total)
    } catch (err) {
      setSearchError((err as Error).message || 'Error al cargar los productos')
    } finally {
      setLoading(false)
    }
  }, [filters, page, pageSize])

  useEffect(() => { loadEquipment() }, [loadEquipment])
  useEffect(() => { setPage(1) }, [filters, pageSize])
  useEffect(() => { hoseService.calibers().then(setCalibers).catch(() => {}) }, [])
  useEffect(() => {
    try { sessionStorage.setItem(STORAGE_KEY, JSON.stringify({ searchTerm, chip, caliber, idleDays, sort })) } catch { /* sin almacenamiento */ }
  }, [searchTerm, chip, caliber, idleDays, sort])

  const panelCount = [caliber, idleDays ? 'x' : ''].filter(Boolean).length
  const canClear = chip !== 'all' || panelCount > 0 || sort !== 'recientes'
  const clearFilters = () => { setChip('all'); setCaliber(''); setIdleDays(0); setSort('recientes') }
  const hasFilters = !!search || chip !== 'all' || panelCount > 0

  const handleSearch = async (e: React.FormEvent) => {
    e.preventDefault()
    const term = searchTerm.trim()
    if (!term) return

    setSearching(true)
    setSearchError(null)
    try {
      // Prioridad: código corto de manguera (búsqueda manual rápida)
      const hose = await hoseService.getHoseByShortCode(term)
      if (hose) {
        window.location.href = `/mangueras/posicion/${hose.position_id}`
        return
      }
      setSearchError(`No se encontró ninguna manguera con el código "${term}"`)
    } catch (err: any) {
      setSearchError(err.message || 'Error al buscar')
    } finally {
      setSearching(false)
    }
  }

  // La página ya viene filtrada desde el servidor (código, nombre o código de manguera)
  const filteredEquipment = equipmentList

  const openEditModal = (equipment: Equipment & { positions?: HosePositionWithDetails[] }) => {
    setEditingEquipment(equipment)
    setEditCode(equipment.code)
    setEditName(equipment.name)
    const calibers: Record<string, string> = {}
    const lengths: Record<string, string> = {}
    for (const position of equipment.positions || []) {
      calibers[position.id] = position.caliber
      lengths[position.id] = position.length || ''
    }
    setEditCalibers(calibers)
    setEditLengths(lengths)
    setEditReason('')
    setEditError(null)
  }

  const handleDeleteEquipment = async (equipmentId: string, equipmentName: string) => {
    setArchiveReason('')
    setConfirmDelete({ id: equipmentId, name: equipmentName })
  }

  const openCycleModal = (equipment: Equipment & { positions?: HosePositionWithDetails[] }) => {
    setCycleEquipment(equipment)
    setCycleNotes('Lavado y Esterilización')
    setCycleError(null)
  }

  const handleRegisterCycle = async (e: React.FormEvent) => {
    e.preventDefault()
    if (!cycleEquipment) return
    const activeHoseIds = (cycleEquipment.positions || [])
      .map((position) => position.activeHose?.id)
      .filter((id): id is string => Boolean(id))

    if (activeHoseIds.length === 0) {
      setCycleError('Este producto no tiene mangueras activas')
      return
    }

    setCycleSubmitting(true)
    setCycleError(null)
    try {
      await hoseService.registerBulkUse(activeHoseIds, { notes: cycleNotes })
      await loadEquipment()
      setCycleEquipment(null)
    } catch (err: any) {
      setCycleError(err.message || 'Error al registrar el ciclo')
    } finally {
      setCycleSubmitting(false)
    }
  }

  const handleExport = async () => {
    setExporting(true)
    setSearchError(null)
    try {
      const allEquipment = await hoseService.listAllEquipment(filters)
      const hoseIds = allEquipment.flatMap((e) => e.positions.flatMap((p) => (p.history || []).map((h) => h.id)))
      const actions = await hoseService.getActionsForHoses(hoseIds)
      const exportEquipment = allEquipment.map((equipment) => ({
        ...equipment,
        positions: equipment.positions.map((position) => {
          const historyActions: Record<string, (typeof actions)[string]> = {}
          for (const hose of position.history || []) historyActions[hose.id] = actions[hose.id] || []
          return {
            ...position,
            activeActions: position.activeHose ? historyActions[position.activeHose.id] || [] : [],
            historyActions,
          }
        }),
      }))
      await generateHoseInventoryExcel(exportEquipment)
    } catch (err: any) {
      setSearchError(err.message || 'Error al exportar la información')
    } finally {
      setExporting(false)
    }
  }

  const confirmDeleteEquipment = async () => {
    if (!confirmDelete) return
    if (!archiveReason.trim()) {
      setSearchError('El motivo es obligatorio para archivar un producto')
      return
    }
    setDeletingId(confirmDelete.id)
    try {
      await hoseService.archiveEquipment(confirmDelete.id, archiveReason.trim())
      await loadEquipment()
      setConfirmDelete(null)
    } catch (err: any) {
      setSearchError(err.message || 'Error al archivar el producto')
    } finally {
      setDeletingId(null)
    }
  }

  const handleSaveEdit = async (e: React.FormEvent) => {
    e.preventDefault()
    if (!editingEquipment) return
    setSavingEdit(true)
    setEditError(null)
    try {
      if (!editCode.trim() || !editName.trim()) {
        throw new Error('El código y el nombre del producto son obligatorios')
      }
      const reason = editReason.trim()
      if (!reason) {
        throw new Error('El motivo del cambio es obligatorio')
      }
      const equipmentChanged =
        editCode.trim() !== editingEquipment.code || editName.trim() !== editingEquipment.name
      if (equipmentChanged) {
        await hoseService.updateEquipment(editingEquipment.id, { code: editCode.trim(), name: editName.trim() }, reason)
      }

      const positions = editingEquipment.positions || []
      await Promise.all(
        positions
          .filter((position) => {
            const newCaliber = editCalibers[position.id]?.trim()
            const newLength = editLengths[position.id]?.trim() ?? ''
            return (newCaliber && newCaliber !== position.caliber) || newLength !== (position.length || '')
          })
          .map((position) => hoseService.updatePosition(position.id, {
            caliber: editCalibers[position.id]?.trim() || position.caliber,
            length: editLengths[position.id]?.trim() || undefined,
          }, reason))
      )

      await loadEquipment()
      setEditingEquipment(null)
    } catch (err: any) {
      setEditError(err.message || 'Error al guardar los cambios')
    } finally {
      setSavingEdit(false)
    }
  }

  return (
    <div className="w-full pb-20 md:pb-0">
      <div className="flex flex-col gap-3 mb-6 sm:flex-row sm:items-center sm:justify-between">
        <div className="flex items-center gap-3">
          <Waves className="w-8 h-8 text-blue-600" />
          <h1 className="text-2xl font-bold text-gray-800">Mangueras</h1>
        </div>
        <div className="flex flex-wrap gap-2 w-full sm:w-auto sm:items-center">
          {canCreateEquipment && (
            <Link to="/mangueras/nuevo-equipo" className="btn-primary flex-1 flex items-center justify-center gap-2 whitespace-nowrap sm:flex-none">
              <Plus className="w-4 h-4" />
              Nuevo Producto
            </Link>
          )}
          {canCreateEquipment && (
            <button onClick={() => setShowImport(true)} className="btn-secondary flex-1 flex items-center justify-center gap-2 whitespace-nowrap sm:flex-none">
              <Upload className="w-4 h-4" />
              Importar
            </button>
          )}
          <button onClick={handleExport} className="btn-excel flex-1 flex items-center justify-center gap-2 whitespace-nowrap sm:flex-none" disabled={exporting || total === 0}>
            {exporting ? <Loader className="w-4 h-4 animate-spin" /> : <Download className="w-4 h-4" />}
            Exportar
          </button>
        </div>
      </div>

      <div className="card mb-6">
        <form onSubmit={handleSearch} className="flex gap-2">
          <input
            type="text"
            value={searchTerm}
            onChange={(e) => setSearchTerm(e.target.value)}
            placeholder="Buscar código o producto"
            className="input-field flex-1"
          />
          <button type="submit" className="btn-primary flex items-center gap-2" disabled={searching}>
            {searching ? <Loader className="w-4 h-4 animate-spin" /> : <Search className="w-4 h-4" />}
            Buscar
          </button>
        </form>
        {searchError && (
          <p className="mt-2 text-sm text-red-600">{searchError}</p>
        )}

        <InventoryFilterBar
          chips={hoseChips} chipsLabel="Vida útil" sortOptions={hoseSortOptions}
          status={chip} onStatus={setChip}
          sort={sort} onSort={(v) => setSort(v as EquipmentSort)}
          open={showFilters} onToggle={() => setShowFilters((v) => !v)}
          activeCount={panelCount}
          onClear={clearFilters}
          canClear={canClear}
        >
          <FilterField label="Calibre">
            <select value={caliber} onChange={(e) => setCaliber(e.target.value)} className="input-field py-1.5 text-sm">
              <option value="">Todos</option>
              {calibers.map((c) => <option key={c} value={c}>{c}</option>)}
            </select>
          </FilterField>
          <FilterField label="Sin actividad">
            <select value={idleDays} onChange={(e) => setIdleDays(Number(e.target.value))} className="input-field py-1.5 text-sm">
              <option value={0}>Cualquiera</option>
              <option value={7}>Más de 7 días</option>
              <option value={30}>Más de 30 días</option>
              <option value={90}>Más de 90 días</option>
            </select>
          </FilterField>
        </InventoryFilterBar>
      </div>

      {loading && equipmentList.length === 0 ? (
        <SkeletonList rows={4} />
      ) : filteredEquipment.length === 0 ? (
        <div className="text-center py-12 text-gray-500">{hasFilters ? 'No hay productos que coincidan con los filtros' : 'No hay productos registrados'}</div>
      ) : (
        <div className="grid md:grid-cols-2 gap-4">
          {filteredEquipment.map((equipment) => (
            <div key={equipment.id} className="card">
              <div className="mb-3 flex items-start justify-between gap-2">
                <div className="min-w-0">
                  <h2 className="font-semibold text-gray-800">{equipment.name}</h2>
                  <p className="text-sm text-gray-500">{equipment.code}</p>
                  <div className="mt-1.5 flex flex-wrap items-center gap-x-3 gap-y-1 text-xs text-gray-500">
                    <span className="inline-flex items-center gap-1.5">
                      <StatusDot tone={lifeTone[equipment.life_status]} />
                      Máx. {equipment.max_cycle}/200 ciclos
                    </span>
                    <span className="inline-flex items-center gap-1"><Clock className="h-3.5 w-3.5" /> Última actividad: {fmtDate(equipment.last_action_at)}</span>
                    {equipment.needs_attention && (
                      <span className="inline-flex items-center gap-1 rounded-full bg-amber-50 px-2 py-0.5 font-medium text-amber-700 ring-1 ring-inset ring-amber-600/20">
                        <AlertTriangle className="h-3 w-3" /> Posición sin manguera activa
                      </span>
                    )}
                  </div>
                </div>
                {(canCreateEquipment || canDeleteEquipment) && (
                  <div className="flex items-center gap-1 flex-shrink-0">
                    {canCreateEquipment && (
                      <button
                        onClick={() => openEditModal(equipment)}
                        className="p-1.5 text-gray-500 hover:bg-gray-100 rounded-lg"
                        title="Editar producto"
                      >
                        <Pencil className="w-4 h-4" />
                      </button>
                    )}
                    {canDeleteEquipment && (
                      <button
                        onClick={() => handleDeleteEquipment(equipment.id, equipment.name)}
                        disabled={deletingId === equipment.id}
                        className="p-1.5 text-gray-500 hover:bg-gray-100 rounded-lg disabled:opacity-50"
                        title="Archivar producto"
                      >
                        <Archive className="w-4 h-4" />
                      </button>
                    )}
                  </div>
                )}
              </div>
              <div className="grid grid-cols-1 gap-2 mb-3">
                {(equipment.positions || []).map((position) => {
                  const cycle = position.activeHose?.current_cycle ?? 0
                  const status = getHoseLifeStatus(cycle)
                  return (
                    <Link
                      key={position.id}
                      to={`/mangueras/posicion/${position.id}`}
                      className="flex items-center justify-between px-3 py-2 rounded-lg border border-gray-200 bg-gray-50 hover:bg-gray-100 transition-colors"
                    >
                      <div className="flex items-center gap-2">
                        <StatusDot tone={lifeTone[status]} />
                        <span className="sr-only">{lifeLabel[status]}</span>
                        <span className="text-sm font-medium text-gray-700">Calibre {position.caliber}</span>
                        {position.length && (
                          <span className="text-xs text-gray-500">Long: {position.length}</span>
                        )}
                        {position.activeHose?.short_code && (
                          <span className="text-xs font-mono text-gray-500">Código: {position.activeHose.short_code}</span>
                        )}
                      </div>
                      <span className="text-xs font-semibold text-gray-600">{cycle}/200 ciclos</span>
                    </Link>
                  )
                })}
              </div>
              {canRegisterHoseAction && (
                <button
                  onClick={() => openCycleModal(equipment)}
                  className="btn-primary w-full flex items-center justify-center gap-2 text-sm"
                >
                  <PlusCircle className="w-4 h-4" /> Registrar ciclo
                </button>
              )}
            </div>
          ))}
        </div>
      )}

      <Pagination page={page} pageSize={pageSize} total={total} onPageChange={setPage}
        onPageSizeChange={setPageSize} pageSizeOptions={[10, 20, 50]} label="productos" />

      {showImport && (
        <ImportEquipmentModal
          onClose={() => setShowImport(false)}
          onImported={() => { loadEquipment(); hoseService.calibers().then(setCalibers).catch(() => {}) }}
        />
      )}

      {cycleEquipment && (
        <div className="fixed inset-0 bg-black/40 flex items-center justify-center p-4 z-50">
          <div className="bg-white rounded-xl p-6 w-full max-w-md">
            <h2 className="text-lg font-semibold mb-1">Registrar ciclo</h2>
            <p className="text-sm text-gray-500 mb-4">
              Se sumará 1 ciclo a las {(cycleEquipment.positions || []).filter((p) => p.activeHose).length} mangueras activas de "{cycleEquipment.name}".
            </p>
            {cycleError && <Notice tone="error" className="mb-3">{cycleError}</Notice>}
            <form onSubmit={handleRegisterCycle} className="space-y-3">
              <RecordedBy />
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1">Notas</label>
                <textarea value={cycleNotes} onChange={(e) => setCycleNotes(e.target.value)} className="input-field" rows={2} />
              </div>
              <div className="flex gap-3 pt-2">
                <button type="button" onClick={() => setCycleEquipment(null)} className="btn-secondary flex-1">Cancelar</button>
                <button type="submit" className="btn-primary flex-1" disabled={cycleSubmitting}>
                  {cycleSubmitting ? 'Registrando...' : 'Registrar'}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}

      {editingEquipment && (
        <div className="fixed inset-0 bg-black/40 flex items-center justify-center p-4 z-50">
          <div className="bg-white rounded-xl p-6 w-full max-w-md max-h-[90vh] overflow-y-auto">
            <h2 className="text-lg font-semibold mb-4">Editar producto</h2>
            {editError && <Notice tone="error" className="mb-3">{editError}</Notice>}
            <form onSubmit={handleSaveEdit} className="space-y-3">
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1">Código del producto *</label>
                <input value={editCode} onChange={(e) => setEditCode(e.target.value)} className="input-field" required />
              </div>
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1">Nombre *</label>
                <input value={editName} onChange={(e) => setEditName(e.target.value)} className="input-field" required />
              </div>
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-2">Calibres y longitud</label>
                <div className="space-y-2">
                  {(editingEquipment.positions || []).map((position) => (
                    <div key={position.id} className="flex items-center gap-2">
                      <span className="text-xs text-gray-500 w-16 flex-shrink-0" title="Código de la manguera activa">{position.activeHose?.short_code || 'Sin manguera'}</span>
                      <input
                        value={editCalibers[position.id] ?? ''}
                        onChange={(e) => setEditCalibers((prev) => ({ ...prev, [position.id]: e.target.value }))}
                        placeholder="Calibre"
                        className="input-field"
                      />
                      <input
                        value={editLengths[position.id] ?? ''}
                        onChange={(e) => setEditLengths((prev) => ({ ...prev, [position.id]: e.target.value }))}
                        placeholder="Longitud (ej. 2m)"
                        className="input-field"
                      />
                    </div>
                  ))}
                </div>
              </div>
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1">Motivo del cambio *</label>
                <textarea
                  value={editReason}
                  onChange={(e) => setEditReason(e.target.value)}
                  className="input-field"
                  rows={2}
                  placeholder="Ej. corrección de calibre capturado por error"
                  required
                />
                <p className="text-xs text-gray-500 mt-1">Queda registrado en el audit trail junto con el valor anterior y el nuevo.</p>
              </div>
              <div className="flex gap-3 pt-2">
                <button type="button" onClick={() => setEditingEquipment(null)} className="btn-secondary flex-1">Cancelar</button>
                <button type="submit" className="btn-primary flex-1" disabled={savingEdit}>
                  {savingEdit ? 'Guardando...' : 'Guardar cambios'}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}

      {confirmDelete && (
        <div className="fixed inset-0 bg-black/40 flex items-center justify-center p-4 z-50">
          <div className="bg-white rounded-xl p-6 w-full max-w-md">
            <h2 className="text-lg font-semibold mb-3">Archivar producto</h2>
            <p className="text-sm text-gray-600 mb-3">
              El producto "{confirmDelete.name}" dejará de aparecer en el inventario. Sus mangueras e historial se conservan para trazabilidad.
            </p>
            <label className="block text-sm font-medium text-gray-700 mb-1">Motivo *</label>
            <textarea
              value={archiveReason}
              onChange={(e) => setArchiveReason(e.target.value)}
              className="input-field mb-4"
              rows={2}
              placeholder="Ej. equipo retirado de operación"
            />
            <div className="flex gap-3">
              <button type="button" onClick={() => setConfirmDelete(null)} className="btn-secondary flex-1" disabled={deletingId === confirmDelete.id}>
                Cancelar
              </button>
              <button
                type="button"
                onClick={confirmDeleteEquipment}
                disabled={deletingId === confirmDelete.id || !archiveReason.trim()}
                className="flex-1 px-4 py-2 bg-red-600 hover:bg-red-700 text-white rounded-lg font-semibold transition-colors disabled:opacity-50"
              >
                {deletingId === confirmDelete.id ? 'Archivando...' : 'Archivar'}
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  )
}

export default HoseInventory
