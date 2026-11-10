import { useRef, useState } from 'react'
import * as XLSX from 'xlsx'
import { saveAs } from 'file-saver'
import { FileSpreadsheet, Upload, X, Download, Loader2, CheckCircle2, AlertCircle } from 'lucide-react'
import { hoseService } from '../services/hoseService'
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
  calibers: string[]
  lengths: string[]
  status: RowStatus
  error?: string
}

const statusInfo: Record<RowStatus, { label: string; tone: 'green' | 'red' | 'yellow' | 'orange' }> = {
  valido: { label: 'Listo', tone: 'green' },
  invalido: { label: 'Incompleto', tone: 'red' },
  duplicado: { label: 'Repetido en el archivo', tone: 'yellow' },
  existe: { label: 'Ya existe', tone: 'orange' },
}

const MAX_ROWS = 500
const MAX_HOSES = 5

const norm = (s: unknown) => String(s ?? '').normalize('NFD').replace(/[̀-ͯ]/g, '').trim().toLowerCase()
const CODE_HEADERS = ['codigo', 'code', 'codigo del producto', 'codigo de producto']
const NAME_HEADERS = ['nombre', 'name', 'producto', 'nombre del producto']

const templateHeader = [
  'Código', 'Nombre',
  ...Array.from({ length: MAX_HOSES }, (_, i) => [`Calibre ${i + 1}`, `Longitud ${i + 1}`]).flat(),
]

const downloadTemplate = () => {
  const wb = XLSX.utils.book_new()
  const productos = XLSX.utils.aoa_to_sheet([
    templateHeader,
    ['L1AD25002', 'Aquadran Drops', '1/2"', '6m', '1/4"', '2m', '3/4"', '10m', '3/8"', '4m', '5/8"', '8m'],
    ['L1AD25003', 'Llenadora línea 2', '1/2"', '6m', '3/4"', '10m', '', '', '', '', '', ''],
  ])
  productos['!cols'] = [{ wch: 16 }, { wch: 26 }, ...Array.from({ length: MAX_HOSES * 2 }, () => ({ wch: 11 }))]
  XLSX.utils.book_append_sheet(wb, productos, 'Productos')

  const instrucciones = XLSX.utils.aoa_to_sheet([
    ['Cómo llenar la plantilla'],
    [''],
    ['1. Captura un producto (equipo) por renglón en la hoja "Productos", a partir de la fila 2.'],
    ['2. "Código" y "Nombre" son obligatorios. El código no puede repetirse ni existir ya en el sistema.'],
    [`3. Captura de 1 a ${MAX_HOSES} mangueras: cada una con su "Calibre" (obligatorio) y "Longitud" (opcional).`],
    ['   • Los calibres de un mismo producto no se pueden repetir.'],
    ['   • Deja vacías las columnas de las mangueras que no uses.'],
    ['4. A cada manguera se le asigna automáticamente su código corto (M1, M2, …) con 0 ciclos.'],
    [`5. No cambies los nombres de las columnas. Máximo ${MAX_ROWS} productos por archivo.`],
  ])
  instrucciones['!cols'] = [{ wch: 100 }]
  XLSX.utils.book_append_sheet(wb, instrucciones, 'Instrucciones')

  const buf = XLSX.write(wb, { bookType: 'xlsx', type: 'array' })
  saveAs(new Blob([buf], { type: 'application/octet-stream' }), 'plantilla_importar_mangueras.xlsx')
}

