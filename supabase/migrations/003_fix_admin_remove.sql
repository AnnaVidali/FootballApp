-- Remove a player from the team (set team_id = NULL)
CREATE OR REPLACE FUNCTION admin_remove_player(target_profile_id UUID)
RETURNS VOID AS $$
BEGIN
  UPDATE profiles SET team_id = NULL WHERE id = target_profile_id;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

-- Fix the admin UPDATE policy WITH CHECK to allow setting team_id to NULL
-- (for self-service leave team, and other admin profile edits).
DROP POLICY IF EXISTS "Admins can update team profiles" ON profiles;

CREATE POLICY "Admins can update team profiles" ON profiles
  FOR UPDATE USING (
    team_id IN (SELECT team_id FROM profiles WHERE user_id = auth.uid() AND is_admin = true)
    OR user_id = auth.uid()
  ) WITH CHECK (
    team_id IS NULL
    OR team_id IN (SELECT team_id FROM profiles WHERE user_id = auth.uid() AND is_admin = true)
    OR user_id = auth.uid()
  );
