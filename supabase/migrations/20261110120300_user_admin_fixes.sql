-- ============================================================
-- CORRECCIONES DE SEGURIDAD EN GESTIÓN DE USUARIOS
-- ============================================================
--   * update_user_role: solo el administrador cambia roles y nadie puede
--     cambiar su propio rol (antes un jefe podía hacerse administrador).
--   * get_all_users: antes cualquier usuario autenticado podía listar los
--     correos de todos; ahora solo administrador y jefe.
-- ============================================================

BEGIN;

CREATE OR REPLACE FUNCTION public.update_user_role(
  user_id  UUID,
  new_role TEXT
)
RETURNS json
LANGUAGE plpgsql
SECURITY DEFINER SET search_path = public
AS $$
BEGIN
  IF public.get_my_role() IS DISTINCT FROM 'administrador' THEN
    RETURN json_build_object('error', 'Solo el administrador puede cambiar roles');
  END IF;

  IF user_id = auth.uid() THEN
    RETURN json_build_object('error', 'No puedes cambiar tu propio rol');
  END IF;

  IF new_role NOT IN ('jefe', 'supervisor', 'operador', 'administrador') THEN
    RETURN json_build_object('error', 'Rol inválido');
  END IF;

  PERFORM set_config('app.change_reason', 'Cambio de rol a ' || new_role, true);

  UPDATE public.user_profiles
     SET role = new_role, updated_at = now()
   WHERE id = user_id;

  IF NOT FOUND THEN
    RETURN json_build_object('error', 'Usuario no encontrado');
  END IF;

  RETURN json_build_object('success', true, 'message', 'Rol actualizado');
END;
$$;

DROP FUNCTION IF EXISTS public.get_all_users();

CREATE FUNCTION public.get_all_users()
RETURNS TABLE(
  id            UUID,
  email         TEXT,
  role          TEXT,
  team_id       UUID,
  access_module TEXT,
  created_at    TIMESTAMPTZ,
  updated_at    TIMESTAMPTZ
)
LANGUAGE plpgsql STABLE
SECURITY DEFINER SET search_path = public
AS $$
BEGIN
  IF public.get_my_role() IS NULL OR public.get_my_role() NOT IN ('administrador', 'jefe') THEN
    RAISE EXCEPTION 'Sin permisos para listar usuarios' USING ERRCODE = '42501';
  END IF;

  RETURN QUERY
    SELECT up.id, au.email::TEXT, up.role, up.team_id, up.access_module,
           up.created_at, up.updated_at
      FROM public.user_profiles up
      JOIN auth.users au ON up.id = au.id
     ORDER BY au.created_at DESC;
END;
$$;

REVOKE EXECUTE ON FUNCTION public.get_all_users()               FROM PUBLIC, anon;
REVOKE EXECUTE ON FUNCTION public.update_user_role(UUID, TEXT)  FROM PUBLIC, anon;
GRANT  EXECUTE ON FUNCTION public.get_all_users()               TO authenticated;
GRANT  EXECUTE ON FUNCTION public.update_user_role(UUID, TEXT)  TO authenticated;

-- La función create_user_with_role nunca creó usuarios (solo devolvía un
-- mensaje) y aceptaba contraseñas en texto plano como parámetro.
DROP FUNCTION IF EXISTS public.create_user_with_role(TEXT, TEXT, TEXT);

COMMIT;
