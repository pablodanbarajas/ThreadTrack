import { createContext, useContext, useEffect, useState } from 'react'
import type { ReactNode } from 'react'
import type { User, Session } from '@supabase/supabase-js'
import { supabase } from '../lib/supabase'
import { accessService } from '../services/accessService'

// 'administrador' es el rol efectivo también del superadmin (Grupo CSCI);
// lo que distingue al superadmin es isSuperadmin.
export type UserRole = 'jefe' | 'supervisor' | 'operador' | 'administrador'
export type AccessModule = 'prendas' | 'mangueras' | 'ambos'
export type AppModule = 'prendas' | 'mangueras'
export const ALL_MODULES: AppModule[] = ['prendas', 'mangueras']
export const moduleLabels: Record<AppModule, string> = { prendas: 'Prendas', mangueras: 'Mangueras' }

interface AuthContextType {
  user: User | null
  session: Session | null
  role: UserRole | null
  accessModule: AccessModule | null
  modules: AppModule[]
  isSuperadmin: boolean
  organizationId: string | null
  mustChangePassword: boolean
  passwordChangeReason: 'temporal' | 'expirada' | null
  refreshProfile: () => Promise<void>
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
  const { role, accessModule, modules, isSuperadmin } = useAuth()

  return {
    role,
    accessModule,
    modules,
    isSuperadmin,
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
    canViewPrendas: isSuperadmin || modules.includes('prendas'),
    canViewMangueras: isSuperadmin || modules.includes('mangueras')
  }
}

export const AuthProvider = ({ children }: { children: ReactNode }) => {
  const [user, setUser] = useState<User | null>(null)
  const [session, setSession] = useState<Session | null>(null)
  const [role, setRole] = useState<UserRole | null>(null)
  const [modules, setModules] = useState<AppModule[]>([])
  const [isSuperadmin, setIsSuperadmin] = useState(false)
  const [organizationId, setOrganizationId] = useState<string | null>(null)
  const [mustChangePassword, setMustChangePassword] = useState(false)
  const [passwordChangeReason, setPasswordChangeReason] = useState<'temporal' | 'expirada' | null>(null)
  const [loading, setLoading] = useState(true)

  const accessModule: AccessModule | null = modules.length === 0
    ? null
    : modules.includes('prendas') && modules.includes('mangueras') ? 'ambos' : modules[0]

  const clearProfile = () => {
    setRole(null)
    setModules([])
    setIsSuperadmin(false)
    setOrganizationId(null)
    setMustChangePassword(false)
    setPasswordChangeReason(null)
  }

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
        clearProfile()
        setLoading(false)
      }
    })

    return () => subscription.unsubscribe()
  }, [])

  const loadUserRole = async (userId: string) => {
    try {
      const { data, error } = await supabase
        .from('user_profiles')
        .select('role, modules, organization_id, is_active')
        .eq('id', userId)
        .single()

      if (error || !data) {
        console.error('Error cargando perfil:', error)
        clearProfile()
      } else if (data.is_active === false) {
        // Usuario desactivado con una sesión abierta: cerrarla
        await supabase.auth.signOut()
        clearProfile()
      } else {
        const superadmin = data.role === 'superadmin'
        setIsSuperadmin(superadmin)
        setRole(superadmin ? 'administrador' : (data.role as UserRole))
        setModules(superadmin ? ALL_MODULES : ((data.modules ?? []) as AppModule[]))
        setOrganizationId(data.organization_id ?? null)

        // Contraseña temporal o caducada => debe cambiarla antes de continuar
        const { data: pwd } = await supabase.rpc('get_my_password_status')
        setMustChangePassword(!!pwd?.must_change)
        setPasswordChangeReason(pwd?.reason ?? null)
      }
    } catch (error) {
      console.error('Error:', error)
      clearProfile()
    } finally {
      setLoading(false)
    }
  }

  const refreshProfile = async () => {
    const { data } = await supabase.auth.getUser()
    if (data.user) await loadUserRole(data.user.id)
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
    clearProfile()
  }

  return (
    <AuthContext.Provider value={{
      user, session, role, accessModule, modules, isSuperadmin, organizationId,
      mustChangePassword, passwordChangeReason, refreshProfile, loading, signIn, signOut,
    }}>
      {children}
    </AuthContext.Provider>
  )
}
