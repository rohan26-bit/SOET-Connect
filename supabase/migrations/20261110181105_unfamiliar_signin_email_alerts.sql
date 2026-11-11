-- Rate-limited email alerts for unfamiliar account sign-ins.
-- The backend may send at most one unfamiliar sign-in security email per account per 6 hours.

ALTER TABLE public.auth_security_events
    ADD COLUMN IF NOT EXISTS email_alert_claimed_at TIMESTAMPTZ;

CREATE INDEX IF NOT EXISTS idx_auth_security_events_email_alert_cooldown
    ON public.auth_security_events (user_id, email_alert_claimed_at DESC)
    WHERE event_type = 'unfamiliar_sign_in'
      AND email_alert_claimed_at IS NOT NULL;

-- Serialize claims per account so simultaneous unfamiliar sign-ins cannot
-- generate multiple email notifications inside the cooldown window.
CREATE OR REPLACE FUNCTION public.claim_unfamiliar_sign_in_email_alert(
    p_user_id UUID,
    p_event_id UUID,
    p_now TIMESTAMPTZ,
    p_cooldown_seconds INTEGER DEFAULT 21600
)
RETURNS BOOLEAN
LANGUAGE plpgsql
SECURITY INVOKER
SET search_path = ''
AS $function$
BEGIN
    IF p_user_id IS NULL
       OR p_event_id IS NULL
       OR p_now IS NULL
       OR p_cooldown_seconds < 1
       OR p_cooldown_seconds > 86400 THEN
        RETURN FALSE;
    END IF;

    -- Lock the account row to serialize claims from parallel serverless requests.
    PERFORM 1
      FROM public.users AS u
     WHERE u.id = p_user_id
     FOR UPDATE;

    IF NOT FOUND THEN
        RETURN FALSE;
    END IF;

    IF EXISTS (
        SELECT 1
          FROM public.auth_security_events AS e
         WHERE e.user_id = p_user_id
           AND e.event_type = 'unfamiliar_sign_in'
           AND e.email_alert_claimed_at >=
               p_now - make_interval(secs => p_cooldown_seconds)
    ) THEN
        RETURN FALSE;
    END IF;

    UPDATE public.auth_security_events AS e
       SET email_alert_claimed_at = p_now
     WHERE e.id = p_event_id
       AND e.user_id = p_user_id
       AND e.event_type = 'unfamiliar_sign_in'
       AND e.email_alert_claimed_at IS NULL;

    RETURN FOUND;
END;
$function$;

REVOKE ALL ON FUNCTION public.claim_unfamiliar_sign_in_email_alert(UUID, UUID, TIMESTAMPTZ, INTEGER)
    FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.claim_unfamiliar_sign_in_email_alert(UUID, UUID, TIMESTAMPTZ, INTEGER)
    TO service_role;

-- Claim RPC runs as the service role and only updates its own security event row.
GRANT UPDATE ON TABLE public.auth_security_events TO service_role;
