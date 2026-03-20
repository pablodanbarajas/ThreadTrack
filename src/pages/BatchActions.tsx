import { useState, useRef, useEffect, useCallback } from 'react'
import {
  ScanBarcode, Camera, Droplets, Sparkles, ClipboardCheck, Scissors,
  Trash2, X, CheckCircle2, AlertCircle, Loader2, Play, RotateCcw,
  PackageCheck,
} from 'lucide-react'
import BarcodeScanner from '../components/BarcodeScanner'
import { garmentService } from '../services/garmentService'
import { extractGarmentIdFromUrl } from '../lib/qrGenerator'
import type { ActionType, InspectionResult, GarmentStatus } from '../types'

interface ScannedItem {
  uid: string          // unique per-scan key
  garmentId: string
  code: string
  name: string
  status: GarmentStatus
  applyStatus: 'pending' | 'success' | 'error' | 'duplicate' | 'skipped'
  errorMsg?: string
}

const ACTION_CONFIG: Record<ActionType, { label: string; color: string; icon: any; bg: string; border: string }> = {
  lavado:        { label: 'Enviar a Lavado',         color: 'text-blue-700',   bg: 'bg-blue-50',   border: 'border-blue-300',   icon: Droplets },
  esterilizacion:{ label: 'Enviar a Esterilización', color: 'text-purple-700', bg: 'bg-purple-50', border: 'border-purple-300', icon: Sparkles },
  inspeccion:    { label: 'Enviar a Inspección',     color: 'text-yellow-700', bg: 'bg-yellow-50', border: 'border-yellow-300', icon: ClipboardCheck },
  reparacion:    { label: 'Enviar a Reparación',     color: 'text-orange-700', bg: 'bg-orange-50', border: 'border-orange-300', icon: Scissors },
  baja:          { label: 'Dar de Baja',             color: 'text-red-700',    bg: 'bg-red-50',    border: 'border-red-300',    icon: Trash2 },
}

