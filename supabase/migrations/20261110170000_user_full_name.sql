-- ============================================================
-- NOMBRE COMPLETO DEL USUARIO Y RESPONSABLE AUTOMÁTICO
-- ============================================================
--   * user_profiles.full_name: nombre impreso del usuario (21 CFR Part 11
--     §11.50: la firma debe mostrar el nombre del firmante).
--   * Cada acción guarda automáticamente el nombre de quien la registró
--     (recorded_by_name) y "performed_by" deja de capturarse a mano: es
--     siempre el usuario en sesión. Cada persona tiene su propia cuenta.
--   * Las firmas guardan el nombre del firmante (user_name).
--   * Los registros anteriores no se modifican (historial inmutable).
-- ============================================================

BEGIN;

ALTER TABLE public.user_profiles   ADD COLUMN IF NOT EXISTS full_name TEXT;
ALTER TABLE public.garment_actions ADD COLUMN IF NOT EXISTS recorded_by_name TEXT;
ALTER TABLE public.hose_actions    ADD COLUMN IF NOT EXISTS recorded_by_name TEXT;
ALTER TABLE public.movements       ADD COLUMN IF NOT EXISTS recorded_by_name TEXT;
ALTER TABLE public.electronic_signatures ADD COLUMN IF NOT EXISTS user_name TEXT;

ALTER TABLE public.user_profiles DROP CONSTRAINT IF EXISTS user_profiles_full_name_check;
ALTER TABLE public.user_profiles ADD CONSTRAINT user_profiles_full_name_check
  CHECK (full_name IS NULL OR length(btrim(full_name)) BETWEEN 3 AND 120);

-- Nombre para mostrar del usuario en sesión (nombre completo o, si no lo
-- tiene todavía, su correo)
CREATE OR REPLACE FUNCTION public.my_display_name()
RETURNS TEXT LANGUAGE sql STABLE SECURITY DEFINER SET search_path = public
AS $$
  SELECT COALESCE(
    NULLIF(btrim((SELECT full_name FROM public.user_profiles WHERE id = auth.uid())), ''),
    NULLIF(lower(auth.jwt() ->> 'email'), ''),
    'Sistema');
$$;

-- Al insertar historial: usuario, correo y nombre los fija la base
CREATE OR REPLACE FUNCTION public.stamp_recorder()
RETURNS TRIGGER LANGUAGE plpgsql SET search_path = public
AS $$
BEGIN
  NEW.recorded_by       := auth.uid();
  NEW.recorded_by_email := NULLIF(auth.jwt() ->> 'email', '');
  NEW.recorded_by_name  := CASE WHEN auth.uid() IS NULL THEN NULL ELSE public.my_display_name() END;
  NEW.created_at        := now();
  RETURN NEW;
END;
$$;

-- Firma: también el nombre impreso del firmante
CREATE OR REPLACE FUNCTION public.record_signature(p_meaning TEXT, p_table TEXT, p_record_id TEXT)
RETURNS UUID LANGUAGE plpgsql SECURITY DEFINER SET search_path = public
AS $$
DECLARE
  v_id UUID;
BEGIN
  INSERT INTO public.electronic_signatures (user_id, user_email, user_name, user_role, meaning, table_name, record_id)
  VALUES (auth.uid(), lower(auth.jwt() ->> 'email'), public.my_display_name(), public.get_my_role(),
          btrim(p_meaning), p_table, p_record_id)
  RETURNING id INTO v_id;
  RETURN v_id;
END;
$$;

-- ============================================================
-- Acciones: el responsable es siempre el usuario en sesión.
-- Se conserva el parámetro p_responsible por compatibilidad, pero se ignora.
-- ============================================================
CREATE OR REPLACE FUNCTION public.register_garment_action(
  p_garment_id      UUID,
  p_action_type     TEXT,
  p_responsible     TEXT,
  p_result          TEXT DEFAULT NULL,
  p_notes           TEXT DEFAULT NULL,
  p_signature_token TEXT DEFAULT NULL
)
RETURNS public.garment_actions
LANGUAGE plpgsql
SECURITY DEFINER SET search_path = public
AS $$
DECLARE
  v_role        TEXT := public.require_authenticated();
  v_responsible TEXT := public.my_display_name();
  v_garment     public.garments;
  v_new_status  TEXT;
  v_action      public.garment_actions;
  v_meaning     TEXT;
  v_sig         UUID;
