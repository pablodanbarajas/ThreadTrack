-- ============================================================
-- ENDURECIMIENTO DE RLS
-- ============================================================
-- Antes: las políticas FOR ALL permitían a cualquier miembro del equipo
-- (incluido un operador) hacer UPDATE/DELETE directo sobre prendas,
-- acciones, mangueras y ciclos desde la API.
--
-- Ahora: los clientes solo LEEN directamente. Toda escritura de estado,
-- ciclos, ediciones y archivado pasa por funciones RPC (siguiente
-- migración) que validan rol, equipo y motivo, y se ejecutan en una sola
-- transacción.
-- ============================================================

BEGIN;

-- ------------------------------------------------------------
-- 1. Helpers de acceso por equipo (SECURITY DEFINER para evitar RLS recursivo)
-- ------------------------------------------------------------
CREATE OR REPLACE FUNCTION public.is_staff_role(p_roles TEXT[])
RETURNS BOOLEAN
LANGUAGE sql STABLE
SECURITY DEFINER SET search_path = public
AS $$
  SELECT COALESCE(public.get_my_role() = ANY (p_roles), false);
$$;

CREATE OR REPLACE FUNCTION public.can_access_garment(p_garment_id UUID)
RETURNS BOOLEAN
LANGUAGE sql STABLE
SECURITY DEFINER SET search_path = public
AS $$
  SELECT public.get_my_role() = 'administrador'
      OR EXISTS (
           SELECT 1 FROM public.garments g
            WHERE g.id = p_garment_id
              AND g.team_id IS NOT NULL
              AND g.team_id = public.get_my_team_id()
         );
$$;

CREATE OR REPLACE FUNCTION public.can_access_equipment(p_equipment_id UUID)
RETURNS BOOLEAN
LANGUAGE sql STABLE
SECURITY DEFINER SET search_path = public
AS $$
  SELECT public.get_my_role() = 'administrador'
      OR EXISTS (
           SELECT 1 FROM public.equipment e
            WHERE e.id = p_equipment_id
              AND e.team_id IS NOT NULL
              AND e.team_id = public.get_my_team_id()
         );
$$;

CREATE OR REPLACE FUNCTION public.can_access_position(p_position_id UUID)
RETURNS BOOLEAN
LANGUAGE sql STABLE
SECURITY DEFINER SET search_path = public
AS $$
  SELECT public.can_access_equipment(
    (SELECT equipment_id FROM public.hose_positions WHERE id = p_position_id)
  );
$$;

CREATE OR REPLACE FUNCTION public.can_access_hose(p_hose_id UUID)
RETURNS BOOLEAN
LANGUAGE sql STABLE
SECURITY DEFINER SET search_path = public
AS $$
  SELECT public.can_access_position(
    (SELECT position_id FROM public.hoses WHERE id = p_hose_id)
  );
$$;

GRANT EXECUTE ON FUNCTION public.is_staff_role(TEXT[])        TO authenticated;
GRANT EXECUTE ON FUNCTION public.can_access_garment(UUID)     TO authenticated;
GRANT EXECUTE ON FUNCTION public.can_access_equipment(UUID)   TO authenticated;
GRANT EXECUTE ON FUNCTION public.can_access_position(UUID)    TO authenticated;
GRANT EXECUTE ON FUNCTION public.can_access_hose(UUID)        TO authenticated;

-- ------------------------------------------------------------
-- 2. Borrar políticas de escritura directa
-- ------------------------------------------------------------
DO $$
DECLARE
  pol RECORD;
