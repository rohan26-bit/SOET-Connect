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

REVOKE EXECUTE ON FUNCTION public.update_password_and_revoke_sessions(UUID, TEXT) FROM PUBLIC;
REVOKE EXECUTE ON FUNCTION public.update_password_and_revoke_sessions(UUID, TEXT) FROM anon, authenticated;
GRANT EXECUTE ON FUNCTION public.update_password_and_revoke_sessions(UUID, TEXT) TO service_role;

REVOKE EXECUTE ON FUNCTION public.record_phone_verification_failure(UUID, INTEGER) FROM PUBLIC;
REVOKE EXECUTE ON FUNCTION public.record_phone_verification_failure(UUID, INTEGER) FROM anon, authenticated;
GRANT EXECUTE ON FUNCTION public.record_phone_verification_failure(UUID, INTEGER) TO service_role;
