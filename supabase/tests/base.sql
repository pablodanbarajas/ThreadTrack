-- Simulación mínima de Supabase + esquema de ThreadTrack tal como estaba en
-- producción el 2026-11-10 (columnas, FKs en CASCADE, políticas permisivas y
-- permisos de anon). Las migraciones de supabase/migrations se aplican encima.
CREATE ROLE anon NOLOGIN;
CREATE ROLE authenticated NOLOGIN;
CREATE SCHEMA auth;
CREATE TABLE auth.users (id UUID PRIMARY KEY, email TEXT, created_at TIMESTAMPTZ DEFAULT now());
CREATE FUNCTION auth.uid() RETURNS UUID LANGUAGE sql STABLE AS
  $$ SELECT NULLIF(current_setting('request.jwt.claims', true)::jsonb ->> 'sub', '')::uuid $$;
CREATE FUNCTION auth.jwt() RETURNS JSONB LANGUAGE sql STABLE AS
  $$ SELECT COALESCE(NULLIF(current_setting('request.jwt.claims', true), ''), '{}')::jsonb $$;
GRANT USAGE ON SCHEMA auth TO anon, authenticated;
GRANT USAGE ON SCHEMA public TO anon, authenticated;

CREATE TABLE public.teams (id UUID PRIMARY KEY DEFAULT gen_random_uuid(), name TEXT UNIQUE NOT NULL, description TEXT, created_at TIMESTAMPTZ DEFAULT now());
CREATE TABLE public.user_profiles (
  id UUID PRIMARY KEY REFERENCES auth.users(id) ON DELETE CASCADE,
  role TEXT NOT NULL DEFAULT 'operador',
  team_id UUID REFERENCES public.teams(id) ON DELETE SET NULL,
  access_module TEXT NOT NULL DEFAULT 'ambos',
  created_at TIMESTAMPTZ DEFAULT now(), updated_at TIMESTAMPTZ DEFAULT now()
);
CREATE FUNCTION public.get_my_role() RETURNS TEXT LANGUAGE sql SECURITY DEFINER SET search_path = public AS
  $$ SELECT role FROM public.user_profiles WHERE id = auth.uid() $$;
CREATE FUNCTION public.get_my_team_id() RETURNS UUID LANGUAGE sql SECURITY DEFINER SET search_path = public AS
  $$ SELECT team_id FROM public.user_profiles WHERE id = auth.uid() $$;

-- Funciones de trigger existentes en producción
CREATE FUNCTION public.handle_new_user() RETURNS TRIGGER LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS
  $$ BEGIN INSERT INTO public.user_profiles (id, role) VALUES (NEW.id, 'operador') ON CONFLICT (id) DO NOTHING; RETURN NEW; END $$;
CREATE TRIGGER on_auth_user_created AFTER INSERT ON auth.users FOR EACH ROW EXECUTE FUNCTION public.handle_new_user();
CREATE FUNCTION public.auto_assign_garment_to_creator() RETURNS TRIGGER LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS
  $$ BEGIN RETURN NEW; END $$;

