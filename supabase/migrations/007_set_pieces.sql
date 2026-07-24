-- Set piece takers per event (fouls, corners, penalties)
CREATE TABLE set_pieces (
  id UUID DEFAULT gen_random_uuid() PRIMARY KEY,
  event_id UUID NOT NULL REFERENCES events(id) ON DELETE CASCADE,
  piece_type TEXT NOT NULL CHECK (piece_type IN ('foul', 'corner', 'penalty')),
  player_id UUID NOT NULL REFERENCES profiles(id) ON DELETE CASCADE,
  created_at TIMESTAMPTZ DEFAULT now() NOT NULL,
  UNIQUE(event_id, piece_type)
);

ALTER TABLE set_pieces ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Team members can view set pieces" ON set_pieces
  FOR SELECT USING (
    event_id IN (
      SELECT id FROM events WHERE team_id IN (
        SELECT team_id FROM profiles WHERE user_id = auth.uid()
      )
    )
  );

CREATE POLICY "Admins can manage set pieces" ON set_pieces
  FOR ALL USING (
    event_id IN (
      SELECT id FROM events WHERE team_id IN (
        SELECT team_id FROM profiles WHERE user_id = auth.uid() AND is_admin = true
      )
    )
  );

GRANT SELECT, INSERT, UPDATE, DELETE ON set_pieces TO authenticated;
