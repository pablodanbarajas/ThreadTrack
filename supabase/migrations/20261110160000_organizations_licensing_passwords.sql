-- ============================================================
-- EMPRESAS, LICENCIAS, ADMINISTRADOR POR MÓDULO Y POLÍTICA DE CONTRASEÑAS
-- ============================================================
--   1. Empresas (clientes) con licencia: usuarios contratados + módulos.
--      Los datos y usuarios pertenecen a una empresa; los equipos quedan
--      como agrupador interno.
--   2. Superadmin (Grupo CSCI): administra empresas y licencias, ve todo.
--      Administrador del cliente: solo su empresa y solo sus módulos.
--   3. Límite de usuarios activos por empresa, aplicado en la base.
--   4. Contraseñas: temporal + cambio obligatorio, caducidad a 90 días,
--      complejidad mínima y sin reutilizar las últimas 5.
--
-- Nota de compatibilidad: get_my_role() devuelve 'administrador' también
-- para el superadmin, así todas las reglas existentes que listan roles
-- siguen funcionando. Lo que distingue al superadmin (acceso a todas las
-- empresas) es is_superadmin().
-- ============================================================

BEGIN;

-- ============================================================
-- 1. EMPRESAS
-- ============================================================
CREATE TABLE IF NOT EXISTS public.organizations (
  id         UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  name       TEXT NOT NULL UNIQUE CHECK (btrim(name) <> ''),
  max_users  INTEGER NOT NULL DEFAULT 5 CHECK (max_users > 0),
  modules    TEXT[] NOT NULL DEFAULT ARRAY['prendas']::TEXT[]
               CHECK (modules <@ ARRAY['prendas', 'mangueras']::TEXT[] AND cardinality(modules) > 0),
  is_active  BOOLEAN NOT NULL DEFAULT true,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);
COMMENT ON COLUMN public.organizations.max_users IS 'Usuarios activos contratados (incluye administradores del cliente).';
COMMENT ON COLUMN public.organizations.modules   IS 'Módulos contratados por la empresa.';

ALTER TABLE public.teams         ADD COLUMN IF NOT EXISTS organization_id UUID REFERENCES public.organizations(id) ON DELETE RESTRICT;
ALTER TABLE public.user_profiles ADD COLUMN IF NOT EXISTS organization_id UUID REFERENCES public.organizations(id) ON DELETE RESTRICT;
ALTER TABLE public.garments      ADD COLUMN IF NOT EXISTS organization_id UUID REFERENCES public.organizations(id) ON DELETE RESTRICT;
ALTER TABLE public.equipment     ADD COLUMN IF NOT EXISTS organization_id UUID REFERENCES public.organizations(id) ON DELETE RESTRICT;
ALTER TABLE public.audit_log     ADD COLUMN IF NOT EXISTS organization_id UUID;

ALTER TABLE public.user_profiles
  ADD COLUMN IF NOT EXISTS modules              TEXT[] NOT NULL DEFAULT ARRAY[]::TEXT[],
  ADD COLUMN IF NOT EXISTS must_change_password BOOLEAN NOT NULL DEFAULT false,
  ADD COLUMN IF NOT EXISTS password_changed_at  TIMESTAMPTZ NOT NULL DEFAULT now();

ALTER TABLE public.user_profiles DROP CONSTRAINT IF EXISTS role_check;
ALTER TABLE public.user_profiles ADD CONSTRAINT role_check
  CHECK (role IN ('superadmin', 'administrador', 'jefe', 'supervisor', 'operador'));
ALTER TABLE public.user_profiles DROP CONSTRAINT IF EXISTS user_profiles_modules_check;
ALTER TABLE public.user_profiles ADD CONSTRAINT user_profiles_modules_check
  CHECK (modules <@ ARRAY['prendas', 'mangueras']::TEXT[]);

ALTER TABLE public.login_attempts DROP CONSTRAINT IF EXISTS login_attempts_source_check;
ALTER TABLE public.login_attempts ADD CONSTRAINT login_attempts_source_check
  CHECK (source IN ('login', 'firma', 'password'));

CREATE INDEX IF NOT EXISTS idx_user_profiles_org ON public.user_profiles (organization_id) WHERE is_active;
CREATE INDEX IF NOT EXISTS idx_garments_org      ON public.garments (organization_id);
CREATE INDEX IF NOT EXISTS idx_equipment_org     ON public.equipment (organization_id);
CREATE INDEX IF NOT EXISTS idx_audit_log_org     ON public.audit_log (organization_id, occurred_at);

-- ------------------------------------------------------------
-- 1b. Migración de datos existentes
-- ------------------------------------------------------------
SELECT set_config('app.change_reason', 'Migración a empresas y licencias (2026-11-10)', true);

-- Cada equipo pertenece a una empresa. "SOPHIA MANGUERAS" es la misma empresa que "SOPHIA".
INSERT INTO public.organizations (name, max_users, modules)
SELECT DISTINCT
       CASE WHEN t.name = 'SOPHIA MANGUERAS' THEN 'SOPHIA' ELSE t.name END,
       CASE WHEN t.name = 'GRUPO CSCI' THEN 50 ELSE 5 END,
       ARRAY['prendas']::TEXT[]
  FROM public.teams t
 WHERE t.organization_id IS NULL
ON CONFLICT (name) DO NOTHING;

UPDATE public.teams t
   SET organization_id = o.id
  FROM public.organizations o
 WHERE t.organization_id IS NULL
   AND o.name = CASE WHEN t.name = 'SOPHIA MANGUERAS' THEN 'SOPHIA' ELSE t.name END;

-- Prendas sin equipo (datos de prueba) => GRUPO CSCI
UPDATE public.garments
   SET team_id = (SELECT id FROM public.teams WHERE name = 'GRUPO CSCI')
 WHERE team_id IS NULL
   AND EXISTS (SELECT 1 FROM public.teams WHERE name = 'GRUPO CSCI');

UPDATE public.garments g   SET organization_id = t.organization_id FROM public.teams t WHERE g.team_id = t.id AND g.organization_id IS NULL;
UPDATE public.equipment e  SET organization_id = t.organization_id FROM public.teams t WHERE e.team_id = t.id AND e.organization_id IS NULL;

-- Módulos de cada usuario a partir de access_module
UPDATE public.user_profiles
   SET modules = CASE access_module
                   WHEN 'ambos'     THEN ARRAY['prendas', 'mangueras']
                   WHEN 'mangueras' THEN ARRAY['mangueras']
                   ELSE ARRAY['prendas'] END
 WHERE cardinality(modules) = 0;

