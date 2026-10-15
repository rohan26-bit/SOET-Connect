-- ==============================================================================
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
