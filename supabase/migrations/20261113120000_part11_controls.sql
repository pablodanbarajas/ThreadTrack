-- ============================================================
-- CONTROLES ADICIONALES 21 CFR PART 11 / EU GMP ANEXO 11
-- ============================================================
--   1. §11.10(f) Secuencia de operaciones: una prenda dada de baja es un
--      estado terminal; ninguna acción posterior puede reactivarla.
--   2. §11.200(a)(1) Firma no biométrica: la PRIMERA firma de cada sesión
--      exige los dos componentes (usuario + contraseña); las siguientes de
--      la misma sesión, al menos la contraseña.
--   3. §11.300(d) Aviso inmediato al administrador de cuentas bloqueadas e
--      intentos fallidos (resumen para la interfaz).
-- ============================================================

BEGIN;

-- ------------------------------------------------------------
-- 1. La baja es definitiva
-- ------------------------------------------------------------
CREATE OR REPLACE FUNCTION public.prevent_reactivation_after_baja()
RETURNS TRIGGER LANGUAGE plpgsql AS $$
BEGIN
  IF OLD.status = 'baja' THEN
    RAISE EXCEPTION 'La prenda % está dada de baja: es un estado definitivo y no admite nuevas acciones', OLD.code
      USING ERRCODE = '22023';
  END IF;
  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS prevent_reactivation_after_baja ON public.garments;
CREATE TRIGGER prevent_reactivation_after_baja
  BEFORE UPDATE OF status ON public.garments
  FOR EACH ROW EXECUTE FUNCTION public.prevent_reactivation_after_baja();

-- ------------------------------------------------------------
-- 2. Primera firma de la sesión: usuario + contraseña
-- ------------------------------------------------------------
CREATE TABLE IF NOT EXISTS public.signature_sessions (
  session_id      UUID PRIMARY KEY,
  user_id         UUID NOT NULL,
  first_signed_at TIMESTAMPTZ NOT NULL DEFAULT clock_timestamp()
);
COMMENT ON TABLE public.signature_sessions IS
  'Sesiones en las que el usuario ya firmó con usuario + contraseña (21 CFR 11.200(a)(1)).';
ALTER TABLE public.signature_sessions ENABLE ROW LEVEL SECURITY;  -- sin políticas: solo vía funciones
REVOKE ALL ON public.signature_sessions FROM anon, authenticated;

CREATE OR REPLACE FUNCTION public.current_session_id()
RETURNS UUID LANGUAGE sql STABLE AS $$
  SELECT NULLIF(auth.jwt() ->> 'session_id', '')::UUID
$$;

-- ¿La próxima firma debe incluir el usuario (correo)?
CREATE OR REPLACE FUNCTION public.signature_requires_user_id()
RETURNS BOOLEAN LANGUAGE sql STABLE SECURITY DEFINER SET search_path = public AS $$
  SELECT NOT EXISTS (
    SELECT 1 FROM public.signature_sessions s
     WHERE s.session_id = public.current_session_id() AND s.user_id = auth.uid())
$$;

DROP FUNCTION IF EXISTS public.request_signature(TEXT);

CREATE FUNCTION public.request_signature(p_password TEXT, p_user_id TEXT DEFAULT NULL)
RETURNS json
LANGUAGE plpgsql
SECURITY DEFINER SET search_path = public, extensions
AS $$
DECLARE
  v_hash    TEXT;
  v_email   TEXT;
  v_token   UUID;
  v_session UUID := public.current_session_id();
  v_first   BOOLEAN;
BEGIN
  IF public.require_authenticated() IS NULL THEN
    RETURN json_build_object('ok', false, 'error', 'Usuario sin acceso');
  END IF;
  IF p_password IS NULL OR p_password = '' THEN
    RETURN json_build_object('ok', false, 'error', 'La firma electrónica requiere tu contraseña');
  END IF;

  SELECT encrypted_password, lower(email) INTO v_hash, v_email
    FROM auth.users WHERE id = auth.uid();

  v_first := public.signature_requires_user_id();
  IF v_first AND NULLIF(btrim(p_user_id), '') IS NULL THEN
    RETURN json_build_object('ok', false, 'needs_user_id', true,
      'error', 'Primera firma de la sesión: escribe tu usuario (correo) y tu contraseña');
  END IF;

  -- Ambos componentes deben corresponder al usuario en sesión
  IF (v_first AND lower(btrim(p_user_id)) <> v_email)
     OR v_hash IS NULL OR crypt(p_password, v_hash) <> v_hash THEN
    PERFORM public.log_access_attempt(v_email, false, 'firma');
    RETURN json_build_object(
      'ok', false,
      'needs_user_id', v_first,
      'error', CASE WHEN v_first THEN 'Firma electrónica rechazada: usuario o contraseña incorrectos'
                    ELSE 'Firma electrónica rechazada: contraseña incorrecta' END,
      'locked', public.is_account_locked(v_email));
  END IF;

  IF v_first AND v_session IS NOT NULL THEN
    INSERT INTO public.signature_sessions (session_id, user_id)
    VALUES (v_session, auth.uid())
    ON CONFLICT (session_id) DO NOTHING;
  END IF;

  DELETE FROM public.signature_tokens WHERE expires_at < now();
  INSERT INTO public.signature_tokens (user_id, expires_at)
  VALUES (auth.uid(), now() + interval '5 minutes')
  RETURNING token INTO v_token;

  RETURN json_build_object('ok', true, 'token', v_token);
END;
$$;

-- ------------------------------------------------------------
-- 3. Alertas de seguridad para el administrador
-- ------------------------------------------------------------
CREATE OR REPLACE FUNCTION public.security_alerts()
RETURNS json LANGUAGE plpgsql STABLE SECURITY DEFINER SET search_path = public AS $$
BEGIN
  IF COALESCE(public.get_my_role(), '') <> 'administrador' THEN
    RETURN json_build_object('locked', 0, 'failed_24h', 0);
  END IF;
  RETURN json_build_object(
    'locked', (SELECT count(*) FROM public.account_locks l
                WHERE l.locked_until > now()
                  AND (public.is_superadmin() OR public.is_my_scope_email(l.email))),
    'failed_24h', (SELECT count(*) FROM public.login_attempts a
                    WHERE NOT a.success AND a.occurred_at > now() - interval '24 hours'
                      AND (public.is_superadmin() OR public.is_my_scope_email(a.email))));
END;
$$;

REVOKE EXECUTE ON FUNCTION
  public.request_signature(TEXT, TEXT), public.signature_requires_user_id(), public.security_alerts()
FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION
  public.request_signature(TEXT, TEXT), public.signature_requires_user_id(), public.security_alerts()
TO authenticated;

COMMIT;
