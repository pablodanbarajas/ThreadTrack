-- ============================================================
-- FUNCIONES RPC TRANSACCIONALES (única vía de escritura)
-- ============================================================
-- Cada función:
--   * valida autenticación, rol y pertenencia al equipo en el servidor;
--   * bloquea la fila (FOR UPDATE) para evitar conteos perdidos por
--     concurrencia;
--   * cambia estado + inserta historial en UNA transacción;
--   * fija app.change_reason para que el audit trail guarde el motivo.
-- ============================================================

BEGIN;

-- ------------------------------------------------------------
-- Helpers
-- ------------------------------------------------------------
CREATE OR REPLACE FUNCTION public.require_authenticated()
RETURNS TEXT
LANGUAGE plpgsql STABLE
SECURITY DEFINER SET search_path = public
AS $$
DECLARE
  v_role TEXT;
BEGIN
  IF auth.uid() IS NULL THEN
    RAISE EXCEPTION 'Usuario no autenticado' USING ERRCODE = '42501';
  END IF;
  v_role := public.get_my_role();
  IF v_role IS NULL THEN
    RAISE EXCEPTION 'El usuario no tiene perfil asignado' USING ERRCODE = '42501';
  END IF;
  RETURN v_role;
END;
$$;

CREATE OR REPLACE FUNCTION public.require_text(p_value TEXT, p_field TEXT)
RETURNS TEXT
LANGUAGE plpgsql IMMUTABLE
AS $$
BEGIN
  IF p_value IS NULL OR btrim(p_value) = '' THEN
    RAISE EXCEPTION 'El campo % es obligatorio', p_field USING ERRCODE = '22023';
  END IF;
  RETURN btrim(p_value);
END;
$$;

CREATE OR REPLACE FUNCTION public.set_change_reason(p_reason TEXT)
RETURNS VOID
LANGUAGE sql
AS $$
  SELECT set_config('app.change_reason', COALESCE(p_reason, ''), true);
$$;

REVOKE EXECUTE ON FUNCTION public.require_authenticated() FROM PUBLIC, anon, authenticated;
REVOKE EXECUTE ON FUNCTION public.set_change_reason(TEXT)  FROM PUBLIC, anon, authenticated;

-- ============================================================
-- PRENDAS
-- ============================================================

