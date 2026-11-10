-- ============================================================
-- MANGUERAS AL NIVEL DE PRENDAS
-- ============================================================
--   * list_equipment: filtros (vida útil, calibre, atención, inactividad)
--     y ordenamiento; devuelve ciclos máximos, vida útil y última acción.
--   * hose_calibers: calibres existentes (para el filtro).
--   * hose_stats: totales para el Inicio de mangueras.
--   * get_hose_status_at: estado de cada manguera al cierre de una fecha.
--   * existing_equipment_codes: validar una importación antes de crear.
--   * create_equipment: queda bajo control de cambios; usa el rol efectivo,
--     exige el módulo de mangueras y valida calibres.
-- Mismas reglas de acceso que el resto: empresa + módulo.
-- ============================================================

BEGIN;

-- Vida útil de mangueras (mismos umbrales que src/lib/hoseLifeStatus.ts, límite 200)
CREATE OR REPLACE FUNCTION public.hose_life_status_for(p_cycles BIGINT)
RETURNS TEXT LANGUAGE sql IMMUTABLE AS $$
  SELECT CASE WHEN p_cycles >= 150 THEN 'rojo' WHEN p_cycles >= 100 THEN 'naranja'
              WHEN p_cycles >= 50 THEN 'amarillo' ELSE 'verde' END
$$;

CREATE INDEX IF NOT EXISTS idx_hose_actions_hose ON public.hose_actions (hose_id, created_at);
CREATE INDEX IF NOT EXISTS idx_hose_positions_equipment ON public.hose_positions (equipment_id);

-- ------------------------------------------------------------
-- Equipos paginados con filtros
-- ------------------------------------------------------------
DROP FUNCTION IF EXISTS public.list_equipment(TEXT, INTEGER, INTEGER);

CREATE FUNCTION public.list_equipment(
  p_search    TEXT    DEFAULT NULL,
  p_limit     INTEGER DEFAULT 20,
  p_offset    INTEGER DEFAULT 0,
  p_caliber   TEXT    DEFAULT NULL,   -- equipos que tienen ese calibre
  p_life      TEXT[]  DEFAULT NULL,   -- vida útil de la manguera más usada
  p_idle_days INTEGER DEFAULT NULL,   -- sin acciones en los últimos N días
  p_attention BOOLEAN DEFAULT FALSE,  -- alguna posición sin manguera activa
  p_sort      TEXT    DEFAULT 'recientes'  -- recientes | ciclos | codigo | inactividad
)
RETURNS TABLE(
  id UUID, code TEXT, name TEXT, team_id UUID, organization_id UUID,
  created_at TIMESTAMPTZ, updated_at TIMESTAMPTZ,
  positions JSONB, max_cycle INTEGER, life_status TEXT, last_action_at TIMESTAMPTZ,
  needs_attention BOOLEAN, total_count BIGINT
)
LANGUAGE plpgsql STABLE
SECURITY DEFINER SET search_path = public
AS $$
DECLARE
  v_super  BOOLEAN := public.is_superadmin();
  v_org    UUID    := public.get_my_org_id();
  v_search TEXT    := NULLIF(lower(btrim(p_search)), '');
  v_sort   TEXT    := COALESCE(p_sort, 'recientes');
