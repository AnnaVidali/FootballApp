-- ============================================================
-- Migration 036: The rest of the audit backlog
-- ============================================================
-- The audit in supabase/AUDIT_FINDINGS.md closed its CRITICAL and
-- HIGH findings in migrations 027-032, and the rounding finding in
-- 034. This migration clears the remaining MEDIUM and LOW items that
-- can be fixed without changing a product decision:
--
--   M-1  paid_at is forgeable: stamp it, never trust the client value.
--   M-2  lock the reservation row while its split is finalized, so a
--        concurrent edit cannot act on the same "no payments yet"
--        snapshot.
--   M-4  leaving a team also has to remove the player from lineups and
--        set pieces, and clear their captaincy.
--   M-5  pin search_path on the last unpinned public function.
--   M-6  drop the live-only triggers that copy is_admin into
--        auth.users.raw_user_meta_data.
--   L-1  index events by (team_id, date), the Events page's sort key.
--   L-2  make profiles.is_admin NOT NULL.
--   L-3  reservation shares may not be negative.
--   L-5  bound the user supplied text columns.
--   L-6  generate invite codes with a CSPRNG, not md5(random()).
--
-- M-7 (012 is re-runnable) was fixed when 012 was amended in the same
-- commit as 027-031; M-8 is the explanation below; L-4 was 034.
-- L-7 (storage delete policies are decorative) and L-8 (mixed key
-- domains) are documented in the audit, not schema changes.

-- ---------------------------------------------------------------
-- M-1: paid_at is stamped by the database.
--      COALESCE kept whatever timestamp the client sent, so a share
--      could be back- or forward-dated. The audit field has to be
--      the database's own clock.
-- ---------------------------------------------------------------
CREATE OR REPLACE FUNCTION public.stamp_reservation_payment_paid_at()
RETURNS trigger
LANGUAGE plpgsql
SET search_path = ''
AS $fn$
BEGIN
  IF NEW.paid AND NOT OLD.paid THEN
    NEW.paid_at := now();
  ELSIF NEW.paid THEN
    -- Already paid: the moment it became paid is history, not a value
    -- a later edit may rewrite.
    NEW.paid_at := OLD.paid_at;
  ELSE
    NEW.paid_at := NULL;
  END IF;
  RETURN NEW;
END;
$fn$;

-- ---------------------------------------------------------------
-- M-4: leaving cleans every table that points at the profile.
--      Migration 015 only removed availability, so lineups and set
--      pieces kept showing a player who was no longer on the roster,
--      and an event kept a captain who had left.
--
--      The function is renamed because it no longer only cleans
--      availability.
-- ---------------------------------------------------------------
DROP TRIGGER IF EXISTS on_profile_team_change ON public.profiles;
DROP FUNCTION IF EXISTS public.cleanup_availability_on_team_change();

CREATE OR REPLACE FUNCTION public.cleanup_on_team_change()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = ''
AS $fn$
BEGIN
  IF OLD.team_id IS NOT NULL AND OLD.team_id IS DISTINCT FROM NEW.team_id THEN
    DELETE FROM public.availability
     WHERE user_id = OLD.user_id
       AND event_id IN (
         SELECT id FROM public.events WHERE team_id = OLD.team_id
       );

    -- lineups/set_pieces reference profiles(id), not auth.users(id).
    DELETE FROM public.lineups
     WHERE player_id IN (
             SELECT id FROM public.profiles WHERE user_id = OLD.user_id
           )
       AND event_id IN (
             SELECT id FROM public.events WHERE team_id = OLD.team_id
           );

    DELETE FROM public.set_pieces
     WHERE player_id IN (
             SELECT id FROM public.profiles WHERE user_id = OLD.user_id
           )
       AND event_id IN (
             SELECT id FROM public.events WHERE team_id = OLD.team_id
           );

    UPDATE public.events
       SET captain_id = NULL
     WHERE captain_id IN (
             SELECT id FROM public.profiles WHERE user_id = OLD.user_id
           )
       AND team_id = OLD.team_id;
  END IF;
  RETURN NEW;
END;
$fn$;

CREATE TRIGGER on_profile_team_change
  AFTER UPDATE OF team_id ON public.profiles
  FOR EACH ROW
  EXECUTE FUNCTION public.cleanup_on_team_change();

