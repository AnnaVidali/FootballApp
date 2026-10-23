-- ============================================================
-- Migration 035: Leaving a team is decided by the database
-- ============================================================
-- can_leave_team() already says when a member may leave: never the
-- owner, and never the last admin. The roster page calls it before it
-- offers the button, but nothing enforced the answer. Leaving is an
-- ordinary UPDATE of profiles.team_id, and several paths perform that
-- update without asking:
--
--   * a direct PostgREST update of the caller's own row -- the page's
--     own mechanism -- which clears team_id even for the owner;
--   * join_team_with_code(), which moves the caller into another team
--     and so leaves the current one from the other direction;
--   * creating a second team, which rewrites team_id through the
--     "I own this team" branch of the profile guard;
--   * admin_remove_player(), where any admin could remove the owner.
--
-- Each of those leaves teams.owner_id pointing at somebody who is no
-- longer a member, or a team with no admin at all. transfer_ownership
-- is only callable by the owner, so a team in that state can never be
-- repaired from the app.
--
-- This migration makes the database enforce the rule the UI already
-- displays:
--
--   1. the profile guard asks can_leave_team() before a member may
--      clear their own team_id, and before an owner may move to
--      another team they own;
--   2. join_team_with_code() refuses a move the caller may not make
--      (joining the team you are already in stays a no-op);
--   3. admin_remove_player() cannot remove the owner;
--   4. transfer_ownership() demotes the outgoing owner (audit M-3)
--      and locks the team row while it changes hands.
--
-- The guard and both RPCs are replaced in full, which also pins their
-- search_path (audit M-5).

-- ---------------------------------------------------------------
-- 1. The profile guard.
-- ---------------------------------------------------------------
CREATE OR REPLACE FUNCTION public.protect_profile_privileged_columns()
RETURNS trigger
LANGUAGE plpgsql
SET search_path = ''
AS $fn$
BEGIN
  -- Trusted internal write: a SECURITY DEFINER routine owned by the
  -- table owner is running this. Such routines all self-authorize with
  -- auth.uid() before they write.
  IF current_user <> 'authenticated' AND current_user <> 'anon' THEN
    RETURN NEW;
  END IF;

  -- INSERT: only the registration trigger creates rows. Never allow a
  -- brand-new account to declare itself an admin.
  IF TG_OP = 'INSERT' THEN
    IF NEW.is_admin IS TRUE THEN
      RAISE EXCEPTION 'You cannot grant yourself admin rights';
    END IF;
    RETURN NEW;
  END IF;

  -- Nothing privileged is changing: name / position / shirt_number etc.
  IF NEW.team_id  IS NOT DISTINCT FROM OLD.team_id
     AND NEW.is_admin IS NOT DISTINCT FROM OLD.is_admin
     AND NEW.role     IS NOT DISTINCT FROM OLD.role THEN
    RETURN NEW;
  END IF;

  -- Leaving a team: a user may clear their own team_id, and only that.
  -- The same rule the roster page shows applies here: the owner and the
  -- last admin must hand the team over first. Without this check the
  -- button is the only thing stopping them.
  IF NEW.user_id = auth.uid()
     AND NEW.team_id IS NULL
     AND OLD.team_id IS NOT NULL
     AND NEW.is_admin IS NOT DISTINCT FROM OLD.is_admin
     AND NEW.role     IS NOT DISTINCT FROM OLD.role THEN
    IF NOT public.can_leave_team() THEN
      RAISE EXCEPTION 'Transfer ownership or appoint another admin before leaving the team'
        USING ERRCODE = '42501';
    END IF;
    RETURN NEW;
  END IF;

  -- Creating a team: the new row points at a team the caller owns, so
  -- the caller may assert team_id / is_admin / role on their own row.
  -- Moving there from an existing team is still a leave, so it goes
  -- through the same check as above.
  IF NEW.user_id = auth.uid()
     AND NEW.team_id IS NOT NULL
     AND EXISTS (
       SELECT 1 FROM public.teams t
       WHERE t.id = NEW.team_id AND t.owner_id = auth.uid()
     ) THEN
    IF OLD.team_id IS NOT NULL
       AND OLD.team_id IS DISTINCT FROM NEW.team_id
       AND NOT public.can_leave_team() THEN
      RAISE EXCEPTION 'Transfer ownership or appoint another admin before moving to another team'
        USING ERRCODE = '42501';
    END IF;
    RETURN NEW;
  END IF;

  -- An existing admin of that team may change these columns for its
  -- members (roster page: promote/demote, coach toggle).
  IF public.i_am_team_admin(COALESCE(OLD.team_id, NEW.team_id))
     AND NEW.team_id IS NOT DISTINCT FROM OLD.team_id THEN
    RETURN NEW;
  END IF;

  RAISE EXCEPTION
    'Only a team admin can change team, admin or role for a profile';