BEGIN
  IF public.get_my_role() IS NULL OR NOT public.has_module('mangueras') THEN
    RETURN;
  END IF;

  RETURN QUERY
  WITH eq AS (
    SELECT e.*
      FROM public.equipment e
     WHERE e.archived_at IS NULL
       AND (v_super OR e.organization_id = v_org)
  ),
  agg AS (
    SELECT eq.id AS equipment_id,
           COALESCE(max(h.current_cycle) FILTER (WHERE h.status = 'activa'), 0)::INTEGER AS max_cycle,
           max(a.last_at)                                                                AS last_at,
           bool_or(NOT EXISTS (SELECT 1 FROM public.hoses ha
                                WHERE ha.position_id = p.id AND ha.status = 'activa'))   AS attention,
           bool_or(p.caliber = p_caliber)                                                AS has_caliber
      FROM eq
      LEFT JOIN public.hose_positions p ON p.equipment_id = eq.id
      LEFT JOIN public.hoses h          ON h.position_id = p.id
      LEFT JOIN LATERAL (SELECT max(x.created_at) AS last_at
                           FROM public.hose_actions x WHERE x.hose_id = h.id) a ON TRUE
     GROUP BY eq.id
  ),
  base AS (
    SELECT eq.*, agg.max_cycle, agg.last_at, COALESCE(agg.attention, FALSE) AS attention,
           public.hose_life_status_for(agg.max_cycle) AS life
      FROM eq JOIN agg ON agg.equipment_id = eq.id
     WHERE (v_search IS NULL
            OR lower(eq.code) LIKE '%' || v_search || '%'
            OR lower(eq.name) LIKE '%' || v_search || '%'
            OR EXISTS (SELECT 1 FROM public.hose_positions p JOIN public.hoses h ON h.position_id = p.id
                        WHERE p.equipment_id = eq.id AND lower(COALESCE(h.short_code, '')) LIKE '%' || v_search || '%'))
       AND (p_caliber IS NULL OR agg.has_caliber)
       AND (p_idle_days IS NULL OR COALESCE(agg.last_at, eq.created_at) < now() - make_interval(days => p_idle_days))
       AND (NOT COALESCE(p_attention, FALSE) OR agg.attention)
  )
  SELECT b.id, b.code::TEXT, b.name::TEXT, b.team_id, b.organization_id, b.created_at, b.updated_at,
         COALESCE((
           SELECT jsonb_agg(jsonb_build_object(
                    'id', p.id, 'equipment_id', p.equipment_id, 'caliber', p.caliber,
                    'length', p.length, 'label', p.label, 'created_at', p.created_at,
                    'activeHose', (SELECT to_jsonb(h) FROM public.hoses h
                                    WHERE h.position_id = p.id AND h.status = 'activa' LIMIT 1),
                    'history', COALESCE((SELECT jsonb_agg(to_jsonb(h) ORDER BY h.installed_at DESC)
                                           FROM public.hoses h WHERE h.position_id = p.id), '[]'::jsonb))
                  ORDER BY p.caliber)
             FROM public.hose_positions p WHERE p.equipment_id = b.id), '[]'::jsonb),
         b.max_cycle, b.life, b.last_at, b.attention,
         count(*) OVER ()
    FROM base b
   WHERE p_life IS NULL OR cardinality(p_life) = 0 OR b.life = ANY (p_life)
   ORDER BY CASE WHEN v_sort = 'ciclos'      THEN b.max_cycle END DESC NULLS LAST,
            CASE WHEN v_sort = 'codigo'      THEN b.code END ASC,
            CASE WHEN v_sort = 'inactividad' THEN COALESCE(b.last_at, b.created_at) END ASC,
            b.created_at DESC
   LIMIT LEAST(GREATEST(COALESCE(p_limit, 20), 1), 500)
  OFFSET GREATEST(COALESCE(p_offset, 0), 0);
END;
$$;

-- Calibres existentes en los equipos visibles (para el filtro)
CREATE OR REPLACE FUNCTION public.hose_calibers()
RETURNS SETOF TEXT
LANGUAGE sql STABLE
SECURITY DEFINER SET search_path = public
AS $$
  SELECT DISTINCT p.caliber::TEXT
    FROM public.hose_positions p
    JOIN public.equipment e ON e.id = p.equipment_id
   WHERE public.get_my_role() IS NOT NULL AND public.has_module('mangueras')
     AND e.archived_at IS NULL
     AND (public.is_superadmin() OR e.organization_id = public.get_my_org_id())
   ORDER BY 1;
$$;

-- ------------------------------------------------------------
-- Totales para el Inicio de mangueras
-- ------------------------------------------------------------
CREATE OR REPLACE FUNCTION public.hose_stats()
RETURNS JSON
LANGUAGE plpgsql STABLE
SECURITY DEFINER SET search_path = public
AS $$
DECLARE
  v_super BOOLEAN := public.is_superadmin();
  v_org   UUID    := public.get_my_org_id();
  v_out   JSON;
BEGIN
  IF public.get_my_role() IS NULL OR NOT public.has_module('mangueras') THEN
    RETURN NULL;
  END IF;

  WITH eq AS (
    SELECT e.id FROM public.equipment e
     WHERE e.archived_at IS NULL AND (v_super OR e.organization_id = v_org)
  ),
  hs AS (
    SELECT h.* FROM public.hoses h
      JOIN public.hose_positions p ON p.id = h.position_id
      JOIN eq ON eq.id = p.equipment_id
  ),
  act AS (
    SELECT h.current_cycle FROM hs h WHERE h.status = 'activa'
  )
  SELECT json_build_object(
    'equipment',     (SELECT count(*) FROM eq),
    'positions',     (SELECT count(*) FROM public.hose_positions p JOIN eq ON eq.id = p.equipment_id),
    'active',        (SELECT count(*) FROM act),
    'without_hose',  (SELECT count(*) FROM public.hose_positions p JOIN eq ON eq.id = p.equipment_id
                       WHERE NOT EXISTS (SELECT 1 FROM public.hoses h WHERE h.position_id = p.id AND h.status = 'activa')),
    'at_limit',      (SELECT count(*) FROM act WHERE current_cycle >= 200),
    'uses_30d',      (SELECT count(*) FROM public.hose_actions a JOIN hs ON hs.id = a.hose_id
                       WHERE a.action_type = 'uso' AND a.created_at >= now() - interval '30 days'),
    'replaced_30d',  (SELECT count(*) FROM public.hose_actions a JOIN hs ON hs.id = a.hose_id
                       WHERE a.action_type IN ('reemplazo', 'baja') AND a.created_at >= now() - interval '30 days'),
    'life', json_build_object(
      'verde',    (SELECT count(*) FROM act WHERE public.hose_life_status_for(current_cycle) = 'verde'),
      'amarillo', (SELECT count(*) FROM act WHERE public.hose_life_status_for(current_cycle) = 'amarillo'),
      'naranja',  (SELECT count(*) FROM act WHERE public.hose_life_status_for(current_cycle) = 'naranja'),
      'rojo',     (SELECT count(*) FROM act WHERE public.hose_life_status_for(current_cycle) = 'rojo'))
  ) INTO v_out;

  RETURN v_out;
