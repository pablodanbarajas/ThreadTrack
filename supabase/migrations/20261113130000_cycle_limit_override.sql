-- ============================================================
-- LÍMITE DE CICLOS CON AUTORIZACIÓN DE UN SUPERIOR
-- ============================================================
--   * Prendas: límite de 100 ciclos de lavado/esterilización.
--   * Mangueras: límite de 200 ciclos de uso.
-- Al llegar al límite, el sistema detiene el registro (error TT001). Para
-- sumar más ciclos, un supervisor, jefe o administrador de la misma empresa
-- y módulo autoriza con su usuario y contraseña. La autorización vale
-- 5 minutos, es por registro (prenda o manguera) y por quien la solicita, y
-- se usa una sola vez: queda como firma electrónica del superior ligada a la
-- acción ("Autorizo exceder el límite…") y en el audit trail.
-- ============================================================

BEGIN;

-- Las mangueras ya no tienen tope fijo en la tabla: el límite lo controla
-- el trigger con autorización.
ALTER TABLE public.hoses DROP CONSTRAINT IF EXISTS hoses_current_cycle_check;
ALTER TABLE public.hoses ADD CONSTRAINT hoses_current_cycle_check CHECK (current_cycle >= 0);

CREATE TABLE IF NOT EXISTS public.cycle_limit_authorizations (
  id           UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  record_kind  TEXT NOT NULL CHECK (record_kind IN ('prenda', 'manguera')),
  record_id    UUID NOT NULL,
  requested_by UUID NOT NULL,
  superior_id  UUID NOT NULL,
  created_at   TIMESTAMPTZ NOT NULL DEFAULT now(),
  expires_at   TIMESTAMPTZ NOT NULL,
  used_at      TIMESTAMPTZ
);
CREATE INDEX IF NOT EXISTS idx_cycle_auth_lookup
  ON public.cycle_limit_authorizations (record_kind, record_id, requested_by) WHERE used_at IS NULL;
ALTER TABLE public.cycle_limit_authorizations ENABLE ROW LEVEL SECURITY;  -- sin políticas: solo vía funciones
REVOKE ALL ON public.cycle_limit_authorizations FROM anon, authenticated;

-- Firma a nombre de otro usuario (el superior que autorizó). Solo uso interno.
CREATE OR REPLACE FUNCTION public.record_signature_as(p_user_id UUID, p_meaning TEXT, p_table TEXT, p_record_id TEXT)
RETURNS UUID LANGUAGE plpgsql SECURITY DEFINER SET search_path = public
AS $$
DECLARE
  v_id UUID;
BEGIN
  INSERT INTO public.electronic_signatures (user_id, user_email, user_name, user_role, meaning, table_name, record_id)
  SELECT au.id, lower(au.email), NULLIF(btrim(up.full_name), ''), up.role, btrim(p_meaning), p_table, p_record_id
    FROM auth.users au JOIN public.user_profiles up ON up.id = au.id
   WHERE au.id = p_user_id
  RETURNING id INTO v_id;
  RETURN v_id;
END;
$$;

-- Un superior autoriza exceder el límite para uno o varios registros
CREATE OR REPLACE FUNCTION public.authorize_cycle_limit(
  p_kind     TEXT,     -- 'prenda' | 'manguera'
  p_ids      UUID[],
  p_email    TEXT,
  p_password TEXT
)
RETURNS json
LANGUAGE plpgsql
SECURITY DEFINER SET search_path = public, extensions
AS $$
DECLARE
  v_caller_role TEXT := public.require_authenticated();
  v_email   TEXT := lower(btrim(COALESCE(p_email, '')));
  v_sup     RECORD;
  v_module  TEXT := CASE p_kind WHEN 'prenda' THEN 'prendas' WHEN 'manguera' THEN 'mangueras' END;
  v_id      UUID;
