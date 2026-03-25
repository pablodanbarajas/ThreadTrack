-- ============================================================
-- SISTEMA DE EQUIPOS / EMPRESAS
-- El administrador agrupa usuarios en equipos (empresas).
-- Las prendas creadas por cualquier miembro del equipo son
-- visibles para todos los miembros de ese equipo.
-- ============================================================
-- Ejecuta este script completo en Supabase → SQL Editor
-- ============================================================

-- ============================================================
-- 1. Crear tabla teams
-- ============================================================
CREATE TABLE IF NOT EXISTS public.teams (
  id          UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  name        TEXT NOT NULL UNIQUE,
  description TEXT,
  created_at  TIMESTAMPTZ DEFAULT now()
);

ALTER TABLE public.teams ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "Admin manages teams"       ON public.teams;
DROP POLICY IF EXISTS "Authenticated read teams"  ON public.teams;

-- Solo administrador puede crear/editar/eliminar equipos
CREATE POLICY "Admin manages teams"
  ON public.teams FOR ALL
  USING    (public.get_my_role() = 'administrador')
  WITH CHECK (public.get_my_role() = 'administrador');

-- Todos los autenticados pueden leer equipos (para mostrar nombres)
CREATE POLICY "Authenticated read teams"
  ON public.teams FOR SELECT
  USING (auth.uid() IS NOT NULL);

GRANT SELECT, INSERT, UPDATE, DELETE ON public.teams TO authenticated;

-- ============================================================
-- 2. Agregar team_id a user_profiles y garments
-- ============================================================
ALTER TABLE public.user_profiles
  ADD COLUMN IF NOT EXISTS team_id UUID REFERENCES public.teams(id) ON DELETE SET NULL;

ALTER TABLE public.garments
  ADD COLUMN IF NOT EXISTS team_id UUID REFERENCES public.teams(id) ON DELETE SET NULL;

-- ============================================================
-- 3. Helper: obtener team_id del usuario actual
-- ============================================================
CREATE OR REPLACE FUNCTION public.get_my_team_id()
RETURNS UUID
LANGUAGE SQL
SECURITY DEFINER SET search_path = public
AS $$
  SELECT team_id FROM public.user_profiles WHERE id = auth.uid();
$$;

GRANT EXECUTE ON FUNCTION public.get_my_team_id TO authenticated;

-- ============================================================
-- 4. Actualizar RLS en garments (basado en team_id)
-- ============================================================
DO $$
DECLARE pol record;
BEGIN
  FOR pol IN SELECT policyname FROM pg_policies
    WHERE tablename = 'garments' AND schemaname = 'public'
  LOOP
    EXECUTE format('DROP POLICY IF EXISTS %I ON public.garments', pol.policyname);
  END LOOP;
END $$;

-- Admin ve TODAS las prendas
CREATE POLICY "Administrador garment select all"
  ON public.garments FOR SELECT
  USING (public.get_my_role() = 'administrador');

-- Miembros del equipo ven las prendas de su equipo
CREATE POLICY "Team garment select"
  ON public.garments FOR SELECT
  USING (
    public.get_my_role() != 'administrador'
    AND team_id IS NOT NULL
    AND team_id = public.get_my_team_id()
  );

-- jefe/supervisor/admin pueden crear prendas
CREATE POLICY "Staff garment insert"
  ON public.garments FOR INSERT
  WITH CHECK (
    EXISTS (
      SELECT 1 FROM public.user_profiles
      WHERE id = auth.uid()
        AND role IN ('jefe', 'supervisor', 'administrador')
    )
  );

-- Miembros del equipo pueden editar prendas de su equipo; admin edita todas
CREATE POLICY "Staff garment update"
  ON public.garments FOR UPDATE
  USING (
    public.get_my_role() = 'administrador'
    OR (team_id IS NOT NULL AND team_id = public.get_my_team_id())
  );

-- Admin y Jefe pueden eliminar
CREATE POLICY "Administrador garment delete"
  ON public.garments FOR DELETE
  USING (public.get_my_role() IN ('administrador', 'jefe'));

-- ============================================================
-- 5. Actualizar RLS en garment_actions (basada en equipo)
-- ============================================================
DO $$
DECLARE pol record;
BEGIN
  FOR pol IN SELECT policyname FROM pg_policies
    WHERE tablename = 'garment_actions' AND schemaname = 'public'
  LOOP
    EXECUTE format('DROP POLICY IF EXISTS %I ON public.garment_actions', pol.policyname);
  END LOOP;
