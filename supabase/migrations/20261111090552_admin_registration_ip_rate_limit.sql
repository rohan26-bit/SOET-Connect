-- Limit online guessing of the privileged admin-registration secret.
-- Five requests per source IP are allowed in a 15-minute window; the sixth
-- request starts a 15-minute block. The bucket stores only an HMAC fingerprint.

CREATE OR REPLACE FUNCTION public.record_admin_registration_ip_attempt(
    p_key_hash TEXT,
    p_now TIMESTAMPTZ
)
RETURNS TABLE (
    is_blocked BOOLEAN,
    retry_after_seconds INTEGER,
    attempts INTEGER
)
LANGUAGE plpgsql
SECURITY INVOKER
SET search_path = ''
AS $function$
DECLARE
    v_attempts INTEGER;
    v_blocked_until TIMESTAMPTZ;
BEGIN
    IF p_key_hash IS NULL
       OR p_key_hash !~ '^[0-9a-f]{64}$'
       OR p_now IS NULL THEN
        RAISE EXCEPTION 'Invalid admin registration rate-limit parameters.';
    END IF;

    SELECT bucket.attempts, bucket.blocked_until
      INTO v_attempts, v_blocked_until
      FROM private.bump_login_rate_limit(
          p_key_hash,
          p_now,
          900,
          900,
          6
      ) AS bucket;

    RETURN QUERY
    SELECT
        COALESCE(v_blocked_until > p_now, FALSE),
        CASE
            WHEN v_blocked_until > p_now
                THEN GREATEST(
                    1,
                    CEIL(EXTRACT(EPOCH FROM (v_blocked_until - p_now)))::INTEGER
                )
            ELSE 0
        END,
        v_attempts;
END;
$function$;

REVOKE ALL ON FUNCTION public.record_admin_registration_ip_attempt(TEXT, TIMESTAMPTZ)
    FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.record_admin_registration_ip_attempt(TEXT, TIMESTAMPTZ)
    TO service_role;
