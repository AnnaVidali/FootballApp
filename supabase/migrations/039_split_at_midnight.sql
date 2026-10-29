-- ============================================================
-- Migration 039: finalize the split at the RSVP deadline
-- ============================================================
-- 034 and 036 only allowed the split from 25 hours before kickoff.
-- That was the old training RSVP deadline. Trainings now close at
-- midnight on their own day (getAvailabilityDeadline in
-- lib/utils.ts), so the RPC gate was stale: for an evening training
-- it opened the split the previous afternoon, hours before RSVPs
-- closed, while the UI said the split was not available yet.
--
-- The RSVP deadline is midnight in the viewer's timezone, which the
-- database cannot know on its own. The client therefore passes its
-- IANA timezone and the function computes the same instant the
-- browser does:
--
--   date_trunc('day', event_date AT TIME ZONE tz) AT TIME ZONE tz
--
-- The round trip through a local timestamp mirrors `new Date(y, m, d)`
-- in the browser, including DST. An unknown timezone makes the
-- statement fail, which is the right outcome: a clear error beats a
-- silently different deadline.
--
-- The old two-argument signature is kept as a thin wrapper for the
-- few minutes where an old deployment can still call it. It uses the
-- team's timezone; drop it once every client passes p_timezone.

CREATE OR REPLACE FUNCTION public.finalize_reservation_split(
  p_reservation_id UUID,
  p_participants UUID[],
  p_timezone TEXT
) RETURNS VOID AS $$
DECLARE
  v_event_id UUID;
  v_amount NUMERIC;
  v_created_by UUID;
  v_event_date TIMESTAMPTZ;
  v_event_type TEXT;
  v_team_id UUID;
  v_participants UUID[];
  v_count INTEGER;
  v_count_input INTEGER;
  v_share NUMERIC;
  v_deadline TIMESTAMPTZ;
BEGIN
  IF p_timezone IS NULL OR btrim(p_timezone) = '' THEN
    RAISE EXCEPTION 'A timezone is required to calculate the RSVP deadline';
  END IF;

  SELECT r.event_id, r.amount, r.created_by, e.date, e.type, e.team_id
    INTO v_event_id, v_amount, v_created_by, v_event_date, v_event_type, v_team_id
  FROM public.reservations r
  JOIN public.events e ON e.id = r.event_id
  WHERE r.id = p_reservation_id
  FOR UPDATE OF r;

  IF v_event_id IS NULL THEN
    RAISE EXCEPTION 'Reservation not found';
  END IF;

  IF v_event_type <> 'training' THEN
    RAISE EXCEPTION 'Reservations only apply to trainings';
  END IF;

  -- Only the person who fronted the money (or an admin) settles the split.
  IF NOT EXISTS (
    SELECT 1 FROM public.profiles me
    WHERE me.user_id = auth.uid()
      AND me.team_id = v_team_id
      AND (me.is_admin = true OR me.id = v_created_by)
  ) THEN
    RAISE EXCEPTION 'Not authorized: only the person who reserved the pitch (or an admin) can split';
  END IF;

  -- Already finalized: never recompute (frozen amounts win).
  IF EXISTS (
    SELECT 1 FROM public.reservation_payments WHERE reservation_id = p_reservation_id
  ) THEN
    RETURN;
  END IF;

  -- Midnight on the event day in the caller's timezone, exactly like
  -- getAvailabilityDeadline() in the browser.
  v_deadline := date_trunc('day', v_event_date AT TIME ZONE p_timezone)
                AT TIME ZONE p_timezone;

  IF now() < v_deadline THEN
    RAISE EXCEPTION 'The split is calculated once RSVPs close at midnight';
  END IF;

  IF COALESCE(array_length(p_participants, 1), 0) = 0 THEN
    RAISE EXCEPTION 'Pick at least one player';
  END IF;

  -- Distinct players of this team. Coaches are never charged, and a
  -- list containing anyone else (a coach, another team) is rejected
  -- so the picker and the split can never disagree.
  SELECT array_agg(DISTINCT p.id) INTO v_participants
  FROM public.profiles p
  WHERE p.id = ANY (p_participants)
    AND p.team_id = v_team_id
    AND p.role <> 'coach';

  v_count := COALESCE(array_length(v_participants, 1), 0);
  v_count_input := (SELECT count(DISTINCT u) FROM unnest(p_participants) AS u);

  IF v_count = 0 OR v_count < v_count_input THEN
    RAISE EXCEPTION 'Participants must be players of your team';
  END IF;

  -- Equal share in whole cents, rounded to nearest cent.
  v_share := round((v_amount * 100) / v_count) / 100;

  INSERT INTO public.reservation_payments (reservation_id, user_id, amount, paid, paid_at)
  SELECT
    p_reservation_id,
    t.pid,
    v_share,
    t.pid = v_created_by,
    CASE WHEN t.pid = v_created_by THEN now() END
  FROM unnest(v_participants) WITH ORDINALITY AS t(pid, ord);
END;
$$ LANGUAGE plpgsql SECURITY DEFINER SET search_path = '';

REVOKE ALL ON FUNCTION public.finalize_reservation_split(UUID, UUID[], TEXT) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.finalize_reservation_split(UUID, UUID[], TEXT) TO authenticated;
GRANT EXECUTE ON FUNCTION public.finalize_reservation_split(UUID, UUID[], TEXT) TO service_role;

-- Deprecated compatibility wrapper for a client that predates the
-- p_timezone argument. The team's timezone is the best available
-- default until that client is replaced.
CREATE OR REPLACE FUNCTION public.finalize_reservation_split(
  p_reservation_id UUID,
  p_participants UUID[]
) RETURNS VOID AS $$
BEGIN
  PERFORM public.finalize_reservation_split(
    p_reservation_id,
    p_participants,
    'Europe/Madrid'
  );
END;
$$ LANGUAGE plpgsql SECURITY DEFINER SET search_path = '';

REVOKE ALL ON FUNCTION public.finalize_reservation_split(UUID, UUID[]) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.finalize_reservation_split(UUID, UUID[]) TO authenticated;
GRANT EXECUTE ON FUNCTION public.finalize_reservation_split(UUID, UUID[]) TO service_role;