UPDATE public.user_profiles u SET organization_id = t.organization_id
  FROM public.teams t WHERE u.team_id = t.id AND u.organization_id IS NULL;

-- Los administradores actuales (Grupo CSCI) pasan a superadmin
UPDATE public.user_profiles SET role = 'superadmin' WHERE role = 'administrador';

-- Módulos contratados = los que ya se usan en cada empresa
UPDATE public.organizations o
   SET modules = ARRAY(
         SELECT DISTINCT m FROM (
           SELECT 'prendas'   AS m WHERE EXISTS (SELECT 1 FROM public.garments  g WHERE g.organization_id = o.id)
           UNION SELECT 'mangueras' WHERE EXISTS (SELECT 1 FROM public.equipment e WHERE e.organization_id = o.id)
           UNION SELECT unnest(u.modules) FROM public.user_profiles u WHERE u.organization_id = o.id AND u.role <> 'superadmin'
           UNION SELECT 'prendas'
         ) s ORDER BY 1);
UPDATE public.organizations SET modules = ARRAY['mangueras', 'prendas'] WHERE name = 'GRUPO CSCI';

-- ============================================================
-- 2. HELPERS DE IDENTIDAD (usuario usable = activo, sin bloqueo,
--    sin cambio de contraseña pendiente y contraseña vigente)
-- ============================================================
CREATE OR REPLACE FUNCTION public.password_max_age() RETURNS INTERVAL
LANGUAGE sql IMMUTABLE AS $$ SELECT interval '90 days' $$;

CREATE OR REPLACE FUNCTION public.my_profile()
RETURNS public.user_profiles
LANGUAGE sql STABLE
SECURITY DEFINER SET search_path = public
AS $$
  SELECT up.* FROM public.user_profiles up
   WHERE up.id = auth.uid()
     AND up.is_active
     AND NOT up.must_change_password
     AND up.password_changed_at > now() - public.password_max_age()
     AND NOT public.is_account_locked(auth.jwt() ->> 'email')
     AND (up.role = 'superadmin' OR EXISTS (
           SELECT 1 FROM public.organizations o WHERE o.id = up.organization_id AND o.is_active));
$$;

-- (Se llama a my_profile() en FROM para que se evalúe una sola vez)
CREATE OR REPLACE FUNCTION public.is_superadmin()
RETURNS BOOLEAN LANGUAGE sql STABLE SECURITY DEFINER SET search_path = public
AS $$ SELECT COALESCE((SELECT p.role = 'superadmin' FROM public.my_profile() p WHERE p.id IS NOT NULL), false) $$;

-- Rol efectivo: el superadmin cumple todas las reglas de 'administrador'
CREATE OR REPLACE FUNCTION public.get_my_role()
RETURNS TEXT LANGUAGE sql STABLE SECURITY DEFINER SET search_path = public
AS $$
  SELECT CASE WHEN p.role = 'superadmin' THEN 'administrador' ELSE p.role END
    FROM public.my_profile() p
   WHERE p.id IS NOT NULL;
$$;

CREATE OR REPLACE FUNCTION public.get_my_team_id()
RETURNS UUID LANGUAGE sql STABLE SECURITY DEFINER SET search_path = public
AS $$ SELECT p.team_id FROM public.my_profile() p WHERE p.id IS NOT NULL $$;

CREATE OR REPLACE FUNCTION public.get_my_org_id()
RETURNS UUID LANGUAGE sql STABLE SECURITY DEFINER SET search_path = public
AS $$ SELECT p.organization_id FROM public.my_profile() p WHERE p.id IS NOT NULL $$;

CREATE OR REPLACE FUNCTION public.my_modules()
RETURNS TEXT[] LANGUAGE sql STABLE SECURITY DEFINER SET search_path = public
AS $$
  SELECT CASE WHEN p.role = 'superadmin' THEN ARRAY['prendas', 'mangueras']::TEXT[] ELSE p.modules END
    FROM public.my_profile() p WHERE p.id IS NOT NULL;
$$;

CREATE OR REPLACE FUNCTION public.has_module(p_module TEXT)
RETURNS BOOLEAN LANGUAGE sql STABLE SECURITY DEFINER SET search_path = public
AS $$ SELECT COALESCE(p_module = ANY (public.my_modules()), false) $$;

-- Acceso a datos: misma empresa + módulo asignado (o superadmin)
CREATE OR REPLACE FUNCTION public.can_access_garment(p_garment_id UUID)
RETURNS BOOLEAN LANGUAGE sql STABLE SECURITY DEFINER SET search_path = public
AS $$
  SELECT public.is_superadmin()
      OR (public.has_module('prendas') AND EXISTS (
            SELECT 1 FROM public.garments g
             WHERE g.id = p_garment_id AND g.organization_id = public.get_my_org_id()));
$$;

CREATE OR REPLACE FUNCTION public.can_access_equipment(p_equipment_id UUID)
RETURNS BOOLEAN LANGUAGE sql STABLE SECURITY DEFINER SET search_path = public
AS $$
  SELECT public.is_superadmin()
      OR (public.has_module('mangueras') AND EXISTS (
            SELECT 1 FROM public.equipment e
             WHERE e.id = p_equipment_id AND e.organization_id = public.get_my_org_id()));
$$;

-- ¿El usuario en sesión puede administrar al usuario indicado?
-- Superadmin: a cualquiera (excepto otros superadmin). Administrador: solo
-- usuarios de su empresa cuyos módulos estén dentro de los suyos.
CREATE OR REPLACE FUNCTION public.can_manage_user(p_target UUID)
RETURNS BOOLEAN LANGUAGE sql STABLE SECURITY DEFINER SET search_path = public
AS $$
  SELECT p_target IS DISTINCT FROM auth.uid()
     AND public.get_my_role() = 'administrador'
     AND EXISTS (
       SELECT 1 FROM public.user_profiles t
        WHERE t.id = p_target
          AND t.role <> 'superadmin'
          AND (public.is_superadmin()
               OR (t.organization_id = public.get_my_org_id() AND t.modules <@ public.my_modules())));
$$;

-- ¿El correo pertenece a un usuario de mi empresa? (para la bitácora de accesos)
CREATE OR REPLACE FUNCTION public.is_my_org_email(p_email TEXT)
RETURNS BOOLEAN LANGUAGE sql STABLE SECURITY DEFINER SET search_path = public
AS $$
  SELECT EXISTS (
    SELECT 1 FROM auth.users au
      JOIN public.user_profiles up ON up.id = au.id
     WHERE lower(au.email) = lower(p_email)
       AND up.organization_id = public.get_my_org_id());