END;
$fn$;

-- ---------------------------------------------------------------
-- 2. Joining another team.
-- ---------------------------------------------------------------
CREATE OR REPLACE FUNCTION public.join_team_with_code(p_code text)
RETURNS uuid
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = ''
AS $fn$
DECLARE
  v_team_id uuid;
  v_current_team_id uuid;
BEGIN
  IF p_code IS NULL OR btrim(p_code) = '' THEN
    RAISE EXCEPTION 'Invite code is required';
  END IF;

  SELECT id INTO v_team_id
  FROM public.teams
  WHERE invite_code = upper(btrim(p_code));

  IF v_team_id IS NULL THEN
    RAISE EXCEPTION 'Invalid invite code';
  END IF;

  SELECT team_id INTO v_current_team_id
  FROM public.profiles WHERE user_id = auth.uid();

  -- The caller's own team: nothing to change. Treat it as success so
  -- pasting your own code is harmless.
  IF v_current_team_id IS NOT NULL AND v_current_team_id = v_team_id THEN
    RETURN v_team_id;
  END IF;

  -- Moving teams is leaving the current one. The owner and the last
  -- admin must hand over first, exactly as on the roster page.
  IF v_current_team_id IS NOT NULL AND NOT public.can_leave_team() THEN
    RAISE EXCEPTION 'Transfer ownership or appoint another admin before joining another team'
      USING ERRCODE = '42501';
  END IF;

  UPDATE public.profiles
  SET team_id = v_team_id, is_admin = false, role = 'player'
  WHERE user_id = auth.uid();

  RETURN v_team_id;
END;
$fn$;

-- ---------------------------------------------------------------
-- 3. Removing a member.
--    An admin of the team may remove a member, never the owner: the
--    owner is the only one who can hand the team over, and removing
--    them would leave an ownerless roster behind.
-- ---------------------------------------------------------------
CREATE OR REPLACE FUNCTION public.admin_remove_player(target_profile_id uuid)
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = ''
AS $fn$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM public.profiles caller
    WHERE caller.user_id = auth.uid()
      AND caller.is_admin = true
      AND caller.team_id = (
        SELECT team_id FROM public.profiles WHERE id = target_profile_id
      )
  ) THEN
    RAISE EXCEPTION 'Not authorized: you must be an admin of this team';
  END IF;

  IF EXISTS (
    SELECT 1
    FROM public.profiles target
    JOIN public.teams t ON t.id = target.team_id
    WHERE target.id = target_profile_id
      AND t.owner_id = target.user_id
  ) THEN
    RAISE EXCEPTION 'Transfer ownership before removing the team owner'
      USING ERRCODE = '42501';
  END IF;

  UPDATE public.profiles SET team_id = NULL WHERE id = target_profile_id;
END;
$fn$;

-- ---------------------------------------------------------------
-- 4. Transferring ownership.
--    Lock the team first so two transfers cannot interleave, and
--    demote the outgoing owner: handing over the team has to mean
--    handing over control, not just changing owner_id.
-- ---------------------------------------------------------------
CREATE OR REPLACE FUNCTION public.transfer_ownership(target_profile_id uuid)
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = ''
AS $fn$
DECLARE
  my_team_id uuid;
  target_user uuid;
BEGIN
  SELECT team_id INTO my_team_id
  FROM public.profiles WHERE user_id = auth.uid();

  IF my_team_id IS NULL THEN
    RAISE EXCEPTION 'You are not on a team';
  END IF;

  PERFORM 1 FROM public.teams WHERE id = my_team_id FOR UPDATE;

  IF NOT EXISTS (
    SELECT 1 FROM public.teams WHERE id = my_team_id AND owner_id = auth.uid()
  ) THEN
    RAISE EXCEPTION 'Only the team owner can transfer ownership';
  END IF;

  SELECT user_id INTO target_user
  FROM public.profiles WHERE id = target_profile_id AND team_id = my_team_id;

  IF target_user IS NULL THEN
    RAISE EXCEPTION 'Target player is not on your team';
  END IF;

  IF target_user = auth.uid() THEN
    RAISE EXCEPTION 'You already own this team';
  END IF;

  UPDATE public.teams SET owner_id = target_user WHERE id = my_team_id;

  UPDATE public.profiles SET is_admin = true WHERE id = target_profile_id;

  -- The outgoing owner stays a member, but no longer an admin. The
  -- admin policies must follow the owner badge, and can_leave_team()
  -- must not count the former owner as an admin the new owner leaves
  -- behind.
  UPDATE public.profiles
     SET is_admin = false
   WHERE user_id = auth.uid()
     AND team_id = my_team_id;
END;
$fn$;
