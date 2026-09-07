-- UNIFICAR LAVADO Y ESTERILIZACION
-- ========================================
-- Ejecutar una vez en Supabase SQL Editor.
-- Convierte el estado/accion heredado "esterilizacion" a "lavado" y deja
-- ambos procesos como una sola accion, un solo conteo y un solo ciclo.

BEGIN;

-- 1) Migrar datos existentes
UPDATE public.garments
SET status = 'lavado', updated_at = NOW()
WHERE status = 'esterilizacion';

UPDATE public.garment_actions
SET action_type = 'lavado'
WHERE action_type = 'esterilizacion';

DO $$
BEGIN
  IF to_regclass('public.movements') IS NOT NULL THEN
    UPDATE public.movements
    SET previous_status = 'lavado'
    WHERE previous_status = 'esterilizacion';

    UPDATE public.movements
    SET new_status = 'lavado'
    WHERE new_status = 'esterilizacion';
  END IF;
END $$;

-- 2) Quitar constraints antiguos que todavia permitan esterilizacion
DO $$
DECLARE
  constraint_record RECORD;
BEGIN
  FOR constraint_record IN
    SELECT c.conname
    FROM pg_constraint c
    JOIN pg_class t ON t.oid = c.conrelid
    JOIN pg_namespace n ON n.oid = t.relnamespace
    WHERE n.nspname = 'public'
      AND t.relname = 'garments'
      AND c.contype = 'c'
      AND pg_get_constraintdef(c.oid) ILIKE '%status%'
  LOOP
    EXECUTE format('ALTER TABLE public.garments DROP CONSTRAINT IF EXISTS %I', constraint_record.conname);
  END LOOP;

  FOR constraint_record IN
    SELECT c.conname
    FROM pg_constraint c
    JOIN pg_class t ON t.oid = c.conrelid
    JOIN pg_namespace n ON n.oid = t.relnamespace
    WHERE n.nspname = 'public'
      AND t.relname = 'garment_actions'
      AND c.contype = 'c'
      AND pg_get_constraintdef(c.oid) ILIKE '%action_type%'
  LOOP
    EXECUTE format('ALTER TABLE public.garment_actions DROP CONSTRAINT IF EXISTS %I', constraint_record.conname);
  END LOOP;
END $$;

-- 3) Recrear constraints con el ciclo unificado
ALTER TABLE public.garments
  ADD CONSTRAINT garments_status_check
  CHECK (status IN ('disponible', 'lavado', 'inspeccion', 'reparacion', 'baja'));

ALTER TABLE public.garment_actions
  ADD CONSTRAINT garment_actions_action_type_check
  CHECK (action_type IN ('lavado', 'inspeccion', 'reparacion', 'baja'));

COMMIT;

-- Verificacion rapida esperada: ambos conteos deben ser 0.
SELECT 'garments.status=esterilizacion' AS check_name, COUNT(*) AS remaining
FROM public.garments
WHERE status = 'esterilizacion'
UNION ALL
SELECT 'garment_actions.action_type=esterilizacion' AS check_name, COUNT(*) AS remaining
FROM public.garment_actions
WHERE action_type = 'esterilizacion';
