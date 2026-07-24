-- Grant base table permissions to authenticated role
-- RLS filters rows, but the role needs table-level privileges first

GRANT SELECT, INSERT, UPDATE, DELETE ON teams TO authenticated;
GRANT SELECT, INSERT, UPDATE, DELETE ON profiles TO authenticated;
GRANT SELECT, INSERT, UPDATE, DELETE ON events TO authenticated;
GRANT SELECT, INSERT, UPDATE, DELETE ON availability TO authenticated;
GRANT SELECT, INSERT, UPDATE, DELETE ON lineups TO authenticated;
