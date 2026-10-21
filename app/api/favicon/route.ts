import { NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";
import { readFile } from "fs/promises";
import path from "path";

export const dynamic = "force-dynamic";

const LOGO_FETCH_TIMEOUT_MS = 5000;
const LOGO_MAX_BYTES = 2 * 1024 * 1024;

/**
 * The logo is fetched by the server, so the address has to be one the
 * server is allowed to request.
 *
 * `logo_url` is a plain column, and a team admin can write it
 * directly through the API -- the settings page happens to store the
 * address of the uploaded file, but nothing stops an admin from
 * storing something else. Without this check the server would fetch
 * whatever address was stored, on every page load, and hand the
 * answer back: a request forgery towards anything the server can
 * reach.
 *
 * Only an address on our own Supabase project, inside the folder of
 * the team's own logo bucket, is fetched.
 */
function isOwnTeamLogoUrl(logoUrl: string, teamId: string, supabaseUrl: string): boolean {
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

export async function GET() {
  const supabase = await createClient();
  const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL ?? "";
  const {
    data: { user },
  } = await supabase.auth.getUser();

  if (user) {
    const { data: profile } = await supabase
      .from("profiles")
      .select("team_id")
      .eq("user_id", user.id)
      .single();

    if (profile?.team_id) {
      const { data: team } = await supabase
        .from("teams")
        .select("logo_url")
        .eq("id", profile.team_id)
        .single();

      if (team?.logo_url && isOwnTeamLogoUrl(team.logo_url, profile.team_id, supabaseUrl)) {
        try {
          const res = await fetch(team.logo_url, {
            signal: AbortSignal.timeout(LOGO_FETCH_TIMEOUT_MS),
            redirect: "error",
          });
          const contentType = res.headers.get("Content-Type") || "";
          const declaredLength = Number(res.headers.get("Content-Length") || "0");
          if (res.ok && contentType.startsWith("image/") && declaredLength <= LOGO_MAX_BYTES) {
            const blob = await res.arrayBuffer();
            if (blob.byteLength <= LOGO_MAX_BYTES) {
              return new NextResponse(blob, {
                headers: {
                  "Content-Type": contentType,
                  "Cache-Control": "no-cache",
                },
              });
            }
          }
        } catch {
          // fall through to default
        }
      }
    }
  }

  const filePath = path.join(process.cwd(), "public", "soccerballimage.png");
  const buffer = await readFile(filePath);
  return new NextResponse(buffer, {
    headers: {
      "Content-Type": "image/png",
      "Cache-Control": "private, max-age=3600",
    },
  });
}
