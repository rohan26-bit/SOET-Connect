-- SOET Connect — Supabase internal function security hardening.
--
-- Internal trigger/event-trigger routines are not application RPC endpoints.
-- Their database triggers invoke them under the function owner, so application
-- roles do not need direct EXECUTE privileges.
--
-- Revoke direct RPC execution from every application role while preserving
-- automatic trigger execution under the owning SECURITY DEFINER context.

REVOKE ALL ON FUNCTION public.rls_auto_enable()
  FROM PUBLIC, anon, authenticated, service_role;

REVOKE ALL ON FUNCTION public.sync_student_prn_registry()
  FROM PUBLIC, anon, authenticated, service_role;

REVOKE ALL ON FUNCTION public.sync_alumni_prn_registry()
  FROM PUBLIC, anon, authenticated, service_role;

REVOKE ALL ON FUNCTION public.ensure_prn_registry_reservation(TEXT)
  FROM PUBLIC, anon, authenticated, service_role;

-- All application tables and inter-function calls in these routines are
-- schema-qualified, so pg_catalog is sufficient. This prevents object
-- shadowing through a writable schema in SECURITY DEFINER functions.
ALTER FUNCTION public.sync_student_prn_registry()
  SET search_path = pg_catalog;

ALTER FUNCTION public.sync_alumni_prn_registry()
  SET search_path = pg_catalog;

ALTER FUNCTION public.ensure_prn_registry_reservation(TEXT)
  SET search_path = pg_catalog;

-- The ordinary updated_at trigger uses only the built-in NOW() function.
ALTER FUNCTION public.update_updated_at_column()
  SET search_path = pg_catalog;

COMMENT ON FUNCTION public.rls_auto_enable() IS
  'Internal event-trigger function. Execution is restricted to the database owner; not callable through the Supabase Data API.';

COMMENT ON FUNCTION public.sync_student_prn_registry() IS
  'Internal student profile trigger. Execution is restricted to the database owner; direct RPC execution is revoked.';

COMMENT ON FUNCTION public.sync_alumni_prn_registry() IS
  'Internal alumni profile trigger. Execution is restricted to the database owner; direct RPC execution is revoked.';

COMMENT ON FUNCTION public.ensure_prn_registry_reservation(TEXT) IS
  'Internal helper called only by PRN synchronization triggers; direct RPC execution is revoked.';

COMMENT ON FUNCTION public.update_updated_at_column() IS
  'Internal updated_at trigger function with a pg_catalog-only search_path.';
