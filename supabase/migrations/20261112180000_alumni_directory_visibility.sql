-- Persist the alumni directory visibility preference.
-- Existing alumni remain visible unless they explicitly opt out.
ALTER TABLE public.users
  ADD COLUMN IF NOT EXISTS is_public_profile BOOLEAN NOT NULL DEFAULT TRUE;

COMMENT ON COLUMN public.users.is_public_profile IS
  'Whether an alumni account is included in the authenticated alumni directory.';
