-- ============================================================
-- AUDIT TRAIL E INMUTABILIDAD DEL HISTORIAL
-- ============================================================
-- Cubre ALCOA+ / 21 CFR Part 11 §11.10(e):
--   * Cada alta, cambio o eliminación en las tablas de negocio queda en
--     public.audit_log con usuario (auth.uid + email + rol), fecha/hora del
--     servidor, valor anterior, valor nuevo, campos cambiados y motivo.
--   * audit_log, garment_actions, hose_actions y movements son de solo
--     inserción: la base de datos rechaza UPDATE, DELETE y TRUNCATE.
--   * Las acciones guardan quién las capturó (recorded_by) tomado de la
--     sesión, además del "responsable" físico (performed_by).
--   * El historial ya no se borra en cascada: las FK pasan a RESTRICT y las
--     prendas/equipos se archivan en lugar de eliminarse.
-- ============================================================

BEGIN;

-- ------------------------------------------------------------
-- 1. Tabla audit_log
-- ------------------------------------------------------------
CREATE TABLE IF NOT EXISTS public.audit_log (
  id             BIGINT GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
  occurred_at    TIMESTAMPTZ NOT NULL DEFAULT clock_timestamp(),
  user_id        UUID,
  user_email     TEXT,
  user_role      TEXT,
  operation      TEXT NOT NULL CHECK (operation IN ('INSERT', 'UPDATE', 'DELETE')),
  table_name     TEXT NOT NULL,
  record_id      TEXT,
  old_data       JSONB,
  new_data       JSONB,
  changed_fields TEXT[],
  reason         TEXT
);

COMMENT ON TABLE public.audit_log IS
  'Audit trail inmutable (solo inserción). Lo llenan triggers; no se escribe desde la app.';
COMMENT ON COLUMN public.audit_log.user_id IS
  'auth.uid() de quien hizo el cambio. NULL = mantenimiento directo en la base (SQL Editor / migración).';
COMMENT ON COLUMN public.audit_log.reason IS
  'Motivo del cambio, tomado de app.change_reason que fijan las funciones RPC.';

CREATE INDEX IF NOT EXISTS idx_audit_log_record      ON public.audit_log (table_name, record_id, occurred_at);
CREATE INDEX IF NOT EXISTS idx_audit_log_occurred_at ON public.audit_log (occurred_at);
CREATE INDEX IF NOT EXISTS idx_audit_log_user        ON public.audit_log (user_id);
-- Para buscar la bitácora de una prenda a través de sus tablas hijas
CREATE INDEX IF NOT EXISTS idx_audit_log_garment_ref
  ON public.audit_log ((COALESCE(new_data, old_data) ->> 'garment_id'));
CREATE INDEX IF NOT EXISTS idx_audit_log_hose_ref
  ON public.audit_log ((COALESCE(new_data, old_data) ->> 'hose_id'));

ALTER TABLE public.audit_log ENABLE ROW LEVEL SECURITY;

-- Solo el administrador lee la bitácora completa directamente. Los demás
-- roles la consultan por prenda/manguera con las funciones get_*_audit_trail.
DROP POLICY IF EXISTS "Administrador reads audit_log" ON public.audit_log;
CREATE POLICY "Administrador reads audit_log"
  ON public.audit_log FOR SELECT
  USING (public.get_my_role() = 'administrador');

REVOKE ALL ON public.audit_log FROM anon;
REVOKE INSERT, UPDATE, DELETE, TRUNCATE ON public.audit_log FROM authenticated;
GRANT SELECT ON public.audit_log TO authenticated;

-- ------------------------------------------------------------
-- 2. Trigger genérico que escribe en audit_log
-- ------------------------------------------------------------
CREATE OR REPLACE FUNCTION public.audit_log_change()
RETURNS TRIGGER
LANGUAGE plpgsql
SECURITY DEFINER SET search_path = public
AS $$
DECLARE
  v_old       JSONB;
  v_new       JSONB;
  v_row       JSONB;
  v_changed   TEXT[];
  v_record_id TEXT;
