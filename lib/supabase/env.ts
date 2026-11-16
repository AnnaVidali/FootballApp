/**
 * The public Supabase credentials, read once and validated.
 *
 * Both the browser and the server client need the URL and the anon key.
 * Non-null assertions (`process.env.X!`) satisfied the type checker while
 * leaving the runtime to fail later with Supabase's own "supabaseUrl is
 * required", which does not say what is missing or where to put it.
 * Reading them here turns a missing `.env.local` into one clear error at
 * the point of use.
 */
export function supabaseEnv(): { url: string; anonKey: string } {
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const anonKey = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY;
  if (!url || !anonKey) {
    throw new Error(
      "Missing NEXT_PUBLIC_SUPABASE_URL or NEXT_PUBLIC_SUPABASE_ANON_KEY. " +
        "Add them to .env.local (see README)."
    );
  }
  return { url, anonKey };
}
