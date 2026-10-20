-- ============================================================
-- Migration 022: Fix "relation profiles does not exist" on event edits
-- ============================================================
-- Symptom:
--   Editing an event on the Events page failed with
--       Failed to save: relation "profiles" does not exist
--   Status 404, code 42P01. Creating an event worked, and editing a
--   training worked, but editing a *match* always failed.
--
-- Cause:
--   The BEFORE UPDATE OF type trigger from migration 019 was created
--   with `SET search_path = ''`:
--
--       CREATE FUNCTION prevent_reserved_training_type_change() ...
--       $$ LANGUAGE plpgsql SET search_path = '';
--
--   That empty search_path is inherited by the whole UPDATE statement
--   when PostgREST prepares and executes it. Referential-integrity
--   checks (events.captain_id -> profiles(id) is re-checked on every
--   update) and other internal name lookups are then resolved with
--   `public` no longer visible, so Postgres raises 42P01 for the bare
--   name `profiles`.
--
--     * Editing a training  -> trigger skips (NEW.type = 'training'),
--                              so it worked.
--     * Editing a match     -> trigger body runs, the empty
--                              search_path leaks into the statement,
--                              and internal `profiles` lookups fail.
--     * Disabling this one trigger made matches save fine, which
--       pinned the cause to this function.
--
--   Other trigger functions share the same `SET search_path = ''`
--   style (stamp_reservation_payment_paid_at, protect_reservation_columns,
--   protect_reservation_payment_amount, cleanup_availability_on_team_change,
--   generate_invite_code, handle_team_created). They were NOT touched
--   here: they are on write paths that do not revalidate a profiles
--   foreign key, so they do not exhibit the failure and changing them
--   would be risk without evidence. Revisit only if they ever throw
--   42P01.
--
-- Fix:
--   Re-create the trigger function WITHOUT the pinned empty
--   search_path. It is a plain (non-SECURITY-DEFINER) trigger
--   function: it runs with the caller's privileges, so the
--   migration-020 search_path hardening is not required for it, and
--   removing it restores normal name resolution for the statement.
--
--   The table reference inside the body stays fully qualified
--   (public.reservations), so the function itself remains unambiguous.
--
-- Behaviour is unchanged: a training that has a pitch reservation
-- still cannot be changed into a match.
--
-- Idempotent and safe to re-run.

CREATE OR REPLACE FUNCTION public.prevent_reserved_training_type_change()
RETURNS TRIGGER
LANGUAGE plpgsql
AS $fn$
BEGIN
  IF NEW.type <> 'training'
     AND EXISTS (
       SELECT 1 FROM public.reservations WHERE event_id = NEW.id
     ) THEN
    RAISE EXCEPTION 'Cancel the pitch reservation before changing this training to a match';
  END IF;
  RETURN NEW;
END;
$fn$;
