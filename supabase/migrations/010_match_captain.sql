-- Add captain_id to events table (per-match captain)
ALTER TABLE events ADD COLUMN captain_id UUID REFERENCES profiles(id) ON DELETE SET NULL;
