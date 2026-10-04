-- ==============================================================================
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