END;
$$;

-- ------------------------------------------------------------
-- Estado de las mangueras al cierre de una fecha (reconstruido del historial)
-- ------------------------------------------------------------
CREATE OR REPLACE FUNCTION public.get_hose_status_at(p_at TIMESTAMPTZ)
RETURNS TABLE(
  equipment_code TEXT, equipment_name TEXT, caliber TEXT, length TEXT,
  short_code TEXT, status_at TEXT, cycles_at INTEGER, installed_at TIMESTAMPTZ,
  last_action_at TIMESTAMPTZ, last_action TEXT, last_responsible TEXT
)
LANGUAGE plpgsql STABLE
SECURITY DEFINER SET search_path = public
AS $$
DECLARE
  v_role  TEXT    := public.require_authenticated();
  v_super BOOLEAN := public.is_superadmin();
  v_org   UUID    := public.get_my_org_id();
BEGIN
  IF v_role NOT IN ('jefe', 'supervisor', 'administrador') OR NOT public.has_module('mangueras') THEN
    RAISE EXCEPTION 'Sin permisos para consultar reportes históricos' USING ERRCODE = '42501';
  END IF;
  IF p_at IS NULL THEN
    RAISE EXCEPTION 'La fecha es obligatoria' USING ERRCODE = '22023';
  END IF;

  RETURN QUERY
    SELECT e.code::TEXT, e.name::TEXT, p.caliber::TEXT, p.length::TEXT, h.short_code::TEXT,
           CASE
             WHEN fin.action_type = 'reemplazo' THEN 'Reemplazada'
             WHEN fin.action_type = 'baja'      THEN 'Baja'
             ELSE 'Activa'
           END,
           COALESCE(cyc.cycle_after, 0),
           h.installed_at,
           la.created_at, la.action_type::TEXT, la.performed_by::TEXT
      FROM public.hoses h
      JOIN public.hose_positions p ON p.id = h.position_id
      JOIN public.equipment e      ON e.id = p.equipment_id
      LEFT JOIN LATERAL (SELECT a.action_type FROM public.hose_actions a
                          WHERE a.hose_id = h.id AND a.created_at <= p_at
                            AND a.action_type IN ('reemplazo', 'baja')
                          ORDER BY a.created_at DESC LIMIT 1) fin ON TRUE
      LEFT JOIN LATERAL (SELECT a.cycle_after FROM public.hose_actions a
                          WHERE a.hose_id = h.id AND a.created_at <= p_at AND a.cycle_after IS NOT NULL
                          ORDER BY a.created_at DESC LIMIT 1) cyc ON TRUE
      LEFT JOIN LATERAL (SELECT a.created_at, a.action_type, a.performed_by FROM public.hose_actions a
                          WHERE a.hose_id = h.id AND a.created_at <= p_at
                          ORDER BY a.created_at DESC LIMIT 1) la ON TRUE
     WHERE (v_super OR e.organization_id = v_org)
       AND COALESCE(h.installed_at, h.created_at) <= p_at
       AND (e.archived_at IS NULL OR e.archived_at > p_at)
     ORDER BY e.code, p.caliber, h.installed_at;
END;
$$;

-- Códigos de producto que ya existen (únicos en todo el sistema)
CREATE OR REPLACE FUNCTION public.existing_equipment_codes(p_codes TEXT[])
RETURNS SETOF TEXT
LANGUAGE sql STABLE
SECURITY DEFINER SET search_path = public
AS $$
  SELECT e.code::TEXT FROM public.equipment e
   WHERE public.get_my_role() IN ('jefe', 'supervisor', 'administrador')
     AND public.has_module('mangueras')
     AND e.code = ANY (p_codes[1:2000]);
$$;

