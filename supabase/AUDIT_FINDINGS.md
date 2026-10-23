# FootballApp — Supabase/PostgreSQL migration layer audit

Scope: `supabase/migrations/001…026` (26 files), cross-checked against the **live** Supabase
project (`syamvhvanlnyexmxljni`, PG 17.6), `types/database.ts`, and the app pages under `app/`.

Method: every migration was read end to end; the live schema was dumped (`pg_policies`,
`pg_class.relacl`, `pg_proc.proacl/proconfig`, `pg_trigger`, `pg_constraint`, `pg_indexes`,
`storage.buckets`); all behavioural claims below were executed against the live database inside
`BEGIN … ROLLBACK` with `SET LOCAL ROLE anon|authenticated` and synthetic JWT claims.
No live data was modified (post-audit counts: profiles 20, teams 1, events 11, availability 184,
reservations 1, reservation_payments 0, gallery_items 0, lineups 0, set_pieces 0, auth.users 34,
storage.objects 8).

Legend: **[L]** = live-only object, absent from every migration file.

---

## CRITICAL

### C-1 · Live-only policy lets any signed-up user enumerate every team and steal invite codes
**Where:** live `pg_policies` → `teams."Unassigned users can find team by invite code"`,
`FOR SELECT`, `USING ((SELECT profiles.team_id FROM profiles WHERE profiles.user_id = auth.uid()) IS NULL)`.
**Not in any file** in `supabase/migrations/` (grep-verified across all 26).

**Why it matters:** the predicate is true for *every* account that has no team, so such a user can
`SELECT * FROM teams` and read every tenant's `name` and `invite_code`. The invite code is the
join credential: `app/dashboard/join-team/page.tsx:26` calls `join_team_with_code(code)`, and the
code is rendered in `components/RosterClient.tsx:172` and `app/dashboard/page.tsx:166`. Chain =
sign up → read all invite codes → `join_team_with_code` → become a member → read that team's
roster, events, availability, reservations, payment list and gallery.

**Verified:** a teamless user `SELECT`ed 3 teams, codes `023660F0|BBBB2222|AAAA1111`;
`023660F0` is a **production** team's code.

**Fix:**
```sql
DROP POLICY IF EXISTS "Unassigned users can find team by invite code" ON public.teams;

-- invite_code must never be exposed through a table SELECT.
-- Expose only a code->team-id lookup, and never return the code itself.
CREATE OR REPLACE FUNCTION public.team_id_for_invite_code(p_code text)
RETURNS uuid
LANGUAGE plpgsql
STABLE
SECURITY DEFINER
SET search_path = ''
AS $fn$
DECLARE v_team_id uuid;
BEGIN
  IF p_code IS NULL OR btrim(p_code) = '' THEN RETURN NULL; END IF;
  SELECT t.id INTO v_team_id
    FROM public.teams t
   WHERE t.invite_code = upper(btrim(p_code));
  RETURN v_team_id;
END;
$fn$;
REVOKE ALL ON FUNCTION public.team_id_for_invite_code(text) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.team_id_for_invite_code(text) TO authenticated;
```
Also drop `invite_code` from any `SELECT` the app makes that the client does not need
(`app/dashboard/roster/page.tsx:19` and `app/dashboard/page.tsx:65` both select it).

---

### C-2 · Inherited `TRIGGER` privilege lets any account permanently break every profile and event write
**Where:** `005_grant_table_permissions.sql:4-8` grants table privileges and **never revokes** the
defaults Supabase already installed. Live `relacl` on all 9 public tables:
`anon=Dxtm`, `authenticated=arwdDxtm` — the `t` is **TRIGGER**.

**Why it matters:** `CREATE TRIGGER … EXECUTE FUNCTION` requires only the TRIGGER privilege on the
table plus an existing trigger function. `anon` and `authenticated` cannot create functions
(they have no CREATE on schema `public` — verified `42501`), but they **can attach any existing
trigger function to any table**. Because the functions are row triggers that reference columns
that do not exist on the target table, every write to that table dies with `42703`.

**Verified (live, rolled back):**
* player creates `CREATE TRIGGER aaa_block_profiles BEFORE UPDATE ON public.profiles FOR EACH ROW EXECUTE FUNCTION public.protect_reservation_columns();` → **created**
* `join_team_with_code('BBBB2222')` → `42703 record "new" has no field "event_id"` → **nobody can join a team**
* admin renames a member → `42703 …` → **roster edits dead**
* admin promotes a member → `42703 …` → **promotions dead**
* player creates `… BEFORE UPDATE ON public.events … EXECUTE FUNCTION public.stamp_reservation_payment_paid_at();` → admin edits an event → `42703 record "new" has no field "paid"` → **Events page dead**
* `anon` can create triggers too.

`CREATE TRIGGER` is DDL and commits: there is no app-level recovery path.

**Fix:**
```sql
REVOKE ALL ON TABLE public.teams, public.profiles, public.events, public.availability,
  public.lineups, public.set_pieces, public.gallery_items, public.reservations,
  public.reservation_payments FROM anon, authenticated;

-- then grant back only what the app uses
GRANT SELECT, INSERT, UPDATE, DELETE ON TABLE public.teams,
  public.profiles, public.events, public.availability,
  public.lineups, public.set_pieces, public.gallery_items,
  public.reservations TO authenticated;
GRANT SELECT, UPDATE ON TABLE public.reservation_payments TO authenticated;
```
(`005` must be amended the same way so a rebuild is not vulnerable.)

---

### C-3 · The migration set does not reproduce the live schema — a fresh build is broken and is missing live-only objects
**Where:** `001_initial.sql:63-64` and `001_initial.sql:73-74`.

**Why it matters (two separate defects):**

**(a) Build-breaking recursion.** `001` creates self-referencing SELECT policies:
```sql
CREATE POLICY "Users can view their own team" ON teams
  FOR SELECT USING (id = (SELECT team_id FROM profiles WHERE user_id = auth.uid()));   -- :63-64
CREATE POLICY "Users can view profiles in their team" ON profiles
  FOR SELECT USING (team_id = (SELECT team_id FROM profiles WHERE user_id = auth.uid()) OR user_id = auth.uid());  -- :73-74
```
No later migration drops or recreates either (grep-verified). A fresh build from `001…026`
therefore aborts every `SELECT FROM profiles` / `SELECT FROM teams` with
`42P17 infinite recursion detected in policy for relation "profiles"`.
**Reproduced** in a scratch schema: raw self-subquery → `42P17`; `SECURITY DEFINER get_user_team_id()` → `OK rows=1`.
Production only works because those two policies were **hand-edited** to use `get_user_team_id()`.
`026:16-17` asserts they already reference it — true of production, **false of the migration files**.

