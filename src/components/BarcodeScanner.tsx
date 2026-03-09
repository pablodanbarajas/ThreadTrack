import { useState, useRef, useEffect } from 'react'
import { Html5Qrcode, Html5QrcodeSupportedFormats } from 'html5-qrcode'
import { Camera, X, StopCircle, FlipHorizontal } from 'lucide-react'

interface BarcodeScannerProps {
  onScan: (code: string) => void
  onClose: () => void
  mode?: 'auto' | 'barcode' | 'qr' // 'auto' detecta ambos
}

const BarcodeScanner = ({ onScan, onClose, mode = 'auto' }: BarcodeScannerProps) => {
  const [isScanning, setIsScanning] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [useBackCamera, setUseBackCamera] = useState(true)
  const [lastCode, setLastCode] = useState<string | null>(null)
  const [scanType, setScanType] = useState<string>('')
  const scannerRef = useRef<Html5Qrcode | null>(null)
  const containerRef = useRef<string>(`qr-reader-${Date.now()}`)

  // Determinar formatos según el modo
  const formatsToSupport = 
    mode === 'barcode' ? [Html5QrcodeSupportedFormats.CODE_128] :
    mode === 'qr' ? [Html5QrcodeSupportedFormats.QR_CODE] :
    [Html5QrcodeSupportedFormats.CODE_128, Html5QrcodeSupportedFormats.QR_CODE]

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

      // Solicitar permiso de cámara explícitamente primero
      try {
        const stream = await navigator.mediaDevices.getUserMedia({
          video: { facingMode: useBackCamera ? 'environment' : 'user' }
        })
        // Detener el stream de prueba
        stream.getTracks().forEach(track => track.stop())
      } catch (permissionError: any) {
        if (permissionError.name === 'NotAllowedError') {
          setError('Permiso denegado: Necesitas autorizar el acceso a la cámara en los ajustes del navegador.')
        } else if (permissionError.name === 'NotFoundError') {
          setError('No se encontró cámara en tu dispositivo. Conecta una webcam.')
        } else {
          setError(`No se puede acceder a la cámara: ${permissionError.message || 'Verifica los permisos'}`)
        }
        return
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
          setScanType('detectado')
          
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
            <div className="text-center py-8 space-y-3">
              <div className="text-4xl">📷</div>
              <p className="text-red-600 font-medium text-sm">{error}</p>
              <div className="bg-blue-50 border border-blue-200 rounded-lg p-3 text-left text-xs text-gray-700 space-y-1">
                <p className="font-semibold text-blue-900">Soluciones:</p>
                <ul className="list-disc list-inside space-y-1">
                  <li>Verifica que hayas permitido el acceso a la cámara en el navegador</li>
                  <li>En Chrome/Edge: Click en el icono del candado en la URL y habilita la cámara</li>
                  <li>Conecta una webcam si estás en desktop</li>
                  <li>Cierra otras aplicaciones que usen la cámara</li>
                </ul>
              </div>
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
                  📷 {mode === 'qr' ? 'Apunta el QR' : mode === 'barcode' ? 'Apunta el código de barras' : 'Apunta un código QR o código de barras'}
                </p>
                <p className="text-center text-xs text-gray-400">
                  Mantén el código estable y bien iluminado
                </p>
                {lastCode && (
                  <div className="text-center text-xs bg-green-100 rounded px-2 py-2 mt-2">
                    <p className="text-green-700 font-semibold">✓ Detectado</p>
                    <p className="text-green-600 font-mono text-xs mt-1 break-all">{lastCode}</p>
                    {scanType && <p className="text-green-500 text-xs mt-1">Tipo: {scanType}</p>}
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
