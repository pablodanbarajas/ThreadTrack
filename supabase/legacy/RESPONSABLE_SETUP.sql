-- ============================================================
-- CAMPO RESPONSABLE EN HISTORIAL DE ACCIONES
-- ============================================================
-- Ejecuta este script completo en Supabase -> SQL Editor
-- Hace el cambio de forma segura e idempotente.
-- ============================================================

BEGIN;

-- 1) Asegurar columna performed_by en garment_actions
ALTER TABLE public.garment_actions
  ADD COLUMN IF NOT EXISTS performed_by TEXT;

-- 2) Completar registros historicos sin responsable
UPDATE public.garment_actions
SET performed_by = 'NO_ESPECIFICADO'
WHERE performed_by IS NULL OR btrim(performed_by) = '';

-- 3) Limpiar constraint previa si existe
ALTER TABLE public.garment_actions
  DROP CONSTRAINT IF EXISTS garment_actions_performed_by_not_empty;

-- 4) Forzar que SIEMPRE haya responsable y no venga vacio
ALTER TABLE public.garment_actions
  ALTER COLUMN performed_by SET NOT NULL;

ALTER TABLE public.garment_actions
  ADD CONSTRAINT garment_actions_performed_by_not_empty
  CHECK (btrim(performed_by) <> '');

COMMIT;

-- Verificacion rapida:
-- SELECT column_name, is_nullable
-- FROM information_schema.columns
-- WHERE table_schema = 'public' AND table_name = 'garment_actions' AND column_name = 'performed_by';
--
-- SELECT COUNT(*) AS sin_responsable
-- FROM public.garment_actions
-- WHERE performed_by IS NULL OR btrim(performed_by) = '';
