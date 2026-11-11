-- One-time password recovery code consumption and privacy-preserving security activity.
-- Security events are visible only to the FastAPI service-role backend.

ALTER TABLE public.password_reset_challenges
    ADD COLUMN IF NOT EXISTS code_verified_at TIMESTAMPTZ;

CREATE INDEX IF NOT EXISTS idx_pwd_reset_verified_token
    ON public.password_reset_challenges (token_hash)
    WHERE token_hash IS NOT NULL;

-- Atomically move a code challenge into its verified reset-token state.
-- The NULL checks guarantee that only one concurrent request can consume the OTP.
CREATE OR REPLACE FUNCTION public.consume_password_reset_code(
    p_challenge_id UUID,
    p_token_hash TEXT,
    p_now TIMESTAMPTZ
)
RETURNS BOOLEAN
LANGUAGE plpgsql
SECURITY INVOKER
SET search_path = ''
AS $function$
BEGIN
    IF p_token_hash IS NULL OR length(p_token_hash) <> 64 OR p_now IS NULL THEN
        RETURN FALSE;
    END IF;

    UPDATE public.password_reset_challenges
       SET token_hash = p_token_hash,
           code_verified_at = p_now
     WHERE id = p_challenge_id
       AND is_used = FALSE
       AND token_hash IS NULL
       AND code_verified_at IS NULL
       AND expires_at > p_now
       AND attempts < max_attempts;

    RETURN FOUND;
END;
$function$;

REVOKE ALL ON FUNCTION public.consume_password_reset_code(UUID, TEXT, TIMESTAMPTZ)
    FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.consume_password_reset_code(UUID, TEXT, TIMESTAMPTZ)
    TO service_role;

-- Require an OTP-verification timestamp before accepting a reset token.
-- Keep the password replacement, challenge consumption, and session revocation
-- inside the same database transaction.
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
       AND prc.code_verified_at IS NOT NULL
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

REVOKE ALL ON FUNCTION public.reset_password_and_revoke_sessions(UUID, TEXT, TEXT, TIMESTAMPTZ)
    FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.reset_password_and_revoke_sessions(UUID, TEXT, TEXT, TIMESTAMPTZ)
    TO service_role;

-- Minimal account security timeline. The application stores only HMAC IP
-- fingerprints and coarse device labels; raw IP addresses and user-agent strings
-- are deliberately excluded.
CREATE TABLE IF NOT EXISTS public.auth_security_events (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    user_id UUID NOT NULL REFERENCES public.users(id) ON DELETE CASCADE,
    event_type TEXT NOT NULL
        CHECK (event_type IN (
            'sign_in',
            'unfamiliar_sign_in',
            'password_changed',
            'password_reset',
            'signed_out',
            'sessions_revoked'
        )),
    device_label TEXT NOT NULL DEFAULT 'Unknown device'
        CHECK (char_length(device_label) BETWEEN 1 AND 120),
    ip_fingerprint TEXT
        CHECK (ip_fingerprint IS NULL OR ip_fingerprint ~ '^[a-f0-9]{64}$'),
    metadata JSONB NOT NULL DEFAULT '{}'::jsonb
        CHECK (jsonb_typeof(metadata) = 'object'),
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_auth_security_events_user_created
    ON public.auth_security_events (user_id, created_at DESC);

ALTER TABLE public.auth_security_events ENABLE ROW LEVEL SECURITY;

-- The backend uses the Supabase service-role client. Do not expose audit rows
-- or fingerprints through anon/authenticated Data API roles.
REVOKE ALL ON TABLE public.auth_security_events FROM PUBLIC, anon, authenticated;
GRANT SELECT, INSERT ON TABLE public.auth_security_events TO service_role;

COMMENT ON TABLE public.auth_security_events IS
    'Minimal account security activity; stores HMAC IP fingerprints only, never raw IP addresses or full user-agent strings.';

-- Keep the account timeline bounded while retaining a useful 180-day review window.
DO $schedule$
DECLARE
    v_job_id BIGINT;
BEGIN
    FOR v_job_id IN
        SELECT jobid
          FROM cron.job
         WHERE jobname = 'cleanup-soet-auth-security-events'
    LOOP
        PERFORM cron.unschedule(v_job_id);
    END LOOP;

    PERFORM cron.schedule(
        'cleanup-soet-auth-security-events',
        '45 3 * * *',
        $command$
            DELETE FROM public.auth_security_events
             WHERE created_at < NOW() - INTERVAL '180 days';
        $command$
    );
END;
$schedule$;
