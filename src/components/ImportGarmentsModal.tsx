import { useRef, useState } from 'react'
import * as XLSX from 'xlsx'
import { saveAs } from 'file-saver'
import { FileSpreadsheet, Upload, X, Download, Loader2, CheckCircle2, AlertCircle } from 'lucide-react'
import { garmentService } from '../services/garmentService'
import { parseGarmentCode, GARMENT_TYPES, COLORS, SIZES } from '../lib/garmentCodeParser'
import { useFeedback } from './ui/feedback-context'
import { StatusBadge } from './ui/StatusBadge'

interface Props {
  onClose: () => void
  onImported: () => void
}

type RowStatus = 'valido' | 'invalido' | 'duplicado' | 'existe'

interface ImportRow {
  line: number
  code: string
  name: string
  notes: string
  status: RowStatus
  error?: string
}

const statusInfo: Record<RowStatus, { label: string; tone: 'green' | 'red' | 'yellow' | 'orange' }> = {
  valido: { label: 'Listo', tone: 'green' },
  invalido: { label: 'Código inválido', tone: 'red' },
  duplicado: { label: 'Repetido en el archivo', tone: 'yellow' },
  existe: { label: 'Ya existe', tone: 'orange' },
}

const MAX_ROWS = 2000

// Encabezados aceptados (sin acentos ni mayúsculas)
const norm = (s: unknown) => String(s ?? '').normalize('NFD').replace(/[̀-ͯ]/g, '').trim().toLowerCase()
const CODE_HEADERS = ['codigo', 'code', 'codigo de prenda']
const NOTES_HEADERS = ['notas', 'nota', 'notes', 'observaciones']

const downloadImportTemplate = () => {
  const wb = XLSX.utils.book_new()

  const prendas = XLSX.utils.aoa_to_sheet([
    ['Código', 'Notas'],
    ['202607A-OV-M-BL-001', ''],
    ['202607A-OV-L-BL-002', ''],
    ['202607A-FI-S-AC-003', 'Área de llenado'],
  ])
  prendas['!cols'] = [{ wch: 26 }, { wch: 40 }]
  XLSX.utils.book_append_sheet(wb, prendas, 'Prendas')

  const instrucciones = XLSX.utils.aoa_to_sheet([
    ['Cómo llenar la plantilla'],
    [''],
    ['1. Captura una prenda por renglón en la hoja "Prendas", a partir de la fila 2.'],
    ['2. Columna "Código" (obligatoria): formato LOTE-PRENDA-TALLA-COLOR-NNN, por ejemplo 202607A-OV-M-BL-001.'],
    ['   • LOTE: año (4) + mes (2) + letra opcional. Ej. 202607A'],
    ['   • PRENDA, TALLA y COLOR: usa las claves de la hoja "Catálogos".'],
    ['   • NNN: consecutivo de 3 dígitos.'],
    ['3. "Notas" es opcional.'],
    ['4. El nombre de la prenda se genera automáticamente a partir del código.'],
    ['5. No cambies los nombres de las columnas. Máximo 2,000 prendas por archivo.'],
  ])
  instrucciones['!cols'] = [{ wch: 100 }]
  XLSX.utils.book_append_sheet(wb, instrucciones, 'Instrucciones')

  const max = Math.max(Object.keys(GARMENT_TYPES).length, Object.keys(SIZES).length, Object.keys(COLORS).length)
  const tipos = Object.entries(GARMENT_TYPES)
  const tallas = Object.entries(SIZES)
  const colores = Object.entries(COLORS)
  const rows: string[][] = [['Prenda', 'Clave', '', 'Talla', 'Clave', '', 'Color', 'Clave']]
  for (let i = 0; i < max; i++) {
    rows.push([
      tipos[i]?.[1] ?? '', tipos[i]?.[0] ?? '', '',
      tallas[i]?.[1] ?? '', tallas[i]?.[0] ?? '', '',
      colores[i]?.[1] ?? '', colores[i]?.[0] ?? '',
    ])
  }
  const catalogos = XLSX.utils.aoa_to_sheet(rows)
  catalogos['!cols'] = [{ wch: 14 }, { wch: 8 }, { wch: 3 }, { wch: 10 }, { wch: 8 }, { wch: 3 }, { wch: 14 }, { wch: 8 }]
  XLSX.utils.book_append_sheet(wb, catalogos, 'Catálogos')

  const buf = XLSX.write(wb, { bookType: 'xlsx', type: 'array' })
  saveAs(new Blob([buf], { type: 'application/octet-stream' }), 'plantilla_importar_prendas.xlsx')
}

