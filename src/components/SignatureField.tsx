import { PenLine } from 'lucide-react'
import { useAuth } from '../contexts/AuthContext'

interface SignatureFieldProps {
  meaning: string
  password: string
  onChange: (password: string) => void
}

/**
 * Firma electrónica (21 CFR Part 11 §11.50 / §11.200).
 * Muestra el nombre impreso del firmante y el significado de la firma, y pide
 * la contraseña, que se verifica en el servidor (signatureService.sign).
 */
const SignatureField = ({ meaning, password, onChange }: SignatureFieldProps) => {
  const { user, displayName } = useAuth()

  return (
    <div className="overflow-hidden rounded-lg border border-blue-200">
      <div className="flex items-center gap-2 border-b border-blue-100 bg-blue-50 px-3 py-2">
        <PenLine className="h-4 w-4 text-blue-600" />
        <span className="text-sm font-semibold text-gray-900">Firma electrónica</span>
        <span className="ml-auto text-[11px] font-medium text-blue-700">Requerida</span>
      </div>

      <div className="space-y-3 bg-white p-3">
        <dl className="grid grid-cols-[auto_1fr] gap-x-3 gap-y-1 text-sm">
          <dt className="text-gray-500">Firmante</dt>
          <dd className="min-w-0 truncate">
            <span className="font-semibold text-gray-900">{displayName}</span>
            {displayName !== user?.email && <span className="text-gray-400"> · {user?.email}</span>}
          </dd>
          <dt className="text-gray-500">Significado</dt>
          <dd className="font-medium text-gray-900">{meaning}</dd>
        </dl>

        <label className="block text-sm font-medium text-gray-700">
          Contraseña
          <input
            type="password"
            autoComplete="current-password"
            value={password}
            onChange={(e) => onChange(e.target.value)}
            placeholder="Escribe tu contraseña para firmar"
            className="input-field mt-1"
          />
        </label>
        <p className="text-[11px] leading-snug text-gray-500">
          Equivale a tu firma autógrafa y queda registrada con fecha y hora.
        </p>
      </div>
    </div>
  )
}

export default SignatureField
