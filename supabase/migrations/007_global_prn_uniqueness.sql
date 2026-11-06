-- =============================================================================
-- SOET CONNECT — GLOBAL PRN UNIQUENESS
-- Migration: 007_global_prn_uniqueness.sql
-- Description: Reserve every existing student/alumni PRN and reject all new
--              claims. Legacy duplicates are preserved until verified manually.
-- =============================================================================

-- Prevent profile writes while the registry is backfilled and triggers install.
LOCK TABLE public.student_profiles, public.alumni_profiles IN SHARE ROW EXCLUSIVE MODE;

CREATE TABLE IF NOT EXISTS public.prn_registry (
    normalized_prn TEXT PRIMARY KEY CHECK (normalized_prn <> ''),
    user_id UUID NOT NULL UNIQUE REFERENCES public.users(id) ON DELETE CASCADE,
    role VARCHAR(20) NOT NULL CHECK (role IN ('student', 'alumni')),
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

ALTER TABLE public.prn_registry ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS service_role_all_prn_registry ON public.prn_registry;
CREATE POLICY service_role_all_prn_registry
    ON public.prn_registry
    FOR ALL
    TO service_role
    USING (true)
    WITH CHECK (true);

GRANT ALL ON TABLE public.prn_registry TO service_role;

-- A registry row is a reservation for a PRN, not a declaration that its
-- user_id is the rightful owner when legacy data already contains duplicates.
-- Keep one stable reservation row per normalized PRN and preserve every
-- historical profile row unchanged.
INSERT INTO public.prn_registry (normalized_prn, user_id, role)
SELECT DISTINCT ON (normalized_prn)
       normalized_prn, user_id, role
FROM (
    SELECT UPPER(BTRIM(student_id)) AS normalized_prn,
           user_id, 'student'::VARCHAR(20) AS role, created_at
      FROM public.student_profiles
     WHERE NULLIF(BTRIM(student_id), '') IS NOT NULL
    UNION ALL
    SELECT UPPER(BTRIM(alumni_id)) AS normalized_prn,
           user_id, 'alumni'::VARCHAR(20) AS role, created_at
      FROM public.alumni_profiles
     WHERE NULLIF(BTRIM(alumni_id), '') IS NOT NULL
) AS claims
ORDER BY normalized_prn, created_at NULLS LAST, role, user_id
ON CONFLICT DO NOTHING;

-- Re-create a reservation from any remaining historical profile if the row
-- currently holding it is deleted or changes its PRN. This prevents an old
-- duplicate profile from accidentally freeing a PRN for a new registration.
CREATE OR REPLACE FUNCTION public.ensure_prn_registry_reservation(p_normalized_prn TEXT)
RETURNS VOID
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
    IF p_normalized_prn IS NULL OR p_normalized_prn = '' THEN
        RETURN;
    END IF;

    INSERT INTO public.prn_registry (normalized_prn, user_id, role)
    SELECT normalized_prn, user_id, role
    FROM (
        SELECT UPPER(BTRIM(student_id)) AS normalized_prn,
               user_id, 'student'::VARCHAR(20) AS role, created_at
          FROM public.student_profiles
         WHERE NULLIF(BTRIM(student_id), '') IS NOT NULL
        UNION ALL
        SELECT UPPER(BTRIM(alumni_id)) AS normalized_prn,
               user_id, 'alumni'::VARCHAR(20) AS role, created_at
          FROM public.alumni_profiles
         WHERE NULLIF(BTRIM(alumni_id), '') IS NOT NULL
    ) AS claims
    WHERE normalized_prn = p_normalized_prn
    ORDER BY created_at NULLS LAST, role, user_id
    LIMIT 1
    ON CONFLICT DO NOTHING;
END;
$$;

REVOKE ALL ON FUNCTION public.ensure_prn_registry_reservation(TEXT) FROM PUBLIC;
REVOKE ALL ON FUNCTION public.ensure_prn_registry_reservation(TEXT) FROM anon, authenticated;

-- A profile's ordinary field edits must not try to re-claim its PRN. Registry
-- writes happen only when the normalized PRN actually changes or a row is
-- inserted/deleted. The unique index serializes concurrent new claims.
CREATE OR REPLACE FUNCTION public.sync_student_prn_registry()
RETURNS TRIGGER
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
    old_normalized TEXT;
    new_normalized TEXT;
BEGIN
    IF TG_OP IN ('UPDATE', 'DELETE') THEN
        old_normalized := NULLIF(UPPER(BTRIM(OLD.student_id)), '');
    END IF;

    IF TG_OP = 'DELETE' THEN
        DELETE FROM public.prn_registry
         WHERE normalized_prn = old_normalized
           AND user_id = OLD.user_id;
        PERFORM public.ensure_prn_registry_reservation(old_normalized);
        RETURN OLD;
    END IF;

    new_normalized := NULLIF(UPPER(BTRIM(NEW.student_id)), '');

    IF TG_OP = 'INSERT' OR old_normalized IS DISTINCT FROM new_normalized THEN
        IF old_normalized IS NOT NULL THEN
            DELETE FROM public.prn_registry
             WHERE normalized_prn = old_normalized
               AND user_id = OLD.user_id;
            PERFORM public.ensure_prn_registry_reservation(old_normalized);
        END IF;

        IF new_normalized IS NOT NULL THEN
            INSERT INTO public.prn_registry (normalized_prn, user_id, role)
            VALUES (new_normalized, NEW.user_id, 'student');
        END IF;
    END IF;

    RETURN NEW;
END;
$$;

CREATE OR REPLACE FUNCTION public.sync_alumni_prn_registry()
RETURNS TRIGGER
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
    old_normalized TEXT;
    new_normalized TEXT;
BEGIN
    IF TG_OP IN ('UPDATE', 'DELETE') THEN
        old_normalized := NULLIF(UPPER(BTRIM(OLD.alumni_id)), '');
    END IF;

    IF TG_OP = 'DELETE' THEN
        DELETE FROM public.prn_registry
         WHERE normalized_prn = old_normalized
           AND user_id = OLD.user_id;
        PERFORM public.ensure_prn_registry_reservation(old_normalized);
        RETURN OLD;
    END IF;

    new_normalized := NULLIF(UPPER(BTRIM(NEW.alumni_id)), '');

    IF TG_OP = 'INSERT' OR old_normalized IS DISTINCT FROM new_normalized THEN
        IF old_normalized IS NOT NULL THEN
            DELETE FROM public.prn_registry
             WHERE normalized_prn = old_normalized
               AND user_id = OLD.user_id;
            PERFORM public.ensure_prn_registry_reservation(old_normalized);
        END IF;

        IF new_normalized IS NOT NULL THEN
            INSERT INTO public.prn_registry (normalized_prn, user_id, role)
            VALUES (new_normalized, NEW.user_id, 'alumni');
        END IF;
    END IF;

    RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS student_prn_registry_sync ON public.student_profiles;
CREATE TRIGGER student_prn_registry_sync
AFTER INSERT OR UPDATE OR DELETE ON public.student_profiles
FOR EACH ROW EXECUTE FUNCTION public.sync_student_prn_registry();

DROP TRIGGER IF EXISTS alumni_prn_registry_sync ON public.alumni_profiles;
CREATE TRIGGER alumni_prn_registry_sync
AFTER INSERT OR UPDATE OR DELETE ON public.alumni_profiles
FOR EACH ROW EXECUTE FUNCTION public.sync_alumni_prn_registry();

-- Report legacy conflicts without rejecting the migration. They remain
-- reserved and are not exposed to new registrations; manual reconciliation
-- can happen later without risking existing user records.
DO $$
DECLARE
    duplicate_values BIGINT;
BEGIN
    SELECT COUNT(*) INTO duplicate_values
    FROM (
        SELECT normalized_prn
        FROM (
            SELECT UPPER(BTRIM(student_id)) AS normalized_prn
              FROM public.student_profiles
             WHERE NULLIF(BTRIM(student_id), '') IS NOT NULL
            UNION ALL
            SELECT UPPER(BTRIM(alumni_id)) AS normalized_prn
              FROM public.alumni_profiles
             WHERE NULLIF(BTRIM(alumni_id), '') IS NOT NULL
        ) AS identifiers
        GROUP BY normalized_prn
        HAVING COUNT(*) > 1
    ) AS duplicate_ids;

    RAISE NOTICE 'PRN registry created. Existing duplicate PRN values retained and reserved: %', duplicate_values;
END;
$$;
