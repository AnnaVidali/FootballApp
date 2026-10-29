-- ============================================================
-- Migration 040: a settled reservation can no longer be changed
-- ============================================================
-- Audit M-2: the UPDATE/DELETE policies on `reservations` check
-- `reservation_has_payments(id)` during the scan, before the row is
-- locked. A concurrent `finalize_reservation_split()` could take the
-- row lock, read "no payments yet", insert the shares and commit
-- between that check and the update/delete. The policy would then
-- let the change through on the old snapshot.
--
-- 036 made the split take `FOR UPDATE` on the reservation. This
-- migration closes the other side of the race: a BEFORE UPDATE OR
-- DELETE trigger takes the same row lock *before* it looks at the
-- payments. Whichever transaction gets the lock first wins:
--
--   * split first  -> the change waits, then sees the committed
--                     payment rows and is rejected;
--   * change first -> the split waits, then reads the new amount
--                     (or finds no reservation when it was deleted).
--
-- The trigger is SECURITY DEFINER so the self-lookup on
-- `reservations` bypasses RLS instead of recursing back into the
-- policies that call it. Updates that leave `amount` untouched are
-- allowed: `close_reservation()` / `reopen_reservation()` only set
-- `closed_at` and have to keep working after the split exists.
-- Deletes that cascade from an event, team or profile are left alone;
-- deleting the parent already requires its own permission and still
-- removes the reservation and its shares.
--
-- CREATE OR REPLACE / DROP TRIGGER IF EXISTS keep this re-runnable.

CREATE OR REPLACE FUNCTION public.prevent_reservation_change_after_split()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = ''
AS $fn$
BEGIN
  -- A delete that cascades from an event, team or profile is already
  -- authorised by the parent row and must keep its ON DELETE CASCADE
  -- behaviour. A direct DELETE on this table is a top-level trigger
  -- (depth 1); a cascade is nested (depth > 1).
  IF TG_OP = 'DELETE' AND pg_trigger_depth() > 1 THEN
    RETURN OLD;
  END IF;

  -- Same lock finalize_reservation_split() takes, so the payment
  -- snapshot below cannot change between the check and the write.
  PERFORM 1
  FROM public.reservations
  WHERE id = OLD.id
  FOR UPDATE;

  -- close_reservation()/reopen_reservation() only touch closed_at and
  -- must keep working after the split exists. Everything else that
  -- changes the money or removes the row is frozen from here on.
  IF TG_OP = 'UPDATE' AND NEW.amount IS NOT DISTINCT FROM OLD.amount THEN
    RETURN NEW;
  END IF;

  IF EXISTS (
    SELECT 1
    FROM public.reservation_payments
    WHERE reservation_id = OLD.id
  ) THEN
    IF TG_OP = 'DELETE' THEN
      RAISE EXCEPTION 'A reservation with a split cannot be cancelled'
        USING ERRCODE = '42501';
    END IF;
    RAISE EXCEPTION 'The amount of a reservation with a split cannot be changed'
      USING ERRCODE = '42501';
  END IF;

  IF TG_OP = 'DELETE' THEN
    RETURN OLD;
  END IF;
  RETURN NEW;
END;
$fn$;

DROP TRIGGER IF EXISTS prevent_reservation_change_after_split ON public.reservations;
CREATE TRIGGER prevent_reservation_change_after_split
  BEFORE UPDATE OR DELETE ON public.reservations
  FOR EACH ROW
  EXECUTE FUNCTION public.prevent_reservation_change_after_split();

-- Trigger functions are invoked without an EXECUTE check, and this one
-- has no business being callable from the API.
REVOKE ALL ON FUNCTION public.prevent_reservation_change_after_split() FROM PUBLIC;
