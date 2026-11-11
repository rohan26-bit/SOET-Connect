-- Add the external apply link to the persistent job record.
ALTER TABLE public.jobs
    ADD COLUMN IF NOT EXISTS application_url TEXT;

COMMENT ON COLUMN public.jobs.application_url IS
    'Optional external application page supplied by the job poster.';

-- Resumes contain personal information and must never be publicly readable.
-- The FastAPI backend accesses this bucket with the Supabase service-role key.
INSERT INTO storage.buckets (
    id,
    name,
    public,
    file_size_limit,
    allowed_mime_types
)
VALUES (
    'application-resumes',
    'application-resumes',
    false,
    5242880,
    ARRAY[
        'application/pdf',
        'application/msword',
        'application/vnd.openxmlformats-officedocument.wordprocessingml.document'
    ]::text[]
)
ON CONFLICT (id) DO UPDATE
SET
    public = false,
    file_size_limit = 5242880,
    allowed_mime_types = EXCLUDED.allowed_mime_types;
