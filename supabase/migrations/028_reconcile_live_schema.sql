-- ============================================================
-- Migration 028: Reconcile the schema with the migrations
-- ============================================================
-- The production database had drifted away from the migration files.
-- Everything in here brings the two back in sync and closes the two
-- policies that were only present in production.
--
-- 1. `teams.logo_url`, `teams.primary_color` and
--    `teams.secondary_color` exist in production but in no migration.
--    A database rebuilt from the migration files would have been
--    missing columns the settings page writes to.
--
-- 2. The `team-logos` storage bucket and its policies exist in
--    production but in no migration. Migration 026 only raised the
--    size limit of a bucket it never created.
--
-- 3. The policy "Unassigned users can find team by invite code" on
--    `teams` existed in production only. Its USING clause was
--    "the caller has no team", which means it granted a team-less
--    user a SELECT on *every row* of `teams` -- including the
--    `invite_code` of every team in the database. Combined with the
--    fact that invite codes are the only credential needed to join a
--    team, this let anyone enumerate the invite codes of every team
--    and walk into any of them.
--
--    Nothing in the application reads `teams` by invite code: the
--    join flow goes through the `join_team_with_code` routine. The
--    policy is therefore removed without a replacement.
--
-- 4. The policy "Update profiles" on `profiles` existed in
--    production only. Its WITH CHECK allowed *any* admin to update
--    *any* profile, in any team, because it never checked that the
--    target row belonged to the admin's own team. The migration
--    policy "Admins can update team profiles" is correctly scoped,
--    but permissive policies are OR'ed together, so the loose one
--    won. It is removed; the scoped policy keeps working.
--
-- 5. The constraint `UNIQUE (teams.name)` exists in production but
--    in no migration.

-- ---------------------------------------------------------------
-- 1. Columns and constraints that were only ever created by hand.
-- ---------------------------------------------------------------
ALTER TABLE public.teams ADD COLUMN IF NOT EXISTS logo_url TEXT;
ALTER TABLE public.teams ADD COLUMN IF NOT EXISTS primary_color TEXT DEFAULT '#16a34a';
ALTER TABLE public.teams ADD COLUMN IF NOT EXISTS secondary_color TEXT DEFAULT '#ffffff';

-- Two teams may not share a name. The constraint exists in production
-- but was never written down.
DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint WHERE conrelid = 'public.teams'::regclass AND conname = 'teams_name_key'
  ) THEN
    ALTER TABLE public.teams ADD CONSTRAINT teams_name_key UNIQUE (name);
  END IF;
END $$;

-- ---------------------------------------------------------------
-- 2. The team logo bucket and its policies.
-- ---------------------------------------------------------------
INSERT INTO storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
VALUES (
  'team-logos',
  'team-logos',
  true,
  2097152,
  ARRAY['image/jpeg', 'image/png', 'image/webp', 'image/gif', 'image/svg+xml']
)
ON CONFLICT (id) DO UPDATE
SET file_size_limit = EXCLUDED.file_size_limit,
    allowed_mime_types = EXCLUDED.allowed_mime_types;

DROP POLICY IF EXISTS "Anyone can view team logos" ON storage.objects;
CREATE POLICY "Anyone can view team logos" ON storage.objects
  FOR SELECT USING (bucket_id = 'team-logos');

DROP POLICY IF EXISTS "Admins can upload team logos" ON storage.objects;
CREATE POLICY "Admins can upload team logos" ON storage.objects
  FOR INSERT TO authenticated
  WITH CHECK (
    bucket_id = 'team-logos'
    AND EXISTS (
      SELECT 1 FROM public.profiles
      WHERE user_id = auth.uid() AND is_admin IS TRUE AND team_id IS NOT NULL
    )
  );

DROP POLICY IF EXISTS "Admins can delete team logos" ON storage.objects;
CREATE POLICY "Admins can delete team logos" ON storage.objects
  FOR DELETE TO authenticated
  USING (
    bucket_id = 'team-logos'
    AND EXISTS (
      SELECT 1 FROM public.profiles
      WHERE user_id = auth.uid() AND is_admin IS TRUE
    )
  );

-- ---------------------------------------------------------------
-- 3. Remove the policy that exposed every invite code.
-- ---------------------------------------------------------------
DROP POLICY IF EXISTS "Unassigned users can find team by invite code" ON public.teams;

-- ---------------------------------------------------------------
-- 4. Remove the policy that allowed cross team profile updates.
-- ---------------------------------------------------------------
DROP POLICY IF EXISTS "Update profiles" ON public.profiles;
