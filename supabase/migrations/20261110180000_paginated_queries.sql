-- ============================================================
-- CONSULTAS PAGINADAS EN EL SERVIDOR
-- ============================================================
-- Antes: la app descargaba todas las prendas y hacía una consulta por cada
-- una para su historial (N+1), y Supabase limita a 1,000 filas por consulta
-- (las prendas que excedieran no aparecían). Ahora:
--   * list_garments: una página de prendas con contadores calculados en la
--     base (ciclos, reparaciones, vida útil), filtros y total para paginar.
--   * garment_stats: totales de Inicio (estados y semáforo) en la base.
--   * list_equipment: una página de equipos con sus posiciones y mangueras.
-- Todas aplican las mismas reglas de acceso (empresa + módulo).
-- ============================================================

BEGIN;

CREATE INDEX IF NOT EXISTS idx_garment_actions_garment ON public.garment_actions (garment_id, created_at);
CREATE INDEX IF NOT EXISTS idx_garments_status ON public.garments (organization_id, status) WHERE archived_at IS NULL;
CREATE INDEX IF NOT EXISTS idx_hoses_position_status ON public.hoses (position_id, status);

-- Vida útil (mismos umbrales que src/lib/lifeStatus.ts)
CREATE OR REPLACE FUNCTION public.life_status_for(p_cycles BIGINT)
RETURNS TEXT LANGUAGE sql IMMUTABLE AS $$
  SELECT CASE WHEN p_cycles >= 75 THEN 'rojo' WHEN p_cycles >= 50 THEN 'naranja'
              WHEN p_cycles >= 25 THEN 'amarillo' ELSE 'verde' END
$$;

-- ------------------------------------------------------------
-- Prendas paginadas
-- ------------------------------------------------------------
CREATE OR REPLACE FUNCTION public.list_garments(
  p_search       TEXT    DEFAULT NULL,
  p_status       TEXT    DEFAULT NULL,   -- un estado o NULL = todos
  p_date_from    DATE    DEFAULT NULL,
  p_date_to      DATE    DEFAULT NULL,
  p_garment_type TEXT    DEFAULT NULL,   -- segmentos del código LOTE-TIPO-TALLA-COLOR-SEC
  p_color        TEXT    DEFAULT NULL,
  p_size         TEXT    DEFAULT NULL,
  p_batch        TEXT    DEFAULT NULL,
  p_team_id      UUID    DEFAULT NULL,
  p_life         TEXT[]  DEFAULT NULL,   -- verde/amarillo/naranja/rojo
  p_limit        INTEGER DEFAULT 24,
  p_offset       INTEGER DEFAULT 0
)
RETURNS TABLE(
  id UUID, code TEXT, name TEXT, description TEXT, status TEXT,
  client_name TEXT, client_phone TEXT, notes TEXT, baja_reason TEXT, baja_date TIMESTAMPTZ,
  short_code TEXT, team_id UUID, organization_id UUID, created_at TIMESTAMPTZ, updated_at TIMESTAMPTZ,
  wash_count BIGINT, repair_count BIGINT, life_status TEXT, last_action_at TIMESTAMPTZ,
  total_count BIGINT
)
LANGUAGE plpgsql STABLE
SECURITY DEFINER SET search_path = public
AS $$
DECLARE
  v_super  BOOLEAN := public.is_superadmin();
  v_org    UUID    := public.get_my_org_id();
  v_access BOOLEAN := public.has_module('prendas');
  v_search TEXT    := NULLIF(lower(btrim(p_search)), '');
