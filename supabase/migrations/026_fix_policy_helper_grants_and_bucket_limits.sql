-- ============================================================
-- Migration 026: fix an over-reach from 024, and close the
--               storage bucket limits gap
-- ============================================================
-- Two fixes. The first corrects a regression I introduced in 024.
--
-- Part 1 -- policy helper functions need to stay executable by anon
-- ----------------------------------------------------------------
-- Migration 024 revoked EXECUTE from PUBLIC on several functions,
-- then granted it back to `authenticated` only. That was right for the
-- self-authorizing RPCs the app calls directly (disband_team,
-- admin_remove_player, transfer_ownership, can_leave_team), but wrong
-- for get_user_team_id(), which is not an API -- it is referenced
-- inside two SELECT policies:
--
--   profiles."Users can view profiles in their team"
--   teams."Users can view their own team"
--
-- RLS policy expressions are evaluated with the privileges of the role
-- issuing the query. An `anon` query on any of these tables therefore
-- tries to call get_user_team_id() and fails with
--
--   42501 permission denied for function get_user_team_id
--
-- instead of the intended, clean "no rows". The same reasoning applies
-- to the two helpers used by the profiles policies, and it is why
-- reservation_has_payments (also policy-referenced) was left callable
-- by anon in 023. Restoring the grant costs nothing: these helpers are
-- SECURITY DEFINER and only ever return information about auth.uid(),
-- so for an anon caller they return NULL/false by construction.
--
-- Part 2 -- put limits on the storage buckets
-- -------------------------------------------
-- Neither bucket had a file_size_limit or allowed_mime_types, so the
-- only type/size checks were in the browser (gallery compresses to
-- JPEG client-side; settings rejects logos over 2MB). Those are
-- bypassable with a direct REST call: verified by uploading a
-- text/plain file straight into the gallery bucket, which was accepted
-- (HTTP 200). The bucket limits below enforce this server-side.
--
-- Idempotent and safe to re-run.

-- ---------------------------------------------------------------------
-- Part 1: helpers referenced by RLS policies are callable by anon and
--         authenticated. They leak nothing: they only read auth.uid().
-- ---------------------------------------------------------------------
GRANT EXECUTE ON FUNCTION public.get_user_team_id()     TO anon, authenticated;
GRANT EXECUTE ON FUNCTION public.i_am_team_admin(uuid)  TO anon, authenticated;
GRANT EXECUTE ON FUNCTION public.i_am_any_team_admin()  TO anon, authenticated;

-- ---------------------------------------------------------------------
-- Part 2: bucket limits.
--   gallery:     images only, 10MB ceiling. The app downsizes before
--                upload, so 10MB is generous; it exists to stop a
--                scripted client filling the bucket.
--   team-logos:  images only, 2MB -- matching the limit the settings
--                page already enforces in the browser.
-- ---------------------------------------------------------------------
UPDATE storage.buckets
SET file_size_limit = 10485760,
    allowed_mime_types = ARRAY['image/jpeg','image/png','image/webp','image/gif','image/heic','image/heif']
WHERE id = 'gallery';

UPDATE storage.buckets
SET file_size_limit = 2097152,
    allowed_mime_types = ARRAY['image/jpeg','image/png','image/webp','image/gif','image/svg+xml']
WHERE id = 'team-logos';
