import { useState, useRef, useEffect } from 'react'
import { Html5Qrcode, Html5QrcodeSupportedFormats } from 'html5-qrcode'
import { Camera, X, StopCircle } from 'lucide-react'

interface BarcodeScannerProps {
  onScan: (code: string) => void
  onClose: () => void
}

const BarcodeScanner = ({ onScan, onClose }: BarcodeScannerProps) => {
  const [isScanning, setIsScanning] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const scannerRef = useRef<Html5Qrcode | null>(null)
  const containerRef = useRef<string>(`qr-reader-${Date.now()}`)

  // Formatos de código de barras soportados
  const formatsToSupport = [
    Html5QrcodeSupportedFormats.QR_CODE,
    Html5QrcodeSupportedFormats.EAN_13,
    Html5QrcodeSupportedFormats.EAN_8,
    Html5QrcodeSupportedFormats.CODE_128,
    Html5QrcodeSupportedFormats.CODE_39,
    Html5QrcodeSupportedFormats.CODE_93,
    Html5QrcodeSupportedFormats.UPC_A,
    Html5QrcodeSupportedFormats.UPC_E,
    Html5QrcodeSupportedFormats.ITF,
    Html5QrcodeSupportedFormats.CODABAR,
  ]

  useEffect(() => {
    startScanner()
    return () => {
      stopScanner()
    }
  }, [])

  const startScanner = async () => {
    try {
      setError(null)
      const html5QrCode = new Html5Qrcode(containerRef.current, {
        formatsToSupport: formatsToSupport,
        verbose: false
      })
      scannerRef.current = html5QrCode

      await html5QrCode.start(
        { facingMode: 'environment' },
        {
          fps: 15,
          qrbox: { width: 280, height: 120 },
          aspectRatio: 1.777778,
        },
        (decodedText) => {
          onScan(decodedText)
          stopScanner()
          onClose()
        },
        () => {
          // Error silencioso durante escaneo
        }
      )
      setIsScanning(true)
    } catch (err: any) {
      console.error('Error al iniciar escáner:', err)
      setError('No se pudo acceder a la cámara. Verifica los permisos.')
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

  const handleClose = () => {
    stopScanner()
    onClose()
  }

  return (
    <div className="fixed inset-0 bg-black/70 flex items-center justify-center z-50 p-4">
      <div className="bg-white rounded-xl w-full max-w-md overflow-hidden">
        <div className="flex items-center justify-between p-4 border-b">
          <h3 className="font-semibold text-gray-800 flex items-center gap-2">
            <Camera className="w-5 h-5" />
            Escanear Código
          </h3>
          <button
            onClick={handleClose}
            className="p-1 hover:bg-gray-100 rounded-lg transition-colors"
          >
            <X className="w-5 h-5" />
          </button>
        </div>

        <div className="p-4">
          {error ? (
            <div className="text-center py-8">
              <p className="text-red-600 mb-4">{error}</p>
              <button onClick={startScanner} className="btn-primary">
                Reintentar
              </button>
            </div>
          ) : (
            <>
              <div
                id={containerRef.current}
                className="w-full bg-gray-100 rounded-lg overflow-hidden min-h-[250px]"
              />
              <p className="text-center text-sm text-gray-500 mt-3">
                Apunta la cámara al código de barras
              </p>
            </>
          )}
        </div>

        <div className="p-4 border-t">
          {isScanning && (
            <button
              onClick={handleClose}
              className="btn-secondary w-full flex items-center justify-center gap-2"
            >
              <StopCircle className="w-5 h-5" />
              Cancelar
            </button>
          )}
        </div>
      </div>
    </div>
  )
}

export default BarcodeScanner