BEGIN
  IF public.get_my_role() IS NULL OR NOT v_access THEN
    RETURN;
  END IF;

  RETURN QUERY
  WITH counts AS (
    SELECT a.garment_id,
           count(*) FILTER (WHERE a.action_type IN ('lavado', 'esterilizacion'))                         AS wash,
           count(*) FILTER (WHERE a.action_type = 'reparacion'
                             OR (a.action_type = 'inspeccion' AND a.result = 'reparacion'))              AS repair,
           max(a.created_at)                                                                             AS last_at
      FROM public.garment_actions a
     WHERE a.garment_id IN (SELECT g0.id FROM public.garments g0
                             WHERE g0.archived_at IS NULL AND (v_super OR g0.organization_id = v_org))
     GROUP BY a.garment_id
  ),
  base AS (
    SELECT g.*, COALESCE(c.wash, 0) AS wash, COALESCE(c.repair, 0) AS repair, c.last_at,
           public.life_status_for(COALESCE(c.wash, 0)) AS life,
           CASE
             WHEN v_search IS NULL                         THEN 999
             WHEN lower(g.short_code) = v_search           THEN 0
             WHEN lower(g.code) = v_search                 THEN 1
             WHEN g.id::TEXT = v_search                    THEN 2
             WHEN lower(g.short_code) LIKE v_search || '%' THEN 10 + length(g.short_code)
             WHEN lower(g.code) LIKE v_search || '%'       THEN 30 + length(g.code)
             WHEN lower(g.name) LIKE v_search || '%'       THEN 50
             WHEN lower(g.client_name) LIKE v_search || '%' THEN 60
             ELSE 100
           END AS relevance
      FROM public.garments g
      LEFT JOIN counts c ON c.garment_id = g.id
     WHERE g.archived_at IS NULL
       AND (v_super OR g.organization_id = v_org)
       AND (v_search IS NULL
            OR lower(g.code) LIKE '%' || v_search || '%'
            OR lower(g.name) LIKE '%' || v_search || '%'
            OR lower(COALESCE(g.short_code, '')) LIKE '%' || v_search || '%'
            OR lower(COALESCE(g.client_name, '')) LIKE '%' || v_search || '%'
            OR lower(COALESCE(g.baja_reason, '')) LIKE '%' || v_search || '%'
            OR g.id::TEXT LIKE '%' || v_search || '%'
            -- QR leído por cámara: UUID sin guiones o parcial
            OR (length(replace(v_search, '-', '')) >= 24
                AND replace(g.id::TEXT, '-', '') LIKE '%' || replace(v_search, '-', '') || '%'))
       AND (p_status IS NULL OR g.status = p_status)
       AND (p_date_from IS NULL OR COALESCE(g.updated_at, g.created_at)::DATE >= p_date_from)
       AND (p_date_to   IS NULL OR COALESCE(g.updated_at, g.created_at)::DATE <= p_date_to)
       AND (p_batch        IS NULL OR split_part(g.code, '-', 1) = p_batch)
       AND (p_garment_type IS NULL OR split_part(g.code, '-', 2) = p_garment_type)
       AND (p_size         IS NULL OR split_part(g.code, '-', 3) = p_size)
       AND (p_color        IS NULL OR split_part(g.code, '-', 4) = p_color)
       AND (p_team_id IS NULL OR g.team_id = p_team_id)
  )
  SELECT b.id, b.code::TEXT, b.name::TEXT, b.description, b.status::TEXT,
         b.client_name::TEXT, b.client_phone::TEXT, b.notes, b.baja_reason, b.baja_date,
         b.short_code, b.team_id, b.organization_id, b.created_at, b.updated_at,
         b.wash, b.repair, b.life, b.last_at,
         count(*) OVER ()
    FROM base b
   WHERE p_life IS NULL OR cardinality(p_life) = 0 OR b.life = ANY (p_life)
   ORDER BY b.relevance, length(COALESCE(b.short_code, '')), b.created_at DESC
   LIMIT LEAST(GREATEST(COALESCE(p_limit, 24), 1), 1000)
  OFFSET GREATEST(COALESCE(p_offset, 0), 0);
END;
$$;

-- ------------------------------------------------------------
-- Totales de Inicio
-- ------------------------------------------------------------
CREATE OR REPLACE FUNCTION public.garment_stats()
RETURNS json
LANGUAGE plpgsql STABLE
SECURITY DEFINER SET search_path = public
AS $$
DECLARE
  v_super BOOLEAN := public.is_superadmin();
  v_org   UUID    := public.get_my_org_id();
  v_result json;
