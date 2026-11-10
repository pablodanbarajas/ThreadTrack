import type { ReactNode } from 'react'
import { AlertCircle, AlertTriangle, CheckCircle2, Info } from 'lucide-react'
import { dotColor } from '../../lib/tones'
import type { IndicatorTone } from '../../lib/tones'

/** Punto de color: el único elemento que lleva el color del estado */
export const StatusDot = ({ tone, className = '' }: { tone: IndicatorTone; className?: string }) => (
  <span className={`inline-block h-2 w-2 shrink-0 rounded-full ${dotColor[tone]} ${className}`} />
)

/** Etiqueta neutra con punto indicador */
export const StatusBadge = ({ tone, children, className = '' }: { tone: IndicatorTone; children: ReactNode; className?: string }) => (
  <span className={`inline-flex items-center gap-1.5 rounded-full border border-gray-200 bg-white px-2 py-0.5 text-xs font-medium text-gray-700 ${className}`}>
    <StatusDot tone={tone} />
    {children}
  </span>
)

const noticeIcon = { info: Info, success: CheckCircle2, warning: AlertTriangle, error: AlertCircle }
const noticeColor = {
  info: { bar: 'bg-blue-500', icon: 'text-blue-600' },
  success: { bar: 'bg-emerald-500', icon: 'text-emerald-600' },
  warning: { bar: 'bg-amber-500', icon: 'text-amber-600' },
  error: { bar: 'bg-red-500', icon: 'text-red-600' },
}

/** Mensaje en línea: fondo neutro, el color solo en la franja e ícono */
export const Notice = ({ tone = 'info', title, children, className = '', action }: {
  tone?: keyof typeof noticeColor
  title?: ReactNode
  children?: ReactNode
  className?: string
  action?: ReactNode
}) => {
  const Icon = noticeIcon[tone]
  const c = noticeColor[tone]
  return (
    <div className={`flex overflow-hidden rounded-lg border border-gray-200 bg-white ${className}`} role={tone === 'error' ? 'alert' : 'status'}>
      <span className={`w-1 shrink-0 ${c.bar}`} />
      <div className="flex flex-1 items-start gap-2 px-3 py-2.5">
        <Icon className={`mt-0.5 h-4 w-4 shrink-0 ${c.icon}`} />
        <div className="flex-1 text-sm text-gray-700">
          {title && <p className="font-medium text-gray-900">{title}</p>}
          {children}
        </div>
        {action}
      </div>
    </div>
  )
}
