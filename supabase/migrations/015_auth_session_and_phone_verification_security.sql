-- Distinguish locally generated password reset codes from Twilio Verify-managed codes.
ALTER TABLE public.password_reset_challenges
  ADD COLUMN IF NOT EXISTS verification_provider VARCHAR(30) NOT NULL DEFAULT 'internal';

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint
     WHERE conname = 'password_reset_verification_provider_valid'
       AND conrelid = 'public.password_reset_challenges'::regclass
  ) THEN
    ALTER TABLE public.password_reset_challenges
      ADD CONSTRAINT password_reset_verification_provider_valid
      CHECK (verification_provider IN ('internal', 'twilio_verify'));
  END IF;
END;
$$;

-- Track an account-wide token generation so password changes/reset revoke all old JWTs.
ALTER TABLE public.users
  ADD COLUMN IF NOT EXISTS session_version INTEGER NOT NULL DEFAULT 0;

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1
      FROM pg_constraint
     WHERE conname = 'users_session_version_nonnegative'
       AND conrelid = 'public.users'::regclass
  ) THEN
    ALTER TABLE public.users
      ADD CONSTRAINT users_session_version_nonnegative
      CHECK (session_version >= 0);
  END IF;
END;
$$;

-- Password replacement and session revocation occur in one database statement.
CREATE OR REPLACE FUNCTION public.update_password_and_revoke_sessions(
  p_user_id UUID,
  p_password_hash TEXT
)
RETURNS INTEGER
LANGUAGE plpgsql
SECURITY INVOKER
SET search_path = ''
AS $$
DECLARE
  v_session_version INTEGER;
BEGIN
  UPDATE public.users
     SET password_hash = p_password_hash,
         session_version = COALESCE(session_version, 0) + 1,
         updated_at = NOW()
   WHERE id = p_user_id
   RETURNING session_version INTO v_session_version;

  RETURN v_session_version;
END;
$$;

