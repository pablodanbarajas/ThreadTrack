import { useState, useRef, useEffect } from 'react'
import { Html5Qrcode, Html5QrcodeSupportedFormats } from 'html5-qrcode'
import { Camera, X, FlipHorizontal, CheckCircle2, Flashlight, ZoomIn } from 'lucide-react'

interface BarcodeScannerProps {
  onScan: (code: string) => void
  onClose: () => void
  mode?: 'auto' | 'barcode' | 'qr'
  continuous?: boolean
  scanCount?: number  // controlled externally; if provided, overrides internal counter
}

const BarcodeScanner = ({ onScan, onClose, mode = 'auto', continuous = false, scanCount: externalScanCount }: BarcodeScannerProps) => {
  const [error, setError] = useState<string | null>(null)
  const [useBackCamera, setUseBackCamera] = useState(true)
  const [lastCode, setLastCode] = useState<string | null>(null)
  const [internalScanCount, setInternalScanCount] = useState(0)
  const scanCount = externalScanCount !== undefined ? externalScanCount : internalScanCount
  const [hasTorch, setHasTorch] = useState(false)
  const [torchOn, setTorchOn] = useState(false)
  const [hasZoom, setHasZoom] = useState(false)
  const [zoom, setZoom] = useState(1)
  const [maxZoom, setMaxZoom] = useState(5)
  const scannerRef = useRef<Html5Qrcode | null>(null)
  const containerRef = useRef<string>(`qr-reader-${Date.now()}`)
  const lastScannedRef = useRef<string | null>(null)
  const nativeDetectorRef = useRef<any>(null)
  const nativeScanLoopRef = useRef<ReturnType<typeof setTimeout> | null>(null)
  const nativeActiveRef = useRef(false)
  const nativeCanvasRef = useRef<HTMLCanvasElement | null>(null)

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

  const handleDecodedText = (decodedText: string) => {
    if (continuous) {
      if (lastScannedRef.current === decodedText) return
      lastScannedRef.current = decodedText
      setTimeout(() => { lastScannedRef.current = null }, 800)
      playBeep()
      setLastCode(decodedText)
      if (externalScanCount === undefined) setInternalScanCount(prev => prev + 1)
      onScan(decodedText)
    } else {
      setLastCode(decodedText)
      setTimeout(() => {
        onScan(decodedText)
        stopScanner()
        onClose()
      }, 400)
    }
  }

  const startNativeScanLoop = () => {
    const container = document.getElementById(containerRef.current)
    const video = container?.querySelector('video') as HTMLVideoElement | null
    if (!video || !nativeDetectorRef.current || !nativeActiveRef.current) return

    if (!nativeCanvasRef.current) {
      nativeCanvasRef.current = document.createElement('canvas')
    }
    const canvas = nativeCanvasRef.current

    const loop = async () => {
      if (!nativeActiveRef.current || !nativeDetectorRef.current) return
      if (video.readyState >= 2 && video.videoWidth > 0) {
        try {
          // Pase 1: frame completo (maximo detalle, maxima area)
          let results = await nativeDetectorRef.current.detect(video)

          if (results.length === 0) {
            // Pase 2: recortar y ampliar el centro al 60% del frame
            // Esto duplica efectivamente los pixeles de QRs pequeños centrados
            const ctx = canvas.getContext('2d')!
            canvas.width = video.videoWidth
            canvas.height = video.videoHeight
            const cropW = video.videoWidth * 0.6
            const cropH = video.videoHeight * 0.6
            const cropX = (video.videoWidth - cropW) / 2
            const cropY = (video.videoHeight - cropH) / 2
            ctx.drawImage(video, cropX, cropY, cropW, cropH, 0, 0, canvas.width, canvas.height)
            results = await nativeDetectorRef.current.detect(canvas)
          }

          if (results.length === 0) {
            // Pase 3: zoom aun mas agresivo al 35% central (QRs muy pequeños)
            const ctx = canvas.getContext('2d')!
            canvas.width = video.videoWidth
            canvas.height = video.videoHeight
            const cropW = video.videoWidth * 0.35
            const cropH = video.videoHeight * 0.35
            const cropX = (video.videoWidth - cropW) / 2
            const cropY = (video.videoHeight - cropH) / 2
            ctx.drawImage(video, cropX, cropY, cropW, cropH, 0, 0, canvas.width, canvas.height)
            results = await nativeDetectorRef.current.detect(canvas)
          }

          if (results.length > 0 && nativeActiveRef.current) {
            handleDecodedText(results[0].rawValue)
            if (!continuous) return
          }
        } catch {}
      }
      if (nativeActiveRef.current) {
        nativeScanLoopRef.current = setTimeout(loop, 100)
      }
    }
    loop()
  }

  useEffect(() => {
    startScanner()
    // Lock scroll - compatible con iOS y Android
    const scrollY = window.scrollY
    const prev = document.body.style.cssText
    document.body.style.cssText = `position: fixed; width: 100%; top: -${scrollY}px; overflow-y: scroll;`
    return () => {
      stopScanner()
      document.body.style.cssText = prev
      window.scrollTo(0, scrollY)
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

      const html5QrCode = new Html5Qrcode(containerRef.current, {
        formatsToSupport,
        verbose: false,
      } as any)
      scannerRef.current = html5QrCode

      await html5QrCode.start(
        { facingMode: useBackCamera ? 'environment' : 'user' },
        {
          fps: 10,
          disableFlip: false,
        },
        (decodedText) => handleDecodedText(decodedText),
        () => {}
      )

      // Si el browser soporta BarcodeDetector nativo (iOS 17+ usa Apple Vision,
      // igual que la camara nativa del iPhone) lo arrancamos en paralelo.
      // Esto permite leer QRs en tela con la misma calidad que la camara nativa.
      if ('BarcodeDetector' in window) {
        try {
          const nativeFormats = mode === 'barcode' ? ['code_128'] : mode === 'qr' ? ['qr_code'] : ['qr_code', 'code_128']
          nativeDetectorRef.current = new (window as any).BarcodeDetector({ formats: nativeFormats })
          nativeActiveRef.current = true
          setTimeout(() => startNativeScanLoop(), 300)
        } catch {}
      }

      try {
        const caps = html5QrCode.getRunningTrackCapabilities() as any
        if (caps?.torch) setHasTorch(true)
        if (caps?.zoom) {
          setHasZoom(true)
          setMaxZoom(caps.zoom.max ?? 5)
        }
        try {
          await html5QrCode.applyVideoConstraints({
            width: { ideal: 1920 },
            height: { ideal: 1080 },
          })
        } catch {}
        try {
          if (caps?.focusMode?.includes?.('continuous')) {
            await html5QrCode.applyVideoConstraints({ advanced: [{ focusMode: 'continuous' } as any] })
          }
        } catch {}
      } catch {}

    } catch (err: any) {
      const msg: string = err?.message || err?.toString() || ''
      if (err?.name === 'NotAllowedError' || /not allowed|permission|denied/i.test(msg)) {
        setError('Permiso denegado: Necesitas autorizar el acceso a la camara en los ajustes del navegador.')
      } else if (err?.name === 'NotFoundError' || /not found|no.*camera|device/i.test(msg)) {
        setError('No se encontro camara en tu dispositivo.')
      } else {
        setError('No se pudo acceder a la camara. Verifica los permisos.')
      }
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
    nativeActiveRef.current = false
    nativeDetectorRef.current = null
    nativeCanvasRef.current = null
    if (nativeScanLoopRef.current) {
      clearTimeout(nativeScanLoopRef.current)
      nativeScanLoopRef.current = null
    }
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
    <div className="fixed inset-0 bg-black/95 flex items-center justify-center z-50 p-4">
      <div className="bg-white rounded-xl w-full max-w-md overflow-hidden flex flex-col">
        <div className="flex items-center justify-between px-4 py-3 border-b shrink-0">
          <h3 className="font-semibold text-gray-800 flex items-center gap-2">
            <Camera className="w-5 h-5" />
            Escanear Codigo
            {continuous && scanCount > 0 && (
              <span className="ml-1 bg-green-600 text-white text-xs px-2 py-0.5 rounded-full">
                {scanCount} leidos
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
              title="Cambiar camara"
            >
              <FlipHorizontal className="w-5 h-5" />
            </button>
          </div>
        </div>

        <div className="p-4 shrink-0">
          {error ? (
            <div className="text-center py-8 space-y-3">
              <div className="text-4xl">📷</div>
              <p className="text-red-600 font-medium text-sm">{error}</p>
              <div className="bg-blue-50 border border-blue-200 rounded-lg p-3 text-left text-xs text-gray-700 space-y-1">
                <p className="font-semibold text-blue-900">Soluciones:</p>
                <ul className="list-disc list-inside space-y-1">
                  <li>Verifica que hayas permitido el acceso a la camara en el navegador</li>
                  <li>En Chrome/Edge: Click en el candado de la URL y habilita la camara</li>
                  <li>Cierra otras aplicaciones que usen la camara</li>
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
                className="w-full bg-gray-900 rounded-lg overflow-hidden aspect-square"
              />

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
                  <span className="text-xs text-gray-500 w-8 text-right">{zoom.toFixed(1)}x</span>
                </div>
              )}

              <div className="h-14 mt-2 flex items-center justify-center">
                {lastCode ? (
                  <div className="w-full text-center px-2 py-1.5 bg-green-100 rounded-lg">
                    <p className="text-green-700 text-xs font-semibold truncate">✓ {lastCode}</p>
                    <p className="text-green-500 text-xs">
                      {mode === 'qr' ? 'QR detectado' : 'Codigo detectado'}
                    </p>
                  </div>
                ) : (
                  <p className="text-center text-sm text-gray-400">
                    📷 {mode === 'qr' ? 'Apunta el QR al cuadro' : mode === 'barcode' ? 'Apunta el codigo de barras' : 'Apunta el QR o codigo de barras'}
                  </p>
                )}
              </div>
            </>
          )}
        </div>

        <div className="px-4 pb-4 shrink-0">
          <button
            onClick={handleClose}
            className="w-full flex items-center justify-center gap-2 px-4 py-3 rounded-xl font-semibold text-sm transition-colors bg-indigo-600 hover:bg-indigo-700 text-white"
          >
            {continuous ? (
              <><CheckCircle2 className="w-5 h-5" /> Listo - cerrar camara</>
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