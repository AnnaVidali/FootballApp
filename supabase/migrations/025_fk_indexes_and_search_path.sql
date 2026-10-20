-- ============================================================
-- Migration 025: missing foreign-key indexes, and tidy the
--               trigger-function search_path settings
-- ============================================================
-- Two small, low-risk cleanups from the review (#4 and #6).
-- Nothing about access rules or behaviour changes here.
--
-- Part 1 -- indexes on unindexed foreign keys
-- -------------------------------------------
-- Postgres does NOT create an index for the referencing side of a
-- foreign key. Every FK column below is queried by RLS policies, by
-- joins, or by the ON DELETE CASCADE / SET NULL actions -- and the
-- cascade in particular has to scan the whole child table for each
-- parent row deleted, which is the classic slow-delete problem.
--
-- The list below is the accurate one: it counts only columns that are
-- the LEADING column of no existing index. Several FK columns already
-- have that (e.g. lineups.event_id leads lineups_event_id_player_id_key)
-- and are deliberately not repeated here.
--
--   profiles.team_id                 RLS on every profiles read; ON DELETE SET NULL
--   teams.owner_id                   ON DELETE SET NULL
--   events.team_id                   RLS on every events read; ON DELETE CASCADE
--   events.captain_id                ON DELETE SET NULL
--   availability.event_id            ON DELETE CASCADE
--   lineups.player_id                ON DELETE CASCADE
--   set_pieces.player_id             ON DELETE CASCADE
--   gallery_items.event_id           ON DELETE SET NULL
--   gallery_items.team_id            ON DELETE CASCADE
--   gallery_items.uploaded_by        ON DELETE CASCADE
--   reservations.created_by          ON DELETE CASCADE
--   reservation_payments.user_id     ON DELETE CASCADE
--
-- Part 2 -- trigger-function search_path
-- --------------------------------------
-- Two different, opposite problems, neither of which is currently
-- breaking anything, but both worth stating explicitly:
--
--   a) Four trigger functions run with SET search_path = '' and are
--      NOT SECURITY DEFINER, so they execute with the CALLER's rights
--      and empty search path. This is the exact configuration that
--      once broke event edits (migration 022). These four are only
--      safe today because they reference no tables or functions at
--      all -- just NEW/OLD/now(). IMPORTANT: now() is resolved
--      through pg_catalog, which is always implicitly on the search
--      path, so it is fine; any FUTURE edit to these bodies that adds
--      an unqualified table reference would fail with 42P01. The
--      comment on each says so.
--
--   b) sync_admin_on_insert / sync_admin_to_metadata are SECURITY
--      DEFINER but have no search_path pinned, so they resolve names
--      using the session search_path. They write to auth.users, so
--      pinning them to '' is the safe, conventional setting.
--
-- Idempotent and safe to re-run (CREATE INDEX IF NOT EXISTS,
-- CREATE OR REPLACE FUNCTION).

-- ---------------------------------------------------------------------
-- Part 1: indexes
-- ---------------------------------------------------------------------
CREATE INDEX IF NOT EXISTS profiles_team_id_idx          ON public.profiles (team_id);
CREATE INDEX IF NOT EXISTS teams_owner_id_idx            ON public.teams (owner_id);
CREATE INDEX IF NOT EXISTS events_team_id_idx            ON public.events (team_id);
CREATE INDEX IF NOT EXISTS events_captain_id_idx         ON public.events (captain_id);
CREATE INDEX IF NOT EXISTS availability_event_id_idx     ON public.availability (event_id);
CREATE INDEX IF NOT EXISTS lineups_player_id_idx         ON public.lineups (player_id);
CREATE INDEX IF NOT EXISTS set_pieces_player_id_idx      ON public.set_pieces (player_id);
CREATE INDEX IF NOT EXISTS gallery_items_event_id_idx    ON public.gallery_items (event_id);
CREATE INDEX IF NOT EXISTS gallery_items_team_id_idx     ON public.gallery_items (team_id);
CREATE INDEX IF NOT EXISTS gallery_items_uploaded_by_idx ON public.gallery_items (uploaded_by);
CREATE INDEX IF NOT EXISTS reservations_created_by_idx   ON public.reservations (created_by);
CREATE INDEX IF NOT EXISTS reservation_payments_user_id_idx ON public.reservation_payments (user_id);

