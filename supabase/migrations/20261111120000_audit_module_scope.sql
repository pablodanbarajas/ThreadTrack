-- ============================================================
-- AUDIT TRAIL Y BITÁCORA DE ACCESOS POR MÓDULO
-- ============================================================
-- Hasta ahora un administrador del cliente veía todo el audit trail de su
-- empresa. Cada módulo tiene su propio administrador, así que ahora solo ve:
--   * registros de prendas si tiene el módulo Prendas;
--   * registros de mangueras si tiene el módulo Mangueras;
--   * usuarios, bloqueos y accesos de personas que comparten alguno de sus
--     módulos (o que aún no tienen módulo asignado);
--   * firmas según el registro firmado;
--   * cambios de empresa y equipos de trabajo (comunes a ambos módulos).
-- Los cambios hechos por el superadministrador sobre esos registros siguen
-- visibles: todo cambio a los datos del cliente debe ser trazable.
-- El superadministrador sigue viendo todo.
-- ============================================================

BEGIN;

-- Módulo al que pertenece una tabla (NULL = común a la empresa)
CREATE OR REPLACE FUNCTION public.module_of_table(p_table TEXT)
RETURNS TEXT LANGUAGE sql IMMUTABLE AS $$
  SELECT CASE
    WHEN p_table IN ('garments', 'garment_actions', 'movements', 'documents', 'garment_assignments') THEN 'prendas'
    WHEN p_table IN ('equipment', 'hose_positions', 'hoses', 'hose_actions') THEN 'mangueras'
  END
$$;

-- ¿Los módulos de otro usuario se cruzan con los míos? (sin módulos = visible)
CREATE OR REPLACE FUNCTION public.shares_my_modules(p_modules TEXT[])
RETURNS BOOLEAN LANGUAGE sql STABLE SECURITY DEFINER SET search_path = public
AS $$
  SELECT p_modules IS NULL OR cardinality(p_modules) = 0 OR p_modules && COALESCE(public.my_modules(), '{}'::TEXT[])
$$;

-- ¿El correo es de un usuario de mi empresa con el que comparto módulo?
CREATE OR REPLACE FUNCTION public.is_my_scope_email(p_email TEXT)
RETURNS BOOLEAN LANGUAGE sql STABLE SECURITY DEFINER SET search_path = public
AS $$
  SELECT EXISTS (
    SELECT 1 FROM auth.users au
      JOIN public.user_profiles up ON up.id = au.id
     WHERE lower(au.email) = lower(p_email)
       AND up.organization_id = public.get_my_org_id()
       AND public.shares_my_modules(up.modules))
$$;

-- ¿Un registro del audit trail entra en el alcance del administrador?
CREATE OR REPLACE FUNCTION public.audit_entry_in_scope(p_table TEXT, p_data JSONB)
RETURNS BOOLEAN LANGUAGE plpgsql STABLE SECURITY DEFINER SET search_path = public
AS $$
DECLARE
  v_module TEXT := public.module_of_table(p_table);
BEGIN
  IF v_module IS NOT NULL THEN
    RETURN public.has_module(v_module);
  END IF;
  IF p_table = 'user_profiles' THEN
    RETURN public.shares_my_modules(ARRAY(SELECT jsonb_array_elements_text(COALESCE(p_data -> 'modules', '[]'::JSONB))));
  END IF;
  IF p_table = 'electronic_signatures' THEN
    v_module := public.module_of_table(p_data ->> 'table_name');
    RETURN v_module IS NULL OR public.has_module(v_module);
  END IF;
  IF p_table = 'account_locks' THEN
    RETURN p_data ->> 'email' IS NULL OR public.is_my_scope_email(p_data ->> 'email');
  END IF;
  RETURN TRUE;  -- empresa, equipos de trabajo y demás registros comunes
END;
$$;

DROP POLICY IF EXISTS "Admins read audit_log of their organization" ON public.audit_log;
CREATE POLICY "Admins read audit_log of their organization and modules" ON public.audit_log
  FOR SELECT TO authenticated
  USING (public.is_superadmin()
         OR (public.get_my_role() = 'administrador'
             AND organization_id = public.get_my_org_id()
             AND public.audit_entry_in_scope(table_name, COALESCE(new_data, old_data))));

DROP POLICY IF EXISTS "Admins read login_attempts of their organization" ON public.login_attempts;
CREATE POLICY "Admins read login_attempts of their organization and modules" ON public.login_attempts
  FOR SELECT TO authenticated
  USING (public.is_superadmin() OR (public.get_my_role() = 'administrador' AND public.is_my_scope_email(email)));

DROP POLICY IF EXISTS "Admins read account_locks of their organization" ON public.account_locks;
CREATE POLICY "Admins read account_locks of their organization and modules" ON public.account_locks
  FOR SELECT TO authenticated
  USING (public.is_superadmin() OR (public.get_my_role() = 'administrador' AND public.is_my_scope_email(email)));

REVOKE EXECUTE ON FUNCTION
  public.shares_my_modules(TEXT[]), public.is_my_scope_email(TEXT), public.audit_entry_in_scope(TEXT, JSONB)
FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION
  public.module_of_table(TEXT),
  public.shares_my_modules(TEXT[]), public.is_my_scope_email(TEXT), public.audit_entry_in_scope(TEXT, JSONB)
TO authenticated;

COMMIT;
