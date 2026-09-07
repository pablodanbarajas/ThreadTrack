import { useEffect, useState } from 'react'
import { Link } from 'react-router-dom'
import { Waves, Plus, Search, Loader, Pencil, Trash2, PlusCircle, Download } from 'lucide-react'
import { useRole } from '../contexts/AuthContext'
import { useHoseCache } from '../contexts/HoseCacheContext'
import { hoseService } from '../services/hoseService'
import { getHoseLifeStatus } from '../lib/hoseLifeStatus'
import { generateHoseInventoryExcel } from '../services/reportService'
import type { HoseLifeStatus } from '../lib/hoseLifeStatus'
import type { Equipment, HosePositionWithDetails } from '../types'

const lifeStatusStyles: Record<HoseLifeStatus, { label: string; dot: string }> = {
  verde: { label: 'Verde', dot: 'bg-green-500' },
  amarillo: { label: 'Amarillo', dot: 'bg-yellow-400' },
  naranja: { label: 'Naranja', dot: 'bg-orange-500' },
  rojo: { label: 'Rojo', dot: 'bg-red-500' },
}

const HoseInventory = () => {
  const { canCreateEquipment, canDeleteEquipment, canRegisterHoseAction } = useRole()
  const { equipmentList, loading, loadEquipment, invalidateEquipment } = useHoseCache()
  const [searchTerm, setSearchTerm] = useState('')
  const [searching, setSearching] = useState(false)
  const [searchError, setSearchError] = useState<string | null>(null)
  const [deletingId, setDeletingId] = useState<string | null>(null)
  const [confirmDelete, setConfirmDelete] = useState<{ id: string; name: string } | null>(null)

  const [editingEquipment, setEditingEquipment] = useState<(Equipment & { positions?: HosePositionWithDetails[] }) | null>(null)
  const [editCode, setEditCode] = useState('')
  const [editName, setEditName] = useState('')
  const [editCalibers, setEditCalibers] = useState<Record<string, string>>({})
  const [editLengths, setEditLengths] = useState<Record<string, string>>({})
  const [savingEdit, setSavingEdit] = useState(false)
  const [editError, setEditError] = useState<string | null>(null)

  const [cycleEquipment, setCycleEquipment] = useState<(Equipment & { positions?: HosePositionWithDetails[] }) | null>(null)
  const [cycleResponsible, setCycleResponsible] = useState('')
  const [cycleNotes, setCycleNotes] = useState('')
  const [cycleSubmitting, setCycleSubmitting] = useState(false)
  const [cycleError, setCycleError] = useState<string | null>(null)
  const [exporting, setExporting] = useState(false)

  useEffect(() => {
    loadEquipment()
  }, [loadEquipment])

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

  const filteredEquipment = equipmentList.filter((equipment) => {
    if (!searchTerm.trim()) return true
    const term = searchTerm.trim().toLowerCase()
    const matchesEquipment = equipment.code.toLowerCase().includes(term) || equipment.name.toLowerCase().includes(term)
    const matchesHoseCode = (equipment.positions || []).some((position) =>
      (position.history || []).some((hose) => hose.short_code?.toLowerCase().includes(term))
    )
    return matchesEquipment || matchesHoseCode
  })

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
    setEditError(null)
  }

  const handleDeleteEquipment = async (equipmentId: string, equipmentName: string) => {
    setConfirmDelete({ id: equipmentId, name: equipmentName })
  }

  const openCycleModal = (equipment: Equipment & { positions?: HosePositionWithDetails[] }) => {
    setCycleEquipment(equipment)
    setCycleResponsible('')
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
      await hoseService.registerBulkUse(activeHoseIds, { performedBy: cycleResponsible, notes: cycleNotes })
      invalidateEquipment()
      await loadEquipment({ force: true })
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
      const exportEquipment = await Promise.all(filteredEquipment.map(async (equipment) => {
        const positions = await Promise.all((equipment.positions || []).map(async (position) => {
          const historyActions: Record<string, Awaited<ReturnType<typeof hoseService.getHoseActions>>> = {}
          for (const hose of position.history || []) {
            historyActions[hose.id] = await hoseService.getHoseActions(hose.id)
          }
          return {
            ...position,
            activeActions: position.activeHose ? historyActions[position.activeHose.id] || [] : [],
            historyActions,
          }
        }))
        return { ...equipment, positions }
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
    setDeletingId(confirmDelete.id)
    try {
      await hoseService.deleteEquipment(confirmDelete.id)
      invalidateEquipment()
      await loadEquipment({ force: true })
      setConfirmDelete(null)
    } catch (err: any) {
      setSearchError(err.message || 'Error al eliminar el producto')
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
      await hoseService.updateEquipment(editingEquipment.id, { code: editCode.trim(), name: editName.trim() })

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
          }))
      )

      invalidateEquipment()
      await loadEquipment({ force: true })
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
          <button onClick={handleExport} className="btn-secondary flex-1 flex items-center justify-center gap-2 whitespace-nowrap sm:flex-none" disabled={exporting || filteredEquipment.length === 0}>
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
      </div>

      {loading && equipmentList.length === 0 ? (
        <div className="text-center py-12 text-gray-500">Cargando productos...</div>
      ) : filteredEquipment.length === 0 ? (
        <div className="text-center py-12 text-gray-500">No hay productos registrados</div>
      ) : (
        <div className="grid md:grid-cols-2 gap-4">
          {filteredEquipment.map((equipment) => (
            <div key={equipment.id} className="card">
              <div className="mb-3 flex items-start justify-between gap-2">
                <div>
                  <h2 className="font-semibold text-gray-800">{equipment.name}</h2>
                  <p className="text-sm text-gray-500">{equipment.code}</p>
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
                        className="p-1.5 text-red-500 hover:bg-red-50 rounded-lg disabled:opacity-50"
                        title="Eliminar producto"
                      >
                        <Trash2 className="w-4 h-4" />
                      </button>
                    )}
                  </div>
                )}
              </div>
              <div className="grid grid-cols-1 gap-2 mb-3">
                {(equipment.positions || []).map((position) => {
                  const cycle = position.activeHose?.current_cycle ?? 0
                  const status = getHoseLifeStatus(cycle)
                  const style = lifeStatusStyles[status]
                  return (
                    <Link
                      key={position.id}
                      to={`/mangueras/posicion/${position.id}`}
                      className="flex items-center justify-between px-3 py-2 rounded-lg border border-gray-200 bg-gray-50 hover:bg-gray-100 transition-colors"
                    >
                      <div className="flex items-center gap-2">
                        <span className={`w-2.5 h-2.5 rounded-full ${style.dot}`} />
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

      {cycleEquipment && (
        <div className="fixed inset-0 bg-black/40 flex items-center justify-center p-4 z-50">
          <div className="bg-white rounded-xl p-6 w-full max-w-md">
            <h2 className="text-lg font-semibold mb-1">Registrar ciclo</h2>
            <p className="text-sm text-gray-500 mb-4">
              Se sumará 1 ciclo a las {(cycleEquipment.positions || []).filter((p) => p.activeHose).length} mangueras activas de "{cycleEquipment.name}".
            </p>
            {cycleError && <div className="mb-3 p-2 bg-red-50 border border-red-200 rounded-lg text-sm text-red-700">{cycleError}</div>}
            <form onSubmit={handleRegisterCycle} className="space-y-3">
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1">Responsable *</label>
                <input value={cycleResponsible} onChange={(e) => setCycleResponsible(e.target.value)} className="input-field" required />
              </div>
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1">Notas</label>
                <textarea value={cycleNotes} onChange={(e) => setCycleNotes(e.target.value)} className="input-field" rows={2} />
              </div>
              <div className="flex gap-3 pt-2">
                <button type="button" onClick={() => setCycleEquipment(null)} className="btn-secondary flex-1">Cancelar</button>
                <button type="submit" className="btn-primary flex-1" disabled={cycleSubmitting || !cycleResponsible.trim()}>
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
            {editError && <div className="mb-3 p-2 bg-red-50 border border-red-200 rounded-lg text-sm text-red-700">{editError}</div>}
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
            <h2 className="text-lg font-semibold mb-3">Eliminar producto</h2>
            <p className="text-sm text-gray-600 mb-4">
              ¿Eliminar el producto "{confirmDelete.name}"? Esto borrará también sus mangueras e historial. Esta acción no se puede deshacer.
            </p>
            <div className="flex gap-3">
              <button type="button" onClick={() => setConfirmDelete(null)} className="btn-secondary flex-1" disabled={deletingId === confirmDelete.id}>
                Cancelar
              </button>
              <button
                type="button"
                onClick={confirmDeleteEquipment}
                disabled={deletingId === confirmDelete.id}
                className="flex-1 px-4 py-2 bg-red-600 hover:bg-red-700 text-white rounded-lg font-semibold transition-colors disabled:opacity-50"
              >
                {deletingId === confirmDelete.id ? 'Eliminando...' : 'Eliminar'}
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  )
}

export default HoseInventory
