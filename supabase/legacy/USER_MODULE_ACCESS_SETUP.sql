-- ============================================================
-- ACCESO POR MÓDULO (PRENDAS / MANGUERAS / AMBOS)
-- ============================================================
-- Permite al administrador restringir qué usuarios ven el
-- módulo de Prendas, el de Mangueras, o ambos.
--
-- Ejecuta este script completo en Supabase → SQL Editor
-- (requiere haber ejecutado antes ROLES_SETUP.sql y
-- ADMIN_FUNCTION_SETUP.sql).
-- ============================================================

-- ============================================================
-- 1. Agregar columna access_module a user_profiles
-- ============================================================
ALTER TABLE public.user_profiles
  ADD COLUMN IF NOT EXISTS access_module TEXT NOT NULL DEFAULT 'ambos';

ALTER TABLE public.user_profiles
  DROP CONSTRAINT IF EXISTS user_profiles_access_module_check;

ALTER TABLE public.user_profiles
  ADD CONSTRAINT user_profiles_access_module_check
  CHECK (access_module IN ('prendas', 'mangueras', 'ambos'));

-- ============================================================
-- 2. Reemplazar get_all_users para incluir team_id y access_module
-- ============================================================
DROP FUNCTION IF EXISTS public.get_all_users();

CREATE OR REPLACE FUNCTION public.get_all_users()
RETURNS TABLE(
  id            UUID,
  email         TEXT,
  role          TEXT,
  team_id       UUID,
  access_module TEXT,
  created_at    TIMESTAMPTZ,
  updated_at    TIMESTAMPTZ
)
LANGUAGE sql
SECURITY DEFINER SET search_path = public
AS $$
  SELECT
    up.id,
    au.email,
    up.role,
    up.team_id,
    up.access_module,
    up.created_at,
    up.updated_at
  FROM public.user_profiles up
  JOIN auth.users au ON up.id = au.id
  ORDER BY au.created_at DESC;
$$;

GRANT EXECUTE ON FUNCTION public.get_all_users TO authenticated;

-- ============================================================
-- 3. RPC update_user_module — solo administrador
-- ============================================================
CREATE OR REPLACE FUNCTION public.update_user_module(
  p_user_id UUID,
  p_module  TEXT
)
RETURNS json
LANGUAGE plpgsql
SECURITY DEFINER SET search_path = public
AS $$
BEGIN
  IF public.get_my_role() != 'administrador' THEN
    RETURN json_build_object('error', 'Solo el administrador puede cambiar el módulo asignado');
  END IF;

  IF p_module NOT IN ('prendas', 'mangueras', 'ambos') THEN
    RETURN json_build_object('error', 'Módulo inválido');
  END IF;

  UPDATE public.user_profiles
  SET access_module = p_module, updated_at = now()
  WHERE id = p_user_id;

  RETURN json_build_object('success', true, 'message', 'Módulo actualizado');
END;
$$;

GRANT EXECUTE ON FUNCTION public.update_user_module TO authenticated;