BEGIN
  IF p_action_type NOT IN ('lavado', 'inspeccion', 'reparacion', 'baja') THEN
    RAISE EXCEPTION 'Tipo de acción inválido: %', p_action_type USING ERRCODE = '22023';
  END IF;
  IF p_result IS NOT NULL AND (p_action_type <> 'inspeccion' OR p_result NOT IN ('aprobado', 'reparacion', 'baja')) THEN
    RAISE EXCEPTION 'Resultado de inspección inválido: %', p_result USING ERRCODE = '22023';
  END IF;
  IF NOT public.can_access_garment(p_garment_id) THEN
    RAISE EXCEPTION 'Sin acceso a esta prenda' USING ERRCODE = '42501';
  END IF;

  SELECT * INTO v_garment FROM public.garments WHERE id = p_garment_id FOR UPDATE;
  IF NOT FOUND THEN
    RAISE EXCEPTION 'Prenda no encontrada' USING ERRCODE = 'P0002';
  END IF;
  IF v_garment.archived_at IS NOT NULL THEN
    RAISE EXCEPTION 'La prenda está archivada y no admite nuevas acciones' USING ERRCODE = '22023';
  END IF;

  v_new_status := CASE
    WHEN p_action_type = 'lavado'                               THEN 'disponible'
    WHEN p_action_type = 'inspeccion' AND p_result = 'aprobado' THEN 'disponible'
    WHEN p_action_type = 'inspeccion' AND p_result IS NOT NULL  THEN p_result
    ELSE p_action_type
  END;

  IF v_new_status = 'baja' AND v_role NOT IN ('jefe', 'supervisor', 'administrador') THEN
    RAISE EXCEPTION 'Solo jefe, supervisor o administrador pueden dar de baja una prenda' USING ERRCODE = '42501';
  END IF;
  IF v_new_status = 'baja' THEN
    PERFORM public.require_text(p_notes, 'MOTIVO DE BAJA');
  END IF;

  v_meaning := CASE
    WHEN v_new_status = 'baja' THEN 'Autorizo la baja definitiva de la prenda'
    WHEN p_action_type = 'inspeccion' AND p_result IS NOT NULL THEN 'Certifico el resultado de inspección: ' || p_result
    ELSE NULL
  END;
  IF v_meaning IS NOT NULL THEN
    PERFORM public.verify_signature_password(p_signature_token);
  END IF;

  PERFORM public.set_change_reason(
    format('Acción %s%s', p_action_type, COALESCE(' (' || p_result || ')', '')) ||
    COALESCE(': ' || NULLIF(btrim(p_notes), ''), '')
  );

  UPDATE public.garments
     SET status      = v_new_status,
         baja_reason = CASE WHEN v_new_status = 'baja' THEN btrim(p_notes) ELSE baja_reason END,
         baja_date   = CASE WHEN v_new_status = 'baja' THEN now()          ELSE baja_date   END,
         updated_at  = now()
   WHERE id = p_garment_id;

  v_action.id := gen_random_uuid();
  IF v_meaning IS NOT NULL THEN
    v_sig := public.record_signature(v_meaning, 'garment_actions', v_action.id::TEXT);
  END IF;

  INSERT INTO public.garment_actions (id, garment_id, action_type, result, notes, performed_by, signature_id)
  VALUES (v_action.id, p_garment_id, p_action_type, p_result, NULLIF(btrim(p_notes), ''), v_responsible, v_sig)
  RETURNING * INTO v_action;

  INSERT INTO public.movements (garment_id, previous_status, new_status, notes)
  VALUES (p_garment_id, v_garment.status, v_new_status, NULLIF(btrim(p_notes), ''));

  RETURN v_action;
END;
$$;

CREATE OR REPLACE FUNCTION public.register_hose_action(
  p_hose_id         UUID,
  p_action_type     TEXT,
  p_responsible     TEXT,
  p_notes           TEXT DEFAULT NULL,
  p_signature_token TEXT DEFAULT NULL
)
RETURNS public.hose_actions
LANGUAGE plpgsql
SECURITY DEFINER SET search_path = public
AS $$
DECLARE
  v_role        TEXT := public.require_authenticated();
  v_responsible TEXT := public.my_display_name();
  v_hose        public.hoses;
  v_cycle_after INTEGER;
  v_action      public.hose_actions;
  v_sig         UUID;
  c_max_cycles  CONSTANT INTEGER := 200;