END $$;

-- Admin: acceso total
CREATE POLICY "Administrador garment_actions access"
  ON public.garment_actions FOR ALL
  USING    (public.get_my_role() = 'administrador')
  WITH CHECK (public.get_my_role() = 'administrador');

-- Miembros del equipo: acciones de prendas de su equipo
CREATE POLICY "Team garment_actions access"
  ON public.garment_actions FOR ALL
  USING (
    garment_id IN (
      SELECT id FROM public.garments
      WHERE team_id IS NOT NULL AND team_id = public.get_my_team_id()
    )
  )
  WITH CHECK (
    garment_id IN (
      SELECT id FROM public.garments
      WHERE team_id IS NOT NULL AND team_id = public.get_my_team_id()
    )
  );

-- ============================================================
-- 6. Actualizar create_garment para asignar team_id automáticamente
-- ============================================================
CREATE OR REPLACE FUNCTION public.create_garment(
  p_code        TEXT,
  p_name        TEXT,
  p_description TEXT DEFAULT NULL,
  p_client_name TEXT DEFAULT NULL,
  p_client_phone TEXT DEFAULT NULL,
  p_notes       TEXT DEFAULT NULL,
  p_team_id     UUID DEFAULT NULL
)
RETURNS json
LANGUAGE plpgsql
SECURITY DEFINER SET search_path = public
AS $$
DECLARE
  v_role    TEXT;
  v_team_id UUID;
  v_garment public.garments;
BEGIN
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

  INSERT INTO public.garments (code, name, description, client_name, client_phone, notes, status, team_id)
  VALUES (p_code, p_name, p_description, p_client_name, p_client_phone, p_notes, 'disponible', v_team_id)
  RETURNING * INTO v_garment;

  RETURN row_to_json(v_garment);
END;
$$;

-- ============================================================
-- 7. Funciones admin para gestión de equipos
-- ============================================================

-- Crear equipo
CREATE OR REPLACE FUNCTION public.create_team(
  p_name        TEXT,
  p_description TEXT DEFAULT NULL
)
RETURNS json
LANGUAGE plpgsql
SECURITY DEFINER SET search_path = public
AS $$
DECLARE v_team public.teams;
BEGIN
  IF public.get_my_role() != 'administrador' THEN
    RAISE EXCEPTION 'Solo el administrador puede crear equipos';
  END IF;

  INSERT INTO public.teams (name, description)
  VALUES (p_name, p_description)
  RETURNING * INTO v_team;

  RETURN row_to_json(v_team);
END;
$$;

-- Eliminar equipo
CREATE OR REPLACE FUNCTION public.delete_team(p_team_id UUID)
RETURNS json
LANGUAGE plpgsql
SECURITY DEFINER SET search_path = public
AS $$
BEGIN
  IF public.get_my_role() != 'administrador' THEN
    RAISE EXCEPTION 'Solo el administrador puede eliminar equipos';
  END IF;

  -- Desasignar usuarios del equipo antes de eliminar
  UPDATE public.user_profiles SET team_id = NULL WHERE team_id = p_team_id;

  DELETE FROM public.teams WHERE id = p_team_id;

  RETURN json_build_object('success', true);
END;
$$;

-- Asignar usuario a equipo (NULL para quitar del equipo)
CREATE OR REPLACE FUNCTION public.assign_user_to_team(
  p_user_id UUID,
  p_team_id UUID  -- pasar NULL para quitar del equipo
)
RETURNS json
LANGUAGE plpgsql
SECURITY DEFINER SET search_path = public
AS $$
BEGIN
  IF public.get_my_role() != 'administrador' THEN
    RAISE EXCEPTION 'Solo el administrador puede asignar usuarios a equipos';
  END IF;

  UPDATE public.user_profiles
  SET team_id = p_team_id, updated_at = now()
  WHERE id = p_user_id;

  RETURN json_build_object('success', true);
END;
$$;

GRANT EXECUTE ON FUNCTION public.create_team       TO authenticated;
GRANT EXECUTE ON FUNCTION public.delete_team       TO authenticated;
GRANT EXECUTE ON FUNCTION public.assign_user_to_team TO authenticated;
