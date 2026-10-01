-- ==============================================================================
-- SOET ALUMNI PORTAL - SUPABASE POSTGRESQL SCHEMA & SECURITY RULES
-- Run this script in your Supabase SQL Editor (SQL Editor -> New query -> Run)
-- ==============================================================================

-- 1. Enable UUID Extension
CREATE EXTENSION IF NOT EXISTS "uuid-ossp";

-- 2. Create Custom Types & Enums
DO $$ BEGIN
    CREATE TYPE user_role AS ENUM ('student', 'alumni', 'admin');
EXCEPTION
    WHEN duplicate_object THEN null;
END $$;

DO $$ BEGIN
    CREATE TYPE alumni_verification_status AS ENUM ('pending', 'approved', 'rejected', 'suspended');
EXCEPTION
    WHEN duplicate_object THEN null;
END $$;

DO $$ BEGIN
    CREATE TYPE job_status AS ENUM ('pending', 'approved', 'rejected');
EXCEPTION
    WHEN duplicate_object THEN null;
END $$;

DO $$ BEGIN
    CREATE TYPE application_status AS ENUM ('applied', 'under_review', 'shortlisted', 'interview', 'selected', 'rejected');
EXCEPTION
    WHEN duplicate_object THEN null;
END $$;

DO $$ BEGIN
    CREATE TYPE event_status AS ENUM ('pending', 'approved', 'rejected', 'cancelled');
EXCEPTION
    WHEN duplicate_object THEN null;
END $$;

DO $$ BEGIN
    CREATE TYPE target_audience AS ENUM ('all', 'students', 'alumni');
EXCEPTION
    WHEN duplicate_object THEN null;
END $$;

-- ==============================================================================
-- 3. TABLES
-- ==============================================================================

-- PROFILES (Linked to auth.users)
CREATE TABLE IF NOT EXISTS public.profiles (
    id UUID PRIMARY KEY REFERENCES auth.users(id) ON DELETE CASCADE,
    email TEXT NOT NULL,
    role user_role NOT NULL,
    full_name TEXT NOT NULL,
    avatar_url TEXT,
    is_active BOOLEAN DEFAULT true,
    created_at TIMESTAMPTZ DEFAULT NOW(),
    updated_at TIMESTAMPTZ DEFAULT NOW()
);

-- STUDENT PROFILES
CREATE TABLE IF NOT EXISTS public.student_profiles (
    id UUID PRIMARY KEY REFERENCES public.profiles(id) ON DELETE CASCADE,
    student_id TEXT,
    department TEXT NOT NULL,
    course TEXT,
    academic_year TEXT,
    graduation_year TEXT,
    phone TEXT,
    created_at TIMESTAMPTZ DEFAULT NOW(),
    updated_at TIMESTAMPTZ DEFAULT NOW()
);

-- ALUMNI PROFILES
CREATE TABLE IF NOT EXISTS public.alumni_profiles (
    id UUID PRIMARY KEY REFERENCES public.profiles(id) ON DELETE CASCADE,
    alumni_id TEXT,
    department TEXT NOT NULL,
    degree TEXT,
    graduation_year TEXT NOT NULL,
    company TEXT,
    designation TEXT,
    industry TEXT,
    location TEXT,
    skills TEXT[] DEFAULT '{}',
    linkedin TEXT,
    github TEXT,
    website TEXT,
    bio TEXT,
    verification_status alumni_verification_status DEFAULT 'pending',
    created_at TIMESTAMPTZ DEFAULT NOW(),
    updated_at TIMESTAMPTZ DEFAULT NOW()
);

-- JOBS & INTERNSHIPS
CREATE TABLE IF NOT EXISTS public.jobs (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    posted_by UUID NOT NULL REFERENCES public.profiles(id) ON DELETE CASCADE,
    title TEXT NOT NULL,
    company TEXT NOT NULL,
    description TEXT NOT NULL,
    location TEXT NOT NULL,
    employment_type TEXT NOT NULL, -- Full-time, Part-time, Internship, Remote
    experience TEXT,
    salary TEXT,
    skills TEXT[] DEFAULT '{}',
    application_url TEXT,
    deadline DATE,
    status job_status DEFAULT 'pending',
    created_at TIMESTAMPTZ DEFAULT NOW(),
    updated_at TIMESTAMPTZ DEFAULT NOW()
);

