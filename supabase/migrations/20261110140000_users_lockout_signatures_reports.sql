-- ============================================================
-- FASES 2-4: USUARIOS, BLOQUEO POR INTENTOS, FIRMA ELECTRÓNICA, REPORTES
-- ============================================================
--   1. Desactivar/reactivar usuarios (bloquea el login en Supabase Auth y
--      cualquier acceso a datos aunque la sesión siga abierta).
--   2. Registro de intentos de acceso y bloqueo automático tras 5 fallos
--      en 15 minutos (bloqueo de 30 minutos).
--   3. Firma electrónica (21 CFR Part 11 §11.50/§11.200): re-captura de
--      contraseña verificada en el servidor + significado de la firma,
--      ligada al registro firmado. Requerida para bajas, resultados de
--      inspección y reemplazo de mangueras. Flujo en dos pasos:
--      request_signature(contraseña) -> token (5 min) -> acción con token.
--   4. Reporte de estado del inventario en una fecha determinada.
-- ============================================================

BEGIN;

-- ============================================================
-- 1. USUARIOS ACTIVOS / DESACTIVADOS
-- ============================================================
ALTER TABLE public.user_profiles
  ADD COLUMN IF NOT EXISTS is_active           BOOLEAN NOT NULL DEFAULT true,
  ADD COLUMN IF NOT EXISTS deactivated_at      TIMESTAMPTZ,
  ADD COLUMN IF NOT EXISTS deactivated_by      UUID,
  ADD COLUMN IF NOT EXISTS deactivation_reason TEXT;

-- ============================================================
-- 2. INTENTOS DE ACCESO Y BLOQUEO
-- ============================================================
CREATE TABLE IF NOT EXISTS public.login_attempts (
  id          BIGINT GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
  email       TEXT NOT NULL,
  success     BOOLEAN NOT NULL,
  source      TEXT NOT NULL DEFAULT 'login' CHECK (source IN ('login', 'firma')),
  occurred_at TIMESTAMPTZ NOT NULL DEFAULT clock_timestamp()
);
CREATE INDEX IF NOT EXISTS idx_login_attempts_email ON public.login_attempts (lower(email), occurred_at DESC);

CREATE TABLE IF NOT EXISTS public.account_locks (
  email        TEXT PRIMARY KEY,           -- en minúsculas
  locked_until TIMESTAMPTZ NOT NULL,
  locked_at    TIMESTAMPTZ NOT NULL DEFAULT now(),
  reason       TEXT
);

ALTER TABLE public.login_attempts ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.account_locks  ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Administrador reads login_attempts" ON public.login_attempts
  FOR SELECT TO authenticated USING (public.get_my_role() = 'administrador');
CREATE POLICY "Administrador reads account_locks" ON public.account_locks
  FOR SELECT TO authenticated USING (public.get_my_role() = 'administrador');

REVOKE ALL ON public.login_attempts, public.account_locks FROM anon;
REVOKE INSERT, UPDATE, DELETE, TRUNCATE ON public.login_attempts, public.account_locks FROM authenticated;
GRANT SELECT ON public.login_attempts, public.account_locks TO authenticated;  -- filtrado por RLS (solo admin)

-- Bitácora de intentos inmutable
DROP TRIGGER IF EXISTS immutable_login_attempts ON public.login_attempts;
CREATE TRIGGER immutable_login_attempts BEFORE UPDATE OR DELETE ON public.login_attempts
  FOR EACH ROW EXECUTE FUNCTION public.prevent_history_modification();

DROP TRIGGER IF EXISTS audit_account_locks ON public.account_locks;
CREATE TRIGGER audit_account_locks AFTER INSERT OR UPDATE OR DELETE ON public.account_locks
  FOR EACH ROW EXECUTE FUNCTION public.audit_log_change();

CREATE OR REPLACE FUNCTION public.is_account_locked(p_email TEXT)
RETURNS BOOLEAN
LANGUAGE sql STABLE
SECURITY DEFINER SET search_path = public
AS $$
  SELECT EXISTS (
    SELECT 1 FROM public.account_locks
     WHERE email = lower(btrim(p_email)) AND locked_until > now()
  );
$$;

