-- Recheck audience visibility and registration deadlines while holding the event row lock.
-- The preflight API checks remain useful for fast feedback, but cannot be authoritative
-- across a concurrent event edit or a request waiting for the event lock.

CREATE OR REPLACE FUNCTION public.register_event_with_capacity(
    p_event_id UUID,
    p_user_id UUID,
    p_user_role TEXT
)
RETURNS TABLE (
    outcome TEXT,
    registration_id UUID,
    registered_at TIMESTAMPTZ
)
LANGUAGE plpgsql
SECURITY INVOKER
SET search_path = ''
AS $function$
DECLARE
    v_event public.events%ROWTYPE;
    v_registered_count BIGINT;
    v_registration_id UUID;
    v_registered_at TIMESTAMPTZ;
    v_event_time TIME;
    v_event_start_at TIMESTAMPTZ;
    v_time_parts TEXT[];
    v_hour INTEGER;
BEGIN
    -- Serialize registration attempts and event edits against the same row.
    SELECT e.*
      INTO v_event
      FROM public.events AS e
     WHERE e.id = p_event_id
     FOR UPDATE;

    IF NOT FOUND OR v_event.status <> 'approved' THEN
        RETURN QUERY SELECT 'not_found'::TEXT, NULL::UUID, NULL::TIMESTAMPTZ;
        RETURN;
    END IF;

    -- The caller supplies the role resolved from the current database user,
    -- not a client-provided request field. Recheck audience after obtaining
    -- the lock so a concurrent visibility edit cannot race the earlier API check.
    IF p_user_role IS NULL OR p_user_role NOT IN ('student', 'alumni', 'admin') THEN
        RETURN QUERY SELECT 'not_found'::TEXT, NULL::UUID, NULL::TIMESTAMPTZ;
        RETURN;
    END IF;

    IF NOT (
        p_user_role = 'admin'
        OR (v_event.visibility = 'everyone' AND p_user_role IN ('student', 'alumni'))
        OR (v_event.visibility = 'students_only' AND p_user_role = 'student')
        OR (v_event.visibility = 'alumni_only' AND p_user_role = 'alumni')
    ) THEN
        RETURN QUERY SELECT 'not_found'::TEXT, NULL::UUID, NULL::TIMESTAMPTZ;
        RETURN;
    END IF;

    -- Match the API rule: an explicit registration deadline takes precedence;
    -- otherwise registration closes at the event start in Asia/Kolkata, or
    -- at the end of the event date when the stored time is not parseable.
    IF v_event.registration_deadline IS NOT NULL THEN
        IF clock_timestamp() > v_event.registration_deadline THEN
            RETURN QUERY SELECT 'closed'::TEXT, NULL::UUID, NULL::TIMESTAMPTZ;
            RETURN;
        END IF;
    ELSE
        IF btrim(COALESCE(v_event.time, '')) ~ '^([01][0-9]|2[0-3]):[0-5][0-9](:[0-5][0-9](\.[0-9]+)?)?$' THEN
            v_event_time := btrim(v_event.time)::TIME;
        ELSE
            v_time_parts := regexp_match(
                btrim(COALESCE(v_event.time, '')),
                '^([0-9]{1,2}):([0-5][0-9])(:([0-5][0-9]))?\s*(AM|PM)$',
                'i'
            );

            IF v_time_parts IS NOT NULL THEN
                v_hour := (v_time_parts[1]::INTEGER % 12)
                    + CASE WHEN upper(v_time_parts[5]) = 'PM' THEN 12 ELSE 0 END;
                v_event_time := make_time(
                    v_hour,
                    v_time_parts[2]::INTEGER,
                    COALESCE(v_time_parts[4], '0')::DOUBLE PRECISION
                );
            END IF;
        END IF;

        IF v_event_time IS NOT NULL THEN
            v_event_start_at := (v_event.date + v_event_time) AT TIME ZONE 'Asia/Kolkata';
        ELSE
            v_event_start_at := (v_event.date + 1)::TIMESTAMP AT TIME ZONE 'Asia/Kolkata';
        END IF;

        IF clock_timestamp() > v_event_start_at THEN
            RETURN QUERY SELECT 'closed'::TEXT, NULL::UUID, NULL::TIMESTAMPTZ;
            RETURN;
        END IF;
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

    IF v_event.capacity IS NOT NULL AND v_registered_count >= v_event.capacity THEN
        RETURN QUERY SELECT 'full'::TEXT, NULL::UUID, NULL::TIMESTAMPTZ;
        RETURN;
    END IF;

    INSERT INTO public.event_registrations (event_id, user_id, status)
    VALUES (p_event_id, p_user_id, 'registered')
    RETURNING id, registered_at
         INTO v_registration_id, v_registered_at;

    RETURN QUERY SELECT 'registered'::TEXT, v_registration_id, v_registered_at;
END;
$function$;

-- Keep the new overload server-only. The previous two-argument overload remains
-- service-role-only for compatibility until the backend has rolled out everywhere.
REVOKE ALL ON FUNCTION public.register_event_with_capacity(UUID, UUID, TEXT)
    FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.register_event_with_capacity(UUID, UUID, TEXT)
    TO service_role;
