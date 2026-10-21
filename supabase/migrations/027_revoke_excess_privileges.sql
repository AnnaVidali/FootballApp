-- ============================================================
-- Migration 027: Take back the table privileges nobody should have
-- ============================================================
-- Problem:
--   Migration 005 only ever GRANTed. Every table therefore kept the
--   default privileges Supabase hands out to `anon` and
--   `authenticated`: TRUNCATE, REFERENCES and TRIGGER.
--
--   Consequences:
--     * `anon` could TRUNCATE every application table. RLS does not
--       apply to TRUNCATE, so a single unauthenticated request was
--       enough to wipe the whole database.
--     * TRIGGER lets a role create triggers on the table, which is a
--       privilege no part of this application needs.
--
-- Fix:
--   Revoke everything and grant only the commands the app actually
--   uses. RLS still decides which *rows* a user may touch; these
--   privileges decide which *commands* are possible at all.
--
--   This migration is idempotent: REVOKE and GRANT can be repeated.

DO $$
DECLARE
  tbl text;
BEGIN
  FOREACH tbl IN ARRAY ARRAY[
    'availability',
    'events',
    'gallery_items',
    'lineups',
    'profiles',
    'reservation_payments',
    'reservations',
    'set_pieces',
    'teams'
  ]
  LOOP
    EXECUTE format('REVOKE ALL ON TABLE public.%I FROM anon', tbl);
    EXECUTE format('REVOKE ALL ON TABLE public.%I FROM authenticated', tbl);
  END LOOP;
END $$;

-- `anon` gets no table privileges at all. Every read the public pages
-- need goes through a SECURITY DEFINER function instead.

-- Regular tables: the app reads and writes rows, never truncates and
-- never creates triggers.
GRANT SELECT, INSERT, UPDATE, DELETE ON
  public.availability,
  public.events,
  public.lineups,
  public.profiles,
  public.reservations,
  public.set_pieces,
  public.teams
TO authenticated;

-- Gallery items are created and removed, but never edited in place.
GRANT SELECT, INSERT, DELETE ON public.gallery_items TO authenticated;

-- Payments are created by the server side `finalize_reservation_split`
-- routine and only their status is updated from the browser.
GRANT SELECT, UPDATE ON public.reservation_payments TO authenticated;

-- --------------------------------------------------------------
-- The service role.
-- --------------------------------------------------------------
-- The server side routes use the service role key. The delete
-- account route reads the profile and the team of the account it is
-- about to remove, to refuse the deletion of a team owner. It could
-- not: `service_role` only ever had the default TRUNCATE, TRIGGER
-- and REFERENCES privileges, so both reads failed with
-- "permission denied for table profiles". The error was swallowed,
-- the ownership check was skipped, and the account of a team owner
-- was deleted anyway (which then failed on the teams.owner_id
-- foreign key, with an error the user could not make sense of).
--
-- `service_role` bypasses RLS, so the privileges decide what the
-- server can do, and nothing else. This restores the Supabase
-- default for that role.
GRANT SELECT, INSERT, UPDATE, DELETE ON
  public.availability,
  public.events,
  public.gallery_items,
  public.lineups,
  public.profiles,
  public.reservation_payments,
  public.reservations,
  public.set_pieces,
  public.teams
TO service_role;

-- --------------------------------------------------------------
-- Functions: Supabase gives every new function EXECUTE to PUBLIC.
-- --------------------------------------------------------------
-- `finalize_reservation_split` writes rows into reservation_payments
-- and `reservation_has_payments` is called from the UPDATE and DELETE
-- policies of `reservations`. Both of them check the caller inside the
-- function, so PUBLIC EXECUTE is not what keeps them safe -- but it
-- does mean that `anon` can call them, and the split routine is a
-- write path.
--
-- Both are called with an authenticated session (the reservations
-- page) or from a policy that only `authenticated` can reach, because
-- `anon` no longer holds UPDATE or DELETE on `reservations` after the
-- grants above. So `authenticated` is the only role that needs
-- EXECUTE.
REVOKE ALL ON FUNCTION public.finalize_reservation_split(uuid, uuid[]) FROM PUBLIC;
REVOKE ALL ON FUNCTION public.reservation_has_payments(uuid) FROM PUBLIC;

GRANT EXECUTE ON FUNCTION public.finalize_reservation_split(uuid, uuid[]) TO authenticated;
GRANT EXECUTE ON FUNCTION public.reservation_has_payments(uuid) TO authenticated;
GRANT EXECUTE ON FUNCTION public.finalize_reservation_split(uuid, uuid[]) TO service_role;
GRANT EXECUTE ON FUNCTION public.reservation_has_payments(uuid) TO service_role;
