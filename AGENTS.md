<!-- BEGIN:nextjs-agent-rules -->
# This is NOT the Next.js you know

This version has breaking changes — APIs, conventions, and file structure may all differ from your training data. Read the relevant guide in `node_modules/next/dist/docs/` before writing any code. Heed deprecation notices.
<!-- END:nextjs-agent-rules -->

## Supabase Data API grants

From **30 October 2026**, Supabase no longer automatically grants Data API access for new tables created in the `public` schema. Existing tables keep their grants, but every migration that creates a table must grant the app's commands in the same migration. Grants are separate from RLS: grants decide which commands a role may run, RLS decides which rows it may touch.

Follow the least-privilege pattern from `supabase/migrations/027_revoke_excess_privileges.sql`:

```sql
-- Regular app table
grant select, insert, update, delete on public.your_table to authenticated;
grant select, insert, update, delete on public.your_table to service_role;
```

Grant only the commands the app actually uses (for example `gallery_items` is select/insert/delete, and `reservation_payments` is select/update). Do **not** grant table access to `anon`: public reads go through `SECURITY DEFINER` functions, and `027` intentionally removes all `anon` table privileges. A table created through the Supabase dashboard rather than a migration needs the same grants applied there.