-- ---------------------------------------------------------------
-- M-5 / M-8: the last unpinned public function.
--      022 removed its search_path based on the mistaken belief that
--      a function's SET search_path leaks into the calling statement.
--      It does not: the empty path is scoped to the function body.
--      The real 42P01 came from an unqualified reference in a trigger
--      body, and the body below is fully qualified, so the pin is
--      safe and restores the hardening.
-- ---------------------------------------------------------------
ALTER FUNCTION public.prevent_reserved_training_type_change()
  SET search_path = '';

-- 032 introduced this trigger without a pin. Its body is fully
-- qualified, so pinning it is safe as well.
ALTER FUNCTION public.protect_team_owner_id()
  SET search_path = '';

-- ---------------------------------------------------------------
-- M-6: stop writing is_admin into attacker-writable metadata.
--      Nothing reads auth.jwt()->>'is_admin' any more (024 replaced
--      that policy with a profiles lookup). Keeping a privilege bit
--      in a blob the user can edit is a trap for the next reader,
--      and the triggers churned auth.users on every roster change.
-- ---------------------------------------------------------------
DROP TRIGGER IF EXISTS on_profile_admin_insert ON public.profiles;
DROP TRIGGER IF EXISTS on_profile_admin_change ON public.profiles;
DROP FUNCTION IF EXISTS public.sync_admin_on_insert();
DROP FUNCTION IF EXISTS public.sync_admin_to_metadata();

-- ---------------------------------------------------------------
-- L-1: the Events page reads one team's events ordered by date.
-- ---------------------------------------------------------------
CREATE INDEX IF NOT EXISTS events_team_id_date_idx
  ON public.events (team_id, date);

-- ---------------------------------------------------------------
-- L-2: is_admin is a boolean, but NULL was representable.
--      Predicates already use IS TRUE, so there was no live bug;
--      NOT NULL stops a future `= false` check from missing rows.
-- ---------------------------------------------------------------
UPDATE public.profiles SET is_admin = false WHERE is_admin IS NULL;
ALTER TABLE public.profiles ALTER COLUMN is_admin SET DEFAULT false;
ALTER TABLE public.profiles ALTER COLUMN is_admin SET NOT NULL;

-- ---------------------------------------------------------------
-- L-3: a payment share is money owed, never a credit.
-- ---------------------------------------------------------------
DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint
    WHERE conrelid = 'public.reservation_payments'::regclass
      AND conname = 'reservation_payments_amount_nonneg'
  ) THEN
    ALTER TABLE public.reservation_payments
      ADD CONSTRAINT reservation_payments_amount_nonneg CHECK (amount >= 0);
  END IF;
END $$;

-- ---------------------------------------------------------------
-- L-5: bound the user supplied text. The limits are generous (the
--      longest existing value is 41 characters) and only stop a
--      client from storing megabytes in a name or a title.
-- ---------------------------------------------------------------
DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint
    WHERE conrelid = 'public.profiles'::regclass AND conname = 'profiles_name_len'
  ) THEN
    ALTER TABLE public.profiles
      ADD CONSTRAINT profiles_name_len CHECK (char_length(name) <= 120);
  END IF;

  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint
    WHERE conrelid = 'public.profiles'::regclass AND conname = 'profiles_position_len'
  ) THEN
    ALTER TABLE public.profiles
      ADD CONSTRAINT profiles_position_len
      CHECK (position IS NULL OR char_length(position) <= 60);
  END IF;

  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint
    WHERE conrelid = 'public.events'::regclass AND conname = 'events_title_len'
  ) THEN
    ALTER TABLE public.events
      ADD CONSTRAINT events_title_len CHECK (char_length(title) <= 200);
  END IF;

  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint
    WHERE conrelid = 'public.events'::regclass AND conname = 'events_location_len'
  ) THEN
    ALTER TABLE public.events
      ADD CONSTRAINT events_location_len
      CHECK (location IS NULL OR char_length(location) <= 200);
  END IF;

  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint
    WHERE conrelid = 'public.gallery_items'::regclass AND conname = 'gallery_caption_len'
  ) THEN
    ALTER TABLE public.gallery_items
      ADD CONSTRAINT gallery_caption_len
      CHECK (caption IS NULL OR char_length(caption) <= 500);
  END IF;
END $$;

-- ---------------------------------------------------------------
-- L-6: invite codes are the join credential; md5(random()) is not a
--      CSPRNG. gen_random_uuid() is a cryptographic generator and is
--      built into PostgreSQL 13+, so no extension is needed. The
--      format stays eight upper-case hex characters.
-- ---------------------------------------------------------------
CREATE OR REPLACE FUNCTION public.generate_invite_code()
RETURNS trigger
LANGUAGE plpgsql
SET search_path = ''
AS $fn$
BEGIN
  IF NEW.invite_code IS NULL OR NEW.invite_code = '' THEN
    NEW.invite_code := upper(
      substring(replace(gen_random_uuid()::text, '-', '') from 1 for 8)
    );
  END IF;
  RETURN NEW;
