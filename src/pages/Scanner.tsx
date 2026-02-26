import { useState, useRef, useEffect } from 'react'
import { ScanBarcode, Camera, ClipboardList, Lightbulb, AlertCircle, Loader, File, ArrowRight, Download, Copy, X } from 'lucide-react'
import QRCode from 'qrcode.react'
import BarcodeScanner from '../components/BarcodeScanner'
import { garmentService } from '../services/garmentService'
import { documentService } from '../services/documentService'
import { extractGarmentId, generateQRUrl } from '../lib/qrGenerator'
import type { Garment, Document, Movement } from '../types'

const Scanner = () => {
  const [manualCode, setManualCode] = useState<string>('')
  const [showScanner, setShowScanner] = useState(false)
  const [scanHistory, setScanHistory] = useState<string[]>([])
  const [selectedGarment, setSelectedGarment] = useState<Garment | null>(null)
  const [documents, setDocuments] = useState<Document[]>([])
  const [movements, setMovements] = useState<Movement[]>([])
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [showQRModal, setShowQRModal] = useState(false)
  const [copiedQR, setCopiedQR] = useState(false)
  const qrRef = useRef<HTMLDivElement>(null)
  const inputRef = useRef<HTMLInputElement>(null)

  // Auto-focus en input para pistola escáner
  useEffect(() => {
    if (inputRef.current && !showScanner) {
      inputRef.current.focus()
    }
  }, [showScanner])

  const handleCodeScanned = async (code: string) => {
    setError(null)
    setScanHistory((prev) => [code, ...prev.slice(0, 9)])
    await loadGarmentData(code)
  }

  const loadGarmentData = async (code: string) => {
    setLoading(true)
    setError(null)
    
    try {
      // Intenta extraer el ID de la prenda desde el QR
      const garmentId = extractGarmentId(code)
      
      let garment: Garment | null = null

      if (garmentId) {
        // Es un QR válido, buscar por ID
        garment = await garmentService.getById(garmentId)
      } else {
        // Es un código de barras, buscar por código
        garment = await garmentService.getByCode(code)
      }

      if (!garment) {
        setError(`Prenda no encontrada: ${code}`)
        setSelectedGarment(null)
        setDocuments([])
        setMovements([])
        return
      }

      setSelectedGarment(garment)

      // Cargar documentos asociados
      const docs = await documentService.getByGarmentId(garment.id)
      setDocuments(docs)

      // TODO: Cargar movimientos cuando la tabla exista
      // const moves = await movementService.getByGarmentId(garment.id)
      // setMovements(moves)
    } catch (err: any) {
      console.error('Error cargando datos:', err)
      setError(err.message || 'Error al cargar los datos de la prenda')
      setSelectedGarment(null)
    } finally {
      setLoading(false)
    }
  }

  const handleManualSubmit = (e: React.FormEvent) => {
    e.preventDefault()
    if (manualCode.trim()) {
      handleCodeScanned(manualCode.trim())
      setManualCode('')
    }
  }

  const handleKeyDown = (e: React.KeyboardEvent<HTMLInputElement>) => {
    if (e.key === 'Enter' && manualCode.trim()) {
      handleCodeScanned(manualCode.trim())
      setManualCode('')
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

  return (
    <div className="max-w-4xl mx-auto pb-20 md:pb-0">
      <div className="flex items-center gap-3 mb-6">
        <ScanBarcode className="w-8 h-8 text-blue-600" />
        <h1 className="text-2xl font-bold text-gray-800">Escáner QR / Códigos</h1>
      </div>

      {/* Input Manual / Pistola Escáner */}
      <div className="card mb-6">
        <h2 className="text-lg font-semibold text-gray-700 mb-4">
          Entrada Manual / Pistola Escáner
        </h2>
        <form onSubmit={handleManualSubmit} className="flex gap-2">
          <input
            ref={inputRef}
            type="text"
            value={manualCode}
            onChange={(e) => setManualCode(e.target.value)}
            onKeyDown={handleKeyDown}
            placeholder="Escanea un QR o código de barras..."
            className="input-field flex-1"
            autoFocus
            disabled={loading}
          />
          <button
            type="submit"
            className="btn-primary"
            disabled={loading}
          >
            {loading ? <Loader className="w-5 h-5 animate-spin" /> : 'Escanear'}
          </button>
        </form>
        <p className="text-sm text-gray-500 mt-2 flex items-center gap-1">
          <Lightbulb className="w-4 h-4" /> La pistola escáner enviará el código automáticamente
        </p>
      </div>

      {/* Camera Scanner */}
      <div className="card mb-6">
        <h2 className="text-lg font-semibold text-gray-700 mb-4">
          Cámara del Dispositivo
        </h2>
        {!showScanner ? (
          <button
            onClick={() => setShowScanner(true)}
            className="btn-primary w-full flex items-center justify-center gap-2"
          >
            <Camera className="w-5 h-5" /> Abrir Cámara
          </button>
        ) : (
          <button
            onClick={() => setShowScanner(false)}
            className="btn-secondary w-full"
          >
            Cerrar Cámara
          </button>
        )}
      </div>

      {showScanner && (
        <BarcodeScanner
          onScan={handleCodeScanned}
          onClose={() => setShowScanner(false)}
          mode="auto"
        />
      )}

      {/* Error Message */}
      {error && (
        <div className="card mb-6 bg-red-50 border border-red-200">
          <div className="flex items-start gap-3">
            <AlertCircle className="w-5 h-5 text-red-600 mt-0.5 flex-shrink-0" />
            <div>
              <h3 className="font-semibold text-red-800">Error</h3>
              <p className="text-sm text-red-700 mt-1">{error}</p>
            </div>
          </div>
        </div>
      )}

      {/* Garment Details */}
      {selectedGarment && !loading && (
        <div className="space-y-4">
          {/* Información General */}
          <div className="card">
            <div className="flex items-start justify-between mb-4">
              <div>
                <h2 className="text-2xl font-bold text-gray-800">{selectedGarment.name}</h2>
                <p className="text-sm text-gray-500 mt-1">ID: {selectedGarment.id}</p>
              </div>
              <span className={`px-3 py-1 rounded-full text-sm font-semibold ${getStatusColor(selectedGarment.status)}`}>
                {selectedGarment.status.charAt(0).toUpperCase() + selectedGarment.status.slice(1)}
              </span>
            </div>

            <div className="grid md:grid-cols-2 gap-4">
              {selectedGarment.description && (
                <div>
                  <p className="text-sm text-gray-600 font-medium">Descripción</p>
                  <p className="text-gray-800">{selectedGarment.description}</p>
                </div>
              )}
              <div>
                <p className="text-sm text-gray-600 font-medium">Código</p>
                <p className="text-gray-800 font-mono">{selectedGarment.code}</p>
              </div>
              {selectedGarment.client_name && (
                <div>
                  <p className="text-sm text-gray-600 font-medium">Cliente</p>
                  <p className="text-gray-800">{selectedGarment.client_name}</p>
                </div>
              )}
              {selectedGarment.client_phone && (
                <div>
                  <p className="text-sm text-gray-600 font-medium">Teléfono</p>
                  <p className="text-gray-800">{selectedGarment.client_phone}</p>
                </div>
              )}
              {selectedGarment.notes && (
                <div className="md:col-span-2">
                  <p className="text-sm text-gray-600 font-medium">Notas</p>
                  <p className="text-gray-800">{selectedGarment.notes}</p>
                </div>
              )}
            </div>

            <div className="mt-4 pt-4 border-t space-y-1 text-xs text-gray-500">
              <p>Creado: {new Date(selectedGarment.created_at).toLocaleString()}</p>
              <p>Actualizado: {new Date(selectedGarment.updated_at).toLocaleString()}</p>
            </div>

            <button
              onClick={() => setShowQRModal(true)}
              className="btn-outline w-full mt-4 flex items-center justify-center gap-2"
            >
              <ScanBarcode className="w-5 h-5" />
              Ver / Descargar QR
            </button>
          </div>

          {/* Documentos */}
          {documents.length > 0 && (
            <div className="card">
              <div className="flex items-center gap-2 mb-4">
                <File className="w-5 h-5 text-gray-600" />
                <h3 className="font-semibold text-gray-700">Documentos ({documents.length})</h3>
              </div>
              <div className="space-y-2">
                {documents.map((doc) => (
                  <a
                    key={doc.id}
                    href={doc.url}
                    target="_blank"
                    rel="noopener noreferrer"
                    className="flex items-center justify-between p-3 bg-gray-50 hover:bg-gray-100 rounded-lg transition-colors"
                  >
                    <div>
                      <p className="text-sm font-medium text-gray-800">{doc.file_name || `Documento (${doc.type})`}</p>
                      <p className="text-xs text-gray-500">{new Date(doc.created_at).toLocaleDateString()}</p>
                    </div>
                    <ArrowRight className="w-4 h-4 text-gray-400" />
                  </a>
                ))}
              </div>
            </div>
          )}

          {/* Movimientos */}
          {movements.length > 0 && (
            <div className="card">
              <div className="flex items-center gap-2 mb-4">
                <ClipboardList className="w-5 h-5 text-gray-600" />
                <h3 className="font-semibold text-gray-700">Historial de Movimientos ({movements.length})</h3>
              </div>
              <div className="space-y-2">
                {movements.map((move, idx) => (
                  <div key={idx} className="flex items-center gap-3 p-3 bg-gray-50 rounded-lg">
                    <div className="flex-1">
                      <p className="text-sm font-medium text-gray-800">
                        {move.previous_status} <ArrowRight className="w-3 h-3 inline" /> {move.new_status}
                      </p>
                      <p className="text-xs text-gray-500">{new Date(move.created_at).toLocaleString()}</p>
                    </div>
                  </div>
                ))}
              </div>
            </div>
          )}
        </div>
      )}

      {/* Loading State */}
      {loading && (
        <div className="card flex items-center justify-center py-8">
          <Loader className="w-8 h-8 text-blue-600 animate-spin" />
        </div>
      )}

      {/* Scan History */}
      {scanHistory.length > 0 && !selectedGarment && (
        <div className="card">
          <div className="flex items-center gap-2 mb-4">
            <ClipboardList className="w-5 h-5 text-gray-600" />
            <h2 className="text-lg font-semibold text-gray-700">
              Historial de Escaneos
            </h2>
          </div>
          <ul className="space-y-2">
            {scanHistory.map((code, index) => (
              <li
                key={index}
                className="flex items-center justify-between p-3 bg-gray-50 hover:bg-gray-100 rounded-lg cursor-pointer transition-colors"
                onClick={() => handleCodeScanned(code)}
              >
                <span className="font-mono text-sm">{code}</span>
                <span className="text-sm text-gray-500">
                  #{scanHistory.length - index}
                </span>
              </li>
            ))}
          </ul>
        </div>
      )}

      {/* QR Modal */}
      {showQRModal && selectedGarment && (
        <div className="fixed inset-0 bg-black/50 flex items-center justify-center z-50 p-4">
          <div className="bg-white rounded-xl max-w-md w-full overflow-hidden">
            {/* Header */}
            <div className="flex items-center justify-between p-4 border-b">
              <h3 className="font-semibold text-gray-800">QR de {selectedGarment.name}</h3>
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

export default Scanner