-- ------------------------------------------------------------
-- Alta de producto con sus posiciones y mangueras
-- ------------------------------------------------------------
CREATE OR REPLACE FUNCTION public.create_equipment(
  p_code     TEXT,
  p_name     TEXT,
  p_calibers TEXT[] DEFAULT ARRAY['1', '2', '3', '4', '5'],
  p_team_id  UUID   DEFAULT NULL,   -- se conserva por compatibilidad; ya no se usa
  p_lengths  TEXT[] DEFAULT NULL
)
RETURNS JSON
LANGUAGE plpgsql
SECURITY DEFINER SET search_path = public
AS $$
DECLARE
  v_role       TEXT := public.get_my_role();
  v_code       TEXT := NULLIF(btrim(p_code), '');
  v_name       TEXT := NULLIF(btrim(p_name), '');
  v_team_id    UUID;
  v_equipment  public.equipment;
  v_position   public.hose_positions;
  v_caliber    TEXT;
  v_length     TEXT;
  v_index      INTEGER := 0;
  v_seq        INTEGER;
BEGIN
  IF v_role IS NULL OR v_role NOT IN ('jefe', 'supervisor', 'administrador') OR NOT public.has_module('mangueras') THEN
    RAISE EXCEPTION 'Sin permisos para crear productos de mangueras' USING ERRCODE = '42501';
  END IF;
  IF v_code IS NULL OR v_name IS NULL THEN
    RAISE EXCEPTION 'El código y el nombre del producto son obligatorios' USING ERRCODE = '22023';
  END IF;
  IF p_calibers IS NULL OR cardinality(p_calibers) = 0 OR cardinality(p_calibers) > 10 THEN
    RAISE EXCEPTION 'Indica entre 1 y 10 calibres' USING ERRCODE = '22023';
  END IF;
  IF EXISTS (SELECT 1 FROM unnest(p_calibers) c WHERE NULLIF(btrim(c), '') IS NULL) THEN
    RAISE EXCEPTION 'Hay calibres vacíos' USING ERRCODE = '22023';
  END IF;
  IF (SELECT count(DISTINCT lower(btrim(c))) FROM unnest(p_calibers) c) <> cardinality(p_calibers) THEN
    RAISE EXCEPTION 'Los calibres de un producto no se pueden repetir' USING ERRCODE = '22023';
  END IF;
  IF EXISTS (SELECT 1 FROM public.equipment WHERE code = v_code) THEN
    RAISE EXCEPTION 'Ya existe un producto con el código %', v_code USING ERRCODE = '23505';
  END IF;

  SELECT team_id INTO v_team_id FROM public.user_profiles WHERE id = auth.uid();

  INSERT INTO public.equipment (code, name, team_id)
  VALUES (v_code, v_name, v_team_id)
  RETURNING * INTO v_equipment;

  FOREACH v_caliber IN ARRAY p_calibers
  LOOP
    v_index  := v_index + 1;
    v_length := CASE WHEN p_lengths IS NOT NULL AND cardinality(p_lengths) >= v_index
                     THEN NULLIF(btrim(p_lengths[v_index]), '') END;

    INSERT INTO public.hose_positions (equipment_id, caliber, length)
    VALUES (v_equipment.id, btrim(v_caliber), v_length)
    RETURNING * INTO v_position;

    -- Código corto consecutivo "M<n>", reintentando si otro usuario tomó el mismo
    LOOP
      SELECT COALESCE(max(substring(h.short_code FROM 2)::INTEGER), 0) + 1 INTO v_seq
        FROM public.hoses h WHERE h.short_code ~ '^M[0-9]+$';
      BEGIN
        INSERT INTO public.hoses (position_id, short_code, status, current_cycle)
        VALUES (v_position.id, 'M' || v_seq, 'activa', 0);
        EXIT;
      EXCEPTION WHEN unique_violation THEN
        CONTINUE;
      END;
    END LOOP;
  END LOOP;

  RETURN row_to_json(v_equipment);
END;
$$;

REVOKE EXECUTE ON FUNCTION
  public.hose_life_status_for(BIGINT),
  public.list_equipment(TEXT, INTEGER, INTEGER, TEXT, TEXT[], INTEGER, BOOLEAN, TEXT),
  public.hose_calibers(),
  public.hose_stats(),
  public.get_hose_status_at(TIMESTAMPTZ),
  public.existing_equipment_codes(TEXT[]),
  public.create_equipment(TEXT, TEXT, TEXT[], UUID, TEXT[])
FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION
  public.hose_life_status_for(BIGINT),
  public.list_equipment(TEXT, INTEGER, INTEGER, TEXT, TEXT[], INTEGER, BOOLEAN, TEXT),
  public.hose_calibers(),
  public.hose_stats(),
  public.get_hose_status_at(TIMESTAMPTZ),
  public.existing_equipment_codes(TEXT[]),
  public.create_equipment(TEXT, TEXT, TEXT[], UUID, TEXT[])
TO authenticated;

COMMIT;
