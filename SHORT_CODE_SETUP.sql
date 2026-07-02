-- ============================================================
-- CÓDIGO CORTO DE RESPALDO POR EQUIPO
-- ============================================================
-- Agrega un código corto legible a cada prenda, para usarlo
-- como alternativa cuando el QR esté desgastado.
--
-- Formato: [Inicial del equipo][Número secuencial]
--   SOPHIA     → S1, S2, S3 ...
--   GRUPO CSCI → G1, G2, G3 ...
--   VIRBAC     → V1, V2, V3 ...
--
-- El número es secuencial DENTRO del prefijo del equipo.
-- Cada equipo empieza desde 1.
-- El código es único a nivel global → puede buscarse sin
-- necesidad de saber el equipo.
--
-- NOTA: Si en el futuro dos equipos empiezan con la misma
-- letra, el segundo tomará el número donde quedó el primero
-- (no habrá colisión gracias al índice UNIQUE).
-- Se recomienda en ese caso que los equipos tengan nombres
-- con distintas iniciales.
--
-- Ejecuta este script en Supabase → SQL Editor
-- ============================================================

-- ============================================================
-- 1. Agregar columna short_code a garments
-- ============================================================
ALTER TABLE public.garments
  ADD COLUMN IF NOT EXISTS short_code TEXT;

-- Índice único (permite NULL para prendas antiguas sin código)
CREATE UNIQUE INDEX IF NOT EXISTS garments_short_code_uidx
  ON public.garments (short_code)
  WHERE short_code IS NOT NULL;

-- ============================================================
-- 2. Reemplazar create_garment para generar short_code
-- ============================================================
-- Eliminar TODAS las versiones sobrecargadas de create_garment
-- para evitar el error "function name is not unique"
DO $$
DECLARE
  r RECORD;
BEGIN
  FOR r IN
    SELECT pg_get_function_identity_arguments(p.oid) AS args
    FROM pg_proc p
    JOIN pg_namespace n ON n.oid = p.pronamespace
    WHERE n.nspname = 'public' AND p.proname = 'create_garment'
  LOOP
    EXECUTE 'DROP FUNCTION IF EXISTS public.create_garment(' || r.args || ')';
  END LOOP;
END $$;

CREATE OR REPLACE FUNCTION public.create_garment(
  p_code         TEXT,
  p_name         TEXT,
  p_description  TEXT DEFAULT NULL,
  p_client_name  TEXT DEFAULT NULL,
  p_client_phone TEXT DEFAULT NULL,
  p_notes        TEXT DEFAULT NULL,
  p_team_id      UUID DEFAULT NULL
)
RETURNS json
LANGUAGE plpgsql
SECURITY DEFINER SET search_path = public
AS $$
DECLARE
  v_role       TEXT;
  v_team_id    UUID;
  v_team_name  TEXT;
  v_garment    public.garments;
  v_prefix     TEXT;
  v_seq        INTEGER;
  v_short_code TEXT;
BEGIN
  -- Obtener rol y equipo del usuario actual
  SELECT role, team_id INTO v_role, v_team_id
  FROM public.user_profiles WHERE id = auth.uid();

  IF v_role IS NULL OR v_role NOT IN ('jefe', 'supervisor', 'administrador') THEN
    RAISE EXCEPTION 'Sin permisos para crear prendas';
  END IF;

  -- Si se pasa p_team_id explícito (solo admin puede hacerlo), usarlo;
  -- de lo contrario usar el team_id del creador
  IF p_team_id IS NOT NULL AND v_role = 'administrador' THEN
    v_team_id := p_team_id;
  END IF;

  -- ── Determinar prefijo del código corto ──────────────────
  -- Se extrae la primera letra alfabética (A-Z) del nombre del equipo
  IF v_team_id IS NOT NULL THEN
    SELECT name INTO v_team_name FROM public.teams WHERE id = v_team_id;
    -- Quitar caracteres no-alfabéticos y tomar la primera letra en mayúscula
    v_prefix := LEFT(regexp_replace(UPPER(v_team_name), '[^A-Z]', '', 'g'), 1);
  END IF;

  -- Fallback para prendas sin equipo asignado
  IF v_prefix IS NULL OR v_prefix = '' THEN
    v_prefix := 'X';
  END IF;

  -- ── Generar código corto con manejo de concurrencia ──────
  -- El LOOP + captura de unique_violation garantiza que dos
  -- inserciones simultáneas no produzcan el mismo short_code.
  LOOP
    -- Obtener el número más alto ya usado para este prefijo
    SELECT COALESCE(
      MAX(
        CAST(SUBSTRING(short_code FROM LENGTH(v_prefix) + 1) AS INTEGER)
      ), 0
    ) + 1
    INTO v_seq
    FROM public.garments
    WHERE short_code ~ ('^' || v_prefix || '[0-9]+$');

    v_short_code := v_prefix || v_seq::TEXT;

    BEGIN
      INSERT INTO public.garments
        (code, name, description, client_name, client_phone, notes,
         status, team_id, short_code)
      VALUES
        (p_code, p_name, p_description, p_client_name, p_client_phone,
         p_notes, 'disponible', v_team_id, v_short_code)
      RETURNING * INTO v_garment;

      EXIT;  -- Inserción exitosa → salir del loop
    EXCEPTION WHEN unique_violation THEN
      -- Otro proceso tomó ese número; reintentar con el siguiente
      CONTINUE;
    END;
  END LOOP;

  RETURN row_to_json(v_garment);
END;
$$;

GRANT EXECUTE ON FUNCTION public.create_garment TO authenticated;

-- ============================================================
-- 3. Asignar códigos cortos a prendas existentes (backfill)
-- ============================================================
-- Ejecuta esto solo si ya tienes prendas creadas antes de
-- aplicar este script. Asigna short_codes retroactivamente
-- en orden de creación.
-- Si no tienes prendas previas, este bloque no hace nada.
-- ============================================================
DO $$
DECLARE
  r          RECORD;
  v_prefix   TEXT;
  v_seq      INTEGER;
BEGIN
  FOR r IN
    SELECT g.id, g.team_id, g.created_at, t.name AS team_name
    FROM public.garments g
    LEFT JOIN public.teams t ON t.id = g.team_id
    WHERE g.short_code IS NULL
    ORDER BY g.team_id NULLS LAST, g.created_at ASC
  LOOP
    -- Determinar prefijo
    IF r.team_name IS NOT NULL THEN
      v_prefix := LEFT(regexp_replace(UPPER(r.team_name), '[^A-Z]', '', 'g'), 1);
    END IF;
    IF v_prefix IS NULL OR v_prefix = '' THEN v_prefix := 'X'; END IF;

    -- Siguiente número para este prefijo
    SELECT COALESCE(
      MAX(CAST(SUBSTRING(short_code FROM LENGTH(v_prefix) + 1) AS INTEGER)), 0
    ) + 1
    INTO v_seq
    FROM public.garments
    WHERE short_code ~ ('^' || v_prefix || '[0-9]+$');

    UPDATE public.garments
    SET short_code = v_prefix || v_seq::TEXT
    WHERE id = r.id;

    -- Resetear para la siguiente iteración
    v_prefix := NULL;
  END LOOP;
END $$;