$$;

-- ============================================================
-- 3. INTEGRIDAD DE EMPRESA, MÓDULOS Y LÍMITE DE USUARIOS
-- ============================================================
CREATE OR REPLACE FUNCTION public.enforce_user_license()
RETURNS TRIGGER LANGUAGE plpgsql SECURITY DEFINER SET search_path = public
AS $$
DECLARE
  v_org    public.organizations;
  v_active INTEGER;
BEGIN
  -- Columna heredada access_module, sincronizada con modules
  NEW.access_module := CASE
    WHEN NEW.modules @> ARRAY['prendas', 'mangueras'] THEN 'ambos'
    WHEN 'mangueras' = ANY (NEW.modules)               THEN 'mangueras'
    ELSE 'prendas' END;

  IF NEW.role = 'superadmin' OR NEW.organization_id IS NULL THEN
    RETURN NEW;
  END IF;

  SELECT * INTO v_org FROM public.organizations WHERE id = NEW.organization_id FOR UPDATE;

  IF NOT (NEW.modules <@ v_org.modules) THEN
    RAISE EXCEPTION 'La empresa % no tiene contratados todos los módulos asignados (%).', v_org.name, array_to_string(NEW.modules, ', ')
      USING ERRCODE = '22023';
  END IF;

  IF NEW.team_id IS NOT NULL AND
     (SELECT organization_id FROM public.teams WHERE id = NEW.team_id) IS DISTINCT FROM NEW.organization_id THEN
    RAISE EXCEPTION 'El equipo no pertenece a la empresa del usuario' USING ERRCODE = '22023';
  END IF;

  IF NEW.is_active AND (TG_OP = 'INSERT' OR NOT OLD.is_active OR OLD.organization_id IS DISTINCT FROM NEW.organization_id) THEN
    SELECT count(*) INTO v_active FROM public.user_profiles
     WHERE organization_id = NEW.organization_id AND is_active AND role <> 'superadmin' AND id <> NEW.id;
    IF v_active >= v_org.max_users THEN
      RAISE EXCEPTION 'La empresa % alcanzó su límite de % usuarios contratados. Desactiva un usuario o amplía la licencia.',
        v_org.name, v_org.max_users USING ERRCODE = '23514';
    END IF;
  END IF;

  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS enforce_user_license ON public.user_profiles;
CREATE TRIGGER enforce_user_license BEFORE INSERT OR UPDATE ON public.user_profiles
  FOR EACH ROW EXECUTE FUNCTION public.enforce_user_license();

-- Prendas y equipos: la empresa se fija al crear y debe ser la del usuario
CREATE OR REPLACE FUNCTION public.enforce_record_organization()
RETURNS TRIGGER LANGUAGE plpgsql SECURITY DEFINER SET search_path = public
AS $$
DECLARE
  v_module   TEXT := CASE TG_TABLE_NAME WHEN 'garments' THEN 'prendas' ELSE 'mangueras' END;
  v_team_org UUID;
BEGIN
  IF NEW.team_id IS NOT NULL THEN
    SELECT organization_id INTO v_team_org FROM public.teams WHERE id = NEW.team_id;
  END IF;

  IF NEW.organization_id IS NULL THEN
    NEW.organization_id := COALESCE(v_team_org, public.get_my_org_id());
  END IF;

  IF auth.uid() IS NOT NULL AND NOT public.is_superadmin() THEN
    IF NEW.organization_id IS DISTINCT FROM public.get_my_org_id() OR NOT public.has_module(v_module) THEN
      RAISE EXCEPTION 'No puedes crear registros fuera de tu empresa o módulo' USING ERRCODE = '42501';
    END IF;
  END IF;

  IF v_team_org IS NOT NULL AND v_team_org IS DISTINCT FROM NEW.organization_id THEN
    RAISE EXCEPTION 'El equipo no pertenece a la empresa del registro' USING ERRCODE = '22023';
  END IF;
  IF NEW.organization_id IS NULL THEN
    RAISE EXCEPTION 'El registro debe pertenecer a una empresa' USING ERRCODE = '23502';
  END IF;
  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS enforce_record_organization ON public.garments;
CREATE TRIGGER enforce_record_organization BEFORE INSERT ON public.garments
  FOR EACH ROW EXECUTE FUNCTION public.enforce_record_organization();
DROP TRIGGER IF EXISTS enforce_record_organization ON public.equipment;
CREATE TRIGGER enforce_record_organization BEFORE INSERT ON public.equipment
  FOR EACH ROW EXECUTE FUNCTION public.enforce_record_organization();

-- La empresa de un registro no se cambia
CREATE OR REPLACE FUNCTION public.prevent_organization_change()
RETURNS TRIGGER LANGUAGE plpgsql AS $$
BEGIN
  IF NEW.organization_id IS DISTINCT FROM OLD.organization_id AND OLD.organization_id IS NOT NULL THEN
    RAISE EXCEPTION 'La empresa de un registro no puede cambiarse' USING ERRCODE = '42501';
  END IF;
  RETURN NEW;
END;
$$;
DROP TRIGGER IF EXISTS prevent_organization_change ON public.garments;
CREATE TRIGGER prevent_organization_change BEFORE UPDATE ON public.garments
  FOR EACH ROW EXECUTE FUNCTION public.prevent_organization_change();
DROP TRIGGER IF EXISTS prevent_organization_change ON public.equipment;
CREATE TRIGGER prevent_organization_change BEFORE UPDATE ON public.equipment
  FOR EACH ROW EXECUTE FUNCTION public.prevent_organization_change();

-- auto_assign: no asignar al superadmin
CREATE OR REPLACE FUNCTION public.auto_assign_garment_to_creator()
RETURNS TRIGGER LANGUAGE plpgsql SECURITY DEFINER SET search_path = public
AS $$
DECLARE v_role TEXT;
BEGIN
  SELECT role INTO v_role FROM public.user_profiles WHERE id = auth.uid();
  IF v_role IS NOT NULL AND v_role NOT IN ('administrador', 'superadmin') THEN
    INSERT INTO public.garment_assignments (garment_id, user_id)
    VALUES (NEW.id, auth.uid()) ON CONFLICT DO NOTHING;
  END IF;
  RETURN NEW;
END;
$$;

-- ============================================================
-- 4. AUDIT TRAIL CON EMPRESA
-- ============================================================
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
  v_org       UUID;
