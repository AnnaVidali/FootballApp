-- ============================================================
-- Migration 045: final review guards
-- ============================================================
-- Three gaps found in the last review pass, all of them reachable from
-- the UI even though the app already tried to prevent them:
--
--   1. deleting an event cascaded away its reservations and the payment
--      shares that migration 040 freezes, so the split could be erased
--      in one click;
--   2. an admin who was not the owner could demote the owner through the
--      roster form, leaving a team whose owner has no admin rights;
--   3. set_pieces had the same cross-team player hole migration 041
--      closed for lineups.
--
-- This migration only adds guards. It does not touch grants: no table is
-- created here, and the existing least-privilege grants stay as they are.

-- ---------------------------------------------------------------
-- 1. A settled reservation survives the deletion of its event.
-- ---------------------------------------------------------------
-- Migration 040 deliberately lets cascades through the reservation
-- trigger, because removing the parent used to be a legitimate way to
-- remove a reservation. Now that the split is a record of money owed,
-- that escape hatch also erased the shares. Reject the parent delete
-- while payments exist.
--
-- The function is SECURITY INVOKER (like migration 035's profile guard),
-- so `current_user` still distinguishes a direct write by an
-- authenticated user from an internal SECURITY DEFINER routine such as
-- disband_team(), which is allowed to tear the whole team down. RLS on
-- reservations/reservation_payments already lets a team admin see these
-- rows, so the lookup needs no elevated rights.

CREATE OR REPLACE FUNCTION public.prevent_event_delete_with_settled_reservation()
RETURNS trigger
LANGUAGE plpgsql
SET search_path = ''
AS $fn$
BEGIN
  IF current_user <> 'authenticated' AND current_user <> 'anon' THEN
    RETURN OLD;
  END IF;

  IF EXISTS (
    SELECT 1
    FROM public.reservations r
    WHERE r.event_id = OLD.id
      AND EXISTS (
        SELECT 1
        FROM public.reservation_payments rp
        WHERE rp.reservation_id = r.id
      )
  ) THEN
    RAISE EXCEPTION 'A training with settled reservation payments cannot be deleted'
      USING ERRCODE = '42501';
  END IF;

  RETURN OLD;
END;
$fn$;

DROP TRIGGER IF EXISTS prevent_event_delete_with_settled_reservation ON public.events;
CREATE TRIGGER prevent_event_delete_with_settled_reservation
  BEFORE DELETE ON public.events
  FOR EACH ROW
  EXECUTE FUNCTION public.prevent_event_delete_with_settled_reservation();

REVOKE ALL ON FUNCTION public.prevent_event_delete_with_settled_reservation() FROM PUBLIC;

-- ---------------------------------------------------------------
-- 2. Only the owner may change the owner's admin/coach/team flags.
-- ---------------------------------------------------------------
-- Migration 035's guard allows any team admin to change these columns
-- for members, and separately allows the owner to change their own. It
-- missed the case where the member being edited *is* the owner but the
-- editor is somebody else. The roster page had the same gap, so this
-- trigger backs up the UI fix.

CREATE OR REPLACE FUNCTION public.protect_owner_privileged_columns()
RETURNS trigger
LANGUAGE plpgsql
SET search_path = ''
AS $fn$
BEGIN
  -- Trusted internal writes (transfer_ownership, disband_team,
  -- admin_remove_player) self-authorize before they write.
  IF current_user <> 'authenticated' AND current_user <> 'anon' THEN
    RETURN NEW;
  END IF;

  IF TG_OP = 'INSERT' THEN
    RETURN NEW;
  END IF;

  -- Name / position / shirt_number edits stay open to team admins.
  IF NEW.team_id IS NOT DISTINCT FROM OLD.team_id
     AND NEW.is_admin IS NOT DISTINCT FROM OLD.is_admin
     AND NEW.role IS NOT DISTINCT FROM OLD.role THEN
    RETURN NEW;
  END IF;

  IF OLD.user_id <> auth.uid()
     AND EXISTS (
       SELECT 1
       FROM public.teams t
       WHERE t.id = OLD.team_id AND t.owner_id = OLD.user_id
     ) THEN
    RAISE EXCEPTION 'Only the team owner can change the owner privileges'
      USING ERRCODE = '42501';
  END IF;

  RETURN NEW;
END;
$fn$;

DROP TRIGGER IF EXISTS protect_owner_privileged_columns ON public.profiles;
CREATE TRIGGER protect_owner_privileged_columns
  BEFORE UPDATE ON public.profiles
  FOR EACH ROW
  EXECUTE FUNCTION public.protect_owner_privileged_columns();

REVOKE ALL ON FUNCTION public.protect_owner_privileged_columns() FROM PUBLIC;

-- ---------------------------------------------------------------
-- 3. A set piece taker must belong to the event's team.
-- ---------------------------------------------------------------
-- Same fix as migration 041 for lineups: USING is left alone so old
-- rows remain deletable, while new/updated rows must point at a player
-- from the same team as their event.

DROP POLICY IF EXISTS "Admins can manage set pieces" ON public.set_pieces;

CREATE POLICY "Admins can manage set pieces" ON public.set_pieces
  FOR ALL
  USING (
    event_id IN (
      SELECT id
      FROM public.events
      WHERE team_id IN (
        SELECT team_id
        FROM public.profiles
        WHERE user_id = auth.uid()
          AND is_admin = true
      )
    )
  )
  WITH CHECK (
    event_id IN (
      SELECT id
      FROM public.events
      WHERE team_id IN (
        SELECT team_id
        FROM public.profiles
        WHERE user_id = auth.uid()
          AND is_admin = true
      )
    )
    AND EXISTS (
      SELECT 1
      FROM public.events e
      JOIN public.profiles p ON p.team_id = e.team_id
      WHERE e.id = set_pieces.event_id
        AND p.id = set_pieces.player_id
    )
  );
