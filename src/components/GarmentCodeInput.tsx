import { useEffect, useState, type ReactNode } from 'react'
import { CheckCircle2, AlertCircle, Loader2 } from 'lucide-react'
import { garmentService } from '../services/garmentService'
import { validateNewGarmentCode, garmentNameFromCode, batchLabel, type ParsedGarmentCode } from '../lib/garmentCodeParser'
import { useDebouncedValue } from '../hooks/useDebouncedValue'

export type GarmentCodeCheck =
  | { status: 'empty' | 'checking' }
  | { status: 'invalid' | 'exists'; error: string }
  | { status: 'ok'; code: string; name: string }

interface Props {
  value: string
  onChange: (code: string) => void
  /** Resultado de la validación, para habilitar o no el botón de guardar */
  onCheck: (check: GarmentCodeCheck) => void
  /** Botón u otro elemento junto al campo (p. ej. escanear) */
  addon?: ReactNode
  autoFocus?: boolean
}

/**
 * Campo de código de prenda con la misma validación que la importación:
 * formato LOTE-OV-TALLA-COLOR-NNN, claves de catálogo y código no repetido.
 * El nombre se genera del código.
 */
const GarmentCodeInput = ({ value, onChange, onCheck, addon, autoFocus }: Props) => {
  const code = value.trim().toUpperCase()
  const debounced = useDebouncedValue(code, 350)
  const parsed = code ? validateNewGarmentCode(code) : null
  const [existsFor, setExistsFor] = useState<{ code: string; exists: boolean } | null>(null)

  // Revisar en el servidor si el código ya existe (solo cuando el formato es válido)
  useEffect(() => {
    if (!debounced) return
    const p = validateNewGarmentCode(debounced)
    if (!p.valid) return
    let cancelled = false
    garmentService.existingCodes([p.fullCode])
      .then((set) => { if (!cancelled) setExistsFor({ code: p.fullCode, exists: set.has(p.fullCode) }) })
      .catch(() => { if (!cancelled) setExistsFor({ code: p.fullCode, exists: false }) })
    return () => { cancelled = true }
  }, [debounced])

  let check: GarmentCodeCheck
  if (!parsed) check = { status: 'empty' }
  else if (!parsed.valid) check = { status: 'invalid', error: parsed.error }
  else if (existsFor?.code !== parsed.fullCode || debounced !== code) check = { status: 'checking' }
  else if (existsFor.exists) check = { status: 'exists', error: `Ya existe una prenda con el código ${parsed.fullCode}` }
  else check = { status: 'ok', code: parsed.fullCode, name: garmentNameFromCode(parsed) }

  const key = check.status + ('code' in check ? check.code : '') + ('error' in check ? check.error : '')
  useEffect(() => { onCheck(check) }, [key]) // eslint-disable-line react-hooks/exhaustive-deps

  const ok = parsed?.valid ? (parsed as ParsedGarmentCode) : null

  return (
    <div className="space-y-2">
      <div className="flex gap-2">
        <input
          type="text"
          value={value}
          onChange={(e) => onChange(e.target.value.toUpperCase())}
          className={`input-field flex-1 font-mono ${check.status === 'invalid' || check.status === 'exists' ? 'border-red-300 focus:border-red-500 focus:ring-red-500' : check.status === 'ok' ? 'border-emerald-300' : ''}`}
          placeholder="Ej: 202607A-OV-M-BL-001"
          autoFocus={autoFocus}
          spellCheck={false}
          aria-invalid={check.status === 'invalid' || check.status === 'exists'}
        />
        {addon}
      </div>

      {!code && (
        <p className="text-xs text-gray-500">Formato LOTE-OV-TALLA-COLOR-NNN. El nombre se genera a partir del código.</p>
      )}
      {(check.status === 'invalid' || check.status === 'exists') && (
        <p className="flex items-start gap-1.5 text-sm text-red-600"><AlertCircle className="mt-0.5 h-4 w-4 shrink-0" /> {check.error}</p>
      )}

      {ok && (
        <div className={`rounded-lg p-3 ring-1 ring-inset ${check.status === 'exists' ? 'bg-gray-50 ring-gray-200' : 'bg-emerald-50/60 ring-emerald-200'}`}>
          <div className="flex items-center gap-2 text-sm">
            {check.status === 'checking'
              ? <Loader2 className="h-4 w-4 animate-spin text-gray-400" />
              : check.status === 'ok' && <CheckCircle2 className="h-4 w-4 text-emerald-600" />}
            <span className="text-gray-500">Nombre:</span>
            <span className="font-semibold text-gray-900">{garmentNameFromCode(ok)}</span>
          </div>
          <dl className="mt-2 grid grid-cols-2 gap-x-4 gap-y-1 text-xs sm:grid-cols-5">
            {[
              ['Lote', batchLabel(ok)],
              ['Prenda', ok.garmentName],
              ['Talla', ok.sizeName],
              ['Color', ok.colorName],
              ['Consecutivo', String(ok.sequenceNumber).padStart(3, '0')],
            ].map(([k, v]) => (
              <div key={k}>
                <dt className="text-gray-500">{k}</dt>
                <dd className="font-medium text-gray-800">{v}</dd>
              </div>
            ))}
          </dl>
        </div>
      )}
    </div>
  )
}

export default GarmentCodeInput