const ImportGarmentsModal = ({ onClose, onImported }: Props) => {
  const feedback = useFeedback()
  const inputRef = useRef<HTMLInputElement>(null)
  const [fileName, setFileName] = useState<string | null>(null)
  const [rows, setRows] = useState<ImportRow[]>([])
  const [reading, setReading] = useState(false)
  const [importing, setImporting] = useState(false)
  const [progress, setProgress] = useState(0)
  const [dragOver, setDragOver] = useState(false)

  const validRows = rows.filter((r) => r.status === 'valido')
  const counts = rows.reduce((acc, r) => ({ ...acc, [r.status]: (acc[r.status] ?? 0) + 1 }), {} as Record<RowStatus, number>)

  const readFile = async (file: File) => {
    setReading(true)
    setRows([])
    setFileName(file.name)
    try {
      const wb = XLSX.read(await file.arrayBuffer(), { type: 'array' })
      const sheet = wb.Sheets['Prendas'] ?? wb.Sheets[wb.SheetNames[0]]
      const matrix = XLSX.utils.sheet_to_json<unknown[]>(sheet, { header: 1, blankrows: false })
      if (matrix.length < 2) throw new Error('El archivo no tiene prendas. Usa la plantilla.')

      const header = (matrix[0] as unknown[]).map(norm)
      const codeCol = header.findIndex((h) => CODE_HEADERS.includes(h))
      if (codeCol === -1) throw new Error('No se encontró la columna "Código". Usa la plantilla.')
      const notesCol = header.findIndex((h) => NOTES_HEADERS.includes(h))

      const data = matrix.slice(1).filter((r) => String((r as unknown[])[codeCol] ?? '').trim() !== '')
      if (data.length > MAX_ROWS) throw new Error(`El archivo tiene ${data.length} prendas; el máximo es ${MAX_ROWS} por archivo.`)

      const seen = new Set<string>()
      const parsedRows: ImportRow[] = data.map((r, i) => {
        const cells = r as unknown[]
        const raw = String(cells[codeCol] ?? '').trim().toUpperCase()
        const parsed = parseGarmentCode(raw)
        const base = {
          line: i + 2,
          notes: notesCol >= 0 ? String(cells[notesCol] ?? '').trim() : '',
        }
        if (!parsed.valid) {
          return { ...base, code: raw, name: '', status: 'invalido' as RowStatus, error: parsed.error }
        }
        const code = parsed.fullCode
        const status: RowStatus = seen.has(code) ? 'duplicado' : 'valido'
        seen.add(code)
        return { ...base, code, name: `${parsed.garmentName} - Talla ${parsed.sizeName} - ${parsed.colorName}`, status }
      })

      // Códigos que ya existen en el sistema
      const existing = await garmentService.existingCodes(parsedRows.filter((r) => r.status === 'valido').map((r) => r.code))
      setRows(parsedRows.map((r) => (r.status === 'valido' && existing.has(r.code) ? { ...r, status: 'existe' } : r)))
    } catch (err) {
      feedback.error((err as Error).message || 'No se pudo leer el archivo')
      setFileName(null)
    } finally {
      setReading(false)
      if (inputRef.current) inputRef.current.value = ''
    }
  }

  const handleImport = async () => {
    if (validRows.length === 0) return
    setImporting(true)
    setProgress(0)
    let ok = 0
    const failed: string[] = []
    for (const r of validRows) {
      try {
        await garmentService.create({
          code: r.code,
          name: r.name,
          notes: r.notes || undefined,
        })
        ok++
      } catch (err) {
        console.error(`Error creando ${r.code}:`, err)
        failed.push(r.code)
      }
      setProgress((p) => p + 1)
    }
    setImporting(false)
    if (failed.length) {
      feedback.toast(`Importadas ${ok} prendas. No se pudieron crear ${failed.length}: ${failed.slice(0, 5).join(', ')}${failed.length > 5 ? '…' : ''}`, 'warning')
    } else {
      feedback.success(`Importadas ${ok} prendas`)
    }
    onImported()
    onClose()
  }

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-slate-900/40 p-4">
      <div className="flex max-h-[92vh] w-full max-w-3xl flex-col overflow-hidden rounded-xl bg-white shadow-xl">
        <div className="card-header">
          <div className="flex items-center gap-2">
            <FileSpreadsheet className="h-5 w-5 text-emerald-600" />
            <h2 className="text-lg font-semibold text-gray-900">Importar prendas desde Excel</h2>
          </div>
          <button onClick={onClose} disabled={importing} className="rounded p-1 hover:bg-gray-100" aria-label="Cerrar">
            <X className="h-5 w-5" />
          </button>
        </div>

        <div className="flex-1 space-y-4 overflow-y-auto p-5">
          {/* Paso 1: plantilla */}
          <div className="flex flex-col gap-3 rounded-lg bg-slate-50 p-3 ring-1 ring-inset ring-gray-200 sm:flex-row sm:items-center">
            <p className="flex-1 text-sm text-gray-600">
              <b className="text-gray-900">1.</b> Descarga la plantilla, captura un código por renglón (formato
              <span className="font-mono"> LOTE-PRENDA-TALLA-COLOR-NNN</span>) y guárdala.
            </p>
            <button onClick={downloadImportTemplate} className="btn-excel flex shrink-0 items-center gap-2 text-sm">
              <Download className="h-4 w-4" /> Descargar plantilla
            </button>
          </div>

          {/* Paso 2: archivo */}
          <div
            onDragOver={(e) => { e.preventDefault(); setDragOver(true) }}
            onDragLeave={() => setDragOver(false)}
            onDrop={(e) => {
              e.preventDefault()
              setDragOver(false)
              const f = e.dataTransfer.files?.[0]
              if (f) readFile(f)
            }}
            className={`rounded-lg border-2 border-dashed p-6 text-center transition-colors ${dragOver ? 'border-blue-500 bg-blue-50' : 'border-gray-300'}`}
          >
            <Upload className="mx-auto h-8 w-8 text-gray-400" />
            <p className="mt-2 text-sm text-gray-600"><b className="text-gray-900">2.</b> Arrastra aquí tu archivo o</p>
            <button onClick={() => inputRef.current?.click()} disabled={reading || importing} className="btn-soft mt-2 text-sm">
              Seleccionar archivo
            </button>
            <input ref={inputRef} type="file" accept=".xlsx,.xls,.csv" className="hidden"
              onChange={(e) => { const f = e.target.files?.[0]; if (f) readFile(f) }} />
            <p className="mt-1 text-xs text-gray-400">Excel (.xlsx, .xls) o CSV · máximo {MAX_ROWS.toLocaleString('es-MX')} prendas</p>
            {reading && <p className="mt-2 flex items-center justify-center gap-2 text-sm text-gray-600"><Loader2 className="h-4 w-4 animate-spin" /> Leyendo y validando…</p>}
          </div>

          {/* Vista previa */}
          {rows.length > 0 && (
            <div className="overflow-hidden rounded-lg border border-gray-200">
              <div className="flex flex-wrap items-center gap-2 border-b border-gray-200 bg-slate-50 px-3 py-2 text-sm">
                <span className="font-medium text-gray-900">{fileName}</span>
                <span className="text-gray-400">·</span>
                {(Object.keys(statusInfo) as RowStatus[]).filter((k) => counts[k]).map((k) => (
                  <StatusBadge key={k} tone={statusInfo[k].tone}>{counts[k]} {statusInfo[k].label.toLowerCase()}</StatusBadge>
                ))}
              </div>
              <div className="max-h-72 overflow-auto">
                <table className="w-full text-sm">
                  <thead className="sticky top-0 bg-white text-left text-xs uppercase tracking-wide text-gray-500">
                    <tr className="border-b border-gray-200">
                      <th className="px-3 py-2">Fila</th>
                      <th className="px-3 py-2">Código</th>
                      <th className="px-3 py-2">Prenda</th>
                      <th className="px-3 py-2">Notas</th>
                      <th className="px-3 py-2">Estado</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-gray-100">
                    {rows.map((r) => (
                      <tr key={r.line} className={r.status === 'valido' ? '' : 'bg-gray-50/60'}>
                        <td className="px-3 py-1.5 text-gray-400">{r.line}</td>
                        <td className="px-3 py-1.5 font-mono text-xs text-gray-900">{r.code}</td>
                        <td className="px-3 py-1.5 text-gray-700">{r.name || <span className="text-xs text-red-600">{r.error}</span>}</td>
                        <td className="px-3 py-1.5 text-gray-600">{r.notes || '—'}</td>
                        <td className="px-3 py-1.5"><StatusBadge tone={statusInfo[r.status].tone}>{statusInfo[r.status].label}</StatusBadge></td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            </div>
          )}

          {importing && (
            <div>
              <div className="mb-1 flex justify-between text-xs text-gray-500">
                <span>Importando…</span><span>{progress} de {validRows.length}</span>
              </div>
              <div className="h-2 overflow-hidden rounded-full bg-gray-100">
                <div className="h-full bg-blue-600 transition-all" style={{ width: `${(progress / validRows.length) * 100}%` }} />
              </div>
            </div>
          )}
        </div>

        <div className="flex flex-col-reverse gap-2 border-t border-gray-200 px-5 py-3 sm:flex-row sm:items-center sm:justify-between">
          <p className="flex items-center gap-1.5 text-xs text-gray-500">
            {rows.length > 0 && (validRows.length < rows.length
              ? <><AlertCircle className="h-3.5 w-3.5 text-amber-500" /> Solo se importarán las filas listas; las demás se omiten.</>
              : <><CheckCircle2 className="h-3.5 w-3.5 text-emerald-500" /> Todas las filas son válidas.</>)}
          </p>
          <div className="flex gap-2">
            <button onClick={onClose} disabled={importing} className="btn-secondary text-sm">Cancelar</button>
            <button onClick={handleImport} disabled={importing || validRows.length === 0}
              className="btn-primary flex items-center gap-2 text-sm disabled:opacity-50">
              {importing && <Loader2 className="h-4 w-4 animate-spin" />}
              Importar {validRows.length > 0 ? `${validRows.length} prendas` : ''}
            </button>
          </div>
        </div>
      </div>
    </div>
  )
}

export default ImportGarmentsModal
