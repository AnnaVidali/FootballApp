-- ============================================================
-- Migration 024: Lock down self-service writes to privileged
--               profile columns
-- ============================================================
-- Finding (review #1, #3, #5), confirmed exploitable on the live
-- database before this migration:
--
--   Any signed-in user could run a plain REST update on their OWN
--   profiles row:
--
--       PATCH /rest/v1/profiles?user_id=eq.<me>
--         { "team_id": "<any team uuid>", "is_admin": true,
--           "role": "coach" }
--
--   and become an admin of any team whose uuid they could name, with
--   full read/write access to that team's roster, events,
--   availability, lineups, gallery and reservations.
--
-- Why it worked:
--   * The UPDATE policies on profiles constrained only WHO owned the
--     row (`user_id = auth.uid()`), never WHICH columns could change,
--     so team_id / is_admin / role were all self-writable.
--   * The invite code was checked only in the browser
--     (app/dashboard/join-team/page.tsx). Nothing in the database
--     required it -- knowing a team uuid was enough.
--   * Two overlapping UPDATE policies made the effective rule the
--     UNION of both, so tightening one alone would not have helped.
--
-- What this migration does:
--   1. A BEFORE UPDATE/INSERT trigger on profiles rejects changes to
--      team_id / is_admin / role unless the caller is authorised, with
--      narrow exceptions that keep every legitimate flow working.
--   2. join_team_with_code(text) -- a SECURITY DEFINER RPC and now the
--      ONLY supported way to join a team. The invite code is verified
--      server-side and team_id is set by the function.
--   3. Revokes EXECUTE from PUBLIC (i.e. anon) on the privileged RPCs.
--   4. Stops the profiles SELECT policy from trusting the
--      attacker-writable auth.jwt() -> 'is_admin' claim.
--   5. Pins search_path on get_user_team_id().
--
-- Design note: the trigger asks a plpgsql SECURITY DEFINER helper
-- (`i_am_team_admin`) whether the caller is an admin. A LANGUAGE sql
-- helper would be inlined by the planner and would then re-enter RLS on
-- profiles, producing 42P17 infinite recursion -- plpgsql avoids that.
-- Do NOT "simplify" this helper to LANGUAGE sql.
--
-- Legitimate writes verified against the app and exercised in a
-- rolled-back dry run before applying:
--   * player edits own name / position / shirt_number            -> allow
--   * player leaves a team (clears own team_id)                  -> allow
--   * team owner creates a team and adopts it                    -> allow
--   * admin edits / promotes / demotes members of their team      -> allow
--   * admin_remove_player / disband_team (SECURITY DEFINER)       -> allow
--   * join_team_with_code with a valid code                       -> allow
--   * anyone self-promoting or joining an arbitrary team          -> DENY
--   * anyone editing another team's membership                    -> DENY
--
-- Idempotent and safe to re-run.

-- ---------------------------------------------------------------------
-- 1. The admin check, as a NON-inlinable SECURITY DEFINER helper.
-- ---------------------------------------------------------------------
CREATE OR REPLACE FUNCTION public.i_am_team_admin(p_team_id uuid)
RETURNS boolean
LANGUAGE plpgsql
STABLE
SECURITY DEFINER
SET search_path = ''
AS $fn$
BEGIN
  RETURN EXISTS (
    SELECT 1 FROM public.profiles
    WHERE user_id = auth.uid()
      AND is_admin IS TRUE
      AND team_id = p_team_id
  );
END;
$fn$;

REVOKE ALL ON FUNCTION public.i_am_team_admin(uuid) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.i_am_team_admin(uuid) TO authenticated;

-- ---------------------------------------------------------------------
-- 2. Guard the privileged columns.
--    Plain (non-SECURITY DEFINER) trigger: it sees the caller's rights,
--    which is exactly what we test.
--
--    Writes coming from our own SECURITY DEFINER routines (owned by
--    postgres) are recognised by current_user being the function owner
--    rather than `authenticated`. This is stateless -- unlike a
--    session/transaction flag it cannot leak to a later statement.
-- ---------------------------------------------------------------------
CREATE OR REPLACE FUNCTION public.protect_profile_privileged_columns()
RETURNS trigger
LANGUAGE plpgsql
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
  IF NEW.user_id = auth.uid()
     AND NEW.team_id IS NULL
     AND OLD.team_id IS NOT NULL
     AND NEW.is_admin IS NOT DISTINCT FROM OLD.is_admin
     AND NEW.role     IS NOT DISTINCT FROM OLD.role THEN
    RETURN NEW;
  END IF;

  -- Creating a team: handle_team_created (SECURITY DEFINER) has already
  -- promoted the owner and set their team_id by the time the app runs
  -- its own update. So allow the caller to (re)assert team_id /
  -- is_admin / role on their OWN row when they own that team. They
  -- cannot use this for a team owned by anyone else.
  IF NEW.user_id = auth.uid()
     AND NEW.team_id IS NOT NULL
     AND EXISTS (
       SELECT 1 FROM public.teams t
       WHERE t.id = NEW.team_id AND t.owner_id = auth.uid()
     ) THEN
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

DROP TRIGGER IF EXISTS protect_profile_privileged_columns ON public.profiles;
CREATE TRIGGER protect_profile_privileged_columns
  BEFORE UPDATE OR INSERT ON public.profiles
  FOR EACH ROW
  EXECUTE FUNCTION public.protect_profile_privileged_columns();

-- ---------------------------------------------------------------------
-- 3. The only supported way to join a team.
--    The code is checked here; the caller cannot pass a raw team id.
-- ---------------------------------------------------------------------
CREATE OR REPLACE FUNCTION public.join_team_with_code(p_code text)
RETURNS uuid
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = ''
AS $fn$
DECLARE
  v_team_id uuid;
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

  UPDATE public.profiles
  SET team_id = v_team_id, is_admin = false, role = 'player'
  WHERE user_id = auth.uid();

  RETURN v_team_id;
END;
$fn$;

REVOKE ALL ON FUNCTION public.join_team_with_code(text) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.join_team_with_code(text) TO authenticated;

-- ---------------------------------------------------------------------
-- 4. Let the existing admin RPCs through the new guard.
--    Bodies are otherwise unchanged; they still self-authorize.
--
--    handle_team_created also writes is_admin/role, so it needs the
--    flag too (it already verifies the caller owns the new team via the
--    teams INSERT policy + owner_id).
-- ---------------------------------------------------------------------
CREATE OR REPLACE FUNCTION public.handle_team_created()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = ''
AS $fn$
BEGIN
  UPDATE public.profiles
  SET role = 'coach', is_admin = true
  WHERE user_id = NEW.owner_id;
  RETURN NEW;
END;
$fn$;

CREATE OR REPLACE FUNCTION public.admin_remove_player(target_profile_id uuid)
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = ''
AS $fn$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM public.profiles
    WHERE user_id = auth.uid()
      AND is_admin = true
      AND team_id = (SELECT team_id FROM public.profiles WHERE id = target_profile_id)
  ) THEN
    RAISE EXCEPTION 'Not authorized: you must be an admin of this team';
  END IF;

  UPDATE public.profiles SET team_id = NULL WHERE id = target_profile_id;
