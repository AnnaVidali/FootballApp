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
--   The 42P01 for the bare name `profiles` came from an *unqualified*
--   table reference in a trigger body that ran on the same statement,
--   resolved against the empty path. An empty search_path set on a
--   function is scoped to that function's execution; it does NOT leak
--   into the calling UPDATE statement. (Corrected after the audit, see
--   AUDIT_FINDINGS.md M-8.)
--
--   The original explanation below was wrong, and the "fix" it led to
--   removed a hardening measure for no reason. The body still has to
--   reference everything qualified, and migration 036 re-pins its
--   search_path.
--
--     * Editing a training  -> trigger skips (NEW.type = 'training'),
--                              so it worked.
--     * Editing a match     -> trigger body ran and hit an unqualified
--                              `profiles` lookup, which failed.
--     * Disabling this one trigger made matches save fine, which
--       pinned the cause to this function.
--
--   Other trigger functions shared the same `SET search_path = ''`
--   style and were left alone. That part is fine: their bodies are
--   fully qualified.
--
-- Fix:
--   Re-create the trigger function with its body fully qualified.
--   Migration 033 later corrected the condition so an edit that leaves
--   the type unchanged is not rejected, and migration 036 restored the
--   search_path pin.
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
