-- ============================================================
-- Migration 032: The two remaining cross team write holes
-- ============================================================
-- 1. The team logo policies were not folder scoped
-- --------------------------------------------------------------
--    "Admins can upload team logos" checked "am I an admin of
--    *some* team", not "am I an admin of the team that owns this
--    folder". The bucket is public, so team A's admin could publish
--    a file inside team B's logo folder -- a defacement or a
--    look alike logo served from the victim's own address.
--
--    The gallery policies (migration 017) were folder scoped all
--    along; the logo policies were not.
--
-- 2. teams.owner_id could be written directly
-- --------------------------------------------------------------
--    "Admins can update their team" lets an admin update the row of
--    their team, and owner_id is not among the restricted columns:
--    PostgreSQL has no column level UPDATE privileges, so the
--    policy silently allows owner_id as well.
--
--    That skipped everything transfer_ownership() checks: the target
--    had to be a member of the team, and the caller had to be the
--    owner. A plain admin could set owner_id to any user id --
--    even somebody who was not on the team. The team would then be
--    owned by a non member, can_leave_team() would treat that
--    non member as the owner and block them from leaving, and the
--    real owner stayed is_admin = true.
--
--    The guard is a trigger, in the same shape as the one that
--    protects the privileged columns of profiles
--    (migration 024): it fires for every UPDATE, and it only lets
--    the value through when the write comes from a trusted writer.
--
--    transfer_ownership() is SECURITY DEFINER and owned by postgres,
--    so inside it current_user is postgres and the legitimate path
--    keeps working.

-- ---------------------------------------------------------------
-- 1. The team logo policies, scoped to the folder of the team.
-- ---------------------------------------------------------------
DROP POLICY IF EXISTS "Admins can upload team logos" ON storage.objects;
CREATE POLICY "Admins can upload team logos" ON storage.objects
  FOR INSERT TO authenticated
  WITH CHECK (
    bucket_id = 'team-logos'
    AND (storage.foldername(name))[1] IN (
      SELECT p.team_id::text FROM public.profiles p
      WHERE p.user_id = auth.uid() AND p.is_admin IS TRUE AND p.team_id IS NOT NULL
    )
  );

DROP POLICY IF EXISTS "Admins can delete team logos" ON storage.objects;
CREATE POLICY "Admins can delete team logos" ON storage.objects
  FOR DELETE TO authenticated
  USING (
    bucket_id = 'team-logos'
    AND (storage.foldername(name))[1] IN (
      SELECT p.team_id::text FROM public.profiles p
      WHERE p.user_id = auth.uid() AND p.is_admin IS TRUE AND p.team_id IS NOT NULL
    )
  );

-- ---------------------------------------------------------------
-- 2. The ownership guard.
-- ---------------------------------------------------------------
CREATE OR REPLACE FUNCTION public.protect_team_owner_id()
RETURNS trigger
LANGUAGE plpgsql
AS $fn$
BEGIN
  -- A trusted internal write: a SECURITY DEFINER routine owned by
  -- the table owner is running this. transfer_ownership() is the
  -- only such routine that changes the owner, and it checks the
  -- caller and the target before it does.
  IF current_user <> 'postgres' AND current_user <> 'service_role' THEN
    IF NEW.owner_id IS DISTINCT FROM OLD.owner_id THEN
      RAISE EXCEPTION 'Use transfer_ownership() to change the team owner'
        USING ERRCODE = '42501';
    END IF;
  END IF;

  RETURN NEW;
END;
$fn$;

DROP TRIGGER IF EXISTS protect_team_owner_id ON public.teams;
CREATE TRIGGER protect_team_owner_id
  BEFORE UPDATE ON public.teams
  FOR EACH ROW EXECUTE FUNCTION public.protect_team_owner_id();
