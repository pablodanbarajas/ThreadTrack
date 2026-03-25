import { useState, useRef, useEffect } from 'react'
import { Html5Qrcode, Html5QrcodeSupportedFormats } from 'html5-qrcode'
import { Camera, X, FlipHorizontal, CheckCircle2, Flashlight, ZoomIn } from 'lucide-react'

interface BarcodeScannerProps {
  onScan: (code: string) => void
  onClose: () => void
  mode?: 'auto' | 'barcode' | 'qr'
  continuous?: boolean
}

const BarcodeScanner = ({ onScan, onClose, mode = 'auto', continuous = false }: BarcodeScannerProps) => {
  const [error, setError] = useState<string | null>(null)
  const [useBackCamera, setUseBackCamera] = useState(true)
  const [lastCode, setLastCode] = useState<string | null>(null)
  const [scanCount, setScanCount] = useState(0)
  const [hasTorch, setHasTorch] = useState(false)
  const [torchOn, setTorchOn] = useState(false)
  const [hasZoom, setHasZoom] = useState(false)
  const [zoom, setZoom] = useState(1)
  const [maxZoom, setMaxZoom] = useState(5)
  const scannerRef = useRef<Html5Qrcode | null>(null)
  const containerRef = useRef<string>(`qr-reader-${Date.now()}`)
  const lastScannedRef = useRef<string | null>(null)

  const playBeep = () => {
    try {
      const ctx = new (window.AudioContext || (window as any).webkitAudioContext)()
      const osc = ctx.createOscillator()
      const gain = ctx.createGain()
      osc.connect(gain)
      gain.connect(ctx.destination)
      osc.frequency.value = 1200
      osc.type = 'square'
      gain.gain.setValueAtTime(0.3, ctx.currentTime)
      gain.gain.exponentialRampToValueAtTime(0.001, ctx.currentTime + 0.12)
      osc.start(ctx.currentTime)
      osc.stop(ctx.currentTime + 0.12)
    } catch {}
  }

  const formatsToSupport =
    mode === 'barcode' ? [Html5QrcodeSupportedFormats.CODE_128] :
    mode === 'qr' ? [Html5QrcodeSupportedFormats.QR_CODE] :
    [Html5QrcodeSupportedFormats.CODE_128, Html5QrcodeSupportedFormats.QR_CODE]

  useEffect(() => {
    startScanner()
    const prev = document.body.style.overflow
    document.body.style.overflow = 'hidden'
    return () => {
      stopScanner()
      document.body.style.overflow = prev
    }
  }, [])

  const startScanner = async () => {
    try {
      setError(null)
      setHasTorch(false)
      setTorchOn(false)
      setHasZoom(false)
      setZoom(1)

      if (scannerRef.current) {
        try { await scannerRef.current.stop() } catch {}
        scannerRef.current = null
      }

      // Solicitar permiso con restricciones de alta calidad para mejor lectura
      try {
        const stream = await navigator.mediaDevices.getUserMedia({
          video: {
            facingMode: useBackCamera ? 'environment' : 'user',
            width: { ideal: 1920 },
            height: { ideal: 1080 },
          }
        })
        stream.getTracks().forEach(track => track.stop())
      } catch (permissionError: any) {
        if (permissionError.name === 'NotAllowedError') {
          setError('Permiso denegado: Necesitas autorizar el acceso a la cÃ¡mara en los ajustes del navegador.')
        } else if (permissionError.name === 'NotFoundError') {
          setError('No se encontrÃ³ cÃ¡mara en tu dispositivo.')
        } else {
          setError(`No se puede acceder a la cÃ¡mara: ${permissionError.message || 'Verifica los permisos'}`)
        }
        return
      }

      const html5QrCode = new Html5Qrcode(containerRef.current, {
        formatsToSupport,
        verbose: false,
        // Usa la API nativa BarcodeDetector del navegador si estÃ¡ disponible (Chrome/Edge)
        // Es 3-5x mÃ¡s rÃ¡pida que el decodificador WASM
        experimentalFeatures: { useBarCodeDetectorIfSupported: true },
      } as any)
      scannerRef.current = html5QrCode

      await html5QrCode.start(
        // MediaTrackConstraints: facingMode + alta resolución + autofocus continuo
        {
          facingMode: useBackCamera ? 'environment' : 'user',
          width: { ideal: 1920 },
          height: { ideal: 1080 },
          advanced: [{ focusMode: 'continuous' }],
        } as any,
        {
          fps: 30,
          qrbox: { width: 320, height: 320 },
          aspectRatio: 1.0,
          disableFlip: false,
        },
        (decodedText) => {
          if (continuous) {
            if (lastScannedRef.current === decodedText) return
            lastScannedRef.current = decodedText
            setTimeout(() => { lastScannedRef.current = null }, 800)
            playBeep()
            setLastCode(decodedText)
            setScanCount(prev => prev + 1)
            onScan(decodedText)
          } else {
            setLastCode(decodedText)
            setTimeout(() => {
              onScan(decodedText)
              stopScanner()
              onClose()
            }, 400)
          }
        },
        () => {}
      )

      // Detectar capacidades de linterna y zoom despuÃ©s de arrancar
      try {
        const caps = html5QrCode.getRunningTrackCapabilities() as any
        if (caps?.torch) setHasTorch(true)
        if (caps?.zoom) {
          setHasZoom(true)
          setMaxZoom(caps.zoom.max ?? 5)
        }
      } catch {}

    } catch (err: any) {
      setError(`No se pudo acceder a la cÃ¡mara: ${err.message || 'Verifica los permisos'}`)
    }
  }

  const switchCamera = async () => {
    await stopScanner()
    setUseBackCamera(prev => !prev)
    setTimeout(() => startScanner(), 300)
  }

  const toggleTorch = async () => {
    if (!scannerRef.current) return
    try {
      const next = !torchOn
      await scannerRef.current.applyVideoConstraints({ advanced: [{ torch: next } as any] })
      setTorchOn(next)
    } catch {}
  }

  const handleZoomChange = async (value: number) => {
    setZoom(value)
    if (!scannerRef.current) return
    try {
      await scannerRef.current.applyVideoConstraints({ advanced: [{ zoom: value } as any] })
    } catch {}
  }

  const stopScanner = async () => {
    if (scannerRef.current) {
      try { await scannerRef.current.stop() } catch {}
      scannerRef.current = null
    }
  }

  const handleClose = () => {
    stopScanner()
    onClose()
  }

  return (
    <div className="fixed inset-0 bg-black/70 flex items-center justify-center z-50 p-4">
      <div className="bg-white rounded-xl w-full max-w-md overflow-hidden flex flex-col">
        {/* Header */}
        <div className="flex items-center justify-between px-4 py-3 border-b shrink-0">
          <h3 className="font-semibold text-gray-800 flex items-center gap-2">
            <Camera className="w-5 h-5" />
            Escanear CÃ³digo
            {continuous && scanCount > 0 && (
              <span className="ml-1 bg-green-600 text-white text-xs px-2 py-0.5 rounded-full">
                {scanCount} leÃ­dos
              </span>
            )}
          </h3>
          <div className="flex items-center gap-1">
            {hasTorch && (
              <button
                onClick={toggleTorch}
                className={`p-2 rounded-lg transition-colors ${torchOn ? 'bg-yellow-100 text-yellow-600' : 'hover:bg-gray-100 text-gray-500'}`}
                title={torchOn ? 'Apagar linterna' : 'Encender linterna'}
              >
                <Flashlight className="w-5 h-5" />
              </button>
            )}
            <button
              onClick={switchCamera}
              className="p-2 hover:bg-gray-100 rounded-lg transition-colors"
              title="Cambiar cÃ¡mara"
            >
              <FlipHorizontal className="w-5 h-5" />
            </button>
          </div>
        </div>

        {/* Camera / error area */}
        <div className="p-4 shrink-0">
          {error ? (
            <div className="text-center py-8 space-y-3">
              <div className="text-4xl">ðŸ“·</div>
              <p className="text-red-600 font-medium text-sm">{error}</p>
              <div className="bg-blue-50 border border-blue-200 rounded-lg p-3 text-left text-xs text-gray-700 space-y-1">
                <p className="font-semibold text-blue-900">Soluciones:</p>
                <ul className="list-disc list-inside space-y-1">
                  <li>Verifica que hayas permitido el acceso a la cÃ¡mara en el navegador</li>
                  <li>En Chrome/Edge: Click en el icono del candado en la URL y habilita la cÃ¡mara</li>
                  <li>Cierra otras aplicaciones que usen la cÃ¡mara</li>
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
                className="w-full bg-gray-900 rounded-lg overflow-hidden min-h-[280px]"
              />

              {/* Zoom slider */}
              {hasZoom && (
                <div className="mt-3 flex items-center gap-2">
                  <ZoomIn className="w-4 h-4 text-gray-400 shrink-0" />
                  <input
                    type="range"
                    min={1}
                    max={maxZoom}
                    step={0.1}
                    value={zoom}
                    onChange={e => handleZoomChange(parseFloat(e.target.value))}
                    className="flex-1 accent-blue-600"
                  />
                  <span className="text-xs text-gray-500 w-8 text-right">{zoom.toFixed(1)}Ã—</span>
                </div>
              )}

              {/* Status bar */}
              <div className="h-14 mt-2 flex items-center justify-center">
                {lastCode ? (
                  <div className="w-full text-center px-2 py-1.5 bg-green-100 rounded-lg">
                    <p className="text-green-700 text-xs font-semibold truncate">âœ“ {lastCode}</p>
                    <p className="text-green-500 text-xs">
                      {mode === 'qr' ? 'QR detectado' : 'CÃ³digo detectado'}
                    </p>
                  </div>
                ) : (
                  <p className="text-center text-sm text-gray-400">
                    ðŸ“· {mode === 'qr' ? 'Apunta el QR al cuadro' : mode === 'barcode' ? 'Apunta el cÃ³digo de barras' : 'Apunta el QR o cÃ³digo de barras'}
                  </p>
                )}
              </div>
            </>
          )}
        </div>

        {/* Footer */}
        <div className="px-4 pb-4 shrink-0">
          <button
            onClick={handleClose}
            className="w-full flex items-center justify-center gap-2 px-4 py-3 rounded-xl font-semibold text-sm transition-colors bg-indigo-600 hover:bg-indigo-700 text-white"
          >
            {continuous ? (
              <><CheckCircle2 className="w-5 h-5" /> Listo â€” cerrar cÃ¡mara</>
            ) : (
              <><X className="w-5 h-5" /> Cancelar</>
            )}
          </button>
        </div>
      </div>
    </div>
  )
}

export default BarcodeScanner
