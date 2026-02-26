# Sistema de Roles y Permisos - ThreadTrack

## 📋 Descripción General

ThreadTrack implementa un sistema de control de acceso basado en roles (RBAC) con tres niveles de permisos:

### 🔐 Roles Disponibles

#### **JEFE** 🔴
- **Acceso**: Control total del sistema
- **Puede hacer**:
  - Ver todo el inventario
  - Crear nuevas prendas
  - Editar información de prendas
  - **Eliminar prendas**
  - Registrar acciones (lavado, inspección, etc.)
  - Autorizar cambios de estado
  - **Ver y descargar reportes en PDF**
  - **Gestionar usuarios y asignar roles**

#### **SUPERVISOR** 🔵
- **Acceso**: Gestión operativa completa
- **Puede hacer**:
  - Ver todo el inventario
  - Crear nuevas prendas
  - Editar información de prendas
  - ❌ NO puede eliminar prendas
  - Registrar acciones (lavado, inspección, etc.)
  - Autorizar cambios de estado
  - **Ver y descargar reportes en PDF**
  - ❌ NO puede gestionar usuarios

#### **OPERADOR** 🟢
- **Acceso**: Operación básica
- **Puede hacer**:
  - Ver todo el inventario (solo lectura)
  - ❌ NO puede crear prendas
  - ❌ NO puede editar prendas
  - Registrar acciones (lavado, esterilización, reparación, inspección)
  - ❌ NO puede autorizar cambios de estado críticos
  - ❌ NO puede descargar reportes
  - ❌ NO puede gestionar usuarios

---

## 🚀 Configuración Inicial

### 1️⃣ Crear tabla en Supabase

1. Abre tu proyecto de Supabase
2. Ve a **SQL Editor**
3. Copia y ejecuta el contenido de `ROLES_SETUP.sql`

Esto crea:
- Tabla `user_profiles` con campo `role`
- Políticas de RLS para seguridad
- Trigger automático para nuevos usuarios
- Índices para mejor rendimiento

### 2️⃣ Crear usuarios en Supabase

1. Ve a **Authentication → Users**
2. Crea los usuarios necesarios (email + password)
3. Anota los IDs de usuario

### 3️⃣ Asignar roles a usuarios

En el **SQL Editor** de Supabase, ejecuta:

```sql
-- Asignar como JEFE
UPDATE public.user_profiles 
SET role = 'jefe' 
WHERE id = '{USER_ID_AQUI}';

-- Asignar como SUPERVISOR
UPDATE public.user_profiles 
SET role = 'supervisor' 
WHERE id = '{USER_ID_AQUI}';

-- Asignar como OPERADOR (es el default, pero puedes ser explícito)
UPDATE public.user_profiles 
SET role = 'operador' 
WHERE id = '{USER_ID_AQUI}';
```

Reemplaza `{USER_ID_AQUI}` con el UUID del usuario.

---

## 📱 Comportamiento en la UI

### Página Home
- **Todos los roles**: Ven resumen de inventario
- **JEFE/SUPERVISOR**: Ven botón "Descargar Reporte" ✅
- **OPERADOR**: No ven botón de reporte ❌
- **Todos**: Se muestra su rol con un badge de color:
  - 🔴 Rojo: JEFE
  - 🔵 Azul: SUPERVISOR
  - 🟢 Verde: OPERADOR

### Página Inventario
- **Crear Prenda**:
  - JEFE/SUPERVISOR: Botón habilitado ✅
  - OPERADOR: Botón deshabilitado ❌
  
- **Registrar Acciones** (Lavado, Esterilización, etc.):
  - JEFE/SUPERVISOR/OPERADOR: Botones habilitados ✅
  
- **Eliminar Prenda**:
  - JEFE: Botón visible ✅
  - SUPERVISOR/OPERADOR: Botón oculto ❌
  
- **Autorizar Estados**:
  - JEFE/SUPERVISOR: Pueden confirmar cambios de estado ✅
  - OPERADOR: Solo puede registrar, los cambios necesitan aprobación ❌

---

## 🔧 Implementación Técnica

### Archivos Clave

1. **`src/contexts/AuthContext.tsx`**
   - Define tipo `UserRole = 'jefe' | 'supervisor' | 'operador'`
   - Hook `useAuth()` - acceso a usuario y rol
   - Hook `useRole()` - acceso a permisos granulares
   - Carga automática del rol desde `user_profiles`

2. **`src/lib/rbac.ts`**
   - Define permisos para cada rol
   - Funciones helper como `canUserAction()`
   - Descripciones y badges de roles

3. **`src/components/ProtectedRoute.tsx`**
   - Valida autenticación general
   - Opcionalmente valida rol específico: `<ProtectedRoute requiredRole="jefe">`

4. **`src/pages/Home.tsx`**
   - Usa `canDownloadReport` para mostrar/ocultar botón
   - Solo carga datos de reportes si tiene permiso

