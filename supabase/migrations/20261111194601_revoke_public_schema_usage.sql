-- The application accesses Supabase through the FastAPI backend using service_role.
-- Remove inherited PUBLIC schema visibility from browser-facing PostgREST roles.
-- Table and function privileges are already restricted separately; this closes the
-- remaining schema-level permission inherited through the PUBLIC pseudo-role.

BEGIN;

REVOKE USAGE ON SCHEMA public FROM PUBLIC, anon, authenticated;
GRANT USAGE ON SCHEMA public TO service_role;

COMMIT;
