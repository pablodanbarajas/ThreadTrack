import type { LucideIcon } from 'lucide-react'
import { PackageCheck, Scissors, PackageX } from 'lucide-react'
import type { InspectionResult } from '../types'

const options: { value: InspectionResult; label: string; hint: string; icon: LucideIcon; active: string; iconColor: string }[] = [
  { value: 'aprobado', label: 'Aprobado', hint: 'Vuelve a disponible', icon: PackageCheck,
    active: 'border-emerald-500 bg-emerald-50 ring-1 ring-emerald-500', iconColor: 'text-emerald-600' },
  { value: 'reparacion', label: 'Reparación', hint: 'Requiere reparar', icon: Scissors,
    active: 'border-orange-500 bg-orange-50 ring-1 ring-orange-500', iconColor: 'text-orange-600' },
  { value: 'baja', label: 'Dar de baja', hint: 'Retiro definitivo', icon: PackageX,
    active: 'border-red-500 bg-red-50 ring-1 ring-red-500', iconColor: 'text-red-600' },
]

/** Selector del resultado de inspección: tres opciones compactas en una fila */
const InspectionResultPicker = ({ value, onChange }: { value: InspectionResult; onChange: (v: InspectionResult) => void }) => (
  <fieldset className="mb-4">
    <legend className="mb-2 text-sm font-medium text-gray-700">Resultado</legend>
    <div className="grid grid-cols-3 gap-2" role="radiogroup">
      {options.map((o) => {
        const selected = value === o.value
        return (
          <button
            key={o.value}
            type="button"
            role="radio"
            aria-checked={selected}
            onClick={() => onChange(o.value)}
            className={`flex flex-col items-center gap-1 rounded-lg border px-2 py-3 text-center transition-colors ${
              selected ? o.active : 'border-gray-200 bg-white hover:bg-gray-50'
            }`}
          >
            <o.icon className={`h-5 w-5 ${selected ? o.iconColor : 'text-gray-400'}`} />
            <span className={`text-sm font-semibold ${selected ? 'text-gray-900' : 'text-gray-700'}`}>{o.label}</span>
            <span className="text-[11px] leading-tight text-gray-500">{o.hint}</span>
          </button>
        )
      })}
    </div>
  </fieldset>
)

export default InspectionResultPicker
