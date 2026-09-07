import { Link } from 'react-router-dom'
import { useEffect, useState } from 'react'
import { Shirt, Package, PackageCheck, Droplets, Scissors, AlertTriangle, FileDown, Users } from 'lucide-react'
import { useRole } from '../contexts/AuthContext'
import { useGarmentCache } from '../contexts/GarmentCacheContext'
import { generateReportExcel } from '../services/reportService'
import { WASH_STERILIZATION_CYCLE_LIMIT, getCycleCount, getCycleLifeStatus } from '../lib/lifeStatus'

const Home = () => {
  const { role, canDownloadReport } = useRole()
  const { garments, loading, loadGarments } = useGarmentCache()
  const [generatingReport, setGeneratingReport] = useState(false)

  useEffect(() => {
    loadGarments().catch((error) => console.error('Error cargando datos:', error))
  }, [loadGarments])

  const stats = {
    total: garments.filter((g) => g.status !== 'baja').length,
    disponible: garments.filter((g) => g.status === 'disponible').length,
    lavado: garments.filter((g) => g.status === 'lavado').length,
    inspeccion: garments.filter((g) => g.status === 'inspeccion').length,
    reparacion: garments.filter((g) => g.status === 'reparacion').length,
    baja: garments.filter((g) => g.status === 'baja').length,
  }

  const handleGenerateReport = async () => {
    try {
      setGeneratingReport(true)
      await generateReportExcel(garments)
    } catch (error) {
      console.error('Error generando reporte:', error)
      alert('Error al generar el reporte')
    } finally {
      setGeneratingReport(false)
    }
  }

  const activeGarments = garments.filter((g) => g.status !== 'baja')
  const lifeStatusCounts = activeGarments.reduce(
    (acc, garment) => {
      const cycleCount = getCycleCount(garment.actions || [])
      const status = getCycleLifeStatus(cycleCount)
      acc[status] += 1
      return acc
    },
    { verde: 0, amarillo: 0, naranja: 0, rojo: 0 }
  )

  const lifeTotal = activeGarments.length
  const lifePct = (count: number) => (lifeTotal > 0 ? Math.round((count / lifeTotal) * 100) : 0)

  return (
    <div className="max-w-6xl mx-auto pt-2">

      {/* Quick Actions */}
      <div className="flex flex-col md:flex-row gap-3 justify-center mb-4">
        <Link
          to="/inventory"
          className="card hover:shadow-lg transition-shadow duration-200 flex items-center space-x-4 w-full max-w-sm"
        >
          <div className="p-3 bg-green-100 rounded-lg">
            <Package className="w-8 h-8 text-green-600" />
          </div>
          <div>
            <h2 className="text-lg font-semibold text-gray-800">Inventario</h2>
            <p className="text-gray-600 text-sm">Gestionar prendas</p>
          </div>
        </Link>

        {canDownloadReport && (
          <button
            onClick={handleGenerateReport}
            disabled={loading || generatingReport || garments.length === 0}
            className="card hover:shadow-lg transition-shadow duration-200 flex items-center space-x-4 w-full max-w-sm disabled:opacity-50 disabled:cursor-not-allowed"
          >
            <div className="p-3 bg-blue-100 rounded-lg">
              <FileDown className="w-8 h-8 text-blue-600" />
            </div>
            <div className="text-left">
              <h2 className="text-lg font-semibold text-gray-800">
                {generatingReport ? 'Generando...' : 'Descargar Excel'}
              </h2>
              <p className="text-gray-600 text-sm">Excel con lista de prendas</p>
            </div>
          </button>
        )}

        {role === 'administrador' && (
          <Link
            to="/admin/usuarios"
            className="card hover:shadow-lg transition-shadow duration-200 flex items-center space-x-4 w-full max-w-sm"
          >
            <div className="p-3 bg-purple-100 rounded-lg">
              <Users className="w-8 h-8 text-purple-600" />
            </div>
            <div>
              <h2 className="text-lg font-semibold text-gray-800">Gestionar Usuarios</h2>
              <p className="text-gray-600 text-sm">Administrar roles</p>
            </div>
          </Link>
        )}
      </div>

      {/* Stats Preview */}
      <div className="card mb-4">
        <h3 className="text-lg font-semibold text-gray-800 mb-4">Resumen de Inventario</h3>
        <div className="grid grid-cols-2 md:grid-cols-5 gap-3">
          <div className="text-center p-2 bg-gray-50 rounded-lg">
            <Shirt className="w-5 h-5 text-blue-600 mx-auto mb-1" />
            <div className="text-xl font-bold text-blue-600">
              {loading ? '...' : stats.total}
            </div>
            <div className="text-gray-600 text-xs">Total</div>
          </div>
          <div className="text-center p-2 bg-green-50 rounded-lg">
            <PackageCheck className="w-5 h-5 text-green-600 mx-auto mb-1" />
            <div className="text-xl font-bold text-green-600">
              {loading ? '...' : stats.disponible}
            </div>
            <div className="text-gray-600 text-xs">Disponible</div>
          </div>
          <div className="text-center p-2 bg-blue-50 rounded-lg">
            <Droplets className="w-5 h-5 text-blue-600 mx-auto mb-1" />
            <div className="text-xl font-bold text-blue-600">
              {loading ? '...' : stats.lavado}
            </div>
            <div className="text-gray-600 text-xs">Lavado y esterilización</div>
          </div>
          <div className="text-center p-2 bg-orange-50 rounded-lg">
            <Scissors className="w-5 h-5 text-orange-600 mx-auto mb-1" />
            <div className="text-xl font-bold text-orange-600">
              {loading ? '...' : stats.reparacion}
            </div>
            <div className="text-gray-600 text-xs">Reparación</div>
          </div>
          <Link to="/bajas" className="text-center p-2 bg-red-50 rounded-lg hover:bg-red-100 transition-colors">
            <AlertTriangle className="w-5 h-5 text-red-600 mx-auto mb-1" />
            <div className="text-xl font-bold text-red-600">
              {loading ? '...' : stats.baja}
            </div>
            <div className="text-gray-600 text-xs">Bajas</div>
          </Link>
        </div>
      </div>

      {/* Semáforo de vida útil por ciclos */}
      <div className="card mb-4">
        <div className="flex items-start justify-between gap-3 mb-4">
          <div>
            <h3 className="text-lg font-semibold text-gray-800">Semáforo de Vida Útil</h3>
            <p className="text-sm text-gray-500">Basado en ciclos de lavado y esterilización por prenda (límite: {WASH_STERILIZATION_CYCLE_LIMIT})</p>
          </div>
          <div className="text-xs text-gray-500 bg-gray-100 px-2 py-1 rounded-md">
            {lifeTotal} prendas activas
          </div>
        </div>

        <div className="w-full h-3 rounded-full overflow-hidden bg-gray-100 mb-4 flex">
          <div className="bg-green-500" style={{ width: `${lifePct(lifeStatusCounts.verde)}%` }} />
          <div className="bg-yellow-400" style={{ width: `${lifePct(lifeStatusCounts.amarillo)}%` }} />
          <div className="bg-orange-500" style={{ width: `${lifePct(lifeStatusCounts.naranja)}%` }} />
          <div className="bg-red-500" style={{ width: `${lifePct(lifeStatusCounts.rojo)}%` }} />
        </div>

        <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
          <div className="rounded-lg border border-green-200 bg-green-50 p-3">
            <div className="flex items-center gap-2 mb-1">
              <span className="w-2.5 h-2.5 rounded-full bg-green-500" />
              <p className="text-sm font-semibold text-green-800">Verde</p>
            </div>
            <p className="text-2xl font-bold text-green-700">{loading ? '...' : lifeStatusCounts.verde}</p>
            <p className="text-xs text-green-700">{loading ? '...' : `${lifePct(lifeStatusCounts.verde)}%`} del total</p>
            <p className="text-[11px] text-green-700/80 mt-1">0-24 ciclos</p>
          </div>

          <div className="rounded-lg border border-yellow-200 bg-yellow-50 p-3">
            <div className="flex items-center gap-2 mb-1">
              <span className="w-2.5 h-2.5 rounded-full bg-yellow-400" />
              <p className="text-sm font-semibold text-yellow-800">Amarillo</p>
            </div>
            <p className="text-2xl font-bold text-yellow-700">{loading ? '...' : lifeStatusCounts.amarillo}</p>
            <p className="text-xs text-yellow-700">{loading ? '...' : `${lifePct(lifeStatusCounts.amarillo)}%`} del total</p>
            <p className="text-[11px] text-yellow-700/80 mt-1">25-49 ciclos</p>
          </div>

          <div className="rounded-lg border border-orange-200 bg-orange-50 p-3">
            <div className="flex items-center gap-2 mb-1">
              <span className="w-2.5 h-2.5 rounded-full bg-orange-500" />
              <p className="text-sm font-semibold text-orange-800">Naranja</p>
            </div>
            <p className="text-2xl font-bold text-orange-700">{loading ? '...' : lifeStatusCounts.naranja}</p>
            <p className="text-xs text-orange-700">{loading ? '...' : `${lifePct(lifeStatusCounts.naranja)}%`} del total</p>
            <p className="text-[11px] text-orange-700/80 mt-1">50-74 ciclos</p>
          </div>

          <div className="rounded-lg border border-red-200 bg-red-50 p-3">
            <div className="flex items-center gap-2 mb-1">
              <span className="w-2.5 h-2.5 rounded-full bg-red-500" />
              <p className="text-sm font-semibold text-red-800">Rojo</p>
            </div>
            <p className="text-2xl font-bold text-red-700">{loading ? '...' : lifeStatusCounts.rojo}</p>
            <p className="text-xs text-red-700">{loading ? '...' : `${lifePct(lifeStatusCounts.rojo)}%`} del total</p>
            <p className="text-[11px] text-red-700/80 mt-1">75+ ciclos</p>
          </div>
        </div>
      </div>
    </div>
  )
}

export default Home