-- Registra un intento; si se acumulan demasiados fallos, bloquea la cuenta.
CREATE OR REPLACE FUNCTION public.log_access_attempt(p_email TEXT, p_success BOOLEAN, p_source TEXT DEFAULT 'login')
RETURNS VOID
LANGUAGE plpgsql
SECURITY DEFINER SET search_path = public
AS $$
DECLARE
  v_email    TEXT := lower(btrim(p_email));
  -- Política: 5 fallos en 15 minutos => bloqueo de 30 minutos
  c_max_failures   CONSTANT INT := 5;
  c_window_minutes CONSTANT INT := 15;
  c_lock_minutes   CONSTANT INT := 30;
  v_failures INT;
BEGIN
  IF v_email IS NULL OR v_email = '' OR length(v_email) > 320 THEN
    RETURN;
  END IF;

  INSERT INTO public.login_attempts (email, success, source) VALUES (v_email, p_success, p_source);

  IF p_success THEN
    RETURN;
  END IF;

  -- Fallos dentro de la ventana, posteriores al último acceso exitoso
  SELECT count(*) INTO v_failures
    FROM public.login_attempts a
   WHERE lower(a.email) = v_email
     AND NOT a.success
     AND a.occurred_at > now() - make_interval(mins => c_window_minutes)
     AND a.occurred_at > COALESCE((SELECT max(occurred_at) FROM public.login_attempts s
                                    WHERE lower(s.email) = v_email AND s.success), '-infinity');

  IF v_failures >= c_max_failures THEN
    PERFORM set_config('app.change_reason',
      format('Bloqueo automático: %s intentos fallidos en %s min', v_failures, c_window_minutes), true);
    INSERT INTO public.account_locks (email, locked_until, reason)
    VALUES (v_email, now() + make_interval(mins => c_lock_minutes),
            format('%s intentos fallidos', v_failures))
    ON CONFLICT (email) DO UPDATE
      SET locked_until = EXCLUDED.locked_until, locked_at = now(), reason = EXCLUDED.reason;
  END IF;
END;
$$;

-- Llamada desde la pantalla de login (sin sesión) ANTES de intentar entrar
CREATE OR REPLACE FUNCTION public.check_login_allowed(p_email TEXT)
RETURNS json
LANGUAGE plpgsql STABLE
SECURITY DEFINER SET search_path = public
AS $$
DECLARE
  v_until TIMESTAMPTZ;
BEGIN
  SELECT locked_until INTO v_until FROM public.account_locks
   WHERE email = lower(btrim(p_email)) AND locked_until > now();
  RETURN json_build_object('allowed', v_until IS NULL, 'locked_until', v_until);
END;
$$;

-- Llamada desde la pantalla de login (sin sesión) cuando Supabase rechaza la contraseña
CREATE OR REPLACE FUNCTION public.record_failed_login(p_email TEXT)
RETURNS json
LANGUAGE plpgsql
SECURITY DEFINER SET search_path = public
AS $$
BEGIN
  PERFORM public.log_access_attempt(p_email, false, 'login');
  RETURN public.check_login_allowed(p_email);
END;
$$;

-- Llamada con sesión iniciada tras un login exitoso
CREATE OR REPLACE FUNCTION public.record_successful_login()
RETURNS json
LANGUAGE plpgsql
SECURITY DEFINER SET search_path = public
AS $$
DECLARE
  v_email TEXT := lower(auth.jwt() ->> 'email');
BEGIN
  IF auth.uid() IS NULL OR v_email IS NULL THEN
    RAISE EXCEPTION 'Usuario no autenticado' USING ERRCODE = '42501';
  END IF;
  IF public.is_account_locked(v_email) THEN
    RETURN public.check_login_allowed(v_email);
  END IF;
  PERFORM public.log_access_attempt(v_email, true, 'login');
  RETURN json_build_object('allowed', true);
END;
$$;

-- Desbloqueo manual por el administrador
CREATE OR REPLACE FUNCTION public.unlock_account(p_email TEXT, p_reason TEXT)
RETURNS VOID
LANGUAGE plpgsql
SECURITY DEFINER SET search_path = public
AS $$
BEGIN
  IF public.get_my_role() IS DISTINCT FROM 'administrador' THEN
    RAISE EXCEPTION 'Solo el administrador puede desbloquear cuentas' USING ERRCODE = '42501';
  END IF;
  PERFORM set_config('app.change_reason', 'Desbloqueo manual: ' || public.require_text(p_reason, 'MOTIVO'), true);
  DELETE FROM public.account_locks WHERE email = lower(btrim(p_email));
END;
$$;