BEGIN
  IF p_action_type NOT IN ('uso', 'inspeccion', 'baja') THEN
    RAISE EXCEPTION 'Tipo de acción inválido: %', p_action_type USING ERRCODE = '22023';
  END IF;
  IF NOT public.can_access_hose(p_hose_id) THEN
    RAISE EXCEPTION 'Sin acceso a esta manguera' USING ERRCODE = '42501';
  END IF;

  SELECT * INTO v_hose FROM public.hoses WHERE id = p_hose_id FOR UPDATE;
  IF NOT FOUND THEN
    RAISE EXCEPTION 'Manguera no encontrada' USING ERRCODE = 'P0002';
  END IF;
  IF v_hose.status <> 'activa' THEN
    RAISE EXCEPTION 'La manguera % no está activa (estado: %)', COALESCE(v_hose.short_code, v_hose.id::TEXT), v_hose.status
      USING ERRCODE = '22023';
  END IF;

  v_cycle_after := v_hose.current_cycle;
  v_action.id := gen_random_uuid();

  IF p_action_type = 'uso' THEN
    IF v_hose.current_cycle >= c_max_cycles THEN
      RAISE EXCEPTION 'La manguera % alcanzó el límite de % ciclos; debe reemplazarse',
        COALESCE(v_hose.short_code, v_hose.id::TEXT), c_max_cycles USING ERRCODE = '22023';
    END IF;
    v_cycle_after := v_hose.current_cycle + 1;
    PERFORM public.set_change_reason(format('Uso: ciclo %s → %s', v_hose.current_cycle, v_cycle_after));
    UPDATE public.hoses SET current_cycle = v_cycle_after, updated_at = now() WHERE id = p_hose_id;

  ELSIF p_action_type = 'baja' THEN
    IF v_role NOT IN ('jefe', 'supervisor', 'administrador') THEN
      RAISE EXCEPTION 'Solo jefe, supervisor o administrador pueden dar de baja una manguera' USING ERRCODE = '42501';
    END IF;
    PERFORM public.require_text(p_notes, 'MOTIVO DE BAJA');
    PERFORM public.verify_signature_password(p_signature_token);
    v_sig := public.record_signature('Autorizo la baja definitiva de la manguera', 'hose_actions', v_action.id::TEXT);
    PERFORM public.set_change_reason('Baja: ' || btrim(p_notes));
    UPDATE public.hoses
       SET status = 'baja', baja_reason = btrim(p_notes), baja_date = now(), updated_at = now()
     WHERE id = p_hose_id;

  ELSE
    PERFORM public.set_change_reason('Inspección' || COALESCE(': ' || NULLIF(btrim(p_notes), ''), ''));
  END IF;

  INSERT INTO public.hose_actions (id, hose_id, action_type, cycle_after, notes, performed_by, signature_id)
  VALUES (v_action.id, p_hose_id, p_action_type, v_cycle_after, NULLIF(btrim(p_notes), ''), v_responsible, v_sig)
  RETURNING * INTO v_action;

  RETURN v_action;
END;
$$;

CREATE OR REPLACE FUNCTION public.replace_hose(
  p_position_id     UUID,
  p_reason          TEXT,
  p_performed_by    TEXT,
  p_signature_token TEXT DEFAULT NULL
)
RETURNS json
LANGUAGE plpgsql
SECURITY DEFINER SET search_path = public
AS $$
DECLARE
  v_role        TEXT := public.require_authenticated();
  v_reason      TEXT := public.require_text(p_reason, 'MOTIVO');
  v_responsible TEXT := public.my_display_name();
  v_old_hose    public.hoses;
  v_new_hose    public.hoses;
  v_seq         INTEGER;
  v_short_code  TEXT;
  v_action_id   UUID := gen_random_uuid();
  v_sig         UUID;
