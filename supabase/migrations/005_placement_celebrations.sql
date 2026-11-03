-- =============================================================================
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
