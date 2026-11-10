import { PenLine } from 'lucide-react'
import { useAuth } from '../contexts/AuthContext'

interface SignatureFieldProps {
  meaning: string
  password: string
  onChange: (password: string) => void
}

/**
 * Firma electrónica (21 CFR Part 11 §11.50 / §11.200).
 * Muestra quién firma y el significado de la firma, y pide la contraseña.
 * La contraseña se verifica en el servidor (signatureService.sign).
 */
const SignatureField = ({ meaning, password, onChange }: SignatureFieldProps) => {
  const { user } = useAuth()

  return (
    <div className="rounded-lg border border-indigo-200 bg-indigo-50 p-3">
      <div className="flex items-center gap-2 text-sm font-semibold text-indigo-800">
        <PenLine className="w-4 h-4" />
        Firma electrónica
      </div>
      <p className="mt-1 text-xs text-indigo-900">
        <span className="font-medium">{user?.email}</span> — {meaning}
      </p>
      <input
        type="password"
        autoComplete="current-password"
        value={password}
        onChange={(e) => onChange(e.target.value)}
        placeholder="Tu contraseña para firmar"
        className="input-field mt-2"
      />
      <p className="mt-1 text-[11px] text-indigo-700">
        Al firmar, confirmas esta acción con la misma validez que tu firma autógrafa. Queda registrada con fecha y hora.
      </p>
    </div>
  )
}

export default SignatureField
