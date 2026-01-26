import { useState, useEffect, useRef } from 'react'
import { Html5Qrcode } from 'html5-qrcode'
import { ScanBarcode, Camera, StopCircle, CheckCircle, ClipboardList, Lightbulb } from 'lucide-react'

const Scanner = () => {
  const [scannedCode, setScannedCode] = useState<string>('')
  const [manualCode, setManualCode] = useState<string>('')
  const [isScanning, setIsScanning] = useState(false)
  const [scanHistory, setScanHistory] = useState<string[]>([])
  const scannerRef = useRef<Html5Qrcode | null>(null)
  const inputRef = useRef<HTMLInputElement>(null)

  // Para pistola escáner en desktop
  useEffect(() => {
    if (inputRef.current) {
      inputRef.current.focus()
    }
  }, [])

  const startScanner = async () => {
    try {
      const html5QrCode = new Html5Qrcode('qr-reader')
      scannerRef.current = html5QrCode

      await html5QrCode.start(
        { facingMode: 'environment' },
        {
          fps: 10,
          qrbox: { width: 250, height: 250 },
        },
        (decodedText) => {
          handleCodeScanned(decodedText)
          stopScanner()
        },
        () => {
          // Error de escaneo silencioso
        }
      )
      setIsScanning(true)
    } catch (err) {
      console.error('Error al iniciar escáner:', err)
      alert('No se pudo acceder a la cámara. Verifica los permisos.')
    }
  }

  const stopScanner = async () => {
    if (scannerRef.current) {
      try {
        await scannerRef.current.stop()
        scannerRef.current = null
      } catch (err) {
        console.error('Error al detener escáner:', err)
      }
    }
    setIsScanning(false)
  }

  const handleCodeScanned = (code: string) => {
    setScannedCode(code)
    setScanHistory((prev) => [code, ...prev.slice(0, 9)])
  }

  const handleManualSubmit = (e: React.FormEvent) => {
    e.preventDefault()
    if (manualCode.trim()) {
      handleCodeScanned(manualCode.trim())
      setManualCode('')
    }
  }

  // Maneja entrada de pistola escáner (Enter automático)
  const handleKeyDown = (e: React.KeyboardEvent<HTMLInputElement>) => {
    if (e.key === 'Enter' && manualCode.trim()) {
      handleCodeScanned(manualCode.trim())
      setManualCode('')
    }
  }

  return (
    <div className="max-w-2xl mx-auto pb-20 md:pb-0">
      <div className="flex items-center gap-3 mb-6">
        <ScanBarcode className="w-8 h-8 text-blue-600" />
        <h1 className="text-2xl font-bold text-gray-800">Escáner de Códigos</h1>
      </div>

      {/* Manual Input / Scanner Gun */}
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
            placeholder="Escanea o escribe el código..."
            className="input-field flex-1"
            autoFocus
          />
          <button type="submit" className="btn-primary">
            Agregar
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

        <div
          id="qr-reader"
          className={`w-full bg-gray-100 rounded-lg overflow-hidden mb-4 ${
            isScanning ? 'min-h-[300px]' : 'hidden'
          }`}
        />

        {!isScanning ? (
          <button onClick={startScanner} className="btn-primary w-full flex items-center justify-center gap-2">
            <Camera className="w-5 h-5" /> Iniciar Cámara
          </button>
        ) : (
          <button onClick={stopScanner} className="btn-secondary w-full flex items-center justify-center gap-2">
            <StopCircle className="w-5 h-5" /> Detener Cámara
          </button>
        )}
      </div>

      {/* Last Scanned */}
      {scannedCode && (
        <div className="card mb-6 bg-green-50 border border-green-200">
          <div className="flex items-center gap-2 mb-2">
            <CheckCircle className="w-5 h-5 text-green-600" />
            <h2 className="text-lg font-semibold text-green-700">
              Último Código Escaneado
            </h2>
          </div>
          <p className="text-2xl font-mono text-green-800">{scannedCode}</p>
        </div>
      )}

      {/* Scan History */}
      {scanHistory.length > 0 && (
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
                className="flex items-center justify-between p-3 bg-gray-50 rounded-lg"
              >
                <span className="font-mono">{code}</span>
                <span className="text-sm text-gray-500">
                  #{scanHistory.length - index}
                </span>
              </li>
            ))}
          </ul>
        </div>
      )}
    </div>
  )
}

export default Scanner