BEGIN
  IF TG_OP IN ('UPDATE', 'DELETE') THEN v_old := to_jsonb(OLD); END IF;
  IF TG_OP IN ('INSERT', 'UPDATE') THEN v_new := to_jsonb(NEW); END IF;

  IF TG_OP = 'UPDATE' THEN
    SELECT array_agg(n.key ORDER BY n.key) INTO v_changed
      FROM jsonb_each(v_new) AS n
     WHERE n.value IS DISTINCT FROM (v_old -> n.key) AND n.key <> 'updated_at';
    IF v_changed IS NULL THEN RETURN NULL; END IF;
  END IF;

  v_row := COALESCE(v_new, v_old);
  v_record_id := COALESCE(v_row ->> 'id', concat_ws(':', v_row ->> 'garment_id', v_row ->> 'user_id'));

  v_org := COALESCE(
    CASE WHEN TG_TABLE_NAME = 'organizations' THEN (v_row ->> 'id')::UUID END,
    (v_row ->> 'organization_id')::UUID,
    (SELECT g.organization_id FROM public.garments g WHERE g.id = (v_row ->> 'garment_id')::UUID),
    (SELECT e.organization_id FROM public.hoses h
       JOIN public.hose_positions p ON p.id = h.position_id
       JOIN public.equipment e ON e.id = p.equipment_id
      WHERE h.id = (v_row ->> 'hose_id')::UUID),
    (SELECT e.organization_id FROM public.equipment e WHERE e.id = (v_row ->> 'equipment_id')::UUID),
    (SELECT e.organization_id FROM public.hose_positions p
       JOIN public.equipment e ON e.id = p.equipment_id
      WHERE p.id = (v_row ->> 'position_id')::UUID),
    (SELECT up.organization_id FROM public.user_profiles up
       JOIN auth.users au ON au.id = up.id
      WHERE lower(au.email) = lower(v_row ->> 'email')),
    (SELECT organization_id FROM public.user_profiles WHERE id = auth.uid())
  );

  INSERT INTO public.audit_log (
    user_id, user_email, user_role, operation, table_name, record_id,
    old_data, new_data, changed_fields, reason, organization_id
  ) VALUES (
    auth.uid(),
    NULLIF(auth.jwt() ->> 'email', ''),
    (SELECT role FROM public.user_profiles WHERE id = auth.uid()),
    TG_OP, TG_TABLE_NAME, v_record_id, v_old, v_new, v_changed,
    NULLIF(btrim(current_setting('app.change_reason', true)), ''),
    v_org
  );
  RETURN NULL;
END;
$$;

DROP TRIGGER IF EXISTS audit_organizations ON public.organizations;
CREATE TRIGGER audit_organizations AFTER INSERT OR UPDATE OR DELETE ON public.organizations
  FOR EACH ROW EXECUTE FUNCTION public.audit_log_change();

-- Completar la empresa en los registros de auditoría existentes.
-- Mantenimiento documentado: solo llena la columna nueva, no altera ningún
-- valor existente. Se suspende la inmutabilidad únicamente para esta operación.
ALTER TABLE public.audit_log DISABLE TRIGGER immutable_audit_log;
UPDATE public.audit_log a
   SET organization_id = COALESCE(
         (COALESCE(a.new_data, a.old_data) ->> 'organization_id')::UUID,
         (SELECT g.organization_id FROM public.garments g
           WHERE g.id = (COALESCE(a.new_data, a.old_data) ->> 'garment_id')::UUID),
         (SELECT g.organization_id FROM public.garments g WHERE a.table_name = 'garments' AND g.id::TEXT = a.record_id),
         (SELECT e.organization_id FROM public.hoses h
            JOIN public.hose_positions p ON p.id = h.position_id
            JOIN public.equipment e ON e.id = p.equipment_id
           WHERE h.id = (COALESCE(a.new_data, a.old_data) ->> 'hose_id')::UUID),
         (SELECT up.organization_id FROM public.user_profiles up WHERE up.id = a.user_id))
 WHERE a.organization_id IS NULL;
ALTER TABLE public.audit_log ENABLE TRIGGER immutable_audit_log;

-- ============================================================
-- 5. POLÍTICAS RLS POR EMPRESA Y MÓDULO
-- ============================================================
DO $$
DECLARE pol RECORD;
BEGIN
  FOR pol IN
    SELECT tablename, policyname FROM pg_policies
     WHERE schemaname = 'public'
       AND tablename IN ('garments', 'equipment', 'teams', 'user_profiles', 'garment_assignments',
                         'audit_log', 'login_attempts', 'account_locks', 'electronic_signatures', 'organizations')
  LOOP
    EXECUTE format('DROP POLICY IF EXISTS %I ON public.%I', pol.policyname, pol.tablename);
  END LOOP;
END $$;

ALTER TABLE public.organizations ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Read own organization" ON public.organizations FOR SELECT TO authenticated
  USING (public.is_superadmin() OR id = (SELECT organization_id FROM public.user_profiles WHERE id = auth.uid()));

CREATE POLICY "Read garments of my organization and module" ON public.garments FOR SELECT TO authenticated
  USING (public.is_superadmin() OR (organization_id = public.get_my_org_id() AND public.has_module('prendas')));
CREATE POLICY "Staff insert garments" ON public.garments FOR INSERT TO authenticated
  WITH CHECK (public.get_my_role() IN ('jefe', 'supervisor', 'administrador'));

CREATE POLICY "Read equipment of my organization and module" ON public.equipment FOR SELECT TO authenticated
  USING (public.is_superadmin() OR (organization_id = public.get_my_org_id() AND public.has_module('mangueras')));
CREATE POLICY "Staff insert equipment" ON public.equipment FOR INSERT TO authenticated
  WITH CHECK (public.get_my_role() IN ('jefe', 'supervisor', 'administrador'));

CREATE POLICY "Read teams of my organization" ON public.teams FOR SELECT TO authenticated
  USING (public.is_superadmin() OR organization_id = public.get_my_org_id());

-- El propio perfil siempre es legible (para saber si debe cambiar contraseña)
CREATE POLICY "Read own profile and my organization" ON public.user_profiles FOR SELECT TO authenticated
  USING (id = auth.uid() OR public.is_superadmin() OR organization_id = public.get_my_org_id());

CREATE POLICY "Admins manage assignments" ON public.garment_assignments FOR ALL TO authenticated
  USING (public.get_my_role() = 'administrador' AND public.can_access_garment(garment_id))
  WITH CHECK (public.get_my_role() = 'administrador' AND public.can_access_garment(garment_id));
