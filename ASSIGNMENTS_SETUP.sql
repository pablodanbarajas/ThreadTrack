-- ============================================================
-- SISTEMA DE ASIGNACIÓN DE PRENDAS POR USUARIO
-- Rol: Administrador
-- ============================================================
-- Ejecuta este script completo en Supabase → SQL Editor
-- ============================================================

-- ============================================================
-- 1. Agregar rol 'administrador' al constraint
-- ============================================================
ALTER TABLE public.user_profiles
  DROP CONSTRAINT IF EXISTS role_check;

ALTER TABLE public.user_profiles
  ADD CONSTRAINT role_check
  CHECK (role IN ('jefe', 'supervisor', 'operador', 'administrador'));

-- ============================================================
-- 2. Crear tabla garment_assignments (prenda ↔ usuario)
-- ============================================================
CREATE TABLE IF NOT EXISTS public.garment_assignments (
  garment_id  UUID NOT NULL REFERENCES public.garments(id)  ON DELETE CASCADE,
  user_id     UUID NOT NULL REFERENCES auth.users(id)        ON DELETE CASCADE,
  assigned_at TIMESTAMPTZ DEFAULT now(),
  PRIMARY KEY (garment_id, user_id)
);

ALTER TABLE public.garment_assignments ENABLE ROW LEVEL SECURITY;

-- (Las políticas de garment_assignments se crean en la sección 6, más abajo)

-- ============================================================
-- 3. Función auxiliar para obtener el rol del usuario actual
-- SECURITY DEFINER evita problemas de RLS recursivo en user_profiles
-- ============================================================
CREATE OR REPLACE FUNCTION public.get_my_role()
RETURNS TEXT
LANGUAGE SQL
SECURITY DEFINER SET search_path = public
AS $$
  SELECT role FROM public.user_profiles WHERE id = auth.uid();
$$;

-- Permitir que cualquier usuario autenticado lea user_profiles
-- (necesario para que los subqueries en políticas de otras tablas funcionen)
DROP POLICY IF EXISTS "Users can view their own profile"       ON public.user_profiles;
DROP POLICY IF EXISTS "Authenticated users read profiles"      ON public.user_profiles;
DROP POLICY IF EXISTS "Authenticated users read all profiles"  ON public.user_profiles;
CREATE POLICY "Authenticated users read profiles"
  ON public.user_profiles FOR SELECT
  USING (auth.uid() IS NOT NULL);

-- ============================================================
-- 4. RLS en tabla garments — acceso por rol
-- ============================================================
ALTER TABLE public.garments ENABLE ROW LEVEL SECURITY;

-- Limpiar políticas previas (cualquier nombre)
DO $$
DECLARE pol record;
BEGIN
  FOR pol IN
    SELECT policyname FROM pg_policies
    WHERE tablename = 'garments' AND schemaname = 'public'
  LOOP
    EXECUTE format('DROP POLICY IF EXISTS %I ON public.garments', pol.policyname);
  END LOOP;
END $$;

-- Solo administrador ve TODAS las prendas
CREATE POLICY "Administrador garment select all"
  ON public.garments FOR SELECT
  USING (public.get_my_role() = 'administrador');

-- jefe, supervisor y operador solo ven las prendas que el administrador les asignó
CREATE POLICY "Users garment select assigned"
  ON public.garments FOR SELECT
  USING (
    public.get_my_role() != 'administrador'
    AND id IN (
      SELECT garment_id FROM public.garment_assignments WHERE user_id = auth.uid()
    )
  );

-- jefe y supervisor pueden crear nuevas prendas (patrón EXISTS recomendado por Supabase)
CREATE POLICY "Staff garment insert"
  ON public.garments FOR INSERT
  WITH CHECK (
    EXISTS (
      SELECT 1 FROM public.user_profiles
      WHERE id = auth.uid()
        AND role IN ('jefe', 'supervisor', 'administrador')
    )
  );

-- jefe y supervisor solo editan sus prendas asignadas; administrador edita todas
CREATE POLICY "Staff garment update"
  ON public.garments FOR UPDATE
  USING (
    public.get_my_role() = 'administrador'
    OR id IN (
      SELECT garment_id FROM public.garment_assignments WHERE user_id = auth.uid()
    )
  );

-- Solo administrador puede eliminar prendas
CREATE POLICY "Administrador garment delete"
  ON public.garments FOR DELETE
  USING (public.get_my_role() IN ('administrador', 'jefe'));
  USING (public.get_my_role() = 'administrador');

