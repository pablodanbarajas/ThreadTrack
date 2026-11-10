import { useCallback, useEffect, useMemo, useRef, useState } from 'react'
import type { ReactNode } from 'react'
import { CheckCircle2, AlertCircle, AlertTriangle, Info, X } from 'lucide-react'
import { FeedbackContext } from './feedback-context'
import type { ConfirmOptions, FeedbackApi, PromptOptions, Tone } from './feedback-context'

interface ToastItem {
  id: number
  message: string
  tone: Tone
}

type DialogState =
  | { kind: 'confirm'; options: ConfirmOptions; resolve: (v: boolean) => void }
  | { kind: 'prompt'; options: PromptOptions; resolve: (v: string | null) => void }

const toneStyle: Record<Tone, { icon: typeof Info; color: string; bar: string }> = {
  success: { icon: CheckCircle2, color: 'text-emerald-600', bar: 'bg-emerald-500' },
  error: { icon: AlertCircle, color: 'text-red-600', bar: 'bg-red-500' },
  warning: { icon: AlertTriangle, color: 'text-amber-600', bar: 'bg-amber-500' },
  info: { icon: Info, color: 'text-blue-600', bar: 'bg-blue-500' },
}

const Dialog = ({ state, onClose }: { state: DialogState; onClose: () => void }) => {
  const { options } = state
  const [value, setValue] = useState('')
  const inputRef = useRef<HTMLInputElement & HTMLTextAreaElement>(null)
  const isPrompt = state.kind === 'prompt'
  const required = isPrompt && (state.options as PromptOptions).required
  const canConfirm = !isPrompt || !required || value.trim().length > 0

  useEffect(() => {
    inputRef.current?.focus()
  }, [])

  const cancel = useCallback(() => {
    if (state.kind === 'confirm') state.resolve(false)
    else state.resolve(null)
    onClose()
  }, [state, onClose])

  const accept = () => {
    if (!canConfirm) return
    if (state.kind === 'confirm') state.resolve(true)
    else state.resolve(value.trim())
    onClose()
  }

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => e.key === 'Escape' && cancel()
    window.addEventListener('keydown', onKey)
    return () => window.removeEventListener('keydown', onKey)
  }, [cancel])

  const promptOptions = options as PromptOptions
  const danger = options.variant === 'danger'

  return (
    <div className="fixed inset-0 z-[70] flex items-center justify-center bg-slate-900/40 p-4" onMouseDown={cancel}>
      <div
        role="dialog"
        aria-modal="true"
        className="w-full max-w-md rounded-xl bg-white shadow-xl border border-gray-200"
        onMouseDown={(e) => e.stopPropagation()}
      >
        <div className="p-5">
          <h2 className="text-base font-semibold text-gray-900">{options.title}</h2>
          {options.message && <p className="mt-1.5 text-sm text-gray-600 whitespace-pre-line">{options.message}</p>}
          {isPrompt && (
            <label className="mt-4 block text-sm font-medium text-gray-700">
              {promptOptions.label ?? 'Motivo'}
              {required && <span className="text-red-500"> *</span>}
              {promptOptions.multiline ? (
                <textarea
                  ref={inputRef}
                  value={value}
                  onChange={(e) => setValue(e.target.value)}
                  placeholder={promptOptions.placeholder}
                  rows={3}
                  className="input-field mt-1"
                />
              ) : (
                <input
                  ref={inputRef}
                  value={value}
                  onChange={(e) => setValue(e.target.value)}
                  onKeyDown={(e) => e.key === 'Enter' && accept()}
                  placeholder={promptOptions.placeholder}
                  className="input-field mt-1"
                />
              )}
            </label>
          )}
        </div>
        <div className="flex justify-end gap-2 border-t border-gray-100 px-5 py-3">
          <button onClick={cancel} className="btn-secondary text-sm">{options.cancelLabel ?? 'Cancelar'}</button>
          <button
            onClick={accept}
            disabled={!canConfirm}
            className={`text-sm font-semibold py-2 px-4 rounded-lg text-white transition-colors disabled:opacity-50 ${
              danger ? 'bg-red-600 hover:bg-red-700' : 'bg-blue-600 hover:bg-blue-700'
            }`}
          >
            {options.confirmLabel ?? 'Aceptar'}
          </button>
        </div>
      </div>
    </div>
  )
}

export const FeedbackProvider = ({ children }: { children: ReactNode }) => {
  const [toasts, setToasts] = useState<ToastItem[]>([])
  const [dialog, setDialog] = useState<DialogState | null>(null)
  const nextId = useRef(1)

  const dismiss = useCallback((id: number) => setToasts((t) => t.filter((x) => x.id !== id)), [])

  const toast = useCallback((message: string, tone: Tone = 'info') => {
    const id = nextId.current++
    setToasts((t) => [...t.slice(-3), { id, message, tone }])
    setTimeout(() => dismiss(id), tone === 'error' ? 7000 : 4000)
  }, [dismiss])

  const api = useMemo<FeedbackApi>(() => ({
    toast,
    success: (m) => toast(m, 'success'),
    error: (m) => toast(m, 'error'),
    confirm: (options) => new Promise<boolean>((resolve) => setDialog({ kind: 'confirm', options, resolve })),
    prompt: (options) => new Promise<string | null>((resolve) => setDialog({ kind: 'prompt', options, resolve })),
  }), [toast])

  return (
    <FeedbackContext.Provider value={api}>
      {children}

      {/* Avisos */}
      <div className="pointer-events-none fixed bottom-4 right-4 z-[80] flex w-[calc(100%-2rem)] max-w-sm flex-col gap-2">
        {toasts.map((t) => {
          const s = toneStyle[t.tone]
          const Icon = s.icon
          return (
            <div key={t.id} role="status"
              className="pointer-events-auto flex overflow-hidden rounded-lg border border-gray-200 bg-white shadow-lg">
              <span className={`w-1 shrink-0 ${s.bar}`} />
              <div className="flex flex-1 items-start gap-2 p-3">
                <Icon className={`mt-0.5 h-4 w-4 shrink-0 ${s.color}`} />
                <p className="flex-1 text-sm text-gray-700">{t.message}</p>
                <button onClick={() => dismiss(t.id)} className="text-gray-400 hover:text-gray-600" aria-label="Cerrar">
                  <X className="h-4 w-4" />
                </button>
              </div>
            </div>
          )
        })}
      </div>

      {dialog && <Dialog state={dialog} onClose={() => setDialog(null)} />}
    </FeedbackContext.Provider>
  )
}