-- ============================================================
-- get_my_role / get_my_team_id: usuario desactivado o bloqueado = sin acceso
-- (todas las políticas RLS y RPC dependen de estas funciones)
-- ============================================================
CREATE OR REPLACE FUNCTION public.get_my_role()
RETURNS TEXT
LANGUAGE sql STABLE
SECURITY DEFINER SET search_path = public
AS $$
  SELECT up.role
    FROM public.user_profiles up
   WHERE up.id = auth.uid()
     AND up.is_active
     AND NOT public.is_account_locked(auth.jwt() ->> 'email');
$$;

CREATE OR REPLACE FUNCTION public.get_my_team_id()
RETURNS UUID
LANGUAGE sql STABLE
SECURITY DEFINER SET search_path = public
AS $$
  SELECT up.team_id
    FROM public.user_profiles up
   WHERE up.id = auth.uid()
     AND up.is_active
     AND NOT public.is_account_locked(auth.jwt() ->> 'email');
$$;

-- Activar / desactivar usuario (solo administrador, nunca a sí mismo)
CREATE OR REPLACE FUNCTION public.set_user_active(p_user_id UUID, p_active BOOLEAN, p_reason TEXT)
RETURNS json
LANGUAGE plpgsql
SECURITY DEFINER SET search_path = public
AS $$
DECLARE
  v_reason TEXT := public.require_text(p_reason, 'MOTIVO');
BEGIN
  IF public.get_my_role() IS DISTINCT FROM 'administrador' THEN
    RAISE EXCEPTION 'Solo el administrador puede activar o desactivar usuarios' USING ERRCODE = '42501';
  END IF;
  IF p_user_id = auth.uid() THEN
    RAISE EXCEPTION 'No puedes desactivar tu propia cuenta' USING ERRCODE = '22023';
  END IF;

  PERFORM set_config('app.change_reason',
    CASE WHEN p_active THEN 'Reactivación: ' ELSE 'Desactivación: ' END || v_reason, true);

  UPDATE public.user_profiles
     SET is_active           = p_active,
         deactivated_at      = CASE WHEN p_active THEN NULL ELSE now() END,
         deactivated_by      = CASE WHEN p_active THEN NULL ELSE auth.uid() END,
         deactivation_reason = CASE WHEN p_active THEN NULL ELSE v_reason END,
         updated_at          = now()
   WHERE id = p_user_id;

  IF NOT FOUND THEN
    RAISE EXCEPTION 'Usuario no encontrado' USING ERRCODE = 'P0002';
  END IF;

  -- Bloquea también el inicio de sesión en Supabase Auth
  BEGIN
    UPDATE auth.users
       SET banned_until = CASE WHEN p_active THEN NULL ELSE 'infinity'::timestamptz END
     WHERE id = p_user_id;
  EXCEPTION WHEN insufficient_privilege OR undefined_column THEN
    NULL;  -- el bloqueo a nivel de datos (get_my_role) sigue aplicando
  END;

  RETURN json_build_object('success', true);
END;
$$;

