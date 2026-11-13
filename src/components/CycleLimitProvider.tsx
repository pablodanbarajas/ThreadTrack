import { useCallback, useRef, useState, type ReactNode } from 'react'
import { AlertTriangle, Loader2, ShieldCheck } from 'lucide-react'
import { supabase } from '../lib/supabase'
import {
  CycleLimitContext, CycleLimitCancelled, isCycleLimitError,
  type CycleLimitApi, type CycleLimitKind,
} from './cycle-limit-context'

interface Pending {
  kind: CycleLimitKind
  ids: string[]
  message: string
  resolve: (authorized: boolean) => void
}

/**
 * Autorización para exceder el límite de ciclos (prendas 100, mangueras 200).
 * La base detiene el registro; aquí se muestra la advertencia y un supervisor,
 * jefe o administrador autoriza con su usuario y contraseña. La autorización
 * queda como firma electrónica del superior ligada a la acción.
 */
const CycleLimitProvider = ({ children }: { children: ReactNode }) => {
  const [pending, setPending] = useState<Pending | null>(null)
  const [email, setEmail] = useState('')
  const [password, setPassword] = useState('')
  const [error, setError] = useState<string | null>(null)
  const [busy, setBusy] = useState(false)
  const pendingRef = useRef<Pending | null>(null)

  const ask = (kind: CycleLimitKind, ids: string[], message: string) =>
    new Promise<boolean>((resolve) => {
      const p = { kind, ids, message, resolve }
      pendingRef.current = p
      setEmail('')
      setPassword('')
      setError(null)
      setPending(p)
    })

  const close = (authorized: boolean) => {
    pendingRef.current?.resolve(authorized)
    pendingRef.current = null
    setPending(null)
    setPassword('')
  }

  const authorize = async (e: React.FormEvent) => {
    e.preventDefault()
    if (!pending) return
    setBusy(true)
    setError(null)
    try {
      const { data, error: rpcError } = await supabase.rpc('authorize_cycle_limit', {
        p_kind: pending.kind,
        p_ids: pending.ids,
        p_email: email.trim(),
        p_password: password,
      })
      if (rpcError) throw rpcError
      if (!data?.ok) throw new Error(data?.error || 'Autorización rechazada')
      close(true)
    } catch (err) {
      setError((err as Error).message)
    } finally {
      setBusy(false)
    }
  }

  const withCycleLimit = useCallback<CycleLimitApi['withCycleLimit']>(async (kind, ids, action) => {
    // Hasta 3 intentos: el registro, y reintentos tras cada autorización
    for (let attempt = 0; ; attempt++) {
      try {
        return await action()
      } catch (err) {
        if (!isCycleLimitError(err) || attempt >= 3) throw err
        const ok = await ask(kind, ids, (err as Error).message)
        if (!ok) throw new CycleLimitCancelled()
      }
    }
  }, [])

  const what = pending?.kind === 'manguera' ? 'mangueras' : 'prendas'

  return (
    <CycleLimitContext.Provider value={{ withCycleLimit }}>
      {children}
      {pending && (
        <div className="fixed inset-0 z-[70] flex items-center justify-center bg-slate-900/50 p-4" role="alertdialog" aria-modal="true">
          <form onSubmit={authorize} className="w-full max-w-md overflow-hidden rounded-xl bg-white shadow-xl">
            <div className="flex items-start gap-3 border-b border-amber-200 bg-amber-50 px-5 py-4">
              <AlertTriangle className="mt-0.5 h-6 w-6 shrink-0 text-amber-600" />
              <div>
                <h2 className="font-semibold text-gray-900">Límite de ciclos alcanzado</h2>
                <p className="mt-1 text-sm text-amber-900">{pending.message}</p>
              </div>
            </div>

            <div className="space-y-3 p-5">
              <p className="text-sm text-gray-600">
                Continúa solo si se verificó que {pending.ids.length > 1 ? `las ${what}` : pending.kind === 'manguera' ? 'la manguera' : 'la prenda'} sigue en
                condiciones de uso. La autorización queda registrada como <b>firma electrónica del superior</b> en la acción y en el audit trail.
              </p>
              <div className="flex items-center gap-2 rounded-lg bg-slate-50 px-3 py-2 text-xs text-gray-600 ring-1 ring-inset ring-gray-200">
                <ShieldCheck className="h-4 w-4 shrink-0 text-blue-600" />
                Autoriza un supervisor, jefe o administrador del módulo de {what}.
              </div>
              {error && <p className="text-sm text-red-600">{error}</p>}
              <label className="block text-sm font-medium text-gray-700">
                Usuario (correo) del superior
                <input type="email" autoComplete="off" value={email} onChange={(e) => setEmail(e.target.value)}
                  className="input-field mt-1" required autoFocus />
              </label>
              <label className="block text-sm font-medium text-gray-700">
                Contraseña del superior
                <input type="password" autoComplete="off" value={password} onChange={(e) => setPassword(e.target.value)}
                  className="input-field mt-1" required />
              </label>
            </div>

            <div className="flex gap-2 border-t border-gray-200 px-5 py-3">
              <button type="button" onClick={() => close(false)} disabled={busy} className="btn-secondary flex-1">Cancelar</button>
              <button type="submit" disabled={busy || !email || !password} className="btn-primary flex flex-1 items-center justify-center gap-2 disabled:opacity-50">
                {busy && <Loader2 className="h-4 w-4 animate-spin" />}
                Autorizar y continuar
              </button>
            </div>
          </form>
        </div>
      )}
    </CycleLimitContext.Provider>
  )
}

export default CycleLimitProvider
