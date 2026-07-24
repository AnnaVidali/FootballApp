-- Add x/y coordinates for free positioning on the pitch
ALTER TABLE lineups ADD COLUMN pos_x REAL;
ALTER TABLE lineups ADD COLUMN pos_y REAL;
