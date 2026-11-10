import type { ReactNode } from 'react'
import { SlidersHorizontal, X, ChevronDown } from 'lucide-react'
import { StatusDot } from './ui/StatusBadge'
import type { IndicatorTone } from '../lib/tones'

export interface FilterChip { value: string; label: string; tone?: IndicatorTone }
export interface SortOption { value: string; label: string }

const garmentChips: FilterChip[] = [
  { value: 'all', label: 'Todas' },
  { value: 'disponible', label: 'Disponibles', tone: 'green' },
  { value: 'lavado', label: 'En lavado', tone: 'blue' },
  { value: 'inspeccion', label: 'En inspección', tone: 'yellow' },
  { value: 'reparacion', label: 'En reparación', tone: 'orange' },
  { value: 'baja', label: 'Bajas', tone: 'red' },
]

const garmentSortOptions: SortOption[] = [
  { value: 'recientes', label: 'Más recientes' },
  { value: 'ciclos', label: 'Más ciclos de lavado' },
  { value: 'inactividad', label: 'Más tiempo sin actividad' },
  { value: 'codigo', label: 'Código (A–Z)' },
]

export const FilterField = ({ label, children, className = '' }: { label: string; children: ReactNode; className?: string }) => (
  <div className={`min-w-0 ${className}`}>
    <p className="mb-1 text-xs font-medium text-gray-500">{label}</p>
    {children}
  </div>
)

interface Props {
  status: string
  onStatus: (s: string) => void
  sort: string
  onSort: (s: string) => void
  /** Opciones de la fila de chips (por defecto: estados de prenda) */
  chips?: FilterChip[]
  chipsLabel?: string
  sortOptions?: SortOption[]
  open: boolean
  onToggle: () => void
  activeCount: number
  onClear: () => void
  canClear: boolean
  children: ReactNode
}

/** Barra de filtros del inventario: estado a la vista, el resto en un panel */
const InventoryFilterBar = ({ status, onStatus, sort, onSort, open, onToggle, activeCount, onClear, canClear, children, chips = garmentChips, chipsLabel = 'Estado', sortOptions = garmentSortOptions }: Props) => (
  <div className="mt-3 border-t border-gray-100 pt-3">
    <div className="flex flex-col gap-2 lg:flex-row lg:items-center lg:justify-between">
      <div className="flex flex-wrap gap-1.5" role="radiogroup" aria-label={chipsLabel}>
        {chips.map((c) => {
          const on = status === c.value
          return (
            <button
              key={c.value}
              type="button"
              role="radio"
              aria-checked={on}
              onClick={() => onStatus(c.value)}
              className={`inline-flex items-center gap-1.5 rounded-full px-3 py-1 text-sm font-medium transition-colors ${
                on ? 'bg-blue-600 text-white' : 'bg-gray-100 text-gray-700 hover:bg-gray-200'
              }`}
            >
              {c.tone && <StatusDot tone={c.tone} className={on ? 'ring-2 ring-white/70' : ''} />}
              {c.label}
            </button>
          )
        })}
      </div>

      <div className="flex flex-wrap items-center gap-2">
        <select
          aria-label="Ordenar por"
          value={sort}
          onChange={(e) => onSort(e.target.value)}
          className="rounded-lg border border-gray-300 bg-white px-2 py-1.5 text-sm"
        >
          {sortOptions.map((o) => <option key={o.value} value={o.value}>Ordenar: {o.label}</option>)}
        </select>
        <button
          type="button"
          onClick={onToggle}
          className={`inline-flex items-center gap-1.5 rounded-lg border px-3 py-1.5 text-sm font-medium ${
            activeCount ? 'border-blue-300 bg-blue-50 text-blue-700' : 'border-gray-300 bg-white text-gray-700 hover:bg-gray-50'
          }`}
        >
          <SlidersHorizontal className="h-4 w-4" />
          Filtros{activeCount ? ` (${activeCount})` : ''}
          <ChevronDown className={`h-4 w-4 transition-transform ${open ? 'rotate-180' : ''}`} />
        </button>
        {canClear && (
          <button type="button" onClick={onClear} className="inline-flex items-center gap-1 rounded-lg px-2 py-1.5 text-sm text-gray-500 hover:bg-gray-100 hover:text-gray-800">
            <X className="h-4 w-4" /> Limpiar
          </button>
        )}
      </div>
    </div>

    {open && (
      <div className="mt-3 grid gap-3 rounded-lg bg-slate-50 p-3 ring-1 ring-inset ring-gray-200 sm:grid-cols-2 lg:grid-cols-4">
        {children}
      </div>
    )}
  </div>
)

export default InventoryFilterBar