CREATE POLICY "Users view own assignments" ON public.garment_assignments FOR SELECT TO authenticated
  USING (user_id = auth.uid());

CREATE POLICY "Admins read audit_log of their organization" ON public.audit_log FOR SELECT TO authenticated
  USING (public.is_superadmin() OR (public.get_my_role() = 'administrador' AND organization_id = public.get_my_org_id()));

CREATE POLICY "Admins read login_attempts of their organization" ON public.login_attempts FOR SELECT TO authenticated
  USING (public.is_superadmin() OR (public.get_my_role() = 'administrador'
         AND public.is_my_org_email(email)));
CREATE POLICY "Admins read account_locks of their organization" ON public.account_locks FOR SELECT TO authenticated
  USING (public.is_superadmin() OR (public.get_my_role() = 'administrador'
         AND public.is_my_org_email(email)));

CREATE POLICY "Read signatures of accessible records" ON public.electronic_signatures FOR SELECT TO authenticated
  USING (
    public.is_superadmin()
    OR (table_name = 'garment_actions' AND EXISTS (
          SELECT 1 FROM public.garment_actions ga WHERE ga.id::TEXT = record_id AND public.can_access_garment(ga.garment_id)))
    OR (table_name = 'hose_actions' AND EXISTS (
          SELECT 1 FROM public.hose_actions ha WHERE ha.id::TEXT = record_id AND public.can_access_hose(ha.hose_id)))
  );

REVOKE ALL ON public.organizations FROM anon;
REVOKE INSERT, UPDATE, DELETE, TRUNCATE ON public.organizations, public.teams, public.user_profiles FROM authenticated;
GRANT SELECT ON public.organizations TO authenticated;

-- ============================================================
-- 6. FUNCIONES DE ADMINISTRACIÓN
-- ============================================================

-- ---------- Empresas (solo superadmin) ----------
CREATE OR REPLACE FUNCTION public.save_organization(
  p_id UUID, p_name TEXT, p_max_users INTEGER, p_modules TEXT[], p_is_active BOOLEAN, p_reason TEXT
)
RETURNS public.organizations
LANGUAGE plpgsql SECURITY DEFINER SET search_path = public
AS $$
DECLARE
  v_org    public.organizations;
  v_active INTEGER;
BEGIN
  IF NOT public.is_superadmin() THEN
    RAISE EXCEPTION 'Solo el superadministrador administra empresas y licencias' USING ERRCODE = '42501';
  END IF;
  PERFORM set_config('app.change_reason', public.require_text(p_reason, 'MOTIVO'), true);

  IF p_id IS NULL THEN
    INSERT INTO public.organizations (name, max_users, modules, is_active)
    VALUES (public.require_text(p_name, 'NOMBRE'), p_max_users, p_modules, COALESCE(p_is_active, true))
    RETURNING * INTO v_org;
  ELSE
    SELECT count(*) INTO v_active FROM public.user_profiles
     WHERE organization_id = p_id AND is_active AND role <> 'superadmin';
    IF p_max_users < v_active THEN
      RAISE EXCEPTION 'La empresa tiene % usuarios activos; desactiva usuarios antes de reducir la licencia a %', v_active, p_max_users
        USING ERRCODE = '23514';
    END IF;
    IF EXISTS (SELECT 1 FROM public.user_profiles WHERE organization_id = p_id AND role <> 'superadmin' AND NOT (modules <@ p_modules)) THEN
      RAISE EXCEPTION 'Hay usuarios con módulos que se quieren quitar; ajústalos primero' USING ERRCODE = '23514';
    END IF;
    UPDATE public.organizations
       SET name = public.require_text(p_name, 'NOMBRE'), max_users = p_max_users, modules = p_modules,
           is_active = COALESCE(p_is_active, is_active), updated_at = now()
     WHERE id = p_id
    RETURNING * INTO v_org;
  END IF;
  RETURN v_org;
END;
$$;

CREATE OR REPLACE FUNCTION public.list_organizations()
RETURNS TABLE(id UUID, name TEXT, max_users INTEGER, modules TEXT[], is_active BOOLEAN, active_users BIGINT)
LANGUAGE sql STABLE SECURITY DEFINER SET search_path = public
AS $$
  SELECT o.id, o.name, o.max_users, o.modules, o.is_active,
         (SELECT count(*) FROM public.user_profiles u WHERE u.organization_id = o.id AND u.is_active AND u.role <> 'superadmin')
    FROM public.organizations o
   WHERE public.is_superadmin() OR o.id = public.get_my_org_id()
   ORDER BY o.name;
$$;

-- ---------- Equipos (agrupador interno de una empresa) ----------
DROP FUNCTION IF EXISTS public.create_team(TEXT, TEXT);
CREATE OR REPLACE FUNCTION public.create_team(p_name TEXT, p_description TEXT DEFAULT NULL, p_organization_id UUID DEFAULT NULL)
RETURNS json LANGUAGE plpgsql SECURITY DEFINER SET search_path = public
AS $$
DECLARE
  v_team public.teams;
  v_org  UUID := CASE WHEN public.is_superadmin() THEN COALESCE(p_organization_id, public.get_my_org_id()) ELSE public.get_my_org_id() END;
BEGIN
  IF public.get_my_role() IS DISTINCT FROM 'administrador' THEN
    RAISE EXCEPTION 'Solo un administrador puede crear equipos' USING ERRCODE = '42501';
  END IF;
  PERFORM set_config('app.change_reason', 'Alta de equipo', true);
  INSERT INTO public.teams (name, description, organization_id)
  VALUES (public.require_text(p_name, 'NOMBRE'), p_description, v_org)
  RETURNING * INTO v_team;
  RETURN row_to_json(v_team);
END;
$$;

CREATE OR REPLACE FUNCTION public.delete_team(p_team_id UUID)
RETURNS json LANGUAGE plpgsql SECURITY DEFINER SET search_path = public
AS $$
BEGIN
  IF NOT public.is_superadmin() THEN
    RAISE EXCEPTION 'Solo el superadministrador puede eliminar equipos' USING ERRCODE = '42501';
  END IF;
  IF EXISTS (SELECT 1 FROM public.garments WHERE team_id = p_team_id)
     OR EXISTS (SELECT 1 FROM public.equipment WHERE team_id = p_team_id) THEN
    RAISE EXCEPTION 'El equipo tiene prendas o equipos registrados; no puede eliminarse' USING ERRCODE = '23503';
  END IF;
  PERFORM set_config('app.change_reason', 'Eliminación de equipo vacío', true);
  UPDATE public.user_profiles SET team_id = NULL WHERE team_id = p_team_id;
  DELETE FROM public.teams WHERE id = p_team_id;
  RETURN json_build_object('success', true);
