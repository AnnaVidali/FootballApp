-- ============================================================
-- Migration 031: Team ownership and the sign up role
-- ============================================================
-- Two problems, both about who is allowed to decide what a row
-- says.
--
-- 1. teams.owner_id cannot be deleted from
-- --------------------------------------------------------------
--    The column is NOT NULL:
--
--      teams_owner_id_fkey  FOREIGN KEY (owner_id)
--                            REFERENCES auth.users(id) ON DELETE SET NULL
--
--    "ON DELETE SET NULL" on a NOT NULL column is a contradiction.
--    Deleting the auth user who owns a team makes PostgreSQL try to
--    set the column to NULL and fail with
--
--      null value in column "owner_id" violates not-null constraint
--
--    instead of the much clearer "this user still owns a team". The
--    application already applies that rule in the delete account
--    route ("transfer ownership to another member first"), so the
--    database should say the same thing.
--
--    The alternative -- making owner_id nullable -- was rejected:
--    a team without an owner cannot be handed over any more, because
--    `transfer_ownership` is called by the owner. That would turn a
--    rare mistake into a permanently orphaned team.
--
-- 2. The role of a new account came from the sign up metadata
-- --------------------------------------------------------------
--    The registration trigger copied it straight from the request:
--
--      COALESCE(NEW.raw_user_meta_data->>'role', 'player')
--
--    `raw_user_meta_data` is supplied by whoever calls the sign up
--    endpoint. The app sends `role: "player"`, but the endpoint is
--    public: anybody can post `role: "coach"` and end up with a
--    coach role, which the roster shows as a badge and which hides
--    the person from the lineup. A role is assigned by a team admin,
--    never by the person signing up.
--
--    The new trigger always starts a profile as a plain player.
--    `handle_team_created` promotes the owner to coach afterwards,
--    and that path is unchanged.

-- ---------------------------------------------------------------
-- 1. teams.owner_id
-- ---------------------------------------------------------------
ALTER TABLE public.teams DROP CONSTRAINT IF EXISTS teams_owner_id_fkey;
ALTER TABLE public.teams ADD CONSTRAINT teams_owner_id_fkey
  FOREIGN KEY (owner_id) REFERENCES auth.users(id) ON DELETE RESTRICT;

-- ---------------------------------------------------------------
-- 2. handle_new_user
-- ---------------------------------------------------------------
CREATE OR REPLACE FUNCTION public.handle_new_user()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO ''
AS $fn$
BEGIN
  INSERT INTO public.profiles (user_id, name, role, is_admin)
  VALUES (
    NEW.id,
    COALESCE(NULLIF(NEW.raw_user_meta_data->>'name', ''), 'Unknown'),
    'player',
    false
  );
  RETURN NEW;
END;
$fn$;

-- The trigger is SECURITY DEFINER, so it runs with the rights of its
-- owner and the guard trigger on `profiles` does not apply to it.
-- That is why the values it writes have to be correct on their own.

-- The insert policy lets a user insert a row for their own account
-- only. The unique constraint on profiles.user_id means the
-- registration trigger has already created that row, so in practice
-- the policy is unreachable -- but if it ever is used, it must not
-- be able to place the account in a team or give it a role.
DROP POLICY IF EXISTS "Users can insert their own profile" ON public.profiles;
CREATE POLICY "Users can insert their own profile" ON public.profiles
  FOR INSERT
  WITH CHECK (
    user_id = auth.uid()
    AND team_id IS NULL
    AND role = 'player'
    AND COALESCE(is_admin, false) = false
  );