5. **`src/pages/Inventory.tsx`**
   - Usa `canCreateGarment`, `canDeleteGarment`, `canRecordAction`
   - Deshabilita botones según permisos
   - Muestra tooltips en botones deshabilitados

---

## 📊 Matriz de Permisos

| Acción | Jefe | Supervisor | Operador |
|--------|------|------------|----------|
| Ver Inventario | ✅ | ✅ | ✅ |
| Crear Prenda | ✅ | ✅ | ❌ |
| Editar Prenda | ✅ | ✅ | ❌ |
| **Eliminar Prenda** | ✅ | ❌ | ❌ |
| Registrar Acciones | ✅ | ✅ | ✅ |
| Autorizar Estados | ✅ | ✅ | ❌ |
| Ver Reportes | ✅ | ✅ | ❌ |
| Descargar Reportes | ✅ | ✅ | ❌ |
| **Gestionar Usuarios** | ✅ | ❌ | ❌ |

---

## 💡 Ejemplos de Uso

### Verificar permiso en un componente
```tsx
import { useRole } from '../contexts/AuthContext'

function MyComponent() {
  const { isJefe, canCreateGarment, canViewReports } = useRole()
  
  return (
    <>
      {canCreateGarment && <button>Crear Prenda</button>}
      {canViewReports && <button>Ver Reportes</button>}
      {isJefe && <button>Gestionar Usuarios</button>}
    </>
  )
}
```

### Proteger una ruta específica
```tsx
<Route 
  path="/admin/usuarios" 
  element={
    <ProtectedRoute requiredRole="jefe">
      <UsuariosPage />
    </ProtectedRoute>
  } 
/>

// O múltiples roles
<ProtectedRoute requiredRole={['jefe', 'supervisor']}>
  <AdminPage />
</ProtectedRoute>
```

### Agregar validación en el backend (futuro)
```tsx
const deleteGarment = async (id: string) => {
  const { role } = useAuth()
  
  // Validar en frontend
  if (role !== 'jefe') {
    alert('No tienes permiso')
    return
  }
  
  // Tu lógica aquí
}
```

---

## 🔒 Consideraciones de Seguridad

⚠️ **IMPORTANTE**: La validación en frontend es solo para UX.
- Los botones deshabilitados **no previenen** que un usuario malintencionado realice la acción
- **SIEMPRE** valida permisos en el backend (Supabase RLS policies)
- Las políticas de RLS ya están configuradas en `ROLES_SETUP.sql`

### Validación en Backend (Supabase)
```sql
-- Solo jefes pueden eliminar
CREATE POLICY "Only jefe can delete" ON public.garments
  FOR DELETE
  USING (
    auth.uid() IN (
      SELECT id FROM public.user_profiles WHERE role = 'jefe'
    )
  );
```

---

## 🆚 Cambiar rol de un usuario

Si necesitas cambiar el rol de un usuario después, ejecuta en Supabase SQL:

```sql
-- Ver rol actual
SELECT id, role FROM public.user_profiles WHERE id = '{USER_ID}';

-- Cambiar rol
UPDATE public.user_profiles
SET role = 'supervisor', updated_at = CURRENT_TIMESTAMP
WHERE id = '{USER_ID}';
```

El cambio es inmediato si el usuario inicia sesión nuevamente.

---

## 🐛 Troubleshooting

### Usuario ve error de acceso
1. Verifica que existe registro en `user_profiles` para ese usuario
2. Verifica el valor del rol: `SELECT * FROM user_profiles WHERE id = ...`
3. Intenta cerrar sesión y volver a iniciar

### Tabla user_profiles no existe
1. Abre `ROLES_SETUP.sql` en Supabase SQL Editor
2. Copia TODO el contenido
3. Ejecútalo

### El rol no se carga después de creado
1. En Supabase, ve a **Authentication > Providers > Email**
2. Verifica que "Confirm email" está desactivado (para desarrollo)
3. Reinicia el navegador/app

---

## 📈 Próximas Mejoras Sugeridas

- [ ] Panel de administración de usuarios (solo Jefe)
- [ ] Historial de cambios con quién hizo cada acción
- [ ] Reportes con filtro por rol
- [ ] Asignación de prendas a operadores específicos
- [ ] Límites de velocidad en acciones por rol
- [ ] Notificaciones por cambios de estado

---

## 💬 Preguntas Frecuentes

**P: ¿Qué pasa si no se asigna rol a un usuario?**
R: Por defecto obtiene `operador` gracias al trigger en ROLES_SETUP.sql

**P: ¿Puedo crear más roles?**
R: Sí, pero necesitas:
1. Añadir al CHECK constraint en user_profiles
2. Agregar permisos en rbac.ts
3. Actualizar políticas de RLS

**P: ¿Los operadores pueden ver prendas de otros?**
R: Sí, actualmente ven todo el inventario. Para limitar esto, necesitas:
1. Tabla de asignación operador→prenda
2. Políticas RLS más complejas
3. Actualizar filtros en Inventory.tsx