BEGIN
  IF v_role NOT IN ('jefe', 'supervisor', 'administrador') THEN
    RAISE EXCEPTION 'Sin permisos para reemplazar mangueras' USING ERRCODE = '42501';
  END IF;
  IF NOT public.can_access_position(p_position_id) THEN
    RAISE EXCEPTION 'Sin acceso a esta posición' USING ERRCODE = '42501';
  END IF;

  SELECT * INTO v_old_hose FROM public.hoses
   WHERE position_id = p_position_id AND status = 'activa'
   FOR UPDATE;
  IF NOT FOUND THEN
    RAISE EXCEPTION 'No hay manguera activa en esta posición' USING ERRCODE = 'P0002';
  END IF;

  PERFORM public.verify_signature_password(p_signature_token);
  v_sig := public.record_signature('Autorizo el reemplazo y baja de la manguera', 'hose_actions', v_action_id::TEXT);

  PERFORM public.set_change_reason('Reemplazo: ' || v_reason);

  UPDATE public.hoses
     SET status = 'baja', baja_reason = v_reason, baja_date = now(), updated_at = now()
   WHERE id = v_old_hose.id;

  INSERT INTO public.hose_actions (id, hose_id, action_type, cycle_after, notes, performed_by, signature_id)
  VALUES (v_action_id, v_old_hose.id, 'reemplazo', v_old_hose.current_cycle, v_reason, v_responsible, v_sig);

  LOOP
    SELECT COALESCE(MAX(CAST(SUBSTRING(short_code FROM 2) AS INTEGER)), 0) + 1
      INTO v_seq FROM public.hoses WHERE short_code ~ '^M[0-9]+$';
    v_short_code := 'M' || v_seq::TEXT;
    BEGIN
      INSERT INTO public.hoses (position_id, short_code, status, current_cycle)
      VALUES (p_position_id, v_short_code, 'activa', 0)
      RETURNING * INTO v_new_hose;
      EXIT;
    EXCEPTION WHEN unique_violation THEN
      CONTINUE;
    END;
  END LOOP;

  RETURN row_to_json(v_new_hose);
END;
$$;

-- Uso masivo: el responsable ya no es obligatorio (se toma de la sesión)
CREATE OR REPLACE FUNCTION public.register_bulk_hose_use(
  p_hose_ids    UUID[],
  p_responsible TEXT,
  p_notes       TEXT DEFAULT NULL
)
RETURNS SETOF public.hose_actions
LANGUAGE plpgsql
SECURITY DEFINER SET search_path = public
AS $$
DECLARE
  v_hose_id UUID;
BEGIN
  IF p_hose_ids IS NULL OR cardinality(p_hose_ids) = 0 THEN
    RAISE EXCEPTION 'No se seleccionaron mangueras' USING ERRCODE = '22023';
  END IF;
  FOR v_hose_id IN SELECT DISTINCT unnest(p_hose_ids) ORDER BY 1
  LOOP
    RETURN NEXT public.register_hose_action(v_hose_id, 'uso', NULL, p_notes, NULL);
  END LOOP;
END;
$$;

-- ============================================================
-- Nombre en la administración de usuarios
-- ============================================================
CREATE OR REPLACE FUNCTION public.update_user_full_name(p_user_id UUID, p_full_name TEXT)
RETURNS json LANGUAGE plpgsql SECURITY DEFINER SET search_path = public
AS $$
DECLARE
  v_name TEXT := public.require_text(p_full_name, 'NOMBRE COMPLETO');
BEGIN
  IF NOT public.can_manage_user(p_user_id) THEN
    RAISE EXCEPTION 'No puedes administrar a este usuario' USING ERRCODE = '42501';
  END IF;
  PERFORM set_config('app.change_reason', 'Cambio de nombre completo', true);
  UPDATE public.user_profiles SET full_name = v_name, updated_at = now() WHERE id = p_user_id;
  RETURN json_build_object('success', true);
END;
$$;

-- El propio usuario puede capturar su nombre si aún no lo tiene
CREATE OR REPLACE FUNCTION public.set_my_full_name(p_full_name TEXT)
RETURNS json LANGUAGE plpgsql SECURITY DEFINER SET search_path = public
AS $$
DECLARE
  v_name TEXT := public.require_text(p_full_name, 'NOMBRE COMPLETO');