BEGIN
  IF TG_OP IN ('UPDATE', 'DELETE') THEN v_old := to_jsonb(OLD); END IF;
  IF TG_OP IN ('INSERT', 'UPDATE') THEN v_new := to_jsonb(NEW); END IF;

  IF TG_OP = 'UPDATE' THEN
    SELECT array_agg(n.key ORDER BY n.key)
      INTO v_changed
      FROM jsonb_each(v_new) AS n
     WHERE n.value IS DISTINCT FROM (v_old -> n.key)
       AND n.key <> 'updated_at';

    -- Un UPDATE que no cambia nada (salvo updated_at) no se registra
    IF v_changed IS NULL THEN
      RETURN NULL;
    END IF;
  END IF;

  v_row := COALESCE(v_new, v_old);
  v_record_id := COALESCE(
    v_row ->> 'id',
    concat_ws(':', v_row ->> 'garment_id', v_row ->> 'user_id')  -- garment_assignments
  );

  INSERT INTO public.audit_log (
    user_id, user_email, user_role, operation, table_name, record_id,
    old_data, new_data, changed_fields, reason
  ) VALUES (
    auth.uid(),
    NULLIF(auth.jwt() ->> 'email', ''),
    (SELECT role FROM public.user_profiles WHERE id = auth.uid()),
    TG_OP,
    TG_TABLE_NAME,
    v_record_id,
    v_old,
    v_new,
    v_changed,
    NULLIF(btrim(current_setting('app.change_reason', true)), '')
  );

  RETURN NULL;
END;
$$;

REVOKE EXECUTE ON FUNCTION public.audit_log_change() FROM PUBLIC, anon, authenticated;

-- Adjuntar a todas las tablas de negocio que existan
DO $$
DECLARE
  t TEXT;
