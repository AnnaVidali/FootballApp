-- ============================================================
-- Migration 021: The split is set by the person who reserved
-- ============================================================
-- Follow-up to 018/019:
--   1. The split is no longer derived from the RSVPs. Once the
--      deadline passes, the creator (or a team admin) picks the
--      exact list of people who split the cost: late joiners are
--      included, anyone who dropped out is left out. Nobody is
--      auto-added -- not even the creator. They only owe a share
--      if they were there too.
--   2. Shares are rounded to cents. The last row absorbs the
--      rounding remainder, so the rows always reconcile against
--      the reservation total.
--   3. The creator's own row (only when they were there) starts
--      as paid: they fronted the money and don't pay themselves.

-- The argument list changed, so the old overload must go first.
DROP FUNCTION IF EXISTS finalize_reservation_split(UUID);

-- CREATE OR REPLACE keeps this file re-runnable; the DROP above removes the
-- old 1-argument signature (OR REPLACE alone cannot change argument lists).
CREATE OR REPLACE FUNCTION finalize_reservation_split(
  p_reservation_id UUID,
  p_participants UUID[]
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
BEGIN
  SELECT r.event_id, r.amount, r.created_by, e.date, e.type, e.team_id
    INTO v_event_id, v_amount, v_created_by, v_event_date, v_event_type, v_team_id
  FROM public.reservations r
  JOIN public.events e ON e.id = r.event_id
  WHERE r.id = p_reservation_id;

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

  IF now() < v_event_date - INTERVAL '25 hours' THEN
    RAISE EXCEPTION 'The split is calculated once RSVPs close';
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

  -- Rounded share in cents. The last row absorbs the rounding
  -- remainder, so the rows always add up to the reservation total.
  v_share := round(v_amount / v_count, 2);

  INSERT INTO public.reservation_payments (reservation_id, user_id, amount, paid, paid_at)
  SELECT
    p_reservation_id,
    t.pid,
    CASE WHEN t.ord = v_count THEN v_amount - (v_share * (v_count - 1)) ELSE v_share END,
    t.pid = v_created_by,
    CASE WHEN t.pid = v_created_by THEN now() END
  FROM unnest(v_participants) WITH ORDINALITY AS t(pid, ord);
END;
$$ LANGUAGE plpgsql SECURITY DEFINER SET search_path = '';

GRANT EXECUTE ON FUNCTION finalize_reservation_split(UUID, UUID[]) TO authenticated;
