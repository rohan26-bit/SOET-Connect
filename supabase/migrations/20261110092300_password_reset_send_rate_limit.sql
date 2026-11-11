-- Account-level password reset send throttling.
-- Pending deliveries count toward the quota until their provider outcome is recorded;
-- failed deliveries do not consume the quota and can be retried immediately.

ALTER TABLE public.password_reset_challenges
  ADD COLUMN IF NOT EXISTS delivery_status VARCHAR(20) NOT NULL DEFAULT 'accepted';

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1
      FROM pg_constraint
     WHERE conname = 'password_reset_delivery_status_valid'
       AND conrelid = 'public.password_reset_challenges'::regclass
  ) THEN
    ALTER TABLE public.password_reset_challenges
      ADD CONSTRAINT password_reset_delivery_status_valid
      CHECK (delivery_status IN ('pending', 'accepted', 'failed'));
  END IF;
END;
$$;

CREATE INDEX IF NOT EXISTS idx_pwd_reset_user_created_delivery
  ON public.password_reset_challenges (user_id, created_at DESC, delivery_status);

-- Serialize password-reset requests per account so concurrent requests cannot
-- bypass either the 60-second cooldown or the three accepted/pending sends per hour.
CREATE OR REPLACE FUNCTION public.create_password_reset_challenge(
  p_user_id UUID,
  p_challenge_id UUID,
  p_channel TEXT,
  p_recipient TEXT,
  p_verification_provider TEXT,
  p_code_hash TEXT,
  p_expires_at TIMESTAMPTZ,
  p_now TIMESTAMPTZ
)
RETURNS TABLE (
  outcome TEXT,
  retry_after_seconds INTEGER
)
LANGUAGE plpgsql
SECURITY INVOKER
SET search_path = ''
AS $pwd_send$
DECLARE
  v_recent_count INTEGER;
  v_latest_created_at TIMESTAMPTZ;
  v_retry_after INTEGER;
BEGIN
  IF p_channel NOT IN ('email', 'sms')
     OR p_verification_provider NOT IN ('internal', 'twilio_verify')
     OR p_expires_at <= p_now
     OR p_code_hash IS NULL
     OR length(p_code_hash) <> 64
     OR p_recipient IS NULL
     OR length(trim(p_recipient)) = 0 THEN
    RAISE EXCEPTION 'Invalid password reset challenge input';
  END IF;

  -- A row lock serializes competing send attempts for this user.
  PERFORM 1
    FROM public.users AS u
   WHERE u.id = p_user_id
     AND u.is_active = TRUE
   FOR UPDATE;

  IF NOT FOUND THEN
    RETURN QUERY SELECT 'not_found'::TEXT, 0::INTEGER;
    RETURN;
  END IF;

  SELECT
    count(*)::INTEGER,
    max(prc.created_at) FILTER (
      WHERE prc.created_at >= p_now - INTERVAL '60 seconds'
    )
    INTO v_recent_count, v_latest_created_at
    FROM public.password_reset_challenges AS prc
   WHERE prc.user_id = p_user_id
     AND prc.created_at >= p_now - INTERVAL '1 hour'
     AND prc.delivery_status IN ('pending', 'accepted');

  IF v_latest_created_at IS NOT NULL
     AND p_now < v_latest_created_at + INTERVAL '60 seconds' THEN
    v_retry_after := GREATEST(
      1,
      CEIL(EXTRACT(EPOCH FROM (v_latest_created_at + INTERVAL '60 seconds' - p_now)))::INTEGER
    );
    RETURN QUERY SELECT 'cooldown'::TEXT, v_retry_after;
    RETURN;
  END IF;

  IF v_recent_count >= 3 THEN
    RETURN QUERY SELECT 'hourly_limit'::TEXT, 0::INTEGER;
    RETURN;
  END IF;

  -- Only invalidate the previous challenge once the new request is allowed.
  UPDATE public.password_reset_challenges
     SET is_used = TRUE,
         used_at = p_now
   WHERE user_id = p_user_id
     AND is_used = FALSE;

  INSERT INTO public.password_reset_challenges (
    id,
    user_id,
    channel,
    recipient,
    verification_provider,
    code_hash,
    token_hash,
    attempts,
    max_attempts,
    is_used,
    used_at,
    expires_at,
    created_at,
    delivery_status
  ) VALUES (
    p_challenge_id,
    p_user_id,
    p_channel,
    p_recipient,
    p_verification_provider,
    p_code_hash,
    NULL,
    0,
    5,
    FALSE,
    NULL,
    p_expires_at,
    p_now,
    'pending'
  );

  RETURN QUERY SELECT 'created'::TEXT, 0::INTEGER;
END;
$pwd_send$;

REVOKE EXECUTE ON FUNCTION public.create_password_reset_challenge(UUID, UUID, TEXT, TEXT, TEXT, TEXT, TIMESTAMPTZ, TIMESTAMPTZ) FROM PUBLIC;
REVOKE EXECUTE ON FUNCTION public.create_password_reset_challenge(UUID, UUID, TEXT, TEXT, TEXT, TEXT, TIMESTAMPTZ, TIMESTAMPTZ) FROM anon, authenticated;
GRANT EXECUTE ON FUNCTION public.create_password_reset_challenge(UUID, UUID, TEXT, TEXT, TEXT, TEXT, TIMESTAMPTZ, TIMESTAMPTZ) TO service_role;
