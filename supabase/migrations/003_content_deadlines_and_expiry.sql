-- ==============================================================================
-- SOET CONNECT — CONTENT DEADLINES AND EXPIRY SCHEMA MIGRATION
-- Migration: 003_content_deadlines_and_expiry.sql
-- Description: Adds deadline and expiration columns with indexes to jobs,
--              events, and announcements tables.
-- NOTE: Do not run automatically against live database. Apply in Supabase
--       dashboard SQL editor before deploying changes requiring these columns.
-- ==============================================================================

-- 1. Job postings and internships: application deadline
ALTER TABLE public.jobs 
ADD COLUMN IF NOT EXISTS application_deadline TIMESTAMPTZ NULL;

CREATE INDEX IF NOT EXISTS idx_jobs_application_deadline 
ON public.jobs(application_deadline);

-- 2. Events: registration deadline
ALTER TABLE public.events 
ADD COLUMN IF NOT EXISTS registration_deadline TIMESTAMPTZ NULL;

CREATE INDEX IF NOT EXISTS idx_events_registration_deadline 
ON public.events(registration_deadline);

-- 3. Announcements: expiration timestamp
ALTER TABLE public.announcements 
ADD COLUMN IF NOT EXISTS expires_at TIMESTAMPTZ NULL;

CREATE INDEX IF NOT EXISTS idx_announcements_expires_at 
ON public.announcements(expires_at);

