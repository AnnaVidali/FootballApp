-- ============================================================
-- Migration 033: Let an event that has a pitch reservation be edited
-- ============================================================
-- Symptom:
--   Editing an event on the Events page failed with
--       Failed to save: Cancel the pitch reservation before changing this
--       training to a match
--   and none of the admin's changes were stored -- not even the title or
--   the date, which had nothing to do with the type.
--
-- Cause:
--   The trigger from migration 019 is a BEFORE UPDATE OF type trigger.
--   PostgreSQL fires a column trigger whenever the UPDATE statement
--   mentions the column, even when the value does not change. The Events
--   page sends the whole event (title, type, date, location) on every
--   save, so the trigger fired on every save of an event that has a
--   reservation.
--
--   The guard was only ever meant to stop one transition:
--       training -> match
--   But its condition only looked at the NEW value, so a reserved
--   training that stayed a training was fine while a reserved match that
--   stayed a match was rejected as well -- and so was every edit of a
--   reserved training that the app sent the type column for.
--
-- Fix:
--   Only raise when the type actually changes. A reserved training can
--   now be renamed, moved or have its location changed, and a reserved
--   match can be edited, while the training -> match transition is still
--   blocked.
--
-- The search_path is deliberately left unpinned, exactly as migration 022
-- created this function: the body is fully qualified and the function is
-- not SECURITY DEFINER, so it runs with the caller's rights.

CREATE OR REPLACE FUNCTION public.prevent_reserved_training_type_change()
RETURNS TRIGGER
LANGUAGE plpgsql
AS $fn$
BEGIN
  IF NEW.type IS DISTINCT FROM OLD.type
     AND NEW.type <> 'training'
     AND EXISTS (
       SELECT 1 FROM public.reservations WHERE event_id = NEW.id
     ) THEN
    RAISE EXCEPTION 'Cancel the pitch reservation before changing this training to a match';
  END IF;
  RETURN NEW;
END;
$fn$;
