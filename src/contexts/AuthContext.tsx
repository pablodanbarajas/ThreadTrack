import { createContext, useContext, useEffect, useState } from 'react'
import type { ReactNode } from 'react'
import type { User, Session } from '@supabase/supabase-js'
import { supabase } from '../lib/supabase'
import { accessService } from '../services/accessService'

export type UserRole = 'jefe' | 'supervisor' | 'operador' | 'administrador'
export type AccessModule = 'prendas' | 'mangueras' | 'ambos'

interface AuthContextType {
  user: User | null
  session: Session | null
  role: UserRole | null
  accessModule: AccessModule | null
  loading: boolean
  signIn: (email: string, password: string) => Promise<{ error: any }>
  signOut: () => Promise<void>
}

const AuthContext = createContext<AuthContextType | undefined>(undefined)

export const useAuth = () => {
  const context = useContext(AuthContext)
  if (!context) {
    throw new Error('useAuth debe usarse dentro de AuthProvider')
  }
  return context
}

// Hook para verificar permisos
export const useRole = () => {
  const { role, accessModule } = useAuth()
  const isAdministrador = role === 'administrador'

  return {
    role,
    accessModule,
    isJefe: role === 'jefe',
    isSupervisor: role === 'supervisor',
    isOperador: role === 'operador',
    isAdministrador: role === 'administrador',
    canViewReports: role === 'jefe' || role === 'supervisor' || role === 'administrador',
    canCreateGarment: role === 'jefe' || role === 'supervisor' || role === 'administrador',
    canEditGarment: role === 'jefe' || role === 'supervisor' || role === 'administrador',
    canDeleteGarment: role === 'jefe' || role === 'administrador',
    canRecordAction: role !== null,
    canAuthorizeStatus: role === 'jefe' || role === 'supervisor' || role === 'administrador',
    canManageUsers: role === 'administrador',
    canManageAssignments: role === 'administrador',
    canDownloadReport: role === 'jefe' || role === 'supervisor' || role === 'administrador',
    canViewHoses: role !== null,
    canCreateEquipment: role === 'jefe' || role === 'supervisor' || role === 'administrador',
    canDeleteEquipment: role === 'jefe' || role === 'administrador',
    canRegisterHoseAction: role !== null,
    canReplaceHose: role === 'jefe' || role === 'supervisor' || role === 'administrador',
    canViewPrendas: isAdministrador || accessModule !== 'mangueras',
    canViewMangueras: isAdministrador || accessModule !== 'prendas'
  }
}

export const AuthProvider = ({ children }: { children: ReactNode }) => {
  const [user, setUser] = useState<User | null>(null)
  const [session, setSession] = useState<Session | null>(null)
  const [role, setRole] = useState<UserRole | null>(null)
  const [accessModule, setAccessModule] = useState<AccessModule | null>(null)
  const [loading, setLoading] = useState(true)

  useEffect(() => {
    // Obtener sesión actual
    supabase.auth.getSession().then(({ data: { session } }) => {
      setSession(session)
      setUser(session?.user ?? null)
      if (session?.user) {
        loadUserRole(session.user.id)
      } else {
        setLoading(false)
      }
    })

    // Escuchar cambios de autenticación
    const { data: { subscription } } = supabase.auth.onAuthStateChange((_event, session) => {
      setSession(session)
      setUser(session?.user ?? null)
      if (session?.user) {
        loadUserRole(session.user.id)
      } else {
        setRole(null)
        setAccessModule(null)
        setLoading(false)
      }
    })

    return () => subscription.unsubscribe()
  }, [])

  const loadUserRole = async (userId: string) => {
    try {
      const { data, error } = await supabase
        .from('user_profiles')
        .select('role, access_module, is_active')
        .eq('id', userId)
        .single()

      if (error) {
        console.error('Error cargando rol:', error)
        setRole(null)
        setAccessModule(null)
      } else if (data && data.is_active === false) {
        // Usuario desactivado con una sesión abierta: cerrarla
        await supabase.auth.signOut()
        setRole(null)
        setAccessModule(null)
      } else {
        setRole(data?.role || 'operador')
        setAccessModule(data?.access_module || 'ambos')
      }
    } catch (error) {
      console.error('Error:', error)
      setRole(null)
      setAccessModule(null)
    } finally {
      setLoading(false)
    }
  }

  const signIn = async (email: string, password: string) => {
    const normalizedEmail = email.trim().toLowerCase()

    // 1. ¿Cuenta bloqueada por intentos fallidos?
    const gate = await accessService.checkLoginAllowed(normalizedEmail)
    if (!gate.allowed) {
      return { error: { message: accessService.formatLockMessage(gate.locked_until) } }
    }

    // 2. Autenticación en Supabase
    const { error } = await supabase.auth.signInWithPassword({ email: normalizedEmail, password })

    if (error) {
      // Usuario desactivado por el administrador (banned_until)
      if (/banned/i.test(error.message)) {
        return { error: { message: 'Tu cuenta está desactivada. Contacta al administrador.' } }
      }
      const after = await accessService.recordFailedLogin(normalizedEmail)
      if (!after.allowed) {
        return { error: { message: accessService.formatLockMessage(after.locked_until) } }
      }
      return { error: { message: 'Credenciales inválidas' } }
    }

    // 3. Registrar acceso exitoso (y rechazar si la cuenta quedó bloqueada)
    const ok = await accessService.recordSuccessfulLogin()
    if (!ok.allowed) {
      await supabase.auth.signOut()
      return { error: { message: accessService.formatLockMessage(ok.locked_until) } }
    }
    return { error: null }
  }

  const signOut = async () => {
    await supabase.auth.signOut()
    setRole(null)
    setAccessModule(null)
  }

  return (
    <AuthContext.Provider value={{ user, session, role, accessModule, loading, signIn, signOut }}>
      {children}
    </AuthContext.Provider>
  )
}