BEGIN
  FOREACH t IN ARRAY ARRAY[
    'garments', 'garment_actions', 'movements', 'documents', 'garment_assignments',
    'equipment', 'hose_positions', 'hoses', 'hose_actions',
    'user_profiles', 'teams'
  ]
  LOOP
    IF to_regclass('public.' || t) IS NOT NULL THEN
      EXECUTE format('DROP TRIGGER IF EXISTS audit_%1$s ON public.%1$I', t);
      EXECUTE format(
        'CREATE TRIGGER audit_%1$s AFTER INSERT OR UPDATE OR DELETE ON public.%1$I
           FOR EACH ROW EXECUTE FUNCTION public.audit_log_change()', t);
    END IF;
  END LOOP;
END $$;

-- ------------------------------------------------------------
-- 3. Inmutabilidad: historial de solo inserción
-- ------------------------------------------------------------
CREATE OR REPLACE FUNCTION public.prevent_history_modification()
RETURNS TRIGGER
LANGUAGE plpgsql
AS $$
BEGIN
  RAISE EXCEPTION 'Los registros de % son inmutables (% no permitido). Registre una corrección como un movimiento nuevo.',
    TG_TABLE_NAME, TG_OP
    USING ERRCODE = 'insufficient_privilege';
END;
$$;

DO $$
DECLARE
  t TEXT;
BEGIN
  FOREACH t IN ARRAY ARRAY['audit_log', 'garment_actions', 'hose_actions', 'movements']
  LOOP
    IF to_regclass('public.' || t) IS NOT NULL THEN
      EXECUTE format('DROP TRIGGER IF EXISTS immutable_%1$s ON public.%1$I', t);
      EXECUTE format(
        'CREATE TRIGGER immutable_%1$s BEFORE UPDATE OR DELETE ON public.%1$I
           FOR EACH ROW EXECUTE FUNCTION public.prevent_history_modification()', t);
      EXECUTE format('DROP TRIGGER IF EXISTS immutable_truncate_%1$s ON public.%1$I', t);
      EXECUTE format(
        'CREATE TRIGGER immutable_truncate_%1$s BEFORE TRUNCATE ON public.%1$I
           FOR EACH STATEMENT EXECUTE FUNCTION public.prevent_history_modification()', t);
    END IF;
  END LOOP;
END $$;

-- ------------------------------------------------------------
-- 4. Quién capturó cada registro (atribuible)
-- ------------------------------------------------------------
-- performed_by  = responsable físico de la operación (texto, lo escribe el usuario)
-- recorded_by   = usuario autenticado que capturó el registro (lo fija la base)
ALTER TABLE public.garment_actions
  ADD COLUMN IF NOT EXISTS recorded_by       UUID,
  ADD COLUMN IF NOT EXISTS recorded_by_email TEXT;

ALTER TABLE public.hose_actions
  ADD COLUMN IF NOT EXISTS recorded_by       UUID,
  ADD COLUMN IF NOT EXISTS recorded_by_email TEXT;

ALTER TABLE public.movements
  ADD COLUMN IF NOT EXISTS recorded_by       UUID,
  ADD COLUMN IF NOT EXISTS recorded_by_email TEXT;

CREATE OR REPLACE FUNCTION public.stamp_recorder()
RETURNS TRIGGER
LANGUAGE plpgsql
AS $$
BEGIN
  -- No se confía en lo que mande el cliente: usuario y hora salen del servidor.
  NEW.recorded_by       := auth.uid();
  NEW.recorded_by_email := NULLIF(auth.jwt() ->> 'email', '');
  NEW.created_at        := now();
  RETURN NEW;
END;
$$;

DO $$
DECLARE
  t TEXT;
BEGIN
  FOREACH t IN ARRAY ARRAY['garment_actions', 'hose_actions', 'movements']
  LOOP
    EXECUTE format('DROP TRIGGER IF EXISTS stamp_recorder_%1$s ON public.%1$I', t);
    EXECUTE format(
      'CREATE TRIGGER stamp_recorder_%1$s BEFORE INSERT ON public.%1$I
         FOR EACH ROW EXECUTE FUNCTION public.stamp_recorder()', t);
  END LOOP;
END $$;

-- ------------------------------------------------------------
-- 5. El historial ya no se borra en cascada
-- ------------------------------------------------------------
DO $$
DECLARE
  r   RECORD;
  def TEXT;
BEGIN
  FOR r IN
    SELECT c.oid, c.conname, c.conrelid::regclass AS tbl
      FROM pg_constraint c
     WHERE c.contype = 'f'
       AND c.confdeltype = 'c'  -- ON DELETE CASCADE
       AND c.conrelid = ANY (ARRAY[
             to_regclass('public.garment_actions'),
             to_regclass('public.movements'),
             to_regclass('public.documents'),
             to_regclass('public.hose_positions'),
             to_regclass('public.hoses'),
             to_regclass('public.hose_actions')
           ])
  LOOP
    def := replace(pg_get_constraintdef(r.oid), 'ON DELETE CASCADE', 'ON DELETE RESTRICT');
    EXECUTE format('ALTER TABLE %s DROP CONSTRAINT %I', r.tbl, r.conname);
    EXECUTE format('ALTER TABLE %s ADD CONSTRAINT %I %s', r.tbl, r.conname, def);
  END LOOP;
END $$;

-- ------------------------------------------------------------
-- 6. Archivado lógico en lugar de borrar
-- ------------------------------------------------------------
ALTER TABLE public.garments
  ADD COLUMN IF NOT EXISTS archived_at    TIMESTAMPTZ,
  ADD COLUMN IF NOT EXISTS archived_by    UUID,
  ADD COLUMN IF NOT EXISTS archive_reason TEXT;

ALTER TABLE public.equipment
  ADD COLUMN IF NOT EXISTS archived_at    TIMESTAMPTZ,
  ADD COLUMN IF NOT EXISTS archived_by    UUID,
  ADD COLUMN IF NOT EXISTS archive_reason TEXT;

CREATE INDEX IF NOT EXISTS idx_garments_not_archived  ON public.garments (created_at)  WHERE archived_at IS NULL;
CREATE INDEX IF NOT EXISTS idx_equipment_not_archived ON public.equipment (created_at) WHERE archived_at IS NULL;

COMMIT;