**(b) Schema drift.** Live-only, absent from every migration file:
`teams.logo_url`, `teams.primary_color`, `teams.secondary_color`; `UNIQUE(name)` +
`teams_lower_name_unique`; the `team-logos` bucket and its 3 storage policies;
`profiles."Update profiles"`; `teams."Unassigned users can find team by invite code"`;
triggers `on_profile_admin_insert` / `on_profile_admin_change`.
The app depends on the missing columns (`app/dashboard/settings/page.tsx:43,78-83`;
declared in `types/database.ts:6-8`), so a rebuilt DB fails with PostgREST `42703`.
`026:64-67` (`UPDATE storage.buckets … WHERE id='team-logos'`) silently updates **0 rows** on a
fresh DB — no bucket, no limits, no error.

**Fix — add `027_reconcile_live_schema.sql`:**
```sql
-- (a) recreate the two SELECT policies through the SECURITY DEFINER helper
DROP POLICY IF EXISTS "Users can view their own team" ON public.teams;
CREATE POLICY "Users can view their own team" ON public.teams
  FOR SELECT USING (id = public.get_user_team_id() OR owner_id = auth.uid());

DROP POLICY IF EXISTS "Users can view profiles in their team" ON public.profiles;
CREATE POLICY "Users can view profiles in their team" ON public.profiles
  FOR SELECT USING (team_id = public.get_user_team_id() OR user_id = auth.uid());

-- (b) restore the missing columns / constraints
ALTER TABLE public.teams ADD COLUMN IF NOT EXISTS logo_url text;
ALTER TABLE public.teams ADD COLUMN IF NOT EXISTS primary_color text NOT NULL DEFAULT '#16a34a';
ALTER TABLE public.teams ADD COLUMN IF NOT EXISTS secondary_color text NOT NULL DEFAULT '#ffffff';
CREATE UNIQUE INDEX IF NOT EXISTS teams_lower_name_unique ON public.teams (lower(name));

-- (b) restore the missing bucket + policies
INSERT INTO storage.buckets (id, name, public) VALUES ('team-logos','team-logos', true)
ON CONFLICT (id) DO NOTHING;
UPDATE storage.buckets
   SET file_size_limit = 2097152,
       allowed_mime_types = ARRAY['image/jpeg','image/png','image/webp','image/gif','image/svg+xml']
 WHERE id = 'team-logos';
```
and re-create the live-only policies/triggers listed above (see C-1, H-4, H-9, M-6 for their
correct definitions).

---

## HIGH

### H-1 · `anon` and `authenticated` hold TRUNCATE on every public table
**Where:** `005_grant_table_permissions.sql:4-8` — grants only, never revokes. Live ACLs:
`anon=Dxtm`, `authenticated=arwdDxtm` on all 9 tables (`D` = TRUNCATE).

**Why it matters:** RLS does **not** apply to TRUNCATE, so a single `TRUNCATE … CASCADE` wipes
every tenant's data. **Verified:** `anon TRUNCATE public.teams CASCADE` → success;
`authenticated TRUNCATE public.events CASCADE` → success. In an earlier probe the mid-transaction
counts went profiles 20→0, teams 1→0, events 11→0.

*Reachability caveat (stated explicitly):* PostgREST cannot issue `TRUNCATE`, so this is **not**
reachable over the REST API with the anon key. It requires the DB password/DSN
(`SUPABASE_DB_URL` in `.env.local`), the SQL editor, or `service_role` misuse. That is why this is
High and not Critical — it is a privilege violation and a total-data-loss primitive for anyone
holding the DB credential.

**Fix:** covered by the `REVOKE ALL`/`GRANT` block in C-2. Add an explicit belt-and-braces revoke
so intent is documented:
```sql
REVOKE TRUNCATE, REFERENCES, TRIGGER, MAINTAIN ON ALL TABLES IN SCHEMA public FROM anon, authenticated;
```

---

### H-2 · `availability` policy has no event or team scope → cross-team writes
**Where:** `001_initial.sql:93-94`
```sql
CREATE POLICY "Users can manage their own availability" ON availability
  FOR ALL USING (user_id = auth.uid());
```
Live: `polcmd='*'`, `polqual = user_id = auth.uid()`, `polwithcheck IS NULL` → for an `ALL`
policy PostgreSQL substitutes the USING expression, so both sides are just
`user_id = auth.uid()`. **Nothing constrains `event_id`.**

**Why it matters:** a player can write availability rows against any event in any team — i.e.
fabricate RSVPs into a competitor team's training, or withdraw their own RSVP from a training
they are on.

**Verified:** player inserted `availability(user_id=me, event_id=<team B event>)` → **rows=1**;
final state showed the player holding availability on both their own team's event and team B's.
Updating an existing row to point at another team's event also succeeds (it only failed once in
the probe because the UNIQUE `(user_id,event_id)` already existed).
*Mitigating:* the WITH CHECK does block spoofing **another** user's RSVP
(`new row violates row-level security policy for table "availability"` — verified).

**Fix:**
```sql
DROP POLICY IF EXISTS "Users can manage their own availability" ON public.availability;

CREATE POLICY "Users can manage their own availability" ON public.availability
  FOR ALL
  USING (
    user_id = auth.uid()
    AND event_id IN (
      SELECT e.id FROM public.events e
       WHERE e.team_id = public.get_user_team_id()
    )
  );
```
(`get_user_team_id()` is `SECURITY DEFINER` + `search_path=''`, so this does not re-enter RLS.)

---

### H-3 · `gallery_items` INSERT policy ignores `event_id` → cross-team event reference
**Where:** `017_gallery.sql:34-38`
```sql
CREATE POLICY "Team members can add gallery items" ON gallery_items
  FOR INSERT WITH CHECK (
    team_id IN (SELECT team_id FROM profiles WHERE user_id = auth.uid())
    AND uploaded_by IN (SELECT id FROM profiles WHERE user_id = auth.uid())
  );
```
**Why it matters:** `team_id` is scoped but `event_id` is not, so a member of team A can create a
gallery item that claims to be attached to team B's event. Downstream pages that join
`gallery_items → events` will show team B's event inside team A's gallery.

