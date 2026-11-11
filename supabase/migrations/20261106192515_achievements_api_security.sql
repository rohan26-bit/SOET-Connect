-- Achievement writes and reads are served by authenticated FastAPI routes.
-- The browser must not access this table directly with anon/authenticated keys.
-- FastAPI authenticates the SOET Connect JWT, enforces alumni role/ownership,
-- and then accesses the table with the server-only service role key.

ALTER TABLE public.achievements ENABLE ROW LEVEL SECURITY;

REVOKE ALL PRIVILEGES ON TABLE public.achievements FROM anon, authenticated;
GRANT SELECT, INSERT, UPDATE, DELETE ON TABLE public.achievements TO service_role;

DROP POLICY IF EXISTS service_role_all_achievements ON public.achievements;
CREATE POLICY service_role_all_achievements
    ON public.achievements
    FOR ALL
    TO service_role
    USING (true)
    WITH CHECK (true);

COMMENT ON TABLE public.achievements IS
    'Alumni achievements. Access is mediated by FastAPI ownership and visibility checks using the service role; direct anon/authenticated Data API grants are intentionally revoked.';
