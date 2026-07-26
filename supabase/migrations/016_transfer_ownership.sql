-- ============================================================
-- Migration 016: Transfer ownership + guard owner from leaving
-- ============================================================

-- 1. transfer_ownership: owner hands the team to another member
CREATE OR REPLACE FUNCTION transfer_ownership(target_profile_id UUID)
RETURNS VOID AS $$
DECLARE
  my_team_id UUID;
  target_user UUID;
BEGIN
  -- Caller must be on a team
  SELECT team_id INTO my_team_id
  FROM profiles WHERE user_id = auth.uid();

  IF my_team_id IS NULL THEN
    RAISE EXCEPTION 'You are not on a team';
  END IF;

  -- Caller must be the team owner
  IF NOT EXISTS (
    SELECT 1 FROM teams WHERE id = my_team_id AND owner_id = auth.uid()
  ) THEN
    RAISE EXCEPTION 'Only the team owner can transfer ownership';
  END IF;

  -- Target must be on the same team
  SELECT user_id INTO target_user
  FROM profiles WHERE id = target_profile_id AND team_id = my_team_id;

  IF target_user IS NULL THEN
    RAISE EXCEPTION 'Target player is not on your team';
  END IF;

  -- Can't transfer to yourself
  IF target_user = auth.uid() THEN
    RAISE EXCEPTION 'You already own this team';
  END IF;

  -- Transfer ownership
  UPDATE teams SET owner_id = target_user WHERE id = my_team_id;

  -- Ensure the new owner is also an admin
  UPDATE profiles SET is_admin = true WHERE id = target_profile_id;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

GRANT EXECUTE ON FUNCTION transfer_ownership(UUID) TO authenticated;

-- 2. Update can_leave_team: also block the team owner
CREATE OR REPLACE FUNCTION can_leave_team()
RETURNS BOOLEAN AS $$
DECLARE
  my_team_id UUID;
  am_i_admin BOOLEAN;
  am_i_owner BOOLEAN;
  admin_count INTEGER;
BEGIN
  SELECT team_id, is_admin INTO my_team_id, am_i_admin FROM profiles WHERE user_id = auth.uid();

  IF my_team_id IS NULL THEN
    RETURN true;
  END IF;

  -- Check if the user is the team owner
  SELECT EXISTS(
    SELECT 1 FROM teams WHERE id = my_team_id AND owner_id = auth.uid()
  ) INTO am_i_owner;

  -- Owner cannot leave without transferring ownership first
  IF am_i_owner THEN
    RETURN false;
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