const BatchActions = () => {
  const [items, setItems] = useState<ScannedItem[]>([])
  const [inputValue, setInputValue] = useState('')
  const [showScanner, setShowScanner] = useState(false)
  const [loadingCode, setLoadingCode] = useState(false)
  const [lastAdded, setLastAdded] = useState<string | null>(null)

  const [selectedAction, setSelectedAction] = useState<ActionType>('lavado')
  const [inspectionResult, setInspectionResult] = useState<InspectionResult>('aprobado')
  const [notes, setNotes] = useState('')

  const [applying, setApplying] = useState(false)
  const [done, setDone] = useState(false)

  const inputRef = useRef<HTMLInputElement>(null)

  // Keep input focused for pistol scanner
  useEffect(() => {
    if (!showScanner && !applying) {
      inputRef.current?.focus()
    }
  }, [showScanner, applying, items.length])

  const resolveGarmentFromCode = useCallback(async (raw: string) => {
    const trimmed = raw.trim()
    if (!trimmed) return

    setLoadingCode(true)
    try {
      // Try to extract garment ID from QR URL
      const id = extractGarmentIdFromUrl(trimmed)
      const garment = id
        ? await garmentService.getById(id)
        : await garmentService.getByCode(trimmed)

      if (!garment) {
        // Add error entry so operator sees what failed
        setItems(prev => [{
          uid: `${Date.now()}-${trimmed}`,
          garmentId: '',
          code: trimmed,
          name: 'No encontrada',
          status: 'disponible',
          applyStatus: 'error',
          errorMsg: 'Prenda no encontrada',
        }, ...prev])
        return
      }

      // Check duplicate
      const isDuplicate = items.some(i => i.garmentId === garment.id)
      if (isDuplicate) {
        setLastAdded(`dup-${garment.id}`)
        setTimeout(() => setLastAdded(null), 1200)
        return
      }

      const newItem: ScannedItem = {
        uid: `${Date.now()}-${garment.id}`,
        garmentId: garment.id,
        code: garment.code,
        name: garment.name,
        status: garment.status,
        applyStatus: garment.status === 'baja' ? 'skipped' : 'pending',
        errorMsg: garment.status === 'baja' ? 'Ya está dada de baja' : undefined,
      }
      setItems(prev => [newItem, ...prev])
      setLastAdded(garment.id)
      setTimeout(() => setLastAdded(null), 800)
    } catch (err: any) {
      setItems(prev => [{
        uid: `${Date.now()}-err`,
        garmentId: '',
        code: trimmed,
        name: 'Error',
        status: 'disponible',
        applyStatus: 'error',
        errorMsg: err.message || 'Error al buscar',
      }, ...prev])
    } finally {
      setLoadingCode(false)
    }
  }, [items])

  const handleInputKeyDown = (e: React.KeyboardEvent<HTMLInputElement>) => {
    if (e.key === 'Enter') {
      const val = inputValue.trim()
      setInputValue('')
      if (val) resolveGarmentFromCode(val)
    }
  }

  const handleCameraScan = (code: string) => {
    setShowScanner(false)
    resolveGarmentFromCode(code)
  }

  const removeItem = (uid: string) => {
    setItems(prev => prev.filter(i => i.uid !== uid))
  }

  const reset = () => {
    setItems([])
    setNotes('')
    setDone(false)
    setInputValue('')
    setTimeout(() => inputRef.current?.focus(), 100)
  }

  const pendingCount = items.filter(i => i.applyStatus === 'pending').length

  const applyToAll = async () => {
    if (pendingCount === 0) return
    setApplying(true)
    setDone(false)

    const toProcess = items.filter(i => i.applyStatus === 'pending')

    for (const item of toProcess) {
      try {
        await garmentService.registerAction(item.garmentId, selectedAction, {
          result: selectedAction === 'inspeccion' ? inspectionResult : undefined,
          notes: notes || undefined,
        })
        setItems(prev =>
          prev.map(i => i.uid === item.uid ? { ...i, applyStatus: 'success' } : i)
        )
      } catch (err: any) {
        setItems(prev =>
          prev.map(i => i.uid === item.uid
            ? { ...i, applyStatus: 'error', errorMsg: err.message || 'Error' }
            : i
          )
        )
      }
    }

    setApplying(false)
    setDone(true)
  }

  const successCount = items.filter(i => i.applyStatus === 'success').length
  const errorCount  = items.filter(i => i.applyStatus === 'error').length

  const cfg = ACTION_CONFIG[selectedAction]

  return (
    <div className="w-full pb-20 md:pb-0">
      {/* Title */}
      <div className="flex items-center gap-3 mb-4">
        <ScanBarcode className="w-8 h-8 text-indigo-600" />
        <div>
          <h1 className="text-2xl font-bold text-gray-800">Acciones en Lote</h1>
          <p className="text-sm text-gray-500">Escanea varias prendas y aplica una acción a todas</p>
        </div>
      </div>

      <div className="grid lg:grid-cols-2 gap-4 items-start">

        {/* ── LEFT: scanner + list ── */}
        <div className="space-y-3">

          {/* Scan input */}
          <div className="card">
            <p className="text-sm font-semibold text-gray-700 mb-2">Escanea o ingresa código</p>
            <div className="flex gap-2">
              <input
                ref={inputRef}
                type="text"
                value={inputValue}
                onChange={e => setInputValue(e.target.value)}
                onKeyDown={handleInputKeyDown}
                placeholder="Apunta la pistola o escribe y presiona Enter"
                className="input-field flex-1"
                disabled={applying}
                autoComplete="off"
              />
              <button
                onClick={() => setShowScanner(true)}
                disabled={applying}
                className="px-3 py-2 bg-indigo-100 text-indigo-700 hover:bg-indigo-200 rounded-lg transition-colors"
                title="Usar cámara"
              >
                <Camera className="w-5 h-5" />
              </button>
            </div>
            {loadingCode && (
              <p className="text-xs text-gray-400 mt-1 flex items-center gap-1">
                <Loader2 className="w-3 h-3 animate-spin" /> Buscando...
              </p>
            )}
          </div>

          {/* Scanned list */}
          <div className="card">
            <div className="flex items-center justify-between mb-3">
              <span className="text-sm font-semibold text-gray-700">
                Lista ({items.length} prendas{pendingCount > 0 ? `, ${pendingCount} pendientes` : ''})
              </span>
              {items.length > 0 && !applying && (
                <button onClick={reset} className="text-xs text-gray-400 hover:text-red-500 transition-colors flex items-center gap-1">
                  <RotateCcw className="w-3.5 h-3.5" /> Limpiar
                </button>
              )}
            </div>

            {items.length === 0 ? (
              <div className="text-center py-10 text-gray-300">
                <ScanBarcode className="w-12 h-12 mx-auto mb-2 opacity-40" />
                <p className="text-sm">Empieza a escanear prendas</p>
              </div>
            ) : (
              <div className="space-y-1.5 max-h-[420px] overflow-y-auto pr-1">
                {items.map(item => (
                  <div
                    key={item.uid}
                    className={`flex items-center gap-2 p-2 rounded-lg border transition-all duration-300 ${
                      lastAdded === item.garmentId
                        ? 'bg-green-50 border-green-300 scale-[1.01]'
                        : item.applyStatus === 'success'
                        ? 'bg-green-50 border-green-200'
                        : item.applyStatus === 'error'
                        ? 'bg-red-50 border-red-200'
                        : item.applyStatus === 'duplicate'
                        ? 'bg-yellow-50 border-yellow-200'
                        : item.applyStatus === 'skipped'
                        ? 'bg-gray-50 border-gray-200 opacity-60'
                        : 'bg-white border-gray-200'
                    }`}
                  >
                    {/* Status icon */}
                    <div className="shrink-0">
                      {item.applyStatus === 'success' && <CheckCircle2 className="w-4 h-4 text-green-600" />}
                      {item.applyStatus === 'error'   && <AlertCircle  className="w-4 h-4 text-red-500"   />}
                      {item.applyStatus === 'skipped' && <AlertCircle  className="w-4 h-4 text-gray-400"  />}
                      {item.applyStatus === 'pending' && applying && <Loader2 className="w-4 h-4 text-indigo-500 animate-spin" />}
                      {item.applyStatus === 'pending' && !applying && <div className="w-4 h-4 rounded-full border-2 border-gray-300" />}
                    </div>

                    {/* Info */}
                    <div className="flex-1 min-w-0">
                      <p className="text-xs font-semibold text-gray-800 truncate">{item.name}</p>
                      <p className="text-xs text-gray-400 font-mono truncate">{item.code}</p>
                      {item.errorMsg && <p className="text-xs text-red-500">{item.errorMsg}</p>}
                    </div>

                    {/* Remove */}
                    {!applying && item.applyStatus !== 'success' && (
                      <button
                        onClick={() => removeItem(item.uid)}
                        className="shrink-0 p-1 text-gray-300 hover:text-red-400 transition-colors"
                      >
                        <X className="w-3.5 h-3.5" />
                      </button>
                    )}
                  </div>
                ))}
              </div>
            )}
          </div>
        </div>

        {/* ── RIGHT: action config + apply ── */}
        <div className="space-y-3">

          {/* Action selector */}
          <div className="card">
            <p className="text-sm font-semibold text-gray-700 mb-3">Acción a aplicar</p>
            <div className="grid grid-cols-1 gap-2">
              {(Object.entries(ACTION_CONFIG) as [ActionType, typeof cfg][]).map(([key, c]) => {
                const Icon = c.icon
                const active = selectedAction === key
                return (
                  <button
                    key={key}
                    onClick={() => setSelectedAction(key)}
                    disabled={applying}
                    className={`flex items-center gap-3 px-4 py-3 rounded-lg border-2 transition-all text-left ${
                      active
                        ? `${c.bg} ${c.border} ${c.color} font-semibold`
                        : 'bg-white border-gray-200 text-gray-600 hover:border-gray-300'
                    }`}
                  >
                    <Icon className={`w-5 h-5 shrink-0 ${active ? c.color : 'text-gray-400'}`} />
                    <span className="text-sm">{c.label}</span>
                    {active && <CheckCircle2 className="w-4 h-4 ml-auto" />}
                  </button>
                )
              })}
            </div>
          </div>

          {/* Inspection result (only when inspeccion) */}
          {selectedAction === 'inspeccion' && (
            <div className="card">
              <p className="text-sm font-semibold text-gray-700 mb-2">Resultado de inspección</p>
              <div className="space-y-1.5">
                {([
                  { value: 'aprobado',  label: 'Aprobado — vuelve a Disponible', icon: PackageCheck, color: 'text-green-600' },
                  { value: 'reparacion',label: 'Requiere Reparación',             icon: Scissors,     color: 'text-orange-600' },
                  { value: 'baja',      label: 'Dar de Baja',                     icon: Trash2,       color: 'text-red-600' },
                ] as { value: InspectionResult; label: string; icon: any; color: string }[]).map(opt => {
                  const OptIcon = opt.icon
                  return (
                    <label key={opt.value} className="flex items-center gap-3 p-2.5 border rounded-lg cursor-pointer hover:bg-gray-50">
                      <input
                        type="radio"
                        name="inspResult"
                        value={opt.value}
                        checked={inspectionResult === opt.value}
                        onChange={() => setInspectionResult(opt.value)}
                        disabled={applying}
                      />
                      <OptIcon className={`w-4 h-4 ${opt.color}`} />
                      <span className="text-sm">{opt.label}</span>
                    </label>
                  )
                })}
              </div>
            </div>
          )}

          {/* Notes */}
          <div className="card">
            <label className="block text-sm font-semibold text-gray-700 mb-1">
              {selectedAction === 'inspeccion' && inspectionResult === 'baja'
                ? 'Motivo de baja *'
                : 'Notas (opcional)'}
            </label>
            <textarea
              value={notes}
              onChange={e => setNotes(e.target.value)}
              className="input-field min-h-[70px] text-sm"
              placeholder="Observaciones para todas las prendas..."
              disabled={applying}
            />
          </div>

          {/* Apply button */}
          <button
            onClick={applyToAll}
            disabled={applying || pendingCount === 0 || (selectedAction === 'inspeccion' && inspectionResult === 'baja' && !notes)}
            className={`w-full flex items-center justify-center gap-2 px-6 py-4 rounded-xl font-bold text-base transition-all shadow-sm ${
              applying || pendingCount === 0
                ? 'bg-gray-200 text-gray-400 cursor-not-allowed'
                : `${cfg.bg} ${cfg.border} border-2 ${cfg.color} hover:opacity-90`
            }`}
          >
            {applying ? (
              <><Loader2 className="w-5 h-5 animate-spin" /> Aplicando...</>
            ) : (
              <><Play className="w-5 h-5" /> Aplicar a {pendingCount} {pendingCount === 1 ? 'prenda' : 'prendas'}</>
            )}
          </button>

          {/* Results summary */}
          {done && (
            <div className={`rounded-xl p-4 border-2 ${errorCount === 0 ? 'bg-green-50 border-green-300' : 'bg-yellow-50 border-yellow-300'}`}>
              <p className={`font-bold text-sm mb-1 ${errorCount === 0 ? 'text-green-700' : 'text-yellow-700'}`}>
                {errorCount === 0 ? '¡Lote completado!' : 'Lote procesado con errores'}
              </p>
              <p className="text-xs text-gray-600">
                ✅ {successCount} exitosas &nbsp;
                {errorCount > 0 && <span>❌ {errorCount} con error</span>}
              </p>
              <button
                onClick={reset}
                className="mt-3 w-full text-sm font-medium px-4 py-2 bg-white border border-gray-300 rounded-lg hover:bg-gray-50 transition-colors flex items-center justify-center gap-2"
              >
                <RotateCcw className="w-4 h-4" /> Nuevo lote
              </button>
            </div>
          )}
        </div>
      </div>

      {/* Camera scanner overlay */}
      {showScanner && (
        <div className="fixed inset-0 bg-black/60 z-50 flex items-center justify-center p-4">
          <div className="bg-white rounded-2xl overflow-hidden w-full max-w-md shadow-2xl">
            <div className="flex items-center justify-between px-4 py-3 border-b">
              <span className="font-semibold text-gray-800">Escanear QR / Código</span>
              <button onClick={() => setShowScanner(false)} className="p-1 hover:bg-gray-100 rounded-lg">
                <X className="w-5 h-5" />
              </button>
            </div>
            <BarcodeScanner onScan={handleCameraScan} onClose={() => setShowScanner(false)} mode="auto" />
          </div>
        </div>
      )}
    </div>
  )
}

export default BatchActions