BEGIN
  IF v_caller_role IS NULL THEN
    RETURN json_build_object('ok', false, 'error', 'Usuario sin acceso');
  END IF;
  IF v_module IS NULL OR p_ids IS NULL OR cardinality(p_ids) = 0 OR cardinality(p_ids) > 500 THEN
    RETURN json_build_object('ok', false, 'error', 'Solicitud de autorización inválida');
  END IF;
  IF v_email = '' OR COALESCE(p_password, '') = '' THEN
    RETURN json_build_object('ok', false, 'error', 'Escribe el usuario (correo) y la contraseña del superior');
  END IF;
  IF public.is_account_locked(v_email) THEN
    RETURN json_build_object('ok', false, 'error', 'La cuenta del superior está bloqueada temporalmente por intentos fallidos');
  END IF;

  SELECT au.id, au.encrypted_password, up.role, up.organization_id, up.modules, up.is_active,
         COALESCE(NULLIF(btrim(up.full_name), ''), au.email) AS name
    INTO v_sup
    FROM auth.users au JOIN public.user_profiles up ON up.id = au.id
   WHERE lower(au.email) = v_email;

  IF v_sup.id IS NULL OR crypt(p_password, v_sup.encrypted_password) <> v_sup.encrypted_password THEN
    IF v_sup.id IS NOT NULL THEN
      PERFORM public.log_access_attempt(v_email, false, 'firma');
    END IF;
    RETURN json_build_object('ok', false, 'error', 'Autorización rechazada: usuario o contraseña del superior incorrectos');
  END IF;

  IF NOT v_sup.is_active
     OR v_sup.role NOT IN ('supervisor', 'jefe', 'administrador')
     OR v_sup.organization_id IS DISTINCT FROM public.get_my_org_id()
     OR NOT (v_module = ANY (COALESCE(v_sup.modules, '{}'::TEXT[]))) THEN
    RETURN json_build_object('ok', false, 'error',
      'Solo un supervisor, jefe o administrador activo de tu empresa y de este módulo puede autorizar');
  END IF;

  FOREACH v_id IN ARRAY p_ids LOOP
    IF (p_kind = 'prenda' AND NOT public.can_access_garment(v_id))
       OR (p_kind = 'manguera' AND NOT public.can_access_hose(v_id)) THEN
      RETURN json_build_object('ok', false, 'error', 'Sin acceso a uno de los registros');
    END IF;
    INSERT INTO public.cycle_limit_authorizations (record_kind, record_id, requested_by, superior_id, expires_at)
    VALUES (p_kind, v_id, auth.uid(), v_sup.id, now() + interval '5 minutes');
  END LOOP;

  PERFORM public.log_access_attempt(v_email, true, 'firma');
  RETURN json_build_object('ok', true, 'superior', v_sup.name);
END;
$$;

-- Consume una autorización vigente y devuelve el id del superior (o NULL)
CREATE OR REPLACE FUNCTION public.consume_cycle_authorization(p_kind TEXT, p_record_id UUID)
RETURNS UUID LANGUAGE plpgsql SECURITY DEFINER SET search_path = public
AS $$
DECLARE
  v_auth public.cycle_limit_authorizations;
BEGIN
  SELECT * INTO v_auth FROM public.cycle_limit_authorizations
   WHERE record_kind = p_kind AND record_id = p_record_id AND requested_by = auth.uid()
     AND used_at IS NULL AND expires_at > now()
   ORDER BY created_at
   LIMIT 1
   FOR UPDATE SKIP LOCKED;
  IF NOT FOUND THEN
    RETURN NULL;
  END IF;
  UPDATE public.cycle_limit_authorizations SET used_at = now() WHERE id = v_auth.id;
  RETURN v_auth.superior_id;
END;
$$;

-- ------------------------------------------------------------
-- Prendas: 100 ciclos de lavado/esterilización
-- ------------------------------------------------------------
CREATE OR REPLACE FUNCTION public.enforce_garment_cycle_limit()
RETURNS TRIGGER LANGUAGE plpgsql SECURITY DEFINER SET search_path = public
AS $$
DECLARE
  c_limit CONSTANT INTEGER := 100;
  v_count INTEGER;
  v_code  TEXT;
  v_sup   UUID;
  v_sig   UUID;
