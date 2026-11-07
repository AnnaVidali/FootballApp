/**
 * The team logo is fetched by the server, so the address has to be one
 * the server is allowed to request.
 *
 * `logo_url` is a plain column, and a team admin can write it directly
 * through the API -- the settings page happens to store the address of
 * the uploaded file, but nothing stops an admin from storing something
 * else. Without this check the server would fetch whatever address was
 * stored, on every page load, and hand the answer back: a request
 * forgery towards anything the server can reach.
 *
 * Only an address on our own Supabase project, inside the folder of the
 * team's own logo bucket, is fetched.
 */
export function isOwnTeamLogoUrl(
  logoUrl: string,
  teamId: string,
  supabaseUrl: string,
): boolean {
  let url: URL;
  let base: URL;
  try {
    url = new URL(logoUrl);
    base = new URL(supabaseUrl);
  } catch {
    return false;
  }
  if (url.protocol !== "https:") return false;
  if (url.origin !== base.origin) return false;
  return url.pathname.includes(`/team-logos/${teamId}/`);
}
