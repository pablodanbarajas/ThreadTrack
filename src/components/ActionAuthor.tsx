import { PenLine } from 'lucide-react'

interface Props {
  performedBy?: string | null
  recordedByName?: string | null
  recordedByEmail?: string | null
  signed?: boolean
  className?: string
}

/**
 * Quién registró una acción. Desde que cada persona usa su propia cuenta,
 * el responsable es el usuario en sesión (nombre + correo). En registros
 * anteriores, el responsable se capturaba a mano y se muestra aparte.
 */
const ActionAuthor = ({ performedBy, recordedByName, recordedByEmail, signed, className = '' }: Props) => {
  const name = recordedByName || performedBy || recordedByEmail || 'Sin registro'
  const legacyResponsible = !recordedByName && performedBy && recordedByEmail && performedBy !== recordedByEmail
  return (
    <div className={`text-xs ${className}`}>
      <p className="text-gray-600">
        Registró: <span className="font-medium text-gray-900">{legacyResponsible ? recordedByEmail : name}</span>
        {!legacyResponsible && recordedByEmail && recordedByEmail !== name && <span className="text-gray-400"> · {recordedByEmail}</span>}
      </p>
      {legacyResponsible && <p className="text-gray-500">Responsable capturado: {performedBy}</p>}
      {signed && (
        <p className="mt-0.5 inline-flex items-center gap-1 font-medium text-blue-700">
          <PenLine className="h-3 w-3" /> Firmado electrónicamente
        </p>
      )}
    </div>
  )
}

export default ActionAuthor
