-- ============================================================
-- Migration 019: Reservation lifecycle improvements
-- ============================================================
-- Follow-up to 018:
--   1. `paid_at` is stamped by the database, not the client.
--   2. A reservation can be edited / cancelled, but only by its creator
--      (or a team admin) and only while no payment rows exist yet.
--   3. A training that has a reservation can no longer be turned into a
--      match (that used to leave the reservation orphaned).

-- 1. Keep paid / paid_at in sync automatically.
CREATE OR REPLACE FUNCTION stamp_reservation_payment_paid_at()
RETURNS TRIGGER AS $$
BEGIN
  IF NEW.paid AND NOT OLD.paid THEN
    NEW.paid_at := COALESCE(NEW.paid_at, now());
  ELSIF NOT NEW.paid THEN
    NEW.paid_at := NULL;
  END IF;
  RETURN NEW;
END;
$$ LANGUAGE plpgsql SET search_path = '';

CREATE TRIGGER stamp_reservation_payment_paid_at
  BEFORE UPDATE ON reservation_payments
  FOR EACH ROW EXECUTE FUNCTION stamp_reservation_payment_paid_at();

-- 2. A reservation stays attached to its event, creator and creation time.
CREATE OR REPLACE FUNCTION protect_reservation_columns()
RETURNS TRIGGER AS $$
BEGIN
  IF NEW.id <> OLD.id
     OR NEW.event_id <> OLD.event_id
     OR NEW.created_by <> OLD.created_by
     OR NEW.created_at <> OLD.created_at THEN
    RAISE EXCEPTION 'A reservation cannot be moved to another event or creator';
  END IF;
  RETURN NEW;
END;
$$ LANGUAGE plpgsql SET search_path = '';

CREATE TRIGGER protect_reservation_columns
  BEFORE UPDATE ON reservations
  FOR EACH ROW EXECUTE FUNCTION protect_reservation_columns();

-- 3. The creator (or a team admin) can fix the amount or cancel the
--    reservation, as long as nobody has been assigned a share yet.
CREATE POLICY "Creators and admins can update their reservation" ON reservations
  FOR UPDATE USING (
    NOT EXISTS (
      SELECT 1 FROM reservation_payments p WHERE p.reservation_id = reservations.id
    )
    AND EXISTS (
      SELECT 1 FROM profiles me
      WHERE me.user_id = auth.uid()
        AND me.team_id = (SELECT team_id FROM events WHERE id = reservations.event_id)
        AND (me.is_admin = true OR reservations.created_by = me.id)
    )
  );

CREATE POLICY "Creators and admins can cancel their reservation" ON reservations
  FOR DELETE USING (
    NOT EXISTS (
      SELECT 1 FROM reservation_payments p WHERE p.reservation_id = reservations.id
    )
    AND EXISTS (
      SELECT 1 FROM profiles me
      WHERE me.user_id = auth.uid()
        AND me.team_id = (SELECT team_id FROM events WHERE id = reservations.event_id)
        AND (me.is_admin = true OR reservations.created_by = me.id)
    )
  );

GRANT UPDATE, DELETE ON reservations TO authenticated;

-- 4. Don't let a reserved training become a match.
CREATE OR REPLACE FUNCTION prevent_reserved_training_type_change()
RETURNS TRIGGER AS $$
BEGIN
  IF NEW.type <> 'training'
     AND EXISTS (SELECT 1 FROM public.reservations WHERE event_id = NEW.id) THEN
    RAISE EXCEPTION 'Cancel the pitch reservation before changing this training to a match';
  END IF;
  RETURN NEW;
END;
$$ LANGUAGE plpgsql SET search_path = '';

CREATE TRIGGER prevent_reserved_training_type_change
  BEFORE UPDATE OF type ON events
  FOR EACH ROW EXECUTE FUNCTION prevent_reserved_training_type_change();