-- JOB APPLICATIONS
CREATE TABLE IF NOT EXISTS public.job_applications (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    job_id UUID NOT NULL REFERENCES public.jobs(id) ON DELETE CASCADE,
    student_id UUID NOT NULL REFERENCES public.profiles(id) ON DELETE CASCADE,
    resume_url TEXT,
    cover_letter TEXT,
    status application_status DEFAULT 'applied',
    created_at TIMESTAMPTZ DEFAULT NOW(),
    updated_at TIMESTAMPTZ DEFAULT NOW(),
    CONSTRAINT unique_job_student UNIQUE (job_id, student_id)
);

-- EVENTS
CREATE TABLE IF NOT EXISTS public.events (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    created_by UUID NOT NULL REFERENCES public.profiles(id) ON DELETE CASCADE,
    title TEXT NOT NULL,
    description TEXT NOT NULL,
    event_date DATE NOT NULL,
    start_time TIME,
    end_time TIME,
    location TEXT NOT NULL,
    image_url TEXT,
    registration_deadline TIMESTAMPTZ,
    status event_status DEFAULT 'pending',
    created_at TIMESTAMPTZ DEFAULT NOW(),
    updated_at TIMESTAMPTZ DEFAULT NOW()
);

-- EVENT REGISTRATIONS
CREATE TABLE IF NOT EXISTS public.event_registrations (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    event_id UUID NOT NULL REFERENCES public.events(id) ON DELETE CASCADE,
    user_id UUID NOT NULL REFERENCES public.profiles(id) ON DELETE CASCADE,
    created_at TIMESTAMPTZ DEFAULT NOW(),
    CONSTRAINT unique_event_user UNIQUE (event_id, user_id)
);

-- ANNOUNCEMENTS
CREATE TABLE IF NOT EXISTS public.announcements (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    created_by UUID NOT NULL REFERENCES public.profiles(id) ON DELETE CASCADE,
    title TEXT NOT NULL,
    content TEXT NOT NULL,
    target_audience target_audience DEFAULT 'all',
    is_published BOOLEAN DEFAULT true,
    created_at TIMESTAMPTZ DEFAULT NOW(),
    updated_at TIMESTAMPTZ DEFAULT NOW()
);

-- NOTIFICATIONS
CREATE TABLE IF NOT EXISTS public.notifications (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    user_id UUID NOT NULL REFERENCES public.profiles(id) ON DELETE CASCADE,
    title TEXT NOT NULL,
    message TEXT NOT NULL,
    type TEXT,
    link TEXT,
    is_read BOOLEAN DEFAULT false,
    created_at TIMESTAMPTZ DEFAULT NOW()
);

-- REPORTS (For admin review)
CREATE TABLE IF NOT EXISTS public.reports (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    reported_by UUID NOT NULL REFERENCES public.profiles(id) ON DELETE CASCADE,
    type TEXT NOT NULL, -- user, job, event
    target_id UUID NOT NULL,
    reason TEXT NOT NULL,
    status TEXT DEFAULT 'pending',
    created_at TIMESTAMPTZ DEFAULT NOW()
);

-- ==============================================================================
-- 4. HELPER SECURITY FUNCTIONS
-- ==============================================================================

-- Check if authenticated user is an admin
CREATE OR REPLACE FUNCTION public.is_admin()
RETURNS BOOLEAN AS $$
BEGIN
  RETURN EXISTS (
    SELECT 1 FROM public.profiles
    WHERE id = auth.uid() AND role = 'admin'
  );
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

-- Check if authenticated user is a verified alumni
CREATE OR REPLACE FUNCTION public.is_verified_alumni()
RETURNS BOOLEAN AS $$
BEGIN
  RETURN EXISTS (
    SELECT 1 FROM public.alumni_profiles
    WHERE id = auth.uid() AND verification_status = 'approved'
  );
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

