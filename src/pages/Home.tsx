import { Link } from 'react-router-dom'
import { useEffect, useState } from 'react'
import { Shirt, Package, PackageCheck, Droplets, Sparkles, Scissors, AlertTriangle, FileDown, Users } from 'lucide-react'
import { useRole } from '../contexts/AuthContext'
import { roleBadges } from '../lib/rbac'
import { garmentService } from '../services/garmentService'
import { generateReportPDF } from '../services/reportService'
import Logo from '/CSCI_Logo_Color_Sin_Fondo.png'

const Home = () => {
  const { role, canDownloadReport } = useRole()
  const [stats, setStats] = useState({ 
    total: 0, 
    disponible: 0, 
    lavado: 0, 
    esterilizacion: 0, 
    inspeccion: 0, 
    reparacion: 0, 
    baja: 0 
  })
  const [garments, setGarments] = useState<any[]>([])
  const [loading, setLoading] = useState(true)
  const [generatingReport, setGeneratingReport] = useState(false)

  useEffect(() => {
    loadStats()
  }, [])

  const loadStats = async () => {
    try {
      const data = await garmentService.getStats()
      setStats(data)
      // Cargar todas las prendas con sus acciones para el reporte
      const allGarments = await garmentService.getAll()
      const garmentsWithActions = await Promise.all(
        allGarments.map(async (g) => {
          const actions = await garmentService.getActions(g.id)
          return { ...g, actions }
        })
      )
      setGarments(garmentsWithActions)
    } catch (error) {
      console.error('Error cargando datos:', error)
    } finally {
      setLoading(false)
    }
  }

  const handleGenerateReport = async () => {
    try {
      setGeneratingReport(true)
      await generateReportPDF(garments)
    } catch (error) {
      console.error('Error generando reporte:', error)
      alert('Error al generar el reporte')
    } finally {
      setGeneratingReport(false)
    }
  }

  const badgeColor = role ? roleBadges[role].color : ''
  const badgeLabel = role ? roleBadges[role].label : 'Sin rol'

  return (
    <div className="max-w-4xl mx-auto">
      {/* Hero Section */}
      <div className="text-center py-8">
        <div className="flex items-center justify-center gap-3 mb-4">
          <img src={Logo} alt="ThreadTrack Logo" className="h-12 w-auto" />
          <h1 className="text-4xl md:text-5xl font-bold text-gray-800">
            ThreadTrack
          </h1>
        </div>
        <p className="text-xl text-gray-600 mb-4">
          Sistema de Rastreo de Prendas
        </p>
        <span className={`inline-block px-3 py-1 rounded-full text-sm font-medium ${badgeColor}`}>
          {badgeLabel}
        </span>
      </div>

      {/* Quick Actions */}
      <div className="flex flex-col md:flex-row gap-4 justify-center mb-8">
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
                {generatingReport ? 'Generando...' : 'Descargar Reporte'}
              </h2>
              <p className="text-gray-600 text-sm">PDF con toda la información</p>
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
      <div className="card mb-6">
        <h3 className="text-lg font-semibold text-gray-800 mb-4">Resumen de Inventario</h3>
        <div className="grid grid-cols-3 md:grid-cols-6 gap-3">
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
            <div className="text-gray-600 text-xs">Lavado</div>
          </div>
          <div className="text-center p-2 bg-purple-50 rounded-lg">
            <Sparkles className="w-5 h-5 text-purple-600 mx-auto mb-1" />
            <div className="text-xl font-bold text-purple-600">
              {loading ? '...' : stats.esterilizacion}
            </div>
            <div className="text-gray-600 text-xs truncate">Esterilización</div>
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
    </div>
  )
}

export default Home
