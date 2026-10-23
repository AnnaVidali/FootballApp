-- ============================================================
-- Migration 037: close a reservation once everyone has paid
-- ============================================================
-- Fully paid reservations used to stay in the list forever, taking
-- up the same space as an active one. The person who reserved the
-- pitch (or an admin) can now close it; the UI moves it into a
-- collapsed section. Reopening brings it back if a share needs to
-- be marked unpaid again.
--
-- Closing goes through an RPC so a client can never hide a
-- reservation while a share is still outstanding. The RPC also
-- checks the same permissions as finalize_reservation_split.
--
-- CREATE OR REPLACE / IF NOT EXISTS keep this file re-runnable.

ALTER TABLE public.reservations
  ADD COLUMN IF NOT EXISTS closed_at TIMESTAMPTZ;

CREATE OR REPLACE FUNCTION close_reservation(p_reservation_id UUID)
RETURNS VOID AS $$
DECLARE
  v_event_id UUID;
  v_created_by UUID;
  v_team_id UUID;
  v_total INTEGER;
  v_unpaid INTEGER;
BEGIN
  SELECT r.event_id, r.created_by, e.team_id
    INTO v_event_id, v_created_by, v_team_id
  FROM public.reservations r
  JOIN public.events e ON e.id = r.event_id
  WHERE r.id = p_reservation_id;

  IF v_event_id IS NULL THEN
    RAISE EXCEPTION 'Reservation not found';
  END IF;

  IF NOT EXISTS (
    SELECT 1 FROM public.profiles me
    WHERE me.user_id = auth.uid()
      AND me.team_id = v_team_id
      AND (me.is_admin = true OR me.id = v_created_by)
  ) THEN
    RAISE EXCEPTION 'Not authorized: only the person who reserved the pitch (or an admin) can close it';
  END IF;

  SELECT count(*), count(*) FILTER (WHERE NOT p.paid)
    INTO v_total, v_unpaid
  FROM public.reservation_payments p
  WHERE p.reservation_id = p_reservation_id;

  IF v_total = 0 THEN
    RAISE EXCEPTION 'Set the split before closing the reservation';
  END IF;

  IF v_unpaid > 0 THEN
    RAISE EXCEPTION 'Everyone has to pay before the reservation can be closed';
  END IF;

  UPDATE public.reservations
  SET closed_at = now()
  WHERE id = p_reservation_id
    AND closed_at IS NULL;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER SET search_path = '';

CREATE OR REPLACE FUNCTION reopen_reservation(p_reservation_id UUID)
RETURNS VOID AS $$
DECLARE
  v_event_id UUID;
  v_created_by UUID;
  v_team_id UUID;
BEGIN
  SELECT r.event_id, r.created_by, e.team_id
    INTO v_event_id, v_created_by, v_team_id
  FROM public.reservations r
  JOIN public.events e ON e.id = r.event_id
  WHERE r.id = p_reservation_id;

  IF v_event_id IS NULL THEN
    RAISE EXCEPTION 'Reservation not found';
  END IF;

  IF NOT EXISTS (
    SELECT 1 FROM public.profiles me
    WHERE me.user_id = auth.uid()
      AND me.team_id = v_team_id
      AND (me.is_admin = true OR me.id = v_created_by)
  ) THEN
    RAISE EXCEPTION 'Not authorized: only the person who reserved the pitch (or an admin) can reopen it';
  END IF;

  UPDATE public.reservations
  SET closed_at = NULL
  WHERE id = p_reservation_id;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER SET search_path = '';

GRANT EXECUTE ON FUNCTION close_reservation(UUID) TO authenticated;
GRANT EXECUTE ON FUNCTION reopen_reservation(UUID) TO authenticated;