-- Get current user role
CREATE OR REPLACE FUNCTION public.current_user_role()
RETURNS user_role AS $$
DECLARE
  u_role user_role;
BEGIN
  SELECT role INTO u_role FROM public.profiles WHERE id = auth.uid();
  RETURN u_role;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

-- ==============================================================================
-- 5. ROW LEVEL SECURITY (RLS) POLICIES
-- ==============================================================================

ALTER TABLE public.profiles ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.student_profiles ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.alumni_profiles ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.jobs ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.job_applications ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.events ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.event_registrations ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.announcements ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.notifications ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.reports ENABLE ROW LEVEL SECURITY;

-- PROFILES POLICIES
DROP POLICY IF EXISTS "Public profiles are viewable by everyone" ON public.profiles;
CREATE POLICY "Public profiles are viewable by everyone"
ON public.profiles FOR SELECT
USING (true);

DROP POLICY IF EXISTS "Users can insert their own profile" ON public.profiles;
CREATE POLICY "Users can insert their own profile"
ON public.profiles FOR INSERT
WITH CHECK (auth.uid() = id);

DROP POLICY IF EXISTS "Users can update own profile" ON public.profiles;
CREATE POLICY "Users can update own profile"
ON public.profiles FOR UPDATE
USING (auth.uid() = id OR public.is_admin());

-- STUDENT PROFILES POLICIES
DROP POLICY IF EXISTS "Student profiles viewable by authenticated users" ON public.student_profiles;
CREATE POLICY "Student profiles viewable by authenticated users"
ON public.student_profiles FOR SELECT
USING (auth.role() = 'authenticated');

DROP POLICY IF EXISTS "Students can insert their own profile" ON public.student_profiles;
CREATE POLICY "Students can insert their own profile"
ON public.student_profiles FOR INSERT
WITH CHECK (auth.uid() = id);

DROP POLICY IF EXISTS "Students can update their own profile" ON public.student_profiles;
CREATE POLICY "Students can update their own profile"
ON public.student_profiles FOR UPDATE
USING (auth.uid() = id OR public.is_admin());

-- ALUMNI PROFILES POLICIES
DROP POLICY IF EXISTS "Alumni profiles viewable by authenticated users" ON public.alumni_profiles;
CREATE POLICY "Alumni profiles viewable by authenticated users"
ON public.alumni_profiles FOR SELECT
USING (
    verification_status = 'approved' 
    OR auth.uid() = id 
    OR public.is_admin()
);

DROP POLICY IF EXISTS "Alumni can insert their own profile" ON public.alumni_profiles;
CREATE POLICY "Alumni can insert their own profile"
ON public.alumni_profiles FOR INSERT
WITH CHECK (auth.uid() = id);

DROP POLICY IF EXISTS "Alumni can update own profile except verification status" ON public.alumni_profiles;
CREATE POLICY "Alumni can update own profile except verification status"
ON public.alumni_profiles FOR UPDATE
USING (auth.uid() = id OR public.is_admin());

-- JOBS POLICIES
DROP POLICY IF EXISTS "Approved jobs are viewable by authenticated users" ON public.jobs;
CREATE POLICY "Approved jobs are viewable by authenticated users"
ON public.jobs FOR SELECT
USING (
    status = 'approved' 
    OR posted_by = auth.uid() 
    OR public.is_admin()
);

DROP POLICY IF EXISTS "Verified Alumni and Admins can create jobs" ON public.jobs;
CREATE POLICY "Verified Alumni and Admins can create jobs"
ON public.jobs FOR INSERT
WITH CHECK (
    (posted_by = auth.uid() AND (public.is_verified_alumni() OR public.is_admin()))
);

DROP POLICY IF EXISTS "Job owners or Admin can update jobs" ON public.jobs;
CREATE POLICY "Job owners or Admin can update jobs"
ON public.jobs FOR UPDATE
USING (
    posted_by = auth.uid() OR public.is_admin()
);

