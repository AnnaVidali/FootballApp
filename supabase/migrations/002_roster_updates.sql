-- Add shirt_number to profiles
ALTER TABLE profiles ADD COLUMN shirt_number INTEGER;

-- Drop old policies that used role = 'coach'
DROP POLICY IF EXISTS "Coaches can update their team" ON teams;
DROP POLICY IF EXISTS "Coaches can manage events" ON events;
DROP POLICY IF EXISTS "Coaches can manage lineups" ON lineups;

-- Recreate with is_admin checks
CREATE POLICY "Admins can update their team" ON teams
  FOR UPDATE USING (
    id IN (SELECT team_id FROM profiles WHERE user_id = auth.uid() AND is_admin = true)
  );

CREATE POLICY "Admins can manage events" ON events
  FOR ALL USING (
    team_id IN (SELECT team_id FROM profiles WHERE user_id = auth.uid() AND is_admin = true)
  );

CREATE POLICY "Admins can manage lineups" ON lineups
  FOR ALL USING (
    event_id IN (
      SELECT id FROM events WHERE team_id IN (
        SELECT team_id FROM profiles WHERE user_id = auth.uid() AND is_admin = true
      )
    )
  );

-- Allow admins to update team members' profiles
DROP POLICY IF EXISTS "Admins can update team profiles" ON profiles;

CREATE POLICY "Admins can update team profiles" ON profiles
  FOR UPDATE USING (
       team_id IN (SELECT team_id FROM profiles WHERE user_id = auth.uid() AND is_admin = true)
  );

-- Allow admins to view unassigned users
DROP POLICY IF EXISTS "Admins can view unassigned users" ON profiles;

CREATE POLICY "Admins can view unassigned users" ON profiles
  FOR SELECT USING (
     team_id IS NULL
     AND EXISTS (
     SELECT 1 FROM profiles WHERE user_id = auth.uid() AND is_admin = true
     )
  );