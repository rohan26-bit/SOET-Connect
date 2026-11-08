-- Persist all event details currently represented by the UI and enforce audience/capacity rules.
ALTER TABLE public.events
  ADD COLUMN IF NOT EXISTS organizer VARCHAR(255),
  ADD COLUMN IF NOT EXISTS end_date DATE,
  ADD COLUMN IF NOT EXISTS end_time VARCHAR(50),
  ADD COLUMN IF NOT EXISTS visibility VARCHAR(30) NOT NULL DEFAULT 'everyone',
  ADD COLUMN IF NOT EXISTS tags JSONB NOT NULL DEFAULT '[]'::jsonb;

-- New events are unlimited unless the creator chooses a capacity.
ALTER TABLE public.events ALTER COLUMN capacity DROP DEFAULT;

UPDATE public.events
SET visibility = 'everyone'
WHERE visibility IS NULL OR btrim(visibility) = '';

UPDATE public.events
SET tags = '[]'::jsonb
WHERE tags IS NULL OR jsonb_typeof(tags) <> 'array';

ALTER TABLE public.events
  ALTER COLUMN visibility SET DEFAULT 'everyone',
  ALTER COLUMN visibility SET NOT NULL,
  ALTER COLUMN tags SET DEFAULT '[]'::jsonb,
  ALTER COLUMN tags SET NOT NULL;

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint
    WHERE conname = 'events_visibility_valid'
      AND conrelid = 'public.events'::regclass
  ) THEN
    ALTER TABLE public.events
      ADD CONSTRAINT events_visibility_valid
      CHECK (visibility IN ('everyone', 'students_only', 'alumni_only', 'admin_only'));
  END IF;

  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint
    WHERE conname = 'events_capacity_positive'
      AND conrelid = 'public.events'::regclass
  ) THEN
    ALTER TABLE public.events
      ADD CONSTRAINT events_capacity_positive
      CHECK (capacity IS NULL OR capacity > 0);
  END IF;

  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint
    WHERE conname = 'events_tags_array'
      AND conrelid = 'public.events'::regclass
  ) THEN
    ALTER TABLE public.events
      ADD CONSTRAINT events_tags_array
      CHECK (jsonb_typeof(tags) = 'array');
  END IF;
END;
$$;

CREATE INDEX IF NOT EXISTS idx_events_visibility_status_date
  ON public.events (visibility, status, date);

-- Serialize registrations on the event row so simultaneous requests cannot
-- exceed the configured capacity. This function is SECURITY INVOKER and is
-- callable only by the server-side service_role key.
CREATE OR REPLACE FUNCTION public.register_event_with_capacity(
  p_event_id UUID,
  p_user_id UUID
)
RETURNS TABLE (
  outcome TEXT,
  registration_id UUID,
  registered_at TIMESTAMPTZ
)
LANGUAGE plpgsql
SECURITY INVOKER
SET search_path = ''
AS $$
DECLARE
  v_capacity INTEGER;
  v_registered_count BIGINT;
  v_registration_id UUID;
  v_registered_at TIMESTAMPTZ;
BEGIN
  SELECT e.capacity
    INTO v_capacity
    FROM public.events AS e
   WHERE e.id = p_event_id
     AND e.status = 'approved'
   FOR UPDATE;

  IF NOT FOUND THEN
    RETURN QUERY SELECT 'not_found'::TEXT, NULL::UUID, NULL::TIMESTAMPTZ;
    RETURN;
  END IF;

  IF EXISTS (
    SELECT 1
      FROM public.event_registrations AS er
     WHERE er.event_id = p_event_id
       AND er.user_id = p_user_id
       AND er.status IN ('registered', 'attended')
  ) THEN
    RETURN QUERY SELECT 'duplicate'::TEXT, NULL::UUID, NULL::TIMESTAMPTZ;
    RETURN;
  END IF;

  SELECT count(*)
    INTO v_registered_count
    FROM public.event_registrations AS er
   WHERE er.event_id = p_event_id
     AND er.status IN ('registered', 'attended');

  IF v_capacity IS NOT NULL AND v_registered_count >= v_capacity THEN
    RETURN QUERY SELECT 'full'::TEXT, NULL::UUID, NULL::TIMESTAMPTZ;
    RETURN;
  END IF;

  INSERT INTO public.event_registrations (event_id, user_id, status)
  VALUES (p_event_id, p_user_id, 'registered')
  RETURNING id, registered_at
       INTO v_registration_id, v_registered_at;

  RETURN QUERY SELECT 'registered'::TEXT, v_registration_id, v_registered_at;
END;
$$;

REVOKE EXECUTE ON FUNCTION public.register_event_with_capacity(UUID, UUID) FROM PUBLIC;
REVOKE EXECUTE ON FUNCTION public.register_event_with_capacity(UUID, UUID) FROM anon, authenticated;
GRANT EXECUTE ON FUNCTION public.register_event_with_capacity(UUID, UUID) TO service_role;