DROP POLICY IF EXISTS "Job owners or Admin can delete jobs" ON public.jobs;
CREATE POLICY "Job owners or Admin can delete jobs"
ON public.jobs FOR DELETE
USING (
    posted_by = auth.uid() OR public.is_admin()
);

-- JOB APPLICATIONS POLICIES
DROP POLICY IF EXISTS "Students can view their own applications, job poster and admin can view" ON public.job_applications;
CREATE POLICY "Students can view their own applications, job poster and admin can view"
ON public.job_applications FOR SELECT
USING (
    student_id = auth.uid() 
    OR EXISTS (SELECT 1 FROM public.jobs WHERE jobs.id = job_applications.job_id AND jobs.posted_by = auth.uid())
    OR public.is_admin()
);

DROP POLICY IF EXISTS "Students can apply for approved jobs" ON public.job_applications;
CREATE POLICY "Students can apply for approved jobs"
ON public.job_applications FOR INSERT
WITH CHECK (
    student_id = auth.uid()
    AND EXISTS (SELECT 1 FROM public.jobs WHERE jobs.id = job_id AND jobs.status = 'approved')
);

DROP POLICY IF EXISTS "Job posters or Admin can update application status" ON public.job_applications;
CREATE POLICY "Job posters or Admin can update application status"
ON public.job_applications FOR UPDATE
USING (
    EXISTS (SELECT 1 FROM public.jobs WHERE jobs.id = job_applications.job_id AND jobs.posted_by = auth.uid())
    OR public.is_admin()
);

-- EVENTS POLICIES
DROP POLICY IF EXISTS "Approved events are viewable by authenticated users" ON public.events;
CREATE POLICY "Approved events are viewable by authenticated users"
ON public.events FOR SELECT
USING (
    status = 'approved' 
    OR created_by = auth.uid() 
    OR public.is_admin()
);

DROP POLICY IF EXISTS "Verified Alumni and Admins can create events" ON public.events;
CREATE POLICY "Verified Alumni and Admins can create events"
ON public.events FOR INSERT
WITH CHECK (
    (created_by = auth.uid() AND (public.is_verified_alumni() OR public.is_admin()))
);

DROP POLICY IF EXISTS "Event owners or Admin can update events" ON public.events;
CREATE POLICY "Event owners or Admin can update events"
ON public.events FOR UPDATE
USING (
    created_by = auth.uid() OR public.is_admin()
);

DROP POLICY IF EXISTS "Event owners or Admin can delete events" ON public.events;
CREATE POLICY "Event owners or Admin can delete events"
ON public.events FOR DELETE
USING (
    created_by = auth.uid() OR public.is_admin()
);

-- EVENT REGISTRATIONS POLICIES
DROP POLICY IF EXISTS "Users can view their own registrations, event creators and admin can view" ON public.event_registrations;
CREATE POLICY "Users can view their own registrations, event creators and admin can view"
ON public.event_registrations FOR SELECT
USING (
    user_id = auth.uid()
    OR EXISTS (SELECT 1 FROM public.events WHERE events.id = event_registrations.event_id AND events.created_by = auth.uid())
    OR public.is_admin()
);

DROP POLICY IF EXISTS "Users can register for approved events" ON public.event_registrations;
CREATE POLICY "Users can register for approved events"
ON public.event_registrations FOR INSERT
WITH CHECK (
    user_id = auth.uid()
    AND EXISTS (SELECT 1 FROM public.events WHERE events.id = event_id AND events.status = 'approved')
);

DROP POLICY IF EXISTS "Users can cancel their registration" ON public.event_registrations;
CREATE POLICY "Users can cancel their registration"
ON public.event_registrations FOR DELETE
USING (
    user_id = auth.uid() OR public.is_admin()
);

-- ANNOUNCEMENTS POLICIES
DROP POLICY IF EXISTS "Users can view published announcements for their audience" ON public.announcements;
CREATE POLICY "Users can view published announcements for their audience"
ON public.announcements FOR SELECT
USING (
    is_published = true 
    AND (
        target_audience = 'all'
        OR (target_audience = 'students' AND public.current_user_role() = 'student')
        OR (target_audience = 'alumni' AND public.current_user_role() = 'alumni')
        OR public.is_admin()
    )
);

