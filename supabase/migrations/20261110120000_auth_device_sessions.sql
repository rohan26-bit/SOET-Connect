-- Per-device session registry for SOET Connect's custom bearer JWT auth.
-- The table is managed exclusively by the backend service-role client.
CREATE TABLE IF NOT EXISTS public.auth_sessions (
    id UUID PRIMARY KEY,
    user_id UUID NOT NULL REFERENCES public.users(id) ON DELETE CASCADE,
    device_label TEXT NOT NULL DEFAULT 'Unknown device'
        CHECK (char_length(device_label) BETWEEN 1 AND 120),
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    last_seen_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    expires_at TIMESTAMPTZ NOT NULL,
    revoked_at TIMESTAMPTZ,
    CONSTRAINT auth_sessions_expiry_after_creation
        CHECK (expires_at > created_at)
);

CREATE INDEX IF NOT EXISTS idx_auth_sessions_user_last_seen
    ON public.auth_sessions (user_id, last_seen_at DESC);

ALTER TABLE public.auth_sessions ENABLE ROW LEVEL SECURITY;

-- Do not expose session records through anon/authenticated Data API roles.
REVOKE ALL ON TABLE public.auth_sessions FROM PUBLIC, anon, authenticated;
GRANT SELECT, INSERT, UPDATE, DELETE ON TABLE public.auth_sessions TO service_role;

-- Password updates must atomically revoke all old per-device sessions as well
-- as incrementing the existing account-wide token generation.
CREATE OR REPLACE FUNCTION public.update_password_and_revoke_sessions(
    p_user_id UUID,
    p_password_hash TEXT
)
RETURNS INTEGER
LANGUAGE plpgsql
SECURITY INVOKER
SET search_path = ''
AS $function$
DECLARE
    v_session_version INTEGER;
BEGIN
    UPDATE public.users
       SET password_hash = p_password_hash,
           session_version = COALESCE(session_version, 0) + 1,
           updated_at = NOW()
     WHERE id = p_user_id
     RETURNING session_version INTO v_session_version;

    IF NOT FOUND THEN
        RETURN NULL;
    END IF;

    UPDATE public.auth_sessions
       SET revoked_at = NOW()
     WHERE user_id = p_user_id
       AND revoked_at IS NULL;

    RETURN v_session_version;
END;
$function$;

-- Password recovery also revokes every registered device in the same
-- transaction as the password replacement and one-time challenge consumption.
CREATE OR REPLACE FUNCTION public.reset_password_and_revoke_sessions(
    p_challenge_id UUID,
    p_token_hash TEXT,
    p_password_hash TEXT,
    p_now TIMESTAMPTZ
)
RETURNS INTEGER
LANGUAGE plpgsql
SECURITY INVOKER
SET search_path = ''
AS $function$
DECLARE
    v_user_id UUID;
    v_session_version INTEGER;
BEGIN
    SELECT prc.user_id
      INTO v_user_id
      FROM public.password_reset_challenges AS prc
     WHERE prc.id = p_challenge_id
       AND prc.token_hash = p_token_hash
       AND prc.is_used = FALSE
       AND prc.expires_at > p_now
     FOR UPDATE;

    IF NOT FOUND THEN
        RETURN NULL;
    END IF;

    UPDATE public.users AS u
       SET password_hash = p_password_hash,
           session_version = COALESCE(u.session_version, 0) + 1,
           updated_at = p_now
     WHERE u.id = v_user_id
     RETURNING u.session_version INTO v_session_version;

    IF NOT FOUND THEN
        RAISE EXCEPTION 'User account not found';
    END IF;

    UPDATE public.auth_sessions
       SET revoked_at = p_now
     WHERE user_id = v_user_id
       AND revoked_at IS NULL;

    UPDATE public.password_reset_challenges AS prc
       SET is_used = TRUE,
           used_at = p_now
     WHERE prc.user_id = v_user_id
       AND prc.is_used = FALSE;

    RETURN v_session_version;
END;
$function$;

-- Preserve service-role-only execution on the security-sensitive RPCs.
REVOKE ALL ON FUNCTION public.update_password_and_revoke_sessions(UUID, TEXT)
    FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.update_password_and_revoke_sessions(UUID, TEXT)
    TO service_role;

REVOKE ALL ON FUNCTION public.reset_password_and_revoke_sessions(UUID, TEXT, TEXT, TIMESTAMPTZ)
    FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.reset_password_and_revoke_sessions(UUID, TEXT, TEXT, TIMESTAMPTZ)
    TO service_role;

-- Remove old session metadata after it is no longer useful for security review.
DO $schedule$
DECLARE
    v_job_id BIGINT;
BEGIN
    FOR v_job_id IN
        SELECT jobid
          FROM cron.job
         WHERE jobname = 'cleanup-soet-auth-sessions'
    LOOP
        PERFORM cron.unschedule(v_job_id);
    END LOOP;

    PERFORM cron.schedule(
        'cleanup-soet-auth-sessions',
        '35 3 * * *',
        $command$
            DELETE FROM public.auth_sessions
             WHERE expires_at < NOW() - INTERVAL '30 days'
                OR revoked_at < NOW() - INTERVAL '30 days';
        $command$
    );
END;
$schedule$;
