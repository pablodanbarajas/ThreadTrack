import { createContext, useContext } from 'react'

export type Tone = 'success' | 'error' | 'warning' | 'info'

export interface ConfirmOptions {
  title: string
  message?: string
  confirmLabel?: string
  cancelLabel?: string
  /** 'danger' pinta el botón de confirmar en rojo */
  variant?: 'default' | 'danger'
}

export interface PromptOptions extends ConfirmOptions {
  label?: string
  placeholder?: string
  /** Si es true no permite confirmar con el campo vacío */
  required?: boolean
  multiline?: boolean
}

export interface FeedbackApi {
  toast: (message: string, tone?: Tone) => void
  success: (message: string) => void
  error: (message: string) => void
  /** Diálogo de confirmación nativo de la app. Resuelve true si el usuario confirma. */
  confirm: (options: ConfirmOptions) => Promise<boolean>
  /** Diálogo con campo de texto. Resuelve el texto o null si se cancela. */
  prompt: (options: PromptOptions) => Promise<string | null>
}

export const FeedbackContext = createContext<FeedbackApi | null>(null)

export const useFeedback = (): FeedbackApi => {
  const ctx = useContext(FeedbackContext)
  if (!ctx) throw new Error('useFeedback debe usarse dentro de FeedbackProvider')
  return ctx
}