BEGIN
  SELECT count(*) INTO v_count FROM public.garment_actions
   WHERE garment_id = NEW.garment_id AND action_type IN ('lavado', 'esterilizacion');
  IF v_count < c_limit THEN
    RETURN NEW;
  END IF;

  v_sup := public.consume_cycle_authorization('prenda', NEW.garment_id);
  IF v_sup IS NULL THEN
    SELECT code INTO v_code FROM public.garments WHERE id = NEW.garment_id;
    RAISE EXCEPTION 'La prenda % alcanzó el límite de % ciclos (lleva %). Para registrar otro ciclo se requiere la autorización de un supervisor, jefe o administrador.',
      v_code, c_limit, v_count USING ERRCODE = 'TT001';
  END IF;

  NEW.id := COALESCE(NEW.id, gen_random_uuid());
  v_sig := public.record_signature_as(v_sup,
    format('Autorizo exceder el límite de %s ciclos de lavado y esterilización (ciclo %s)', c_limit, v_count + 1),
    'garment_actions', NEW.id::TEXT);
  NEW.signature_id := COALESCE(NEW.signature_id, v_sig);
  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS enforce_garment_cycle_limit ON public.garment_actions;
CREATE TRIGGER enforce_garment_cycle_limit
  BEFORE INSERT ON public.garment_actions
  FOR EACH ROW WHEN (NEW.action_type IN ('lavado', 'esterilizacion'))
  EXECUTE FUNCTION public.enforce_garment_cycle_limit();

-- ------------------------------------------------------------
-- Mangueras: 200 ciclos de uso
-- ------------------------------------------------------------
CREATE OR REPLACE FUNCTION public.enforce_hose_cycle_limit()
RETURNS TRIGGER LANGUAGE plpgsql SECURITY DEFINER SET search_path = public
AS $$
DECLARE
  c_limit CONSTANT INTEGER := 200;
  v_code  TEXT;
  v_sup   UUID;
  v_sig   UUID;
BEGIN
  IF NEW.cycle_after IS NULL OR NEW.cycle_after <= c_limit THEN
    RETURN NEW;
  END IF;

  v_sup := public.consume_cycle_authorization('manguera', NEW.hose_id);
  IF v_sup IS NULL THEN
    SELECT short_code INTO v_code FROM public.hoses WHERE id = NEW.hose_id;
    RAISE EXCEPTION 'La manguera % alcanzó el límite de % ciclos (lleva %). Para registrar otro ciclo se requiere la autorización de un supervisor, jefe o administrador.',
      COALESCE(v_code, NEW.hose_id::TEXT), c_limit, NEW.cycle_after - 1 USING ERRCODE = 'TT001';
  END IF;

  NEW.id := COALESCE(NEW.id, gen_random_uuid());
  v_sig := public.record_signature_as(v_sup,
    format('Autorizo exceder el límite de %s ciclos de uso de la manguera (ciclo %s)', c_limit, NEW.cycle_after),
    'hose_actions', NEW.id::TEXT);
  NEW.signature_id := COALESCE(NEW.signature_id, v_sig);
  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS enforce_hose_cycle_limit ON public.hose_actions;
CREATE TRIGGER enforce_hose_cycle_limit
  BEFORE INSERT ON public.hose_actions
  FOR EACH ROW WHEN (NEW.action_type = 'uso')
  EXECUTE FUNCTION public.enforce_hose_cycle_limit();

-- register_hose_action: el tope pasa al trigger (con autorización); el resto igual
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

REVOKE EXECUTE ON FUNCTION
  public.record_signature_as(UUID, TEXT, TEXT, TEXT),
  public.consume_cycle_authorization(TEXT, UUID),
  public.enforce_garment_cycle_limit(),
  public.enforce_hose_cycle_limit()
FROM PUBLIC, anon, authenticated;
REVOKE EXECUTE ON FUNCTION public.authorize_cycle_limit(TEXT, UUID[], TEXT, TEXT) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.authorize_cycle_limit(TEXT, UUID[], TEXT, TEXT) TO authenticated;

COMMIT;
