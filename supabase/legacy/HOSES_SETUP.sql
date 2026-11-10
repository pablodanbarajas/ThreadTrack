-- ============================================================
-- TRAZABILIDAD DE MANGUERAS
-- ============================================================
-- Módulo independiente para rastrear el juego de 5 mangueras
-- (una por calibre) instalado de forma permanente en cada
-- máquina/equipo. El ciclo de uso se registra manualmente por
-- manguera (independiente de los ciclos de lavado de prendas),
-- con un límite de 200 ciclos.
--
-- Al reemplazar una manguera dañada se conserva el historial de
-- la manguera vieja (dada de baja, ciclo congelado) y se crea una
-- manguera nueva en la misma posición con ciclo en 0. Las demás
-- posiciones del equipo no se ven afectadas.
--
-- Código corto de búsqueda rápida: prefijo "M" + secuencia global
-- (M1, M2, M3...), mismo patrón que SHORT_CODE_SETUP.sql.
--
-- Ejecuta este script completo en Supabase → SQL Editor
-- (requiere haber ejecutado antes ROLES_SETUP.sql, ASSIGNMENTS_SETUP.sql
-- y TEAMS_SETUP.sql, ya que reutiliza get_my_role()/get_my_team_id()).
-- ============================================================

-- ============================================================
-- 1. Tabla equipment (las máquinas/productos, ej. 75 equipos)
-- ============================================================
CREATE TABLE IF NOT EXISTS public.equipment (
  id         UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  code       TEXT NOT NULL UNIQUE,
  name       TEXT NOT NULL,
  team_id    UUID REFERENCES public.teams(id) ON DELETE SET NULL,
  created_at TIMESTAMPTZ DEFAULT now(),
  updated_at TIMESTAMPTZ DEFAULT now()
);

-- ============================================================
-- 2. Tabla hose_positions (5 posiciones fijas por equipo, una por calibre)
-- ============================================================
CREATE TABLE IF NOT EXISTS public.hose_positions (
  id           UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  equipment_id UUID NOT NULL REFERENCES public.equipment(id) ON DELETE CASCADE,
  caliber      TEXT NOT NULL,
  label        TEXT,
  created_at   TIMESTAMPTZ DEFAULT now(),
  UNIQUE (equipment_id, caliber)
);

-- ============================================================
-- 3. Tabla hoses (manguera física instalada en una posición)
-- ============================================================
CREATE TABLE IF NOT EXISTS public.hoses (
  id            UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  position_id   UUID NOT NULL REFERENCES public.hose_positions(id) ON DELETE CASCADE,
  short_code    TEXT UNIQUE,
  status        TEXT NOT NULL DEFAULT 'activa'
                  CHECK (status IN ('activa', 'danada', 'reemplazada', 'baja')),
  current_cycle INTEGER NOT NULL DEFAULT 0
                  CHECK (current_cycle >= 0 AND current_cycle <= 200),
  installed_at  TIMESTAMPTZ DEFAULT now(),
  baja_reason   TEXT,
  baja_date     TIMESTAMPTZ,
  created_at    TIMESTAMPTZ DEFAULT now(),
  updated_at    TIMESTAMPTZ DEFAULT now()
);

-- Solo una manguera activa por posición a la vez
CREATE UNIQUE INDEX IF NOT EXISTS hoses_one_active_per_position_uidx
  ON public.hoses (position_id)
  WHERE status = 'activa';

