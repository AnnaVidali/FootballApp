-- ============================================================
-- Migration 014: Clean up availability when player leaves team
-- ============================================================

-- Trigger function: delete availability rows when team_id changes
CREATE OR REPLACE FUNCTION cleanup_availability_on_team_change()
RETURNS TRIGGER AS $$
BEGIN
  -- Only clean up if team_id actually changed and was not null
  IF OLD.team_id IS NOT NULL AND OLD.team_id IS DISTINCT FROM NEW.team_id THEN
    DELETE FROM availability
    WHERE user_id = OLD.user_id
      AND event_id IN (
        SELECT id FROM events WHERE team_id = OLD.team_id
      );
  END IF;
  RETURN NEW;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

-- Attach trigger to profiles table
CREATE TRIGGER on_profile_team_change
  AFTER UPDATE OF team_id ON profiles
  FOR EACH ROW
  EXECUTE FUNCTION cleanup_availability_on_team_change();