-- Serialize OTP sends per account so concurrent requests cannot bypass cooldown/hourly quotas.
CREATE OR REPLACE FUNCTION public.create_phone_verification_challenge(
  p_user_id UUID,
  p_code_id UUID,
  p_phone TEXT,
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
AS $otp_send$
DECLARE
  v_latest_created_at TIMESTAMPTZ;
  v_recent_count INTEGER;
  v_wait_seconds INTEGER;
BEGIN
  PERFORM 1
    FROM public.users AS u
   WHERE u.id = p_user_id
     AND u.is_active = TRUE
   FOR UPDATE;

  IF NOT FOUND THEN
    RETURN QUERY SELECT 'not_found'::TEXT, 0;
    RETURN;
  END IF;

  SELECT count(*)::INTEGER, max(pvc.created_at)
    INTO v_recent_count, v_latest_created_at
    FROM public.phone_verification_codes AS pvc
   WHERE pvc.user_id = p_user_id
     AND pvc.created_at >= p_now - INTERVAL '1 hour';

  IF v_latest_created_at IS NOT NULL
     AND p_now < v_latest_created_at + INTERVAL '60 seconds' THEN
    v_wait_seconds := GREATEST(
      1,
      CEIL(EXTRACT(EPOCH FROM (v_latest_created_at + INTERVAL '60 seconds' - p_now)))::INTEGER
    );
    RETURN QUERY SELECT 'cooldown'::TEXT, v_wait_seconds;
    RETURN;
  END IF;

  IF v_recent_count >= 3 THEN
    RETURN QUERY SELECT 'hourly_limit'::TEXT, 0;
    RETURN;
  END IF;

  UPDATE public.phone_verification_codes AS pvc
     SET is_used = TRUE
   WHERE pvc.user_id = p_user_id
     AND pvc.is_used = FALSE;

  INSERT INTO public.phone_verification_codes (
    id, user_id, phone, code_hash, attempts, is_used, expires_at, created_at
  )
  VALUES (
    p_code_id, p_user_id, p_phone, p_code_hash, 0, FALSE, p_expires_at, p_now
  );

  RETURN QUERY SELECT 'created'::TEXT, 0;
END;
$otp_send$;

-- Consume an OTP once only after its hash is verified by the backend.
CREATE OR REPLACE FUNCTION public.consume_phone_verification_challenge(
  p_user_id UUID,
  p_code_id UUID,
  p_now TIMESTAMPTZ,
  p_max_attempts INTEGER
)
RETURNS BOOLEAN
LANGUAGE plpgsql
SECURITY INVOKER
SET search_path = ''
AS $otp_consume$
DECLARE
  v_consumed_id UUID;
BEGIN
  UPDATE public.phone_verification_codes AS pvc
     SET is_used = TRUE
   WHERE pvc.id = p_code_id
     AND pvc.user_id = p_user_id
     AND pvc.is_used = FALSE
     AND COALESCE(pvc.attempts, 0) < p_max_attempts
     AND pvc.expires_at > p_now
  RETURNING pvc.id INTO v_consumed_id;

  RETURN v_consumed_id IS NOT NULL;
END;
$otp_consume$;

-- Atomic attempt counter prevents concurrent wrong OTP requests from bypassing the lockout.
CREATE OR REPLACE FUNCTION public.record_phone_verification_failure(
  p_code_id UUID,
  p_max_attempts INTEGER
)
RETURNS TABLE (
  attempts INTEGER,
  is_locked BOOLEAN
)
LANGUAGE plpgsql
SECURITY INVOKER
SET search_path = ''
AS $$
BEGIN
  IF p_max_attempts < 1 OR p_max_attempts > 10 THEN
    RAISE EXCEPTION 'Invalid phone verification attempt limit';
  END IF;

  RETURN QUERY
  UPDATE public.phone_verification_codes AS pvc
     SET attempts = COALESCE(pvc.attempts, 0) + 1,
         is_used = (COALESCE(pvc.attempts, 0) + 1 >= p_max_attempts)
   WHERE pvc.id = p_code_id
     AND pvc.is_used = FALSE
   RETURNING pvc.attempts, pvc.is_used;
END;
$$;

REVOKE EXECUTE ON FUNCTION public.create_phone_verification_challenge(UUID, UUID, TEXT, TEXT, TIMESTAMPTZ, TIMESTAMPTZ) FROM PUBLIC;
REVOKE EXECUTE ON FUNCTION public.create_phone_verification_challenge(UUID, UUID, TEXT, TEXT, TIMESTAMPTZ, TIMESTAMPTZ) FROM anon, authenticated;
GRANT EXECUTE ON FUNCTION public.create_phone_verification_challenge(UUID, UUID, TEXT, TEXT, TIMESTAMPTZ, TIMESTAMPTZ) TO service_role;

REVOKE EXECUTE ON FUNCTION public.consume_phone_verification_challenge(UUID, UUID, TIMESTAMPTZ, INTEGER) FROM PUBLIC;
REVOKE EXECUTE ON FUNCTION public.consume_phone_verification_challenge(UUID, UUID, TIMESTAMPTZ, INTEGER) FROM anon, authenticated;
GRANT EXECUTE ON FUNCTION public.consume_phone_verification_challenge(UUID, UUID, TIMESTAMPTZ, INTEGER) TO service_role;

REVOKE EXECUTE ON FUNCTION public.update_password_and_revoke_sessions(UUID, TEXT) FROM PUBLIC;
REVOKE EXECUTE ON FUNCTION public.update_password_and_revoke_sessions(UUID, TEXT) FROM anon, authenticated;
GRANT EXECUTE ON FUNCTION public.update_password_and_revoke_sessions(UUID, TEXT) TO service_role;

REVOKE EXECUTE ON FUNCTION public.record_phone_verification_failure(UUID, INTEGER) FROM PUBLIC;
REVOKE EXECUTE ON FUNCTION public.record_phone_verification_failure(UUID, INTEGER) FROM anon, authenticated;
GRANT EXECUTE ON FUNCTION public.record_phone_verification_failure(UUID, INTEGER) TO service_role;


-- Increment password-reset attempts under a row lock to prevent concurrent guesses bypassing the limit.
CREATE OR REPLACE FUNCTION public.record_password_reset_failure(
  p_challenge_id UUID,
  p_max_attempts INTEGER
)
RETURNS TABLE (
  attempts INTEGER,
  is_locked BOOLEAN
)
LANGUAGE plpgsql
SECURITY INVOKER
SET search_path = ''
AS $pwd_attempt$
BEGIN
  IF p_max_attempts < 1 OR p_max_attempts > 10 THEN
    RAISE EXCEPTION 'Invalid password reset attempt limit';
  END IF;

  RETURN QUERY
  UPDATE public.password_reset_challenges AS prc
     SET attempts = COALESCE(prc.attempts, 0) + 1,
         is_used = (COALESCE(prc.attempts, 0) + 1 >= p_max_attempts),
         used_at = CASE
           WHEN COALESCE(prc.attempts, 0) + 1 >= p_max_attempts THEN NOW()
           ELSE prc.used_at
         END
   WHERE prc.id = p_challenge_id
     AND prc.is_used = FALSE
   RETURNING prc.attempts, prc.is_used;
END;
$pwd_attempt$;

-- Consume the reset token, replace the password and revoke old JWT sessions atomically.
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
AS $pwd_reset$
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

  UPDATE public.password_reset_challenges AS prc
     SET is_used = TRUE,
         used_at = p_now
   WHERE prc.user_id = v_user_id
     AND prc.is_used = FALSE;

  RETURN v_session_version;
END;
$pwd_reset$;

REVOKE EXECUTE ON FUNCTION public.record_password_reset_failure(UUID, INTEGER) FROM PUBLIC;
REVOKE EXECUTE ON FUNCTION public.record_password_reset_failure(UUID, INTEGER) FROM anon, authenticated;
GRANT EXECUTE ON FUNCTION public.record_password_reset_failure(UUID, INTEGER) TO service_role;

REVOKE EXECUTE ON FUNCTION public.reset_password_and_revoke_sessions(UUID, TEXT, TEXT, TIMESTAMPTZ) FROM PUBLIC;
REVOKE EXECUTE ON FUNCTION public.reset_password_and_revoke_sessions(UUID, TEXT, TEXT, TIMESTAMPTZ) FROM anon, authenticated;
GRANT EXECUTE ON FUNCTION public.reset_password_and_revoke_sessions(UUID, TEXT, TEXT, TIMESTAMPTZ) TO service_role;
