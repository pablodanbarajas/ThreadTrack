import { useState, useRef, useEffect } from 'react'
import { Html5Qrcode, Html5QrcodeSupportedFormats } from 'html5-qrcode'
import { Camera, X, StopCircle, FlipHorizontal } from 'lucide-react'

interface BarcodeScannerProps {
  onScan: (code: string) => void
  onClose: () => void
}

const BarcodeScanner = ({ onScan, onClose }: BarcodeScannerProps) => {
  const [isScanning, setIsScanning] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [useBackCamera, setUseBackCamera] = useState(true)
  const [lastCode, setLastCode] = useState<string | null>(null)
  const scannerRef = useRef<Html5Qrcode | null>(null)
  const containerRef = useRef<string>(`qr-reader-${Date.now()}`)

  // Solo CODE_128 para máxima precisión
  const formatsToSupport = [Html5QrcodeSupportedFormats.CODE_128]

  useEffect(() => {
    startScanner()
    return () => {
      stopScanner()
    }
  }, [])

  const startScanner = async () => {
    try {
      setError(null)
      
      // Limpiar instancia anterior si existe
      if (scannerRef.current) {
        try {
          await scannerRef.current.stop()
        } catch {}
        scannerRef.current = null
      }

      const html5QrCode = new Html5Qrcode(containerRef.current, {
        formatsToSupport: formatsToSupport,
        verbose: true // Activar verbose para debugging
      })
      scannerRef.current = html5QrCode

      const config = {
        fps: 30, // Máxima frecuencia de escaneo
        qrbox: { width: 350, height: 180 }, // Área de escaneo aún más grande
        aspectRatio: 1.5,
        disableFlip: false, // Permitir flip para mejor detección
      }

      await html5QrCode.start(
        { facingMode: useBackCamera ? 'environment' : 'user' },
        config,
        (decodedText) => {
          setLastCode(decodedText)
          setTimeout(() => {
            onScan(decodedText)
            stopScanner()
            onClose()
          }, 500)
        },
        () => {
          // Callback silencioso mientras busca
        }
      )
      setIsScanning(true)
    } catch (err: any) {
      console.error('Error al iniciar escáner:', err)
      setError(`No se pudo acceder a la cámara: ${err.message || 'Verifica los permisos'}`)
    }
  }

  const switchCamera = async () => {
    await stopScanner()
    setUseBackCamera(!useBackCamera)
    setTimeout(() => {
      startScanner()
    }, 300)
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
          <div className="flex items-center gap-2">
            <button
              onClick={switchCamera}
              className="p-2 hover:bg-gray-100 rounded-lg transition-colors"
              title="Cambiar cámara"
            >
              <FlipHorizontal className="w-5 h-5" />
            </button>
            <button
              onClick={handleClose}
              className="p-2 hover:bg-gray-100 rounded-lg transition-colors"
            >
              <X className="w-5 h-5" />
            </button>
          </div>
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
                className="w-full bg-gray-900 rounded-lg overflow-hidden min-h-[300px]"
              />
              <div className="mt-3 space-y-1">
                <p className="text-center text-sm text-gray-600 font-medium">
                  📷 Coloca el código dentro del recuadro
                </p>
                <p className="text-center text-xs text-gray-400">
                  Mantén el código estable y bien iluminado
                </p>
                {lastCode && (
                  <div className="text-center text-xs text-green-700 bg-green-100 rounded px-2 py-1 mt-2">
                    <span className="font-mono">Detectado: {lastCode}</span>
                  </div>
                )}
              </div>
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