BEGIN
  -- Tablas que pasan a ser de solo lectura para los clientes
  FOR pol IN
    SELECT tablename, policyname FROM pg_policies
     WHERE schemaname = 'public'
       AND tablename IN ('garment_actions', 'movements', 'hose_actions', 'hoses', 'hose_positions')
  LOOP
    EXECUTE format('DROP POLICY IF EXISTS %I ON public.%I', pol.policyname, pol.tablename);
  END LOOP;

  -- garments / equipment: se conservan SELECT e INSERT, se quitan UPDATE/DELETE/ALL
  FOR pol IN
    SELECT tablename, policyname FROM pg_policies
     WHERE schemaname = 'public'
       AND tablename IN ('garments', 'equipment')
       AND cmd IN ('UPDATE', 'DELETE', 'ALL')
  LOOP
    EXECUTE format('DROP POLICY IF EXISTS %I ON public.%I', pol.policyname, pol.tablename);
  END LOOP;

  -- user_profiles: los cambios de rol/equipo/módulo solo por RPC
  FOR pol IN
    SELECT tablename, policyname FROM pg_policies
     WHERE schemaname = 'public'
       AND tablename = 'user_profiles'
       AND cmd IN ('UPDATE', 'DELETE', 'INSERT', 'ALL')
  LOOP
    EXECUTE format('DROP POLICY IF EXISTS %I ON public.%I', pol.policyname, pol.tablename);
  END LOOP;
END $$;

-- ------------------------------------------------------------
-- 3. Políticas de lectura
-- ------------------------------------------------------------
ALTER TABLE public.garment_actions ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.movements       ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.hose_actions    ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.hoses           ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.hose_positions  ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Read garment_actions of accessible garments"
  ON public.garment_actions FOR SELECT
  USING (public.can_access_garment(garment_id));

CREATE POLICY "Read movements of accessible garments"
  ON public.movements FOR SELECT
  USING (public.can_access_garment(garment_id));

CREATE POLICY "Read accessible hose_positions"
  ON public.hose_positions FOR SELECT
  USING (public.can_access_equipment(equipment_id));

CREATE POLICY "Read accessible hoses"
  ON public.hoses FOR SELECT
  USING (public.can_access_position(position_id));

CREATE POLICY "Read accessible hose_actions"
  ON public.hose_actions FOR SELECT
  USING (public.can_access_hose(hose_id));

-- Sin políticas de INSERT/UPDATE/DELETE en esas tablas: las escrituras
-- solo ocurren dentro de funciones SECURITY DEFINER.
REVOKE INSERT, UPDATE, DELETE, TRUNCATE
  ON public.garment_actions, public.movements, public.hose_actions
  FROM anon, authenticated;

REVOKE UPDATE, DELETE, TRUNCATE
  ON public.garments, public.equipment, public.hoses, public.hose_positions
  FROM anon, authenticated;

-- ------------------------------------------------------------
-- 4. documents: antes cualquier usuario autenticado veía y BORRABA
--    documentos de cualquier equipo. Ahora solo los de su equipo, y
--    borrar queda reservado a jefe/supervisor/administrador (auditado).
-- ------------------------------------------------------------
DO $$
DECLARE
  pol RECORD;
BEGIN
  FOR pol IN
    SELECT policyname FROM pg_policies
     WHERE schemaname = 'public' AND tablename = 'documents'
  LOOP
    EXECUTE format('DROP POLICY IF EXISTS %I ON public.documents', pol.policyname);
  END LOOP;
END $$;

ALTER TABLE public.documents ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Read documents of accessible garments"
  ON public.documents FOR SELECT TO authenticated
  USING (public.can_access_garment(garment_id));

CREATE POLICY "Insert documents on accessible garments"
  ON public.documents FOR INSERT TO authenticated
  WITH CHECK (public.can_access_garment(garment_id));

CREATE POLICY "Staff delete documents on accessible garments"
  ON public.documents FOR DELETE TO authenticated
  USING (
    public.can_access_garment(garment_id)
    AND public.is_staff_role(ARRAY['jefe', 'supervisor', 'administrador'])
  );

REVOKE UPDATE, TRUNCATE ON public.documents FROM authenticated;

-- ------------------------------------------------------------
-- 5. El rol anon (la "anon key" pública del frontend) no necesita tocar
--    ninguna tabla: todas las pantallas requieren sesión. Antes, la
--    política "Allow all access to movements" (USING true, rol public)
--    permitía leer/modificar/borrar movements SIN iniciar sesión.
-- ------------------------------------------------------------
REVOKE ALL ON
  public.garments, public.garment_actions, public.movements, public.documents,
  public.garment_assignments, public.equipment, public.hose_positions,
  public.hoses, public.hose_actions, public.user_profiles, public.teams
FROM anon;

COMMIT;
