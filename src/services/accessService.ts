import { supabase } from '../lib/supabase'

export interface LoginGate {
  allowed: boolean
  locked_until?: string | null
}

const formatLockMessage = (lockedUntil?: string | null) => {
  const until = lockedUntil ? new Date(lockedUntil).toLocaleTimeString('es-MX', { hour: '2-digit', minute: '2-digit' }) : null
  return `Cuenta bloqueada por intentos fallidos${until ? ` hasta las ${until}` : ''}. Contacta al administrador si necesitas acceso antes.`
}

export const accessService = {
  formatLockMessage,

  // Antes de intentar entrar: ¿la cuenta está bloqueada?
  async checkLoginAllowed(email: string): Promise<LoginGate> {
    const { data, error } = await supabase.rpc('check_login_allowed', { p_email: email })
    if (error) return { allowed: true } // si falla la consulta no se bloquea el acceso por error de red
    return data as LoginGate
  },

  // Supabase rechazó la contraseña: registrar el fallo (puede bloquear la cuenta)
  async recordFailedLogin(email: string): Promise<LoginGate> {
    const { data, error } = await supabase.rpc('record_failed_login', { p_email: email })
    if (error) return { allowed: true }
    return data as LoginGate
  },

  // Con sesión iniciada: registrar el acceso exitoso
  async recordSuccessfulLogin(): Promise<LoginGate> {
    const { data, error } = await supabase.rpc('record_successful_login')
    if (error) return { allowed: true }
    return data as LoginGate
  },

  async unlockAccount(email: string, reason: string): Promise<void> {
    const { error } = await supabase.rpc('unlock_account', { p_email: email, p_reason: reason })
    if (error) throw error
  },
}

// ------------------------------------------------------------
// Firma electrónica (21 CFR Part 11)
// ------------------------------------------------------------
// 1) request_signature(contraseña) la verifica en el servidor y emite un token
//    válido 5 minutos para el mismo usuario.
// 2) Las acciones críticas reciben ese token.
// Usuario (correo) capturado en el campo de firma. La primera firma de cada
// sesión exige usuario + contraseña (21 CFR Part 11 §11.200(a)(1)); el campo
// de firma lo guarda aquí y sign() lo envía junto con la contraseña.
let pendingUserId = ''

export const signatureService = {
  setUserId(userId: string) {
    pendingUserId = userId
  },

  async requiresUserId(): Promise<boolean> {
    const { data, error } = await supabase.rpc('signature_requires_user_id')
    if (error) return true
    return data !== false
  },

  async sign(password: string): Promise<string> {
    if (!password) throw new Error('La firma electrónica requiere tu contraseña')
    const { data, error } = await supabase.rpc('request_signature', {
      p_password: password,
      p_user_id: pendingUserId.trim() || null,
    })
    if (error) throw error
    if (!data?.ok) {
      if (data?.locked) throw new Error(formatLockMessage(null))
      throw new Error(data?.error || 'Firma electrónica rechazada')
    }
    pendingUserId = ''
    return data.token as string
  },
}
