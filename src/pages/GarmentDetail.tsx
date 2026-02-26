import { useState, useEffect } from 'react'
import { useParams, Link, Navigate } from 'react-router-dom'
import { Loader, AlertCircle, Home, Download, Copy, ArrowLeft } from 'lucide-react'
import QRCode from 'qrcode.react'
import { garmentService } from '../services/garmentService'
import { documentService } from '../services/documentService'
import { generateQRUrl } from '../lib/qrGenerator'
import type { Garment, Document } from '../types'

const GarmentDetail = () => {
  const { id } = useParams<{ id: string }>()
  const [garment, setGarment] = useState<Garment | null>(null)
  const [documents, setDocuments] = useState<Document[]>([])
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)
  const [copied, setCopied] = useState(false)

  useEffect(() => {
    loadGarmentData()
  }, [id])

  const loadGarmentData = async () => {
    if (!id) {
      setError('ID de prenda no válido')
      setLoading(false)
      return
    }

    try {
      setLoading(true)
      setError(null)

      // Obtener prenda
      const foundGarment = await garmentService.getById(id)
      if (!foundGarment) {
        setError('Prenda no encontrada')
        setLoading(false)
        return
      }

      setGarment(foundGarment)

      // Obtener documentos
      const docs = await documentService.getByGarmentId(id)
      setDocuments(docs)
    } catch (err: any) {
      console.error('Error:', err)
      setError(err.message || 'Error al cargar la prenda')
    } finally {
      setLoading(false)
    }
  }

  const getStatusColor = (status: string) => {
    const colors: Record<string, string> = {
      disponible: 'bg-green-100 text-green-800',
      lavado: 'bg-blue-100 text-blue-800',
      esterilizacion: 'bg-purple-100 text-purple-800',
      inspeccion: 'bg-yellow-100 text-yellow-800',
      reparacion: 'bg-orange-100 text-orange-800',
      baja: 'bg-red-100 text-red-800',
    }
    return colors[status] || 'bg-gray-100 text-gray-800'
  }

  const copyQRUrl = () => {
    if (!garment) return
    const url = generateQRUrl(garment.id)
    navigator.clipboard.writeText(url)
    setCopied(true)
    setTimeout(() => setCopied(false), 2000)
  }

  const downloadQR = () => {
    if (!garment) return
    const canvas = document.querySelector('canvas')
    if (!canvas) return

    const link = document.createElement('a')
    link.href = canvas.toDataURL('image/png')
    link.download = `qr-${garment.code}.png`
    document.body.appendChild(link)
    link.click()
    document.body.removeChild(link)
  }

  if (loading) {
    return (
      <div className="min-h-screen flex items-center justify-center bg-gradient-to-br from-blue-50 to-indigo-100">
        <div className="text-center">
          <Loader className="w-12 h-12 text-blue-600 animate-spin mx-auto mb-4" />
          <p className="text-gray-600">Cargando prenda...</p>
        </div>
      </div>
    )
  }

  if (error || !garment) {
    return (
      <div className="min-h-screen flex items-center justify-center bg-gradient-to-br from-blue-50 to-indigo-100 p-4">
        <div className="bg-white rounded-xl shadow-lg p-8 max-w-md w-full">
          <div className="flex items-center gap-3 mb-4">
            <AlertCircle className="w-6 h-6 text-red-600" />
            <h1 className="text-xl font-bold text-gray-800">Error</h1>
          </div>
          <p className="text-gray-600 mb-6">{error || 'Prenda no encontrada'}</p>
          <Link
            to="/"
            className="inline-flex items-center gap-2 px-4 py-2 bg-blue-600 text-white rounded-lg hover:bg-blue-700 transition-colors"
          >
            <Home className="w-5 h-5" />
            Ir al inicio
          </Link>
        </div>
      </div>
    )
  }

  return (
    <div className="min-h-screen bg-gradient-to-br from-blue-50 to-indigo-100 p-4">
      <div className="max-w-2xl mx-auto">
        {/* Header */}
        <div className="mb-6">
          <Link
            to="/"
            className="inline-flex items-center gap-2 text-blue-600 hover:text-blue-800 transition-colors mb-4"
          >
            <ArrowLeft className="w-5 h-5" />
            Volver
          </Link>
        </div>

        {/* Main Card */}
        <div className="bg-white rounded-xl shadow-lg overflow-hidden">
          {/* Header Section */}
          <div className="bg-gradient-to-r from-blue-600 to-indigo-600 text-white p-6">
            <div className="flex items-start justify-between">
              <div>
                <h1 className="text-3xl font-bold mb-2">{garment.name}</h1>
                <p className="text-blue-100">Código: <span className="font-mono">{garment.code}</span></p>
              </div>
              <span className={`px-4 py-2 rounded-full text-sm font-semibold ${getStatusColor(garment.status)}`}>
                {garment.status.charAt(0).toUpperCase() + garment.status.slice(1)}
              </span>
            </div>
          </div>

          {/* Content */}
          <div className="p-6 space-y-6">
            {/* QR Section */}
            <div className="flex flex-col items-center p-4 bg-gray-50 rounded-lg">
              <div className="mb-4">
                <QRCode
                  value={generateQRUrl(garment.id)}
                  size={150}
                  level="H"
                  includeMargin={true}
                />
              </div>
              <div className="space-y-2 w-full">
                <button
                  onClick={copyQRUrl}
                  className="w-full px-4 py-2 bg-blue-600 text-white rounded-lg hover:bg-blue-700 transition-colors flex items-center justify-center gap-2 text-sm"
                >
                  <Copy className="w-4 h-4" />
                  {copied ? 'URL Copiada!' : 'Copiar URL del QR'}
                </button>
                <button
                  onClick={downloadQR}
                  className="w-full px-4 py-2 bg-indigo-600 text-white rounded-lg hover:bg-indigo-700 transition-colors flex items-center justify-center gap-2 text-sm"
                >
                  <Download className="w-4 h-4" />
                  Descargar QR
                </button>
              </div>
            </div>

            {/* Details Grid */}
            <div className="grid md:grid-cols-2 gap-4">
              <div>
                <p className="text-sm font-medium text-gray-600 mb-1">ID de Prenda</p>
                <p className="text-gray-800 font-mono text-sm break-all">{garment.id}</p>
              </div>

              {garment.description && (
                <div>
                  <p className="text-sm font-medium text-gray-600 mb-1">Descripción</p>
                  <p className="text-gray-800">{garment.description}</p>
                </div>
              )}

              {garment.client_name && (
                <div>
                  <p className="text-sm font-medium text-gray-600 mb-1">Cliente</p>
                  <p className="text-gray-800">{garment.client_name}</p>
                </div>
              )}

              {garment.client_phone && (
                <div>
                  <p className="text-sm font-medium text-gray-600 mb-1">Teléfono</p>
                  <p className="text-gray-800">{garment.client_phone}</p>
                </div>
              )}

              {garment.notes && (
                <div className="md:col-span-2">
                  <p className="text-sm font-medium text-gray-600 mb-1">Notas</p>
                  <p className="text-gray-800">{garment.notes}</p>
                </div>
              )}
            </div>

            {/* Timestamps */}
            <div className="pt-4 border-t space-y-1 text-xs text-gray-500">
              <p>Creado: {new Date(garment.created_at).toLocaleString()}</p>
              <p>Actualizado: {new Date(garment.updated_at).toLocaleString()}</p>
            </div>

            {/* Documents */}
            {documents.length > 0 && (
              <div className="pt-4 border-t">
                <h2 className="font-semibold text-gray-800 mb-3">Documentos ({documents.length})</h2>
                <div className="space-y-2">
                  {documents.map((doc) => (
                    <a
                      key={doc.id}
                      href={doc.url}
                      target="_blank"
                      rel="noopener noreferrer"
                      className="block p-3 bg-gray-50 hover:bg-gray-100 rounded-lg transition-colors"
                    >
                      <p className="text-sm font-medium text-blue-600 hover:underline">
                        {doc.file_name || `Documento (${doc.type})`}
                      </p>
                      <p className="text-xs text-gray-500 mt-1">
                        {new Date(doc.created_at).toLocaleDateString()}
                      </p>
                    </a>
                  ))}
                </div>
              </div>
            )}
          </div>
        </div>

        {/* Footer */}
        <div className="mt-6 text-center text-sm text-gray-600">
          <p>ThreadTrack - Sistema de Rastreo de Prendas</p>
        </div>
      </div>
    </div>
  )
}

export default GarmentDetail