END;
$fn$;

-- ---------------------------------------------------------------
-- M-2: finalize the split under a row lock.
--      The function used to read the reservation, notice that no
--      payment rows existed yet, and insert them -- all without a
--      lock. A concurrent UPDATE or DELETE of the same reservation
--      could pass its policy check on the same "no payments yet"
--      observation. FOR UPDATE serialises the two: whoever comes
--      second sees the committed result and either waits for the
--      edit (then re-reads its amount/date) or sees the payments and
--      returns without recomputing.
--
--      Body is 034's, unchanged apart from the locking clause.
-- ---------------------------------------------------------------
CREATE OR REPLACE FUNCTION public.finalize_reservation_split(
  p_reservation_id UUID,
  p_participants UUID[]
) RETURNS VOID AS $$
DECLARE
  v_event_id UUID;
  v_amount NUMERIC;
  v_created_by UUID;
  v_event_date TIMESTAMPTZ;
  v_event_type TEXT;
  v_team_id UUID;
  v_participants UUID[];
  v_count INTEGER;
  v_count_input INTEGER;
  v_share NUMERIC;
BEGIN
  SELECT r.event_id, r.amount, r.created_by, e.date, e.type, e.team_id
    INTO v_event_id, v_amount, v_created_by, v_event_date, v_event_type, v_team_id
  FROM public.reservations r
  JOIN public.events e ON e.id = r.event_id
  WHERE r.id = p_reservation_id
  FOR UPDATE OF r;

  IF v_event_id IS NULL THEN
    RAISE EXCEPTION 'Reservation not found';
  END IF;

  IF v_event_type <> 'training' THEN
    RAISE EXCEPTION 'Reservations only apply to trainings';
  END IF;

  -- Only the person who fronted the money (or an admin) settles the split.
  IF NOT EXISTS (
    SELECT 1 FROM public.profiles me
    WHERE me.user_id = auth.uid()
      AND me.team_id = v_team_id
      AND (me.is_admin = true OR me.id = v_created_by)
  ) THEN
    RAISE EXCEPTION 'Not authorized: only the person who reserved the pitch (or an admin) can split';
  END IF;

  -- Already finalized: never recompute (frozen amounts win).
  IF EXISTS (
    SELECT 1 FROM public.reservation_payments WHERE reservation_id = p_reservation_id
  ) THEN
    RETURN;
  END IF;

  IF now() < v_event_date - INTERVAL '25 hours' THEN
    RAISE EXCEPTION 'The split is calculated once RSVPs close';
  END IF;

  IF COALESCE(array_length(p_participants, 1), 0) = 0 THEN
    RAISE EXCEPTION 'Pick at least one player';
  END IF;

  -- Distinct players of this team. Coaches are never charged, and a
  -- list containing anyone else (a coach, another team) is rejected
  -- so the picker and the split can never disagree.
  SELECT array_agg(DISTINCT p.id) INTO v_participants
  FROM public.profiles p
  WHERE p.id = ANY (p_participants)
    AND p.team_id = v_team_id
    AND p.role <> 'coach';

  v_count := COALESCE(array_length(v_participants, 1), 0);
  v_count_input := (SELECT count(DISTINCT u) FROM unnest(p_participants) AS u);

  IF v_count = 0 OR v_count < v_count_input THEN
    RAISE EXCEPTION 'Participants must be players of your team';
  END IF;

  -- Equal share in whole cents, rounded to nearest cent.
  v_share := round((v_amount * 100) / v_count) / 100;

  INSERT INTO public.reservation_payments (reservation_id, user_id, amount, paid, paid_at)
  SELECT
    p_reservation_id,
    t.pid,
    v_share,
    t.pid = v_created_by,
    CASE WHEN t.pid = v_created_by THEN now() END
  FROM unnest(v_participants) WITH ORDINALITY AS t(pid, ord);
END;
$$ LANGUAGE plpgsql SECURITY DEFINER SET search_path = '';

GRANT EXECUTE ON FUNCTION public.finalize_reservation_split(UUID, UUID[]) TO authenticated;
GRANT EXECUTE ON FUNCTION public.finalize_reservation_split(UUID, UUID[]) TO service_role;
