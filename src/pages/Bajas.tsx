import { useState, useEffect } from 'react'
import { Trash2, Loader2, AlertTriangle, Calendar, FileText } from 'lucide-react'
import { garmentService } from '../services/garmentService'
import type { Garment } from '../types'

const Bajas = () => {
  const [garments, setGarments] = useState<Garment[]>([])
  const [loading, setLoading] = useState(true)
  const [searchTerm, setSearchTerm] = useState('')

  useEffect(() => {
    loadBajas()
  }, [])

  const loadBajas = async () => {
    try {
      setLoading(true)
      const data = await garmentService.getBajas()
      setGarments(data)
    } catch (error) {
      console.error('Error cargando bajas:', error)
    } finally {
      setLoading(false)
    }
  }

  const filteredGarments = garments.filter((garment) =>
    garment.code.toLowerCase().includes(searchTerm.toLowerCase()) ||
    garment.name.toLowerCase().includes(searchTerm.toLowerCase()) ||
    (garment.baja_reason?.toLowerCase().includes(searchTerm.toLowerCase()) ?? false)
  )

  const handleDeletePermanent = async (id: string) => {
    if (!confirm('¿Eliminar permanentemente esta prenda? Esta acción no se puede deshacer.')) return
    try {
      await garmentService.delete(id)
      loadBajas()
    } catch (error) {
      console.error('Error eliminando prenda:', error)
    }
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
    <div className="max-w-4xl mx-auto pb-20 md:pb-0">
      <div className="flex items-center gap-3 mb-6">
        <AlertTriangle className="w-8 h-8 text-red-600" />
        <h1 className="text-2xl font-bold text-gray-800">Prendas Dadas de Baja</h1>
      </div>

      {/* Contador */}
      <div className="card mb-6 bg-red-50 border border-red-200">
        <div className="flex items-center justify-between">
          <div>
            <div className="text-sm text-red-600 font-medium">Total de Bajas</div>
            <div className="text-3xl font-bold text-red-700">{garments.length}</div>
          </div>
          <Trash2 className="w-12 h-12 text-red-300" />
        </div>
      </div>

      {/* Búsqueda */}
      <div className="card mb-6">
        <input
          type="text"
          value={searchTerm}
          onChange={(e) => setSearchTerm(e.target.value)}
          placeholder="Buscar por código, nombre o motivo..."
          className="input-field"
        />
      </div>

      {/* Lista de Bajas */}
      {loading ? (
        <div className="card text-center py-12">
          <Loader2 className="w-12 h-12 text-red-600 mx-auto mb-4 animate-spin" />
          <p className="text-gray-600">Cargando bajas...</p>
        </div>
      ) : filteredGarments.length === 0 ? (
        <div className="card text-center py-12">
          <AlertTriangle className="w-12 h-12 text-gray-400 mx-auto mb-4" />
          <p className="text-gray-600">
            {garments.length === 0
              ? 'No hay prendas dadas de baja'
              : 'No se encontraron prendas con ese criterio'}
          </p>
        </div>
      ) : (
        <div className="space-y-3">
          {filteredGarments.map((garment) => (
            <div key={garment.id} className="card border-l-4 border-red-500">
              <div className="flex items-start justify-between">
                <div className="flex-1">
                  <div className="flex items-center gap-2 mb-1">
                    <span className="font-mono text-lg text-gray-800">{garment.code}</span>
                    <span className="px-2 py-0.5 bg-red-100 text-red-800 rounded text-xs font-medium">
                      BAJA
                    </span>
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
                  onClick={() => handleDeletePermanent(garment.id)}
                  className="p-2 text-red-500 hover:bg-red-50 rounded-lg transition-colors"
                  title="Eliminar permanentemente"
                >
                  <Trash2 className="w-5 h-5" />
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