CREATE TABLE public.garments (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(), code TEXT UNIQUE NOT NULL, name TEXT NOT NULL,
  description TEXT, status TEXT NOT NULL DEFAULT 'disponible'
    CHECK (status IN ('disponible','lavado','inspeccion','reparacion','baja')),
  client_name TEXT, client_phone TEXT, notes TEXT, baja_reason TEXT, baja_date TIMESTAMPTZ,
  short_code TEXT, team_id UUID REFERENCES public.teams(id) ON DELETE SET NULL,
  created_at TIMESTAMPTZ DEFAULT now(), updated_at TIMESTAMPTZ DEFAULT now()
);
CREATE TABLE public.garment_actions (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  garment_id UUID REFERENCES public.garments(id) ON DELETE CASCADE,
  action_type VARCHAR NOT NULL CHECK (action_type IN ('lavado','inspeccion','reparacion','baja')),
  result TEXT, notes TEXT, performed_by TEXT NOT NULL CHECK (btrim(performed_by) <> ''),
  created_at TIMESTAMPTZ DEFAULT now()
);
CREATE TABLE public.movements (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  garment_id UUID REFERENCES public.garments(id) ON DELETE CASCADE,
  previous_status VARCHAR, new_status TEXT NOT NULL, notes TEXT, created_at TIMESTAMPTZ DEFAULT now()
);
CREATE TABLE public.documents (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  garment_id UUID NOT NULL REFERENCES public.garments(id) ON DELETE CASCADE,
  type TEXT, url TEXT, file_name TEXT, uploaded_by TEXT, created_at TIMESTAMPTZ DEFAULT now()
);
CREATE TABLE public.garment_assignments (
  garment_id UUID NOT NULL REFERENCES public.garments(id) ON DELETE CASCADE,
  user_id UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  assigned_at TIMESTAMPTZ DEFAULT now(), PRIMARY KEY (garment_id, user_id)
);
CREATE TABLE public.equipment (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(), code TEXT UNIQUE NOT NULL, name TEXT NOT NULL,
  team_id UUID REFERENCES public.teams(id) ON DELETE SET NULL,
  created_at TIMESTAMPTZ DEFAULT now(), updated_at TIMESTAMPTZ DEFAULT now()
);
CREATE TABLE public.hose_positions (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  equipment_id UUID NOT NULL REFERENCES public.equipment(id) ON DELETE CASCADE,
  caliber TEXT NOT NULL, length TEXT, label TEXT, created_at TIMESTAMPTZ DEFAULT now()
);
CREATE TABLE public.hoses (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  position_id UUID NOT NULL REFERENCES public.hose_positions(id) ON DELETE CASCADE,
  short_code TEXT UNIQUE, status TEXT NOT NULL DEFAULT 'activa'
    CHECK (status IN ('activa','danada','reemplazada','baja')),
  current_cycle INTEGER NOT NULL DEFAULT 0 CHECK (current_cycle >= 0 AND current_cycle <= 200),
  installed_at TIMESTAMPTZ DEFAULT now(), baja_reason TEXT, baja_date TIMESTAMPTZ,
  created_at TIMESTAMPTZ DEFAULT now(), updated_at TIMESTAMPTZ DEFAULT now()
);
CREATE TABLE public.hose_actions (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  hose_id UUID NOT NULL REFERENCES public.hoses(id) ON DELETE CASCADE,
  action_type TEXT NOT NULL CHECK (action_type IN ('uso','inspeccion','reemplazo','baja')),
  cycle_after INTEGER, notes TEXT, performed_by TEXT NOT NULL CHECK (btrim(performed_by) <> ''),
  created_at TIMESTAMPTZ DEFAULT now()
);

-- Políticas heredadas (las permisivas que la migración debe eliminar)
ALTER TABLE public.user_profiles ENABLE ROW LEVEL SECURITY;
CREATE POLICY "Authenticated users read profiles" ON public.user_profiles FOR SELECT USING (auth.uid() IS NOT NULL);
CREATE POLICY "Only admins can update roles" ON public.user_profiles FOR UPDATE
  USING (auth.uid() IN (SELECT id FROM public.user_profiles WHERE role = 'jefe'));
ALTER TABLE public.garments ENABLE ROW LEVEL SECURITY;
CREATE POLICY "Team garment select" ON public.garments FOR SELECT
  USING (get_my_role() = 'administrador' OR (team_id IS NOT NULL AND team_id = get_my_team_id()));
CREATE POLICY "Staff garment update" ON public.garments FOR UPDATE
  USING (get_my_role() = 'administrador' OR (team_id IS NOT NULL AND team_id = get_my_team_id()));
CREATE POLICY "Administrador garment delete" ON public.garments FOR DELETE
  USING (get_my_role() IN ('administrador','jefe'));
ALTER TABLE public.garment_actions ENABLE ROW LEVEL SECURITY;
CREATE POLICY "Team garment_actions access" ON public.garment_actions FOR ALL
  USING (garment_id IN (SELECT id FROM garments WHERE team_id = get_my_team_id()))
  WITH CHECK (garment_id IN (SELECT id FROM garments WHERE team_id = get_my_team_id()));
ALTER TABLE public.equipment ENABLE ROW LEVEL SECURITY;
CREATE POLICY "Team equipment select" ON public.equipment FOR SELECT
  USING (get_my_role() = 'administrador' OR (team_id IS NOT NULL AND team_id = get_my_team_id()));
