-- SOET Connect accesses application data through its FastAPI backend using
-- the Supabase service_role key. The browser has no Supabase client and calls
-- same-origin /api routes instead. Keep PostgREST client roles out of public.
--
-- Existing tables are RLS-protected with service_role-only policies. This
-- migration adds a privilege boundary before RLS and prevents future migrations
-- from accidentally granting public-schema access to browser roles.

BEGIN;

REVOKE USAGE ON SCHEMA public FROM anon, authenticated;

REVOKE ALL PRIVILEGES ON ALL TABLES IN SCHEMA public
    FROM anon, authenticated;

REVOKE ALL PRIVILEGES ON ALL SEQUENCES IN SCHEMA public
    FROM anon, authenticated;

REVOKE EXECUTE ON ALL FUNCTIONS IN SCHEMA public
    FROM PUBLIC, anon, authenticated;

-- Migrations run as postgres in this project. Prevent new application tables,
-- sequences and functions from inheriting Supabase client-role privileges.
ALTER DEFAULT PRIVILEGES FOR ROLE postgres IN SCHEMA public
    REVOKE ALL PRIVILEGES ON TABLES FROM anon, authenticated;

ALTER DEFAULT PRIVILEGES FOR ROLE postgres IN SCHEMA public
    REVOKE ALL PRIVILEGES ON SEQUENCES FROM anon, authenticated;

ALTER DEFAULT PRIVILEGES FOR ROLE postgres IN SCHEMA public
    REVOKE EXECUTE ON FUNCTIONS FROM PUBLIC, anon, authenticated;

COMMIT;
