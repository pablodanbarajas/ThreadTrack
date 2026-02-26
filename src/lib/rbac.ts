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
    canManageUsers: true,
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
  jefe: 'Acceso total al sistema. Puede crear, editar, eliminar prendas, autorizar estados, ver reportes y gestionar usuarios.',
  supervisor: 'Puede ver todo, crear y editar prendas, autorizar cambios de estado y generar reportes. No puede eliminar prendas ni gestionar usuarios.',
  operador: 'Puede registrar acciones (lavado, esterilización, reparación, inspección) en prendas. Acceso de solo lectura a inventario.'
}

/**
 * Etiquetas de rol para mostrar en UI
 */
export const roleBadges: Record<UserRole, { label: string; color: string }> = {
  jefe: { label: 'Jefe', color: 'bg-red-100 text-red-800' },
  supervisor: { label: 'Supervisor', color: 'bg-blue-100 text-blue-800' },
  operador: { label: 'Operador', color: 'bg-green-100 text-green-800' }
}