DROP POLICY IF EXISTS "Admins can manage announcements" ON public.announcements;
CREATE POLICY "Admins can manage announcements"
ON public.announcements FOR ALL
USING (public.is_admin());

-- NOTIFICATIONS POLICIES
DROP POLICY IF EXISTS "Users can view their own notifications" ON public.notifications;
CREATE POLICY "Users can view their own notifications"
ON public.notifications FOR SELECT
USING (user_id = auth.uid());

DROP POLICY IF EXISTS "Users can update their own notifications (mark read)" ON public.notifications;
CREATE POLICY "Users can update their own notifications (mark read)"
ON public.notifications FOR UPDATE
USING (user_id = auth.uid());

DROP POLICY IF EXISTS "System/Authenticated can insert notifications" ON public.notifications;
CREATE POLICY "System/Authenticated can insert notifications"
ON public.notifications FOR INSERT
WITH CHECK (true);

-- REPORTS POLICIES
DROP POLICY IF EXISTS "Users can create reports" ON public.reports;
CREATE POLICY "Users can create reports"
ON public.reports FOR INSERT
WITH CHECK (reported_by = auth.uid());

DROP POLICY IF EXISTS "Admins can view and manage reports" ON public.reports;
CREATE POLICY "Admins can view and manage reports"
ON public.reports FOR ALL
USING (public.is_admin());

-- ==============================================================================
-- 6. STORAGE BUCKETS SETUP
-- ==============================================================================

-- Create buckets for storage if they don't exist
INSERT INTO storage.buckets (id, name, public) 
VALUES ('avatars', 'avatars', true)
ON CONFLICT (id) DO NOTHING;

INSERT INTO storage.buckets (id, name, public) 
VALUES ('resumes', 'resumes', false)
ON CONFLICT (id) DO NOTHING;

INSERT INTO storage.buckets (id, name, public) 
VALUES ('event-images', 'event-images', true)
ON CONFLICT (id) DO NOTHING;

-- Storage Policies for Avatars
DROP POLICY IF EXISTS "Avatar images are publicly accessible" ON storage.objects;
CREATE POLICY "Avatar images are publicly accessible"
ON storage.objects FOR SELECT
USING (bucket_id = 'avatars');

DROP POLICY IF EXISTS "Authenticated users can upload avatars" ON storage.objects;
CREATE POLICY "Authenticated users can upload avatars"
ON storage.objects FOR INSERT
WITH CHECK (bucket_id = 'avatars' AND auth.role() = 'authenticated');

DROP POLICY IF EXISTS "Users can update their own avatars" ON storage.objects;
CREATE POLICY "Users can update their own avatars"
ON storage.objects FOR UPDATE
USING (bucket_id = 'avatars' AND auth.uid()::text = (storage.foldername(name))[1]);

-- Storage Policies for Resumes
DROP POLICY IF EXISTS "Users can upload their own resumes" ON storage.objects;
CREATE POLICY "Users can upload their own resumes"
ON storage.objects FOR INSERT
WITH CHECK (bucket_id = 'resumes' AND auth.role() = 'authenticated');

DROP POLICY IF EXISTS "Job posters, students and admin can view resumes" ON storage.objects;
CREATE POLICY "Job posters, students and admin can view resumes"
ON storage.objects FOR SELECT
USING (bucket_id = 'resumes' AND auth.role() = 'authenticated');

-- Storage Policies for Event Images
DROP POLICY IF EXISTS "Event images are publicly accessible" ON storage.objects;
CREATE POLICY "Event images are publicly accessible"
ON storage.objects FOR SELECT
USING (bucket_id = 'event-images');

DROP POLICY IF EXISTS "Alumni and Admin can upload event images" ON storage.objects;
CREATE POLICY "Alumni and Admin can upload event images"
ON storage.objects FOR INSERT
WITH CHECK (bucket_id = 'event-images' AND auth.role() = 'authenticated');

