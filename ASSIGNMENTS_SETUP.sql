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

-- El administrador gestiona TODAS las asignaciones
DROP POLICY IF EXISTS "Administrador manages assignments" ON public.garment_assignments;
CREATE POLICY "Administrador manages assignments"
  ON public.garment_assignments FOR ALL
  USING    ((SELECT role FROM public.user_profiles WHERE id = auth.uid()) = 'administrador')
  WITH CHECK ((SELECT role FROM public.user_profiles WHERE id = auth.uid()) = 'administrador');

-- Cada usuario puede ver sus propias asignaciones
DROP POLICY IF EXISTS "Users view own assignments" ON public.garment_assignments;
CREATE POLICY "Users view own assignments"
  ON public.garment_assignments FOR SELECT
  USING (user_id = auth.uid());

-- ============================================================
-- 3. RLS en tabla garments — filtrar por asignación
-- ============================================================
ALTER TABLE public.garments ENABLE ROW LEVEL SECURITY;

-- Limpiar políticas previas genéricas (si existen)
DROP POLICY IF EXISTS "Allow all access to garments"          ON public.garments;
DROP POLICY IF EXISTS "Enable all for authenticated users"    ON public.garments;
DROP POLICY IF EXISTS "Users see assigned garments only"      ON public.garments;
DROP POLICY IF EXISTS "Administrador full access to garments" ON public.garments;
DROP POLICY IF EXISTS "Users update assigned garments"        ON public.garments;
DROP POLICY IF EXISTS "Administrador garment full access"     ON public.garments;
DROP POLICY IF EXISTS "Assigned users garment select"         ON public.garments;
DROP POLICY IF EXISTS "Assigned users garment update"         ON public.garments;
DROP POLICY IF EXISTS "Assigned users garment insert"         ON public.garments;

-- Administrador: acceso total a prendas
CREATE POLICY "Administrador garment full access"
  ON public.garments FOR ALL
  USING    ((SELECT role FROM public.user_profiles WHERE id = auth.uid()) = 'administrador')
  WITH CHECK ((SELECT role FROM public.user_profiles WHERE id = auth.uid()) = 'administrador');

-- Usuarios asignados: pueden SELECT
CREATE POLICY "Assigned users garment select"
  ON public.garments FOR SELECT
  USING (
    id IN (
      SELECT garment_id FROM public.garment_assignments WHERE user_id = auth.uid()
    )
  );

-- Usuarios asignados: pueden UPDATE (registrar acciones, cambiar estado)
CREATE POLICY "Assigned users garment update"
  ON public.garments FOR UPDATE
  USING (
    id IN (
      SELECT garment_id FROM public.garment_assignments WHERE user_id = auth.uid()
    )
  );

-- ============================================================
-- 4. RLS en tabla garment_actions
-- ============================================================
ALTER TABLE public.garment_actions ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "Allow all access to garment_actions"     ON public.garment_actions;
DROP POLICY IF EXISTS "Administrador garment_actions access"    ON public.garment_actions;
DROP POLICY IF EXISTS "Assigned users actions"                  ON public.garment_actions;

-- Administrador: acceso total a acciones
CREATE POLICY "Administrador garment_actions access"
  ON public.garment_actions FOR ALL
  USING    ((SELECT role FROM public.user_profiles WHERE id = auth.uid()) = 'administrador')
  WITH CHECK ((SELECT role FROM public.user_profiles WHERE id = auth.uid()) = 'administrador');

-- Usuarios asignados: pueden insertar y ver acciones de sus prendas
CREATE POLICY "Assigned users actions"
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
-- 5. Actualizar función update_user_role para administrador
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
