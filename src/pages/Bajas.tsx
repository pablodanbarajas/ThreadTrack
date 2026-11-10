import { useState, useEffect } from 'react'
import { Archive, PackageX, Calendar, FileText, Search } from 'lucide-react'
import { StatusBadge, IconTile } from '../components/ui/StatusBadge'
import { SkeletonList } from '../components/ui/Skeleton'
import { useGarmentCache } from '../contexts/GarmentCacheContext'
import { useArchiveGarment } from '../hooks/useArchiveGarment'
import type { Garment } from '../types'

const Bajas = () => {
  const { garments: cachedGarments, loading, loadGarments, refreshGarments } = useGarmentCache()
  const [searchTerm, setSearchTerm] = useState('')

  useEffect(() => {
    loadGarments().catch((error) => console.error('Error cargando bajas:', error))
  }, [loadGarments])

  const garments = cachedGarments.filter((garment): garment is Garment => garment.status === 'baja')

  const filteredGarments = garments.filter((garment) =>
    garment.code.toLowerCase().includes(searchTerm.toLowerCase()) ||
    garment.name.toLowerCase().includes(searchTerm.toLowerCase()) ||
    (garment.baja_reason?.toLowerCase().includes(searchTerm.toLowerCase()) ?? false)
  )

  const archiveGarment = useArchiveGarment()
  const handleArchive = async (garment: Garment) => {
    if (await archiveGarment(garment)) await refreshGarments()
  }

  const formatDate = (dateString?: string) => {
    if (!dateString) return 'N/A'
    return new Date(dateString).toLocaleDateString('es-ES', {
      year: 'numeric',
      month: 'short',
      day: 'numeric',
      hour: '2-digit',
      minute: '2-digit'
    })
  }

  return (
    <div className="w-full pb-20 md:pb-0">
      <div className="flex items-center gap-3 mb-6">
        <IconTile icon={PackageX} tone="red" />
        <h1 className="text-2xl font-bold text-gray-800">Prendas Dadas de Baja</h1>
      </div>

      {/* Búsqueda */}
      <div className="card mb-6">
        <form onSubmit={(e) => e.preventDefault()} className="flex gap-2">
          <input
            type="text"
            value={searchTerm}
            onChange={(e) => setSearchTerm(e.target.value)}
            placeholder="Buscar por código, nombre o motivo..."
            className="input-field flex-1"
          />
          <button type="submit" className="btn-primary flex items-center gap-2">
            <Search className="w-4 h-4" />
            Buscar
          </button>
        </form>
      </div>

      {/* Lista de Bajas */}
      {loading && cachedGarments.length === 0 ? (
        <SkeletonList rows={4} />
      ) : filteredGarments.length === 0 ? (
        <div className="card text-center py-12">
          <PackageX className="w-12 h-12 text-gray-400 mx-auto mb-4" />
          <p className="text-gray-600">
            {garments.length === 0
              ? 'No hay prendas dadas de baja'
              : 'No se encontraron prendas con ese criterio'}
          </p>
        </div>
      ) : (
        <div className="space-y-3">
          {filteredGarments.map((garment) => (
            <div key={garment.id} className="relative overflow-hidden rounded-xl border border-gray-200 bg-white p-5 pl-6 shadow-sm">
              <span className="absolute inset-y-0 left-0 w-1 bg-red-500" />
              <div className="flex items-start justify-between">
                <div className="flex-1">
                  <div className="flex items-center gap-2 mb-1">
                    <span className="font-mono text-lg text-gray-800">{garment.code}</span>
                    <StatusBadge tone="red">Baja</StatusBadge>
                  </div>
                  <div className="text-gray-600 font-medium">{garment.name}</div>
                  {garment.client_name && (
                    <div className="text-sm text-gray-500">Cliente: {garment.client_name}</div>
                  )}
                  
                  {/* Motivo de baja */}
                  {garment.baja_reason && (
                    <div className="mt-3 p-3 bg-gray-50 rounded-lg">
                      <div className="flex items-center gap-2 text-sm text-gray-500 mb-1">
                        <FileText className="w-4 h-4" />
                        Motivo de baja:
                      </div>
                      <p className="text-gray-700">{garment.baja_reason}</p>
                    </div>
                  )}
                  
                  {/* Fecha de baja */}
                  <div className="flex items-center gap-2 mt-3 text-sm text-gray-500">
                    <Calendar className="w-4 h-4" />
                    Fecha de baja: {formatDate(garment.baja_date)}
                  </div>
                </div>
                
                <button
                  onClick={() => handleArchive(garment)}
                  className="p-2 text-red-600 hover:bg-red-50 rounded-lg transition-colors"
                  title="Archivar prenda"
                >
                  <Archive className="w-5 h-5" />
                </button>
              </div>
            </div>
          ))}
        </div>
      )}
    </div>
  )
}

export default Bajas
