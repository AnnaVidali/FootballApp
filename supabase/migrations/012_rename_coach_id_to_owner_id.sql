-- Rename teams.coach_id to owner_id (team ownership is separate from coach role)
ALTER TABLE teams RENAME COLUMN coach_id TO owner_id;
ALTER TABLE teams DROP CONSTRAINT teams_coach_id_fkey;
ALTER TABLE teams ADD CONSTRAINT teams_owner_id_fkey
  FOREIGN KEY (owner_id) REFERENCES auth.users(id) ON DELETE SET NULL;

-- Update RLS policies that referenced coach_id
DROP POLICY "Coaches can update their team" ON teams;
CREATE POLICY "Owners can update their team" ON teams
  FOR UPDATE USING (owner_id = auth.uid());

DROP POLICY "Users can create teams" ON teams;
CREATE POLICY "Users can create teams" ON teams
  FOR INSERT WITH CHECK (owner_id = auth.uid());

-- Update the trigger that auto-sets coach role for team creators
CREATE OR REPLACE FUNCTION public.handle_team_created()
RETURNS TRIGGER AS $$
BEGIN
  UPDATE profiles 
  SET role = 'coach', is_admin = true
  WHERE user_id = NEW.owner_id;
  
  RETURN NEW;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;
