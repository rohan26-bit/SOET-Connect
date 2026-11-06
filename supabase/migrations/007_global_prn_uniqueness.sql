-- =============================================================================
-- SOET CONNECT — GLOBAL PRN UNIQUENESS
-- Migration: 007_global_prn_uniqueness.sql
-- Description: A PRN can belong to exactly one student or alumni account.
--              Pending, rejected, and inactive accounts keep their PRN claim.
-- =============================================================================

-- Fail with an actionable message rather than silently choosing a duplicate
-- identity if legacy profile data already contains reused PRNs.
DO $$
DECLARE
    duplicate_prn TEXT;
BEGIN
    SELECT normalized_prn
      INTO duplicate_prn
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
     ORDER BY COUNT(*) DESC, normalized_prn
     LIMIT 1;

    IF duplicate_prn IS NOT NULL THEN
        RAISE EXCEPTION
          'Migration 007 cannot enforce PRN uniqueness yet. Resolve the existing duplicate PRN: %',
          duplicate_prn;
    END IF;
END;
$$;

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

-- Backfill all current students and alumni into the shared identity registry.
INSERT INTO public.prn_registry (normalized_prn, user_id, role)
SELECT UPPER(BTRIM(student_id)), user_id, 'student'
  FROM public.student_profiles
 WHERE NULLIF(BTRIM(student_id), '') IS NOT NULL
UNION ALL
SELECT UPPER(BTRIM(alumni_id)), user_id, 'alumni'
  FROM public.alumni_profiles
 WHERE NULLIF(BTRIM(alumni_id), '') IS NOT NULL;

-- Maintain the registry for new registrations and PRN edits.
CREATE OR REPLACE FUNCTION public.sync_student_prn_registry()
RETURNS TRIGGER
LANGUAGE plpgsql
AS $$
DECLARE
    normalized_value TEXT;
BEGIN
    IF TG_OP = 'DELETE' THEN
        DELETE FROM public.prn_registry WHERE user_id = OLD.user_id;
        RETURN OLD;
    END IF;

    IF TG_OP = 'UPDATE' THEN
        DELETE FROM public.prn_registry WHERE user_id = OLD.user_id;
    END IF;

    normalized_value := NULLIF(UPPER(BTRIM(NEW.student_id)), '');
    DELETE FROM public.prn_registry WHERE user_id = NEW.user_id;

    IF normalized_value IS NOT NULL THEN
        INSERT INTO public.prn_registry (normalized_prn, user_id, role)
        VALUES (normalized_value, NEW.user_id, 'student');
    END IF;

    RETURN NEW;
END;
$$;

CREATE OR REPLACE FUNCTION public.sync_alumni_prn_registry()
RETURNS TRIGGER
LANGUAGE plpgsql
AS $$
DECLARE
    normalized_value TEXT;
BEGIN
    IF TG_OP = 'DELETE' THEN
        DELETE FROM public.prn_registry WHERE user_id = OLD.user_id;
        RETURN OLD;
    END IF;

    IF TG_OP = 'UPDATE' THEN
        DELETE FROM public.prn_registry WHERE user_id = OLD.user_id;
    END IF;

    normalized_value := NULLIF(UPPER(BTRIM(NEW.alumni_id)), '');
    DELETE FROM public.prn_registry WHERE user_id = NEW.user_id;

    IF normalized_value IS NOT NULL THEN
        INSERT INTO public.prn_registry (normalized_prn, user_id, role)
        VALUES (normalized_value, NEW.user_id, 'alumni');
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
