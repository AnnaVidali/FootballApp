-- Fix can_leave_team(): only block admins from leaving, not all players

CREATE OR REPLACE FUNCTION can_leave_team()
RETURNS BOOLEAN AS $$
DECLARE
  my_team_id UUID;
  am_i_admin BOOLEAN;
  admin_count INTEGER;
BEGIN
  SELECT team_id, is_admin INTO my_team_id, am_i_admin FROM profiles WHERE user_id = auth.uid();

  IF my_team_id IS NULL THEN
    RETURN true;
  END IF;

  IF NOT am_i_admin THEN
    RETURN true;
  END IF;

  SELECT count(*) INTO admin_count
  FROM profiles
  WHERE team_id = my_team_id AND is_admin = true;

  IF admin_count <= 1 THEN
    RETURN false;
  END IF;

  RETURN true;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;
