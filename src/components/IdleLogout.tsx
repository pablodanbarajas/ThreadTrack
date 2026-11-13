import { useCallback, useEffect, useRef, useState } from 'react'
import { Clock } from 'lucide-react'
import { useAuth } from '../contexts/AuthContext'

/** Minutos sin actividad antes de cerrar la sesión */
export const IDLE_LIMIT_MIN = 15
const WARN_BEFORE_S = 60
const STORAGE_KEY = 'threadtrack.lastActivity'

const now = () => Date.now()
const readLast = () => {
  try { return Number(localStorage.getItem(STORAGE_KEY)) || now() } catch { return now() }
}
const writeLast = (t: number) => {
  try { localStorage.setItem(STORAGE_KEY, String(t)) } catch { /* sin almacenamiento */ }
}

/**
 * Cierre automático de sesión por inactividad (21 CFR Part 11 §11.10(d) y
 * §11.300; EU GMP Anexo 11 §12). La actividad se comparte entre pestañas para
 * que una pestaña abierta en segundo plano no cierre la sesión de otra en uso.
 */
const IdleLogout = () => {
  const { user, signOut } = useAuth()
  const [secondsLeft, setSecondsLeft] = useState<number | null>(null)
  const lastWrite = useRef(0)

  const touch = useCallback(() => {
    const t = now()
    if (t - lastWrite.current > 5000) {  // no escribir en cada movimiento
      lastWrite.current = t
      writeLast(t)
    }
  }, [])

  useEffect(() => {
    if (!user) return
    writeLast(now())
    const events = ['mousedown', 'keydown', 'touchstart', 'scroll', 'wheel'] as const
    events.forEach((e) => window.addEventListener(e, touch, { passive: true }))

    const timer = window.setInterval(() => {
      const idleMs = now() - readLast()
      const remaining = Math.ceil((IDLE_LIMIT_MIN * 60 * 1000 - idleMs) / 1000)
      if (remaining <= 0) {
        setSecondsLeft(null)
        try { sessionStorage.setItem('threadtrack.logoutReason', 'inactividad') } catch { /* sin almacenamiento */ }
        signOut()
      } else {
        setSecondsLeft(remaining <= WARN_BEFORE_S ? remaining : null)
      }
    }, 1000)

    return () => {
      events.forEach((e) => window.removeEventListener(e, touch))
      window.clearInterval(timer)
    }
  }, [user, signOut, touch])

  if (secondsLeft === null) return null

  return (
    <div className="fixed inset-0 z-[60] flex items-center justify-center bg-slate-900/50 p-4" role="alertdialog" aria-modal="true">
      <div className="w-full max-w-sm rounded-xl bg-white p-6 text-center shadow-xl">
        <div className="mx-auto mb-3 flex h-12 w-12 items-center justify-center rounded-full bg-amber-50 text-amber-600">
          <Clock className="h-6 w-6" />
        </div>
        <h2 className="text-lg font-semibold text-gray-900">¿Sigues ahí?</h2>
        <p className="mt-1 text-sm text-gray-600">
          Por seguridad, tu sesión se cerrará en <b className="text-gray-900">{secondsLeft} s</b> por inactividad.
        </p>
        <div className="mt-5 flex gap-2">
          <button onClick={() => signOut()} className="btn-secondary flex-1">Cerrar sesión</button>
          <button onClick={() => { writeLast(now()); setSecondsLeft(null) }} className="btn-primary flex-1">Seguir conectado</button>
        </div>
      </div>
    </div>
  )
}

export default IdleLogout
