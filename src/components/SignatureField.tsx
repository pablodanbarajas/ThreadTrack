import { useEffect, useState } from 'react'
import { PenLine } from 'lucide-react'
import { useAuth } from '../contexts/AuthContext'
import { signatureService } from '../services/accessService'

interface SignatureFieldProps {
  meaning: string
  password: string
  onChange: (password: string) => void
}

/**
 * Firma electrónica (21 CFR Part 11 §11.50 / §11.200).
 * Muestra el nombre impreso del firmante y el significado de la firma, y pide
 * la contraseña, que se verifica en el servidor (signatureService.sign).
 * En la primera firma de la sesión pide también el usuario (correo): los dos
 * componentes de identificación (§11.200(a)(1)(i)).
 */
const SignatureField = ({ meaning, password, onChange }: SignatureFieldProps) => {
  const { user, displayName } = useAuth()
  const [needsUserId, setNeedsUserId] = useState(false)
  const [userId, setUserId] = useState('')

  useEffect(() => {
    let alive = true
    signatureService.requiresUserId().then((v) => { if (alive) setNeedsUserId(v) })
    return () => { alive = false; signatureService.setUserId('') }
  }, [])

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

        {needsUserId && (
          <label className="block text-sm font-medium text-gray-700">
            Usuario (correo)
            <input
              type="email"
              autoComplete="username"
              value={userId}
              onChange={(e) => { setUserId(e.target.value); signatureService.setUserId(e.target.value) }}
              placeholder="Primera firma de la sesión: escribe tu correo"
              className="input-field mt-1"
            />
          </label>
        )}
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
          {needsUserId && ' En las siguientes firmas de esta sesión bastará tu contraseña.'}
        </p>
      </div>
    </div>
  )
}

export default SignatureField
