-- ========================================
-- CONFIGURACIÓN DE ROLES Y PERMISOS
-- ========================================
-- 
-- Ejecuta este script en Supabase (SQL Editor)
-- para crear la tabla de perfiles de usuario
-- 
-- ========================================

-- 1. Crear tabla user_profiles para almacenar roles
CREATE TABLE IF NOT EXISTS public.user_profiles (
  id UUID PRIMARY KEY REFERENCES auth.users(id) ON DELETE CASCADE,
  role TEXT NOT NULL DEFAULT 'operador',
  created_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP,
  updated_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP,
  
  CONSTRAINT role_check CHECK (role IN ('jefe', 'supervisor', 'operador'))
);

-- 2. Crear índice para búsqueda rápida por rol
CREATE INDEX IF NOT EXISTS idx_user_profiles_role ON public.user_profiles(role);

-- 3. Habilitar RLS en la tabla
ALTER TABLE public.user_profiles ENABLE ROW LEVEL SECURITY;

-- 4. Crear política para que cada usuario vea solo su perfil
CREATE POLICY "Users can view their own profile" ON public.user_profiles
  FOR SELECT
  USING (auth.uid() = id);

-- 5. Crear política para que solo jefes editen roles
CREATE POLICY "Only admins can update roles" ON public.user_profiles
  FOR UPDATE
  USING (
    auth.uid() IN (
      SELECT id FROM public.user_profiles WHERE role = 'jefe'
    )
  );

-- 6. Trigger para crear automáticamente perfil al registrarse
CREATE OR REPLACE FUNCTION public.handle_new_user()
RETURNS TRIGGER
SECURITY DEFINER SET search_path = public
LANGUAGE plpgsql
AS $$
BEGIN
  INSERT INTO public.user_profiles (id, role)
  VALUES (NEW.id, 'operador')
  ON CONFLICT (id) DO NOTHING;
  RETURN NEW;
END;
$$;

-- 7. Crear trigger cuando un nuevo usuario se registra
DROP TRIGGER IF EXISTS on_auth_user_created ON auth.users;
CREATE TRIGGER on_auth_user_created
  AFTER INSERT ON auth.users
  FOR EACH ROW
  EXECUTE FUNCTION public.handle_new_user();

-- ========================================
-- USUARIOS DE EJEMPLO
-- ========================================
-- 
-- Una vez creados los usuarios en Authentication,
-- puedes actualizar sus roles con:
-- 
-- UPDATE public.user_profiles 
-- SET role = 'jefe' 
-- WHERE id = (SELECT id FROM auth.users WHERE email = 'jefe@example.com');
--
-- UPDATE public.user_profiles 
-- SET role = 'supervisor' 
-- WHERE id = (SELECT id FROM auth.users WHERE email = 'supervisor@example.com');
--
-- Los operadores se quedan con el rol 'operador' por defecto
-- ========================================

-- ========================================
-- ROLES Y PERMISOS
-- ========================================
--
-- JEFE:
--   - Ver todo
--   - Crear, editar, eliminar prendas
--   - Registrar acciones
--   - Autorizar cambios de estado
--   - Ver y descargar reportes
--   - Gestionar usuarios y roles
--
-- SUPERVISOR:
--   - Ver todo
--   - Crear y editar prendas (NO eliminar)
--   - Registrar acciones
--   - Autorizar cambios de estado
--   - Ver y descargar reportes
--   - NO gestionar usuarios
--
-- OPERADOR:
--   - Ver inventario completo
--   - NO crear prendas
--   - NO editar prendas
--   - Registrar acciones (lavado, esterilización, reparación, inspección)
--   - NO ver reportes
--   - NO autorizar cambios de estado críticos
--
-- ========================================
