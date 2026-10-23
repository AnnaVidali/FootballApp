-- ============================================================
-- Migration 038: edit a finalized reservation split
-- ============================================================
-- Confirming the "who has to pay" list used to be a one-way door:
-- the split was frozen and the only fix for a forgotten player was
-- to cancel the reservation. The creator (or an admin) can now
-- reopen the picker and save a corrected list.
--
-- The creator's own share is marked paid automatically because they
-- fronted the money, so it does not block an edit. Any *other* paid
-- share is money that has already changed hands and must not be
-- rewritten under a player, so the edit is rejected until those
-- payments are unmarked.
--
-- CREATE OR REPLACE keeps this file re-runnable.
-- Depends on 037 for reservations.closed_at.

CREATE OR REPLACE FUNCTION public.update_reservation_split(
  p_reservation_id UUID,
  p_participants UUID[]
) RETURNS VOID AS $$
DECLARE
  v_event_id UUID;
  v_amount NUMERIC;
  v_created_by UUID;
  v_event_type TEXT;
  v_team_id UUID;
  v_closed_at TIMESTAMPTZ;
  v_participants UUID[];
  v_count INTEGER;
  v_count_input INTEGER;
  v_share NUMERIC;
BEGIN
  SELECT r.event_id, r.amount, r.created_by, r.closed_at, e.type, e.team_id
    INTO v_event_id, v_amount, v_created_by, v_closed_at, v_event_type, v_team_id
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

  -- Only the person who fronted the money (or an admin) edits the split.
  IF NOT EXISTS (
    SELECT 1 FROM public.profiles me
    WHERE me.user_id = auth.uid()
      AND me.team_id = v_team_id
      AND (me.is_admin = true OR me.id = v_created_by)
  ) THEN
    RAISE EXCEPTION 'Not authorized: only the person who reserved the pitch (or an admin) can edit the split';
  END IF;

  IF v_closed_at IS NOT NULL THEN
    RAISE EXCEPTION 'Reopen the reservation before changing the split';
  END IF;

  -- Lock the current shares for the duration of the check + rewrite.
  PERFORM 1
  FROM public.reservation_payments
  WHERE reservation_id = p_reservation_id
  FOR UPDATE;

  IF NOT EXISTS (
    SELECT 1 FROM public.reservation_payments WHERE reservation_id = p_reservation_id
  ) THEN
    RAISE EXCEPTION 'Set the split before editing it';
  END IF;

  -- The creator's row is the upfront payment, not a repayment. Anything
  -- else that is paid is real money already handed over.
  IF EXISTS (
    SELECT 1 FROM public.reservation_payments p
    WHERE p.reservation_id = p_reservation_id
      AND p.paid = true
      AND p.user_id <> v_created_by
  ) THEN
    RAISE EXCEPTION 'Some players have already paid; unmark those payments before changing the split';
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

  -- Equal share in whole cents, rounded to nearest cent (same rule as 034).
  v_share := round((v_amount * 100) / v_count) / 100;

  DELETE FROM public.reservation_payments
  WHERE reservation_id = p_reservation_id;

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

GRANT EXECUTE ON FUNCTION public.update_reservation_split(UUID, UUID[]) TO authenticated;
GRANT EXECUTE ON FUNCTION public.update_reservation_split(UUID, UUID[]) TO service_role;
