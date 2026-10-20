-- ============================================================
-- Migration 020: Harden SECURITY DEFINER functions
-- ============================================================
-- SECURITY DEFINER functions run with the privileges of their owner, so a
-- mutable `search_path` lets a caller shadow unqualified table/function names
-- (e.g. with a temporary table) and have the function act on it instead.
--
-- This migration re-creates every SECURITY DEFINER function with an empty
-- search_path and fully-qualified names. Behaviour is unchanged; only the
-- resolution of identifiers is pinned. pg_catalog is always searched, so
-- built-ins like now(), round() and count() keep working.
--
-- These are CREATE OR REPLACE on the exact same signatures, so triggers,
-- grants and callers are unaffected.

-- 1. handle_new_user()  (migration 001)
CREATE OR REPLACE FUNCTION public.handle_new_user()
RETURNS TRIGGER AS $$
BEGIN
  INSERT INTO public.profiles (user_id, name, role)
  VALUES (
    NEW.id,
    COALESCE(NEW.raw_user_meta_data->>'name', 'Unknown'),
    COALESCE(NEW.raw_user_meta_data->>'role', 'player')
  );
  RETURN NEW;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER SET search_path = '';

-- 2. handle_team_created()  (migrations 008 / 012)
CREATE OR REPLACE FUNCTION public.handle_team_created()
RETURNS TRIGGER AS $$
BEGIN
  UPDATE public.profiles
  SET role = 'coach', is_admin = true
  WHERE user_id = NEW.owner_id;

  RETURN NEW;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER SET search_path = '';

-- 3. admin_remove_player(UUID)  (migration 009)
CREATE OR REPLACE FUNCTION public.admin_remove_player(target_profile_id UUID)
RETURNS VOID AS $$
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
$$ LANGUAGE plpgsql SECURITY DEFINER SET search_path = '';

-- 4. can_leave_team()  (migration 016)
CREATE OR REPLACE FUNCTION public.can_leave_team()
RETURNS BOOLEAN AS $$
DECLARE
  my_team_id UUID;
  am_i_admin BOOLEAN;
  am_i_owner BOOLEAN;
  admin_count INTEGER;
BEGIN
  SELECT team_id, is_admin INTO my_team_id, am_i_admin
  FROM public.profiles WHERE user_id = auth.uid();

  IF my_team_id IS NULL THEN
    RETURN true;
  END IF;

  SELECT EXISTS(
    SELECT 1 FROM public.teams WHERE id = my_team_id AND owner_id = auth.uid()
  ) INTO am_i_owner;

  IF am_i_owner THEN
    RETURN false;
  END IF;

  IF NOT am_i_admin THEN
    RETURN true;
  END IF;

  SELECT count(*) INTO admin_count
  FROM public.profiles
  WHERE team_id = my_team_id AND is_admin = true;

  IF admin_count <= 1 THEN
    RETURN false;
  END IF;

  RETURN true;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER SET search_path = '';

-- 5. disband_team()  (migration 013)
CREATE OR REPLACE FUNCTION public.disband_team()
RETURNS VOID AS $$
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
$$ LANGUAGE plpgsql SECURITY DEFINER SET search_path = '';

-- 6. transfer_ownership(UUID)  (migration 016)
CREATE OR REPLACE FUNCTION public.transfer_ownership(target_profile_id UUID)
RETURNS VOID AS $$
DECLARE
  my_team_id UUID;
  target_user UUID;
BEGIN
  SELECT team_id INTO my_team_id
  FROM public.profiles WHERE user_id = auth.uid();

  IF my_team_id IS NULL THEN
    RAISE EXCEPTION 'You are not on a team';
  END IF;

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
END;
$$ LANGUAGE plpgsql SECURITY DEFINER SET search_path = '';

-- 7. cleanup_availability_on_team_change()  (migration 015)
CREATE OR REPLACE FUNCTION public.cleanup_availability_on_team_change()
RETURNS TRIGGER AS $$
BEGIN
  IF OLD.team_id IS NOT NULL AND OLD.team_id IS DISTINCT FROM NEW.team_id THEN
    DELETE FROM public.availability
    WHERE user_id = OLD.user_id
      AND event_id IN (
        SELECT id FROM public.events WHERE team_id = OLD.team_id
      );
  END IF;
  RETURN NEW;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER SET search_path = '';

-- 8. generate_invite_code()  (migration 001) — not SECURITY DEFINER, but the
--    same pinning protects the md5()/random() built-ins it calls.
CREATE OR REPLACE FUNCTION public.generate_invite_code()
RETURNS TRIGGER AS $$
BEGIN
  IF NEW.invite_code IS NULL OR NEW.invite_code = '' THEN
    NEW.invite_code := upper(substring(md5(random()::text) from 1 for 8));
  END IF;
  RETURN NEW;
END;
$$ LANGUAGE plpgsql SET search_path = '';

-- Re-assert EXECUTE grants on the client-callable RPCs (a replace keeps them,
-- but this documents the intended surface explicitly).
GRANT EXECUTE ON FUNCTION public.admin_remove_player(UUID) TO authenticated;
GRANT EXECUTE ON FUNCTION public.can_leave_team() TO authenticated;
GRANT EXECUTE ON FUNCTION public.disband_team() TO authenticated;
GRANT EXECUTE ON FUNCTION public.transfer_ownership(UUID) TO authenticated;
