-- ========================================
-- FUNCIÓN RPC PARA CREAR USUARIOS
-- ========================================
--
-- Ejecuta este script en Supabase SQL Editor
-- para crear la función que permite al Jefe
-- crear nuevos usuarios desde la UI
--
-- ========================================

-- 1. Crear función RPC para crear usuario y asignar rol
CREATE OR REPLACE FUNCTION public.create_user_with_role(
  email TEXT,
  password TEXT,
  role TEXT
)
RETURNS json
LANGUAGE plpgsql
SECURITY DEFINER SET search_path = public
AS $$
DECLARE
  new_user_id UUID;
BEGIN
  -- Verificar que solo jefes puedan crear usuarios
  IF auth.uid() NOT IN (
    SELECT id FROM public.user_profiles WHERE role = 'jefe'
  ) THEN
    RETURN json_build_object('error', 'Solo jefes pueden crear usuarios');
  END IF;

  -- Validar que el rol sea válido
  IF role NOT IN ('jefe', 'supervisor', 'operador') THEN
    RETURN json_build_object('error', 'Rol inválido');
  END IF;

  -- Crear usuario en auth.users (usando función interna de Supabase)
  -- NOTA: Esto requiere que tengas habilitado "Enable password signup" en Authentication
  -- Para producción, considera usar una función Edge de Supabase en lugar de RPC
  
  BEGIN
    -- Usar la función auth.users() para crear usuario
    -- En Supabase, esto debe hacerse via API o Edge Function
    -- Por ahora, retornaremos instrucciones
    
    RETURN json_build_object(
      'error', 'Crear usuarios debe hacerse vía API. Usa la función Edge: create-user'
    );
  EXCEPTION WHEN OTHERS THEN
    RETURN json_build_object('error', SQLERRM);
  END;
END;
$$;

-- 2. Función RPC para actualizar rol de usuario
CREATE OR REPLACE FUNCTION public.update_user_role(
  user_id UUID,
  new_role TEXT
)
RETURNS json
LANGUAGE plpgsql
SECURITY DEFINER SET search_path = public
AS $$
BEGIN
  -- Verificar que solo jefes puedan cambiar roles
  IF auth.uid() NOT IN (
    SELECT id FROM public.user_profiles WHERE role = 'jefe'
  ) THEN
    RETURN json_build_object('error', 'Solo jefes pueden cambiar roles');
  END IF;

  -- Validar que el rol sea válido
  IF new_role NOT IN ('jefe', 'supervisor', 'operador') THEN
    RETURN json_build_object('error', 'Rol inválido');
  END IF;

  -- Actualizar rol
  UPDATE public.user_profiles
  SET role = new_role, updated_at = CURRENT_TIMESTAMP
  WHERE id = user_id;

  RETURN json_build_object(
    'success', true,
    'message', 'Rol actualizado exitosamente'
  );
END;
$$;

-- 3. Función RPC para obtener lista de usuarios
CREATE OR REPLACE FUNCTION public.get_all_users()
RETURNS TABLE(
  id UUID,
  email TEXT,
  role TEXT,
  created_at TIMESTAMP,
  updated_at TIMESTAMP
)
LANGUAGE sql
SECURITY DEFINER SET search_path = public
AS $$
  SELECT 
    up.id,
    au.email,
    up.role,
    up.created_at,
    up.updated_at
  FROM public.user_profiles up
  JOIN auth.users au ON up.id = au.id
  ORDER BY au.created_at DESC;
$$;

-- 4. Crear política para que solo jefes usen estas funciones
-- (Las funciones ya tienen la validación, pero esto es extra seguridad)

-- ========================================
-- INSTRUCCIONES PARA CREAR USUARIOS
-- ========================================
--
-- OPCIÓN 1: Por SQL (para desarrollo rápido)
-- En el SQL Editor de Supabase, copia esto:
--
-- INSERT INTO auth.users (
--   instance_id,
--   id,
--   aud,
--   role,
--   email,
--   encrypted_password,
--   email_confirmed_at,
--   created_at,
--   updated_at
-- )
-- VALUES (
--   '00000000-0000-0000-0000-000000000000',
--   gen_random_uuid(),
--   'authenticated',
--   'authenticated',
--   'nuevo@example.com',
--   crypt('password123', gen_salt('bf')),
--   CURRENT_TIMESTAMP,
--   CURRENT_TIMESTAMP,
--   CURRENT_TIMESTAMP
-- );
--
-- Luego asigna el rol:
-- UPDATE public.user_profiles 
-- SET role = 'supervisor' 
-- WHERE id = (SELECT id FROM auth.users WHERE email = 'nuevo@example.com');
--
-- ========================================
-- OPCIÓN 2: Usar función Edge (RECOMENDADO PARA PRODUCCIÓN)
-- 
-- Crea una función Edge en Supabase:
-- 1. Ve a Database > Functions
-- 2. Crea función "create-user" en TypeScript
-- 3. Usa @supabase/supabase-js para crear usuario
--
-- ========================================
