-- ============================================================
-- Migration 009: Security fixes + is_admin + leave team guard
-- ============================================================

-- 1. Ensure is_admin column exists (may have been added manually)
DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM information_schema.columns
    WHERE table_name = 'profiles' AND column_name = 'is_admin'
  ) THEN
    ALTER TABLE profiles ADD COLUMN is_admin BOOLEAN DEFAULT false;
  END IF;
END $$;

-- 2. Fix admin_remove_player: add authorization check
CREATE OR REPLACE FUNCTION admin_remove_player(target_profile_id UUID)
RETURNS VOID AS $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM profiles
    WHERE user_id = auth.uid()
      AND is_admin = true
      AND team_id = (SELECT team_id FROM profiles WHERE id = target_profile_id)
  ) THEN
    RAISE EXCEPTION 'Not authorized: you must be an admin of this team';
  END IF;

  UPDATE profiles SET team_id = NULL WHERE id = target_profile_id;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

-- 3. Leave team guard: prevent sole admin from leaving
-- Returns true if the user is allowed to leave, false if they're the last admin
CREATE OR REPLACE FUNCTION can_leave_team()
RETURNS BOOLEAN AS $$
DECLARE
  my_team_id UUID;
  am_i_admin BOOLEAN;
  admin_count INTEGER;
BEGIN
  SELECT team_id, is_admin INTO my_team_id, am_i_admin FROM profiles WHERE user_id = auth.uid();

  IF my_team_id IS NULL THEN
    RETURN true; -- Not on a team, nothing to guard
  END IF;

  -- If I'm not an admin, nothing blocks me from leaving
  IF NOT am_i_admin THEN
    RETURN true;
  END IF;

  -- Count admins on the team (including self)
  SELECT count(*) INTO admin_count
  FROM profiles
  WHERE team_id = my_team_id AND is_admin = true;

  -- If there's only 1 admin (self), block leaving
  IF admin_count <= 1 THEN
    RETURN false;
  END IF;

  RETURN true;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

-- 4. Grant EXECUTE on new functions
GRANT EXECUTE ON FUNCTION admin_remove_player(UUID) TO authenticated;
GRANT EXECUTE ON FUNCTION can_leave_team() TO authenticated;
