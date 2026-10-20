-- ============================================================
-- Migration 023: Fix infinite recursion in reservation policies
-- ============================================================
-- Symptom:
--   Editing or cancelling a reservation failed with
--       infinite recursion detected in policy for relation "reservations"
--   Status 500, code 42P17. The reservation list and the "mark my share
--   as paid" action worked; only editing/cancelling broke.
--
-- Cause:
--   The UPDATE/DELETE policies from migration 019 ask "has this
--   reservation been split yet?" by reading reservation_payments:
--
--       NOT EXISTS (SELECT 1 FROM reservation_payments p
--                   WHERE p.reservation_id = reservations.id)
--
--   But the SELECT policy on reservation_payments reads reservations
--   back (to check the event's team), and evaluating any non-SELECT
--   command on reservations re-enters its own UPDATE/DELETE policy.
--   reservations -> reservation_payments -> reservations -> ... so
--   Postgres aborts with 42P17.
--
--   It only surfaced once a reservation actually had payment rows to
--   look at -- i.e. after a split was finalized, or as soon as anyone
--   marked a share paid. Before that the EXISTS short-circuited or
--   matched nothing in a way that didn't recurse.
--
-- Fix:
--   Move the "has payments?" test into a SECURITY DEFINER helper.
--   The helper runs as its owner, so its read of reservation_payments
--   does not re-enter RLS and the cycle is broken. It answers a single
--   yes/no question about one reservation id, so it exposes nothing
--   the caller could not already see.
--
--   Access rules are otherwise unchanged:
--     * only the creator or a team admin may edit/cancel,
--     * and only while no payment row exists (frozen otherwise),
--     * players can still mark their own share paid,
--     * payment amounts stay frozen.
--
-- Idempotent and safe to re-run.

CREATE OR REPLACE FUNCTION public.reservation_has_payments(p_reservation_id uuid)
RETURNS boolean
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = ''
AS $fn$
  SELECT EXISTS (
    SELECT 1 FROM public.reservation_payments
    WHERE reservation_id = p_reservation_id
  );
$fn$;

GRANT EXECUTE ON FUNCTION public.reservation_has_payments(uuid) TO authenticated;

DROP POLICY IF EXISTS "Creators and admins can update their reservation" ON reservations;
CREATE POLICY "Creators and admins can update their reservation" ON reservations
  FOR UPDATE USING (
    NOT public.reservation_has_payments(id)
    AND EXISTS (
      SELECT 1 FROM profiles me
      WHERE me.user_id = auth.uid()
        AND me.team_id = (SELECT team_id FROM events WHERE id = reservations.event_id)
        AND (me.is_admin = true OR reservations.created_by = me.id)
    )
  );

DROP POLICY IF EXISTS "Creators and admins can cancel their reservation" ON reservations;
CREATE POLICY "Creators and admins can cancel their reservation" ON reservations
  FOR DELETE USING (
    NOT public.reservation_has_payments(id)
    AND EXISTS (
      SELECT 1 FROM profiles me
      WHERE me.user_id = auth.uid()
        AND me.team_id = (SELECT team_id FROM events WHERE id = reservations.event_id)
        AND (me.is_admin = true OR reservations.created_by = me.id)
    )
  );
