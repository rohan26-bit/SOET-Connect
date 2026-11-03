-- ==============================================================================
-- SOET CONNECT — ARCHIVE RETIRED ISSUE-REPORTING DATA
-- Migration: 006_archive_bug_reports.sql
-- Description:
--   Retires the issue-reporting table without deleting historical submissions.
--   The application API and UI have been removed. Existing records are renamed
--   to an archive table, all application-role access is revoked, and the
--   application update trigger and service-role policy are removed.
-- ==============================================================================

DO $$
BEGIN
    IF to_regclass('public.bug_reports') IS NOT NULL
       AND to_regclass('public.archived_bug_reports') IS NULL THEN
        ALTER TABLE public.bug_reports RENAME TO archived_bug_reports;
    END IF;
END
$$;

DO $$
BEGIN
    IF to_regclass('public.archived_bug_reports') IS NOT NULL THEN
        DROP TRIGGER IF EXISTS set_bug_reports_updated_at
            ON public.archived_bug_reports;

        DROP POLICY IF EXISTS service_role_all_bug_reports
            ON public.archived_bug_reports;

        ALTER TABLE public.archived_bug_reports ENABLE ROW LEVEL SECURITY;

        REVOKE ALL ON TABLE public.archived_bug_reports
            FROM PUBLIC, anon, authenticated, service_role;

        ALTER INDEX IF EXISTS public.idx_bug_reports_reporter
            RENAME TO idx_archived_bug_reports_reporter;

        ALTER INDEX IF EXISTS public.idx_bug_reports_status
            RENAME TO idx_archived_bug_reports_status;

        ALTER INDEX IF EXISTS public.idx_bug_reports_created
            RENAME TO idx_archived_bug_reports_created;
    END IF;
END
$$;