-- ---------------------------------------------------------------------
-- Part 2a: keep the four caller-rights triggers correct, and document
--          the constraint on their bodies so a future edit does not
--          reintroduce the 42P01 failure.
--          Bodies are unchanged except for the added comment.
-- ---------------------------------------------------------------------
CREATE OR REPLACE FUNCTION public.protect_reservation_columns()
RETURNS trigger
LANGUAGE plpgsql
SET search_path = ''
AS $fn$
BEGIN
  -- Body must not reference any table or function by unqualified name:
  -- with an empty search path and no SECURITY DEFINER, a bare relation
  -- name would raise 42P01. NEW/OLD are fine, and now() resolves through
  -- pg_catalog, which is always on the path.
  IF NEW.id <> OLD.id
     OR NEW.event_id <> OLD.event_id
     OR NEW.created_by <> OLD.created_by
     OR NEW.created_at <> OLD.created_at THEN
    RAISE EXCEPTION 'A reservation cannot be moved to another event or creator';
  END IF;
  RETURN NEW;
END;
$fn$;

CREATE OR REPLACE FUNCTION public.protect_reservation_payment_amount()
RETURNS trigger
LANGUAGE plpgsql
SET search_path = ''
AS $fn$
BEGIN
  -- No unqualified table/function references (see the note in
  -- protect_reservation_columns).
  IF NEW.reservation_id <> OLD.reservation_id
     OR NEW.user_id <> OLD.user_id
     OR NEW.amount <> OLD.amount THEN
    RAISE EXCEPTION 'Only the paid status of a share can be changed';
  END IF;
  RETURN NEW;
END;
$fn$;

CREATE OR REPLACE FUNCTION public.stamp_reservation_payment_paid_at()
RETURNS trigger
LANGUAGE plpgsql
SET search_path = ''
AS $fn$
BEGIN
  -- No unqualified table/function references (see the note in
  -- protect_reservation_columns).
  IF NEW.paid AND NOT OLD.paid THEN
    NEW.paid_at := COALESCE(NEW.paid_at, now());
  ELSIF NOT NEW.paid THEN
    NEW.paid_at := NULL;
  END IF;
  RETURN NEW;
END;
$fn$;

CREATE OR REPLACE FUNCTION public.generate_invite_code()
RETURNS trigger
LANGUAGE plpgsql
SET search_path = ''
AS $fn$
BEGIN
  -- No unqualified table/function references (see the note in
  -- protect_reservation_columns). md5/random/substring/upper all live in
  -- pg_catalog.
  IF NEW.invite_code IS NULL OR NEW.invite_code = '' THEN
    NEW.invite_code := upper(substring(md5(random()::text) from 1 for 8));
  END IF;
  RETURN NEW;
END;
$fn$;

-- ---------------------------------------------------------------------
-- Part 2b: pin search_path on the two SECURITY DEFINER triggers that
--          write to auth.users. Bodies are otherwise unchanged.
-- ---------------------------------------------------------------------
CREATE OR REPLACE FUNCTION public.sync_admin_on_insert()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = ''
AS $fn$
BEGIN
  UPDATE auth.users
  SET raw_user_meta_data = raw_user_meta_data || jsonb_build_object('is_admin', NEW.is_admin::text)
  WHERE id = NEW.user_id;
  RETURN NEW;
END;
$fn$;

CREATE OR REPLACE FUNCTION public.sync_admin_to_metadata()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = ''
AS $fn$
BEGIN
  UPDATE auth.users
  SET raw_user_meta_data = raw_user_meta_data || jsonb_build_object('is_admin', NEW.is_admin::text)
  WHERE id = NEW.user_id;
  RETURN NEW;
END;
$fn$;