-- ============================================================
-- 4. Tabla hose_actions (historial: uso / inspección / reemplazo / baja)
-- ============================================================
CREATE TABLE IF NOT EXISTS public.hose_actions (
  id           UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  hose_id      UUID NOT NULL REFERENCES public.hoses(id) ON DELETE CASCADE,
  action_type  TEXT NOT NULL CHECK (action_type IN ('uso', 'inspeccion', 'reemplazo', 'baja')),
  cycle_after  INTEGER,
  notes        TEXT,
  performed_by TEXT NOT NULL CHECK (btrim(performed_by) <> ''),
  created_at   TIMESTAMPTZ DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_hose_actions_hose_id ON public.hose_actions (hose_id);
CREATE INDEX IF NOT EXISTS idx_hose_positions_equipment_id ON public.hose_positions (equipment_id);
CREATE INDEX IF NOT EXISTS idx_hoses_position_id ON public.hoses (position_id);

-- ============================================================
-- 5. RLS — mismo esquema por equipo que garments (TEAMS_SETUP.sql)
-- ============================================================
ALTER TABLE public.equipment      ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.hose_positions ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.hoses          ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.hose_actions   ENABLE ROW LEVEL SECURITY;

DO $$
DECLARE pol record;
BEGIN
  FOR pol IN SELECT tablename, policyname FROM pg_policies
    WHERE schemaname = 'public'
      AND tablename IN ('equipment', 'hose_positions', 'hoses', 'hose_actions')
  LOOP
    EXECUTE format('DROP POLICY IF EXISTS %I ON public.%I', pol.policyname, pol.tablename);
  END LOOP;
END $$;

-- equipment: admin ve todo; equipo ve el suyo; jefe/supervisor/admin crean;
-- equipo edita el suyo; admin/jefe eliminan
CREATE POLICY "Administrador equipment select all"
  ON public.equipment FOR SELECT
  USING (public.get_my_role() = 'administrador');

CREATE POLICY "Team equipment select"
  ON public.equipment FOR SELECT
  USING (
    public.get_my_role() != 'administrador'
    AND team_id IS NOT NULL
    AND team_id = public.get_my_team_id()
  );

CREATE POLICY "Staff equipment insert"
  ON public.equipment FOR INSERT
  WITH CHECK (public.get_my_role() IN ('jefe', 'supervisor', 'administrador'));

CREATE POLICY "Staff equipment update"
  ON public.equipment FOR UPDATE
  USING (
    public.get_my_role() = 'administrador'
    OR (team_id IS NOT NULL AND team_id = public.get_my_team_id())
  );

CREATE POLICY "Administrador equipment delete"
  ON public.equipment FOR DELETE
  USING (public.get_my_role() IN ('administrador', 'jefe'));

-- hose_positions/hoses/hose_actions: visibilidad y edición heredada del
-- equipo al que pertenecen (join hasta equipment.team_id)
CREATE POLICY "Team hose_positions access"
  ON public.hose_positions FOR ALL
  USING (
    public.get_my_role() = 'administrador'
    OR equipment_id IN (
      SELECT id FROM public.equipment
      WHERE team_id IS NOT NULL AND team_id = public.get_my_team_id()
    )
  )
  WITH CHECK (
    public.get_my_role() = 'administrador'
    OR equipment_id IN (
      SELECT id FROM public.equipment
      WHERE team_id IS NOT NULL AND team_id = public.get_my_team_id()
    )
  );

CREATE POLICY "Team hoses access"
  ON public.hoses FOR ALL
  USING (
    public.get_my_role() = 'administrador'
    OR position_id IN (
      SELECT hp.id FROM public.hose_positions hp
      JOIN public.equipment e ON e.id = hp.equipment_id
      WHERE e.team_id IS NOT NULL AND e.team_id = public.get_my_team_id()
    )
  )
  WITH CHECK (
    public.get_my_role() = 'administrador'
    OR position_id IN (
      SELECT hp.id FROM public.hose_positions hp
      JOIN public.equipment e ON e.id = hp.equipment_id
      WHERE e.team_id IS NOT NULL AND e.team_id = public.get_my_team_id()
    )
  );

CREATE POLICY "Team hose_actions access"
  ON public.hose_actions FOR ALL
  USING (
    public.get_my_role() = 'administrador'
    OR hose_id IN (
      SELECT h.id FROM public.hoses h
      JOIN public.hose_positions hp ON hp.id = h.position_id
      JOIN public.equipment e ON e.id = hp.equipment_id
      WHERE e.team_id IS NOT NULL AND e.team_id = public.get_my_team_id()
    )
  )
  WITH CHECK (
    public.get_my_role() = 'administrador'
    OR hose_id IN (
      SELECT h.id FROM public.hoses h
      JOIN public.hose_positions hp ON hp.id = h.position_id
      JOIN public.equipment e ON e.id = hp.equipment_id
      WHERE e.team_id IS NOT NULL AND e.team_id = public.get_my_team_id()
    )
  );

GRANT SELECT, INSERT, UPDATE, DELETE ON public.equipment      TO authenticated;
GRANT SELECT, INSERT, UPDATE, DELETE ON public.hose_positions TO authenticated;
GRANT SELECT, INSERT, UPDATE, DELETE ON public.hoses          TO authenticated;
GRANT SELECT, INSERT, UPDATE, DELETE ON public.hose_actions   TO authenticated;

-- ============================================================
-- 6. RPC create_equipment — crea el equipo + siembra sus 5
--    posiciones/mangueras iniciales (ciclo 0, short_code único)
-- ============================================================
CREATE OR REPLACE FUNCTION public.create_equipment(
  p_code     TEXT,
  p_name     TEXT,
  p_calibers TEXT[] DEFAULT ARRAY['1', '2', '3', '4', '5'],
  p_team_id  UUID DEFAULT NULL
)
RETURNS json
LANGUAGE plpgsql
SECURITY DEFINER SET search_path = public
AS $$
DECLARE
  v_role       TEXT;
  v_team_id    UUID;
  v_equipment  public.equipment;
  v_position   public.hose_positions;
  v_hose       public.hoses;
  v_caliber    TEXT;
  v_seq        INTEGER;
  v_short_code TEXT;
BEGIN
  SELECT role, team_id INTO v_role, v_team_id
  FROM public.user_profiles WHERE id = auth.uid();

  IF v_role IS NULL OR v_role NOT IN ('jefe', 'supervisor', 'administrador') THEN
    RAISE EXCEPTION 'Sin permisos para crear equipos';
  END IF;

  IF p_team_id IS NOT NULL AND v_role = 'administrador' THEN
    v_team_id := p_team_id;
  END IF;

  INSERT INTO public.equipment (code, name, team_id)
  VALUES (p_code, p_name, v_team_id)
  RETURNING * INTO v_equipment;

  FOREACH v_caliber IN ARRAY p_calibers
  LOOP
    INSERT INTO public.hose_positions (equipment_id, caliber)
    VALUES (v_equipment.id, v_caliber)
    RETURNING * INTO v_position;

    -- Generar short_code con manejo de concurrencia (prefijo fijo "M")
    LOOP
      SELECT COALESCE(MAX(CAST(SUBSTRING(short_code FROM 2) AS INTEGER)), 0) + 1
      INTO v_seq
      FROM public.hoses
      WHERE short_code ~ '^M[0-9]+$';

      v_short_code := 'M' || v_seq::TEXT;

      BEGIN
        INSERT INTO public.hoses (position_id, short_code, status, current_cycle)
        VALUES (v_position.id, v_short_code, 'activa', 0)
        RETURNING * INTO v_hose;

        EXIT;
      EXCEPTION WHEN unique_violation THEN
        CONTINUE;
      END;
    END LOOP;
  END LOOP;

  RETURN row_to_json(v_equipment);
END;
$$;

GRANT EXECUTE ON FUNCTION public.create_equipment TO authenticated;

-- ============================================================
-- 7. RPC replace_hose — da de baja la manguera activa de una
--    posición (congela su ciclo) y crea la nueva en ciclo 0
-- ============================================================
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
  v_role       TEXT;
  v_old_hose   public.hoses;
  v_new_hose   public.hoses;
  v_seq        INTEGER;
  v_short_code TEXT;
BEGIN
  SELECT role INTO v_role FROM public.user_profiles WHERE id = auth.uid();

  IF v_role IS NULL OR v_role NOT IN ('jefe', 'supervisor', 'administrador') THEN
    RAISE EXCEPTION 'Sin permisos para reemplazar mangueras';
  END IF;

  IF p_performed_by IS NULL OR btrim(p_performed_by) = '' THEN
    RAISE EXCEPTION 'El campo RESPONSABLE es obligatorio';
  END IF;

  SELECT * INTO v_old_hose
  FROM public.hoses
  WHERE position_id = p_position_id AND status = 'activa'
  FOR UPDATE;

  IF NOT FOUND THEN
    RAISE EXCEPTION 'No hay manguera activa en esta posición';
  END IF;

  UPDATE public.hoses
  SET status = 'baja', baja_reason = p_reason, baja_date = now(), updated_at = now()
  WHERE id = v_old_hose.id;

  INSERT INTO public.hose_actions (hose_id, action_type, cycle_after, notes, performed_by)
  VALUES (v_old_hose.id, 'reemplazo', v_old_hose.current_cycle, p_reason, p_performed_by);

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

GRANT EXECUTE ON FUNCTION public.replace_hose TO authenticated;
