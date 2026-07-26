-- ============================================================
-- Migration 013: Disband team (owner-only)
-- ============================================================

CREATE OR REPLACE FUNCTION disband_team()
RETURNS VOID AS $$
DECLARE
  my_team_id UUID;
BEGIN
  -- Get caller's team
  SELECT team_id INTO my_team_id
  FROM profiles
  WHERE user_id = auth.uid();

  IF my_team_id IS NULL THEN
    RAISE EXCEPTION 'You are not on a team';
  END IF;

  -- Verify caller is the team owner
  IF NOT EXISTS (
    SELECT 1 FROM teams
    WHERE id = my_team_id AND owner_id = auth.uid()
  ) THEN
    RAISE EXCEPTION 'Only the team owner can disband the team';
  END IF;

  -- Reset all member profiles
  UPDATE profiles
  SET team_id = NULL, is_admin = false, role = 'player'
  WHERE team_id = my_team_id;

  -- Delete the team (cascades to events, lineups, availability)
  DELETE FROM teams WHERE id = my_team_id;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

GRANT EXECUTE ON FUNCTION disband_team() TO authenticated;