-- ==============================================================================
-- 7. AUTO-PROFILE CREATION TRIGGER (SECURITY DEFINER)
-- ==============================================================================

CREATE OR REPLACE FUNCTION public.handle_new_user()
RETURNS TRIGGER AS $$
DECLARE
  user_role_val public.user_role;
  user_full_name TEXT;
  user_dept TEXT;
BEGIN
  IF (NEW.raw_user_meta_data->>'role') = 'admin' THEN
    user_role_val := 'admin'::public.user_role;
  ELSIF (NEW.raw_user_meta_data->>'role') = 'alumni' THEN
    user_role_val := 'alumni'::public.user_role;
  ELSE
    user_role_val := 'student'::public.user_role;
  END IF;

  user_full_name := COALESCE(NEW.raw_user_meta_data->>'full_name', 'New User');
  user_dept := COALESCE(NEW.raw_user_meta_data->>'department', 'Computer Engineering');

  INSERT INTO public.profiles (id, email, role, full_name)
  VALUES (
    NEW.id,
    NEW.email,
    user_role_val,
    user_full_name
  )
  ON CONFLICT (id) DO UPDATE
  SET 
    full_name = EXCLUDED.full_name,
    email = EXCLUDED.email;

  IF user_role_val = 'student'::public.user_role THEN
    INSERT INTO public.student_profiles (
      id,
      student_id,
      department,
      course,
      academic_year,
      graduation_year,
      phone
    )
    VALUES (
      NEW.id,
      NEW.raw_user_meta_data->>'student_id',
      user_dept,
      NEW.raw_user_meta_data->>'course',
      NEW.raw_user_meta_data->>'academic_year',
      NEW.raw_user_meta_data->>'graduation_year',
      NEW.raw_user_meta_data->>'phone'
    )
    ON CONFLICT (id) DO UPDATE
    SET 
      department = EXCLUDED.department,
      student_id = COALESCE(EXCLUDED.student_id, student_profiles.student_id),
      course = COALESCE(EXCLUDED.course, student_profiles.course),
      academic_year = COALESCE(EXCLUDED.academic_year, student_profiles.academic_year),
      graduation_year = COALESCE(EXCLUDED.graduation_year, student_profiles.graduation_year),
      phone = COALESCE(EXCLUDED.phone, student_profiles.phone);
  END IF;

  IF user_role_val = 'alumni'::public.user_role THEN
    INSERT INTO public.alumni_profiles (
      id,
      alumni_id,
      department,
      degree,
      graduation_year,
      company,
      designation,
      industry,
      location,
      bio,
      verification_status
    )
    VALUES (
      NEW.id,
      NEW.raw_user_meta_data->>'alumni_id',
      user_dept,
      NEW.raw_user_meta_data->>'degree',
      COALESCE(NEW.raw_user_meta_data->>'graduation_year', '2024'),
      NEW.raw_user_meta_data->>'company',
      NEW.raw_user_meta_data->>'designation',
      NEW.raw_user_meta_data->>'industry',
      NEW.raw_user_meta_data->>'location',
      NEW.raw_user_meta_data->>'bio',
      'pending'
    )
    ON CONFLICT (id) DO UPDATE
    SET 
      department = EXCLUDED.department,
      graduation_year = EXCLUDED.graduation_year,
      company = COALESCE(EXCLUDED.company, alumni_profiles.company),
      designation = COALESCE(EXCLUDED.designation, alumni_profiles.designation),
      industry = COALESCE(EXCLUDED.industry, alumni_profiles.industry),
      location = COALESCE(EXCLUDED.location, alumni_profiles.location),
      bio = COALESCE(EXCLUDED.bio, alumni_profiles.bio);
  END IF;

  RETURN NEW;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

DROP TRIGGER IF EXISTS on_auth_user_created ON auth.users;
CREATE TRIGGER on_auth_user_created
  AFTER INSERT ON auth.users
  FOR EACH ROW EXECUTE FUNCTION public.handle_new_user();
