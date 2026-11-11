-- Chat presence uses a server-maintained heartbeat timestamp.
-- Clients can only write their own timestamp through the authenticated FastAPI route.
ALTER TABLE public.users
    ADD COLUMN IF NOT EXISTS last_seen_at timestamptz;

CREATE INDEX IF NOT EXISTS idx_users_last_seen_at
    ON public.users (last_seen_at)
    WHERE last_seen_at IS NOT NULL;

COMMENT ON COLUMN public.users.last_seen_at IS
    'Last authenticated SOET Connect activity heartbeat; chat treats timestamps within 90 seconds as online.';
