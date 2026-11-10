import type { UserRole } from '../contexts/AuthContext'

/**
 * Control de acceso basado en roles (RBAC)
 * Define qué acciones puede realizar cada rol
 */

export const rolePermissions: Record<UserRole, {
  canViewInventory: boolean
  canCreateGarment: boolean
  canEditGarment: boolean
  canDeleteGarment: boolean
  canRecordAction: boolean
  canAuthorizeStatus: boolean
  canViewReports: boolean
  canDownloadReport: boolean
  canManageUsers: boolean
  canViewAllGarments: boolean
  canViewAssignedOnly: boolean
}> = {
  jefe: {
    canViewInventory: true,
    canCreateGarment: true,
    canEditGarment: true,
    canDeleteGarment: true,
    canRecordAction: true,
    canAuthorizeStatus: true,
    canViewReports: true,
    canDownloadReport: true,
    canManageUsers: false,
    canViewAllGarments: true,
    canViewAssignedOnly: false
  },
  supervisor: {
    canViewInventory: true,
    canCreateGarment: true,
    canEditGarment: true,
    canDeleteGarment: false,
    canRecordAction: true,
    canAuthorizeStatus: true,
    canViewReports: true,
    canDownloadReport: true,
    canManageUsers: false,
    canViewAllGarments: true,
    canViewAssignedOnly: false
  },
  operador: {
    canViewInventory: true,
    canCreateGarment: false,
    canEditGarment: false,
    canDeleteGarment: false,
    canRecordAction: true,
    canAuthorizeStatus: false,
    canViewReports: false,
    canDownloadReport: false,
    canManageUsers: false,
    canViewAllGarments: true,
    canViewAssignedOnly: false
  },
  administrador: {
    canViewInventory: true,
    canCreateGarment: true,
    canEditGarment: true,
    canDeleteGarment: true,
    canRecordAction: true,
    canAuthorizeStatus: true,
    canViewReports: true,
    canDownloadReport: true,
    canManageUsers: true,
    canViewAllGarments: true,
    canViewAssignedOnly: false
  }
}

// Funciones helper para verificar permisos
export const canUserAction = (role: UserRole | null, action: keyof typeof rolePermissions['jefe']): boolean => {
  if (!role) return false
  return rolePermissions[role][action]
}

/**
 * Mensajes descriptivos para cada rol
 */
export const roleDescriptions: Record<UserRole, string> = {
  administrador: 'Administra a los usuarios de su empresa en los módulos que tiene asignados: alta, roles, módulos, restablecer contraseña y desactivar. Además tiene todos los permisos de jefe.',
  jefe: 'Crea, edita y archiva prendas y equipos, autoriza bajas con firma electrónica y consulta reportes históricos.',
  supervisor: 'Crea y edita prendas y equipos, autoriza bajas e inspecciones con firma electrónica y consulta reportes. No archiva.',
  operador: 'Registra lavado/esterilización, inspecciones y uso de mangueras. No edita, no da de baja y no consulta reportes.',
}

/**
 * Etiquetas de rol para mostrar en UI
 */
export const roleBadges: Record<UserRole, { label: string; color: string }> = {
  jefe: { label: 'Jefe', color: 'border border-gray-200 bg-white text-gray-700' },
  supervisor: { label: 'Supervisor', color: 'border border-gray-200 bg-white text-gray-700' },
  operador: { label: 'Operador', color: 'border border-gray-200 bg-white text-gray-700' },
  administrador: { label: 'Administrador', color: 'border border-gray-200 bg-white text-gray-700' }
}
