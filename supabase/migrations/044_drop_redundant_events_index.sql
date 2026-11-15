-- ============================================================
-- Migration 044: drop the index made redundant by 036
-- ============================================================
-- Migration 025 added a single-column index on events(team_id)
-- because that column had no index of its own at the time. Migration
-- 036 then added events(team_id, date) for the Events page. A
-- composite index whose leading column is team_id can serve every
-- lookup the single-column index could, so the pair is redundant:
-- the old one is now only write overhead (and extra WAL) on every
-- event insert, update and delete.
--
-- Nothing else indexes team_id as a leading column, and no query
-- filters events by team_id without also being happy to use the
-- composite (the app always orders events by date). Dropping is safe
-- and idempotent.

DROP INDEX IF EXISTS public.events_team_id_idx;
