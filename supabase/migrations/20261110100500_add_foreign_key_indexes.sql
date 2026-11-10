-- Add B-tree indexes for the four foreign-key columns flagged by Supabase's
-- unindexed_foreign_keys advisor. These indexes support joins and parent-row
-- delete/update checks without changing application data or access policies.

CREATE INDEX IF NOT EXISTS idx_announcements_author_id
  ON public.announcements (author_id);

CREATE INDEX IF NOT EXISTS idx_events_created_by
  ON public.events (created_by);

CREATE INDEX IF NOT EXISTS idx_gallery_photos_reviewed_by
  ON public.gallery_photos (reviewed_by);

CREATE INDEX IF NOT EXISTS idx_placement_celebrations_created_by
  ON public.placement_celebrations (created_by);
