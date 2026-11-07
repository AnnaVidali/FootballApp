-- ============================================================
-- Migration 041: a lineup only contains players from the event's team
-- ============================================================
-- The existing "Admins can manage lineups" policy scopes the *event*
-- to the admin's team, but not `lineups.player_id`. An admin could
-- therefore insert a profile from another team into their own lineup
-- (the row is readable by their team, so it would expose that
-- player's name). Low severity, but the policy should match the
-- data model: an event and its lineup belong to the same team.
--
-- USING stays as it was so existing rows can still be deleted or
-- corrected; the stricter check is on INSERT/UPDATE via WITH CHECK.
--
-- CREATE POLICY has no IF NOT EXISTS on this PostgreSQL version, so
-- drop first to keep the migration re-runnable.

DROP POLICY IF EXISTS "Admins can manage lineups" ON public.lineups;

CREATE POLICY "Admins can manage lineups" ON public.lineups
  FOR ALL
  USING (
    event_id IN (
      SELECT id
      FROM public.events
      WHERE team_id IN (
        SELECT team_id
        FROM public.profiles
        WHERE user_id = auth.uid()
          AND is_admin = true
      )
    )
  )
  WITH CHECK (
    event_id IN (
      SELECT id
      FROM public.events
      WHERE team_id IN (
        SELECT team_id
        FROM public.profiles
        WHERE user_id = auth.uid()
          AND is_admin = true
      )
    )
    AND EXISTS (
      SELECT 1
      FROM public.events e
      JOIN public.profiles p ON p.team_id = e.team_id
      WHERE e.id = lineups.event_id
        AND p.id = lineups.player_id
    )
  );
