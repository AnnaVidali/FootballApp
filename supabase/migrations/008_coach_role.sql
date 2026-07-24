-- Auto-set role='coach' for team creators
-- When a user creates a team, they become the coach

-- Function to auto-set coach role for team creators
CREATE OR REPLACE FUNCTION public.handle_team_created()
RETURNS TRIGGER AS $$
BEGIN
  -- Set the team creator as coach
  UPDATE profiles 
  SET role = 'coach', is_admin = true
  WHERE user_id = NEW.coach_id;
  
  RETURN NEW;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

-- Trigger on new team creation
CREATE TRIGGER on_team_created
  AFTER INSERT ON teams
  FOR EACH ROW EXECUTE FUNCTION public.handle_team_created();