BEGIN
  IF public.get_my_role() IS NULL OR NOT public.has_module('prendas') THEN
    RETURN json_build_object('active', 0);
  END IF;

  WITH g AS (
    SELECT g.status,
           public.life_status_for((SELECT count(*) FROM public.garment_actions a
                                    WHERE a.garment_id = g.id
                                      AND a.action_type IN ('lavado', 'esterilizacion'))) AS life
      FROM public.garments g
     WHERE g.archived_at IS NULL AND (v_super OR g.organization_id = v_org)
  )
  SELECT json_build_object(
           'active',      count(*) FILTER (WHERE status <> 'baja'),
           'disponible',  count(*) FILTER (WHERE status = 'disponible'),
           'lavado',      count(*) FILTER (WHERE status = 'lavado'),
           'inspeccion',  count(*) FILTER (WHERE status = 'inspeccion'),
           'reparacion',  count(*) FILTER (WHERE status = 'reparacion'),
           'baja',        count(*) FILTER (WHERE status = 'baja'),
           'life', json_build_object(
             'verde',    count(*) FILTER (WHERE status <> 'baja' AND life = 'verde'),
             'amarillo', count(*) FILTER (WHERE status <> 'baja' AND life = 'amarillo'),
             'naranja',  count(*) FILTER (WHERE status <> 'baja' AND life = 'naranja'),
             'rojo',     count(*) FILTER (WHERE status <> 'baja' AND life = 'rojo')))
    INTO v_result
    FROM g;
  RETURN v_result;
END;
$$;

-- ------------------------------------------------------------
-- Equipos de mangueras paginados (con posiciones y mangueras)
-- ------------------------------------------------------------
CREATE OR REPLACE FUNCTION public.list_equipment(
  p_search TEXT    DEFAULT NULL,
  p_limit  INTEGER DEFAULT 20,
  p_offset INTEGER DEFAULT 0
)
RETURNS TABLE(
  id UUID, code TEXT, name TEXT, team_id UUID, organization_id UUID,
  created_at TIMESTAMPTZ, updated_at TIMESTAMPTZ,
  positions JSONB, total_count BIGINT
)
LANGUAGE plpgsql STABLE
SECURITY DEFINER SET search_path = public
AS $$
DECLARE
  v_super  BOOLEAN := public.is_superadmin();
  v_org    UUID    := public.get_my_org_id();
  v_search TEXT    := NULLIF(lower(btrim(p_search)), '');
BEGIN
  IF public.get_my_role() IS NULL OR NOT public.has_module('mangueras') THEN
    RETURN;
  END IF;

  RETURN QUERY
  SELECT e.id, e.code::TEXT, e.name::TEXT, e.team_id, e.organization_id, e.created_at, e.updated_at,
         COALESCE((
           SELECT jsonb_agg(jsonb_build_object(
                    'id', p.id, 'equipment_id', p.equipment_id, 'caliber', p.caliber,
                    'length', p.length, 'label', p.label, 'created_at', p.created_at,
                    'activeHose', (SELECT to_jsonb(h) FROM public.hoses h
                                    WHERE h.position_id = p.id AND h.status = 'activa' LIMIT 1),
                    'history', COALESCE((SELECT jsonb_agg(to_jsonb(h) ORDER BY h.installed_at DESC)
                                           FROM public.hoses h WHERE h.position_id = p.id), '[]'::jsonb))
                  ORDER BY p.caliber)
             FROM public.hose_positions p WHERE p.equipment_id = e.id), '[]'::jsonb),
         count(*) OVER ()
    FROM public.equipment e
   WHERE e.archived_at IS NULL
     AND (v_super OR e.organization_id = v_org)
     AND (v_search IS NULL
          OR lower(e.code) LIKE '%' || v_search || '%'
          OR lower(e.name) LIKE '%' || v_search || '%'
          OR EXISTS (SELECT 1 FROM public.hose_positions p JOIN public.hoses h ON h.position_id = p.id
                      WHERE p.equipment_id = e.id AND lower(COALESCE(h.short_code, '')) LIKE '%' || v_search || '%'))
   ORDER BY e.created_at DESC
   LIMIT LEAST(GREATEST(COALESCE(p_limit, 20), 1), 500)
  OFFSET GREATEST(COALESCE(p_offset, 0), 0);
END;
$$;

REVOKE EXECUTE ON FUNCTION
  public.life_status_for(BIGINT),
  public.list_garments(TEXT, TEXT, DATE, DATE, TEXT, TEXT, TEXT, TEXT, UUID, TEXT[], INTEGER, INTEGER),
  public.garment_stats(),
  public.list_equipment(TEXT, INTEGER, INTEGER)
FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION
  public.life_status_for(BIGINT),
  public.list_garments(TEXT, TEXT, DATE, DATE, TEXT, TEXT, TEXT, TEXT, UUID, TEXT[], INTEGER, INTEGER),
  public.garment_stats(),
  public.list_equipment(TEXT, INTEGER, INTEGER)
TO authenticated;

COMMIT;
