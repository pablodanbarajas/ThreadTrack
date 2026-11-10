-- ============================================================
-- FILTROS DEL INVENTARIO, IMPORTACIÓN Y RETIRO DE ASIGNACIONES
-- ============================================================
--   * list_garments: nuevos filtros (cliente, sin actividad en N días) y
--     ordenamiento (recientes, más ciclos, código, actividad).
--   * existing_garment_codes: para validar una importación antes de crear.
--   * Asignaciones prenda-usuario: el acceso ya es por empresa + módulo, así
--     que dejan de crearse. La tabla y su historial se conservan (auditoría).
-- ============================================================

BEGIN;

DROP TRIGGER IF EXISTS on_garment_created ON public.garments;

DROP FUNCTION IF EXISTS public.list_garments(TEXT, TEXT, DATE, DATE, TEXT, TEXT, TEXT, TEXT, UUID, TEXT[], INTEGER, INTEGER);

CREATE FUNCTION public.list_garments(
  p_search       TEXT    DEFAULT NULL,
  p_status       TEXT    DEFAULT NULL,
  p_date_from    DATE    DEFAULT NULL,
  p_date_to      DATE    DEFAULT NULL,
  p_garment_type TEXT    DEFAULT NULL,
  p_color        TEXT    DEFAULT NULL,
  p_size         TEXT    DEFAULT NULL,
  p_batch        TEXT    DEFAULT NULL,
  p_team_id      UUID    DEFAULT NULL,
  p_life         TEXT[]  DEFAULT NULL,
  p_limit        INTEGER DEFAULT 24,
  p_offset       INTEGER DEFAULT 0,
  p_client       TEXT    DEFAULT NULL,   -- cliente (coincidencia parcial)
  p_idle_days    INTEGER DEFAULT NULL,   -- sin acciones en los últimos N días
  p_sort         TEXT    DEFAULT 'recientes'  -- recientes | ciclos | codigo | inactividad
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
  v_search TEXT    := NULLIF(lower(btrim(p_search)), '');
  v_client TEXT    := NULLIF(lower(btrim(p_client)), '');
  v_sort   TEXT    := COALESCE(p_sort, 'recientes');
BEGIN
  IF public.get_my_role() IS NULL OR NOT public.has_module('prendas') THEN
    RETURN;
  END IF;

  RETURN QUERY
  WITH counts AS (
    SELECT a.garment_id,
           count(*) FILTER (WHERE a.action_type IN ('lavado', 'esterilizacion'))            AS wash,
           count(*) FILTER (WHERE a.action_type = 'reparacion'
                             OR (a.action_type = 'inspeccion' AND a.result = 'reparacion')) AS repair,
           max(a.created_at)                                                                AS last_at
      FROM public.garment_actions a
     WHERE a.garment_id IN (SELECT g0.id FROM public.garments g0
                             WHERE g0.archived_at IS NULL AND (v_super OR g0.organization_id = v_org))
     GROUP BY a.garment_id
  ),
  base AS (
    SELECT g.*, COALESCE(c.wash, 0) AS wash, COALESCE(c.repair, 0) AS repair, c.last_at,
           public.life_status_for(COALESCE(c.wash, 0)) AS life,
           CASE
             WHEN v_search IS NULL                          THEN 999
             WHEN lower(g.short_code) = v_search            THEN 0
             WHEN lower(g.code) = v_search                  THEN 1
             WHEN g.id::TEXT = v_search                     THEN 2
             WHEN lower(g.short_code) LIKE v_search || '%'  THEN 10 + length(g.short_code)
             WHEN lower(g.code) LIKE v_search || '%'        THEN 30 + length(g.code)
             WHEN lower(g.name) LIKE v_search || '%'        THEN 50
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
            OR (length(replace(v_search, '-', '')) >= 24
                AND replace(g.id::TEXT, '-', '') LIKE '%' || replace(v_search, '-', '') || '%'))
       AND (v_client IS NULL OR lower(COALESCE(g.client_name, '')) LIKE '%' || v_client || '%')
       AND (p_status IS NULL OR g.status = p_status)
       AND (p_date_from IS NULL OR COALESCE(g.updated_at, g.created_at)::DATE >= p_date_from)
       AND (p_date_to   IS NULL OR COALESCE(g.updated_at, g.created_at)::DATE <= p_date_to)
       AND (p_batch        IS NULL OR split_part(g.code, '-', 1) = p_batch)
       AND (p_garment_type IS NULL OR split_part(g.code, '-', 2) = p_garment_type)
       AND (p_size         IS NULL OR split_part(g.code, '-', 3) = p_size)
       AND (p_color        IS NULL OR split_part(g.code, '-', 4) = p_color)
       AND (p_team_id IS NULL OR g.team_id = p_team_id)
       AND (p_idle_days IS NULL OR COALESCE(c.last_at, g.created_at) < now() - make_interval(days => p_idle_days))
  )
  SELECT b.id, b.code::TEXT, b.name::TEXT, b.description, b.status::TEXT,
         b.client_name::TEXT, b.client_phone::TEXT, b.notes, b.baja_reason, b.baja_date,
         b.short_code, b.team_id, b.organization_id, b.created_at, b.updated_at,
         b.wash, b.repair, b.life, b.last_at,
         count(*) OVER ()
    FROM base b
   WHERE p_life IS NULL OR cardinality(p_life) = 0 OR b.life = ANY (p_life)
   ORDER BY b.relevance,
            CASE WHEN v_sort = 'ciclos'      THEN b.wash END DESC NULLS LAST,
            CASE WHEN v_sort = 'codigo'      THEN b.code END ASC,
            CASE WHEN v_sort = 'inactividad' THEN COALESCE(b.last_at, b.created_at) END ASC,
            length(COALESCE(b.short_code, '')),
            b.created_at DESC
   LIMIT LEAST(GREATEST(COALESCE(p_limit, 24), 1), 1000)
  OFFSET GREATEST(COALESCE(p_offset, 0), 0);
END;
$$;

-- Códigos que ya existen (para validar una importación). Los códigos son
-- únicos en todo el sistema, así que se revisan contra todos los registros.
CREATE OR REPLACE FUNCTION public.existing_garment_codes(p_codes TEXT[])
RETURNS SETOF TEXT
LANGUAGE sql STABLE
SECURITY DEFINER SET search_path = public
AS $$
  SELECT g.code::TEXT FROM public.garments g
   WHERE public.get_my_role() IN ('jefe', 'supervisor', 'administrador')
     AND g.code = ANY (p_codes[1:2000]);
$$;

REVOKE EXECUTE ON FUNCTION
  public.list_garments(TEXT, TEXT, DATE, DATE, TEXT, TEXT, TEXT, TEXT, UUID, TEXT[], INTEGER, INTEGER, TEXT, INTEGER, TEXT),
  public.existing_garment_codes(TEXT[])
FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION
  public.list_garments(TEXT, TEXT, DATE, DATE, TEXT, TEXT, TEXT, TEXT, UUID, TEXT[], INTEGER, INTEGER, TEXT, INTEGER, TEXT),
  public.existing_garment_codes(TEXT[])
TO authenticated;

COMMIT;
