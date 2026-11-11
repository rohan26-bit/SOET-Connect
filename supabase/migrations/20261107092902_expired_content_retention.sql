-- Keep expired jobs and past events visible to administrators for 30 days,
-- then permanently remove them automatically. Related applications and event
-- registrations are removed by their existing ON DELETE CASCADE constraints.

CREATE EXTENSION IF NOT EXISTS pg_cron WITH SCHEMA pg_catalog;

GRANT USAGE ON SCHEMA cron TO postgres;
GRANT ALL PRIVILEGES ON ALL TABLES IN SCHEMA cron TO postgres;

CREATE OR REPLACE FUNCTION public.cleanup_expired_content()
RETURNS TABLE (deleted_jobs bigint, deleted_events bigint)
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = pg_catalog, public
AS $$
DECLARE
    v_deleted_jobs bigint := 0;
    v_deleted_events bigint := 0;
BEGIN
    DELETE FROM public.jobs
    WHERE application_deadline IS NOT NULL
      AND application_deadline <= statement_timestamp() - INTERVAL '30 days';

    GET DIAGNOSTICS v_deleted_jobs = ROW_COUNT;

    -- The event remains current for its full calendar date in Asia/Kolkata.
    -- Retention begins at midnight IST on the following day.
    DELETE FROM public.events
    WHERE ((date + 1)::timestamp AT TIME ZONE 'Asia/Kolkata')
          <= statement_timestamp() - INTERVAL '30 days';

    GET DIAGNOSTICS v_deleted_events = ROW_COUNT;

    RETURN QUERY SELECT v_deleted_jobs, v_deleted_events;
END;
$$;

-- This function is only invoked by the database-owned cron job.
REVOKE ALL ON FUNCTION public.cleanup_expired_content()
    FROM PUBLIC, anon, authenticated, service_role;

-- Make the migration safe to re-apply without creating duplicate schedules.
SELECT cron.unschedule(jobid)
FROM cron.job
WHERE jobname = 'cleanup-expired-jobs-events';

-- Run daily at 01:00 UTC. Records are removed only after their full 30-day
-- retention period has elapsed.
SELECT cron.schedule(
    'cleanup-expired-jobs-events',
    '0 1 * * *',
    'SELECT public.cleanup_expired_content();'
);

COMMENT ON FUNCTION public.cleanup_expired_content() IS
    'Permanently removes jobs 30 days after their application deadline and events 30 days after their event date (IST). Runs daily through Supabase Cron.';
