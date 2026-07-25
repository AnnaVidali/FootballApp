-- Fix: don't delete the entire team when the coach is removed
-- Change teams.coach_id from ON DELETE CASCADE to ON DELETE SET NULL
ALTER TABLE teams DROP CONSTRAINT teams_coach_id_fkey;
ALTER TABLE teams ADD CONSTRAINT teams_coach_id_fkey
  FOREIGN KEY (coach_id) REFERENCES auth.users(id) ON DELETE SET NULL;