END;
$$;

CREATE OR REPLACE FUNCTION public.assign_user_to_team(p_user_id UUID, p_team_id UUID)
RETURNS json LANGUAGE plpgsql SECURITY DEFINER SET search_path = public
AS $$
BEGIN
  IF NOT public.can_manage_user(p_user_id) THEN
    RAISE EXCEPTION 'No puedes administrar a este usuario' USING ERRCODE = '42501';
  END IF;
  PERFORM set_config('app.change_reason', 'Cambio de equipo', true);
  UPDATE public.user_profiles SET team_id = p_team_id, updated_at = now() WHERE id = p_user_id;
  RETURN json_build_object('success', true);
END;
$$;

-- ---------- Rol y módulos de un usuario ----------
CREATE OR REPLACE FUNCTION public.update_user_role(user_id UUID, new_role TEXT)
RETURNS json LANGUAGE plpgsql SECURITY DEFINER SET search_path = public
AS $$
BEGIN
  IF NOT public.can_manage_user(user_id) THEN
    RETURN json_build_object('error', 'No puedes administrar a este usuario');
  END IF;
  IF new_role NOT IN ('jefe', 'supervisor', 'operador', 'administrador') THEN
    RETURN json_build_object('error', 'Rol inválido');
  END IF;
  PERFORM set_config('app.change_reason', 'Cambio de rol a ' || new_role, true);
  UPDATE public.user_profiles SET role = new_role, updated_at = now() WHERE id = user_id;
  RETURN json_build_object('success', true, 'message', 'Rol actualizado');
END;
$$;

CREATE OR REPLACE FUNCTION public.update_user_modules(p_user_id UUID, p_modules TEXT[])
RETURNS json LANGUAGE plpgsql SECURITY DEFINER SET search_path = public
AS $$
BEGIN
  IF NOT public.can_manage_user(p_user_id) THEN
    RAISE EXCEPTION 'No puedes administrar a este usuario' USING ERRCODE = '42501';
  END IF;
  IF p_modules IS NULL OR cardinality(p_modules) = 0 THEN
    RAISE EXCEPTION 'El usuario debe tener al menos un módulo' USING ERRCODE = '22023';
  END IF;
  IF NOT (p_modules <@ public.my_modules()) THEN
    RAISE EXCEPTION 'Solo puedes asignar módulos que tú administras' USING ERRCODE = '42501';
  END IF;
  PERFORM set_config('app.change_reason', 'Cambio de módulos: ' || array_to_string(p_modules, ', '), true);
  UPDATE public.user_profiles SET modules = p_modules, updated_at = now() WHERE id = p_user_id;
  RETURN json_build_object('success', true);
END;
$$;

-- Compatibilidad con la versión anterior del frontend
CREATE OR REPLACE FUNCTION public.update_user_module(p_user_id UUID, p_module TEXT)
RETURNS json LANGUAGE sql SECURITY DEFINER SET search_path = public
AS $$
  SELECT public.update_user_modules(p_user_id, CASE p_module
    WHEN 'ambos' THEN ARRAY['prendas', 'mangueras'] ELSE ARRAY[p_module] END);
$$;

CREATE OR REPLACE FUNCTION public.set_user_active(p_user_id UUID, p_active BOOLEAN, p_reason TEXT)
RETURNS json LANGUAGE plpgsql SECURITY DEFINER SET search_path = public
AS $$
DECLARE
  v_reason TEXT := public.require_text(p_reason, 'MOTIVO');
BEGIN
  IF p_user_id = auth.uid() THEN
    RAISE EXCEPTION 'No puedes desactivar tu propia cuenta' USING ERRCODE = '22023';
  END IF;
  IF NOT public.can_manage_user(p_user_id) THEN
    RAISE EXCEPTION 'Solo el administrador puede activar o desactivar usuarios de su empresa y módulo' USING ERRCODE = '42501';
  END IF;

  PERFORM set_config('app.change_reason',
    CASE WHEN p_active THEN 'Reactivación: ' ELSE 'Desactivación: ' END || v_reason, true);

  UPDATE public.user_profiles
     SET is_active = p_active,
         deactivated_at      = CASE WHEN p_active THEN NULL ELSE now() END,
         deactivated_by      = CASE WHEN p_active THEN NULL ELSE auth.uid() END,
         deactivation_reason = CASE WHEN p_active THEN NULL ELSE v_reason END,
         updated_at = now()
   WHERE id = p_user_id;

  BEGIN
    UPDATE auth.users SET banned_until = CASE WHEN p_active THEN NULL ELSE 'infinity'::timestamptz END
     WHERE id = p_user_id;
  EXCEPTION WHEN insufficient_privilege OR undefined_column THEN NULL;
  END;

  RETURN json_build_object('success', true);
END;
$$;

CREATE OR REPLACE FUNCTION public.unlock_account(p_email TEXT, p_reason TEXT)
RETURNS VOID LANGUAGE plpgsql SECURITY DEFINER SET search_path = public
AS $$
DECLARE
  v_user UUID := (SELECT id FROM auth.users WHERE lower(email) = lower(btrim(p_email)));
BEGIN
  IF NOT (public.is_superadmin() OR (v_user IS NOT NULL AND public.can_manage_user(v_user))) THEN
    RAISE EXCEPTION 'Solo el administrador puede desbloquear cuentas de su empresa' USING ERRCODE = '42501';
  END IF;
  PERFORM set_config('app.change_reason', 'Desbloqueo manual: ' || public.require_text(p_reason, 'MOTIVO'), true);
  DELETE FROM public.account_locks WHERE email = lower(btrim(p_email));
END;
$$;

