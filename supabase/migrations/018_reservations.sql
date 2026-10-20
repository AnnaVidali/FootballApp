-- ============================================================
-- Migration 018: Pitch reservations + payment splitting
-- ============================================================
-- A reservation is attached to an existing training event by any
-- team member who paid for the pitch upfront. Once the RSVP deadline
-- closes, the cost is split between the players who said "available"
-- and everyone else can self-report their Bizum repayment.
--
-- People columns reference profiles(id) (newer convention, same as
-- gallery_items/lineups/set_pieces); the join to availability goes
-- through profiles.user_id.

-- 1. One reservation per training event.
CREATE TABLE reservations (
  id UUID DEFAULT gen_random_uuid() PRIMARY KEY,
  event_id UUID NOT NULL UNIQUE REFERENCES events(id) ON DELETE CASCADE,
  created_by UUID NOT NULL REFERENCES profiles(id) ON DELETE CASCADE,
  amount NUMERIC(10, 2) NOT NULL,
  created_at TIMESTAMPTZ DEFAULT now() NOT NULL,
  CONSTRAINT reservations_amount_positive CHECK (amount > 0)
);

-- 2. Who owes a share of a reservation. `amount` is frozen when the split is
--    finalized so a later RSVP change can never move what someone owes.
CREATE TABLE reservation_payments (
  id UUID DEFAULT gen_random_uuid() PRIMARY KEY,
  reservation_id UUID NOT NULL REFERENCES reservations(id) ON DELETE CASCADE,
  user_id UUID NOT NULL REFERENCES profiles(id) ON DELETE CASCADE,
  amount NUMERIC(10, 2) NOT NULL,
  paid BOOLEAN DEFAULT false NOT NULL,
  paid_at TIMESTAMPTZ,
  created_at TIMESTAMPTZ DEFAULT now() NOT NULL,
  CONSTRAINT reservation_payments_reservation_user_key UNIQUE (reservation_id, user_id)
);

ALTER TABLE reservations ENABLE ROW LEVEL SECURITY;
ALTER TABLE reservation_payments ENABLE ROW LEVEL SECURITY;

-- 3. Anyone on the team can see reservations for their team's events.
CREATE POLICY "Team members can view reservations" ON reservations
  FOR SELECT USING (
    event_id IN (
      SELECT id FROM events WHERE team_id IN (
        SELECT team_id FROM profiles WHERE user_id = auth.uid()
      )
    )
  );

-- 4. Any team member can attach a reservation to one of their trainings.
--    The `type = 'training'` predicate is the training-only guard: a match
--    can never get a reservation (a plain CHECK can't reference events).
CREATE POLICY "Team members can create reservations" ON reservations
  FOR INSERT WITH CHECK (
    created_by IN (SELECT id FROM profiles WHERE user_id = auth.uid())
    AND event_id IN (
      SELECT id FROM events
      WHERE type = 'training'
        AND team_id IN (SELECT team_id FROM profiles WHERE user_id = auth.uid())
    )
  );

-- 5. The whole team can read the payment list of their reservations.
CREATE POLICY "Team members can view reservation payments" ON reservation_payments
  FOR SELECT USING (
    reservation_id IN (
      SELECT r.id FROM reservations r
      JOIN events e ON e.id = r.event_id
      WHERE e.team_id IN (SELECT team_id FROM profiles WHERE user_id = auth.uid())
    )
  );

-- 6. People can only mark their own share as paid.
CREATE POLICY "Players can update their own reservation payment" ON reservation_payments
  FOR UPDATE USING (
    user_id IN (SELECT id FROM profiles WHERE user_id = auth.uid())
  );

-- 7. Freeze the money columns: self-reporting may only flip `paid`/`paid_at`.
CREATE OR REPLACE FUNCTION protect_reservation_payment_amount()
RETURNS TRIGGER AS $$
BEGIN
  IF NEW.reservation_id <> OLD.reservation_id
     OR NEW.user_id <> OLD.user_id
     OR NEW.amount <> OLD.amount THEN
    RAISE EXCEPTION 'Only the paid status of a share can be changed';
  END IF;
  RETURN NEW;
END;
$$ LANGUAGE plpgsql SET search_path = '';

CREATE TRIGGER protect_reservation_payment_amount
  BEFORE UPDATE ON reservation_payments
  FOR EACH ROW EXECUTE FUNCTION protect_reservation_payment_amount();

-- 8. Finalize the split once RSVPs have closed. Called from the client via
--    supabase.rpc() once the deadline has passed. Idempotent, and the only
--    place that inserts into reservation_payments (clients have no INSERT
--    grant there). Participants = yes-list (players only) + the creator.
CREATE OR REPLACE FUNCTION finalize_reservation_split(p_reservation_id UUID)
RETURNS VOID AS $$
DECLARE
  v_event_id UUID;
  v_amount NUMERIC;
  v_created_by UUID;
  v_event_date TIMESTAMPTZ;
  v_event_type TEXT;
  v_team_id UUID;
  v_participants UUID[];
  v_count INTEGER;
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

  IF NOT EXISTS (
    SELECT 1 FROM public.profiles WHERE user_id = auth.uid() AND team_id = v_team_id
  ) THEN
    RAISE EXCEPTION 'Not authorized: you are not a member of this team';
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

  -- Players who said "available" for the training.
  SELECT array_agg(DISTINCT p.id) INTO v_participants
  FROM public.availability a
  JOIN public.profiles p ON p.user_id = a.user_id
  WHERE a.event_id = v_event_id
    AND a.status = 'available'
    AND p.role <> 'coach';

  v_participants := COALESCE(v_participants, ARRAY[]::UUID[]);

  -- The person who fronted the money is always part of the split.
  IF NOT (v_created_by = ANY (v_participants)) THEN
    v_participants := v_participants || v_created_by;
  END IF;

  v_count := array_length(v_participants, 1);
  IF v_count IS NULL THEN
    RETURN;
  END IF;

  -- Rounded share for everyone. The creator (no payment row) absorbs the
  -- rounding remainder, so the rows always reconcile against the total.
  v_share := round(v_amount / v_count, 2);

  INSERT INTO public.reservation_payments (reservation_id, user_id, amount)
  SELECT p_reservation_id, t.pid, v_share
  FROM unnest(v_participants) AS t(pid)
  WHERE t.pid <> v_created_by;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER SET search_path = '';

GRANT EXECUTE ON FUNCTION finalize_reservation_split(UUID) TO authenticated;

GRANT SELECT, INSERT ON reservations TO authenticated;
GRANT SELECT, UPDATE ON reservation_payments TO authenticated;