CREATE POLICY "Staff equipment update" ON public.equipment FOR UPDATE USING (true);
ALTER TABLE public.hoses ENABLE ROW LEVEL SECURITY;
CREATE POLICY "Team hoses access" ON public.hoses FOR ALL USING (true) WITH CHECK (true);
ALTER TABLE public.hose_actions ENABLE ROW LEVEL SECURITY;
CREATE POLICY "Team hose_actions access" ON public.hose_actions FOR ALL USING (true) WITH CHECK (true);

ALTER TABLE public.movements ENABLE ROW LEVEL SECURITY;
CREATE POLICY "Allow all access to movements" ON public.movements FOR ALL USING (true);
ALTER TABLE public.documents ENABLE ROW LEVEL SECURITY;
CREATE POLICY "Users can view documents" ON public.documents FOR SELECT USING (auth.uid() IS NOT NULL);
CREATE POLICY "Users can insert documents" ON public.documents FOR INSERT WITH CHECK (auth.uid() IS NOT NULL);
CREATE POLICY "Users can delete documents" ON public.documents FOR DELETE USING (auth.uid() IS NOT NULL);

-- Supabase concede todo a anon y authenticated por defecto
GRANT ALL ON ALL TABLES IN SCHEMA public TO anon, authenticated;
GRANT EXECUTE ON ALL FUNCTIONS IN SCHEMA public TO authenticated;
GRANT EXECUTE ON ALL FUNCTIONS IN SCHEMA auth TO authenticated;

-- Datos de prueba
INSERT INTO public.teams (id, name) VALUES
  ('00000000-0000-0000-0000-0000000000a1', 'Equipo A'),
  ('00000000-0000-0000-0000-0000000000b1', 'Equipo B');
INSERT INTO auth.users (id, email) VALUES
  ('11111111-1111-1111-1111-111111111111', 'jefe@a.test'),
  ('22222222-2222-2222-2222-222222222222', 'operador@a.test'),
  ('33333333-3333-3333-3333-333333333333', 'jefe@b.test'),
  ('44444444-4444-4444-4444-444444444444', 'admin@x.test');
INSERT INTO public.user_profiles (id, role, team_id) VALUES
  ('11111111-1111-1111-1111-111111111111', 'jefe',          '00000000-0000-0000-0000-0000000000a1'),
  ('22222222-2222-2222-2222-222222222222', 'operador',      '00000000-0000-0000-0000-0000000000a1'),
  ('33333333-3333-3333-3333-333333333333', 'jefe',          '00000000-0000-0000-0000-0000000000b1'),
  ('44444444-4444-4444-4444-444444444444', 'administrador', NULL)
  ON CONFLICT (id) DO UPDATE SET role = EXCLUDED.role, team_id = EXCLUDED.team_id;
INSERT INTO public.garments (id, code, name, team_id) VALUES
  ('aaaaaaaa-0000-0000-0000-000000000001', 'G-A-1', 'Bata A', '00000000-0000-0000-0000-0000000000a1');
INSERT INTO public.documents (garment_id, type, url) VALUES
  ('aaaaaaaa-0000-0000-0000-000000000001', 'etiqueta', 'https://example.test/doc.pdf');
INSERT INTO public.movements (garment_id, previous_status, new_status) VALUES
  ('aaaaaaaa-0000-0000-0000-000000000001', 'lavado', 'disponible');
INSERT INTO public.garment_actions (garment_id, action_type, performed_by) VALUES
  ('aaaaaaaa-0000-0000-0000-000000000001', 'lavado', 'Juan (histórico)');
INSERT INTO public.equipment (id, code, name, team_id) VALUES
  ('eeeeeeee-0000-0000-0000-000000000001', 'EQ-A', 'Equipo A1', '00000000-0000-0000-0000-0000000000a1');
INSERT INTO public.hose_positions (id, equipment_id, caliber) VALUES
  ('dddddddd-0000-0000-0000-000000000001', 'eeeeeeee-0000-0000-0000-000000000001', '1');
INSERT INTO public.hoses (id, position_id, short_code, current_cycle) VALUES
  ('cccccccc-0000-0000-0000-000000000001', 'dddddddd-0000-0000-0000-000000000001', 'M1', 199);
