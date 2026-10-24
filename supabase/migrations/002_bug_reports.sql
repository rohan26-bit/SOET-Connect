-- ==============================================================================
-- SOET CONNECT — BUG & ISSUE REPORTS SCHEMA MIGRATION
-- Migration: 002_bug_reports.sql
-- Description: Creates relational table for Bug and Issue Reports with RLS
-- ==============================================================================

CREATE TABLE IF NOT EXISTS public.bug_reports (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    reporter_user_id UUID NOT NULL REFERENCES public.users(id) ON DELETE CASCADE,
    category VARCHAR(100) NOT NULL,
    severity VARCHAR(50) NOT NULL DEFAULT 'medium'
        CHECK (severity IN ('low', 'medium', 'high', 'critical')),
    subject VARCHAR(255) NOT NULL,
    description TEXT NOT NULL,
    page_route VARCHAR(255),
    reproduction_steps TEXT,
    status VARCHAR(50) NOT NULL DEFAULT 'open'
        CHECK (status IN ('open', 'in_review', 'resolved', 'closed')),
    admin_notes TEXT,
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_bug_reports_reporter ON public.bug_reports(reporter_user_id);
CREATE INDEX IF NOT EXISTS idx_bug_reports_status ON public.bug_reports(status);
CREATE INDEX IF NOT EXISTS idx_bug_reports_created ON public.bug_reports(created_at DESC);

CREATE TRIGGER set_bug_reports_updated_at
BEFORE UPDATE ON public.bug_reports
FOR EACH ROW EXECUTE FUNCTION update_updated_at_column();

-- Row Level Security
ALTER TABLE public.bug_reports ENABLE ROW LEVEL SECURITY;

-- Allow service_role key full unrestricted bypass access
CREATE POLICY service_role_all_bug_reports ON public.bug_reports FOR ALL TO service_role USING (true) WITH CHECK (true);
