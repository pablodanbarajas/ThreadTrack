import { useEffect, useState } from 'react'
import { useNavigate } from 'react-router-dom'
import { Plus } from 'lucide-react'
import { useRole } from '../contexts/AuthContext'
import { useHoseCache } from '../contexts/HoseCacheContext'
import { hoseService } from '../services/hoseService'
import { userService } from '../services/userService'
import type { Team } from '../types'

const DEFAULT_CALIBERS = ['', '', '', '', '']

const CreateEquipment = () => {
  const { isAdministrador } = useRole()
  const { invalidateEquipment } = useHoseCache()
  const navigate = useNavigate()

  const [code, setCode] = useState('')
  const [name, setName] = useState('')
  const [calibers, setCalibers] = useState<string[]>(DEFAULT_CALIBERS)
  const [lengths, setLengths] = useState<string[]>(['', '', '', '', ''])
  const [teamId, setTeamId] = useState('')
  const [teams, setTeams] = useState<Team[]>([])
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState<string | null>(null)

  useEffect(() => {
    if (isAdministrador) {
      userService.getTeams().then(setTeams).catch(console.error)
    }
  }, [isAdministrador])

  const handleCaliberChange = (index: number, value: string) => {
    setCalibers((prev) => prev.map((c, i) => (i === index ? value : c)))
  }

  const handleLengthChange = (index: number, value: string) => {
    setLengths((prev) => prev.map((l, i) => (i === index ? value : l)))
  }

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault()
    setError(null)

    const calibersList = calibers.map((c) => c.trim()).filter(Boolean)
    if (!code.trim() || !name.trim()) {
      setError('El código y el nombre del producto son obligatorios')
      return
    }
    if (calibersList.length !== calibers.length) {
      setError('Debes indicar los 5 calibres')
      return
    }

    setLoading(true)
    try {
      const equipment = await hoseService.createEquipment({
        code: code.trim(),
        name: name.trim(),
        calibers: calibersList,
        lengths: calibers.map((_, i) => lengths[i]?.trim() || ''),
        team_id: teamId || undefined,
      })
      invalidateEquipment()
      navigate(`/mangueras`, { state: { createdEquipmentId: equipment.id } })
    } catch (err: any) {
      setError(err.message || 'Error al crear el producto')
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
          <div className="mb-4 p-3 bg-red-50 border border-red-200 rounded-lg text-sm text-red-700">{error}</div>
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
            <label className="block text-sm font-medium text-gray-700 mb-2">Calibres y longitud</label>
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
          {isAdministrador && (
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-1">Empresa</label>
              <select value={teamId} onChange={(e) => setTeamId(e.target.value)} className="input-field">
                <option value="">Sin asignar</option>
                {teams.map((team) => (
                  <option key={team.id} value={team.id}>{team.name}</option>
                ))}
              </select>
            </div>
          )}

          <button type="submit" className="btn-primary w-full" disabled={loading}>
            {loading ? 'Creando...' : 'Crear producto'}
          </button>
        </form>
      </div>
    </div>
  )
}

export default CreateEquipment
