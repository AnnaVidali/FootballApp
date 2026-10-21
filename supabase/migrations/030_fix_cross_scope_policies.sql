-- ============================================================
-- Migration 030: Close the cross scope write holes
-- ============================================================
-- Two policies wrote rows that were not scoped to the team the
-- writer belongs to. Reading was always team scoped, so a write
-- could land in a team the writer has nothing to do with.
--
-- 1. availability
--    "Users can manage their own availability" was a FOR ALL policy
--    with the single condition `user_id = auth.uid()` and no WITH
--    CHECK. PostgreSQL reuses the USING expression for the check
--    when WITH CHECK is omitted, so the condition that was verified
--    on INSERT was only "this row belongs to me" -- never "this event
--    belongs to my team".
--
--    The consequence: any logged in user could POST an availability
--    row for an event of any other team. The row then shows up in
--    that team's "who is coming" list, and because the event id is
--    part of the unique key (user_id, event_id) the real player can
--    no longer record their own availability for that event.
--
--    The policy is split into one policy per command so that each
--    one can carry the right conditions: the team check belongs on
--    the rows that are written, the ownership check on the rows that
--    are changed.
--
-- 2. gallery_items
--    "Team members can add gallery items" checked `team_id` and
--    `uploaded_by` but not `event_id`. A gallery item could
--    therefore be attached to an event of a different team, which
--    made it visible in that team's event page.
--
-- Both changes are additive for the application: every write the
-- app performs is for an event of the caller's own team.

-- ---------------------------------------------------------------
-- 1. availability
-- ---------------------------------------------------------------
DROP POLICY IF EXISTS "Users can manage their own availability" ON public.availability;

-- A user may always read their own answers.
CREATE POLICY "Users can view their own availability" ON public.availability
  FOR SELECT USING (user_id = auth.uid());

CREATE POLICY "Users can set their own availability" ON public.availability
  FOR INSERT
  WITH CHECK (
    user_id = auth.uid()
    AND event_id IN (
      SELECT e.id FROM public.events e
      WHERE e.team_id = public.get_user_team_id()
    )
  );

CREATE POLICY "Users can update their own availability" ON public.availability
  FOR UPDATE
  USING (user_id = auth.uid())
  WITH CHECK (
    user_id = auth.uid()
    AND event_id IN (
      SELECT e.id FROM public.events e
      WHERE e.team_id = public.get_user_team_id()
    )
  );

CREATE POLICY "Users can delete their own availability" ON public.availability
  FOR DELETE
  USING (user_id = auth.uid());

-- ---------------------------------------------------------------
-- 2. gallery_items
-- ---------------------------------------------------------------
DROP POLICY IF EXISTS "Team members can add gallery items" ON public.gallery_items;
CREATE POLICY "Team members can add gallery items" ON public.gallery_items
  FOR INSERT
  WITH CHECK (
    team_id IN (
      SELECT p.team_id FROM public.profiles p
      WHERE p.user_id = auth.uid()
    )
    AND uploaded_by IN (
      SELECT p.id FROM public.profiles p
      WHERE p.user_id = auth.uid()
    )
    AND (
      event_id IS NULL
      OR event_id IN (
        SELECT e.id FROM public.events e
        WHERE e.team_id = public.get_user_team_id()
      )
    )
  );
