import { useState } from 'react'
import { useNavigate } from 'react-router-dom'
import { Plus } from 'lucide-react'
import { useHoseCache } from '../contexts/HoseCacheContext'
import { hoseService } from '../services/hoseService'
import { Notice } from '../components/ui/StatusBadge'

const DEFAULT_CALIBERS = ['', '', '', '', '']

const CreateEquipment = () => {
  const { invalidateEquipment } = useHoseCache()
  const navigate = useNavigate()

  const [code, setCode] = useState('')
  const [name, setName] = useState('')
  const [calibers, setCalibers] = useState<string[]>(DEFAULT_CALIBERS)
  const [lengths, setLengths] = useState<string[]>(['', '', '', '', ''])
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState<string | null>(null)

  const handleCaliberChange = (index: number, value: string) => {
    setCalibers((prev) => prev.map((c, i) => (i === index ? value : c)))
  }

  const handleLengthChange = (index: number, value: string) => {
    setLengths((prev) => prev.map((l, i) => (i === index ? value : l)))
  }

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault()
    setError(null)

    // Solo las filas con calibre; la longitud de una fila sin calibre no se acepta
    const filled = calibers.map((c, i) => ({ caliber: c.trim(), length: lengths[i]?.trim() || '' }))
    if (!code.trim() || !name.trim()) {
      setError('El código y el nombre del producto son obligatorios')
      return
    }
    if (filled.some((f) => !f.caliber && f.length)) {
      setError('Hay una longitud sin calibre')
      return
    }
    const used = filled.filter((f) => f.caliber)
    if (used.length === 0) {
      setError('Indica al menos un calibre')
      return
    }
    if (new Set(used.map((f) => f.caliber.toLowerCase())).size !== used.length) {
      setError('Los calibres de un producto no se pueden repetir')
      return
    }

    setLoading(true)
    try {
      const equipment = await hoseService.createEquipment({
        code: code.trim(),
        name: name.trim(),
        calibers: used.map((f) => f.caliber),
        lengths: used.map((f) => f.length),
      })
      invalidateEquipment()
      navigate(`/mangueras`, { state: { createdEquipmentId: equipment.id } })
    } catch (err) {
      setError((err as Error).message || 'Error al crear el producto')
    } finally {
      setLoading(false)
    }
  }

  return (
    <div className="w-full pb-20 md:pb-0 max-w-lg">
      <div className="flex items-center gap-3 mb-6">
        <Plus className="w-8 h-8 text-green-600" />
        <h1 className="text-2xl font-bold text-gray-800">Nuevo Producto</h1>
      </div>

      <div className="card">
        {error && (
          <Notice tone="error" className="mb-4">{error}</Notice>
        )}

        <form onSubmit={handleSubmit} className="space-y-4">
          <div>
            <label className="block text-sm font-medium text-gray-700 mb-1">Código del producto *</label>
            <input value={code} onChange={(e) => setCode(e.target.value)} className="input-field" required />
          </div>
          <div>
            <label className="block text-sm font-medium text-gray-700 mb-1">Nombre del producto *</label>
            <input value={name} onChange={(e) => setName(e.target.value)} className="input-field" required />
          </div>
          <div>
            <label className="block text-sm font-medium text-gray-700 mb-2">Calibres y longitud <span className="font-normal text-gray-400">(de 1 a 5 mangueras)</span></label>
            <div className="space-y-2">
              {calibers.map((caliber, index) => (
                <div key={index} className="flex items-center gap-2">
                  <span className="text-xs text-gray-500 w-20 flex-shrink-0">Manguera {index + 1}</span>
                  <input
                    value={caliber}
                    onChange={(e) => handleCaliberChange(index, e.target.value)}
                    placeholder="Calibre"
                    className="input-field"
                  />
                  <input
                    value={lengths[index] ?? ''}
                    onChange={(e) => handleLengthChange(index, e.target.value)}
                    placeholder="Longitud"
                    className="input-field"
                  />
                </div>
              ))}
            </div>
          </div>

          <button type="submit" className="btn-primary w-full" disabled={loading}>
            {loading ? 'Creando...' : 'Crear producto'}
          </button>
        </form>
      </div>
    </div>
  )
}

export default CreateEquipment
