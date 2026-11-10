-- ============================================================
-- PRIVILEGIOS DE FUNCIONES (avisos del Security Advisor de Supabase)
-- ============================================================
--   * anon (la anon key pública) no debe poder llamar ninguna función RPC:
--     todas las pantallas requieren sesión.
--   * Las funciones de trigger no deben ser invocables vía /rest/v1/rpc.
--   * search_path fijo en las funciones auxiliares (lint 0011).
--
-- Se mantiene EXECUTE para authenticated en las RPC de negocio y en los
-- helpers que usan las políticas RLS (get_my_role, can_access_*, ...):
-- los avisos "authenticated_security_definer_function_executable" de esas
-- funciones son intencionales; cada una valida rol y equipo por dentro.
-- ============================================================

BEGIN;

-- 1. Ninguna función del esquema public es ejecutable sin sesión
DO $$
DECLARE
  f RECORD;
BEGIN
  FOR f IN
    SELECT p.oid::regprocedure AS sig
      FROM pg_proc p
     WHERE p.pronamespace = 'public'::regnamespace
       AND p.prokind = 'f'
  LOOP
    EXECUTE format('REVOKE EXECUTE ON FUNCTION %s FROM PUBLIC, anon', f.sig);
  END LOOP;
END $$;

-- Y las que se creen en el futuro tampoco (por defecto Supabase las concede a anon)
ALTER DEFAULT PRIVILEGES IN SCHEMA public REVOKE EXECUTE ON FUNCTIONS FROM PUBLIC, anon;

-- 2. Funciones de trigger: no son RPC
REVOKE EXECUTE ON FUNCTION public.handle_new_user()                FROM authenticated;
REVOKE EXECUTE ON FUNCTION public.auto_assign_garment_to_creator() FROM authenticated;
REVOKE EXECUTE ON FUNCTION public.audit_log_change()               FROM authenticated;
REVOKE EXECUTE ON FUNCTION public.prevent_history_modification()   FROM authenticated;
REVOKE EXECUTE ON FUNCTION public.stamp_recorder()                 FROM authenticated;

-- 3. Helpers internos que solo usan otras funciones SECURITY DEFINER
REVOKE EXECUTE ON FUNCTION public.require_text(TEXT, TEXT)   FROM authenticated;
REVOKE EXECUTE ON FUNCTION public.set_change_reason(TEXT)    FROM authenticated;
REVOKE EXECUTE ON FUNCTION public.require_authenticated()    FROM authenticated;

-- 4. search_path fijo
ALTER FUNCTION public.require_text(TEXT, TEXT)       SET search_path = public;
ALTER FUNCTION public.set_change_reason(TEXT)        SET search_path = public;
ALTER FUNCTION public.prevent_history_modification() SET search_path = public;
ALTER FUNCTION public.stamp_recorder()               SET search_path = public;

COMMIT;