-- get_all_users ahora incluye estado y bloqueo
DROP FUNCTION IF EXISTS public.get_all_users();
CREATE FUNCTION public.get_all_users()
RETURNS TABLE(
  id                  UUID,
  email               TEXT,
  role                TEXT,
  team_id             UUID,
  access_module       TEXT,
  is_active           BOOLEAN,
  deactivation_reason TEXT,
  locked_until        TIMESTAMPTZ,
  last_login_at       TIMESTAMPTZ,
  created_at          TIMESTAMPTZ,
  updated_at          TIMESTAMPTZ
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
           up.is_active, up.deactivation_reason,
           (SELECT l.locked_until FROM public.account_locks l
             WHERE l.email = lower(au.email) AND l.locked_until > now()),
           au.last_sign_in_at,
           up.created_at, up.updated_at
      FROM public.user_profiles up
      JOIN auth.users au ON up.id = au.id
     ORDER BY au.created_at DESC;
END;
$$;

-- ============================================================
-- 3. FIRMA ELECTRÓNICA
-- ============================================================
CREATE TABLE IF NOT EXISTS public.electronic_signatures (
  id          UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id     UUID NOT NULL,
  user_email  TEXT NOT NULL,
  user_role   TEXT NOT NULL,
  meaning     TEXT NOT NULL CHECK (btrim(meaning) <> ''),
  table_name  TEXT NOT NULL,
  record_id   TEXT NOT NULL,
  signed_at   TIMESTAMPTZ NOT NULL DEFAULT clock_timestamp()
);
COMMENT ON TABLE public.electronic_signatures IS
  'Firmas electrónicas (21 CFR Part 11): quién, cuándo, significado y registro firmado. Inmutable.';
CREATE INDEX IF NOT EXISTS idx_signatures_record ON public.electronic_signatures (table_name, record_id);

ALTER TABLE public.electronic_signatures ENABLE ROW LEVEL SECURITY;
CREATE POLICY "Read signatures of accessible records" ON public.electronic_signatures
  FOR SELECT TO authenticated
  USING (
    public.get_my_role() = 'administrador'
    OR (table_name = 'garment_actions' AND EXISTS (
          SELECT 1 FROM public.garment_actions ga
           WHERE ga.id::TEXT = record_id AND public.can_access_garment(ga.garment_id)))
    OR (table_name = 'hose_actions' AND EXISTS (
          SELECT 1 FROM public.hose_actions ha
           WHERE ha.id::TEXT = record_id AND public.can_access_hose(ha.hose_id)))
  );
REVOKE ALL ON public.electronic_signatures FROM anon;
REVOKE INSERT, UPDATE, DELETE, TRUNCATE ON public.electronic_signatures FROM authenticated;
GRANT SELECT ON public.electronic_signatures TO authenticated;  -- filtrado por RLS

DROP TRIGGER IF EXISTS immutable_electronic_signatures ON public.electronic_signatures;
CREATE TRIGGER immutable_electronic_signatures BEFORE UPDATE OR DELETE ON public.electronic_signatures
  FOR EACH ROW EXECUTE FUNCTION public.prevent_history_modification();
DROP TRIGGER IF EXISTS immutable_truncate_electronic_signatures ON public.electronic_signatures;
CREATE TRIGGER immutable_truncate_electronic_signatures BEFORE TRUNCATE ON public.electronic_signatures
  FOR EACH STATEMENT EXECUTE FUNCTION public.prevent_history_modification();
DROP TRIGGER IF EXISTS audit_electronic_signatures ON public.electronic_signatures;
CREATE TRIGGER audit_electronic_signatures AFTER INSERT ON public.electronic_signatures
  FOR EACH ROW EXECUTE FUNCTION public.audit_log_change();

-- Paso 1 de la firma: re-captura de contraseña. Se ejecuta en su propia
-- transacción para que un intento fallido SIEMPRE quede registrado (y cuente
-- para el bloqueo). Si es correcta, emite un token válido 5 minutos para el
-- mismo usuario (§11.200(a)(1)(i): serie de firmas en una sesión controlada).
CREATE TABLE IF NOT EXISTS public.signature_tokens (
  token      UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id    UUID NOT NULL,
  expires_at TIMESTAMPTZ NOT NULL
);
ALTER TABLE public.signature_tokens ENABLE ROW LEVEL SECURITY;  -- sin políticas: solo vía funciones
REVOKE ALL ON public.signature_tokens FROM anon, authenticated;

CREATE OR REPLACE FUNCTION public.request_signature(p_password TEXT)
RETURNS json
LANGUAGE plpgsql
SECURITY DEFINER SET search_path = public, extensions
AS $$
DECLARE
  v_hash  TEXT;
  v_email TEXT;
  v_token UUID;
BEGIN
  IF public.require_authenticated() IS NULL THEN
    RETURN json_build_object('ok', false, 'error', 'Usuario sin acceso');
  END IF;
  IF p_password IS NULL OR p_password = '' THEN
    RETURN json_build_object('ok', false, 'error', 'La firma electrónica requiere tu contraseña');
  END IF;

  SELECT encrypted_password, lower(email) INTO v_hash, v_email
    FROM auth.users WHERE id = auth.uid();

  IF v_hash IS NULL OR crypt(p_password, v_hash) <> v_hash THEN
    PERFORM public.log_access_attempt(v_email, false, 'firma');
    RETURN json_build_object(
      'ok', false,
      'error', 'Firma electrónica rechazada: contraseña incorrecta',
      'locked', public.is_account_locked(v_email));
  END IF;

  DELETE FROM public.signature_tokens WHERE expires_at < now();
  INSERT INTO public.signature_tokens (user_id, expires_at)
  VALUES (auth.uid(), now() + interval '5 minutes')
  RETURNING token INTO v_token;

  RETURN json_build_object('ok', true, 'token', v_token);
END;
$$;

-- Paso 2: las acciones críticas exigen un token vigente del mismo usuario
CREATE OR REPLACE FUNCTION public.verify_signature_password(p_token TEXT)
RETURNS VOID
LANGUAGE plpgsql
SECURITY DEFINER SET search_path = public
AS $$
BEGIN
  IF p_token IS NULL OR NOT EXISTS (
       SELECT 1 FROM public.signature_tokens
        WHERE token::TEXT = p_token AND user_id = auth.uid() AND expires_at > now()) THEN
    RAISE EXCEPTION 'Se requiere firma electrónica vigente para esta acción' USING ERRCODE = '28P01';
  END IF;
END;
$$;

CREATE OR REPLACE FUNCTION public.record_signature(p_meaning TEXT, p_table TEXT, p_record_id TEXT)
RETURNS UUID
LANGUAGE plpgsql
SECURITY DEFINER SET search_path = public
AS $$
DECLARE
  v_id UUID;
BEGIN
  INSERT INTO public.electronic_signatures (user_id, user_email, user_role, meaning, table_name, record_id)
  VALUES (auth.uid(), lower(auth.jwt() ->> 'email'), public.get_my_role(), btrim(p_meaning), p_table, p_record_id)
  RETURNING id INTO v_id;
  RETURN v_id;
END;
$$;

-- Columna de enlace a la firma en el historial
ALTER TABLE public.garment_actions ADD COLUMN IF NOT EXISTS signature_id UUID;
ALTER TABLE public.hose_actions    ADD COLUMN IF NOT EXISTS signature_id UUID;

-- ------------------------------------------------------------
-- register_garment_action: ahora con firma para acciones críticas
-- ------------------------------------------------------------
DROP FUNCTION IF EXISTS public.register_garment_action(UUID, TEXT, TEXT, TEXT, TEXT);

CREATE FUNCTION public.register_garment_action(
  p_garment_id         UUID,
  p_action_type        TEXT,
  p_responsible        TEXT,
  p_result             TEXT DEFAULT NULL,
  p_notes              TEXT DEFAULT NULL,
  p_signature_token TEXT DEFAULT NULL
)
RETURNS public.garment_actions
LANGUAGE plpgsql
SECURITY DEFINER SET search_path = public
AS $$
DECLARE
  v_role        TEXT := public.require_authenticated();
  v_responsible TEXT := public.require_text(p_responsible, 'RESPONSABLE');
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

  -- Acciones que requieren firma electrónica
  v_meaning := CASE
    WHEN v_new_status = 'baja'                             THEN 'Autorizo la baja definitiva de la prenda'
    WHEN p_action_type = 'inspeccion' AND p_result IS NOT NULL
                                                            THEN 'Certifico el resultado de inspección: ' || p_result
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

-- ------------------------------------------------------------
-- register_hose_action: firma para baja manual
-- ------------------------------------------------------------
DROP FUNCTION IF EXISTS public.register_hose_action(UUID, TEXT, TEXT, TEXT);

CREATE FUNCTION public.register_hose_action(
  p_hose_id            UUID,
  p_action_type        TEXT,
  p_responsible        TEXT,
  p_notes              TEXT DEFAULT NULL,
  p_signature_token TEXT DEFAULT NULL
)
RETURNS public.hose_actions
LANGUAGE plpgsql
SECURITY DEFINER SET search_path = public
AS $$
DECLARE
  v_role        TEXT := public.require_authenticated();
  v_responsible TEXT := public.require_text(p_responsible, 'RESPONSABLE');
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

-- register_bulk_hose_use usa la nueva firma de register_hose_action
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
    RETURN NEXT public.register_hose_action(v_hose_id, 'uso', p_responsible, p_notes, NULL);
  END LOOP;
END;
$$;

-- ------------------------------------------------------------
-- replace_hose: firma obligatoria
-- ------------------------------------------------------------
DROP FUNCTION IF EXISTS public.replace_hose(UUID, TEXT, TEXT);

CREATE FUNCTION public.replace_hose(
  p_position_id        UUID,
  p_reason             TEXT,
  p_performed_by       TEXT,
  p_signature_token TEXT DEFAULT NULL
)
RETURNS json
LANGUAGE plpgsql
SECURITY DEFINER SET search_path = public
AS $$
DECLARE
  v_role        TEXT := public.require_authenticated();
  v_reason      TEXT := public.require_text(p_reason, 'MOTIVO');
  v_responsible TEXT := public.require_text(p_performed_by, 'RESPONSABLE');
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

-- ============================================================
-- 4. ESTADO DEL INVENTARIO EN UNA FECHA DETERMINADA
-- ============================================================
-- Se reconstruye a partir del historial inmutable de acciones.
CREATE OR REPLACE FUNCTION public.get_inventory_status_at(p_at TIMESTAMPTZ, p_garment_id UUID DEFAULT NULL)
RETURNS TABLE(
  garment_id     UUID,
  code           TEXT,
  short_code     TEXT,
  name           TEXT,
  client_name    TEXT,
  status_at      TEXT,
  cycles_at      BIGINT,
  last_action_at TIMESTAMPTZ,
  last_action    TEXT,
  last_responsible TEXT
)
LANGUAGE plpgsql STABLE
SECURITY DEFINER SET search_path = public
AS $$
DECLARE
  v_role TEXT := public.require_authenticated();
BEGIN
  IF v_role NOT IN ('jefe', 'supervisor', 'administrador') THEN
    RAISE EXCEPTION 'Sin permisos para consultar reportes históricos' USING ERRCODE = '42501';
  END IF;
  IF p_at IS NULL THEN
    RAISE EXCEPTION 'La fecha es obligatoria' USING ERRCODE = '22023';
  END IF;

  RETURN QUERY
    SELECT g.id,
           g.code::TEXT,
           g.short_code::TEXT,
           g.name::TEXT,
           g.client_name::TEXT,
           COALESCE(
             CASE
               WHEN la.action_type IN ('lavado', 'esterilizacion')            THEN 'disponible'
               WHEN la.action_type = 'inspeccion' AND la.result = 'aprobado'  THEN 'disponible'
               WHEN la.action_type = 'inspeccion' AND la.result IS NOT NULL   THEN la.result::TEXT
               ELSE la.action_type::TEXT
             END,
             'disponible'),
           (SELECT count(*) FROM public.garment_actions c
             WHERE c.garment_id = g.id AND c.created_at <= p_at
               AND c.action_type IN ('lavado', 'esterilizacion')),
           la.created_at,
           la.action_type::TEXT,
           la.performed_by::TEXT
      FROM public.garments g
      LEFT JOIN LATERAL (
        SELECT a.action_type, a.result, a.created_at, a.performed_by
          FROM public.garment_actions a
         WHERE a.garment_id = g.id AND a.created_at <= p_at
         ORDER BY a.created_at DESC
         LIMIT 1
      ) la ON true
     WHERE g.created_at <= p_at
       AND (g.archived_at IS NULL OR g.archived_at > p_at)
       AND (p_garment_id IS NULL OR g.id = p_garment_id)
       AND public.can_access_garment(g.id)
     ORDER BY g.code;
END;
$$;

-- ============================================================
-- Permisos de ejecución
-- ============================================================
REVOKE EXECUTE ON FUNCTION
  public.is_account_locked(TEXT),
  public.log_access_attempt(TEXT, BOOLEAN, TEXT),
  public.verify_signature_password(TEXT), public.record_signature(TEXT, TEXT, TEXT)
FROM PUBLIC, anon, authenticated;

-- Pantalla de login (sin sesión)
REVOKE EXECUTE ON FUNCTION public.check_login_allowed(TEXT), public.record_failed_login(TEXT) FROM PUBLIC;
GRANT  EXECUTE ON FUNCTION public.check_login_allowed(TEXT), public.record_failed_login(TEXT) TO anon, authenticated;

REVOKE EXECUTE ON FUNCTION
  public.record_successful_login(), public.unlock_account(TEXT, TEXT),
  public.request_signature(TEXT),
  public.set_user_active(UUID, BOOLEAN, TEXT), public.get_all_users(),
  public.register_garment_action(UUID, TEXT, TEXT, TEXT, TEXT, TEXT),
  public.register_hose_action(UUID, TEXT, TEXT, TEXT, TEXT),
  public.register_bulk_hose_use(UUID[], TEXT, TEXT),
  public.replace_hose(UUID, TEXT, TEXT, TEXT),
  public.get_inventory_status_at(TIMESTAMPTZ, UUID)
FROM PUBLIC, anon;

GRANT EXECUTE ON FUNCTION
  public.record_successful_login(), public.unlock_account(TEXT, TEXT),
  public.request_signature(TEXT),
  public.set_user_active(UUID, BOOLEAN, TEXT), public.get_all_users(),
  public.register_garment_action(UUID, TEXT, TEXT, TEXT, TEXT, TEXT),
  public.register_hose_action(UUID, TEXT, TEXT, TEXT, TEXT),
  public.register_bulk_hose_use(UUID[], TEXT, TEXT),
  public.replace_hose(UUID, TEXT, TEXT, TEXT),
  public.get_inventory_status_at(TIMESTAMPTZ, UUID)
TO authenticated;

COMMIT;