-- Registrar lavado/esterilización, inspección, reparación o baja
CREATE OR REPLACE FUNCTION public.register_garment_action(
  p_garment_id  UUID,
  p_action_type TEXT,
  p_responsible TEXT,
  p_result      TEXT DEFAULT NULL,
  p_notes       TEXT DEFAULT NULL
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
    WHEN p_action_type = 'lavado'                              THEN 'disponible'
    WHEN p_action_type = 'inspeccion' AND p_result = 'aprobado' THEN 'disponible'
    WHEN p_action_type = 'inspeccion' AND p_result IS NOT NULL  THEN p_result
    ELSE p_action_type
  END;

  -- Dar de baja es un cambio de estado crítico: solo jefe/supervisor/administrador
  IF v_new_status = 'baja' AND v_role NOT IN ('jefe', 'supervisor', 'administrador') THEN
    RAISE EXCEPTION 'Solo jefe, supervisor o administrador pueden dar de baja una prenda' USING ERRCODE = '42501';
  END IF;
  IF v_new_status = 'baja' THEN
    PERFORM public.require_text(p_notes, 'MOTIVO DE BAJA');
  END IF;

  PERFORM public.set_change_reason(
    format('Acción %s%s', p_action_type, COALESCE(' (' || p_result || ')', '')) ||
    COALESCE(': ' || NULLIF(btrim(p_notes), ''), '')
  );

  UPDATE public.garments
     SET status     = v_new_status,
         baja_reason = CASE WHEN v_new_status = 'baja' THEN btrim(p_notes) ELSE baja_reason END,
         baja_date   = CASE WHEN v_new_status = 'baja' THEN now()          ELSE baja_date   END,
         updated_at = now()
   WHERE id = p_garment_id;

  INSERT INTO public.garment_actions (garment_id, action_type, result, notes, performed_by)
  VALUES (p_garment_id, p_action_type, p_result, NULLIF(btrim(p_notes), ''), v_responsible)
  RETURNING * INTO v_action;

  INSERT INTO public.movements (garment_id, previous_status, new_status, notes)
  VALUES (p_garment_id, v_garment.status, v_new_status, NULLIF(btrim(p_notes), ''));

  RETURN v_action;
END;
$$;

-- Editar datos descriptivos de una prenda (motivo obligatorio)
CREATE OR REPLACE FUNCTION public.update_garment(
  p_garment_id   UUID,
  p_name         TEXT,
  p_description  TEXT,
  p_client_name  TEXT,
  p_client_phone TEXT,
  p_notes        TEXT,
  p_reason       TEXT
)
RETURNS public.garments
LANGUAGE plpgsql
SECURITY DEFINER SET search_path = public
AS $$
DECLARE
  v_role    TEXT := public.require_authenticated();
  v_reason  TEXT := public.require_text(p_reason, 'MOTIVO DEL CAMBIO');
  v_name    TEXT := public.require_text(p_name, 'NOMBRE');
  v_garment public.garments;
BEGIN
  IF v_role NOT IN ('jefe', 'supervisor', 'administrador') THEN
    RAISE EXCEPTION 'Sin permisos para editar prendas' USING ERRCODE = '42501';
  END IF;
  IF NOT public.can_access_garment(p_garment_id) THEN
    RAISE EXCEPTION 'Sin acceso a esta prenda' USING ERRCODE = '42501';
  END IF;

  PERFORM public.set_change_reason(v_reason);

  UPDATE public.garments
     SET name         = v_name,
         description  = NULLIF(btrim(p_description), ''),
         client_name  = NULLIF(btrim(p_client_name), ''),
         client_phone = NULLIF(btrim(p_client_phone), ''),
         notes        = NULLIF(btrim(p_notes), ''),
         updated_at   = now()
   WHERE id = p_garment_id AND archived_at IS NULL
  RETURNING * INTO v_garment;

  IF NOT FOUND THEN
    RAISE EXCEPTION 'Prenda no encontrada o archivada' USING ERRCODE = 'P0002';
  END IF;

  RETURN v_garment;
END;
$$;

-- Archivar (reemplaza al borrado físico)
CREATE OR REPLACE FUNCTION public.archive_garment(
  p_garment_id UUID,
  p_reason     TEXT
)
RETURNS public.garments
LANGUAGE plpgsql
SECURITY DEFINER SET search_path = public
AS $$
DECLARE
  v_role    TEXT := public.require_authenticated();
  v_reason  TEXT := public.require_text(p_reason, 'MOTIVO');
  v_garment public.garments;
BEGIN
  IF v_role NOT IN ('jefe', 'administrador') THEN
    RAISE EXCEPTION 'Solo jefe o administrador pueden archivar prendas' USING ERRCODE = '42501';
  END IF;
  IF NOT public.can_access_garment(p_garment_id) THEN
    RAISE EXCEPTION 'Sin acceso a esta prenda' USING ERRCODE = '42501';
  END IF;

  PERFORM public.set_change_reason('Archivado: ' || v_reason);

  UPDATE public.garments
     SET archived_at    = now(),
         archived_by    = auth.uid(),
         archive_reason = v_reason,
         updated_at     = now()
   WHERE id = p_garment_id AND archived_at IS NULL
  RETURNING * INTO v_garment;

  IF NOT FOUND THEN
    RAISE EXCEPTION 'Prenda no encontrada o ya archivada' USING ERRCODE = 'P0002';
  END IF;

  RETURN v_garment;
END;
$$;

-- Bitácora completa de una prenda (datos, acciones, movimientos, documentos)
CREATE OR REPLACE FUNCTION public.get_garment_audit_trail(p_garment_id UUID)
RETURNS SETOF public.audit_log
LANGUAGE plpgsql STABLE
SECURITY DEFINER SET search_path = public
AS $$
DECLARE
  v_role TEXT := public.require_authenticated();
BEGIN
  IF v_role NOT IN ('jefe', 'supervisor', 'administrador') THEN
    RAISE EXCEPTION 'Sin permisos para consultar el audit trail' USING ERRCODE = '42501';
  END IF;
  IF NOT public.can_access_garment(p_garment_id) THEN
    RAISE EXCEPTION 'Sin acceso a esta prenda' USING ERRCODE = '42501';
  END IF;

  RETURN QUERY
    SELECT a.*
      FROM public.audit_log a
     WHERE (a.table_name = 'garments' AND a.record_id = p_garment_id::TEXT)
        OR (a.table_name IN ('garment_actions', 'movements', 'documents', 'garment_assignments')
            AND COALESCE(a.new_data, a.old_data) ->> 'garment_id' = p_garment_id::TEXT)
     ORDER BY a.occurred_at, a.id;
END;
$$;

-- ============================================================
-- MANGUERAS
-- ============================================================

-- Registrar uso (suma un ciclo), inspección o baja manual
CREATE OR REPLACE FUNCTION public.register_hose_action(
  p_hose_id     UUID,
  p_action_type TEXT,
  p_responsible TEXT,
  p_notes       TEXT DEFAULT NULL
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
  c_max_cycles  CONSTANT INTEGER := 200;  -- igual a MAX_HOSE_CYCLES en el frontend
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

  IF p_action_type = 'uso' THEN
    IF v_hose.current_cycle >= c_max_cycles THEN
      RAISE EXCEPTION 'La manguera % alcanzó el límite de % ciclos; debe reemplazarse',
        COALESCE(v_hose.short_code, v_hose.id::TEXT), c_max_cycles USING ERRCODE = '22023';
    END IF;
    v_cycle_after := v_hose.current_cycle + 1;
    PERFORM public.set_change_reason(format('Uso: ciclo %s → %s', v_hose.current_cycle, v_cycle_after));
    UPDATE public.hoses
       SET current_cycle = v_cycle_after, updated_at = now()
     WHERE id = p_hose_id;

  ELSIF p_action_type = 'baja' THEN
    IF v_role NOT IN ('jefe', 'supervisor', 'administrador') THEN
      RAISE EXCEPTION 'Solo jefe, supervisor o administrador pueden dar de baja una manguera' USING ERRCODE = '42501';
    END IF;
    PERFORM public.require_text(p_notes, 'MOTIVO DE BAJA');
    PERFORM public.set_change_reason('Baja: ' || btrim(p_notes));
    UPDATE public.hoses
       SET status = 'baja', baja_reason = btrim(p_notes), baja_date = now(), updated_at = now()
     WHERE id = p_hose_id;

  ELSE
    PERFORM public.set_change_reason('Inspección' || COALESCE(': ' || NULLIF(btrim(p_notes), ''), ''));
  END IF;

  INSERT INTO public.hose_actions (hose_id, action_type, cycle_after, notes, performed_by)
  VALUES (p_hose_id, p_action_type, v_cycle_after, NULLIF(btrim(p_notes), ''), v_responsible)
  RETURNING * INTO v_action;

  RETURN v_action;
END;
$$;

-- Registrar uso a varias mangueras (todo o nada)
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

  -- Orden fijo para evitar interbloqueos entre capturas simultáneas
  FOR v_hose_id IN SELECT DISTINCT unnest(p_hose_ids) ORDER BY 1
  LOOP
    RETURN NEXT public.register_hose_action(v_hose_id, 'uso', p_responsible, p_notes);
  END LOOP;
END;
$$;

-- Reemplazo de manguera: ahora valida equipo y exige motivo
CREATE OR REPLACE FUNCTION public.replace_hose(
  p_position_id  UUID,
  p_reason       TEXT,
  p_performed_by TEXT
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
BEGIN
  IF v_role NOT IN ('jefe', 'supervisor', 'administrador') THEN
    RAISE EXCEPTION 'Sin permisos para reemplazar mangueras' USING ERRCODE = '42501';
  END IF;
  IF NOT public.can_access_position(p_position_id) THEN
    RAISE EXCEPTION 'Sin acceso a esta posición' USING ERRCODE = '42501';
  END IF;

  SELECT * INTO v_old_hose
    FROM public.hoses
   WHERE position_id = p_position_id AND status = 'activa'
   FOR UPDATE;

  IF NOT FOUND THEN
    RAISE EXCEPTION 'No hay manguera activa en esta posición' USING ERRCODE = 'P0002';
  END IF;

  PERFORM public.set_change_reason('Reemplazo: ' || v_reason);

  UPDATE public.hoses
     SET status = 'baja', baja_reason = v_reason, baja_date = now(), updated_at = now()
   WHERE id = v_old_hose.id;

  INSERT INTO public.hose_actions (hose_id, action_type, cycle_after, notes, performed_by)
  VALUES (v_old_hose.id, 'reemplazo', v_old_hose.current_cycle, v_reason, v_responsible);

  LOOP
    SELECT COALESCE(MAX(CAST(SUBSTRING(short_code FROM 2) AS INTEGER)), 0) + 1
      INTO v_seq
      FROM public.hoses
     WHERE short_code ~ '^M[0-9]+$';

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

-- Editar código/nombre de un equipo
CREATE OR REPLACE FUNCTION public.update_equipment(
  p_equipment_id UUID,
  p_code         TEXT,
  p_name         TEXT,
  p_reason       TEXT
)
RETURNS public.equipment
LANGUAGE plpgsql
SECURITY DEFINER SET search_path = public
AS $$
DECLARE
  v_role      TEXT := public.require_authenticated();
  v_reason    TEXT := public.require_text(p_reason, 'MOTIVO DEL CAMBIO');
  v_equipment public.equipment;
BEGIN
  IF v_role NOT IN ('jefe', 'supervisor', 'administrador') THEN
    RAISE EXCEPTION 'Sin permisos para editar productos' USING ERRCODE = '42501';
  END IF;
  IF NOT public.can_access_equipment(p_equipment_id) THEN
    RAISE EXCEPTION 'Sin acceso a este producto' USING ERRCODE = '42501';
  END IF;

  PERFORM public.set_change_reason(v_reason);

  UPDATE public.equipment
     SET code       = COALESCE(NULLIF(btrim(p_code), ''), code),
         name       = COALESCE(NULLIF(btrim(p_name), ''), name),
         updated_at = now()
   WHERE id = p_equipment_id AND archived_at IS NULL
  RETURNING * INTO v_equipment;

  IF NOT FOUND THEN
    RAISE EXCEPTION 'Producto no encontrado o archivado' USING ERRCODE = 'P0002';
  END IF;

  RETURN v_equipment;
END;
$$;

-- Editar calibre/longitud/etiqueta de una posición
CREATE OR REPLACE FUNCTION public.update_hose_position(
  p_position_id UUID,
  p_caliber     TEXT,
  p_length      TEXT,
  p_label       TEXT,
  p_reason      TEXT
)
RETURNS public.hose_positions
LANGUAGE plpgsql
SECURITY DEFINER SET search_path = public
AS $$
DECLARE
  v_role     TEXT := public.require_authenticated();
  v_reason   TEXT := public.require_text(p_reason, 'MOTIVO DEL CAMBIO');
  v_position public.hose_positions;
BEGIN
  IF v_role NOT IN ('jefe', 'supervisor', 'administrador') THEN
    RAISE EXCEPTION 'Sin permisos para editar posiciones' USING ERRCODE = '42501';
  END IF;
  IF NOT public.can_access_position(p_position_id) THEN
    RAISE EXCEPTION 'Sin acceso a esta posición' USING ERRCODE = '42501';
  END IF;

  PERFORM public.set_change_reason(v_reason);

  UPDATE public.hose_positions
     SET caliber = COALESCE(NULLIF(btrim(p_caliber), ''), caliber),
         length  = NULLIF(btrim(p_length), ''),
         label   = NULLIF(btrim(p_label), '')
   WHERE id = p_position_id
  RETURNING * INTO v_position;

  RETURN v_position;
END;
$$;

-- Archivar un equipo (reemplaza al borrado en cascada)
CREATE OR REPLACE FUNCTION public.archive_equipment(
  p_equipment_id UUID,
  p_reason       TEXT
)
RETURNS public.equipment
LANGUAGE plpgsql
SECURITY DEFINER SET search_path = public
AS $$
DECLARE
  v_role      TEXT := public.require_authenticated();
  v_reason    TEXT := public.require_text(p_reason, 'MOTIVO');
  v_equipment public.equipment;
BEGIN
  IF v_role NOT IN ('jefe', 'administrador') THEN
    RAISE EXCEPTION 'Solo jefe o administrador pueden archivar productos' USING ERRCODE = '42501';
  END IF;
  IF NOT public.can_access_equipment(p_equipment_id) THEN
    RAISE EXCEPTION 'Sin acceso a este producto' USING ERRCODE = '42501';
  END IF;

  PERFORM public.set_change_reason('Archivado: ' || v_reason);

  UPDATE public.equipment
     SET archived_at    = now(),
         archived_by    = auth.uid(),
         archive_reason = v_reason,
         updated_at     = now()
   WHERE id = p_equipment_id AND archived_at IS NULL
  RETURNING * INTO v_equipment;

  IF NOT FOUND THEN
    RAISE EXCEPTION 'Producto no encontrado o ya archivado' USING ERRCODE = 'P0002';
  END IF;

  RETURN v_equipment;
END;
$$;

-- ------------------------------------------------------------
-- Permisos de ejecución
-- ------------------------------------------------------------
REVOKE EXECUTE ON FUNCTION
  public.register_garment_action(UUID, TEXT, TEXT, TEXT, TEXT),
  public.update_garment(UUID, TEXT, TEXT, TEXT, TEXT, TEXT, TEXT),
  public.archive_garment(UUID, TEXT),
  public.get_garment_audit_trail(UUID),
  public.register_hose_action(UUID, TEXT, TEXT, TEXT),
  public.register_bulk_hose_use(UUID[], TEXT, TEXT),
  public.replace_hose(UUID, TEXT, TEXT),
  public.update_equipment(UUID, TEXT, TEXT, TEXT),
  public.update_hose_position(UUID, TEXT, TEXT, TEXT, TEXT),
  public.archive_equipment(UUID, TEXT)
FROM PUBLIC, anon;

GRANT EXECUTE ON FUNCTION
  public.register_garment_action(UUID, TEXT, TEXT, TEXT, TEXT),
  public.update_garment(UUID, TEXT, TEXT, TEXT, TEXT, TEXT, TEXT),
  public.archive_garment(UUID, TEXT),
  public.get_garment_audit_trail(UUID),
  public.register_hose_action(UUID, TEXT, TEXT, TEXT),
  public.register_bulk_hose_use(UUID[], TEXT, TEXT),
  public.replace_hose(UUID, TEXT, TEXT),
  public.update_equipment(UUID, TEXT, TEXT, TEXT),
  public.update_hose_position(UUID, TEXT, TEXT, TEXT, TEXT),
  public.archive_equipment(UUID, TEXT)
TO authenticated;

COMMIT;