DROP FUNCTION IF EXISTS public.get_all_users();
CREATE FUNCTION public.get_all_users()
RETURNS TABLE(
  id UUID, email TEXT, role TEXT, team_id UUID, access_module TEXT, modules TEXT[],
  organization_id UUID, organization_name TEXT,
  is_active BOOLEAN, deactivation_reason TEXT, locked_until TIMESTAMPTZ, last_login_at TIMESTAMPTZ,
  must_change_password BOOLEAN, password_changed_at TIMESTAMPTZ, can_manage BOOLEAN,
  created_at TIMESTAMPTZ, updated_at TIMESTAMPTZ
)
LANGUAGE plpgsql STABLE SECURITY DEFINER SET search_path = public
AS $$
BEGIN
  IF public.get_my_role() IS NULL OR public.get_my_role() NOT IN ('administrador', 'jefe') THEN
    RAISE EXCEPTION 'Sin permisos para listar usuarios' USING ERRCODE = '42501';
  END IF;

  RETURN QUERY
    SELECT up.id, au.email::TEXT, up.role, up.team_id, up.access_module, up.modules,
           up.organization_id, o.name,
           up.is_active, up.deactivation_reason,
           (SELECT l.locked_until FROM public.account_locks l WHERE l.email = lower(au.email) AND l.locked_until > now()),
           au.last_sign_in_at, up.must_change_password, up.password_changed_at,
           public.can_manage_user(up.id),
           up.created_at, up.updated_at
      FROM public.user_profiles up
      JOIN auth.users au ON up.id = au.id
      LEFT JOIN public.organizations o ON o.id = up.organization_id
     WHERE public.is_superadmin() OR up.organization_id = public.get_my_org_id()
     ORDER BY o.name NULLS FIRST, au.email;
END;
$$;

-- ---------- Alta de usuarios (la Edge Function admin-users llama a estas) ----------
-- Paso 1: validar con la identidad del administrador antes de crear la cuenta
CREATE OR REPLACE FUNCTION public.admin_prepare_new_user(
  p_email TEXT, p_role TEXT, p_modules TEXT[], p_organization_id UUID DEFAULT NULL
)
RETURNS json LANGUAGE plpgsql STABLE SECURITY DEFINER SET search_path = public
AS $$
DECLARE
  v_org    public.organizations;
  v_active INTEGER;
BEGIN
  IF public.get_my_role() IS DISTINCT FROM 'administrador' THEN
    RETURN json_build_object('ok', false, 'error', 'Solo un administrador puede dar de alta usuarios');
  END IF;
  IF p_email IS NULL OR p_email !~* '^[^@\s]+@[^@\s]+\.[^@\s]+$' THEN
    RETURN json_build_object('ok', false, 'error', 'Correo inválido');
  END IF;
  IF EXISTS (SELECT 1 FROM auth.users WHERE lower(email) = lower(btrim(p_email))) THEN
    RETURN json_build_object('ok', false, 'error', 'Ya existe un usuario con ese correo');
  END IF;
  IF p_role NOT IN ('jefe', 'supervisor', 'operador', 'administrador') THEN
    RETURN json_build_object('ok', false, 'error', 'Rol inválido');
  END IF;
  IF p_modules IS NULL OR cardinality(p_modules) = 0 OR NOT (p_modules <@ public.my_modules()) THEN
    RETURN json_build_object('ok', false, 'error', 'Solo puedes asignar módulos que tú administras');
  END IF;

  SELECT * INTO v_org FROM public.organizations
   WHERE id = CASE WHEN public.is_superadmin() THEN p_organization_id ELSE public.get_my_org_id() END;
  IF v_org.id IS NULL THEN
    RETURN json_build_object('ok', false, 'error', 'Selecciona la empresa del usuario');
  END IF;
  IF NOT (p_modules <@ v_org.modules) THEN
    RETURN json_build_object('ok', false, 'error', 'La empresa no tiene contratados esos módulos');
  END IF;
  SELECT count(*) INTO v_active FROM public.user_profiles
   WHERE organization_id = v_org.id AND is_active AND role <> 'superadmin';
  IF v_active >= v_org.max_users THEN
    RETURN json_build_object('ok', false,
      'error', format('%s alcanzó su límite de %s usuarios contratados', v_org.name, v_org.max_users));
  END IF;
  RETURN json_build_object('ok', true, 'organization_id', v_org.id);
END;
$$;

-- Paso 2: con la cuenta recién creada, asignar empresa, rol y módulos
CREATE OR REPLACE FUNCTION public.admin_finalize_new_user(
  p_user_id UUID, p_role TEXT, p_modules TEXT[], p_organization_id UUID, p_team_id UUID DEFAULT NULL
)
RETURNS json LANGUAGE plpgsql SECURITY DEFINER SET search_path = public
AS $$
DECLARE
  v_check json;
  v_email TEXT := (SELECT email FROM auth.users WHERE id = p_user_id AND created_at > now() - interval '10 minutes');
BEGIN
  IF v_email IS NULL OR EXISTS (SELECT 1 FROM public.user_profiles WHERE id = p_user_id AND organization_id IS NOT NULL) THEN
    RAISE EXCEPTION 'Solo se puede completar el alta de una cuenta recién creada' USING ERRCODE = '42501';
  END IF;
  -- Revalidar (sin la verificación de correo existente)
  IF public.get_my_role() IS DISTINCT FROM 'administrador'
     OR p_role NOT IN ('jefe', 'supervisor', 'operador', 'administrador')
     OR NOT (p_modules <@ public.my_modules())
     OR (NOT public.is_superadmin() AND p_organization_id IS DISTINCT FROM public.get_my_org_id()) THEN
    RAISE EXCEPTION 'No puedes dar de alta este usuario' USING ERRCODE = '42501';
  END IF;

  PERFORM set_config('app.change_reason', 'Alta de usuario por administrador', true);
  INSERT INTO public.user_profiles (id, role) VALUES (p_user_id, 'operador') ON CONFLICT (id) DO NOTHING;
  UPDATE public.user_profiles
     SET organization_id = p_organization_id, role = p_role, modules = p_modules, team_id = p_team_id,
         is_active = true, must_change_password = true, password_changed_at = now(), updated_at = now()
   WHERE id = p_user_id;
  RETURN json_build_object('ok', true);
END;
$$;

-- Restablecimiento por el administrador: obliga a cambiarla en el siguiente acceso
CREATE OR REPLACE FUNCTION public.admin_mark_password_reset(p_user_id UUID)
RETURNS json LANGUAGE plpgsql SECURITY DEFINER SET search_path = public
AS $$
BEGIN
  IF NOT public.can_manage_user(p_user_id) THEN
    RAISE EXCEPTION 'No puedes administrar a este usuario' USING ERRCODE = '42501';
  END IF;
  PERFORM set_config('app.change_reason', 'Restablecimiento de contraseña por administrador', true);
  UPDATE public.user_profiles SET must_change_password = true, updated_at = now() WHERE id = p_user_id;
  RETURN json_build_object('ok', true);
END;
$$;

