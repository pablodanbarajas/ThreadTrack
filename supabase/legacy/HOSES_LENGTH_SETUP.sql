-- ============================================================
-- LONGITUD DE MANGUERA POR POSICIÓN
-- ============================================================
-- Agrega el campo "longitud" a cada posición de manguera y
-- actualiza create_equipment para poder capturarlo al crear
-- el equipo.
--
-- Ejecuta este script en Supabase → SQL Editor (después de
-- HOSES_SETUP.sql).
-- ============================================================

ALTER TABLE public.hose_positions
  ADD COLUMN IF NOT EXISTS length TEXT;

-- Eliminar TODAS las versiones sobrecargadas de create_equipment
-- para evitar el error "function name is not unique"
DO $$
DECLARE
  r RECORD;
BEGIN
  FOR r IN
    SELECT pg_get_function_identity_arguments(p.oid) AS args
    FROM pg_proc p
    JOIN pg_namespace n ON n.oid = p.pronamespace
    WHERE n.nspname = 'public' AND p.proname = 'create_equipment'
  LOOP
    EXECUTE 'DROP FUNCTION IF EXISTS public.create_equipment(' || r.args || ')';
  END LOOP;
END $$;

CREATE OR REPLACE FUNCTION public.create_equipment(
  p_code     TEXT,
  p_name     TEXT,
  p_calibers TEXT[] DEFAULT ARRAY['1', '2', '3', '4', '5'],
  p_team_id  UUID DEFAULT NULL,
  p_lengths  TEXT[] DEFAULT NULL
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
  v_length     TEXT;
  v_index      INTEGER := 1;
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
    v_length := NULL;
    IF p_lengths IS NOT NULL AND array_length(p_lengths, 1) >= v_index THEN
      v_length := p_lengths[v_index];
    END IF;

    INSERT INTO public.hose_positions (equipment_id, caliber, length)
    VALUES (v_equipment.id, v_caliber, v_length)
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

    v_index := v_index + 1;
  END LOOP;

  RETURN row_to_json(v_equipment);
END;
$$;

GRANT EXECUTE ON FUNCTION public.create_equipment TO authenticated;
