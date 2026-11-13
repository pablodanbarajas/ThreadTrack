import { useEffect, useState } from 'react'
import { PenLine } from 'lucide-react'
import { getSignature, type SignatureManifest } from '../services/signatureLookup'

interface Props {
  performedBy?: string | null
  recordedByName?: string | null
  recordedByEmail?: string | null
  /** Id de la firma electrónica de la acción, si la tiene */
  signatureId?: string | null
  className?: string
}

/**
 * Quién registró una acción. Desde que cada persona usa su propia cuenta,
 * el responsable es el usuario en sesión (nombre + correo). En registros
 * anteriores, el responsable se capturaba a mano y se muestra aparte.
 * Si la acción está firmada, muestra el nombre impreso del firmante, la
 * fecha y hora y el significado de la firma (21 CFR Part 11 §11.50).
 */
const ActionAuthor = ({ performedBy, recordedByName, recordedByEmail, signatureId, className = '' }: Props) => {
  const name = recordedByName || performedBy || recordedByEmail || 'Sin registro'
  const legacyResponsible = !recordedByName && performedBy && recordedByEmail && performedBy !== recordedByEmail
  const [sig, setSig] = useState<SignatureManifest | null>(null)

  useEffect(() => {
    if (!signatureId) return
    let alive = true
    getSignature(signatureId).then((s) => { if (alive) setSig(s) })
    return () => { alive = false }
  }, [signatureId])

  return (
    <div className={`text-xs ${className}`}>
      <p className="text-gray-600">
        Registró: <span className="font-medium text-gray-900">{legacyResponsible ? recordedByEmail : name}</span>
        {!legacyResponsible && recordedByEmail && recordedByEmail !== name && <span className="text-gray-400"> · {recordedByEmail}</span>}
      </p>
      {legacyResponsible && <p className="text-gray-500">Responsable capturado: {performedBy}</p>}
      {signatureId && (
        <div className="mt-1 rounded-md bg-blue-50 px-2 py-1 text-blue-900 ring-1 ring-inset ring-blue-100">
          <p className="inline-flex items-center gap-1 font-semibold">
            <PenLine className="h-3 w-3" /> Firmado electrónicamente
          </p>
          {sig && (
            <p className="text-blue-800">
              {sig.user_name || sig.user_email} · {new Date(sig.signed_at).toLocaleString('es-MX')}
              <span className="block italic">“{sig.meaning}”</span>
            </p>
          )}
        </div>
      )}
    </div>
  )
}

export default ActionAuthor