-- ============================================================
-- 7. POLÍTICA DE CONTRASEÑAS
-- ============================================================
CREATE TABLE IF NOT EXISTS public.password_history (
  id            BIGINT GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
  user_id       UUID NOT NULL,
  password_hash TEXT NOT NULL,
  created_at    TIMESTAMPTZ NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS idx_password_history_user ON public.password_history (user_id, created_at DESC);
ALTER TABLE public.password_history ENABLE ROW LEVEL SECURITY;  -- sin políticas: solo vía funciones
REVOKE ALL ON public.password_history FROM anon, authenticated;

CREATE OR REPLACE FUNCTION public.get_my_password_status()
RETURNS json LANGUAGE plpgsql STABLE SECURITY DEFINER SET search_path = public
AS $$
DECLARE
  v_p public.user_profiles;
BEGIN
  SELECT * INTO v_p FROM public.user_profiles WHERE id = auth.uid();
  IF v_p.id IS NULL THEN
    RETURN json_build_object('must_change', false);
  END IF;
  RETURN json_build_object(
    'must_change', v_p.must_change_password OR v_p.password_changed_at <= now() - public.password_max_age(),
    'reason', CASE WHEN v_p.must_change_password THEN 'temporal'
                   WHEN v_p.password_changed_at <= now() - public.password_max_age() THEN 'expirada' END,
    'expires_at', v_p.password_changed_at + public.password_max_age());
END;
$$;

CREATE OR REPLACE FUNCTION public.change_my_password(p_current TEXT, p_new TEXT)
RETURNS json
LANGUAGE plpgsql
SECURITY DEFINER SET search_path = public, extensions
AS $$
DECLARE
  v_hash  TEXT;
  v_email TEXT;
BEGIN
  IF auth.uid() IS NULL THEN
    RETURN json_build_object('ok', false, 'error', 'Usuario no autenticado');
  END IF;
  SELECT encrypted_password, lower(email) INTO v_hash, v_email FROM auth.users WHERE id = auth.uid();

  IF public.is_account_locked(v_email) THEN
    RETURN json_build_object('ok', false, 'error', 'Cuenta bloqueada por intentos fallidos');
  END IF;
  IF NOT EXISTS (SELECT 1 FROM public.user_profiles WHERE id = auth.uid() AND is_active) THEN
    RETURN json_build_object('ok', false, 'error', 'Cuenta desactivada');
  END IF;

  IF p_current IS NULL OR v_hash IS NULL OR crypt(p_current, v_hash) <> v_hash THEN
    PERFORM public.log_access_attempt(v_email, false, 'password');
    RETURN json_build_object('ok', false, 'error', 'La contraseña actual es incorrecta',
                             'locked', public.is_account_locked(v_email));
  END IF;

  -- Complejidad
  IF p_new IS NULL OR length(p_new) < 12
     OR p_new !~ '[A-Z]' OR p_new !~ '[a-z]' OR p_new !~ '[0-9]' OR p_new !~ '[^A-Za-z0-9]' THEN
    RETURN json_build_object('ok', false,
      'error', 'La contraseña debe tener al menos 12 caracteres, con mayúsculas, minúsculas, números y un símbolo');
  END IF;
  IF position(lower(split_part(v_email, '@', 1)) IN lower(p_new)) > 0 THEN
    RETURN json_build_object('ok', false, 'error', 'La contraseña no debe contener tu usuario');
  END IF;

  -- Sin reutilizar la actual ni las últimas 5
  IF crypt(p_new, v_hash) = v_hash OR EXISTS (
       SELECT 1 FROM (SELECT password_hash FROM public.password_history
                       WHERE user_id = auth.uid() ORDER BY created_at DESC LIMIT 5) h
        WHERE crypt(p_new, h.password_hash) = h.password_hash) THEN
    RETURN json_build_object('ok', false, 'error', 'No puedes reutilizar ninguna de tus últimas 5 contraseñas');
  END IF;

  INSERT INTO public.password_history (user_id, password_hash) VALUES (auth.uid(), v_hash);
  UPDATE auth.users SET encrypted_password = crypt(p_new, gen_salt('bf', 10)), updated_at = now()
   WHERE id = auth.uid();

  PERFORM set_config('app.change_reason', 'Cambio de contraseña por el usuario', true);
  UPDATE public.user_profiles
     SET must_change_password = false, password_changed_at = now(), updated_at = now()
   WHERE id = auth.uid();

  PERFORM public.log_access_attempt(v_email, true, 'password');
  RETURN json_build_object('ok', true);
END;
$$;

-- ============================================================
-- 8. PERMISOS
-- ============================================================
REVOKE EXECUTE ON FUNCTION
  public.my_profile(),
  public.enforce_user_license(), public.enforce_record_organization(), public.prevent_organization_change()
FROM PUBLIC, anon, authenticated;

REVOKE EXECUTE ON FUNCTION
  public.password_max_age(), public.is_superadmin(), public.get_my_org_id(), public.my_modules(),
  public.has_module(TEXT), public.can_manage_user(UUID), public.is_my_org_email(TEXT),
  public.save_organization(UUID, TEXT, INTEGER, TEXT[], BOOLEAN, TEXT), public.list_organizations(),
  public.create_team(TEXT, TEXT, UUID), public.update_user_modules(UUID, TEXT[]),
  public.admin_prepare_new_user(TEXT, TEXT, TEXT[], UUID),
  public.admin_finalize_new_user(UUID, TEXT, TEXT[], UUID, UUID),
  public.admin_mark_password_reset(UUID),
  public.get_my_password_status(), public.change_my_password(TEXT, TEXT), public.get_all_users()
FROM PUBLIC, anon;

GRANT EXECUTE ON FUNCTION
  public.password_max_age(), public.is_superadmin(), public.get_my_org_id(), public.my_modules(),
  public.has_module(TEXT), public.can_manage_user(UUID), public.is_my_org_email(TEXT),
  public.save_organization(UUID, TEXT, INTEGER, TEXT[], BOOLEAN, TEXT), public.list_organizations(),
  public.create_team(TEXT, TEXT, UUID), public.update_user_modules(UUID, TEXT[]),
  public.admin_prepare_new_user(TEXT, TEXT, TEXT[], UUID),
  public.admin_finalize_new_user(UUID, TEXT, TEXT[], UUID, UUID),
  public.admin_mark_password_reset(UUID),
  public.get_my_password_status(), public.change_my_password(TEXT, TEXT), public.get_all_users()
TO authenticated;

COMMIT;
