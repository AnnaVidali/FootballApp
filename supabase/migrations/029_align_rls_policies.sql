-- ============================================================
-- Migration 029: Make the RLS policies of a rebuilt database
--               identical to the ones in production
-- ============================================================
-- Migration 001 created the policy
--
--   CREATE POLICY "Users can view profiles in their team" ON profiles
--     FOR SELECT USING (
--       team_id = (SELECT team_id FROM profiles WHERE user_id = auth.uid())
--       OR user_id = auth.uid()
--     );
--
-- That policy reads the table it is defined on, which PostgreSQL
-- rejects at query time:
--
--   ERROR: infinite recursion detected in policy for relation "profiles"
--   (SQLSTATE 42P17)
--
-- Production never had that policy -- it was replaced by hand with a
-- version that calls the SECURITY DEFINER helper `get_user_team_id()`.
-- Because no migration ever dropped the broken one, a database
-- rebuilt from the migration files could not read the profiles table
-- at all: every page that shows the roster, the team or the event
-- list would fail.
--
-- This migration does three things:
--
--   1. Recreates "Users can view profiles in their team" with the
--      helper function.
--   2. Recreates "Users can view their own team" the way production
--      has it: the caller's own team, or a team they own.
--   3. Drops "Users can update their own profile" from migration 001.
--      It never existed in production and it is superseded by
--      "Admins can update team profiles", which also lets a user
--      update their own row.
--
-- The helper is SECURITY DEFINER, so it reads `profiles` with the
-- rights of its owner and does not recurse.

-- ---------------------------------------------------------------
-- 0. The helper has to be there and callable by both roles.
--    Migration 026 grants it to anon and authenticated, because it
--    is referenced from a SELECT policy.
-- ---------------------------------------------------------------
REVOKE ALL ON FUNCTION public.get_user_team_id() FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.get_user_team_id() TO anon, authenticated;

-- ---------------------------------------------------------------
-- 1. The self referencing policy on profiles.
-- ---------------------------------------------------------------
DROP POLICY IF EXISTS "Users can view profiles in their team" ON public.profiles;
CREATE POLICY "Users can view profiles in their team" ON public.profiles
  FOR SELECT USING (
    team_id = public.get_user_team_id()
    OR user_id = auth.uid()
  );

-- ---------------------------------------------------------------
-- 2. The policy on teams.
-- ---------------------------------------------------------------
DROP POLICY IF EXISTS "Users can view their own team" ON public.teams;
CREATE POLICY "Users can view their own team" ON public.teams
  FOR SELECT USING (
    id = public.get_user_team_id()
    OR owner_id = auth.uid()
  );

-- ---------------------------------------------------------------
-- 3. The stale policy from migration 001.
-- ---------------------------------------------------------------
DROP POLICY IF EXISTS "Users can update their own profile" ON public.profiles;
