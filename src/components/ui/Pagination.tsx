import { ChevronLeft, ChevronRight } from 'lucide-react'

interface PaginationProps {
  page: number
  pageSize: number
  total: number
  onPageChange: (page: number) => void
  onPageSizeChange?: (size: number) => void
  pageSizeOptions?: number[]
  /** Nombre de los elementos en plural, p. ej. "prendas" */
  label?: string
}

/** Paginador para listas paginadas en el servidor */
const Pagination = ({
  page, pageSize, total, onPageChange, onPageSizeChange, pageSizeOptions = [12, 24, 48, 96], label = 'registros',
}: PaginationProps) => {
  const totalPages = Math.max(1, Math.ceil(total / pageSize))
  if (total === 0) return null

  const from = (page - 1) * pageSize + 1
  const to = Math.min(page * pageSize, total)
  const pages = Array.from({ length: totalPages }, (_, i) => i + 1)
    .filter((p) => p === 1 || p === totalPages || Math.abs(p - page) <= 1)

  const btn = 'flex h-8 min-w-8 items-center justify-center rounded-lg px-2 text-sm transition-colors'

  return (
    <div className="mt-4 flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
      <div className="flex items-center gap-3 text-sm text-gray-500">
        <span>Mostrando <b className="text-gray-900">{from}–{to}</b> de <b className="text-gray-900">{total}</b> {label}</span>
        {onPageSizeChange && (
          <select
            aria-label="Elementos por página"
            value={pageSize}
            onChange={(e) => onPageSizeChange(Number(e.target.value))}
            className="rounded-lg border border-gray-300 bg-white px-2 py-1 text-sm"
          >
            {pageSizeOptions.map((n) => <option key={n} value={n}>{n} por página</option>)}
          </select>
        )}
      </div>

      {totalPages > 1 && (
        <nav className="flex items-center gap-1" aria-label="Paginación">
          <button onClick={() => onPageChange(page - 1)} disabled={page <= 1}
            className={`${btn} text-gray-600 hover:bg-gray-100 disabled:opacity-40`} aria-label="Página anterior">
            <ChevronLeft className="h-4 w-4" />
          </button>
          {pages.map((p, i) => (
            <span key={p} className="flex items-center gap-1">
              {i > 0 && p - pages[i - 1] > 1 && <span className="px-1 text-gray-400">…</span>}
              <button
                onClick={() => onPageChange(p)}
                aria-current={p === page ? 'page' : undefined}
                className={`${btn} ${p === page ? 'bg-blue-600 font-semibold text-white' : 'text-gray-700 hover:bg-gray-100'}`}
              >
                {p}
              </button>
            </span>
          ))}
          <button onClick={() => onPageChange(page + 1)} disabled={page >= totalPages}
            className={`${btn} text-gray-600 hover:bg-gray-100 disabled:opacity-40`} aria-label="Página siguiente">
            <ChevronRight className="h-4 w-4" />
          </button>
        </nav>
      )}
    </div>
  )
}

export default Pagination