**Verified:** `INSERT … team_id=<team A>, event_id=<team B event>` → **rows=1**.

**Fix:**
```sql
DROP POLICY IF EXISTS "Team members can add gallery items" ON public.gallery_items;
CREATE POLICY "Team members can add gallery items" ON public.gallery_items
  FOR INSERT WITH CHECK (
    team_id = public.get_user_team_id()
    AND uploaded_by IN (SELECT id FROM public.profiles WHERE user_id = auth.uid())
    AND (event_id IS NULL OR event_id IN (
          SELECT e.id FROM public.events e WHERE e.team_id = public.get_user_team_id()))
  );
```

---

### H-4 · `storage.objects` "Admins can upload team logos" is not folder-scoped
**Where:** live-only `storage.objects."Admins can upload team logos"` (`FOR INSERT`,
`roles={authenticated}`), `WITH CHECK (bucket_id='team-logos' AND EXISTS(…is_admin = true AND team_id IS NOT NULL))`.
The bucket `team-logos` is **`public = true`** and `storage.objects."Anyone can view team logos"`
is `roles={public}`, so anything uploaded is world-readable.

**Why it matters:** the check is "am I an admin of *some* team", not "am I an admin of the team
that owns this folder". The app's own upload path is folder-scoped
(`app/dashboard/settings/page.tsx:64` → `` `${teamId}/${logoFile.name}` ``), but the policy is not.
Team A's admin can therefore publish arbitrary files inside team B's logo folder in a public
bucket — a defacement / phishing vector (e.g. a look-alike logo served from the victim's folder).

**Verified:** team-A admin inserted a `storage.objects` row into team B's `team-logos` folder →
**rows=1**. (`(bucket_id,name)` is unique, so an existing file cannot be overwritten — only new
paths can be created.)

**Fix (mirror the gallery policies, which *are* folder-scoped — `017:54-76`):**
```sql
DROP POLICY IF EXISTS "Admins can upload team logos" ON storage.objects;
CREATE POLICY "Admins can upload team logos" ON storage.objects
  FOR INSERT WITH CHECK (
    bucket_id = 'team-logos'
    AND (storage.foldername(name))[1] IN (
      SELECT p.team_id::text FROM public.profiles p
       WHERE p.user_id = auth.uid() AND p.is_admin IS TRUE AND p.team_id IS NOT NULL
    )
  );

DROP POLICY IF EXISTS "Admins can delete team logos" ON storage.objects;
CREATE POLICY "Admins can delete team logos" ON storage.objects
  FOR DELETE USING (
    bucket_id = 'team-logos'
    AND (storage.foldername(name))[1] IN (
      SELECT p.team_id::text FROM public.profiles p
       WHERE p.user_id = auth.uid() AND p.is_admin IS TRUE
    )
  );
```

---

### H-5 · `teams.owner_id` is `NOT NULL` but its FK is `ON DELETE SET NULL` → owners can never delete their account
**Where:** `011_fix_coach_cascade.sql:4-5` and `012_rename_coach_id_to_owner_id.sql:4-5`
```sql
ALTER TABLE teams ADD CONSTRAINT teams_owner_id_fkey
  FOREIGN KEY (owner_id) REFERENCES auth.users(id) ON DELETE SET NULL;
```
Live: `teams.owner_id` is `is_nullable = NO`, `teams_owner_id_fkey … ON DELETE SET NULL`.

**Why it matters:** deleting the owner’s `auth.users` row tries to NULL `owner_id` and violates
the NOT NULL constraint. The team is stuck: its owner can never leave the platform, and the
account can only be deleted by someone with direct DB access.
**Verified:** `DELETE FROM auth.users WHERE id = <owner>` →
`null value in column "owner_id" of relation "teams" violates not-null constraint`.

Only the one app route guards it (`app/api/account/delete/route.ts:31-44`); the Supabase admin
API, the dashboard, or any other path fails hard.

**Fix** — pick one ownership model and make the DB enforce it:
```sql
-- (a) if the team must have an owner: delete the team with the owner
ALTER TABLE public.teams DROP CONSTRAINT teams_owner_id_fkey;
ALTER TABLE public.teams ADD CONSTRAINT teams_owner_id_fkey
  FOREIGN KEY (owner_id) REFERENCES auth.users(id) ON DELETE CASCADE;

-- (b) if the team must survive: keep the row, but make owner nullable
ALTER TABLE public.teams ALTER COLUMN owner_id DROP NOT NULL;
-- and give every policy a NULL-safe owner test, e.g.
--   owner_id IS NOT DISTINCT FROM auth.uid()
```
Option (b) additionally needs `can_leave_team` / `transfer_ownership` / `disband_team`
(`016`, `013`/`024:240-270`) to handle a NULL owner.

---

### H-6 · `handle_new_user` copies an attacker-controlled `role` from `raw_user_meta_data`
**Where:** `001_initial.sql:115-126`, re-created with a pinned `search_path` at `020:17-28`:
```sql
INSERT INTO public.profiles (user_id, name, role)
VALUES (NEW.id,
        COALESCE(NEW.raw_user_meta_data->>'name', 'Unknown'),
        COALESCE(NEW.raw_user_meta_data->>'role', 'player'));   -- :122
```
**Why it matters:** `raw_user_meta_data` is the user-writable blob in the auth API. A user who
signs up with `{"role":"coach"}` becomes a coach in the database. Coaches are excluded from cost
splits (`021:84` `AND p.role <> 'coach'`, and `018:149`) and are filtered out of the split picker
(`app/dashboard/reservations/page.tsx:503` `m.role !== "coach"`), so a self-declared coach is
never charged.

**Verified:** signup with `{"role":"coach"}` → `profiles.role = 'coach'`, `is_admin = false`.
Bonus defect: signup with `{"role":"manager"}` **fails outright** —
`23514 new row for relation "profiles" violates check constraint "profiles_role_check"` —
so a stray client value bricks account creation.

**Fix:**
```sql
CREATE OR REPLACE FUNCTION public.handle_new_user()
RETURNS TRIGGER AS $fn$
DECLARE v_role text;
BEGIN
  -- role is NEVER taken from client-supplied metadata
  v_role := CASE WHEN NEW.raw_user_meta_data->>'role' = 'coach'
                 THEN 'coach' ELSE 'player' END;
  INSERT INTO public.profiles (user_id, name, role)
  VALUES (NEW.id,
          left(COALESCE(NULLIF(NEW.raw_user_meta_data->>'name',''), 'Unknown'), 120),
          v_role);
  RETURN NEW;
END;
$fn$ LANGUAGE plpgsql SECURITY DEFINER SET search_path = '';
```
If self-declared coach is not wanted at all, hard-code `'player'`; `handle_team_created`
(`008:5-15`, `012:17-26`, `024:206-218`) already promotes the owner to coach on team creation.

---

### H-7 · Any team **admin** (not just the owner) can rewrite `teams.owner_id` → `transfer_ownership` is bypassable
**Where:** `002_roster_updates.sql:10-13` and `012_rename_coach_id_to_owner_id.sql:9-10`
```sql
CREATE POLICY "Admins can update their team" ON teams
  FOR UPDATE USING (id IN (SELECT team_id FROM profiles WHERE user_id = auth.uid() AND is_admin = true));
CREATE POLICY "Owners can update their team" ON teams
  FOR UPDATE USING (owner_id = auth.uid());
```
Live: both policies are `FOR UPDATE`, `polwithcheck IS NULL` → the USING expression is the
with-check too, and `owner_id` is not among the restricted columns.

**Why it matters:** `transfer_ownership` (`016:6-46`) deliberately enforces "target must be on
your team" (`016:28-33`) and refuses to transfer to yourself (`016:36-38`). The policies let a
caller skip all of that and write `owner_id` directly to any `auth.users` id. After that:
* the team is owned by a non-member who has no profile on the team,
* `can_leave_team` (`016:66-73`) will treat that non-member as the owner and block them from
  leaving,
* the real owner is still `is_admin = true`,
* the "who owns this team" invariant the app relies on (`app/api/account/delete/route.ts:38`)
  is wrong.

**Verified:** a **non-owner** admin of team A set `owner_id` to a user who was not on the team →
**rows=1**; the row then read `owner_id = 33333333-…-331`.

**Fix:** stop letting the generic UPDATE policy touch ownership. Column-scoped privileges are not
available per-column in Postgres, so use a trigger:
```sql
CREATE OR REPLACE FUNCTION public.protect_team_owner_id()
RETURNS trigger LANGUAGE plpgsql AS $fn$
BEGIN
  IF NEW.owner_id IS DISTINCT FROM OLD.owner_id
     AND current_user NOT IN ('postgres','service_role') THEN
    RAISE EXCEPTION 'Use transfer_ownership() to change the team owner';
  END IF;
  RETURN NEW;
END;
$fn$;

CREATE TRIGGER protect_team_owner_id
  BEFORE UPDATE ON public.teams
  FOR EACH ROW EXECUTE FUNCTION public.protect_team_owner_id();
```
(the trigger fires inside `transfer_ownership` too, whose SECURITY DEFINER context makes
`current_user = postgres`, so the legitimate path still works — this mirrors the pattern already
used at `024:88-103`.)

---

### H-8 · PUBLIC EXECUTE on `finalize_reservation_split` and `reservation_has_payments` → unauthenticated oracle
**Where:** `018:174`, `021:108`, `023:56` grant EXECUTE but never revoke PUBLIC:
```sql
GRANT EXECUTE ON FUNCTION public.finalize_reservation_split(UUID, UUID[]) TO authenticated;  -- 021:108
GRANT EXECUTE ON FUNCTION public.reservation_has_payments(uuid) TO authenticated;            -- 023:56
```
Live `proacl` for both: `=X/postgres | postgres=X/postgres | authenticated=X/postgres` — the
leading `=X` is **EXECUTE granted to PUBLIC**. `024:311-325` revoked the other RPCs
(`disband_team`, `can_leave_team`, `admin_remove_player`, `transfer_ownership`,
`get_user_team_id`) but **missed these two**.

**Why it matters:** `reservation_has_payments(uuid)` is a `SECURITY DEFINER` boolean that answers
"does this reservation id have payment rows" for *any* id, with no auth check at all.

**Verified:** as `anon`, `reservation_has_payments(<real id>)` → **true**, and
`reservation_has_payments(<random uuid>)` → **false**. That is an unauthenticated existence /
state oracle over the whole reservations table (ids are `gen_random_uuid()` so brute force is not
practical, but a single leaked id is fully confirmed). `anon` also reached the **body** of
`finalize_reservation_split` (it returned `"Not authorized: only the person who reserved the
pitch (or an admin) can split"` — i.e. it ran the function, it was not blocked by permissions).

**Fix:**
```sql
REVOKE ALL ON FUNCTION public.finalize_reservation_split(uuid, uuid[]) FROM PUBLIC;
REVOKE ALL ON FUNCTION public.reservation_has_payments(uuid) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.finalize_reservation_split(uuid, uuid[]) TO authenticated;
GRANT EXECUTE ON FUNCTION public.reservation_has_payments(uuid) TO authenticated;
```
`reservation_has_payments` is only referenced from the two RLS policies (`023:61,73`); because it
is `SECURITY DEFINER` it does not need the caller's EXECUTE privilege inside the policy, so
revoking PUBLIC is safe.

---

### H-9 · Live-only `profiles."Update profiles"` lets a team admin swap a member's `user_id` (account takeover)
**Where:** live-only policy, absent from every migration file:
```
qual:       (user_id = auth.uid()) OR ((SELECT is_admin … WHERE user_id = auth.uid()) = true
                                         AND team_id = (SELECT team_id … WHERE user_id = auth.uid()))
with_check: (user_id = auth.uid()) OR ((SELECT is_admin … WHERE user_id = auth.uid()) = true)
```
**Why it matters:** the with-check requires only "the caller is *some* admin" — the target row
is not re-scoped to the caller's team — and `user_id` is not a protected column.
`protect_profile_privileged_columns` (`024:93-160`) guards `team_id`, `is_admin` and `role`
(`024:115-117`) but **not** `user_id`.

So a team admin can point a member's `profiles.user_id` at a different auth account. The admin
then logs in as that account and inherits the victim's profile (team_id, is_admin, role) — an
account-takeover primitive inside the team.

**Verified:** admin re-pointed a member's `profiles.user_id` to an auth account that had no
profile row → **rows=1**; the row then read `user_id = 44444444-…`.
*A plain player cannot do this* — `UPDATE … SET user_id = <other>` on their own row →
`new row violates row-level security policy for table "profiles"` (verified).

**Fix:**
```sql
-- add user_id to the guarded column set in protect_profile_privileged_columns (024:115-117)
IF NEW.user_id IS NOT DISTINCT FROM OLD.user_id
   AND NEW.team_id  IS NOT DISTINCT FROM OLD.team_id
   AND NEW.is_admin IS NOT DISTINCT FROM OLD.is_admin
   AND NEW.role     IS NOT DISTINCT FROM OLD.role THEN
  RETURN NEW;
END IF;
```
and replace the live-only policy with the migration-set policy (`002:32-35`), which is already
scoped by team:
```sql
DROP POLICY IF EXISTS "Update profiles" ON public.profiles;
CREATE POLICY "Admins can update team profiles" ON public.profiles
  FOR UPDATE
  USING (team_id IN (SELECT p.team_id FROM public.profiles p
                      WHERE p.user_id = auth.uid() AND p.is_admin IS TRUE)
         OR user_id = auth.uid())
  WITH CHECK (team_id IS NULL
              OR team_id IN (SELECT p.team_id FROM public.profiles p
                             WHERE p.user_id = auth.uid() AND p.is_admin IS TRUE)
              OR user_id = auth.uid());
```

---

## MEDIUM

### M-1 · `paid_at` is forgeable
**Where:** `019:12-26`, re-created at `025:117-132`:
```sql
IF NEW.paid AND NOT OLD.paid THEN
  NEW.paid_at := COALESCE(NEW.paid_at, now());   -- 025:126
```
**Why it matters:** `COALESCE` keeps whatever the client sent. A player can back-date (or
forward-date) the payment timestamp — which is exactly the audit field a disputes workflow would
trust. The comment at `019:11` claims "paid_at is stamped by the database, not the client"; that
is not what the code does.

**Verified:** `UPDATE reservation_payments SET paid = true, paid_at = '2000-01-01'` persisted
`paid_at = 2000-01-01`.

**Fix:**
```sql
IF NEW.paid AND NOT OLD.paid THEN
  NEW.paid_at := now();          -- never trust the client value
ELSIF NOT NEW.paid THEN
  NEW.paid_at := NULL;
END IF;
```

---

### M-2 · TOCTOU between the split and the reservation UPDATE/DELETE policies (no `FOR UPDATE`)
**Where:** `021:38-42` (`finalize_reservation_split` reads the reservation without a lock) and
`023:58-80` (the UPDATE/DELETE policies test `NOT public.reservation_has_payments(id)` — also
without a lock).

**Why it matters:** two concurrent transactions can both observe "no payment rows yet". One
commits the split (inserting `reservation_payments`, which `ON DELETE CASCADE` from
`reservations`); the other commits an UPDATE or DELETE of the reservation. Depending on ordering
this produces a reservation whose amount no longer matches its shares, a silently deleted
reservation with payments attached, or a FK violation surfaced to the user.

**Fix:** take a row lock in the function and make the policies lock too.
```sql
-- in finalize_reservation_split (021:38-42)
SELECT r.event_id, r.amount, r.created_by, e.date, e.type, e.team_id
  INTO v_event_id, v_amount, v_created_by, v_event_date, v_event_type, v_team_id
  FROM public.reservations r
  JOIN public.events e ON e.id = r.event_id
 WHERE r.id = p_reservation_id
 FOR UPDATE OF r;          -- <-- serialises against the policies below
```
and in `023:59-68 / 023:71-80` replace `NOT public.reservation_has_payments(id)` with a locking
subquery:
```sql
FOR UPDATE USING (
  NOT EXISTS (
    SELECT 1 FROM public.reservations r
     WHERE r.id = reservations.id
       AND NOT public.reservation_has_payments(r.id)
     FOR UPDATE
  )
  AND EXISTS ( … )
);
```

---

### M-3 · `transfer_ownership` never demotes the outgoing owner
**Where:** `016:41` (`UPDATE teams SET owner_id = target_user`) and `016:44`
(`UPDATE profiles SET is_admin = true WHERE id = target_profile_id`).

**Why it matters:** the old owner keeps `is_admin = true` on the team. `016:75-88`
(`can_leave_team`) counts admins to decide whether the last admin may leave, and the
`is_admin`-based policies (`002:10-35`) still let the former owner manage events, lineups,
set-pieces and the roster. Ownership transfer is therefore not a transfer of control.

**Verified:** after a transfer, the old owner could still `UPDATE public.events` (**rows=1**).

**Fix:**
```sql
-- inside transfer_ownership, after the two existing statements
UPDATE public.profiles
   SET is_admin = false
 WHERE id = (SELECT p.id FROM public.profiles p
              WHERE p.user_id = auth.uid() AND p.team_id = my_team_id);
```
(keep the old owner as a plain member unless the product says otherwise), and `SELECT … FROM
public.teams WHERE id = my_team_id FOR UPDATE` before mutating.

---

### M-4 · Leaving or disbanding orphans rows
**Where:** `015:6-25` (`cleanup_availability_on_team_change`) cleans **only** `availability`.

**Why it matters:**
* `lineups.player_id` / `set_pieces.player_id` (`001:48`, `007`) still point at a profile of a
  player who left the team → the roster shows a non-member in the lineup / set-piece list.
  **Verified:** after a leave, 1 `lineups` row and 1 `set_pieces` row remained pointing at the
  departed profile.
* `events.captain_id` (`010`, FK `ON DELETE SET NULL`) is only cleared when the *profile* is
  deleted, not when the player leaves the team → an event keeps a captain who is no longer on
  the roster.
* `storage.objects` rows for the team's gallery/logos are never removed. `disband_team`
  (`013:33`, `024:268`) does `DELETE FROM teams` → cascades to `events`, `lineups`,
  `availability`, `gallery_items`, `reservations` — but the **files** stay in the bucket
  (orphaned, still publicly readable for `team-logos`).

**Fix:**
```sql
CREATE OR REPLACE FUNCTION public.cleanup_on_team_change()
RETURNS trigger LANGUAGE plpgsql SECURITY DEFINER SET search_path = '' AS $fn$
BEGIN
  IF OLD.team_id IS NOT NULL AND OLD.team_id IS DISTINCT FROM NEW.team_id THEN
    DELETE FROM public.availability
     WHERE user_id = OLD.user_id
       AND event_id IN (SELECT id FROM public.events WHERE team_id = OLD.team_id);
    DELETE FROM public.lineups
     WHERE player_id IN (SELECT id FROM public.profiles WHERE user_id = OLD.user_id);
    DELETE FROM public.set_pieces
     WHERE player_id IN (SELECT id FROM public.profiles WHERE user_id = OLD.user_id);
    UPDATE public.events SET captain_id = NULL
     WHERE captain_id IN (SELECT id FROM public.profiles WHERE user_id = OLD.user_id);
  END IF;
  RETURN NEW;
END;
$fn$;
```
and delete the bucket objects for the team inside `disband_team` before the `DELETE FROM teams`
(e.g. `DELETE FROM storage.objects WHERE bucket_id IN ('gallery','team-logos') AND (storage.foldername(name))[1] = my_team_id::text`).

---

### M-5 · Two trigger functions have no pinned `search_path` (CVE-2018-1058 class)
**Where:** live `proconfig` is `NULL` for
`public.prevent_reserved_training_type_change()` and `public.protect_profile_privileged_columns()`.
Every other function in the schema is pinned (verified across all 21 public functions).

**Why it matters:** a function without `SET search_path` resolves unqualified names through the
session `search_path`. `protect_profile_privileged_columns` is *not* SECURITY DEFINER, so it runs
with the caller's rights — but it does reference `public.profiles` and `public.teams`
unqualifiedly at `024:139` (`SELECT 1 FROM public.teams t` — that one is qualified) — while
`prevent_reserved_training_type_change` (022:56-69) references `public.reservations` qualified
but has **no** `search_path` pin at all. Any future unqualified reference in either body is a
live vulnerability, and the inconsistency is a trap for the next editor.

**Fix:**
```sql
ALTER FUNCTION public.prevent_reserved_training_type_change() SET search_path = '';
ALTER FUNCTION public.protect_profile_privileged_columns() SET search_path = '';
```

---

### M-6 · Live-only triggers write `is_admin` into attacker-writable `raw_user_meta_data`
**Where:** live triggers `on_profile_admin_insert` / `on_profile_admin_change` →
`public.sync_admin_on_insert` / `public.sync_admin_to_metadata` (`025:154-180`, **no triggers
created in any migration**):
```sql
UPDATE auth.users
   SET raw_user_meta_data = raw_user_meta_data || jsonb_build_object('is_admin', NEW.is_admin::text)
 WHERE id = NEW.user_id;
```
**Why it matters:** `raw_user_meta_data` is the user-writable blob (the auth API lets a user set
it via `updateUser({data:{…}})`), and `024:273-277` explicitly documents that the old
`auth.jwt()->>'is_admin'` policy was defeatable this way. Nothing reads the claim any more, so
today this is latent — but the schema still *writes* a privilege bit into attacker-controlled
storage, and any future policy or app code that trusts `auth.jwt()->>'is_admin'` is instantly
forgable. The trigger also churns `auth.users` on every profile insert/update.

**Fix:** delete the triggers and the functions — they have no consumer:
```sql
DROP TRIGGER IF EXISTS on_profile_admin_insert ON public.profiles;
DROP TRIGGER IF EXISTS on_profile_admin_change  ON public.profiles;
DROP FUNCTION IF EXISTS public.sync_admin_on_insert();
DROP FUNCTION IF EXISTS public.sync_admin_to_metadata();
```
(If the JWT claim is wanted for performance, store it in `app_metadata`, which is server-only.)

---

### M-7 · Migration `012` is not re-runnable
**Where:** `012_rename_coach_id_to_owner_id.sql:8`
```sql
DROP POLICY "Coaches can update their team" ON teams;   -- no IF EXISTS
```
**Why it matters:** `002_roster_updates.sql:5` already dropped that policy, so `012` errors with
`ERROR: policy "Coaches can update their team" for table "teams" does not exist` and the file
aborts. Any scripted rebuild (`supabase db push`, CI, a fresh project) stops here.

**Fix:**
```sql
DROP POLICY IF EXISTS "Coaches can update their team" ON teams;
```

---

### M-8 · Migration `022`'s root-cause analysis is wrong, and it removed hardening
**Where:** `022_fix_training_type_trigger.sql:10-39`.

**Why it matters:** the file claims the trigger's `SET search_path = ''` "is inherited by the whole
UPDATE statement when PostgREST prepares and executes it" and that RI checks then fail to resolve
`profiles`. That is not how PostgreSQL works — `SET search_path` on a function is scoped to that
function's execution, not to the calling statement. The real cause of the reported
`42P01 relation "profiles" does not exist` was an unqualified `profiles` reference in some
trigger body at that time, resolved against the empty path. The practical consequence is that
`022` **removed** a `search_path` pin as the "fix" and then explicitly declined to pin the other
five trigger functions it listed (`022:32-39`), leaving
`prevent_reserved_training_type_change` as the only unpinned trigger function in the schema
(see M-5).

**Fix:** pin the search_path on every trigger function (M-5 + `025:80-148` already covers the
other four), and keep the body references fully qualified. Correct the comment so the next
reader is not misled:
```sql
-- 022 (corrected): pin the search_path. An empty path does NOT "leak into"
-- the statement; it only affects name resolution *inside this function*.
CREATE OR REPLACE FUNCTION public.prevent_reserved_training_type_change()
RETURNS TRIGGER LANGUAGE plpgsql SET search_path = '' AS $fn$
BEGIN
  IF NEW.type <> 'training'
     AND EXISTS (SELECT 1 FROM public.reservations WHERE event_id = NEW.id) THEN
    RAISE EXCEPTION 'Cancel the pitch reservation before changing this training to a match';
  END IF;
  RETURN NEW;
END;
$fn$;
```

---

### M-9 · Unnecessary table privileges inherited by `anon`
**Where:** `005_grant_table_permissions.sql:4-8` (grant-only). Live `anon=Dxtm` on all 9 tables:
`D`=TRUNCATE (H-1), `x`=REFERENCES, `t`=TRIGGER (C-2), `m`=MAINTAIN. `anon` also holds
`REFERENCES`/`TRIGGER`/`MAINTAIN` on `storage.objects` (`arwd`).

**Why it matters:** none of these are used by the app. `TRIGGER` is the dangerous one (C-2);
`REFERENCES` lets `anon` create FKs to these tables; `MAINTAIN` allows vacuum/cluster maintenance
operations. All of it is removed by the C-2 revoke block.

---

## LOW

### L-1 · Missing index on `events.date`
`025:61-72` indexes every FK column, but the Events page sorts/filters on `date`. Live indexes:
`events_pkey`, `events_team_id_idx`, `events_captain_id_idx` — **no index on `date`**.
```sql
CREATE INDEX IF NOT EXISTS events_team_id_date_idx ON public.events (team_id, date);
```

### L-2 · `profiles.is_admin` is nullable
Added at `009:12` as `BOOLEAN DEFAULT false` with no `NOT NULL`; live `is_nullable = YES`.
Every predicate correctly uses `is_admin IS TRUE`, so there is no live bug — but `NULL` is not
`false` in any future `= false` check.
```sql
UPDATE public.profiles SET is_admin = false WHERE is_admin IS NULL;
ALTER TABLE public.profiles ALTER COLUMN is_admin SET DEFAULT false;
ALTER TABLE public.profiles ALTER COLUMN is_admin SET NOT NULL;
```

### L-3 · `reservation_payments.amount` has no CHECK
`reservations.amount` has `CONSTRAINT reservations_amount_positive CHECK (amount > 0)` (`018:20`);
`reservation_payments.amount` (`018:29`) has none. A zero or negative share is representable
(`021:95` can even round a tiny amount to `0.00`).
```sql
ALTER TABLE public.reservation_payments
  ADD CONSTRAINT reservation_payments_amount_nonneg CHECK (amount >= 0);
```

### L-4 · Split rounding: 0.00 shares and a client/DB display mismatch
`021:95-101` computes `v_share := round(v_amount / v_count, 2)` and gives the remainder to the
last row of `unnest(...) WITH ORDINALITY`. Two consequences:
* a small total split many ways produces `0.00` shares (a participant can be listed as owing
  nothing);
* the client preview divides evenly (`app/dashboard/reservations/page.tsx:485-487` and
  `505-510`: `Math.round((amount / rows.length) * 100) / 100`), so the amount the user is shown
  can differ from the stored amount by a cent — and the *last* participant's row differs from
  the preview.

The DB total is correct (verified: 30.50 → 15.25 + 15.25, total 30.50).

**Resolved in 034.** Every participant now gets the same share, rounded to the nearest cent
with standard rounding (`round((v_amount * 100) / v_count) / 100`). The client preview uses
the same rule (`equalShare` in `lib/utils.ts`). The migration rewrites any differing unpaid
rows for existing splits to the equal amount.

### L-5 · Unbounded user-supplied text
`handle_new_user` copies `raw_user_meta_data->>'name'` with no length limit (`001:121`);
`profiles.name`, `profiles.position`, `events.title`, `events.location`, `gallery_items.caption`
have no length limit either.
```sql
ALTER TABLE public.profiles ADD CONSTRAINT profiles_name_len CHECK (char_length(name) <= 120);
ALTER TABLE public.events  ADD CONSTRAINT events_title_len CHECK (char_length(title) <= 200);
```

### L-6 · Invite codes are generated with a non-cryptographic PRNG
`001:104-112`, `020:182-190`, `025:134-148`: `upper(substring(md5(random()::text) from 1 for 8))`.
`random()` is not a CSPRNG and the result is the tenant's join credential.
```sql
NEW.invite_code := upper(encode(public.gen_random_bytes(4), 'hex'));  -- 32 bits, CSPRNG
```
(`gen_random_bytes` needs the `pgcrypto` extension; otherwise use
`replace(gen_random_uuid()::text,'-','')`, truncated.)

### L-7 · The `storage.objects` DELETE policies are decorative
`017:70-76` and the live-only "Admins can delete team logos" cannot be exercised through SQL:
`storage.protect_delete()` rejects it — *"Direct deletion from storage tables is not allowed.
Use the Storage API instead."* — and the Storage API's delete path runs with `service_role`,
bypassing RLS. **Flagged as unverified:** I could not exercise the Supabase Storage API from this
environment, so I cannot confirm whether the Storage API's *authenticated* delete endpoints honour
these policies. Treat current effective behaviour as "deletion is governed by the bucket and the
service role", not by these policies — and do not rely on them as a security control.

### L-8 · Inconsistent key domains for "user"
`availability.user_id` references `auth.users(id)` (`001:37`), while `reservations.created_by`
(`018:17`), `reservation_payments.user_id` (`018:28`), `lineups.player_id` (`001:48`),
`set_pieces.player_id`, `gallery_items.uploaded_by` and `events.captain_id` all reference
`profiles(id)`. Two different columns both called `user_id` mean different things across
tables — a recurring source of join bugs and of policies that silently compare the wrong
namespace.

---

## Explicitly not findings (checked and ruled out)

| Checked | Result |
|---|---|
| `anon`/`authenticated` are superuser or `BYPASSRLS` | No. `service_role` and `postgres` are. |
| Any function that builds dynamic SQL | None (`prosrc ILIKE '%EXECUTE%' AND '%format(%'` → 0 rows). |
| `pg_cron` / `pg_net` installed | No. |
| `public.rls_auto_enable` event trigger | Present — it auto-enables RLS on new tables in `public`, but does **not** create policies. |
| `CREATE FUNCTION` by `anon`/`authenticated` | Denied — no CREATE on schema `public` (`42501`). |
| `availability` — spoofing another user's RSVP | Blocked (`user_id = auth.uid()` with-check). |
| `availability` — INSERT/DELETE on other users' rows | Blocked. |
| `reservation_payments.amount` / `reservation_id` edits | Blocked by `protect_reservation_payment_amount` (`025:100-115`) — *"Only the paid status of a share can be changed"*. |
| Marking **another** player's share paid | Blocked (RLS, 0 rows). |
| INSERT / DELETE on `reservation_payments` | Blocked — live ACL `authenticated=rwDxtm` (no INSERT/DELETE). |
| Editing / deleting a reservation that already has payments | Blocked (`023:58-80`). |
| Split including a coach, or a non-team participant | Rejected — *"Participants must be players of your team"* (`021:89-91`). |
| Re-running the split | No-op (`021:63-67`) — amounts stay frozen. |
| Non-creator / non-admin calling the split | Rejected. |
| `gallery_items` UPDATE by `authenticated` | Denied — live ACL `authenticated=ardDxtm` (no UPDATE). |
| Cross-team profile / event UPDATE, lineup / set-piece / reservation INSERT, storage UPDATE | All blocked by RLS (0 rows). |
| `dismiss`/`can_leave_team`/`disband_team`/`join_team_with_code`/`transfer_ownership`/`admin_remove_player` callable by `anon` | No — correctly revoked (024:315-325). |
| `profiles.role` CHECK | Correctly limits to `'coach'`/`'player'`. |
| `profiles.user_id` UNIQUE, `reservations.event_id` UNIQUE, `reservation_payments(reservation_id,user_id)` UNIQUE | All present. |
| Money types | `reservations.amount NUMERIC(10,2) CHECK (amount>0)`; `reservation_payments.amount NUMERIC(10,2)`. Rounding is correct. |
| All 12 FK indexes from `025:61-72` | Present in the live DB. |
| `search_path` pinning | Pinned on 19 of 21 public functions; missing on the two named in M-5. |
| PostgREST issuing `TRUNCATE` | Not possible — affects the reachability rating of H-1 only. |

---

## Suggested fix order

1. **C-2** (revoke table privileges) — kills the app-wide DoS and most of H-1/M-9 in one statement.
2. **C-1** (drop the enumeration policy) and **C-3** (reconciliation migration) — restore the
   migration set as the source of truth.
3. **H-2, H-3, H-4** (team-scope availability / gallery / storage).
4. **H-5, H-7** (ownership model + trigger), **H-8** (revoke PUBLIC), **H-9** (guard `user_id`).
5. **H-6** (stop trusting `raw_user_meta_data.role`).
6. **M-1…M-8**, then **L-1…L-8**.

Re-run the audit after each step; the probes above are re-runnable as-is against a scratch project.

---

## Resolution status (2026-10-23)

Every finding below was re-checked against the live project after the fix. The verification probes were
run inside `BEGIN … ROLLBACK`, so no live row was modified.

| Finding | Status | Fix |
|---|---|---|
| C-1 | Fixed | **028** drops the team-enumeration policy. The app only joins through `join_team_with_code()`, so no lookup function was needed. |
| C-2 | Fixed | **027** revokes every inherited table privilege and grants back only the commands the app uses. |
| C-3 | Fixed | **028** adds the live-only columns, bucket and constraints; **029** rebuilds the two recursive policies on `get_user_team_id()`. |
| H-1 | Fixed | **027** (same revoke block). |
| H-2 | Fixed | **030** scopes every `availability` policy to the caller's team. |
| H-3 | Fixed | **030** checks `gallery_items.team_id` and the event's team on INSERT. |
| H-4 | Fixed | **032** scopes both logo policies to `foldername(name)[1] = <the admin's team>`. |
| H-5 | Fixed | **031** changes `teams.owner_id` to `ON DELETE RESTRICT`, which is what the delete-account route already required. |
| H-6 | Fixed | **031** always starts a new profile as `player`. |
| H-7 | Fixed | **032** guards `teams.owner_id` with `protect_team_owner_id()`. |
| H-8 | Fixed | **027** revokes PUBLIC EXECUTE on the split helpers. |
| H-9 | Fixed | **028** drops the live-only `profiles."Update profiles"` policy. |
| M-1 | Fixed | **036** stamps `paid_at` on the false→true transition and freezes it afterwards. The audit's proposed `ELSE` only covered the transition; a later update could still rewrite an already-paid timestamp, so that case is covered too. |
| M-2 | Mitigated | **036** takes `FOR UPDATE` on the reservation before the split reads it, which serialises a split against a concurrent edit or delete. The UPDATE/DELETE policies still rely on the row lock rather than their own locking check; a two-session race test is still outstanding. |
| M-3 | Fixed | **035** demotes the outgoing owner and locks the team row during the transfer. |
| M-4 | Fixed | **036** renames the cleanup trigger to `cleanup_on_team_change()` and removes lineups, set pieces and captaincies as well as availability. Storage objects on disband are still not deleted (see L-7). |
| M-5 | Fixed | **035** pins the profile guard; **036** pins `prevent_reserved_training_type_change()` and `protect_team_owner_id()`. No public function is unpinned now. |
| M-6 | Fixed | **036** drops `on_profile_admin_insert`, `on_profile_admin_change` and both `sync_admin_*` functions. |
| M-7 | Fixed | `012` now uses `DROP POLICY IF EXISTS` (with 027-031). |
| M-8 | Fixed | **036** restores the `search_path` pin; the misleading comment in **022** is corrected. |
| M-9 | Fixed | **027** (same revoke block). |
| L-1 | Fixed | **036** adds `events_team_id_date_idx`. |
| L-2 | Fixed | **036** back-fills, defaults and marks `profiles.is_admin NOT NULL`. |
| L-3 | Fixed | **036** adds `reservation_payments_amount_nonneg`. |
| L-4 | Fixed | **034** (equal shares, client preview matches). |
| L-5 | Fixed | **036** bounds name, position, title, location and caption. |
| L-6 | Fixed | **036** generates new codes from `gen_random_uuid()` (CSPRNG, built in on PG 13+). Existing codes are unchanged; rotate them by clearing `teams.invite_code` if that matters. |
| L-7 | Open, documented | Direct deletes from `storage.objects` are still rejected by `storage.protect_delete()`. Deleting the files on disband needs the Storage API (server route with the service role), not SQL. |
| L-8 | Open, documented | Renaming the columns is a data-model migration with app-wide touch points; not worth the churn without another reason. |

### N-1 (found while applying the audit, fixed in 035) · `can_leave_team()` was only a UI check

`can_leave_team()` correctly refuses to let the owner or the last admin leave, but nothing
enforced it. Four paths cleared or moved `profiles.team_id` without asking:

* a direct `UPDATE profiles SET team_id = NULL` through PostgREST — the roster page's own
  mechanism, available to any signed-in user;
* `join_team_with_code()` — the owner could join another team and leave the first one ownerless;
* creating a second team — the "I own this team" branch of the guard allowed the move;
* `admin_remove_player()` — any admin could remove the owner.

Verified before the fix: the owner cleared her own `team_id` (`can_leave_team()` returned
`false`), and `join_team_with_code()` moved her into a probe team. **035** enforces the rule in the
profile guard and in both RPCs, blocks removing the owner, and demotes the outgoing owner on a
transfer. The probes confirm that a plain player can still leave, a teamless user can still join
and create a team, and admins can still edit the roster.
