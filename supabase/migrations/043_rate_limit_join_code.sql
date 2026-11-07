-- ============================================================
-- Migration 043: rate-limit invite-code guesses
-- ============================================================
-- join_team_with_code() is callable directly from the browser. With a
-- valid 8-character code it is the tenant's only join credential, so
-- an unthrottled RPC is a brute-force surface even though the code
-- space is large. This caps failed guesses per user at 10 per 10
-- minutes. A successful join clears the user's failures.
--
-- The attempt table is internal: it is only read and written by the
-- SECURITY DEFINER function below. RLS is enabled and the Data API
-- roles are explicitly revoked, so no client can enumerate or forge
-- attempts. No grants are needed for the app; the function owner
-- bypasses RLS.
--
-- The function now returns NULL for an invalid code instead of
-- raising, because a raised exception would roll back the failure
-- row that makes the rate limit work. The join-team page already
-- treats a null result as an invalid code. Rate limiting itself still
-- raises (with DETAIL = 'join_rate_limited') so the page can show a
-- distinct message.
--
-- CREATE OR REPLACE / IF NOT EXISTS keep this re-runnable.

CREATE TABLE IF NOT EXISTS public.join_code_attempts (
  id uuid DEFAULT gen_random_uuid() PRIMARY KEY,
  user_id uuid NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  attempted_at timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS join_code_attempts_user_time_idx
  ON public.join_code_attempts (user_id, attempted_at DESC);

ALTER TABLE public.join_code_attempts ENABLE ROW LEVEL SECURITY;

REVOKE ALL ON public.join_code_attempts FROM anon, authenticated;

CREATE OR REPLACE FUNCTION public.join_team_with_code(p_code text)
RETURNS uuid
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = ''
AS $fn$
DECLARE
  v_team_id uuid;
  v_current_team_id uuid;
  v_failures integer;
BEGIN
  IF auth.uid() IS NULL THEN
    RAISE EXCEPTION 'Not authenticated' USING ERRCODE = '42501';
  END IF;

  -- Serialise concurrent guesses from the same user so the count
  -- below cannot be bypassed by firing requests in parallel.
  PERFORM pg_advisory_xact_lock(hashtextextended(auth.uid()::text, 0));

  -- Keep the table small; only the last 10 minutes matter.
  DELETE FROM public.join_code_attempts
  WHERE attempted_at < now() - interval '1 hour';

  SELECT count(*)
    INTO v_failures
  FROM public.join_code_attempts
  WHERE user_id = auth.uid()
    AND attempted_at > now() - interval '10 minutes';

  IF v_failures >= 10 THEN
    RAISE EXCEPTION 'Too many invite code attempts'
      USING ERRCODE = 'P0001', DETAIL = 'join_rate_limited';
  END IF;

  IF p_code IS NULL OR btrim(p_code) = '' THEN
    INSERT INTO public.join_code_attempts (user_id) VALUES (auth.uid());
    RETURN NULL;
  END IF;

  SELECT id INTO v_team_id
  FROM public.teams
  WHERE invite_code = upper(btrim(p_code));

  IF v_team_id IS NULL THEN
    INSERT INTO public.join_code_attempts (user_id) VALUES (auth.uid());
    RETURN NULL;
  END IF;

  SELECT team_id INTO v_current_team_id
  FROM public.profiles WHERE user_id = auth.uid();

  -- The caller's own team: nothing to change. Treat it as success so
  -- pasting your own code is harmless.
  IF v_current_team_id IS NOT NULL AND v_current_team_id = v_team_id THEN
    DELETE FROM public.join_code_attempts WHERE user_id = auth.uid();
    RETURN v_team_id;
  END IF;

  -- Moving teams is leaving the current one. The owner and the last
  -- admin must hand over first, exactly as on the roster page.
  IF v_current_team_id IS NOT NULL AND NOT public.can_leave_team() THEN
    RAISE EXCEPTION 'Transfer ownership or appoint another admin before joining another team'
      USING ERRCODE = '42501';
  END IF;

  UPDATE public.profiles
  SET team_id = v_team_id, is_admin = false, role = 'player'
  WHERE user_id = auth.uid();

  DELETE FROM public.join_code_attempts WHERE user_id = auth.uid();

  RETURN v_team_id;
END;
$fn$;

REVOKE ALL ON FUNCTION public.join_team_with_code(text) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.join_team_with_code(text) TO authenticated;
GRANT EXECUTE ON FUNCTION public.join_team_with_code(text) TO service_role;
