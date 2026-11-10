import { useState } from 'react'
import { Navigate, useNavigate } from 'react-router-dom'
import { KeyRound, Loader2, Check, X, LogOut } from 'lucide-react'
import { useAuth } from '../contexts/AuthContext'
import { supabase } from '../lib/supabase'

// Debe coincidir con change_my_password() en la base de datos
const rules = [
  { label: 'Al menos 12 caracteres', test: (p: string) => p.length >= 12 },
  { label: 'Una mayúscula', test: (p: string) => /[A-Z]/.test(p) },
  { label: 'Una minúscula', test: (p: string) => /[a-z]/.test(p) },
  { label: 'Un número', test: (p: string) => /[0-9]/.test(p) },
  { label: 'Un símbolo (#, $, %, &, *, …)', test: (p: string) => /[^A-Za-z0-9]/.test(p) },
]

const ChangePassword = () => {
  const { user, mustChangePassword, passwordChangeReason, refreshProfile, signOut, loading } = useAuth()
  const navigate = useNavigate()
  const [current, setCurrent] = useState('')
  const [next, setNext] = useState('')
  const [confirm, setConfirm] = useState('')
  const [saving, setSaving] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [done, setDone] = useState(false)

  if (!loading && !user) return <Navigate to="/login" replace />

  const allRules = rules.every((r) => r.test(next))
  const matches = next.length > 0 && next === confirm
  const canSubmit = current && allRules && matches && !saving

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault()
    setSaving(true)
    setError(null)
    try {
      const { data, error: rpcError } = await supabase.rpc('change_my_password', { p_current: current, p_new: next })
      if (rpcError) throw rpcError
      if (!data?.ok) {
        if (data?.locked) {
          await signOut()
          navigate('/login', { replace: true })
          return
        }
        throw new Error(data?.error || 'No se pudo cambiar la contraseña')
      }
      setDone(true)
      setCurrent('')
      setNext('')
      setConfirm('')
      await refreshProfile()
      setTimeout(() => navigate('/', { replace: true }), 1200)
    } catch (err: any) {
      setError(err.message || 'No se pudo cambiar la contraseña')
    } finally {
      setSaving(false)
    }
  }

  return (
    <div className="min-h-screen bg-gradient-to-br from-blue-50 to-blue-100 flex items-center justify-center p-4">
      <div className="card w-full max-w-md">
        <div className="flex items-center gap-3 mb-4">
          <KeyRound className="w-8 h-8 text-blue-600" />
          <div>
            <h1 className="text-xl font-bold text-gray-800">Cambiar contraseña</h1>
            <p className="text-sm text-gray-500">{user?.email}</p>
          </div>
        </div>

        {mustChangePassword && (
          <div className="mb-4 p-3 rounded-lg bg-amber-50 border border-amber-200 text-sm text-amber-800">
            {passwordChangeReason === 'expirada'
              ? 'Tu contraseña caducó (vigencia de 90 días). Debes crear una nueva para continuar.'
              : 'Tienes una contraseña temporal asignada por el administrador. Crea tu propia contraseña para continuar; nadie más la conocerá.'}
          </div>
        )}

        {done && (
          <div className="mb-4 p-3 rounded-lg bg-green-50 border border-green-200 text-sm text-green-800">
            Contraseña actualizada. Redirigiendo…
          </div>
        )}

        {error && (
          <div className="mb-4 p-3 rounded-lg bg-red-50 border border-red-200 text-sm text-red-700">{error}</div>
        )}

        <form onSubmit={handleSubmit} className="space-y-3">
          <label className="block text-sm font-medium text-gray-700">
            {passwordChangeReason === 'temporal' ? 'Contraseña temporal' : 'Contraseña actual'}
            <input type="password" autoComplete="current-password" value={current}
              onChange={(e) => setCurrent(e.target.value)} className="input-field mt-1" />
          </label>
          <label className="block text-sm font-medium text-gray-700">
            Nueva contraseña
            <input type="password" autoComplete="new-password" value={next}
              onChange={(e) => setNext(e.target.value)} className="input-field mt-1" />
          </label>
          <ul className="text-xs space-y-0.5">
            {rules.map((r) => {
              const ok = r.test(next)
              return (
                <li key={r.label} className={`flex items-center gap-1 ${ok ? 'text-green-700' : 'text-gray-500'}`}>
                  {ok ? <Check className="w-3 h-3" /> : <X className="w-3 h-3" />} {r.label}
                </li>
              )
            })}
            <li className="text-gray-500">No puede ser igual a tus últimas 5 contraseñas ni contener tu usuario.</li>
          </ul>
          <label className="block text-sm font-medium text-gray-700">
            Confirmar nueva contraseña
            <input type="password" autoComplete="new-password" value={confirm}
              onChange={(e) => setConfirm(e.target.value)} className="input-field mt-1" />
          </label>
          {confirm && !matches && <p className="text-xs text-red-600">Las contraseñas no coinciden</p>}

          <button type="submit" disabled={!canSubmit} className="btn-primary w-full flex items-center justify-center gap-2 disabled:opacity-50">
            {saving && <Loader2 className="w-4 h-4 animate-spin" />}
            Guardar nueva contraseña
          </button>
        </form>

        <div className="mt-4 flex justify-between text-sm">
          {!mustChangePassword ? (
            <button onClick={() => navigate(-1)} className="text-gray-600 hover:underline">Volver</button>
          ) : <span />}
          <button onClick={async () => { await signOut(); navigate('/login', { replace: true }) }}
            className="text-gray-600 hover:underline flex items-center gap-1">
            <LogOut className="w-4 h-4" /> Cerrar sesión
          </button>
        </div>
      </div>
    </div>
  )
}

export default ChangePassword
