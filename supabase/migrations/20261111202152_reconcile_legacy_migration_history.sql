-- Reconcile legacy manually-applied baseline migrations and remove a proven duplicate.
-- 001-006 were applied before timestamped migration tracking; their resulting objects
-- were checked against production before recording these entries as already applied.

DO $reconcile$
DECLARE
  v_legacy_count integer;
BEGIN
  SELECT count(*) INTO v_legacy_count
    FROM supabase_migrations.schema_migrations
   WHERE version IN ('001','002','003','004','005','006');
  IF v_legacy_count <> 0 THEN
    RAISE EXCEPTION 'Expected no existing 001-006 baseline history rows; found %',v_legacy_count;
  END IF;

  IF NOT EXISTS (
    SELECT 1
      FROM supabase_migrations.schema_migrations canonical
      JOIN supabase_migrations.schema_migrations duplicate
        ON canonical.version='20261106200047'
       AND duplicate.version='20261106200307'
       AND canonical.name='chat_presence'
       AND duplicate.name='chat_presence'
       AND canonical.statements=duplicate.statements
  ) THEN
    RAISE EXCEPTION 'Expected exact duplicate chat_presence migration rows were not found; refusing ledger cleanup';
  END IF;
END
$reconcile$;


INSERT INTO supabase_migrations.schema_migrations(version,name,statements)
VALUES
('001','initial_schema', ARRAY[$baseline_001$-- ==============================================================================
-- SOET CONNECT — SUPABASE POSTGRESQL INITIAL SCHEMA MIGRATION
-- Migration: 001_initial_schema.sql
-- Description: Creates relational tables for Users, Profiles, Jobs, Events,
--              Chat, Notifications, Announcements, and Achievements.
-- ==============================================================================

-- Enable UUID extension if not already enabled
CREATE EXTENSION IF NOT EXISTS "uuid-ossp";
CREATE EXTENSION IF NOT EXISTS "pgcrypto";

-- ==============================================================================
-- 1. HELPER FUNCTIONS
-- ==============================================================================

-- Auto-update updated_at timestamp trigger function
CREATE OR REPLACE FUNCTION update_updated_at_column()
RETURNS TRIGGER AS $$
BEGIN
    NEW.updated_at = NOW();
    RETURN NEW;
END;
$$ LANGUAGE plpgsql;

-- ==============================================================================
-- 2. USERS TABLE (Core Identity & Auth)
-- ==============================================================================
CREATE TABLE IF NOT EXISTS public.users (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    legacy_mongo_id VARCHAR(36), -- Preserves original 24-hex MongoDB _id for data continuity
    name VARCHAR(255) NOT NULL,
    email VARCHAR(255) UNIQUE NOT NULL,
    password_hash TEXT NOT NULL,
    role VARCHAR(50) NOT NULL CHECK (role IN ('student', 'alumni', 'admin')),
    avatar_url TEXT,
    is_active BOOLEAN NOT NULL DEFAULT true,
    is_verified BOOLEAN NOT NULL DEFAULT false,
    verification_status VARCHAR(50) NOT NULL DEFAULT 'pending' 
        CHECK (verification_status IN ('approved', 'pending', 'rejected', 'suspended')),
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_users_email ON public.users(email);
CREATE INDEX IF NOT EXISTS idx_users_role ON public.users(role);
CREATE INDEX IF NOT EXISTS idx_users_legacy_id ON public.users(legacy_mongo_id);

CREATE TRIGGER set_users_updated_at
BEFORE UPDATE ON public.users
FOR EACH ROW EXECUTE FUNCTION update_updated_at_column();

-- ==============================================================================
-- 3. STUDENT PROFILES (1-to-1 with Users)
-- ==============================================================================
CREATE TABLE IF NOT EXISTS public.student_profiles (
    user_id UUID PRIMARY KEY REFERENCES public.users(id) ON DELETE CASCADE,
    student_id VARCHAR(100),
    department VARCHAR(150),
    course VARCHAR(150),
    academic_year VARCHAR(50),
    graduation_year VARCHAR(50),
    phone VARCHAR(50),
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE TRIGGER set_student_profiles_updated_at
BEFORE UPDATE ON public.student_profiles
FOR EACH ROW EXECUTE FUNCTION update_updated_at_column();

-- ==============================================================================
-- 4. ALUMNI PROFILES (1-to-1 with Users)
-- ==============================================================================
CREATE TABLE IF NOT EXISTS public.alumni_profiles (
    user_id UUID PRIMARY KEY REFERENCES public.users(id) ON DELETE CASCADE,
    alumni_id VARCHAR(100),
    department VARCHAR(150),
    degree VARCHAR(150),
    graduation_year VARCHAR(50),
    company VARCHAR(200),
    designation VARCHAR(200),
    industry VARCHAR(150),
    location VARCHAR(200),
    skills JSONB NOT NULL DEFAULT '[]'::jsonb,
    linkedin TEXT,
    github TEXT,
    website TEXT,
    bio TEXT,
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_alumni_profiles_dept ON public.alumni_profiles(department);
CREATE INDEX IF NOT EXISTS idx_alumni_profiles_company ON public.alumni_profiles(company);

CREATE TRIGGER set_alumni_profiles_updated_at
BEFORE UPDATE ON public.alumni_profiles
FOR EACH ROW EXECUTE FUNCTION update_updated_at_column();

-- ==============================================================================
-- 5. JOBS TABLE (Replaces jobs_data.json)
-- ==============================================================================
CREATE TABLE IF NOT EXISTS public.jobs (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    posted_by UUID REFERENCES public.users(id) ON DELETE SET NULL,
    title VARCHAR(255) NOT NULL,
    company VARCHAR(255) NOT NULL,
    location VARCHAR(255) NOT NULL,
    job_type VARCHAR(100) NOT NULL,
    experience_level VARCHAR(100),
    salary_range VARCHAR(100),
    description TEXT NOT NULL,
    requirements TEXT,
    skills JSONB NOT NULL DEFAULT '[]'::jsonb,
    status VARCHAR(50) NOT NULL DEFAULT 'pending' 
        CHECK (status IN ('pending', 'approved', 'rejected', 'closed')),
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_jobs_status ON public.jobs(status);
CREATE INDEX IF NOT EXISTS idx_jobs_posted_by ON public.jobs(posted_by);

CREATE TRIGGER set_jobs_updated_at
BEFORE UPDATE ON public.jobs
FOR EACH ROW EXECUTE FUNCTION update_updated_at_column();

-- ==============================================================================
-- 6. JOB APPLICATIONS TABLE (Replaces applications_data.json)
-- ==============================================================================
CREATE TABLE IF NOT EXISTS public.job_applications (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    job_id UUID NOT NULL REFERENCES public.jobs(id) ON DELETE CASCADE,
    applicant_id UUID NOT NULL REFERENCES public.users(id) ON DELETE CASCADE,
    status VARCHAR(50) NOT NULL DEFAULT 'submitted' 
        CHECK (status IN ('submitted', 'under_review', 'accepted', 'rejected')),
    resume_url TEXT,
    cover_letter TEXT,
    applied_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    CONSTRAINT unique_job_application UNIQUE (job_id, applicant_id)
);

CREATE INDEX IF NOT EXISTS idx_job_applications_job ON public.job_applications(job_id);
CREATE INDEX IF NOT EXISTS idx_job_applications_applicant ON public.job_applications(applicant_id);

CREATE TRIGGER set_job_applications_updated_at
BEFORE UPDATE ON public.job_applications
FOR EACH ROW EXECUTE FUNCTION update_updated_at_column();

-- ==============================================================================
-- 7. EVENTS TABLE (Replaces events_data.json)
-- ==============================================================================
CREATE TABLE IF NOT EXISTS public.events (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    created_by UUID REFERENCES public.users(id) ON DELETE SET NULL,
    title VARCHAR(255) NOT NULL,
    description TEXT NOT NULL,
    event_type VARCHAR(100) NOT NULL,
    date DATE NOT NULL,
    time VARCHAR(50) NOT NULL,
    location VARCHAR(255) NOT NULL,
    virtual_link TEXT,
    capacity INTEGER DEFAULT 100,
    status VARCHAR(50) NOT NULL DEFAULT 'pending' 
        CHECK (status IN ('pending', 'approved', 'rejected', 'completed', 'cancelled')),
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_events_status ON public.events(status);
CREATE INDEX IF NOT EXISTS idx_events_date ON public.events(date);

CREATE TRIGGER set_events_updated_at
BEFORE UPDATE ON public.events
FOR EACH ROW EXECUTE FUNCTION update_updated_at_column();

-- ==============================================================================
-- 8. EVENT REGISTRATIONS TABLE (Replaces event_registrations_data.json)
-- ==============================================================================
CREATE TABLE IF NOT EXISTS public.event_registrations (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    event_id UUID NOT NULL REFERENCES public.events(id) ON DELETE CASCADE,
    user_id UUID NOT NULL REFERENCES public.users(id) ON DELETE CASCADE,
    status VARCHAR(50) NOT NULL DEFAULT 'registered' 
        CHECK (status IN ('registered', 'attended', 'cancelled')),
    registered_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    CONSTRAINT unique_event_registration UNIQUE (event_id, user_id)
);

CREATE INDEX IF NOT EXISTS idx_event_reg_event ON public.event_registrations(event_id);
CREATE INDEX IF NOT EXISTS idx_event_reg_user ON public.event_registrations(user_id);

-- ==============================================================================
-- 9. ANNOUNCEMENTS TABLE (Replaces announcements_data.json)
-- ==============================================================================
CREATE TABLE IF NOT EXISTS public.announcements (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    author_id UUID REFERENCES public.users(id) ON DELETE SET NULL,
    title VARCHAR(255) NOT NULL,
    content TEXT NOT NULL,
    target_audience VARCHAR(50) NOT NULL DEFAULT 'all' 
        CHECK (target_audience IN ('all', 'students', 'alumni')),
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_announcements_audience ON public.announcements(target_audience);

CREATE TRIGGER set_announcements_updated_at
BEFORE UPDATE ON public.announcements
FOR EACH ROW EXECUTE FUNCTION update_updated_at_column();

-- ==============================================================================
-- 10. NOTIFICATIONS TABLE (Replaces notifications_data.json)
-- ==============================================================================
CREATE TABLE IF NOT EXISTS public.notifications (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    user_id UUID NOT NULL REFERENCES public.users(id) ON DELETE CASCADE,
    title VARCHAR(255) NOT NULL,
    message TEXT NOT NULL,
    type VARCHAR(100),
    entity_type VARCHAR(100),
    entity_id VARCHAR(100),
    dedupe_key VARCHAR(255) UNIQUE,
    is_read BOOLEAN NOT NULL DEFAULT false,
    read_at TIMESTAMPTZ,
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_notifications_user_unread ON public.notifications(user_id, is_read);
CREATE INDEX IF NOT EXISTS idx_notifications_dedupe ON public.notifications(dedupe_key);

-- ==============================================================================
-- 11. CONVERSATIONS & CHAT (Replaces MongoDB conversations and messages)
-- ==============================================================================
CREATE TABLE IF NOT EXISTS public.conversations (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    canonical_key VARCHAR(100) UNIQUE NOT NULL,
    hidden_for JSONB NOT NULL DEFAULT '[]'::jsonb,
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_conversations_key ON public.conversations(canonical_key);

CREATE TRIGGER set_conversations_updated_at
BEFORE UPDATE ON public.conversations
FOR EACH ROW EXECUTE FUNCTION update_updated_at_column();

CREATE TABLE IF NOT EXISTS public.conversation_participants (
    conversation_id UUID NOT NULL REFERENCES public.conversations(id) ON DELETE CASCADE,
    user_id UUID NOT NULL REFERENCES public.users(id) ON DELETE CASCADE,
    PRIMARY KEY (conversation_id, user_id)
);

CREATE INDEX IF NOT EXISTS idx_conv_part_user ON public.conversation_participants(user_id);

CREATE TABLE IF NOT EXISTS public.messages (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    conversation_id UUID NOT NULL REFERENCES public.conversations(id) ON DELETE CASCADE,
    sender_id UUID NOT NULL REFERENCES public.users(id) ON DELETE CASCADE,
    content TEXT NOT NULL,
    is_read BOOLEAN NOT NULL DEFAULT false,
    read_at TIMESTAMPTZ,
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_messages_conv_created ON public.messages(conversation_id, created_at ASC);
CREATE INDEX IF NOT EXISTS idx_messages_sender ON public.messages(sender_id);

-- ==============================================================================
-- 12. ACHIEVEMENTS TABLE (Provisions backend for achievementService.ts)
-- ==============================================================================
CREATE TABLE IF NOT EXISTS public.achievements (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    user_id UUID NOT NULL REFERENCES public.users(id) ON DELETE CASCADE,
    title VARCHAR(255) NOT NULL,
    description TEXT NOT NULL,
    category VARCHAR(100) NOT NULL 
        CHECK (category IN ('award', 'certification', 'honor', 'project', 'publication', 'patent', 'other')),
    achievement_date DATE NOT NULL,
    issuing_organization VARCHAR(255) NOT NULL,
    credential_name VARCHAR(255),
    credential_url TEXT,
    image_url TEXT,
    visibility VARCHAR(50) NOT NULL DEFAULT 'public' 
        CHECK (visibility IN ('public', 'private', 'alumni_only')),
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_achievements_user ON public.achievements(user_id);
CREATE INDEX IF NOT EXISTS idx_achievements_category ON public.achievements(category);

CREATE TRIGGER set_achievements_updated_at
BEFORE UPDATE ON public.achievements
FOR EACH ROW EXECUTE FUNCTION update_updated_at_column();

-- ==============================================================================
-- 13. ROW LEVEL SECURITY (RLS) POLICIES
-- ==============================================================================
ALTER TABLE public.users ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.student_profiles ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.alumni_profiles ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.jobs ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.job_applications ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.events ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.event_registrations ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.announcements ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.notifications ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.conversations ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.conversation_participants ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.messages ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.achievements ENABLE ROW LEVEL SECURITY;

-- Allow service_role key full unrestricted bypass access
CREATE POLICY service_role_all_users ON public.users FOR ALL TO service_role USING (true) WITH CHECK (true);
CREATE POLICY service_role_all_student_profiles ON public.student_profiles FOR ALL TO service_role USING (true) WITH CHECK (true);
CREATE POLICY service_role_all_alumni_profiles ON public.alumni_profiles FOR ALL TO service_role USING (true) WITH CHECK (true);
CREATE POLICY service_role_all_jobs ON public.jobs FOR ALL TO service_role USING (true) WITH CHECK (true);
CREATE POLICY service_role_all_job_applications ON public.job_applications FOR ALL TO service_role USING (true) WITH CHECK (true);
CREATE POLICY service_role_all_events ON public.events FOR ALL TO service_role USING (true) WITH CHECK (true);
CREATE POLICY service_role_all_event_registrations ON public.event_registrations FOR ALL TO service_role USING (true) WITH CHECK (true);
CREATE POLICY service_role_all_announcements ON public.announcements FOR ALL TO service_role USING (true) WITH CHECK (true);
CREATE POLICY service_role_all_notifications ON public.notifications FOR ALL TO service_role USING (true) WITH CHECK (true);
CREATE POLICY service_role_all_conversations ON public.conversations FOR ALL TO service_role USING (true) WITH CHECK (true);
CREATE POLICY service_role_all_conversation_participants ON public.conversation_participants FOR ALL TO service_role USING (true) WITH CHECK (true);
CREATE POLICY service_role_all_messages ON public.messages FOR ALL TO service_role USING (true) WITH CHECK (true);
CREATE POLICY service_role_all_achievements ON public.achievements FOR ALL TO service_role USING (true) WITH CHECK (true);
$baseline_001$]::text[]),
('002','bug_reports', ARRAY[$baseline_002$-- ==============================================================================
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
$baseline_002$]::text[]),
('003','content_deadlines_and_expiry', ARRAY[$baseline_003$-- ==============================================================================
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

$baseline_003$]::text[]),
('004','gallery_notifications_password_recovery', ARRAY[$baseline_004$-- ==============================================================================
-- SOET CONNECT â€” GALLERY, NOTIFICATIONS & PASSWORD RECOVERY SCHEMA MIGRATION
-- Migration: 004_gallery_notifications_password_recovery.sql
-- Description: Adds tables and columns for Alumni Photo Gallery,
--              Email/SMS Notification Preferences & Deliveries, and
--              Secure Password Recovery & Phone Verification.
-- NOTE: Do not run automatically against live database. Apply in Supabase
--       dashboard SQL editor before deploying changes requiring these tables.
-- ==============================================================================

-- 1. USERS TABLE ENHANCEMENTS: Phone and Phone Verification Status
ALTER TABLE public.users
ADD COLUMN IF NOT EXISTS phone VARCHAR(50);

ALTER TABLE public.users
ADD COLUMN IF NOT EXISTS is_phone_verified BOOLEAN NOT NULL DEFAULT false;

-- Backfill phone on users from existing student_profiles if present (safely preserving records without auto-verifying)
UPDATE public.users u
SET phone = trim(sp.phone)
FROM public.student_profiles sp
WHERE u.id = sp.user_id
  AND (u.phone IS NULL OR trim(u.phone) = '')
  AND sp.phone IS NOT NULL
  AND trim(sp.phone) <> '';

CREATE INDEX IF NOT EXISTS idx_users_phone ON public.users(phone);

-- ==============================================================================
-- 2. GALLERY PHOTOS TABLE
-- ==============================================================================
CREATE TABLE IF NOT EXISTS public.gallery_photos (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    uploader_id UUID NOT NULL REFERENCES public.users(id) ON DELETE CASCADE,
    title VARCHAR(255),
    caption TEXT,
    category VARCHAR(50) DEFAULT 'campus',
    event_name VARCHAR(255),
    batch_year VARCHAR(50),
    original_path TEXT NOT NULL,
    display_path TEXT NOT NULL,
    mime_type VARCHAR(100) NOT NULL,
    file_size INTEGER NOT NULL,
    status VARCHAR(50) NOT NULL DEFAULT 'pending'
        CHECK (status IN ('pending', 'approved', 'rejected')),
    reviewed_by UUID REFERENCES public.users(id) ON DELETE SET NULL,
    reviewed_at TIMESTAMPTZ,
    rejection_reason TEXT,
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_gallery_photos_status ON public.gallery_photos(status);
CREATE INDEX IF NOT EXISTS idx_gallery_photos_uploader ON public.gallery_photos(uploader_id);
CREATE INDEX IF NOT EXISTS idx_gallery_photos_category ON public.gallery_photos(category);
CREATE INDEX IF NOT EXISTS idx_gallery_photos_created ON public.gallery_photos(created_at DESC);

-- ==============================================================================
-- 3. NOTIFICATION PREFERENCES TABLE
-- ==============================================================================
CREATE TABLE IF NOT EXISTS public.notification_preferences (
    user_id UUID PRIMARY KEY REFERENCES public.users(id) ON DELETE CASCADE,
    in_app_enabled BOOLEAN NOT NULL DEFAULT true,
    email_enabled BOOLEAN NOT NULL DEFAULT true,
    sms_enabled BOOLEAN NOT NULL DEFAULT false,
    notify_jobs BOOLEAN NOT NULL DEFAULT true,
    notify_events BOOLEAN NOT NULL DEFAULT true,
    notify_announcements BOOLEAN NOT NULL DEFAULT true,
    notify_applications BOOLEAN NOT NULL DEFAULT true,
    notify_gallery BOOLEAN NOT NULL DEFAULT true,
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- ==============================================================================
-- 4. NOTIFICATION DELIVERIES TABLE (Tracks Email / SMS dispatch status)
-- ==============================================================================
CREATE TABLE IF NOT EXISTS public.notification_deliveries (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    notification_id UUID REFERENCES public.notifications(id) ON DELETE SET NULL,
    user_id UUID NOT NULL REFERENCES public.users(id) ON DELETE CASCADE,
    channel VARCHAR(20) NOT NULL CHECK (channel IN ('email', 'sms', 'in_app')),
    recipient VARCHAR(255) NOT NULL,
    event_type VARCHAR(100),
    status VARCHAR(50) NOT NULL CHECK (status IN ('accepted', 'sent', 'delivered', 'failed', 'skipped', 'pending')),
    provider VARCHAR(50),
    provider_message_id VARCHAR(255),
    error_message TEXT,
    attempts INTEGER NOT NULL DEFAULT 1,
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_notif_deliveries_user ON public.notification_deliveries(user_id);
CREATE INDEX IF NOT EXISTS idx_notif_deliveries_status ON public.notification_deliveries(status);
CREATE INDEX IF NOT EXISTS idx_notif_deliveries_lookup ON public.notification_deliveries(notification_id, channel);

-- ==============================================================================
-- 5. PASSWORD RESET CHALLENGES TABLE (Hashed single-use codes)
-- ==============================================================================
CREATE TABLE IF NOT EXISTS public.password_reset_challenges (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    user_id UUID NOT NULL REFERENCES public.users(id) ON DELETE CASCADE,
    channel VARCHAR(20) NOT NULL CHECK (channel IN ('email', 'sms')),
    recipient VARCHAR(255) NOT NULL,
    code_hash TEXT NOT NULL,
    token_hash TEXT,
    attempts INTEGER NOT NULL DEFAULT 0,
    max_attempts INTEGER NOT NULL DEFAULT 5,
    is_used BOOLEAN NOT NULL DEFAULT false,
    used_at TIMESTAMPTZ,
    expires_at TIMESTAMPTZ NOT NULL,
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_pwd_reset_user ON public.password_reset_challenges(user_id);
CREATE INDEX IF NOT EXISTS idx_pwd_reset_expires ON public.password_reset_challenges(expires_at);

-- ==============================================================================
-- 6. PHONE VERIFICATION CODES TABLE
-- ==============================================================================
CREATE TABLE IF NOT EXISTS public.phone_verification_codes (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    user_id UUID NOT NULL REFERENCES public.users(id) ON DELETE CASCADE,
    phone VARCHAR(50) NOT NULL,
    code_hash TEXT NOT NULL,
    attempts INTEGER NOT NULL DEFAULT 0,
    is_used BOOLEAN NOT NULL DEFAULT false,
    expires_at TIMESTAMPTZ NOT NULL,
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_phone_verify_user ON public.phone_verification_codes(user_id);

-- ==============================================================================
-- 7. ROW LEVEL SECURITY (RLS) POLICIES
-- ==============================================================================
ALTER TABLE public.gallery_photos ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.notification_preferences ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.notification_deliveries ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.password_reset_challenges ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.phone_verification_codes ENABLE ROW LEVEL SECURITY;

CREATE POLICY service_role_all_gallery ON public.gallery_photos FOR ALL TO service_role USING (true) WITH CHECK (true);
CREATE POLICY service_role_all_notif_prefs ON public.notification_preferences FOR ALL TO service_role USING (true) WITH CHECK (true);
CREATE POLICY service_role_all_notif_deliv ON public.notification_deliveries FOR ALL TO service_role USING (true) WITH CHECK (true);
CREATE POLICY service_role_all_pwd_reset ON public.password_reset_challenges FOR ALL TO service_role USING (true) WITH CHECK (true);
CREATE POLICY service_role_all_phone_verify ON public.phone_verification_codes FOR ALL TO service_role USING (true) WITH CHECK (true);

-- ==============================================================================
-- 8. SUPABASE STORAGE: PRIVATE BUCKET CREATION & STORAGE RLS POLICIES
-- ==============================================================================

-- 8a. Create the alumni-portal-gallery bucket as strictly PRIVATE
INSERT INTO storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
VALUES (
    'alumni-portal-gallery',
    'alumni-portal-gallery',
    false, -- Strictly PRIVATE: direct unauthenticated public CDN downloads are blocked
    8388608, -- 8 MB maximum file size limit
    ARRAY['image/jpeg', 'image/png', 'image/webp']
)
ON CONFLICT (id) DO UPDATE SET
    public = false,
    file_size_limit = 8388608,
    allowed_mime_types = ARRAY['image/jpeg', 'image/png', 'image/webp'];

-- 8b. Row Level Security is active by default on storage.objects in Supabase
-- (Verified relrowsecurity = true; avoiding 42501 non-owner table alter)

-- 8c. Service Role has full management rights (used by backend API for uploads, watermarking & deletion)
DROP POLICY IF EXISTS "Service role full access on alumni gallery storage" ON storage.objects;
CREATE POLICY "Service role full access on alumni gallery storage"
ON storage.objects FOR ALL
TO service_role
USING (bucket_id = 'alumni-portal-gallery')
WITH CHECK (bucket_id = 'alumni-portal-gallery');

-- 8d. Strictly block direct client access to full-resolution unwatermarked originals
--     Only approved watermarked display derivatives can be read via storage
DROP POLICY IF EXISTS "Deny direct client access to originals" ON storage.objects;
CREATE POLICY "Deny direct client access to originals"
ON storage.objects FOR SELECT
TO public
USING (
    bucket_id = 'alumni-portal-gallery'
    AND (storage.foldername(name))[1] = 'display'
    AND EXISTS (
        SELECT 1 FROM public.gallery_photos gp
        WHERE gp.display_path = storage.objects.name
          AND gp.status = 'approved'
    )
);
$baseline_004$]::text[]),
('005','placement_celebrations', ARRAY[$baseline_005$-- =============================================================================
-- SOET CONNECT — PLACEMENT CELEBRATIONS
-- Public homepage placement bulletin. All writes are performed by the FastAPI
-- service using the Supabase service role; clients never write to this table.
-- =============================================================================

CREATE TABLE IF NOT EXISTS public.placement_celebrations (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    alumni_name VARCHAR(255) NOT NULL,
    company_name VARCHAR(255) NOT NULL,
    designation VARCHAR(255),
    department VARCHAR(160),
    batch_year VARCHAR(20),
    photo_url TEXT,
    photo_consent BOOLEAN NOT NULL DEFAULT false,
    message TEXT,
    is_published BOOLEAN NOT NULL DEFAULT false,
    created_by UUID REFERENCES public.users(id) ON DELETE SET NULL,
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    CONSTRAINT placement_photo_consent_required
        CHECK (is_published = false OR photo_consent = true)
);

CREATE INDEX IF NOT EXISTS idx_placement_celebrations_published
    ON public.placement_celebrations (is_published, created_at DESC);

ALTER TABLE public.placement_celebrations ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS service_role_all_placement_celebrations
    ON public.placement_celebrations;

CREATE POLICY service_role_all_placement_celebrations
    ON public.placement_celebrations
    FOR ALL
    TO service_role
    USING (true)
    WITH CHECK (true);
$baseline_005$]::text[]),
('006','archive_bug_reports', ARRAY[$baseline_006$-- ==============================================================================
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
$baseline_006$]::text[])
ON CONFLICT (version) DO NOTHING;


DELETE FROM supabase_migrations.schema_migrations AS duplicate
USING supabase_migrations.schema_migrations AS canonical
WHERE canonical.version='20261106200047'
  AND canonical.name='chat_presence'
  AND duplicate.version='20261106200307'
  AND duplicate.name='chat_presence'
  AND duplicate.statements=canonical.statements;