-- ============================================================
-- 5. RLS en tabla garment_actions
-- ============================================================
ALTER TABLE public.garment_actions ENABLE ROW LEVEL SECURITY;

DO $$
DECLARE pol record;
BEGIN
  FOR pol IN
    SELECT policyname FROM pg_policies
    WHERE tablename = 'garment_actions' AND schemaname = 'public'
  LOOP
    EXECUTE format('DROP POLICY IF EXISTS %I ON public.garment_actions', pol.policyname);
  END LOOP;
END $$;

-- Administrador: acceso total a acciones
CREATE POLICY "Administrador garment_actions access"
  ON public.garment_actions FOR ALL
  USING    (public.get_my_role() = 'administrador')
  WITH CHECK (public.get_my_role() = 'administrador');

-- Los demás roles solo pueden ver/insertar acciones de sus prendas asignadas
CREATE POLICY "Users garment_actions assigned"
  ON public.garment_actions FOR ALL
  USING (
    garment_id IN (
      SELECT garment_id FROM public.garment_assignments WHERE user_id = auth.uid()
    )
  )
  WITH CHECK (
    garment_id IN (
      SELECT garment_id FROM public.garment_assignments WHERE user_id = auth.uid()
    )
  );

-- ============================================================
-- 6. RLS en tabla garment_assignments
-- ============================================================
ALTER TABLE public.garment_assignments ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "Administrador manages assignments" ON public.garment_assignments;
DROP POLICY IF EXISTS "Users view own assignments"        ON public.garment_assignments;

-- El administrador gestiona TODAS las asignaciones
CREATE POLICY "Administrador manages assignments"
  ON public.garment_assignments FOR ALL
  USING    (public.get_my_role() = 'administrador')
  WITH CHECK (public.get_my_role() = 'administrador');

-- Cada usuario puede ver sus propias asignaciones
CREATE POLICY "Users view own assignments"
  ON public.garment_assignments FOR SELECT
  USING (user_id = auth.uid());

-- ============================================================
-- 7. Trigger: auto-asignar prenda al creador (jefe/supervisor)
-- Permite que el creador vea su prenda tras el INSERT (.select())
-- ============================================================
CREATE OR REPLACE FUNCTION public.auto_assign_garment_to_creator()
RETURNS TRIGGER
SECURITY DEFINER SET search_path = public
LANGUAGE plpgsql
AS $$
DECLARE
  v_role TEXT;
BEGIN
  SELECT role INTO v_role FROM public.user_profiles WHERE id = auth.uid();
  IF v_role IS NOT NULL AND v_role != 'administrador' THEN
    INSERT INTO public.garment_assignments (garment_id, user_id)
    VALUES (NEW.id, auth.uid())
    ON CONFLICT DO NOTHING;
  END IF;
  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS on_garment_created ON public.garments;
CREATE TRIGGER on_garment_created
  AFTER INSERT ON public.garments
  FOR EACH ROW
  EXECUTE FUNCTION public.auto_assign_garment_to_creator();

-- ============================================================
-- 8. Actualizar función update_user_role para administrador
-- ============================================================
CREATE OR REPLACE FUNCTION public.update_user_role(
  user_id UUID,
  new_role TEXT
)
RETURNS json
LANGUAGE plpgsql
SECURITY DEFINER SET search_path = public
AS $$
BEGIN
  -- Verificar que sea jefe o administrador
  IF (SELECT role FROM public.user_profiles WHERE id = auth.uid())
     NOT IN ('jefe', 'administrador') THEN
    RETURN json_build_object('error', 'Sin permisos para cambiar roles');
  END IF;

  -- Validar que el rol sea válido
  IF new_role NOT IN ('jefe', 'supervisor', 'operador', 'administrador') THEN
    RETURN json_build_object('error', 'Rol inválido');
  END IF;

  UPDATE public.user_profiles
  SET role = new_role, updated_at = CURRENT_TIMESTAMP
  WHERE id = user_id;

  RETURN json_build_object('success', true, 'message', 'Rol actualizado');
END;
$$;

-- ============================================================
-- 6. Asignar el rol 'administrador' a tu usuario
-- ============================================================
-- Reemplaza el email con el tuyo y ejecuta:
--
-- UPDATE public.user_profiles
-- SET role = 'administrador'
-- WHERE id = (SELECT id FROM auth.users WHERE email = 'tu_email@ejemplo.com');
--
-- ============================================================