BEGIN
  IF auth.uid() IS NULL THEN
    RAISE EXCEPTION 'Usuario no autenticado' USING ERRCODE = '42501';
  END IF;
  IF EXISTS (SELECT 1 FROM public.user_profiles WHERE id = auth.uid() AND NULLIF(btrim(full_name), '') IS NOT NULL) THEN
    RAISE EXCEPTION 'Tu nombre ya está registrado; solo el administrador puede cambiarlo' USING ERRCODE = '42501';
  END IF;
  PERFORM set_config('app.change_reason', 'Registro de nombre completo por el usuario', true);
  UPDATE public.user_profiles SET full_name = v_name, updated_at = now() WHERE id = auth.uid();
  RETURN json_build_object('success', true);
END;
$$;

-- Alta de usuarios con nombre completo obligatorio
DROP FUNCTION IF EXISTS public.admin_prepare_new_user(TEXT, TEXT, TEXT[], UUID);
CREATE FUNCTION public.admin_prepare_new_user(
  p_email TEXT, p_role TEXT, p_modules TEXT[], p_organization_id UUID DEFAULT NULL, p_full_name TEXT DEFAULT NULL
)
RETURNS json LANGUAGE plpgsql STABLE SECURITY DEFINER SET search_path = public
AS $$
DECLARE
  v_org    public.organizations;
  v_active INTEGER;
BEGIN
  IF public.get_my_role() IS DISTINCT FROM 'administrador' THEN
    RETURN json_build_object('ok', false, 'error', 'Solo un administrador puede dar de alta usuarios');
  END IF;
  IF p_full_name IS NULL OR length(btrim(p_full_name)) < 3 THEN
    RETURN json_build_object('ok', false, 'error', 'Captura el nombre completo del usuario');
  END IF;
  IF p_email IS NULL OR p_email !~* '^[^@\s]+@[^@\s]+\.[^@\s]+$' THEN
    RETURN json_build_object('ok', false, 'error', 'Correo inválido');
  END IF;
  IF EXISTS (SELECT 1 FROM auth.users WHERE lower(email) = lower(btrim(p_email))) THEN
    RETURN json_build_object('ok', false, 'error', 'Ya existe un usuario con ese correo');
  END IF;
  IF p_role NOT IN ('jefe', 'supervisor', 'operador', 'administrador') THEN
    RETURN json_build_object('ok', false, 'error', 'Rol inválido');
  END IF;
  IF p_modules IS NULL OR cardinality(p_modules) = 0 OR NOT (p_modules <@ public.my_modules()) THEN
    RETURN json_build_object('ok', false, 'error', 'Solo puedes asignar módulos que tú administras');
  END IF;

  SELECT * INTO v_org FROM public.organizations
   WHERE id = CASE WHEN public.is_superadmin() THEN p_organization_id ELSE public.get_my_org_id() END;
  IF v_org.id IS NULL THEN
    RETURN json_build_object('ok', false, 'error', 'Selecciona la empresa del usuario');
  END IF;
  IF NOT (p_modules <@ v_org.modules) THEN
    RETURN json_build_object('ok', false, 'error', 'La empresa no tiene contratados esos módulos');
  END IF;
  SELECT count(*) INTO v_active FROM public.user_profiles
   WHERE organization_id = v_org.id AND is_active AND role <> 'superadmin';
  IF v_active >= v_org.max_users THEN
    RETURN json_build_object('ok', false,
      'error', format('%s alcanzó su límite de %s usuarios contratados', v_org.name, v_org.max_users));
  END IF;
  RETURN json_build_object('ok', true, 'organization_id', v_org.id);
END;
$$;

DROP FUNCTION IF EXISTS public.admin_finalize_new_user(UUID, TEXT, TEXT[], UUID, UUID);
CREATE FUNCTION public.admin_finalize_new_user(
  p_user_id UUID, p_role TEXT, p_modules TEXT[], p_organization_id UUID,
  p_team_id UUID DEFAULT NULL, p_full_name TEXT DEFAULT NULL
)
RETURNS json LANGUAGE plpgsql SECURITY DEFINER SET search_path = public
AS $$
DECLARE
  v_email TEXT := (SELECT email FROM auth.users WHERE id = p_user_id AND created_at > now() - interval '10 minutes');
  v_name  TEXT := public.require_text(p_full_name, 'NOMBRE COMPLETO');