END;
$fn$;

CREATE OR REPLACE FUNCTION public.disband_team()
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = ''
AS $fn$
DECLARE
  my_team_id UUID;
BEGIN
  SELECT team_id INTO my_team_id
  FROM public.profiles
  WHERE user_id = auth.uid();

  IF my_team_id IS NULL THEN
    RAISE EXCEPTION 'You are not on a team';
  END IF;

  IF NOT EXISTS (
    SELECT 1 FROM public.teams
    WHERE id = my_team_id AND owner_id = auth.uid()
  ) THEN
    RAISE EXCEPTION 'Only the team owner can disband the team';
  END IF;

  UPDATE public.profiles
  SET team_id = NULL, is_admin = false, role = 'player'
  WHERE team_id = my_team_id;

  DELETE FROM public.teams WHERE id = my_team_id;
END;
$fn$;

-- ---------------------------------------------------------------------
-- 5. Stop trusting the attacker-writable JWT claim.
--    "Admins can view unassigned users" read auth.jwt()->>'is_admin',
--    which originates in raw_user_meta_data that a user can write via
--    the auth API (proved: setting { is_admin: "true" } and re-logging-in
--    satisfies the old policy).
--
--    It must be replaced with a lookup in profiles, but a subquery on
--    profiles inside a policy ON profiles recurses (42P17). So it goes
--    through the same non-inlinable SECURITY DEFINER helper used by the
--    trigger above.
-- ---------------------------------------------------------------------
CREATE OR REPLACE FUNCTION public.i_am_any_team_admin()
RETURNS boolean
LANGUAGE plpgsql
STABLE
SECURITY DEFINER
SET search_path = ''
AS $fn$
BEGIN
  RETURN EXISTS (
    SELECT 1 FROM public.profiles
    WHERE user_id = auth.uid() AND is_admin IS TRUE
  );
END;
$fn$;

REVOKE ALL ON FUNCTION public.i_am_any_team_admin() FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.i_am_any_team_admin() TO authenticated;

DROP POLICY IF EXISTS "Admins can view unassigned users" ON public.profiles;
CREATE POLICY "Admins can view unassigned users" ON public.profiles
  FOR SELECT
  USING (
    team_id IS NULL
    AND public.i_am_any_team_admin()
  );

-- ---------------------------------------------------------------------
-- 6. Revoke EXECUTE from PUBLIC (includes anon) on privileged RPCs.
--    Supabase grants EXECUTE to PUBLIC by default. They all
--    self-authorize, so this is defence in depth (review #2).
-- ---------------------------------------------------------------------
REVOKE ALL ON FUNCTION public.disband_team() FROM PUBLIC;
REVOKE ALL ON FUNCTION public.can_leave_team() FROM PUBLIC;
REVOKE ALL ON FUNCTION public.admin_remove_player(uuid) FROM PUBLIC;
REVOKE ALL ON FUNCTION public.transfer_ownership(uuid) FROM PUBLIC;
REVOKE ALL ON FUNCTION public.get_user_team_id() FROM PUBLIC;

GRANT EXECUTE ON FUNCTION public.disband_team() TO authenticated;
GRANT EXECUTE ON FUNCTION public.can_leave_team() TO authenticated;
GRANT EXECUTE ON FUNCTION public.admin_remove_player(uuid) TO authenticated;
GRANT EXECUTE ON FUNCTION public.transfer_ownership(uuid) TO authenticated;
GRANT EXECUTE ON FUNCTION public.get_user_team_id() TO authenticated;

-- get_user_team_id backs a teams/profiles SELECT policy; pin its
-- search_path so `profiles` cannot resolve unpredictably (review #8).
CREATE OR REPLACE FUNCTION public.get_user_team_id()
RETURNS uuid
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = ''
AS $fn$
  SELECT team_id FROM public.profiles WHERE user_id = auth.uid() LIMIT 1;
$fn$;

REVOKE ALL ON FUNCTION public.get_user_team_id() FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.get_user_team_id() TO authenticated;
