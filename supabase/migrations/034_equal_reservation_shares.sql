-- ============================================================
-- Migration 034: everyone in a reservation split pays the same
-- ============================================================
-- 021 rounded a share to the nearest cent and let the last row
-- absorb the remainder, so one participant could owe a few cents
-- less (e.g. 30.50 / 13 => 12 x 2.35 + 1 x 2.30). A shared bill
-- has to read the same for everyone, so every row now gets the
-- nearest-cent share:
--
--   round((amount * 100) / count) / 100
--
-- It is *nearest* cent, not the next cent up. A total that does not
-- divide evenly can therefore collect slightly more or slightly less
-- than the reservation amount (30.50 / 13 => 13 x 2.35 = 30.55, five
-- cents over). No single person carries the discrepancy. The amount
-- is not clamped: a share can only round to 0.00 when there is less
-- than half a cent per participant (0.04 split 13 ways), which cannot
-- happen at a real pitch price. Clamping to 0.01 there would collect
-- more than three times the reservation amount, which is worse.
--
-- CREATE OR REPLACE keeps this file re-runnable.

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

GRANT EXECUTE ON FUNCTION finalize_reservation_split(UUID, UUID[]) TO authenticated;
GRANT EXECUTE ON FUNCTION finalize_reservation_split(UUID, UUID[]) TO service_role;

-- One-time repair of splits created before this migration: the old code
-- gave the last row the rounding remainder, so it could sit a few cents
-- below (or above) the rest. Rewrite only unpaid rows, and only when every
-- already-paid row holds the equal share -- money that has been repaid is
-- never changed under a player.
ALTER TABLE public.reservation_payments
  DISABLE TRIGGER protect_reservation_payment_amount;

WITH shares AS (
  SELECT p.reservation_id,
         round((r.amount * 100) / count(*)) / 100 AS share
  FROM public.reservation_payments p
  JOIN public.reservations r ON r.id = p.reservation_id
  GROUP BY p.reservation_id, r.amount
), fixable AS (
  SELECT s.reservation_id, s.share
  FROM shares s
  WHERE EXISTS (
    SELECT 1 FROM public.reservation_payments p
    WHERE p.reservation_id = s.reservation_id
      AND p.amount <> s.share
  )
  AND NOT EXISTS (
    SELECT 1 FROM public.reservation_payments p
    WHERE p.reservation_id = s.reservation_id
      AND p.amount <> s.share
      AND p.paid = true
  )
)
UPDATE public.reservation_payments p
SET amount = f.share
FROM fixable f
WHERE p.reservation_id = f.reservation_id
  AND p.amount <> f.share;

ALTER TABLE public.reservation_payments
  ENABLE TRIGGER protect_reservation_payment_amount;