BEGIN
  IF v_email IS NULL OR EXISTS (SELECT 1 FROM public.user_profiles WHERE id = p_user_id AND organization_id IS NOT NULL) THEN
    RAISE EXCEPTION 'Solo se puede completar el alta de una cuenta recién creada' USING ERRCODE = '42501';
  END IF;
  IF public.get_my_role() IS DISTINCT FROM 'administrador'
     OR p_role NOT IN ('jefe', 'supervisor', 'operador', 'administrador')
     OR NOT (p_modules <@ public.my_modules())
     OR (NOT public.is_superadmin() AND p_organization_id IS DISTINCT FROM public.get_my_org_id()) THEN
    RAISE EXCEPTION 'No puedes dar de alta este usuario' USING ERRCODE = '42501';
  END IF;

  PERFORM set_config('app.change_reason', 'Alta de usuario por administrador', true);
  INSERT INTO public.user_profiles (id, role) VALUES (p_user_id, 'operador') ON CONFLICT (id) DO NOTHING;
  UPDATE public.user_profiles
     SET organization_id = p_organization_id, role = p_role, modules = p_modules, team_id = p_team_id,
         full_name = v_name, is_active = true, must_change_password = true,
         password_changed_at = now(), updated_at = now()
   WHERE id = p_user_id;
  RETURN json_build_object('ok', true);
END;
$$;

-- get_all_users con nombre completo
DROP FUNCTION IF EXISTS public.get_all_users();
CREATE FUNCTION public.get_all_users()
RETURNS TABLE(
  id UUID, email TEXT, full_name TEXT, role TEXT, team_id UUID, access_module TEXT, modules TEXT[],
  organization_id UUID, organization_name TEXT,
  is_active BOOLEAN, deactivation_reason TEXT, locked_until TIMESTAMPTZ, last_login_at TIMESTAMPTZ,
  must_change_password BOOLEAN, password_changed_at TIMESTAMPTZ, can_manage BOOLEAN,
  created_at TIMESTAMPTZ, updated_at TIMESTAMPTZ
)
LANGUAGE plpgsql STABLE SECURITY DEFINER SET search_path = public
AS $$
BEGIN
  IF public.get_my_role() IS NULL OR public.get_my_role() NOT IN ('administrador', 'jefe') THEN
    RAISE EXCEPTION 'Sin permisos para listar usuarios' USING ERRCODE = '42501';
  END IF;

  RETURN QUERY
    SELECT up.id, au.email::TEXT, up.full_name, up.role, up.team_id, up.access_module, up.modules,
           up.organization_id, o.name,
           up.is_active, up.deactivation_reason,
           (SELECT l.locked_until FROM public.account_locks l WHERE l.email = lower(au.email) AND l.locked_until > now()),
           au.last_sign_in_at, up.must_change_password, up.password_changed_at,
           public.can_manage_user(up.id),
           up.created_at, up.updated_at
      FROM public.user_profiles up
      JOIN auth.users au ON up.id = au.id
      LEFT JOIN public.organizations o ON o.id = up.organization_id
     WHERE public.is_superadmin() OR up.organization_id = public.get_my_org_id()
     ORDER BY o.name NULLS FIRST, COALESCE(up.full_name, au.email);
END;
$$;

-- Permisos
REVOKE EXECUTE ON FUNCTION public.my_display_name() FROM PUBLIC, anon, authenticated;
REVOKE EXECUTE ON FUNCTION
  public.update_user_full_name(UUID, TEXT), public.set_my_full_name(TEXT),
  public.admin_prepare_new_user(TEXT, TEXT, TEXT[], UUID, TEXT),
  public.admin_finalize_new_user(UUID, TEXT, TEXT[], UUID, UUID, TEXT),
  public.get_all_users()
FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION
  public.update_user_full_name(UUID, TEXT), public.set_my_full_name(TEXT),
  public.admin_prepare_new_user(TEXT, TEXT, TEXT[], UUID, TEXT),
  public.admin_finalize_new_user(UUID, TEXT, TEXT[], UUID, UUID, TEXT),
  public.get_all_users()
TO authenticated;

COMMIT;