const ImportEquipmentModal = ({ onClose, onImported }: Props) => {
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
      const sheet = wb.Sheets['Productos'] ?? wb.Sheets[wb.SheetNames[0]]
      const matrix = XLSX.utils.sheet_to_json<unknown[]>(sheet, { header: 1, blankrows: false })
      if (matrix.length < 2) throw new Error('El archivo no tiene productos. Usa la plantilla.')

      const header = (matrix[0] as unknown[]).map(norm)
      const codeCol = header.findIndex((h) => CODE_HEADERS.includes(h))
      const nameCol = header.findIndex((h) => NAME_HEADERS.includes(h))
      if (codeCol === -1 || nameCol === -1) throw new Error('No se encontraron las columnas "Código" y "Nombre". Usa la plantilla.')
      const calCols = Array.from({ length: MAX_HOSES }, (_, i) => header.indexOf(`calibre ${i + 1}`))
      const lenCols = Array.from({ length: MAX_HOSES }, (_, i) => header.indexOf(`longitud ${i + 1}`))
      if (calCols.every((c) => c === -1)) throw new Error('No se encontraron columnas "Calibre 1"…"Calibre 5". Usa la plantilla.')

      const cell = (r: unknown[], c: number) => (c >= 0 ? String(r[c] ?? '').trim() : '')
      const data = (matrix.slice(1) as unknown[][]).filter((r) => cell(r, codeCol) || cell(r, nameCol))
      if (data.length > MAX_ROWS) throw new Error(`El archivo tiene ${data.length} productos; el máximo es ${MAX_ROWS} por archivo.`)

      const seen = new Set<string>()
      const parsed: ImportRow[] = data.map((r, i) => {
        const code = cell(r, codeCol)
        const name = cell(r, nameCol)
        const calibers: string[] = []
        const lengths: string[] = []
        let error: string | undefined
        calCols.forEach((c, k) => {
          const cal = cell(r, c)
          const len = cell(r, lenCols[k])
          if (cal) { calibers.push(cal); lengths.push(len) }
          else if (len && !error) error = `Manguera ${k + 1}: tiene longitud pero no calibre`
        })
        if (!code) error = 'Falta el código'
        else if (!name) error = 'Falta el nombre'
        else if (calibers.length === 0) error = 'Captura al menos un calibre'
        else if (new Set(calibers.map((c) => c.toLowerCase())).size !== calibers.length) error = 'Calibres repetidos'
        const base = { line: i + 2, code, name, calibers, lengths }
        if (error) return { ...base, status: 'invalido' as RowStatus, error }
        const key = code.toLowerCase()
        const status: RowStatus = seen.has(key) ? 'duplicado' : 'valido'
        seen.add(key)
        return { ...base, status }
      })

      const existing = await hoseService.existingCodes(parsed.filter((r) => r.status === 'valido').map((r) => r.code))
      setRows(parsed.map((r) => (r.status === 'valido' && existing.has(r.code) ? { ...r, status: 'existe' } : r)))
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
        await hoseService.createEquipment({ code: r.code, name: r.name, calibers: r.calibers, lengths: r.lengths })
        ok++
      } catch (err) {
        console.error(`Error creando ${r.code}:`, err)
        failed.push(r.code)
      }
      setProgress((p) => p + 1)
    }
    setImporting(false)
    if (failed.length) {
      feedback.toast(`Importados ${ok} productos. No se pudieron crear ${failed.length}: ${failed.slice(0, 5).join(', ')}${failed.length > 5 ? '…' : ''}`, 'warning')
    } else {
      feedback.success(`Importados ${ok} productos`)
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
            <h2 className="text-lg font-semibold text-gray-900">Importar productos de mangueras</h2>
          </div>
          <button onClick={onClose} disabled={importing} className="rounded p-1 hover:bg-gray-100" aria-label="Cerrar">
            <X className="h-5 w-5" />
          </button>
        </div>

        <div className="flex-1 space-y-4 overflow-y-auto p-5">
          <div className="flex flex-col gap-3 rounded-lg bg-slate-50 p-3 ring-1 ring-inset ring-gray-200 sm:flex-row sm:items-center">
            <p className="flex-1 text-sm text-gray-600">
              <b className="text-gray-900">1.</b> Descarga la plantilla, captura un producto por renglón con sus calibres y longitudes, y guárdala.
            </p>
            <button onClick={downloadTemplate} className="btn-excel flex shrink-0 items-center gap-2 text-sm">
              <Download className="h-4 w-4" /> Descargar plantilla
            </button>
          </div>

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
            <p className="mt-1 text-xs text-gray-400">Excel (.xlsx, .xls) o CSV · máximo {MAX_ROWS} productos</p>
            {reading && <p className="mt-2 flex items-center justify-center gap-2 text-sm text-gray-600"><Loader2 className="h-4 w-4 animate-spin" /> Leyendo y validando…</p>}
          </div>

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
                      <th className="px-3 py-2">Producto</th>
                      <th className="px-3 py-2">Mangueras</th>
                      <th className="px-3 py-2">Estado</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-gray-100">
                    {rows.map((r) => (
                      <tr key={r.line} className={r.status === 'valido' ? '' : 'bg-gray-50/60'}>
                        <td className="px-3 py-1.5 text-gray-400">{r.line}</td>
                        <td className="px-3 py-1.5 font-mono text-xs text-gray-900">{r.code || '—'}</td>
                        <td className="px-3 py-1.5 text-gray-700">{r.name || '—'}</td>
                        <td className="px-3 py-1.5 text-xs text-gray-600">
                          {r.error
                            ? <span className="text-red-600">{r.error}</span>
                            : r.calibers.map((c, k) => `${c}${r.lengths[k] ? ` (${r.lengths[k]})` : ''}`).join(' · ')}
                        </td>
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
              Importar {validRows.length > 0 ? `${validRows.length} productos` : ''}
            </button>
          </div>
        </div>
      </div>
    </div>
  )
}

export default ImportEquipmentModal
