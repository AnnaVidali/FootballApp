-- ============================================================
-- Migration 017: Team gallery (photos + external links)
-- ============================================================
-- Photos are stored in a private bucket; access is scoped to the
-- team via the "{team_id}/..." path prefix. Instagram posts are
-- stored as links (kind = 'link'), so no video files are uploaded.

-- 1. Gallery items table. Every team member can add and delete.
CREATE TABLE gallery_items (
  id UUID DEFAULT gen_random_uuid() PRIMARY KEY,
  team_id UUID NOT NULL REFERENCES teams(id) ON DELETE CASCADE,
  event_id UUID REFERENCES events(id) ON DELETE SET NULL,
  uploaded_by UUID NOT NULL REFERENCES profiles(id) ON DELETE CASCADE,
  kind TEXT NOT NULL CHECK (kind IN ('photo', 'link')),
  storage_path TEXT,
  external_url TEXT,
  caption TEXT,
  created_at TIMESTAMPTZ DEFAULT now() NOT NULL,
  CONSTRAINT gallery_items_target_check CHECK (
    (kind = 'photo' AND storage_path IS NOT NULL) OR
    (kind = 'link' AND external_url IS NOT NULL)
  )
);

ALTER TABLE gallery_items ENABLE ROW LEVEL SECURITY;

-- Anyone on the team can view their gallery
CREATE POLICY "Team members can view gallery" ON gallery_items
  FOR SELECT USING (
    team_id IN (SELECT team_id FROM profiles WHERE user_id = auth.uid())
  );

-- Anyone on the team can add items (tagging themselves as the uploader)
CREATE POLICY "Team members can add gallery items" ON gallery_items
  FOR INSERT WITH CHECK (
    team_id IN (SELECT team_id FROM profiles WHERE user_id = auth.uid())
    AND uploaded_by IN (SELECT id FROM profiles WHERE user_id = auth.uid())
  );

-- Anyone on the team can delete items
CREATE POLICY "Team members can delete gallery items" ON gallery_items
  FOR DELETE USING (
    team_id IN (SELECT team_id FROM profiles WHERE user_id = auth.uid())
  );

GRANT SELECT, INSERT, DELETE ON gallery_items TO authenticated;

-- 2. Private bucket for gallery photos. Files live under "{team_id}/...".
INSERT INTO storage.buckets (id, name, public)
VALUES ('gallery', 'gallery', false)
ON CONFLICT (id) DO NOTHING;

-- 3. Storage policies: only members of the team in the path can touch a file.
CREATE POLICY "Team members can view gallery files" ON storage.objects
  FOR SELECT USING (
    bucket_id = 'gallery'
    AND (storage.foldername(name))[1] IN (
      SELECT team_id::text FROM profiles WHERE user_id = auth.uid()
    )
  );

CREATE POLICY "Team members can upload gallery files" ON storage.objects
  FOR INSERT WITH CHECK (
    bucket_id = 'gallery'
    AND (storage.foldername(name))[1] IN (
      SELECT team_id::text FROM profiles WHERE user_id = auth.uid()
    )
  );

CREATE POLICY "Team members can delete gallery files" ON storage.objects
  FOR DELETE USING (
    bucket_id = 'gallery'
    AND (storage.foldername(name))[1] IN (
      SELECT team_id::text FROM profiles WHERE user_id = auth.uid()
    )
  );
